import React from "react";
import { Eye, ScrollText, Swords, X } from "lucide-react";
import { Rank, RikishiStatus } from "../../../logic/models";
import type { CareerBashoDetail } from "../../../logic/persistence/careerHistory";
import { type PlayerBoutDetail } from "../../../logic/simulation/basho";
import { useLocale } from "../../../shared/hooks/useLocale";
import { cn } from "../../../shared/lib/cn";
import type { LocaleCode } from "../../../shared/lib/locale";
import surface from "../../../shared/styles/surface.module.css";
import typography from "../../../shared/styles/typography.module.css";
import {
  buildBanzukeSnapshotForSeq,
  buildSnapshotBoutMarks,
} from "../utils/reportBanzukeSnapshot";
import {
  buildImportantBanzukeDecisionDigests,
  buildImportantTorikumiDigests,
} from "../utils/reportTimeline";
import {
  formatReportBashoLabel,
  formatReportBoutCount,
  formatReportDivisionLabel,
  formatReportRankLabel,
  formatReportRecordText,
  formatReportSpecialPrizeList,
  textForLocale,
} from "../utils/reportLocale";
import { resolveStableRelationshipLabel } from "../../shared/utils/stablemateReading";
import { readDevBoutExplanationPreviews } from "../utils/boutExplanationPreviewInjection";
import {
  BoutExplanationPanel,
  type PlayerBoutExplanationPreview,
} from "./BoutExplanationPreviewPanel";
import reportCommon from "./reportCommon.module.css";

export interface BashoDetailModalState {
  kind?: "record" | "rank" | "rival";
  bashoSeq: number;
  sourceLabel: string;
  title: string;
  subtitle?: string;
  highlightOpponentId?: string;
  highlightReason?: string;
  anchorRect?: {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
}

interface BashoDetailModalProps {
  state: BashoDetailModalState;
  detail: CareerBashoDetail | null;
  status: RikishiStatus;
  isLoading: boolean;
  errorMessage?: string | null;
  playerBoutExplanationPreviews?: readonly PlayerBoutExplanationPreview[];
  onClose: () => void;
}

interface BashoDetailBodyProps {
  state: BashoDetailModalState;
  detail: CareerBashoDetail | null;
  status: RikishiStatus;
  isLoading: boolean;
  errorMessage?: string | null;
  playerBoutExplanationPreviews?: readonly PlayerBoutExplanationPreview[];
}

const formatRankName = (rank: Rank, locale: LocaleCode): string => {
  if (locale === "en") return formatReportRankLabel(rank, locale);
  if (rank.name === "前相撲") return rank.name;
  const side = rank.side === "West" ? "西" : rank.side === "East" ? "東" : "";
  if (["横綱", "大関", "関脇", "小結"].includes(rank.name)) return `${side}${rank.name}`;
  const number = rank.number || 1;
  return number === 1 ? `${side}${rank.name}筆頭` : `${side}${rank.name}${number}枚目`;
};

const resolveBoutBadge = (result: PlayerBoutDetail["result"], locale: LocaleCode): string => {
  if (result === "WIN") return "○";
  if (result === "LOSS") return "●";
  return locale === "en" ? "A" : "や";
};

const resolveBoutPrimaryLabel = (bout: PlayerBoutDetail, locale: LocaleCode): string => {
  if (bout.opponentShikona) return bout.opponentShikona;
  if (bout.result === "ABSENT") return locale === "en" ? "No bout because of absence" : "休場で取組なし";
  if (bout.result === "WIN" && bout.kimarite === "不戦勝") return locale === "en" ? "Fusen win" : "不戦勝";
  if (bout.result === "LOSS" && bout.kimarite === "不戦敗") return locale === "en" ? "Fusen loss" : "不戦敗";
  return locale === "en" ? "Unknown record" : "記録未詳";
};

const resolveBoutSecondaryLabel = (bout: PlayerBoutDetail, playerRank: Rank, locale: LocaleCode): string => {
  if (bout.result === "ABSENT" && !bout.opponentId && !bout.opponentShikona) {
    return locale === "en" ? "Absent that day; no opponent record is saved." : "その日は休場で、対戦相手の記録は残っていません。";
  }
  if (bout.opponentRankName) {
    const opponentRank = formatRankName({
      division: playerRank.division,
      name: bout.opponentRankName,
      number: bout.opponentRankNumber,
      side: bout.opponentRankSide,
    }, locale);
    return bout.kimarite ? `${opponentRank} / ${bout.kimarite}` : opponentRank;
  }
  if (bout.kimarite === "不戦勝") return locale === "en" ? "Fusen win by opponent absence" : "相手休場による不戦勝";
  if (bout.kimarite === "不戦敗") return locale === "en" ? "Fusen loss by absence" : "本人休場による不戦敗";
  if (bout.result === "ABSENT") return locale === "en" ? "Absent" : "休場";
  return bout.kimarite ? bout.kimarite : locale === "en" ? "No rank record" : "番付記録なし";
};

const resolveStableRelationshipDisplay = (
  row: { stableId?: string },
  playerStableId: string,
  locale: LocaleCode,
): string | undefined => {
  const label = resolveStableRelationshipLabel(row, playerStableId);
  if (locale !== "en") return label;
  if (label === "同部屋") return "Same stable";
  if (label === "同一門") return "Same ichimon";
  return label;
};

const resolvePlayerRank = (
  playerRecord: NonNullable<CareerBashoDetail["playerRecord"]> | RikishiStatus["history"]["records"][number],
): Rank =>
  "rank" in playerRecord
    ? playerRecord.rank
    : {
      division: playerRecord.division as Rank["division"],
      name: playerRecord.rankName,
      number: playerRecord.rankNumber,
      side: playerRecord.rankSide,
    };

export const BashoDetailModal: React.FC<BashoDetailModalProps> = ({
  state,
  detail,
  status,
  isLoading,
  errorMessage,
  playerBoutExplanationPreviews,
  onClose,
}) => {
  const { locale } = useLocale();
  const detailMode = state.kind ?? (state.sourceLabel === "戦績" ? "record" : state.sourceLabel === "番付推移" ? "rank" : "rival");
  const modalStyle = React.useMemo<React.CSSProperties>(() => {
    if (typeof window === "undefined") {
      return {};
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const isCompact = viewportWidth < 768;
    const horizontalPadding = isCompact ? 12 : 20;
    const verticalPadding = isCompact ? 12 : 20;
    const preferredWidth = isCompact
      ? Math.min(viewportWidth - horizontalPadding * 2, 640)
      : detailMode === "record"
        ? Math.min(viewportWidth - horizontalPadding * 2, 980)
        : detailMode === "rank"
          ? Math.min(viewportWidth - horizontalPadding * 2, 1120)
          : Math.min(viewportWidth - horizontalPadding * 2, 1040);
    const maxHeight = isCompact
      ? viewportHeight - verticalPadding * 2
      : detailMode === "record"
        ? viewportHeight - verticalPadding * 2
        : Math.min(viewportHeight - verticalPadding * 2, detailMode === "rank" ? 820 : 780);

    const centeredLeft = Math.max(horizontalPadding, (viewportWidth - preferredWidth) / 2);

    if (isCompact) {
      return {
        width: preferredWidth,
        maxHeight,
        left: centeredLeft,
        top: Math.max(verticalPadding, (viewportHeight - maxHeight) / 2),
      };
    }

    if (detailMode === "rank" || detailMode === "rival" || !state.anchorRect) {
      const desiredHeight = Math.min(maxHeight, detailMode === "rank" ? 780 : 720);
      const centeredTop = Math.max(verticalPadding, Math.min(viewportHeight - desiredHeight - verticalPadding, (viewportHeight - desiredHeight) / 2));
      const anchorMid = state.anchorRect ? (state.anchorRect.top + state.anchorRect.bottom) / 2 : viewportHeight / 2;
      const anchorBias = Math.max(-48, Math.min(48, (anchorMid - viewportHeight / 2) * 0.18));
      return {
        width: preferredWidth,
        maxHeight,
        left: centeredLeft,
        top: centeredTop + anchorBias + (detailMode === "rank" ? -18 : 8),
      };
    }

    const anchor = state.anchorRect;
    const gap = 12;
    const estimatedHeight = Math.min(maxHeight, 720);

    const spaceBelow = viewportHeight - anchor.bottom - verticalPadding;
    const top =
      spaceBelow >= Math.min(estimatedHeight, 320)
        ? Math.min(anchor.bottom + gap, viewportHeight - estimatedHeight - verticalPadding)
        : Math.max(verticalPadding, anchor.top - estimatedHeight - gap);

    return {
      width: preferredWidth,
      maxHeight,
      left: centeredLeft,
      top,
    };
  }, [detailMode, state.anchorRect]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        type="button"
        aria-label={locale === "en" ? "Close basho detail" : "場所詳細を閉じる"}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(surface.detailCard, "fixed overflow-hidden border border-brand-muted/70 shadow-rpg")}
        style={modalStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-brand-muted/60 px-4 py-3 sm:px-5">
          <div className="space-y-1">
            <div className={cn(typography.label, "text-xs text-warning-bright")}>{state.sourceLabel}</div>
            <h4 className="text-sm sm:text-base text-text">{state.title}</h4>
            <p className="text-xs text-text-dim">
              {state.subtitle ?? (locale === "en" ? "Loading basho detail." : "場所の詳細を読み込みます。")}
            </p>
          </div>
          <button
            type="button"
            className="p-2 text-text-dim hover:text-text border border-transparent hover:border-brand-muted/70"
            onClick={onClose}
            aria-label={locale === "en" ? "Close basho detail" : "場所詳細を閉じる"}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-3 sm:px-5 sm:py-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 120px)" }}>
          <BashoDetailBody
            state={state}
            detail={detail}
            status={status}
            isLoading={isLoading}
            errorMessage={errorMessage}
            playerBoutExplanationPreviews={playerBoutExplanationPreviews}
          />
        </div>
      </div>
    </div>
  );
};

export const BashoDetailBody: React.FC<BashoDetailBodyProps> = ({
  state,
  detail,
  status,
  isLoading,
  errorMessage,
  playerBoutExplanationPreviews,
}) => {
  const { locale } = useLocale();
  const detailMode = state.kind ?? (state.sourceLabel === "戦績" ? "record" : state.sourceLabel === "番付推移" ? "rank" : "rival");
  const playerRecord = detail?.playerRecord ?? status.history.records[state.bashoSeq - 1];
  const playerRank = playerRecord ? resolvePlayerRank(playerRecord) : null;
  const devPreviews = React.useMemo(() => readDevBoutExplanationPreviews(), []);
  const persistedPreviews = React.useMemo<PlayerBoutExplanationPreview[]>(() => {
    if (!detail) return [];
    return detail.bouts
      .filter((bout): bout is PlayerBoutDetail & Required<Pick<PlayerBoutDetail, "boutFlowCommentary">> =>
        Boolean(bout.boutFlowCommentary))
      .map((bout) => ({
        bashoSeq: state.bashoSeq,
        day: bout.day,
        commentary: bout.boutFlowCommentary,
      }));
  }, [detail, state.bashoSeq]);
  const mergedPreviews = React.useMemo(() => {
    const previewsByDay = new Map<number, PlayerBoutExplanationPreview>();
    [...devPreviews, ...(playerBoutExplanationPreviews ?? []), ...persistedPreviews]
      .filter((preview) => preview.bashoSeq === state.bashoSeq)
      .forEach((preview) => previewsByDay.set(preview.day, preview));
    return Array.from(previewsByDay.values());
  }, [devPreviews, persistedPreviews, playerBoutExplanationPreviews, state.bashoSeq]);
  const relatedOpponentIds = detail
    ? [...new Set(detail.bouts.map((bout) => bout.opponentId).filter((value): value is string => Boolean(value)))]
    : [];
  const snapshot =
    detail && playerRank
      ? buildBanzukeSnapshotForSeq(state.bashoSeq, playerRank.division, detail.rows, {
        focusRank: playerRank,
        focusEntityIds: [
          "PLAYER",
          ...relatedOpponentIds,
          ...(state.highlightOpponentId ? [state.highlightOpponentId] : []),
        ],
        focusWindow: 4,
        entryPoints: [state.sourceLabel],
        highlightReason: state.highlightReason,
      })
      : null;
  const boutMarks = snapshot && detail ? Object.fromEntries(buildSnapshotBoutMarks(snapshot, detail.bouts)) : {};
  const decisionDigests =
    detail && playerRank
      ? buildImportantBanzukeDecisionDigests(status, detail.banzukeDecisions, [
        {
          bashoSeq: detail.bashoSeq,
          year: detail.year,
          month: detail.month,
          rows: detail.rows,
        },
      ])
      : [];
  const torikumiDigests = detail ? buildImportantTorikumiDigests(detail.importantTorikumi) : [];
  const bashoLabel = detail ? formatReportBashoLabel(detail.year, detail.month, locale) : state.title;

  if (isLoading) return <div className={reportCommon.empty}>{locale === "en" ? "Loading basho detail." : "場所詳細を読み込んでいます。"}</div>;
  if (errorMessage) return <div className={cn(reportCommon.empty, "text-warning-bright")}>{errorMessage}</div>;
  if (!detail || !playerRecord || !playerRank) return null;

  return detailMode === "record" ? (
    <RecordDetailLayout
      bashoLabel={bashoLabel}
      state={state}
      detail={detail}
      playerRecord={playerRecord}
      playerRank={playerRank}
      playerStableId={status.stableId}
      snapshot={snapshot}
      boutMarks={boutMarks}
      playerBoutExplanationPreviews={mergedPreviews}
      locale={locale}
    />
  ) : detailMode === "rank" ? (
    <RankContextLayout
      bashoLabel={bashoLabel}
      state={state}
      detail={detail}
      playerRecord={playerRecord}
      playerRank={playerRank}
      playerStableId={status.stableId}
      snapshot={snapshot}
      boutMarks={boutMarks}
      decisionDigests={decisionDigests}
      torikumiDigests={torikumiDigests}
      locale={locale}
    />
  ) : (
    <RivalContextLayout
      bashoLabel={bashoLabel}
      state={state}
      detail={detail}
      playerRecord={playerRecord}
      playerRank={playerRank}
      playerStableId={status.stableId}
      snapshot={snapshot}
      boutMarks={boutMarks}
      torikumiDigests={torikumiDigests}
      locale={locale}
    />
  );
};

const MetricCard: React.FC<{ label: string; value: string; meta: string }> = ({ label, value, meta }) => (
  <div className={cn(surface.detailCard, "p-4")}>
    <div className={cn(typography.label, "text-[10px] tracking-[0.3em] text-gold/55 uppercase")}>{label}</div>
    <div className={cn(typography.heading, "mt-3 text-lg text-text")}>{value}</div>
    <div className="mt-1 text-xs text-text-dim">{meta}</div>
  </div>
);

const SnapshotList: React.FC<{
  snapshot: any;
  boutMarks: Record<string, string>;
  playerStableId: string;
  highlightOpponentId?: string;
  locale: LocaleCode;
}> = ({ snapshot, boutMarks, playerStableId, highlightOpponentId, locale }) => {
  if (!snapshot) return <div className={reportCommon.empty}>{locale === "en" ? "No banzuke table is saved for this basho." : "この場所の番付表は保存されていません。"}</div>;
  return (
    <div className="space-y-2">
      {snapshot.highlightReason && (
        <div className="border border-brand-muted/60 bg-surface-base/80 px-3 py-2 text-xs text-text-dim leading-relaxed">
          {snapshot.highlightReason}
        </div>
      )}
      {snapshot.rows.map((row: any) => {
        const boutMark = boutMarks[row.entityId];
        const affiliationLabel = row.isPlayer ? undefined : resolveStableRelationshipDisplay(row, playerStableId, locale);
        const highlightClass = row.isPlayer
          ? "border-action/55 bg-action/10"
          : row.entityId === highlightOpponentId
            ? "border-warning/55 bg-warning/10"
            : "border-brand-muted/55 bg-surface-base/75";
        return (
          <div
            key={`${snapshot.seq}-${row.entityId}`}
            className={`grid grid-cols-[78px_minmax(0,1fr)_70px] sm:grid-cols-[94px_minmax(0,1fr)_92px_132px] gap-2 items-start border px-3 py-2 text-xs ${highlightClass}`}
          >
            <div className="text-text-dim">{formatRankName(row.rank, locale)}</div>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`truncate ${row.isPlayer || row.entityId === highlightOpponentId ? "text-text" : "text-text-dim"}`}>{row.shikona}</span>
                {boutMark && <span className={cn(typography.label, "border border-brand-muted/60 px-1.5 py-0.5 text-[10px] text-brand-line")}>{boutMark}</span>}
                {affiliationLabel && <span className={cn(typography.label, "border border-brand-muted/60 px-1.5 py-0.5 text-[10px] text-brand-line")}>{affiliationLabel}</span>}
                {row.isYushoWinner && <span className={cn(typography.label, "border border-warning/45 px-1.5 py-0.5 text-[10px] text-warning-bright")}>{locale === "en" ? "Yusho" : "優勝"}</span>}
              </div>
            </div>
            <div className="text-text">{formatReportRecordText(row.wins, row.losses, row.absent, locale)}</div>
            <div className="hidden sm:block text-text-dim">
              {row.isPlayer ? (locale === "en" ? "Player" : "本人") : row.entityId === highlightOpponentId ? (locale === "en" ? "Focus" : "注目相手") : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const RecordDetailLayout: React.FC<any> = ({
  bashoLabel,
  state,
  detail,
  playerRecord,
  playerRank,
  playerStableId,
  snapshot,
  boutMarks,
  playerBoutExplanationPreviews,
  locale,
}) => {
  const previewsByDay = React.useMemo(
    () => new Map<number, PlayerBoutExplanationPreview>(
      (playerBoutExplanationPreviews ?? []).map((preview: PlayerBoutExplanationPreview) => [preview.day, preview]),
    ),
    [playerBoutExplanationPreviews],
  );
  const previewDays = React.useMemo(() => Array.from(previewsByDay.keys()), [previewsByDay]);
  const [selectedBoutDay, setSelectedBoutDay] = React.useState<number | null>(previewDays[0] ?? null);

  React.useEffect(() => {
    if (!previewDays.length) {
      setSelectedBoutDay(null);
      return;
    }
    setSelectedBoutDay((current) => current && previewsByDay.has(current) ? current : previewDays[0]);
  }, [previewDays, previewsByDay]);

  const selectedPreview = selectedBoutDay ? previewsByDay.get(selectedBoutDay) : undefined;
  const selectedBout = selectedBoutDay
    ? detail.bouts.find((bout: PlayerBoutDetail) => bout.day === selectedBoutDay)
    : undefined;

  return (
    <>
      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard label={locale === "en" ? "Basho" : "場所"} value={bashoLabel} meta={formatReportDivisionLabel(playerRank.division, locale)} />
        <MetricCard label={locale === "en" ? "Rank" : "番付"} value={formatReportRankLabel(playerRank, locale)} meta={locale === "en" ? "Rank recorded for this basho" : "この場所で記録された地位"} />
        <MetricCard
          label={locale === "en" ? "Record" : "成績"}
          value={formatReportRecordText(playerRecord.wins, playerRecord.losses, playerRecord.absent, locale)}
          meta={"titles" in playerRecord ? formatReportSpecialPrizeList(playerRecord.titles, locale) : locale === "en" ? "No prizes" : "表彰なし"}
        />
        <MetricCard label={locale === "en" ? "Bouts" : "本割"} value={formatReportBoutCount(detail.bouts.length, locale)} meta={locale === "en" ? "Official bouts saved for this basho" : "その場所の公式記録"} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)]">
        <section className={cn(surface.detailCard, "p-4 sm:p-5")}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className={typography.sectionHeader}>
              <Swords className="w-4 h-4 text-action" /> {locale === "en" ? "Bout List" : "本割一覧"}
            </h3>
            <p className="text-xs text-text-dim">{locale === "en" ? `${detail.bouts.length} bouts saved` : `${detail.bouts.length}番を記録`}</p>
          </div>
          {detail.bouts.length > 0 ? (
            <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
              {detail.bouts.map((bout: PlayerBoutDetail) => {
                const preview = previewsByDay.get(bout.day);
                const isSelected = selectedBoutDay === bout.day;
                return (
                  <button
                    key={`${detail.bashoSeq}-${bout.day}-${bout.opponentId ?? bout.opponentShikona ?? "unknown"}`}
                    type="button"
                    className={cn(
                      "grid w-full grid-cols-[54px_minmax(0,1fr)_74px] gap-2 border px-3 py-2 text-left text-xs transition",
                      preview
                        ? "border-brand-muted/60 bg-surface-base/80 hover:border-action/45 hover:bg-action/10"
                        : "cursor-default border-brand-muted/50 bg-surface-base/75",
                      isSelected ? "border-action/60 bg-action/10" : "",
                    )}
                    aria-selected={isSelected}
                    disabled={!preview}
                    onClick={() => preview && setSelectedBoutDay(bout.day)}
                  >
                    <div className="text-text-dim">{locale === "en" ? `Day ${bout.day}` : `${bout.day}日目`}</div>
                    <div className="min-w-0">
                      <div className={`truncate ${bout.opponentId === state.highlightOpponentId ? "text-warning-bright" : "text-text"}`}>{resolveBoutPrimaryLabel(bout, locale)}</div>
                      <div className="text-text-dim">
                        {resolveBoutSecondaryLabel(bout, playerRank, locale)}
                      </div>
                    </div>
                    <div className="grid justify-items-end gap-1 text-text font-bold">
                      <span>{resolveBoutBadge(bout.result, locale)}</span>
                      {preview ? <span className="font-normal text-[10px] text-brand-line">{locale === "en" ? "Commentary" : "取組解説"}</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className={reportCommon.empty}>{locale === "en" ? "No bout detail is saved for this basho." : "本割詳細は保存されていません。"}</div>
          )}
          {selectedPreview && selectedBout ? (
            <div className="mt-4">
              <BoutExplanationPanel
                preview={selectedPreview}
                bout={selectedBout}
                playerShikona={playerRecord.shikona ?? (locale === "en" ? "Player" : "本人")}
                playerRank={playerRank}
              />
            </div>
          ) : null}
        </section>

        <section className={cn(surface.detailCard, "p-4 sm:p-5")}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className={typography.sectionHeader}>
              <ScrollText className="w-4 h-4 text-brand-line" /> {locale === "en" ? "Banzuke Table" : "当時の番付表"}
            </h3>
            {snapshot && snapshot.totalRowCount > snapshot.rows.length && (
              <p className="text-xs text-text-dim">
                {locale === "en" ? `Showing ${snapshot.rows.length} of ${snapshot.totalRowCount} slots` : `${snapshot.totalRowCount}枠中 ${snapshot.rows.length}件を表示`}
              </p>
            )}
          </div>
          <SnapshotList snapshot={snapshot} boutMarks={boutMarks} playerStableId={playerStableId} highlightOpponentId={state.highlightOpponentId} locale={locale} />
        </section>
      </div>
    </>
  );
};

const RankContextLayout: React.FC<any> = ({ bashoLabel, state, detail, playerRecord, playerRank, playerStableId, snapshot, boutMarks, decisionDigests, torikumiDigests, locale }) => (
  <>
    <section className="grid gap-3 md:grid-cols-3">
      <MetricCard label={locale === "en" ? "Turning Basho" : "山場"} value={bashoLabel} meta={locale === "en" ? "Read why this basho marks the rank arc" : "この場所が番付推移の節目になった理由を読む"} />
      <MetricCard label={locale === "en" ? "Rank Then" : "当時の番付"} value={formatReportRankLabel(playerRank, locale)} meta={textForLocale(locale, state.highlightReason, "Extracted as a rank-arc turning point")} />
      <MetricCard label={locale === "en" ? "Basho Record" : "場所成績"} value={formatReportRecordText(playerRecord.wins, playerRecord.losses, playerRecord.absent, locale)} meta={locale === "en" ? "This record shaped the next rank" : "この成績が次の景色を決めた"} />
    </section>

    <section className={cn(surface.detailCard, "p-4 sm:p-5")}>
      <div className="mb-3">
        <h3 className={typography.sectionHeader}>
          <ScrollText className="w-4 h-4 text-warning" /> {locale === "en" ? "Why This Basho Matters" : "この場所が山場である理由"}
        </h3>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-3">
          <div className="border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-relaxed text-text">
            {textForLocale(locale, state.highlightReason, "This basho created a visible bend in the rank arc.")}
          </div>
          <div className={cn(surface.detailCard, "p-4")}>
            <div className={cn(typography.label, "mb-2 text-[10px] tracking-[0.25em] text-text-dim uppercase")}>{locale === "en" ? "Banzuke Decision" : "番付判断"}</div>
            {decisionDigests.length > 0 ? (
              <div className="space-y-2">
                {decisionDigests.slice(0, 2).map((entry: any) => (
                  <div key={entry.key} className="border border-brand-muted/50 bg-surface-base/75 px-3 py-2 text-xs">
                    <div className="text-text">{locale === "en" ? "A saved banzuke decision is attached to this basho." : entry.summary}</div>
                    <div className="mt-1 text-text-dim">{locale === "en" ? "The rank movement is preserved in the banzuke table." : entry.resultLine}</div>
                    <div className="mt-1 text-text-dim">{locale === "en" ? "Use the surrounding rows to read the decision context." : entry.reasonLine}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={reportCommon.empty}>{locale === "en" ? "No banzuke decision log is saved for this basho." : "この場所に残された番付判断ログはありません。"}</div>
            )}
          </div>
          <div className={cn(surface.detailCard, "p-4")}>
            <div className={cn(typography.label, "mb-2 text-[10px] tracking-[0.25em] text-text-dim uppercase")}>{locale === "en" ? "Representative Bout" : "象徴の一番"}</div>
            {torikumiDigests.length > 0 ? (
              <div className="space-y-2">
                {torikumiDigests.slice(0, 2).map((entry: any) => (
                  <div key={entry.key} className="border border-brand-muted/50 bg-surface-base/75 px-3 py-2 text-xs">
                    <div className="text-text">{locale === "en" ? "A saved key bout is attached to this basho." : entry.summary}</div>
                    <div className="mt-1 text-text-dim">{locale === "en" ? `Opponent: ${entry.opponentShikona ?? "recorded rikishi"}` : entry.detailLine}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={reportCommon.empty}>{locale === "en" ? "No representative bout is saved for this basho." : "この場所を象徴する取組は保存されていません。"}</div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <section className={cn(surface.detailCard, "p-4 sm:p-5")}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className={typography.sectionHeader}>
                <ScrollText className="w-4 h-4 text-brand-line" /> {locale === "en" ? "Banzuke Table" : "当時の番付表"}
              </h3>
            </div>
            <SnapshotList snapshot={snapshot} boutMarks={boutMarks} playerStableId={playerStableId} highlightOpponentId={state.highlightOpponentId} locale={locale} />
          </section>
          <section className={cn(surface.detailCard, "p-4 sm:p-5")}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className={typography.sectionHeader}>
                <Swords className="w-4 h-4 text-action" /> {locale === "en" ? "Bout Excerpt" : "本割抜粋"}
              </h3>
            </div>
            {detail.bouts.length > 0 ? (
              <div className="space-y-2">
                {detail.bouts.slice(0, 5).map((bout: any) => (
                  <div key={`${detail.bashoSeq}-${bout.day}-${bout.opponentId ?? bout.opponentShikona ?? "unknown"}`} className="grid grid-cols-[54px_minmax(0,1fr)_42px] gap-2 border border-brand-muted/50 bg-surface-base/75 px-3 py-2 text-xs">
                    <div className="text-text-dim">{locale === "en" ? `Day ${bout.day}` : `${bout.day}日目`}</div>
                    <div className="min-w-0">
                      <div className={`truncate ${bout.opponentId === state.highlightOpponentId ? "text-warning-bright" : "text-text"}`}>{resolveBoutPrimaryLabel(bout, locale)}</div>
                      <div className="text-text-dim">{resolveBoutSecondaryLabel(bout, playerRank, locale)}</div>
                    </div>
                    <div className="text-text font-bold">{resolveBoutBadge(bout.result, locale)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={reportCommon.empty}>{locale === "en" ? "No bout excerpt is saved." : "本割抜粋は保存されていません。"}</div>
            )}
          </section>
        </div>
      </div>
    </section>
  </>
);

const RivalContextLayout: React.FC<any> = ({ bashoLabel, state, detail, playerRecord, playerRank, playerStableId, snapshot, boutMarks, torikumiDigests, locale }) => {
  const highlightedBouts = detail.bouts.filter((bout: any) => bout.opponentId === state.highlightOpponentId);
  const featuredBouts = highlightedBouts.length > 0 ? highlightedBouts : detail.bouts.slice(0, 4);
  const rivalSummary =
    textForLocale(
      locale,
      state.highlightReason,
      state.highlightOpponentId
        ? "The direct matchup in this basho is the saved marker for this rivalry."
        : "The bouts in this basho show the shape of a career rivalry.",
    );

  return (
    <>
      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard label={locale === "en" ? "Rivalry Basho" : "因縁の場所"} value={bashoLabel} meta={locale === "en" ? "The basho that best represents the rivalry" : "宿敵との関係を最もよく表す場所"} />
        <MetricCard label={locale === "en" ? "Rank Then" : "当時の番付"} value={formatReportRankLabel(playerRank, locale)} meta={locale === "en" ? `Finished at ${formatReportRecordText(playerRecord.wins, playerRecord.losses, playerRecord.absent, locale)}` : `${formatReportRecordText(playerRecord.wins, playerRecord.losses, playerRecord.absent, locale)}で終えた`} />
        <MetricCard
          label={locale === "en" ? "Focus Opponent" : "注目の相手"}
          value={state.subtitle?.split("/").at(-1)?.trim() || (locale === "en" ? "Era rival" : "同時代の強敵")}
          meta={state.highlightOpponentId ? (locale === "en" ? "Read this basho through the focus opponent" : "この相手との対戦を中心に読む") : (locale === "en" ? "Read the rivalry context" : "因縁の文脈を読む")}
        />
      </section>

      <section className={cn(surface.detailCard, "p-4 sm:p-5")}>
        <div className="mb-3">
          <h3 className={typography.sectionHeader}>
            <Swords className="w-4 h-4 text-warning" /> {locale === "en" ? "Why This Opponent Remains" : "なぜこの相手が残ったか"}
          </h3>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="space-y-3">
            <div className="border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-relaxed text-text">{rivalSummary}</div>
            <div className={cn(surface.detailCard, "p-4")}>
              <div className={cn(typography.label, "mb-2 text-[10px] tracking-[0.25em] text-text-dim uppercase")}>{locale === "en" ? "Direct Matchups" : "直接対決の断面"}</div>
              {featuredBouts.length > 0 ? (
                <div className="space-y-2">
                  {featuredBouts.slice(0, 5).map((bout: any) => (
                    <div
                      key={`${detail.bashoSeq}-${bout.day}-${bout.opponentId ?? bout.opponentShikona ?? "unknown"}`}
                      className="grid grid-cols-[54px_minmax(0,1fr)_42px] gap-2 border border-brand-muted/50 bg-surface-base/75 px-3 py-2 text-xs"
                    >
                      <div className="text-text-dim">{locale === "en" ? `Day ${bout.day}` : `${bout.day}日目`}</div>
                      <div className="min-w-0">
                        <div className={`truncate ${bout.opponentId === state.highlightOpponentId ? "text-warning-bright" : "text-text"}`}>
                          {resolveBoutPrimaryLabel(bout, locale)}
                        </div>
                        <div className="text-text-dim">{resolveBoutSecondaryLabel(bout, playerRank, locale)}</div>
                      </div>
                      <div className="text-text font-bold">{resolveBoutBadge(bout.result, locale)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={reportCommon.empty}>{locale === "en" ? "No direct matchup with this opponent is saved." : "この相手との直接対決は保存されていません。"}</div>
              )}
            </div>
            <div className={cn(surface.detailCard, "p-4")}>
              <div className={cn(typography.label, "mb-2 text-[10px] tracking-[0.25em] text-text-dim uppercase")}>{locale === "en" ? "Why This Basho Was Saved" : "この場所に残った意味"}</div>
              {torikumiDigests.length > 0 ? (
                <div className="space-y-2">
                  {torikumiDigests.slice(0, 2).map((entry: any) => (
                    <div key={entry.key} className="border border-brand-muted/50 bg-surface-base/75 px-3 py-2 text-xs">
                      <div className="text-text">{locale === "en" ? "A key bout is saved for this basho." : entry.summary}</div>
                      <div className="mt-1 text-text-dim">{locale === "en" ? `Opponent: ${entry.opponentShikona ?? "recorded rikishi"}` : entry.detailLine}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={reportCommon.empty}>{locale === "en" ? "No symbolic bout is saved for this basho." : "この場所を象徴する一番は保存されていません。"}</div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <section className={cn(surface.detailCard, "p-4 sm:p-5")}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className={typography.sectionHeader}>
                  <ScrollText className="w-4 h-4 text-brand-line" /> {locale === "en" ? "Banzuke Table" : "当時の番付表"}
                </h3>
              </div>
              <SnapshotList snapshot={snapshot} boutMarks={boutMarks} playerStableId={playerStableId} highlightOpponentId={state.highlightOpponentId} locale={locale} />
            </section>
            <section className={cn(surface.detailCard, "p-4 sm:p-5")}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className={typography.sectionHeader}>
                  <Eye className="w-4 h-4 text-action" /> {locale === "en" ? "Basho Context" : "場所の見取り図"}
                </h3>
              </div>
              <div className="space-y-2 text-xs text-text-dim leading-relaxed">
                <div className="border border-brand-muted/50 bg-surface-base/75 px-3 py-2">
                  {locale === "en"
                    ? `The player entered at ${formatReportRankLabel(playerRank, locale)} and finished ${formatReportRecordText(playerRecord.wins, playerRecord.losses, playerRecord.absent, locale)}.`
                    : `本人は ${formatReportRankLabel(playerRank, locale)} でこの場所を迎え、${formatReportRecordText(playerRecord.wins, playerRecord.losses, playerRecord.absent, locale)} を残しました。`}
                </div>
                <div className="border border-brand-muted/50 bg-surface-base/75 px-3 py-2">
                  {state.highlightOpponentId
                    ? locale === "en" ? "The banzuke highlights both the player and the focus opponent." : "番付表では本人と注目相手を同時に強調し、その場所での距離感を見えるようにしています。"
                    : locale === "en" ? "Nearby banzuke rows help show who shared this career moment." : "番付表の近くにいた相手ほど、この時期の空気を共有していた可能性があります。"}
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </>
  );
};
