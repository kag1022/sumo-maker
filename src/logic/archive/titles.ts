import type { RikishiStatus } from '../models';
import type { ArchiveCategoryId, CareerTitle } from './types';

export const judgeCareerTitles = (
  finalStatus: RikishiStatus,
  categories: ArchiveCategoryId[],
): CareerTitle[] => {
  const set = new Set(categories);
  const out: CareerTitle[] = [];

  // Always granted to anyone who completed a career past Maezumo.
  const reachedDohyo = finalStatus.history.records.some((r) => r.rank.division !== 'Maezumo');
  if (reachedDohyo) {
    out.push({
      id: 'first_step',
      label: '土俵に刻んだ一歩',
      tier: 'common',
      reason: '前相撲を超え、本場所の土俵に立った。',
    });
  }

  if (set.has('sandanme_challenger')) {
    out.push({
      id: 'sandanme_challenger',
      label: '三段目の挑戦者',
      tier: 'common',
      reason: '三段目に到達した。',
    });
  }

  if (set.has('makushita_wall') || set.has('wall_juryo')) {
    out.push({
      id: 'makushita_challenger',
      label: '幕下の壁に挑んだ者',
      tier: 'uncommon',
      reason: '幕下〜十両の壁を長く相手にした。',
    });
  }

  if (set.has('sekitori_reached')) {
    out.push({
      id: 'sekitori_reached',
      label: '関取到達者',
      tier: 'rare',
      reason: '十両以上に到達した。',
    });
  }

  if (set.has('makuuchi_reached')) {
    out.push({
      id: 'makuuchi_reached',
      label: '幕内の土俵に立った者',
      tier: 'rare',
      reason: '幕内に到達した。',
    });
  }

  if (set.has('sanyaku_reached')) {
    out.push({
      id: 'sanyaku_reached',
      label: '三役の扉を開いた者',
      tier: 'epic',
      reason: '三役（小結以上）に到達した。',
    });
  }

  // Ozeki — derived directly from finalStatus maxRank since we don't have a category for it alone.
  if (finalStatus.history.maxRank.name === '大関' || finalStatus.history.maxRank.name === '横綱') {
    out.push({
      id: 'ozeki_reached',
      label: '大関まで駆け上がった者',
      tier: 'epic',
      reason: '大関に到達した。',
    });
  }

  if (set.has('yokozuna_reached')) {
    out.push({
      id: 'yokozuna_reached',
      label: '綱を張った者',
      tier: 'legendary',
      reason: '横綱に昇進した。',
    });
  }

  return out;
};
