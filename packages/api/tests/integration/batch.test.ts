// Integration tests for batch endpoints

import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { 
  createTestApp, 
  createTestFetch, 
  wait, 
  waitForJobStatus,
  assertResponseSuccess,
  assertResponseError,
  getResponseJson,
  createTestJobs
} from '../setup.js';
import { testPrompts, expectedOutputs } from './fixtures/mock-responses.js';

describe('Batch Endpoints', () => {
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

  describe('POST /batch', () => {
    test('should create multiple jobs from prompts array', async () => {
      const prompts = [
        testPrompts.success,
        testPrompts.error,
        testPrompts.longRunning
      ];

      const response = await fetch('/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompts })
      });

      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data).toHaveProperty('jobIds');
      expect(data).toHaveProperty('status', 'started');
      expect(data).toHaveProperty('count', 3);
      expect(Array.isArray(data.jobIds)).toBe(true);
      expect(data.jobIds.length).toBe(3);
      
      // All job IDs should be strings with correct format
      data.jobIds.forEach(jobId => {
        expect(typeof jobId).toBe('string');
        expect(jobId).toMatch(/^job_\d+_[a-z0-9]+$/);
      });
    });

    test('should create batch with options', async () => {
      const prompts = [testPrompts.success, testPrompts.error];
      const options = {
        model: 'claude-haiku-20240307',
        allowedTools: ['Read', 'Write']
      };

      const response = await fetch('/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompts, options })
      });

      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data.jobIds.length).toBe(2);
      
      // Verify jobs were created with options
      await wait(50);
      for (const jobId of data.jobIds) {
        const job = await services.jobService.getJob(jobId);
        expect(job.options).toEqual(options);
      }
    });

    test('should reject empty prompts array', async () => {
      const response = await fetch('/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompts: [] })
      });

      await assertResponseError(response, 400);
      const data = await getResponseJson(response);
      expect(data.error).toBe('Missing or invalid prompts array');
    });

    test('should reject missing prompts array', async () => {
      const response = await fetch('/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      await assertResponseError(response, 400);
      const data = await getResponseJson(response);
      expect(data.error).toBe('Missing or invalid prompts array');
    });

    test('should reject non-array prompts', async () => {
      const response = await fetch('/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompts: 'not an array' })
      });

      await assertResponseError(response, 400);
      const data = await getResponseJson(response);
      expect(data.error).toBe('Missing or invalid prompts array');
    });

    test('should reject too many prompts', async () => {
      const prompts = Array(15).fill(testPrompts.success); // More than max batch size

      const response = await fetch('/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompts })
      });

      await assertResponseError(response, 400);
      const data = await getResponseJson(response);
      expect(data.error).toBe('Maximum 10 prompts allowed per batch');
    });

    test('should reject non-string prompts', async () => {
      const prompts = [testPrompts.success, 123, testPrompts.error];

      const response = await fetch('/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompts })
      });

      await assertResponseError(response, 400);
      const data = await getResponseJson(response);
      expect(data.error).toBe('Prompt at index 1 must be a string');
    });

    test('should reject empty string prompts', async () => {
      const prompts = [testPrompts.success, '   ', testPrompts.error];

      const response = await fetch('/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompts })
      });

      await assertResponseError(response, 400);
      const data = await getResponseJson(response);
      expect(data.error).toBe('Prompt at index 1 cannot be empty');
    });

    test('should reject invalid options type', async () => {
      const prompts = [testPrompts.success];
      
      const response = await fetch('/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompts, options: 'not an object' })
      });

      await assertResponseError(response, 400);
      const data = await getResponseJson(response);
      expect(data.error).toBe('Options must be an object');
    });
  });

  describe('GET /batch/:jobIds/status', () => {
    test('should get status of multiple jobs', async () => {
      // Create some jobs
      const { jobIds } = await services.jobService.createBatch([
        testPrompts.success,
        testPrompts.error,
        testPrompts.longRunning
      ]);

      // Wait for some jobs to complete
      await wait(500);

      const response = await fetch(`/batch/${jobIds.join(',')}/status`);
      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data).toHaveProperty('jobs');
      expect(data).toHaveProperty('notFound');
      expect(data).toHaveProperty('summary');
      expect(Array.isArray(data.jobs)).toBe(true);
      expect(Array.isArray(data.notFound)).toBe(true);
      expect(data.jobs.length).toBe(3);
      expect(data.notFound.length).toBe(0);
      
      // Check summary
      expect(data.summary.total).toBe(3);
      expect(data.summary.found).toBe(3);
      expect(data.summary.notFound).toBe(0);
      
      // Check job structure
      const job = data.jobs[0];
      expect(job).toHaveProperty('id');
      expect(job).toHaveProperty('status');
      expect(job).toHaveProperty('startedAt');
      expect(job).toHaveProperty('hasOutput');
    });

    test('should handle mix of found and not found jobs', async () => {
      // Create one job
      const { jobIds } = await services.jobService.createBatch([testPrompts.success]);
      const realJobId = jobIds[0];
      const fakeJobId = 'fake-job-id';

      const response = await fetch(`/batch/${realJobId},${fakeJobId}/status`);
      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data.jobs.length).toBe(1);
      expect(data.notFound.length).toBe(1);
      expect(data.jobs[0].id).toBe(realJobId);
      expect(data.notFound[0]).toBe(fakeJobId);
      
      expect(data.summary.total).toBe(2);
      expect(data.summary.found).toBe(1);
      expect(data.summary.notFound).toBe(1);
    });

    test('should reject missing job IDs parameter', async () => {
      const response = await fetch('/batch//status');
      await assertResponseError(response, 404); // Route not found
    });

    test('should reject empty job IDs', async () => {
      const response = await fetch('/batch/ , ,/status');
      await assertResponseError(response, 400);
      const data = await getResponseJson(response);
      expect(data.error).toBe('At least one job ID is required');
    });

    test('should reject too many job IDs', async () => {
      const jobIds = Array(15).fill('fake-job-id').join(',');
      
      const response = await fetch(`/batch/${jobIds}/status`);
      await assertResponseError(response, 400);
      const data = await getResponseJson(response);
      expect(data.error).toBe('Maximum 10 job IDs allowed per request');
    });
  });

  describe('POST /batch/:jobIds/terminate', () => {
    test('should terminate multiple running jobs', async () => {
      // Create long-running jobs
      const { jobIds } = await services.jobService.createBatch([
        testPrompts.longRunning,
        testPrompts.longRunning
      ]);

      // Give jobs time to start
      await wait(100);

      const response = await fetch(`/batch/${jobIds.join(',')}/terminate`, {
        method: 'POST'
      });

      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data).toHaveProperty('results');
      expect(data).toHaveProperty('summary');
      expect(Array.isArray(data.results)).toBe(true);
      expect(data.results.length).toBe(2);
      
      // Check summary
      expect(data.summary.total).toBe(2);
      expect(data.summary.terminated).toBeGreaterThan(0);
      
      // Check individual results
      data.results.forEach(result => {
        expect(result).toHaveProperty('jobId');
        expect(result).toHaveProperty('success');
        if (result.success) {
          expect(result.status).toBe('terminated');
        }
      });
    });

    test('should handle mix of terminable and non-terminable jobs', async () => {
      // Create one long-running job and one quick job
      const { jobIds: [longJobId] } = await services.jobService.createBatch([testPrompts.longRunning]);
      const { jobIds: [quickJobId] } = await services.jobService.createBatch([testPrompts.success]);
      
      // Wait for quick job to complete
      await waitForJobStatus(services.jobService, quickJobId, ['completed', 'failed'], 1000);

      const response = await fetch(`/batch/${longJobId},${quickJobId}/terminate`, {
        method: 'POST'
      });

      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data.results.length).toBe(2);
      
      // One should succeed, one should fail
      const successes = data.results.filter(r => r.success);
      const failures = data.results.filter(r => !r.success);
      
      expect(successes.length + failures.length).toBe(2);
      expect(data.summary.terminated + data.summary.failed).toBe(2);
    });

    test('should handle non-existent jobs gracefully', async () => {
      const response = await fetch('/batch/fake-job-1,fake-job-2/terminate', {
        method: 'POST'
      });

      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data.results.length).toBe(2);
      expect(data.results.every(r => !r.success)).toBe(true);
      expect(data.summary.failed).toBe(2);
      expect(data.summary.terminated).toBe(0);
    });
  });

  describe('DELETE /batch/:jobIds', () => {
    test('should delete multiple completed jobs', async () => {
      // Create and wait for jobs to complete
      const { jobIds } = await services.jobService.createBatch([
        testPrompts.success,
        testPrompts.error
      ]);

      // Wait for completion
      for (const jobId of jobIds) {
        await waitForJobStatus(services.jobService, jobId, ['completed', 'failed'], 2000);
      }

      const response = await fetch(`/batch/${jobIds.join(',')}`, {
        method: 'DELETE'
      });

      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data).toHaveProperty('results');
      expect(data).toHaveProperty('summary');
      expect(data.results.length).toBe(2);
      expect(data.summary.total).toBe(2);
      expect(data.summary.deleted).toBe(2);
      expect(data.summary.failed).toBe(0);
      
      // Verify jobs were deleted
      for (const jobId of jobIds) {
        const job = await services.jobService.getJob(jobId);
        expect(job).toBe(null);
      }
    });

    test('should handle mix of deletable and non-deletable jobs', async () => {
      // Create one quick job and one long job
      const { jobIds: [quickJobId] } = await services.jobService.createBatch([testPrompts.success]);
      const { jobIds: [longJobId] } = await services.jobService.createBatch([testPrompts.longRunning]);
      
      // Wait for quick job to complete
      await waitForJobStatus(services.jobService, quickJobId, ['completed', 'failed'], 1000);
      
      // Long job should still be running
      await wait(100);

      const response = await fetch(`/batch/${quickJobId},${longJobId}`, {
        method: 'DELETE'
      });

      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data.results.length).toBe(2);
      
      const successes = data.results.filter(r => r.success);
      const failures = data.results.filter(r => !r.success);
      
      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);
      expect(data.summary.deleted).toBe(1);
      expect(data.summary.failed).toBe(1);
    });
  });

  describe('GET /batch/limits', () => {
    test('should return batch processing limits', async () => {
      const response = await fetch('/batch/limits');
      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data).toHaveProperty('maxBatchSize');
      expect(data).toHaveProperty('defaultTimeout');
      expect(data).toHaveProperty('retentionPeriod');
      expect(data).toHaveProperty('maxJobsInMemory');
      
      expect(typeof data.maxBatchSize).toBe('number');
      expect(typeof data.defaultTimeout).toBe('number');
      expect(typeof data.retentionPeriod).toBe('number');
      expect(typeof data.maxJobsInMemory).toBe('number');
      
      expect(data.maxBatchSize).toBeGreaterThan(0);
    });
  });

  describe('Batch Job Integration', () => {
    test('should process all jobs in batch independently', async () => {
      const { jobIds } = await services.jobService.createBatch([
        testPrompts.success,  // Should complete successfully
        testPrompts.error,    // Should fail
        testPrompts.success   // Should complete successfully
      ]);

      // Wait for all jobs to complete
      await wait(1000);

      // Check status of all jobs
      const response = await fetch(`/batch/${jobIds.join(',')}/status`);
      await assertResponseSuccess(response);
      const data = await getResponseJson(response);
      
      expect(data.jobs.length).toBe(3);
      
      // Count statuses
      const completed = data.jobs.filter(j => j.status === 'completed').length;
      const failed = data.jobs.filter(j => j.status === 'failed').length;
      
      expect(completed).toBe(2); // Two success prompts
      expect(failed).toBe(1);    // One error prompt
      
      // Verify each job has output
      for (const job of data.jobs) {
        expect(job.hasOutput).toBe(true);
      }
    });

    test('should handle concurrent batch creation', async () => {
      // Create multiple batches concurrently
      const batch1Promise = services.jobService.createBatch([
        testPrompts.success,
        testPrompts.success
      ]);
      
      const batch2Promise = services.jobService.createBatch([
        testPrompts.error,
        testPrompts.error
      ]);

      const [batch1, batch2] = await Promise.all([batch1Promise, batch2Promise]);
      
      expect(batch1.jobIds.length).toBe(2);
      expect(batch2.jobIds.length).toBe(2);
      expect(batch1.count).toBe(2);
      expect(batch2.count).toBe(2);
      
      // All job IDs should be unique
      const allJobIds = [...batch1.jobIds, ...batch2.jobIds];
      const uniqueJobIds = new Set(allJobIds);
      expect(uniqueJobIds.size).toBe(4);
    });
  });
});