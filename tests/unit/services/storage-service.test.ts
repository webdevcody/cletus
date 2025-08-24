// Unit tests for storage service edge cases

import { test, expect, describe, beforeEach } from 'bun:test';
import { createStorageService } from '../../../api/services/storage-service.js';

describe('storage service edge cases', () => {
  let storage;

  beforeEach(() => {
    storage = createStorageService({ backend: 'memory' });
  });

  describe('storage backend selection', () => {
    test('should create memory storage by default', () => {
      const storage = createStorageService();
      expect(storage).toBeDefined();
    });

    test('should throw error for unknown backend', () => {
      expect(() => createStorageService({ backend: 'unknown' }))
        .toThrow('Unknown storage backend: unknown');
    });

    test('should throw error for redis backend (not implemented)', () => {
      expect(() => createStorageService({ backend: 'redis' }))
        .toThrow('Redis storage not yet implemented');
    });

    test('should throw error for file backend (not implemented)', () => {
      expect(() => createStorageService({ backend: 'file' }))
        .toThrow('File storage not yet implemented');
    });
  });

  describe('job capacity management', () => {
    test('should create jobs within capacity', async () => {
      // Create a few jobs to test basic functionality
      for (let i = 0; i < 10; i++) {
        const job = {
          id: `job_${i}`,
          status: 'pending',
          startedAt: Date.now(),
          finishedAt: null
        };
        const result = await storage.createJob(job);
        expect(result.id).toBe(`job_${i}`);
      }

      const stats = await storage.getStats();
      expect(stats.totalJobs).toBe(10);
    });

    test('should handle job creation at reasonable scale', async () => {
      // Test with a reasonable number of jobs (well under the 1000 limit)
      for (let i = 0; i < 50; i++) {
        const job = {
          id: `job_${i}`,
          status: 'completed',
          startedAt: Date.now() - (10000 - i * 100),
          finishedAt: Date.now() - (5000 - i * 100)
        };
        await storage.createJob(job);
      }

      const stats = await storage.getStats();
      expect(stats.totalJobs).toBe(50);
    });
  });

  describe('job operations edge cases', () => {
    test('should return null for non-existent job', async () => {
      const job = await storage.getJob('non-existent');
      expect(job).toBe(null);
    });

    test('should throw error when updating non-existent job', async () => {
      await expect(storage.updateJob('non-existent', { status: 'completed' }))
        .rejects.toThrow('Job non-existent not found');
    });

    test('should handle partial updates correctly', async () => {
      const originalJob = {
        id: 'test_job',
        status: 'running',
        startedAt: Date.now(),
        finishedAt: null,
        customProp: 'original'
      };
      await storage.createJob(originalJob);

      const updatedJob = await storage.updateJob('test_job', { 
        status: 'completed',
        finishedAt: Date.now()
      });

      expect(updatedJob.status).toBe('completed');
      expect(updatedJob.finishedAt).not.toBe(null);
      expect(updatedJob.startedAt).toBe(originalJob.startedAt);
      expect(updatedJob.customProp).toBe('original');
    });

    test('should return true when deleting existing job', async () => {
      const job = { id: 'test_job', status: 'pending', startedAt: Date.now() };
      await storage.createJob(job);

      const deleted = await storage.deleteJob('test_job');
      expect(deleted).toBe(true);

      const retrieved = await storage.getJob('test_job');
      expect(retrieved).toBe(null);
    });

    test('should return false when deleting non-existent job', async () => {
      const deleted = await storage.deleteJob('non-existent');
      expect(deleted).toBe(false);
    });

    test('should delete associated output stream when deleting job', async () => {
      const job = { id: 'test_job', status: 'pending', startedAt: Date.now() };
      await storage.createJob(job);
      await storage.createOutputStream('test_job');

      await storage.deleteJob('test_job');

      const stream = await storage.getOutputStream('test_job');
      expect(stream).toBe(null);
    });
  });

  describe('job filtering and sorting', () => {
    beforeEach(async () => {
      const jobs = [
        { id: 'job_1', status: 'completed', startedAt: 1000 },
        { id: 'job_2', status: 'running', startedAt: 2000 },
        { id: 'job_3', status: 'failed', startedAt: 3000 },
        { id: 'job_4', status: 'completed', startedAt: 4000 },
        { id: 'job_5', status: 'pending', startedAt: 5000 }
      ];

      for (const job of jobs) {
        await storage.createJob(job);
      }
    });

    test('should filter jobs by status', async () => {
      const completedJobs = await storage.listJobs({ status: 'completed' });
      expect(completedJobs).toHaveLength(2);
      expect(completedJobs.every(job => job.status === 'completed')).toBe(true);
    });

    test('should filter jobs by since timestamp', async () => {
      const recentJobs = await storage.listJobs({ since: 2500 });
      expect(recentJobs).toHaveLength(3);
      expect(recentJobs.every(job => job.startedAt >= 2500)).toBe(true);
    });

    test('should filter jobs by before timestamp', async () => {
      const oldJobs = await storage.listJobs({ before: 3500 });
      expect(oldJobs).toHaveLength(3);
      expect(oldJobs.every(job => job.startedAt <= 3500)).toBe(true);
    });

    test('should combine multiple filters', async () => {
      const filteredJobs = await storage.listJobs({ 
        status: 'completed',
        since: 2000 
      });
      expect(filteredJobs).toHaveLength(1);
      expect(filteredJobs[0].id).toBe('job_4');
    });

    test('should sort jobs by startedAt descending by default', async () => {
      const allJobs = await storage.listJobs();
      expect(allJobs).toHaveLength(5);
      
      for (let i = 0; i < allJobs.length - 1; i++) {
        expect(allJobs[i].startedAt).toBeGreaterThanOrEqual(allJobs[i + 1].startedAt);
      }
    });

    test('should return empty array when no jobs match filter', async () => {
      const jobs = await storage.listJobs({ status: 'terminated' });
      expect(jobs).toHaveLength(0);
      expect(Array.isArray(jobs)).toBe(true);
    });
  });

  describe('output stream edge cases', () => {
    test('should create output stream successfully', async () => {
      const result = await storage.createOutputStream('test_job');
      expect(result).toBe(true);

      const stream = await storage.getOutputStream('test_job');
      expect(stream).toBeDefined();
      expect(stream.chunks).toEqual([]);
      expect(stream.lastUpdate).toBeTypeOf('number');
    });

    test('should auto-create output stream when adding chunk to non-existent stream', async () => {
      const chunk = { text: 'test output', type: 'stdout', timestamp: Date.now() };
      await storage.addOutputChunk('test_job', chunk);

      const stream = await storage.getOutputStream('test_job');
      expect(stream).toBeDefined();
      expect(stream.chunks).toHaveLength(1);
      expect(stream.chunks[0]).toEqual(chunk);
    });

    test('should limit chunks per stream to prevent memory issues', async () => {
      await storage.createOutputStream('test_job');

      // Add many chunks to test the limiting behavior
      for (let i = 0; i < 1500; i++) {
        const chunk = { text: `output ${i}`, type: 'stdout', timestamp: Date.now() + i };
        await storage.addOutputChunk('test_job', chunk);
      }

      const stream = await storage.getOutputStream('test_job');
      expect(stream.chunks.length).toBeLessThanOrEqual(1000); // Default limit is 1000
      
      // Should keep the latest chunks when at limit
      if (stream.chunks.length === 1000) {
        expect(stream.chunks[stream.chunks.length - 1].text).toBe('output 1499');
      }
    });

    test('should update job output history when adding chunks', async () => {
      const job = { id: 'test_job', status: 'running', startedAt: Date.now() };
      await storage.createJob(job);

      const chunk1 = { text: 'output 1', type: 'stdout', timestamp: Date.now() };
      const chunk2 = { text: 'output 2', type: 'stdout', timestamp: Date.now() + 1 };

      await storage.addOutputChunk('test_job', chunk1);
      await storage.addOutputChunk('test_job', chunk2);

      const updatedJob = await storage.getJob('test_job');
      expect(updatedJob.outputHistory).toHaveLength(2);
      expect(updatedJob.outputHistory[0]).toEqual(chunk1);
      expect(updatedJob.outputHistory[1]).toEqual(chunk2);
    });

    test('should limit job output history to prevent memory issues', async () => {
      const job = { id: 'test_job', status: 'running', startedAt: Date.now() };
      await storage.createJob(job);

      // Add many chunks to test the limiting behavior
      for (let i = 0; i < 1500; i++) {
        const chunk = { text: `output ${i}`, type: 'stdout', timestamp: Date.now() + i };
        await storage.addOutputChunk('test_job', chunk);
      }

      const updatedJob = await storage.getJob('test_job');
      expect(updatedJob.outputHistory.length).toBeLessThanOrEqual(1000); // Default limit is 1000
      
      // Should keep the latest chunks when at limit
      if (updatedJob.outputHistory.length === 1000) {
        expect(updatedJob.outputHistory[updatedJob.outputHistory.length - 1].text).toBe('output 1499');
      }
    });

    test('should handle adding chunks to jobs that do not exist', async () => {
      const chunk = { text: 'output', type: 'stdout', timestamp: Date.now() };
      const result = await storage.addOutputChunk('non-existent-job', chunk);

      expect(result).toBe(true);

      // Stream should still be created
      const stream = await storage.getOutputStream('non-existent-job');
      expect(stream.chunks).toHaveLength(1);
    });

    test('should filter chunks by timestamp when requested', async () => {
      await storage.createOutputStream('test_job');

      const baseTime = Date.now();
      const chunks = [
        { text: 'output 1', type: 'stdout', timestamp: baseTime },
        { text: 'output 2', type: 'stdout', timestamp: baseTime + 1000 },
        { text: 'output 3', type: 'stdout', timestamp: baseTime + 2000 }
      ];

      for (const chunk of chunks) {
        await storage.addOutputChunk('test_job', chunk);
      }

      const filteredStream = await storage.getOutputStream('test_job', baseTime + 500);
      expect(filteredStream.chunks).toHaveLength(2);
      expect(filteredStream.chunks[0].text).toBe('output 2');
      expect(filteredStream.chunks[1].text).toBe('output 3');
    });

    test('should return null for non-existent output stream', async () => {
      const stream = await storage.getOutputStream('non-existent');
      expect(stream).toBe(null);
    });

    test('should delete output stream successfully', async () => {
      await storage.createOutputStream('test_job');
      const deleted = await storage.deleteOutputStream('test_job');
      expect(deleted).toBe(true);

      const stream = await storage.getOutputStream('test_job');
      expect(stream).toBe(null);
    });

    test('should return false when deleting non-existent output stream', async () => {
      const deleted = await storage.deleteOutputStream('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('statistics and monitoring', () => {
    test('should return accurate stats for empty storage', async () => {
      const stats = await storage.getStats();

      expect(stats.totalJobs).toBe(0);
      expect(stats.totalStreams).toBe(0);
      expect(stats.jobsByStatus).toEqual({});
      expect(stats.memoryUsage.jobs).toBe(0);
      expect(stats.memoryUsage.streams).toBe(0);
    });

    test('should return accurate stats with mixed job statuses', async () => {
      const jobs = [
        { id: 'job_1', status: 'completed', startedAt: Date.now() },
        { id: 'job_2', status: 'completed', startedAt: Date.now() },
        { id: 'job_3', status: 'failed', startedAt: Date.now() },
        { id: 'job_4', status: 'running', startedAt: Date.now() },
        { id: 'job_5', status: 'pending', startedAt: Date.now() }
      ];

      for (const job of jobs) {
        await storage.createJob(job);
        await storage.createOutputStream(job.id);
      }

      const stats = await storage.getStats();

      expect(stats.totalJobs).toBe(5);
      expect(stats.totalStreams).toBe(5);
      expect(stats.jobsByStatus).toEqual({
        completed: 2,
        failed: 1,
        running: 1,
        pending: 1
      });
      expect(stats.memoryUsage.jobs).toBe(5);
      expect(stats.memoryUsage.streams).toBe(5);
    });

    test('should track memory limits in stats', async () => {
      const stats = await storage.getStats();
      expect(stats.memoryUsage.maxJobs).toBe(100); // Test config value
    });
  });

  describe('cleanup operations', () => {
    test('should cleanup old completed jobs', async () => {
      const oldTime = Date.now() - 10000;
      const recentTime = Date.now() - 1000;

      const jobs = [
        { id: 'old_completed', status: 'completed', startedAt: oldTime, finishedAt: oldTime + 1000 },
        { id: 'old_failed', status: 'failed', startedAt: oldTime, finishedAt: oldTime + 1000 },
        { id: 'recent_completed', status: 'completed', startedAt: recentTime, finishedAt: recentTime + 500 },
        { id: 'running', status: 'running', startedAt: oldTime, finishedAt: null }
      ];

      for (const job of jobs) {
        await storage.createJob(job);
        await storage.createOutputStream(job.id);
      }

      const cleaned = await storage.cleanup(5000); // Clean jobs older than 5 seconds
      expect(cleaned).toBe(2); // old_completed and old_failed

      const remaining = await storage.listJobs();
      expect(remaining).toHaveLength(2);
      expect(remaining.map(j => j.id)).toEqual(
        expect.arrayContaining(['recent_completed', 'running'])
      );

      // Streams should also be cleaned
      const oldStream = await storage.getOutputStream('old_completed');
      expect(oldStream).toBe(null);
    });

    test('should not cleanup running jobs regardless of age', async () => {
      const veryOldTime = Date.now() - 100000;
      const job = {
        id: 'very_old_running',
        status: 'running',
        startedAt: veryOldTime,
        finishedAt: null
      };

      await storage.createJob(job);
      const cleaned = await storage.cleanup(50000); // Clean very old

      expect(cleaned).toBe(0);

      const remaining = await storage.listJobs();
      expect(remaining).toHaveLength(1);
    });

    test('should not cleanup recent jobs even without finishedAt timestamp', async () => {
      const recentTime = Date.now() - 1000; // 1 second ago (very recent)
      const job = {
        id: 'completed_no_finish_time',
        status: 'completed',
        startedAt: recentTime,
        finishedAt: null // No finish time
      };

      await storage.createJob(job);
      const cleaned = await storage.cleanup(5000); // Clean jobs older than 5 seconds

      expect(cleaned).toBe(0); // Should not clean up recent job
    });

    test('should return 0 when no jobs need cleanup', async () => {
      const recentTime = Date.now() - 1000;
      const job = {
        id: 'recent_job',
        status: 'completed',
        startedAt: recentTime,
        finishedAt: recentTime + 500
      };

      await storage.createJob(job);
      const cleaned = await storage.cleanup(5000); // 5 second threshold

      expect(cleaned).toBe(0);
    });
  });

  describe('clear operation', () => {
    test('should clear all jobs and streams', async () => {
      // Add some data
      const jobs = [
        { id: 'job_1', status: 'completed', startedAt: Date.now() },
        { id: 'job_2', status: 'running', startedAt: Date.now() }
      ];

      for (const job of jobs) {
        await storage.createJob(job);
        await storage.createOutputStream(job.id);
      }

      // Verify data exists
      let stats = await storage.getStats();
      expect(stats.totalJobs).toBe(2);
      expect(stats.totalStreams).toBe(2);

      // Clear all
      const result = await storage.clear();
      expect(result).toBe(true);

      // Verify everything is gone
      stats = await storage.getStats();
      expect(stats.totalJobs).toBe(0);
      expect(stats.totalStreams).toBe(0);

      const jobs_after = await storage.listJobs();
      expect(jobs_after).toHaveLength(0);
    });
  });

  describe('concurrent operations', () => {
    test('should handle concurrent job creation', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(storage.createJob({
          id: `concurrent_job_${i}`,
          status: 'pending',
          startedAt: Date.now()
        }));
      }

      // All should succeed with current high limits
      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      expect(successful).toBe(10);
      expect(failed).toBe(0);
    });

    test('should handle concurrent updates to same job', async () => {
      const job = { id: 'test_job', status: 'pending', startedAt: Date.now() };
      await storage.createJob(job);

      const promises = [
        storage.updateJob('test_job', { status: 'running' }),
        storage.updateJob('test_job', { progress: 'starting' }),
        storage.updateJob('test_job', { customField: 'value' })
      ];

      const results = await Promise.allSettled(promises);
      expect(results.every(r => r.status === 'fulfilled')).toBe(true);

      // Final job should have last update
      const finalJob = await storage.getJob('test_job');
      expect(finalJob).toBeDefined();
    });

    test('should handle concurrent output chunk additions', async () => {
      await storage.createOutputStream('test_job');

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(storage.addOutputChunk('test_job', {
          text: `output ${i}`,
          type: 'stdout',
          timestamp: Date.now() + i
        }));
      }

      await Promise.all(promises);

      const stream = await storage.getOutputStream('test_job');
      expect(stream.chunks.length).toBeGreaterThan(0);
      expect(stream.chunks.length).toBeLessThanOrEqual(1000); // Due to chunk limit
    });
  });
});