// POST /prompt - Create a single job endpoint

import { getJobService } from '../../services/job-service.js';

/**
 * Create job endpoint handler
 * @param {Object} options - Dependency injection options
 * @returns {Function} Hono handler function
 */
export const createJobEndpoint = (options = {}) => {
  const jobService = options.jobService || getJobService();

  return async (c) => {
    try {
      // Handle JSON parsing errors
      let body;
      try {
        body = await c.req.json();
      } catch (jsonError) {
        return c.json({ error: 'Invalid JSON in request body' }, 400);
      }

      // Handle null or non-object body
      if (!body || typeof body !== 'object') {
        return c.json({ error: 'Request body must be a JSON object' }, 400);
      }

      const { prompt, jobId, options: jobOptions = {} } = body;
      
      // Validate input
      if (!prompt || typeof prompt !== 'string') {
        return c.json({ error: 'Missing or invalid prompt' }, 400);
      }
      
      if (jobId && typeof jobId !== 'string') {
        return c.json({ error: 'jobId must be a string' }, 400);
      }
      
      // Additional prompt validation
      if (prompt.trim().length === 0) {
        return c.json({ error: 'Prompt cannot be empty' }, 400);
      }
      
      if (prompt.length > 50000) { // 50KB limit
        return c.json({ error: 'Prompt too long (max 50KB)' }, 400);
      }
      
      // Validate job options if provided
      if (jobOptions && typeof jobOptions !== 'object') {
        return c.json({ error: 'Options must be an object' }, 400);
      }
      
      // Validate specific option types
      if (jobOptions.model && typeof jobOptions.model !== 'string') {
        return c.json({ error: 'Model must be a string' }, 400);
      }
      
      if (jobOptions.allowedTools && !Array.isArray(jobOptions.allowedTools)) {
        return c.json({ error: 'allowedTools must be an array' }, 400);
      }
      
      if (jobOptions.disallowedTools && !Array.isArray(jobOptions.disallowedTools)) {
        return c.json({ error: 'disallowedTools must be an array' }, 400);
      }
      
      if (jobOptions.addDirs && !Array.isArray(jobOptions.addDirs)) {
        return c.json({ error: 'addDirs must be an array' }, 400);
      }
      
      // Create job
      const result = await jobService.createJob(prompt, jobOptions, jobId);
      return c.json(result);
      
    } catch (error) {
      console.error('Error creating job:', error);
      
      // Handle specific errors
      if (error.message.includes('Maximum job limit reached')) {
        return c.json({ error: 'Server at capacity, please try again later' }, 503);
      }
      
      return c.json({ error: error.message || 'Internal error' }, 500);
    }
  };
};

export default createJobEndpoint;