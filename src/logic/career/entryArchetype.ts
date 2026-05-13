import type {
  AmateurBackground,
  AptitudeTier,
  CareerBand,
  EntryArchetype,
  GrowthType,
  Rank,
  RikishiStatus,
  TacticsType,
} from '../models';
import {
  createMakushitaBottomTsukedashiRank,
  createSandanmeBottomTsukedashiRank,
  stripRankSpecialStatus,
} from '../ranking';

export const ENTRY_ARCHETYPES: EntryArchetype[] = [
  'ORDINARY_RECRUIT',
  'EARLY_PROSPECT',
  'TSUKEDASHI',
  'ELITE_TSUKEDASHI',
  'MONSTER',
];

export const ENTRY_ARCHETYPE_LABELS: Record<EntryArchetype, string> = {
  ORDINARY_RECRUIT: '通常入門',
  EARLY_PROSPECT: '早期有望株',
  TSUKEDASHI: '付出',
  ELITE_TSUKEDASHI: '上位付出',
  MONSTER: '怪物候補',
};

export type EntryArchetypeWeights = Partial<Record<EntryArchetype, number>>;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const pickWeighted = <T extends string>(
  weights: Partial<Record<T, number>>,
  values: readonly T[],
  rng: () => number,
): T => {
  const total = values.reduce((sum, value) => sum + Math.max(0, weights[value] ?? 0), 0);
  if (total <= 0) return values[0];
  let roll = rng() * total;
  for (const value of values) {
    roll -= Math.max(0, weights[value] ?? 0);
    if (roll <= 0) return value;
  }
  return values[values.length - 1];
};

export const ENTRY_ARCHETYPE_BASE_WEIGHTS: Record<EntryArchetype, number> = {
  ORDINARY_RECRUIT: 82,
  EARLY_PROSPECT: 10,
  TSUKEDASHI: 5,
  ELITE_TSUKEDASHI: 1.4,
  MONSTER: 0.15,
};

export const ENTRY_ARCHETYPE_THEME_WEIGHTS: Record<string, EntryArchetypeWeights> = {
  random: {},
  realistic: {
    ORDINARY_RECRUIT: 4,
    EARLY_PROSPECT: -1,
    TSUKEDASHI: 0.5,
    ELITE_TSUKEDASHI: -0.2,
    MONSTER: -0.1,
  },
  featured: {
    ORDINARY_RECRUIT: -18,
    EARLY_PROSPECT: 10,
    TSUKEDASHI: 5,
    ELITE_TSUKEDASHI: 3,
    MONSTER: 0.35,
  },
  makushita_wall: {
    ORDINARY_RECRUIT: -20,
    EARLY_PROSPECT: 2,
    TSUKEDASHI: 18,
    ELITE_TSUKEDASHI: 1.5,
    MONSTER: -0.08,
  },
  late_bloomer: {
    ORDINARY_RECRUIT: 9,
    EARLY_PROSPECT: -5,
    TSUKEDASHI: -3,
    ELITE_TSUKEDASHI: -0.8,
    MONSTER: -0.12,
  },
};

export const rollEntryArchetypeFromWeights = (
  bias: EntryArchetypeWeights | undefined,
  rng: () => number,
): EntryArchetype => {
  const weights = { ...ENTRY_ARCHETYPE_BASE_WEIGHTS };
  if (bias) {
    for (const archetype of ENTRY_ARCHETYPES) {
      weights[archetype] = Math.max(0.01, weights[archetype] + (bias[archetype] ?? 0));
    }
  }
  return pickWeighted(weights, ENTRY_ARCHETYPES, rng);
};

export const resolveDefaultEntryArchetypeForAmateurBackground = (
  background: AmateurBackground,
): EntryArchetype => {
  if (background === 'COLLEGE_YOKOZUNA') return 'ELITE_TSUKEDASHI';
  if (background === 'STUDENT_ELITE') return 'TSUKEDASHI';
  if (background === 'HIGH_SCHOOL') return 'EARLY_PROSPECT';
  return 'ORDINARY_RECRUIT';
};

export const resolveEntryArchetypeStartingRank = (
  baseRank: Rank,
  entryArchetype: EntryArchetype,
  rng: () => number = Math.random,
): Rank => {
  if (entryArchetype === 'ELITE_TSUKEDASHI') return createMakushitaBottomTsukedashiRank();
  if (entryArchetype === 'TSUKEDASHI') return createSandanmeBottomTsukedashiRank();
  if (entryArchetype === 'MONSTER' && baseRank.division !== 'Maezumo' && rng() < 0.5) {
    return baseRank.division === 'Makushita'
      ? createMakushitaBottomTsukedashiRank()
      : baseRank.division === 'Sandanme'
        ? createSandanmeBottomTsukedashiRank()
        : stripRankSpecialStatus(baseRank);
  }
  return stripRankSpecialStatus(baseRank);
};

export const resolveEntryDivisionFromRank = (rank: Rank): RikishiStatus['entryDivision'] => {
  if (rank.division === 'Makushita') return 'Makushita60';
  if (rank.division === 'Sandanme') return 'Sandanme90';
  return undefined;
};

export const resolveEntryArchetypePotentialBonus = (
  entryArchetype: EntryArchetype,
): number => {
  if (entryArchetype === 'MONSTER') return 18;
  if (entryArchetype === 'ELITE_TSUKEDASHI') return 10;
  if (entryArchetype === 'TSUKEDASHI') return 6;
  if (entryArchetype === 'EARLY_PROSPECT') return 4;
  return 0;
};

export const resolveEntryArchetypeStatBonus = (
  entryArchetype: EntryArchetype,
  tactics: TacticsType,
): Partial<Record<keyof RikishiStatus['stats'], number>> => {
  const flat =
    entryArchetype === 'MONSTER' ? 11 :
      entryArchetype === 'ELITE_TSUKEDASHI' ? 15 :
        entryArchetype === 'TSUKEDASHI' ? 10 :
          entryArchetype === 'EARLY_PROSPECT' ? 3 :
            0;
  const bonus: Partial<Record<keyof RikishiStatus['stats'], number>> = {
    tsuki: flat,
    oshi: flat,
    kumi: flat,
    nage: flat,
    koshi: flat,
    deashi: flat,
    waza: flat,
    power: flat,
  };
  if (tactics === 'PUSH') {
    bonus.tsuki = (bonus.tsuki ?? 0) + 3;
    bonus.oshi = (bonus.oshi ?? 0) + 3;
    bonus.deashi = (bonus.deashi ?? 0) + 2;
  } else if (tactics === 'GRAPPLE') {
    bonus.kumi = (bonus.kumi ?? 0) + 3;
    bonus.koshi = (bonus.koshi ?? 0) + 3;
    bonus.power = (bonus.power ?? 0) + 2;
  } else if (tactics === 'TECHNIQUE') {
    bonus.waza = (bonus.waza ?? 0) + 3;
    bonus.nage = (bonus.nage ?? 0) + 3;
    bonus.kumi = (bonus.kumi ?? 0) + 2;
  }
  return bonus;
};

export const rollGrowthTypeForEntryArchetype = (
  entryArchetype: EntryArchetype,
  rng: () => number,
): GrowthType | undefined => {
  if (entryArchetype === 'MONSTER') {
    return pickWeighted({ GENIUS: 44, NORMAL: 36, EARLY: 12, LATE: 8 }, ['EARLY', 'NORMAL', 'LATE', 'GENIUS'] as const, rng);
  }
  if (entryArchetype === 'ELITE_TSUKEDASHI') {
    return pickWeighted({ GENIUS: 8, NORMAL: 62, EARLY: 20, LATE: 10 }, ['EARLY', 'NORMAL', 'LATE', 'GENIUS'] as const, rng);
  }
  if (entryArchetype === 'TSUKEDASHI') {
    return pickWeighted({ NORMAL: 68, EARLY: 18, LATE: 12, GENIUS: 2 }, ['EARLY', 'NORMAL', 'LATE', 'GENIUS'] as const, rng);
  }
  if (entryArchetype === 'EARLY_PROSPECT') {
    return pickWeighted({ EARLY: 46, NORMAL: 44, LATE: 8, GENIUS: 2 }, ['EARLY', 'NORMAL', 'LATE', 'GENIUS'] as const, rng);
  }
  return undefined;
};

export const rollCareerBandForEntryArchetype = (
  entryArchetype: EntryArchetype,
  aptitudeTier: AptitudeTier,
  rng: () => number,
): CareerBand | undefined => {
  if (entryArchetype === 'MONSTER') {
    return pickWeighted(
      { ELITE: 55, STRONG: 30, STANDARD: 12, GRINDER: 3, WASHOUT: 0.5 },
      ['ELITE', 'STRONG', 'STANDARD', 'GRINDER', 'WASHOUT'] as const,
      rng,
    );
  }
  if (entryArchetype === 'ELITE_TSUKEDASHI') {
    return pickWeighted(
      { ELITE: aptitudeTier === 'S' ? 40 : 18, STRONG: 52, STANDARD: 24, GRINDER: 6, WASHOUT: 0.5 },
      ['ELITE', 'STRONG', 'STANDARD', 'GRINDER', 'WASHOUT'] as const,
      rng,
    );
  }
  if (entryArchetype === 'TSUKEDASHI') {
    return pickWeighted(
      { ELITE: 4, STRONG: 24, STANDARD: 45, GRINDER: 22, WASHOUT: 5 },
      ['ELITE', 'STRONG', 'STANDARD', 'GRINDER', 'WASHOUT'] as const,
      rng,
    );
  }
  return undefined;
};

export const applyEntryArchetypeStatusBias = (
  status: RikishiStatus,
  entryArchetype: EntryArchetype,
  rng: () => number,
): void => {
  status.entryArchetype = entryArchetype;
  status.rank = resolveEntryArchetypeStartingRank(status.rank, entryArchetype, rng);
  status.history.maxRank = { ...status.rank };
  status.entryDivision = resolveEntryDivisionFromRank(status.rank);
  const statBonus = resolveEntryArchetypeStatBonus(entryArchetype, status.tactics);
  (Object.keys(status.stats) as Array<keyof RikishiStatus['stats']>).forEach((key) => {
    status.stats[key] = clamp(Math.round(status.stats[key] + (statBonus[key] ?? 0)), 1, 120);
  });
  status.potential = clamp(status.potential + resolveEntryArchetypePotentialBonus(entryArchetype), 1, 100);
  status.growthType = rollGrowthTypeForEntryArchetype(entryArchetype, rng) ?? status.growthType;
  status.careerBand = rollCareerBandForEntryArchetype(entryArchetype, status.aptitudeTier, rng) ?? status.careerBand;
};
