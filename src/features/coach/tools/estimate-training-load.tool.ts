import { tool } from 'ai';
import { z } from 'zod';
import { estimateOneRepMax, workingLoad } from '../domain/training-load.js';

export const estimateTrainingLoad = tool({
  description:
    'Deterministically estimate a 1RM from a recent set (Epley) and compute ' +
    'working loads at given %1RM, rounded to 2.5 kg. Use instead of guessing weights.',
  inputSchema: z.object({
    weightKg: z.number().positive().describe('Weight lifted in a recent set'),
    reps: z.number().int().min(1).max(15).describe('Reps performed at that weight'),
    targetPercents: z
      .array(z.number().min(30).max(100))
      .default([70, 75, 80, 85])
      .describe('%1RM values to compute working loads for'),
  }),
  execute: ({ weightKg, reps, targetPercents }) => {
    const e1rm = estimateOneRepMax(weightKg, reps);
    return {
      estimatedOneRepMaxKg: e1rm,
      workingLoads: targetPercents.map((percent) => ({
        percent,
        loadKg: workingLoad(e1rm, percent),
      })),
    };
  },
});
