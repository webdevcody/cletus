// Configuration module for Cletus API
// Supports environment-based configuration and mock modes for testing

const getConfig = () => {
  const config = {
    // Server configuration
    port: parseInt(process.env.PORT || process.env.CLETUS_PORT || '1337'),
    
    // Claude configuration
    claude: {
      executable: process.env.CLAUDE_EXECUTABLE || '/Users/webdevcody/.claude/local/claude',
      mockMode: process.env.CLAUDE_MOCK_MODE === 'true',
      defaultModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
      headlessMode: process.env.CLAUDE_HEADLESS !== 'false', // Default true
      dangerouslySkipPermissions: process.env.CLAUDE_SKIP_PERMISSIONS !== 'false', // Default true
      outputFormat: process.env.CLAUDE_OUTPUT_FORMAT || 'stream-json',
      verbose: process.env.CLAUDE_VERBOSE === 'true',
    },
    
    // Storage configuration
    storage: {
      backend: process.env.STORAGE_BACKEND || 'memory', // memory, file, redis
      maxJobsInMemory: parseInt(process.env.MAX_JOBS_IN_MEMORY || '1000'),
      maxOutputChunks: parseInt(process.env.MAX_OUTPUT_CHUNKS || '1000'),
      persistenceDir: process.env.PERSISTENCE_DIR || './data',
    },
    
    // Job processing configuration
    jobs: {
      maxBatchSize: parseInt(process.env.MAX_BATCH_SIZE || '10'),
      defaultTimeout: parseInt(process.env.JOB_TIMEOUT || '300000'), // 5 minutes
      cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL || '3600000'), // 1 hour
      retentionPeriod: parseInt(process.env.RETENTION_PERIOD || '86400000'), // 24 hours
    },
    
    // Logging configuration
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      colorize: process.env.LOG_COLORIZE !== 'false', // Default true
      timestamp: process.env.LOG_TIMESTAMP !== 'false', // Default true
    },
    
    // Test configuration
    test: {
      mockResponseDelay: parseInt(process.env.MOCK_RESPONSE_DELAY || '100'),
      mockResponseFile: process.env.MOCK_RESPONSE_FILE,
    },
    
    // Environment
    env: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',
    isTest: process.env.NODE_ENV === 'test',
    isDevelopment: process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test',
  };
  
  // Validate configuration
  validateConfig(config);
  
  return config;
};

const validateConfig = (config) => {
  // Validate port
  if (config.port < 1 || config.port > 65535) {
    throw new Error(`Invalid port number: ${config.port}`);
  }
  
  // Validate storage backend
  const validBackends = ['memory', 'file', 'redis'];
  if (!validBackends.includes(config.storage.backend)) {
    throw new Error(`Invalid storage backend: ${config.storage.backend}`);
  }
  
  // Validate Claude executable (only if not in mock mode)
  if (!config.claude.mockMode && !config.claude.executable) {
    throw new Error('Claude executable path is required when not in mock mode');
  }
  
  // Validate log level
  const validLogLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLogLevels.includes(config.logging.level)) {
    throw new Error(`Invalid log level: ${config.logging.level}`);
  }
};

// Create singleton config instance
let configInstance = null;

export const initConfig = () => {
  if (!configInstance) {
    configInstance = getConfig();
  }
  return configInstance;
};

export const getConfigInstance = () => {
  if (!configInstance) {
    configInstance = getConfig();
  }
  return configInstance;
};

// For testing - allow config reset
export const resetConfig = () => {
  configInstance = null;
};

// Export default config getter
export default getConfigInstance;