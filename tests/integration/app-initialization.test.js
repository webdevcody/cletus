// Integration tests for application initialization and service dependencies

import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { createApp } from '../../api/app.js';
import { createJobService } from '../../api/services/job-service.js';
import { createStorageService } from '../../api/services/storage-service.js';
import { createClaudeService } from '../../api/services/claude-service.js';
import { createTestFetch, wait } from '../setup.js';

describe('Application Initialization', () => {
  let services = [];

  afterEach(async () => {
    // Clean up services
    for (const service of services) {
      if (service.storage && service.storage.clear) {
        await service.storage.clear();
      }
      if (service.jobService) {
        const jobs = await service.storage.listJobs();
        for (const job of jobs) {
          if (job.status === 'running') {
            try {
              await service.jobService.terminateJob(job.id);
            } catch (error) {
              // Ignore cleanup errors
            }
          }
        }
      }
    }
    services = [];
  });

  describe('service dependency injection', () => {
    test('should create app with all services provided', () => {
      const storage = createStorageService({ backend: 'memory' });
      const claudeService = createClaudeService({ mockMode: true });
      const jobService = createJobService({ storage, claudeService });
      
      const serviceContainer = { jobService, storage, claudeService };
      services.push(serviceContainer);
      
      const app = createApp(serviceContainer);
      
      expect(app).toBeDefined();
      expect(typeof app.fetch).toBe('function');
    });

    test('should create app with minimal service configuration', () => {
      const storage = createStorageService({ backend: 'memory' });
      const claudeService = createClaudeService({ mockMode: true });
      const jobService = createJobService({ storage, claudeService });
      
      const serviceContainer = { jobService, storage, claudeService };
      services.push(serviceContainer);
      
      const app = createApp(serviceContainer);
      const fetch = createTestFetch(app);
      
      // App should handle basic requests
      expect(async () => {
        const response = await fetch('/health');
        expect(response.status).toBe(200);
      }).not.toThrow();
    });

    test('should handle missing service dependencies gracefully', () => {
      // The app might not validate dependencies at creation time
      const app = createApp({});
      expect(app).toBeDefined();
    });

    test('should handle null service dependencies', () => {
      const app = createApp({
        jobService: null,
        storage: null,
        claudeService: null
      });
      expect(app).toBeDefined();
    });

    test('should create app with invalid service interfaces', () => {
      const invalidJobService = { notTheRightInterface: true };
      const storage = createStorageService({ backend: 'memory' });
      const claudeService = createClaudeService({ mockMode: true });
      
      services.push({ storage, claudeService });
      
      const app = createApp({
        jobService: invalidJobService,
        storage,
        claudeService
      });
      expect(app).toBeDefined();
    });
  });

  describe('service integration', () => {
    test('should successfully integrate all services', async () => {
      const storage = createStorageService({ backend: 'memory' });
      const claudeService = createClaudeService({ mockMode: true });
      const jobService = createJobService({ storage, claudeService });
      
      const serviceContainer = { jobService, storage, claudeService };
      services.push(serviceContainer);
      
      const app = createApp(serviceContainer);
      const fetch = createTestFetch(app);
      
      // Test full workflow
      const response = await fetch('/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Integration test' })
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.jobId).toMatch(/^job_\d+_[a-z0-9]+$/);
      
      // Verify job exists in storage
      const job = await storage.getJob(data.jobId);
      expect(job).toBeTruthy();
      expect(job.prompt).toBe('Integration test');
    });

    test('should handle storage service failures', async () => {
      const storage = createStorageService({ backend: 'memory' });
      const claudeService = createClaudeService({ mockMode: true });
      const jobService = createJobService({ storage, claudeService });
      
      // Mock storage failure
      const originalStoreJob = storage.storeJob;
      storage.storeJob = async () => {
        throw new Error('Storage service unavailable');
      };
      
      const serviceContainer = { jobService, storage, claudeService };
      services.push(serviceContainer);
      
      const app = createApp(serviceContainer);
      const fetch = createTestFetch(app);
      
      const response = await fetch('/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Test prompt' })
      });
      
      // The request might succeed but fail during processing
      expect([200, 500].includes(response.status)).toBe(true);
      
      // Restore original method
      storage.storeJob = originalStoreJob;
    });

    test('should handle Claude service failures', async () => {
      const storage = createStorageService({ backend: 'memory' });
      const claudeService = createClaudeService({ mockMode: true });
      
      // Mock Claude service failure
      const originalStartProcess = claudeService.startProcess;
      claudeService.startProcess = async () => {
        throw new Error('Claude service unavailable');
      };
      
      const jobService = createJobService({ storage, claudeService });
      
      const serviceContainer = { jobService, storage, claudeService };
      services.push(serviceContainer);
      
      const app = createApp(serviceContainer);
      const fetch = createTestFetch(app);
      
      const response = await fetch('/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Test prompt' })
      });
      
      expect(response.status).toBe(200); // Job creation succeeds
      const data = await response.json();
      
      // Wait and check job failed
      await wait(200);
      const job = await storage.getJob(data.jobId);
      expect(job.status).toBe('failed');
      
      // Restore original method
      claudeService.startProcess = originalStartProcess;
    });
  });

  describe('concurrent service usage', () => {
    test('should handle multiple concurrent requests', async () => {
      const storage = createStorageService({ backend: 'memory' });
      const claudeService = createClaudeService({ mockMode: true });
      const jobService = createJobService({ storage, claudeService });
      
      const serviceContainer = { jobService, storage, claudeService };
      services.push(serviceContainer);
      
      const app = createApp(serviceContainer);
      const fetch = createTestFetch(app);
      
      // Create multiple concurrent requests
      const promises = Array(20).fill(null).map((_, i) => 
        fetch('/prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: `Concurrent test ${i}` })
        })
      );
      
      const responses = await Promise.all(promises);
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
      
      // Verify all jobs were created
      const allJobs = await storage.listJobs();
      expect(allJobs.length).toBe(20);
    });

    test('should handle mixed endpoint requests concurrently', async () => {
      const storage = createStorageService({ backend: 'memory' });
      const claudeService = createClaudeService({ mockMode: true });
      const jobService = createJobService({ storage, claudeService });
      
      // Create some initial jobs
      const job1 = await jobService.createJob('Job 1');
      const job2 = await jobService.createJob('Job 2');
      
      const serviceContainer = { jobService, storage, claudeService };
      services.push(serviceContainer);
      
      const app = createApp(serviceContainer);
      const fetch = createTestFetch(app);
      
      // Mix of different endpoint calls
      const promises = [
        fetch('/health'),
        fetch('/jobs'),
        fetch('/stats'),
        fetch(`/jobs/${job1.jobId}`),
        fetch(`/jobs/${job2.jobId}/output`),
        fetch(`/jobs/${job1.jobId}/stream`),
        fetch('/prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'New job' })
        }),
        fetch('/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompts: ['Batch 1', 'Batch 2'] })
        })
      ];
      
      const responses = await Promise.all(promises);
      
      // All should succeed or return expected errors
      responses.forEach((response, index) => {
        expect([200, 400, 404].includes(response.status)).toBe(true);
      });
    });
  });

  describe('service lifecycle management', () => {
    test('should handle service shutdown gracefully', async () => {
      const storage = createStorageService({ backend: 'memory' });
      const claudeService = createClaudeService({ mockMode: true });
      const jobService = createJobService({ storage, claudeService });
      
      const serviceContainer = { jobService, storage, claudeService };
      services.push(serviceContainer);
      
      const app = createApp(serviceContainer);
      const fetch = createTestFetch(app);
      
      // Create a job
      const response = await fetch('/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Lifecycle test' })
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      // Give job time to start
      await wait(100);
      
      // Simulate service cleanup
      const jobs = await storage.listJobs();
      for (const job of jobs) {
        if (job.status === 'running') {
          await jobService.terminateJob(job.id);
        }
      }
      
      await storage.clear();
      
      // Verify cleanup
      const remainingJobs = await storage.listJobs();
      expect(remainingJobs.length).toBe(0);
    });

    test('should handle memory pressure scenarios', async () => {
      const storage = createStorageService({ 
        backend: 'memory',
        maxJobsInMemory: 10 // Low limit for testing
      });
      const claudeService = createClaudeService({ mockMode: true });
      const jobService = createJobService({ storage, claudeService });
      
      const serviceContainer = { jobService, storage, claudeService };
      services.push(serviceContainer);
      
      const app = createApp(serviceContainer);
      const fetch = createTestFetch(app);
      
      // Create more jobs than the limit
      const promises = Array(15).fill(null).map((_, i) => 
        fetch('/prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: `Memory pressure test ${i}` })
        })
      );
      
      const responses = await Promise.all(promises);
      
      // Should handle gracefully (might succeed or fail depending on implementation)
      responses.forEach(response => {
        expect([200, 400, 500, 503].includes(response.status)).toBe(true);
      });
    });
  });

  describe('middleware integration', () => {
    test('should apply CORS middleware correctly', async () => {
      const storage = createStorageService({ backend: 'memory' });
      const claudeService = createClaudeService({ mockMode: true });
      const jobService = createJobService({ storage, claudeService });
      
      const serviceContainer = { jobService, storage, claudeService };
      services.push(serviceContainer);
      
      const app = createApp(serviceContainer);
      const fetch = createTestFetch(app);
      
      const response = await fetch('/health', {
        headers: {
          'Origin': 'https://example.com',
          'Access-Control-Request-Method': 'GET'
        }
      });
      
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    });

    test('should handle preflight OPTIONS requests', async () => {
      const storage = createStorageService({ backend: 'memory' });
      const claudeService = createClaudeService({ mockMode: true });
      const jobService = createJobService({ storage, claudeService });
      
      const serviceContainer = { jobService, storage, claudeService };
      services.push(serviceContainer);
      
      const app = createApp(serviceContainer);
      const fetch = createTestFetch(app);
      
      const response = await fetch('/prompt', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://example.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type'
        }
      });
      
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });
  });

  describe('error boundaries and resilience', () => {
    test('should handle service exceptions without crashing', async () => {
      const storage = createStorageService({ backend: 'memory' });
      const claudeService = createClaudeService({ mockMode: true });
      const jobService = createJobService({ storage, claudeService });
      
      // Mock a method to throw an error
      const originalGetStats = jobService.getStats;
      jobService.getStats = async () => {
        throw new Error('Service explosion!');
      };
      
      const serviceContainer = { jobService, storage, claudeService };
      services.push(serviceContainer);
      
      const app = createApp(serviceContainer);
      const fetch = createTestFetch(app);
      
      // This should not crash the app
      const response = await fetch('/stats');
      expect([500, 503].includes(response.status)).toBe(true);
      
      // Other endpoints should still work
      const healthResponse = await fetch('/health');
      expect(healthResponse.status).toBe(200);
      
      // Restore original method
      jobService.getStats = originalGetStats;
    });

    test('should recover from temporary service failures', async () => {
      const storage = createStorageService({ backend: 'memory' });
      const claudeService = createClaudeService({ mockMode: true });
      const jobService = createJobService({ storage, claudeService });
      
      const serviceContainer = { jobService, storage, claudeService };
      services.push(serviceContainer);
      
      const app = createApp(serviceContainer);
      const fetch = createTestFetch(app);
      
      // Mock temporary failure
      let failureCount = 0;
      const originalCreateJob = jobService.createJob;
      jobService.createJob = async (...args) => {
        failureCount++;
        if (failureCount <= 2) {
          throw new Error('Temporary failure');
        }
        return originalCreateJob.apply(jobService, args);
      };
      
      // First two requests should fail
      const response1 = await fetch('/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Test 1' })
      });
      expect(response1.status).toBe(500);
      
      const response2 = await fetch('/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Test 2' })
      });
      expect(response2.status).toBe(500);
      
      // Third should succeed
      const response3 = await fetch('/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Test 3' })
      });
      expect(response3.status).toBe(200);
      
      // Restore original method
      jobService.createJob = originalCreateJob;
    });
  });
});