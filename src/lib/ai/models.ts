import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createXai } from '@ai-sdk/xai';
import { createOpenAI } from '@ai-sdk/openai';

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

/*
Model LatencyThroughputBest For
google/gemini-3.5-flash 2.0s 269 tps
The Chat Agent: Insanely high throughput for smooth, lightning-fast text streaming.

xai/grok-4.3 0.9s 172 tps
The Plan Agent: Ultra-low latency and highly reliable for deep, multi-step tool loops.
*/
/*



export function createAgentModel(env: Env): LanguageModel {
  const modelName = env.AGENT_MODEL; // e.g., 'google/gemini-3.5-flash'

  if (modelName.startsWith('google/')) {
    const google = createGoogle({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
    return google(modelName.replace('google/', ''), {
      // Global fallback fallback configurations for Gemini 3.5
      providerOptions: {
        google: {
          thinkingConfig: { thinkingLevel: 'medium', includeThoughts: false }
        }
      }
    });
  }

  if (modelName.startsWith('xai/')) {
    const xai = createXAI({ apiKey: env.XAI_API_KEY });
    return xai(modelName.replace('xai/', ''), {
      providerOptions: {
        xai: { reasoning: 'medium' }
      }
    });
  }

  if (modelName.startsWith('anthropic/')) {
    const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
    return anthropic(modelName.replace('anthropic/', ''), {
      providerOptions: {
        anthropic: { thinking: { type: 'adaptive' }, effort: 'medium' }
      }
    });
  }

  if (modelName.startsWith('openai/')) {
    const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
    return openai(modelName.replace('openai/', ''), {
      providerOptions: {
        openai: { reasoningEffort: 'medium', reasoningSummary: 'auto' }
      }
    });
  }

  throw new Error(`Unsupported model provider: ${modelName}`);
}
*/


/* providerOptions: {
      anthropic: {
        // Configure Claude's extended reasoning engine
        thinking: { 
          type: 'adaptive' 
        },
        effort: 'high', // Options: 'low' | 'medium' | 'high'
      }, */


/* providerOptions: {
    google: {
      thinkingConfig: {
        thinkingLevel: 'high',  // Options: 'low', 'medium', 'high'
        includeThoughts: true,  // Surfaces the model's reasoning trace
      },
    },
  },*/

  /*
  providerOptions: {
    xai: {
      reasoning: 'high', // Options: 'none', 'low', 'medium', 'high'
    },
  },
  */


  /*providerOptions: {
      openai: {
        // Configure the depth of the reasoning engine
        reasoningEffort: 'high', // Options: 'none' | 'low' | 'medium' | 'high' | 'xhigh'
        
        // Instruct the SDK to stream back the thought process/reasoning trace
        reasoningSummary: 'detailed', // Options: 'auto' | 'detailed'
      },
    }, */