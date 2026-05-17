import React from "react";
import { Eye, ScrollText, X } from "lucide-react";
import { RikishiStatus } from "../../../logic/models";
import {
  listCareerBanzukeDecisions,
  listCareerBashoRecordsBySeq,
  listCareerImportantTorikumi,
  listCareerPlayerBoutsByBasho,
} from "../../../logic/persistence/careerHistory";
import type { BashoRecordRow } from "../../../logic/persistence/db";
import { useLocale } from "../../../shared/hooks/useLocale";
import { cn } from "../../../shared/lib/cn";
import surface from "../../../shared/styles/surface.module.css";
import typography from "../../../shared/styles/typography.module.css";
import { HoshitoriCareerRecord, HoshitoriTable } from "./HoshitoriTable";
import {
  buildBanzukeSnapshotForSeq,
  buildSnapshotBoutMarks,
  type ReportBanzukeSnapshot,
} from "../utils/reportBanzukeSnapshot";
import {
  formatReportAge,
  formatReportBashoLabel,
  formatReportRankLabel,
  formatReportRecordText,
} from "../utils/reportLocale";
import {
  buildImportantBanzukeDecisionDigests,
  buildImportantDecisionDigest,
  buildImportantTorikumiDigests,
  buildReportTimelineDigest,
  type ReportImportantDecisionDigest,
  type ReportTimelineDigestItem,
} from "../utils/reportTimeline";
import reportCommon from "./reportCommon.module.css";

interface ReportTimelineTabProps {
  items: ReportTimelineDigestItem[];
  status: RikishiStatus;
  careerId?: string | null;
  filter: "IMPORTANT" | "ALL";
  onFilterChange: (filter: "IMPORTANT" | "ALL") => void;
  hoshitoriCareerRecords: HoshitoriCareerRecord[];
  shikona: string;
  isHoshitoriLoading: boolean;
  hoshitoriErrorMessage?: string;
}

interface DecisionSnapshotModalState {
  title: string;
  summary: string;
  snapshot: ReportBanzukeSnapshot;
  boutMarks: Record<string, string>;
}

const EMPTY_IMPORTANT_DECISIONS: ReportImportantDecisionDigest = {
  highlights: [],
  timelineItems: [],
};

const formatRankName = (rank: ReportBanzukeSnapshot["rows"][number]["rank"], locale: "ja" | "en") => {
  if (locale === "en") return formatReportRankLabel(rank, locale);
  if (rank.name === "前相撲") return rank.name;
  const side = rank.side === "West" ? "西" : rank.side === "East" ? "東" : "";
  if (["横綱", "大関", "関脇", "小結"].includes(rank.name)) return `${side}${rank.name}`;
  const number = rank.number || 1;
  return number === 1 ? `${side}${rank.name}筆頭` : `${side}${rank.name}${number}枚目`;
};

const formatTimelineDateLabel = (item: ReportTimelineDigestItem, locale: "ja" | "en"): string => {
  if (locale !== "en") return item.dateLabel;
  if (item.sortYear && item.sortMonth) {
    const bashoLabel = formatReportBashoLabel(item.sortYear, item.sortMonth, locale);
    return item.sortDay ? `${bashoLabel} day ${item.sortDay}` : bashoLabel;
  }
  return item.bashoSeq ? `Basho ${item.bashoSeq}` : "Career event";
};

const formatTimelineLabel = (item: ReportTimelineDigestItem, locale: "ja" | "en"): string => {
  if (locale !== "en") return item.label;
  if (item.entryType === "BANZUKE") return "Banzuke Decision";
  if (item.entryType === "TORIKUMI") return "Key Bout";
  if (item.tone === "state") return "Milestone";
  if (item.tone === "warning") return "Setback";
  if (item.tone === "brand") return "Turning Point";
  return "Career Event";
};

const formatTimelineItems = (item: ReportTimelineDigestItem, locale: "ja" | "en"): string[] => {
  if (locale !== "en") return item.items;
  if (item.entryType === "BANZUKE") return ["A saved banzuke decision is attached to this basho."];
  if (item.entryType === "TORIKUMI") return ["A saved key bout is attached to this basho."];
  if (item.tone === "state") return ["A positive career milestone was recorded here."];
  if (item.tone === "warning") return ["A difficult career event was recorded here."];
  return ["A career event was recorded at this point."];
};

const resolveEntryAge = (status: RikishiStatus): number => {
  if (typeof status.entryAge === "number" && Number.isFinite(status.entryAge)) return status.entryAge;
  const records = status.history.records;
  if (!records.length) return status.age;
  const elapsed = Math.max(0, records[records.length - 1].year - records[0].year);
  return Math.max(15, status.age - elapsed);
};

export const ReportTimelineTab: React.FC<ReportTimelineTabProps> = ({
  items,
  status,
  careerId = null,
  filter,
  onFilterChange,
  hoshitoriCareerRecords,
  shikona,
  isHoshitoriLoading,
  hoshitoriErrorMessage,
}) => {
  const { locale } = useLocale();
  const [importantDecisions, setImportantDecisions] = React.useState<ReportImportantDecisionDigest>(EMPTY_IMPORTANT_DECISIONS);
  const [loading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [bashoRowsBySeq, setBashoRowsBySeq] = React.useState<Map<number, BashoRecordRow[]>>(
    new Map(),
  );
  const [playerBoutsBySeq, setPlayerBoutsBySeq] = React.useState<Map<number, Array<{ day: number; result: "WIN" | "LOSS" | "ABSENT"; kimarite?: string; opponentId?: string; opponentShikona?: string }>>>(
    new Map(),
  );
  const [decisionSnapshotModal, setDecisionSnapshotModal] = React.useState<DecisionSnapshotModalState | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!careerId) {
      setImportantDecisions(EMPTY_IMPORTANT_DECISIONS);
      setBashoRowsBySeq(new Map());
      setPlayerBoutsBySeq(new Map());
      setLoading(false);
      setErrorMessage(null);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setErrorMessage(null);
    void (async () => {
      try {
        const [decisionLogs, importantTorikumiRows, bashoRows, boutsByBasho] = await Promise.all([
          listCareerBanzukeDecisions(careerId),
          listCareerImportantTorikumi(careerId),
          listCareerBashoRecordsBySeq(careerId),
          listCareerPlayerBoutsByBasho(careerId),
        ]);
        if (cancelled) return;
        setImportantDecisions(
          buildImportantDecisionDigest(
            buildImportantBanzukeDecisionDigests(status, decisionLogs, bashoRows),
            buildImportantTorikumiDigests(importantTorikumiRows),
          ),
        );
        setBashoRowsBySeq(new Map(bashoRows.map((entry) => [entry.bashoSeq, entry.rows])));
        setPlayerBoutsBySeq(new Map(boutsByBasho.map((entry) => [entry.bashoSeq, entry.bouts])));
      } catch {
        if (cancelled) return;
        setImportantDecisions(EMPTY_IMPORTANT_DECISIONS);
        setBashoRowsBySeq(new Map());
        setPlayerBoutsBySeq(new Map());
        setErrorMessage(locale === "en" ? "Important decisions could not be loaded, so the normal timeline is shown." : "重要判断の読み出しに失敗したため、通常の転機だけを表示しています。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [careerId, locale, status]);

  React.useEffect(() => {
    if (!decisionSnapshotModal) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDecisionSnapshotModal(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [decisionSnapshotModal]);

  const mergedItems = React.useMemo(() => {
    const entryAge = resolveEntryAge(status);
    return buildReportTimelineDigest(status, entryAge, importantDecisions);
  }, [importantDecisions, status]);

  const visibleItems = React.useMemo(() => {
    const source = importantDecisions.timelineItems.length > 0 || careerId ? mergedItems : items;
    if (filter === "ALL") return source;
    return source.filter((item) => item.isMajor);
  }, [careerId, filter, importantDecisions.timelineItems.length, items, mergedItems]);

  const openTimelineItem = React.useCallback(
    (item: ReportTimelineDigestItem) => {
      if (item.entryType === "BANZUKE" && item.bashoSeq) {
        const playerRecord = status.history.records[item.bashoSeq - 1];
        if (!playerRecord) return;
        const snapshot = buildBanzukeSnapshotForSeq(
          item.bashoSeq,
          playerRecord.rank.division,
          bashoRowsBySeq.get(item.bashoSeq) ?? [],
        );
        const boutMarks = Object.fromEntries(
          buildSnapshotBoutMarks(snapshot, playerBoutsBySeq.get(item.bashoSeq) ?? []),
        );
        setDecisionSnapshotModal({
          title: formatTimelineDateLabel(item, locale),
          summary: formatTimelineItems(item, locale).join(" / "),
          snapshot,
          boutMarks,
        });
        return;
      }
    },
    [bashoRowsBySeq, locale, playerBoutsBySeq, status.history.records],
  );

  return (
    <div className="space-y-4 animate-in">
      <div className={cn(surface.detailCard, "p-4 sm:p-5")}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h3 className={typography.sectionHeader}>
              <ScrollText className="w-4 h-4 text-brand-line" /> {locale === "en" ? "Career Timeline" : "転機の履歴"}
            </h3>
            <p className="text-xs text-text-dim mt-1">
              {locale === "en"
                ? "Major promotions, yusho, absences, banzuke decisions, and key bouts are kept here."
                : "昇進、優勝、長期休場に加え、説明が必要な番付判断と本割だけを差し込みます。"}
            </p>
          </div>
          <div className="flex border border-brand-muted/70 bg-surface-base/80 p-1">
            {(["IMPORTANT", "ALL"] as const).map((nextFilter) => (
              <button
                key={nextFilter}
                onClick={() => onFilterChange(nextFilter)}
                className={reportCommon.tabButton}
                data-active={filter === nextFilter}
              >
                {nextFilter === "IMPORTANT" ? (locale === "en" ? "Key Events" : "主な転機") : (locale === "en" ? "All" : "全件")}
              </button>
            ))}
          </div>
        </div>

        {loading && <div className={reportCommon.empty}>{locale === "en" ? "Loading important decisions." : "重要判断を読み込んでいます。"}</div>}
        {!loading && visibleItems.length > 0 ? (
          <div className="space-y-3">
            {visibleItems.map((item) => (
              <TimelineDigestCard key={item.key} item={item} locale={locale} onOpen={openTimelineItem} />
            ))}
          </div>
        ) : !loading ? (
          <div className={reportCommon.empty}>
            {locale === "en" ? "No timeline events are available for this view." : "表示する転機がありません。まだ静かなキャリアか、出来事ログが不足しています。"}
          </div>
        ) : null}
        {errorMessage && <div className="mt-3 text-xs text-warning-bright">{errorMessage}</div>}
      </div>

      <HoshitoriTable
        careerRecords={hoshitoriCareerRecords}
        shikona={shikona}
        isLoading={isHoshitoriLoading}
        errorMessage={hoshitoriErrorMessage}
      />

      {decisionSnapshotModal && (
        <DecisionSnapshotModal state={decisionSnapshotModal} locale={locale} onClose={() => setDecisionSnapshotModal(null)} />
      )}
    </div>
  );
};

const TimelineDigestCard: React.FC<{
  item: ReportTimelineDigestItem;
  locale: "ja" | "en";
  onOpen: (item: ReportTimelineDigestItem) => void;
}> = ({ item, locale, onOpen }) => {
  const toneClasses =
    item.tone === "state"
      ? "border-state/45 bg-state/10"
      : item.tone === "warning"
        ? "border-warning/45 bg-warning/10"
        : item.tone === "brand"
          ? "border-brand-line/40 bg-brand-line/10"
          : "border-brand-muted/60 bg-surface-base/75";

  return (
    <div className={cn(reportCommon.timelineGroup, "p-3 sm:p-4", toneClasses)}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(typography.label, "text-text")}>{formatTimelineDateLabel(item, locale)}</span>
          <span className="text-[11px] text-text-dim border border-brand-muted/50 px-2 py-0.5">
            {formatReportAge(item.age, locale)}
          </span>
          <span className={cn(typography.label, "text-[11px] text-text px-2 py-0.5 border border-current/30")}>
            {formatTimelineLabel(item, locale)}
          </span>
          {item.isMajor && <span className={cn(typography.label, "text-[11px] text-brand-line")}>{locale === "en" ? "Key" : "重要"}</span>}
        </div>
        {item.entryType === "BANZUKE" && item.bashoSeq && (
          <button
            type="button"
            className={cn(typography.label, "text-[11px] text-brand-line border border-brand-muted/60 px-2 py-1 hover:border-brand-line/50")}
            onClick={() => onOpen(item)}
          >
            <span className="inline-flex items-center gap-1">
              <Eye className="w-3 h-3" />
              {locale === "en" ? "Banzuke" : "番付表"}
            </span>
          </button>
        )}
      </div>
      <ul className="space-y-1 text-sm text-text-dim">
        {formatTimelineItems(item, locale).map((description, index) => (
          <li key={`${item.key}-${index}`} className="leading-relaxed">
            {description}
          </li>
        ))}
      </ul>
    </div>
  );
};

const DecisionSnapshotModal: React.FC<{
  state: DecisionSnapshotModalState;
  locale: "ja" | "en";
  onClose: () => void;
}> = ({ state, locale, onClose }) => (
  <div
    className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center"
    onClick={onClose}
  >
    <div
      className={cn(surface.detailCard, "w-full max-w-4xl max-h-[88vh] overflow-hidden border border-brand-muted/70 shadow-rpg")}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-4 border-b border-brand-muted/60 px-4 py-3 sm:px-5">
        <div className="space-y-1">
          <div className={cn(typography.label, "text-xs text-warning-bright")}>{locale === "en" ? "Important Banzuke Decision" : "重要番付判断"}</div>
          <h4 className="text-sm sm:text-base text-text">{locale === "en" ? `${state.title} banzuke` : `${state.title}の番付表`}</h4>
          <p className="text-xs text-text-dim">{state.summary}</p>
        </div>
        <button
          type="button"
          className="p-2 text-text-dim hover:text-text border border-transparent hover:border-brand-muted/70"
          onClick={onClose}
          aria-label={locale === "en" ? "Close banzuke table" : "番付表を閉じる"}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-2 px-4 py-3 sm:px-5 sm:py-4 overflow-y-auto max-h-[calc(88vh-72px)]">
        {state.snapshot.rows.length === 0 ? (
          <div className={reportCommon.empty}>{locale === "en" ? "No banzuke table is saved for this basho." : "この場所の番付表は保存されていません。"}</div>
        ) : (
          state.snapshot.rows.map((row) => {
            const boutMark = state.boutMarks[row.entityId];
            const highlightClass = row.isPlayer
              ? "border-action/55 bg-action/10"
              : "border-brand-muted/55 bg-surface-base/75";
            return (
              <div
                key={`${state.snapshot.seq}-${row.entityId}`}
                className={`grid grid-cols-[78px_minmax(0,1fr)_70px] sm:grid-cols-[94px_minmax(0,1fr)_92px_120px] gap-2 items-start border px-3 py-2 text-xs ${highlightClass}`}
              >
                <div className="text-text-dim">{formatRankName(row.rank, locale)}</div>
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`${row.isPlayer ? "text-text" : "text-text-dim"} truncate`}>{row.shikona}</span>
                    {boutMark && (
                      <span className={cn(typography.label, "border border-brand-muted/60 px-1.5 py-0.5 text-[10px] text-brand-line")}>
                        {boutMark}
                      </span>
                    )}
                    {row.isYushoWinner && (
                      <span className={cn(typography.label, "border border-warning/45 px-1.5 py-0.5 text-[10px] text-warning-bright")}>
                        {locale === "en" ? "Yusho" : "優勝"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-text">{formatReportRecordText(row.wins, row.losses, row.absent, locale)}</div>
                <div className="hidden sm:block text-text-dim">{row.isPlayer ? (locale === "en" ? "Player" : "プレイヤー") : ""}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  </div>
);
