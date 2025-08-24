// GET /stats - Get service statistics endpoint

import { getJobService } from '../../services/job-service.js';
import getConfig from '../../config/index.js';

/**
 * Get service statistics endpoint handler
 * @param {Object} options - Dependency injection options
 * @returns {Function} Hono handler function
 */
export const getStatsEndpoint = (options = {}) => {
  const jobService = options.jobService || getJobService();
  const config = getConfig();

  return async (c) => {
    try {
      // Parse query parameters for different stat types
      const query = c.req.query();
      const detailed = query.detailed === 'true';
      const includeSystem = query.system === 'true';
      const includePerformance = query.performance === 'true';
      
      // Get basic job statistics
      const jobStats = await jobService.getStats();
      
      // Build response with job statistics
      const response = {
        // Flatten job stats to top level for test compatibility
        totalJobs: jobStats.totalJobs || 0,
        jobsByStatus: jobStats.jobsByStatus || {},
        memoryUsage: jobStats.memoryUsage || {},
        // Keep nested structure for backward compatibility
        jobs: jobStats,
        timestamp: Date.now(),
        environment: config.env
      };
      
      // Add detailed job statistics if requested
      if (detailed) {
        // Calculate additional metrics
        const totalJobs = jobStats.totalJobs || 0;
        const completedJobs = jobStats.jobsByStatus?.completed || 0;
        const failedJobs = jobStats.jobsByStatus?.failed || 0;
        const runningJobs = jobStats.jobsByStatus?.running || 0;
        
        response.detailed = {
          successRate: totalJobs > 0 ? completedJobs / totalJobs : 0,
          failureRate: totalJobs > 0 ? failedJobs / totalJobs : 0,
          activeJobs: runningJobs + (jobStats.jobsByStatus?.pending || 0),
          completionRate: totalJobs > 0 ? (completedJobs + failedJobs) / totalJobs : 0,
          capacity: {
            used: totalJobs,
            max: config.storage.maxJobsInMemory,
            available: Math.max(0, config.storage.maxJobsInMemory - totalJobs),
            utilizationPercent: totalJobs / config.storage.maxJobsInMemory * 100
          }
        };
      }
      
      // Add system statistics if requested
      if (includeSystem) {
        response.system = {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          pid: process.pid,
          startTime: Date.now() - (process.uptime() * 1000)
        };
        
        // Add environment variables (safe ones only)
        response.system.environment = {
          nodeEnv: process.env.NODE_ENV,
          port: config.port,
          claudeMockMode: config.claude.mockMode,
          storageBackend: config.storage.backend,
          logLevel: config.logging.level
        };
      }
      
      // Add performance metrics if requested
      if (includePerformance) {
        response.performance = {
          averageJobDuration: 0, // Would need historical data
          jobsPerHour: 0, // Would need to track over time
          errorRate: jobStats.totalJobs > 0 ? (jobStats.jobsByStatus?.failed || 0) / jobStats.totalJobs : 0,
          throughput: {
            current: 0, // Jobs processed in last minute
            peak: 0,    // Highest jobs per minute ever recorded
            average: 0  // Average jobs per minute over uptime
          }
        };
        
        // Add garbage collection stats if available
        if (global.gc) {
          response.performance.gc = {
            available: true,
            lastRun: 'N/A' // Would need to track
          };
        }
        
        // Add event loop lag if available
        if (typeof performance !== 'undefined' && performance.now) {
          const start = performance.now();
          setImmediate(() => {
            response.performance.eventLoopLag = performance.now() - start;
          });
        }
      }
      
      // Add configuration limits
      response.limits = {
        maxJobsInMemory: config.storage.maxJobsInMemory,
        maxOutputChunks: config.storage.maxOutputChunks,
        maxBatchSize: config.jobs.maxBatchSize,
        jobTimeout: config.jobs.defaultTimeout,
        retentionPeriod: config.jobs.retentionPeriod
      };
      
      // Add service health indicators
      response.health = {
        status: determineHealthStatus(jobStats, config),
        checks: {
          memoryUsage: checkMemoryHealth(),
          jobCapacity: checkJobCapacity(jobStats.totalJobs, config.storage.maxJobsInMemory),
          errorRate: checkErrorRate(jobStats),
          serviceAvailable: true // Basic check - if we can respond, service is available
        }
      };
      
      return c.json(response);
      
    } catch (error) {
      console.error('Error getting stats:', error);
      return c.json({ error: error.message || 'Internal error' }, 500);
    }
  };
};

/**
 * Determine overall service health status
 */
const determineHealthStatus = (jobStats, config) => {
  const totalJobs = jobStats.totalJobs || 0;
  const failedJobs = jobStats.jobsByStatus?.failed || 0;
  const memoryUsage = process.memoryUsage();
  
  // Check various health indicators
  const memoryHealthy = memoryUsage.heapUsed / memoryUsage.heapTotal < 0.9;
  const capacityHealthy = totalJobs / config.storage.maxJobsInMemory < 0.8;
  const errorRateHealthy = totalJobs === 0 || failedJobs / totalJobs < 0.1;
  
  if (memoryHealthy && capacityHealthy && errorRateHealthy) {
    return 'healthy';
  } else if (memoryHealthy && capacityHealthy) {
    return 'warning';
  } else {
    return 'critical';
  }
};

/**
 * Check memory health
 */
const checkMemoryHealth = () => {
  const memory = process.memoryUsage();
  const heapUsedPercent = memory.heapUsed / memory.heapTotal * 100;
  
  return {
    status: heapUsedPercent < 70 ? 'healthy' : heapUsedPercent < 85 ? 'warning' : 'critical',
    heapUsedPercent,
    heapUsed: memory.heapUsed,
    heapTotal: memory.heapTotal
  };
};

/**
 * Check job capacity health
 */
const checkJobCapacity = (currentJobs, maxJobs) => {
  const utilizationPercent = currentJobs / maxJobs * 100;
  
  return {
    status: utilizationPercent < 60 ? 'healthy' : utilizationPercent < 80 ? 'warning' : 'critical',
    utilizationPercent,
    currentJobs,
    maxJobs
  };
};

/**
 * Check error rate health
 */
const checkErrorRate = (jobStats) => {
  const totalJobs = jobStats.totalJobs || 0;
  const failedJobs = jobStats.jobsByStatus?.failed || 0;
  const errorRate = totalJobs > 0 ? failedJobs / totalJobs * 100 : 0;
  
  return {
    status: errorRate < 5 ? 'healthy' : errorRate < 15 ? 'warning' : 'critical',
    errorRate,
    failedJobs,
    totalJobs
  };
};

export default getStatsEndpoint;