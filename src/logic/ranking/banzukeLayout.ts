import { Rank } from '../models';

export interface MakuuchiLayout {
  yokozuna: number;
  ozeki: number;
  sekiwake: number;
  komusubi: number;
  maegashira: number;
  sekiwakeOverflow: boolean;
  komusubiOverflow: boolean;
  sekiwakeCap: number;
  komusubiCap: number;
}

export const MAKUUCHI_CAPACITY = 42;
export const JURYO_CAPACITY = 28;

export const SANYAKU_CAP = {
  sekiwake: 5,
  komusubi: 4,
} as const;

export const SANYAKU_MIN = {
  sekiwake: 2,
  komusubi: 2,
} as const;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const DEFAULT_MAKUUCHI_LAYOUT: MakuuchiLayout = {
  yokozuna: 2,
  ozeki: 2,
  sekiwake: 2,
  komusubi: 2,
  maegashira: MAKUUCHI_CAPACITY - 8,
  sekiwakeOverflow: false,
  komusubiOverflow: false,
  sekiwakeCap: SANYAKU_CAP.sekiwake,
  komusubiCap: SANYAKU_CAP.komusubi,
};

const toOrderIndex = (rank: Rank): number => {
  const number = Math.max(1, rank.number || 1);
  const sideOffset = rank.side === 'West' ? 1 : 0;
  return (number - 1) * 2 + sideOffset;
};

const fromOrderIndex = (index: number): { side: 'East' | 'West'; number: number } => ({
  side: index % 2 === 0 ? 'East' : 'West',
  number: Math.floor(index / 2) + 1,
});

const normalizeLayout = (layout: Partial<MakuuchiLayout>): MakuuchiLayout => {
  const yokozuna = Math.max(0, Math.floor(layout.yokozuna ?? DEFAULT_MAKUUCHI_LAYOUT.yokozuna));
  const ozeki = Math.max(0, Math.floor(layout.ozeki ?? DEFAULT_MAKUUCHI_LAYOUT.ozeki));
  const sekiwake = Math.max(0, Math.floor(layout.sekiwake ?? DEFAULT_MAKUUCHI_LAYOUT.sekiwake));
  const komusubi = Math.max(0, Math.floor(layout.komusubi ?? DEFAULT_MAKUUCHI_LAYOUT.komusubi));
  const top = yokozuna + ozeki + sekiwake + komusubi;
  const maegashira = Math.max(0, MAKUUCHI_CAPACITY - top);
  return {
    yokozuna,
    ozeki,
    sekiwake,
    komusubi,
    maegashira,
    sekiwakeOverflow: layout.sekiwakeOverflow ?? false,
    komusubiOverflow: layout.komusubiOverflow ?? false,
    sekiwakeCap: layout.sekiwakeCap ?? SANYAKU_CAP.sekiwake,
    komusubiCap: layout.komusubiCap ?? SANYAKU_CAP.komusubi,
  };
};

export const buildMakuuchiLayoutFromRanks = (ranks: Rank[]): MakuuchiLayout => {
  const inMakuuchi = ranks.filter((rank) => rank.division === 'Makuuchi');
  if (!inMakuuchi.length) {
    return DEFAULT_MAKUUCHI_LAYOUT;
  }
  const byName = inMakuuchi.reduce<Record<string, number>>((acc, rank) => {
    acc[rank.name] = (acc[rank.name] || 0) + 1;
    return acc;
  }, {});
  const layout = normalizeLayout({
    yokozuna: byName['横綱'] ?? 0,
    ozeki: byName['大関'] ?? 0,
    sekiwake: byName['関脇'] ?? SANYAKU_MIN.sekiwake,
    komusubi: byName['小結'] ?? SANYAKU_MIN.komusubi,
  });
  return layout;
};

export const decodeMakuuchiRankFromScore = (
  rankScore: number,
  rawLayout: MakuuchiLayout = DEFAULT_MAKUUCHI_LAYOUT,
): Rank => {
  const layout = normalizeLayout(rawLayout);
  const bounded = clamp(rankScore, 1, MAKUUCHI_CAPACITY);
  let cursor = 1;

  if (bounded < cursor + layout.yokozuna) {
    const idx = bounded - cursor;
    const order = fromOrderIndex(idx);
    return { division: 'Makuuchi', name: '横綱', side: order.side, number: order.number };
  }
  cursor += layout.yokozuna;

  if (bounded < cursor + layout.ozeki) {
    const idx = bounded - cursor;
    const order = fromOrderIndex(idx);
    return { division: 'Makuuchi', name: '大関', side: order.side, number: order.number };
  }
  cursor += layout.ozeki;

  if (bounded < cursor + layout.sekiwake) {
    const idx = bounded - cursor;
    const order = fromOrderIndex(idx);
    return { division: 'Makuuchi', name: '関脇', side: order.side, number: order.number };
  }
  cursor += layout.sekiwake;

  if (bounded < cursor + layout.komusubi) {
    const idx = bounded - cursor;
    const order = fromOrderIndex(idx);
    return { division: 'Makuuchi', name: '小結', side: order.side, number: order.number };
  }
  cursor += layout.komusubi;

  const idx = bounded - cursor;
  const order = fromOrderIndex(idx);
  return {
    division: 'Makuuchi',
    name: '前頭',
    side: order.side,
    number: order.number,
  };
};

export const encodeMakuuchiRankToScore = (
  rank: Rank,
  rawLayout: MakuuchiLayout = DEFAULT_MAKUUCHI_LAYOUT,
): number => {
  const layout = normalizeLayout(rawLayout);
  const sectionStarts = {
    yokozuna: 1,
    ozeki: 1 + layout.yokozuna,
    sekiwake: 1 + layout.yokozuna + layout.ozeki,
    komusubi: 1 + layout.yokozuna + layout.ozeki + layout.sekiwake,
    maegashira: 1 + layout.yokozuna + layout.ozeki + layout.sekiwake + layout.komusubi,
  };

  if (rank.name === '横綱') {
    return clamp(sectionStarts.yokozuna + toOrderIndex(rank), 1, MAKUUCHI_CAPACITY);
  }
  if (rank.name === '大関') {
    return clamp(sectionStarts.ozeki + toOrderIndex(rank), 1, MAKUUCHI_CAPACITY);
  }
  if (rank.name === '関脇') {
    return clamp(sectionStarts.sekiwake + toOrderIndex(rank), 1, MAKUUCHI_CAPACITY);
  }
  if (rank.name === '小結') {
    return clamp(sectionStarts.komusubi + toOrderIndex(rank), 1, MAKUUCHI_CAPACITY);
  }
  return clamp(sectionStarts.maegashira + toOrderIndex(rank), 1, MAKUUCHI_CAPACITY);
};

export const resolveTopDivisionRankValueFromRank = (rank: Rank): number => {
  if (rank.division === 'Juryo') return 6;
  if (rank.division !== 'Makuuchi') return 7;
  if (rank.name === '横綱') return 1;
  if (rank.name === '大関') return 2;
  if (rank.name === '関脇' || rank.name === '小結') return 3;
  return (rank.number || 99) <= 2 ? 4 : 5;
};
