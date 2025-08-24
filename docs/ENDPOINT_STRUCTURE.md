# Cletus API Endpoint Structure 🗂️

The API has been reorganized into a granular, endpoint-based architecture where each HTTP endpoint is in its own file, organized by responsibility and domain.

## 📁 New Directory Structure

```
cletus/api/endpoints/
├── index.js                 # Main endpoints export
├── jobs/                    # Job management endpoints
│   ├── index.js            # Job endpoints export
│   ├── create-job.js       # POST /prompt
│   ├── get-job.js          # GET /jobs/:id
│   ├── list-jobs.js        # GET /jobs
│   ├── terminate-job.js    # POST /jobs/:id/terminate
│   ├── delete-job.js       # DELETE /jobs/:id
│   ├── get-job-output.js   # GET /jobs/:id/output
│   └── get-job-stream.js   # GET /jobs/:id/stream
├── batch/                   # Batch processing endpoints
│   ├── index.js            # Batch endpoints export
│   ├── create-batch.js     # POST /batch
│   ├── get-batch-status.js # GET /batch/:jobIds/status
│   ├── terminate-batch.js  # POST /batch/:jobIds/terminate
│   ├── delete-batch.js     # DELETE /batch/:jobIds
│   └── get-batch-limits.js # GET /batch/limits
├── system/                  # System/admin endpoints
│   ├── index.js            # System endpoints export
│   ├── get-stats.js        # GET /stats
│   └── cleanup.js          # POST /cleanup
└── health/                  # Health/status endpoints
    ├── index.js            # Health endpoints export
    ├── health-check.js     # GET /health
    └── status.js           # GET /
```

## 🎯 Benefits of New Structure

### 1. **Single Responsibility**
- Each endpoint file handles exactly one HTTP route
- Clear separation between different operations
- Easy to locate and modify specific functionality

### 2. **Enhanced Features Per Endpoint**
- **Advanced Input Validation**: Each endpoint has comprehensive validation
- **Enhanced Error Handling**: Specific error messages for each operation
- **Query Parameter Support**: Rich filtering and pagination options
- **Better Documentation**: Self-documenting code with clear parameter descriptions

### 3. **Maintainability**
- Changes to one endpoint don't affect others
- Easy to add new endpoints without modifying existing files
- Clear dependency injection pattern for testing

### 4. **Developer Experience**
- Predictable file naming: `{verb}-{resource}.js`
- Easy navigation: endpoint maps directly to file location
- Consistent patterns across all endpoints

## 📋 Endpoint Enhancements

### Job Endpoints
- **create-job.js**: Enhanced prompt validation (length, format), job option validation
- **list-jobs.js**: Pagination support, status filtering, date range filtering
- **get-job-output.js**: Output type filtering, pagination for large outputs
- **get-job-stream.js**: Live streaming with incremental updates, metadata

### Batch Endpoints  
- **create-batch.js**: Batch-specific validations, priority support, concurrency control
- **get-batch-status.js**: Rich batch statistics, completion rates, duration tracking
- **terminate-batch.js**: Force termination options, wait for completion, timeout handling
- **delete-batch.js**: Force deletion, output preservation, verification checks

### System Endpoints
- **get-stats.js**: Detailed system metrics, health indicators, performance data
- **cleanup.js**: Multiple cleanup modes (safe/aggressive/force), dry-run support

### Health Endpoints
- **health-check.js**: Comprehensive health monitoring, service dependency checks
- **status.js**: Basic service status with minimal overhead

## 🔧 Usage Examples

### Import Specific Endpoints
```javascript
import { createJobEndpoint } from './api/endpoints/jobs/create-job.js';
import { getBatchStatusEndpoint } from './api/endpoints/batch/get-batch-status.js';

// Use with dependency injection
app.post('/prompt', createJobEndpoint({ jobService: myJobService }));
```

### Import Entire Domains
```javascript
import jobsEndpoints from './api/endpoints/jobs/index.js';
import batchEndpoints from './api/endpoints/batch/index.js';

// Use organized endpoints
app.post('/prompt', jobsEndpoints.createJob());
app.post('/batch', batchEndpoints.createBatch());
```

### Import All Endpoints
```javascript
import endpoints from './api/endpoints/index.js';

// Access by domain
app.post('/prompt', endpoints.jobs.createJob());
app.get('/health', endpoints.health.healthCheck());
```

## 🚀 Migration from Controller-Based Architecture

### Before (Controller-Based)
```
api/controllers/
├── jobs.js          # All job endpoints in one file
└── batch.js         # All batch endpoints in one file
```

### After (Endpoint-Based)
```
api/endpoints/
├── jobs/            # Each job endpoint in its own file
├── batch/           # Each batch endpoint in its own file
├── system/          # System endpoints separated
└── health/          # Health endpoints separated
```

## 📈 Scalability Benefits

1. **Team Collaboration**: Multiple developers can work on different endpoints simultaneously
2. **Feature Flags**: Easy to disable specific endpoints without affecting others
3. **Performance**: Selective imports reduce bundle size in specific environments
4. **Testing**: Easier to write focused tests for individual endpoints
5. **Monitoring**: Better granular monitoring and logging per endpoint
6. **Security**: Fine-grained security controls per endpoint

## 🔍 Code Organization Patterns

Each endpoint file follows this pattern:
```javascript
// Import dependencies
import { getJobService } from '../../services/job-service.js';

// Export endpoint factory function
export const endpointNameEndpoint = (options = {}) => {
  const service = options.service || getDefaultService();
  
  return async (c) => {
    // 1. Input validation
    // 2. Business logic
    // 3. Error handling
    // 4. Response formatting
  };
};

export default endpointNameEndpoint;
```

This new structure provides a clean, scalable foundation for the Cletus API that can grow and adapt as requirements evolve.