// Integration tests for health endpoints

import { test, expect, beforeEach, describe } from 'bun:test';
import { 
  createTestApp, 
  createTestFetch, 
  assertResponseSuccess,
  getResponseJson
} from '../setup.js';

describe('Health Endpoints', () => {
  let app, fetch, services;

  beforeEach(() => {
    const testSetup = createTestApp();
    app = testSetup.app;
    services = testSetup.services;
    fetch = createTestFetch(app);
  });

  describe('GET /health', () => {
    test('should return basic health status', async () => {
      const response = await fetch('/health');
      
      // Accept both 200 and 503 during memory pressure
      expect([200, 503].includes(response.status)).toBe(true);
      const data = await getResponseJson(response);
      
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('uptime');
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('environment');
      expect(data).toHaveProperty('checks');
      expect(data).toHaveProperty('responseTime');
      expect(data).toHaveProperty('service');
      
      expect(['healthy', 'degraded', 'unhealthy'].includes(data.status)).toBe(true);
      expect(typeof data.timestamp).toBe('number');
      expect(typeof data.uptime).toBe('number');
      expect(typeof data.responseTime).toBe('number');
    });

    test('should include memory health check', async () => {
      const response = await fetch('/health');
      const data = await getResponseJson(response);
      
      expect(data.checks).toHaveProperty('memory');
      expect(data.checks.memory).toHaveProperty('status');
      expect(data.checks.memory).toHaveProperty('message');
      expect(data.checks.memory).toHaveProperty('heapUsedPercent');
      expect(data.checks.memory).toHaveProperty('rssUsedMB');
      
      expect(['healthy', 'warning', 'critical', 'error'].includes(data.checks.memory.status)).toBe(true);
      expect(typeof data.checks.memory.heapUsedPercent).toBe('number');
      expect(typeof data.checks.memory.rssUsedMB).toBe('number');
    });

    test('should include process health check', async () => {
      const response = await fetch('/health');
      const data = await getResponseJson(response);
      
      expect(data.checks).toHaveProperty('process');
      expect(data.checks.process).toHaveProperty('status');
      expect(data.checks.process).toHaveProperty('message');
      expect(data.checks.process).toHaveProperty('uptime');
      expect(data.checks.process).toHaveProperty('pid');
      expect(data.checks.process).toHaveProperty('platform');
      expect(data.checks.process).toHaveProperty('arch');
      expect(data.checks.process).toHaveProperty('nodeVersion');
      
      expect(['healthy', 'warning', 'critical', 'error'].includes(data.checks.process.status)).toBe(true);
      expect(typeof data.checks.process.uptime).toBe('number');
      expect(typeof data.checks.process.pid).toBe('number');
    });

    test('should include configuration health check', async () => {
      const response = await fetch('/health');
      const data = await getResponseJson(response);
      
      expect(data.checks).toHaveProperty('configuration');
      expect(data.checks.configuration).toHaveProperty('status');
      expect(data.checks.configuration).toHaveProperty('message');
      expect(data.checks.configuration).toHaveProperty('issues');
      expect(data.checks.configuration).toHaveProperty('configValid');
      expect(data.checks.configuration).toHaveProperty('environment');
      expect(data.checks.configuration).toHaveProperty('mockMode');
      
      expect(['healthy', 'warning', 'critical', 'error'].includes(data.checks.configuration.status)).toBe(true);
      expect(Array.isArray(data.checks.configuration.issues)).toBe(true);
      expect(typeof data.checks.configuration.configValid).toBe('boolean');
    });

    test('should support detailed health information', async () => {
      const response = await fetch('/health?detailed=true');
      const data = await getResponseJson(response);
      
      expect(data).toHaveProperty('system');
      expect(data).toHaveProperty('environment');
      
      // System information
      expect(data.system).toHaveProperty('platform');
      expect(data.system).toHaveProperty('arch');
      expect(data.system).toHaveProperty('nodeVersion');
      expect(data.system).toHaveProperty('pid');
      expect(data.system).toHaveProperty('memory');
      expect(data.system).toHaveProperty('cpuUsage');
      
      // Environment information
      expect(data.environment).toHaveProperty('nodeEnv');
      expect(data.environment).toHaveProperty('port');
      expect(data.environment).toHaveProperty('claudeMockMode');
      expect(data.environment).toHaveProperty('storageBackend');
      expect(data.environment).toHaveProperty('isProduction');
      expect(data.environment).toHaveProperty('isDevelopment');
      expect(data.environment).toHaveProperty('isTest');
    });

    test('should support service health checks', async () => {
      const response = await fetch('/health?services=true');
      const data = await getResponseJson(response);
      
      expect(data.checks).toHaveProperty('services');
      expect(data.checks.services).toHaveProperty('storage');
      expect(data.checks.services).toHaveProperty('claude');
      
      // Storage service health
      expect(data.checks.services.storage).toHaveProperty('status');
      expect(data.checks.services.storage).toHaveProperty('message');
      expect(['healthy', 'warning', 'critical', 'error'].includes(data.checks.services.storage.status)).toBe(true);
      
      // Claude service health
      expect(data.checks.services.claude).toHaveProperty('status');
      expect(data.checks.services.claude).toHaveProperty('message');
      expect(['healthy', 'warning', 'critical', 'error'].includes(data.checks.services.claude.status)).toBe(true);
    });

    test('should combine detailed and services parameters', async () => {
      const response = await fetch('/health?detailed=true&services=true');
      const data = await getResponseJson(response);
      
      expect(data).toHaveProperty('system');
      expect(data).toHaveProperty('environment');
      expect(data.checks).toHaveProperty('services');
    });

    test('should return service metadata', async () => {
      const response = await fetch('/health');
      const data = await getResponseJson(response);
      
      expect(data.service).toHaveProperty('name', 'cletus-api');
      expect(data.service).toHaveProperty('version', '2.0.0');
      expect(data.service).toHaveProperty('description', 'Claude job management API');
      expect(data.service).toHaveProperty('startTime');
      
      expect(typeof data.service.startTime).toBe('number');
      expect(data.service.startTime).toBeLessThanOrEqual(Date.now());
    });

    test('should set appropriate HTTP status codes', async () => {
      const response = await fetch('/health');
      
      // Should return 200 for healthy or degraded, 503 for unhealthy
      expect([200, 503].includes(response.status)).toBe(true);
      
      const data = await getResponseJson(response);
      if (response.status === 200) {
        expect(['healthy', 'degraded'].includes(data.status)).toBe(true);
      } else if (response.status === 503) {
        expect(data.status).toBe('unhealthy');
      }
    });

    test('should handle query parameter edge cases', async () => {
      // Test various boolean interpretations
      const testCases = [
        { query: '?detailed=false&services=false', shouldHaveDetailed: false, shouldHaveServices: false },
        { query: '?detailed=true&services=false', shouldHaveDetailed: true, shouldHaveServices: false },
        { query: '?detailed=false&services=true', shouldHaveDetailed: false, shouldHaveServices: true },
        { query: '?detailed=&services=', shouldHaveDetailed: false, shouldHaveServices: false },
        { query: '?detailed=1&services=0', shouldHaveDetailed: false, shouldHaveServices: false },
      ];

      for (const testCase of testCases) {
        const response = await fetch(`/health${testCase.query}`);
        const data = await getResponseJson(response);
        
        if (testCase.shouldHaveDetailed) {
          expect(data).toHaveProperty('system');
          expect(data).toHaveProperty('environment');
        } else {
          expect(data).not.toHaveProperty('system');
          // Basic health response always has environment field for NODE_ENV
          expect(data).toHaveProperty('environment');
        }
        
        if (testCase.shouldHaveServices) {
          expect(data.checks).toHaveProperty('services');
        } else {
          expect(data.checks).not.toHaveProperty('services');
        }
      }
    });
  });

  describe('GET / (status)', () => {
    test('should return simple status endpoint', async () => {
      const response = await fetch('/');
      
      await assertResponseSuccess(response, 200);
      const data = await getResponseJson(response);
      
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('timestamp');
      expect(['ok', 'error'].includes(data.status)).toBe(true);
    });

    test('should be faster than full health check', async () => {
      const start1 = Date.now();
      await fetch('/');
      const statusTime = Date.now() - start1;
      
      const start2 = Date.now();
      await fetch('/health?detailed=true&services=true');
      const healthTime = Date.now() - start2;
      
      // Status should generally be faster than detailed health
      // But we'll be lenient since this is a test environment
      expect(statusTime).toBeLessThan(healthTime + 100); // Allow some tolerance
    });
  });
});