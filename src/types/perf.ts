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

export interface GoNoGoThresholds {
  maxTtftMs: number;
  minGenSpeedTps: number;
}

export const DEFAULT_THRESHOLDS: GoNoGoThresholds = {
  maxTtftMs: 50,
  minGenSpeedTps: 100,
};
