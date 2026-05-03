import {
  CareerSaveTag,
  ObservationStanceId,
  Rank,
  RikishiStatus,
} from '../models';
import { getRankValue, getRankValueForChart } from '../ranking';

export interface ObservationStanceDefinition {
  id: ObservationStanceId;
  label: string;
  shortLabel: string;
  description: string;
  focusMetrics: string[];
}

export type CareerAutoTag =
  | 'LATE_BLOOM'
  | 'INJURY_COMEBACK'
  | 'STABLE_TOP_DIVISION'
  | 'JURYO_CRAFT'
  | 'TURBULENT'
  | 'RARE_RECORD'
  | 'LONGEVITY'
  | 'FAST_RISE'
  | 'SANYAKU_NEAR_MISS'
  | 'RIVALRY';

export type CareerClassification =
  | 'GREAT_RIKISHI'
  | 'OZEKI_SANYAKU_CORE'
  | 'STABLE_MAKUUCHI'
  | 'JURYO_CRAFTSMAN'
  | 'UNFINISHED_TALENT'
  | 'LATE_BLOOM_SUCCESS'
  | 'INJURY_SHADOW'
  | 'TURBULENT_LIFE'
  | 'LONGEVITY'
  | 'SHORT_BURST'
  | 'MEMORABLE_SUPPORT'
  | 'ORDINARY_RECORD';

export interface CareerAnalysisMetric {
  key: string;
  label: string;
  value: number | null;
  display: string;
  higherIsBetter?: boolean;
}

export interface CareerStanceAnalysis {
  stanceId: ObservationStanceId | null;
  stanceLabel: string;
  verdict: string;
  tone: 'success' | 'neutral' | 'warning';
  score: number;
  highlightRows: CareerAnalysisMetric[];
  reasonLines: string[];
}

export interface CareerSaveRecommendation {
  score: number;
  rarityScore: number;
  classification: CareerClassification;
  classificationLabel: string;
  reasons: string[];
  autoTags: CareerAutoTag[];
  suggestedManualTags: CareerSaveTag[];
}

export interface CareerAnalysisSummary {
  status: RikishiStatus;
  metrics: {
    totalBasho: number;
    careerYears: number;
    totalDecisions: number;
    winRate: number;
    kachiKoshiRate: number;
    makuuchiBasho: number;
    sekitoriBasho: number;
    sanyakuBasho: number;
    yushoTotal: number;
    junYushoTotal: number;
    sanshoTotal: number;
    kinboshiTotal: number;
    absentTotal: number;
    injuryEventCount: number;
    majorInjuryCount: number;
    bigLossCount: number;
    maxMakekoshiStreak: number;
    firstSekitoriAge: number | null;
    firstMakuuchiAge: number | null;
    firstSanyakuAge: number | null;
    maxRankAge: number | null;
    peakAge: number | null;
    lateMaxRankUpdates: number;
    maxRise: number;
    maxDrop: number;
    promotionSpeedScore: number;
    stabilityScore: number;
    turbulenceScore: number;
    rarityScore: number;
    rivalScore: number;
    comebackCount: number;
  };
  maxRankLabel: string;
  finalRankLabel: string;
  classification: CareerClassification;
  classificationLabel: string;
  autoTags: CareerAutoTag[];
  saveRecommendation: CareerSaveRecommendation;
}

export interface CareerComparisonMetric {
  key: string;
  label: string;
  left: string;
  right: string;
  winner: 'left' | 'right' | 'tie' | 'none';
}

export interface CareerComparisonSummary {
  metrics: CareerComparisonMetric[];
  comments: string[];
}

export interface CareerTrajectorySeriesPoint {
  bashoSeq: number;
  age: number;
  rankValue: number;
  rankLabel: string;
  winRate: number;
  rollingWinRate: number | null;
  marker: 'YUSHO' | 'INJURY' | 'PROMOTION' | 'RETIREMENT' | null;
}

export interface CareerSimilarityResult {
  targetId: string;
  candidateId: string;
  score: number;
  reasons: string[];
}

export interface CareerGenerationSummary {
  cohortKey: string;
  cohortSize: number;
  maxRankStanding: number | null;
  winRateStanding: number | null;
  makuuchiStanding: number | null;
  label: string;
  notes: string[];
}

export const OBSERVATION_STANCES: ObservationStanceDefinition[] = [
  {
    id: 'PROMOTION_EXPECTATION',
    label: '出世期待',
    shortLabel: '出世',
    description: 'どこまで早く番付を上げるかを見る。',
    focusMetrics: ['最高位', '到達年齢', '新十両', '新入幕'],
  },
  {
    id: 'LATE_BLOOM',
    label: '晩成観測',
    shortLabel: '晩成',
    description: '二十代後半以降に伸びる余地を見る。',
    focusMetrics: ['28歳以降の更新', '30歳以降勝率', '晩年代表場所'],
  },
  {
    id: 'STABILITY',
    label: '安定性観測',
    shortLabel: '安定',
    description: '勝ち越しと在位の揺れにくさを見る。',
    focusMetrics: ['勝ち越し率', '幕内在位', '大負け', '連続負け越し'],
  },
  {
    id: 'TURBULENCE',
    label: '波乱観測',
    shortLabel: '波乱',
    description: '急上昇、急落、怪我、復帰の起伏を見る。',
    focusMetrics: ['最大上昇', '最大下降', '怪我', '復帰'],
  },
  {
    id: 'RIVALRY',
    label: 'ライバル観測',
    shortLabel: '宿敵',
    description: '対戦相手との関係が人生に残るかを見る。',
    focusMetrics: ['宿敵候補', '対戦密度', '優勝争い', '苦手相手'],
  },
  {
    id: 'RARE_RECORD',
    label: '珍記録観測',
    shortLabel: '珍記録',
    description: '普通ではない記録や極端な推移を探す。',
    focusMetrics: ['珍記録度', '高齢更新', '停滞突破', '極端な変動'],
  },
  {
    id: 'INJURY_COMEBACK',
    label: '怪我復帰観測',
    shortLabel: '復帰',
    description: '休場や大怪我の後に戻れるかを見る。',
    focusMetrics: ['怪我回数', '休場', '復帰成功', '怪我後更新'],
  },
  {
    id: 'LONGEVITY',
    label: '長寿キャリア観測',
    shortLabel: '長寿',
    description: '長く土俵に残る価値を見る。',
    focusMetrics: ['在位年数', '引退年齢', '関取在位', '終盤成績'],
  },
];

export const AUTO_TAG_LABELS: Record<CareerAutoTag, string> = {
  LATE_BLOOM: '晩成型',
  INJURY_COMEBACK: '怪我復帰',
  STABLE_TOP_DIVISION: '安定幕内',
  JURYO_CRAFT: '十両職人',
  TURBULENT: '波乱型',
  RARE_RECORD: '珍記録',
  LONGEVITY: '長寿',
  FAST_RISE: '短期爆発',
  SANYAKU_NEAR_MISS: '三役目前',
  RIVALRY: '宿敵あり',
};

export const MANUAL_SAVE_TAG_LABELS: Record<CareerSaveTag, string> = {
  GREAT_RIKISHI: '名力士',
  UNFINISHED_TALENT: '未完の大器',
  LATE_BLOOM_SUCCESS: '晩成成功',
  INJURY_TRAGEDY: '怪我に泣いた',
  TURBULENT_LIFE: '波乱の人生',
  STABLE_MAKUUCHI: '安定幕内',
  JURYO_CRAFTSMAN: '十両職人',
  GENERATION_LEADER: '同期の出世頭',
  RIVALRY_MEMORY: '宿敵が印象的',
  RARE_RECORD: '珍記録',
  RESEARCH_SAMPLE: '検証サンプル',
  FAVORITE: '好き',
  MEMORABLE_SUPPORT: '記憶に残る脇役',
  UNEXPECTED: '予想外',
  REREAD: '再読したい',
};

const CLASSIFICATION_LABELS: Record<CareerClassification, string> = {
  GREAT_RIKISHI: '名力士',
  OZEKI_SANYAKU_CORE: '三役中核',
  STABLE_MAKUUCHI: '安定幕内',
  JURYO_CRAFTSMAN: '十両職人',
  UNFINISHED_TALENT: '未完の大器',
  LATE_BLOOM_SUCCESS: '晩成成功',
  INJURY_SHADOW: '怪我に泣いた力士',
  TURBULENT_LIFE: '波乱型',
  LONGEVITY: '長寿型',
  SHORT_BURST: '短期爆発型',
  MEMORABLE_SUPPORT: '記憶に残る脇役',
  ORDINARY_RECORD: '標準型',
};

export const resolveObservationStance = (
  stanceId?: ObservationStanceId | null,
): ObservationStanceDefinition | null =>
  OBSERVATION_STANCES.find((stance) => stance.id === stanceId) ?? null;

export const resolveObservationStanceLabel = (stanceId?: ObservationStanceId | null): string =>
  resolveObservationStance(stanceId)?.label ?? '観測スタンス未設定';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const formatRankName = (rank: Rank): string => {
  if (rank.division === 'Maezumo') return '前相撲';
  const side = rank.side === 'West' ? '西' : rank.side === 'East' ? '東' : '';
  if (['横綱', '大関', '関脇', '小結'].includes(rank.name)) return `${side}${rank.name}`;
  return `${side}${rank.name}${rank.number || 1}枚目`;
};

const rankTier = (rank: Rank): number => {
  if (rank.name === '横綱') return 9;
  if (rank.name === '大関') return 8;
  if (rank.name === '関脇') return 7;
  if (rank.name === '小結') return 6;
  if (rank.division === 'Makuuchi') return 5;
  if (rank.division === 'Juryo') return 4;
  if (rank.division === 'Makushita') return 3;
  if (rank.division === 'Sandanme') return 2;
  if (rank.division === 'Jonidan') return 1;
  return 0;
};

const estimatedAgeAtSeq = (status: RikishiStatus, bashoSeq: number): number =>
  status.entryAge + Math.max(0, Math.floor((bashoSeq - 1) / 6));

const formatAge = (age: number | null): string => age === null ? '-' : `${age}歳`;
const formatRate = (rate: number): string => `${Math.round(rate * 100)}%`;
const formatCount = (count: number, unit = '件'): string => `${count}${unit}`;

const maxStreak = (records: Array<{ wins: number; losses: number; absent: number }>, predicate: (record: { wins: number; losses: number; absent: number }) => boolean): number => {
  let current = 0;
  let best = 0;
  for (const record of records) {
    if (predicate(record)) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
};

const countSanyakuBasho = (status: RikishiStatus): number =>
  status.history.records.filter((record) =>
    ['横綱', '大関', '関脇', '小結'].includes(record.rank.name),
  ).length;

const resolveAgeFirst = (status: RikishiStatus, predicate: (rank: Rank) => boolean): number | null => {
  const index = status.history.records.findIndex((record) => predicate(record.rank));
  return index < 0 ? null : estimatedAgeAtSeq(status, index + 1);
};

const resolveMaxRankAge = (status: RikishiStatus): number | null => {
  const bestValue = getRankValue(status.history.maxRank);
  const index = status.history.records.findIndex((record) => getRankValue(record.rank) === bestValue);
  return index < 0 ? null : estimatedAgeAtSeq(status, index + 1);
};

const countLateMaxRankUpdates = (status: RikishiStatus, minAge: number): number => {
  let bestValue = Number.POSITIVE_INFINITY;
  let count = 0;
  status.history.records.forEach((record, index) => {
    const value = getRankValue(record.rank);
    const age = estimatedAgeAtSeq(status, index + 1);
    if (value < bestValue) {
      if (age >= minAge) count += 1;
      bestValue = value;
    }
  });
  return count;
};

const resolveRankSwing = (status: RikishiStatus): { maxRise: number; maxDrop: number } => {
  let maxRise = 0;
  let maxDrop = 0;
  const values = status.history.records.map((record) => getRankValue(record.rank));
  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index - 1] - values[index];
    maxRise = Math.max(maxRise, delta);
    maxDrop = Math.max(maxDrop, -delta);
  }
  return {
    maxRise: Math.round(maxRise * 10) / 10,
    maxDrop: Math.round(maxDrop * 10) / 10,
  };
};

const countComebacks = (status: RikishiStatus): number => {
  let count = 0;
  let injurySeq = 0;
  let bestBefore = Number.POSITIVE_INFINITY;
  status.history.records.forEach((record, index) => {
    const seq = index + 1;
    const value = getRankValue(record.rank);
    if (record.absent > 0) injurySeq = seq;
    if (injurySeq > 0 && seq > injurySeq && value < bestBefore) {
      count += 1;
      injurySeq = 0;
    }
    bestBefore = Math.min(bestBefore, value);
  });
  return count;
};

const resolvePeakAge = (status: RikishiStatus): number | null => {
  const scored = status.history.records.map((record, index) => ({
    seq: index + 1,
    score: record.wins - record.losses - record.absent * 0.7 - getRankValue(record.rank) * 0.012,
  }));
  scored.sort((left, right) => right.score - left.score);
  return scored[0] ? estimatedAgeAtSeq(status, scored[0].seq) : null;
};

export const buildCareerTrajectorySeries = (status: RikishiStatus): CareerTrajectorySeriesPoint[] => {
  let cumulativeWins = 0;
  let cumulativeDecisions = 0;
  const records = status.history.records.filter((record) => record.rank.division !== 'Maezumo');
  return records.map((record, index) => {
    cumulativeWins += record.wins;
    cumulativeDecisions += record.wins + record.losses;
    const window = records.slice(Math.max(0, index - 4), index + 1);
    const windowWins = window.reduce((sum, entry) => sum + entry.wins, 0);
    const windowDecisions = window.reduce((sum, entry) => sum + entry.wins + entry.losses, 0);
    const event = status.history.events.find((entry) => entry.year === record.year && entry.month === record.month);
    return {
      bashoSeq: index + 1,
      age: estimatedAgeAtSeq(status, index + 1),
      rankValue: getRankValueForChart(record.rank),
      rankLabel: formatRankName(record.rank),
      winRate: cumulativeDecisions > 0 ? cumulativeWins / cumulativeDecisions : 0,
      rollingWinRate: window.length >= 3 && windowDecisions > 0 ? windowWins / windowDecisions : null,
      marker: record.yusho
        ? 'YUSHO'
        : event?.type === 'INJURY'
          ? 'INJURY'
          : event?.type === 'PROMOTION'
            ? 'PROMOTION'
            : event?.type === 'RETIREMENT'
              ? 'RETIREMENT'
              : null,
    };
  });
};

const classifyCareer = (status: RikishiStatus, metrics: CareerAnalysisSummary['metrics']): CareerClassification => {
  const tier = rankTier(status.history.maxRank);
  if (tier >= 8 || status.history.yushoCount.makuuchi >= 2) return 'GREAT_RIKISHI';
  if (metrics.lateMaxRankUpdates > 0 && tier >= 5) return 'LATE_BLOOM_SUCCESS';
  if (metrics.majorInjuryCount > 0 && metrics.comebackCount === 0 && tier >= 4) return 'INJURY_SHADOW';
  if (tier >= 6) return 'OZEKI_SANYAKU_CORE';
  if (metrics.makuuchiBasho >= 20 && metrics.stabilityScore >= 58) return 'STABLE_MAKUUCHI';
  if (tier === 4 && metrics.sekitoriBasho >= 18) return 'JURYO_CRAFTSMAN';
  if ((status.aptitudeTier === 'S' || status.aptitudeTier === 'A') && tier < 5) return 'UNFINISHED_TALENT';
  if (metrics.turbulenceScore >= 72) return 'TURBULENT_LIFE';
  if (status.age >= 35 || metrics.totalBasho >= 90) return 'LONGEVITY';
  if (metrics.promotionSpeedScore >= 76 && metrics.totalBasho <= 36) return 'SHORT_BURST';
  if (metrics.rarityScore >= 50 || metrics.rivalScore >= 45) return 'MEMORABLE_SUPPORT';
  return 'ORDINARY_RECORD';
};

const resolveAutoTags = (status: RikishiStatus, metrics: CareerAnalysisSummary['metrics'], classification: CareerClassification): CareerAutoTag[] => {
  const tags = new Set<CareerAutoTag>();
  if (metrics.lateMaxRankUpdates > 0 || classification === 'LATE_BLOOM_SUCCESS') tags.add('LATE_BLOOM');
  if (metrics.comebackCount > 0) tags.add('INJURY_COMEBACK');
  if (metrics.makuuchiBasho >= 20 && metrics.stabilityScore >= 55) tags.add('STABLE_TOP_DIVISION');
  if (rankTier(status.history.maxRank) === 4 && metrics.sekitoriBasho >= 18) tags.add('JURYO_CRAFT');
  if (metrics.turbulenceScore >= 62) tags.add('TURBULENT');
  if (metrics.rarityScore >= 48) tags.add('RARE_RECORD');
  if (status.age >= 35 || metrics.totalBasho >= 90) tags.add('LONGEVITY');
  if (metrics.promotionSpeedScore >= 75) tags.add('FAST_RISE');
  if (status.history.maxRank.division === 'Makuuchi' && metrics.sanyakuBasho === 0 && metrics.makuuchiBasho >= 12) tags.add('SANYAKU_NEAR_MISS');
  if (metrics.rivalScore >= 35) tags.add('RIVALRY');
  return [...tags];
};

const suggestManualTags = (classification: CareerClassification, autoTags: CareerAutoTag[]): CareerSaveTag[] => {
  const tags = new Set<CareerSaveTag>();
  if (classification === 'GREAT_RIKISHI') tags.add('GREAT_RIKISHI');
  if (classification === 'UNFINISHED_TALENT') tags.add('UNFINISHED_TALENT');
  if (classification === 'LATE_BLOOM_SUCCESS') tags.add('LATE_BLOOM_SUCCESS');
  if (classification === 'INJURY_SHADOW') tags.add('INJURY_TRAGEDY');
  if (classification === 'TURBULENT_LIFE') tags.add('TURBULENT_LIFE');
  if (classification === 'STABLE_MAKUUCHI') tags.add('STABLE_MAKUUCHI');
  if (classification === 'JURYO_CRAFTSMAN') tags.add('JURYO_CRAFTSMAN');
  if (autoTags.includes('RIVALRY')) tags.add('RIVALRY_MEMORY');
  if (autoTags.includes('RARE_RECORD')) tags.add('RARE_RECORD');
  tags.add('RESEARCH_SAMPLE');
  tags.add('FAVORITE');
  return [...tags].slice(0, 8);
};

const resolveSaveReasons = (status: RikishiStatus, metrics: CareerAnalysisSummary['metrics'], autoTags: CareerAutoTag[]): string[] => {
  const reasons: string[] = [];
  const tier = rankTier(status.history.maxRank);
  if (tier >= 6) reasons.push(`最高位が${formatRankName(status.history.maxRank)}まで届いている。`);
  if (metrics.makuuchiBasho >= 20) reasons.push(`幕内在位が${metrics.makuuchiBasho}場所あり、読み返す価値がある。`);
  if (metrics.yushoTotal > 0) reasons.push(`優勝経験が${metrics.yushoTotal}回ある。`);
  if (metrics.lateMaxRankUpdates > 0) reasons.push(`28歳以降に最高位を${metrics.lateMaxRankUpdates}回更新している。`);
  if (metrics.comebackCount > 0) reasons.push(`休場や怪我の後に番付を戻した形跡がある。`);
  if (metrics.rivalScore >= 35) reasons.push('対戦相手との関係が濃く、宿敵読みの対象になる。');
  if (autoTags.includes('SANYAKU_NEAR_MISS')) reasons.push('三役目前で踏みとどまった幕内人生として比較しやすい。');
  if (metrics.totalBasho >= 70) reasons.push(`通算${metrics.totalBasho}場所の長い記録が残っている。`);
  if (metrics.rarityScore >= 55) reasons.push('珍記録候補を含み、資料館で探す価値がある。');
  if (reasons.length === 0) reasons.push('標準的な一代として、比較母集団に加える価値がある。');
  return reasons.slice(0, 5);
};

export const buildCareerAnalysisSummary = (status: RikishiStatus): CareerAnalysisSummary => {
  const records = status.history.records.filter((record) => record.rank.division !== 'Maezumo');
  const totalBasho = records.length;
  const totalDecisions = status.history.totalWins + status.history.totalLosses;
  const winRate = totalDecisions > 0 ? status.history.totalWins / totalDecisions : 0;
  const kachiKoshiCount = records.filter((record) => record.wins > record.losses).length;
  const kachiKoshiRate = totalBasho > 0 ? kachiKoshiCount / totalBasho : 0;
  const makuuchiBasho = records.filter((record) => record.rank.division === 'Makuuchi').length;
  const sekitoriBasho = records.filter((record) => record.rank.division === 'Makuuchi' || record.rank.division === 'Juryo').length;
  const sanyakuBasho = countSanyakuBasho(status);
  const yushoTotal = Object.values(status.history.yushoCount).reduce((sum, count) => sum + count, 0);
  const junYushoTotal = records.filter((record) => record.junYusho).length;
  const sanshoTotal = records.reduce((sum, record) => sum + (record.specialPrizes?.length ?? 0), 0);
  const kinboshiTotal = records.reduce((sum, record) => sum + (record.kinboshi ?? 0), 0);
  const injuryEventCount = status.history.events.filter((event) => event.type === 'INJURY').length;
  const majorInjuryCount = status.history.highlightEvents?.filter((event) => event.tag === 'MAJOR_INJURY').length ?? 0;
  const bigLossCount = records.filter((record) => record.losses + record.absent >= 10).length;
  const maxMakekoshiStreak = maxStreak(records, (record) => record.wins <= record.losses + record.absent);
  const firstSekitoriAge = resolveAgeFirst(status, (rank) => rank.division === 'Juryo' || rank.division === 'Makuuchi');
  const firstMakuuchiAge = resolveAgeFirst(status, (rank) => rank.division === 'Makuuchi');
  const firstSanyakuAge = resolveAgeFirst(status, (rank) => ['横綱', '大関', '関脇', '小結'].includes(rank.name));
  const maxRankAge = resolveMaxRankAge(status);
  const peakAge = resolvePeakAge(status);
  const lateMaxRankUpdates = countLateMaxRankUpdates(status, 28);
  const { maxRise, maxDrop } = resolveRankSwing(status);
  const promotionSpeedScore = clamp(
    100 - (firstSekitoriAge ?? 34) * 2.1 - (firstMakuuchiAge ?? 38) * 1.2 + rankTier(status.history.maxRank) * 12,
    0,
    100,
  );
  const stabilityScore = clamp(
    kachiKoshiRate * 70 + Math.min(24, makuuchiBasho * 0.8) + Math.min(18, sekitoriBasho * 0.32) - bigLossCount * 3 - maxMakekoshiStreak * 4,
    0,
    100,
  );
  const turbulenceScore = clamp(maxRise * 0.28 + maxDrop * 0.24 + injuryEventCount * 7 + bigLossCount * 3 + lateMaxRankUpdates * 8, 0, 100);
  const rivalScore = clamp(
    (status.careerRivalryDigest?.titleBlockers.length ?? 0) * 22 +
    (status.careerRivalryDigest?.eraTitans.length ?? 0) * 16 +
    (status.careerRivalryDigest?.nemesis.length ?? 0) * 14,
    0,
    100,
  );
  const comebackCount = countComebacks(status);
  const rarityScore = clamp(
    lateMaxRankUpdates * 16 +
    comebackCount * 16 +
    (status.age >= 35 ? 16 : 0) +
    (makuuchiBasho === 0 && totalBasho >= 70 ? 18 : 0) +
    (promotionSpeedScore >= 80 ? 12 : 0) +
    (turbulenceScore >= 70 ? 15 : 0) +
    rivalScore * 0.25,
    0,
    100,
  );
  const metrics = {
    totalBasho,
    careerYears: Math.max(0, Math.round((totalBasho / 6) * 10) / 10),
    totalDecisions,
    winRate,
    kachiKoshiRate,
    makuuchiBasho,
    sekitoriBasho,
    sanyakuBasho,
    yushoTotal,
    junYushoTotal,
    sanshoTotal,
    kinboshiTotal,
    absentTotal: status.history.totalAbsent,
    injuryEventCount,
    majorInjuryCount,
    bigLossCount,
    maxMakekoshiStreak,
    firstSekitoriAge,
    firstMakuuchiAge,
    firstSanyakuAge,
    maxRankAge,
    peakAge,
    lateMaxRankUpdates,
    maxRise,
    maxDrop,
    promotionSpeedScore,
    stabilityScore,
    turbulenceScore,
    rarityScore,
    rivalScore,
    comebackCount,
  };
  const classification = classifyCareer(status, metrics);
  const autoTags = resolveAutoTags(status, metrics, classification);
  const reasons = resolveSaveReasons(status, metrics, autoTags);
  const saveScore = clamp(
    rankTier(status.history.maxRank) * 9 +
    metrics.yushoTotal * 10 +
    Math.min(20, metrics.makuuchiBasho * 0.5) +
    metrics.rarityScore * 0.32 +
    metrics.rivalScore * 0.18 +
    metrics.stabilityScore * 0.12,
    0,
    100,
  );

  return {
    status,
    metrics,
    maxRankLabel: formatRankName(status.history.maxRank),
    finalRankLabel: records.length > 0 ? formatRankName(records[records.length - 1].rank) : formatRankName(status.rank),
    classification,
    classificationLabel: CLASSIFICATION_LABELS[classification],
    autoTags,
    saveRecommendation: {
      score: Math.round(saveScore),
      rarityScore: Math.round(metrics.rarityScore),
      classification,
      classificationLabel: CLASSIFICATION_LABELS[classification],
      reasons,
      autoTags,
      suggestedManualTags: suggestManualTags(classification, autoTags),
    },
  };
};

const metric = (
  key: string,
  label: string,
  value: number | null,
  display: string,
  higherIsBetter = true,
): CareerAnalysisMetric => ({ key, label, value, display, higherIsBetter });

export const buildCareerStanceAnalysis = (
  summary: CareerAnalysisSummary,
  stanceId?: ObservationStanceId | null,
): CareerStanceAnalysis => {
  const id = stanceId ?? null;
  const stance = resolveObservationStance(id);
  const { metrics } = summary;
  const fallbackLabel = stance?.label ?? '観測スタンス未設定';
  if (id === 'LATE_BLOOM') {
    const score = clamp(metrics.lateMaxRankUpdates * 34 + (metrics.maxRankAge ?? 0) - 18 + (metrics.peakAge && metrics.peakAge >= 29 ? 22 : 0), 0, 100);
    return {
      stanceId: id,
      stanceLabel: fallbackLabel,
      verdict: score >= 70 ? '晩成成功' : score >= 42 ? '晩成傾向あり' : '不発',
      tone: score >= 70 ? 'success' : score >= 42 ? 'neutral' : 'warning',
      score: Math.round(score),
      highlightRows: [
        metric('lateMaxRankUpdates', '28歳以降の最高位更新', metrics.lateMaxRankUpdates, formatCount(metrics.lateMaxRankUpdates, '回')),
        metric('maxRankAge', '最高位到達年齢', metrics.maxRankAge, formatAge(metrics.maxRankAge)),
        metric('peakAge', '全盛期推定', metrics.peakAge, formatAge(metrics.peakAge)),
        metric('winRate', '通算勝率', metrics.winRate, formatRate(metrics.winRate)),
      ],
      reasonLines: [
        metrics.lateMaxRankUpdates > 0 ? '二十代後半以降にも番付を更新しており、晩成観測の対象になる。' : '最高位更新は若年期に寄っており、晩成としては弱い。',
        metrics.peakAge && metrics.peakAge >= 29 ? `${metrics.peakAge}歳前後に代表的な成績が出ている。` : '全盛期推定は若めで、後半の伸びは限定的。',
      ],
    };
  }
  if (id === 'STABILITY') {
    const score = metrics.stabilityScore;
    return {
      stanceId: id,
      stanceLabel: fallbackLabel,
      verdict: score >= 70 ? '高安定' : score >= 45 ? '標準' : '不安定',
      tone: score >= 70 ? 'success' : score >= 45 ? 'neutral' : 'warning',
      score: Math.round(score),
      highlightRows: [
        metric('kachiKoshiRate', '勝ち越し率', metrics.kachiKoshiRate, formatRate(metrics.kachiKoshiRate)),
        metric('makuuchiBasho', '幕内在位', metrics.makuuchiBasho, formatCount(metrics.makuuchiBasho, '場所')),
        metric('bigLossCount', '大負け場所', metrics.bigLossCount, formatCount(metrics.bigLossCount, '場所'), false),
        metric('maxMakekoshiStreak', '連続負け越し最大', metrics.maxMakekoshiStreak, formatCount(metrics.maxMakekoshiStreak, '場所'), false),
      ],
      reasonLines: [
        `勝ち越し率は${formatRate(metrics.kachiKoshiRate)}。`,
        metrics.bigLossCount <= 2 ? '大崩れが少なく、記録の読み味は安定寄り。' : '大負け場所が複数あり、安定型とは言い切れない。',
      ],
    };
  }
  if (id === 'TURBULENCE') {
    const score = metrics.turbulenceScore;
    return {
      stanceId: id,
      stanceLabel: fallbackLabel,
      verdict: score >= 70 ? '波乱大' : score >= 42 ? '波乱あり' : '平坦',
      tone: score >= 70 ? 'success' : score >= 42 ? 'neutral' : 'warning',
      score: Math.round(score),
      highlightRows: [
        metric('maxRise', '最大上昇幅', metrics.maxRise, metrics.maxRise.toFixed(1)),
        metric('maxDrop', '最大下降幅', metrics.maxDrop, metrics.maxDrop.toFixed(1)),
        metric('injuryEventCount', '怪我イベント', metrics.injuryEventCount, formatCount(metrics.injuryEventCount)),
        metric('comebackCount', '復帰成功', metrics.comebackCount, formatCount(metrics.comebackCount, '回')),
      ],
      reasonLines: [
        metrics.maxRise > 40 || metrics.maxDrop > 40 ? '番付変動の振れ幅が大きく、波乱として読める。' : '番付変動の振れ幅は比較的穏やか。',
        metrics.comebackCount > 0 ? '休場後に番付を戻した局面がある。' : '復帰成功として強く読める局面は少ない。',
      ],
    };
  }
  if (id === 'RIVALRY') {
    const score = metrics.rivalScore;
    const digest = summary.status.careerRivalryDigest;
    return {
      stanceId: id,
      stanceLabel: fallbackLabel,
      verdict: score >= 55 ? '宿敵関係あり' : score >= 25 ? '相手関係あり' : '薄い',
      tone: score >= 55 ? 'success' : score >= 25 ? 'neutral' : 'warning',
      score: Math.round(score),
      highlightRows: [
        metric('titleBlockers', '優勝争いの相手', digest?.titleBlockers.length ?? 0, formatCount(digest?.titleBlockers.length ?? 0)),
        metric('eraTitans', '時代の壁', digest?.eraTitans.length ?? 0, formatCount(digest?.eraTitans.length ?? 0)),
        metric('nemesis', '苦手相手', digest?.nemesis.length ?? 0, formatCount(digest?.nemesis.length ?? 0)),
        metric('rivalScore', '宿敵濃度', metrics.rivalScore, `${Math.round(metrics.rivalScore)}点`),
      ],
      reasonLines: [
        digest?.nemesis[0]?.summary ?? digest?.titleBlockers[0]?.summary ?? '濃い宿敵候補は限定的。',
        metrics.rivalScore >= 25 ? '対戦関係から読み返す余地がある。' : '単体キャリアとして読む方が自然。',
      ],
    };
  }
  if (id === 'RARE_RECORD') {
    const score = metrics.rarityScore;
    return {
      stanceId: id,
      stanceLabel: fallbackLabel,
      verdict: score >= 65 ? '珍記録級' : score >= 38 ? 'やや珍しい' : '通常',
      tone: score >= 65 ? 'success' : score >= 38 ? 'neutral' : 'warning',
      score: Math.round(score),
      highlightRows: [
        metric('rarityScore', '珍記録度', metrics.rarityScore, `${Math.round(metrics.rarityScore)}点`),
        metric('lateMaxRankUpdates', '高齢更新', metrics.lateMaxRankUpdates, formatCount(metrics.lateMaxRankUpdates, '回')),
        metric('turbulenceScore', '波乱度', metrics.turbulenceScore, `${Math.round(metrics.turbulenceScore)}点`),
        metric('totalBasho', '在位場所', metrics.totalBasho, formatCount(metrics.totalBasho, '場所')),
      ],
      reasonLines: [
        metrics.rarityScore >= 65 ? '複数の珍しい条件が重なっている。' : '珍記録としては単独要素が中心。',
        summary.autoTags.length ? `自動タグ: ${summary.autoTags.map((tag) => AUTO_TAG_LABELS[tag]).join(' / ')}` : '明確な珍記録タグは少ない。',
      ],
    };
  }
  if (id === 'INJURY_COMEBACK') {
    const score = clamp(metrics.comebackCount * 34 + metrics.majorInjuryCount * 18 + Math.min(16, metrics.absentTotal), 0, 100);
    return {
      stanceId: id,
      stanceLabel: fallbackLabel,
      verdict: score >= 60 ? '復帰成功' : score >= 30 ? '復帰の痕跡あり' : '不発',
      tone: score >= 60 ? 'success' : score >= 30 ? 'neutral' : 'warning',
      score: Math.round(score),
      highlightRows: [
        metric('injuryEventCount', '怪我イベント', metrics.injuryEventCount, formatCount(metrics.injuryEventCount)),
        metric('majorInjuryCount', '大怪我', metrics.majorInjuryCount, formatCount(metrics.majorInjuryCount)),
        metric('absentTotal', '休場', metrics.absentTotal, formatCount(metrics.absentTotal, '休'), false),
        metric('comebackCount', '復帰成功', metrics.comebackCount, formatCount(metrics.comebackCount, '回')),
      ],
      reasonLines: [
        metrics.comebackCount > 0 ? '休場後に最高位または番付を戻した局面がある。' : '怪我後の明確な再上昇は弱い。',
        metrics.majorInjuryCount > 0 ? '大怪我が人生の読みどころになっている。' : '大怪我級の転機は少ない。',
      ],
    };
  }
  if (id === 'LONGEVITY') {
    const score = clamp(metrics.totalBasho * 0.9 + (summary.status.age - 28) * 5 + metrics.sekitoriBasho * 0.35, 0, 100);
    return {
      stanceId: id,
      stanceLabel: fallbackLabel,
      verdict: score >= 70 ? '長寿成功' : score >= 42 ? '長め' : '短命',
      tone: score >= 70 ? 'success' : score >= 42 ? 'neutral' : 'warning',
      score: Math.round(score),
      highlightRows: [
        metric('totalBasho', '在位場所', metrics.totalBasho, formatCount(metrics.totalBasho, '場所')),
        metric('careerYears', '在位年数', metrics.careerYears, `${metrics.careerYears.toFixed(1)}年`),
        metric('retireAge', '引退年齢', summary.status.age, `${summary.status.age}歳`),
        metric('sekitoriBasho', '関取在位', metrics.sekitoriBasho, formatCount(metrics.sekitoriBasho, '場所')),
      ],
      reasonLines: [
        summary.status.age >= 35 ? '引退年齢が高く、長寿観測として十分に成立する。' : '年齢面では突出しない。',
        metrics.sekitoriBasho >= 24 ? '関取として長く読み返せる記録がある。' : '長寿でも関取定着とは限らない。',
      ],
    };
  }

  const score = metrics.promotionSpeedScore;
  return {
    stanceId: id,
    stanceLabel: fallbackLabel,
    verdict: rankTier(summary.status.history.maxRank) >= 6 ? '成功' : rankTier(summary.status.history.maxRank) >= 5 ? '惜しい' : '不発',
    tone: rankTier(summary.status.history.maxRank) >= 6 ? 'success' : rankTier(summary.status.history.maxRank) >= 5 ? 'neutral' : 'warning',
    score: Math.round(score),
    highlightRows: [
      metric('maxRank', '最高位', rankTier(summary.status.history.maxRank), summary.maxRankLabel),
      metric('maxRankAge', '最高位到達年齢', metrics.maxRankAge, formatAge(metrics.maxRankAge), false),
      metric('firstSekitoriAge', '初関取', metrics.firstSekitoriAge, formatAge(metrics.firstSekitoriAge), false),
      metric('firstMakuuchiAge', '初入幕', metrics.firstMakuuchiAge, formatAge(metrics.firstMakuuchiAge), false),
      metric('firstSanyakuAge', '初三役以上', metrics.firstSanyakuAge, formatAge(metrics.firstSanyakuAge), false),
    ],
    reasonLines: [
      `最高位は${summary.maxRankLabel}。`,
      metrics.firstMakuuchiAge !== null ? `${metrics.firstMakuuchiAge}歳で幕内に届いた。` : '幕内には届かなかった。',
    ],
  };
};

const compareNumber = (left: number | null, right: number | null, higherIsBetter = true): 'left' | 'right' | 'tie' | 'none' => {
  if (left === null || right === null) return 'none';
  if (Math.abs(left - right) < 0.0001) return 'tie';
  return higherIsBetter ? (left > right ? 'left' : 'right') : (left < right ? 'left' : 'right');
};

export const buildCareerComparisonSummary = (
  left: CareerAnalysisSummary,
  right: CareerAnalysisSummary,
): CareerComparisonSummary => {
  const rows: CareerComparisonMetric[] = [
    {
      key: 'maxRank',
      label: '最高位',
      left: left.maxRankLabel,
      right: right.maxRankLabel,
      winner: compareNumber(rankTier(left.status.history.maxRank), rankTier(right.status.history.maxRank)),
    },
    {
      key: 'record',
      label: '通算',
      left: `${left.status.history.totalWins}勝${left.status.history.totalLosses}敗${left.status.history.totalAbsent ? `${left.status.history.totalAbsent}休` : ''}`,
      right: `${right.status.history.totalWins}勝${right.status.history.totalLosses}敗${right.status.history.totalAbsent ? `${right.status.history.totalAbsent}休` : ''}`,
      winner: compareNumber(left.metrics.winRate, right.metrics.winRate),
    },
    { key: 'winRate', label: '勝率', left: formatRate(left.metrics.winRate), right: formatRate(right.metrics.winRate), winner: compareNumber(left.metrics.winRate, right.metrics.winRate) },
    { key: 'firstSekitoriAge', label: '初十両年齢', left: formatAge(left.metrics.firstSekitoriAge), right: formatAge(right.metrics.firstSekitoriAge), winner: compareNumber(left.metrics.firstSekitoriAge, right.metrics.firstSekitoriAge, false) },
    { key: 'firstMakuuchiAge', label: '初入幕年齢', left: formatAge(left.metrics.firstMakuuchiAge), right: formatAge(right.metrics.firstMakuuchiAge), winner: compareNumber(left.metrics.firstMakuuchiAge, right.metrics.firstMakuuchiAge, false) },
    { key: 'maxRankAge', label: '最高位到達年齢', left: formatAge(left.metrics.maxRankAge), right: formatAge(right.metrics.maxRankAge), winner: compareNumber(left.metrics.maxRankAge, right.metrics.maxRankAge, false) },
    { key: 'makuuchiBasho', label: '幕内在位', left: formatCount(left.metrics.makuuchiBasho, '場所'), right: formatCount(right.metrics.makuuchiBasho, '場所'), winner: compareNumber(left.metrics.makuuchiBasho, right.metrics.makuuchiBasho) },
    { key: 'sekitoriBasho', label: '関取在位', left: formatCount(left.metrics.sekitoriBasho, '場所'), right: formatCount(right.metrics.sekitoriBasho, '場所'), winner: compareNumber(left.metrics.sekitoriBasho, right.metrics.sekitoriBasho) },
    { key: 'sanyakuBasho', label: '三役以上在位', left: formatCount(left.metrics.sanyakuBasho, '場所'), right: formatCount(right.metrics.sanyakuBasho, '場所'), winner: compareNumber(left.metrics.sanyakuBasho, right.metrics.sanyakuBasho) },
    { key: 'yusho', label: '優勝', left: formatCount(left.metrics.yushoTotal, '回'), right: formatCount(right.metrics.yushoTotal, '回'), winner: compareNumber(left.metrics.yushoTotal, right.metrics.yushoTotal) },
    { key: 'junYusho', label: '準優勝', left: formatCount(left.metrics.junYushoTotal, '回'), right: formatCount(right.metrics.junYushoTotal, '回'), winner: compareNumber(left.metrics.junYushoTotal, right.metrics.junYushoTotal) },
    { key: 'injury', label: '怪我', left: formatCount(left.metrics.injuryEventCount), right: formatCount(right.metrics.injuryEventCount), winner: compareNumber(left.metrics.injuryEventCount, right.metrics.injuryEventCount, false) },
    { key: 'absent', label: '休場', left: formatCount(left.metrics.absentTotal, '休'), right: formatCount(right.metrics.absentTotal, '休'), winner: compareNumber(left.metrics.absentTotal, right.metrics.absentTotal, false) },
    { key: 'peakAge', label: '全盛期年齢', left: formatAge(left.metrics.peakAge), right: formatAge(right.metrics.peakAge), winner: 'none' },
    { key: 'retirementAge', label: '引退年齢', left: `${left.status.age}歳`, right: `${right.status.age}歳`, winner: compareNumber(left.status.age, right.status.age) },
    { key: 'classification', label: '分類', left: left.classificationLabel, right: right.classificationLabel, winner: 'none' },
    {
      key: 'tags',
      label: '自動タグ',
      left: left.autoTags.map((tag) => AUTO_TAG_LABELS[tag]).join(' / ') || '-',
      right: right.autoTags.map((tag) => AUTO_TAG_LABELS[tag]).join(' / ') || '-',
      winner: 'none',
    },
  ];
  const comments: string[] = [];
  if (rankTier(left.status.history.maxRank) !== rankTier(right.status.history.maxRank)) {
    const better = rankTier(left.status.history.maxRank) > rankTier(right.status.history.maxRank) ? left : right;
    comments.push(`${better.status.shikona}は最高位で上回る。`);
  }
  if (Math.abs(left.metrics.promotionSpeedScore - right.metrics.promotionSpeedScore) >= 12) {
    const faster = left.metrics.promotionSpeedScore > right.metrics.promotionSpeedScore ? left : right;
    comments.push(`${faster.status.shikona}は出世速度の指標が高い。`);
  }
  if (Math.abs(left.metrics.stabilityScore - right.metrics.stabilityScore) >= 12) {
    const stable = left.metrics.stabilityScore > right.metrics.stabilityScore ? left : right;
    comments.push(`${stable.status.shikona}は勝ち越し率と在位の面で安定している。`);
  }
  if (Math.abs(left.metrics.turbulenceScore - right.metrics.turbulenceScore) >= 12) {
    const turbulent = left.metrics.turbulenceScore > right.metrics.turbulenceScore ? left : right;
    comments.push(`${turbulent.status.shikona}は番付変動や怪我を含めた波乱度が高い。`);
  }
  if (comments.length === 0) {
    comments.push('両者は主要指標が近く、分類より細部の場所別記録で差を読む比較になる。');
  }
  return { metrics: rows, comments: comments.slice(0, 3) };
};

const normalizeDistance = (left: number | null, right: number | null, scale: number): number => {
  if (left === null || right === null) return 0.35;
  return clamp(Math.abs(left - right) / scale, 0, 1);
};

export const calculateCareerSimilarity = (
  target: CareerAnalysisSummary,
  candidate: CareerAnalysisSummary,
): CareerSimilarityResult => {
  const distances = [
    normalizeDistance(rankTier(target.status.history.maxRank), rankTier(candidate.status.history.maxRank), 9) * 1.4,
    normalizeDistance(target.metrics.maxRankAge, candidate.metrics.maxRankAge, 14),
    normalizeDistance(target.metrics.firstSekitoriAge, candidate.metrics.firstSekitoriAge, 12),
    normalizeDistance(target.metrics.firstMakuuchiAge, candidate.metrics.firstMakuuchiAge, 12),
    normalizeDistance(target.metrics.makuuchiBasho, candidate.metrics.makuuchiBasho, 60),
    normalizeDistance(target.metrics.sekitoriBasho, candidate.metrics.sekitoriBasho, 80),
    normalizeDistance(target.metrics.winRate, candidate.metrics.winRate, 0.28),
    normalizeDistance(target.metrics.injuryEventCount, candidate.metrics.injuryEventCount, 8),
    normalizeDistance(target.metrics.totalBasho, candidate.metrics.totalBasho, 80),
    target.status.growthType === candidate.status.growthType ? 0 : 0.35,
    target.status.bodyType === candidate.status.bodyType ? 0 : 0.25,
    target.classification === candidate.classification ? 0 : 0.4,
  ];
  const avgDistance = distances.reduce((sum, value) => sum + value, 0) / distances.length;
  const score = Math.round(clamp((1 - avgDistance) * 100, 0, 100));
  const reasons: string[] = [];
  if (rankTier(target.status.history.maxRank) === rankTier(candidate.status.history.maxRank)) reasons.push('最高位帯が近い');
  if (Math.abs((target.metrics.firstMakuuchiAge ?? 99) - (candidate.metrics.firstMakuuchiAge ?? 99)) <= 2) reasons.push('初入幕年齢が近い');
  if (Math.abs(target.metrics.makuuchiBasho - candidate.metrics.makuuchiBasho) <= 8) reasons.push('幕内在位が近い');
  if (Math.abs(target.metrics.winRate - candidate.metrics.winRate) <= 0.035) reasons.push('生涯勝率が近い');
  if (Math.abs(target.metrics.turbulenceScore - candidate.metrics.turbulenceScore) <= 12) reasons.push('番付の波が似ている');
  if (target.status.growthType === candidate.status.growthType) reasons.push('成長タイプが同じ');
  if (target.status.bodyType === candidate.status.bodyType) reasons.push('体格タイプが同じ');
  if (target.classification === candidate.classification) reasons.push(`分類が同じ「${target.classificationLabel}」`);
  if (reasons.length === 0) reasons.push('複数指標の距離が比較的近い');
  return {
    targetId: target.status.shikona,
    candidateId: candidate.status.shikona,
    score,
    reasons: reasons.slice(0, 4),
  };
};

export const listSimilarCareers = (
  target: CareerAnalysisSummary,
  candidates: CareerAnalysisSummary[],
  limit = 6,
): Array<{ summary: CareerAnalysisSummary; similarity: CareerSimilarityResult }> =>
  candidates
    .filter((candidate) => candidate.status !== target.status)
    .map((candidate) => ({
      summary: candidate,
      similarity: calculateCareerSimilarity(target, candidate),
    }))
    .sort((left, right) => right.similarity.score - left.similarity.score)
    .slice(0, limit);

export const buildGenerationSummary = (
  target: CareerAnalysisSummary,
  cohort: CareerAnalysisSummary[],
  cohortKey: string,
): CareerGenerationSummary => {
  const sortedByRank = cohort
    .slice()
    .sort((left, right) => rankTier(right.status.history.maxRank) - rankTier(left.status.history.maxRank));
  const sortedByWinRate = cohort
    .slice()
    .sort((left, right) => right.metrics.winRate - left.metrics.winRate);
  const sortedByMakuuchi = cohort
    .slice()
    .sort((left, right) => right.metrics.makuuchiBasho - left.metrics.makuuchiBasho);
  const maxRankStanding = sortedByRank.findIndex((entry) => entry.status === target.status) + 1 || null;
  const winRateStanding = sortedByWinRate.findIndex((entry) => entry.status === target.status) + 1 || null;
  const makuuchiStanding = sortedByMakuuchi.findIndex((entry) => entry.status === target.status) + 1 || null;
  const makuuchiRate = cohort.length > 0
    ? cohort.filter((entry) => entry.metrics.makuuchiBasho > 0).length / cohort.length
    : 0;
  const sanyakuCount = cohort.filter((entry) => entry.metrics.sanyakuBasho > 0).length;
  const eliteCount = cohort.filter((entry) => ['横綱', '大関'].includes(entry.status.history.maxRank.name)).length;
  const notes = [
    maxRankStanding ? `最高位順位は同世代${cohort.length}人中${maxRankStanding}位。` : '最高位順位は算出できない。',
    `幕内到達率は${formatRate(makuuchiRate)}、三役到達者は${sanyakuCount}人。`,
    eliteCount > 0 ? `横綱・大関到達者が${eliteCount}人いる世代。` : '横綱・大関到達者は保存済み母集団内では未確認。',
  ];
  return {
    cohortKey,
    cohortSize: cohort.length,
    maxRankStanding,
    winRateStanding,
    makuuchiStanding,
    label: `${cohortKey}世代`,
    notes,
  };
};
