import { Rank } from '../models';
import { SimulationModelVersion } from './modelVersion';
import { BanzukeEngineVersion } from '../banzuke/types';

export interface SimulationDiagnostics {
  seq: number;
  year: number;
  month: number;
  rank: Rank;
  wins: number;
  losses: number;
  absent: number;
  expectedWins: number;
  strengthOfSchedule: number;
  performanceOverExpected: number;
  promoted: boolean;
  demoted: boolean;
  reason?: string;
  simulationModelVersion: SimulationModelVersion;
  banzukeEngineVersion?: BanzukeEngineVersion;
  torikumiRelaxationHistogram?: Record<string, number>;
  crossDivisionBoutCount?: number;
  lateCrossDivisionBoutCount?: number;
  sameStableViolationCount?: number;
  sameCardViolationCount?: number;
  torikumiRepairHistogram?: Record<string, number>;
  torikumiScheduleViolations?: number;
  torikumiLateDirectTitleBoutCount?: number;
  sanyakuRoundRobinCoverageRate?: number;
  joiAssignmentCoverageRate?: number;
  yokozunaOzekiTailBoutRatio?: number;
  npcTopDivisionBoutRows?: Array<{
    day: number;
    aId: string;
    bId: string;
    aRankName?: string;
    bRankName?: string;
    aWon?: boolean;
    aWinProbability?: number;
    aAbility?: number;
    bAbility?: number;
    fusen?: boolean;
  }>;
  bashoVariance?: {
    playerBashoFormDelta: number;
    conditionBefore: number;
    conditionAfter: number;
  };
}
