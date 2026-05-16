import { BashoRecord, Rank } from '../../models';
import { RandomSource } from '../../simulation/deps';
import { getRankValue } from '../../ranking/rankScore';
import { stripRankSpecialStatus } from '../../ranking';
import { resolveTopDivisionAssignedEventDetail } from './topDivisionRules';
import { calculateLowerDivisionRankChange } from './lowerDivision';
import {
  BanzukeDecisionReasonCode,
  LowerDivisionMovementDiagnostics,
  RankCalculationOptions,
  RankChangeResult,
} from '../types';
import {
  resolveMaxMakushitaDemotionNumber,
  resolveMakuuchiPromotionLandingNumber,
  resolveJuryoLandingNumberFromMakuuchiDemotion,
  resolveMinJuryoPromotionNumber,
} from '../../simulation/sekitori/boundaryTuning';
import { canPromoteToYokozuna } from './yokozunaPromotion';
import { canPromoteToOzekiBy33Wins } from './sanyakuPromotion';
import { resolveEmpiricalMovement } from './empiricalMovement';
import {
  LIMITS,
  LowerDivisionKey,
  RankScaleSlots,
  resolveLowerDivisionTotal,
  resolveRankLimits,
  resolveRankSlotOffset,
} from '../scale/rankLimits';
import { resolveEmpiricalSlotBand } from '../providers/empirical';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const totalLosses = (record: BashoRecord): number => record.losses + record.absent;

const scoreDiff = (record: BashoRecord): number => record.wins - totalLosses(record);

const resolvePositiveRecordFloorNumber = (
  currentNumber: number,
  maxNumber: number,
  record: BashoRecord,
  multiplier: number,
): number => {
  const diff = scoreDiff(record);
  if (diff <= 0) return currentNumber;
  const promotionWidth = Math.max(1, Math.round(diff * multiplier));
  return clamp(currentNumber - promotionWidth, 1, maxNumber);
};

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

type SlotContext = {
  limits: ReturnType<typeof resolveRankLimits>;
  offsets: ReturnType<typeof resolveRankSlotOffset>;
  jonokuchiBottomSlot: number;
};

const resolveSlotContext = (scaleSlots?: RankScaleSlots): SlotContext => {
  const limits = resolveRankLimits(scaleSlots);
  const offsets = resolveRankSlotOffset(scaleSlots);
  return {
    limits,
    offsets,
    jonokuchiBottomSlot: offsets.Jonokuchi + limits.JONOKUCHI_MAX * 2 - 1,
  };
};

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

const resolveStrictDivisionDemotionGuardSlots = (record: BashoRecord): number => {
  const losses = totalLosses(record);
  const deficit = Math.max(1, losses - record.wins);
  const fullAbsenceThreshold = record.rank.division === 'Juryo' ? 15 : 7;
  if (record.absent >= fullAbsenceThreshold) {
    return clamp(deficit * 2 + 2, 2, 20);
  }
  return clamp(deficit * 2, 2, 14);
};

const resolveRankSlot = (rank: Rank, context: SlotContext): number => {
  const limits = context.limits;
  const offsets = context.offsets;
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
    const n = clamp(rank.number || 1, 1, limits.JURYO_MAX);
    return offsets.Juryo + (n - 1) * 2 + sideOffset;
  }
  if (rank.division === 'Makushita') {
    const n = clamp(rank.number || 1, 1, limits.MAKUSHITA_MAX);
    return offsets.Makushita + (n - 1) * 2 + sideOffset;
  }
  if (rank.division === 'Sandanme') {
    const n = clamp(rank.number || 1, 1, limits.SANDANME_MAX);
    return offsets.Sandanme + (n - 1) * 2 + sideOffset;
  }
  if (rank.division === 'Jonidan') {
    const n = clamp(rank.number || 1, 1, limits.JONIDAN_MAX);
    return offsets.Jonidan + (n - 1) * 2 + sideOffset;
  }
  if (rank.division === 'Jonokuchi') {
    const n = clamp(rank.number || 1, 1, limits.JONOKUCHI_MAX);
    return offsets.Jonokuchi + (n - 1) * 2 + sideOffset;
  }
  return offsets.Maezumo;
};

const resolveRankFromSlot = (slot: number, context: SlotContext): Rank => {
  const limits = context.limits;
  const offsets = context.offsets;
  const bounded = clamp(slot, 0, context.jonokuchiBottomSlot);
  if (bounded <= 7) {
    const names: Array<'横綱' | '大関' | '関脇' | '小結'> = ['横綱', '大関', '関脇', '小結'];
    const idx = Math.floor(bounded / 2);
    return {
      division: 'Makuuchi',
      name: names[clamp(idx, 0, names.length - 1)],
      side: bounded % 2 === 0 ? 'East' : 'West',
    };
  }
  if (bounded < offsets.Juryo) {
    const relative = bounded - 8;
    return {
      division: 'Makuuchi',
      name: '前頭',
      number: Math.floor(relative / 2) + 1,
      side: relative % 2 === 0 ? 'East' : 'West',
    };
  }
  if (bounded < offsets.Makushita) {
    const relative = bounded - offsets.Juryo;
    return {
      division: 'Juryo',
      name: '十両',
      number: Math.floor(relative / 2) + 1,
      side: relative % 2 === 0 ? 'East' : 'West',
    };
  }
  if (bounded < offsets.Sandanme) {
    const relative = bounded - offsets.Makushita;
    return {
      division: 'Makushita',
      name: '幕下',
      number: Math.floor(relative / 2) + 1,
      side: relative % 2 === 0 ? 'East' : 'West',
    };
  }
  if (bounded < offsets.Jonidan) {
    const relative = bounded - offsets.Sandanme;
    return {
      division: 'Sandanme',
      name: '三段目',
      number: Math.floor(relative / 2) + 1,
      side: relative % 2 === 0 ? 'East' : 'West',
    };
  }
  if (bounded < offsets.Jonokuchi) {
    const relative = bounded - offsets.Jonidan;
    return {
      division: 'Jonidan',
      name: '序二段',
      number: Math.floor(relative / 2) + 1,
      side: relative % 2 === 0 ? 'East' : 'West',
    };
  }
  const relative = bounded - offsets.Jonokuchi;
  return {
    division: 'Jonokuchi',
    name: '序ノ口',
    number: clamp(Math.floor(relative / 2) + 1, 1, limits.JONOKUCHI_MAX),
    side: relative % 2 === 0 ? 'East' : 'West',
  };
};

const applyMakekoshiDirectionGuard = (
  currentRecord: BashoRecord,
  nextRank: Rank,
  context: SlotContext,
): { nextRank: Rank; adjusted: boolean } => {
  if (currentRecord.rank.division === 'Maezumo') {
    return { nextRank, adjusted: false };
  }
  const wins = currentRecord.wins;
  const losses = totalLosses(currentRecord);
  if (wins >= losses) return { nextRank, adjusted: false };

  const currentSlot = resolveRankSlot(currentRecord.rank, context);
  const nextSlot = resolveRankSlot(nextRank, context);
  if (nextSlot > currentSlot) return { nextRank, adjusted: false };

  const strictDemotion = MAKEKOSHI_STRICT_DEMOTION_DIVISIONS.has(currentRecord.rank.division);
  if (!strictDemotion && nextSlot === currentSlot) {
    return { nextRank, adjusted: false };
  }

  const forcedDemotionSlots = strictDemotion
    ? resolveStrictDivisionDemotionGuardSlots(currentRecord)
    : 1;
  const forcedSlot = clamp(currentSlot + forcedDemotionSlots, 0, context.jonokuchiBottomSlot);
  if (forcedSlot <= currentSlot) {
    return { nextRank: currentRecord.rank, adjusted: nextSlot !== currentSlot };
  }
  return {
    nextRank: resolveRankFromSlot(forcedSlot, context),
    adjusted: forcedSlot !== nextSlot,
  };
};

const applyKachikoshiDirectionGuard = (
  currentRecord: BashoRecord,
  nextRank: Rank,
  context: SlotContext,
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

  const currentSlot = resolveRankSlot(currentRecord.rank, context);
  const nextSlot = resolveRankSlot(nextRank, context);
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

const resolveYushoPromotionSlots = (record: BashoRecord): number => {
  if (!record.yusho) return 0;
  const diff = scoreDiff(record);
  if (record.rank.division === 'Makuuchi') {
    if (record.rank.name !== '前頭' || record.wins < 10) return 0;
    return clamp(Math.round(diff * 2), 8, 22);
  }
  if (record.rank.division === 'Juryo') {
    if (record.wins < 10) return 0;
    return clamp(Math.round(diff * 1.5), 6, 12);
  }
  if (isLowerDivision(record.rank.division)) {
    if (record.wins < 7) return 0;
    return record.rank.division === 'Makushita' ? 2 : 8;
  }
  return 0;
};

const resolveYushoPromotionFloor = (
  record: BashoRecord,
  proposedRank: Rank,
  context: SlotContext,
): { nextRank: Rank; adjusted: boolean } => {
  const movementSlots = resolveYushoPromotionSlots(record);
  if (movementSlots <= 0) return { nextRank: proposedRank, adjusted: false };

  const currentRank = record.rank;
  const currentSlot = resolveRankSlot(currentRank, context);
  const proposedSlot = resolveRankSlot(proposedRank, context);
  let floorSlot: number | null = null;

  if (currentRank.division === 'Makuuchi' && currentRank.name === '前頭') {
    if (proposedRank.division !== 'Makuuchi' || proposedSlot < currentSlot) {
      return { nextRank: proposedRank, adjusted: false };
    }
    floorSlot = clamp(currentSlot - movementSlots, 8, currentSlot - 1);
  } else if (currentRank.division === 'Juryo') {
    if (proposedRank.division === 'Makuuchi') {
      return { nextRank: proposedRank, adjusted: false };
    }
    const topJuryoSlot = context.offsets.Juryo;
    floorSlot = clamp(currentSlot - movementSlots, topJuryoSlot, currentSlot - 1);
  } else if (isLowerDivision(currentRank.division)) {
    if (proposedRank.division !== currentRank.division || proposedSlot < currentSlot) {
      return { nextRank: proposedRank, adjusted: false };
    }
    const divisionTopSlot = context.offsets[currentRank.division];
    floorSlot = clamp(currentSlot - movementSlots, divisionTopSlot, currentSlot - 1);
  }

  if (floorSlot === null || floorSlot >= proposedSlot || floorSlot >= currentSlot) {
    return { nextRank: proposedRank, adjusted: false };
  }

  return { nextRank: resolveRankFromSlot(floorSlot, context), adjusted: true };
};

const LOWER_DIVISION_NAMES: Record<LowerDivisionKey, string> = {
  Makushita: '幕下',
  Sandanme: '三段目',
  Jonidan: '序二段',
  Jonokuchi: '序ノ口',
};

const isLowerDivision = (division: Rank['division']): division is LowerDivisionKey =>
  division === 'Makushita' ||
  division === 'Sandanme' ||
  division === 'Jonidan' ||
  division === 'Jonokuchi';

const DEFAULT_LOWER_MAX_BY_DIVISION: Record<LowerDivisionKey, number> = {
  Makushita: LIMITS.MAKUSHITA_MAX,
  Sandanme: LIMITS.SANDANME_MAX,
  Jonidan: LIMITS.JONIDAN_MAX,
  Jonokuchi: LIMITS.JONOKUCHI_MAX,
};

const resolveDynamicLowerMax = (
  division: LowerDivisionKey,
  context: SlotContext,
): number => {
  if (division === 'Makushita') return context.limits.MAKUSHITA_MAX;
  if (division === 'Sandanme') return context.limits.SANDANME_MAX;
  if (division === 'Jonidan') return context.limits.JONIDAN_MAX;
  return context.limits.JONOKUCHI_MAX;
};

const resolveLowerRankProgress = (
  rank: Rank,
  context: SlotContext,
): number => {
  if (!isLowerDivision(rank.division)) return 0;
  const max = resolveDynamicLowerMax(rank.division, context);
  return max <= 1 ? 0 : ((rank.number ?? max) - 1) / (max - 1);
};

const usesDynamicScaleExtension = (
  rank: Rank,
  context: SlotContext,
): boolean => {
  if (!isLowerDivision(rank.division) || typeof rank.number !== 'number') return false;
  return (
    rank.number > DEFAULT_LOWER_MAX_BY_DIVISION[rank.division] &&
    rank.number <= resolveDynamicLowerMax(rank.division, context)
  );
};

const isAtDynamicBottom = (rank: Rank, context: SlotContext): boolean =>
  isLowerDivision(rank.division) &&
  (rank.number ?? 1) >= resolveDynamicLowerMax(rank.division, context);

const resolveLowerEmpiricalRankChange = (
  record: BashoRecord,
  options?: RankCalculationOptions,
): { nextRank: Rank; event?: string } | null => {
  const currentRank = record.rank;
  if (!isLowerDivision(currentRank.division)) return null;
  if (record.absent >= 7 || (record.wins === 0 && record.losses >= 7 && record.absent === 0)) return null;

  const context = resolveSlotContext(options?.scaleSlots);
  const lowerBaseSlot = context.offsets.Makushita;
  const currentSlot = resolveRankSlot(currentRank, context) - lowerBaseSlot + 1;
  const totalSlots = resolveLowerDivisionTotal(options?.scaleSlots);
  const limits = context.limits;
  const maxByDivision: Record<LowerDivisionKey, number> = {
    Makushita: limits.MAKUSHITA_MAX,
    Sandanme: limits.SANDANME_MAX,
    Jonidan: limits.JONIDAN_MAX,
    Jonokuchi: limits.JONOKUCHI_MAX,
  };

  const empirical = resolveEmpiricalSlotBand({
    division: currentRank.division,
    rankName: currentRank.name,
    rankNumber: currentRank.number,
    currentSlot,
    totalSlots,
    divisionTotalSlots: maxByDivision[currentRank.division] * 2,
    wins: record.wins,
    losses: record.losses,
    absent: record.absent,
    mandatoryDemotion: record.absent >= 7 && currentRank.division !== 'Jonokuchi',
    mandatoryPromotion:
      currentRank.division !== 'Makushita' &&
      (currentRank.number ?? 99) === 1 &&
      record.wins > totalLosses(record),
    performanceOverExpected: options?.empiricalContext?.performanceOverExpected,
  });
  if (empirical.sampleSize < 20) return null;

  const nudge = clamp(Math.round(options?.lowerDivisionQuota?.enemyHalfStepNudge ?? 0), -1, 1);
  const targetLowerSlot = clamp(empirical.expectedSlot + nudge, 1, totalSlots);
  const targetRank = resolveRankFromSlot(lowerBaseSlot + targetLowerSlot - 1, context);
  if (!isLowerDivision(targetRank.division)) return null;

  const nextRank: Rank = {
    division: targetRank.division,
    name: LOWER_DIVISION_NAMES[targetRank.division],
    number: clamp(targetRank.number ?? 1, 1, maxByDivision[targetRank.division]),
    side: targetRank.side,
  };

  return {
    nextRank,
    event: resolveBoundaryAssignedEvent(currentRank, nextRank),
  };
};

const shouldApplyBoundaryAssignedRank = (
  currentRecord: BashoRecord,
  assignedRank: Rank,
): boolean => {
  if (currentRecord.rank.division === 'Maezumo') return false;
  const current = currentRecord.rank;
  return (
    assignedRank.division !== current.division ||
    assignedRank.name !== current.name ||
    (assignedRank.number ?? undefined) !== (current.number ?? undefined) ||
    (assignedRank.side ?? undefined) !== (current.side ?? undefined)
  );
};

const isBoundaryAssignmentDirectionCompatible = (
  currentRecord: BashoRecord,
  assignedRank: Rank,
  context: SlotContext,
): boolean => {
  if (currentRecord.rank.division === 'Maezumo') return false;
  const wins = currentRecord.wins;
  const losses = totalLosses(currentRecord);
  const currentSlot = resolveRankSlot(currentRecord.rank, context);
  const assignedSlot = resolveRankSlot(assignedRank, context);

  if (
    wins > losses &&
    KACHIKOSHI_STRICT_NON_DEMOTION_DIVISIONS.has(currentRecord.rank.division)
  ) {
    return assignedSlot < currentSlot;
  }
  if (wins < losses) {
    if (MAKEKOSHI_STRICT_DEMOTION_DIVISIONS.has(currentRecord.rank.division)) {
      return assignedSlot > currentSlot;
    }
    return assignedSlot >= currentSlot;
  }
  return true;
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
  _rng: RandomSource = Math.random,
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

  // 三役昇進（空き枠に応じて閾値を動的に緩和）
  const vacancies = options?.topDivisionQuota?.sanyakuVacancies;
  const sekiwakeVacancies = vacancies?.sekiwake ?? 0;
  const komusubiVacancies = vacancies?.komusubi ?? 0;
  const totalSanyakuVacancies = sekiwakeVacancies + komusubiVacancies;

  // 関脇昇進
  if (sekiwakeVacancies > 0) {
    if (num <= 2 && wins >= 10) {
      return {
        nextRank: { division: 'Makuuchi', name: '関脇', side: 'East' },
        event: 'PROMOTION_TO_SEKIWAKE',
      };
    }
    if (num <= 4 && wins >= 11) {
      return {
        nextRank: { division: 'Makuuchi', name: '関脇', side: 'East' },
        event: 'PROMOTION_TO_SEKIWAKE',
      };
    }
  } else {
    if (num <= 2 && wins >= 12) {
      return {
        nextRank: { division: 'Makuuchi', name: '関脇', side: 'East' },
        event: 'PROMOTION_TO_SEKIWAKE',
      };
    }
  }

  // 小結昇進
  if (komusubiVacancies > 0 || totalSanyakuVacancies >= 2) {
    if (num <= 3 && wins >= 9) {
      return {
        nextRank: { division: 'Makuuchi', name: '小結', side: 'East' },
        event: 'PROMOTION_TO_KOMUSUBI',
      };
    }
    if (num <= 5 && wins >= 10) {
      return {
        nextRank: { division: 'Makuuchi', name: '小結', side: 'East' },
        event: 'PROMOTION_TO_KOMUSUBI',
      };
    }
  } else {
    if (num <= 1 && wins >= 10) {
      return {
        nextRank: { division: 'Makuuchi', name: '小結', side: 'East' },
        event: 'PROMOTION_TO_KOMUSUBI',
      };
    }
  }

  // 幕内→十両 陥落（危険水域を明文化）
  const shouldDemote =
    wins === 0 ||
    (num >= 16 && wins <= 7) ||
    (num >= 14 && wins <= 5) ||
    (num >= 12 && wins <= 4);
  const demotionByQuotaBlocked = options?.topDivisionQuota?.canDemoteToJuryo === false;
  if (shouldDemote && !demotionByQuotaBlocked) {
    const jNumber = resolveJuryoLandingNumberFromMakuuchiDemotion(num, wins, losses);
    return {
      nextRank: { division: 'Juryo', name: '十両', number: jNumber, side: 'East' },
      event: 'DEMOTION_TO_JURYO',
    };
  }

  // 経験的データに基づく移動を試行し、不足時は線形フォールバック
  const empirical = resolveEmpiricalMovement({
    division: 'Makuuchi',
    rankName: '前頭',
    rankNumber: num,
    wins,
    losses,
    absent: record.absent,
    divisionSlotOffset: 8,
    divisionTotalHalfSlots: LIMITS.MAEGASHIRA_MAX * 2,
    performanceOverExpected: options?.empiricalContext?.performanceOverExpected,
    stagnationPressure: options?.stagnationPressure,
  }, _rng);

  if (empirical) {
    const empiricalNumber = clamp(empirical.targetNumber, 1, LIMITS.MAEGASHIRA_MAX);
    const floorNumber = resolvePositiveRecordFloorNumber(num, LIMITS.MAEGASHIRA_MAX, record, 1);
    const newNumber = Math.min(empiricalNumber, floorNumber);
    return { nextRank: { ...currentRank, number: newNumber } };
  }

  // フォールバック: 従来の線形乗数
  let move = diff;
  if (diff > 0) {
    move = Math.max(1, Math.floor(diff * (num <= 5 ? 0.9 : 1.2)));
  } else if (diff < 0) {
    move = Math.ceil(diff * (num <= 5 ? 1.4 : 1.2));
  }

  const newNumber = clamp(num - move, 1, LIMITS.MAEGASHIRA_MAX);
  return { nextRank: { ...currentRank, number: Math.floor(newNumber) } };
};

const isJuryoMakushitaExchangeCandidate = (
  juryoNumber: number,
  wins: number,
  absent: number,
): boolean => {
  if (absent >= 15 && juryoNumber >= 12) return true;
  if (juryoNumber >= 14 && wins <= 7) return true;
  if (juryoNumber >= 13 && wins <= 6) return true;
  if (juryoNumber >= 12 && wins <= 5) return true;
  return juryoNumber >= 10 && wins <= 3;
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
  if (!promotionByQuotaBlocked && num === 1 && wins >= 9) {
    const mNumber = resolveMakuuchiPromotionLandingNumber(num, wins);
    return {
      nextRank: { division: 'Makuuchi', name: '前頭', number: mNumber, side: 'East' },
      event: 'PROMOTION_TO_MAKUUCHI',
    };
  }
  if (!promotionByQuotaBlocked && num === 2 && wins >= 10) {
    const mNumber = resolveMakuuchiPromotionLandingNumber(num, wins);
    return {
      nextRank: { division: 'Makuuchi', name: '前頭', number: mNumber, side: 'East' },
      event: 'PROMOTION_TO_MAKUUCHI',
    };
  }
  // バッチ追加: J3 10-5 / J4 11-4 を Makuuchi 昇進に追加 (実史で頻出)。
  // 幕内率 4% を target 7.5% に近づけるため。
  if (!promotionByQuotaBlocked && num === 3 && wins >= 10) {
    const mNumber = resolveMakuuchiPromotionLandingNumber(num, wins);
    return {
      nextRank: { division: 'Makuuchi', name: '前頭', number: mNumber, side: 'East' },
      event: 'PROMOTION_TO_MAKUUCHI',
    };
  }
  if (!promotionByQuotaBlocked && num === 4 && wins >= 10) {
    const mNumber = resolveMakuuchiPromotionLandingNumber(num, wins);
    return {
      nextRank: { division: 'Makuuchi', name: '前頭', number: mNumber, side: 'East' },
      event: 'PROMOTION_TO_MAKUUCHI',
    };
  }
  // バッチ追加 v2: J1 8-7 / J2 9-6 もボーダー昇進対象 (Heisei 実績あり)。
  // 幕内率 3.8% から target 7.5% を目指す。
  if (!promotionByQuotaBlocked && num === 1 && wins >= 8) {
    const mNumber = resolveMakuuchiPromotionLandingNumber(num, wins);
    return {
      nextRank: { division: 'Makuuchi', name: '前頭', number: mNumber, side: 'East' },
      event: 'PROMOTION_TO_MAKUUCHI',
    };
  }
  if (!promotionByQuotaBlocked && num === 2 && wins >= 9) {
    const mNumber = resolveMakuuchiPromotionLandingNumber(num, wins);
    return {
      nextRank: { division: 'Makuuchi', name: '前頭', number: mNumber, side: 'East' },
      event: 'PROMOTION_TO_MAKUUCHI',
    };
  }
  if (!promotionByQuotaBlocked && num <= 4 && wins >= 11) {
    const mNumber = resolveMakuuchiPromotionLandingNumber(num, wins);
    return {
      nextRank: { division: 'Makuuchi', name: '前頭', number: mNumber, side: 'East' },
      event: 'PROMOTION_TO_MAKUUCHI',
    };
  }
  if (!promotionByQuotaBlocked && num <= 7 && wins >= 12) {
    return {
      nextRank: {
        division: 'Makuuchi',
        name: '前頭',
        number: resolveMakuuchiPromotionLandingNumber(num, wins),
        side: 'East',
      },
      event: 'PROMOTION_TO_MAKUUCHI',
    };
  }
  // Fix-batch ③: J5-J7 で 11 勝も実史では幕内昇進が多数 (例: 11-4 J6 → M14)。
  // ここを 12 勝で gate していたため empirical/fallback に落ち、結果として 1-2 枚しか
  // 上がらないケースが頻発していた。
  if (!promotionByQuotaBlocked && num <= 7 && num >= 5 && wins >= 11) {
    return {
      nextRank: {
        division: 'Makuuchi',
        name: '前頭',
        number: resolveMakuuchiPromotionLandingNumber(num, wins),
        side: 'East',
      },
      event: 'PROMOTION_TO_MAKUUCHI',
    };
  }

  // 十両→幕下（危険水域）
  const shouldDemote = isJuryoMakushitaExchangeCandidate(num, wins, record.absent);
  const forcedByQuota =
    options?.sekitoriQuota?.canDemoteToMakushita === true &&
    losses > wins &&
    isJuryoMakushitaExchangeCandidate(num, wins, record.absent);
  if ((shouldDemote || forcedByQuota) && !demotionByQuotaBlocked) {
    const mkNumber = resolveMaxMakushitaDemotionNumber(num, wins, losses, {
      fullAbsence: record.absent >= 15,
    });
    return {
      nextRank: { division: 'Makushita', name: '幕下', number: mkNumber, side: 'East' },
      event: 'DEMOTION_TO_MAKUSHITA',
    };
  }

  // 経験的データに基づく移動を試行
  const empirical = resolveEmpiricalMovement({
    division: 'Juryo',
    rankName: '十両',
    rankNumber: num,
    wins,
    losses,
    absent: record.absent,
    divisionSlotOffset: 0,
    divisionTotalHalfSlots: LIMITS.JURYO_MAX * 2,
    performanceOverExpected: options?.empiricalContext?.performanceOverExpected,
    stagnationPressure: options?.stagnationPressure,
  }, _rng);

  if (empirical) {
    const floorNumber = resolvePositiveRecordFloorNumber(num, LIMITS.JURYO_MAX, record, 0.8);
    const empiricalNumber = Math.min(clamp(empirical.targetNumber, 1, LIMITS.JURYO_MAX), floorNumber);
    let nextPos = (empiricalNumber - 1) * 2 + (empirical.targetSide === 'West' ? 1 : 0);
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
  }

  // フォールバック: 従来の線形乗数
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
    const currentNumber = currentRecord.rank.number ?? LIMITS.JURYO_MAX;
    if (!isJuryoMakushitaExchangeCandidate(currentNumber, wins, currentRecord.absent)) {
      return undefined;
    }
    const diff = scoreDiff(currentRecord);
    const calibrated = calculateJuryoChange(currentRecord, wins, losses, diff, options, rng).nextRank;
    const cappedNumber = resolveMaxMakushitaDemotionNumber(
      currentNumber,
      wins,
      losses,
      { fullAbsence: currentRecord.absent >= 15 },
    );
    if (calibrated.division === 'Makushita') {
      return {
        ...assignedRank,
        number: Math.min(
          assignedRank.number ?? LIMITS.MAKUSHITA_MAX,
          calibrated.number ?? LIMITS.MAKUSHITA_MAX,
          cappedNumber,
        ),
        side: 'East',
      };
    }
    return {
      ...assignedRank,
      number: Math.min(assignedRank.number ?? LIMITS.MAKUSHITA_MAX, cappedNumber),
      side: 'East',
    };
  }
  if (currentRecord.rank.division === 'Makushita' && assignedRank.division === 'Juryo') {
    const minJuryoNumber = resolveMinJuryoPromotionNumber(
      currentRecord.rank.number ?? LIMITS.MAKUSHITA_MAX,
      currentRecord.wins,
    );
    return {
      ...assignedRank,
      number: Math.max(assignedRank.number ?? 1, minJuryoNumber),
      side: 'East',
    };
  }
  if (
    assignedRank !== options?.boundaryAssignedNextRank &&
    isLowerDivision(currentRecord.rank.division) &&
    isLowerDivision(assignedRank.division)
  ) {
    return resolveLowerEmpiricalRankChange(currentRecord, options)?.nextRank ?? assignedRank;
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
    return calculateMakuuchiChange(record, wins, losses, diff, options, rng);
  }
  if (currentRank.division === 'Juryo') {
    return calculateJuryoChange(record, wins, losses, diff, options, rng);
  }
  const lowerEmpirical = resolveLowerEmpiricalRankChange(record, options);
  if (lowerEmpirical) return lowerEmpirical;
  return calculateLowerDivisionRankChange(record, options, rng);
};

const resolveLowerMovementDiagnostics = (
  currentRecord: BashoRecord,
  recordOnlyRank: Rank,
  finalRank: Rank,
  context: SlotContext,
  boundaryAssigned: boolean,
): LowerDivisionMovementDiagnostics | undefined => {
  if (!isLowerDivision(currentRecord.rank.division)) return undefined;
  const currentSlot = resolveRankSlot(currentRecord.rank, context);
  const recordSlot = resolveRankSlot(recordOnlyRank, context);
  const finalSlot = resolveRankSlot(finalRank, context);
  const rawRecordMovement = currentSlot - recordSlot;
  const finalMovement = currentSlot - finalSlot;
  const diff = scoreDiff(currentRecord);
  const recordMovement =
    diff < 0 && rawRecordMovement > 0
      ? -resolveStrictDivisionDemotionGuardSlots(currentRecord)
      : rawRecordMovement;
  const residual = finalMovement - recordMovement;
  const progress = resolveLowerRankProgress(currentRecord.rank, context);
  const pressureLike =
    residual > 0 &&
    (
      currentRecord.rank.division === 'Jonokuchi' ||
      currentRecord.rank.division === 'Jonidan' ||
      progress >= 0.9
    );
  const newRecruitPressure = pressureLike ? residual : 0;
  const vacancyPressure = residual > 0 && !pressureLike ? residual : 0;
  const boundaryProjection = residual < 0 ? residual : 0;
  const rankScaleExtended =
    usesDynamicScaleExtension(currentRecord.rank, context) ||
    usesDynamicScaleExtension(recordOnlyRank, context) ||
    usesDynamicScaleExtension(finalRank, context);
  const dynamicScaleResolved =
    rankScaleExtended ||
    resolveDynamicLowerMax(currentRecord.rank.division, context) !==
      DEFAULT_LOWER_MAX_BY_DIVISION[currentRecord.rank.division];
  const boundaryProjectionApplied = boundaryAssigned || boundaryProjection !== 0 || rankScaleExtended;
  const reasons = new Set<BanzukeDecisionReasonCode>();

  if (diff > 0) reasons.add('RECORD_PROMOTION');
  if (diff < 0) reasons.add('RECORD_DEMOTION');
  if (newRecruitPressure !== 0) reasons.add('NEW_RECRUIT_PRESSURE');
  if (vacancyPressure !== 0) reasons.add('VACANCY_PULL');
  if (boundaryProjectionApplied) reasons.add('BOUNDARY_PROJECTION');
  if (rankScaleExtended) reasons.add('RANK_SCALE_EXTENSION');
  if (dynamicScaleResolved) {
    reasons.add('VARIABLE_HEADCOUNT_PROJECTION');
    reasons.add('TARGET_RANK_RESOLVED_BY_DYNAMIC_SCALE');
  }
  if (isAtDynamicBottom(finalRank, context) && finalMovement <= 0) reasons.add('BOTTOM_CLAMP');
  if (diff > 0) {
    reasons.add(finalMovement > 0 ? 'KACHIKOSHI_REWARD_PRESERVED' : 'KACHIKOSHI_REWARD_LOST');
  }
  if (diff < 0 && finalMovement > 0) reasons.add('MAKEKOSHI_PROMOTION_BY_PRESSURE');

  return {
    recordMovement,
    newRecruitPressure,
    vacancyPressure,
    boundaryProjection,
    finalMovement,
    reasonCodes: [...reasons],
    dynamicScaleResolved,
    rankScaleExtended,
    boundaryProjectionApplied,
  };
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
  const slotContext = resolveSlotContext(options?.scaleSlots);
  const finalize = (
    result: { nextRank: Rank; event?: string; isKadoban?: boolean; isOzekiReturn?: boolean },
    settings?: {
      skipDirectionGuards?: boolean;
      recordOnlyRank?: Rank;
      boundaryAssigned?: boolean;
    },
  ): RankChangeResult => {
    let nextRank: Rank;
    let event: string | undefined;
    if (settings?.skipDirectionGuards) {
      const floored = resolveYushoPromotionFloor(currentRecord, result.nextRank, slotContext);
      const inferredEvent = resolveBoundaryAssignedEvent(currentRecord.rank, floored.nextRank);
      event = floored.adjusted ? inferredEvent : result.event ?? inferredEvent;
      nextRank = stripRankSpecialStatus(resolveNextRankSide(currentRecord, floored.nextRank, rng));
    } else {
      const makekoshiGuarded = applyMakekoshiDirectionGuard(
        currentRecord,
        result.nextRank,
        slotContext,
      );
      const guarded = applyKachikoshiDirectionGuard(
        currentRecord,
        makekoshiGuarded.nextRank,
        slotContext,
      );
      const currentSlot = resolveRankSlot(currentRecord.rank, slotContext);
      const guardedSlot = resolveRankSlot(guarded.nextRank, slotContext);
      const adjustedEvent = (makekoshiGuarded.adjusted || guarded.adjusted)
        ? guardedSlot > currentSlot
          ? 'DEMOTION'
          : guardedSlot < currentSlot
            ? 'PROMOTION'
            : undefined
        : result.event;
      const floored = resolveYushoPromotionFloor(currentRecord, guarded.nextRank, slotContext);
      const inferredEvent = resolveBoundaryAssignedEvent(currentRecord.rank, floored.nextRank);
      event = floored.adjusted ? inferredEvent : adjustedEvent ?? inferredEvent;
      nextRank = stripRankSpecialStatus(resolveNextRankSide(currentRecord, floored.nextRank, rng));
    }
    return {
      ...result,
      nextRank,
      event,
      isKadoban: result.isKadoban ?? false,
      isOzekiReturn: result.isOzekiReturn ?? false,
      lowerMovementDiagnostics: resolveLowerMovementDiagnostics(
        currentRecord,
        settings?.recordOnlyRank ?? result.nextRank,
        nextRank,
        slotContext,
        settings?.boundaryAssigned ?? false,
      ),
    };
  };

  // 1. 横綱は陥落なし
  if (currentRank.name === '横綱') {
    return finalize({ nextRank: currentRank });
  }

  // 2. 大関
  if (currentRank.name === '大関') {
    if (canPromoteToYokozuna(currentRecord, pastRecords, undefined, options?.topRankPopulation)) {
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

  // 3. 小結/関脇 -> 大関（3場所すべて小結/関脇で合計33勝以上 + 直近10勝以上）
  if (canPromoteToOzekiBy33Wins(currentRecord, pastRecords, options?.topRankPopulation)) {
    return finalize({
      nextRank: { division: 'Makuuchi', name: '大関', side: 'East' },
      event: 'PROMOTION_TO_OZEKI',
    });
  }

  const assignedTopRank = options?.topDivisionQuota?.assignedNextRank;
  if (
    assignedTopRank &&
    ['Makuuchi', 'Juryo'].includes(currentRank.division) &&
    currentRank.name !== '横綱' &&
    currentRank.name !== '大関'
  ) {
    const blockedAssignedOzeki =
      assignedTopRank.name === '大関' &&
      !canPromoteToOzekiBy33Wins(currentRecord, pastRecords, options?.topRankPopulation);
    const blockedAssignedYokozuna =
      assignedTopRank.name === '横綱' &&
      !canPromoteToYokozuna(currentRecord, pastRecords, undefined, options?.topRankPopulation);
    if (!blockedAssignedOzeki && !blockedAssignedYokozuna) {
      const assignmentDetail = resolveTopDivisionAssignedEventDetail(currentRank, assignedTopRank);
      return finalize({
        nextRank: assignedTopRank,
        event: assignmentDetail.eventCode,
      });
    }
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
    const blockedBoundaryYokozuna =
      assignedBoundaryRank.name === '横綱' &&
      !canPromoteToYokozuna(currentRecord, pastRecords, undefined, options?.topRankPopulation);
    const blockedBoundaryOzeki =
      assignedBoundaryRank.name === '大関' &&
      !canPromoteToOzekiBy33Wins(currentRecord, pastRecords, options?.topRankPopulation);
    if (blockedBoundaryYokozuna || blockedBoundaryOzeki) {
      return finalize(calculateStandardRankChange(currentRecord, options, rng));
    }
    const directionCompatible = isBoundaryAssignmentDirectionCompatible(
      currentRecord,
      assignedBoundaryRank,
      slotContext,
    );
    if (!directionCompatible) {
      return finalize(calculateStandardRankChange(currentRecord, options, rng));
    }
    const recordOnly = calculateStandardRankChange(currentRecord, options, rng);
    return finalize({
      nextRank: assignedBoundaryRank,
      event: resolveBoundaryAssignedEvent(currentRank, assignedBoundaryRank),
    }, {
      recordOnlyRank: recordOnly.nextRank,
      boundaryAssigned: true,
    });
  }

  return finalize(calculateStandardRankChange(currentRecord, options, rng));
};
