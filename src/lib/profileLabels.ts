/**
 * Human-readable labels for the 7 known traffic profiles.
 * Lives here (presentation layer) rather than in the parser.
 * Unknown profile numbers fall back to "Profile N" automatically.
 */
export const PROFILE_LABELS: Record<string, string> = {
  "1": "P1 · Long-ctx RAG (10K in / 333 out / 50% cache)",
  "2": "P2 · Long-form Gen (10K in / 4K out / no cache)",
  "3": "P3 · Balanced (3.2K in / 400 out / 50% cache)",
  "4": "P4 · Conversational (1K in / 1K out / 50% cache)",
  "5": "P5 · Doc Processing (8K in / 1K out / 50% cache)",
  "6": "P6 · Large-Doc Analysis (60K in / 200 out / 90% cache)",
  "7": "P7 · Complex Gen (17K in / 3.5K out / 70% cache)",
};

export function profileLabel(num: string): string {
  return PROFILE_LABELS[num] ?? `Profile ${num}`;
}

/**
 * Per-profile TTFT SLO guidance (ms).
 * Rationale:
 *   P1/P6 (RAG / doc-analysis): user waits for a retrieval result → 200ms tolerable
 *   P2/P7 (long-form gen): streaming; first token must feel instant → 50ms
 *   P3/P4 (balanced / conversational): chat-like; 30ms is the threshold where latency feels perceptible
 *   P5 (doc processing): batch-ish; 100ms acceptable
 */
export const PROFILE_TTFT_SLO: Record<string, number> = {
  "1": 200,
  "2": 50,
  "3": 30,
  "4": 30,
  "5": 100,
  "6": 200,
  "7": 50,
};

/**
 * Per-profile minimum generation speed SLO (tokens/s/user).
 * Rationale:
 *   Human reading speed ≈ 200–250 wpm ≈ 15–20 t/s.
 *   For interactive use (P3/P4) we target 3× reading speed = ~50 t/s.
 *   For streaming long-form (P2/P7) we target 2× = ~30 t/s (buffering acceptable).
 *   For doc/RAG (P1/P5/P6) speed is less visible to end user; 20 t/s sufficient.
 */
export const PROFILE_GEN_SPEED_SLO: Record<string, number> = {
  "1": 20,
  "2": 30,
  "3": 50,
  "4": 50,
  "5": 20,
  "6": 20,
  "7": 30,
};
