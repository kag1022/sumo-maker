import { Division } from '../../models';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export interface EmpiricalNpcDriftClampInput {
  age: number;
  division: Division;
  rankName?: string;
  absent: number;
}

export const resolveEmpiricalNpcDriftFactor = (
  input: EmpiricalNpcDriftClampInput,
): number => {
  const ageFactor =
    input.age <= 24
      ? 1
      : input.age <= 30
        ? 0.85
        : input.age <= 36
          ? 0.65
          : 0.45;
  const upperRankFactor =
    input.division === 'Makuuchi' && ['横綱', '大関'].includes(input.rankName ?? '')
      ? 0.85
      : 1;
  return clamp(ageFactor * upperRankFactor, 0.25, 1);
};

export const applyEmpiricalNpcDriftClamp = (
  currentValue: number,
  rawNextValue: number,
  input: EmpiricalNpcDriftClampInput,
): number => {
  const delta = rawNextValue - currentValue;
  if (input.absent > 0 && delta > 0) {
    return currentValue;
  }
  return currentValue + delta * resolveEmpiricalNpcDriftFactor(input);
};
