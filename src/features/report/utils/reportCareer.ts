import { BashoRecord, HighlightEvent, Rank, RikishiStatus, TimelineEvent } from '../../../logic/models';
import type { CareerPlayerBoutsByBasho } from '../../../logic/persistence/repository';
import { getRankValueForChart } from '../../../logic/ranking';
import { buildCounterfactualInjuryText, buildFantasyHooks, getStyleLabel } from '../../../logic/phaseA';
import { ReportTimelineItem } from '../../../shared/ui/displayLabels';

export interface ReportCareerRecord extends BashoRecord {
  bashoSeq: number;
  displaySlot: number;
}

export interface RankChartPoint {
  slot: number;
  axisLabel: string;
  bashoLabel: string;
  rankValue: number;
  rankLabel: string;
  weightKg?: number;
  eventTags?: HighlightEvent['tag'][];
  eventLabel?: string;
}

export interface TimelineEventGroup {
  key: string;
  year: number;
  month: number;
  primaryType: TimelineEvent['type'];
  tagLabel: string;
  descriptions: string[];
}

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

export const formatBashoLabel = (year: number, month: number): string =>
  `${year}年${month}月`;

export const buildReportCareerRecords = (records: BashoRecord[]): ReportCareerRecord[] =>
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

export const buildRankChartData = (records: BashoRecord[]): RankChartPoint[] => {
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
      index === 0
      || index === displayRecords.length - 1
      || index % stride === 0
        ? `${record.year}.${String(record.month).padStart(2, '0')}`
        : '',
    bashoLabel: formatBashoLabel(record.year, record.month),
    rankValue: getRankValueForChart(record.rank),
    rankLabel: formatRankDisplayName(record.rank),
    weightKg: record.bodyWeightKg,
  }));
};

export const buildRankChartDataFromStatus = (status: RikishiStatus): RankChartPoint[] => {
  const base = buildRankChartData(status.history.records);
  const highlightBySeq = new Map<number, HighlightEvent[]>();
  (status.history.highlightEvents ?? []).forEach((event) => {
    const current = highlightBySeq.get(event.bashoSeq) ?? [];
    current.push(event);
    highlightBySeq.set(event.bashoSeq, current);
  });
  return base.map((point, index) => {
    const events = highlightBySeq.get(index + 1) ?? [];
    return {
      ...point,
      weightKg: point.weightKg ?? status.history.bodyTimeline?.find((row) => row.bashoSeq === index + 1)?.weightKg,
      eventTags: events.map((event) => event.tag),
      eventLabel: events.map((event) => event.label).join(' / '),
    };
  });
};

export const buildHoshitoriCareerRecords = (
  records: BashoRecord[],
  boutsByBasho: CareerPlayerBoutsByBasho[],
): Array<ReportCareerRecord & { bouts: CareerPlayerBoutsByBasho['bouts'] }> => {
  const boutsMap = new Map<number, CareerPlayerBoutsByBasho['bouts']>(
    boutsByBasho.map((row) => [row.bashoSeq, row.bouts]),
  );

  return buildReportCareerRecords(records).map((record) => ({
    ...record,
    bouts: boutsMap.get(record.bashoSeq) ?? [],
  }));
};

export const buildTimelineEventGroups = (events: TimelineEvent[]): TimelineEventGroup[] => {
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

export const buildReportTimelineItems = (status: RikishiStatus): ReportTimelineItem[] => {
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

export const buildFantasyHooksForReport = (status: RikishiStatus): string[] =>
  buildFantasyHooks(status);

export const buildInjuryWhatIfText = (status: RikishiStatus): string | null =>
  buildCounterfactualInjuryText(status);
