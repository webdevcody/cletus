// Storage service abstraction for job and output stream management

import getConfig from '../config/index.js';

/**
 * Storage interface for job management
 * Supports different backends: memory, file, redis
 */
export const createStorageService = (options = {}) => {
  const config = getConfig();
  const backend = options.backend || config.storage.backend;
  
  switch (backend) {
    case 'memory':
      return createMemoryStorage(config);
    case 'file':
      return createFileStorage(config);
    case 'redis':
      // Future implementation
      throw new Error('Redis storage not yet implemented');
    default:
      throw new Error(`Unknown storage backend: ${backend}`);
  }
};

/**
 * In-memory storage implementation
 */
const createMemoryStorage = (config) => {
  const jobs = new Map();
  const outputStreams = new Map();
  
  return {
    // Job operations
    async createJob(job) {
      if (jobs.size >= config.storage.maxJobsInMemory) {
        // Remove oldest completed jobs
        const sortedJobs = Array.from(jobs.entries())
          .filter(([_, j]) => j.status === 'completed' || j.status === 'failed')
          .sort((a, b) => a[1].finishedAt - b[1].finishedAt);
        
        if (sortedJobs.length > 0) {
          const [oldestId] = sortedJobs[0];
          jobs.delete(oldestId);
          outputStreams.delete(oldestId);
        } else {
          throw new Error('Maximum job limit reached');
        }
      }
      
      jobs.set(job.id, job);
      return job;
    },
    
    async getJob(id) {
      return jobs.get(id) || null;
    },
    
    async updateJob(id, updates) {
      const job = jobs.get(id);
      if (!job) {
        throw new Error(`Job ${id} not found`);
      }
      
      const updatedJob = { ...job, ...updates };
      jobs.set(id, updatedJob);
      return updatedJob;
    },
    
    async deleteJob(id) {
      const existed = jobs.has(id);
      jobs.delete(id);
      outputStreams.delete(id);
      return existed;
    },
    
    async listJobs(filter = {}) {
      let jobArray = Array.from(jobs.values());
      
      // Apply filters
      if (filter.status) {
        jobArray = jobArray.filter(job => job.status === filter.status);
      }
      
      if (filter.since) {
        jobArray = jobArray.filter(job => job.startedAt >= filter.since);
      }
      
      if (filter.before) {
        jobArray = jobArray.filter(job => job.startedAt <= filter.before);
      }
      
      // Sort by startedAt descending by default
      jobArray.sort((a, b) => b.startedAt - a.startedAt);
      
      return jobArray;
    },
    
    // Output stream operations
    async createOutputStream(jobId) {
      outputStreams.set(jobId, {
        chunks: [],
        lastUpdate: Date.now()
      });
      return true;
    },
    
    async addOutputChunk(jobId, chunk) {
      const stream = outputStreams.get(jobId);
      if (!stream) {
        // Create stream if it doesn't exist
        outputStreams.set(jobId, {
          chunks: [chunk],
          lastUpdate: Date.now()
        });
      } else {
        stream.chunks.push(chunk);
        stream.lastUpdate = Date.now();
        
        // Limit chunks to prevent memory issues
        if (stream.chunks.length > config.storage.maxOutputChunks) {
          stream.chunks = stream.chunks.slice(-config.storage.maxOutputChunks);
        }
      }
      
      // Also add to job's output history if it exists
      const job = jobs.get(jobId);
      if (job) {
        if (!job.outputHistory) {
          job.outputHistory = [];
        }
        job.outputHistory.push(chunk);
        
        // Limit output history size
        if (job.outputHistory.length > config.storage.maxOutputChunks) {
          job.outputHistory = job.outputHistory.slice(-config.storage.maxOutputChunks);
        }
      }
      
      return true;
    },
    
    async getOutputStream(jobId, since = 0) {
      const stream = outputStreams.get(jobId);
      if (!stream) {
        return null;
      }
      
      const filteredChunks = since > 0
        ? stream.chunks.filter(chunk => chunk.timestamp > since)
        : stream.chunks;
      
      return {
        chunks: filteredChunks,
        lastUpdate: stream.lastUpdate
      };
    },
    
    async deleteOutputStream(jobId) {
      return outputStreams.delete(jobId);
    },
    
    // Utility operations
    async clear() {
      jobs.clear();
      outputStreams.clear();
      return true;
    },
    
    async getStats() {
      const statuses = {};
      for (const job of jobs.values()) {
        statuses[job.status] = (statuses[job.status] || 0) + 1;
      }
      
      // Get actual memory usage
      const memUsage = process.memoryUsage();
      
      return {
        totalJobs: jobs.size,
        totalStreams: outputStreams.size,
        jobsByStatus: statuses,
        memoryUsage: {
          jobs: jobs.size,
          maxJobs: config.storage.maxJobsInMemory,
          streams: outputStreams.size,
          rss: memUsage.rss,
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          external: memUsage.external
        }
      };
    },
    
    // Cleanup operations
    async cleanup(olderThan) {
      const cutoffTime = Date.now() - olderThan;
      let cleaned = 0;
      
      for (const [id, job] of jobs.entries()) {
        if (job.status !== 'running') {
          // Use finishedAt if available, otherwise use startedAt
          const jobTimestamp = job.finishedAt || job.startedAt;
          if (jobTimestamp && jobTimestamp < cutoffTime) {
            jobs.delete(id);
            outputStreams.delete(id);
            cleaned++;
          }
        }
      }
      
      return cleaned;
    }
  };
};

/**
 * File-based storage implementation (stub for future)
 */
const createFileStorage = (config) => {
  // This would implement persistence to disk
  // For now, throw an error
  throw new Error('File storage not yet implemented. Use memory storage instead.');
};

// Export a default storage instance
let storageInstance = null;

export const getStorage = () => {
  if (!storageInstance) {
    storageInstance = createStorageService();
  }
  return storageInstance;
};

// For testing - allow storage reset
export const resetStorage = () => {
  if (storageInstance) {
    storageInstance.clear();
  }
  storageInstance = null;
};

export default getStorage;