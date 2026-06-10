import { describe, expect, it } from 'vitest';
import {
  bmi,
  estimateTdee,
  leanBodyMassKg,
  mifflinStJeorBmr,
  proteinRangeGrams,
} from './nutrition.js';
import { estimateOneRepMax, workingLoad } from './training-load.js';
import { detectSafetyFlags } from './safety-flags.js';
import type { UserAssessment } from '../coach.schemas.js';

describe('nutrition math', () => {
  it('computes Mifflin-St Jeor BMR (male)', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(mifflinStJeorBmr({ weightKg: 80, heightCm: 180, age: 30, sex: 'male' })).toBe(1780);
  });
  it('applies activity multiplier for TDEE', () => {
    expect(estimateTdee(1780, 'moderate')).toBe(Math.round(1780 * 1.55));
  });
  it('gives a 1.6-2.2 g/kg protein range', () => {
    expect(proteinRangeGrams(80)).toEqual({ min: 128, max: 176 });
  });
  it('computes lean body mass and bmi', () => {
    expect(leanBodyMassKg(80, 20)).toBe(64);
    expect(bmi(80, 180)).toBe(24.7);
  });
});

describe('training load (Epley)', () => {
  it('returns the weight itself for a single', () => {
    expect(estimateOneRepMax(140, 1)).toBe(140);
  });
  it('estimates a 5RM and rounds working loads to 2.5 kg', () => {
    expect(estimateOneRepMax(100, 5)).toBe(116.7);
    expect(workingLoad(116.7, 80)).toBe(92.5);
  });
  it('rejects non-positive input', () => {
    expect(() => estimateOneRepMax(0, 5)).toThrow();
  });
});

const base: UserAssessment = {
  age: 30,
  sex: 'male',
  heightCm: 180,
  weightKg: 80,
  primaryGoal: 'hypertrophy',
  experienceLevel: 'intermediate',
  trainingDaysPerWeek: 4,
  equipment: ['barbell'],
  limitationsOrInjuries: [],
};

describe('safety flags', () => {
  it('is clean for a healthy adult', () => {
    expect(detectSafetyFlags(base)).toEqual([]);
  });
  it('flags a minor', () => {
    expect(detectSafetyFlags({ ...base, age: 15 }).some((f) => f.startsWith('minor'))).toBe(true);
  });
  it('flags a medical limitation', () => {
    const flags = detectSafetyFlags({ ...base, limitationsOrInjuries: ['shoulder pain'] });
    expect(flags.some((f) => /medical clearance/.test(f))).toBe(true);
  });
  it('flags a beginner overreaching', () => {
    const flags = detectSafetyFlags({ ...base, experienceLevel: 'beginner', trainingDaysPerWeek: 6 });
    expect(flags.some((f) => /overreach/.test(f))).toBe(true);
  });
});
