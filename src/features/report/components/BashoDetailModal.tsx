import React from "react";
import { Eye, ScrollText, Swords, X } from "lucide-react";
import { Rank, RikishiStatus } from "../../../logic/models";
import type { CareerBashoDetail } from "../../../logic/persistence/careerHistory";
import { type PlayerBoutDetail } from "../../../logic/simulation/basho";
import { cn } from "../../../shared/lib/cn";
import surface from "../../../shared/styles/surface.module.css";
import typography from "../../../shared/styles/typography.module.css";
import {
  buildBanzukeSnapshotForSeq,
  buildSnapshotBoutMarks,
} from "../utils/reportBanzukeSnapshot";
import { formatBashoLabel, formatRankDisplayName } from "../utils/reportShared";
import {
  buildImportantBanzukeDecisionDigests,
  buildImportantTorikumiDigests,
} from "../utils/reportTimeline";
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

const DIVISION_NAMES: Record<string, string> = {
  Makuuchi: "幕内",
  Juryo: "十両",
  Makushita: "幕下",
  Sandanme: "三段目",
  Jonidan: "序二段",
  Jonokuchi: "序ノ口",
  Maezumo: "前相撲",
};

const formatRecordText = (wins: number, losses: number, absent: number): string =>
  `${wins}勝${losses}敗${absent > 0 ? `${absent}休` : ""}`;

const formatRankName = (rank: Rank): string => {
  if (rank.name === "前相撲") return rank.name;
  const side = rank.side === "West" ? "西" : rank.side === "East" ? "東" : "";
  if (["横綱", "大関", "関脇", "小結"].includes(rank.name)) return `${side}${rank.name}`;
  const number = rank.number || 1;
  return number === 1 ? `${side}${rank.name}筆頭` : `${side}${rank.name}${number}枚目`;
};

const resolveBoutBadge = (result: PlayerBoutDetail["result"]): string => {
  if (result === "WIN") return "○";
  if (result === "LOSS") return "●";
  return "や";
};

const resolveBoutPrimaryLabel = (bout: PlayerBoutDetail): string => {
  if (bout.opponentShikona) return bout.opponentShikona;
  if (bout.result === "ABSENT") return "休場で取組なし";
  if (bout.result === "WIN" && bout.kimarite === "不戦勝") return "不戦勝";
  if (bout.result === "LOSS" && bout.kimarite === "不戦敗") return "不戦敗";
  return "記録未詳";
};

const resolveBoutSecondaryLabel = (bout: PlayerBoutDetail, playerRank: Rank): string => {
  if (bout.result === "ABSENT" && !bout.opponentId && !bout.opponentShikona) {
    return "その日は休場で、対戦相手の記録は残っていません。";
  }
  if (bout.opponentRankName) {
    const opponentRank = formatRankName({
      division: playerRank.division,
      name: bout.opponentRankName,
      number: bout.opponentRankNumber,
      side: bout.opponentRankSide,
    });
    return bout.kimarite ? `${opponentRank} / ${bout.kimarite}` : opponentRank;
  }
  if (bout.kimarite === "不戦勝") return "相手休場による不戦勝";
  if (bout.kimarite === "不戦敗") return "本人休場による不戦敗";
  if (bout.result === "ABSENT") return "休場";
  return bout.kimarite ? bout.kimarite : "番付記録なし";
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
        aria-label="場所詳細を閉じる"
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
              {state.subtitle ?? "場所の詳細を読み込みます。"}
            </p>
          </div>
          <button
            type="button"
            className="p-2 text-text-dim hover:text-text border border-transparent hover:border-brand-muted/70"
            onClick={onClose}
            aria-label="場所詳細を閉じる"
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
  const bashoLabel = detail ? formatBashoLabel(detail.year, detail.month) : state.title;

  if (isLoading) return <div className={reportCommon.empty}>場所詳細を読み込んでいます。</div>;
  if (errorMessage) return <div className={cn(reportCommon.empty, "text-warning-bright")}>{errorMessage}</div>;
  if (!detail || !playerRecord || !playerRank) return null;

  return detailMode === "record" ? (
    <RecordDetailLayout
      bashoLabel={bashoLabel}
      state={state}
      detail={detail}
      playerRecord={playerRecord}
      playerRank={playerRank}
      snapshot={snapshot}
      boutMarks={boutMarks}
      playerBoutExplanationPreviews={mergedPreviews}
    />
  ) : detailMode === "rank" ? (
    <RankContextLayout
      bashoLabel={bashoLabel}
      state={state}
      detail={detail}
      playerRecord={playerRecord}
      playerRank={playerRank}
      snapshot={snapshot}
      boutMarks={boutMarks}
      decisionDigests={decisionDigests}
      torikumiDigests={torikumiDigests}
    />
  ) : (
    <RivalContextLayout
      bashoLabel={bashoLabel}
      state={state}
      detail={detail}
      playerRecord={playerRecord}
      playerRank={playerRank}
      snapshot={snapshot}
      boutMarks={boutMarks}
      torikumiDigests={torikumiDigests}
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

const SnapshotList: React.FC<{ snapshot: any; boutMarks: Record<string, string>; highlightOpponentId?: string }> = ({ snapshot, boutMarks, highlightOpponentId }) => {
  if (!snapshot) return <div className={reportCommon.empty}>この場所の番付表は保存されていません。</div>;
  return (
    <div className="space-y-2">
      {snapshot.highlightReason && (
        <div className="border border-brand-muted/60 bg-surface-base/80 px-3 py-2 text-xs text-text-dim leading-relaxed">
          {snapshot.highlightReason}
        </div>
      )}
      {snapshot.rows.map((row: any) => {
        const boutMark = boutMarks[row.entityId];
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
            <div className="text-text-dim">{formatRankName(row.rank)}</div>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`truncate ${row.isPlayer || row.entityId === highlightOpponentId ? "text-text" : "text-text-dim"}`}>{row.shikona}</span>
                {boutMark && <span className={cn(typography.label, "border border-brand-muted/60 px-1.5 py-0.5 text-[10px] text-brand-line")}>{boutMark}</span>}
                {row.isYushoWinner && <span className={cn(typography.label, "border border-warning/45 px-1.5 py-0.5 text-[10px] text-warning-bright")}>優勝</span>}
              </div>
            </div>
            <div className="text-text">{row.recordText}</div>
            <div className="hidden sm:block text-text-dim">{row.isPlayer ? "本人" : row.entityId === highlightOpponentId ? "注目相手" : ""}</div>
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
  snapshot,
  boutMarks,
  playerBoutExplanationPreviews,
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
        <MetricCard label="場所" value={bashoLabel} meta={DIVISION_NAMES[playerRank.division] ?? "番付未詳"} />
        <MetricCard label="番付" value={formatRankDisplayName(playerRank)} meta="この場所で記録された地位" />
        <MetricCard label="成績" value={formatRecordText(playerRecord.wins, playerRecord.losses, playerRecord.absent)} meta={"titles" in playerRecord && playerRecord.titles?.length ? playerRecord.titles.join(" / ") : "表彰なし"} />
        <MetricCard label="本割" value={`${detail.bouts.length}番`} meta="その場所の公式記録" />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)]">
        <section className={cn(surface.detailCard, "p-4 sm:p-5")}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className={typography.sectionHeader}>
              <Swords className="w-4 h-4 text-action" /> 本割一覧
            </h3>
            <p className="text-xs text-text-dim">{detail.bouts.length}番を記録</p>
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
                    <div className="text-text-dim">{bout.day}日目</div>
                    <div className="min-w-0">
                      <div className={`truncate ${bout.opponentId === state.highlightOpponentId ? "text-warning-bright" : "text-text"}`}>{resolveBoutPrimaryLabel(bout)}</div>
                      <div className="text-text-dim">
                        {resolveBoutSecondaryLabel(bout, playerRank)}
                      </div>
                    </div>
                    <div className="grid justify-items-end gap-1 text-text font-bold">
                      <span>{resolveBoutBadge(bout.result)}</span>
                      {preview ? <span className="font-normal text-[10px] text-brand-line">取組解説</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className={reportCommon.empty}>本割詳細は保存されていません。</div>
          )}
          {selectedPreview && selectedBout ? (
            <div className="mt-4">
              <BoutExplanationPanel
                preview={selectedPreview}
                bout={selectedBout}
                playerShikona={playerRecord.shikona ?? "本人"}
                playerRank={playerRank}
              />
            </div>
          ) : null}
        </section>

        <section className={cn(surface.detailCard, "p-4 sm:p-5")}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className={typography.sectionHeader}>
              <ScrollText className="w-4 h-4 text-brand-line" /> 当時の番付表
            </h3>
            {snapshot && snapshot.totalRowCount > snapshot.rows.length && <p className="text-xs text-text-dim">{snapshot.totalRowCount}枠中 {snapshot.rows.length}件を表示</p>}
          </div>
          <SnapshotList snapshot={snapshot} boutMarks={boutMarks} highlightOpponentId={state.highlightOpponentId} />
        </section>
      </div>
    </>
  );
};

const RankContextLayout: React.FC<any> = ({ bashoLabel, state, detail, playerRecord, playerRank, snapshot, boutMarks, decisionDigests, torikumiDigests }) => (
  <>
    <section className="grid gap-3 md:grid-cols-3">
      <MetricCard label="山場" value={bashoLabel} meta="この場所が番付推移の節目になった理由を読む" />
      <MetricCard label="当時の番付" value={formatRankDisplayName(playerRank)} meta={state.highlightReason ?? "番付の山谷として抽出"} />
      <MetricCard label="場所成績" value={formatRecordText(playerRecord.wins, playerRecord.losses, playerRecord.absent)} meta="この成績が次の景色を決めた" />
    </section>

    <section className={cn(surface.detailCard, "p-4 sm:p-5")}>
      <div className="mb-3">
        <h3 className={typography.sectionHeader}>
          <ScrollText className="w-4 h-4 text-warning" /> この場所が山場である理由
        </h3>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-3">
          <div className="border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-relaxed text-text">
            {state.highlightReason ?? "この場所の番付判断と取組内容が、番付推移の折れ目を作った。"}
          </div>
          <div className={cn(surface.detailCard, "p-4")}>
            <div className={cn(typography.label, "mb-2 text-[10px] tracking-[0.25em] text-text-dim uppercase")}>番付判断</div>
            {decisionDigests.length > 0 ? (
              <div className="space-y-2">
                {decisionDigests.slice(0, 2).map((entry: any) => (
                  <div key={entry.key} className="border border-brand-muted/50 bg-surface-base/75 px-3 py-2 text-xs">
                    <div className="text-text">{entry.summary}</div>
                    <div className="mt-1 text-text-dim">{entry.resultLine}</div>
                    <div className="mt-1 text-text-dim">{entry.reasonLine}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={reportCommon.empty}>この場所に残された番付判断ログはありません。</div>
            )}
          </div>
          <div className={cn(surface.detailCard, "p-4")}>
            <div className={cn(typography.label, "mb-2 text-[10px] tracking-[0.25em] text-text-dim uppercase")}>象徴の一番</div>
            {torikumiDigests.length > 0 ? (
              <div className="space-y-2">
                {torikumiDigests.slice(0, 2).map((entry: any) => (
                  <div key={entry.key} className="border border-brand-muted/50 bg-surface-base/75 px-3 py-2 text-xs">
                    <div className="text-text">{entry.summary}</div>
                    <div className="mt-1 text-text-dim">{entry.detailLine}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={reportCommon.empty}>この場所を象徴する取組は保存されていません。</div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <section className={cn(surface.detailCard, "p-4 sm:p-5")}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className={typography.sectionHeader}>
                <ScrollText className="w-4 h-4 text-brand-line" /> 当時の番付表
              </h3>
            </div>
            <SnapshotList snapshot={snapshot} boutMarks={boutMarks} highlightOpponentId={state.highlightOpponentId} />
          </section>
          <section className={cn(surface.detailCard, "p-4 sm:p-5")}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className={typography.sectionHeader}>
                <Swords className="w-4 h-4 text-action" /> 本割抜粋
              </h3>
            </div>
            {detail.bouts.length > 0 ? (
              <div className="space-y-2">
                {detail.bouts.slice(0, 5).map((bout: any) => (
                  <div key={`${detail.bashoSeq}-${bout.day}-${bout.opponentId ?? bout.opponentShikona ?? "unknown"}`} className="grid grid-cols-[54px_minmax(0,1fr)_42px] gap-2 border border-brand-muted/50 bg-surface-base/75 px-3 py-2 text-xs">
                    <div className="text-text-dim">{bout.day}日目</div>
                    <div className="min-w-0">
                      <div className={`truncate ${bout.opponentId === state.highlightOpponentId ? "text-warning-bright" : "text-text"}`}>{resolveBoutPrimaryLabel(bout)}</div>
                      <div className="text-text-dim">{resolveBoutSecondaryLabel(bout, playerRank)}</div>
                    </div>
                    <div className="text-text font-bold">{resolveBoutBadge(bout.result)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={reportCommon.empty}>本割抜粋は保存されていません。</div>
            )}
          </section>
        </div>
      </div>
    </section>
  </>
);

const RivalContextLayout: React.FC<any> = ({ bashoLabel, state, detail, playerRecord, playerRank, snapshot, boutMarks, torikumiDigests }) => {
  const highlightedBouts = detail.bouts.filter((bout: any) => bout.opponentId === state.highlightOpponentId);
  const featuredBouts = highlightedBouts.length > 0 ? highlightedBouts : detail.bouts.slice(0, 4);
  const rivalSummary =
    state.highlightReason ??
    (state.highlightOpponentId
      ? "この場所での直接対決が、その相手との因縁を象徴しています。"
      : "この場所での対戦が、その時代の強敵との関係をよく表しています。");

  return (
    <>
      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard label="因縁の場所" value={bashoLabel} meta="宿敵との関係を最もよく表す場所" />
        <MetricCard label="当時の番付" value={formatRankDisplayName(playerRank)} meta={`${formatRecordText(playerRecord.wins, playerRecord.losses, playerRecord.absent)}で終えた`} />
        <MetricCard
          label="注目の相手"
          value={state.subtitle?.split("/").at(-1)?.trim() || "同時代の強敵"}
          meta={state.highlightOpponentId ? "この相手との対戦を中心に読む" : "因縁の文脈を読む"}
        />
      </section>

      <section className={cn(surface.detailCard, "p-4 sm:p-5")}>
        <div className="mb-3">
          <h3 className={typography.sectionHeader}>
            <Swords className="w-4 h-4 text-warning" /> なぜこの相手が残ったか
          </h3>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="space-y-3">
            <div className="border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-relaxed text-text">{rivalSummary}</div>
            <div className={cn(surface.detailCard, "p-4")}>
              <div className={cn(typography.label, "mb-2 text-[10px] tracking-[0.25em] text-text-dim uppercase")}>直接対決の断面</div>
              {featuredBouts.length > 0 ? (
                <div className="space-y-2">
                  {featuredBouts.slice(0, 5).map((bout: any) => (
                    <div
                      key={`${detail.bashoSeq}-${bout.day}-${bout.opponentId ?? bout.opponentShikona ?? "unknown"}`}
                      className="grid grid-cols-[54px_minmax(0,1fr)_42px] gap-2 border border-brand-muted/50 bg-surface-base/75 px-3 py-2 text-xs"
                    >
                      <div className="text-text-dim">{bout.day}日目</div>
                      <div className="min-w-0">
                        <div className={`truncate ${bout.opponentId === state.highlightOpponentId ? "text-warning-bright" : "text-text"}`}>
                          {resolveBoutPrimaryLabel(bout)}
                        </div>
                        <div className="text-text-dim">{resolveBoutSecondaryLabel(bout, playerRank)}</div>
                      </div>
                      <div className="text-text font-bold">{resolveBoutBadge(bout.result)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={reportCommon.empty}>この相手との直接対決は保存されていません。</div>
              )}
            </div>
            <div className={cn(surface.detailCard, "p-4")}>
              <div className={cn(typography.label, "mb-2 text-[10px] tracking-[0.25em] text-text-dim uppercase")}>この場所に残った意味</div>
              {torikumiDigests.length > 0 ? (
                <div className="space-y-2">
                  {torikumiDigests.slice(0, 2).map((entry: any) => (
                    <div key={entry.key} className="border border-brand-muted/50 bg-surface-base/75 px-3 py-2 text-xs">
                      <div className="text-text">{entry.summary}</div>
                      <div className="mt-1 text-text-dim">{entry.detailLine}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={reportCommon.empty}>この場所を象徴する一番は保存されていません。</div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <section className={cn(surface.detailCard, "p-4 sm:p-5")}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className={typography.sectionHeader}>
                  <ScrollText className="w-4 h-4 text-brand-line" /> 当時の番付表
                </h3>
              </div>
              <SnapshotList snapshot={snapshot} boutMarks={boutMarks} highlightOpponentId={state.highlightOpponentId} />
            </section>
            <section className={cn(surface.detailCard, "p-4 sm:p-5")}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className={typography.sectionHeader}>
                  <Eye className="w-4 h-4 text-action" /> 場所の見取り図
                </h3>
              </div>
              <div className="space-y-2 text-xs text-text-dim leading-relaxed">
                <div className="border border-brand-muted/50 bg-surface-base/75 px-3 py-2">
                  本人は {formatRankDisplayName(playerRank)} でこの場所を迎え、{formatRecordText(playerRecord.wins, playerRecord.losses, playerRecord.absent)} を残しました。
                </div>
                <div className="border border-brand-muted/50 bg-surface-base/75 px-3 py-2">
                  {state.highlightOpponentId
                    ? "番付表では本人と注目相手を同時に強調し、その場所での距離感を見えるようにしています。"
                    : "番付表の近くにいた相手ほど、この時期の空気を共有していた可能性があります。"}
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </>
  );
};
