// Unit tests for job service edge cases and error scenarios

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { createJobService } from '../../../services/job-service.js';
import { createStorageService } from '../../../services/storage-service.js';
import { createClaudeService } from '../../../services/claude-service.js';
import { wait, waitForJobStatus } from '../../setup.js';

describe('job service edge cases', () => {
  let jobService, storage, claudeService;

  beforeEach(() => {
    storage = createStorageService({ backend: 'memory' });
    claudeService = createClaudeService({ mockMode: true });
    jobService = createJobService({ storage, claudeService });
  });

  afterEach(async () => {
    // Clean up any running jobs
    const jobs = await storage.listJobs();
    for (const job of jobs) {
      if (job.status === 'running') {
        try {
          await jobService.terminateJob(job.id);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }
    await storage.clear();
  });

  describe('job creation edge cases', () => {
    test('should handle extremely long prompts', async () => {
      const longPrompt = 'A'.repeat(100000); // 100KB prompt
      
      const result = await jobService.createJob(longPrompt);
      
      expect(result.jobId).toMatch(/^job_\d+_[a-z0-9]+$/);
      expect(result.status).toBe('started');
      
      const job = await jobService.getJob(result.jobId);
      expect(job.prompt).toBe(longPrompt);
    });

    test('should handle prompts with special characters', async () => {
      const specialPrompt = 'Hello! @#$%^&*(){}[]|\\:";\'<>?,./ 测试 🚀 \n\t\r';
      
      const result = await jobService.createJob(specialPrompt);
      
      expect(result.jobId).toMatch(/^job_\d+_[a-z0-9]+$/);
      const job = await jobService.getJob(result.jobId);
      expect(job.prompt).toBe(specialPrompt);
    });

    test('should handle empty prompt', async () => {
      const result = await jobService.createJob('');
      
      expect(result.jobId).toMatch(/^job_\d+_[a-z0-9]+$/);
      const job = await jobService.getJob(result.jobId);
      expect(job.prompt).toBe('');
    });

    test('should handle whitespace-only prompt', async () => {
      const whitespacePrompt = '   \n\t\r   ';
      
      const result = await jobService.createJob(whitespacePrompt);
      
      expect(result.jobId).toMatch(/^job_\d+_[a-z0-9]+$/);
      const job = await jobService.getJob(result.jobId);
      expect(job.prompt).toBe(whitespacePrompt);
    });

    test('should handle complex options object', async () => {
      const complexOptions = {
        model: 'claude-3-sonnet',
        allowedTools: ['file', 'web', 'terminal'],
        disallowedTools: ['dangerous'],
        addDirs: ['/path/one', '/path/two'],
        customParam: 'custom-value',
        nested: {
          deep: {
            value: 123
          }
        }
      };
      
      const result = await jobService.createJob('Test prompt', complexOptions);
      
      const job = await jobService.getJob(result.jobId);
      expect(job.options).toEqual(complexOptions);
    });

    test('should generate unique job IDs for concurrent creation', async () => {
      const promises = Array(20).fill(null).map(() => 
        jobService.createJob('Concurrent test')
      );
      
      const results = await Promise.all(promises);
      const jobIds = results.map(r => r.jobId);
      const uniqueIds = new Set(jobIds);
      
      expect(uniqueIds.size).toBe(20); // All job IDs should be unique
    });

    test('should handle custom job ID conflicts', async () => {
      const customId = 'custom_job_123';
      
      // Create first job with custom ID
      const result1 = await jobService.createJob('First job', {}, customId);
      expect(result1.jobId).toBe(customId);
      
      // Second job with same ID should throw error
      await expect(async () => {
        await jobService.createJob('Second job', {}, customId);
      }).toThrow('Job ID already exists');
    });

    test('should handle job ID with special characters', async () => {
      const specialId = 'job_with-special.chars_123';
      
      const result = await jobService.createJob('Special ID test', {}, specialId);
      
      expect(result.jobId).toBe(specialId);
      const job = await jobService.getJob(specialId);
      expect(job).toBeTruthy();
    });
  });

  describe('job retrieval edge cases', () => {
    test('should handle non-existent job gracefully', async () => {
      const job = await jobService.getJob('non-existent-job');
      
      expect(job).toBe(null);
    });

    test('should handle empty job ID', async () => {
      const job = await jobService.getJob('');
      
      expect(job).toBe(null);
    });

    test('should handle null job ID', async () => {
      const job = await jobService.getJob(null);
      
      expect(job).toBe(null);
    });

    test('should handle undefined job ID', async () => {
      const job = await jobService.getJob(undefined);
      
      expect(job).toBe(null);
    });

    test('should handle job ID with special characters in lookup', async () => {
      const specialId = 'job_with-special.chars_123';
      await jobService.createJob('Special ID test', {}, specialId);
      
      const job = await jobService.getJob(specialId);
      
      expect(job.id).toBe(specialId);
    });
  });

  describe('job termination edge cases', () => {
    test('should handle terminating already completed job', async () => {
      const { jobId } = await jobService.createJob('Quick job');
      
      // Wait for job to complete
      let attempts = 0;
      while (attempts < 50) {
        const job = await jobService.getJob(jobId);
        if (job.status === 'completed' || job.status === 'failed') {
          break;
        }
        await wait(10);
        attempts++;
      }
      
      await expect(async () => {
        await jobService.terminateJob(jobId);
      }).toThrow('Job is not running');
    });

    test('should handle terminating non-existent job', async () => {
      await expect(async () => {
        await jobService.terminateJob('non-existent-job');
      }).toThrow('Job not found');
    });

    test('should handle double termination', async () => {
      const { jobId } = await jobService.createJob('Long running job');
      
      // Give job time to start
      await wait(50);
      
      // First termination should succeed
      await jobService.terminateJob(jobId);
      
      // Second termination should fail
      await expect(async () => {
        await jobService.terminateJob(jobId);
      }).toThrow('Job is not running');
    });

    test('should handle terminating job that failed to start', async () => {
      // Mock Claude service to fail
      const failingClaudeService = createClaudeService({ mockMode: true });
      const originalStartProcess = failingClaudeService.startProcess;
      failingClaudeService.startProcess = async () => {
        throw new Error('Failed to start process');
      };
      
      const failingJobService = createJobService({ 
        storage, 
        claudeService: failingClaudeService 
      });
      
      const { jobId } = await failingJobService.createJob('Failing job');
      
      // Wait for job to fail
      await wait(100);
      
      await expect(async () => {
        await failingJobService.terminateJob(jobId);
      }).toThrow();
    });
  });

  describe('job deletion edge cases', () => {
    test('should handle deleting non-existent job', async () => {
      await expect(async () => {
        await jobService.deleteJob('non-existent-job');
      }).toThrow('Job not found');
    });

    test('should handle deleting running job', async () => {
      const { jobId } = await jobService.createJob('Long running job');
      
      // Give job time to start
      await wait(50);
      
      await expect(async () => {
        await jobService.deleteJob(jobId);
      }).toThrow('Cannot delete running job');
    });

    test('should successfully delete completed job', async () => {
      const { jobId } = await jobService.createJob('Quick job');
      
      // Wait for completion
      let attempts = 0;
      while (attempts < 50) {
        const job = await jobService.getJob(jobId);
        if (job.status === 'completed' || job.status === 'failed') {
          break;
        }
        await wait(10);
        attempts++;
      }
      
      await jobService.deleteJob(jobId);
      
      const job = await jobService.getJob(jobId);
      expect(job).toBe(null);
    });

    test('should successfully delete terminated job', async () => {
      const { jobId } = await jobService.createJob('Long job');
      
      // Give job time to start
      await wait(50);
      
      await jobService.terminateJob(jobId);
      await jobService.deleteJob(jobId);
      
      const job = await jobService.getJob(jobId);
      expect(job).toBe(null);
    });

    test('should successfully delete failed job', async () => {
      // Create a job that will fail
      const { jobId } = await jobService.createJob('This should fail with an error');
      
      // Wait for failure
      let attempts = 0;
      while (attempts < 50) {
        const job = await jobService.getJob(jobId);
        if (job.status === 'failed') {
          break;
        }
        await wait(10);
        attempts++;
      }
      
      await jobService.deleteJob(jobId);
      
      const job = await jobService.getJob(jobId);
      expect(job).toBe(null);
    });
  });

  describe('job statistics edge cases', () => {
    test('should return zero stats when no jobs exist', async () => {
      const stats = await jobService.getStats();
      
      expect(stats.totalJobs).toBe(0);
      expect(stats.jobsByStatus).toEqual({});
      expect(stats.memoryUsage).toHaveProperty('rss');
    });

    test('should handle stats with mixed job statuses', async () => {
      // Create various jobs
      const job1 = await jobService.createJob('Job 1');
      const job2 = await jobService.createJob('This should fail with an error');
      const job3 = await jobService.createJob('Job 3');
      
      // Wait for jobs to process
      await wait(200);
      
      // Terminate one job
      try {
        const runningJob = await jobService.getJob(job3.jobId);
        if (runningJob.status === 'running') {
          await jobService.terminateJob(job3.jobId);
        }
      } catch (error) {
        // Job might already be done
      }
      
      const stats = await jobService.getStats();
      
      expect(stats.totalJobs).toBe(3);
      expect(stats.jobsByStatus).toBeDefined();
      expect(Object.keys(stats.jobsByStatus).length).toBeGreaterThan(0);
    });
  });

  describe('job cleanup edge cases', () => {
    test('should handle cleanup with no old jobs', async () => {
      const cleaned = await jobService.cleanup();
      
      expect(cleaned).toBe(0);
    });

    test('should not clean up recent jobs', async () => {
      // Create a recent job
      await jobService.createJob('Recent job');
      
      const cleaned = await jobService.cleanup();
      
      expect(cleaned).toBe(0);
      
      const stats = await jobService.getStats();
      expect(stats.totalJobs).toBe(1);
    });

    test('should handle cleanup of jobs with various statuses', async () => {
      // Create jobs and let them run
      await jobService.createJob('Job 1');
      await jobService.createJob('This should fail with an error');
      
      // Wait for all jobs to complete
      const jobIds = (await storage.listJobs()).map(j => j.id);
      for (const jobId of jobIds) {
        await waitForJobStatus(jobService, jobId, ['completed', 'failed', 'terminated'], 5000);
      }
      
      // Now mock old timestamps by directly modifying storage
      const jobs = await storage.listJobs();
      const oldTimestamp = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
      for (const job of jobs) {
        job.startedAt = oldTimestamp;
        job.finishedAt = oldTimestamp;
        await storage.updateJob(job.id, job);
      }
      
      const cleaned = await jobService.cleanup();
      
      expect(cleaned).toBeGreaterThan(0);
    });
  });

  describe('job output edge cases', () => {
    test('should handle getting output for non-existent job', async () => {
      const output = await jobService.getJobOutput('non-existent-job');
      
      expect(output).toBe(null);
    });

    test('should handle getting stream for non-existent job', async () => {
      const stream = await jobService.getJobStream('non-existent-job');
      
      expect(stream).toBe(null);
    });

    test('should handle getting output with since parameter', async () => {
      const { jobId } = await jobService.createJob('Output test');
      
      // Wait for some output
      await wait(100);
      
      const since = Date.now() - 50; // 50ms ago
      const stream = await jobService.getJobStream(jobId, since);
      
      if (stream) {
        expect(stream.chunks).toBeDefined();
        expect(Array.isArray(stream.chunks)).toBe(true);
        // Chunks should be newer than since timestamp
        stream.chunks.forEach(chunk => {
          expect(chunk.timestamp).toBeGreaterThanOrEqual(since);
        });
      }
    });

    test('should handle getting output with future since parameter', async () => {
      const { jobId } = await jobService.createJob('Future output test');
      
      const futureTime = Date.now() + 10000; // 10 seconds in future
      const stream = await jobService.getJobStream(jobId, futureTime);
      
      if (stream) {
        expect(stream.chunks).toEqual([]);
      }
    });
  });

  describe('concurrent job operations', () => {
    test('should handle multiple jobs running concurrently', async () => {
      const promises = Array(10).fill(null).map((_, i) => 
        jobService.createJob(`Concurrent job ${i}`)
      );
      
      const results = await Promise.all(promises);
      
      expect(results.length).toBe(10);
      results.forEach(result => {
        expect(result.jobId).toMatch(/^job_\d+_[a-z0-9]+$/);
        expect(result.status).toBe('started');
      });
      
      // Wait a bit and check all jobs are tracked
      await wait(100);
      const stats = await jobService.getStats();
      expect(stats.totalJobs).toBe(10);
    });

    test('should handle concurrent termination requests', async () => {
      const { jobId } = await jobService.createJob('Concurrent termination test');
      
      // Give job time to start
      await wait(50);
      
      // Try to terminate the same job multiple times concurrently
      const promises = Array(5).fill(null).map(() => 
        jobService.terminateJob(jobId).catch(error => error)
      );
      
      const results = await Promise.all(promises);
      
      // One should succeed, others should fail
      const successes = results.filter(r => !(r instanceof Error));
      const failures = results.filter(r => r instanceof Error);
      
      expect(successes.length).toBe(1);
      expect(failures.length).toBe(4);
    });
  });

  describe('memory and resource limits', () => {
    test('should handle jobs when approaching memory limits', async () => {
      // Create many jobs to approach memory limits
      const jobPromises = Array(50).fill(null).map((_, i) => 
        jobService.createJob(`Memory test job ${i}`.repeat(100)) // Larger prompts
      );
      
      const results = await Promise.all(jobPromises);
      
      expect(results.length).toBe(50);
      
      // All should be created successfully
      results.forEach(result => {
        expect(result.jobId).toMatch(/^job_\d+_[a-z0-9]+$/);
        expect(result.status).toBe('started');
      });
    });

    test('should handle cleanup when memory is constrained', async () => {
      // Create and complete many jobs
      const jobs = [];
      for (let i = 0; i < 20; i++) {
        const { jobId } = await jobService.createJob(`Cleanup test ${i}`);
        jobs.push(jobId);
      }
      
      // Wait for all jobs to complete
      for (const jobId of jobs) {
        await waitForJobStatus(jobService, jobId, ['completed', 'failed', 'terminated'], 5000);
      }
      
      // Force old timestamps
      const allJobs = await storage.listJobs();
      const oldTimestamp = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
      for (const job of allJobs) {
        job.startedAt = oldTimestamp;
        job.finishedAt = oldTimestamp;
        await storage.updateJob(job.id, job);
      }
      
      const cleaned = await jobService.cleanup();
      
      expect(cleaned).toBeGreaterThan(0);
      
      const finalStats = await jobService.getStats();
      expect(finalStats.totalJobs).toBeLessThan(20);
    });
  });
});