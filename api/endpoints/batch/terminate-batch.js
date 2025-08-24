// POST /batch/:jobIds/terminate - Terminate multiple running jobs endpoint

import getConfig from '../../config/index.js';
import { getJobService } from '../../services/job-service.js';

/**
 * Terminate batch jobs endpoint handler
 * @param {Object} options - Dependency injection options
 * @returns {Function} Hono handler function
 */
export const terminateBatchEndpoint = (options = {}) => {
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
      
      // Parse query parameters for termination options
      const query = c.req.query();
      const force = query.force === 'true'; // Force termination even if not running
      const waitForTermination = query.wait === 'true'; // Wait for termination to complete
      const timeoutMs = parseInt(query.timeout) || 5000; // Timeout for waiting
      
      if (timeoutMs < 1000 || timeoutMs > 30000) {
        return c.json({ error: 'Timeout must be between 1000 and 30000ms' }, 400);
      }
      
      const results = [];
      const startTime = Date.now();
      
      // Process each job ID
      for (const jobId of jobIds) {
        const result = {
          jobId,
          success: false,
          error: null,
          status: null,
          terminatedAt: null
        };
        
        try {
          if (force) {
            // Try to terminate regardless of current status
            const job = await jobService.getJob(jobId);
            if (!job) {
              result.error = 'Job not found';
            } else if (job.status === 'running') {
              const terminateResult = await jobService.terminateJob(jobId);
              result.success = true;
              result.status = terminateResult.status;
              result.terminatedAt = Date.now();
            } else {
              result.success = true;
              result.status = job.status;
              result.error = `Job was already ${job.status}`;
            }
          } else {
            // Normal termination (only running jobs)
            const terminateResult = await jobService.terminateJob(jobId);
            result.success = true;
            result.status = terminateResult.status;
            result.terminatedAt = Date.now();
          }
        } catch (error) {
          result.error = error.message;
          console.error(`Error terminating job ${jobId}:`, error);
        }
        
        results.push(result);
        
        // Check timeout if waiting
        if (waitForTermination && Date.now() - startTime > timeoutMs) {
          break; // Stop processing if timeout reached
        }
      }
      
      // If waiting for termination, verify jobs are actually terminated
      if (waitForTermination) {
        for (const result of results) {
          if (result.success && result.status === 'terminated') {
            try {
              // Give a moment for termination to complete
              await new Promise(resolve => setTimeout(resolve, 100));
              
              const job = await jobService.getJob(result.jobId);
              if (job && job.status !== 'terminated') {
                result.error = `Termination initiated but job still ${job.status}`;
                result.success = false;
              }
            } catch (error) {
              result.error = `Failed to verify termination: ${error.message}`;
              result.success = false;
            }
          }
        }
      }
      
      // Calculate summary
      const summary = {
        total: jobIds.length,
        processed: results.length,
        terminated: results.filter(r => r.success && r.status === 'terminated').length,
        failed: results.filter(r => !r.success).length,
        alreadyStopped: results.filter(r => r.success && r.status !== 'terminated').length,
        duration: Date.now() - startTime
      };
      
      return c.json({ 
        results, 
        summary,
        options: {
          force,
          waitForTermination,
          timeoutMs
        },
        completedAt: Date.now()
      });
      
    } catch (error) {
      console.error('Error terminating batch:', error);
      return c.json({ error: error.message || 'Internal error' }, 500);
    }
  };
};

export default terminateBatchEndpoint;