import { AptitudeTier, RikishiStatus } from '../models';
import {
  buildInitialRikishiFromDraft,
  ScoutBodySeed,
  ScoutDraft,
  ScoutEntryPath,
  ScoutTemperament,
  rollScoutDraft,
} from './gacha';
import { STABLE_CATALOG } from '../simulation/heya/stableCatalog';

type RandomSource = () => number;

export type ObservationPopulationKind = 'player-scout-default' | 'historical-like-career';
export type ObservationPopulationPreset =
  | 'player-scout-default'
  | 'historical-like-v1'
  | 'historical-like-v2-low'
  | 'historical-like-v2-mid'
  | 'historical-like-v2-high';

export interface ObservationPopulationMetadata {
  kind: ObservationPopulationKind;
  preset: ObservationPopulationPreset;
  version: string;
  notes: string;
}

export interface InitialPopulationProfile {
  populationKind: ObservationPopulationKind;
  populationPreset: ObservationPopulationPreset;
  entryAge: number;
  entryPath: ScoutEntryPath;
  aptitudeTier: AptitudeTier;
  bodySeed: ScoutBodySeed;
  bodyType: RikishiStatus['bodyType'];
  startingHeightCm: number;
  startingWeightKg: number;
  temperament: ScoutTemperament;
  stableId: string | null;
  careerBandLabel?: string;
}

const POPULATION_METADATA: Record<ObservationPopulationKind, ObservationPopulationMetadata> = {
  'player-scout-default': {
    kind: 'player-scout-default',
    preset: 'player-scout-default',
    version: 'v1',
    notes: '本編 scout の未編集候補を使う game-balance 用 population。historical target との直接比較用ではない。',
  },
  'historical-like-career': {
    kind: 'historical-like-career',
    preset: 'historical-like-v1',
    version: 'v1',
    notes: 'rikishi_summary / heisei_debut target と比較するための calibration 専用 population。本編 scout 体験には使わない。v1 は低位寄りの比較基準。',
  },
};

interface HistoricalPopulationPresetConfig {
  preset: ObservationPopulationPreset;
  version: string;
  notes: string;
  entryPathWeights: Record<ScoutEntryPath, number>;
  aptitudeWeights: Record<AptitudeTier, number>;
  bodySeedWeights: Record<ScoutBodySeed, number>;
  bodyMassBiasKg: number;
}

const HISTORICAL_PRESET_CONFIGS: Record<
  Exclude<ObservationPopulationPreset, 'player-scout-default'>,
  HistoricalPopulationPresetConfig
> = {
  'historical-like-v1': {
    preset: 'historical-like-v1',
    version: 'v1',
    notes: '現行 historical-like。低位寄りで、比較基準として残す。',
    entryPathWeights: { LOCAL: 80, SCHOOL: 18, COLLEGE: 2, CHAMPION: 0 },
    aptitudeWeights: { S: 0, A: 0.2, B: 18, C: 47, D: 34.8 },
    bodySeedWeights: { BALANCED: 42, LONG: 22, HEAVY: 16, SPRING: 20 },
    bodyMassBiasKg: 0,
  },
  'historical-like-v2-low': {
    preset: 'historical-like-v2-low',
    version: 'v2-low',
    notes: '低位寄りを維持しつつ、v1 より B 層と学校相撲層を増やす。',
    entryPathWeights: { LOCAL: 64, SCHOOL: 27, COLLEGE: 8, CHAMPION: 1 },
    aptitudeWeights: { S: 0.1, A: 2.5, B: 36, C: 45, D: 16.4 },
    bodySeedWeights: { BALANCED: 38, LONG: 24, HEAVY: 18, SPRING: 20 },
    bodyMassBiasKg: 4,
  },
  'historical-like-v2-mid': {
    preset: 'historical-like-v2-mid',
    version: 'v2-mid',
    notes: 'historical target に近づける本命 preset。LOCAL を下げ、B/A と学生層を増やす。',
    entryPathWeights: { LOCAL: 59, SCHOOL: 29, COLLEGE: 10, CHAMPION: 2 },
    aptitudeWeights: { S: 0.2, A: 4, B: 43, C: 39, D: 13.8 },
    bodySeedWeights: { BALANCED: 36, LONG: 25, HEAVY: 19, SPRING: 20 },
    bodyMassBiasKg: 7,
  },
  'historical-like-v2-high': {
    preset: 'historical-like-v2-high',
    version: 'v2-high',
    notes: 'player-scout-default ほどではないが上振れを厚くし、関取到達側の感度を見る。',
    entryPathWeights: { LOCAL: 55, SCHOOL: 30, COLLEGE: 12, CHAMPION: 3 },
    aptitudeWeights: { S: 0.3, A: 6, B: 50, C: 34, D: 9.7 },
    bodySeedWeights: { BALANCED: 34, LONG: 25, HEAVY: 21, SPRING: 20 },
    bodyMassBiasKg: 10,
  },
};

const resolveHistoricalPresetConfig = (
  preset?: ObservationPopulationPreset,
): HistoricalPopulationPresetConfig =>
  HISTORICAL_PRESET_CONFIGS[
    preset && preset !== 'player-scout-default' ? preset : 'historical-like-v1'
  ];

const pickWeighted = <T,>(
  rng: RandomSource,
  entries: Array<{ value: T; weight: number }>,
): T => {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= Math.max(0, entry.weight);
    if (roll <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
};

const rollHistoricalEntryPath = (
  config: HistoricalPopulationPresetConfig,
  rng: RandomSource,
): ScoutEntryPath =>
  pickWeighted(rng, [
    { value: 'LOCAL' as const, weight: config.entryPathWeights.LOCAL },
    { value: 'SCHOOL' as const, weight: config.entryPathWeights.SCHOOL },
    { value: 'COLLEGE' as const, weight: config.entryPathWeights.COLLEGE },
    { value: 'CHAMPION' as const, weight: config.entryPathWeights.CHAMPION },
  ]);

const resolveEntryAgeFromPath = (
  entryPath: ScoutEntryPath,
  rng: RandomSource,
): ScoutDraft['entryAge'] => {
  if (entryPath === 'SCHOOL') return 18;
  if (entryPath === 'COLLEGE' || entryPath === 'CHAMPION') return 22;
  return rng() < 0.88 ? 15 : 18;
};

const rollHistoricalAptitudeTier = (
  entryPath: ScoutEntryPath,
  config: HistoricalPopulationPresetConfig,
  rng: RandomSource,
): AptitudeTier => {
  const tier = pickWeighted(rng, [
    { value: 'S' as const, weight: config.aptitudeWeights.S },
    { value: 'A' as const, weight: config.aptitudeWeights.A },
    { value: 'B' as const, weight: config.aptitudeWeights.B },
    { value: 'C' as const, weight: config.aptitudeWeights.C },
    { value: 'D' as const, weight: config.aptitudeWeights.D },
  ]);
  if (entryPath === 'CHAMPION' && (tier === 'C' || tier === 'D')) {
    return rng() < 0.7 ? 'B' : 'A';
  }
  if (entryPath === 'COLLEGE' && tier === 'D') {
    return rng() < 0.8 ? 'C' : 'B';
  }
  return tier;
};

const rollHistoricalBodySeed = (
  config: HistoricalPopulationPresetConfig,
  rng: RandomSource,
): ScoutBodySeed =>
  pickWeighted(rng, [
    { value: 'BALANCED' as const, weight: config.bodySeedWeights.BALANCED },
    { value: 'LONG' as const, weight: config.bodySeedWeights.LONG },
    { value: 'HEAVY' as const, weight: config.bodySeedWeights.HEAVY },
    { value: 'SPRING' as const, weight: config.bodySeedWeights.SPRING },
  ]);

const rollHistoricalBody = (
  entryAge: ScoutDraft['entryAge'],
  bodySeed: ScoutBodySeed,
  config: HistoricalPopulationPresetConfig,
  rng: RandomSource,
): Pick<ScoutDraft, 'startingHeightCm' | 'startingWeightKg'> => {
  const ageHeightBase = entryAge === 15 ? 171 : entryAge === 18 ? 176 : 180;
  const ageWeightBase = entryAge === 15 ? 82 : entryAge === 18 ? 98 : 116;
  if (bodySeed === 'LONG') {
    return {
      startingHeightCm: ageHeightBase + 12 + Math.floor(rng() * 9),
      startingWeightKg: ageWeightBase + config.bodyMassBiasKg + 5 + Math.floor(rng() * 18),
    };
  }
  if (bodySeed === 'HEAVY') {
    return {
      startingHeightCm: ageHeightBase + 3 + Math.floor(rng() * 7),
      startingWeightKg: ageWeightBase + config.bodyMassBiasKg + 40 + Math.floor(rng() * 28),
    };
  }
  if (bodySeed === 'SPRING') {
    return {
      startingHeightCm: ageHeightBase + 4 + Math.floor(rng() * 8),
      startingWeightKg: ageWeightBase + config.bodyMassBiasKg + 24 + Math.floor(rng() * 22),
    };
  }
  return {
    startingHeightCm: ageHeightBase + Math.floor(rng() * 10),
    startingWeightKg: ageWeightBase + config.bodyMassBiasKg + 14 + Math.floor(rng() * 24),
  };
};

const rollHistoricalStableId = (rng: RandomSource): string =>
  pickWeighted(
    rng,
    STABLE_CATALOG.map((stable) => ({
      value: stable.id,
      weight: stable.targetHeadcount,
    })),
  );

const buildHistoricalLikeDraft = (
  rng: RandomSource,
  preset?: ObservationPopulationPreset,
): ScoutDraft => {
  const config = resolveHistoricalPresetConfig(preset);
  const baseDraft = rollScoutDraft(rng);
  const entryPath = rollHistoricalEntryPath(config, rng);
  const entryAge = resolveEntryAgeFromPath(entryPath, rng);
  const bodySeed = rollHistoricalBodySeed(config, rng);
  const body = rollHistoricalBody(entryAge, bodySeed, config, rng);
  return {
    ...baseDraft,
    personaLine: `${entryAge}歳で現実比較用の標準母集団から角界へ入る。`,
    entryAge,
    entryPath,
    entryArchetype: undefined,
    bodySeed,
    ...body,
    selectedStableId: rollHistoricalStableId(rng),
    aptitudeTier: rollHistoricalAptitudeTier(entryPath, config, rng),
  };
};

export const resolveObservationPopulationMetadata = (
  kind: ObservationPopulationKind,
  preset?: ObservationPopulationPreset,
): ObservationPopulationMetadata => {
  if (kind === 'historical-like-career') {
    const config = resolveHistoricalPresetConfig(preset);
    return {
      kind,
      preset: config.preset,
      version: config.version,
      notes: `rikishi_summary / heisei_debut target と比較するための calibration 専用 population。本編 scout 体験には使わない。${config.notes}`,
    };
  }
  return POPULATION_METADATA[kind];
};

export const buildInitialRikishiForObservationPopulation = (
  kind: ObservationPopulationKind,
  rng: RandomSource,
  preset?: ObservationPopulationPreset,
): RikishiStatus => {
  const draft = kind === 'historical-like-career'
    ? buildHistoricalLikeDraft(rng, preset)
    : rollScoutDraft(rng);
  return buildInitialRikishiFromDraft({
    ...draft,
    selectedStableId: draft.selectedStableId ?? 'stable-001',
  });
};

export const summarizeInitialPopulationProfile = (
  kind: ObservationPopulationKind,
  preset: ObservationPopulationPreset | undefined,
  status: RikishiStatus,
): InitialPopulationProfile => ({
  populationKind: kind,
  populationPreset: resolveObservationPopulationMetadata(kind, preset).preset,
  entryAge: status.entryAge,
  entryPath: status.careerSeed?.entryPath as ScoutEntryPath,
  aptitudeTier: status.aptitudeTier,
  bodySeed: status.careerSeed?.bodySeed as ScoutBodySeed,
  bodyType: status.bodyType,
  startingHeightCm: status.bodyMetrics.heightCm,
  startingWeightKg: status.bodyMetrics.weightKg,
  temperament: status.careerSeed?.temperament as ScoutTemperament,
  stableId: status.stableId,
  careerBandLabel: status.buildSummary?.careerBandLabel,
});
