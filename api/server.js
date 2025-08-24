// Cletus API Server - Refactored entry point
// A professional Claude job management API with clean architecture

import { getApp } from './app.js';
import { initConfig } from './config/index.js';

// Initialize configuration
const config = initConfig();

// Create app instance
const app = getApp();

// Log startup information
console.log('\n🤖 Cletus API Server v2.0.0');
console.log('========================================');
console.log(`Environment: ${config.env}`);
console.log(`Claude Mode: ${config.claude.mockMode ? 'MOCK' : 'REAL'}`);
console.log(`Storage Backend: ${config.storage.backend}`);
console.log(`Max Batch Size: ${config.jobs.maxBatchSize}`);
console.log(`Port: ${config.port}`);
console.log('========================================\n');

// Start the server
console.log(`🚀 Server starting on port ${config.port}...`);

try {
  Bun.serve({
    port: config.port,
    fetch: app.fetch,
  });
  
  console.log(`✅ Server running on http://localhost:${config.port}`);
  console.log(`📊 Health check: http://localhost:${config.port}/health`);
  
  if (!config.isProduction) {
    console.log(`🔧 Config endpoint: http://localhost:${config.port}/config`);
  }
  
  console.log('\n💡 Ready to process Claude jobs!');
  
} catch (error) {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
}

// Graceful shutdown handling
const shutdown = async (signal) => {
  console.log(`\n📤 Received ${signal}, shutting down gracefully...`);
  
  try {
    // Here you could add cleanup logic like:
    // - Cancel running jobs
    // - Save state to disk
    // - Close database connections
    
    console.log('✅ Cleanup completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

// Handle process signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

export default app;