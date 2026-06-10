import { describe, expect, it } from 'vitest';
import {
  buildTestApp,
  scriptedModel,
  textOnlyModel,
} from '../../testing/build-test-app.js';
import type { CoachOutput, UserAssessment } from './coach.schemas.js';

const assessment: UserAssessment = {
  age: 32,
  sex: 'male',
  heightCm: 178,
  weightKg: 82,
  primaryGoal: 'pure_strength',
  experienceLevel: 'intermediate',
  trainingDaysPerWeek: 3,
  equipment: ['barbell', 'bodyweight'],
  limitationsOrInjuries: [],
};

/** A domain-valid plan for the assessment above (3 days, sane macros). */
function validPlan(): CoachOutput {
  const calories = 3000;
  const proteinGrams = 165; // ~2.0 g/kg
  const carbohydratesGrams = 330;
  const fatsGrams = 80; // 165*4 + 330*4 + 80*9 = 2700 within 15% of 3000
  return {
    physiologicalProfile: {
      estimatedTdee: 2900,
      leanBodyMassKg: null,
      biomechanicalObservations: 'Average levers, no red flags.',
    },
    periodizedNutrition: {
      generalStanceOnNamedDiets: 'Named diets ignore within-day periodization.',
      macronutrientTargets: { calories, proteinGrams, carbohydratesGrams, fatsGrams },
      periWorkoutProtocol: {
        preWorkoutMeal: 'Rice + whey 90 min prior.',
        intraWorkoutHydrationAndNutrition: 'Water + electrolytes.',
        postWorkoutMeal: 'High-GI carbs + lean protein.',
      },
      nonTrainingDayAdjustments: 'Lower carbs ~30%.',
    },
    trainingProgram: {
      splitName: 'Full Body',
      frequencyRationale: '3x frequency suits intermediate strength.',
      weeklyLayout: [1, 2, 3].map((dayNumber) => ({
        dayNumber,
        focus: 'Squat / Press / Pull',
        exercises: [
          { name: 'Back Squat', sets: 5, reps: '5', rirTarget: 2, restSeconds: 180, coachingCue: 'Brace, drive up.' },
        ],
      })),
    },
    gymnasticsAndSkillWork: null,
    evidenceCitations: [
      { topic: 'Protein', scientificMechanism: 'MPS saturation', leadingReference: 'Helms, M&S Pyramids' },
    ],
    safetyNotes: [],
  };
}

describe('POST /v1/coach/plan', () => {
  it('returns a domain-valid structured plan', async () => {
    const app = buildTestApp(textOnlyModel(JSON.stringify(validPlan())));
    const res = await app.inject({ method: 'POST', url: '/v1/coach/plan', payload: assessment });
    expect(res.statusCode).toBe(200);
    expect(res.json().trainingProgram.weeklyLayout).toHaveLength(3);
    await app.close();
  });

  it('repairs a domain-invalid first attempt, then succeeds', async () => {
    const wrongDays: CoachOutput = {
      ...validPlan(),
      trainingProgram: {
        ...validPlan().trainingProgram,
        weeklyLayout: validPlan().trainingProgram.weeklyLayout.slice(0, 2), // 2 != 3
      },
    };
    // First call: wrong day count. Second call (repair): valid.
    const app = buildTestApp(
      scriptedModel(JSON.stringify(wrongDays), JSON.stringify(validPlan())),
    );
    const res = await app.inject({ method: 'POST', url: '/v1/coach/plan', payload: assessment });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 502 with issues when the plan stays invalid after repair', async () => {
    const wrongDays: CoachOutput = {
      ...validPlan(),
      trainingProgram: {
        ...validPlan().trainingProgram,
        weeklyLayout: validPlan().trainingProgram.weeklyLayout.slice(0, 1),
      },
    };
    const app = buildTestApp(textOnlyModel(JSON.stringify(wrongDays)));
    const res = await app.inject({ method: 'POST', url: '/v1/coach/plan', payload: assessment });
    expect(res.statusCode).toBe(502);
    expect(res.json().issues.length).toBeGreaterThan(0);
    await app.close();
  });

  it('rejects an invalid assessment with 400', async () => {
    const app = buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/coach/plan',
      payload: { ...assessment, trainingDaysPerWeek: 9 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('Bad Request');
    await app.close();
  });
});

describe('POST /v1/coach/ask', () => {
  it('returns a one-shot answer with usage', async () => {
    const app = buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/coach/ask',
      payload: { prompt: 'How many sets per week for hypertrophy?' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ text: 'mock answer', steps: 1 });
    await app.close();
  });
});

describe('POST /v1/coach/chat', () => {
  it('streams UI message chunks as SSE', async () => {
    const app = buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/coach/chat',
      payload: { messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['x-vercel-ai-ui-message-stream']).toBe('v1');
    expect(res.body).toContain('"type":"text-delta"');
    await app.close();
  });
});

describe('GET /health', () => {
  it('responds ok and is not rate limited', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
    await app.close();
  });
});
