import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import { buildApp } from '../app.js';
import { loadEnv } from '../config/env.js';
import {
  createInMemoryExerciseLibrary,
  seedExercises,
} from '../features/coach/tools/exercise-library.tool.js';

const finishReason = { unified: 'stop', raw: undefined } as const;

const usage = {
  inputTokens: { total: 10, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

/** Mock model that answers `text` without calling any tools. */
export function textOnlyModel(text: string) {
  const streamParts: LanguageModelV3StreamPart[] = [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: '1' },
    { type: 'text-delta', id: '1', delta: text },
    { type: 'text-end', id: '1' },
    { type: 'finish', finishReason, usage },
  ];
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason,
      usage,
      warnings: [],
    }),
    doStream: async () => ({
      stream: convertArrayToReadableStream(streamParts),
    }),
  });
}

/**
 * Mock model that returns a different response on each successive call.
 * Useful for testing the plan repair loop (first call invalid, second valid).
 */
export function scriptedModel(...texts: string[]) {
  let i = 0;
  const next = () => texts[Math.min(i++, texts.length - 1)] ?? '';
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text', text: next() }],
      finishReason,
      usage,
      warnings: [],
    }),
  });
}

/** The whole point of buildApp(deps): tests swap the model, nothing else. */
export function buildTestApp(model = textOnlyModel('mock answer')) {
  return buildApp({
    env: loadEnv({
      NODE_ENV: 'test',
      ANTHROPIC_API_KEY: 'test-key',
      LOG_LEVEL: 'fatal',
    }),
    model,
    exerciseLibrary: createInMemoryExerciseLibrary(seedExercises),
  });
}
