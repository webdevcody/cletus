// Integration tests for job endpoints

import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { 
  createTestApp, 
  createTestFetch, 
  wait, 
  waitForJobStatus,
  assertResponseSuccess,
  assertResponseError,
  getResponseJson
} from '../setup.js';
import { testPrompts, testJobConfigs, expectedOutputs } from './fixtures/mock-responses.js';

describe('Job Endpoints', () => {
  let app, fetch, services;

  beforeEach(() => {
    const testSetup = createTestApp();
    app = testSetup.app;
    services = testSetup.services;
    fetch = createTestFetch(app);
  });

  afterEach(async () => {
    // Wait for running jobs to complete or fail, then clean up
    if (services && services.jobService) {
      const jobs = await services.storage.listJobs();
      for (const job of jobs) {
        if (job.status === 'running') {
          try {
            await services.jobService.terminateJob(job.id);
          } catch (error) {
            // Job might already be completed, ignore error
          }
        }
      }
      // Wait a bit for cleanup to complete
      await wait(50);
      await services.storage.clear();
    }
  });

  describe('POST /prompt', () => {
    test('should create a job with valid prompt', async () => {
      const response = await fetch('/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: testPrompts.success
        })
      });

      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data).toHaveProperty('jobId');
      expect(data).toHaveProperty('status', 'started');
      expect(typeof data.jobId).toBe('string');
      expect(data.jobId).toMatch(/^job_\d+_[a-z0-9]+$/);
    });

    test('should create a job with custom job ID', async () => {
      const customJobId = 'custom_test_job_123';
      
      const response = await fetch('/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: testPrompts.success,
          jobId: customJobId
        })
      });

      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data.jobId).toBe(customJobId);
      expect(data.status).toBe('started');
    });

    test('should create a job with options', async () => {
      const response = await fetch('/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testJobConfigs.withModel)
      });

      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data).toHaveProperty('jobId');
      expect(data).toHaveProperty('status', 'started');
      
      // Wait a bit and check job was stored with options
      await wait(50);
      const job = await services.jobService.getJob(data.jobId);
      expect(job.options).toEqual(testJobConfigs.withModel.options);
    });

    test('should reject missing prompt', async () => {
      const response = await fetch('/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      await assertResponseError(response, 400);
      const data = await getResponseJson(response);
      expect(data.error).toBe('Missing or invalid prompt');
    });

    test('should reject invalid prompt type', async () => {
      const response = await fetch('/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 123
        })
      });

      await assertResponseError(response, 400);
      const data = await getResponseJson(response);
      expect(data.error).toBe('Missing or invalid prompt');
    });

    test('should reject invalid job ID type', async () => {
      const response = await fetch('/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: testPrompts.success,
          jobId: 123
        })
      });

      await assertResponseError(response, 400);
      const data = await getResponseJson(response);
      expect(data.error).toBe('jobId must be a string');
    });
  });

  describe('GET /jobs', () => {
    test('should list all jobs', async () => {
      // Create a few jobs
      const job1 = await services.jobService.createJob(testPrompts.success);
      const job2 = await services.jobService.createJob(testPrompts.error);
      
      const response = await fetch('/jobs');
      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data).toHaveProperty('jobs');
      expect(Array.isArray(data.jobs)).toBe(true);
      expect(data.jobs.length).toBe(2);
      
      // Check job structure
      const job = data.jobs[0];
      expect(job).toHaveProperty('id');
      expect(job).toHaveProperty('prompt');
      expect(job).toHaveProperty('status');
      expect(job).toHaveProperty('startedAt');
      expect(job).toHaveProperty('color');
      expect(job).toHaveProperty('hasCompleteMessage');
    });

    test('should filter jobs by status', async () => {
      // Create jobs and wait for them to complete
      const job1 = await services.jobService.createJob(testPrompts.success);
      const job2 = await services.jobService.createJob(testPrompts.error);
      
      // Wait for completion
      await waitForJobStatus(services.jobService, job1.jobId, ['completed', 'failed'], 2000);
      await waitForJobStatus(services.jobService, job2.jobId, ['completed', 'failed'], 2000);
      
      const response = await fetch('/jobs?status=failed');
      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data.jobs.length).toBe(1);
      expect(data.jobs[0].status).toBe('failed');
    });

    test('should return empty array when no jobs exist', async () => {
      const response = await fetch('/jobs');
      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data.jobs).toEqual([]);
    });
  });

  describe('GET /jobs/:id', () => {
    test('should get job details', async () => {
      const { jobId } = await services.jobService.createJob(testPrompts.success);
      
      const response = await fetch(`/jobs/${jobId}`);
      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data).toHaveProperty('job');
      expect(data.job.id).toBe(jobId);
      expect(data.job.prompt).toBe(testPrompts.success);
      expect(data.job).toHaveProperty('status');
      expect(data.job).toHaveProperty('startedAt');
    });

    test('should return 404 for non-existent job', async () => {
      const response = await fetch('/jobs/non-existent-job');
      await assertResponseError(response, 404);
      const data = await getResponseJson(response);
      
      expect(data.error).toBe('Job not found');
    });

    test('should return 400 for missing job ID', async () => {
      const response = await fetch('/jobs/');
      await assertResponseError(response, 404); // Should be 404 for route not found
    });
  });

  describe('GET /jobs/:id/output', () => {
    test('should get job output history', async () => {
      const { jobId } = await services.jobService.createJob(testPrompts.success);
      
      // Wait for job to produce some output
      await waitForJobStatus(services.jobService, jobId, ['completed', 'failed'], 2000);
      
      const response = await fetch(`/jobs/${jobId}/output`);
      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data).toHaveProperty('jobId', jobId);
      expect(data).toHaveProperty('outputHistory');
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('color');
      expect(Array.isArray(data.outputHistory)).toBe(true);
    });

    test('should return 404 for non-existent job output', async () => {
      const response = await fetch('/jobs/non-existent-job/output');
      await assertResponseError(response, 404);
    });
  });

  describe('GET /jobs/:id/stream', () => {
    test('should get job output stream', async () => {
      const { jobId } = await services.jobService.createJob(testPrompts.success);
      
      // Give it a moment to start
      await wait(100);
      
      const response = await fetch(`/jobs/${jobId}/stream`);
      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data).toHaveProperty('jobId', jobId);
      expect(data).toHaveProperty('chunks');
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('color');
      expect(data).toHaveProperty('lastUpdate');
      expect(Array.isArray(data.chunks)).toBe(true);
    });

    test('should support since parameter for incremental updates', async () => {
      const { jobId } = await services.jobService.createJob(testPrompts.longRunning);
      
      // Wait for some output
      await wait(200);
      
      // Get initial stream
      const response1 = await fetch(`/jobs/${jobId}/stream`);
      await assertResponseSuccess(response1);
      const data1 = await getResponseJson(response1);
      
      const since = data1.lastUpdate;
      
      // Wait for more output
      await wait(200);
      
      // Get incremental update
      const response2 = await fetch(`/jobs/${jobId}/stream?since=${since}`);
      await assertResponseSuccess(response2);
      const data2 = await getResponseJson(response2);
      
      // Should only contain newer chunks
      expect(data2.chunks.every(chunk => chunk.timestamp > since)).toBe(true);
    });
  });

  describe('POST /jobs/:id/terminate', () => {
    test('should terminate running job', async () => {
      const { jobId } = await services.jobService.createJob(testPrompts.longRunning);
      
      // Give job time to start
      await wait(100);
      
      const response = await fetch(`/jobs/${jobId}/terminate`, {
        method: 'POST'
      });
      
      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data.success).toBe(true);
      expect(data.status).toBe('terminated');
      
      // Verify job is terminated
      const job = await services.jobService.getJob(jobId);
      expect(job.status).toBe('terminated');
    });

    test('should return 404 for non-existent job', async () => {
      const response = await fetch('/jobs/non-existent-job/terminate', {
        method: 'POST'
      });
      
      await assertResponseError(response, 404);
    });

    test('should return 400 for non-running job', async () => {
      const { jobId } = await services.jobService.createJob(testPrompts.success);
      
      // Wait for job to complete
      await waitForJobStatus(services.jobService, jobId, ['completed', 'failed'], 2000);
      
      const response = await fetch(`/jobs/${jobId}/terminate`, {
        method: 'POST'
      });
      
      await assertResponseError(response, 400);
    });
  });

  describe('DELETE /jobs/:id', () => {
    test('should delete completed job', async () => {
      const { jobId } = await services.jobService.createJob(testPrompts.success);
      
      // Wait for job to complete
      await waitForJobStatus(services.jobService, jobId, ['completed', 'failed'], 2000);
      
      const response = await fetch(`/jobs/${jobId}`, {
        method: 'DELETE'
      });
      
      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data.success).toBe(true);
      
      // Verify job is deleted
      const job = await services.jobService.getJob(jobId);
      expect(job).toBe(null);
    });

    test('should return success for non-existent job (idempotent)', async () => {
      const response = await fetch('/jobs/non-existent-job', {
        method: 'DELETE'
      });
      
      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      expect(data.success).toBe(true);
    });

    test('should return 400 for running job', async () => {
      const { jobId } = await services.jobService.createJob(testPrompts.longRunning);
      
      // Give job time to start but don't wait for completion
      await wait(100);
      
      const response = await fetch(`/jobs/${jobId}`, {
        method: 'DELETE'
      });
      
      await assertResponseError(response, 400);
    });
  });

  describe('GET /stats', () => {
    test('should return service statistics', async () => {
      // Create some jobs
      await services.jobService.createJob(testPrompts.success);
      await services.jobService.createJob(testPrompts.error);
      
      const response = await fetch('/stats');
      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data).toHaveProperty('totalJobs');
      expect(data).toHaveProperty('jobsByStatus');
      expect(data).toHaveProperty('memoryUsage');
      expect(data.totalJobs).toBeGreaterThan(0);
    });
  });

  describe('POST /cleanup', () => {
    test('should cleanup old jobs', async () => {
      const response = await fetch('/cleanup', {
        method: 'POST'
      });
      
      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data).toHaveProperty('cleaned');
      expect(typeof data.cleaned).toBe('number');
    });
  });

  describe('CORS Support', () => {
    test('should handle OPTIONS requests', async () => {
      const response = await fetch('/prompt', {
        method: 'OPTIONS'
      });
      
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    test('should include CORS headers in responses', async () => {
      const response = await fetch('/jobs');
      
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    });
  });
});