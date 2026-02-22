import { CONSTANTS } from '../constants';
import { BashoRecord, Rank } from '../models';
import { RandomSource } from '../simulation/deps';
import { RankCalculationOptions } from './options';
import {
  LowerDivisionKey,
  resolveLowerDivisionMax,
  resolveLowerDivisionOffset,
  resolveLowerDivisionOrder,
  resolveLowerDivisionTotal,
  resolveRankLimits,
} from './rankLimits';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const MAKUSHITA_RANGE_DELTA_BY_WINS: Record<number, { min: number; max: number; sign: 1 | -1 }> = {
  7: { min: 22, max: 34, sign: 1 },
  6: { min: 14, max: 21, sign: 1 },
  5: { min: 10, max: 16, sign: 1 },
  4: { min: 4, max: 7, sign: 1 },
  3: { min: 5, max: 9, sign: -1 },
  2: { min: 16, max: 24, sign: -1 },
  1: { min: 28, max: 40, sign: -1 },
  0: { min: 48, max: 66, sign: -1 },
};

const LOWER_RANGE_DELTA_BY_WINS: Record<number, { min: number; max: number; sign: 1 | -1 }> = {
  7: { min: 30, max: 50, sign: 1 },
  6: { min: 14, max: 24, sign: 1 },
  5: { min: 8, max: 14, sign: 1 },
  4: { min: 5, max: 9, sign: 1 },
  3: { min: 8, max: 14, sign: -1 },
  2: { min: 18, max: 30, sign: -1 },
  1: { min: 30, max: 46, sign: -1 },
  0: { min: 50, max: 72, sign: -1 },
};

// 三段目は中位勝ち越し/負け越しをやや強めに振る。
const SANDANME_RANGE_DELTA_BY_WINS: Partial<Record<number, { min: number; max: number; sign: 1 | -1 }>> = {
  6: { min: 16, max: 27, sign: 1 },
  5: { min: 10, max: 17, sign: 1 },
  2: { min: 22, max: 34, sign: -1 },
  1: { min: 34, max: 52, sign: -1 },
};

const JONIDAN_RANGE_DELTA_BY_WINS: Partial<Record<number, { min: number; max: number; sign: 1 | -1 }>> = {
  7: { min: 34, max: 54, sign: 1 },
  6: { min: 20, max: 31, sign: 1 },
  5: { min: 12, max: 20, sign: 1 },
  4: { min: 6, max: 10, sign: 1 },
  2: { min: 24, max: 38, sign: -1 },
  1: { min: 36, max: 56, sign: -1 },
};

const JONOKUCHI_RANGE_DELTA_BY_WINS: Partial<Record<number, { min: number; max: number; sign: 1 | -1 }>> = {
  7: { min: 38, max: 58, sign: 1 },
  6: { min: 22, max: 34, sign: 1 },
  5: { min: 14, max: 22, sign: 1 },
  4: { min: 7, max: 11, sign: 1 },
  2: { min: 26, max: 40, sign: -1 },
  1: { min: 38, max: 58, sign: -1 },
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
  const intensity = spec.sign > 0 ? progress : 1 - progress;
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
  const promotionByQuotaBlocked = options?.sekitoriQuota?.canPromoteToJuryo === false;
  const lowerQuota = options?.lowerDivisionQuota;
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

  if (currentRank.division === 'Makushita') {
    const num = currentRank.number || 60;
    if (!promotionByQuotaBlocked && num <= 15 && wins === 7) {
      return {
        nextRank: { division: 'Juryo', name: '十両', number: 14, side: 'East' },
        event: 'PROMOTION_TO_JURYO',
      };
    }
    if (!promotionByQuotaBlocked && num === 1 && wins >= 4) {
      return {
        nextRank: { division: 'Juryo', name: '十両', number: 14, side: 'East' },
        event: 'PROMOTION_TO_JURYO',
      };
    }
    if (!promotionByQuotaBlocked && num <= 5 && wins >= 6) {
      return {
        nextRank: { division: 'Juryo', name: '十両', number: 14, side: 'East' },
        event: 'PROMOTION_TO_JURYO',
      };
    }
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
      ? resolveLowerRangeDeltaByScore(record, MAKUSHITA_RANGE_DELTA_BY_WINS, options?.scaleSlots)
      : resolveLowerRangeDeltaByScore(record, LOWER_RANGE_DELTA_BY_WINS, options?.scaleSlots);

  const slotDelta = delta * 2;
  const currentPos =
    toLowerDivisionLinearPosition(currentDivision, currentNum, lowerOffset, lowerMax) +
    (currentSide === 'West' ? 1 : 0);
  let nextPos = currentPos - slotDelta;
  const nudge = clamp(Math.round(lowerQuota?.enemyHalfStepNudge ?? 0), -1, 1);
  nextPos += nudge;

  // 7戦制下位は実際に場所ごとの「玉突き」で半枚〜1枚ぶれるため、極端成績時に小さな揺らぎを入れる。
  if (isExtremePromotion || isExtremeDemotion) {
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

  const currentDivisionStart = lowerOffset[currentDivision];
  const currentDivisionEnd = currentDivisionStart + lowerMax[currentDivision] * 2 - 1;
  const promotionBoundaryBlocked =
    (currentDivision === 'Sandanme' && lowerQuota?.canPromoteToMakushita === false) ||
    (currentDivision === 'Jonidan' && lowerQuota?.canPromoteToSandanme === false) ||
    (currentDivision === 'Jonokuchi' && lowerQuota?.canPromoteToJonidan === false);
  if (promotionBoundaryBlocked && nextPos < currentDivisionStart) {
    nextPos = currentDivisionStart;
  }

  const demotionBoundaryBlocked =
    (currentDivision === 'Makushita' && lowerQuota?.canDemoteToSandanme === false) ||
      (currentDivision === 'Sandanme' && lowerQuota?.canDemoteToJonidan === false) ||
      (currentDivision === 'Jonidan' && lowerQuota?.canDemoteToJonokuchi === false);
  if (demotionBoundaryBlocked && nextPos > currentDivisionEnd) {
    nextPos = currentDivisionEnd;
  }

  // 7戦制の下位番付では「負け越しで上昇」を禁止する。
  if (totalLosses > wins && nextPos < currentPos) {
    nextPos = currentPos;
  }

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
  // 幕下中位〜下位の7戦全勝は、翌場所で関取争いに絡む上位帯まで一気に引き上げる。
  if (currentDivision === 'Makushita' && wins === 7 && target.division === 'Makushita') {
    target = {
      ...target,
      number: Math.min(target.number, 15),
      side: 'East',
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
