// Main endpoints index - Export all endpoint modules

// Individual endpoint exports for direct access
export {
  // Job endpoints
  createJobEndpoint,
  getJobEndpoint,
  listJobsEndpoint,
  terminateJobEndpoint,
  deleteJobEndpoint,
  getJobOutputEndpoint,
  getJobStreamEndpoint
} from './jobs/index.js';

export {
  // Batch endpoints
  createBatchEndpoint,
  getBatchStatusEndpoint,
  terminateBatchEndpoint,
  deleteBatchEndpoint,
  getBatchLimitsEndpoint
} from './batch/index.js';

export {
  // System endpoints
  getStatsEndpoint,
  cleanupEndpoint
} from './system/index.js';

export {
  // Health endpoints
  healthCheckEndpoint,
  statusEndpoint
} from './health/index.js';