import { Rank } from '../../../models';
import { normalizeSekitoriLosses } from '../../rules/topDivisionRules';
import { MakuuchiLayout } from '../../scale/banzukeLayout';
import { resolvePressureAdjustedMakuuchiPromotionLandingNumber } from '../../../simulation/sekitori/boundaryTuning';
import { toMakuuchiSlot } from './slots';
import { BashoRecordSnapshot, RankOrderProfile, SekitoriContextSnapshot, TopDirective } from './types';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const isUpperLaneRank = (rank: Rank): boolean =>
  rank.division === 'Makuuchi' &&
  (
    rank.name === '関脇' ||
    rank.name === '小結' ||
    (rank.name === '前頭' && (rank.number ?? 99) <= 5)
  );

const isMakuuchiDemotionBubble = (snapshot: BashoRecordSnapshot): boolean => {
  if (snapshot.rank.division !== 'Makuuchi' || snapshot.rank.name !== '前頭') return false;
  const number = snapshot.rank.number ?? 17;
  const losses = normalizeSekitoriLosses(snapshot.wins, snapshot.losses, snapshot.absent);
  const deficit = losses - snapshot.wins;
  if (snapshot.absent >= 15) return true;
  if (number >= 15 && deficit >= 3) return true;
  if (number >= 13 && deficit >= 4) return true;
  return number >= 11 && deficit >= 6;
};

const isJuryoPromotionBubble = (snapshot: BashoRecordSnapshot): boolean => {
  if (snapshot.rank.division !== 'Juryo') return false;
  const number = snapshot.rank.number ?? 14;
  const losses = normalizeSekitoriLosses(snapshot.wins, snapshot.losses, snapshot.absent);
  const diff = snapshot.wins - losses;
  if (number === 1 && snapshot.wins >= 9) return true;
  if (number <= 2 && snapshot.wins >= 10) return true;
  if (number <= 4 && snapshot.wins >= 11) return true;
  return number <= 7 && diff >= 4;
};

const classifyBubbleClass = (snapshot: BashoRecordSnapshot): string => {
  const rank = snapshot.rank;
  const losses = normalizeSekitoriLosses(snapshot.wins, snapshot.losses, snapshot.absent);
  const diff = snapshot.wins - losses;
  if (rank.division === 'Makuuchi' && (rank.name === '横綱' || rank.name === '大関')) return 'TOP_HOLD';
  if (rank.division === 'Makuuchi' && (rank.name === '関脇' || rank.name === '小結')) {
    return diff >= 0 ? 'SANYAKU_HOLD' : 'SANYAKU_DROP';
  }
  if (rank.division === 'Makuuchi' && rank.name === '前頭') {
    const number = rank.number ?? 17;
    if (number <= 5 && diff >= 2) return 'UPPER_PUSH';
    if (number <= 10 && diff > 0) return 'MID_PUSH';
    if (number >= 12 && diff < 0) return 'MAKUUCHI_DROP';
    return 'MAKUUCHI_STAY';
  }
  if (rank.division === 'Juryo') {
    const number = rank.number ?? 14;
    if (number <= 5 && diff > 0) return 'JURYO_PROMOTE';
    if (number >= 10 && diff < 0) return 'JURYO_DROP';
    return 'JURYO_STAY';
  }
  return 'SEKITORI';
};

export const buildSekitoriContextSnapshot = (
  records: BashoRecordSnapshot[],
): SekitoriContextSnapshot => {
  let upperCollapseCount = 0;
  let upperBlockerCount = 0;
  let makuuchiDemotionOpenings = 0;
  let juryoPromotionCandidates = 0;
  let sanyakuVacancies = 0;
  const competitionBands = new Map<string, number>();

  for (const snapshot of records) {
    const losses = normalizeSekitoriLosses(snapshot.wins, snapshot.losses, snapshot.absent);
    const diff = snapshot.wins - losses;
    const bubbleClass = classifyBubbleClass(snapshot);
    competitionBands.set(bubbleClass, (competitionBands.get(bubbleClass) ?? 0) + 1);

    if (isUpperLaneRank(snapshot.rank)) {
      if (diff < 0) upperCollapseCount += 1;
      if (diff >= 2) upperBlockerCount += 1;
    }
    if (isMakuuchiDemotionBubble(snapshot)) makuuchiDemotionOpenings += 1;
    if (isJuryoPromotionBubble(snapshot)) juryoPromotionCandidates += 1;
    if (
      snapshot.rank.division === 'Makuuchi' &&
      (snapshot.rank.name === '関脇' || snapshot.rank.name === '小結') &&
      diff < 0
    ) {
      sanyakuVacancies += 1;
    }
  }

  return {
    upperCollapseCount,
    upperBlockerCount,
    makuuchiDemotionOpenings,
    juryoPromotionCandidates,
    sanyakuVacancies,
    boundaryOpenings: {
      makuuchi: makuuchiDemotionOpenings,
      juryo: 0,
    },
    competitionBands,
    promotionPressureSource: Math.max(0, upperCollapseCount - upperBlockerCount) + makuuchiDemotionOpenings,
    demotionPressureSource: Math.max(0, juryoPromotionCandidates - makuuchiDemotionOpenings),
  };
};

const resolveCongestionPenalty = (
  bubbleClass: string,
  context: SekitoriContextSnapshot,
): number => Math.max(0, (context.competitionBands.get(bubbleClass) ?? 1) - 1) * 6;

const resolveSanyakuVacancyGain = (
  snapshot: BashoRecordSnapshot,
  diff: number,
  context: SekitoriContextSnapshot,
): number => {
  if (snapshot.rank.division !== 'Makuuchi') return 0;
  if (snapshot.rank.name === '関脇' || snapshot.rank.name === '小結') {
    return diff >= 0 ? context.sanyakuVacancies * 8 : 0;
  }
  if (snapshot.rank.name !== '前頭') return 0;
  const number = snapshot.rank.number ?? 17;
  if (number > 5 || diff <= 0) return 0;
  const vacancyStrength = context.sanyakuVacancies * 22;
  if (number <= 2 && snapshot.wins >= 10) return vacancyStrength + 18;
  if (number <= 4 && snapshot.wins >= 9) return vacancyStrength + 10;
  return vacancyStrength;
};

const resolveMaegashiraVacancyGain = (
  snapshot: BashoRecordSnapshot,
  diff: number,
  context: SekitoriContextSnapshot,
): number => {
  if (snapshot.rank.division !== 'Makuuchi' || snapshot.rank.name !== '前頭') return 0;
  const number = snapshot.rank.number ?? 17;
  const vacancySwing = context.upperCollapseCount - context.upperBlockerCount;
  if (diff <= 0) {
    if (number >= 12) {
      return -Math.max(0, context.juryoPromotionCandidates - context.makuuchiDemotionOpenings) * 10;
    }
    return 0;
  }
  if (number >= 6 && number <= 10) {
    return vacancySwing * 16 + context.makuuchiDemotionOpenings * 4;
  }
  if (number <= 5) {
    return vacancySwing * 8 + context.sanyakuVacancies * 10;
  }
  return context.makuuchiDemotionOpenings * 6;
};

const resolveJuryoVacancyGain = (
  snapshot: BashoRecordSnapshot,
  diff: number,
  context: SekitoriContextSnapshot,
): number => {
  if (snapshot.rank.division !== 'Juryo' || diff <= 0) return 0;
  const number = snapshot.rank.number ?? 14;
  if (number > 5) return 0;
  return (
    context.makuuchiDemotionOpenings * 22 +
    Math.max(0, context.upperCollapseCount - context.upperBlockerCount) * 14 -
    Math.max(0, context.juryoPromotionCandidates - 2) * 8
  );
};

const toSlot = (
  rank: Rank,
  layout: MakuuchiLayout,
): number => {
  if (rank.division !== 'Makuuchi') return 42 + (((rank.number ?? 1) - 1) * 2 + (rank.side === 'West' ? 2 : 1));
  return toMakuuchiSlot(rank, layout);
};

const resolveJuryoPromotionTargetSlot = (
  snapshot: BashoRecordSnapshot,
  context: SekitoriContextSnapshot,
  layout: MakuuchiLayout,
): number => {
  const number = snapshot.rank.number ?? 14;
  const upperLanePressure =
    context.makuuchiDemotionOpenings +
    Math.max(0, context.upperCollapseCount - context.upperBlockerCount);
  const landing = resolvePressureAdjustedMakuuchiPromotionLandingNumber(
    number,
    snapshot.wins,
    upperLanePressure,
  );
  return toSlot({ division: 'Makuuchi', name: '前頭', number: landing, side: 'East' }, layout);
};

export const buildSekitoriOrderProfile = (
  snapshot: BashoRecordSnapshot,
  directive: TopDirective,
  currentSlot: number,
  context: SekitoriContextSnapshot,
  layout: MakuuchiLayout,
): RankOrderProfile => {
  const normalizedLosses = normalizeSekitoriLosses(snapshot.wins, snapshot.losses, snapshot.absent);
  const diff = snapshot.wins - normalizedLosses;
  const bubbleClass = classifyBubbleClass(snapshot);
  const hardRuleReason: string[] = [];
  const congestionPenalty = resolveCongestionPenalty(bubbleClass, context);
  const vacancyGain =
    resolveSanyakuVacancyGain(snapshot, diff, context) +
    resolveMaegashiraVacancyGain(snapshot, diff, context) +
    resolveJuryoVacancyGain(snapshot, diff, context);

  let comparisonTier =
    snapshot.rank.name === '横綱' ? 0 :
      snapshot.rank.name === '大関' ? 1 :
        snapshot.rank.name === '関脇' || snapshot.rank.name === '小結' ? 2 :
          snapshot.rank.division === 'Makuuchi' ? 3 :
            4;

  let targetSlot = currentSlot;
  let minSlot = currentSlot;
  let maxSlot = currentSlot;

  if (snapshot.rank.division === 'Makuuchi') {
    if (snapshot.rank.name === '横綱') {
      targetSlot = currentSlot;
      minSlot = currentSlot;
      maxSlot = currentSlot;
      hardRuleReason.push('YOKOZUNA_HOLD');
    } else if (snapshot.rank.name === '大関') {
      if (directive.preferredTopName === '横綱') {
        targetSlot = Math.max(1, currentSlot - 1);
        minSlot = targetSlot;
        maxSlot = currentSlot;
      } else if (diff >= 0) {
        targetSlot = currentSlot;
        minSlot = currentSlot;
        maxSlot = currentSlot + (diff >= 4 ? 1 : 0);
      } else {
        targetSlot = currentSlot + Math.min(4, Math.abs(diff) * 2);
        minSlot = currentSlot;
        maxSlot = currentSlot + 5;
      }
    } else if (snapshot.rank.name === '関脇' || snapshot.rank.name === '小結') {
      const rise = diff > 0 ? Math.min(4, diff + (snapshot.wins >= 10 ? 1 : 0)) : 0;
      const drop = diff < 0 ? Math.min(10, Math.abs(diff) * 2 + (snapshot.absent >= 8 ? 2 : 0)) : 0;
      targetSlot = clamp(currentSlot - rise + drop, 1, 42);
      minSlot = clamp(targetSlot - 2, 1, 42);
      maxSlot = clamp(targetSlot + 2 + (drop > 0 ? 2 : 0), 1, 42);
    } else {
      const number = snapshot.rank.number ?? 17;
      const promotion = diff > 0 ? diff * 2 + (snapshot.wins >= 10 ? 1 : 0) : 0;
      const demotion = diff < 0 ? Math.abs(diff) * 3 + (snapshot.absent >= 8 ? 2 : 0) : 0;
      const vacancyShift = Math.round(vacancyGain / 18);
      targetSlot = clamp(currentSlot - promotion + demotion - vacancyShift, 1, 42);
      minSlot = clamp(targetSlot - (diff > 0 ? 2 : 1), 1, 42);
      maxSlot = clamp(targetSlot + (diff < 0 ? 3 : 2), 1, 42);
      if (number >= 6 && number <= 10 && diff === 1) {
        maxSlot = Math.min(maxSlot, currentSlot);
      }
      if (number <= 5 && snapshot.wins >= 10) {
        maxSlot = Math.min(maxSlot, toSlot({ division: 'Makuuchi', name: '小結', side: 'West' }, layout));
      }
    }
  } else {
    const number = snapshot.rank.number ?? 14;
    if (diff > 0 && number <= 5) {
      targetSlot = resolveJuryoPromotionTargetSlot(snapshot, context, layout);
      minSlot = clamp(targetSlot - 2, 1, 70);
      maxSlot = clamp(targetSlot + 3, 1, 70);
      comparisonTier = 3;
    } else {
      const promotion = diff > 0 ? diff * 2 + (number <= 7 ? 1 : 0) : 0;
      const demotion = diff < 0 ? Math.abs(diff) * 2 + (number >= 10 ? 1 : 0) + (snapshot.absent >= 8 ? 2 : 0) : 0;
      targetSlot = clamp(currentSlot - promotion + demotion - Math.round(vacancyGain / 24), 43, 70);
      minSlot = clamp(targetSlot - (diff > 0 ? 2 : 1), 43, 70);
      maxSlot = clamp(targetSlot + (diff < 0 ? 3 : 2), 43, 70);
    }
  }

  const score =
    (2200 - currentSlot * 18) +
    diff * 120 +
    snapshot.wins * 12 -
    snapshot.absent * 40 +
    vacancyGain -
    congestionPenalty +
    (directive.preferredTopName === '横綱' ? 180 :
      directive.preferredTopName === '大関' ? 140 :
        directive.preferredTopName === '関脇' ? 72 :
          directive.preferredTopName === '小結' ? 48 :
            0);

  return {
    comparisonTier,
    bubbleClass,
    vacancyGain,
    congestionPenalty,
    hardRuleReason,
    targetSlot,
    minSlot: clamp(Math.min(minSlot, maxSlot), 1, 70),
    maxSlot: clamp(Math.max(minSlot, maxSlot), 1, 70),
    score,
  };
};
