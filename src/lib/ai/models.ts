import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';
import type { Env } from '../../config/env.js';

/**
 * The single place where a concrete provider is constructed.
 *
 * We deliberately use `createAnthropic({ apiKey })` instead of the default
 * `anthropic` export (which silently reads process.env) — configuration
 * flows explicitly from `Env`.
 *
 * Everything else in the app depends only on the provider-neutral
 * `LanguageModel` type, so swapping to OpenAI / Google / a gateway string
 * is a one-line change here.
 */
export function createAgentModel(env: Env): LanguageModel {
  const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return anthropic(env.AGENT_MODEL);
}
