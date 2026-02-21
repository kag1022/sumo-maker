import { generateTitle } from '../naming/playerNaming';
import { getRankValue, RankChangeResult } from '../ranking';
import { BashoRecord, BodyType, Rank, RikishiStatus } from '../models';

const PRIZE_LABEL: Record<string, string> = {
  SHUKUN: '殊勲賞',
  KANTO: '敢闘賞',
  GINO: '技能賞',
};

const toPrizeLabel = (prize: string): string => PRIZE_LABEL[prize] ?? prize;

const DEFAULT_BODY_METRICS: Record<BodyType, { heightCm: number; weightKg: number }> = {
  NORMAL: { heightCm: 182, weightKg: 138 },
  SOPPU: { heightCm: 186, weightKg: 124 },
  ANKO: { heightCm: 180, weightKg: 162 },
  MUSCULAR: { heightCm: 184, weightKg: 152 },
};

export const initializeSimulationStatus = (initialStats: RikishiStatus): RikishiStatus => {
  const status: RikishiStatus = JSON.parse(JSON.stringify(initialStats));
  status.statHistory = [];
  if (!status.injuries) status.injuries = [];
  if (!status.history.kimariteTotal) status.history.kimariteTotal = {};
  if (!status.traits) status.traits = [];
  if (!status.bodyType) status.bodyType = 'NORMAL';
  if (!status.profile) {
    status.profile = { realName: '', birthplace: '', personality: 'CALM' };
  } else {
    if (typeof status.profile.realName !== 'string') status.profile.realName = '';
    if (typeof status.profile.birthplace !== 'string') status.profile.birthplace = '';
    if (!status.profile.personality) status.profile.personality = 'CALM';
  }
  if (!status.bodyMetrics) {
    status.bodyMetrics = { ...DEFAULT_BODY_METRICS[status.bodyType] };
  } else {
    if (!Number.isFinite(status.bodyMetrics.heightCm)) {
      status.bodyMetrics.heightCm = DEFAULT_BODY_METRICS[status.bodyType].heightCm;
    }
    if (!Number.isFinite(status.bodyMetrics.weightKg)) {
      status.bodyMetrics.weightKg = DEFAULT_BODY_METRICS[status.bodyType].weightKg;
    }
  }
  if (typeof status.entryAge !== 'number') status.entryAge = status.age;
  if (typeof status.isOzekiKadoban !== 'boolean') status.isOzekiKadoban = false;
  if (typeof status.isOzekiReturn !== 'boolean') status.isOzekiReturn = false;
  return status;
};

export const appendEntryEvent = (status: RikishiStatus, year: number): void => {
  status.history.events.push({
    year,
    month: 1,
    type: 'ENTRY',
    description: `新弟子として入門。四股名「${status.shikona}」。`,
  });
};

export const resolvePastRecords = (records: BashoRecord[]): BashoRecord[] => {
  const len = records.length;
  if (len < 2) return [];
  return [records[len - 2], records[len - 3]].filter(Boolean);
};

export const appendBashoEvents = (
  status: RikishiStatus,
  year: number,
  month: number,
  bashoRecord: BashoRecord,
  rankChange: RankChangeResult,
  currentRank: Rank,
): void => {
  if (bashoRecord.absent > 0) {
    status.history.events.push({
      year,
      month,
      type: 'INJURY',
      description: `怪我により休場 (${bashoRecord.wins}勝${bashoRecord.losses}敗${bashoRecord.absent}休)`,
    });
  }

  if (rankChange.event) {
    let eventType: 'PROMOTION' | 'DEMOTION';
    let description: string;
    const recordStr = `(${bashoRecord.wins}勝${bashoRecord.losses}敗${bashoRecord.absent > 0 ? bashoRecord.absent + '休' : ''})`;

    if (rankChange.event === 'KADOBAN') {
      eventType = 'DEMOTION';
      description = `大関カド番 ${recordStr}`;
    } else if (rankChange.event.includes('PROMOTION')) {
      eventType = 'PROMOTION';
      description = `${rankChange.nextRank.name}へ昇進 ${recordStr}`;
    } else if (rankChange.event.includes('DEMOTION')) {
      eventType = 'DEMOTION';
      description = `${rankChange.nextRank.name}へ陥落 ${recordStr}`;
    } else {
      eventType = 'PROMOTION';
      description = `${currentRank.name}から${rankChange.nextRank.name}へ移動 ${recordStr}`;
    }

    status.history.events.push({
      year,
      month,
      type: eventType,
      description,
    });
  }

  if (bashoRecord.yusho) {
    const yushoTitle = currentRank.division === 'Makuuchi' ? '幕内優勝' : `${currentRank.name}優勝`;
    status.history.events.push({
      year,
      month,
      type: 'YUSHO',
      description: `${yushoTitle} (${bashoRecord.wins}勝)`,
    });
  }

  if (bashoRecord.specialPrizes.length > 0) {
    status.history.events.push({
      year,
      month,
      type: 'OTHER',
      description: `三賞受賞: ${bashoRecord.specialPrizes.map(toPrizeLabel).join('・')}`,
    });
  }

  if ((bashoRecord.kinboshi ?? 0) > 0) {
    status.history.events.push({
      year,
      month,
      type: 'OTHER',
      description: `金星${bashoRecord.kinboshi}個を獲得`,
    });
  }
};

export const updateCareerStats = (status: RikishiStatus, record: BashoRecord): void => {
  status.history.totalWins += record.wins;
  status.history.totalLosses += record.losses;
  status.history.totalAbsent += record.absent;

  if (record.kimariteCount) {
    if (!status.history.kimariteTotal) status.history.kimariteTotal = {};
    for (const [move, count] of Object.entries(record.kimariteCount)) {
      status.history.kimariteTotal[move] = (status.history.kimariteTotal[move] || 0) + count;
    }
  }

  if (record.yusho) {
    if (status.rank.division === 'Makuuchi') status.history.yushoCount.makuuchi++;
    else if (status.rank.division === 'Juryo') status.history.yushoCount.juryo++;
    else if (status.rank.division === 'Makushita') status.history.yushoCount.makushita++;
    else status.history.yushoCount.others++;
  }

  if (isHigherRank(status.rank, status.history.maxRank)) {
    status.history.maxRank = { ...status.rank };
  }
};

export const finalizeCareer = (
  status: RikishiStatus,
  year: number,
  month: number,
  reason?: string,
): RikishiStatus => {
  status.history.events.push({
    year,
    month,
    type: 'RETIREMENT',
    description: `引退 (${reason || '理由不明'})`,
  });
  status.history.title = generateTitle(status.history);
  return status;
};

const isHigherRank = (r1: Rank, r2: Rank): boolean => {
  const v1 = getRankValue(r1);
  const v2 = getRankValue(r2);
  return v1 < v2;
};
