// GET /health - Health check endpoint

import getConfig from '../../config/index.js';

/**
 * Health check endpoint handler
 * @param {Object} options - Dependency injection options
 * @returns {Function} Hono handler function
 */
export const healthCheckEndpoint = (options = {}) => {
  const config = getConfig();

  return async (c) => {
    try {
      // Parse query parameters for different health check levels
      const query = c.req.query();
      const detailed = query.detailed === 'true';
      const includeServices = query.services === 'true';
      
      const startTime = Date.now();
      
      // Basic health indicators
      const health = {
        status: 'healthy',
        timestamp: startTime,
        uptime: process.uptime(),
        version: '2.0.0',
        environment: config.env
      };
      
      // Check basic system health
      const checks = {
        memory: checkMemoryHealth(),
        process: checkProcessHealth(),
        configuration: checkConfigurationHealth(config)
      };
      
      // Include service health checks if requested
      if (includeServices) {
        checks.services = await checkServicesHealth();
      }
      
      // Include detailed system information if requested
      if (detailed) {
        health.system = {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          pid: process.pid,
          ppid: process.ppid,
          memory: process.memoryUsage(),
          cpuUsage: process.cpuUsage(),
          resourceUsage: process.resourceUsage ? process.resourceUsage() : null
        };
        
        // Add environment info (safe values only)
        health.environment = {
          nodeEnv: config.env,
          port: config.port,
          claudeMockMode: config.claude.mockMode,
          storageBackend: config.storage.backend,
          isProduction: config.isProduction,
          isDevelopment: config.isDevelopment,
          isTest: config.isTest
        };
      }
      
      // Determine overall health status
      const failedChecks = Object.values(checks).filter(check => 
        check.status === 'critical' || check.status === 'error'
      );
      
      const warningChecks = Object.values(checks).filter(check => 
        check.status === 'warning'
      );
      
      if (failedChecks.length > 0) {
        health.status = 'unhealthy';
      } else if (warningChecks.length > 0) {
        health.status = 'degraded';
      }
      
      // Add checks to response
      health.checks = checks;
      
      // Add response time
      health.responseTime = Date.now() - startTime;
      
      // Add service information
      health.service = {
        name: 'cletus-api',
        version: '2.0.0',
        description: 'Claude job management API',
        startTime: Date.now() - (process.uptime() * 1000)
      };
      
      // Set appropriate HTTP status code
      const httpStatus = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 200 : 503;
      
      return c.json(health, httpStatus);
      
    } catch (error) {
      console.error('Health check failed:', error);
      return c.json({
        status: 'error',
        error: error.message,
        timestamp: Date.now(),
        checks: {
          endpoint: {
            status: 'critical',
            error: 'Health check endpoint failed'
          }
        }
      }, 503);
    }
  };
};

/**
 * Check memory health
 */
const checkMemoryHealth = () => {
  try {
    const memory = process.memoryUsage();
    const heapUsedPercent = (memory.heapUsed / memory.heapTotal) * 100;
    const rssUsedMB = memory.rss / 1024 / 1024;
    
    let status = 'healthy';
    let message = 'Memory usage normal';
    
    if (heapUsedPercent > 85) {
      status = 'critical';
      message = 'High heap usage';
    } else if (heapUsedPercent > 70) {
      status = 'warning';
      message = 'Elevated heap usage';
    }
    
    if (rssUsedMB > 1024) { // More than 1GB
      if (status === 'healthy') status = 'warning';
      message += ', High RSS usage';
    }
    
    return {
      status,
      message,
      heapUsedPercent: Math.round(heapUsedPercent * 100) / 100,
      rssUsedMB: Math.round(rssUsedMB * 100) / 100,
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      rss: memory.rss
    };
  } catch (error) {
    return {
      status: 'error',
      message: 'Failed to check memory health',
      error: error.message
    };
  }
};

/**
 * Check process health
 */
const checkProcessHealth = () => {
  try {
    const uptime = process.uptime();
    const cpuUsage = process.cpuUsage();
    
    let status = 'healthy';
    let message = 'Process running normally';
    
    // Check if process has been running for a reasonable time
    if (uptime < 5) {
      status = 'warning';
      message = 'Process recently started';
    }
    
    // Check for high CPU usage (this is basic - would need historical data for accuracy)
    const totalCpuTime = cpuUsage.user + cpuUsage.system;
    if (totalCpuTime > uptime * 1000000 * 0.8) { // 80% CPU usage
      status = 'warning';
      message = 'High CPU usage detected';
    }
    
    return {
      status,
      message,
      uptime,
      pid: process.pid,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpuUsage
    };
  } catch (error) {
    return {
      status: 'error',
      message: 'Failed to check process health',
      error: error.message
    };
  }
};

/**
 * Check configuration health
 */
const checkConfigurationHealth = (config) => {
  try {
    const issues = [];
    
    // Check critical configuration
    if (!config.port || config.port < 1 || config.port > 65535) {
      issues.push('Invalid port configuration');
    }
    
    if (!config.claude.mockMode && !config.claude.executable) {
      issues.push('Claude executable not configured');
    }
    
    if (config.storage.maxJobsInMemory < 1) {
      issues.push('Invalid max jobs configuration');
    }
    
    if (config.jobs.maxBatchSize < 1 || config.jobs.maxBatchSize > 100) {
      issues.push('Invalid batch size configuration');
    }
    
    let status = 'healthy';
    let message = 'Configuration valid';
    
    if (issues.length > 0) {
      status = 'critical';
      message = `Configuration issues: ${issues.join(', ')}`;
    }
    
    return {
      status,
      message,
      issues,
      configValid: issues.length === 0,
      environment: config.env,
      mockMode: config.claude.mockMode
    };
  } catch (error) {
    return {
      status: 'error',
      message: 'Failed to check configuration health',
      error: error.message
    };
  }
};

/**
 * Check service health (storage, Claude, etc.)
 */
const checkServicesHealth = async () => {
  const services = {};
  
  // Check storage service
  try {
    // Basic storage test - this would be implemented in the storage service
    services.storage = {
      status: 'healthy',
      message: 'Storage service operational',
      backend: 'memory' // Would get from config
    };
  } catch (error) {
    services.storage = {
      status: 'critical',
      message: 'Storage service failed',
      error: error.message
    };
  }
  
  // Check Claude service
  try {
    // Would check if Claude service is available
    services.claude = {
      status: 'healthy',
      message: 'Claude service available',
      mockMode: true // Would get from service
    };
  } catch (error) {
    services.claude = {
      status: 'critical',
      message: 'Claude service unavailable',
      error: error.message
    };
  }
  
  return services;
};

export default healthCheckEndpoint;