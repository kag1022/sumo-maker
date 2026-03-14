import { getRankValueForChart } from '../../../logic/ranking';
import { buildCounterfactualInjuryText, buildFantasyHooks, getStyleLabel } from '../../../logic/phaseA';
import { BashoRecord, HighlightEventTag, Rank, RikishiStatus, TimelineEvent } from '../../../logic/models';
import { PlayerBoutDetail } from '../../../logic/simulation/basho';
import type { BanzukeDecisionLog } from '../../../logic/banzuke/types';
import type { HeadToHeadRow, CareerBashoRecordsBySeq } from '../../../logic/persistence/repository';
import type { BashoRecordRow, BoutResultType } from '../../../logic/persistence/db';

const TIMELINE_EVENT_PRIORITY: Record<TimelineEvent['type'], number> = {
  YUSHO: 0,
  PROMOTION: 1,
  DEMOTION: 2,
  OTHER: 3,
  INJURY: 4,
  ENTRY: 5,
  RETIREMENT: 6,
};

const TIMELINE_EVENT_LABEL: Record<TimelineEvent['type'], string> = {
  ENTRY: '入門',
  PROMOTION: '昇進',
  DEMOTION: '陥落',
  YUSHO: '優勝',
  INJURY: '休場',
  RETIREMENT: '引退',
  OTHER: '出来事',
};

export const formatRankDisplayName = (rank: Rank): string => {
  if (rank.division === 'Maezumo') return '前相撲';
  const side = rank.side === 'West' ? '西' : rank.side === 'East' ? '東' : '';
  if (['横綱', '大関', '関脇', '小結'].includes(rank.name)) return `${side}${rank.name}`;
  return `${side}${rank.name}${rank.number || 1}枚目`;
};

export const formatBashoLabel = (year: number, month: number): string => `${year}年${month}月`;

const formatRecordText = (wins: number, losses: number, absent: number): string =>
  `${wins}勝${losses}敗${absent > 0 ? `${absent}休` : ''}`;

export const buildReportCareerRecords = (records: BashoRecord[]) =>
  records
    .map((record, index) => ({
      ...record,
      bashoSeq: index + 1,
    }))
    .filter((record) => record.rank.division !== 'Maezumo')
    .map((record, index) => ({
      ...record,
      displaySlot: index + 1,
    }));

export const buildRankChartData = (records: BashoRecord[]) => {
  const displayRecords = buildReportCareerRecords(records);
  const stride =
    displayRecords.length <= 6
      ? 1
      : displayRecords.length <= 12
        ? 2
        : displayRecords.length <= 24
          ? 4
          : Math.ceil(displayRecords.length / 6);

  return displayRecords.map((record, index) => ({
    slot: record.displaySlot,
    axisLabel:
      index === 0 || index === displayRecords.length - 1 || index % stride === 0
        ? `${record.year}.${String(record.month).padStart(2, '0')}`
        : '',
    bashoLabel: formatBashoLabel(record.year, record.month),
    rankValue: getRankValueForChart(record.rank),
    rankLabel: formatRankDisplayName(record.rank),
    weightKg: record.bodyWeightKg,
  }));
};

export const buildRankChartDataFromStatus = (status: RikishiStatus) => {
  const base = buildRankChartData(status.history.records);
  const highlightBySeq = new Map<number, Array<{ tag: HighlightEventTag; label: string }>>();
  (status.history.highlightEvents ?? []).forEach((event) => {
    const current = highlightBySeq.get(event.bashoSeq) ?? [];
    current.push(event);
    highlightBySeq.set(event.bashoSeq, current);
  });

  return base.map((point, index) => {
    const events = highlightBySeq.get(index + 1) ?? [];
    return {
      ...point,
      weightKg:
        point.weightKg ??
        status.history.bodyTimeline?.find((row) => row.bashoSeq === index + 1)?.weightKg,
      eventTags: events.map((event) => event.tag),
      eventLabel: events.map((event) => event.label).join(' / '),
    };
  });
};

export const buildHoshitoriCareerRecords = (
  records: BashoRecord[],
  boutsByBasho: Array<{ bashoSeq: number; bouts: PlayerBoutDetail[] }>,
) => {
  const boutsMap = new Map(boutsByBasho.map((row) => [row.bashoSeq, row.bouts]));
  return buildReportCareerRecords(records).map((record) => ({
    ...record,
    bouts: boutsMap.get(record.bashoSeq) ?? [],
  }));
};

export const buildTimelineEventGroups = (events: TimelineEvent[]) => {
  const grouped = new Map<string, TimelineEvent[]>();

  for (const event of events) {
    const key = `${event.year}-${event.month}`;
    const list = grouped.get(key) ?? [];
    list.push(event);
    grouped.set(key, list);
  }

  return [...grouped.entries()]
    .map(([key, groupedEvents]) => {
      const ordered = groupedEvents
        .slice()
        .sort((a, b) => TIMELINE_EVENT_PRIORITY[a.type] - TIMELINE_EVENT_PRIORITY[b.type]);
      const primaryType = ordered[0]?.type ?? 'OTHER';
      return {
        key,
        year: ordered[0]?.year ?? 0,
        month: ordered[0]?.month ?? 0,
        primaryType,
        tagLabel: TIMELINE_EVENT_LABEL[primaryType],
        descriptions: ordered.map((event) => event.description),
      };
    })
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
};

export const buildReportTimelineItems = (status: RikishiStatus) => {
  const groups = buildTimelineEventGroups(status.history.events);
  return groups.slice(0, 10).map((group) => ({
    key: group.key,
    dateLabel: formatBashoLabel(group.year, group.month),
    title: group.tagLabel,
    summary: group.descriptions.join(' / '),
    tone:
      group.primaryType === 'INJURY' || group.primaryType === 'DEMOTION'
        ? 'danger'
        : group.primaryType === 'OTHER'
          ? 'neutral'
          : 'accent',
  }));
};

export const buildCareerHeadline = (status: RikishiStatus): string => {
  if (status.history.yushoCount.makuuchi > 0) {
    return `幕内優勝 ${status.history.yushoCount.makuuchi}回の軌跡`;
  }
  if (status.history.maxRank.name === '横綱') {
    return '横綱まで駆け上がった人生';
  }
  if (status.history.maxRank.division === 'Makuuchi') {
    return '幕内まで届いた人生';
  }
  if (status.history.maxRank.division === 'Juryo') {
    return '関取到達の人生';
  }
  return '下位から積み上げた人生';
};

export const buildDesignedVsRealizedLabel = (status: RikishiStatus): string => {
  const designed = status.designedStyleProfile;
  const realized = status.realizedStyleProfile;
  if (!designed && !realized) return '型未確立';
  if (!realized) return `設計型 ${designed ? getStyleLabel(designed.dominant) : '不明'} / 実戦型未確立`;
  if (!designed) return `実戦型 ${getStyleLabel(realized.dominant)}`;
  if (designed.dominant === realized.dominant) {
    return `設計型 ${getStyleLabel(designed.dominant)} と実戦型が一致`;
  }
  return `設計型 ${getStyleLabel(designed.dominant)} -> 実戦型 ${getStyleLabel(realized.dominant)}`;
};

export const buildFantasyHooksForReport = (status: RikishiStatus): string[] => buildFantasyHooks(status);

export const buildInjuryWhatIfText = (status: RikishiStatus): string | null =>
  buildCounterfactualInjuryText(status);

export type ReportTone = 'brand' | 'action' | 'state' | 'warning' | 'neutral';

export interface ReportHeroMetric {
  label: string;
  value: string;
  meta: string;
  tone: ReportTone;
}

export interface ReportHeroSummary {
  titleBadge: string;
  careerHeadline: string;
  profileFacts: string[];
  journeyLabel: string;
  narrative: string;
  caution?: string;
  pills: Array<{ label: string; tone: Exclude<ReportTone, 'action'> }>;
  metrics: ReportHeroMetric[];
}

export interface ReportSpotlightPoint {
  slot: number;
  axisLabel: string;
  bashoLabel: string;
  rankLabel: string;
  plotValue: number;
  age: number;
}

export interface ReportSpotlightEvent {
  key: string;
  slot: number;
  plotValue: number;
  bashoLabel: string;
  label: string;
  tone: ReportTone;
}

export interface ReportSpotlightPayload {
  points: ReportSpotlightPoint[];
  events: ReportSpotlightEvent[];
  peakBand?: {
    startSlot: number;
    endSlot: number;
    label: string;
  };
  note: string;
}

export interface ReportTimelineDigestItem {
  key: string;
  dateLabel: string;
  age: number;
  label: string;
  tone: Exclude<ReportTone, 'action'>;
  isMajor: boolean;
  items: string[];
}

export interface RivalHeadToHeadSummary {
  bouts: number;
  wins: number;
  losses: number;
  absences: number;
}

export interface RivalryEpisodeDigest {
  bashoSeq: number;
  bashoLabel: string;
  summary: string;
}

type TitleBlockerKind = 'TIED_FINAL' | 'DIRECT_BLOCK' | 'TITLE_RACE';

interface RivalryEntryBase {
  opponentId: string;
  shikona: string;
  representativeRank: Rank;
  representativeRankLabel: string;
  headToHead: RivalHeadToHeadSummary;
  summary: string;
  evidenceCount: number;
  featuredSeq: number;
  featuredBashoLabel: string;
  featuredReason: string;
}

export interface TitleBlockerEntry extends RivalryEntryBase {
  kind: TitleBlockerKind;
  blockedYushoCount: number;
  episodes: RivalryEpisodeDigest[];
}

export interface EraTitanEntry extends RivalryEntryBase {
  overlapCount: number;
  yushoCount: number;
  ozekiYokozunaBasho: number;
  episodes: RivalryEpisodeDigest[];
}

export interface NemesisEntry extends RivalryEntryBase {
  lossMargin: number;
  sameDivisionOverlapCount: number;
  hasTitleBlockHistory: boolean;
  episodes: RivalryEpisodeDigest[];
}

export interface CareerRivalryDigest {
  titleBlockers: TitleBlockerEntry[];
  eraTitans: EraTitanEntry[];
  nemesis: NemesisEntry[];
}

export interface ReportBanzukeRow {
  entityId: string;
  entityType: 'PLAYER' | 'NPC';
  shikona: string;
  rank: Rank;
  rankLabel: string;
  wins: number;
  losses: number;
  absent: number;
  recordText: string;
  titles: string[];
  isPlayer: boolean;
  isYushoWinner: boolean;
}

export interface ReportBanzukeSnapshot {
  seq: number;
  bashoLabel: string;
  division: Rank['division'];
  rows: ReportBanzukeRow[];
}

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

const buildRankFromRow = (row: BashoRecordRow): Rank => ({
  division: row.division as Rank['division'],
  name: row.rankName,
  number: row.rankNumber,
  side: row.rankSide,
});

const compareRankOrder = (left: Rank, right: Rank): number => {
  const valueDelta = getRankValueForChart(left) - getRankValueForChart(right);
  if (valueDelta !== 0) return valueDelta;
  const sideScore = (rank: Rank): number => (rank.side === 'East' ? 0 : rank.side === 'West' ? 1 : 2);
  return sideScore(left) - sideScore(right);
};

const compareBanzukeRows = (left: BashoRecordRow, right: BashoRecordRow): number => {
  const rankDelta = compareRankOrder(buildRankFromRow(left), buildRankFromRow(right));
  if (rankDelta !== 0) return rankDelta;
  if (left.entityType !== right.entityType) return left.entityType === 'PLAYER' ? -1 : 1;
  return left.shikona.localeCompare(right.shikona, 'ja');
};

const resolveHeadToHeadSummary = (row?: HeadToHeadRow): RivalHeadToHeadSummary => ({
  bouts: row?.bouts ?? 0,
  wins: row?.wins ?? 0,
  losses: row?.losses ?? 0,
  absences: row?.absences ?? 0,
});

const findRepresentativeRank = (rows: BashoRecordRow[]): Rank => {
  const best = rows
    .slice()
    .sort((left, right) => compareRankOrder(buildRankFromRow(left), buildRankFromRow(right)))[0];
  return best ? buildRankFromRow(best) : { division: 'Maezumo', name: '前相撲', side: 'East', number: 1 };
};

const findFeaturedRowForSeq = (
  rows: BashoRecordRow[],
  seq: number,
  opponentId: string,
): BashoRecordRow | undefined =>
  rows.find((row) => row.seq === seq && row.entityId === opponentId);

const resolveTitleBlockerPriority = (kind: TitleBlockerKind): number => {
  if (kind === 'TIED_FINAL') return 3;
  if (kind === 'DIRECT_BLOCK') return 2;
  return 1;
};

const isPlayerUpperPhaseRecord = (record: BashoRecord): boolean =>
  record.rank.division === 'Makuuchi' && getRankValueForChart(record.rank) <= 45;

const toBashoRowsMap = (
  bashoRowsBySeq: CareerBashoRecordsBySeq[],
): Map<number, BashoRecordRow[]> => new Map(bashoRowsBySeq.map((entry) => [entry.bashoSeq, entry.rows]));

const toOpponentRowsMap = (
  bashoRowsBySeq: CareerBashoRecordsBySeq[],
): Map<string, BashoRecordRow[]> => {
  const grouped = new Map<string, BashoRecordRow[]>();
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

const buildBashoLabelFromRows = (rows: BashoRecordRow[], fallbackSeq: number): string => {
  const sample = rows[0];
  if (!sample) return `第${fallbackSeq}場所`;
  return formatBashoLabel(sample.year, sample.month);
};

const resolveBoutResultMark = (result?: BoutResultType): string | null => {
  if (result === 'WIN') return '○';
  if (result === 'LOSS') return '●';
  if (result === 'ABSENT') return 'や';
  return null;
};

const dedupeStrings = (values: string[]): string[] => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const truncateReportLabel = (value: string, max = 13): string =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

const resolveSpotlightToneFromTag = (tag: HighlightEventTag): ReportTone => {
  if (tag === 'MAJOR_INJURY' || tag === 'JURYO_DROP' || tag === 'RETIREMENT') return 'warning';
  if (tag === 'YUSHO' || tag === 'FIRST_SEKITORI' || tag === 'PROMOTION' || tag === 'KINBOSHI') return 'state';
  return 'brand';
};

const resolveTimelineTone = (type: TimelineEvent['type']): Exclude<ReportTone, 'action'> => {
  if (type === 'YUSHO' || type === 'PROMOTION') return 'state';
  if (type === 'INJURY' || type === 'DEMOTION' || type === 'RETIREMENT') return 'warning';
  if (type === 'ENTRY') return 'brand';
  return 'neutral';
};

const resolvePeakBand = (
  status: RikishiStatus,
  points: ReportSpotlightPoint[],
): ReportSpotlightPayload['peakBand'] => {
  if (points.length < 3) return undefined;

  if (status.genome) {
    const startAge = Math.max(status.entryAge, Math.round(status.genome.growth.maturationAge));
    const endAge = Math.max(startAge, Math.round(startAge + status.genome.growth.peakLength - 1));
    const inRange = points.filter((point) => point.age >= startAge && point.age <= endAge);
    if (inRange.length > 0) {
      return {
        startSlot: inRange[0].slot,
        endSlot: inRange[inRange.length - 1].slot,
        label: `ピーク期 ${startAge}-${endAge}歳`,
      };
    }
  }

  const bestPoint = points.reduce((best, point) => (point.plotValue > best.plotValue ? point : best), points[0]);
  return {
    startSlot: Math.max(points[0].slot, bestPoint.slot - 1),
    endSlot: Math.min(points[points.length - 1].slot, bestPoint.slot + 1),
    label: '最高位帯',
  };
};

export const buildReportHeroSummary = (status: RikishiStatus): ReportHeroSummary => {
  const { history } = status;
  const totalBashoCount = history.records.length;
  const totalDecisions = history.totalWins + history.totalLosses;
  const winRate = totalDecisions > 0 ? (history.totalWins / totalDecisions) * 100 : 0;
  const makuuchiRecords = history.records.filter((record) => record.rank.division === 'Makuuchi');
  const makuuchiWinRate =
    makuuchiRecords.reduce((sum, record) => sum + record.wins + record.losses, 0) > 0
      ? (
          (makuuchiRecords.reduce((sum, record) => sum + record.wins, 0) /
            makuuchiRecords.reduce((sum, record) => sum + record.wins + record.losses, 0)) *
          100
        ).toFixed(1)
      : null;
  const lowerTitles = history.yushoCount.juryo + history.yushoCount.makushita + history.yushoCount.others;
  const sanshoCount = history.records.reduce(
    (sum, record) => sum + (record.specialPrizes?.length ?? 0),
    0,
  );
  const kinboshi = history.records.reduce((sum, record) => sum + (record.kinboshi ?? 0), 0);
  const profileFacts = [
    status.profile?.realName || '本名未設定',
    status.profile?.birthplace || '出身地未設定',
    `${Math.round(status.bodyMetrics?.heightCm || 0)}cm / ${Math.round(status.bodyMetrics?.weightKg || 0)}kg`,
  ];
  const pills: ReportHeroSummary['pills'] = [];

  if (history.maxRank.division === 'Makuuchi') pills.push({ label: '幕内到達', tone: 'state' });
  else if (history.maxRank.division === 'Juryo') pills.push({ label: '関取到達', tone: 'state' });
  else pills.push({ label: '下位から積み上げ', tone: 'brand' });

  if (history.yushoCount.makuuchi > 0) pills.push({ label: `幕内優勝 ${history.yushoCount.makuuchi}回`, tone: 'state' });
  if (history.totalAbsent > 0 || (status.injuries?.length ?? 0) > 0) pills.push({ label: '休場記録あり', tone: 'warning' });
  if (history.careerTurningPoint?.reason) pills.push({ label: '転機あり', tone: 'neutral' });

  const caution =
    totalBashoCount <= 3
      ? 'まだ山場の少ない力士人生です。番付の傾きと各場所の勝敗を中心に読む段階です。'
      : history.totalAbsent > 0
        ? `休場 ${history.totalAbsent} を含む波のある経歴です。好不調の切り替わりもあわせて確認してください。`
        : undefined;

  return {
    titleBadge: history.title || '無名の力士',
    careerHeadline: buildCareerHeadline(status),
    profileFacts,
    journeyLabel: `${status.entryAge}歳入門 - ${status.age}歳引退 / ${totalBashoCount}場所`,
    narrative:
      history.careerTurningPoint?.reason ||
      (makuuchiRecords.length > 0
        ? `幕内では ${makuuchiRecords.length}場所を過ごし、勝率 ${makuuchiWinRate ?? '0.0'}% を記録しました。`
        : '大舞台よりも、一場所ごとの積み上げが印象に残る力士人生です。'),
    caution,
    pills,
    metrics: [
      {
        label: '最高位',
        value: formatRankDisplayName(history.maxRank),
        meta: `${totalBashoCount}場所を完走`,
        tone: 'brand',
      },
      {
        label: '通算勝率',
        value: `${winRate.toFixed(1)}%`,
        meta: `${history.totalWins}勝 ${history.totalLosses}敗${history.totalAbsent > 0 ? ` ${history.totalAbsent}休` : ''}`,
        tone: winRate >= 50 ? 'state' : 'neutral',
      },
      {
        label: '幕内在位',
        value: `${makuuchiRecords.length}場所`,
        meta:
          makuuchiRecords.length > 0
            ? `${makuuchiRecords.reduce((sum, record) => sum + record.wins, 0)}勝 ${makuuchiRecords.reduce((sum, record) => sum + record.losses, 0)}敗`
            : '幕内経験なし',
        tone: makuuchiRecords.length > 0 ? 'state' : 'neutral',
      },
      {
        label: '優勝',
        value: `${history.yushoCount.makuuchi}回`,
        meta: lowerTitles > 0 ? `十両以下 ${lowerTitles}回` : '下位優勝なし',
        tone: history.yushoCount.makuuchi > 0 ? 'state' : 'neutral',
      },
      {
        label: '金星 / 三賞',
        value: `${kinboshi} / ${sanshoCount}`,
        meta: sanshoCount > 0 ? '勝負強さを示す勲章あり' : '表彰なし',
        tone: kinboshi + sanshoCount > 0 ? 'action' : 'neutral',
      },
    ],
  };
};

export const buildReportSpotlightPayload = (
  status: RikishiStatus,
  entryAge: number,
): ReportSpotlightPayload => {
  const displayRecords = buildReportCareerRecords(status.history.records);
  const chartPoints = buildRankChartDataFromStatus(status);
  const baseYear = displayRecords[0]?.year ?? new Date().getFullYear();
  const points = chartPoints.map((point, index) => ({
    slot: point.slot,
    axisLabel: point.axisLabel,
    bashoLabel: point.bashoLabel,
    rankLabel: point.rankLabel,
    plotValue: -1 * point.rankValue,
    age: entryAge + Math.max(0, (displayRecords[index]?.year ?? baseYear) - baseYear),
  }));

  if (points.length <= 1) {
    return {
      points,
      events: [],
      note: '前相撲を除く番付記録が少ないため、まだ推移よりも個別結果の読み取りが中心です。',
    };
  }

  const eventMap = new Map<number, ReportSpotlightEvent>();
  (status.history.highlightEvents ?? []).forEach((event) => {
    const point = points[event.bashoSeq - 1];
    if (!point) return;
    const current = eventMap.get(event.bashoSeq);
    const next: ReportSpotlightEvent = {
      key: `highlight-${event.bashoSeq}-${event.tag}`,
      slot: point.slot,
      plotValue: point.plotValue,
      bashoLabel: point.bashoLabel,
      label: truncateReportLabel(event.label),
      tone: resolveSpotlightToneFromTag(event.tag),
    };
    if (!current || current.tone === 'brand') {
      eventMap.set(event.bashoSeq, next);
    }
  });

  if (status.history.careerTurningPoint) {
    const turningPoint = status.history.careerTurningPoint;
    const point = points[turningPoint.bashoSeq - 1];
    if (point) {
      eventMap.set(turningPoint.bashoSeq, {
        key: `turning-${turningPoint.bashoSeq}`,
        slot: point.slot,
        plotValue: point.plotValue,
        bashoLabel: point.bashoLabel,
        label: truncateReportLabel(turningPoint.reason, 12),
        tone: turningPoint.severity >= 3 ? 'warning' : 'brand',
      });
    }
  }

  if (eventMap.size === 0) {
    displayRecords.forEach((record, index) => {
      if (!record.yusho && record.absent < 5) return;
      const point = points[index];
      if (!point) return;
      eventMap.set(record.bashoSeq, {
        key: `record-${record.bashoSeq}`,
        slot: point.slot,
        plotValue: point.plotValue,
        bashoLabel: point.bashoLabel,
        label: record.yusho ? '優勝' : truncateReportLabel(`${record.absent}休`, 8),
        tone: record.yusho ? 'state' : 'warning',
      });
    });
  }

  const events = [...eventMap.values()]
    .sort((a, b) => a.slot - b.slot)
    .slice(0, 6);

  const note =
    points.length <= 3
      ? 'まだ山場の少ない力士人生です。大きな事件より、最初の昇降格に注目してください。'
      : events.length === 0
        ? '主要な転機が少ないため、番付の積み上がりそのものを読むキャリアです。'
        : '優勝、昇進、怪我などの主要な転機だけを重ねています。細部は転機の履歴で確認できます。';

  return {
    points,
    events,
    peakBand: resolvePeakBand(status, points),
    note,
  };
};

export const buildReportTimelineDigest = (
  events: TimelineEvent[],
  entryAge: number,
): ReportTimelineDigestItem[] => {
  const groups = buildTimelineEventGroups(events);
  const startYear = events.find((event) => event.type === 'ENTRY')?.year ?? events[0]?.year ?? 0;

  return groups.map((group) => {
    const descriptions = dedupeStrings(group.descriptions);
    const isMajor =
      group.primaryType === 'YUSHO' ||
      group.primaryType === 'PROMOTION' ||
      group.primaryType === 'RETIREMENT' ||
      (group.primaryType === 'INJURY' && descriptions.some((description) => description.includes('全治'))) ||
      descriptions.some((description) => description.includes('十両') || description.includes('幕内') || description.includes('横綱'));

    return {
      key: group.key,
      dateLabel: formatBashoLabel(group.year, group.month),
      age: entryAge + Math.max(0, group.year - startYear),
      label: group.tagLabel,
      tone: resolveTimelineTone(group.primaryType),
      isMajor,
      items: descriptions,
    };
  });
};

export const buildCareerRivalryDigest = (
  status: RikishiStatus,
  headToHeadRows: HeadToHeadRow[],
  boutsByBasho: Array<{ bashoSeq: number; bouts: PlayerBoutDetail[] }>,
  bashoRowsBySeq: CareerBashoRecordsBySeq[],
  _banzukeDecisionLogs: BanzukeDecisionLog[],
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

export const buildBanzukeSnapshotForSeq = (
  seq: number,
  playerDivision: Rank['division'],
  bashoRows: BashoRecordRow[],
): ReportBanzukeSnapshot => {
  const divisionRows = bashoRows
    .filter((row) => row.seq === seq && row.division === playerDivision)
    .slice()
    .sort(compareBanzukeRows);
  const bashoLabel = buildBashoLabelFromRows(divisionRows, seq);

  return {
    seq,
    bashoLabel,
    division: playerDivision,
    rows: divisionRows.map((row) => ({
      entityId: row.entityId,
      entityType: row.entityType,
      shikona: row.shikona,
      rank: buildRankFromRow(row),
      rankLabel: formatRankDisplayName(buildRankFromRow(row)),
      wins: row.wins,
      losses: row.losses,
      absent: row.absent,
      recordText: formatRecordText(row.wins, row.losses, row.absent),
      titles: row.titles,
      isPlayer: row.entityType === 'PLAYER',
      isYushoWinner: row.titles.includes('YUSHO'),
    })),
  };
};

export const buildSnapshotBoutMarks = (
  snapshot: ReportBanzukeSnapshot,
  bouts: PlayerBoutDetail[],
): Map<string, string> => {
  const marks = new Map<string, string>();
  for (const row of snapshot.rows) {
    if (row.isPlayer) continue;
    const bout = bouts.find((entry) => entry.opponentId === row.entityId);
    const mark = resolveBoutResultMark(bout?.result);
    if (mark) marks.set(row.entityId, mark);
  }
  return marks;
};
