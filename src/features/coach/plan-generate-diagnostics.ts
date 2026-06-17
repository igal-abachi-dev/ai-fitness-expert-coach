import { PLAN_MAX_STEPS } from './coach.agent.js';

/** Minimal slice of an AI SDK generate result — enough to diagnose missing output. */
export interface PlanGenerateRunSnapshot {
  steps: ReadonlyArray<{
    finishReason: string;
    text?: string;
    toolCalls?: ReadonlyArray<{ toolName: string }> | undefined;
    warnings?: ReadonlyArray<unknown> | undefined;
  }>;
  finishReason: string;
  text: string;
  warnings?: ReadonlyArray<unknown> | undefined;
  totalUsage: {
    inputTokens?: number | null | undefined;
    outputTokens?: number | null | undefined;
    outputTokenDetails?: { reasoningTokens?: number | null | undefined } | null | undefined;
  };
}

export type PlanModelRole = 'quality' | 'cheap';

export type PlanNoOutputLikelyCause =
  | 'step_limit'
  | 'length_truncated'
  | 'stopped_without_output'
  | 'provider_or_empty'
  | 'unknown';

export interface PlanStepSummary {
  index: number;
  finishReason: string;
  toolCalls: string[];
  textLength: number;
}

export interface PlanGenerateDiagnostics {
  modelRole: PlanModelRole;
  overflowedFromQuality: boolean;
  overflowStatusCode?: number | undefined;
  repairAttempt: boolean;
  stepCount: number;
  maxSteps: number;
  hitStepLimit: boolean;
  finalFinishReason: string;
  totalToolCalls: number;
  toolNames: string[];
  finalStepTextLength: number;
  finalStepTextPreview: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  warningCount: number;
  likelyCause: PlanNoOutputLikelyCause;
  likelyCauseHint: string;
  steps: PlanStepSummary[];
}

const TEXT_PREVIEW_MAX = 240;

function truncateText(text: string, max = TEXT_PREVIEW_MAX): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

function uniqueToolNames(steps: PlanGenerateRunSnapshot['steps']): string[] {
  const names = new Set<string>();
  for (const step of steps) {
    for (const call of step.toolCalls ?? []) {
      names.add(call.toolName);
    }
  }
  return [...names];
}

function countToolCalls(steps: PlanGenerateRunSnapshot['steps']): number {
  return steps.reduce((n, step) => n + (step.toolCalls?.length ?? 0), 0);
}

function inferLikelyCause(
  snapshot: PlanGenerateRunSnapshot,
  hitStepLimit: boolean,
): Pick<PlanGenerateDiagnostics, 'likelyCause' | 'likelyCauseHint'> {
  const finalReason = snapshot.finishReason;
  const finalText = snapshot.text.trim();
  const lastStep = snapshot.steps[snapshot.steps.length - 1];
  const endedOnToolCalls =
    finalReason === 'tool-calls' || lastStep?.finishReason === 'tool-calls';

  if (hitStepLimit && endedOnToolCalls) {
    return {
      likelyCause: 'step_limit',
      likelyCauseHint:
        `Agent used all ${PLAN_MAX_STEPS} steps while still calling tools — ` +
        'increase PLAN_MAX_STEPS or reduce tool rounds in the prompt.',
    };
  }

  if (hitStepLimit) {
    return {
      likelyCause: 'step_limit',
      likelyCauseHint:
        `Agent reached the ${PLAN_MAX_STEPS}-step cap before emitting structured output.`,
    };
  }

  if (finalReason === 'length') {
    return {
      likelyCause: 'length_truncated',
      likelyCauseHint:
        'Model hit max output tokens before finishing the plan JSON.',
    };
  }

  if (finalText.length > 0) {
    return {
      likelyCause: 'stopped_without_output',
      likelyCauseHint:
        'Model returned text but no schema-valid plan — often a weaker model or malformed JSON.',
    };
  }

  if (snapshot.steps.length === 0 || finalReason === 'error') {
    return {
      likelyCause: 'provider_or_empty',
      likelyCauseHint:
        'Empty or errored model run — check provider status, API key, or transient outages.',
    };
  }

  if (endedOnToolCalls) {
    return {
      likelyCause: 'stopped_without_output',
      likelyCauseHint:
        'Loop ended after tool calls without a final structured output step.',
    };
  }

  return {
    likelyCause: 'unknown',
    likelyCauseHint:
      'Inspect step summaries and finalStepTextPreview for more detail.',
  };
}

/** Builds a structured log payload for NoOutputGeneratedError post-mortems. */
export function diagnosePlanGenerateRun(
  snapshot: PlanGenerateRunSnapshot,
  context: {
    modelRole: PlanModelRole;
    overflowedFromQuality?: boolean;
    overflowStatusCode?: number | undefined;
    repairAttempt?: boolean;
    maxSteps?: number;
  },
): PlanGenerateDiagnostics {
  const maxSteps = context.maxSteps ?? PLAN_MAX_STEPS;
  const stepCount = snapshot.steps.length;
  const hitStepLimit = stepCount >= maxSteps;
  const finalText = snapshot.text.trim();
  const { likelyCause, likelyCauseHint } = inferLikelyCause(snapshot, hitStepLimit);

  const stepWarnings = snapshot.steps.flatMap((s) => s.warnings ?? []);
  const warningCount = stepWarnings.length + (snapshot.warnings?.length ?? 0);

  return {
    modelRole: context.modelRole,
    overflowedFromQuality: context.overflowedFromQuality ?? false,
    ...(context.overflowStatusCode !== undefined
      ? { overflowStatusCode: context.overflowStatusCode }
      : {}),
    repairAttempt: context.repairAttempt ?? false,
    stepCount,
    maxSteps,
    hitStepLimit,
    finalFinishReason: snapshot.finishReason,
    totalToolCalls: countToolCalls(snapshot.steps),
    toolNames: uniqueToolNames(snapshot.steps),
    finalStepTextLength: finalText.length,
    finalStepTextPreview: finalText.length > 0 ? truncateText(finalText) : null,
    inputTokens: snapshot.totalUsage.inputTokens ?? null,
    outputTokens: snapshot.totalUsage.outputTokens ?? null,
    reasoningTokens:
      snapshot.totalUsage.outputTokenDetails?.reasoningTokens ?? null,
    warningCount,
    likelyCause,
    likelyCauseHint,
    steps: snapshot.steps.map((step, index) => ({
      index,
      finishReason: step.finishReason,
      toolCalls: (step.toolCalls ?? []).map((c) => c.toolName),
      textLength: step.text?.length ?? 0,
    })),
  };
}
