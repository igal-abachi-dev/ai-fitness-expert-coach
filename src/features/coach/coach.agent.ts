import { Output, stepCountIs, ToolLoopAgent, type LanguageModel } from 'ai';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { AgentModelBundle } from '../../lib/ai/models.js';
import { buildPlanInstructions, COACH_SYSTEM_PROMPT } from './coach.prompt.js';
import { coachOutputSchema } from './coach.schemas.js';
import { createCoachTools, type ToolDeps } from './tools/index.js';

const CHAT_TEMPERATURE = 0.3;
const PLAN_TEMPERATURE = 0.2;
/** /ask + /chat: 1 text turn or a few tool rounds; cap runaway loops. */
const CHAT_MAX_STEPS = 10;
/** /plan: nutrition + load + library lookups + structured output (up to 7 training days). */
const PLAN_MAX_STEPS = 12;
/*
use PLAN_MAX_STEPS=14
only needed if you see plans truncating at 12 in logs (e.g. 6–7 day splits with per-pattern library searches). Start at 12; bump to 14 only if you measure truncation. 
*/


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
