import { CONSTANTS } from '../../constants';
import { BashoRecord, Rank } from '../../models';
import { RandomSource } from '../../simulation/deps';
import { RankCalculationOptions } from '../types';
import {
  DEFAULT_SCALE_SLOTS,
  LowerDivisionKey,
  resolveLowerDivisionMax,
  resolveLowerDivisionOffset,
  resolveLowerDivisionOrder,
  resolveScaleSlots,
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
// バッチ追加: 関取率 15% (target 10.6%) over-shoot 対応で、6/5 勝の中堅昇進帯を
// 少し控えめに戻す（7-0 yusho は据え置き、6-1 / 5-2 の伸びを抑える）。
const SANDANME_RANGE_DELTA_BY_WINS: Partial<Record<number, { min: number; max: number; sign: 1 | -1 }>> = {
  7: { min: 90, max: 160, sign: 1 },
  6: { min: 64, max: 100, sign: 1 },
  5: { min: 38, max: 64, sign: 1 },
  2: { min: 60, max: 100, sign: -1 },
  1: { min: 102, max: 158, sign: -1 },
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

// バッチ修正: 過拡大したので 50% 戻す。target p10=-16.5/p50=4.0/p90=15.5 に
// 近づくように、旧値と前バージョンの中間を取る。Heisei 実例:
//   7-0 Mk60 → Mk25-35 (25-35 上昇)
//   6-1 Mk30 → Mk20-25 (5-10 上昇)
//   5-2 Mk30 → Mk24-28 (2-6 上昇)
//   3-4 Mk30 → Mk32-34 (2-4 降下)
//   1-6 Mk30 → Mk42-50 (12-20 降下)
const resolveMakushitaTargetBand = (
  currentNum: number,
  wins: number,
  totalLosses: number,
): { min: number; max: number } => {
  if (wins === 7) {
    if (currentNum <= 5) return { min: 1, max: 2 };
    if (currentNum <= 15) return { min: 1, max: 4 };
    if (currentNum <= 30) return { min: Math.max(1, currentNum - 18), max: Math.max(3, currentNum - 11) };
    return { min: Math.max(4, currentNum - 28), max: Math.max(10, currentNum - 18) };
  }
  if (wins === 6) {
    if (currentNum <= 8) return { min: 1, max: 4 };
    if (currentNum <= 20) return { min: Math.max(2, currentNum - 10), max: Math.max(5, currentNum - 6) };
    if (currentNum <= 35) return { min: Math.max(4, currentNum - 15), max: Math.max(8, currentNum - 9) };
    return { min: Math.max(9, currentNum - 18), max: Math.max(13, currentNum - 11) };
  }
  if (wins === 5) {
    if (currentNum <= 10) return { min: Math.max(2, currentNum - 5), max: Math.max(4, currentNum - 2) };
    if (currentNum <= 25) return { min: Math.max(4, currentNum - 8), max: Math.max(8, currentNum - 4) };
    if (currentNum <= 40) return { min: Math.max(7, currentNum - 11), max: Math.max(12, currentNum - 6) };
    return { min: Math.max(11, currentNum - 12), max: Math.max(17, currentNum - 5) };
  }
  if (wins === 4) {
    return { min: Math.max(1, currentNum - 2), max: Math.max(1, currentNum - 1) };
  }
  if (wins === 3) {
    return { min: currentNum + 1, max: currentNum + 5 };
  }
  if (wins === 2) {
    const deficitBoost = Math.max(0, totalLosses - wins);
    return { min: currentNum + 7 + deficitBoost, max: currentNum + 15 + deficitBoost };
  }
  if (wins === 1) {
    const deficitBoost = Math.max(0, totalLosses - wins);
    return { min: currentNum + 12 + deficitBoost, max: currentNum + 22 + deficitBoost };
  }
  return { min: currentNum + 20, max: currentNum + 34 };
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

const resolveBottomTailReliefSteps = (
  record: BashoRecord,
  scaleSlots?: RankCalculationOptions['scaleSlots'],
): number => {
  const division = record.rank.division as LowerDivisionKey;
  if (division !== 'Jonidan' && division !== 'Jonokuchi') return 0;

  const effectiveLosses = record.losses + record.absent;
  const deficit = effectiveLosses - record.wins;
  if (deficit <= 0 || record.absent >= 7) return 0;

  const slots = resolveScaleSlots(scaleSlots);
  const divisionSlots = Math.max(2, slots[division]);
  const divisionMaxNumber = Math.max(1, Math.ceil(divisionSlots / 2));
  const boundedRankNumber = clamp(record.rank.number || divisionMaxNumber, 1, divisionMaxNumber);
  const distanceFromBottom = divisionMaxNumber - boundedRankNumber;
  const bottomBand =
    division === 'Jonokuchi'
      ? Math.max(4, Math.ceil(divisionMaxNumber * 0.22))
      : Math.max(8, Math.ceil(divisionMaxNumber * 0.16));
  if (distanceFromBottom > bottomBand) return 0;

  const baselineSlots = DEFAULT_SCALE_SLOTS[division];
  const expansionSlots = Math.max(0, divisionSlots - baselineSlots);
  const expansionRelief =
    division === 'Jonokuchi'
      ? Math.floor(expansionSlots * 0.35)
      : Math.floor(expansionSlots * 0.2);
  const deficitRelief =
    deficit <= 1
      ? division === 'Jonokuchi'
        ? 8
        : 6
      : deficit === 2
        ? division === 'Jonokuchi'
          ? 6
          : 4
        : deficit === 3
          ? 2
          : 0;
  const proximityRatio = 1 - distanceFromBottom / Math.max(1, bottomBand);
  const proximityRelief = Math.max(
    0,
    Math.round((division === 'Jonokuchi' ? 4 : 3) * proximityRatio),
  );
  const reliefCap = division === 'Jonokuchi' ? 12 : 10;

  return clamp(deficitRelief + proximityRelief + expansionRelief, 0, reliefCap);
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

  const bottomTailReliefSteps = resolveBottomTailReliefSteps(record, options?.scaleSlots);
  if (bottomTailReliefSteps > 0) {
    const lowerBottom = lowerTotal - 1;
    if (nextPos > lowerBottom) {
      nextPos = Math.max(0, lowerBottom - bottomTailReliefSteps);
    } else {
      nextPos -= bottomTailReliefSteps;
    }
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
