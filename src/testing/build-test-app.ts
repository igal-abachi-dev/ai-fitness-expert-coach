import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { APICallError, type LanguageModel } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import { buildApp } from '../app.js';
import { loadEnv } from '../config/env.js';
import type { RoleModels } from '../lib/ai/models.js';
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

function providerErrorModel(statusCode: number, message: string) {
  return new MockLanguageModelV3({
    doGenerate: async () => {
      throw new APICallError({
        message,
        url: 'https://mock/generate',
        requestBodyValues: {},
        statusCode,
        isRetryable: statusCode === 503,
      });
    },
  });
}

/** A mock whose generate call always throws a provider 429 (quota exhausted). */
export function rateLimitedModel() {
  return providerErrorModel(429, 'rate limited');
}

/** A mock whose generate call always throws a provider 503 (high demand). */
export function providerUnavailableModel() {
  return providerErrorModel(
    503,
    'This model is currently experiencing high demand.',
  );
}

const testEnv = loadEnv({
  NODE_ENV: 'test',
  // All roles resolve to anthropic so a single key satisfies validation; the
  // real models are never constructed because we inject mocks below.
  ANTHROPIC_API_KEY: 'test-key',
  QUALITY_MODEL: 'anthropic/claude-test',
  CHEAP_MODEL: 'anthropic/claude-test',
  FAST_MODEL: 'anthropic/claude-test',
  LOG_LEVEL: 'fatal',
});

function asRoleModels(models: {
  quality: LanguageModel;
  cheap?: LanguageModel;
  fast?: LanguageModel;
}): RoleModels {
  const wrap = (model: LanguageModel) => ({ model, supportsTemperature: true });
  return {
    quality: wrap(models.quality),
    cheap: wrap(models.cheap ?? models.quality),
    fast: wrap(models.fast ?? models.quality),
  };
}

/** The whole point of buildApp(deps): tests swap the model, nothing else. */
export function buildTestApp(model = textOnlyModel('mock answer')) {
  return buildApp({
    env: testEnv,
    models: asRoleModels({ quality: model }),
    exerciseLibrary: createInMemoryExerciseLibrary(seedExercises),
  });
}

/** Build the app with distinct per-role mocks (e.g. to exercise /plan overflow). */
export function buildTestAppWithRoles(models: {
  quality: LanguageModel;
  cheap?: LanguageModel;
  fast?: LanguageModel;
}) {
  return buildApp({
    env: testEnv,
    models: asRoleModels(models),
    exerciseLibrary: createInMemoryExerciseLibrary(seedExercises),
  });
}
