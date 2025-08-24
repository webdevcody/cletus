// Test setup and utilities for Cletus API tests

import { beforeEach, afterEach } from 'bun:test';
import { createApp } from '../api/app.js';
import { createJobService } from '../api/services/job-service.js';
import { createStorageService } from '../api/services/storage-service.js';
import { createClaudeService } from '../api/services/claude-service.js';

// Test configuration override
const testConfig = {
  port: 3338,
  env: 'test',
  isTest: true,
  isDevelopment: false,
  isProduction: false,
  claude: {
    mockMode: true,
    defaultModel: 'claude-sonnet-4-20250514',
    outputFormat: 'stream-json',
    headlessMode: true,
    dangerouslySkipPermissions: true,
    verbose: false,
  },
  storage: {
    backend: 'memory',
    maxJobsInMemory: 100,
    maxOutputChunks: 100,
  },
  jobs: {
    maxBatchSize: 10,
    defaultTimeout: 5000, // 5 seconds for tests
    retentionPeriod: 60000, // 1 minute
  },
  logging: {
    level: 'error', // Reduce noise in tests
    colorize: false,
  },
  test: {
    mockResponseDelay: 10, // Fast responses for tests
  }
};

/**
 * Create a test app instance with mocked services
 * @param {Object} overrides - Service overrides for testing
 * @returns {Object} Test app and services
 */
export const createTestApp = (overrides = {}) => {
  // Create mock services
  const storage = overrides.storage || createStorageService({ backend: 'memory' });
  const claudeService = overrides.claudeService || createClaudeService({ mockMode: true });
  const jobService = overrides.jobService || createJobService({ storage, claudeService });
  
  // Create app with injected dependencies (endpoints now get services via options)
  const app = createApp({ 
    jobService,
    storage,
    claudeService
  });
  
  return {
    app,
    services: {
      storage,
      claudeService,
      jobService
    }
  };
};

/**
 * Mock fetch function for testing HTTP requests
 * @param {Object} app - Hono app instance
 * @returns {Function} Fetch function
 */
export const createTestFetch = (app) => {
  return async (path, options = {}) => {
    const url = path.startsWith('http') ? new URL(path) : new URL(`http://localhost${path}`);
    const method = options.method || 'GET';
    const headers = new Headers(options.headers || {});
    const body = options.body;
    
    // Create a Request object
    const request = new Request(url.toString(), {
      method,
      headers,
      body
    });
    
    return app.fetch(request);
  };
};

/**
 * Wait for a specified amount of time
 * @param {number} ms - Milliseconds to wait
 */
export const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Wait for a job to reach a specific status
 * @param {Object} jobService - Job service instance
 * @param {string} jobId - Job ID
 * @param {string|Array} status - Expected status or array of statuses
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Object>} Job object
 */
export const waitForJobStatus = async (jobService, jobId, status, timeout = 5000) => {
  const startTime = Date.now();
  const statuses = Array.isArray(status) ? status : [status];
  
  while (Date.now() - startTime < timeout) {
    const job = await jobService.getJob(jobId);
    if (job && statuses.includes(job.status)) {
      return job;
    }
    await wait(10); // Check every 10ms
  }
  
  throw new Error(`Job ${jobId} did not reach status ${status} within ${timeout}ms`);
};

/**
 * Create a test job with default properties
 * @param {Object} overrides - Job property overrides
 * @returns {Object} Job object
 */
export const createTestJob = (overrides = {}) => {
  return {
    prompt: 'Test prompt for job',
    options: {},
    ...overrides
  };
};

/**
 * Create multiple test jobs
 * @param {number} count - Number of jobs to create
 * @param {Object} overrides - Job property overrides
 * @returns {Array} Array of job objects
 */
export const createTestJobs = (count, overrides = {}) => {
  return Array(count).fill(null).map((_, index) => ({
    prompt: `Test prompt ${index + 1}`,
    options: {},
    ...overrides
  }));
};

/**
 * Assert that an HTTP response is successful
 * @param {Response} response - HTTP response
 * @param {number} expectedStatus - Expected status code
 */
export const assertResponseSuccess = async (response, expectedStatus = 200) => {
  if (response.status !== expectedStatus) {
    const text = await response.text();
    throw new Error(`Expected status ${expectedStatus}, got ${response.status}: ${text}`);
  }
};

/**
 * Assert that an HTTP response is an error
 * @param {Response} response - HTTP response
 * @param {number} expectedStatus - Expected error status code
 */
export const assertResponseError = async (response, expectedStatus = 400) => {
  if (response.status !== expectedStatus) {
    const text = await response.text();
    throw new Error(`Expected error status ${expectedStatus}, got ${response.status}: ${text}`);
  }
};

/**
 * Extract JSON from response and validate structure
 * @param {Response} response - HTTP response
 * @returns {Object} Parsed JSON
 */
export const getResponseJson = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON response: ${text}`);
  }
};

// Override environment for tests
if (typeof process !== 'undefined' && process.env) {
  process.env.NODE_ENV = 'test';
  process.env.CLAUDE_MOCK_MODE = 'true';
  process.env.LOG_LEVEL = 'error';
  process.env.MOCK_RESPONSE_DELAY = '10';
}

export { testConfig };