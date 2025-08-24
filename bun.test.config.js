// Bun test configuration for Cletus API

export default {
  // Test environment setup
  env: {
    NODE_ENV: 'test',
    CLAUDE_MOCK_MODE: 'true',
    LOG_LEVEL: 'error',
    MOCK_RESPONSE_DELAY: '10'
  },
  
  // Test file patterns
  testRegex: [
    'tests/**/*.test.js'
  ],
  
  // Setup files
  preload: [
    './tests/setup.js'
  ],
  
  // Test timeout
  timeout: 10000, // 10 seconds
  
  // Parallel execution
  concurrency: 4,
  
  // Coverage configuration
  coverage: {
    enabled: true,
    dir: './coverage',
    include: [
      'api/**/*.js'
    ],
    exclude: [
      'tests/**',
      'node_modules/**',
      'coverage/**',
      '*.config.js'
    ],
    reporter: ['text', 'html', 'lcov']
  }
};