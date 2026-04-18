import type { EnemyStyleBias } from '../catalog/enemyData';
import { resolveStyleCountScoreForKimarite } from '../kimarite/catalog';
import type {
  BashoRecord,
  RikishiStatus,
  StyleArchetype,
  StyleIdentityEntry,
  StyleIdentityProfile,
  TacticsType,
  WinRoute,
} from '../models';
import type { PlayerBoutDetail } from '../simulation/basho/types';
import { STYLE_LABELS, styleToTactics } from '../styleProfile';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const STYLE_IDS: StyleArchetype[] = [
  'YOTSU',
  'TSUKI_OSHI',
  'MOROZASHI',
  'DOHYOUGIWA',
  'NAGE_TECH',
  'POWER_PRESSURE',
];

const STYLE_STRENGTH_THRESHOLD = 14;
const STYLE_STRENGTH_GAP = 10;
const STYLE_WEAKNESS_THRESHOLD = -14;
const STYLE_WEAKNESS_GAP = 10;
const INTERNAL_STYLE_MIN_SAMPLE = 45;
const INTERNAL_STYLE_STRENGTH_THRESHOLD = 8;
const INTERNAL_STYLE_STRENGTH_GAP = 10;
const INTERNAL_STYLE_WEAKNESS_THRESHOLD = -8;
const INTERNAL_STYLE_WEAKNESS_GAP = 10;

const emptyEntry = (): StyleIdentityEntry => ({
  aptitude: 0,
  resistance: 0,
  sample: 0,
  lastDelta: 0,
});

const createEmptyProfile = (): StyleIdentityProfile => ({
  version: 1,
  styles: {
    YOTSU: emptyEntry(),
    TSUKI_OSHI: emptyEntry(),
    MOROZASHI: emptyEntry(),
    DOHYOUGIWA: emptyEntry(),
    NAGE_TECH: emptyEntry(),
    POWER_PRESSURE: emptyEntry(),
  },
});

const isTsukedashi = (status: RikishiStatus): boolean =>
  status.entryDivision === 'Makushita60' || status.entryDivision === 'Sandanme90';

const normalizeStat = (value: number): number => clamp(value / 120, 0, 1.25);

const buildAbilityStyleScores = (status: RikishiStatus): Record<StyleArchetype, number> => {
  const { stats } = status;
  const weightFactor = clamp((status.bodyMetrics.weightKg - 140) / 35, -0.3, 0.65);
  const agilityFactor = clamp((142 - status.bodyMetrics.weightKg) / 34, -0.25, 0.55);
  return {
    TSUKI_OSHI:
      normalizeStat(stats.tsuki) * 0.38 +
      normalizeStat(stats.oshi) * 0.34 +
      normalizeStat(stats.deashi) * 0.28,
    POWER_PRESSURE:
      normalizeStat(stats.oshi) * 0.28 +
      normalizeStat(stats.power) * 0.34 +
      normalizeStat(stats.koshi) * 0.2 +
      clamp(0.55 + weightFactor, 0.25, 1.2) * 0.18,
    YOTSU:
      normalizeStat(stats.kumi) * 0.4 +
      normalizeStat(stats.koshi) * 0.34 +
      normalizeStat(stats.power) * 0.26,
    MOROZASHI:
      normalizeStat(stats.kumi) * 0.34 +
      normalizeStat(stats.deashi) * 0.28 +
      normalizeStat(stats.waza) * 0.22 +
      normalizeStat(stats.nage) * 0.16,
    NAGE_TECH:
      normalizeStat(stats.nage) * 0.38 +
      normalizeStat(stats.waza) * 0.36 +
      normalizeStat(stats.deashi) * 0.26,
    DOHYOUGIWA:
      normalizeStat(stats.waza) * 0.3 +
      normalizeStat(stats.deashi) * 0.3 +
      normalizeStat(stats.nage) * 0.16 +
      clamp(0.52 + agilityFactor, 0.2, 1.1) * 0.24,
  };
};

const ROUTE_STYLE_SCORES: Record<WinRoute, Partial<Record<StyleArchetype, number>>> = {
  PUSH_OUT: { TSUKI_OSHI: 1.2, POWER_PRESSURE: 0.9 },
  BELT_FORCE: { YOTSU: 1.2, MOROZASHI: 0.8, POWER_PRESSURE: 0.28 },
  THROW_BREAK: { NAGE_TECH: 1.2, YOTSU: 0.34, MOROZASHI: 0.2 },
  PULL_DOWN: { DOHYOUGIWA: 1.05, NAGE_TECH: 0.62, TSUKI_OSHI: 0.22 },
  EDGE_REVERSAL: { DOHYOUGIWA: 1.25, NAGE_TECH: 0.42 },
  REAR_FINISH: { DOHYOUGIWA: 0.95, MOROZASHI: 0.18 },
  LEG_ATTACK: { NAGE_TECH: 1.0, DOHYOUGIWA: 0.55 },
};

const STYLE_GROUPS: Record<TacticsType, StyleArchetype[]> = {
  PUSH: ['TSUKI_OSHI', 'POWER_PRESSURE'],
  GRAPPLE: ['YOTSU', 'MOROZASHI'],
  TECHNIQUE: ['NAGE_TECH', 'DOHYOUGIWA'],
  BALANCE: [],
};

const ENEMY_BIAS_STRENGTHS: Record<EnemyStyleBias, StyleArchetype[]> = {
  PUSH: ['TSUKI_OSHI', 'POWER_PRESSURE'],
  GRAPPLE: ['YOTSU', 'MOROZASHI'],
  TECHNIQUE: ['NAGE_TECH', 'DOHYOUGIWA'],
  BALANCE: [],
};

const ENEMY_BIAS_WEAKNESSES: Record<EnemyStyleBias, StyleArchetype[]> = {
  PUSH: ['YOTSU', 'MOROZASHI'],
  GRAPPLE: ['NAGE_TECH', 'DOHYOUGIWA'],
  TECHNIQUE: ['TSUKI_OSHI', 'POWER_PRESSURE'],
  BALANCE: [],
};

const sumStyles = (
  seed: Partial<Record<StyleArchetype, number>>,
  factor: number,
  target: Record<StyleArchetype, number>,
): void => {
  STYLE_IDS.forEach((style) => {
    target[style] += (seed[style] ?? 0) * factor;
  });
};

const normalizeProfile = (profile: StyleIdentityProfile): StyleIdentityProfile => {
  const normalized = createEmptyProfile();
  STYLE_IDS.forEach((style) => {
    const current = profile.styles?.[style];
    normalized.styles[style] = {
      aptitude: clamp(current?.aptitude ?? 0, -36, 36),
      resistance: clamp(current?.resistance ?? 0, -36, 36),
      sample: Math.max(0, current?.sample ?? 0),
      lastDelta: clamp(current?.lastDelta ?? 0, -12, 12),
    };
  });
  normalized.lastUpdatedBashoSeq = profile.lastUpdatedBashoSeq;
  return normalized;
};

const rankStyleEntries = (
  profile: StyleIdentityProfile,
  key: 'aptitude' | 'resistance',
): Array<[StyleArchetype, StyleIdentityEntry]> =>
  STYLE_IDS
    .map((style) => [style, profile.styles[style]] as [StyleArchetype, StyleIdentityEntry])
    .sort((left, right) => right[1][key] - left[1][key]);

const resolveAverageStyleSample = (profile?: StyleIdentityProfile): number =>
  profile
    ? STYLE_IDS.reduce((sum, style) => sum + (profile.styles[style]?.sample ?? 0), 0) / STYLE_IDS.length
    : 0;

export interface StyleIdentityShape {
  topAptitude: number;
  secondAptitude: number;
  concentration: number;
  breadth: number;
}

export const resolveStyleIdentityShape = (
  profile?: StyleIdentityProfile,
): StyleIdentityShape => {
  if (!profile) {
    return { topAptitude: 0, secondAptitude: 0, concentration: 1, breadth: 0 };
  }
  const ranked = rankStyleEntries(profile, 'aptitude');
  const top = ranked[0]?.[1].aptitude ?? 0;
  const second = ranked[1]?.[1].aptitude ?? 0;
  const concentration = top > 0 ? top / Math.max(12, Math.max(0, second)) : 1;
  const breadth = ranked.filter(([, entry]) => entry.aptitude >= STYLE_STRENGTH_THRESHOLD).length;
  return { topAptitude: top, secondAptitude: second, concentration, breadth };
};

const seedTsukedashiProfile = (status: RikishiStatus): StyleIdentityProfile => {
  const profile = createEmptyProfile();
  const scores = buildAbilityStyleScores(status);
  const ranked = STYLE_IDS
    .map((style) => ({ style, score: scores[style] }))
    .sort((left, right) => right.score - left.score);
  const top = ranked[0];
  const second = ranked[1];
  if (top) profile.styles[top.style].aptitude = clamp(6 + top.score * 7, 0, 12);
  if (second && second.score >= (top?.score ?? 0) - 0.18) {
    profile.styles[second.style].aptitude = clamp(3 + second.score * 5, 0, 9);
  }
  profile.styles.YOTSU.resistance += status.bodyMetrics.weightKg >= 148 ? 2 : 0;
  profile.styles.POWER_PRESSURE.resistance += status.bodyMetrics.weightKg >= 155 ? 3 : 0;
  profile.styles.NAGE_TECH.resistance += status.bodyMetrics.weightKg <= 138 ? 2 : 0;
  profile.styles.DOHYOUGIWA.resistance += status.bodyType === 'SOPPU' ? 2 : 0;
  return profile;
};

const seedLegacyProfile = (status: RikishiStatus): StyleIdentityProfile | null => {
  const legacy = status as RikishiStatus & {
    designedStyleProfile?: { primary?: StyleArchetype; secondary?: StyleArchetype; dominant?: StyleArchetype };
    realizedStyleProfile?: { primary?: StyleArchetype; secondary?: StyleArchetype; dominant?: StyleArchetype } | null;
    kataProfile?: { archetype?: string };
  };
  const profile = createEmptyProfile();
  let touched = false;
  const addAptitude = (style: StyleArchetype | undefined, value: number): void => {
    if (!style) return;
    profile.styles[style].aptitude += value;
    touched = true;
  };
  addAptitude(legacy.realizedStyleProfile?.dominant, 12);
  addAptitude(legacy.realizedStyleProfile?.primary, 7);
  addAptitude(legacy.realizedStyleProfile?.secondary, 5);
  addAptitude(legacy.designedStyleProfile?.dominant, 8);
  addAptitude(legacy.designedStyleProfile?.primary, 5);
  addAptitude(legacy.designedStyleProfile?.secondary, 3);
  if (legacy.kataProfile?.archetype === 'TSUKI_OSHI') {
    addAptitude('TSUKI_OSHI', 7);
    addAptitude('POWER_PRESSURE', 3);
  } else if (
    legacy.kataProfile?.archetype === 'HIDARI_YOTSU_YORI' ||
    legacy.kataProfile?.archetype === 'MIGI_YOTSU_YORI'
  ) {
    addAptitude('YOTSU', 7);
    addAptitude('MOROZASHI', 4);
  } else if (legacy.kataProfile?.archetype === 'YOTSU_NAGE') {
    addAptitude('NAGE_TECH', 7);
    addAptitude('YOTSU', 3);
  } else if (legacy.kataProfile?.archetype === 'BATTLECRAFT') {
    addAptitude('DOHYOUGIWA', 6);
    addAptitude('NAGE_TECH', 5);
  }
  return touched ? profile : null;
};

export const ensureStyleIdentityProfile = (status: RikishiStatus): RikishiStatus => {
  const existing = status.styleIdentityProfile;
  if (existing) {
    return {
      ...status,
      styleIdentityProfile: normalizeProfile(existing),
    };
  }
  const seeded = seedLegacyProfile(status) ?? (isTsukedashi(status) ? seedTsukedashiProfile(status) : createEmptyProfile());
  return {
    ...status,
    styleIdentityProfile: seeded,
  };
};

export const resolveDisplayedStrengthStyles = (
  profile?: StyleIdentityProfile,
): StyleArchetype[] => {
  if (!profile) return [];
  const ranked = rankStyleEntries(profile, 'aptitude');
  const top = ranked[0]?.[1].aptitude ?? Number.NEGATIVE_INFINITY;
  return ranked
    .filter(([, entry]) => entry.aptitude >= STYLE_STRENGTH_THRESHOLD && entry.aptitude >= top - STYLE_STRENGTH_GAP)
    .map(([style]) => style);
};

export const resolveDisplayedWeakStyles = (
  profile?: StyleIdentityProfile,
): StyleArchetype[] => {
  if (!profile) return [];
  const ranked = rankStyleEntries(profile, 'resistance');
  const worst = ranked[ranked.length - 1]?.[1].resistance ?? Number.POSITIVE_INFINITY;
  return ranked
    .filter(([, entry]) => entry.resistance <= STYLE_WEAKNESS_THRESHOLD && entry.resistance <= worst + STYLE_WEAKNESS_GAP)
    .map(([style]) => style)
    .reverse();
};

export const resolveInternalStrengthStyles = (
  profile?: StyleIdentityProfile,
): StyleArchetype[] => {
  if (!profile || resolveAverageStyleSample(profile) < INTERNAL_STYLE_MIN_SAMPLE) return [];
  const ranked = rankStyleEntries(profile, 'aptitude');
  const top = ranked[0]?.[1].aptitude ?? Number.NEGATIVE_INFINITY;
  return ranked
    .filter(([, entry]) =>
      entry.aptitude >= INTERNAL_STYLE_STRENGTH_THRESHOLD &&
      entry.aptitude >= top - INTERNAL_STYLE_STRENGTH_GAP,
    )
    .slice(0, 2)
    .map(([style]) => style);
};

export const resolveInternalWeakStyles = (
  profile?: StyleIdentityProfile,
): StyleArchetype[] => {
  if (!profile || resolveAverageStyleSample(profile) < INTERNAL_STYLE_MIN_SAMPLE) return [];
  const ranked = rankStyleEntries(profile, 'resistance');
  const worst = ranked[ranked.length - 1]?.[1].resistance ?? Number.POSITIVE_INFINITY;
  return ranked
    .filter(([, entry]) =>
      entry.resistance <= INTERNAL_STYLE_WEAKNESS_THRESHOLD &&
      entry.resistance <= worst + INTERNAL_STYLE_WEAKNESS_GAP,
    )
    .slice(-2)
    .map(([style]) => style)
    .reverse();
};

export const resolveStyleLabels = (styles: StyleArchetype[]): string[] =>
  styles.map((style) => STYLE_LABELS[style]);

const resolveTopAptitudeStyles = (
  profile?: StyleIdentityProfile,
  limit = 2,
): StyleArchetype[] =>
  profile
    ? rankStyleEntries(profile, 'aptitude')
      .map(([style]) => style)
      .slice(0, limit)
    : [];

export const resolveStyleIdentitySummary = (status: RikishiStatus): string => {
  const profile = ensureStyleIdentityProfile(status).styleIdentityProfile;
  const strengths = resolveDisplayedStrengthStyles(profile);
  const weaknesses = resolveDisplayedWeakStyles(profile);
  const parts: string[] = [];
  if (strengths.length > 0) parts.push(`得意 ${resolveStyleLabels(strengths).join(' / ')}`);
  if (weaknesses.length > 0) parts.push(`苦手 ${resolveStyleLabels(weaknesses).join(' / ')}`);
  return parts.length > 0 ? parts.join(' / ') : '型未確立';
};

export const resolveTacticsFromStyleIdentity = (
  profile?: StyleIdentityProfile,
  fallback: TacticsType = 'BALANCE',
): TacticsType => {
  if (!profile) return fallback;
  const groupScores: Record<Exclude<TacticsType, 'BALANCE'>, number> = {
    PUSH: 0,
    GRAPPLE: 0,
    TECHNIQUE: 0,
  };
  (Object.keys(groupScores) as Array<Exclude<TacticsType, 'BALANCE'>>).forEach((tactics) => {
    groupScores[tactics] = STYLE_GROUPS[tactics].reduce(
      (sum, style) => sum + Math.max(0, profile.styles[style].aptitude),
      0,
    );
  });
  const ranked = Object.entries(groupScores).sort((left, right) => right[1] - left[1]) as Array<
    [Exclude<TacticsType, 'BALANCE'>, number]
  >;
  const top = ranked[0];
  const second = ranked[1];
  if (!top || top[1] < 10) return 'BALANCE';
  if (second && top[1] - second[1] < 6) return 'BALANCE';
  return top[0];
};

const inferEnemyStyles = (bias?: EnemyStyleBias): StyleArchetype[] => ENEMY_BIAS_STRENGTHS[bias ?? 'BALANCE'];

const inferEnemyWeakStyles = (bias?: EnemyStyleBias): StyleArchetype[] => ENEMY_BIAS_WEAKNESSES[bias ?? 'BALANCE'];

export const resolveStyleMatchupDelta = (
  profile: StyleIdentityProfile | undefined,
  enemyStyleBias?: EnemyStyleBias,
): number => {
  if (!profile || !enemyStyleBias || enemyStyleBias === 'BALANCE') return 0;
  const strengths = new Set(resolveInternalStrengthStyles(profile));
  const weaknesses = new Set(resolveInternalWeakStyles(profile));
  const enemyStrengths = inferEnemyStyles(enemyStyleBias);
  const enemyWeaknesses = inferEnemyWeakStyles(enemyStyleBias);
  let delta = 0;
  enemyStrengths.forEach((style) => {
    if (weaknesses.has(style)) delta -= 0.04;
  });
  enemyWeaknesses.forEach((style) => {
    if (strengths.has(style)) delta += 0.04;
  });
  if (delta === 0) return 0;
  const avgSample = resolveAverageStyleSample(profile);
  const sampleScale = clamp(avgSample / 80, 0, 1);
  const shape = resolveStyleIdentityShape(profile);
  const concentrationMult = clamp(0.8 + (shape.concentration - 1) * 0.5, 0.8, 1.45);
  const breadthMult = clamp(1.2 - shape.breadth * 0.12, 0.55, 1.2);
  const specialistLossMult = delta < 0 ? clamp(shape.concentration, 1, 1.6) : 1;
  delta *= sampleScale * concentrationMult * breadthMult * specialistLossMult;
  return clamp(delta, -0.14, 0.14);
};

const buildKimariteSignals = (record: BashoRecord): Record<StyleArchetype, number> => {
  const signals: Record<StyleArchetype, number> = {
    YOTSU: 0,
    TSUKI_OSHI: 0,
    MOROZASHI: 0,
    DOHYOUGIWA: 0,
    NAGE_TECH: 0,
    POWER_PRESSURE: 0,
  };
  for (const [move, count] of Object.entries(record.kimariteCount ?? {})) {
    if (count <= 0) continue;
    const moveScores = resolveStyleCountScoreForKimarite(move);
    sumStyles(moveScores, count, signals);
  }
  return signals;
};

const buildRouteSignals = (record: BashoRecord): Record<StyleArchetype, number> => {
  const signals: Record<StyleArchetype, number> = {
    YOTSU: 0,
    TSUKI_OSHI: 0,
    MOROZASHI: 0,
    DOHYOUGIWA: 0,
    NAGE_TECH: 0,
    POWER_PRESSURE: 0,
  };
  for (const [route, count] of Object.entries(record.winRouteCount ?? {})) {
    if (!count) continue;
    sumStyles(ROUTE_STYLE_SCORES[route as WinRoute] ?? {}, count, signals);
  }
  return signals;
};

const buildAptitudeSignals = (
  status: RikishiStatus,
  record: BashoRecord,
): Record<StyleArchetype, number> => {
  const ability = buildAbilityStyleScores(status);
  const moveSignals = buildKimariteSignals(record);
  const routeSignals = buildRouteSignals(record);
  const totalWins = Math.max(1, record.wins);
  const performanceBoost = clamp((record.performanceOverExpected ?? 0) / 5, -0.22, 0.24);
  const signals: Record<StyleArchetype, number> = {
    YOTSU: 0,
    TSUKI_OSHI: 0,
    MOROZASHI: 0,
    DOHYOUGIWA: 0,
    NAGE_TECH: 0,
    POWER_PRESSURE: 0,
  };
  STYLE_IDS.forEach((style) => {
    const moveScore = moveSignals[style] / totalWins;
    const routeScore = routeSignals[style] / totalWins;
    signals[style] =
      moveScore * 0.52 +
      routeScore * 0.3 +
      ability[style] * 0.18 +
      performanceBoost;
  });
  if ((record.kinboshi ?? 0) > 0) {
    signals.DOHYOUGIWA += 0.16;
    signals.NAGE_TECH += 0.14;
  }
  if ((record.specialPrizes?.length ?? 0) > 0) {
    signals.NAGE_TECH += 0.08;
    signals.MOROZASHI += 0.06;
  }
  return signals;
};

const buildResistanceDelta = (
  record: BashoRecord,
  bouts: PlayerBoutDetail[] | undefined,
): Record<StyleArchetype, number> => {
  const deltas: Record<StyleArchetype, number> = {
    YOTSU: 0,
    TSUKI_OSHI: 0,
    MOROZASHI: 0,
    DOHYOUGIWA: 0,
    NAGE_TECH: 0,
    POWER_PRESSURE: 0,
  };

  const apply = (styles: StyleArchetype[], amount: number): void => {
    styles.forEach((style) => {
      deltas[style] += amount;
    });
  };

  // 得意:苦手 比率を自然に2:1 に寄せるため、WIN/LOSS の資格重みは対称に保つ。
  // 「相手に負けた = 相手型が苦手」と短絡せず、実際の決まり手で使われた型を主信号にする。
  for (const bout of bouts ?? []) {
    if (bout.result !== 'WIN' && bout.result !== 'LOSS') continue;
    const amount = bout.result === 'WIN' ? 0.75 : -0.75;

    // 決まり手ベースの型推定を主信号に。
    // 勝敗に実際に寄与した技の型だけが resistance を動かす設計。
    if (bout.kimarite) {
      const moveScores = resolveStyleCountScoreForKimarite(bout.kimarite);
      const topScore = Math.max(
        0,
        ...Object.values(moveScores).map((score) => score ?? 0),
      );
      if (topScore >= 0.5) {
        const inferred = Object.entries(moveScores)
          .filter(([, score]) => (score ?? 0) >= 0.5)
          .map(([style]) => style as StyleArchetype);
        apply(inferred, amount * 0.9);
        continue;
      }
    }

    // 決まり手が不明 or 汎用技のみの場合、粗い opponentStyleBias にフォールバック。
    // こちらは情報量が低いので振幅を半減。
    if (bout.opponentStyleBias && bout.opponentStyleBias !== 'BALANCE') {
      apply(inferEnemyStyles(bout.opponentStyleBias), amount * 0.5);
    }
  }

  if ((bouts?.length ?? 0) === 0 && record.losses > record.wins) {
    deltas.TSUKI_OSHI -= 0.18;
    deltas.YOTSU -= 0.18;
  }

  return deltas;
};

export const updateStyleIdentityAfterBasho = (
  status: RikishiStatus,
  record: BashoRecord,
  bashoSeq: number,
  bouts?: PlayerBoutDetail[],
): RikishiStatus => {
  const ensured = ensureStyleIdentityProfile(status);
  const profile = normalizeProfile(ensured.styleIdentityProfile ?? createEmptyProfile());
  const aptitudeSignals = buildAptitudeSignals(ensured, record);
  const resistanceSignals = buildResistanceDelta(record, bouts);
  const totalBouts = Math.max(1, record.wins + record.losses + record.absent);
  const currentSample = STYLE_IDS.reduce((sum, style) => sum + profile.styles[style].sample, 0) / STYLE_IDS.length;
  const experienceScale = clamp((currentSample + totalBouts) / 70, 0.2, 1);
  const aptitudeAverage =
    STYLE_IDS.reduce((sum, style) => sum + aptitudeSignals[style], 0) / STYLE_IDS.length;

  STYLE_IDS.forEach((style) => {
    const entry = profile.styles[style];
    const aptitudeDelta = clamp((aptitudeSignals[style] - aptitudeAverage) * 6.1 * experienceScale, -4.2, 4.2);
    const resistanceDelta = clamp(resistanceSignals[style] * experienceScale, -3.8, 3.8);
    profile.styles[style] = {
      // 得意・苦手で減衰係数を対称に（以前は 0.94 / 0.98 で苦手のみ持続）。
      aptitude: clamp(entry.aptitude * 0.96 + aptitudeDelta, -36, 36),
      resistance: clamp(entry.resistance * 0.96 + resistanceDelta, -36, 36),
      sample: entry.sample + totalBouts,
      lastDelta: clamp(aptitudeDelta + resistanceDelta * 0.35, -12, 12),
    };
  });

  profile.lastUpdatedBashoSeq = bashoSeq;
  const nextTactics = resolveTacticsFromStyleIdentity(profile, ensured.tactics);
  const strengths = resolveDisplayedStrengthStyles(profile);

  return {
    ...ensured,
    tactics: nextTactics,
    styleIdentityProfile: profile,
    signatureMoves: strengths.length > 0 ? ensured.signatureMoves : [],
  };
};

export const resolveSecretStyleFromIdentity = (
  profile?: StyleIdentityProfile,
): StyleArchetype | undefined => resolveTopAptitudeStyles(profile, 1)[0];

export const resolvePrimaryIdentityStyles = (
  profile?: StyleIdentityProfile,
): StyleArchetype[] => resolveTopAptitudeStyles(profile, 2);

export const resolveStyleLabelsOrFallback = (
  styles: StyleArchetype[],
  fallback = 'なし',
): string => {
  const labels = resolveStyleLabels(styles);
  return labels.length > 0 ? labels.join(' / ') : fallback;
};

export const resolveStrengthWeaknessDisplay = (
  profile?: StyleIdentityProfile,
): { strengths: string; weaknesses: string } => ({
  strengths: resolveStyleLabelsOrFallback(resolveDisplayedStrengthStyles(profile)),
  weaknesses: resolveStyleLabelsOrFallback(resolveDisplayedWeakStyles(profile)),
});

export const resolvePreferredStylesForSelector = (
  profile?: StyleIdentityProfile,
): Array<{ style: StyleArchetype; tactics: TacticsType }> =>
  resolvePrimaryIdentityStyles(profile).map((style) => ({
    style,
    tactics: styleToTactics(style),
  }));
