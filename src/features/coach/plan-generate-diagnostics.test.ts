import { describe, expect, it } from 'vitest';
import { PLAN_MAX_STEPS } from './coach.agent.js';
import {
  diagnosePlanGenerateRun,
  type PlanGenerateRunSnapshot,
} from './plan-generate-diagnostics.js';

function snapshot(
  overrides: Partial<PlanGenerateRunSnapshot> = {},
): PlanGenerateRunSnapshot {
  return {
    steps: [],
    finishReason: 'stop',
    text: '',
    totalUsage: {},
    ...overrides,
  };
}

describe('diagnosePlanGenerateRun', () => {
  it('flags step_limit when the agent hits the step cap on tool calls', () => {
    const steps = Array.from({ length: PLAN_MAX_STEPS }, (_, index) => ({
      finishReason: index === PLAN_MAX_STEPS - 1 ? 'tool-calls' : 'tool-calls',
      toolCalls: [{ toolName: 'estimateNutrition' }],
      text: '',
    }));

    const diagnostics = diagnosePlanGenerateRun(
      snapshot({ steps, finishReason: 'tool-calls', text: '' }),
      { modelRole: 'cheap', overflowedFromQuality: true, overflowStatusCode: 503 },
    );

    expect(diagnostics.likelyCause).toBe('step_limit');
    expect(diagnostics.hitStepLimit).toBe(true);
    expect(diagnostics.totalToolCalls).toBe(PLAN_MAX_STEPS);
    expect(diagnostics.overflowedFromQuality).toBe(true);
    expect(diagnostics.overflowStatusCode).toBe(503);
  });

  it('flags stopped_without_output when text exists but schema output is missing', () => {
    const diagnostics = diagnosePlanGenerateRun(
      snapshot({
        steps: [{ finishReason: 'stop', text: '{"trainingProgram":{' }],
        finishReason: 'stop',
        text: '{"trainingProgram":{',
      }),
      { modelRole: 'cheap' },
    );

    expect(diagnostics.likelyCause).toBe('stopped_without_output');
    expect(diagnostics.finalStepTextPreview).toContain('trainingProgram');
  });

  it('flags length_truncated when finish reason is length', () => {
    const diagnostics = diagnosePlanGenerateRun(
      snapshot({ finishReason: 'length', text: 'partial' }),
      { modelRole: 'quality' },
    );

    expect(diagnostics.likelyCause).toBe('length_truncated');
  });

  it('summarises per-step tool usage', () => {
    const diagnostics = diagnosePlanGenerateRun(
      snapshot({
        steps: [
          {
            finishReason: 'tool-calls',
            toolCalls: [{ toolName: 'estimateNutrition' }],
          },
          {
            finishReason: 'tool-calls',
            toolCalls: [{ toolName: 'searchExerciseLibrary' }],
          },
          { finishReason: 'stop', text: '' },
        ],
        finishReason: 'stop',
      }),
      { modelRole: 'cheap' },
    );

    expect(diagnostics.stepCount).toBe(3);
    expect(diagnostics.toolNames).toEqual([
      'estimateNutrition',
      'searchExerciseLibrary',
    ]);
    expect(diagnostics.steps[0]?.toolCalls).toEqual(['estimateNutrition']);
  });
});
