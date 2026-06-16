/** Default cap for /ask — enough for a short paragraph, not a mini-article. */
export const ASK_MAX_OUTPUT_TOKENS = 1500;

/** Tighter cap when the user signals they want a minimal answer. */
export const ASK_CONCISE_MAX_OUTPUT_TOKENS = 600;//500

const CONCISE_ANSWER_PATTERN =
  /\b(one sentence|brief|short|concise|quick|tl;dr|in one line)\b/i;

/** True when the prompt explicitly asks for a minimal answer. */
export function wantsConciseAnswer(prompt: string): boolean {
  return CONCISE_ANSWER_PATTERN.test(prompt);
}

/** Per-request output cap for /ask based on prompt intent. */
export function maxOutputTokensForAsk(prompt: string): number {
  return wantsConciseAnswer(prompt)
    ? ASK_CONCISE_MAX_OUTPUT_TOKENS
    : ASK_MAX_OUTPUT_TOKENS;
}
