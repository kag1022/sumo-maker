import { PopulationPlan } from '../npc/populationPlanTypes';
import { PlayerLowerRecord } from '../lower/types';
import { RandomSource } from '../deps';
import {
  advanceLeaguePopulation,
  applyLeaguePromotionFlow,
  prepareLeagueForBasho,
} from '../leagueFlow';
import { LowerDivisionQuotaWorld } from '../lowerQuota';
import { BanzukeEngineVersion } from '../../banzuke';
import { SekitoriBoundaryWorld } from '../sekitoriQuota';
import { advanceTopDivisionBanzuke, SimulationWorld } from '../world';
import { BashoSimulationResult } from '../basho';

export interface SeasonLeaguePhaseContext {
  world: SimulationWorld;
  lowerDivisionQuotaWorld: LowerDivisionQuotaWorld;
  sekitoriBoundaryWorld: SekitoriBoundaryWorld;
}

export interface SeasonLeagueFlowState {
  world: SimulationWorld;
  lowerWorld: LowerDivisionQuotaWorld;
  boundaryWorld: SekitoriBoundaryWorld;
}

export const createSeasonLeagueFlow = (
  context: SeasonLeaguePhaseContext,
): SeasonLeagueFlowState => ({
  world: context.world,
  lowerWorld: context.lowerDivisionQuotaWorld,
  boundaryWorld: context.sekitoriBoundaryWorld,
});

export const runPreseasonLeaguePhase = (
  context: SeasonLeaguePhaseContext,
  rng: RandomSource,
  year: number,
  seq: number,
  month: number,
): { leagueFlow: SeasonLeagueFlowState; populationPlan: PopulationPlan } => {
  const leagueFlow = createSeasonLeagueFlow(context);
  const { populationPlan } = prepareLeagueForBasho(leagueFlow, rng, year, seq, month);
  return { leagueFlow, populationPlan };
};

export const runPromotionLeaguePhase = (
  context: SeasonLeaguePhaseContext,
  rng: RandomSource,
  options: {
    playerRecord?: PlayerLowerRecord;
    precomputedLeagueResults?: BashoSimulationResult['lowerLeagueSnapshots'];
    banzukeEngineVersion: BanzukeEngineVersion;
  },
) => {
  advanceTopDivisionBanzuke(context.world);
  return applyLeaguePromotionFlow(createSeasonLeagueFlow(context), rng, options);
};

export const runAttritionLeaguePhase = (
  context: SeasonLeaguePhaseContext,
  rng: RandomSource,
  populationPlan: PopulationPlan,
  seq: number,
  month: number,
) => advanceLeaguePopulation(
  {
    ...createSeasonLeagueFlow(context),
    populationPlan,
  },
  rng,
  seq,
  month,
);
