import {
  AmateurBackground,
  BashoRecord,
  BuildSummary,
  CareerHistory,
  CareerTurningPoint,
  DebtCardId,
  HighlightEvent,
  HighlightEventTag,
  IchimonId,
  MentalTraitType,
  Oyakata,
  OyakataBlueprint,
  OyakataProfile,
  Rank,
  RikishiStatus,
  StyleArchetype,
  StyleCompatibility,
  StyleProfile,
  TacticsType,
} from './models';

export const PHASE_A_STARTING_POINTS = 50;
export const PHASE_A_WALLET_CAP = 100;
export const PHASE_A_REWARD_CAP = 40;

export const STYLE_LABELS: Record<StyleArchetype, string> = {
  YOTSU: '四つ',
  TSUKI_OSHI: '突き押し',
  MOROZASHI: 'もろ差し',
  DOHYOUGIWA: '土俵際',
  NAGE_TECH: '投げ技',
  POWER_PRESSURE: '圧力相撲',
};

export const BODY_CONSTITUTION_LABELS = {
  BALANCED_FRAME: '均整体',
  HEAVY_BULK: '重量体',
  LONG_REACH: '長身長腕',
  SPRING_LEGS: '足腰体質',
} as const;

export const AMATEUR_BACKGROUND_CONFIG = {
  MIDDLE_SCHOOL: {
    label: '中卒たたき上げ',
    entryAge: 15,
    startRank: { division: 'Maezumo', name: '前相撲', side: 'East', number: 1 } as Rank,
    initialHeightDelta: 6,
    initialWeightDelta: 22,
  },
  HIGH_SCHOOL: {
    label: '高卒入門',
    entryAge: 18,
    startRank: { division: 'Maezumo', name: '前相撲', side: 'East', number: 1 } as Rank,
    initialHeightDelta: 4,
    initialWeightDelta: 16,
  },
  STUDENT_ELITE: {
    label: '学生エリート',
    entryAge: 22,
    startRank: { division: 'Sandanme', name: '三段目', side: 'East', number: 90 } as Rank,
    initialHeightDelta: 2,
    initialWeightDelta: 10,
  },
  COLLEGE_YOKOZUNA: {
    label: '学生横綱',
    entryAge: 22,
    startRank: { division: 'Makushita', name: '幕下', side: 'East', number: 60 } as Rank,
    initialHeightDelta: 1,
    initialWeightDelta: 8,
  },
} as const;

export const MENTAL_TRAIT_LABELS: Record<MentalTraitType, string> = {
  CALM_ENGINE: '平常心',
  BIG_STAGE: '大舞台型',
  VOLATILE_FIRE: '激情型',
  STONEWALL: '不動心',
};

export const DEBT_CARD_LABELS: Record<DebtCardId, string> = {
  OLD_KNEE: '古傷の膝',
  PRESSURE_LINEAGE: '重圧の血統',
  LATE_START: '遅咲き前提',
};

export const DEBT_CARD_POINT_BONUS: Record<DebtCardId, number> = {
  OLD_KNEE: 8,
  PRESSURE_LINEAGE: 7,
  LATE_START: 10,
};

export const STARTER_OYAKATA_BLUEPRINTS: OyakataBlueprint[] = [
  {
    id: 'starter-taiju',
    name: '大樹親方',
    ichimonId: 'TAIJU',
    advantage: '四つ育成',
    drawback: '出足弱化',
    secretStyle: 'YOTSU',
    growthMods: { kumi: 1.1, koshi: 1.1, deashi: 0.94 },
    spiritMods: { injuryPenalty: 0.95, slumpPenalty: 1, promotionBonus: 1.02 },
    injuryMod: 0.98,
    unlockRule: { type: 'STARTER', summary: '初期解放' },
  },
  {
    id: 'starter-kurogane',
    name: '黒鉄親方',
    ichimonId: 'KUROGANE',
    advantage: '近代強化',
    drawback: '技術鈍化',
    secretStyle: 'TSUKI_OSHI',
    growthMods: { power: 1.08, oshi: 1.07, waza: 0.94 },
    spiritMods: { injuryPenalty: 0.92, slumpPenalty: 0.98, promotionBonus: 1.03 },
    injuryMod: 0.94,
    unlockRule: { type: 'STARTER', summary: '初期解放' },
  },
  {
    id: 'starter-raimei',
    name: '雷鳴親方',
    ichimonId: 'RAIMEI',
    advantage: '立合い圧力',
    drawback: '怪我増',
    secretStyle: 'TSUKI_OSHI',
    growthMods: { tsuki: 1.09, oshi: 1.09, power: 1.04 },
    spiritMods: { injuryPenalty: 1.08, slumpPenalty: 0.97, promotionBonus: 1.01 },
    injuryMod: 1.08,
    unlockRule: { type: 'STARTER', summary: '初期解放' },
  },
  {
    id: 'starter-hakutsuru',
    name: '白鶴親方',
    ichimonId: 'HAKUTSURU',
    advantage: '技巧育成',
    drawback: '馬力不足',
    secretStyle: 'MOROZASHI',
    growthMods: { waza: 1.1, nage: 1.06, power: 0.95 },
    spiritMods: { injuryPenalty: 0.97, slumpPenalty: 0.95, promotionBonus: 1.01 },
    injuryMod: 0.97,
    unlockRule: { type: 'STARTER', summary: '初期解放' },
  },
  {
    id: 'starter-hayate',
    name: '疾風親方',
    ichimonId: 'HAYATE',
    advantage: '対応力',
    drawback: '天井低め',
    secretStyle: 'DOHYOUGIWA',
    growthMods: { deashi: 1.05, waza: 1.03, power: 0.97 },
    spiritMods: { injuryPenalty: 0.96, slumpPenalty: 0.92, promotionBonus: 1.02 },
    injuryMod: 0.98,
    unlockRule: { type: 'STARTER', summary: '初期解放' },
  },
];

const COMPATIBILITY_MAP: Partial<Record<`${StyleArchetype}:${StyleArchetype}`, StyleCompatibility>> = {
  'YOTSU:MOROZASHI': 'EXCELLENT',
  'MOROZASHI:YOTSU': 'EXCELLENT',
  'TSUKI_OSHI:DOHYOUGIWA': 'EXCELLENT',
  'DOHYOUGIWA:TSUKI_OSHI': 'EXCELLENT',
  'YOTSU:DOHYOUGIWA': 'GOOD',
  'DOHYOUGIWA:YOTSU': 'GOOD',
  'MOROZASHI:DOHYOUGIWA': 'GOOD',
  'DOHYOUGIWA:MOROZASHI': 'GOOD',
  'YOTSU:TSUKI_OSHI': 'POOR',
  'TSUKI_OSHI:YOTSU': 'POOR',
  'MOROZASHI:TSUKI_OSHI': 'POOR',
  'TSUKI_OSHI:MOROZASHI': 'POOR',
};

const STYLE_TO_TACTICS: Record<StyleArchetype, TacticsType> = {
  YOTSU: 'GRAPPLE',
  MOROZASHI: 'GRAPPLE',
  TSUKI_OSHI: 'PUSH',
  DOHYOUGIWA: 'TECHNIQUE',
  NAGE_TECH: 'TECHNIQUE',
  POWER_PRESSURE: 'PUSH',
};

const resolveStyleCountScore = (kimarite: string): Partial<Record<StyleArchetype, number>> => {
  const move = kimarite.replace(/\s/g, '');
  if (move.includes('押') || move.includes('突')) {
    return { TSUKI_OSHI: 1.2, POWER_PRESSURE: 0.6 };
  }
  if (move.includes('寄') || move.includes('極め')) {
    return { YOTSU: 1.1, MOROZASHI: 0.9 };
  }
  if (move.includes('差')) {
    return { MOROZASHI: 1.4 };
  }
  if (move.includes('投') || move.includes('捻')) {
    return { NAGE_TECH: 1.2, DOHYOUGIWA: 0.4 };
  }
  if (move.includes('うっちゃり') || move.includes('突き落') || move.includes('肩透')) {
    return { DOHYOUGIWA: 1.2, NAGE_TECH: 0.5 };
  }
  if (move.includes('叩') || move.includes('引')) {
    return { DOHYOUGIWA: 0.8, TSUKI_OSHI: 0.3 };
  }
  return {};
};

const rankToNumericTier = (rank: Rank): number => {
  if (rank.division === 'Makuuchi') return 6;
  if (rank.division === 'Juryo') return 5;
  if (rank.division === 'Makushita') return 4;
  if (rank.division === 'Sandanme') return 3;
  if (rank.division === 'Jonidan') return 2;
  if (rank.division === 'Jonokuchi') return 1;
  return 0;
};

export const resolvePhaseARewardPoints = (awardedPoints: number): number =>
  Math.max(0, Math.min(PHASE_A_REWARD_CAP, Math.floor(Math.max(0, awardedPoints) * 0.25)));

export const getStyleCompatibility = (
  primary: StyleArchetype,
  secondary: StyleArchetype,
): StyleCompatibility => {
  if (primary === secondary) return 'NEUTRAL';
  return COMPATIBILITY_MAP[`${primary}:${secondary}`] ?? 'NEUTRAL';
};

export const getCompatibilityWeight = (compatibility: StyleCompatibility): number => {
  if (compatibility === 'EXCELLENT') return 12;
  if (compatibility === 'GOOD') return 6;
  if (compatibility === 'POOR') return -10;
  return 0;
};

export const getStyleLabel = (style: StyleArchetype): string => STYLE_LABELS[style];

export const styleToTactics = (style: StyleArchetype): TacticsType => STYLE_TO_TACTICS[style];

export const createDesignedStyleProfile = (input: {
  primary: StyleArchetype;
  secondary: StyleArchetype;
  secret?: StyleArchetype;
}): StyleProfile => {
  const compatibility = getStyleCompatibility(input.primary, input.secondary);
  const dominant = input.secret ?? input.primary;
  return {
    primary: input.primary,
    secondary: input.secondary,
    secret: input.secret,
    dominant,
    compatibility,
    label: `${STYLE_LABELS[input.primary]} / ${STYLE_LABELS[input.secondary]}`,
    confidence: 0.84,
    source: 'DESIGNED',
  };
};

export const resolveRealizedStyleProfile = (status: RikishiStatus): StyleProfile | null => {
  const entries = Object.entries(status.history.kimariteTotal ?? {}).filter(([, count]) => count > 0);
  if (entries.length < 6) return null;
  const scoreMap: Record<StyleArchetype, number> = {
    YOTSU: 0,
    TSUKI_OSHI: 0,
    MOROZASHI: 0,
    DOHYOUGIWA: 0,
    NAGE_TECH: 0,
    POWER_PRESSURE: 0,
  };
  let total = 0;
  for (const [move, count] of entries) {
    const styleScores = resolveStyleCountScore(move);
    total += count;
    (Object.keys(styleScores) as StyleArchetype[]).forEach((style) => {
      scoreMap[style] += (styleScores[style] ?? 0) * count;
    });
  }
  if (status.designedStyleProfile) {
    scoreMap[status.designedStyleProfile.primary] += 1.2;
    scoreMap[status.designedStyleProfile.secondary] += 0.8;
  }
  const ranked = (Object.entries(scoreMap) as Array<[StyleArchetype, number]>)
    .sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const second = ranked[1];
  if (!top || top[1] < Math.max(4, total * 0.18)) {
    return null;
  }
  return {
    primary: top[0],
    secondary: second?.[0] ?? top[0],
    dominant: top[0],
    compatibility: second ? getStyleCompatibility(top[0], second[0]) : 'NEUTRAL',
    label: second ? `${STYLE_LABELS[top[0]]} / ${STYLE_LABELS[second[0]]}` : STYLE_LABELS[top[0]],
    confidence: Math.min(0.96, top[1] / Math.max(1, total)),
    source: 'REALIZED',
    locked: top[1] < Math.max(6, total * 0.24),
  };
};

export const createUnlockedOyakataBlueprint = (profile: OyakataProfile): OyakataBlueprint => ({
  id: profile.id,
  name: profile.displayName,
  ichimonId: resolveBlueprintIchimon(profile),
  advantage: profile.trait,
  drawback: profile.legacyStars >= 4 ? '名跡の重圧' : '継承中',
  secretStyle: profile.secretStyle ?? 'YOTSU',
  growthMods: profile.growthMod,
  spiritMods: {
    injuryPenalty: 1,
    slumpPenalty: 1,
    promotionBonus: 1 + profile.legacyStars * 0.01,
  },
  injuryMod: profile.injuryMod,
  unlockRule: { type: 'CAREER', summary: '条件達成で継承' },
  sourceCareerId: profile.sourceCareerId,
  maxRank: profile.maxRank,
});

export const blueprintToOyakata = (blueprint: OyakataBlueprint): Oyakata => ({
  id: blueprint.id,
  name: blueprint.name,
  trait: blueprint.advantage,
  secretStyle: blueprint.secretStyle,
  growthMod: blueprint.growthMods,
  injuryMod: blueprint.injuryMod,
  spiritMods: blueprint.spiritMods,
});

const resolveBlueprintIchimon = (profile: OyakataProfile): IchimonId => {
  const tag = profile.id.toLowerCase();
  if (tag.includes('kurogane') || tag.includes('black') || tag.includes('steel')) return 'KUROGANE';
  if (tag.includes('raimei') || tag.includes('thunder')) return 'RAIMEI';
  if (tag.includes('hakutsuru') || tag.includes('crane')) return 'HAKUTSURU';
  if (tag.includes('hayate') || tag.includes('wind')) return 'HAYATE';
  return 'TAIJU';
};

export const estimateCareerBandLabel = (summary: {
  spentPoints: number;
  debtCount: number;
  compatibility: StyleCompatibility;
}): string => {
  const score = summary.spentPoints + summary.debtCount * 4 + getCompatibilityWeight(summary.compatibility);
  if (score >= 64) return '三役挑戦圏';
  if (score >= 54) return '幕内上位圏';
  if (score >= 44) return '関取圏';
  if (score >= 34) return '幕下上位圏';
  return '下位育成圏';
};

export const buildPhaseABuildSummary = (input: {
  oyakataName: string;
  amateurBackground: AmateurBackground;
  bodyConstitution: BuildSummary['bodyConstitution'];
  heightPotentialCm: number;
  weightPotentialKg: number;
  reachDeltaCm: number;
  spentPoints: number;
  remainingPoints: number;
  debtCount: number;
  debtCards?: DebtCardId[];
  secretStyle?: StyleArchetype;
  compatibility: StyleCompatibility;
}): BuildSummary => ({
  oyakataName: input.oyakataName,
  amateurBackground: input.amateurBackground,
  bodyConstitution: input.bodyConstitution,
  heightPotentialCm: input.heightPotentialCm,
  weightPotentialKg: input.weightPotentialKg,
  reachDeltaCm: input.reachDeltaCm,
  spentPoints: input.spentPoints,
  remainingPoints: input.remainingPoints,
  debtCount: input.debtCount,
  debtCards: input.debtCards,
  secretStyle: input.secretStyle,
  careerBandLabel: estimateCareerBandLabel(input),
});

export const ensurePhaseAHistory = (history: CareerHistory): CareerHistory => {
  if (!history.bodyTimeline) history.bodyTimeline = [];
  if (!history.highlightEvents) history.highlightEvents = [];
  return history;
};

export const pushBodyTimelinePoint = (
  history: CareerHistory,
  record: BashoRecord,
  bashoSeq: number,
  weightKg: number,
): void => {
  ensurePhaseAHistory(history);
  history.bodyTimeline!.push({
    bashoSeq,
    year: record.year,
    month: record.month,
    weightKg: Math.round(weightKg * 10) / 10,
  });
};

export const pushHighlightEvent = (
  history: CareerHistory,
  event: HighlightEvent,
): void => {
  ensurePhaseAHistory(history);
  const exists = history.highlightEvents!.some((entry) =>
    entry.bashoSeq === event.bashoSeq && entry.tag === event.tag);
  if (!exists) {
    history.highlightEvents!.push(event);
  }
};

export const setCareerTurningPoint = (
  history: CareerHistory,
  turningPoint: CareerTurningPoint,
): void => {
  ensurePhaseAHistory(history);
  if (!history.careerTurningPoint || turningPoint.severity >= history.careerTurningPoint.severity) {
    history.careerTurningPoint = turningPoint;
  }
};

export const inferHighlightEvents = (status: RikishiStatus): HighlightEvent[] => {
  const result: HighlightEvent[] = [...(status.history.highlightEvents ?? [])];
  const ensure = (tag: HighlightEventTag, bashoSeq: number, year: number, month: number, label: string) => {
    if (!result.some((event) => event.tag === tag && event.bashoSeq === bashoSeq)) {
      result.push({ tag, bashoSeq, year, month, label });
    }
  };
  status.history.records.forEach((record, index) => {
    const seq = index + 1;
    if (record.yusho) ensure('YUSHO', seq, record.year, record.month, '優勝');
    if ((record.kinboshi ?? 0) > 0) ensure('KINBOSHI', seq, record.year, record.month, '金星');
    if (record.rank.division === 'Juryo') {
      const prev = status.history.records[index - 1];
      if (!prev || prev.rank.division !== 'Juryo' && prev.rank.division !== 'Makuuchi') {
        ensure('FIRST_SEKITORI', seq, record.year, record.month, '初関取');
      }
    }
    const prev = status.history.records[index - 1];
    if (prev?.rank.division === 'Juryo' && record.rank.division === 'Makushita') {
      ensure('JURYO_DROP', seq, record.year, record.month, '十両陥落');
    }
  });
  status.history.events.forEach((event) => {
    const matchingIndex = status.history.records.findIndex((record) => record.year === event.year && record.month === event.month);
    const bashoSeq = matchingIndex >= 0 ? matchingIndex + 1 : status.history.records.length;
    if (event.type === 'PROMOTION') ensure('PROMOTION', bashoSeq, event.year, event.month, '昇進');
    if (event.type === 'RETIREMENT') ensure('RETIREMENT', bashoSeq, event.year, event.month, '引退');
    if (event.type === 'INJURY' && /重症度 ([7-9]|10)/.test(event.description)) {
      ensure('MAJOR_INJURY', bashoSeq, event.year, event.month, '大怪我');
    }
  });
  return result.sort((a, b) => a.bashoSeq - b.bashoSeq);
};

export const inferCareerTurningPoint = (status: RikishiStatus): CareerTurningPoint | undefined => {
  const fromHistory = status.history.careerTurningPoint;
  if (fromHistory) return fromHistory;
  let candidate: CareerTurningPoint | undefined;
  status.history.events.forEach((event) => {
    if (event.type !== 'INJURY') return;
    const match = event.description.match(/重症度 (\d+)/);
    const severity = match ? Number(match[1]) : 0;
    if (severity < 7) return;
    const bashoSeq = Math.max(1, status.history.records.findIndex((record) =>
      record.year === event.year && record.month === event.month) + 1);
    if (!candidate || severity > candidate.severity) {
      candidate = {
        bashoSeq,
        year: event.year,
        month: event.month,
        reason: event.description,
        severity,
      };
    }
  });
  return candidate;
};

export const ensurePhaseAStatus = (status: RikishiStatus): RikishiStatus => {
  const next = { ...status };
  next.spirit = Number.isFinite(next.spirit) ? next.spirit : 70;
  next.history = ensurePhaseAHistory({ ...next.history });
  next.realizedStyleProfile = next.realizedStyleProfile ?? resolveRealizedStyleProfile(next);
  next.history.highlightEvents = inferHighlightEvents(next);
  next.history.careerTurningPoint = inferCareerTurningPoint(next);
  return next;
};

export const getRetirementSpiritReason = (status: RikishiStatus): string => {
  if (status.spirit <= 0) return '気力が尽きて土俵を去った';
  if (status.age >= 31 && status.spirit <= 15) return '気力の細りにより引退';
  return '気力・体力の限界により引退';
};

export const buildCounterfactualInjuryText = (status: RikishiStatus): string | null => {
  const turningPoint = inferCareerTurningPoint(status);
  if (!turningPoint) return null;
  const after = status.history.records.filter((_record, index) => index + 1 > turningPoint.bashoSeq);
  if (after.length === 0) return null;
  const avgWins = after.reduce((sum, record) => sum + record.wins, 0) / after.length;
  const nextTier =
    rankToNumericTier(status.history.maxRank) >= 6 ? '横綱・大関線' :
    rankToNumericTier(status.history.maxRank) >= 5 ? '幕内上位線' :
    rankToNumericTier(status.history.maxRank) >= 4 ? '関取上位線' :
    '関取線';
  return `もし${turningPoint.year}年${turningPoint.month}月の怪我がなければ、その後は平均${avgWins.toFixed(1)}勝ペースで${nextTier}まで届いた可能性がある。`;
};

export const buildFantasyHooks = (status: RikishiStatus): string[] => {
  const hooks: string[] = [];
  const highlights = inferHighlightEvents(status);
  const yusho = highlights.find((event) => event.tag === 'YUSHO');
  const firstSekitori = highlights.find((event) => event.tag === 'FIRST_SEKITORI');
  const majorInjury = highlights.find((event) => event.tag === 'MAJOR_INJURY');
  const kinboshi = highlights.find((event) => event.tag === 'KINBOSHI');

  if (firstSekitori) hooks.push(`${firstSekitori.year}年${firstSekitori.month}月に関取へ届いた瞬間が、この系譜の分岐点になった。`);
  if (yusho) hooks.push(`${yusho.year}年${yusho.month}月の優勝で、一門の看板候補として空気が変わった。`);
  if (kinboshi) hooks.push(`${kinboshi.year}年${kinboshi.month}月の金星が、型の完成を世間に知らしめた。`);
  if (majorInjury) hooks.push(`${majorInjury.year}年${majorInjury.month}月の大怪我がなければ、もう一段上の番付争いが見えた。`);
  if (status.designedStyleProfile && status.realizedStyleProfile) {
    if (status.designedStyleProfile.dominant !== status.realizedStyleProfile.dominant) {
      hooks.push(`設計では${STYLE_LABELS[status.designedStyleProfile.dominant]}型だったが、土俵では${STYLE_LABELS[status.realizedStyleProfile.dominant]}に化けた。`);
    } else {
      hooks.push(`設計どおり${STYLE_LABELS[status.designedStyleProfile.dominant]}を通し切った、珍しい完成形だった。`);
    }
  }
  if (hooks.length < 3) {
    hooks.push(`最高位 ${status.history.maxRank.name} までの曲線に、この力士らしい癖がはっきり残った。`);
  }
  return hooks.slice(0, 5);
};

export const applySpiritChangeAfterBasho = (input: {
  status: RikishiStatus;
  record: BashoRecord;
  previousRank: Rank;
  nextRank: Rank;
  newEvents: Array<{ type: string; description: string }>;
}): number => {
  let delta = 0;
  if (input.record.yusho) delta += 8;
  if (input.newEvents.some((event) => event.type === 'PROMOTION')) delta += 4;
  if (input.newEvents.some((event) => event.type === 'INJURY' && /重症度 ([7-9]|10)/.test(event.description))) {
    delta -= 18;
  }
  const recent = input.status.history.records.slice(-3);
  if (recent.length === 3 && recent.every((record) => record.wins < record.losses + record.absent)) {
    delta -= 10;
  }
  if (input.previousRank.division === 'Juryo' && input.nextRank.division === 'Makushita') {
    delta -= 12;
  }
  if (
    input.record.wins === 7 &&
    input.record.losses >= 8 &&
    (input.previousRank.division === 'Makuuchi' || input.previousRank.division === 'Juryo')
  ) {
    delta -= 8;
  }
  if (input.status.buildSummary?.debtCards?.includes('PRESSURE_LINEAGE') && delta < 0) {
    delta = Math.floor(delta * 1.25);
  }
  return delta;
};
