import { formatHighestRankDisplayName, formatRankDisplayName, getRankValueForChart } from '../../../logic/ranking';
import { formatBashoLabel } from '../../../logic/bashoLabels';
import { buildCareerClearScoreSummary, resolveCareerRecordBadgeLabel } from '../../../logic/career/clearScore';
import { buildCounterfactualInjuryText, buildFantasyHooks } from '../../../logic/careerNarrative';
import {
  ensureStyleIdentityProfile,
  resolveDisplayedStrengthStyles,
  resolveDisplayedWeakStyles,
  resolveStyleLabels,
} from '../../../logic/style/identity';
import {
  BashoRecord,
  HighlightEventTag,
  Rank,
  RikishiStatus,
  TimelineEvent,
} from '../../../logic/models';
import { PlayerBoutDetail } from '../../../logic/simulation/basho';
import type { BanzukeDecisionLog } from '../../../logic/banzuke/types';
import type { CareerBashoRecordsBySeq } from '../../../logic/persistence/careerHistory';
import type { BashoRecordRow, BoutResultType, ImportantTorikumiRow } from '../../../logic/persistence/db';

export { formatBashoLabel, formatHighestRankDisplayName, formatRankDisplayName };

const TIMELINE_EVENT_PRIORITY: Record<TimelineEvent['type'], number> = {
  YUSHO: 0,
  PROMOTION: 1,
  DEMOTION: 2,
  TRAIT_AWAKENING: 3,
  OTHER: 4,
  INJURY: 5,
  ENTRY: 6,
  RETIREMENT: 7,
};

const TIMELINE_EVENT_LABEL: Record<TimelineEvent['type'], string> = {
  ENTRY: '入門',
  PROMOTION: '昇進',
  DEMOTION: '陥落',
  YUSHO: '優勝',
  INJURY: '休場',
  RETIREMENT: '引退',
  TRAIT_AWAKENING: '特性開花',
  OTHER: '出来事',
};

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
    highestRankLabel: formatHighestRankDisplayName(record.rank),
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
  const profile = ensureStyleIdentityProfile(status).styleIdentityProfile;
  const strengths = resolveDisplayedStrengthStyles(profile);
  const weaknesses = resolveDisplayedWeakStyles(profile);
  if (strengths.length === 0 && weaknesses.length === 0) return '得意な型なし / 苦手な型なし';
  const parts: string[] = [];
  if (strengths.length > 0) parts.push(`得意 ${resolveStyleLabels(strengths).join(' / ')}`);
  if (weaknesses.length > 0) parts.push(`苦手 ${resolveStyleLabels(weaknesses).join(' / ')}`);
  return parts.join(' / ');
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
  lifeCards: Array<{ slot: string; label: string; previewTag: string }>;
  pills: Array<{ label: string; tone: Exclude<ReportTone, 'action'> }>;
  metrics: ReportHeroMetric[];
}

export interface ReportSpotlightPoint {
  slot: number;
  axisLabel: string;
  bashoLabel: string;
  rankLabel: string;
  highestRankLabel: string;
  plotValue: number;
  age: number;
}

export interface ReportSpotlightEvent {
  key: string;
  slot: number;
  plotValue: number;
  bashoLabel: string;
  label: string;
  summary: string;
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
  entryType?: 'EVENT' | 'BANZUKE' | 'TORIKUMI';
  bashoSeq?: number;
  day?: number;
  sortYear?: number;
  sortMonth?: number;
  sortDay?: number;
  sortPriority?: number;
}

export type ImportantBanzukeDecisionTrigger =
  | 'SEKITORI_PROMOTION'
  | 'MAKUUCHI_PROMOTION'
  | 'OZEKI_PROMOTION'
  | 'YOKOZUNA_PROMOTION'
  | 'KACHIKOSHI_HELD'
  | 'SANYAKU_MISSED_BY_SLOT_JAM';

export interface ImportantBanzukeDecisionDigest {
  key: string;
  bashoSeq: number;
  bashoLabel: string;
  trigger: ImportantBanzukeDecisionTrigger;
  summary: string;
  resultLine: string;
  reasonLine: string;
  contextLine: string;
  recordText: string;
  fromRankLabel: string;
  toRankLabel: string;
  year: number;
  month: number;
}

export type ImportantTorikumiTrigger =
  | 'YUSHO_RACE'
  | 'YUSHO_DIRECT'
  | 'YUSHO_PURSUIT'
  | 'JOI_DUTY'
  | 'JOI_ASSIGNMENT'
  | 'SEKITORI_BOUNDARY'
  | 'JURYO_BOUNDARY'
  | 'CROSS_DIVISION_EVAL'
  | 'LOWER_BOUNDARY'
  | 'LATE_RELAXATION';

export interface ImportantTorikumiDigest {
  key: string;
  bashoSeq: number;
  bashoLabel: string;
  day: number;
  trigger: ImportantTorikumiTrigger;
  summary: string;
  detailLine: string;
  opponentId?: string;
  opponentShikona?: string;
  opponentRankLabel: string;
  year: number;
  month: number;
}

export interface ReportImportantDecisionHighlight {
  key: string;
  kind: 'BANZUKE' | 'TORIKUMI';
  bashoSeq: number;
  bashoLabel: string;
  day?: number;
  title: string;
  summary: string;
  detailLines: string[];
  tone: Exclude<ReportTone, 'action'>;
}

export interface ReportImportantDecisionDigest {
  highlights: ReportImportantDecisionHighlight[];
  timelineItems: ReportTimelineDigestItem[];
}

export interface ReportBanzukeRow {
  entityId: string;
  entityType: 'PLAYER' | 'NPC';
  shikona: string;
  stableId?: string;
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
  totalRowCount: number;
  focusRank?: Rank;
  focusWindow?: number;
  entryPoints?: string[];
  highlightReason?: string;
  rows: ReportBanzukeRow[];
}

export interface BuildBanzukeSnapshotOptions {
  focusRank?: Rank;
  focusEntityIds?: string[];
  focusWindow?: number;
  entryPoints?: string[];
  highlightReason?: string;
}

const buildRankFromRow = (row: BashoRecordRow): Rank => ({
  division: row.division as Rank['division'],
  name: row.rankName,
  number: row.rankNumber,
  side: row.rankSide,
  specialStatus: row.rankSpecialStatus,
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

const resolveTimelineTone = (type: TimelineEvent['type']): Exclude<ReportTone, 'action'> => {
  if (type === 'YUSHO' || type === 'PROMOTION') return 'state';
  if (type === 'INJURY' || type === 'DEMOTION' || type === 'RETIREMENT') return 'warning';
  if (type === 'TRAIT_AWAKENING') return 'brand';
  if (type === 'ENTRY') return 'brand';
  return 'neutral';
};

const isUpperMaegashira = (rank: Rank): boolean =>
  rank.division === 'Makuuchi' && rank.name === '前頭' && (rank.number ?? 99) <= 4;

const isUpperJuryo = (rank: Rank): boolean =>
  rank.division === 'Juryo' && (rank.number ?? 99) <= 2;

const isSekitoriBoundaryRank = (rank: Rank): boolean =>
  (rank.division === 'Juryo' && (rank.number ?? 99) >= 12) ||
  (rank.division === 'Makushita' && (rank.number ?? 99) <= 5);

const isSameRankSlot = (left: Rank, right: Rank): boolean =>
  left.division === right.division &&
  left.name === right.name &&
  (left.number ?? 0) === (right.number ?? 0) &&
  (left.side ?? 'East') === (right.side ?? 'East');

const getPromotionSlotDelta = (fromRank: Rank, toRank: Rank): number =>
  getRankValueForChart(fromRank) - getRankValueForChart(toRank);

const buildPromotionSummary = (trigger: ImportantBanzukeDecisionTrigger, toRankLabel: string): string => {
  if (trigger === 'SEKITORI_PROMOTION') return `関取昇進を決め、${toRankLabel}に届いた。`;
  if (trigger === 'MAKUUCHI_PROMOTION') return `新入幕を決め、${toRankLabel}に座った。`;
  if (trigger === 'OZEKI_PROMOTION') return `大関昇進を決め、看板力士の列へ入った。`;
  if (trigger === 'YOKOZUNA_PROMOTION') return `横綱昇進を決め、土俵の頂点に立った。`;
  if (trigger === 'SANYAKU_MISSED_BY_SLOT_JAM') return '勝ち越したが、三役の空席不足で平幕に据え置かれた。';
  return '勝ち越したが、番付事情で動きが止まった。';
};

const resolveBanzukeTrigger = (
  log: BanzukeDecisionLog,
  record: BashoRecord,
): ImportantBanzukeDecisionTrigger | null => {
  if (log.fromRank.division !== 'Juryo' && log.finalRank.division === 'Juryo') {
    return 'SEKITORI_PROMOTION';
  }
  if (log.fromRank.division === 'Juryo' && log.finalRank.division === 'Makuuchi') {
    return 'MAKUUCHI_PROMOTION';
  }
  if (!['大関', '横綱'].includes(log.fromRank.name) && log.finalRank.name === '大関') {
    return 'OZEKI_PROMOTION';
  }
  if (log.fromRank.name !== '横綱' && log.finalRank.name === '横綱') {
    return 'YOKOZUNA_PROMOTION';
  }
  if (record.wins <= record.losses) return null;
  if (
    isUpperMaegashira(log.fromRank) &&
    log.finalRank.division === 'Makuuchi' &&
    log.finalRank.name === '前頭' &&
    (log.reasons.includes('REVIEW_BOUNDARY_SLOT_JAM_NOTED') || (record.wins >= 10 && (log.finalRank.number ?? 99) <= 4))
  ) {
    return 'SANYAKU_MISSED_BY_SLOT_JAM';
  }

  const promotionDelta = getPromotionSlotDelta(log.fromRank, log.finalRank);
  const isBoundaryCase =
    isUpperMaegashira(log.fromRank) ||
    isUpperJuryo(log.fromRank) ||
    isSekitoriBoundaryRank(log.fromRank);
  if (isBoundaryCase && (isSameRankSlot(log.fromRank, log.finalRank) || promotionDelta <= 1)) {
    return 'KACHIKOSHI_HELD';
  }
  return null;
};

const resolveBanzukeReasonLine = (
  trigger: ImportantBanzukeDecisionTrigger,
  log: BanzukeDecisionLog,
): string => {
  if (trigger === 'SEKITORI_PROMOTION') return '理由: 幕下以下を抜け、関取枠へ届く成績を残した。';
  if (trigger === 'MAKUUCHI_PROMOTION') return '理由: 十両上位の実績が評価され、幕内枠へ繰り上がった。';
  if (trigger === 'OZEKI_PROMOTION') return '理由: 上位での継続成績が昇進基準を満たした。';
  if (trigger === 'YOKOZUNA_PROMOTION') return '理由: 大関としての実績が綱取りの水準に達した。';
  if (trigger === 'SANYAKU_MISSED_BY_SLOT_JAM') return '理由: 勝ち越し自体は評価されたが、三役の空席が足りなかった。';
  if (log.reasons.includes('REVIEW_BOUNDARY_SLOT_JAM_NOTED')) {
    return '理由: 勝ち越しでも上位枠の詰まりが強く、昇進幅が抑えられた。';
  }
  return '理由: 勝ち越しでも、番付境界の競合で動きが小さくなった。';
};

const resolveBanzukeContextLine = (
  trigger: ImportantBanzukeDecisionTrigger,
  _log: BanzukeDecisionLog,
): string => {
  if (trigger === 'SEKITORI_PROMOTION') return '番付事情: 関取境界での競合を抜け、十両の空席側へ滑り込んだ。';
  if (trigger === 'MAKUUCHI_PROMOTION') return '番付事情: 幕内下位の入れ替え枠に入るだけの余地があった。';
  if (trigger === 'OZEKI_PROMOTION') return '番付事情: 上位番付の連続成績が重く見られる地位で、会議判断も昇進側に寄った。';
  if (trigger === 'YOKOZUNA_PROMOTION') return '番付事情: 綱取りは通常昇進より慎重だが、今回は押し切る材料が揃った。';
  if (trigger === 'SANYAKU_MISSED_BY_SLOT_JAM') {
    return '番付事情: 三役側の空席不足か残留者の兼ね合いで、平幕上位に押し戻された。';
  }
  return '番付事情: 勝ち越し優先の原則は保たれたが、上位の空席不足で据え置き寄りになった。';
};

const resolveBanzukeHighlightTitle = (trigger: ImportantBanzukeDecisionTrigger): string => {
  if (trigger === 'SEKITORI_PROMOTION') return '関取昇進';
  if (trigger === 'MAKUUCHI_PROMOTION') return '新入幕';
  if (trigger === 'OZEKI_PROMOTION') return '大関昇進';
  if (trigger === 'YOKOZUNA_PROMOTION') return '横綱昇進';
  if (trigger === 'SANYAKU_MISSED_BY_SLOT_JAM') return '三役見送り';
  return '勝ち越し据え置き';
};

const resolveTorikumiHighlightTitle = (trigger: ImportantTorikumiTrigger): string => {
  if (trigger === 'YUSHO_RACE') return '優勝争いの割';
  if (trigger === 'YUSHO_DIRECT') return '優勝直接対決';
  if (trigger === 'YUSHO_PURSUIT') return '優勝追走戦';
  if (trigger === 'JOI_DUTY') return '上位総当たり';
  if (trigger === 'JOI_ASSIGNMENT') return '上位義務戦';
  if (trigger === 'SEKITORI_BOUNDARY') return '関取境界戦';
  if (trigger === 'JURYO_BOUNDARY') return '十両昇降戦';
  if (trigger === 'CROSS_DIVISION_EVAL') return '越境評価戦';
  if (trigger === 'LOWER_BOUNDARY') return '下位境界戦';
  return '異例編成';
};

const resolveTorikumiTone = (trigger: ImportantTorikumiTrigger): Exclude<ReportTone, 'action'> => {
  if (
    trigger === 'YUSHO_RACE' ||
    trigger === 'YUSHO_DIRECT' ||
    trigger === 'YUSHO_PURSUIT' ||
    trigger === 'SEKITORI_BOUNDARY' ||
    trigger === 'JURYO_BOUNDARY' ||
    trigger === 'LOWER_BOUNDARY'
  ) return 'state';
  if (trigger === 'LATE_RELAXATION') return 'warning';
  return 'brand';
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
  const clearScore = buildCareerClearScoreSummary(status);
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
  const lifeCards = (status.buildSummary?.lifeCards ?? []).map((card) => ({
    slot: card.slot,
    label: card.label,
    previewTag: card.previewTag,
  }));

  if (history.maxRank.division === 'Makuuchi') pills.push({ label: '幕内到達', tone: 'state' });
  else if (history.maxRank.division === 'Juryo') pills.push({ label: '関取到達', tone: 'state' });
  else pills.push({ label: '下位から積み上げ', tone: 'brand' });

  if (history.yushoCount.makuuchi > 0) pills.push({ label: `幕内優勝 ${history.yushoCount.makuuchi}回`, tone: 'state' });
  if (history.totalAbsent > 0 || (status.injuries?.length ?? 0) > 0) pills.push({ label: '休場記録あり', tone: 'warning' });
  if ((history.careerTurningPoints?.length ?? 0) > 0 || history.careerTurningPoint?.reason) {
    pills.push({ label: '転機あり', tone: 'neutral' });
  }

  const caution =
    totalBashoCount <= 3
      ? 'まだ山場の少ない力士人生です。番付の傾きと各場所の勝敗を中心に読む段階です。'
      : history.totalAbsent > 0
        ? `休場 ${history.totalAbsent} を含む波のある経歴です。好不調の切り替わりもあわせて確認してください。`
        : undefined;

  const dominantNarrative = status.careerNarrative?.initialConditions;
  const burdenNarrative = status.careerNarrative?.growthArc;

  return {
    titleBadge:
      clearScore.badges[0]
        ? `${resolveCareerRecordBadgeLabel(clearScore.badges[0].key)} / ${clearScore.clearScore}`
        : `総評点 ${clearScore.clearScore}`,
    careerHeadline: buildCareerHeadline(status),
    profileFacts,
    journeyLabel: `${status.entryAge}歳入門 - ${status.age}歳引退 / ${totalBashoCount}場所`,
    narrative:
      dominantNarrative ||
      burdenNarrative ||
      history.careerTurningPoint?.reason ||
      (makuuchiRecords.length > 0
        ? `幕内では ${makuuchiRecords.length}場所を過ごし、勝率 ${makuuchiWinRate ?? '0.0'}% を記録しました。`
        : '大舞台よりも、一場所ごとの積み上げが印象に残る力士人生です。'),
    caution,
    lifeCards,
    pills,
    metrics: [
      {
        label: '最高位',
        value: formatHighestRankDisplayName(history.maxRank),
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
    highestRankLabel: point.highestRankLabel,
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

  type SpotlightCandidate = ReportSpotlightEvent & { priority: number };
  const eventMap = new Map<number, SpotlightCandidate>();
  const upsertCandidate = (candidate: SpotlightCandidate) => {
    const current = eventMap.get(candidate.slot);
    if (!current || candidate.priority > current.priority) {
      eventMap.set(candidate.slot, candidate);
    }
  };

  const turningPoints = status.history.careerTurningPoints?.length
    ? status.history.careerTurningPoints
    : status.history.careerTurningPoint
      ? [status.history.careerTurningPoint]
      : [];
  turningPoints.forEach((turningPoint) => {
    const point = points[turningPoint.bashoSeq - 1];
    if (!point) return;
    upsertCandidate({
      key: `turning-${turningPoint.bashoSeq}-${turningPoint.kind}`,
      slot: point.slot,
      plotValue: point.plotValue,
      bashoLabel: point.bashoLabel,
      label: truncateReportLabel(turningPoint.label, 10),
      summary: turningPoint.reason,
      tone:
        turningPoint.kind === 'MAJOR_INJURY' || turningPoint.kind === 'JURYO_DROP'
          ? 'warning'
          : turningPoint.kind === 'YUSHO'
            ? 'state'
            : 'brand',
      priority: 100 + turningPoint.severity,
    });
  });

  for (let index = 1; index < points.length; index += 1) {
    const previousPoint = points[index - 1];
    const point = points[index];
    const delta = point.plotValue - previousPoint.plotValue;
    if (Math.abs(delta) < 18) continue;
    const promoted = delta > 0;
    upsertCandidate({
      key: `swing-${point.slot}-${promoted ? 'up' : 'down'}`,
      slot: point.slot,
      plotValue: point.plotValue,
      bashoLabel: point.bashoLabel,
      label: promoted ? '急上昇' : '急落',
      summary: `${previousPoint.bashoLabel}の${previousPoint.rankLabel}から、${point.bashoLabel}に${point.rankLabel}まで${promoted ? '番付を上げた' : '番付を落とした'}。`,
      tone: promoted ? 'state' : 'warning',
      priority: Math.abs(delta),
    });
  }

  const bestPoint = points.reduce((best, point) => (point.plotValue > best.plotValue ? point : best), points[0]);
  upsertCandidate({
    key: `peak-${bestPoint.slot}`,
    slot: bestPoint.slot,
    plotValue: bestPoint.plotValue,
    bashoLabel: bestPoint.bashoLabel,
    label: '最高到達点',
    summary: `${bestPoint.bashoLabel}に${bestPoint.highestRankLabel}まで到達した。`,
    tone: 'brand',
    priority: 40,
  });

  if (eventMap.size === 0) {
    displayRecords.forEach((record, index) => {
      if (!record.yusho && record.absent < 5) return;
      const point = points[index];
      if (!point) return;
      upsertCandidate({
        key: `record-${record.bashoSeq}`,
        slot: point.slot,
        plotValue: point.plotValue,
        bashoLabel: point.bashoLabel,
        label: record.yusho ? '優勝' : truncateReportLabel(`${record.absent}休`, 8),
        summary:
          record.yusho
            ? `${record.year}年${record.month}月場所で優勝。`
            : `${record.year}年${record.month}月場所は${record.absent}休を含んだ。`,
        tone: record.yusho ? 'state' : 'warning',
        priority: record.yusho ? 80 : 30,
      });
    });
  }

  const events = [...eventMap.values()]
    .sort((a, b) => a.slot - b.slot)
    .slice(0, 10)
    .map(({ priority: _priority, ...event }) => event);

  const note =
    points.length <= 3
      ? 'まだ山場の少ない力士人生です。大きな事件より、最初の昇降格に注目してください。'
      : events.length === 0
        ? '主要な転機が少ないため、番付の積み上がりそのものを読むキャリアです。'
        : '昇進だけでなく、急落、停滞脱出、最高到達点も含めて番付の山谷を拾っています。';

  return {
    points,
    events,
    peakBand: resolvePeakBand(status, points),
    note,
  };
};

export const buildReportTimelineDigest = (
  status: RikishiStatus,
  entryAge: number,
  importantDecisions?: ReportImportantDecisionDigest,
): ReportTimelineDigestItem[] => {
  const events = status.history.events;
  const groups = buildTimelineEventGroups(events);
  const importantStartYear = importantDecisions?.timelineItems
    .map((item) => item.sortYear ?? 0)
    .filter((year) => year > 0)
    .sort((left, right) => left - right)[0];
  const startYear =
    events.find((event) => event.type === 'ENTRY')?.year ??
    events[0]?.year ??
    importantStartYear ??
    0;
  const baseItems: ReportTimelineDigestItem[] = groups.map((group) => {
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
      entryType: 'EVENT' as const,
      sortYear: group.year,
      sortMonth: group.month,
      sortDay: 0,
      sortPriority: 10,
    };
  });

  const turningPointItems: ReportTimelineDigestItem[] = (status.history.careerTurningPoints ?? [])
    .filter((point) => point.kind === 'SLUMP_RECOVERY' || point.kind === 'MAKUUCHI_PROMOTION')
    .filter((point) =>
      !baseItems.some((item) =>
        item.sortYear === point.year &&
        item.sortMonth === point.month &&
        item.items.some((entry) => entry.includes(point.label) || entry.includes(point.reason)),
      ))
    .map((point) => ({
      key: `turning-point-${point.bashoSeq}-${point.kind}`,
      dateLabel: formatBashoLabel(point.year, point.month),
      age: entryAge + Math.max(0, point.year - startYear),
      label: point.label,
      tone: point.kind === 'SLUMP_RECOVERY' ? 'brand' : 'state',
      isMajor: point.severity >= 6,
      items: [point.reason],
      entryType: 'EVENT' as const,
      bashoSeq: point.bashoSeq,
      sortYear: point.year,
      sortMonth: point.month,
      sortDay: 0,
      sortPriority: 9,
    }));

  if (!importantDecisions?.timelineItems.length) {
    return [...baseItems, ...turningPointItems]
      .slice()
      .sort((left, right) => {
        if ((right.sortYear ?? 0) !== (left.sortYear ?? 0)) {
          return (right.sortYear ?? 0) - (left.sortYear ?? 0);
        }
        if ((right.sortMonth ?? 0) !== (left.sortMonth ?? 0)) {
          return (right.sortMonth ?? 0) - (left.sortMonth ?? 0);
        }
        if ((right.sortDay ?? 0) !== (left.sortDay ?? 0)) {
          return (right.sortDay ?? 0) - (left.sortDay ?? 0);
        }
        if ((left.sortPriority ?? 0) !== (right.sortPriority ?? 0)) {
          return (left.sortPriority ?? 0) - (right.sortPriority ?? 0);
        }
        return left.key.localeCompare(right.key);
      });
  }

  const importantItems: ReportTimelineDigestItem[] = importantDecisions.timelineItems.map((item) => ({
    ...item,
    age: entryAge + Math.max(0, (item.sortYear ?? startYear) - startYear),
  }));

  return [...baseItems, ...turningPointItems, ...importantItems]
    .slice()
    .sort((left, right) => {
      if ((right.sortYear ?? 0) !== (left.sortYear ?? 0)) {
        return (right.sortYear ?? 0) - (left.sortYear ?? 0);
      }
      if ((right.sortMonth ?? 0) !== (left.sortMonth ?? 0)) {
        return (right.sortMonth ?? 0) - (left.sortMonth ?? 0);
      }
      if ((right.sortDay ?? 0) !== (left.sortDay ?? 0)) {
        return (right.sortDay ?? 0) - (left.sortDay ?? 0);
      }
      if ((left.sortPriority ?? 0) !== (right.sortPriority ?? 0)) {
        return (left.sortPriority ?? 0) - (right.sortPriority ?? 0);
      }
      return left.key.localeCompare(right.key);
    });
};

export const buildImportantBanzukeDecisionDigests = (
  status: RikishiStatus,
  decisionLogs: BanzukeDecisionLog[],
  _bashoRowsBySeq: CareerBashoRecordsBySeq[],
): ImportantBanzukeDecisionDigest[] =>
  decisionLogs
    .map((log) => {
      const record = status.history.records[log.seq - 1];
      if (!record) return null;
      const trigger = resolveBanzukeTrigger(log, record);
      if (!trigger) return null;
      const bashoLabel = formatBashoLabel(record.year, record.month);
      const recordText = formatRecordText(record.wins, record.losses, record.absent);
      const fromRankLabel = formatRankDisplayName(log.fromRank);
      const toRankLabel = formatRankDisplayName(log.finalRank);
      const summary = buildPromotionSummary(trigger, toRankLabel);
      const resultLine =
        trigger === 'KACHIKOSHI_HELD' || trigger === 'SANYAKU_MISSED_BY_SLOT_JAM'
          ? `結果: ${recordText}でも${toRankLabel}にとどまった。`
          : `結果: ${recordText}で${toRankLabel}へ動いた。`;

      return {
        key: `banzuke-${log.seq}-${trigger}`,
        bashoSeq: log.seq,
        bashoLabel,
        trigger,
        summary,
        resultLine,
        reasonLine: resolveBanzukeReasonLine(trigger, log),
        contextLine: resolveBanzukeContextLine(trigger, log),
        recordText,
        fromRankLabel,
        toRankLabel,
        year: record.year,
        month: record.month,
      } satisfies ImportantBanzukeDecisionDigest;
    })
    .filter((entry): entry is ImportantBanzukeDecisionDigest => Boolean(entry))
    .sort((left, right) => right.bashoSeq - left.bashoSeq);

export const buildImportantTorikumiDigests = (
  torikumiRows: ImportantTorikumiRow[],
): ImportantTorikumiDigest[] =>
  torikumiRows
    .map((row) => {
      const opponentRank: Rank = {
        division:
          row.opponentRankName === '横綱' || row.opponentRankName === '大関' || row.opponentRankName === '関脇' || row.opponentRankName === '小結' || row.opponentRankName === '前頭'
            ? 'Makuuchi'
            : row.opponentRankName === '十両'
              ? 'Juryo'
              : row.opponentRankName === '幕下'
                ? 'Makushita'
                : row.opponentRankName === '三段目'
                  ? 'Sandanme'
                  : row.opponentRankName === '序二段'
                    ? 'Jonidan'
                    : row.opponentRankName === '序ノ口'
                      ? 'Jonokuchi'
                      : 'Maezumo',
        name: row.opponentRankName,
        number: row.opponentRankNumber,
        side: row.opponentRankSide,
      };
      return {
        key: `torikumi-${row.bashoSeq}-${row.day}-${row.trigger}`,
        bashoSeq: row.bashoSeq,
        bashoLabel: formatBashoLabel(row.year, row.month),
        day: row.day,
        trigger: row.trigger,
        summary: row.summary,
        detailLine:
          row.opponentShikona
            ? `${row.day}日目は${row.opponentShikona}（${formatRankDisplayName(opponentRank)}）と組まれた。`
            : `${row.day}日目は${formatRankDisplayName(opponentRank)}との割になった。`,
        opponentId: row.opponentId,
        opponentShikona: row.opponentShikona,
        opponentRankLabel: formatRankDisplayName(opponentRank),
        year: row.year,
        month: row.month,
      } satisfies ImportantTorikumiDigest;
    })
    .sort((left, right) =>
      right.bashoSeq - left.bashoSeq || right.day - left.day,
    );

export const buildImportantDecisionDigest = (
  banzukeDigests: ImportantBanzukeDecisionDigest[],
  torikumiDigests: ImportantTorikumiDigest[],
): ReportImportantDecisionDigest => {
  const timelineItems: ReportTimelineDigestItem[] = [
    ...banzukeDigests.map((entry): ReportTimelineDigestItem => {
      const tone: Exclude<ReportTone, 'action'> =
        entry.trigger === 'KACHIKOSHI_HELD' || entry.trigger === 'SANYAKU_MISSED_BY_SLOT_JAM'
          ? 'warning'
          : 'state';
      return {
        key: entry.key,
        dateLabel: entry.bashoLabel,
        age: 0,
        label: '番付判断',
        tone,
        isMajor: true,
        items: [entry.summary, entry.reasonLine, entry.contextLine],
        entryType: 'BANZUKE',
        bashoSeq: entry.bashoSeq,
        sortYear: entry.year,
        sortMonth: entry.month,
        sortDay: 0,
        sortPriority: 0,
      };
    }),
    ...torikumiDigests.map((entry): ReportTimelineDigestItem => ({
      key: entry.key,
      dateLabel: `${entry.bashoLabel} ${entry.day}日目`,
      age: 0,
      label: '重要取組',
      tone: resolveTorikumiTone(entry.trigger),
      isMajor:
        entry.trigger === 'YUSHO_RACE' ||
        entry.trigger === 'YUSHO_DIRECT' ||
        entry.trigger === 'YUSHO_PURSUIT' ||
        entry.trigger === 'SEKITORI_BOUNDARY' ||
        entry.trigger === 'JURYO_BOUNDARY' ||
        entry.trigger === 'LOWER_BOUNDARY',
      items: [entry.summary, entry.detailLine],
      entryType: 'TORIKUMI',
      bashoSeq: entry.bashoSeq,
      sortYear: entry.year,
      sortMonth: entry.month,
      sortDay: entry.day,
      sortPriority: 1,
    })),
  ].sort((left, right) => {
    if ((right.sortYear ?? 0) !== (left.sortYear ?? 0)) return (right.sortYear ?? 0) - (left.sortYear ?? 0);
    if ((right.sortMonth ?? 0) !== (left.sortMonth ?? 0)) return (right.sortMonth ?? 0) - (left.sortMonth ?? 0);
    if ((right.sortDay ?? 0) !== (left.sortDay ?? 0)) return (right.sortDay ?? 0) - (left.sortDay ?? 0);
    return (left.sortPriority ?? 0) - (right.sortPriority ?? 0);
  });

  const highlights: ReportImportantDecisionHighlight[] = [
    ...banzukeDigests.map((entry): ReportImportantDecisionHighlight => {
      const tone: Exclude<ReportTone, 'action'> =
        entry.trigger === 'KACHIKOSHI_HELD' || entry.trigger === 'SANYAKU_MISSED_BY_SLOT_JAM'
          ? 'warning'
          : 'state';
      return {
        key: entry.key,
        kind: 'BANZUKE',
        bashoSeq: entry.bashoSeq,
        bashoLabel: entry.bashoLabel,
        title: resolveBanzukeHighlightTitle(entry.trigger),
        summary: entry.summary,
        detailLines: [entry.resultLine, entry.reasonLine, entry.contextLine],
        tone,
      };
    }),
    ...torikumiDigests.map((entry): ReportImportantDecisionHighlight => ({
      key: entry.key,
      kind: 'TORIKUMI',
      bashoSeq: entry.bashoSeq,
      bashoLabel: entry.bashoLabel,
      day: entry.day,
      title: resolveTorikumiHighlightTitle(entry.trigger),
      summary: entry.summary,
      detailLines: [entry.detailLine],
      tone: resolveTorikumiTone(entry.trigger),
    })),
  ]
    .sort((left, right) => {
      if (right.bashoSeq !== left.bashoSeq) return right.bashoSeq - left.bashoSeq;
      return (right.day ?? 0) - (left.day ?? 0);
    })
    .slice(0, 3);

  return {
    highlights,
    timelineItems,
  };
};

export const buildBanzukeSnapshotForSeq = (
  seq: number,
  playerDivision: Rank['division'],
  bashoRows: BashoRecordRow[],
  options: BuildBanzukeSnapshotOptions = {},
): ReportBanzukeSnapshot => {
  const divisionRows = bashoRows
    .filter((row) => row.seq === seq && row.division === playerDivision)
    .slice()
    .sort(compareBanzukeRows);
  const bashoLabel = buildBashoLabelFromRows(divisionRows, seq);
  const focusWindow = Math.max(1, options.focusWindow ?? 4);
  const focusEntityIds = new Set(options.focusEntityIds ?? []);
  const focusIndices = divisionRows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      if (focusEntityIds.has(row.entityId)) return true;
      if (!options.focusRank) return false;
      const rank = buildRankFromRow(row);
      return isSameRankSlot(rank, options.focusRank);
    })
    .map(({ index }) => index);
  const visibleRows =
    focusIndices.length > 0
      ? divisionRows.slice(
        Math.max(0, Math.min(...focusIndices) - focusWindow),
        Math.min(divisionRows.length, Math.max(...focusIndices) + focusWindow + 1),
      )
      : divisionRows;

  return {
    seq,
    bashoLabel,
    division: playerDivision,
    totalRowCount: divisionRows.length,
    focusRank: options.focusRank,
    focusWindow: focusIndices.length > 0 ? focusWindow : undefined,
    entryPoints: options.entryPoints,
    highlightReason: options.highlightReason,
    rows: visibleRows.map((row) => ({
      entityId: row.entityId,
      entityType: row.entityType,
      shikona: row.shikona,
      stableId: row.stableId,
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
