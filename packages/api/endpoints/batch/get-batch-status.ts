// GET /batch/:jobIds/status - Get status of multiple jobs endpoint

import getConfig from '../../config/index.js';
import { getJobService } from '../../services/job-service.js';

/**
 * Get batch status endpoint handler
 * @param {Object} options - Dependency injection options
 * @returns {Function} Hono handler function
 */
export const getBatchStatusEndpoint = (options = {}) => {
  const config = getConfig();
  const jobService = options.jobService || getJobService();

  return async (c) => {
    try {
      const jobIdsParam = c.req.param('jobIds');
      if (!jobIdsParam) {
        return c.json({ error: 'Job IDs parameter is required' }, 400);
      }
      
      // Parse job IDs from comma-separated string
      const jobIds = jobIdsParam.split(',')
        .map(id => id.trim())
        .filter(id => id);
      
      if (jobIds.length === 0) {
        return c.json({ error: 'At least one job ID is required' }, 400);
      }
      
      if (jobIds.length > config.jobs.maxBatchSize) {
        return c.json({ 
          error: `Maximum ${config.jobs.maxBatchSize} job IDs allowed per request` 
        }, 400);
      }
      
      // Validate job ID formats
      for (let i = 0; i < jobIds.length; i++) {
        if (typeof jobIds[i] !== 'string' || jobIds[i].length === 0) {
          return c.json({ 
            error: `Invalid job ID format at index ${i}` 
          }, 400);
        }
      }
      
      // Parse query parameters for additional filtering
      const query = c.req.query();
      const includeOutput = query.includeOutput === 'true';
      const includeProgress = query.includeProgress === 'true';
      
      // Get status for each job
      const jobs = [];
      const notFound = [];
      const errors = [];
      
      for (const jobId of jobIds) {
        try {
          const job = await jobService.getJob(jobId);
          if (job) {
            const jobStatus = {
              id: job.id,
              status: job.status,
              startedAt: job.startedAt,
              finishedAt: job.finishedAt,
              hasOutput: Boolean(job.outputHistory?.length || job.progress),
              color: job.color
            };
            
            // Include additional data if requested
            if (includeProgress && job.progress) {
              jobStatus.progressPreview = job.progress.substring(0, 200);
              jobStatus.progressLength = job.progress.length;
            }
            
            if (includeOutput && job.outputHistory) {
              jobStatus.outputCount = job.outputHistory.length;
              jobStatus.lastOutput = job.outputHistory[job.outputHistory.length - 1];
            }
            
            // Add job duration if completed
            if (job.finishedAt && job.startedAt) {
              jobStatus.duration = job.finishedAt - job.startedAt;
            }
            
            jobs.push(jobStatus);
          } else {
            notFound.push(jobId);
          }
        } catch (error) {
          console.error(`Error getting job ${jobId}:`, error);
          errors.push({ jobId, error: error.message });
        }
      }
      
      // Calculate summary statistics
      const summary = {
        total: jobIds.length,
        found: jobs.length,
        notFound: notFound.length,
        errors: errors.length,
        completed: jobs.filter(j => j.status === 'completed').length,
        failed: jobs.filter(j => j.status === 'failed').length,
        running: jobs.filter(j => j.status === 'running').length,
        pending: jobs.filter(j => j.status === 'pending').length,
        terminated: jobs.filter(j => j.status === 'terminated').length,
      };
      
      // Calculate batch statistics
      const batchStats = {
        completionRate: summary.found > 0 ? summary.completed / summary.found : 0,
        failureRate: summary.found > 0 ? summary.failed / summary.found : 0,
        avgDuration: jobs
          .filter(j => j.duration)
          .reduce((sum, j, _, arr) => sum + j.duration / arr.length, 0)
      };
      
      return c.json({
        jobs,
        notFound,
        errors,
        summary,
        batchStats,
        requestedAt: Date.now()
      });
      
    } catch (error) {
      console.error('Error getting batch status:', error);
      return c.json({ error: error.message || 'Internal error' }, 500);
    }
  };
};

export default getBatchStatusEndpoint;