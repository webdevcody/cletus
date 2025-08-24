// GET /jobs/:id - Get specific job details endpoint

import { getJobService } from '../../services/job-service.js';

/**
 * Get job details endpoint handler
 * @param {Object} options - Dependency injection options
 * @returns {Function} Hono handler function
 */
export const getJobEndpoint = (options = {}) => {
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
      
      const job = await jobService.getJob(id);
      if (!job) {
        return c.json({ error: 'Job not found' }, 404);
      }
      
      return c.json({ job });
      
    } catch (error) {
      console.error('Error getting job:', error);
      return c.json({ error: error.message || 'Internal error' }, 500);
    }
  };
};

export default getJobEndpoint;