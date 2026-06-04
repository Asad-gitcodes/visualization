export interface PerfRow {
  batchSize: number;
  maxMs: number;
  targetMaxMs: number;
  promptOnlyThroughput: number;
  genOnlyThroughput: number;
  throughput: number;
  throughputPerBox: number;
  uncachedThroughput: number;
  uncachedThroughputPerBox: number;
  cachedThroughput: number;
  cachedThroughputPerBox: number;
  ttftMs: number;
  realPromptSpeed: number;
  promptSpeedWithQueueing: number;
  genSpeed: number;
  rpm: number;
}

export interface PerfProfile {
  model: string;
  profile: string;
  profileNum: string;
  inputLength: number;
  outputLength: number;
  cachePercent: number;
  fileName: string;
  rows: PerfRow[];
}

/**
 * null means "use per-profile default"; a number means the user has explicitly
 * overridden the threshold. We use null rather than a sentinel value so that
 * typing the per-profile default value in the input still behaves as an override.
 */
export interface GoNoGoThresholds {
  maxTtftMs: number | null;
  minGenSpeedTps: number | null;
}
