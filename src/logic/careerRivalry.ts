import {
  BashoRecord,
  CareerRivalryDigest,
  EraTitanEntry,
  NemesisEntry,
  Rank,
  RivalHeadToHeadSummary,
  RivalryEpisodeDigest,
  RikishiStatus,
  TitleBlockerEntry,
} from './models';
import { getRankValueForChart } from './ranking';

export interface HeadToHeadRowLike {
  opponentId: string;
  latestShikona: string;
  bouts: number;
  wins: number;
  losses: number;
  absences: number;
  firstSeenSeq: number;
  lastSeenSeq: number;
}

export interface BashoRecordRowLike {
  seq: number;
  year: number;
  month: number;
  entityId: string;
  entityType: 'PLAYER' | 'NPC';
  shikona: string;
  division: string;
  rankName: string;
  rankNumber?: number;
  rankSide?: 'East' | 'West';
  wins: number;
  losses: number;
  absent: number;
  titles: string[];
}

export interface PlayerBoutDetailLike {
  opponentId?: string;
  opponentShikona?: string;
  result: 'WIN' | 'LOSS' | 'ABSENT';
}

interface CareerBashoRecordsBySeqLike {
  bashoSeq: number;
  rows: BashoRecordRowLike[];
}

export interface RuntimeRivalryState {
  headToHeadRows: HeadToHeadRowLike[];
  boutsByBasho: Array<{ bashoSeq: number; bouts: PlayerBoutDetailLike[] }>;
  bashoRowsBySeq: CareerBashoRecordsBySeqLike[];
}

type TitleBlockerKind = 'TIED_FINAL' | 'DIRECT_BLOCK' | 'TITLE_RACE';

interface TitleBlockerCandidate {
  opponentId: string;
  shikona: string;
  kind: TitleBlockerKind;
  bashoSeq: number;
  bashoLabel: string;
  summary: string;
}

const EMPTY_RIVALRY_DIGEST: CareerRivalryDigest = {
  titleBlockers: [],
  eraTitans: [],
  nemesis: [],
};

const buildRankFromRow = (row: BashoRecordRowLike): Rank => ({
  division: row.division as Rank['division'],
  name: row.rankName,
  number: row.rankNumber,
  side: row.rankSide,
});

const formatBashoLabel = (year: number, month: number): string => `${year}年${month}月`;

const formatRankDisplayName = (rank: Rank): string => {
  if (rank.division === 'Maezumo') return '前相撲';
  const side = rank.side === 'West' ? '西' : rank.side === 'East' ? '東' : '';
  if (['横綱', '大関', '関脇', '小結'].includes(rank.name)) return `${side}${rank.name}`;
  return `${side}${rank.name}${rank.number || 1}枚目`;
};

const compareRankOrder = (left: Rank, right: Rank): number => {
  const valueDelta = getRankValueForChart(left) - getRankValueForChart(right);
  if (valueDelta !== 0) return valueDelta;
  const sideScore = (rank: Rank): number => (rank.side === 'East' ? 0 : rank.side === 'West' ? 1 : 2);
  return sideScore(left) - sideScore(right);
};

const resolveHeadToHeadSummary = (row?: HeadToHeadRowLike): RivalHeadToHeadSummary => ({
  bouts: row?.bouts ?? 0,
  wins: row?.wins ?? 0,
  losses: row?.losses ?? 0,
  absences: row?.absences ?? 0,
});

const findRepresentativeRank = (rows: BashoRecordRowLike[]): Rank => {
  const best = rows
    .slice()
    .sort((left, right) => compareRankOrder(buildRankFromRow(left), buildRankFromRow(right)))[0];
  return best ? buildRankFromRow(best) : { division: 'Maezumo', name: '前相撲', side: 'East', number: 1 };
};

const findFeaturedRowForSeq = (
  rows: BashoRecordRowLike[],
  seq: number,
  opponentId: string,
): BashoRecordRowLike | undefined =>
  rows.find((row) => row.seq === seq && row.entityId === opponentId);

const resolveTitleBlockerPriority = (kind: TitleBlockerKind): number => {
  if (kind === 'TIED_FINAL') return 3;
  if (kind === 'DIRECT_BLOCK') return 2;
  return 1;
};

const isPlayerUpperPhaseRecord = (record: BashoRecord): boolean =>
  record.rank.division === 'Makuuchi' && getRankValueForChart(record.rank) <= 45;

const toBashoRowsMap = (
  bashoRowsBySeq: CareerBashoRecordsBySeqLike[],
): Map<number, BashoRecordRowLike[]> => new Map(bashoRowsBySeq.map((entry) => [entry.bashoSeq, entry.rows]));

const toOpponentRowsMap = (
  bashoRowsBySeq: CareerBashoRecordsBySeqLike[],
): Map<string, BashoRecordRowLike[]> => {
  const grouped = new Map<string, BashoRecordRowLike[]>();
  for (const group of bashoRowsBySeq) {
    for (const row of group.rows) {
      if (row.entityType !== 'NPC') continue;
      const current = grouped.get(row.entityId) ?? [];
      current.push(row);
      grouped.set(row.entityId, current);
    }
  }
  return grouped;
};

const buildBashoLabelFromRows = (rows: BashoRecordRowLike[], fallbackSeq: number): string => {
  const sample = rows[0];
  if (!sample) return `第${fallbackSeq}場所`;
  return formatBashoLabel(sample.year, sample.month);
};

export const buildCareerRivalryDigest = (
  status: RikishiStatus,
  headToHeadRows: HeadToHeadRowLike[],
  boutsByBasho: Array<{ bashoSeq: number; bouts: PlayerBoutDetailLike[] }>,
  bashoRowsBySeq: CareerBashoRecordsBySeqLike[],
): CareerRivalryDigest => {
  if (!status.history.records.length || !bashoRowsBySeq.length) return EMPTY_RIVALRY_DIGEST;

  const headToHeadById = new Map(headToHeadRows.map((row) => [row.opponentId, row]));
  const boutsBySeq = new Map(boutsByBasho.map((entry) => [entry.bashoSeq, entry.bouts]));
  const bashoRowsMap = toBashoRowsMap(bashoRowsBySeq);
  const opponentRowsMap = toOpponentRowsMap(bashoRowsBySeq);
  const titleBlockerCandidates = new Map<string, TitleBlockerCandidate[]>();

  status.history.records.forEach((record, index) => {
    const bashoSeq = index + 1;
    if (!['Makuuchi', 'Juryo'].includes(record.rank.division) || record.yusho) return;

    const bashoRows = bashoRowsMap.get(bashoSeq) ?? [];
    const sameDivisionRows = bashoRows.filter((row) => row.division === record.rank.division);
    const yushoRows = sameDivisionRows.filter((row) => row.entityId !== 'PLAYER' && row.titles.includes('YUSHO'));
    if (!yushoRows.length) return;

    const bouts = boutsBySeq.get(bashoSeq) ?? [];
    for (const yushoRow of yushoRows) {
      const directBout = bouts.find((bout) => bout.opponentId === yushoRow.entityId);
      const winGap = yushoRow.wins - record.wins;
      let kind: TitleBlockerKind | null = null;
      let summary = '';

      if (directBout?.result === 'LOSS' && record.wins >= 12 && winGap === 0) {
        kind = 'TIED_FINAL';
        summary = `${formatBashoLabel(record.year, record.month)}に同星で並び、${yushoRow.shikona}が最後に賜杯を持っていった。`;
      } else if (directBout?.result === 'LOSS' && record.wins >= 11 && winGap >= 0 && winGap <= 2) {
        kind = 'DIRECT_BLOCK';
        summary = `${formatBashoLabel(record.year, record.month)}の直接対決で敗れ、${yushoRow.shikona}がそのまま優勝へ届いた。`;
      } else if (record.wins >= 11 && winGap >= 0 && winGap <= 1) {
        kind = 'TITLE_RACE';
        summary = `${formatBashoLabel(record.year, record.month)}に${record.wins}勝を挙げたが、${yushoRow.shikona}が一歩先に賜杯へ届いた。`;
      }

      if (!kind) continue;

      const next = titleBlockerCandidates.get(yushoRow.entityId) ?? [];
      next.push({
        opponentId: yushoRow.entityId,
        shikona: yushoRow.shikona,
        kind,
        bashoSeq,
        bashoLabel: formatBashoLabel(record.year, record.month),
        summary,
      });
      titleBlockerCandidates.set(yushoRow.entityId, next);
    }
  });

  const titleBlockers: TitleBlockerEntry[] = [...titleBlockerCandidates.entries()]
    .map(([opponentId, episodes]) => {
      const opponentRows = opponentRowsMap.get(opponentId) ?? [];
      const featured = episodes
        .slice()
        .sort((left, right) => {
          const priorityDelta = resolveTitleBlockerPriority(right.kind) - resolveTitleBlockerPriority(left.kind);
          if (priorityDelta !== 0) return priorityDelta;
          return right.bashoSeq - left.bashoSeq;
        })[0];
      if (!featured) return null;
      const representativeRank = findRepresentativeRank(opponentRows);
      const headToHead = resolveHeadToHeadSummary(headToHeadById.get(opponentId));
      const kindSummary =
        featured.kind === 'TIED_FINAL'
          ? '優勝争いの最終盤で立ちはだかった。'
          : featured.kind === 'DIRECT_BLOCK'
            ? '直接対決で優勝戦線から押し出した。'
            : '好成績の場所で一歩先に賜杯へ届いた。';

      return {
        opponentId,
        shikona: featured.shikona,
        representativeRank,
        representativeRankLabel: formatRankDisplayName(representativeRank),
        headToHead,
        summary: kindSummary,
        evidenceCount: episodes.length,
        featuredSeq: featured.bashoSeq,
        featuredBashoLabel: featured.bashoLabel,
        featuredReason: featured.summary,
        kind: featured.kind,
        blockedYushoCount: episodes.length,
        episodes: episodes
          .slice()
          .sort((left, right) => right.bashoSeq - left.bashoSeq)
          .map((episode) => ({
            bashoSeq: episode.bashoSeq,
            bashoLabel: episode.bashoLabel,
            summary: episode.summary,
          })),
      } satisfies TitleBlockerEntry;
    })
    .filter((entry): entry is TitleBlockerEntry => Boolean(entry))
    .sort((left, right) => {
      if (right.evidenceCount !== left.evidenceCount) return right.evidenceCount - left.evidenceCount;
      const priorityDelta = resolveTitleBlockerPriority(right.kind) - resolveTitleBlockerPriority(left.kind);
      if (priorityDelta !== 0) return priorityDelta;
      return right.featuredSeq - left.featuredSeq;
    })
    .slice(0, 4);

  const titleBlockerIds = new Set(titleBlockers.map((entry) => entry.opponentId));

  const eraTitans: EraTitanEntry[] = headToHeadRows
    .map((row) => {
      const opponentRows = opponentRowsMap.get(row.opponentId) ?? [];
      if (!opponentRows.length) return null;

      const playerOverlapSeqs: number[] = [];
      const upperOverlapSeqs: number[] = [];
      for (const opponentRow of opponentRows) {
        const playerRecord = status.history.records[opponentRow.seq - 1];
        if (!playerRecord) continue;
        if (playerRecord.rank.division === opponentRow.division) {
          playerOverlapSeqs.push(opponentRow.seq);
        }
        if (opponentRow.division === 'Makuuchi' && isPlayerUpperPhaseRecord(playerRecord)) {
          upperOverlapSeqs.push(opponentRow.seq);
        }
      }

      const overlapCount = new Set(upperOverlapSeqs).size;
      if (overlapCount < 2) return null;

      const yushoCount = opponentRows.filter(
        (entry) => entry.division === 'Makuuchi' && entry.titles.includes('YUSHO'),
      ).length;
      const ozekiYokozunaBasho = opponentRows.filter(
        (entry) => entry.division === 'Makuuchi' && (entry.rankName === '横綱' || entry.rankName === '大関'),
      ).length;
      const sameDivisionOverlapCount = new Set(playerOverlapSeqs).size;

      if (!(yushoCount >= 2 || ozekiYokozunaBasho >= 6)) return null;
      if (!(row.bouts >= 2 || sameDivisionOverlapCount >= 3)) return null;

      const featuredSeq = [...new Set(upperOverlapSeqs)]
        .sort((left, right) => right - left)
        .find((seq) => {
          const featuredRow = findFeaturedRowForSeq(opponentRows, seq, row.opponentId);
          return Boolean(featuredRow?.titles.includes('YUSHO')) || ['横綱', '大関'].includes(featuredRow?.rankName ?? '');
        }) ?? Math.max(...upperOverlapSeqs);
      const featuredRow = findFeaturedRowForSeq(opponentRows, featuredSeq, row.opponentId);
      if (!featuredRow) return null;

      const representativeRank = findRepresentativeRank(opponentRows);
      const episodes: RivalryEpisodeDigest[] = [...new Set(upperOverlapSeqs)]
        .sort((left, right) => right - left)
        .slice(0, 3)
        .map((seq) => {
          const rivalRow = findFeaturedRowForSeq(opponentRows, seq, row.opponentId);
          const bashoLabel = buildBashoLabelFromRows(bashoRowsMap.get(seq) ?? [], seq);
          const summary =
            rivalRow?.titles.includes('YUSHO')
              ? `${bashoLabel}は${rivalRow.shikona}が賜杯を抱えた。`
              : `${bashoLabel}も上位で顔を合わせた。`;
          return {
            bashoSeq: seq,
            bashoLabel,
            summary,
          };
        });

      const summary =
        yushoCount >= 2
          ? `上位在位の${overlapCount}場所で重なり、幕内優勝${yushoCount}回。この時代の主役だった。`
          : `上位在位の${overlapCount}場所で重なり、横綱・大関として${ozekiYokozunaBasho}場所を戦った。`;

      return {
        opponentId: row.opponentId,
        shikona: row.latestShikona,
        representativeRank,
        representativeRankLabel: formatRankDisplayName(representativeRank),
        headToHead: resolveHeadToHeadSummary(row),
        summary,
        evidenceCount: overlapCount,
        featuredSeq,
        featuredBashoLabel: buildBashoLabelFromRows(bashoRowsMap.get(featuredSeq) ?? [], featuredSeq),
        featuredReason:
          yushoCount >= 2
            ? `${row.latestShikona}は幕内優勝${yushoCount}回で、上位在位期に何度も前にいた。`
            : `${row.latestShikona}は横綱・大関として長く居座り、上位の壁になった。`,
        overlapCount,
        yushoCount,
        ozekiYokozunaBasho,
        episodes,
      } satisfies EraTitanEntry;
    })
    .filter((entry): entry is EraTitanEntry => Boolean(entry))
    .sort((left, right) => {
      if (right.yushoCount !== left.yushoCount) return right.yushoCount - left.yushoCount;
      if (right.ozekiYokozunaBasho !== left.ozekiYokozunaBasho) {
        return right.ozekiYokozunaBasho - left.ozekiYokozunaBasho;
      }
      return right.overlapCount - left.overlapCount;
    })
    .slice(0, 3);

  const eraTitanIds = new Set(eraTitans.map((entry) => entry.opponentId));

  const nemesis: NemesisEntry[] = headToHeadRows
    .map((row) => {
      const lossMargin = row.losses - row.wins;
      if (row.bouts < 5 || lossMargin < 3) return null;
      const opponentRows = opponentRowsMap.get(row.opponentId) ?? [];
      const sameDivisionOverlapCount = new Set(
        opponentRows
          .map((opponentRow) => {
            const playerRecord = status.history.records[opponentRow.seq - 1];
            if (!playerRecord || playerRecord.rank.division !== opponentRow.division) return null;
            return opponentRow.seq;
          })
          .filter((value): value is number => value !== null),
      ).size;
      const hasTitleBlockHistory = titleBlockerIds.has(row.opponentId);
      if (!hasTitleBlockHistory && sameDivisionOverlapCount < 2) return null;

      const representativeRank = findRepresentativeRank(opponentRows);
      const preferredSeq =
        titleBlockers.find((entry) => entry.opponentId === row.opponentId)?.featuredSeq ??
        eraTitans.find((entry) => entry.opponentId === row.opponentId)?.featuredSeq ??
        row.lastSeenSeq;
      const featuredSeq = preferredSeq;
      const featuredBashoLabel = buildBashoLabelFromRows(bashoRowsMap.get(featuredSeq) ?? [], featuredSeq);
      const featuredReason = hasTitleBlockHistory
        ? `${featuredBashoLabel}の優勝争いでも立ちはだかり、通算でも苦手な相手だった。`
        : `${featuredBashoLabel}まで通算${row.wins}勝${row.losses}敗。長く壁になった。`;

      return {
        opponentId: row.opponentId,
        shikona: row.latestShikona,
        representativeRank,
        representativeRankLabel: formatRankDisplayName(representativeRank),
        headToHead: resolveHeadToHeadSummary(row),
        summary: hasTitleBlockHistory
          ? `優勝争いを阻まれたうえ、通算でも${lossMargin}差だけ負け越した。`
          : `通算${row.wins}勝${row.losses}敗。長く壁になった。`,
        evidenceCount: row.bouts,
        featuredSeq,
        featuredBashoLabel,
        featuredReason,
        lossMargin,
        sameDivisionOverlapCount,
        hasTitleBlockHistory,
        episodes: [
          {
            bashoSeq: featuredSeq,
            bashoLabel: featuredBashoLabel,
            summary: featuredReason,
          },
        ],
      } satisfies NemesisEntry;
    })
    .filter((entry): entry is NemesisEntry => Boolean(entry))
    .sort((left, right) => {
      if (Number(right.hasTitleBlockHistory) !== Number(left.hasTitleBlockHistory)) {
        return Number(right.hasTitleBlockHistory) - Number(left.hasTitleBlockHistory);
      }
      if (Number(!eraTitanIds.has(right.opponentId)) !== Number(!eraTitanIds.has(left.opponentId))) {
        return Number(!eraTitanIds.has(right.opponentId)) - Number(!eraTitanIds.has(left.opponentId));
      }
      if (right.lossMargin !== left.lossMargin) return right.lossMargin - left.lossMargin;
      return right.headToHead.bouts - left.headToHead.bouts;
    })
    .slice(0, 4);

  return {
    titleBlockers,
    eraTitans,
    nemesis,
  };
};

export const createEmptyRuntimeRivalryState = (): RuntimeRivalryState => ({
  headToHeadRows: [],
  boutsByBasho: [],
  bashoRowsBySeq: [],
});

export const appendRuntimeRivalryStep = (
  runtime: RuntimeRivalryState,
  input: {
    bashoSeq: number;
    year: number;
    month: number;
    shikona: string;
    playerRank: Rank;
    playerWins: number;
    playerLosses: number;
    playerAbsent: number;
    playerTitles: string[];
    playerBouts: PlayerBoutDetailLike[];
    npcRows: BashoRecordRowLike[];
  },
): RuntimeRivalryState => {
  const headToHeadById = new Map(runtime.headToHeadRows.map((row) => [row.opponentId, { ...row }]));
  for (const bout of input.playerBouts) {
    if (!bout.opponentId) continue;
    const existing = headToHeadById.get(bout.opponentId);
    if (!existing) {
      headToHeadById.set(bout.opponentId, {
        opponentId: bout.opponentId,
        latestShikona: bout.opponentShikona ?? bout.opponentId,
        bouts: 1,
        wins: bout.result === 'WIN' ? 1 : 0,
        losses: bout.result === 'LOSS' ? 1 : 0,
        absences: bout.result === 'ABSENT' ? 1 : 0,
        firstSeenSeq: input.bashoSeq,
        lastSeenSeq: input.bashoSeq,
      });
      continue;
    }
    existing.bouts += 1;
    if (bout.result === 'WIN') existing.wins += 1;
    if (bout.result === 'LOSS') existing.losses += 1;
    if (bout.result === 'ABSENT') existing.absences += 1;
    existing.firstSeenSeq = Math.min(existing.firstSeenSeq, input.bashoSeq);
    existing.lastSeenSeq = Math.max(existing.lastSeenSeq, input.bashoSeq);
    if (bout.opponentShikona) existing.latestShikona = bout.opponentShikona;
  }

  const playerRow: BashoRecordRowLike = {
    seq: input.bashoSeq,
    year: input.year,
    month: input.month,
    entityId: 'PLAYER',
    entityType: 'PLAYER',
    shikona: input.shikona,
    division: input.playerRank.division,
    rankName: input.playerRank.name,
    rankNumber: input.playerRank.number,
    rankSide: input.playerRank.side,
    wins: input.playerWins,
    losses: input.playerLosses,
    absent: input.playerAbsent,
    titles: [...input.playerTitles],
  };

  return {
    headToHeadRows: [...headToHeadById.values()].sort((left, right) => {
      if (right.bouts !== left.bouts) return right.bouts - left.bouts;
      return right.lastSeenSeq - left.lastSeenSeq;
    }),
    boutsByBasho: [...runtime.boutsByBasho, { bashoSeq: input.bashoSeq, bouts: input.playerBouts.map((bout) => ({ ...bout })) }],
    bashoRowsBySeq: [...runtime.bashoRowsBySeq, { bashoSeq: input.bashoSeq, rows: [playerRow, ...input.npcRows.map((row) => ({ ...row }))] }],
  };
};
