import type { BashoRecord, RikishiStatus } from '../models';
import type { CareerRow } from '../persistence/db';
import type {
  ArchiveCategoryDefinition,
  ArchiveCategoryId,
} from './types';

// 12 MVP archive categories.
// Threshold notes (any deviation from prompts.md is documented inline).
export const ARCHIVE_CATEGORIES: Record<ArchiveCategoryId, ArchiveCategoryDefinition> = {
  sandanme_challenger: { id: 'sandanme_challenger', label: '三段目の挑戦者', description: '三段目に到達した。' },
  makushita_wall: { id: 'makushita_wall', label: '幕下の壁', description: '幕下に長く在位したが十両に届かなかった。' },
  sekitori_reached: { id: 'sekitori_reached', label: '関取到達', description: '十両以上に到達した。' },
  makuuchi_reached: { id: 'makuuchi_reached', label: '幕内到達', description: '幕内に到達した。' },
  sanyaku_reached: { id: 'sanyaku_reached', label: '三役到達', description: '小結以上に到達した。' },
  yokozuna_reached: { id: 'yokozuna_reached', label: '横綱到達', description: '横綱に昇進した。' },
  wall_juryo: { id: 'wall_juryo', label: '十両の壁', description: '十両に長く在位したが幕内に届かなかった。' },
  wall_makuuchi: { id: 'wall_makuuchi', label: '幕内の壁', description: '幕内に長く在位したが三役に届かなかった。' },
  wall_sanyaku: { id: 'wall_sanyaku', label: '三役の壁', description: '三役に在位したが大関に届かなかった。' },
  fast_riser: { id: 'fast_riser', label: '快進撃', description: '十両/幕内へ短期間で駆け上がった。' },
  late_bloomer: { id: 'late_bloomer', label: '晩成', description: '高齢で最高位を更新した、または LATE 成長型。' },
  long_stagnation: { id: 'long_stagnation', label: '長期停滞', description: '同じ番付帯に長く滞在した。' },
};

const SANYAKU_NAMES = new Set(['横綱', '大関', '関脇', '小結']);
const OZEKI_OR_HIGHER = new Set(['横綱', '大関']);

const countDivision = (records: BashoRecord[], division: string): number =>
  records.filter((r) => r.rank.division === division).length;

const reachedDivision = (records: BashoRecord[], division: string): boolean =>
  records.some((r) => r.rank.division === division);

const reachedSanyaku = (records: BashoRecord[]): boolean =>
  records.some((r) => SANYAKU_NAMES.has(r.rank.name));

const reachedOzeki = (records: BashoRecord[]): boolean =>
  records.some((r) => OZEKI_OR_HIGHER.has(r.rank.name));

const reachedYokozuna = (records: BashoRecord[]): boolean =>
  records.some((r) => r.rank.name === '横綱');

const countSanyaku = (records: BashoRecord[]): number =>
  records.filter((r) => SANYAKU_NAMES.has(r.rank.name)).length;

const findFirstIndex = (records: BashoRecord[], pred: (r: BashoRecord) => boolean): number =>
  records.findIndex(pred);

export const judgeArchiveCategories = (
  finalStatus: RikishiStatus,
  career?: Pick<CareerRow, 'bashoCount'> | null,
): ArchiveCategoryId[] => {
  const records = finalStatus.history.records.filter((r) => r.rank.division !== 'Maezumo');
  const result = new Set<ArchiveCategoryId>();
  const careerBashoCount = career?.bashoCount ?? records.length;

  // Reached chain
  if (reachedDivision(records, 'Sandanme')) result.add('sandanme_challenger');
  if (reachedDivision(records, 'Juryo') || reachedDivision(records, 'Makuuchi')) {
    result.add('sekitori_reached');
  }
  if (reachedDivision(records, 'Makuuchi')) result.add('makuuchi_reached');
  if (reachedSanyaku(records)) result.add('sanyaku_reached');
  if (reachedYokozuna(records)) result.add('yokozuna_reached');

  // Wall categories
  const makushitaCount = countDivision(records, 'Makushita');
  if (makushitaCount >= 10 && !reachedDivision(records, 'Juryo')) result.add('makushita_wall');

  const juryoCount = countDivision(records, 'Juryo');
  if (juryoCount >= 8 && !reachedDivision(records, 'Makuuchi')) result.add('wall_juryo');

  const makuuchiCount = countDivision(records, 'Makuuchi');
  if (makuuchiCount >= 10 && !reachedSanyaku(records)) result.add('wall_makuuchi');

  const sanyakuCount = countSanyaku(records);
  if (sanyakuCount >= 3 && !reachedOzeki(records)) result.add('wall_sanyaku');

  // Fast riser: first juryo entry within 24 basho, or first makuuchi within 36 basho.
  const firstJuryo = findFirstIndex(records, (r) => r.rank.division === 'Juryo');
  const firstMakuuchi = findFirstIndex(records, (r) => r.rank.division === 'Makuuchi');
  if ((firstJuryo >= 0 && firstJuryo + 1 <= 24) || (firstMakuuchi >= 0 && firstMakuuchi + 1 <= 36)) {
    result.add('fast_riser');
  }

  // Late bloomer: growthType LATE OR last maxRank update at age >= 28.
  // We approximate "max rank updated at age >= 28" via final maxRank not Maezumo + age >= 28
  // when no earlier same-rank achievement exists — for MVP, use growthType + age check.
  if (finalStatus.growthType === 'LATE') {
    result.add('late_bloomer');
  } else if (finalStatus.age >= 28 && reachedDivision(records, 'Juryo')) {
    // soft fallback: reached sekitori while old
    result.add('late_bloomer');
  }

  // Long stagnation: career >= 60 basho OR same division >= 20 basho.
  if (careerBashoCount >= 60) {
    result.add('long_stagnation');
  } else {
    for (const div of ['Makushita', 'Sandanme', 'Juryo', 'Makuuchi'] as const) {
      if (countDivision(records, div) >= 20) {
        result.add('long_stagnation');
        break;
      }
    }
  }

  return Array.from(result);
};

export const listArchiveCategories = (): ArchiveCategoryDefinition[] =>
  (Object.keys(ARCHIVE_CATEGORIES) as ArchiveCategoryId[]).map((id) => ARCHIVE_CATEGORIES[id]);

export const getArchiveCategory = (id: ArchiveCategoryId): ArchiveCategoryDefinition =>
  ARCHIVE_CATEGORIES[id];
