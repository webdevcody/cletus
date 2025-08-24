// POST /cleanup - Cleanup old jobs endpoint

import { getJobService } from '../../services/job-service.js';
import getConfig from '../../config/index.js';

/**
 * Cleanup old jobs endpoint handler
 * @param {Object} options - Dependency injection options
 * @returns {Function} Hono handler function
 */
export const cleanupEndpoint = (options = {}) => {
  const jobService = options.jobService || getJobService();
  const config = getConfig();

  return async (c) => {
    try {
      // Parse query parameters for cleanup options
      const query = c.req.query();
      
      // Custom retention period (in milliseconds)
      let retentionPeriod = config.jobs.retentionPeriod;
      if (query.maxAge) {
        const customAge = parseInt(query.maxAge);
        if (isNaN(customAge) || customAge < 60000 || customAge > 604800000) { // 1 minute to 1 week
          return c.json({ error: 'Invalid maxAge (60000ms to 604800000ms)' }, 400);
        }
        retentionPeriod = customAge;
      }
      
      // Cleanup mode
      const mode = query.mode || 'safe';
      const validModes = ['safe', 'aggressive', 'force'];
      if (!validModes.includes(mode)) {
        return c.json({ error: `Invalid mode. Valid values: ${validModes.join(', ')}` }, 400);
      }
      
      // Dry run option
      const dryRun = query.dryRun === 'true';
      
      // Include details option
      const includeDetails = query.details === 'true';
      
      const startTime = Date.now();
      let cleaned = 0;
      const details = [];
      
      try {
        // Get initial stats
        const initialStats = await jobService.getStats();
        
        if (mode === 'safe') {
          // Safe mode: only clean completed/failed jobs older than retention period
          if (!dryRun) {
            const result = await jobService.cleanup();
            cleaned = typeof result === 'object' ? result.cleaned : result;
          } else {
            // For dry run, simulate what would be cleaned
            const jobs = await jobService.listJobs();
            const cutoffTime = Date.now() - retentionPeriod;
            
            for (const job of jobs) {
              if ((job.status === 'completed' || job.status === 'failed' || job.status === 'terminated') &&
                  job.finishedAt && job.finishedAt < cutoffTime) {
                cleaned++;
                
                if (includeDetails) {
                  details.push({
                    jobId: job.id,
                    status: job.status,
                    age: Date.now() - job.finishedAt,
                    finishedAt: job.finishedAt
                  });
                }
              }
            }
          }
        } else if (mode === 'aggressive') {
          // Aggressive mode: clean all non-running jobs older than retention period
          if (!dryRun) {
            const result = await jobService.cleanup();
            cleaned = typeof result === 'object' ? result.cleaned : result;
            // Additional cleanup for pending/terminated jobs
            const jobs = await jobService.listJobs();
            const cutoffTime = Date.now() - retentionPeriod;
            
            for (const job of jobs) {
              if (job.status !== 'running' && job.startedAt < cutoffTime) {
                try {
                  await jobService.deleteJob(job.id);
                  cleaned++;
                } catch (error) {
                  console.warn(`Failed to cleanup job ${job.id}:`, error);
                }
              }
            }
          } else {
            // Dry run simulation
            const jobs = await jobService.listJobs();
            const cutoffTime = Date.now() - retentionPeriod;
            
            for (const job of jobs) {
              if (job.status !== 'running' && job.startedAt < cutoffTime) {
                cleaned++;
                
                if (includeDetails) {
                  details.push({
                    jobId: job.id,
                    status: job.status,
                    age: Date.now() - job.startedAt,
                    startedAt: job.startedAt
                  });
                }
              }
            }
          }
        } else if (mode === 'force') {
          // Force mode: clean ALL jobs except currently running ones
          if (!dryRun) {
            const jobs = await jobService.listJobs();
            
            for (const job of jobs) {
              if (job.status !== 'running') {
                try {
                  await jobService.deleteJob(job.id);
                  cleaned++;
                  
                  if (includeDetails) {
                    details.push({
                      jobId: job.id,
                      status: job.status,
                      age: Date.now() - job.startedAt,
                      forcedCleanup: true
                    });
                  }
                } catch (error) {
                  console.warn(`Failed to force cleanup job ${job.id}:`, error);
                }
              }
            }
          } else {
            // Dry run simulation
            const jobs = await jobService.listJobs();
            
            for (const job of jobs) {
              if (job.status !== 'running') {
                cleaned++;
                
                if (includeDetails) {
                  details.push({
                    jobId: job.id,
                    status: job.status,
                    age: Date.now() - job.startedAt,
                    forcedCleanup: true
                  });
                }
              }
            }
          }
        }
        
        // Get final stats
        const finalStats = await jobService.getStats();
        
        const response = {
          cleaned,
          mode,
          dryRun,
          retentionPeriod,
          duration: Date.now() - startTime,
          before: {
            totalJobs: initialStats.totalJobs,
            jobsByStatus: initialStats.jobsByStatus
          },
          after: {
            totalJobs: finalStats.totalJobs,
            jobsByStatus: finalStats.jobsByStatus
          },
          freed: {
            jobs: initialStats.totalJobs - finalStats.totalJobs,
            streams: initialStats.totalStreams - finalStats.totalStreams
          }
        };
        
        // Include details if requested
        if (includeDetails && details.length > 0) {
          response.details = details;
        }
        
        // Add recommendations
        response.recommendations = getCleanupRecommendations(finalStats, config);
        
        return c.json(response);
        
      } catch (cleanupError) {
        console.error('Cleanup operation failed:', cleanupError);
        return c.json({ 
          error: 'Cleanup operation failed',
          details: cleanupError.message,
          partiallyCompleted: cleaned > 0,
          cleaned
        }, 500);
      }
      
    } catch (error) {
      console.error('Error during cleanup:', error);
      return c.json({ error: error.message || 'Internal error' }, 500);
    }
  };
};

/**
 * Generate cleanup recommendations based on current stats
 */
const getCleanupRecommendations = (stats, config) => {
  const recommendations = [];
  const totalJobs = stats.totalJobs || 0;
  const utilizationPercent = totalJobs / config.storage.maxJobsInMemory * 100;
  
  if (utilizationPercent > 80) {
    recommendations.push({
      type: 'warning',
      message: 'Job storage utilization is high. Consider more frequent cleanup.',
      action: 'Schedule regular cleanup or reduce retention period'
    });
  }
  
  const failedJobs = stats.jobsByStatus?.failed || 0;
  if (failedJobs > totalJobs * 0.1 && totalJobs > 10) {
    recommendations.push({
      type: 'info',
      message: 'High number of failed jobs detected.',
      action: 'Review failed jobs before cleanup to identify issues'
    });
  }
  
  const completedJobs = stats.jobsByStatus?.completed || 0;
  if (completedJobs > totalJobs * 0.8 && totalJobs > 50) {
    recommendations.push({
      type: 'info',
      message: 'Many completed jobs can be safely cleaned.',
      action: 'Consider aggressive cleanup mode for better performance'
    });
  }
  
  if (totalJobs === 0) {
    recommendations.push({
      type: 'success',
      message: 'No jobs in storage. System is clean.'
    });
  }
  
  return recommendations;
};

export default cleanupEndpoint;