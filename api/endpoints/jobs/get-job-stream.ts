// GET /jobs/:id/stream - Get job output stream (for live updates) endpoint

import { getJobService } from '../../services/job-service.js';

/**
 * Get job output stream endpoint handler
 * @param {Object} options - Dependency injection options
 * @returns {Function} Hono handler function
 */
export const getJobStreamEndpoint = (options = {}) => {
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
      
      // Parse query parameters for stream filtering
      const query = c.req.query();
      
      // Parse since parameter for incremental updates
      let since = 0;
      if (query.since) {
        since = parseInt(query.since);
        if (isNaN(since) || since < 0) {
          return c.json({ error: 'Invalid since timestamp' }, 400);
        }
      }
      
      // Parse limit for chunk limiting
      let limit = null;
      if (query.limit) {
        limit = parseInt(query.limit);
        if (isNaN(limit) || limit < 1 || limit > 1000) {
          return c.json({ error: 'Invalid limit (1-1000)' }, 400);
        }
      }
      
      // Filter by output type
      let typeFilter = null;
      if (query.type) {
        const validTypes = ['stdout', 'stderr', 'error', 'system'];
        if (!validTypes.includes(query.type)) {
          return c.json({ 
            error: `Invalid type. Valid values: ${validTypes.join(', ')}` 
          }, 400);
        }
        typeFilter = query.type;
      }
      
      const stream = await jobService.getJobStream(id, since);
      if (!stream) {
        return c.json({ error: 'Job not found' }, 404);
      }
      
      // Apply filters
      let filteredChunks = stream.chunks || [];
      
      // Filter by type
      if (typeFilter) {
        filteredChunks = filteredChunks.filter(chunk => chunk.type === typeFilter);
      }
      
      // Apply limit
      if (limit && filteredChunks.length > limit) {
        // Keep the most recent chunks
        filteredChunks = filteredChunks.slice(-limit);
      }
      
      // Add metadata about the stream
      const metadata = {
        hasNewData: filteredChunks.length > 0,
        oldestChunkTime: filteredChunks.length > 0 ? filteredChunks[0].timestamp : null,
        newestChunkTime: filteredChunks.length > 0 ? filteredChunks[filteredChunks.length - 1].timestamp : null,
        totalChunks: filteredChunks.length
      };
      
      return c.json({
        jobId: stream.jobId,
        chunks: filteredChunks,
        status: stream.status,
        color: stream.color,
        lastUpdate: stream.lastUpdate,
        metadata
      });
      
    } catch (error) {
      console.error('Error getting job stream:', error);
      return c.json({ error: error.message || 'Internal error' }, 500);
    }
  };
};

export default getJobStreamEndpoint;