import { BanzukeEngineVersion } from '../banzuke';
import type { EraSnapshot } from '../era/types';
import { RandomSource } from './deps';
import { createLowerDivisionQuotaWorld, runLowerDivisionQuotaStep } from './lowerQuota';
import { intakeNewNpcRecruits } from './npc/intake';
import { PopulationPlan } from './npc/populationPlanTypes';
import { ensurePopulationPlan } from './npc/populationPlan';
import { clearExpiredNpcTsukedashiSpecialRanks } from './npc/tsukedashi';
import { reconcileNpcLeague, ReconcileReport } from './npc/leagueReconcile';
import { runNpcRetirementStep } from './npc/retirement';
import { createSekitoriBoundaryWorld, runSekitoriQuotaStep } from './sekitoriQuota';
import { LowerLeagueSnapshots } from './lowerQuota';
import { PlayerLowerRecord } from './lower/types';
import {
  countActiveBanzukeHeadcountExcludingMaezumo,
  createSimulationWorld,
  SimulationWorld,
} from './world';
import { LowerDivisionQuotaWorld } from './lower/types';
import { SekitoriBoundaryWorld } from './sekitori/types';

export interface LeagueFlowRuntime {
  world: SimulationWorld;
  lowerWorld: LowerDivisionQuotaWorld;
  boundaryWorld: SekitoriBoundaryWorld;
  populationPlan?: PopulationPlan;
  lastReconcileReport?: ReconcileReport;
}

export interface LeagueFlowPrepareResult {
  populationPlan: PopulationPlan;
  reconcileReport: ReconcileReport;
}

export interface LeagueFlowAdvanceResult {
  retiredIds: string[];
  recruitedIds: string[];
  reconcileReport: ReconcileReport;
  populationPlan: PopulationPlan | undefined;
}

export interface CreateLeagueFlowRuntimeOptions {
  eraSnapshot?: EraSnapshot;
  currentYear?: number;
}

export const createLeagueFlowRuntime = (
  rng: RandomSource,
  sourceWorld?: SimulationWorld,
  options?: CreateLeagueFlowRuntimeOptions,
): LeagueFlowRuntime => {
  const world =
    sourceWorld ??
    createSimulationWorld(rng, {
      eraSnapshot: options?.eraSnapshot,
      currentYear: options?.currentYear,
    });
  const lowerWorld = createLowerDivisionQuotaWorld(rng, world);
  const boundaryWorld = createSekitoriBoundaryWorld(rng);
  boundaryWorld.npcRegistry = world.npcRegistry;
  boundaryWorld.makushitaPool =
    lowerWorld.rosters.Makushita as unknown as typeof boundaryWorld.makushitaPool;
  return {
    world,
    lowerWorld,
    boundaryWorld,
  };
};

export const prepareLeagueForBasho = (
  runtime: LeagueFlowRuntime,
  rng: RandomSource,
  year: number,
  seq: number,
  month: number,
): LeagueFlowPrepareResult => {
  const populationPlan = ensurePopulationPlan(runtime.world, year, rng);
  clearExpiredNpcTsukedashiSpecialRanks(runtime.world.npcRegistry, seq);
  runtime.populationPlan = populationPlan;
  const reconcileReport = reconcileNpcLeague(
    runtime.world,
    runtime.lowerWorld,
    runtime.boundaryWorld,
    rng,
    seq,
    month,
    populationPlan,
  );
  runtime.lastReconcileReport = reconcileReport;
  return {
    populationPlan,
    reconcileReport,
  };
};

export const applyLeaguePromotionFlow = (
  runtime: LeagueFlowRuntime,
  rng: RandomSource,
  options?: {
    playerRecord?: PlayerLowerRecord;
    precomputedLeagueResults?: LowerLeagueSnapshots;
    banzukeEngineVersion?: BanzukeEngineVersion;
  },
): void => {
  runLowerDivisionQuotaStep(
    runtime.lowerWorld,
    rng,
    options?.playerRecord,
    options?.precomputedLeagueResults,
    options?.banzukeEngineVersion,
  );
  runSekitoriQuotaStep(
    runtime.world,
    runtime.boundaryWorld,
    rng,
    undefined,
    runtime.lowerWorld,
  );
};

export const advanceLeaguePopulation = (
  runtime: LeagueFlowRuntime,
  rng: RandomSource,
  seq: number,
  month: number,
): LeagueFlowAdvanceResult => {
  const populationPlan = runtime.populationPlan;
  const retiredIds = runNpcRetirementStep(
    runtime.world.npcRegistry.values(),
    seq,
    rng,
    populationPlan,
  );
  const activeBanzukeHeadcount = countActiveBanzukeHeadcountExcludingMaezumo(runtime.world);
  const intake = intakeNewNpcRecruits(
    {
      registry: runtime.world.npcRegistry,
      maezumoPool: runtime.world.maezumoPool,
      nameContext: runtime.world.npcNameContext,
      nextNpcSerial: runtime.world.nextNpcSerial,
    },
    seq,
    month,
    activeBanzukeHeadcount,
    populationPlan,
    rng,
    { includeTsukedashi: true },
  );
  runtime.world.nextNpcSerial = intake.nextNpcSerial;
  runtime.lowerWorld.nextNpcSerial = intake.nextNpcSerial;
  if (runtime.lowerWorld.maezumoPool !== runtime.world.maezumoPool) {
    runtime.lowerWorld.maezumoPool.push(
      ...intake.recruits.map((npc) => ({
        ...(npc as unknown as typeof runtime.lowerWorld.maezumoPool[number]),
      })),
    );
  }

  const reconcileReport = reconcileNpcLeague(
    runtime.world,
    runtime.lowerWorld,
    runtime.boundaryWorld,
    rng,
    seq,
    month,
    populationPlan,
  );
  runtime.lastReconcileReport = reconcileReport;

  return {
    retiredIds,
    recruitedIds: [...intake.recruits, ...intake.tsukedashiRecruits].map((npc) => npc.id),
    reconcileReport,
    populationPlan,
  };
};
