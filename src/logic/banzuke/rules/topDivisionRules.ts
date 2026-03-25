import { Rank } from '../../models';

export const SEKITORI_BOUTS = 15;

export const normalizeSekitoriLosses = (
  wins: number,
  losses: number,
  absent = 0,
  totalBouts = SEKITORI_BOUTS,
): number => losses + absent + Math.max(0, totalBouts - (wins + losses + absent));

export type TopDivisionAssignmentReasonTag =
  | 'DIVISION_CROSS'
  | 'SANYAKU_SLOT_PRESSURE'
  | 'MAEGASHIRA_REORDER'
  | 'NO_CHANGE';

export interface TopDivisionAssignedEventDetail {
  eventCode?: string;
  fromRank: Rank;
  toRank: Rank;
  reasonTags: TopDivisionAssignmentReasonTag[];
}

export const resolveTopDivisionAssignedEventDetail = (
  currentRank: Rank,
  nextRank: Rank,
): TopDivisionAssignedEventDetail => {
  if (currentRank.division !== nextRank.division) {
    if (currentRank.division === 'Juryo' && nextRank.division === 'Makuuchi') {
      return {
        eventCode: 'PROMOTION_TO_MAKUUCHI',
        fromRank: currentRank,
        toRank: nextRank,
        reasonTags: ['DIVISION_CROSS'],
      };
    }
    if (currentRank.division === 'Makuuchi' && nextRank.division === 'Juryo') {
      return {
        eventCode: 'DEMOTION_TO_JURYO',
        fromRank: currentRank,
        toRank: nextRank,
        reasonTags: ['DIVISION_CROSS'],
      };
    }
    return {
      eventCode: undefined,
      fromRank: currentRank,
      toRank: nextRank,
      reasonTags: ['DIVISION_CROSS'],
    };
  }

  if (currentRank.division !== 'Makuuchi' || nextRank.division !== 'Makuuchi') {
    return {
      eventCode: undefined,
      fromRank: currentRank,
      toRank: nextRank,
      reasonTags: ['NO_CHANGE'],
    };
  }

  if (currentRank.name === nextRank.name) {
    return {
      eventCode: undefined,
      fromRank: currentRank,
      toRank: nextRank,
      reasonTags: ['NO_CHANGE'],
    };
  }

  if (nextRank.name === '関脇') {
    return {
      eventCode: 'PROMOTION_TO_SEKIWAKE',
      fromRank: currentRank,
      toRank: nextRank,
      reasonTags: ['SANYAKU_SLOT_PRESSURE'],
    };
  }
  if (nextRank.name === '小結' && currentRank.name === '関脇') {
    return {
      eventCode: 'DEMOTION_TO_KOMUSUBI',
      fromRank: currentRank,
      toRank: nextRank,
      reasonTags: ['SANYAKU_SLOT_PRESSURE'],
    };
  }
  if (nextRank.name === '小結') {
    return {
      eventCode: 'PROMOTION_TO_KOMUSUBI',
      fromRank: currentRank,
      toRank: nextRank,
      reasonTags: ['SANYAKU_SLOT_PRESSURE'],
    };
  }
  if (nextRank.name === '前頭') {
    return {
      eventCode: 'DEMOTION_TO_MAEGASHIRA',
      fromRank: currentRank,
      toRank: nextRank,
      reasonTags: ['MAEGASHIRA_REORDER'],
    };
  }
  return {
    eventCode: undefined,
    fromRank: currentRank,
    toRank: nextRank,
    reasonTags: ['MAEGASHIRA_REORDER'],
  };
};

export const resolveTopDivisionAssignedEvent = (
  currentRank: Rank,
  nextRank: Rank,
): string | undefined => resolveTopDivisionAssignedEventDetail(currentRank, nextRank).eventCode;
