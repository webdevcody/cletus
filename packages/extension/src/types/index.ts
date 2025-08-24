// Job and API types
export interface Job {
  id: string;
  color: string | null;
  text: string;
  startedAt: number;
  finishedAt: number | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'offline';
  prompt: string;
  sourceUrl: string | null;
  sourceTab: number | null;
}

export interface JobOutput {
  chunks: Array<{
    type: 'stdout' | 'stderr' | 'error' | 'system';
    text: string;
    timestamp: number;
  }>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  lastUpdate: number;
}

// Context types from content script
export interface PageContext {
  path: string;
  url: string;
  title?: string;
  selection?: string;
  components?: string[];
}

// API request/response types
export interface CreateJobRequest {
  prompt: string;
  jobId: string;
  options: {
    model: string;
  };
}

export interface CreateJobResponse {
  jobId: string;
  status: string;
}

export interface JobsResponse {
  jobs: Job[];
}

// Chrome extension storage types
export interface ExtensionSettings {
  localAgentUrl?: string;
  localAgentAuthToken?: string;
}

export interface TrackedJobs {
  trackedJobs?: Array<[string, Job]>;
}

// Component prop types
export interface JobItemProps {
  job: Job;
  isSelected?: boolean;
  onSelect: (jobId: string) => void;
  onDismiss: (jobId: string) => void;
  onNavigate: (jobId: string) => void;
}

export interface OutputPanelProps {
  jobId: string | null;
  job: Job | null;
  onClose: () => void;
}

// Chrome extension message types
export interface ContentScriptMessage {
  type: 'collectContext';
}

export interface ContentScriptResponse {
  ok: boolean;
  context?: PageContext;
  error?: string;
}

// Model options
export type ModelType = 'claude-3-5-haiku-20241022' | 'claude-sonnet-4-20250514' | 'claude-opus-4-1-20250805';

export interface ModelOption {
  value: ModelType;
  label: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  { value: 'claude-3-5-haiku-20241022', label: 'Haiku 3.5 (Fast)' },
  { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4 (Balanced)' },
  { value: 'claude-opus-4-1-20250805', label: 'Opus 4.1 (Best)' },
];

// Utility types
export type JobStatus = Job['status'];
export type ChunkType = JobOutput['chunks'][number]['type'];