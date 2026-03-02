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
): BashoSimulationResult => {
  if (lowerWorld) {
    syncPlayerToLowerDivisionRoster(status, lowerWorld);
  }
  const topDivision = resolveTopDivisionFromRank(status.rank);
  if (topDivision && world) {
    return runTopDivisionBasho(status, year, month, topDivision, rng, world, simulationModelVersion);
  }
  if (status.rank.division === 'Maezumo' && lowerWorld) {
    return runMaezumoBasho(status, year, month, rng, lowerWorld, simulationModelVersion);
  }
  if (
    (status.rank.division === 'Makushita' ||
      status.rank.division === 'Sandanme' ||
      status.rank.division === 'Jonidan' ||
      status.rank.division === 'Jonokuchi') &&
    lowerWorld
  ) {
    return runLowerDivisionBasho(status, year, month, rng, lowerWorld, world, simulationModelVersion);
  }
  return runSimplifiedBasho(status, year, month, rng, simulationModelVersion);
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
