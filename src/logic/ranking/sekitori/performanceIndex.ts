import { getRankValue } from '../rankScore';
import { BashoRecordSnapshot } from './types';

export interface SekitoriPerformanceIndex {
  expectedWins: number;
  performanceOverExpected: number;
  sos: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const estimateExpectedWinsFromRank = (snapshot: BashoRecordSnapshot): number => {
  const rankValue = getRankValue(snapshot.rank);
  const baseline = 7.6 - rankValue * 0.12;
  return clamp(baseline, 3.8, 11.2);
};

const estimateStrengthOfScheduleFromRank = (snapshot: BashoRecordSnapshot): number => {
  const rankValue = getRankValue(snapshot.rank);
  return clamp(125 - rankValue * 1.8, 82, 126);
};

export const resolveSekitoriPerformanceIndex = (
  snapshot: BashoRecordSnapshot,
): SekitoriPerformanceIndex => {
  const expectedWins =
    Number.isFinite(snapshot.expectedWins) ?
      (snapshot.expectedWins as number) :
      estimateExpectedWinsFromRank(snapshot);
  const performanceOverExpected =
    Number.isFinite(snapshot.performanceOverExpected) ?
      (snapshot.performanceOverExpected as number) :
      snapshot.wins - expectedWins;
  const sos =
    Number.isFinite(snapshot.strengthOfSchedule) ?
      (snapshot.strengthOfSchedule as number) :
      estimateStrengthOfScheduleFromRank(snapshot);
  return {
    expectedWins,
    performanceOverExpected,
    sos,
  };
};
