import { Output, stepCountIs, ToolLoopAgent, type LanguageModel } from 'ai';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import { z } from 'zod';
import type { AgentModelBundle } from '../../lib/ai/models.js';
import { buildPlanInstructions, COACH_SYSTEM_PROMPT, ASK_COACH_INSTRUCTIONS } from './coach.prompt.js';
import { coachOutputSchema } from './coach.schemas.js';
import { createCoachTools, type ToolDeps } from './tools/index.js';

const CHAT_TEMPERATURE = 0.3;//is good because chat can sound more natural but still should not become too creative.
const PLAN_TEMPERATURE = 0.2;//is good because plans should be consistent, safe, and schema-valid.

/** /ask + /chat: 1 text turn or a few tool rounds; cap runaway loops. */
const CHAT_MAX_STEPS = 10;
/** /plan: nutrition + load + library lookups + structured output (up to 7 training days). */
export const PLAN_MAX_STEPS = 16;


export interface CoachAgentDeps extends ToolDeps {
  model: LanguageModel;
  providerOptions?: ProviderOptions;
  /** When false, temperature is omitted (reasoning models). Defaults to true for mocks. */
  supportsTemperature?: boolean;
}

/** Merges a role's model bundle with the shared tool deps into agent deps. */
export function agentDepsFromBundle(
  bundle: AgentModelBundle,
  tools: ToolDeps,
): CoachAgentDeps {
  return {
    ...tools,
    model: bundle.model,
    supportsTemperature: bundle.supportsTemperature,
    ...(bundle.providerOptions !== undefined
      ? { providerOptions: bundle.providerOptions }
      : {}),
  };
}

function coachAgentCallSettings(
  deps: CoachAgentDeps,
  temperature: number,
): { temperature?: number; providerOptions?: ProviderOptions } {
  const supportsTemperature = deps.supportsTemperature ?? true;

  return {
    ...(supportsTemperature ? { temperature } : {}),
    ...(deps.providerOptions !== undefined
      ? { providerOptions: deps.providerOptions }
      : {}),
  };
}

/** Conversational / one-shot coach: streams or generates text, free to call tools. */
export function createCoachChatAgent(deps: CoachAgentDeps) {
  return new ToolLoopAgent({
    model: deps.model,
    instructions: COACH_SYSTEM_PROMPT,
    tools: createCoachTools(deps),
    stopWhen: stepCountIs(CHAT_MAX_STEPS),
    ...coachAgentCallSettings(deps, CHAT_TEMPERATURE),
  });
}
export type CoachChatAgent = ReturnType<typeof createCoachChatAgent>;

const askCallOptionsSchema = z.object({
  maxOutputTokens: z.number().int().positive(),
});

/** One-shot /ask: concise-by-default instructions; output length capped per request in the route. */
export function createCoachAskAgent(deps: CoachAgentDeps) {
  return new ToolLoopAgent({
    model: deps.model,
    instructions: ASK_COACH_INSTRUCTIONS,
    tools: createCoachTools(deps),
    stopWhen: stepCountIs(CHAT_MAX_STEPS),
    ...coachAgentCallSettings(deps, CHAT_TEMPERATURE),
    callOptionsSchema: askCallOptionsSchema,
    prepareCall: ({ options, ...settings }) => ({
      ...settings,
      maxOutputTokens: options.maxOutputTokens,
    }),
  });
}
export type CoachAskAgent = ReturnType<typeof createCoachAskAgent>;

/**
 * Plan generator: a tool-using agent with a structured output contract.
 * Instructions are built per-request so deterministic safety flags can be
 * injected (see buildPlanInstructions), so this is a factory keyed on flags.
 *
 * This is the v6 upgrade over the original generateText+Output.object: the
 * agent can consult the exercise library and run the nutrition/load tools
 * *while* producing the typed plan.
 */
export function createCoachPlanAgent(deps: CoachAgentDeps, safetyFlags: string[]) {
  return new ToolLoopAgent({
    model: deps.model,
    instructions: buildPlanInstructions(safetyFlags),
    tools: createCoachTools(deps),
    output: Output.object({ schema: coachOutputSchema }),
    stopWhen: stepCountIs(PLAN_MAX_STEPS),
    // A free-tier 429 should surface immediately so the route can overflow to
    // the cheap model, rather than the SDK backing off for ~5s first.
    maxRetries: 0,
    ...coachAgentCallSettings(deps, PLAN_TEMPERATURE),
  });
}
export type CoachPlanAgent = ReturnType<typeof createCoachPlanAgent>;
