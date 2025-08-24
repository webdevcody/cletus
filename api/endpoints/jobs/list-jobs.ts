// GET /jobs - List all jobs endpoint

import { getJobService } from '../../services/job-service.js';

/**
 * List jobs endpoint handler
 * @param {Object} options - Dependency injection options
 * @returns {Function} Hono handler function
 */
export const listJobsEndpoint = (options = {}) => {
  const jobService = options.jobService || getJobService();

  return async (c) => {
    try {
      const query = c.req.query();
      const filter = {};
      
      // Parse and validate query parameters
      if (query.status) {
        const validStatuses = ['pending', 'running', 'completed', 'failed', 'terminated'];
        if (!validStatuses.includes(query.status)) {
          return c.json({ 
            error: `Invalid status. Valid values: ${validStatuses.join(', ')}` 
          }, 400);
        }
        filter.status = query.status;
      }
      
      if (query.since) {
        const since = parseInt(query.since);
        if (isNaN(since) || since < 0) {
          return c.json({ error: 'Invalid since timestamp' }, 400);
        }
        filter.since = since;
      }
      
      if (query.before) {
        const before = parseInt(query.before);
        if (isNaN(before) || before < 0) {
          return c.json({ error: 'Invalid before timestamp' }, 400);
        }
        filter.before = before;
      }
      
      // Parse limit and offset for pagination
      let limit = 50; // default limit
      let offset = 0; // default offset
      
      if (query.limit) {
        limit = parseInt(query.limit);
        if (isNaN(limit) || limit < 1 || limit > 200) {
          return c.json({ error: 'Invalid limit (1-200)' }, 400);
        }
      }
      
      if (query.offset) {
        offset = parseInt(query.offset);
        if (isNaN(offset) || offset < 0) {
          return c.json({ error: 'Invalid offset' }, 400);
        }
      }
      
      const jobs = await jobService.listJobs(filter);
      
      // Apply pagination
      const total = jobs.length;
      const paginatedJobs = jobs.slice(offset, offset + limit);
      
      return c.json({ 
        jobs: paginatedJobs,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      });
      
    } catch (error) {
      console.error('Error listing jobs:', error);
      return c.json({ error: error.message || 'Internal error' }, 500);
    }
  };
};

export default listJobsEndpoint;