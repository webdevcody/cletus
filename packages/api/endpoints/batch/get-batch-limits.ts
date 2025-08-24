// GET /batch/limits - Get batch processing limits and configuration endpoint

import getConfig from '../../config/index.js';

/**
 * Get batch limits endpoint handler
 * @param {Object} options - Dependency injection options
 * @returns {Function} Hono handler function
 */
export const getBatchLimitsEndpoint = (options = {}) => {
  const config = getConfig();

  return async (c) => {
    try {
      // Parse query parameters for additional info
      const query = c.req.query();
      const includeAdvanced = query.advanced === 'true';
      const includeRuntime = query.runtime === 'true';
      
      // Basic limits
      const limits = {
        maxBatchSize: config.jobs.maxBatchSize,
        maxPromptLength: 50000, // 50KB per prompt
        maxJobsInMemory: config.storage.maxJobsInMemory,
        maxOutputChunks: config.storage.maxOutputChunks
      };
      
      // Timing limits
      const timing = {
        defaultTimeout: config.jobs.defaultTimeout,
        retentionPeriod: config.jobs.retentionPeriod,
        cleanupInterval: config.jobs.cleanupInterval
      };
      
      // Storage configuration
      const storage = {
        backend: config.storage.backend,
        persistenceEnabled: config.storage.backend !== 'memory'
      };
      
      // Claude configuration (public info only)
      const claude = {
        mockMode: config.claude.mockMode,
        defaultModel: config.claude.defaultModel,
        outputFormat: config.claude.outputFormat
      };
      
      const response = {
        // Flatten the key properties that tests expect
        maxBatchSize: limits.maxBatchSize,
        maxJobsInMemory: limits.maxJobsInMemory,
        defaultTimeout: timing.defaultTimeout,
        retentionPeriod: timing.retentionPeriod,
        // Keep nested structure for backward compatibility
        limits,
        timing,
        storage,
        claude,
        serverTime: Date.now(),
        environment: config.env
      };
      
      // Include advanced configuration if requested
      if (includeAdvanced) {
        response.advanced = {
          logging: {
            level: config.logging.level,
            colorize: config.logging.colorize
          },
          features: {
            batchPriority: true,
            concurrencyControl: true,
            outputFiltering: true,
            streamingSupport: true
          },
          validation: {
            strictJobIdFormat: true,
            promptLengthCheck: true,
            optionTypeValidation: true
          }
        };
      }
      
      // Include runtime information if requested
      if (includeRuntime) {
        // Get current job statistics (mock some data since we don't have direct access)
        response.runtime = {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          platform: process.platform,
          nodeVersion: process.version,
          pid: process.pid,
          estimatedCurrentJobs: 0, // Would need to query job service
          serverCapacity: {
            used: 0, // Would calculate from current jobs
            total: config.storage.maxJobsInMemory,
            available: config.storage.maxJobsInMemory
          }
        };
        
        // Add performance metrics if available
        if (typeof performance !== 'undefined' && performance.now) {
          response.runtime.performanceNow = performance.now();
        }
      }
      
      // Add helpful information for API consumers
      response.usage = {
        batchCreation: 'POST /batch with prompts array',
        statusCheck: 'GET /batch/{jobIds}/status',
        termination: 'POST /batch/{jobIds}/terminate',
        deletion: 'DELETE /batch/{jobIds}',
        limits: 'GET /batch/limits (this endpoint)'
      };
      
      response.tips = [
        'Use comma-separated job IDs for batch operations',
        'Set includeOutput=true for status checks to get output previews',
        'Use force=true for termination/deletion to override status checks',
        'Batch operations are limited to maxBatchSize items',
        'Consider pagination for large result sets'
      ];
      
      return c.json(response);
      
    } catch (error) {
      console.error('Error getting batch limits:', error);
      return c.json({ error: error.message || 'Internal error' }, 500);
    }
  };
};

export default getBatchLimitsEndpoint;