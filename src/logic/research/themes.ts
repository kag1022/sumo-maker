import { RikishiStatus } from '../models';
import { getRankValue } from '../ranking';

export interface ResearchThemeDefinition {
  id: string;
  title: string;
  description: string;
  rewardPoints: number;
  evaluate: (status: RikishiStatus) => boolean;
}

const nonMaezumoRecords = (status: RikishiStatus) =>
  status.history.records.filter((record) => record.rank.division !== 'Maezumo');

const reachedSekitori = (status: RikishiStatus): boolean =>
  status.history.maxRank.division === 'Makuuchi' || status.history.maxRank.division === 'Juryo';

const updatedMaxRankAfterAge = (status: RikishiStatus, age: number): boolean => {
  const records = nonMaezumoRecords(status);
  let bestValue = Number.POSITIVE_INFINITY;
  return records.some((record, index) => {
    const rankValue = getRankValue(record.rank);
    const improved = rankValue < bestValue;
    bestValue = Math.min(bestValue, rankValue);
    const estimatedAge = status.entryAge + Math.floor(index / 6);
    return improved && estimatedAge >= age;
  });
};

export const RESEARCH_THEMES: ResearchThemeDefinition[] = [
  {
    id: 'small-body-sekitori',
    title: '小兵の粘り',
    description: '軽量またはソップ型の力士が関取へ届く人生を観測する。',
    rewardPoints: 8,
    evaluate: (status) =>
      reachedSekitori(status) &&
      (status.bodyType === 'SOPPU' || status.bodyMetrics.weightKg < 130),
  },
  {
    id: 'late-peak',
    title: '晩成の証明',
    description: '30歳以降に最高位を更新する人生を観測する。',
    rewardPoints: 8,
    evaluate: (status) => updatedMaxRankAfterAge(status, 30),
  },
  {
    id: 'injury-comeback',
    title: '波乱の人生',
    description: '大きな怪我を越えて、再び番付を上げる人生を観測する。',
    rewardPoints: 8,
    evaluate: (status) =>
      (
        status.history.highlightEvents?.some((event) => event.tag === 'MAJOR_INJURY') ||
        status.history.events.some((event) => event.type === 'INJURY')
      ) &&
      updatedMaxRankAfterAge(status, 24),
  },
  {
    id: 'memorable-not-elite',
    title: '記録より記憶',
    description: '総評点だけでは測れない記録バッジの多い人生を観測する。',
    rewardPoints: 8,
    evaluate: (status) =>
      status.history.maxRank.name !== '横綱' &&
      status.history.yushoCount.makuuchi === 0 &&
      (status.history.highlightEvents?.length ?? 0) >= 4,
  },
  {
    id: 'unfinished-talent',
    title: '未完の大器',
    description: '高い素質を持ちながら、幕内へ届かず終わる人生を観測する。',
    rewardPoints: 8,
    evaluate: (status) =>
      (status.aptitudeTier === 'S' || status.aptitudeTier === 'A') &&
      status.history.maxRank.division !== 'Makuuchi',
  },
];

export const evaluateResearchThemes = (status: RikishiStatus): ResearchThemeDefinition[] =>
  RESEARCH_THEMES.filter((theme) => theme.evaluate(status));
