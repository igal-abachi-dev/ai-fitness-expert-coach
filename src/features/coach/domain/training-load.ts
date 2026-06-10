/** Pure strength math (Epley). The tool is a thin wrapper around this. */

export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) {
    throw new Error('weightKg and reps must be positive');
  }
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export function workingLoad(oneRepMaxKg: number, percent: number): number {
  // Round to the nearest 2.5 kg — smallest practical barbell increment.
  return Math.round((oneRepMaxKg * percent) / 100 / 2.5) * 2.5;
}
