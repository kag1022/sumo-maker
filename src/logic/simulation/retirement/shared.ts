import { BashoRecord, CareerBand, CareerSeedBiases, Division, RetirementProfile } from '../../models';

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

// 序盤から下位停滞者が自然に去るよう、全年齢に効く基礎 hazard を持たせる。
// 年齢 slope だけに寄せると、若く低勝率のまま長く残る不自然なキャリアが増える。
const RETIREMENT_HAZARD = {
  baseChance: 0.0034,
  chanceMax: 0.92,
  // バッチ修正: 平均場所数頭打ちの根本原因。最初の 40 basho かつ age<31 で hazard を
  // 0 にリセットしていたため、いくら baseChance/slope を強化しても序盤生存が固定化されていた。
  // Heisei 実数値 p10=4 / p50=32 を再現するには序盤の保護を解除する必要がある。
  // ただしユーザビリティ確保のため最初の 6 basho (1年) は完全保護を残す。
  earlyCareerGuard: {
    minCareerBasho: 6,
    maxAgeExclusive: 22,
  },
  // 関取経験者は早期引退を強めすぎず、30代以降の長期居座りを主に刈り取る。
  ageByGroup: {
    NON_SEKITORI: [
      { startAge: 24, slope: 0.002 },
      { startAge: 30, slope: 0.0095 },
      { startAge: 35, slope: 0.018 },
    ] as AgeHazardTier[],
    ACTIVE_SEKITORI: [
      { startAge: 30, slope: 0.0016 },
      { startAge: 35, slope: 0.0095 },
      { startAge: 39, slope: 0.0165 },
    ] as AgeHazardTier[],
    FORMER_SEKITORI_LOWER: [
      { startAge: 31, slope: 0.0050 },
      { startAge: 36, slope: 0.0105 },
      { startAge: 40, slope: 0.0185 },
    ] as AgeHazardTier[],
  },
  injury: {
    offset: 4,
    cap: 8,
    scale: 0.01,
  },
  absence: {
    start: 4,
    base: 0.028,
    perAdditional: 0.014,
  },
  makekoshiByGroup: {
    NON_SEKITORI: { start: 3, base: 0.014, perAdditional: 0.008 } as StreakHazard,
    ACTIVE_SEKITORI: { start: 6, base: 0.006, perAdditional: 0.004 } as StreakHazard,
    FORMER_SEKITORI_LOWER: { start: 6, base: 0.006, perAdditional: 0.004 } as StreakHazard,
  },
  formerSekitoriDrop: {
    base: 0.002,
    ageStart: 36,
    ageScale: 0.0018,
  },
  activeSekitoriAbsencePressure: {
    startTotal: 3,
    perAdditional: 0.004,
  },
  activeSekitoriUpperTenure: {
    sanyakuStart: 6,
    sanyakuPerAdditional: 0.0022,
    ozekiYokozunaStart: 4,
    ozekiYokozunaPerAdditional: 0.0032,
  },
  chronicInjury: {
    count2Bonus: 0.010,
    count3OrSevereBonus: 0.018,
    activeSekitoriMultiplier: 0.55,
    pressuredSekitoriMultiplier: 0.75,
  },
  kachikoshiRetirementSuppression: {
    multiplier: 0.35,
    maxInjuryLevelExclusive: 7,
    maxConsecutiveAbsenceExclusive: 2,
  },
  nonSekitoriLowerDivisionPenalty: {
    makushita: 0.0004,
    lower: 0.0009,
  },
  // 非関取の長期在籍は早めに hazard を積む。下位で勝ち切れないまま長く残る
  // キャリアは、読後の納得感よりも水増し感が勝ちやすい。
  nonSekitoriLongCareer: [
    { minCareerBasho: 48, bonus: 0.008 },
    { minCareerBasho: 72, bonus: 0.014 },
    { minCareerBasho: 96, bonus: 0.022 },
    { minCareerBasho: 120, bonus: 0.035 },
  ],
  nonSekitoriEarlyLowWin: {
    minCareerBasho: 6,
    maxCareerBasho: 24,
    winRateThreshold: 0.38,
    base: 0.018,
    scale: 0.12,
  },
  formerSekitoriLosingProtection: {
    minCareerBasho: 100,
    maxWinRateExclusive: 0.5,
    multiplier: 0.9,
  },
  ironmanLosingProtection: {
    minCareerBasho: 100,
    maxWinRateExclusive: 0.5,
    multiplier: 0.7,
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
  if (bounded < 0.08) return 'EARLY_EXIT';
  if (bounded < 0.97) return 'STANDARD';
  return 'IRONMAN';
};

export const resolveRetirementProfileFromText = (seedText: string): RetirementProfile =>
  resolveRetirementProfileByRoll(deterministicHash(seedText));

export const resolveRetirementProfileBias = (profile?: RetirementProfile): number => {
  if (profile === 'EARLY_EXIT') return 1.08;
  if (profile === 'IRONMAN') return 0.65;
  return 1;
};

export const clampRetirementBias = (retirementBias?: number): number =>
  clamp(retirementBias ?? 1, 0.78, 1.22);

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
  stagnationPressure?: number;
  careerBand?: CareerBand;
  careerSeedBiases?: CareerSeedBiases;
  recentAbsenceTotal?: number;
  recentUpperBashoCount?: number;
  recentOzekiYokozunaBashoCount?: number;
  lastBashoKachikoshi?: boolean;
  chronicCount?: number;
  severeChronicCount?: number;
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
    stagnationPressure,
    careerBand,
    careerSeedBiases,
    recentAbsenceTotal,
    recentUpperBashoCount,
    recentOzekiYokozunaBashoCount,
    lastBashoKachikoshi,
    chronicCount = 0,
    severeChronicCount = 0,
  } = input;

  if (age >= 50) return 1;
  if (
    careerBashoCount < RETIREMENT_HAZARD.earlyCareerGuard.minCareerBasho &&
    age < RETIREMENT_HAZARD.earlyCareerGuard.maxAgeExclusive
  ) {
    if ((stagnationPressure ?? 0) < 1.8) return 0;
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

  if (
    !isCurrentSekitori &&
    careerBashoCount >= RETIREMENT_HAZARD.nonSekitoriEarlyLowWin.minCareerBasho &&
    careerBashoCount <= RETIREMENT_HAZARD.nonSekitoriEarlyLowWin.maxCareerBasho &&
    careerWinRate < RETIREMENT_HAZARD.nonSekitoriEarlyLowWin.winRateThreshold
  ) {
    chance +=
      RETIREMENT_HAZARD.nonSekitoriEarlyLowWin.base +
      (RETIREMENT_HAZARD.nonSekitoriEarlyLowWin.winRateThreshold - careerWinRate) *
        RETIREMENT_HAZARD.nonSekitoriEarlyLowWin.scale;
  }

  if (hazardGroup === 'ACTIVE_SEKITORI') {
    chance +=
      Math.max(
        0,
        (recentAbsenceTotal ?? 0) - RETIREMENT_HAZARD.activeSekitoriAbsencePressure.startTotal,
      ) * RETIREMENT_HAZARD.activeSekitoriAbsencePressure.perAdditional;
    chance +=
      Math.max(
        0,
        (recentUpperBashoCount ?? 0) - RETIREMENT_HAZARD.activeSekitoriUpperTenure.sanyakuStart,
      ) * RETIREMENT_HAZARD.activeSekitoriUpperTenure.sanyakuPerAdditional;
    chance +=
      Math.max(
        0,
        (recentOzekiYokozunaBashoCount ?? 0) -
          RETIREMENT_HAZARD.activeSekitoriUpperTenure.ozekiYokozunaStart,
      ) * RETIREMENT_HAZARD.activeSekitoriUpperTenure.ozekiYokozunaPerAdditional;
  }

  let chronicBonus = 0;
  if (chronicCount >= 3 || severeChronicCount >= 1) {
    chronicBonus = RETIREMENT_HAZARD.chronicInjury.count3OrSevereBonus;
  } else if (chronicCount >= 2) {
    chronicBonus = RETIREMENT_HAZARD.chronicInjury.count2Bonus;
  }
  if (chronicBonus > 0) {
    const sekitoriChronicMultiplier =
      hazardGroup === 'ACTIVE_SEKITORI'
        ? injuryLevel >= 7 || age >= 32
          ? RETIREMENT_HAZARD.chronicInjury.pressuredSekitoriMultiplier
          : RETIREMENT_HAZARD.chronicInjury.activeSekitoriMultiplier
        : 1;
    chance += chronicBonus * sekitoriChronicMultiplier;
  }

  if (hazardGroup === 'NON_SEKITORI' && !isCurrentSekitori) {
    chance +=
      currentDivision === 'Makushita'
        ? RETIREMENT_HAZARD.nonSekitoriLowerDivisionPenalty.makushita
        : RETIREMENT_HAZARD.nonSekitoriLowerDivisionPenalty.lower;
  }

  if (!isCurrentSekitori) {
    chance += Math.max(0, (stagnationPressure ?? 0) - 1.8) * 0.02;
    if (careerBand === 'GRINDER') {
      chance *= careerBashoCount < 80 ? 1.06 : 1.16;
    } else if (careerBand === 'WASHOUT') {
      chance *= careerBashoCount < 90 ? 1.22 : 1.1;
    }
  }

  if (hazardGroup === 'NON_SEKITORI') {
    for (const threshold of RETIREMENT_HAZARD.nonSekitoriLongCareer) {
      if (careerBashoCount >= threshold.minCareerBasho) {
        chance += threshold.bonus;
      }
    }
  }
  // バッチ修正: 関取群でも長期キャリアを抑制（プレイヤー平均場所数 63 → 44 目標）。
  if (hazardGroup === 'ACTIVE_SEKITORI' || hazardGroup === 'FORMER_SEKITORI_LOWER') {
    if (careerBashoCount >= 80) chance += 0.006;
    if (careerBashoCount >= 110) chance += 0.012;
    if (careerBashoCount >= 150) chance += 0.020;
  }

  let resolved = chance * resolveRetirementProfileBias(profile) * clampRetirementBias(retirementBias);
  if (careerSeedBiases) {
    resolved *= clamp(
      1
        - careerSeedBiases.reboundBias * 0.04
        - careerSeedBiases.slumpResistanceBias * 0.03
        + careerSeedBiases.socialPressureBias * 0.04,
      0.7,
      1.25,
    );
  }
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
  if (
    lastBashoKachikoshi &&
    injuryLevel < RETIREMENT_HAZARD.kachikoshiRetirementSuppression.maxInjuryLevelExclusive &&
    consecutiveAbsence < RETIREMENT_HAZARD.kachikoshiRetirementSuppression.maxConsecutiveAbsenceExclusive
  ) {
    resolved *= RETIREMENT_HAZARD.kachikoshiRetirementSuppression.multiplier;
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
  chronicCount?: number;
  severeChronicCount?: number;
}): string => {
  const {
    age,
    consecutiveAbsence,
    consecutiveMakekoshi,
    injuryLevel,
    isFormerSekitori,
    currentDivision,
    chronicCount = 0,
    severeChronicCount = 0,
  } = input;
  const hazardGroup = resolveRetirementHazardGroup({ isFormerSekitori, currentDivision });
  const makekoshiTrigger = RETIREMENT_HAZARD.makekoshiByGroup[hazardGroup].start;

  if (age >= 50) return '気力・体力の限界により引退';
  if (consecutiveAbsence >= 6) return '度重なる怪我と長期休場により引退';
  if (injuryLevel >= 9) return '怪我の回復が見込めず引退';
  if (severeChronicCount >= 1) return '古傷を抱えきれず引退';
  if (chronicCount >= 3) return '慢性的な故障が重なり引退';
  if (chronicCount >= 2) return '古傷の累積により引退';
  if (isFormerSekitori && !TOP_DIVISIONS.includes(currentDivision)) {
    return '関取復帰を断念し引退';
  }
  if (consecutiveMakekoshi >= makekoshiTrigger) return '連続負け越しによる引退';
  return '気力・体力の限界により引退';
};
