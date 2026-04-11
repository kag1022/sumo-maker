import { RikishiStatus, StyleArchetype, StyleCompatibility, StyleProfile, TacticsType } from './models';
import { resolveStyleCountScoreForKimarite } from './kimarite/catalog';
import { ensureStyleIdentityProfile, resolveDisplayedStrengthStyles } from './style/identity';

export const STYLE_LABELS: Record<StyleArchetype, string> = {
  YOTSU: '四つ',
  TSUKI_OSHI: '突き押し',
  MOROZASHI: 'もろ差し',
  DOHYOUGIWA: '土俵際',
  NAGE_TECH: '投げ技',
  POWER_PRESSURE: '圧力相撲',
};

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
  const ensured = ensureStyleIdentityProfile(status);
  const strengths = resolveDisplayedStrengthStyles(ensured.styleIdentityProfile);
  if (strengths.length > 0) {
    const primary = strengths[0];
    const secondary = strengths[1] ?? strengths[0];
    return {
      primary,
      secondary,
      dominant: primary,
      compatibility: getStyleCompatibility(primary, secondary),
      label: secondary !== primary ? `${STYLE_LABELS[primary]} / ${STYLE_LABELS[secondary]}` : STYLE_LABELS[primary],
      confidence: 0.88,
      source: 'REALIZED',
      locked: strengths.length === 0,
    };
  }
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
    const styleScores = resolveStyleCountScoreForKimarite(move);
    total += count;
    (Object.keys(styleScores) as StyleArchetype[]).forEach((style) => {
      scoreMap[style] += (styleScores[style] ?? 0) * count;
    });
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
