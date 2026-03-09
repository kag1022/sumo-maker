import { BashoRecord, Division, RetirementProfile } from '../../models';

const TOP_DIVISIONS: Division[] = ['Makuuchi', 'Juryo'];
type RetirementHazardGroup =
  | 'NON_SEKITORI'
  | 'ACTIVE_SEKITORI'
  | 'FORMER_SEKITORI_LOWER';

type AgeHazardTier = {
  startAge: number;
  slope: number;
};

type StreakHazard = {
  start: number;
  base: number;
  perAdditional: number;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const RETIREMENT_HAZARD = {
  baseChance: 0.002,
  chanceMax: 0.92,
  earlyCareerGuard: {
    minCareerBasho: 18,
    maxAgeExclusive: 30,
  },
  ageByGroup: {
    NON_SEKITORI: [
      { startAge: 19, slope: 0.0125 },
      { startAge: 24, slope: 0.021 },
      { startAge: 28, slope: 0.031 },
    ] as AgeHazardTier[],
    ACTIVE_SEKITORI: [
      { startAge: 28, slope: 0.003 },
      { startAge: 33, slope: 0.0075 },
      { startAge: 38, slope: 0.013 },
    ] as AgeHazardTier[],
    FORMER_SEKITORI_LOWER: [
      { startAge: 27, slope: 0.0045 },
      { startAge: 32, slope: 0.0095 },
      { startAge: 37, slope: 0.016 },
    ] as AgeHazardTier[],
  },
  injury: {
    offset: 4,
    cap: 8,
    scale: 0.01,
  },
  absence: {
    start: 4,
    base: 0.035,
    perAdditional: 0.02,
  },
  makekoshiByGroup: {
    NON_SEKITORI: { start: 4, base: 0.015, perAdditional: 0.01 } as StreakHazard,
    ACTIVE_SEKITORI: { start: 6, base: 0.008, perAdditional: 0.006 } as StreakHazard,
    FORMER_SEKITORI_LOWER: { start: 6, base: 0.008, perAdditional: 0.006 } as StreakHazard,
  },
  formerSekitoriDrop: {
    base: 0.006,
    ageStart: 34,
    ageScale: 0.0035,
  },
  nonSekitoriLowerDivisionPenalty: {
    makushita: 0.01,
    lower: 0.02,
  },
  nonSekitoriLongCareer: [
    { minCareerBasho: 80, bonus: 0.012 },
    { minCareerBasho: 120, bonus: 0.018 },
  ],
  formerSekitoriLosingProtection: {
    minCareerBasho: 100,
    maxWinRateExclusive: 0.5,
    multiplier: 0.78,
  },
  ironmanLosingProtection: {
    minCareerBasho: 100,
    maxWinRateExclusive: 0.5,
    multiplier: 0.45,
  },
} as const;

const resolveRetirementHazardGroup = (input: {
  isFormerSekitori: boolean;
  currentDivision: Division;
}): RetirementHazardGroup => {
  const isCurrentSekitori = TOP_DIVISIONS.includes(input.currentDivision);
  if (!input.isFormerSekitori) return 'NON_SEKITORI';
  if (isCurrentSekitori) return 'ACTIVE_SEKITORI';
  return 'FORMER_SEKITORI_LOWER';
};

const resolveTieredAgeHazard = (age: number, tiers: AgeHazardTier[]): number =>
  tiers.reduce((sum, tier) => (
    age >= tier.startAge ? sum + (age - (tier.startAge - 1)) * tier.slope : sum
  ), 0);

const resolveStreakHazard = (streak: number, hazard: StreakHazard): number => {
  if (streak < hazard.start) return 0;
  return hazard.base + (streak - hazard.start) * hazard.perAdditional;
};

const deterministicHash = (text: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1_000_003) / 1_000_003;
};

export const resolveRetirementProfileByRoll = (roll: number): RetirementProfile => {
  const bounded = clamp(roll, 0, 0.999999);
  if (bounded < 0.22) return 'EARLY_EXIT';
  if (bounded < 0.98) return 'STANDARD';
  return 'IRONMAN';
};

export const resolveRetirementProfileFromText = (seedText: string): RetirementProfile =>
  resolveRetirementProfileByRoll(deterministicHash(seedText));

export const resolveRetirementProfileBias = (profile?: RetirementProfile): number => {
  if (profile === 'EARLY_EXIT') return 1.3;
  if (profile === 'IRONMAN') return 0.55;
  return 1;
};

export const clampRetirementBias = (retirementBias?: number): number =>
  clamp(retirementBias ?? 1, 0.85, 1.15);

export const computeConsecutiveAbsenceStreak = (
  records: BashoRecord[],
  limit = 10,
): number => {
  const recent = records.slice(-limit);
  let streak = 0;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const record = recent[i];
    if (record.absent <= 0) break;
    streak += 1;
  }
  return streak;
};

type RecordLike = { wins: number; losses: number; absent?: number };

export const computeConsecutiveMakekoshiStreak = (
  records: RecordLike[],
  limit = 10,
): number => {
  const recent = records.slice(-limit);
  let streak = 0;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const record = recent[i];
    const effectiveLosses = record.losses + (record.absent ?? 0);
    if (record.wins >= effectiveLosses) break;
    streak += 1;
  }
  return streak;
};

export interface RetirementChanceInput {
  age: number;
  injuryLevel: number;
  currentDivision: Division;
  isFormerSekitori: boolean;
  consecutiveAbsence: number;
  consecutiveMakekoshi: number;
  profile?: RetirementProfile;
  retirementBias?: number;
  careerBashoCount: number;
  careerWinRate: number;
}

export const resolveRetirementChance = (input: RetirementChanceInput): number => {
  const {
    age,
    injuryLevel,
    currentDivision,
    isFormerSekitori,
    consecutiveAbsence,
    consecutiveMakekoshi,
    profile,
    retirementBias,
    careerBashoCount,
    careerWinRate,
  } = input;

  if (age >= 50) return 1;
  if (
    careerBashoCount < RETIREMENT_HAZARD.earlyCareerGuard.minCareerBasho &&
    age < RETIREMENT_HAZARD.earlyCareerGuard.maxAgeExclusive
  ) {
    return 0;
  }

  const hazardGroup = resolveRetirementHazardGroup({ isFormerSekitori, currentDivision });
  const isCurrentSekitori = TOP_DIVISIONS.includes(currentDivision);
  let chance = RETIREMENT_HAZARD.baseChance;
  chance += resolveTieredAgeHazard(age, RETIREMENT_HAZARD.ageByGroup[hazardGroup]);

  chance +=
    clamp(
      injuryLevel - RETIREMENT_HAZARD.injury.offset,
      0,
      RETIREMENT_HAZARD.injury.cap,
    ) * RETIREMENT_HAZARD.injury.scale;

  chance += resolveStreakHazard(consecutiveAbsence, RETIREMENT_HAZARD.absence);
  chance += resolveStreakHazard(
    consecutiveMakekoshi,
    RETIREMENT_HAZARD.makekoshiByGroup[hazardGroup],
  );

  if (hazardGroup === 'FORMER_SEKITORI_LOWER') {
    chance +=
      RETIREMENT_HAZARD.formerSekitoriDrop.base +
      Math.max(0, age - RETIREMENT_HAZARD.formerSekitoriDrop.ageStart) *
        RETIREMENT_HAZARD.formerSekitoriDrop.ageScale;
  }

  if (hazardGroup === 'NON_SEKITORI' && !isCurrentSekitori) {
    chance +=
      currentDivision === 'Makushita'
        ? RETIREMENT_HAZARD.nonSekitoriLowerDivisionPenalty.makushita
        : RETIREMENT_HAZARD.nonSekitoriLowerDivisionPenalty.lower;
  }

  if (hazardGroup === 'NON_SEKITORI') {
    for (const threshold of RETIREMENT_HAZARD.nonSekitoriLongCareer) {
      if (careerBashoCount >= threshold.minCareerBasho) {
        chance += threshold.bonus;
      }
    }
  }

  let resolved = chance * resolveRetirementProfileBias(profile) * clampRetirementBias(retirementBias);
  if (
    isFormerSekitori &&
    careerBashoCount >= RETIREMENT_HAZARD.formerSekitoriLosingProtection.minCareerBasho &&
    careerWinRate < RETIREMENT_HAZARD.formerSekitoriLosingProtection.maxWinRateExclusive
  ) {
    resolved *= RETIREMENT_HAZARD.formerSekitoriLosingProtection.multiplier;
  }
  if (
    profile === 'IRONMAN' &&
    careerBashoCount >= RETIREMENT_HAZARD.ironmanLosingProtection.minCareerBasho &&
    careerWinRate < RETIREMENT_HAZARD.ironmanLosingProtection.maxWinRateExclusive
  ) {
    resolved *= RETIREMENT_HAZARD.ironmanLosingProtection.multiplier;
  }
  return clamp(resolved, 0, RETIREMENT_HAZARD.chanceMax);
};

export const resolveRetirementReason = (input: {
  age: number;
  consecutiveAbsence: number;
  consecutiveMakekoshi: number;
  injuryLevel: number;
  isFormerSekitori: boolean;
  currentDivision: Division;
}): string => {
  const {
    age,
    consecutiveAbsence,
    consecutiveMakekoshi,
    injuryLevel,
    isFormerSekitori,
    currentDivision,
  } = input;
  const hazardGroup = resolveRetirementHazardGroup({ isFormerSekitori, currentDivision });
  const makekoshiTrigger = RETIREMENT_HAZARD.makekoshiByGroup[hazardGroup].start;

  if (age >= 50) return '気力・体力の限界により引退';
  if (consecutiveAbsence >= 6) return '度重なる怪我と長期休場により引退';
  if (injuryLevel >= 9) return '怪我の回復が見込めず引退';
  if (isFormerSekitori && !TOP_DIVISIONS.includes(currentDivision)) {
    return '関取復帰を断念し引退';
  }
  if (consecutiveMakekoshi >= makekoshiTrigger) return '連続負け越しによる引退';
  return '気力・体力の限界により引退';
};
