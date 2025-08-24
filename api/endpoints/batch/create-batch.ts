// POST /batch - Process multiple prompts as separate jobs endpoint

import getConfig from '../../config/index.js';
import { getJobService } from '../../services/job-service.js';

/**
 * Create batch jobs endpoint handler
 * @param {Object} options - Dependency injection options
 * @returns {Function} Hono handler function
 */
export const createBatchEndpoint = (options = {}) => {
  const config = getConfig();
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

      const { prompts, options: batchOptions = {} } = body;
      
      // Validate input
      if (!Array.isArray(prompts) || prompts.length === 0) {
        return c.json({ error: 'Missing or invalid prompts array' }, 400);
      }
      
      if (prompts.length > config.jobs.maxBatchSize) {
        return c.json({ 
          error: `Maximum ${config.jobs.maxBatchSize} prompts allowed per batch` 
        }, 400);
      }
      
      // Validate all prompts are strings and not empty
      for (let i = 0; i < prompts.length; i++) {
        if (typeof prompts[i] !== 'string') {
          return c.json({ 
            error: `Prompt at index ${i} must be a string` 
          }, 400);
        }
        
        if (prompts[i].trim().length === 0) {
          return c.json({ 
            error: `Prompt at index ${i} cannot be empty` 
          }, 400);
        }
        
        // Check prompt length
        if (prompts[i].length > 50000) { // 50KB limit per prompt
          return c.json({ 
            error: `Prompt at index ${i} too long (max 50KB)` 
          }, 400);
        }
      }
      
      // Validate batch options if provided
      if (batchOptions && typeof batchOptions !== 'object') {
        return c.json({ error: 'Options must be an object' }, 400);
      }
      
      // Validate specific batch option types (same as individual jobs)
      if (batchOptions.model && typeof batchOptions.model !== 'string') {
        return c.json({ error: 'Model must be a string' }, 400);
      }
      
      if (batchOptions.allowedTools && !Array.isArray(batchOptions.allowedTools)) {
        return c.json({ error: 'allowedTools must be an array' }, 400);
      }
      
      if (batchOptions.disallowedTools && !Array.isArray(batchOptions.disallowedTools)) {
        return c.json({ error: 'disallowedTools must be an array' }, 400);
      }
      
      if (batchOptions.addDirs && !Array.isArray(batchOptions.addDirs)) {
        return c.json({ error: 'addDirs must be an array' }, 400);
      }
      
      // Additional batch-specific validations
      if (batchOptions.priority && !['low', 'normal', 'high'].includes(batchOptions.priority)) {
        return c.json({ error: 'Priority must be low, normal, or high' }, 400);
      }
      
      if (batchOptions.maxConcurrency && 
          (typeof batchOptions.maxConcurrency !== 'number' || 
           batchOptions.maxConcurrency < 1 || 
           batchOptions.maxConcurrency > 10)) {
        return c.json({ error: 'maxConcurrency must be a number between 1 and 10' }, 400);
      }
      
      // Create batch
      const result = await jobService.createBatch(prompts, batchOptions);
      
      // Add batch metadata
      return c.json({
        ...result,
        batchId: `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        options: batchOptions,
        createdAt: Date.now()
      });
      
    } catch (error) {
      console.error('Error creating batch:', error);
      
      // Handle specific errors
      if (error.message.includes('Maximum job limit reached')) {
        return c.json({ error: 'Server at capacity, please try again later' }, 503);
      }
      
      if (error.message.includes('Too many concurrent batches')) {
        return c.json({ error: 'Too many concurrent batches, please try again later' }, 429);
      }
      
      return c.json({ error: error.message || 'Internal error' }, 500);
    }
  };
};

export default createBatchEndpoint;