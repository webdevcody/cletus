// DELETE /batch/:jobIds - Delete multiple completed jobs endpoint

import getConfig from '../../config/index.js';
import { getJobService } from '../../services/job-service.js';

/**
 * Delete batch jobs endpoint handler
 * @param {Object} options - Dependency injection options
 * @returns {Function} Hono handler function
 */
export const deleteBatchEndpoint = (options = {}) => {
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
      
      // Parse query parameters for deletion options
      const query = c.req.query();
      const force = query.force === 'true'; // Force delete even if running
      const includeOutput = query.includeOutput === 'true'; // Include output in response before deletion
      
      const results = [];
      const outputData = {};
      
      // Process each job ID
      for (const jobId of jobIds) {
        const result = {
          jobId,
          success: false,
          error: null,
          status: null,
          deletedAt: null
        };
        
        try {
          // Get job info before deletion
          const job = await jobService.getJob(jobId);
          if (!job) {
            result.error = 'Job not found';
          } else {
            result.status = job.status;
            
            // Include output if requested
            if (includeOutput) {
              try {
                const output = await jobService.getJobOutput(jobId);
                if (output) {
                  outputData[jobId] = {
                    status: output.status,
                    outputCount: output.outputHistory?.length || 0,
                    lastChunk: output.outputHistory?.[output.outputHistory.length - 1] || null,
                    color: output.color
                  };
                }
              } catch (outputError) {
                console.warn(`Failed to get output for job ${jobId}:`, outputError);
              }
            }
            
            if (force) {
              // Force delete regardless of status
              if (job.status === 'running') {
                // First try to terminate, then delete
                try {
                  await jobService.terminateJob(jobId);
                  // Give a moment for termination
                  await new Promise(resolve => setTimeout(resolve, 100));
                } catch (terminateError) {
                  console.warn(`Failed to terminate job ${jobId} before deletion:`, terminateError);
                }
              }
              
              // Force delete by directly calling storage
              await jobService.deleteJob(jobId);
              result.success = true;
              result.deletedAt = Date.now();
            } else {
              // Normal deletion (only non-running jobs)
              await jobService.deleteJob(jobId);
              result.success = true;
              result.deletedAt = Date.now();
            }
          }
        } catch (error) {
          result.error = error.message;
          console.error(`Error deleting job ${jobId}:`, error);
        }
        
        results.push(result);
      }
      
      // Verify deletions (check that jobs are actually gone)
      const verificationResults = {};
      for (const result of results) {
        if (result.success) {
          try {
            const job = await jobService.getJob(result.jobId);
            verificationResults[result.jobId] = job === null;
            if (job !== null) {
              result.success = false;
              result.error = 'Job still exists after deletion attempt';
            }
          } catch (error) {
            verificationResults[result.jobId] = true; // Assume deleted if error getting it
          }
        }
      }
      
      // Calculate summary statistics
      const summary = {
        total: jobIds.length,
        deleted: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        byStatus: {},
        errors: results.filter(r => !r.success).map(r => ({ jobId: r.jobId, error: r.error }))
      };
      
      // Count by original status
      results.forEach(r => {
        if (r.status) {
          summary.byStatus[r.status] = (summary.byStatus[r.status] || 0) + 1;
        }
      });
      
      const response = {
        results,
        summary,
        options: {
          force,
          includeOutput
        },
        completedAt: Date.now()
      };
      
      // Include output data if requested
      if (includeOutput && Object.keys(outputData).length > 0) {
        response.outputData = outputData;
      }
      
      // Include verification results for debugging
      if (Object.keys(verificationResults).length > 0) {
        response.verification = verificationResults;
      }
      
      return c.json(response);
      
    } catch (error) {
      console.error('Error deleting batch:', error);
      return c.json({ error: error.message || 'Internal error' }, 500);
    }
  };
};

export default deleteBatchEndpoint;