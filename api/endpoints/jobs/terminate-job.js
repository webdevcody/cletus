// POST /jobs/:id/terminate - Terminate/kill running job endpoint

import { getJobService } from '../../services/job-service.js';

/**
 * Terminate job endpoint handler
 * @param {Object} options - Dependency injection options
 * @returns {Function} Hono handler function
 */
export const terminateJobEndpoint = (options = {}) => {
  const jobService = options.jobService || getJobService();

  return async (c) => {
    try {
      const id = c.req.param('id');
      if (!id) {
        return c.json({ error: 'Job ID is required' }, 400);
      }
      
      // Validate job ID format
      if (typeof id !== 'string' || id.length === 0) {
        return c.json({ error: 'Invalid job ID format' }, 400);
      }
      
      const result = await jobService.terminateJob(id);
      return c.json(result);
      
    } catch (error) {
      console.error('Error terminating job:', error);
      
      // Handle specific error cases
      if (error.message === 'Job not found') {
        return c.json({ error: 'Job not found' }, 404);
      }
      
      if (error.message === 'Job is not running') {
        return c.json({ error: 'Job is not running' }, 400);
      }
      
      if (error.message === 'No active process to terminate') {
        return c.json({ error: 'No active process to terminate' }, 400);
      }
      
      if (error.message === 'Failed to terminate process') {
        return c.json({ error: 'Failed to terminate process' }, 500);
      }
      
      return c.json({ error: error.message || 'Internal error' }, 500);
    }
  };
};

export default terminateJobEndpoint;