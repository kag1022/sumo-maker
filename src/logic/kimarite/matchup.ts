import { RandomSource } from '../simulation/deps';
import { KimariteClass, KimariteDef, KimariteStyle, KimariteTag, StatKey, normalizeKimariteName } from './catalog';
import { BodyType, Trait } from '../models';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export interface KimariteContext {
  playerStyle: KimariteStyle;
  enemyStyle: KimariteStyle;
  playerBodyType: BodyType;
  stats: Record<StatKey, number>;
  playerHeightCm: number;
  playerWeightKg: number;
  enemyHeightCm: number;
  enemyWeightKg: number;
  traits: Trait[];
  preferredMove?: string;
  allowReversal?: boolean;
}

export interface KimariteScoreBreakdown {
  baseWeight: number;
  styleAffinity: number;
  classMatchup: number;
  bodyBonus: number;
  traitBonus: number;
  statBonus: number;
  sizeBonus: number;
  preferredMoveBonus: number;
  total: number;
}

export const CLASS_MATCHUP_MATRIX: Record<KimariteClass, Record<KimariteStyle, number>> = {
  PUSH: { PUSH: 1.02, GRAPPLE: 0.96, TECHNIQUE: 1.08, BALANCE: 1 },
  GRAPPLE: { PUSH: 1.08, GRAPPLE: 1.02, TECHNIQUE: 0.95, BALANCE: 1 },
  THROW: { PUSH: 0.98, GRAPPLE: 1.06, TECHNIQUE: 1.04, BALANCE: 1 },
  TECH: { PUSH: 1.05, GRAPPLE: 1.02, TECHNIQUE: 1.03, BALANCE: 1 },
  REVERSAL: { PUSH: 1, GRAPPLE: 1.02, TECHNIQUE: 1.04, BALANCE: 1 },
  FOUL: { PUSH: 1, GRAPPLE: 1, TECHNIQUE: 1, BALANCE: 1 },
};

export const BODYTYPE_CLASS_BONUS: Record<BodyType, Record<KimariteClass, number>> = {
  NORMAL: { PUSH: 1, GRAPPLE: 1, THROW: 1, TECH: 1, REVERSAL: 1, FOUL: 1 },
  SOPPU: { PUSH: 0.94, GRAPPLE: 0.9, THROW: 1.06, TECH: 1.2, REVERSAL: 1.08, FOUL: 1 },
  ANKO: { PUSH: 1.18, GRAPPLE: 1.15, THROW: 0.92, TECH: 0.88, REVERSAL: 0.9, FOUL: 1 },
  MUSCULAR: { PUSH: 1.12, GRAPPLE: 1.1, THROW: 1.02, TECH: 0.95, REVERSAL: 0.95, FOUL: 1 },
};

export const TRAIT_TAG_MODIFIER: Partial<Record<Trait, Partial<Record<KimariteTag, number>>>> = {
  ARAWAZASHI: { rare: 1.65 },
  YOTSU_NO_ONI: { belt: 1.18 },
  TSUPPARI_TOKKA: { slapdown: 0.92 },
  DOHYOUGIWA_MAJUTSU: { edge: 1.55 },
  CLUTCH_REVERSAL: { edge: 1.5 },
};

const resolveStatBonus = (def: KimariteDef, stats: Record<StatKey, number>): number => {
  const affinities = Object.entries(def.statAffinity) as Array<[StatKey, number]>;
  if (affinities.length === 0) return 1;
  let totalWeight = 0;
  let weighted = 0;
  for (const [key, weight] of affinities) {
    totalWeight += weight;
    weighted += (stats[key] / 100) * weight;
  }
  if (totalWeight <= 0) return 1;
  const normalized = weighted / totalWeight;
  return clamp(0.8 + normalized * 0.7, 0.7, 1.55);
};

const resolveTraitBonus = (def: KimariteDef, traits: Trait[]): number => {
  let bonus = 1;
  for (const trait of traits) {
    const mods = TRAIT_TAG_MODIFIER[trait];
    if (!mods) continue;
    for (const tag of def.tags) {
      bonus *= mods[tag] || 1;
    }
  }
  return clamp(bonus, 0.6, 2.4);
};

export const scoreKimarite = (
  def: KimariteDef,
  context: KimariteContext,
): KimariteScoreBreakdown => {
  if (def.constraints?.reversalOnly && !context.allowReversal) {
    return {
      baseWeight: def.baseWeight,
      styleAffinity: 0,
      classMatchup: 0,
      bodyBonus: 0,
      traitBonus: 0,
      statBonus: 0,
      sizeBonus: 0,
      preferredMoveBonus: 0,
      total: 0,
    };
  }

  const styleAffinity = def.styleAffinity[context.playerStyle] || 1;
  const classMatchup = CLASS_MATCHUP_MATRIX[def.class][context.enemyStyle] || 1;
  const bodyBonus = BODYTYPE_CLASS_BONUS[context.playerBodyType][def.class] || 1;
  const traitBonus = resolveTraitBonus(def, context.traits);
  const statBonus = resolveStatBonus(def, context.stats);
  const heightDelta = context.playerHeightCm - context.enemyHeightCm;
  const weightDelta = context.playerWeightKg - context.enemyWeightKg;
  const sizeBonus = clamp(
    1 + heightDelta * def.sizeAffinity.heightDiff + weightDelta * def.sizeAffinity.weightDiff,
    0.72,
    1.42,
  );
  const preferredMoveBonus =
    context.preferredMove && normalizeKimariteName(context.preferredMove) === def.name ? 1.6 : 1;

  const total = Math.max(
    0,
    def.baseWeight * styleAffinity * classMatchup * bodyBonus * traitBonus * statBonus * sizeBonus * preferredMoveBonus,
  );

  return {
    baseWeight: def.baseWeight,
    styleAffinity,
    classMatchup,
    bodyBonus,
    traitBonus,
    statBonus,
    sizeBonus,
    preferredMoveBonus,
    total,
  };
};

export const selectWeightedKimarite = (
  defs: KimariteDef[],
  context: KimariteContext,
  rng: RandomSource,
): { move: string; score: number; topScore: number } => {
  const scored = defs.map((def) => ({
    def,
    score: scoreKimarite(def, context).total,
  })).filter((item) => item.score > 0);

  if (!scored.length) {
    const fallback = defs[0]?.name || '寄り切り';
    return { move: fallback, score: 0, topScore: 0 };
  }

  let topScore = 0;
  let total = 0;
  for (const item of scored) {
    total += item.score;
    if (item.score > topScore) topScore = item.score;
  }

  const pick = rng() * total;
  let acc = 0;
  for (const item of scored) {
    acc += item.score;
    if (pick <= acc) {
      return { move: item.def.name, score: item.score, topScore };
    }
  }

  const last = scored[scored.length - 1];
  return { move: last.def.name, score: last.score, topScore };
};

export const resolveTopKimariteScore = (defs: KimariteDef[], context: KimariteContext): number => {
  let top = 0;
  for (const def of defs) {
    const score = scoreKimarite(def, context).total;
    if (score > top) top = score;
  }
  return top;
};
