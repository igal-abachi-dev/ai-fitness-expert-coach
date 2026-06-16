import { createAnthropic } from '@ai-sdk/anthropic';
import { createCerebras } from '@ai-sdk/cerebras';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';

import type { ProviderOptions } from '@ai-sdk/provider-utils';
import { APICallError, RetryError, type LanguageModel } from 'ai';
import type { Env } from '../../config/env.js';
import {
  PROVIDER_KEY_ENV,
  resolveModelProvider,
  stripProviderPrefix,
  type ModelProvider,
} from './provider-spec.js';

export type { ModelProvider } from './provider-spec.js';
export { resolveModelProvider, stripProviderPrefix } from './provider-spec.js';

export interface AgentCallSettings {
  /** When false, omit temperature — reasoning/thinking is controlled via providerOptions. */
  supportsTemperature: boolean;
  providerOptions?: ProviderOptions;
}

export interface AgentModelBundle extends AgentCallSettings {
  model: LanguageModel;
}

/** The three model roles the app routes between. */
export interface RoleModels {
  /** Best free structured output: the `/plan` primary. */
  quality: AgentModelBundle;
  /** High volume + the `/plan` quota-overflow fallback and `/ask`. */
  cheap: AgentModelBundle;
  /** Lowest latency: the `/chat` stream. */
  fast: AgentModelBundle;
}

export type ModelRole = keyof RoleModels;

type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

/** Deeper reasoning for `/plan`; lighter for `/ask` and `/chat`. */
function reasoningEffortForRole(role: ModelRole): ReasoningEffort {
  switch (role) {
    case 'quality':
      return 'high';
    case 'cheap':
      return 'medium';//'low'?
    case 'fast':
      return 'minimal';
  }
}

/** Providers that only accept low | medium | high (no minimal). */
function providerEffort(effort: ReasoningEffort): 'low' | 'medium' | 'high' {
  return effort === 'minimal' ? 'low' : effort;
}

/** Thought summaries are useful for deeper roles; skip them on low/minimal. */
function exposesThoughtTraces(effort: ReasoningEffort): boolean {
  return effort === 'medium' || effort === 'high';
  /*I would not do that in production.

  maybe:
process.env.AI_DEBUG_THOUGHTS === 'true' && exposesThoughtTraces(effort);

AI SDK’s Google provider docs say includeThoughts: true returns thought summaries, 
which are synthesized summaries of the model’s internal reasoning process. 
Google’s Gemini thinking docs also describe thinkingBudget / thinkingLevel as reasoning controls, 
but thought summaries are mainly useful for debugging, not normal app responses. */
}

function requireApiKey(env: Env, provider: ModelProvider): string {
  const envKey = PROVIDER_KEY_ENV[provider];
  const apiKey = env[envKey as keyof Env] as string | undefined;
  if (!apiKey) {
    // env validation guarantees this for referenced roles; keep it explicit.
    throw new Error(
      `Provider "${provider}" requires ${envKey}, but it is not set. ` +
        'Add that API key or choose a model backed by a configured provider.',
    );
  }
  return apiKey;
}

/**
 * Reasoning / thinking models reject or ignore temperature — effort is set via
 * providerOptions instead. Classic chat models keep temperature.
 */
export function isReasoningModel(
  modelId: string,
  provider: ModelProvider,
): boolean {
  const id = modelId.toLowerCase();

  switch (provider) {
    case 'google':
      return (
        id.includes('gemini-2.5') ||
        id.includes('gemini-3') ||
        id.includes('-thinking')
      );
    case 'cerebras':
    case 'groq':
      // Open-weight reasoning families served by both providers.
      return (
        id.includes('gpt-oss') ||
        id.includes('reasoning') ||
        id.includes('deepseek-r1') ||
        /qwen3?-.*(thinking|reason)/.test(id)
      );
    case 'xai':
      return /^grok-[34]/.test(id) || id.includes('reasoning');
    case 'anthropic':
      return (
        /claude-(opus|sonnet|haiku|fable)-[45]/.test(id) ||
        id.includes('claude-opus-4') ||
        id.includes('claude-sonnet-4') ||
        id.includes('claude-haiku-4')
      );
    case 'openai':
      return id.startsWith('o3') || id.startsWith('o4') || /^gpt-5/.test(id);
  }
}

function buildGoogleThinkingConfig(
  modelId: string,
  role: ModelRole,
): {
  thinkingLevel?: ReasoningEffort;
  thinkingBudget?: number;
  includeThoughts: boolean;
} {
  const effort = reasoningEffortForRole(role);
  const includeThoughts = exposesThoughtTraces(effort);
  const id = modelId.toLowerCase();

  // Gemini 3.x: thinkingLevel. Gemini 2.5: thinkingBudget (0 off, -1 dynamic).
  if (id.includes('gemini-3')) {
    return { thinkingLevel: effort, includeThoughts };
  }

  const thinkingBudget =
    effort === 'high' ? -1 : effort === 'medium' ? 4096 : 0;

  return { thinkingBudget, includeThoughts };
}

function buildReasoningProviderOptions(
  provider: ModelProvider,
  modelId: string,
  role: ModelRole,
): ProviderOptions {
  const roleEffort = reasoningEffortForRole(role);
  const effort = providerEffort(roleEffort);
  const thoughtTraces = exposesThoughtTraces(roleEffort);

  switch (provider) {
    case 'google':
      return {
        google: {
          thinkingConfig: buildGoogleThinkingConfig(modelId, role),
        },
      };
    case 'cerebras':
    case 'groq':
      // OpenAI-compatible reasoning knob (gpt-oss et al.).
      return { [provider]: { reasoningEffort: effort } };
    case 'xai':
      return { xai: { reasoningEffort: effort === 'high' ? 'high' : 'low', } };
    case 'anthropic':
      return {
        anthropic: {
          thinking: { type: 'adaptive' },
          effort,
        },
      };
    case 'openai':
      return {
        openai: {
          reasoningEffort: effort,
          ...(thoughtTraces
            ? {
                reasoningSummary:
                  roleEffort === 'high' ? 'detailed' : 'auto',
              }
            : {}),
        },
      };
  }
}

export function callSettingsFor(
  modelId: string,
  provider: ModelProvider,
  role: ModelRole,
): AgentCallSettings {
  if (isReasoningModel(modelId, provider)) {
    return {
      supportsTemperature: provider === 'google',
      providerOptions: buildReasoningProviderOptions(provider, modelId, role),
    };
  }
  return { supportsTemperature: true };
}

/**
 * The single place where concrete providers are constructed.
 *
 * We deliberately pass `apiKey` explicitly (instead of default exports that
 * silently read process.env) — configuration flows from the typed `Env`.
 * Everything else depends only on the provider-neutral `LanguageModel` type,
 * so swapping a model is an env change, never a code change.
 */
function buildModel(
  provider: ModelProvider,
  modelId: string,
  apiKey: string,
): LanguageModel {
  switch (provider) {
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(modelId);
    case 'cerebras':
      return createCerebras({ apiKey })(modelId);
    case 'groq':
      return createGroq({ apiKey })(modelId);
    case 'xai':
      return createXai({ apiKey })(modelId);
    case 'anthropic':
      return createAnthropic({ apiKey })(modelId);
    case 'openai':
      return createOpenAI({ apiKey })(modelId);
  }
}

/** Builds one role's model + per-call settings from a `"<provider>/<id>"` spec. */
export function createModelBundle(
  spec: string,
  env: Env,
  role: ModelRole,
): AgentModelBundle {
  const provider = resolveModelProvider(spec);
  const modelId = stripProviderPrefix(spec, provider);
  const apiKey = requireApiKey(env, provider);
  return {
    model: buildModel(provider, modelId, apiKey),
    ...callSettingsFor(modelId, provider, role),
  };
}

/** Builds all three role bundles from the env (roles fall back to AGENT_MODEL). */
export function createModels(env: Env): RoleModels {
  return {
    quality: createModelBundle(
      env.QUALITY_MODEL || env.AGENT_MODEL,
      env,
      'quality',
    ),
    cheap: createModelBundle(env.CHEAP_MODEL || env.AGENT_MODEL, env, 'cheap'),
    fast: createModelBundle(env.FAST_MODEL || env.AGENT_MODEL, env, 'fast'),
  };
}

/**
 * True when an error is (or wraps) a provider rate-limit (HTTP 429) — the
 * `/plan` overflow signal. The AI SDK wraps retried failures in a RetryError,
 * so we unwrap that too.
 */
export function isRateLimitError(error: unknown): boolean {
  if (APICallError.isInstance(error)) {
    return error.statusCode === 429;
  }
  if (RetryError.isInstance(error)) {
    return error.errors.some(
      (e) => APICallError.isInstance(e) && e.statusCode === 429,
    );
  }
  return false;
}
