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
  type CareerTrajectorySeriesPoint,
} from "../../../logic/career/analysis";
import { Rank, RikishiStatus } from "../../../logic/models";
import type { CareerSaveTag, ObservationRuleMode, ObservationStanceId } from "../../../logic/models";
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

const formatRankName = (rank: Rank): string => {
  const side = rank.side === "West" ? "西" : rank.side === "East" ? "東" : "";
  if (["横綱", "大関", "関脇", "小結"].includes(rank.name)) return `${side}${rank.name}`;
  const number = rank.number || 1;
  return number === 1 ? `${side}${rank.name}筆頭` : `${side}${rank.name}${number}枚目`;
};

const resolveArchiveLabel = (item: ArchiveItem): string => {
  if (item.bestScoreRank && item.bestScoreRank <= 10) return `総評点歴代${item.bestScoreRank}位`;
  if (item.maxRank.name === "横綱") return "横綱到達";
  if (item.maxRank.name === "大関") return "大関到達";
  if (item.yushoCount.makuuchi > 0) return `幕内優勝 ${item.yushoCount.makuuchi}回`;
  if (item.maxRank.division === "Makuuchi") return "幕内経験";
  if (item.maxRank.division === "Juryo") return "関取経験";
  return "保存済み記録";
};

const toDateText = (value?: string): string => {
  if (!value) return "未保存";
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};

const resolveWinRate = (item: Pick<ArchiveItem, "totalWins" | "totalLosses">): number => {
  const total = item.totalWins + item.totalLosses;
  return total > 0 ? item.totalWins / total : 0;
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
}> = ({ title, mode, leftLabel, rightLabel, left, right }) => {
  const width = 520;
  const height = 160;
  const leftLine = buildPolyline(left, mode, width, height);
  const rightLine = buildPolyline(right, mode, width, height);
  const markers = [...left, ...right].filter((point) => point.marker);
  return (
    <section className={styles.miniChart}>
      <div className={styles.miniChartHead}>
        <span>{title}</span>
        <em>{mode === "rank" ? "上ほど高位" : "累積勝率"}</em>
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

const RivalDigestCards: React.FC<{ analysis: CareerAnalysisSummary }> = ({ analysis }) => {
  const digest = analysis.status.careerRivalryDigest;
  if (!digest) return null;
  const entries = [
    ...digest.titleBlockers.map((entry) => ({ key: `title-${entry.opponentId}`, label: "優勝争いの宿敵", name: entry.shikona, record: `${entry.headToHead.wins}勝${entry.headToHead.losses}敗`, reason: entry.featuredReason })),
    ...digest.eraTitans.map((entry) => ({ key: `era-${entry.opponentId}`, label: "時代の壁", name: entry.shikona, record: `${entry.headToHead.wins}勝${entry.headToHead.losses}敗`, reason: entry.featuredReason })),
    ...digest.nemesis.map((entry) => ({ key: `nemesis-${entry.opponentId}`, label: "天敵", name: entry.shikona, record: `${entry.headToHead.wins}勝${entry.headToHead.losses}敗`, reason: entry.featuredReason })),
  ].slice(0, 4);
  if (entries.length === 0) return null;
  return (
    <div className={styles.rivalCards}>
      {entries.map((entry) => (
        <article key={entry.key} className={styles.rivalCard}>
          <div className={styles.detailChip}>{entry.label}</div>
          <div className={styles.cardTitle}>{entry.name}</div>
          <div className={styles.cardRecord}>通算 {entry.record}</div>
          <p>{entry.reason}</p>
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
  onChange: (value: string) => void;
}> = ({ label, value, items, onChange }) => (
  <label className={styles.selectFilter}>
    <span>{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {items.map((item) => (
        <option key={item.id} value={item.id}>{item.shikona} / {formatRankName(item.maxRank)}</option>
      ))}
    </select>
  </label>
);

export const ArchiveScreen: React.FC<ArchiveScreenProps> = ({
  items,
  onOpen,
  onDelete,
}) => {
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
        formatRankName(item.maxRank).includes(normalized) ||
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
  }, [filter, keyword, rankFilter, sortBy, stanceFilter, tagFilter, viewItems, winRateFilter]);

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
          <div className={typography.kicker}>私設書架</div>
          <div className={typography.panelTitle}>書架の索引</div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={styles.filterChip} data-active={mode === "SHELF"} onClick={() => setMode("SHELF")}>
            <span>一覧</span>
            <Archive className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={styles.filterChip} data-active={mode === "COMPARE"} onClick={() => setMode("COMPARE")}>
            <span>比較</span>
            <GitCompare className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={styles.filterChip} data-active={mode === "SIMILAR"} onClick={() => setMode("SIMILAR")}>
            <span>類似</span>
            <BarChart3 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className={styles.searchField}>
          <Search className="h-4 w-4 text-text-faint" />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="四股名や最高位で検索"
            aria-label="保存済み記録を検索"
          />
        </div>

        <div className={styles.filterGroup}>
          {[
            { id: "ALL" as const, label: "すべて", count: items.length },
            {
              id: "YUSHO" as const,
              label: "幕内優勝経験",
              count: items.filter((item) => item.yushoCount.makuuchi > 0).length,
            },
            {
              id: "YOKOZUNA" as const,
              label: "横綱到達",
              count: items.filter((item) => item.maxRank.name === "横綱").length,
            },
            {
              id: "TAGGED" as const,
              label: "分類あり",
              count: items.filter((item) => item.saveTags?.length).length,
            },
            {
              id: "EXPERIMENT" as const,
              label: "実験記録",
              count: items.filter((item) => item.observationRuleMode === "EXPERIMENT").length,
            },
            {
              id: "RARE" as const,
              label: "珍記録候補",
              count: viewItems.filter((item) => (item.analysis?.metrics.rarityScore ?? 0) >= 45).length,
            },
            {
              id: "INJURY" as const,
              label: "怪我・休場",
              count: viewItems.filter((item) => (item.analysis?.metrics.injuryEventCount ?? 0) > 0).length,
            },
            {
              id: "RIVAL" as const,
              label: "宿敵あり",
              count: viewItems.filter((item) => (item.analysis?.metrics.rivalScore ?? 0) >= 25).length,
            },
            {
              id: "STABLE" as const,
              label: "安定型",
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
              <span>{entry.count}件</span>
            </button>
          ))}
        </div>

        <div className={styles.filterGroup}>
          <div className={typography.panelTitle}>高度フィルタ</div>
          <SelectFilter label="最高位" value={rankFilter} onChange={(value) => setRankFilter(value as RankFilter)} options={[
            ["ALL", "すべて"],
            ["YOKOZUNA_OZEKI", "横綱・大関"],
            ["SANYAKU", "三役以上"],
            ["MAKUUCHI", "幕内"],
            ["JURYO_OR_LOWER", "十両以下"],
          ]} />
          <SelectFilter label="勝率" value={winRateFilter} onChange={(value) => setWinRateFilter(value as WinRateFilter)} options={[
            ["ALL", "すべて"],
            ["HIGH", "高勝率"],
            ["MID", "標準"],
            ["LOW", "低勝率"],
          ]} />
          <SelectFilter label="観測" value={stanceFilter} onChange={(value) => setStanceFilter(value as ObservationStanceId | "ALL")} options={[
            ["ALL", "すべて"],
            ["PROMOTION_EXPECTATION", "出世期待"],
            ["LATE_BLOOM", "晩成"],
            ["STABILITY", "安定"],
            ["TURBULENCE", "波乱"],
            ["RIVALRY", "宿敵"],
            ["RARE_RECORD", "珍記録"],
            ["INJURY_COMEBACK", "復帰"],
            ["LONGEVITY", "長寿"],
          ]} />
          <SelectFilter label="保存タグ" value={tagFilter} onChange={(value) => setTagFilter(value as CareerSaveTag | "ALL")} options={[
            ["ALL", "すべて"],
            ...Object.entries(MANUAL_SAVE_TAG_LABELS).map(([key, label]) => [key, label] as [string, string]),
          ]} />
        </div>

        <div className={styles.filterGroup}>
          <div className={typography.panelTitle}>並び順</div>
          <div className="space-y-2">
            {[
              { id: "RECENT" as const, label: "新しい順" },
              { id: "SCORE" as const, label: "スコア順" },
              { id: "MAX_RANK" as const, label: "最高位順" },
              { id: "WIN_RATE" as const, label: "勝率順" },
              { id: "MAKUUCHI" as const, label: "幕内在位順" },
              { id: "SANYAKU" as const, label: "三役在位順" },
              { id: "YUSHO" as const, label: "優勝順" },
              { id: "RETIRE_AGE" as const, label: "引退年齢順" },
              { id: "MAX_RANK_AGE" as const, label: "最高位到達年齢順" },
              { id: "PROMOTION" as const, label: "出世速度順" },
              { id: "STABILITY" as const, label: "安定度順" },
              { id: "TURBULENCE" as const, label: "波乱度順" },
              { id: "RARITY" as const, label: "珍記録度順" },
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
              <div className={typography.kicker}>保存した人生</div>
              <div className={typography.panelTitle}>保存済み記録</div>
              <div className="text-sm text-text-dim">書架から一冊選ぶと、右側に開きかけの記録帳を表示します。</div>
            </div>
            <div className="text-xs text-text-dim">{filteredItems.length}件を表示中</div>
          </div>

          {filteredItems.length === 0 ? (
            <div className={cn(surface.emptyState, "min-h-[320px]")}>
              <Archive className="h-10 w-10" />
              <div className={surface.emptyStateTitle}>条件に合う保存済み記録はありません</div>
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
                      <div className={styles.cardLabel}>{resolveArchiveLabel(item)}</div>
                    </div>
                    <div className={styles.cardDate}>{toDateText(item.savedAt || item.updatedAt)}</div>
                  </div>
                  <div className={styles.cardMeta}>
                    <span>{formatRankName(item.maxRank)}</span>
                    <span>{item.yushoCount.makuuchi}回</span>
                    <span>{item.clearScore ?? 0}点</span>
                  </div>
                  {item.analysis ? (
                    <div className={styles.cardMeta}>
                      <span>{item.analysis.classificationLabel}</span>
                      <span>{resolveObservationStanceLabel(item.observationStanceId)}</span>
                      <span>珍{Math.round(item.analysis.metrics.rarityScore)}</span>
                    </div>
                  ) : null}
                  <div className={styles.cardRecord}>
                    {item.totalWins}勝 {item.totalLosses}敗{item.totalAbsent > 0 ? ` ${item.totalAbsent}休` : ""}
                  </div>
                  {item.analysis?.saveRecommendation.reasons[0] ? (
                    <div className={styles.cardRecord}>{item.analysis.saveRecommendation.reasons[0]}</div>
                  ) : null}
                  {item.saveTags?.length ? (
                    <div className={styles.cardRecord}>分類 {item.saveTags.length}件</div>
                  ) : null}
                  {item.analysis?.autoTags.length ? (
                    <div className={styles.badges}>
                      {item.analysis.autoTags.slice(0, 3).map((tag) => (
                        <span key={tag} className={styles.pill}>{AUTO_TAG_LABELS[tag]}</span>
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
              <div className={typography.kicker}>比較</div>
              <div className={typography.panelTitle}>二人比較</div>
              <div className="text-sm text-text-dim">保存済み力士を二人選び、同じ分析軸で読み比べます。</div>
            </div>
          </div>
          <div className={styles.compareSelectors}>
            <CareerSelect label="左" value={compareLeft?.id ?? ""} items={viewItems} onChange={setCompareLeftId} />
            <CareerSelect label="右" value={compareRight?.id ?? ""} items={viewItems} onChange={setCompareRightId} />
          </div>
          {comparison && compareLeft && compareRight ? (
            <div className={styles.compareBody}>
              <div className={styles.compareCommentBox}>
                <BarChart3 className="h-4 w-4" />
                <div>
                  {comparison.comments.map((comment) => (
                    <p key={comment}>{comment}</p>
                  ))}
                </div>
              </div>
              <div className={styles.compareTable}>
                {comparison.metrics.map((row) => (
                  <div key={row.key} className={styles.compareRow} data-winner={row.winner}>
                    <span>{row.label}</span>
                    <strong data-side="left">{row.left}</strong>
                    <strong data-side="right">{row.right}</strong>
                  </div>
                ))}
              </div>
              {compareLeft.analysis && compareRight.analysis ? (
                <div className={styles.chartCompareGrid}>
                  <MiniSeriesChart
                    title="番付推移比較"
                    mode="rank"
                    leftLabel={compareLeft.shikona}
                    rightLabel={compareRight.shikona}
                    left={buildCareerTrajectorySeries(compareLeft.analysis.status)}
                    right={buildCareerTrajectorySeries(compareRight.analysis.status)}
                  />
                  <MiniSeriesChart
                    title="勝率推移比較"
                    mode="winRate"
                    leftLabel={compareLeft.shikona}
                    rightLabel={compareRight.shikona}
                    left={buildCareerTrajectorySeries(compareLeft.analysis.status)}
                    right={buildCareerTrajectorySeries(compareRight.analysis.status)}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <div className={cn(surface.emptyState, "min-h-[320px]")}>
              <GitCompare className="h-10 w-10" />
              <div className={surface.emptyStateTitle}>比較には詳細ステータスを持つ保存記録が二つ必要です</div>
            </div>
          )}
        </section>
      ) : (
        <section className={cn(surface.panel, styles.shelfPanel, "min-w-0")}>
          <div className={styles.shelfHead}>
            <div>
              <div className={typography.kicker}>類似検索</div>
              <div className={typography.panelTitle}>似た人生を探す</div>
              <div className="text-sm text-text-dim">最高位、到達年齢、在位、勝率、怪我、成長型から近い保存記録を探します。</div>
            </div>
          </div>
          <div className={styles.compareSelectors}>
            <CareerSelect label="基準力士" value={similarTarget?.id ?? ""} items={viewItems} onChange={setSimilarTargetId} />
          </div>
          <div className={styles.similarList}>
            {similarItems.length > 0 ? similarItems.map(({ summary, similarity }) => {
              const item = viewItems.find((entry) => entry.analysis === summary);
              return (
                <article key={`${summary.status.shikona}-${similarity.score}`} className={styles.similarCard}>
                  <div>
                    <div className={styles.cardTitle}>{summary.status.shikona}</div>
                    <div className={styles.cardRecord}>{summary.maxRankLabel} / {summary.classificationLabel}</div>
                  </div>
                  <div className={styles.similarScore}>{similarity.score}</div>
                  <div className={styles.badges}>
                    {similarity.reasons.map((reason) => (
                      <span key={reason} className={styles.pill}>{reason}</span>
                    ))}
                  </div>
                  {item ? (
                    <Button variant="secondary" size="sm" onClick={() => onOpen(item.id)}>
                      この記録を開く
                    </Button>
                  ) : null}
                </article>
              );
            }) : (
              <div className={cn(surface.emptyState, "min-h-[320px]")}>
                <Search className="h-10 w-10" />
                <div className={surface.emptyStateTitle}>類似検索には詳細ステータスを持つ保存記録が必要です</div>
              </div>
            )}
          </div>
        </section>
      )}

      <section className={cn(surface.panel, styles.detailPanel, "space-y-4")}>
        <div>
          <div className={typography.kicker}>閲覧面</div>
          <div className={typography.panelTitle}>開きかけの記録帳</div>
        </div>

        {selectedItem ? (
          <>
            <div className={styles.detailHead}>
              <div className={styles.detailChip}>
                <Star className="h-3.5 w-3.5" />
                {resolveArchiveLabel(selectedItem)}
              </div>
              <div className={styles.detailTitle}>{selectedItem.shikona}</div>
              <div className={styles.detailSubtitle}>
                最高位 {formatRankName(selectedItem.maxRank)}
                {selectedItem.title ? ` / ${selectedItem.title}` : ""}
              </div>
            </div>

            <div className={styles.metrics}>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>総評点</div>
                <div className={styles.metricValue}>{selectedItem.clearScore ?? 0}</div>
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>通算成績</div>
                <div className={styles.metricValue}>
                  {selectedItem.totalWins}勝 {selectedItem.totalLosses}敗
                </div>
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>幕内優勝</div>
                <div className={styles.metricValue}>{selectedItem.yushoCount.makuuchi}回</div>
              </div>
            </div>

            {selectedItem.analysis ? (
              <div className={styles.detailRows}>
                <div className={styles.infoRow}>
                  <span>分類</span>
                  <span>{selectedItem.analysis.classificationLabel}</span>
                </div>
                <div className={styles.infoRow}>
                  <span>観測スタンス</span>
                  <span>{resolveObservationStanceLabel(selectedItem.observationStanceId)}</span>
                </div>
                <div className={styles.infoRow}>
                  <span>保存推奨</span>
                  <span>{selectedItem.analysis.saveRecommendation.score}点</span>
                </div>
              </div>
            ) : null}

            {generationSummary ? (
              <div className={styles.detailRows}>
                <div className={styles.infoRow}>
                  <span>世代</span>
                  <span>{generationSummary.label} / {generationSummary.cohortSize}人</span>
                </div>
                <div className={styles.infoRow}>
                  <span>最高位順位</span>
                  <span>{generationSummary.maxRankStanding ? `${generationSummary.maxRankStanding}位` : "-"}</span>
                </div>
                <div className={styles.infoRow}>
                  <span>勝率順位</span>
                  <span>{generationSummary.winRateStanding ? `${generationSummary.winRateStanding}位` : "-"}</span>
                </div>
                {generationSummary.notes.map((note) => (
                  <div key={note} className={styles.infoRow}>
                    <span>世代評</span>
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {selectedItem.analysis?.status.careerRivalryDigest ? (
              <RivalDigestCards analysis={selectedItem.analysis} />
            ) : null}

            {!!selectedItem.recordBadgeKeys?.length && (
              <div className={styles.badges}>
                {selectedItem.recordBadgeKeys.slice(0, 3).map((badgeKey) => (
                  <span key={badgeKey} className={styles.pill} data-tone="state">
                    {resolveCareerRecordBadgeLabel(
                      badgeKey as Parameters<typeof resolveCareerRecordBadgeLabel>[0],
                    )}
                  </span>
                ))}
              </div>
            )}

            {!!selectedItem.saveTags?.length && (
              <div className={styles.badges}>
                {selectedItem.saveTags.map((tag) => (
                  <span key={tag} className={styles.pill} data-tone="state">
                    {MANUAL_SAVE_TAG_LABELS[tag] ?? tag}
                  </span>
                ))}
              </div>
            )}

            {!!selectedItem.analysis?.autoTags.length && (
              <div className={styles.badges}>
                {selectedItem.analysis.autoTags.map((tag) => (
                  <span key={tag} className={styles.pill}>
                    {AUTO_TAG_LABELS[tag]}
                  </span>
                ))}
              </div>
            )}

            {selectedItem.observerMemo ? (
              <div className={styles.detailRows}>
                <div className={styles.infoRow}>
                  <span>観測メモ</span>
                  <span>{selectedItem.observerMemo}</span>
                </div>
              </div>
            ) : null}

            <div className={styles.detailRows}>
              <div className={styles.infoRow}>
                <span>在位期間</span>
                <span>
                  {selectedItem.careerStartYearMonth} 〜 {selectedItem.careerEndYearMonth || "現在"}
                </span>
              </div>
              <div className={styles.infoRow}>
                <span>保存日</span>
                <span>{toDateText(selectedItem.savedAt || selectedItem.updatedAt)}</span>
              </div>
              <div className={styles.infoRow}>
                <span>休場</span>
                <span>{selectedItem.totalAbsent}休</span>
              </div>
            </div>

            <div className={styles.actions}>
              <Button className="w-full" onClick={() => onOpen(selectedItem.id)}>
                この記録を開く
              </Button>
              <Button
                variant="danger"
                className="w-full"
                onClick={() => {
                  if (confirm(`${selectedItem.shikona}の保存済み記録を削除しますか？`)) {
                    onDelete(selectedItem.id);
                  }
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                この記録を削除する
              </Button>
            </div>
          </>
        ) : (
          <div className={cn(surface.emptyState, "min-h-[240px]")}>
            <Archive className="h-10 w-10" />
            <div className={surface.emptyStateTitle}>まだ保存済み記録がありません</div>
          </div>
        )}
      </section>
    </div>
  );
};
