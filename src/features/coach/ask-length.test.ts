import { describe, expect, it } from 'vitest';
import {
  ASK_CONCISE_MAX_OUTPUT_TOKENS,
  ASK_MAX_OUTPUT_TOKENS,
  maxOutputTokensForAsk,
  wantsConciseAnswer,
} from './ask-length.js';

describe('wantsConciseAnswer', () => {
  it('detects explicit brevity cues', () => {
    expect(wantsConciseAnswer('What is a good warm-up? One sentence.')).toBe(
      true,
    );
    expect(wantsConciseAnswer('Give me a brief summary of RPE')).toBe(true);
    expect(wantsConciseAnswer('tl;dr on creatine')).toBe(true);
  });

  it('returns false for open-ended questions', () => {
    expect(
      wantsConciseAnswer('How should I warm up before heavy squats?'),
    ).toBe(false);
  });
});

describe('maxOutputTokensForAsk', () => {
  it('uses the concise cap when brevity is requested', () => {
    expect(maxOutputTokensForAsk('One sentence please.')).toBe(
      ASK_CONCISE_MAX_OUTPUT_TOKENS,
    );
  });

  it('uses the default cap otherwise', () => {
    expect(maxOutputTokensForAsk('How do I program deadlifts?')).toBe(
      ASK_MAX_OUTPUT_TOKENS,
    );
  });
});
