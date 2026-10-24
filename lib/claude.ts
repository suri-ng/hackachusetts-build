// Server-side Claude multimodal assessment + seeded fallback on error/timeout.
// Implemented in Task 4.7 (Req 8.1, 8.2, 8.3, 13.1).

export interface ClaudeResult {
  confidence: number;
  rationale: string;
}

/**
 * Submits before + after together to the Claude multimodal model (server-side).
 * On error OR timeout, returns a deterministic SEEDED fallback so the pipeline
 * always reaches completion (Req 8.3).
 */
export function assessWithClaude(
  _before: Buffer,
  _after: Buffer,
  _opts?: { timeoutMs?: number },
): Promise<ClaudeResult> {
  throw new Error('not_implemented: assessWithClaude (Task 4.7)');
}
