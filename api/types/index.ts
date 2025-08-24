// TypeScript type definitions for Cletus API

export interface ClaudeConfig {
  executable: string;
  mockMode: boolean;
  defaultModel: string;
  headlessMode: boolean;
  dangerouslySkipPermissions: boolean;
  outputFormat: string;
  verbose: boolean;
}

export interface StorageConfig {
  backend: 'memory' | 'file' | 'redis';
  maxJobsInMemory: number;
  maxOutputChunks: number;
  persistenceDir: string;
}

export interface JobsConfig {
  maxBatchSize: number;
  defaultTimeout: number;
  cleanupInterval: number;
  retentionPeriod: number;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  colorize: boolean;
  timestamp: boolean;
}

export interface TestConfig {
  mockResponseDelay: number;
  mockResponseFile?: string;
}

export interface AppConfig {
  port: number;
  claude: ClaudeConfig;
  storage: StorageConfig;
  jobs: JobsConfig;
  logging: LoggingConfig;
  test: TestConfig;
  env: string;
  isProduction: boolean;
  isTest: boolean;
  isDevelopment: boolean;
}

export interface Job {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'terminated';
  prompt: string;
  options?: any;
  progress?: string;
  completeMessage?: string;
  model?: string;
  startedAt: number;
  finishedAt?: number | null;
  createdAt?: number;
  updatedAt?: number;
  completedAt?: number;
  output?: string;
  error?: string;
  exitCode?: number;
  outputChunks?: string[];
  color?: string;
}

export interface BatchJob {
  batchId: string;
  jobIds: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'terminated';
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface JobCreationRequest {
  prompt: string;
  model?: string;
  timeout?: number;
}

export interface BatchCreationRequest {
  prompts: Array<{
    prompt: string;
    model?: string;
  }>;
  timeout?: number;
}

export interface AppOptions {
  [key: string]: any;
}

export type JobStatus = Job['status'];
export type BatchStatus = BatchJob['status'];