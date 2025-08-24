// Main Hono application with routes and middleware

import { Hono } from 'hono';
import getConfig from './config/index.js';
import { defaultCorsMiddleware } from './middleware/cors.js';

// Import endpoint handlers
import {
  createJobEndpoint,
  getJobEndpoint,
  listJobsEndpoint,
  terminateJobEndpoint,
  deleteJobEndpoint,
  getJobOutputEndpoint,
  getJobStreamEndpoint,
  createBatchEndpoint,
  getBatchStatusEndpoint,
  terminateBatchEndpoint,
  deleteBatchEndpoint,
  getBatchLimitsEndpoint,
  getStatsEndpoint,
  cleanupEndpoint,
  healthCheckEndpoint,
  statusEndpoint
} from './endpoints/index.js';

/**
 * Create the main Hono application
 * @param {Object} options - App options for dependency injection
 * @returns {Object} Configured Hono app
 */
export const createApp = (options = {}) => {
  const config = getConfig();
  const app = new Hono();
  
  // Apply CORS middleware globally
  app.use('*', defaultCorsMiddleware);
  
  // Health and status endpoints
  app.get('/', statusEndpoint(options));
  app.get('/health', healthCheckEndpoint(options));
  
  // Job management routes
  app.post('/prompt', createJobEndpoint(options));
  // Handle unsupported methods for /prompt
  app.get('/prompt', (c) => c.json({ error: 'Method not allowed. Use POST.' }, 405));
  app.put('/prompt', (c) => c.json({ error: 'Method not allowed. Use POST.' }, 405));
  app.patch('/prompt', (c) => c.json({ error: 'Method not allowed. Use POST.' }, 405));
  app.delete('/prompt', (c) => c.json({ error: 'Method not allowed. Use POST.' }, 405));
  app.options('/prompt', (c) => c.text('', 204)); // CORS preflight
  // Handle other HTTP methods not supported by Hono by default
  app.all('/prompt', (c) => {
    const method = c.req.method;
    if (!['POST', 'OPTIONS'].includes(method)) {
      return c.json({ error: `Method ${method} not allowed. Use POST.` }, 405);
    }
  });
  
  app.get('/jobs', listJobsEndpoint(options));
  // Handle unsupported methods for /jobs
  app.post('/jobs', (c) => c.json({ error: 'Method not allowed. Use GET to list jobs or POST to /prompt to create.' }, 405));
  
  app.get('/jobs/:id', getJobEndpoint(options));
  app.get('/jobs/:id/output', getJobOutputEndpoint(options));
  app.get('/jobs/:id/stream', getJobStreamEndpoint(options));
  app.post('/jobs/:id/terminate', terminateJobEndpoint(options));
  app.delete('/jobs/:id', deleteJobEndpoint(options));
  
  // Batch processing routes
  app.post('/batch', createBatchEndpoint(options));
  app.get('/batch/:jobIds/status', getBatchStatusEndpoint(options));
  app.post('/batch/:jobIds/terminate', terminateBatchEndpoint(options));
  app.delete('/batch/:jobIds', deleteBatchEndpoint(options));
  app.get('/batch/limits', getBatchLimitsEndpoint(options));
  
  // System/administrative routes
  app.get('/stats', getStatsEndpoint(options));
  app.post('/cleanup', cleanupEndpoint(options));
  
  // Configuration endpoint (for debugging)
  if (!config.isProduction) {
    app.get('/config', (c) => {
      // Return safe config info (no secrets)
      const safeConfig = {
        port: config.port,
        env: config.env,
        claude: {
          mockMode: config.claude.mockMode,
          defaultModel: config.claude.defaultModel,
          outputFormat: config.claude.outputFormat,
        },
        storage: {
          backend: config.storage.backend,
          maxJobsInMemory: config.storage.maxJobsInMemory,
          maxOutputChunks: config.storage.maxOutputChunks,
        },
        jobs: {
          maxBatchSize: config.jobs.maxBatchSize,
          defaultTimeout: config.jobs.defaultTimeout,
        }
      };
      return c.json(safeConfig);
    });
  }
  
  // Error handler
  app.onError((error, c) => {
    console.error('Unhandled error:', error);
    return c.json({ 
      error: 'Internal server error',
      message: config.isDevelopment ? error.message : 'An error occurred',
      timestamp: new Date().toISOString()
    }, 500);
  });
  
  // 404 handler
  app.notFound((c) => {
    return c.json({ 
      error: 'Endpoint not found',
      path: c.req.path,
      method: c.req.method,
      timestamp: new Date().toISOString()
    }, 404);
  });
  
  return app;
};

// Create default app instance
let appInstance = null;

export const getApp = () => {
  if (!appInstance) {
    appInstance = createApp();
  }
  return appInstance;
};

// For testing - allow app reset
export const resetApp = () => {
  appInstance = null;
};

export default getApp;