# Cletus API v2.0.0 🤖

A professional Claude job management API with clean architecture, comprehensive testing, and modular design.

## ✨ What's New in v2.0.0

- **Clean Architecture**: Modular design with proper separation of concerns
- **Comprehensive Testing**: Full integration test suite with mock support
- **Configuration-Based**: Environment-driven configuration with mock modes
- **Professional Logging**: Colored, structured logging with job tracking
- **Type Safety**: Better error handling and input validation
- **Dependency Injection**: Testable components with clean interfaces

## 🚀 Quick Start

### Development Mode
```bash
# Install dependencies
bun install

# Start development server (with hot reload)
bun run dev
```

### Production Mode
```bash
# Start production server
bun run start
```

### Testing
```bash
# Run all tests
bun run test

# Run with coverage
bun run test:coverage

# Run in watch mode
bun run test:watch

# Run only integration tests
bun run test:integration
```

## 🏗️ Architecture Overview

```
cletus/
├── api/
│   ├── server.js              # Entry point
│   ├── app.js                 # Main Hono application
│   ├── config/
│   │   └── index.js           # Configuration management
│   ├── controllers/           # HTTP request handlers
│   │   ├── jobs.js
│   │   └── batch.js
│   ├── services/              # Business logic
│   │   ├── job-service.js
│   │   ├── claude-service.js
│   │   └── storage-service.js
│   ├── utils/                 # Utilities
│   │   ├── color.js
│   │   └── output-parser.js
│   └── middleware/            # HTTP middleware
│       └── cors.js
├── tests/                     # Test suite
│   ├── setup.js
│   ├── integration/
│   │   ├── jobs.test.js
│   │   ├── batch.test.js
│   │   └── fixtures/
│   └── unit/
└── .env.example               # Environment template
```

## 🔧 Configuration

Copy `.env.example` to `.env` and customize:

```bash
# Server
PORT=1337
NODE_ENV=development

# Claude Configuration
CLAUDE_EXECUTABLE=/path/to/claude
CLAUDE_MOCK_MODE=false          # Set to true for testing
CLAUDE_MODEL=claude-sonnet-4-20250514

# Storage & Performance
STORAGE_BACKEND=memory
MAX_BATCH_SIZE=10
MAX_JOBS_IN_MEMORY=1000

# Logging
LOG_LEVEL=info
LOG_COLORIZE=true
```

## 📡 API Endpoints

### Job Management
- `POST /prompt` - Create a single job
- `GET /jobs` - List all jobs (with optional filters)
- `GET /jobs/:id` - Get job details
- `GET /jobs/:id/output` - Get complete job output
- `GET /jobs/:id/stream` - Get live job output stream
- `POST /jobs/:id/terminate` - Terminate running job
- `DELETE /jobs/:id` - Delete completed job

### Batch Processing
- `POST /batch` - Create multiple jobs
- `GET /batch/:jobIds/status` - Get status of multiple jobs
- `POST /batch/:jobIds/terminate` - Terminate multiple jobs
- `DELETE /batch/:jobIds` - Delete multiple jobs
- `GET /batch/limits` - Get batch processing limits

### System
- `GET /health` - Health check
- `GET /stats` - Service statistics
- `POST /cleanup` - Clean up old jobs

## 🧪 Testing Features

### Mock Mode
Set `CLAUDE_MOCK_MODE=true` to use mock Claude responses for testing:

```bash
# Test with mocks
CLAUDE_MOCK_MODE=true bun run dev
```

### Test Suite
- **Integration Tests**: Full API endpoint testing with mocked Claude
- **Unit Tests**: Individual component testing
- **Fixtures**: Predefined mock responses for different scenarios
- **Coverage**: Test coverage reporting

### Test Commands
```bash
bun run test              # All tests
bun run test:integration  # API tests only
bun run test:unit        # Unit tests only
bun run test:coverage    # With coverage
bun run test:watch       # Watch mode
```

## 🎯 Usage Examples

### Create a Job
```bash
curl -X POST http://localhost:1337/prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Write a hello world program"}'
```

### Create Batch Jobs
```bash
curl -X POST http://localhost:1337/batch \
  -H "Content-Type: application/json" \
  -d '{
    "prompts": [
      "Create a React component",
      "Write unit tests",
      "Add documentation"
    ],
    "options": {
      "model": "claude-sonnet-4-20250514"
    }
  }'
```

### Monitor Job Progress
```bash
# Get job details
curl http://localhost:1337/jobs/job_123

# Get live output stream
curl http://localhost:1337/jobs/job_123/stream

# Get output since timestamp
curl http://localhost:1337/jobs/job_123/stream?since=1640995200000
```

## 🔍 Key Improvements

1. **Modularity**: Clean separation between controllers, services, and utilities
2. **Testability**: Dependency injection allows easy mocking and testing
3. **Configuration**: Environment-based config with validation
4. **Error Handling**: Comprehensive error handling and validation
5. **Logging**: Professional logging with job tracking and colors
6. **Performance**: Optimized memory usage and cleanup routines
7. **Documentation**: Self-documenting code with clear interfaces

## 🚦 Migration from v1.0.0

The refactored API maintains backward compatibility with the original endpoints. The main server.js file has been completely rewritten but preserves the same HTTP interface.

### Breaking Changes
- Internal architecture completely redesigned
- Configuration now uses environment variables
- Logging format improved
- Some internal timing may differ due to optimizations

### Compatible
- All HTTP endpoints unchanged
- Request/response formats identical
- Job ID format preserved
- WebSocket-style streaming maintained

## 📊 Performance & Monitoring

- **Memory Management**: Automatic cleanup of old jobs and output streams
- **Concurrent Processing**: Multiple jobs processed simultaneously
- **Resource Limits**: Configurable limits for jobs and memory usage
- **Health Monitoring**: Built-in health checks and statistics

## 🤝 Contributing

1. Run tests: `bun run test`
2. Check coverage: `bun run test:coverage`
3. Follow the modular architecture patterns
4. Add tests for new features

## 📜 License

MIT License - see LICENSE file for details.