import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';

import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { LanguageModel } from 'ai';
import type { Env } from '../../config/env.js';

export type ModelProvider = 'google' | 'xai' | 'anthropic' | 'openai';

const PROVIDER_PREFIXES: readonly ModelProvider[] = [
  'google',
  'xai',
  'anthropic',
  'openai',
];

const PROVIDER_ENV_KEYS: Record<
  ModelProvider,
  keyof Pick<
    Env,
    | 'GOOGLE_GENERATIVE_AI_API_KEY'
    | 'XAI_API_KEY'
    | 'ANTHROPIC_API_KEY'
    | 'OPENAI_API_KEY'
  >
> = {
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  xai: 'XAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};

export interface AgentCallSettings {
  /** When false, omit temperature — reasoning/thinking is controlled via providerOptions. */
  supportsTemperature: boolean;
  providerOptions?: ProviderOptions;
}

export interface AgentModelBundle extends AgentCallSettings {
  model: LanguageModel;
}

/**
 * Resolves which provider owns `AGENT_MODEL`.
 * Accepts `provider/model-id` or bare ids that match known families.
 */
export function resolveModelProvider(modelName: string): ModelProvider {
  const prefixed = PROVIDER_PREFIXES.find((provider) =>
    modelName.startsWith(`${provider}/`),
  );
  if (prefixed) {
    return prefixed;
  }

  const id = modelName.toLowerCase();
  if (id.startsWith('gemini-')) return 'google';
  if (id.startsWith('grok-')) return 'xai';
  if (id.startsWith('claude-')) return 'anthropic';
  if (
    id.startsWith('gpt-') ||
    id.startsWith('o3') ||
    id.startsWith('o4') ||
    id.startsWith('chatgpt-')
  ) {
    return 'openai';
  }

  throw new Error(
    `Cannot infer provider for AGENT_MODEL="${modelName}". ` +
      'Use a prefixed id such as anthropic/claude-opus-4-8, google/gemini-2.5-flash, xai/grok-4.3, or openai/gpt-5.2.',
  );
}

/** Strips an optional `provider/` prefix before passing the id to a provider factory. */
export function stripProviderPrefix(
  modelName: string,
  provider: ModelProvider,
): string {
  const prefix = `${provider}/`;
  return modelName.startsWith(prefix) ? modelName.slice(prefix.length) : modelName;
}

function requireApiKey(env: Env, provider: ModelProvider): string {
  const envKey = PROVIDER_ENV_KEYS[provider];
  const apiKey = env[envKey];
  if (!apiKey) {
    throw new Error(
      `AGENT_MODEL requires ${provider}, but ${envKey} is not set. ` +
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

function buildReasoningProviderOptions(
  provider: ModelProvider,
): ProviderOptions {
  switch (provider) {
    case 'google':
      return {
        google: {
          thinkingConfig: {
            thinkingLevel: 'high',
            includeThoughts: false,
          },
        },
      };
    case 'xai':
      return {
        xai: {
          reasoning: 'high',
        },
      };
    case 'anthropic':
      return {
        anthropic: {
          thinking: { type: 'adaptive' },
          effort: 'high',
        },
      };
    case 'openai':
      return {
        openai: {
          reasoningEffort: 'high',
          reasoningSummary: 'detailed',
        },
      };
  }
}

/**
 * Per-call settings for ToolLoopAgent: providerOptions only on reasoning models,
 * temperature only on classic models.
 */
export function getAgentCallSettings(env: Env): AgentCallSettings {
  const provider = resolveModelProvider(env.AGENT_MODEL);
  const modelId = stripProviderPrefix(env.AGENT_MODEL, provider);
  const reasoning = isReasoningModel(modelId, provider);

  if (reasoning) {
    return {
      supportsTemperature: false,
      providerOptions: buildReasoningProviderOptions(provider),
    };
  }

  return { supportsTemperature: true };
}

/**
 * The single place where a concrete provider is constructed.
 *
 * We deliberately use `createAnthropic({ apiKey })` (and siblings) instead of
 * default exports that silently read process.env — configuration flows
 * explicitly from `Env`.
 *
 * Everything else in the app depends only on the provider-neutral
 * `LanguageModel` type, so swapping providers is a one-line `AGENT_MODEL`
 * change here.
 */
export function createAgentModel(env: Env): LanguageModel {
  return createAgentModelBundle(env).model;
}

export function createAgentModelBundle(env: Env): AgentModelBundle {
  const provider = resolveModelProvider(env.AGENT_MODEL);
  const modelId = stripProviderPrefix(env.AGENT_MODEL, provider);
  const apiKey = requireApiKey(env, provider);
  const callSettings = getAgentCallSettings(env);

  switch (provider) {
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey });
      return { model: google(modelId), ...callSettings };
    }
    case 'xai': {
      const xai = createXai({ apiKey });
      return { model: xai(modelId), ...callSettings };
    }
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey });
      return { model: anthropic(modelId), ...callSettings };
    }
    case 'openai': {
      const openai = createOpenAI({ apiKey });
      return { model: openai(modelId), ...callSettings };
    }
  }
}
