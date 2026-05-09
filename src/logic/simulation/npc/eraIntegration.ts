import type { Division } from '../../models';
import type {
  EraBodyProfile,
  EraCareerStageProfile,
  EraQuantileProfile,
  EraSnapshot,
  EraStrengthProfile,
} from '../../era/types';
import { RandomSource } from '../deps';
import { LOWER_DIVISION_SLOTS, TOP_DIVISION_SLOTS } from './types';

export type EraCareerStage = keyof EraCareerStageProfile;

// Game-safe clamp ranges. Makuuchi / Juryo are locked to legacy slot counts so
// the existing banzuke layout / sanyaku quota representation stays valid.
// Lower divisions allow moderate variation around legacy defaults.
const SLOT_CLAMP: Record<Exclude<Division, 'Maezumo'>, { min: number; max: number; legacy: number }> = {
  Makuuchi: { min: TOP_DIVISION_SLOTS.Makuuchi, max: TOP_DIVISION_SLOTS.Makuuchi, legacy: TOP_DIVISION_SLOTS.Makuuchi },
  Juryo: { min: TOP_DIVISION_SLOTS.Juryo, max: TOP_DIVISION_SLOTS.Juryo, legacy: TOP_DIVISION_SLOTS.Juryo },
  Makushita: { min: 110, max: 130, legacy: LOWER_DIVISION_SLOTS.Makushita },
  Sandanme: { min: 180, max: 220, legacy: LOWER_DIVISION_SLOTS.Sandanme },
  Jonidan: { min: 220, max: 280, legacy: LOWER_DIVISION_SLOTS.Jonidan },
  Jonokuchi: { min: 60, max: 100, legacy: LOWER_DIVISION_SLOTS.Jonokuchi },
};

const clampInt = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.round(value)));

export interface EraResolvedSlots {
  Makuuchi: number;
  Juryo: number;
  Makushita: number;
  Sandanme: number;
  Jonidan: number;
  Jonokuchi: number;
}

/**
 * EraSnapshot.divisionHeadcounts を「EraSnapshot preferred / game-safe clamped」で解決する。
 * 欠損 division は legacy default に fallback。
 */
export const resolveEraDivisionSlots = (eraSnapshot?: EraSnapshot): EraResolvedSlots => {
  const pick = (division: keyof EraResolvedSlots): number => {
    const range = SLOT_CLAMP[division];
    const fromEra = eraSnapshot?.divisionHeadcounts?.[division];
    if (fromEra == null || !Number.isFinite(fromEra)) return range.legacy;
    return clampInt(fromEra, range.min, range.max);
  };
  return {
    Makuuchi: pick('Makuuchi'),
    Juryo: pick('Juryo'),
    Makushita: pick('Makushita'),
    Sandanme: pick('Sandanme'),
    Jonidan: pick('Jonidan'),
    Jonokuchi: pick('Jonokuchi'),
  };
};

/**
 * 横綱+大関+三役の上位スロット数。Makuuchi 内で「career stage を rookie/rising にしない」
 * top-rank gating の境界として使う。EraSnapshot 未指定時は 0 を返す (gate 無効)。
 */
export const resolveEraTopSanyakuSlotCount = (eraSnapshot?: EraSnapshot): number => {
  const s = eraSnapshot?.topRankStructure;
  if (!s) return 0;
  return Math.max(
    0,
    (s.yokozunaCount ?? 0) + (s.ozekiCount ?? 0) + (s.sekiwakeCount ?? 0) + (s.komusubiCount ?? 0),
  );
};

const sampleTriangular = (rng: RandomSource, p25: number, p50: number, p75: number): number => {
  // Approximate IQR-based triangular: half draws in [p25,p50], half in [p50,p75].
  const lo = Math.min(p25, p50);
  const hi = Math.max(p50, p75);
  if (rng() < 0.5) return lo + rng() * (p50 - lo);
  return p50 + rng() * (hi - p50);
};

const sampleStrength = (rng: RandomSource, profile: EraStrengthProfile): number => {
  const r = rng();
  if (r < 0.25) return profile.p25 + rng() * (profile.p50 - profile.p25);
  if (r < 0.75) return profile.p50 + rng() * Math.max(0, profile.p75 - profile.p50);
  if (profile.p90 != null) return profile.p75 + rng() * Math.max(0, profile.p90 - profile.p75);
  return profile.p75;
};

/**
 * 年齢を Era 分布から triangular sampling。Era 不在 / division 欠損時は undefined を返し、
 * 呼び出し側で legacy `sampleEmpiricalDivisionAge` に fallback する。
 */
export const sampleEraAge = (
  division: Division,
  rng: RandomSource,
  eraSnapshot?: EraSnapshot,
): number | undefined => {
  const profile: EraQuantileProfile | undefined = eraSnapshot?.divisionAgeProfile?.[division];
  if (!profile) return undefined;
  const value = sampleTriangular(rng, profile.p25, profile.p50, profile.p75);
  // Era 古めの場所は p25=p50=p75 で degenerate になるケースがある。
  // その場合に「同 division 全員が同年齢」を避けるため、±1.0 歳の jitter を加える。
  const jitter = (rng() * 2 - 1) * 1.0;
  return Math.max(15, Math.round(value + jitter));
};

export const resolveEraBody = (
  division: Division,
  eraSnapshot?: EraSnapshot,
): EraBodyProfile | undefined => eraSnapshot?.divisionBodyProfile?.[division];

export const resolveEraStrength = (
  division: Division,
  eraSnapshot?: EraSnapshot,
): EraStrengthProfile | undefined => eraSnapshot?.divisionStrengthProfile?.[division];

/**
 * Era strength quantiles を使って ability を reshape。
 * Era 不在 / division 欠損時は元値を返す。
 */
export const reshapeAbilityToEra = (
  ability: number,
  division: Division,
  rng: RandomSource,
  eraSnapshot?: EraSnapshot,
): number => {
  const strength = resolveEraStrength(division, eraSnapshot);
  if (!strength) return ability;
  const sampled = sampleStrength(rng, strength);
  // 元値と era 分布のサンプルを 0.45 / 0.55 で混ぜる。era 構造を効かせつつ
  // 元の seed 由来の個体差も残す。
  return ability * 0.45 + sampled * 0.55;
};

const STAGE_KEYS: EraCareerStage[] = ['rookie', 'rising', 'prime', 'veteran', 'declining'];

/**
 * Era career stage profile から stage を sampling。
 * Era 不在 / division 欠損時は undefined。
 */
export const sampleEraCareerStage = (
  division: Division,
  rng: RandomSource,
  eraSnapshot?: EraSnapshot,
): EraCareerStage | undefined => {
  const profile = eraSnapshot?.careerStageProfile?.[division];
  if (!profile) return undefined;
  const total = STAGE_KEYS.reduce((acc, k) => acc + Math.max(0, profile[k] ?? 0), 0);
  if (total <= 0) return undefined;
  let r = rng() * total;
  for (const key of STAGE_KEYS) {
    const w = Math.max(0, profile[key] ?? 0);
    if (r < w) return key;
    r -= w;
  }
  return 'prime';
};

/**
 * 上位 sanyaku スロットに rookie/rising が割り当たる不整合を防ぐ。
 * Makuuchi 上位 N 名は prime/veteran/declining のいずれかに丸める。
 */
export const gateStageForTopSanyaku = (
  division: Division,
  rosterIndex: number,
  topSanyakuCount: number,
  stage: EraCareerStage | undefined,
  rng: RandomSource,
): EraCareerStage | undefined => {
  if (division !== 'Makuuchi') return stage;
  if (rosterIndex >= topSanyakuCount) return stage;
  if (stage === 'prime' || stage === 'veteran' || stage === 'declining') return stage;
  // rookie/rising/undefined → prime寄りに昇格
  const r = rng();
  if (r < 0.55) return 'prime';
  if (r < 0.9) return 'veteran';
  return 'declining';
};

export interface EraCareerMeta {
  syntheticCareerStartYear: number;
  syntheticCareerBashoCount: number;
  initialCareerStage: EraCareerStage;
  entryAge: number;
}

const STAGE_BASHO_RANGE: Record<EraCareerStage, { min: number; max: number }> = {
  rookie: { min: 1, max: 6 },
  rising: { min: 6, max: 24 },
  prime: { min: 24, max: 60 },
  veteran: { min: 60, max: 96 },
  declining: { min: 72, max: 120 },
};

/**
 * stage / age / 現在年から synthetic career meta を組み立てる。
 * - syntheticCareerStartYear が全 NPC で同一にならないように rng を消費
 * - age と basho count が矛盾しない (entryAge >= 15)
 */
export const synthesizeEraCareerMeta = (
  stage: EraCareerStage,
  age: number,
  currentYear: number,
  rng: RandomSource,
): EraCareerMeta => {
  const range = STAGE_BASHO_RANGE[stage];
  const span = Math.max(0, range.max - range.min);
  const sampled = range.min + Math.floor(rng() * (span + 1));
  // entryAge >= 15 を保つように basho count を上限制約
  const maxBashoByAge = Math.max(0, (age - 15) * 6);
  const careerBashoCount = Math.max(0, Math.min(sampled, maxBashoByAge));
  const yearsBack = Math.floor(careerBashoCount / 6);
  const syntheticCareerStartYear = currentYear - yearsBack;
  const entryAge = Math.max(15, age - yearsBack);
  return {
    syntheticCareerStartYear,
    syntheticCareerBashoCount: careerBashoCount,
    initialCareerStage: stage,
    entryAge,
  };
};
