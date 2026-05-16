import React from "react";
import { Archive, BarChart3, GitCompare, Search, Star, Trash2 } from "lucide-react";
import { resolveCareerRecordBadgeLabel } from "../../../logic/career/clearScore";
import {
  AUTO_TAG_LABELS,
  MANUAL_SAVE_TAG_LABELS,
  buildCareerAnalysisSummary,
  buildCareerComparisonSummary,
  buildCareerTrajectorySeries,
  buildGenerationSummary,
  listSimilarCareers,
  resolveObservationStanceLabel,
  type CareerAnalysisSummary,
  type CareerComparisonMetric,
  type CareerTrajectorySeriesPoint,
} from "../../../logic/career/analysis";
import { Rank, RikishiStatus } from "../../../logic/models";
import { formatHighestRankDisplayName } from "../../../logic/ranking";
import type { CareerSaveTag, ObservationRuleMode, ObservationStanceId } from "../../../logic/models";
import { resolveStableById } from "../../../logic/simulation/heya/stableCatalog";
import type { LocaleCode } from "../../../shared/lib/locale";
import { useLocale } from "../../../shared/hooks/useLocale";
import { cn } from "../../../shared/lib/cn";
import surface from "../../../shared/styles/surface.module.css";
import typography from "../../../shared/styles/typography.module.css";
import { Button } from "../../../shared/ui/Button";
import styles from "./ArchiveScreen.module.css";

interface ArchiveItem {
  id: string;
  shikona: string;
  title: string | null;
  maxRank: Rank;
  careerStartYearMonth: string;
  careerEndYearMonth: string | null | undefined;
  totalWins: number;
  totalLosses: number;
  totalAbsent: number;
  yushoCount: {
    makuuchi: number;
    juryo?: number;
    makushita?: number;
    others?: number;
  };
  savedAt?: string;
  updatedAt?: string;
  clearScore?: number;
  recordBadgeKeys?: string[];
  bestScoreRank?: number;
  saveTags?: CareerSaveTag[];
  observerMemo?: string;
  observationPointsAwarded?: number;
  observationRuleMode?: ObservationRuleMode;
  observationStanceId?: ObservationStanceId;
  finalStatus?: RikishiStatus;
}

interface ArchiveScreenProps {
  items: ArchiveItem[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

type ArchiveMode = "SHELF" | "COMPARE" | "SIMILAR";
type ArchiveFilter = "ALL" | "YOKOZUNA" | "YUSHO" | "EXPERIMENT" | "TAGGED" | "RARE" | "INJURY" | "RIVAL" | "STABLE";
type ArchiveSort =
  | "RECENT"
  | "SCORE"
  | "MAX_RANK"
  | "WIN_RATE"
  | "MAKUUCHI"
  | "SANYAKU"
  | "YUSHO"
  | "RETIRE_AGE"
  | "MAX_RANK_AGE"
  | "PROMOTION"
  | "STABILITY"
  | "TURBULENCE"
  | "RARITY";
type RankFilter = "ALL" | "YOKOZUNA_OZEKI" | "SANYAKU" | "MAKUUCHI" | "JURYO_OR_LOWER";
type WinRateFilter = "ALL" | "HIGH" | "MID" | "LOW";

interface ArchiveViewItem extends ArchiveItem {
  analysis: CareerAnalysisSummary | null;
}

interface ArchiveShelfSummary {
  total: number;
  rankBreakdown: Array<{ label: string; count: number }>;
  winRateLabel: string;
  topTags: Array<{ label: string; count: number }>;
  recentItem: ArchiveViewItem | null;
}

const MANUAL_SAVE_TAG_EN_LABELS: Record<CareerSaveTag, string> = {
  GREAT_RIKISHI: "Great rikishi",
  UNFINISHED_TALENT: "Unfinished talent",
  LATE_BLOOM_SUCCESS: "Late bloom",
  INJURY_TRAGEDY: "Injury shadow",
  TURBULENT_LIFE: "Turbulent career",
  STABLE_MAKUUCHI: "Stable makuuchi",
  JURYO_CRAFTSMAN: "Juryo craft",
  GENERATION_LEADER: "Generation leader",
  RIVALRY_MEMORY: "Memorable rivalry",
  RARE_RECORD: "Rare record",
  RESEARCH_SAMPLE: "Research sample",
  FAVORITE: "Favorite",
  MEMORABLE_SUPPORT: "Memorable support",
  UNEXPECTED: "Unexpected",
  REREAD: "Reread",
};

const AUTO_TAG_EN_LABELS: Record<keyof typeof AUTO_TAG_LABELS, string> = {
  LATE_BLOOM: "Late bloom",
  INJURY_COMEBACK: "Injury comeback",
  STABLE_TOP_DIVISION: "Stable top division",
  JURYO_CRAFT: "Juryo craft",
  TURBULENT: "Turbulent",
  RARE_RECORD: "Rare record",
  LONGEVITY: "Longevity",
  FAST_RISE: "Fast rise",
  SANYAKU_NEAR_MISS: "Sanyaku near miss",
  RIVALRY: "Rivalry",
};

const OBSERVATION_STANCE_EN_LABELS: Record<ObservationStanceId, string> = {
  PROMOTION_EXPECTATION: "Promotion",
  LATE_BLOOM: "Late bloom",
  STABILITY: "Stability",
  TURBULENCE: "Turbulence",
  RIVALRY: "Rivalry",
  RARE_RECORD: "Rare record",
  INJURY_COMEBACK: "Comeback",
  LONGEVITY: "Longevity",
};

const CLASSIFICATION_EN_LABELS: Record<string, string> = {
  名力士: "Great rikishi",
  三役中核: "Sanyaku core",
  安定幕内: "Stable makuuchi",
  十両職人: "Juryo craft",
  未完の大器: "Unfinished talent",
  怪我に泣いた力士: "Injury-shadowed career",
  波乱型: "Turbulent career",
  長寿型: "Long career",
  短期爆発型: "Short burst",
  記憶に残る脇役: "Memorable supporting career",
  標準記録: "Standard record",
};

const COMPARISON_METRIC_EN_LABELS: Record<string, string> = {
  maxRank: "Highest rank",
  record: "Career record",
  winRate: "Win rate",
  firstSekitoriAge: "First sekitori age",
  firstMakuuchiAge: "Top division debut age",
  maxRankAge: "Peak rank age",
  makuuchiBasho: "Makuuchi basho",
  sekitoriBasho: "Sekitori basho",
  sanyakuBasho: "Sanyaku+ basho",
  yusho: "Yusho",
  junYusho: "Runner-up",
  injury: "Injuries",
  absent: "Absences",
  peakAge: "Prime age",
  retirementAge: "Retirement age",
  classification: "Class",
  tags: "Auto tags",
};

const CAREER_RECORD_BADGE_EN_LABELS: Record<string, string> = {
  YOKOZUNA_REACHED: "Reached Yokozuna",
  OZEKI_REACHED: "Reached Ozeki",
  MAKUUCHI_REACHED: "Reached Makuuchi",
  SEKITORI_REACHED: "Reached Sekitori",
  MAKUUCHI_YUSHO: "Makuuchi yusho",
  JURYO_YUSHO: "Juryo yusho",
  SANSHO: "Special prize",
  KINBOSHI: "Kinboshi",
  DOUBLE_DIGIT_WINS: "Double-digit wins",
  HIGH_WIN_RATE: "High win rate",
  LONG_CAREER: "Long career",
  KACHIKOSHI_STREAK: "Kachi-koshi streak",
};

const formatManualTagLabel = (tag: CareerSaveTag, locale: LocaleCode): string =>
  locale === "en" ? MANUAL_SAVE_TAG_EN_LABELS[tag] : MANUAL_SAVE_TAG_LABELS[tag];

const formatAutoTagLabel = (tag: keyof typeof AUTO_TAG_LABELS, locale: LocaleCode): string =>
  locale === "en" ? AUTO_TAG_EN_LABELS[tag] : AUTO_TAG_LABELS[tag];

const formatObservationStance = (stanceId: ObservationStanceId | undefined, locale: LocaleCode): string =>
  locale === "en" ? (stanceId ? OBSERVATION_STANCE_EN_LABELS[stanceId] : "Default") : resolveObservationStanceLabel(stanceId);

const formatClassificationLabel = (label: string, locale: LocaleCode): string =>
  locale === "en" ? CLASSIFICATION_EN_LABELS[label] ?? label : label;

const formatRecordBadgeLabel = (badgeKey: string, locale: LocaleCode): string =>
  locale === "en"
    ? CAREER_RECORD_BADGE_EN_LABELS[badgeKey] ?? badgeKey
    : resolveCareerRecordBadgeLabel(
      badgeKey as Parameters<typeof resolveCareerRecordBadgeLabel>[0],
    );

const formatRankName = (rank: Rank, locale: LocaleCode): string => {
  if (locale === "en") return formatHighestRankDisplayName(rank, "en");
  if (rank.specialStatus && rank.specialStatus !== "NONE") return formatHighestRankDisplayName(rank);
  if (rank.division === "Maezumo") return formatHighestRankDisplayName(rank);
  if (["横綱", "大関", "関脇", "小結"].includes(rank.name)) return formatHighestRankDisplayName(rank);
  const number = rank.number || 1;
  return number === 1 ? `${rank.name}筆頭` : `${rank.name}${number}枚目`;
};

const resolveArchiveLabel = (item: ArchiveItem, locale: LocaleCode): string => {
  if (locale === "en") {
    if (item.bestScoreRank && item.bestScoreRank <= 10) return `All-time score No. ${item.bestScoreRank}`;
    if (item.maxRank.name === "横綱") return "Reached Yokozuna";
    if (item.maxRank.name === "大関") return "Reached Ozeki";
    if (item.yushoCount.makuuchi > 0) return `${item.yushoCount.makuuchi} makuuchi yusho`;
    if (item.maxRank.division === "Makuuchi") return "Makuuchi career";
    if (item.maxRank.division === "Juryo") return "Sekitori career";
    return "Saved record";
  }
  if (item.bestScoreRank && item.bestScoreRank <= 10) return `総評点歴代${item.bestScoreRank}位`;
  if (item.maxRank.name === "横綱") return "横綱到達";
  if (item.maxRank.name === "大関") return "大関到達";
  if (item.yushoCount.makuuchi > 0) return `幕内優勝 ${item.yushoCount.makuuchi}回`;
  if (item.maxRank.division === "Makuuchi") return "幕内経験";
  if (item.maxRank.division === "Juryo") return "関取経験";
  return "保存済み記録";
};

const toDateText = (value: string | undefined, locale: LocaleCode): string => {
  if (!value) return locale === "en" ? "Not saved" : "未保存";
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};

const resolveWinRate = (item: Pick<ArchiveItem, "totalWins" | "totalLosses">): number => {
  const total = item.totalWins + item.totalLosses;
  return total > 0 ? item.totalWins / total : 0;
};

const formatWinRatePercent = (rate: number): string =>
  `${(rate * 100).toFixed(1)}%`;

const formatRecordLabel = (item: Pick<ArchiveItem, "totalWins" | "totalLosses" | "totalAbsent">, locale: LocaleCode): string =>
  locale === "en"
    ? `${item.totalWins}-${item.totalLosses}${item.totalAbsent > 0 ? `, ${item.totalAbsent} absences` : ""}`
    : `${item.totalWins}勝${item.totalLosses}敗${item.totalAbsent > 0 ? `${item.totalAbsent}休` : ""}`;

const formatCareerPeriod = (item: Pick<ArchiveItem, "careerStartYearMonth" | "careerEndYearMonth">, locale: LocaleCode): string =>
  `${item.careerStartYearMonth} - ${item.careerEndYearMonth || (locale === "en" ? "current" : "現在")}`;

const resolveStableName = (item: ArchiveViewItem, locale: LocaleCode): string =>
  item.finalStatus?.buildSummary?.initialConditionSummary?.stableName ??
  item.finalStatus?.careerSeed?.stableName ??
  (item.finalStatus ? resolveStableById(item.finalStatus.stableId)?.displayName : undefined) ??
  (locale === "en" ? "Unknown stable" : "所属部屋未詳");

const resolveReadingLine = (item: ArchiveViewItem, locale: LocaleCode): string => {
  if (locale === "en") {
    return `Reached ${formatRankName(item.maxRank, locale)} with ${formatRecordLabel(item, locale)}.`;
  }
  return item.finalStatus?.buildSummary?.designPremises?.find((row) => row.category === "期待")?.interpretation ??
    item.finalStatus?.buildSummary?.designInterpretation?.promotion ??
    item.finalStatus?.careerNarrative?.careerIdentity ??
    item.analysis?.saveRecommendation.reasons[0] ??
    item.observerMemo ??
    resolveArchiveLabel(item, locale);
};

const buildShelfSummary = (items: ArchiveViewItem[], locale: LocaleCode): ArchiveShelfSummary => {
  const total = items.length;
  const rankGroups = [
    { label: locale === "en" ? "Yokozuna" : "横綱", count: items.filter((item) => item.maxRank.name === "横綱").length },
    { label: locale === "en" ? "Ozeki" : "大関", count: items.filter((item) => item.maxRank.name === "大関").length },
    { label: locale === "en" ? "Sanyaku" : "三役", count: items.filter((item) => ["関脇", "小結"].includes(item.maxRank.name)).length },
    { label: locale === "en" ? "Makuuchi" : "幕内", count: items.filter((item) => item.maxRank.division === "Makuuchi" && !["横綱", "大関", "関脇", "小結"].includes(item.maxRank.name)).length },
    { label: locale === "en" ? "Juryo or lower" : "十両以下", count: items.filter((item) => item.maxRank.division !== "Makuuchi").length },
  ].filter((entry) => entry.count > 0);
  const ratedItems = items.filter((item) => item.totalWins + item.totalLosses > 0);
  const averageWinRate = ratedItems.length > 0
    ? ratedItems.reduce((sum, item) => sum + resolveWinRate(item), 0) / ratedItems.length
    : 0;
  const winRateBand =
    ratedItems.length === 0
      ? (locale === "en" ? "Not counted" : "未集計")
      : averageWinRate >= 0.58
        ? (locale === "en" ? "high win-rate band" : "高勝率帯")
        : averageWinRate >= 0.48
          ? (locale === "en" ? "standard band" : "標準帯")
          : (locale === "en" ? "struggle band" : "苦闘帯");
  const tagCounts = new Map<CareerSaveTag, number>();
  for (const item of items) {
    for (const tag of item.saveTags ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || MANUAL_SAVE_TAG_LABELS[a[0]].localeCompare(MANUAL_SAVE_TAG_LABELS[b[0]], "ja"))
    .slice(0, 4)
    .map(([tag, count]) => ({ label: formatManualTagLabel(tag, locale), count }));
  const recentItem = [...items].sort((left, right) =>
    (right.savedAt || right.updatedAt || "").localeCompare(left.savedAt || left.updatedAt || ""),
  )[0] ?? null;

  return {
    total,
    rankBreakdown: rankGroups,
    winRateLabel: ratedItems.length > 0 ? `${formatWinRatePercent(averageWinRate)} / ${winRateBand}` : locale === "en" ? "Not counted" : "未集計",
    topTags,
    recentItem,
  };
};

const resolveRankSortValue = (rank: Rank): number => {
  if (rank.name === "横綱") return 900;
  if (rank.name === "大関") return 800;
  if (rank.name === "関脇") return 700;
  if (rank.name === "小結") return 650;
  if (rank.division === "Makuuchi") return 560 - (rank.number ?? 1);
  if (rank.division === "Juryo") return 460 - (rank.number ?? 1);
  if (rank.division === "Makushita") return 360 - (rank.number ?? 1);
  if (rank.division === "Sandanme") return 260 - (rank.number ?? 1);
  if (rank.division === "Jonidan") return 160 - (rank.number ?? 1);
  return 60 - (rank.number ?? 1);
};

const resolveSortValue = (item: ArchiveViewItem, sortBy: ArchiveSort): number => {
  const analysis = item.analysis;
  if (sortBy === "MAX_RANK") return resolveRankSortValue(item.maxRank);
  if (sortBy === "WIN_RATE") return analysis?.metrics.winRate ?? resolveWinRate(item);
  if (sortBy === "MAKUUCHI") return analysis?.metrics.makuuchiBasho ?? 0;
  if (sortBy === "SANYAKU") return analysis?.metrics.sanyakuBasho ?? 0;
  if (sortBy === "YUSHO") return analysis?.metrics.yushoTotal ?? item.yushoCount.makuuchi;
  if (sortBy === "RETIRE_AGE") return analysis?.status.age ?? 0;
  if (sortBy === "MAX_RANK_AGE") return analysis?.metrics.maxRankAge ? 100 - analysis.metrics.maxRankAge : 0;
  if (sortBy === "PROMOTION") return analysis?.metrics.promotionSpeedScore ?? 0;
  if (sortBy === "STABILITY") return analysis?.metrics.stabilityScore ?? 0;
  if (sortBy === "TURBULENCE") return analysis?.metrics.turbulenceScore ?? 0;
  if (sortBy === "RARITY") return analysis?.metrics.rarityScore ?? 0;
  return 0;
};

const localizeMetricUnitText = (value: string, locale: LocaleCode): string => {
  if (locale !== "en") return value;
  return value
    .replace(/(\d+)勝(\d+)敗(\d+)休/g, "$1-$2, $3 absences")
    .replace(/(\d+)勝(\d+)敗/g, "$1-$2")
    .replace(/(\d+)歳/g, "$1 yrs")
    .replace(/(\d+)場所/g, "$1 basho")
    .replace(/(\d+)回/g, "$1")
    .replace(/(\d+)休/g, "$1 absences");
};

const formatComparisonValue = (
  row: CareerComparisonMetric,
  side: "left" | "right",
  analysis: CareerAnalysisSummary,
  locale: LocaleCode,
): string => {
  if (locale !== "en") return row[side];
  if (row.key === "maxRank") return formatHighestRankDisplayName(analysis.status.history.maxRank, "en");
  if (row.key === "record") {
    return formatRecordLabel({
      totalWins: analysis.status.history.totalWins,
      totalLosses: analysis.status.history.totalLosses,
      totalAbsent: analysis.status.history.totalAbsent,
    }, locale);
  }
  if (row.key === "classification") return formatClassificationLabel(analysis.classificationLabel, locale);
  if (row.key === "tags") return analysis.autoTags.map((tag) => formatAutoTagLabel(tag, locale)).join(" / ") || "-";
  return localizeMetricUnitText(row[side], locale);
};

const buildComparisonComments = (
  comparisonComments: string[],
  left: CareerAnalysisSummary | null | undefined,
  right: CareerAnalysisSummary | null | undefined,
  locale: LocaleCode,
): string[] => {
  if (locale !== "en") return comparisonComments;
  if (!left || !right) return ["Select two saved careers with detail data to compare them."];
  const comments: string[] = [];
  if (left.status.history.maxRank.name !== right.status.history.maxRank.name || left.status.history.maxRank.division !== right.status.history.maxRank.division) {
    comments.push("The two careers reached different rank ceilings.");
  }
  if (Math.abs(left.metrics.winRate - right.metrics.winRate) >= 0.03) {
    comments.push("The career win rates diverge enough to change the reading.");
  }
  if (Math.abs(left.metrics.yushoTotal - right.metrics.yushoTotal) > 0) {
    comments.push("Yusho count is one of the clearest differences.");
  }
  return comments.length > 0 ? comments.slice(0, 3) : ["The major metrics are close; inspect basho records for the difference."];
};

const buildPolyline = (
  points: CareerTrajectorySeriesPoint[],
  mode: "rank" | "winRate",
  width: number,
  height: number,
): string => {
  if (points.length === 0) return "";
  const maxSeq = Math.max(1, ...points.map((point) => point.bashoSeq));
  const rawValues = points.map((point) => mode === "rank" ? point.rankValue : point.winRate * 100);
  const minValue = mode === "rank" ? Math.min(...rawValues) : 0;
  const maxValue = mode === "rank" ? Math.max(...rawValues) : 100;
  const range = Math.max(1, maxValue - minValue);
  return points.map((point) => {
    const value = mode === "rank" ? point.rankValue : point.winRate * 100;
    const x = ((point.bashoSeq - 1) / Math.max(1, maxSeq - 1)) * width;
    const y = mode === "rank"
      ? ((value - minValue) / range) * height
      : height - ((value - minValue) / range) * height;
    return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
  }).join(" ");
};

const MiniSeriesChart: React.FC<{
  title: string;
  mode: "rank" | "winRate";
  leftLabel: string;
  rightLabel: string;
  left: CareerTrajectorySeriesPoint[];
  right: CareerTrajectorySeriesPoint[];
  locale: LocaleCode;
}> = ({ title, mode, leftLabel, rightLabel, left, right, locale }) => {
  const width = 520;
  const height = 160;
  const leftLine = buildPolyline(left, mode, width, height);
  const rightLine = buildPolyline(right, mode, width, height);
  const markers = [...left, ...right].filter((point) => point.marker);
  return (
    <section className={styles.miniChart}>
      <div className={styles.miniChartHead}>
        <span>{title}</span>
        <em>{mode === "rank" ? (locale === "en" ? "Higher is better" : "上ほど高位") : (locale === "en" ? "Cumulative win rate" : "累積勝率")}</em>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} className={styles.chartGridLine} />
        <polyline points={leftLine} className={styles.chartLineLeft} />
        <polyline points={rightLine} className={styles.chartLineRight} />
        {markers.slice(0, 18).map((point, index) => {
          const x = ((point.bashoSeq - 1) / Math.max(1, Math.max(...markers.map((entry) => entry.bashoSeq)) - 1)) * width;
          return <circle key={`${point.bashoSeq}-${point.marker}-${index}`} cx={x} cy={point.marker === "INJURY" ? height - 14 : 14} r="3" className={styles.chartMarker} />;
        })}
      </svg>
      <div className={styles.chartLegend}>
        <span data-side="left">{leftLabel}</span>
        <span data-side="right">{rightLabel}</span>
      </div>
    </section>
  );
};

const RivalDigestCards: React.FC<{ analysis: CareerAnalysisSummary; locale: LocaleCode }> = ({ analysis, locale }) => {
  const digest = analysis.status.careerRivalryDigest;
  if (!digest) return null;
  const entries = [
    ...digest.titleBlockers.map((entry) => ({ key: `title-${entry.opponentId}`, label: locale === "en" ? "Title-race rival" : "優勝争いの宿敵", name: entry.shikona, record: formatRecordLabel({ totalWins: entry.headToHead.wins, totalLosses: entry.headToHead.losses, totalAbsent: 0 }, locale), reason: entry.featuredReason })),
    ...digest.eraTitans.map((entry) => ({ key: `era-${entry.opponentId}`, label: locale === "en" ? "Era wall" : "時代の壁", name: entry.shikona, record: formatRecordLabel({ totalWins: entry.headToHead.wins, totalLosses: entry.headToHead.losses, totalAbsent: 0 }, locale), reason: entry.featuredReason })),
    ...digest.nemesis.map((entry) => ({ key: `nemesis-${entry.opponentId}`, label: locale === "en" ? "Nemesis" : "天敵", name: entry.shikona, record: formatRecordLabel({ totalWins: entry.headToHead.wins, totalLosses: entry.headToHead.losses, totalAbsent: 0 }, locale), reason: entry.featuredReason })),
  ].slice(0, 4);
  if (entries.length === 0) return null;
  return (
    <div className={styles.rivalCards}>
      {entries.map((entry) => (
        <article key={entry.key} className={styles.rivalCard}>
          <div className={styles.detailChip}>{entry.label}</div>
          <div className={styles.cardTitle}>{entry.name}</div>
          <div className={styles.cardRecord}>{locale === "en" ? `Career ${entry.record}` : `通算 ${entry.record}`}</div>
          <p>{locale === "en" ? "A rivalry note is recorded for this saved career." : entry.reason}</p>
        </article>
      ))}
    </div>
  );
};

const SelectFilter: React.FC<{
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}> = ({ label, value, options, onChange }) => (
  <label className={styles.selectFilter}>
    <span>{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map(([optionValue, optionLabel]) => (
        <option key={optionValue} value={optionValue}>{optionLabel}</option>
      ))}
    </select>
  </label>
);

const CareerSelect: React.FC<{
  label: string;
  value: string;
  items: ArchiveViewItem[];
  locale: LocaleCode;
  onChange: (value: string) => void;
}> = ({ label, value, items, locale, onChange }) => (
  <label className={styles.selectFilter}>
    <span>{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {items.map((item) => (
        <option key={item.id} value={item.id}>{item.shikona} / {formatRankName(item.maxRank, locale)}</option>
      ))}
    </select>
  </label>
);

export const ArchiveScreen: React.FC<ArchiveScreenProps> = ({
  items,
  onOpen,
  onDelete,
}) => {
  const { locale } = useLocale();
  const [mode, setMode] = React.useState<ArchiveMode>("SHELF");
  const [filter, setFilter] = React.useState<ArchiveFilter>("ALL");
  const [sortBy, setSortBy] = React.useState<ArchiveSort>("RECENT");
  const [rankFilter, setRankFilter] = React.useState<RankFilter>("ALL");
  const [winRateFilter, setWinRateFilter] = React.useState<WinRateFilter>("ALL");
  const [stanceFilter, setStanceFilter] = React.useState<ObservationStanceId | "ALL">("ALL");
  const [tagFilter, setTagFilter] = React.useState<CareerSaveTag | "ALL">("ALL");
  const [keyword, setKeyword] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(items[0]?.id ?? null);
  const [compareLeftId, setCompareLeftId] = React.useState<string | null>(items[0]?.id ?? null);
  const [compareRightId, setCompareRightId] = React.useState<string | null>(items[1]?.id ?? null);
  const [similarTargetId, setSimilarTargetId] = React.useState<string | null>(items[0]?.id ?? null);

  React.useEffect(() => {
    if (items.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0].id);
    }
  }, [items, selectedId]);

  const viewItems = React.useMemo<ArchiveViewItem[]>(
    () => items.map((item) => ({
      ...item,
      analysis: item.finalStatus ? buildCareerAnalysisSummary(item.finalStatus) : null,
    })),
    [items],
  );
  const shelfSummary = React.useMemo(
    () => buildShelfSummary(viewItems, locale),
    [locale, viewItems],
  );

  const filteredItems = React.useMemo(() => {
    const normalized = keyword.trim();
    return viewItems.filter((item) => {
      if (filter === "YOKOZUNA" && item.maxRank.name !== "横綱") return false;
      if (filter === "YUSHO" && item.yushoCount.makuuchi <= 0) return false;
      if (filter === "EXPERIMENT" && item.observationRuleMode !== "EXPERIMENT") return false;
      if (filter === "TAGGED" && !item.saveTags?.length) return false;
      if (filter === "RARE" && !(item.analysis?.metrics.rarityScore ?? 0)) return false;
      if (filter === "RARE" && (item.analysis?.metrics.rarityScore ?? 0) < 45) return false;
      if (filter === "INJURY" && (item.analysis?.metrics.injuryEventCount ?? 0) <= 0) return false;
      if (filter === "RIVAL" && (item.analysis?.metrics.rivalScore ?? 0) < 25) return false;
      if (filter === "STABLE" && (item.analysis?.metrics.stabilityScore ?? 0) < 60) return false;
      if (rankFilter === "YOKOZUNA_OZEKI" && !["横綱", "大関"].includes(item.maxRank.name)) return false;
      if (rankFilter === "SANYAKU" && !["横綱", "大関", "関脇", "小結"].includes(item.maxRank.name)) return false;
      if (rankFilter === "MAKUUCHI" && item.maxRank.division !== "Makuuchi") return false;
      if (rankFilter === "JURYO_OR_LOWER" && (item.maxRank.division === "Makuuchi" || ["横綱", "大関", "関脇", "小結"].includes(item.maxRank.name))) return false;
      const winRate = item.analysis?.metrics.winRate ?? resolveWinRate(item);
      if (winRateFilter === "HIGH" && winRate < 0.58) return false;
      if (winRateFilter === "MID" && (winRate < 0.48 || winRate >= 0.58)) return false;
      if (winRateFilter === "LOW" && winRate >= 0.48) return false;
      if (stanceFilter !== "ALL" && item.observationStanceId !== stanceFilter) return false;
      if (tagFilter !== "ALL" && !item.saveTags?.includes(tagFilter)) return false;
      if (!normalized) return true;
      return (
        item.shikona.includes(normalized) ||
        formatRankName(item.maxRank, locale).includes(normalized) ||
        (item.title ?? "").includes(normalized) ||
        (item.observerMemo ?? "").includes(normalized) ||
        (item.analysis?.classificationLabel ?? "").includes(normalized)
      );
    }).sort((left, right) => {
      if (sortBy === "SCORE") {
        const scoreDelta = (right.clearScore ?? 0) - (left.clearScore ?? 0);
        if (scoreDelta !== 0) return scoreDelta;
        const rankDelta = (left.bestScoreRank ?? Number.MAX_SAFE_INTEGER) - (right.bestScoreRank ?? Number.MAX_SAFE_INTEGER);
        if (rankDelta !== 0) return rankDelta;
      }
      const numericDelta = resolveSortValue(right, sortBy) - resolveSortValue(left, sortBy);
      if (numericDelta !== 0) return numericDelta;
      const savedDelta = (right.savedAt || right.updatedAt || "").localeCompare(left.savedAt || left.updatedAt || "");
      if (savedDelta !== 0) return savedDelta;
      return right.shikona.localeCompare(left.shikona, "ja");
    });
  }, [filter, keyword, locale, rankFilter, sortBy, stanceFilter, tagFilter, viewItems, winRateFilter]);

  const selectedItem =
    filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? null;
  const compareLeft = viewItems.find((item) => item.id === compareLeftId) ?? viewItems[0] ?? null;
  const compareRight = viewItems.find((item) => item.id === compareRightId) ?? viewItems.find((item) => item.id !== compareLeft?.id) ?? null;
  const similarTarget = viewItems.find((item) => item.id === similarTargetId) ?? viewItems[0] ?? null;
  const comparison = React.useMemo(
    () => compareLeft?.analysis && compareRight?.analysis
      ? buildCareerComparisonSummary(compareLeft.analysis, compareRight.analysis)
      : null,
    [compareLeft, compareRight],
  );
  const similarItems = React.useMemo(
    () => similarTarget?.analysis
      ? listSimilarCareers(
        similarTarget.analysis,
        viewItems.filter((item) => item.id !== similarTarget.id).map((item) => item.analysis).filter((entry): entry is CareerAnalysisSummary => Boolean(entry)),
      )
      : [],
    [similarTarget, viewItems],
  );
  const generationSummary = React.useMemo(() => {
    if (!selectedItem?.analysis) return null;
    const cohortKey = selectedItem.careerStartYearMonth.slice(0, 4) || "不明";
    const cohort = viewItems
      .filter((item) => item.careerStartYearMonth.startsWith(cohortKey))
      .map((item) => item.analysis)
      .filter((entry): entry is CareerAnalysisSummary => Boolean(entry));
    return buildGenerationSummary(selectedItem.analysis, cohort, cohortKey);
  }, [selectedItem, viewItems]);

  React.useEffect(() => {
    if (selectedItem && selectedItem.id !== selectedId) {
      setSelectedId(selectedItem.id);
    }
  }, [selectedId, selectedItem]);

  return (
    <div className={styles.layout}>
      <section className={cn(surface.panel, styles.indexPanel, "space-y-4")}>
        <div>
          <div className={typography.kicker}>{locale === "en" ? "Private Archive" : "私設書架"}</div>
          <div className={typography.panelTitle}>{locale === "en" ? "Record Index" : "書架の索引"}</div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={styles.filterChip} data-active={mode === "SHELF"} onClick={() => setMode("SHELF")}>
            <span>{locale === "en" ? "Shelf" : "書架"}</span>
            <Archive className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={styles.filterChip} data-active={mode === "COMPARE"} onClick={() => setMode("COMPARE")}>
            <span>{locale === "en" ? "Compare Two" : "二人を並べる"}</span>
            <GitCompare className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={styles.filterChip} data-active={mode === "SIMILAR"} onClick={() => setMode("SIMILAR")}>
            <span>{locale === "en" ? "Find Similar" : "似た一代を探す"}</span>
            <BarChart3 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className={styles.searchField}>
          <Search className="h-4 w-4 text-text-faint" />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={locale === "en" ? "Search shikona or highest rank" : "四股名や最高位で検索"}
            aria-label={locale === "en" ? "Search saved records" : "保存済み記録を検索"}
          />
        </div>

        <div className={styles.filterGroup}>
          <div className={typography.panelTitle}>{locale === "en" ? "Basic Filters" : "基本フィルタ"}</div>
          {[
            { id: "ALL" as const, label: locale === "en" ? "All" : "すべて", count: items.length },
            {
              id: "YUSHO" as const,
              label: locale === "en" ? "Makuuchi yusho" : "幕内優勝経験",
              count: items.filter((item) => item.yushoCount.makuuchi > 0).length,
            },
            {
              id: "YOKOZUNA" as const,
              label: locale === "en" ? "Reached Yokozuna" : "横綱到達",
              count: items.filter((item) => item.maxRank.name === "横綱").length,
            },
            {
              id: "TAGGED" as const,
              label: locale === "en" ? "Tagged" : "分類あり",
              count: items.filter((item) => item.saveTags?.length).length,
            },
            ...(import.meta.env.DEV
              ? [{
                id: "EXPERIMENT" as const,
                label: locale === "en" ? "Experiment (Legacy)" : "実験記録 (Legacy)",
                count: items.filter((item) => item.observationRuleMode === "EXPERIMENT").length,
              }]
              : []),
          ].map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={styles.filterChip}
              data-active={filter === entry.id}
              onClick={() => setFilter(entry.id)}
            >
              <span>{entry.label}</span>
              <span>{locale === "en" ? entry.count : `${entry.count}件`}</span>
            </button>
          ))}
        </div>

        <div className={styles.filterGroup}>
          <div className={typography.panelTitle}>{locale === "en" ? "Detail Filters" : "詳細フィルタ"}</div>
          {[
            {
              id: "RARE" as const,
              label: locale === "en" ? "Rare record" : "珍記録候補",
              count: viewItems.filter((item) => (item.analysis?.metrics.rarityScore ?? 0) >= 45).length,
            },
            {
              id: "INJURY" as const,
              label: locale === "en" ? "Injury/absence" : "怪我・休場",
              count: viewItems.filter((item) => (item.analysis?.metrics.injuryEventCount ?? 0) > 0).length,
            },
            {
              id: "RIVAL" as const,
              label: locale === "en" ? "Rivalry" : "宿敵あり",
              count: viewItems.filter((item) => (item.analysis?.metrics.rivalScore ?? 0) >= 25).length,
            },
            {
              id: "STABLE" as const,
              label: locale === "en" ? "Stable" : "安定型",
              count: viewItems.filter((item) => (item.analysis?.metrics.stabilityScore ?? 0) >= 60).length,
            },
          ].map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={styles.filterChip}
              data-active={filter === entry.id}
              onClick={() => setFilter(entry.id)}
            >
              <span>{entry.label}</span>
              <span>{locale === "en" ? entry.count : `${entry.count}件`}</span>
            </button>
          ))}
        </div>

        <div className={styles.filterGroup}>
          <div className={typography.panelTitle}>{locale === "en" ? "Drill Down" : "条件を掘る"}</div>
          <SelectFilter label={locale === "en" ? "Highest rank" : "最高位"} value={rankFilter} onChange={(value) => setRankFilter(value as RankFilter)} options={[
            ["ALL", locale === "en" ? "All" : "すべて"],
            ["YOKOZUNA_OZEKI", locale === "en" ? "Yokozuna/Ozeki" : "横綱・大関"],
            ["SANYAKU", locale === "en" ? "Sanyaku+" : "三役以上"],
            ["MAKUUCHI", locale === "en" ? "Makuuchi" : "幕内"],
            ["JURYO_OR_LOWER", locale === "en" ? "Juryo or lower" : "十両以下"],
          ]} />
          <SelectFilter label={locale === "en" ? "Win rate" : "勝率"} value={winRateFilter} onChange={(value) => setWinRateFilter(value as WinRateFilter)} options={[
            ["ALL", locale === "en" ? "All" : "すべて"],
            ["HIGH", locale === "en" ? "High" : "高勝率"],
            ["MID", locale === "en" ? "Standard" : "標準"],
            ["LOW", locale === "en" ? "Low" : "低勝率"],
          ]} />
          {import.meta.env.DEV ? (
            <SelectFilter label={locale === "en" ? "Viewpoint (Legacy)" : "表示視点 (Legacy)"} value={stanceFilter} onChange={(value) => setStanceFilter(value as ObservationStanceId | "ALL")} options={[
              ["ALL", locale === "en" ? "All" : "すべて"],
              ["PROMOTION_EXPECTATION", locale === "en" ? "Promotion" : "出世期待"],
              ["LATE_BLOOM", locale === "en" ? "Late bloom" : "晩成"],
              ["STABILITY", locale === "en" ? "Stability" : "安定"],
              ["TURBULENCE", locale === "en" ? "Turbulence" : "波乱"],
              ["RIVALRY", locale === "en" ? "Rivalry" : "宿敵"],
              ["RARE_RECORD", locale === "en" ? "Rare record" : "珍記録"],
              ["INJURY_COMEBACK", locale === "en" ? "Comeback" : "復帰"],
              ["LONGEVITY", locale === "en" ? "Longevity" : "長寿"],
            ]} />
          ) : null}
          <SelectFilter label={locale === "en" ? "Save tag" : "保存タグ"} value={tagFilter} onChange={(value) => setTagFilter(value as CareerSaveTag | "ALL")} options={[
            ["ALL", locale === "en" ? "All" : "すべて"],
            ...Object.keys(MANUAL_SAVE_TAG_LABELS).map((key) => [key, formatManualTagLabel(key as CareerSaveTag, locale)] as [string, string]),
          ]} />
        </div>

        <div className={styles.filterGroup}>
          <div className={typography.panelTitle}>{locale === "en" ? "Sort" : "並び順"}</div>
          <div className="space-y-2">
            {[
              { id: "RECENT" as const, label: locale === "en" ? "Newest" : "新しい順" },
              { id: "SCORE" as const, label: locale === "en" ? "Score" : "スコア順" },
              { id: "MAX_RANK" as const, label: locale === "en" ? "Highest rank" : "最高位順" },
              { id: "WIN_RATE" as const, label: locale === "en" ? "Win rate" : "勝率順" },
              { id: "MAKUUCHI" as const, label: locale === "en" ? "Makuuchi tenure" : "幕内在位順" },
              { id: "SANYAKU" as const, label: locale === "en" ? "Sanyaku tenure" : "三役在位順" },
              { id: "YUSHO" as const, label: locale === "en" ? "Yusho" : "優勝順" },
              { id: "RETIRE_AGE" as const, label: locale === "en" ? "Retirement age" : "引退年齢順" },
              { id: "MAX_RANK_AGE" as const, label: locale === "en" ? "Peak rank age" : "最高位到達年齢順" },
              { id: "PROMOTION" as const, label: locale === "en" ? "Promotion speed" : "昇進速度順" },
              { id: "STABILITY" as const, label: locale === "en" ? "Stability" : "安定度順" },
              { id: "TURBULENCE" as const, label: locale === "en" ? "Turbulence" : "波乱度順" },
              { id: "RARITY" as const, label: locale === "en" ? "Rarity" : "珍記録度順" },
            ].map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={styles.filterChip}
                data-active={sortBy === entry.id}
                onClick={() => setSortBy(entry.id)}
              >
                <span>{entry.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {mode === "SHELF" ? (
        <section className={cn(surface.panel, styles.shelfPanel, "min-w-0")}>
          <div className={styles.shelfHead}>
            <div>
              <div className={typography.kicker}>{locale === "en" ? "Saved Careers" : "保存した人生"}</div>
              <div className={typography.panelTitle}>{locale === "en" ? "Private Shelf" : "私設書架"}</div>
              <div className="text-sm text-text-dim">
                {locale === "en" ? "Revisit saved rikishi careers as archive record cards." : "観測して残した力士人生を、書架の記録票として読み返します。"}
              </div>
            </div>
            <div className="text-xs text-text-dim">{locale === "en" ? `${filteredItems.length} shown` : `${filteredItems.length}件を表示中`}</div>
          </div>

          <div className={styles.shelfSummary}>
            <article className={styles.summaryHero}>
              <span>{locale === "en" ? "Saved" : "保存済み"}</span>
              <strong>{locale === "en" ? shelfSummary.total : `${shelfSummary.total}件`}</strong>
              <em>{shelfSummary.recentItem ? `${locale === "en" ? "Recent" : "最近"}: ${shelfSummary.recentItem.shikona}` : (locale === "en" ? "No records yet" : "まだ記録はありません")}</em>
            </article>
            <article className={styles.summaryBlock}>
              <span>{locale === "en" ? "Highest Ranks" : "最高位到達者"}</span>
              <div className={styles.summaryChips}>
                {shelfSummary.rankBreakdown.length > 0 ? shelfSummary.rankBreakdown.map((entry) => (
                  <span key={entry.label}>{entry.label} {entry.count}</span>
                )) : <span>{locale === "en" ? "Not counted" : "未集計"}</span>}
              </div>
            </article>
            <article className={styles.summaryBlock}>
              <span>{locale === "en" ? "Win-rate Band" : "勝率帯"}</span>
              <strong>{shelfSummary.winRateLabel}</strong>
            </article>
            <article className={styles.summaryBlock}>
              <span>{locale === "en" ? "Common Tags" : "よく残る札"}</span>
              <div className={styles.summaryChips}>
                {shelfSummary.topTags.length > 0 ? shelfSummary.topTags.map((tag) => (
                  <span key={tag.label}>{tag.label} {tag.count}</span>
                )) : <span>{locale === "en" ? "No save tags" : "保存タグなし"}</span>}
              </div>
            </article>
          </div>

          {filteredItems.length === 0 ? (
            <div className={cn(surface.emptyState, "min-h-[320px]")}>
              <Archive className="h-10 w-10" />
              <div className={surface.emptyStateTitle}>{locale === "en" ? "No saved records match these filters" : "条件に合う保存済み記録はありません"}</div>
            </div>
          ) : (
            <div className={styles.shelfList}>
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={styles.card}
                  data-active={selectedItem?.id === item.id}
                  onClick={() => setSelectedId(item.id)}
                >
                  <div className={styles.cardHead}>
                    <div>
                      <div className={styles.cardTitle}>{item.shikona}</div>
                      <div className={styles.cardLabel}>{resolveArchiveLabel(item, locale)}</div>
                    </div>
                    <div className={styles.cardDate}>{toDateText(item.savedAt || item.updatedAt, locale)}</div>
                  </div>
                  <div className={styles.cardMeta}>
                    <span>{formatRankName(item.maxRank, locale)}</span>
                    <span>{formatRecordLabel(item, locale)}</span>
                  </div>
                  {item.analysis ? (
                    <div className={styles.cardMeta}>
                      <span>{resolveStableName(item, locale)}</span>
                      {import.meta.env.DEV ? (
                        <span>{formatObservationStance(item.observationStanceId, locale)}</span>
                      ) : null}
                      <span>{formatWinRatePercent(item.analysis.metrics.winRate)}</span>
                    </div>
                  ) : null}
                  <div className={styles.cardRecord}>
                    {formatCareerPeriod(item, locale)}
                  </div>
                  <div className={styles.cardRecord}>{resolveReadingLine(item, locale)}</div>
                  {item.saveTags?.length ? (
                    <div className={styles.badges}>
                      {item.saveTags.slice(0, 4).map((tag) => (
                        <span key={tag} className={styles.pill} data-tone="state">{formatManualTagLabel(tag, locale)}</span>
                      ))}
                    </div>
                  ) : null}
                  {item.analysis?.autoTags.length ? (
                    <div className={styles.badges}>
                      {item.analysis.autoTags.slice(0, 3).map((tag) => (
                        <span key={tag} className={styles.pill}>{formatAutoTagLabel(tag, locale)}</span>
                      ))}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </section>
      ) : mode === "COMPARE" ? (
        <section className={cn(surface.panel, styles.shelfPanel, "min-w-0")}>
          <div className={styles.shelfHead}>
            <div>
              <div className={typography.kicker}>{locale === "en" ? "Compare" : "比較"}</div>
              <div className={typography.panelTitle}>{locale === "en" ? "Two Career Comparison" : "二人比較"}</div>
              <div className="text-sm text-text-dim">
                {locale === "en" ? "Select two saved rikishi and read them against the same metrics." : "保存済み力士を二人選び、同じ分析軸で読み比べます。"}
              </div>
            </div>
          </div>
          <div className={styles.compareSelectors}>
            <CareerSelect label={locale === "en" ? "Left" : "左"} value={compareLeft?.id ?? ""} items={viewItems} locale={locale} onChange={setCompareLeftId} />
            <CareerSelect label={locale === "en" ? "Right" : "右"} value={compareRight?.id ?? ""} items={viewItems} locale={locale} onChange={setCompareRightId} />
          </div>
          {comparison && compareLeft && compareRight ? (
            <div className={styles.compareBody}>
              <div className={styles.compareCommentBox}>
                <BarChart3 className="h-4 w-4" />
                <div>
                  {buildComparisonComments(comparison.comments, compareLeft.analysis, compareRight.analysis, locale).map((comment) => (
                    <p key={comment}>{comment}</p>
                  ))}
                </div>
              </div>
              <div className={styles.compareTable}>
                {comparison.metrics.map((row) => (
                  <div key={row.key} className={styles.compareRow} data-winner={row.winner}>
                    <span>{locale === "en" ? COMPARISON_METRIC_EN_LABELS[row.key] ?? row.label : row.label}</span>
                    <strong data-side="left">{compareLeft.analysis ? formatComparisonValue(row, "left", compareLeft.analysis, locale) : row.left}</strong>
                    <strong data-side="right">{compareRight.analysis ? formatComparisonValue(row, "right", compareRight.analysis, locale) : row.right}</strong>
                  </div>
                ))}
              </div>
              {compareLeft.analysis && compareRight.analysis ? (
                <div className={styles.chartCompareGrid}>
                  <MiniSeriesChart
                    title={locale === "en" ? "Rank trajectory comparison" : "番付推移比較"}
                    mode="rank"
                    leftLabel={compareLeft.shikona}
                    rightLabel={compareRight.shikona}
                    left={buildCareerTrajectorySeries(compareLeft.analysis.status)}
                    right={buildCareerTrajectorySeries(compareRight.analysis.status)}
                    locale={locale}
                  />
                  <MiniSeriesChart
                    title={locale === "en" ? "Win-rate trajectory comparison" : "勝率推移比較"}
                    mode="winRate"
                    leftLabel={compareLeft.shikona}
                    rightLabel={compareRight.shikona}
                    left={buildCareerTrajectorySeries(compareLeft.analysis.status)}
                    right={buildCareerTrajectorySeries(compareRight.analysis.status)}
                    locale={locale}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <div className={cn(surface.emptyState, "min-h-[320px]")}>
              <GitCompare className="h-10 w-10" />
              <div className={surface.emptyStateTitle}>{locale === "en" ? "Comparison needs two saved records with detail status" : "比較には詳細ステータスを持つ保存記録が二つ必要です"}</div>
            </div>
          )}
        </section>
      ) : (
        <section className={cn(surface.panel, styles.shelfPanel, "min-w-0")}>
          <div className={styles.shelfHead}>
            <div>
              <div className={typography.kicker}>{locale === "en" ? "Similarity" : "類似検索"}</div>
              <div className={typography.panelTitle}>{locale === "en" ? "Find Similar Careers" : "似た人生を探す"}</div>
              <div className="text-sm text-text-dim">
                {locale === "en" ? "Find saved records close in highest rank, timing, tenure, win rate, injury, and growth pattern." : "最高位、到達年齢、在位、勝率、怪我、成長の流れから近い保存記録を探します。"}
              </div>
            </div>
          </div>
          <div className={styles.compareSelectors}>
            <CareerSelect label={locale === "en" ? "Reference rikishi" : "基準力士"} value={similarTarget?.id ?? ""} items={viewItems} locale={locale} onChange={setSimilarTargetId} />
          </div>
          <div className={styles.similarList}>
            {similarItems.length > 0 ? similarItems.map(({ summary, similarity }) => {
              const item = viewItems.find((entry) => entry.analysis === summary);
              return (
                <article key={`${summary.status.shikona}-${similarity.score}`} className={styles.similarCard}>
                  <div>
                    <div className={styles.cardTitle}>{summary.status.shikona}</div>
                    <div className={styles.cardRecord}>
                      {formatHighestRankDisplayName(summary.status.history.maxRank, locale)} / {formatClassificationLabel(summary.classificationLabel, locale)}
                    </div>
                  </div>
                  <div className={styles.similarScore}>{similarity.score}</div>
                  <div className={styles.badges}>
                    {similarity.reasons.map((reason, index) => (
                      <span key={reason} className={styles.pill}>{locale === "en" ? `Shared trait ${index + 1}` : reason}</span>
                    ))}
                  </div>
                  {item ? (
                    <Button variant="secondary" size="sm" onClick={() => onOpen(item.id)}>
                      {locale === "en" ? "Open Record" : "この記録を開く"}
                    </Button>
                  ) : null}
                </article>
              );
            }) : (
              <div className={cn(surface.emptyState, "min-h-[320px]")}>
                <Search className="h-10 w-10" />
                <div className={surface.emptyStateTitle}>{locale === "en" ? "Similarity search needs saved records with detail status" : "類似検索には詳細ステータスを持つ保存記録が必要です"}</div>
              </div>
            )}
          </div>
        </section>
      )}

      <section className={cn(surface.panel, styles.detailPanel, "space-y-4")}>
        <div>
          <div className={typography.kicker}>{locale === "en" ? "Reading Desk" : "閲覧面"}</div>
          <div className={typography.panelTitle}>{locale === "en" ? "Open Record Book" : "開きかけの記録帳"}</div>
        </div>

        {selectedItem ? (
          <>
            <div className={styles.recordCover}>
              <div className={styles.detailChip}>
                <Star className="h-3.5 w-3.5" />
                {resolveArchiveLabel(selectedItem, locale)}
              </div>
              <div>
                <div className={styles.detailTitle}>{selectedItem.shikona}</div>
                <div className={styles.detailSubtitle}>
                  {locale === "en" ? "Highest rank" : "最高位"} {formatRankName(selectedItem.maxRank, locale)}
                  {selectedItem.title ? ` / ${selectedItem.title}` : ""}
                </div>
              </div>
              <div className={styles.coverLine}>{resolveReadingLine(selectedItem, locale)}</div>
              <div className={styles.coverFacts}>
                <span>{resolveStableName(selectedItem, locale)}</span>
                <span>{formatCareerPeriod(selectedItem, locale)}</span>
                <span>{formatRecordLabel(selectedItem, locale)}</span>
              </div>
            </div>

            <div className={styles.metrics}>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>{locale === "en" ? "Score" : "総評点"}</div>
                <div className={styles.metricValue}>{selectedItem.clearScore ?? 0}</div>
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>{locale === "en" ? "Career Record" : "通算成績"}</div>
                <div className={styles.metricValue}>
                  {formatRecordLabel(selectedItem, locale)}
                </div>
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>{locale === "en" ? "Makuuchi Yusho" : "幕内優勝"}</div>
                <div className={styles.metricValue}>{locale === "en" ? selectedItem.yushoCount.makuuchi : `${selectedItem.yushoCount.makuuchi}回`}</div>
              </div>
            </div>

            {selectedItem.analysis ? (
              <div className={styles.detailRows}>
                <div className={styles.infoRow}>
                  <span>{locale === "en" ? "Class" : "分類"}</span>
                  <span>{formatClassificationLabel(selectedItem.analysis.classificationLabel, locale)}</span>
                </div>
                <div className={styles.infoRow}>
                  <span>{locale === "en" ? "Entry Reading" : "入口条件の読み取り"}</span>
                  <span>{resolveReadingLine(selectedItem, locale)}</span>
                </div>
                {import.meta.env.DEV ? (
                  <div className={styles.infoRow}>
                    <span>{locale === "en" ? "Viewpoint (Legacy)" : "表示視点 (Legacy)"}</span>
                    <span>{formatObservationStance(selectedItem.observationStanceId, locale)}</span>
                  </div>
                ) : null}
                <div className={styles.infoRow}>
                  <span>{locale === "en" ? "Save Score" : "保存推奨"}</span>
                  <span>{locale === "en" ? selectedItem.analysis.saveRecommendation.score : `${selectedItem.analysis.saveRecommendation.score}点`}</span>
                </div>
              </div>
            ) : null}

            {generationSummary ? (
              <div className={styles.detailRows}>
                <div className={styles.infoRow}>
                  <span>{locale === "en" ? "Cohort" : "世代"}</span>
                  <span>{locale === "en" ? `${selectedItem.careerStartYearMonth.slice(0, 4)} cohort / ${generationSummary.cohortSize} rikishi` : `${generationSummary.label} / ${generationSummary.cohortSize}人`}</span>
                </div>
                <div className={styles.infoRow}>
                  <span>{locale === "en" ? "Highest-rank standing" : "最高位順位"}</span>
                  <span>{generationSummary.maxRankStanding ? (locale === "en" ? `No. ${generationSummary.maxRankStanding}` : `${generationSummary.maxRankStanding}位`) : "-"}</span>
                </div>
                <div className={styles.infoRow}>
                  <span>{locale === "en" ? "Win-rate standing" : "勝率順位"}</span>
                  <span>{generationSummary.winRateStanding ? (locale === "en" ? `No. ${generationSummary.winRateStanding}` : `${generationSummary.winRateStanding}位`) : "-"}</span>
                </div>
                {locale === "ja" ? generationSummary.notes.map((note) => (
                  <div key={note} className={styles.infoRow}>
                    <span>世代評</span>
                    <span>{note}</span>
                  </div>
                )) : null}
              </div>
            ) : null}

            {selectedItem.analysis?.status.careerRivalryDigest ? (
              <RivalDigestCards analysis={selectedItem.analysis} locale={locale} />
            ) : null}

            {!!selectedItem.recordBadgeKeys?.length && (
              <div className={styles.badges}>
                {selectedItem.recordBadgeKeys.slice(0, 3).map((badgeKey) => (
                  <span key={badgeKey} className={styles.pill} data-tone="state">
                    {formatRecordBadgeLabel(badgeKey, locale)}
                  </span>
                ))}
              </div>
            )}

            {!!selectedItem.saveTags?.length && (
              <div className={styles.badges}>
                {selectedItem.saveTags.map((tag) => (
                  <span key={tag} className={styles.pill} data-tone="state">
                    {formatManualTagLabel(tag, locale) ?? tag}
                  </span>
                ))}
              </div>
            )}

            {!!selectedItem.analysis?.autoTags.length && (
              <div className={styles.badges}>
                {selectedItem.analysis.autoTags.map((tag) => (
                  <span key={tag} className={styles.pill}>
                    {formatAutoTagLabel(tag, locale)}
                  </span>
                ))}
              </div>
            )}

            {selectedItem.observerMemo && locale === "ja" ? (
              <div className={styles.detailRows}>
                <div className={styles.infoRow}>
                  <span>観測メモ</span>
                  <span>{selectedItem.observerMemo}</span>
                </div>
              </div>
            ) : null}

            <div className={styles.detailRows}>
              <div className={styles.infoRow}>
                <span>{locale === "en" ? "Career Span" : "在位期間"}</span>
                <span>
                  {selectedItem.careerStartYearMonth} - {selectedItem.careerEndYearMonth || (locale === "en" ? "current" : "現在")}
                </span>
              </div>
              <div className={styles.infoRow}>
                <span>{locale === "en" ? "Saved Date" : "保存日"}</span>
                <span>{toDateText(selectedItem.savedAt || selectedItem.updatedAt, locale)}</span>
              </div>
              <div className={styles.infoRow}>
                <span>{locale === "en" ? "Absences" : "休場"}</span>
                <span>{locale === "en" ? selectedItem.totalAbsent : `${selectedItem.totalAbsent}休`}</span>
              </div>
            </div>

            <div className={styles.actions}>
              <Button className="w-full" onClick={() => onOpen(selectedItem.id)}>
                {locale === "en" ? "Read Rank and Basho Records" : "番付推移・場所別を読む"}
              </Button>
              <Button variant="secondary" className="w-full" onClick={() => setMode("COMPARE")}>
                <GitCompare className="mr-2 h-4 w-4" />
                {locale === "en" ? "Compare Two" : "二人を並べる"}
              </Button>
              <Button variant="secondary" className="w-full" onClick={() => {
                setSimilarTargetId(selectedItem.id);
                setMode("SIMILAR");
              }}>
                <BarChart3 className="mr-2 h-4 w-4" />
                {locale === "en" ? "Find Similar Career" : "似た一代を探す"}
              </Button>
              <Button
                variant="danger"
                className="w-full"
                onClick={() => {
                  if (confirm(locale === "en" ? `Delete the saved record for ${selectedItem.shikona}?` : `${selectedItem.shikona}の保存済み記録を削除しますか？`)) {
                    onDelete(selectedItem.id);
                  }
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {locale === "en" ? "Delete This Record" : "この記録を削除する"}
              </Button>
            </div>
          </>
        ) : (
          <div className={cn(surface.emptyState, "min-h-[240px]")}>
            <Archive className="h-10 w-10" />
            <div className={surface.emptyStateTitle}>{locale === "en" ? "No saved records yet" : "まだ保存済み記録がありません"}</div>
          </div>
        )}
      </section>
    </div>
  );
};
