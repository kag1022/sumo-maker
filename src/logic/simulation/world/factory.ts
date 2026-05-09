import { BashoRecordHistorySnapshot } from '../../banzuke/providers/sekitori/types';
import { DEFAULT_MAKUUCHI_LAYOUT } from '../../banzuke/scale/banzukeLayout';
import { DEFAULT_APTITUDE_FACTOR, DEFAULT_APTITUDE_TIER, DEFAULT_CAREER_BAND, resolveAptitudeProfile } from '../../constants';
import type { EraSnapshot } from '../../era/types';
import { PLAYER_ACTOR_ID } from '../actors/constants';
import { RandomSource } from '../deps';
import { createInitialNpcUniverse } from '../npc/factory';
import { PersistentActor } from '../npc/types';
import type { TorikumiBoundaryContext } from '../torikumi/types';
import { EMPTY_EXCHANGE } from './shared';
import { SimulationWorld, WorldRikishi } from './types';

/**
 * EraSnapshot.boundaryProfile から torikumi 用の合成 context を導出する。
 *
 * - `crossDivisionBoutIntensity` (era data 上はおおむね 0 or 1) で on/off ゲート
 * - `sekitoriBoundaryPressure` (約 0.31..0.81) と `juryoDemotionPressure` (0..1)
 *   を弱い加重で混ぜて 0..1.5 の effectiveIntensity を作る
 *
 * 標準的な era では effectiveIntensity ≈ 0.85〜1.0 となり legacy とほぼ同等。
 * 高境界圧 era では 1.1〜1.3 → torikumi 側で day threshold を 1 早め、score bonus を強化。
 * intensity=0 の era は完全に boundary 取組を抑制する (era 側で「無かった」ことを尊重)。
 */
const deriveEraBoundaryContext = (
  eraSnapshot: { boundaryProfile?: import('../../era/types').EraBoundaryProfile } | undefined,
): TorikumiBoundaryContext | undefined => {
  const bp = eraSnapshot?.boundaryProfile;
  if (!bp) return undefined;
  const sek = typeof bp.sekitoriBoundaryPressure === 'number' ? bp.sekitoriBoundaryPressure : 0.5;
  const jur = typeof bp.juryoDemotionPressure === 'number' ? bp.juryoDemotionPressure : 0.5;
  const intensityFlag = typeof bp.crossDivisionBoutIntensity === 'number' ? bp.crossDivisionBoutIntensity : 1;
  const raw = intensityFlag * (0.5 + 0.5 * sek + 0.25 * jur);
  const effectiveIntensity = Math.max(0, Math.min(1.5, raw));
  return {
    sekitoriBoundaryPressure: bp.sekitoriBoundaryPressure,
    makushitaUpperCongestion: bp.makushitaUpperCongestion,
    juryoDemotionPressure: bp.juryoDemotionPressure,
    crossDivisionBoutIntensity: bp.crossDivisionBoutIntensity,
    effectiveIntensity,
  };
};

export interface CreateSimulationWorldOptions {
  eraSnapshot?: EraSnapshot;
  currentYear?: number;
}

export const createSimulationWorld = (
  rng: RandomSource,
  options?: CreateSimulationWorldOptions,
): SimulationWorld => {
  const universe = createInitialNpcUniverse(rng, {
    eraSnapshot: options?.eraSnapshot,
    currentYear: options?.currentYear,
  });
  if (!universe.registry.has(PLAYER_ACTOR_ID)) {
    universe.registry.set(PLAYER_ACTOR_ID, {
      actorId: PLAYER_ACTOR_ID,
      actorType: 'PLAYER',
      id: PLAYER_ACTOR_ID,
      seedId: 'PLAYER',
      shikona: 'PLAYER',
      stableId: 'stable-001',
      division: 'Maezumo',
      currentDivision: 'Maezumo',
      rankScore: 1,
      basePower: 60,
      ability: 60,
      uncertainty: 2,
      form: 1,
      volatility: 1.2,
      styleBias: 'BALANCE',
      heightCm: 180,
      weightKg: 130,
      growthBias: 0,
      aptitudeTier: DEFAULT_APTITUDE_TIER,
      aptitudeFactor: DEFAULT_APTITUDE_FACTOR,
      aptitudeProfile: resolveAptitudeProfile(DEFAULT_APTITUDE_TIER),
      careerBand: DEFAULT_CAREER_BAND,
      retirementBias: 0,
      retirementProfile: 'STANDARD',
      entryAge: 15,
      age: 15,
      careerBashoCount: 0,
      active: true,
      entrySeq: 0,
      stagnation: {
        pressure: 0,
        makekoshiStreak: 0,
        lowWinRateStreak: 0,
        stuckBasho: 0,
        reboundBoost: 0,
      },
      recentBashoResults: [],
    });
  }
  const toWorldRikishi = (npc: PersistentActor): WorldRikishi => ({
    id: npc.id,
    shikona: npc.shikona,
    division: npc.currentDivision === 'Makuuchi' || npc.currentDivision === 'Juryo'
      ? npc.currentDivision
      : 'Juryo',
    stableId: npc.stableId,
    basePower: npc.basePower,
    ability: npc.ability,
    uncertainty: npc.uncertainty,
    growthBias: npc.growthBias,
    rankScore: npc.rankScore,
    volatility: npc.volatility,
    form: npc.form,
    styleBias: npc.styleBias,
    heightCm: npc.heightCm,
    weightKg: npc.weightKg,
    aptitudeTier: npc.aptitudeTier,
    aptitudeFactor: npc.aptitudeFactor,
    aptitudeProfile: npc.aptitudeProfile,
    careerBand: npc.careerBand,
    stagnation: npc.stagnation,
  });

  return {
    rosters: {
      Makuuchi: universe.rosters.Makuuchi.map(toWorldRikishi),
      Juryo: universe.rosters.Juryo.map(toWorldRikishi),
    },
    lowerRosterSeeds: {
      Makushita: universe.rosters.Makushita,
      Sandanme: universe.rosters.Sandanme,
      Jonidan: universe.rosters.Jonidan,
      Jonokuchi: universe.rosters.Jonokuchi,
    },
    maezumoPool: universe.maezumoPool,
    actorRegistry: universe.registry,
    npcRegistry: universe.registry,
    npcNameContext: universe.nameContext,
    nextNpcSerial: universe.nextNpcSerial,
    lastBashoResults: {},
    recentSekitoriHistory: new Map<string, BashoRecordHistorySnapshot[]>(),
    ozekiKadobanById: new Map<string, boolean>(),
    ozekiReturnById: new Map<string, boolean>(),
    lastAllocations: [],
    lastExchange: { ...EMPTY_EXCHANGE },
    lastSanyakuQuota: {},
    lastPlayerAssignedRank: undefined,
    lastPlayerAllocation: undefined,
    makuuchiLayout: { ...DEFAULT_MAKUUCHI_LAYOUT },
    populationPlan: undefined,
    eraBoundaryContext: deriveEraBoundaryContext(options?.eraSnapshot),
  };
};
