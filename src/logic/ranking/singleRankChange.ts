import { BashoRecord, Rank } from '../models';
import { RandomSource } from '../simulation/deps';
import { getRankValue } from './rankScore';
import { resolveTopDivisionAssignedEvent } from './topDivisionRules';
import { calculateLowerDivisionRankChange } from './lowerDivision';
import { RankCalculationOptions, RankChangeResult } from './options';
import { LIMITS } from './rankLimits';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const totalLosses = (record: BashoRecord): number => record.losses + record.absent;

const scoreDiff = (record: BashoRecord): number => record.wins - totalLosses(record);

const isSanyakuName = (name: string): boolean => ['関脇', '小結'].includes(name);

const isSanyakuOrHigherName = (name: string): boolean =>
  ['横綱', '大関', '関脇', '小結'].includes(name);

const hasBanzukeSide = (rank: Rank): boolean => rank.division !== 'Maezumo';

const DIVISION_ORDER: Rank['division'][] = [
  'Makuuchi',
  'Juryo',
  'Makushita',
  'Sandanme',
  'Jonidan',
  'Jonokuchi',
  'Maezumo',
];
const RANK_SLOT_OFFSET = {
  Makuuchi: 0,
  Juryo: 42,
  Makushita: 70,
  Sandanme: 190,
  Jonidan: 390,
  Jonokuchi: 590,
  Maezumo: 650,
} as const;
const JONOKUCHI_BOTTOM_SLOT = RANK_SLOT_OFFSET.Jonokuchi + LIMITS.JONOKUCHI_MAX * 2 - 1;
const MAKEKOSHI_STRICT_DEMOTION_DIVISIONS = new Set<Rank['division']>([
  'Juryo',
  'Makushita',
  'Sandanme',
  'Jonidan',
  'Jonokuchi',
]);
const KACHIKOSHI_STRICT_NON_DEMOTION_DIVISIONS = new Set<Rank['division']>([
  'Juryo',
  'Makushita',
  'Sandanme',
  'Jonidan',
  'Jonokuchi',
]);

const resolveRankSlot = (rank: Rank): number => {
  const sideOffset = rank.side === 'West' ? 1 : 0;
  if (rank.division === 'Makuuchi') {
    if (rank.name === '横綱') return sideOffset;
    if (rank.name === '大関') return 2 + sideOffset;
    if (rank.name === '関脇') return 4 + sideOffset;
    if (rank.name === '小結') return 6 + sideOffset;
    const n = clamp(rank.number || 1, 1, LIMITS.MAEGASHIRA_MAX);
    return 8 + (n - 1) * 2 + sideOffset;
  }
  if (rank.division === 'Juryo') {
    const n = clamp(rank.number || 1, 1, LIMITS.JURYO_MAX);
    return RANK_SLOT_OFFSET.Juryo + (n - 1) * 2 + sideOffset;
  }
  if (rank.division === 'Makushita') {
    const n = clamp(rank.number || 1, 1, LIMITS.MAKUSHITA_MAX);
    return RANK_SLOT_OFFSET.Makushita + (n - 1) * 2 + sideOffset;
  }
  if (rank.division === 'Sandanme') {
    const n = clamp(rank.number || 1, 1, LIMITS.SANDANME_MAX);
    return RANK_SLOT_OFFSET.Sandanme + (n - 1) * 2 + sideOffset;
  }
  if (rank.division === 'Jonidan') {
    const n = clamp(rank.number || 1, 1, LIMITS.JONIDAN_MAX);
    return RANK_SLOT_OFFSET.Jonidan + (n - 1) * 2 + sideOffset;
  }
  if (rank.division === 'Jonokuchi') {
    const n = clamp(rank.number || 1, 1, LIMITS.JONOKUCHI_MAX);
    return RANK_SLOT_OFFSET.Jonokuchi + (n - 1) * 2 + sideOffset;
  }
  return RANK_SLOT_OFFSET.Maezumo;
};

const resolveRankFromSlot = (slot: number): Rank => {
  const bounded = clamp(slot, 0, JONOKUCHI_BOTTOM_SLOT);
  if (bounded <= 7) {
    const names: Array<'横綱' | '大関' | '関脇' | '小結'> = ['横綱', '大関', '関脇', '小結'];
    const idx = Math.floor(bounded / 2);
    return {
      division: 'Makuuchi',
      name: names[clamp(idx, 0, names.length - 1)],
      side: bounded % 2 === 0 ? 'East' : 'West',
    };
  }
  if (bounded < RANK_SLOT_OFFSET.Juryo) {
    const relative = bounded - 8;
    return {
      division: 'Makuuchi',
      name: '前頭',
      number: Math.floor(relative / 2) + 1,
      side: relative % 2 === 0 ? 'East' : 'West',
    };
  }
  if (bounded < RANK_SLOT_OFFSET.Makushita) {
    const relative = bounded - RANK_SLOT_OFFSET.Juryo;
    return {
      division: 'Juryo',
      name: '十両',
      number: Math.floor(relative / 2) + 1,
      side: relative % 2 === 0 ? 'East' : 'West',
    };
  }
  if (bounded < RANK_SLOT_OFFSET.Sandanme) {
    const relative = bounded - RANK_SLOT_OFFSET.Makushita;
    return {
      division: 'Makushita',
      name: '幕下',
      number: Math.floor(relative / 2) + 1,
      side: relative % 2 === 0 ? 'East' : 'West',
    };
  }
  if (bounded < RANK_SLOT_OFFSET.Jonidan) {
    const relative = bounded - RANK_SLOT_OFFSET.Sandanme;
    return {
      division: 'Sandanme',
      name: '三段目',
      number: Math.floor(relative / 2) + 1,
      side: relative % 2 === 0 ? 'East' : 'West',
    };
  }
  if (bounded < RANK_SLOT_OFFSET.Jonokuchi) {
    const relative = bounded - RANK_SLOT_OFFSET.Jonidan;
    return {
      division: 'Jonidan',
      name: '序二段',
      number: Math.floor(relative / 2) + 1,
      side: relative % 2 === 0 ? 'East' : 'West',
    };
  }
  const relative = bounded - RANK_SLOT_OFFSET.Jonokuchi;
  return {
    division: 'Jonokuchi',
    name: '序ノ口',
    number: Math.floor(relative / 2) + 1,
    side: relative % 2 === 0 ? 'East' : 'West',
  };
};

const applyMakekoshiDirectionGuard = (
  currentRecord: BashoRecord,
  nextRank: Rank,
): { nextRank: Rank; adjusted: boolean } => {
  if (currentRecord.rank.division === 'Maezumo') {
    return { nextRank, adjusted: false };
  }
  const wins = currentRecord.wins;
  const losses = totalLosses(currentRecord);
  if (wins >= losses) return { nextRank, adjusted: false };

  const currentSlot = resolveRankSlot(currentRecord.rank);
  const nextSlot = resolveRankSlot(nextRank);
  if (nextSlot > currentSlot) return { nextRank, adjusted: false };

  const strictDemotion = MAKEKOSHI_STRICT_DEMOTION_DIVISIONS.has(currentRecord.rank.division);
  if (!strictDemotion && nextSlot === currentSlot) {
    return { nextRank, adjusted: false };
  }

  const forcedSlot = clamp(currentSlot + 1, 0, JONOKUCHI_BOTTOM_SLOT);
  if (forcedSlot <= currentSlot) {
    return { nextRank: currentRecord.rank, adjusted: nextSlot !== currentSlot };
  }
  return {
    nextRank: resolveRankFromSlot(forcedSlot),
    adjusted: forcedSlot !== nextSlot,
  };
};

const applyKachikoshiDirectionGuard = (
  currentRecord: BashoRecord,
  nextRank: Rank,
): { nextRank: Rank; adjusted: boolean } => {
  if (currentRecord.rank.division === 'Maezumo') {
    return { nextRank, adjusted: false };
  }
  const wins = currentRecord.wins;
  const losses = totalLosses(currentRecord);
  if (wins <= losses) return { nextRank, adjusted: false };
  if (!KACHIKOSHI_STRICT_NON_DEMOTION_DIVISIONS.has(currentRecord.rank.division)) {
    return { nextRank, adjusted: false };
  }

  const currentSlot = resolveRankSlot(currentRecord.rank);
  const nextSlot = resolveRankSlot(nextRank);
  if (nextSlot <= currentSlot) return { nextRank, adjusted: false };
  return { nextRank: currentRecord.rank, adjusted: true };
};

const resolveBoundaryAssignedEvent = (
  currentRank: Rank,
  assignedRank: Rank,
): string | undefined => {
  const currentValue = getRankValue(currentRank);
  const nextValue = getRankValue(assignedRank);
  if (nextValue < currentValue) return 'PROMOTION';
  if (nextValue > currentValue) return 'DEMOTION';
  const currentDivisionIndex = DIVISION_ORDER.indexOf(currentRank.division);
  const nextDivisionIndex = DIVISION_ORDER.indexOf(assignedRank.division);
  if (currentDivisionIndex >= 0 && nextDivisionIndex >= 0) {
    if (nextDivisionIndex < currentDivisionIndex) return 'PROMOTION';
    if (nextDivisionIndex > currentDivisionIndex) return 'DEMOTION';
  }
  return undefined;
};

const shouldApplyBoundaryAssignedRank = (
  currentRecord: BashoRecord,
  assignedRank: Rank,
): boolean => {
  if (currentRecord.rank.division === 'Maezumo') return false;
  return assignedRank.division !== currentRecord.rank.division;
};

const resolveNextRankSide = (
  currentRecord: BashoRecord,
  nextRank: Rank,
  rng: RandomSource,
): Rank => {
  if (!hasBanzukeSide(nextRank)) return nextRank;
  const lowerDivisions: Rank['division'][] = ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'];
  const fixedSideDivisions: Rank['division'][] = ['Juryo', ...lowerDivisions];
  if (
    fixedSideDivisions.includes(currentRecord.rank.division) &&
    fixedSideDivisions.includes(nextRank.division) &&
    nextRank.side
  ) {
    return nextRank;
  }

  const currentRank = currentRecord.rank;
  const currentValue = getRankValue(currentRank);
  const nextValue = getRankValue(nextRank);
  const wins = currentRecord.wins;
  const losses = totalLosses(currentRecord);

  const resolvedSide: 'East' | 'West' =
    nextValue < currentValue
      ? 'East'
      : nextValue > currentValue
        ? 'West'
        : wins > losses
          ? 'East'
          : wins < losses
            ? 'West'
            : currentRank.side ?? nextRank.side ?? (rng() < 0.5 ? 'East' : 'West');

  return { ...nextRank, side: resolvedSide };
};

const calculateMakuuchiChange = (
  record: BashoRecord,
  wins: number,
  losses: number,
  diff: number,
  options?: RankCalculationOptions,
): { nextRank: Rank; event?: string } => {
  const currentRank = record.rank;
  const enforcedSanyaku = options?.topDivisionQuota?.enforcedSanyaku;
  if (enforcedSanyaku && ['関脇', '小結', '前頭'].includes(currentRank.name)) {
    const targetName = enforcedSanyaku === 'Sekiwake' ? '関脇' : '小結';
    if (currentRank.name === targetName) {
      return { nextRank: currentRank };
    }
    if (targetName === '関脇') {
      return {
        nextRank: { division: 'Makuuchi', name: '関脇', side: 'East' },
        event: 'PROMOTION_TO_SEKIWAKE',
      };
    }
    return {
      nextRank: { division: 'Makuuchi', name: '小結', side: 'East' },
      event:
        currentRank.name === '関脇'
          ? 'DEMOTION_TO_KOMUSUBI'
          : 'PROMOTION_TO_KOMUSUBI',
    };
  }

  if (currentRank.name === '関脇') {
    if (wins >= 8) return { nextRank: currentRank };
    if (wins >= 6) {
      return {
        nextRank: { division: 'Makuuchi', name: '小結', side: 'East' },
        event: 'DEMOTION_TO_KOMUSUBI',
      };
    }
    return {
      nextRank: { division: 'Makuuchi', name: '前頭', number: 1 + (8 - wins), side: 'East' },
      event: 'DEMOTION_TO_MAEGASHIRA',
    };
  }

  if (currentRank.name === '小結') {
    if (wins >= 10) {
      return {
        nextRank: { division: 'Makuuchi', name: '関脇', side: 'East' },
        event: 'PROMOTION_TO_SEKIWAKE',
      };
    }
    if (wins >= 8) return { nextRank: currentRank };
    return {
      nextRank: { division: 'Makuuchi', name: '前頭', number: 1 + (8 - wins), side: 'East' },
      event: 'DEMOTION_TO_MAEGASHIRA',
    };
  }

  if (currentRank.name !== '前頭') {
    return { nextRank: currentRank };
  }

  const num = currentRank.number || 1;

  // 三役昇進（枠制を意識し、厳しめ）
  if (num <= 1 && wins >= 10) {
    return {
      nextRank: { division: 'Makuuchi', name: '小結', side: 'East' },
      event: 'PROMOTION_TO_KOMUSUBI',
    };
  }
  if (num <= 2 && wins >= 12) {
    return {
      nextRank: { division: 'Makuuchi', name: '関脇', side: 'East' },
      event: 'PROMOTION_TO_SEKIWAKE',
    };
  }

  // 幕内→十両 陥落（危険水域を明文化）
  const shouldDemote =
    wins === 0 ||
    (num >= 16 && wins <= 7) ||
    (num >= 14 && wins <= 5) ||
    (num >= 12 && wins <= 4);
  const demotionByQuotaBlocked = options?.topDivisionQuota?.canDemoteToJuryo === false;
  if (shouldDemote && !demotionByQuotaBlocked) {
    const severity = Math.max(0, losses - wins);
    const jNumber = clamp((num - 12) + Math.floor(severity / 2), 1, LIMITS.JURYO_MAX);
    return {
      nextRank: { division: 'Juryo', name: '十両', number: jNumber, side: 'East' },
      event: 'DEMOTION_TO_JURYO',
    };
  }

  let move = diff;
  if (diff > 0) {
    move = Math.max(1, Math.floor(diff * (num <= 5 ? 0.9 : 1.2)));
  } else if (diff < 0) {
    move = Math.ceil(diff * (num <= 5 ? 1.4 : 1.2));
  }

  const newNumber = clamp(num - move, 1, LIMITS.MAEGASHIRA_MAX);
  return { nextRank: { ...currentRank, number: Math.floor(newNumber) } };
};

const calculateJuryoChange = (
  record: BashoRecord,
  wins: number,
  losses: number,
  diff: number,
  options?: RankCalculationOptions,
  _rng: RandomSource = Math.random,
): { nextRank: Rank; event?: string } => {
  const currentRank = record.rank;
  const num = currentRank.number || 1;
  const promotionByQuotaBlocked = options?.topDivisionQuota?.canPromoteToMakuuchi === false;
  const demotionByQuotaBlocked = options?.sekitoriQuota?.canDemoteToMakushita === false;

  // 十両→幕内（空き枠争いを反映して厳格化）
  if (!promotionByQuotaBlocked && num === 1 && wins >= 10) {
    const mNumber = clamp(16 - (wins - 10), 12, LIMITS.MAEGASHIRA_MAX);
    return {
      nextRank: { division: 'Makuuchi', name: '前頭', number: mNumber, side: 'East' },
      event: 'PROMOTION_TO_MAKUUCHI',
    };
  }
  if (!promotionByQuotaBlocked && num === 2 && wins >= 11) {
    const mNumber = clamp(15 - (wins - 11), 11, LIMITS.MAEGASHIRA_MAX);
    return {
      nextRank: { division: 'Makuuchi', name: '前頭', number: mNumber, side: 'East' },
      event: 'PROMOTION_TO_MAKUUCHI',
    };
  }
  if (!promotionByQuotaBlocked && num <= 3 && wins >= 12) {
    const mNumber = clamp(14 - (wins - 12), 10, LIMITS.MAEGASHIRA_MAX);
    return {
      nextRank: { division: 'Makuuchi', name: '前頭', number: mNumber, side: 'East' },
      event: 'PROMOTION_TO_MAKUUCHI',
    };
  }
  if (!promotionByQuotaBlocked && num <= 6 && wins >= 13) {
    return {
      nextRank: { division: 'Makuuchi', name: '前頭', number: 12, side: 'East' },
      event: 'PROMOTION_TO_MAKUUCHI',
    };
  }

  // 十両→幕下（危険水域）
  const shouldDemote =
    (num >= 14 && wins <= 7) ||
    (num >= 13 && wins <= 6) ||
    (num >= 12 && wins <= 5) ||
    (num >= 10 && wins <= 3);
  const forcedByQuota =
    options?.sekitoriQuota?.canDemoteToMakushita === true &&
    losses > wins;
  if ((shouldDemote || forcedByQuota) && !demotionByQuotaBlocked) {
    const makekoshi = Math.max(0, losses - wins);
    const rankRisk = Math.max(0, num - 10);
    const severity = Math.max(0, Math.round(Math.pow(makekoshi, 1.15)) - 1);
    const mkNumber = clamp(1 + rankRisk + severity, 1, LIMITS.MAKUSHITA_MAX);
    return {
      nextRank: { division: 'Makushita', name: '幕下', number: mkNumber, side: 'East' },
      event: 'DEMOTION_TO_MAKUSHITA',
    };
  }

  let move = diff;
  if (diff > 0) move = Math.max(1, Math.floor(diff * 1.1));
  if (diff < 0) move = Math.ceil(diff * 1.3);
  const newNumber = clamp(num - move, 1, LIMITS.JURYO_MAX);
  const baseSide: 'East' | 'West' =
    move > 0 ? 'East' : move < 0 ? 'West' : currentRank.side === 'West' ? 'West' : 'East';
  let nextPos = (Math.floor(newNumber) - 1) * 2 + (baseSide === 'West' ? 1 : 0);
  const nudge = clamp(Math.round(options?.sekitoriQuota?.enemyHalfStepNudge ?? 0), -1, 1);
  nextPos = clamp(nextPos + nudge, 0, LIMITS.JURYO_MAX * 2 - 1);
  return {
    nextRank: {
      division: 'Juryo',
      name: '十両',
      number: Math.floor(nextPos / 2) + 1,
      side: nextPos % 2 === 0 ? 'East' : 'West',
    },
  };
};

const normalizeBoundaryAssignedRank = (
  currentRecord: BashoRecord,
  assignedRank: Rank | undefined,
  options?: RankCalculationOptions,
  rng: RandomSource = Math.random,
): Rank | undefined => {
  if (!assignedRank) return undefined;
  if (currentRecord.rank.division === 'Juryo' && assignedRank.division === 'Makushita') {
    const wins = currentRecord.wins;
    const losses = totalLosses(currentRecord);
    const diff = scoreDiff(currentRecord);
    const calibrated = calculateJuryoChange(currentRecord, wins, losses, diff, options, rng).nextRank;
    if (calibrated.division === 'Makushita') {
      return {
        ...assignedRank,
        number: Math.min(assignedRank.number ?? LIMITS.MAKUSHITA_MAX, calibrated.number ?? LIMITS.MAKUSHITA_MAX),
        side: 'East',
      };
    }
  }
  return assignedRank;
};

const calculateStandardRankChange = (
  record: BashoRecord,
  options?: RankCalculationOptions,
  rng: RandomSource = Math.random,
): { nextRank: Rank; event?: string } => {
  const currentRank = record.rank;
  const wins = record.wins;
  const losses = totalLosses(record);
  const diff = scoreDiff(record);

  if (currentRank.division === 'Makuuchi') {
    return calculateMakuuchiChange(record, wins, losses, diff, options);
  }
  if (currentRank.division === 'Juryo') {
    return calculateJuryoChange(record, wins, losses, diff, options, rng);
  }
  return calculateLowerDivisionRankChange(record, options, rng);
};

/**
 * 次の場所の番付を計算（現実運用を強く意識した版）
 * @param currentRecord 今場所の成績
 * @param pastRecords 直近の成績（新しい順: index 0 = 前場所, 1 = 前々場所）
 * @param isOzekiKadoban 大関カド番フラグ
 */
export const calculateNextRank = (
  currentRecord: BashoRecord,
  pastRecords: BashoRecord[],
  isOzekiKadoban?: boolean,
  rng: RandomSource = Math.random,
  options?: RankCalculationOptions,
): RankChangeResult => {
  const currentRank = currentRecord.rank;
  const wins = currentRecord.wins;
  const finalize = (
    result: { nextRank: Rank; event?: string; isKadoban?: boolean; isOzekiReturn?: boolean },
  ): RankChangeResult => ({
    ...result,
    isKadoban: result.isKadoban ?? false,
    isOzekiReturn: result.isOzekiReturn ?? false,
    ...(() => {
      const makekoshiGuarded = applyMakekoshiDirectionGuard(currentRecord, result.nextRank);
      const guarded = applyKachikoshiDirectionGuard(currentRecord, makekoshiGuarded.nextRank);
      const currentSlot = resolveRankSlot(currentRecord.rank);
      const guardedSlot = resolveRankSlot(guarded.nextRank);
      const adjustedEvent = (makekoshiGuarded.adjusted || guarded.adjusted)
        ? guardedSlot > currentSlot
          ? 'DEMOTION'
          : guardedSlot < currentSlot
            ? 'PROMOTION'
            : undefined
        : result.event;
      return {
        event: adjustedEvent,
        nextRank: resolveNextRankSide(currentRecord, guarded.nextRank, rng),
      };
    })(),
  });

  // 1. 横綱は陥落なし
  if (currentRank.name === '横綱') {
    return finalize({ nextRank: currentRank });
  }

  // 2. 大関
  if (currentRank.name === '大関') {
    const prevRecord = pastRecords[0];
    if (currentRecord.yusho && prevRecord?.yusho && prevRecord.rank.name === '大関') {
      return finalize({
        nextRank: { division: 'Makuuchi', name: '横綱', side: 'East' },
        event: 'PROMOTION_TO_YOKOZUNA',
        isKadoban: false,
      });
    }
    // 「準ずる成績」: 直前優勝 + 今場所14勝以上を一部認める（厳格化）
    if (wins >= 14 && prevRecord?.yusho && prevRecord.rank.name === '大関' && rng() < 0.35) {
      return finalize({
        nextRank: { division: 'Makuuchi', name: '横綱', side: 'East' },
        event: 'PROMOTION_TO_YOKOZUNA',
        isKadoban: false,
      });
    }

    if (wins >= 8) {
      return finalize({ nextRank: currentRank, isKadoban: false });
    }

    if (isOzekiKadoban) {
      return finalize({
        nextRank: { division: 'Makuuchi', name: '関脇', side: 'East' },
        event: 'DEMOTION_TO_SEKIWAKE',
        isKadoban: false,
        isOzekiReturn: true,
      });
    }
    return finalize({ nextRank: currentRank, isKadoban: true, event: 'KADOBAN' });
  }

  // 2.5 大関特例復帰（大関陥落直後の次場所、関脇で10勝以上）
  if (currentRank.name === '関脇' && options?.isOzekiReturn) {
    if (wins >= 10) {
      return finalize({
        nextRank: { division: 'Makuuchi', name: '大関', side: 'East' },
        event: 'PROMOTION_TO_OZEKI',
      });
    }
  }

  // 3. 三役 -> 大関（直近3場所33勝 + 直近場所10勝以上）
  if (isSanyakuName(currentRank.name)) {
    const r1 = currentRecord;
    const r2 = pastRecords[0];
    const r3 = pastRecords[1];
    if (r2 && r3 && [r1, r2, r3].every((r) => isSanyakuOrHigherName(r.rank.name))) {
      const wins3 = [r1, r2, r3].map((r) => r.wins);
      const total3 = wins3.reduce((a, b) => a + b, 0);
      if (total3 >= 33 && r1.wins >= 10) {
        return finalize({
          nextRank: { division: 'Makuuchi', name: '大関', side: 'East' },
          event: 'PROMOTION_TO_OZEKI',
        });
      }
    }
  }

  const assignedTopRank = options?.topDivisionQuota?.assignedNextRank;
  if (
    assignedTopRank &&
    ['Makuuchi', 'Juryo'].includes(currentRank.division) &&
    currentRank.name !== '横綱' &&
    currentRank.name !== '大関'
  ) {
    return finalize({
      nextRank: assignedTopRank,
      event: resolveTopDivisionAssignedEvent(currentRank, assignedTopRank),
    });
  }

  const assignedBoundaryRankRaw =
    options?.boundaryAssignedNextRank ??
    options?.sekitoriQuota?.assignedNextRank ??
    options?.lowerDivisionQuota?.assignedNextRank;
  const assignedBoundaryRank = normalizeBoundaryAssignedRank(
    currentRecord,
    assignedBoundaryRankRaw,
    options,
    rng,
  );
  if (
    assignedBoundaryRank &&
    shouldApplyBoundaryAssignedRank(currentRecord, assignedBoundaryRank) &&
    currentRank.name !== '横綱' &&
    currentRank.name !== '大関'
  ) {
    return finalize({
      nextRank: assignedBoundaryRank,
      event: resolveBoundaryAssignedEvent(currentRank, assignedBoundaryRank),
    });
  }

  return finalize(calculateStandardRankChange(currentRecord, options, rng));
};
