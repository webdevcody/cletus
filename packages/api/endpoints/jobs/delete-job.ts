// DELETE /jobs/:id - Dismiss/delete completed job endpoint

import { getJobService } from '../../services/job-service.js';

/**
 * Delete job endpoint handler
 * @param {Object} options - Dependency injection options
 * @returns {Function} Hono handler function
 */
export const deleteJobEndpoint = (options = {}) => {
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
      
      const result = await jobService.deleteJob(id);
      return c.json(result);
      
    } catch (error) {
      console.error('Error deleting job:', error);
      
      // Handle specific error cases
      if (error.message === 'Job not found') {
        return c.json({ error: 'Job not found' }, 404);
      }
      
      if (error.message === 'Cannot delete running job') {
        return c.json({ error: 'Cannot dismiss running job' }, 400);
      }
      
      return c.json({ error: error.message || 'Internal error' }, 500);
    }
  };
};

export default deleteJobEndpoint;