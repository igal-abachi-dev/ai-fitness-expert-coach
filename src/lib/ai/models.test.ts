import { APICallError, RetryError } from 'ai';
import { describe, expect, it } from 'vitest';
import { callSettingsFor, isOverflowEligibleError, overflowStatusCode } from './models.js';

describe('callSettingsFor', () => {
  it('uses high reasoning with thought traces for quality /plan on Gemini 3', () => {
    const settings = callSettingsFor(
      'gemini-3-flash-preview',
      'google',
      'quality',
    );

    expect(settings.supportsTemperature).toBe(false);
    expect(settings.providerOptions).toEqual({
      google: {
        thinkingConfig: {
          thinkingLevel: 'high',
          includeThoughts: true,
        },
      },
    });
  });

  it('uses medium reasoning with thought traces for cheap /ask on Gemini 3', () => {
    const settings = callSettingsFor(
      'gemini-3.1-flash-lite',
      'google',
      'cheap',
    );

    expect(settings.providerOptions).toEqual({
      google: {
        thinkingConfig: {
          thinkingLevel: 'medium',
          includeThoughts: true,
        },
      },
    });
  });

  it('uses minimal reasoning without thought traces for fast /chat on Gemini 3', () => {
    const settings = callSettingsFor(
      'gemini-3-flash-preview',
      'google',
      'fast',
    );

    expect(settings.providerOptions).toEqual({
      google: {
        thinkingConfig: {
          thinkingLevel: 'minimal',
          includeThoughts: false,
        },
      },
    });
  });

  it('uses thinkingBudget for Gemini 2.5 instead of thinkingLevel', () => {
    const settings = callSettingsFor('gemini-2.5-flash', 'google', 'fast');

    expect(settings.providerOptions).toEqual({
      google: {
        thinkingConfig: {
          thinkingBudget: 0,
          includeThoughts: false,
        },
      },
    });
  });

  it('includes reasoningSummary on OpenAI for high-effort roles only', () => {
    const high = callSettingsFor('gpt-5.2', 'openai', 'quality');
    const low = callSettingsFor('gpt-5.2', 'openai', 'fast');

    expect(high.providerOptions).toEqual({
      openai: { reasoningEffort: 'high', reasoningSummary: 'detailed' },
    });
    expect(low.providerOptions).toEqual({
      openai: { reasoningEffort: 'low' },
    });
  });

  it('detects overflow-eligible provider errors', () => {
    const apiCall = (statusCode: number) =>
      new APICallError({
        message: 'provider error',
        url: 'https://mock/generate',
        requestBodyValues: {},
        statusCode,
        isRetryable: statusCode === 503,
      });

    expect(isOverflowEligibleError(apiCall(429))).toBe(true);
    expect(isOverflowEligibleError(apiCall(503))).toBe(true);
    expect(isOverflowEligibleError(apiCall(502))).toBe(true);
    expect(isOverflowEligibleError(apiCall(504))).toBe(true);
    expect(isOverflowEligibleError(apiCall(500))).toBe(false);
    expect(isOverflowEligibleError(new Error('other'))).toBe(false);

    expect(overflowStatusCode(apiCall(503))).toBe(503);
    expect(
      overflowStatusCode(
        new RetryError({
          message: 'failed after retries',
          reason: 'maxRetriesExceeded',
          errors: [apiCall(503)],
        }),
      ),
    ).toBe(503);
  });

  it('keeps temperature for non-reasoning models', () => {
    const settings = callSettingsFor(
      'llama-3.3-70b-versatile',
      'groq',
      'fast',
    );

    expect(settings).toEqual({ supportsTemperature: true });
  });
});
