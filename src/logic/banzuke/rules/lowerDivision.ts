import { CONSTANTS } from '../../constants';
import { BashoRecord, Rank } from '../../models';
import { RandomSource } from '../../simulation/deps';
import { RankCalculationOptions } from '../types';
import {
  LowerDivisionKey,
  resolveLowerDivisionMax,
  resolveLowerDivisionOffset,
  resolveLowerDivisionOrder,
  resolveLowerDivisionTotal,
  resolveRankLimits,
} from '../scale/rankLimits';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const LOWER_RANGE_DELTA_BY_WINS: Record<number, { min: number; max: number; sign: 1 | -1 }> = {
  7: { min: 64, max: 116, sign: 1 },
  6: { min: 42, max: 78, sign: 1 },
  5: { min: 24, max: 44, sign: 1 },
  4: { min: 5, max: 9, sign: 1 },
  3: { min: 14, max: 26, sign: -1 },
  2: { min: 42, max: 82, sign: -1 },
  1: { min: 76, max: 132, sign: -1 },
  0: { min: 120, max: 194, sign: -1 },
};

// 三段目は中位勝ち越し/負け越しをやや強めに振る。
const SANDANME_RANGE_DELTA_BY_WINS: Partial<Record<number, { min: number; max: number; sign: 1 | -1 }>> = {
  6: { min: 58, max: 92, sign: 1 },
  5: { min: 34, max: 58, sign: 1 },
  2: { min: 54, max: 94, sign: -1 },
  1: { min: 96, max: 152, sign: -1 },
};

const JONIDAN_RANGE_DELTA_BY_WINS: Partial<Record<number, { min: number; max: number; sign: 1 | -1 }>> = {
  7: { min: 82, max: 136, sign: 1 },
  6: { min: 56, max: 96, sign: 1 },
  5: { min: 30, max: 52, sign: 1 },
  4: { min: 12, max: 20, sign: 1 },
  2: { min: 58, max: 106, sign: -1 },
  1: { min: 104, max: 174, sign: -1 },
};

const JONOKUCHI_RANGE_DELTA_BY_WINS: Partial<Record<number, { min: number; max: number; sign: 1 | -1 }>> = {
  7: { min: 96, max: 152, sign: 1 },
  6: { min: 70, max: 116, sign: 1 },
  5: { min: 42, max: 70, sign: 1 },
  4: { min: 18, max: 30, sign: 1 },
  2: { min: 70, max: 126, sign: -1 },
  1: { min: 118, max: 194, sign: -1 },
};

const randomIntInclusive = (rng: RandomSource, min: number, max: number): number => {
  if (max <= min) return min;
  return min + Math.floor(rng() * (max - min + 1));
};

const MAKUSHITA_BAND_SPREAD_MULTIPLIER = 1.5;

const stretchBandFromCurrent = (
  currentNum: number,
  band: { min: number; max: number },
  multiplier: number,
): { min: number; max: number } => {
  const deltaMin = band.min - currentNum;
  const deltaMax = band.max - currentNum;
  const scaledMin = currentNum + Math.round(deltaMin * multiplier);
  const scaledMax = currentNum + Math.round(deltaMax * multiplier);
  return {
    min: Math.min(scaledMin, scaledMax),
    max: Math.max(scaledMin, scaledMax),
  };
};

const resolveMakushitaTargetBand = (
  currentNum: number,
  wins: number,
  totalLosses: number,
): { min: number; max: number } => {
  const baseBand = (() => {
  if (wins === 7) {
      if (currentNum <= 10) return { min: 1, max: 3 };
      if (currentNum <= 20) return { min: 2, max: 6 };
      if (currentNum <= 35) return { min: 3, max: 8 };
      return { min: 5, max: 12 };
    }
    if (wins === 6) {
      if (currentNum <= 12) return { min: 2, max: 6 };
      if (currentNum <= 25) return { min: 3, max: 8 };
      if (currentNum <= 40) return { min: 4, max: 10 };
      return { min: 6, max: 14 };
    }
    if (wins === 5) {
      if (currentNum <= 15) return { min: 6, max: 12 };
      if (currentNum <= 30) return { min: 8, max: 16 };
      if (currentNum <= 45) return { min: 10, max: 20 };
      return { min: 14, max: 28 };
    }
    if (wins === 4) {
      return { min: currentNum - 6, max: currentNum - 3 };
    }
    if (wins === 3) {
      return { min: currentNum + 4, max: currentNum + 8 };
    }
    if (wins === 2) {
      const deficitBoost = Math.max(0, totalLosses - wins);
      return { min: currentNum + 10 + deficitBoost, max: currentNum + 18 + deficitBoost };
    }
    if (wins === 1) {
      const deficitBoost = Math.max(0, totalLosses - wins);
      return { min: currentNum + 18 + deficitBoost, max: currentNum + 30 + deficitBoost };
    }
    return { min: currentNum + 28, max: currentNum + 42 };
  })();

  return stretchBandFromCurrent(
    currentNum,
    baseBand,
    MAKUSHITA_BAND_SPREAD_MULTIPLIER,
  );
};

const resolveMakushitaDeltaByScore = (
  record: BashoRecord,
  maxNumber: number,
  rng: RandomSource,
): number => {
  const currentNum = clamp(record.rank.number || maxNumber, 1, maxNumber);
  const totalLosses = record.losses + record.absent;
  const band = resolveMakushitaTargetBand(currentNum, record.wins, totalLosses);
  const targetNum = clamp(randomIntInclusive(rng, band.min, band.max), 1, maxNumber);
  return currentNum - targetNum;
};

export const resolveLowerRangeDeltaByScore = (
  record: BashoRecord,
  range: Record<number, { min: number; max: number; sign: 1 | -1 }> = LOWER_RANGE_DELTA_BY_WINS,
  scaleSlots?: RankCalculationOptions['scaleSlots'],
): number => {
  const limits = resolveRankLimits(scaleSlots);
  const division = record.rank.division as LowerDivisionKey;
  const baseSpec = range[record.wins];
  if (!baseSpec) return 0;
  const overrideSpec =
    division === 'Sandanme'
      ? SANDANME_RANGE_DELTA_BY_WINS[record.wins]
      : division === 'Jonidan'
        ? JONIDAN_RANGE_DELTA_BY_WINS[record.wins]
        : division === 'Jonokuchi'
          ? JONOKUCHI_RANGE_DELTA_BY_WINS[record.wins]
          : undefined;
  const spec = overrideSpec ?? baseSpec;
  const maxByDivision: Record<LowerDivisionKey, number> = {
    Makushita: limits.MAKUSHITA_MAX,
    Sandanme: limits.SANDANME_MAX,
    Jonidan: limits.JONIDAN_MAX,
    Jonokuchi: limits.JONOKUCHI_MAX,
  };
  const max = maxByDivision[division] ?? limits.SANDANME_MAX;
  const number = clamp(record.rank.number || 1, 1, max);
  const progress = max <= 1 ? 0 : (number - 1) / (max - 1);
  const intensity = spec.sign > 0 ? progress : progress;
  const value = Math.round(spec.min + (spec.max - spec.min) * intensity);
  return value * spec.sign;
};

const toLowerDivisionLinearPosition = (
  division: LowerDivisionKey,
  number: number,
  lowerOffset: Record<LowerDivisionKey, number>,
  lowerMax: Record<LowerDivisionKey, number>,
): number => {
  const offset = lowerOffset[division];
  const normalizedNumber = clamp(number, 1, lowerMax[division]);
  return offset + (normalizedNumber - 1) * 2;
};

const fromLowerDivisionLinearPosition = (
  position: number,
  lowerOrder: ReturnType<typeof resolveLowerDivisionOrder>,
  lowerOffset: Record<LowerDivisionKey, number>,
  lowerTotal: number,
  limits: ReturnType<typeof resolveRankLimits>,
): {
  division: LowerDivisionKey;
  name: string;
  number: number;
  side: 'East' | 'West';
} => {
  const bounded = clamp(position, 0, lowerTotal - 1);

  for (const spec of lowerOrder) {
    const start = lowerOffset[spec.division];
    const end = start + spec.max * 2 - 1;
    if (bounded >= start && bounded <= end) {
      const relative = bounded - start;
      return {
        division: spec.division,
        name: spec.name,
        number: Math.floor(relative / 2) + 1,
        side: relative % 2 === 0 ? 'East' : 'West',
      };
    }
  }

  return {
    division: 'Jonokuchi',
    name: '序ノ口',
    number: limits.JONOKUCHI_MAX,
    side: 'West',
  };
};

export const calculateLowerDivisionRankChange = (
  record: BashoRecord,
  options?: RankCalculationOptions,
  rng: RandomSource = Math.random,
): { nextRank: Rank; event?: string } => {
  const currentRank = record.rank;
  const wins = record.wins;
  const limits = resolveRankLimits(options?.scaleSlots);
  const lowerMax = resolveLowerDivisionMax(options?.scaleSlots);
  const lowerOffset = resolveLowerDivisionOffset(options?.scaleSlots);
  const lowerOrder = resolveLowerDivisionOrder(options?.scaleSlots);
  const lowerTotal = resolveLowerDivisionTotal(options?.scaleSlots);

  if (currentRank.division === 'Maezumo') {
    const maezumoBouts = CONSTANTS.BOUTS_MAP.Maezumo;
    if (record.absent < maezumoBouts) {
      const jonokuchiEntry = clamp(Math.round(limits.JONOKUCHI_MAX * 0.67), 1, limits.JONOKUCHI_MAX);
      return {
        nextRank: { division: 'Jonokuchi', name: '序ノ口', number: jonokuchiEntry, side: 'East' },
        event: 'PROMOTION_TO_JONOKUCHI',
      };
    }
    return { nextRank: currentRank };
  }

  if (!['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'].includes(currentRank.division)) {
    return { nextRank: currentRank };
  }

  const currentDivision = currentRank.division as LowerDivisionKey;
  const currentNum = currentRank.number || (currentDivision === 'Makushita' ? 60 : 1);
  const currentSide = currentRank.side || 'East';
  const currentMax = lowerMax[currentDivision];
  const rankProgress = currentMax <= 1 ? 0 : (currentNum - 1) / (currentMax - 1);
  const totalLosses = record.losses + record.absent;
  const isExtremePromotion = wins >= 6;
  const isExtremeDemotion = wins <= 1 || totalLosses >= 6;

  const delta =
    currentDivision === 'Makushita'
      ? resolveMakushitaDeltaByScore(record, lowerMax.Makushita, rng)
      : resolveLowerRangeDeltaByScore(record, LOWER_RANGE_DELTA_BY_WINS, options?.scaleSlots);

  const slotDelta = delta * 2;
  const currentPos =
    toLowerDivisionLinearPosition(currentDivision, currentNum, lowerOffset, lowerMax) +
    (currentSide === 'West' ? 1 : 0);
  let nextPos = currentPos - slotDelta;
  const nudge = clamp(Math.round(options?.lowerDivisionQuota?.enemyHalfStepNudge ?? 0), -1, 1);
  nextPos += nudge;

  // 7戦制下位は実際に場所ごとの「玉突き」で半枚〜1枚ぶれるため、極端成績時に小さな揺らぎを入れる。
  if (currentDivision !== 'Makushita' && (isExtremePromotion || isExtremeDemotion)) {
    const positionBias =
      isExtremePromotion
        ? rankProgress >= 0.75
          ? -1
          : rankProgress <= 0.2
            ? 1
            : 0
        : rankProgress <= 0.2
          ? 1
          : rankProgress >= 0.85
            ? -1
            : 0;
    const jitter = rng() < 0.35 ? (rng() < 0.5 ? -1 : 1) : 0;
    nextPos += clamp(positionBias + jitter, -2, 2);
  }

  // 序ノ口は前相撲に陥落しない。
  nextPos = clamp(nextPos, 0, lowerTotal - 1);

  let target = fromLowerDivisionLinearPosition(
    nextPos,
    lowerOrder,
    lowerOffset,
    lowerTotal,
    limits,
  );
  if (target.division === 'Jonokuchi') {
    target = {
      ...target,
      number: clamp(target.number, 1, limits.JONOKUCHI_MAX),
    };
  }
  const currentIndex = lowerOrder.findIndex((spec) => spec.division === currentDivision);
  const targetIndex = lowerOrder.findIndex((spec) => spec.division === target.division);
  const event =
    targetIndex < currentIndex ? 'PROMOTION' : targetIndex > currentIndex ? 'DEMOTION' : undefined;

  return {
    nextRank: {
      division: target.division,
      name: target.name,
      number: target.number,
      side: target.side,
    },
    event,
  };
};
