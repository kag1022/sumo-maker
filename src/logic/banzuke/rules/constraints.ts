import { BashoRecord, Rank } from '../../models';
import { getRankValue } from '../../ranking/rankScore';
import { BanzukeConstraintCode } from '../types';
import { canPromoteToOzekiBy33Wins } from './sanyakuPromotion';

const compareRank = (a: Rank, b: Rank): number => {
  const av = getRankValue(a);
  const bv = getRankValue(b);
  if (av !== bv) return av - bv;
  if ((a.number ?? 0) !== (b.number ?? 0)) return (a.number ?? 0) - (b.number ?? 0);
  if (a.side !== b.side) return a.side === 'East' ? -1 : 1;
  return 0;
};

const isFullAbsence = (currentRecord: BashoRecord): boolean => {
  if (currentRecord.rank.division === 'Makuuchi' || currentRecord.rank.division === 'Juryo') {
    return currentRecord.absent >= 15;
  }
  if (
    currentRecord.rank.division === 'Makushita' ||
    currentRecord.rank.division === 'Sandanme' ||
    currentRecord.rank.division === 'Jonidan' ||
    currentRecord.rank.division === 'Jonokuchi'
  ) {
    return currentRecord.absent >= 7;
  }
  return false;
};

export const resolveConstraintHits = (input: {
  currentRank: Rank;
  finalRank: Rank;
  wins: number;
  losses: number;
  absent: number;
  historyWindow: BashoRecord[];
}): BanzukeConstraintCode[] => {
  const { currentRank, finalRank, wins, losses, absent, historyWindow } = input;
  const hits: BanzukeConstraintCode[] = [];
  const currentRecord: BashoRecord = {
    year: 0,
    month: 0,
    rank: currentRank,
    wins,
    losses,
    absent,
    yusho: false,
    specialPrizes: [],
  };
  const totalLosses = losses + absent;
  const rankCmp = compareRank(finalRank, currentRank);
  const promoted = rankCmp < 0;
  const demoted = rankCmp > 0;

  if (currentRank.name === '横綱' && demoted) {
    hits.push('YOKOZUNA_NO_DEMOTION');
  }

  if (finalRank.name === '大関' && !canPromoteToOzekiBy33Wins(currentRecord, historyWindow)) {
    hits.push('OZEKI_PROMOTION_33WINS_GATE');
  }

  if (wins > totalLosses && demoted) {
    hits.push('KACHIKOSHI_NO_DEMOTION');
  }

  if (wins < totalLosses && promoted) {
    hits.push('MAKEKOSHI_NO_PROMOTION');
  }

  if (isFullAbsence(currentRecord) && !demoted && currentRank.division !== 'Maezumo') {
    hits.push('FULL_ABSENCE_MIN_DEMOTION');
  }

  return hits;
};
