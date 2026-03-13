import { generateTitle } from '../naming/playerNaming';
import { RankChangeResult } from '../banzuke';
import { BashoRecord, BodyType, Rank, RikishiStatus } from '../models';
import { DEFAULT_CAREER_BAND, resolveAptitudeProfile } from '../constants';
import { resolveAbilityFromStats, resolveRankBaselineAbility } from './strength/model';
import { getRankValue } from '../ranking/rankScore';
import { ensureKataProfile } from '../style/kata';
import { ensurePhaseAStatus } from '../phaseA';
import { buildCareerRealismSnapshot, createDefaultStagnationState, resolveLegacyAptitudeFactor } from './realism';

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

const DIVISION_LABEL: Record<Rank['division'], string> = {
  Makuuchi: '幕内',
  Juryo: '十両',
  Makushita: '幕下',
  Sandanme: '三段目',
  Jonidan: '序二段',
  Jonokuchi: '序ノ口',
  Maezumo: '前相撲',
};

const formatFullRankLabel = (rank: Rank): string => {
  if (rank.division === 'Maezumo') return '前相撲';
  const side = rank.side === 'West' ? '西' : rank.side === 'East' ? '東' : '';
  if (['横綱', '大関', '関脇', '小結'].includes(rank.name)) return `${side}${rank.name}`;
  return `${side}${rank.name}${rank.number || 1}枚目`;
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
  if (!status.ratingState) {
    status.ratingState = {
      ability: resolveAbilityFromStats(
        status.stats,
        status.currentCondition,
        status.bodyMetrics,
        resolveRankBaselineAbility(status.rank),
      ),
      form: 0,
      uncertainty: 2.2,
    };
  } else {
    if (!Number.isFinite(status.ratingState.ability)) {
      status.ratingState.ability = resolveAbilityFromStats(
        status.stats,
        status.currentCondition,
        status.bodyMetrics,
        resolveRankBaselineAbility(status.rank),
      );
    }
    if (!Number.isFinite(status.ratingState.form)) {
      status.ratingState.form = 0;
    }
    if (!Number.isFinite(status.ratingState.uncertainty)) {
      status.ratingState.uncertainty = 2.2;
    }
  }
  if (typeof status.entryAge !== 'number') status.entryAge = status.age;
  if (!status.aptitudeProfile) {
    status.aptitudeProfile = resolveAptitudeProfile(status.aptitudeTier);
  }
  if (!Number.isFinite(status.aptitudeFactor)) {
    status.aptitudeFactor = resolveLegacyAptitudeFactor(status.aptitudeProfile, status.aptitudeTier);
  }
  if (!status.careerBand) status.careerBand = DEFAULT_CAREER_BAND;
  if (typeof status.isOzekiKadoban !== 'boolean') status.isOzekiKadoban = false;
  if (typeof status.isOzekiReturn !== 'boolean') status.isOzekiReturn = false;
  if (!status.retirementProfile) status.retirementProfile = 'STANDARD';
  if (!Number.isFinite(status.spirit)) status.spirit = 70;
  if (!status.stagnation) status.stagnation = createDefaultStagnationState();
  status.history.realismKpi = buildCareerRealismSnapshot(status);
  return ensurePhaseAStatus(ensureKataProfile(status));
};

export const appendEntryEvent = (status: RikishiStatus, year: number): void => {
  status.history.events.push({
    year,
    month: 1,
    type: 'ENTRY',
    description: `新弟子として入門。四股名「${status.shikona}」で土俵へ。`,
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
  const hasInjuryEventThisBasho = status.history.events.some(
    (event) => event.type === 'INJURY' && event.year === year && event.month === month,
  );

  if (bashoRecord.absent > 0 && !hasInjuryEventThisBasho) {
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
      description = `${formatFullRankLabel(rankChange.nextRank)}へ昇進 ${recordStr}`;
    } else if (rankChange.event.includes('DEMOTION')) {
      eventType = 'DEMOTION';
      description = `${formatFullRankLabel(rankChange.nextRank)}へ陥落 ${recordStr}`;
    } else {
      eventType = 'PROMOTION';
      description = `${formatFullRankLabel(currentRank)}から${formatFullRankLabel(rankChange.nextRank)}へ移動 ${recordStr}`;
    }

    status.history.events.push({
      year,
      month,
      type: eventType,
      description,
    });
  }

  if (bashoRecord.yusho) {
    const yushoTitle = `${DIVISION_LABEL[currentRank.division]}優勝`;
    status.history.events.push({
      year,
      month,
      type: 'YUSHO',
      description: `${yushoTitle} (${formatFullRankLabel(currentRank)} / ${bashoRecord.wins}勝)`,
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
  status.history.realismKpi = buildCareerRealismSnapshot(status);
  return status;
};

const isHigherRank = (r1: Rank, r2: Rank): boolean => {
  const v1 = getRankValue(r1);
  const v2 = getRankValue(r2);
  return v1 < v2;
};
