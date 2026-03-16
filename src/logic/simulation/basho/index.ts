import { BashoRecord, RikishiStatus } from '../../models';
import { RandomSource } from '../deps';
import { LowerDivisionQuotaWorld } from '../lowerQuota';
import {
  DEFAULT_SIMULATION_MODEL_VERSION,
  SimulationModelVersion,
} from '../modelVersion';
import {
  resolveTopDivisionFromRank,
  SimulationWorld,
} from '../world';
import { runLowerDivisionBasho, syncPlayerToLowerDivisionRoster } from './lowerDivision';
import { runMaezumoBasho } from './maezumo';
import { runSimplifiedBasho } from './simplified';
import { runTopDivisionBasho } from './topDivision';
import { BashoSimulationResult } from './types';

export const runBashoDetailed = (
  status: RikishiStatus,
  year: number,
  month: number,
  rng: RandomSource,
  world?: SimulationWorld,
  lowerWorld?: LowerDivisionQuotaWorld,
  simulationModelVersion: SimulationModelVersion = DEFAULT_SIMULATION_MODEL_VERSION,
  playerBashoFormDelta?: number,
): BashoSimulationResult => {
  if (lowerWorld) {
    syncPlayerToLowerDivisionRoster(status, lowerWorld);
  }
  const topDivision = resolveTopDivisionFromRank(status.rank);
  if (topDivision && world) {
    return runTopDivisionBasho(
      status,
      year,
      month,
      topDivision,
      rng,
      world,
      simulationModelVersion,
      playerBashoFormDelta,
    );
  }
  if (status.rank.division === 'Maezumo' && lowerWorld) {
    return runMaezumoBasho(status, year, month, rng, lowerWorld);
  }
  if (
    (status.rank.division === 'Makushita' ||
      status.rank.division === 'Sandanme' ||
      status.rank.division === 'Jonidan' ||
      status.rank.division === 'Jonokuchi') &&
    lowerWorld
  ) {
    return runLowerDivisionBasho(
      status,
      year,
      month,
      rng,
      lowerWorld,
      world,
      simulationModelVersion,
      playerBashoFormDelta,
    );
  }
  return runSimplifiedBasho(status, year, month, rng);
};

export const runBasho = (
  status: RikishiStatus,
  year: number,
  month: number,
  rng: RandomSource,
  world?: SimulationWorld,
  lowerWorld?: LowerDivisionQuotaWorld,
  simulationModelVersion: SimulationModelVersion = DEFAULT_SIMULATION_MODEL_VERSION,
): BashoRecord => runBashoDetailed(
  status,
  year,
  month,
  rng,
  world,
  lowerWorld,
  simulationModelVersion,
).playerRecord;
