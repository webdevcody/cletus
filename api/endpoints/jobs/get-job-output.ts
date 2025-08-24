// GET /jobs/:id/output - Get job output history endpoint

import { getJobService } from '../../services/job-service.js';

/**
 * Get job output history endpoint handler
 * @param {Object} options - Dependency injection options
 * @returns {Function} Hono handler function
 */
export const getJobOutputEndpoint = (options = {}) => {
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
      
      // Parse query parameters for output filtering
      const query = c.req.query();
      const options = {};
      
      // Filter by output type (stdout, stderr, error, system)
      if (query.type) {
        const validTypes = ['stdout', 'stderr', 'error', 'system'];
        if (!validTypes.includes(query.type)) {
          return c.json({ 
            error: `Invalid type. Valid values: ${validTypes.join(', ')}` 
          }, 400);
        }
        options.type = query.type;
      }
      
      // Limit number of chunks returned
      if (query.limit) {
        const limit = parseInt(query.limit);
        if (isNaN(limit) || limit < 1 || limit > 1000) {
          return c.json({ error: 'Invalid limit (1-1000)' }, 400);
        }
        options.limit = limit;
      }
      
      // Skip chunks (for pagination)
      if (query.offset) {
        const offset = parseInt(query.offset);
        if (isNaN(offset) || offset < 0) {
          return c.json({ error: 'Invalid offset' }, 400);
        }
        options.offset = offset;
      }
      
      const output = await jobService.getJobOutput(id);
      if (!output) {
        return c.json({ error: 'Job not found' }, 404);
      }
      
      // Apply filters
      let filteredHistory = output.outputHistory || [];
      
      // Filter by type
      if (options.type) {
        filteredHistory = filteredHistory.filter(chunk => chunk.type === options.type);
      }
      
      // Apply pagination
      const total = filteredHistory.length;
      const offset = options.offset || 0;
      const limit = options.limit || total;
      
      filteredHistory = filteredHistory.slice(offset, offset + limit);
      
      return c.json({
        jobId: output.jobId,
        outputHistory: filteredHistory,
        status: output.status,
        color: output.color,
        pagination: {
          total,
          offset,
          limit,
          hasMore: offset + limit < total
        }
      });
      
    } catch (error) {
      console.error('Error getting job output:', error);
      return c.json({ error: error.message || 'Internal error' }, 500);
    }
  };
};

export default getJobOutputEndpoint;