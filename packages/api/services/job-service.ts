// Job management service - orchestrates storage and Claude services

import chalk from 'chalk';
import getConfig from '../config/index.js';
import { getStorage } from './storage-service.js';
import { getClaudeService } from './claude-service.js';
import { generateHighContrastHex } from '../utils/color.js';
import { 
  parseClaudeJsonOutput, 
  processStreamChunk, 
  formatOutputChunk,
  addJobPrefix 
} from '../utils/output-parser.js';
import type { Job, AppOptions } from '../types/index.js';

/**
 * Create a job service instance
 */
export const createJobService = (options: AppOptions = {}) => {
  const config = getConfig();
  const storage = options.storage || getStorage();
  const claudeService = options.claudeService || getClaudeService();
  
  const service = {
    /**
     * Create a new job
     */
    async createJob(prompt: string, jobOptions: any = {}, jobId: string | null = null): Promise<Job> {
      // Generate job ID if not provided
      const id = jobId || generateJobId();
      
      // Check for duplicate job ID
      if (jobId) {
        const existingJob = await storage.getJob(id);
        if (existingJob) {
          throw new Error('Job ID already exists');
        }
      }
      
      const color = generateHighContrastHex();
      
      // Create job entry
      const job = {
        id,
        prompt,
        options: jobOptions,
        status: 'pending',
        progress: '',
        completeMessage: '',
        startedAt: Date.now(),
        finishedAt: null,
        color,
        process: null,
        outputHistory: [],
      };
      
      // Store job
      await storage.createJob(job);
      
      // Create output stream
      await storage.createOutputStream(id);
      
      // Log job creation
      if (config.logging.colorize) {
        const colorize = chalk.hex(color).bold;
        console.log(
          colorize(
            `[${new Date().toISOString()}] [${id.slice(-8)}] Received prompt:`
          ),
          prompt
        );
        if (Object.keys(jobOptions).length > 0) {
          console.log(
            colorize(`[${new Date().toISOString()}] [${id.slice(-8)}] Options:`),
            jobOptions
          );
        }
      }
      
      // Start processing in background
      service.processJobInBackground(id).catch((error) => {
        console.error(`Background job processing failed for ${id}:`, error);
      });
      
      return { jobId: id, status: 'started' };
    },
    
    /**
     * Process job in background
     */
    async processJobInBackground(jobId) {
      const job = await storage.getJob(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }
      
      try {
        // Update job status
        await storage.updateJob(jobId, { status: 'running' });
        
        // Start Claude process
        const claudeHandle = await claudeService.startProcess(job.prompt, job.options);
        
        // Store process reference
        await storage.updateJob(jobId, { 
          process: claudeHandle,
          status: 'running' 
        });
        
        // Process output streams
        await service.processOutputStreams(jobId, claudeHandle, job.color);
        
        // Wait for process completion
        const exitCode = await claudeHandle.exited;
        
        // Check if job still exists before cleanup (might have been cleared by tests)
        const jobStillExists = await storage.getJob(jobId);
        if (!jobStillExists) {
          // Job was cleaned up externally, exit gracefully
          return;
        }
        
        // Clean up process reference
        await storage.updateJob(jobId, { process: null });
        
        // Update job status based on exit code
        if (exitCode === 0) {
          await service.completeJob(jobId, 'completed');
        } else {
          await service.completeJob(jobId, 'failed', `Process exited with code ${exitCode}`);
        }
        
      } catch (error) {
        // Check if job still exists before trying to complete it
        const jobStillExists = await storage.getJob(jobId);
        if (jobStillExists) {
          await service.completeJob(jobId, 'failed', error.message);
        }
        throw error;
      }
    },
    
    /**
     * Process output streams from Claude
     */
    async processOutputStreams(jobId, claudeHandle, color) {
      const decoder = new TextDecoder();
      const colorize = config.logging.colorize ? chalk.hex(color) : (text) => text;
      const errorColorize = config.logging.colorize ? chalk.hex(color).dim : (text) => text;
      const prefixColorize = config.logging.colorize ? chalk.hex(color).bold : (text) => text;
      
      // Helper to store and log output
      const storeAndLogOutput = async (text, type = 'stdout') => {
        try {
          const chunk = formatOutputChunk(text, type, jobId);
          await storage.addOutputChunk(jobId, chunk);
          
          // Update job progress
          const job = await storage.getJob(jobId);
          if (job) {
            await storage.updateJob(jobId, {
              progress: job.progress + text
            });
          }
        } catch (error) {
          // Job might have been cleared - silently ignore storage errors
          if (!error.message.includes('not found')) {
            throw error;
          }
        }
        
        // Log to console
        if (type === 'stdout') {
          const prefixedText = addJobPrefix(text, jobId);
          process.stdout.write(colorize(prefixedText));
        } else if (type === 'stderr') {
          const prefixedText = addJobPrefix(text, jobId, 'ERROR:');
          process.stderr.write(errorColorize(prefixedText));
        }
      };
      
      // Process stdout
      const stdoutPromise = (async () => {
        try {
          let buffer = '';
          for await (const chunk of claudeHandle.stdout) {
            const rawText = decoder.decode(chunk, { stream: true });
            if (rawText) {
              const { lines, buffer: newBuffer } = processStreamChunk(buffer, rawText);
              buffer = newBuffer;
              
              for (const line of lines) {
                const humanText = parseClaudeJsonOutput(line);
                if (humanText) {
                  await storeAndLogOutput(humanText + '\n', 'stdout');
                }
              }
            }
          }
          
          // Process remaining buffer
          if (buffer.trim()) {
            const humanText = parseClaudeJsonOutput(buffer);
            if (humanText) {
              await storeAndLogOutput(humanText, 'stdout');
            }
          }
        } catch (error) {
          const errorMsg = `stdout stream error: ${error.message}`;
          await storeAndLogOutput(errorMsg, 'error');
          console.error(prefixColorize(`[${jobId.slice(-8)}] ${errorMsg}`));
        }
      })();
      
      // Process stderr
      const stderrPromise = (async () => {
        try {
          for await (const chunk of claudeHandle.stderr) {
            const text = decoder.decode(chunk, { stream: true });
            if (text) {
              await storeAndLogOutput(text, 'stderr');
            }
          }
        } catch (error) {
          const errorMsg = `stderr stream error: ${error.message}`;
          await storeAndLogOutput(errorMsg, 'error');
          console.error(prefixColorize(`[${jobId.slice(-8)}] ${errorMsg}`));
        }
      })();
      
      // Wait for both streams to complete
      await Promise.all([stdoutPromise, stderrPromise]);
    },
    
    /**
     * Complete a job
     */
    async completeJob(jobId, status, additionalMessage = '') {
      const job = await storage.getJob(jobId);
      if (!job) return;
      
      const systemMessage = status === 'completed' 
        ? '\n--- Process completed successfully ---'
        : `\n--- Process failed${additionalMessage ? ': ' + additionalMessage : ''} ---`;
      
      // Store completion message
      const chunk = formatOutputChunk(systemMessage, 'system', jobId);
      await storage.addOutputChunk(jobId, chunk);
      
      // Update job
      await storage.updateJob(jobId, {
        status,
        completeMessage: job.progress + (additionalMessage ? '\n' + additionalMessage : ''),
        finishedAt: Date.now()
      });
      
      // Log completion
      if (config.logging.colorize) {
        const colorize = chalk.hex(job.color).bold;
        const message = status === 'completed'
          ? `[${jobId.slice(-8)}] Process completed successfully`
          : `[${jobId.slice(-8)}] Process failed${additionalMessage ? ': ' + additionalMessage : ''}`;
        
        if (status === 'completed') {
          console.log(colorize(message));
        } else {
          console.error(colorize(message));
        }
      }
    },
    
    /**
     * Get job by ID
     */
    async getJob(jobId) {
      return await storage.getJob(jobId);
    },
    
    /**
     * List all jobs
     */
    async listJobs(filter = {}) {
      const jobs = await storage.listJobs(filter);
      return jobs.map(job => ({
        id: job.id,
        prompt: job.prompt.length > 100 
          ? job.prompt.substring(0, 100) + '...'
          : job.prompt,
        status: job.status,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        color: job.color,
        hasCompleteMessage: Boolean(job.completeMessage),
      }));
    },
    
    /**
     * Get job output history
     */
    async getJobOutput(jobId) {
      const job = await storage.getJob(jobId);
      if (!job) return null;
      
      return {
        jobId,
        outputHistory: job.outputHistory || [],
        status: job.status,
        color: job.color,
      };
    },
    
    /**
     * Get job output stream
     */
    async getJobStream(jobId, since = 0) {
      const job = await storage.getJob(jobId);
      if (!job) return null;
      
      const stream = await storage.getOutputStream(jobId, since);
      
      return {
        jobId,
        chunks: stream ? stream.chunks : [],
        status: job.status,
        color: job.color,
        lastUpdate: stream ? stream.lastUpdate : job.startedAt,
      };
    },
    
    /**
     * Terminate a running job
     */
    async terminateJob(jobId) {
      const job = await storage.getJob(jobId);
      if (!job) {
        throw new Error('Job not found');
      }
      
      // Atomic check-and-set: only allow termination if job is currently 'running'
      if (job.status !== 'running') {
        throw new Error('Job is not running');
      }
      
      // Immediately set status to 'terminating' to prevent concurrent terminations
      job.status = 'terminating';
      await storage.updateJob(jobId, job);
      
      if (job.process && job.process.kill) {
        try {
          job.process.kill('SIGTERM');
          await this.completeJob(jobId, 'terminated', 'Process terminated by user');
          return { success: true, status: 'terminated' };
        } catch (error) {
          // If termination fails, revert to running state
          job.status = 'running';
          await storage.updateJob(jobId, job);
          throw new Error('Failed to terminate process');
        }
      } else {
        // If no process to terminate, revert to running state
        job.status = 'running';
        await storage.updateJob(jobId, job);
        throw new Error('No active process to terminate');
      }
    },
    
    /**
     * Delete a job
     */
    async deleteJob(jobId) {
      const job = await storage.getJob(jobId);
      if (!job) {
        // Job doesn't exist - this is considered successful (idempotent)
        return { success: true };
      }
      
      if (job.status === 'running') {
        throw new Error('Cannot delete running job');
      }
      
      await storage.deleteJob(jobId);
      return { success: true };
    },
    
    /**
     * Create batch jobs
     */
    async createBatch(prompts, options = {}) {
      const jobIds = [];
      
      for (const prompt of prompts) {
        const result = await service.createJob(prompt, options);
        jobIds.push(result.jobId);
      }
      
      if (config.logging.colorize) {
        console.log(
          chalk.cyan(
            `[${new Date().toISOString()}] Started batch of ${prompts.length} jobs: ${jobIds.map(id => id.slice(-8)).join(', ')}`
          )
        );
      }
      
      return {
        jobIds,
        status: 'started',
        count: prompts.length,
      };
    },
    
    /**
     * Get service statistics
     */
    async getStats() {
      return await storage.getStats();
    },
    
    /**
     * Cleanup old jobs
     */
    async cleanup() {
      const config = getConfig();
      const cleaned = await storage.cleanup(config.jobs.retentionPeriod);
      return cleaned;
    }
  };
  
  return service;
};

/**
 * Generate a unique job ID
 */
const generateJobId = () => {
  return `job_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
};

// Export a default service instance
let serviceInstance = null;

export const getJobService = () => {
  if (!serviceInstance) {
    serviceInstance = createJobService();
  }
  return serviceInstance;
};

// For testing - allow service reset
export const resetJobService = () => {
  serviceInstance = null;
};

export default getJobService;