import React from "react";
import { Activity, Eye, Heart, ScrollText, Sparkles, Swords, Trophy, X } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { resolveRankLimits, resolveRankSlotOffset } from "../../../logic/banzuke/scale/rankLimits";
import { CONSTANTS } from "../../../logic/constants";
import { summarizeKimariteUsage } from "../../../logic/kimarite/selection";
import { Rank, RankScaleSlots, Rarity, RikishiStatus } from "../../../logic/models";
import {
  getCareerHeadToHead,
  listCareerBanzukeDecisions,
  listCareerBashoRecordsBySeq,
  listCareerImportantTorikumi,
  listCareerPlayerBoutsByBasho,
  type CareerBashoRecordsBySeq,
} from "../../../logic/persistence/careerHistory";
import {
  buildBanzukeSnapshotForSeq,
  buildSnapshotBoutMarks,
  type ReportBanzukeSnapshot,
} from "../utils/reportBanzukeSnapshot";
import {
  buildImportantBanzukeDecisionDigests,
  buildImportantDecisionDigest,
  buildImportantTorikumiDigests,
  type ReportImportantDecisionDigest,
  type ReportImportantDecisionHighlight,
} from "../utils/reportTimeline";
import {
  buildCareerRivalryDigest,
  type CareerRivalryDigest,
  type EraTitanEntry,
  type NemesisEntry,
  type TitleBlockerEntry,
} from "../utils/reportRivalry";
import { DamageMap } from "../../../shared/ui/DamageMap";
import { Button } from "../../../shared/ui/Button";

const TOOLTIP_STYLE = {
  borderRadius: 0,
  background: "#081223",
  border: "1px solid rgba(76, 93, 121, 0.95)",
  color: "#efe6cf",
  fontSize: 12,
};

const DIVISION_NAMES: Record<string, string> = {
  Makuuchi: "幕内",
  Juryo: "十両",
  Makushita: "幕下",
  Sandanme: "三段目",
  Jonidan: "序二段",
  Jonokuchi: "序ノ口",
  Maezumo: "前相撲",
};

const DIVISION_COLORS: Record<string, string> = {
  Makuuchi: "#c49a4d",
  Juryo: "#4c7bff",
  Makushita: "#49b97b",
  Sandanme: "#76a4d4",
  Jonidan: "#8e9bb0",
  Jonokuchi: "#62708c",
  Maezumo: "#495366",
};

const PERSONALITY_LABELS: Record<string, string> = {
  CALM: "冷静",
  AGGRESSIVE: "闘争的",
  SERIOUS: "真面目",
  WILD: "奔放",
  CHEERFUL: "陽気",
  SHY: "人見知り",
};

const RARITY_COLORS: Record<Rarity, { bg: string; text: string; border: string }> = {
  N: { bg: "bg-surface-base", text: "text-text-dim", border: "border-brand-muted/60" },
  R: { bg: "bg-brand-ink/70", text: "text-brand-line", border: "border-brand-line/35" },
  SR: { bg: "bg-action/10", text: "text-action-bright", border: "border-action/40" },
  UR: { bg: "bg-warning/10", text: "text-warning-bright", border: "border-warning/45" },
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const formatRankName = (rank: Rank) => {
  if (rank.name === "前相撲") return rank.name;
  const side = rank.side === "West" ? "西" : rank.side === "East" ? "東" : "";
  if (["横綱", "大関", "関脇", "小結"].includes(rank.name)) return `${side}${rank.name}`;
  const number = rank.number || 1;
  return number === 1 ? `${side}${rank.name}筆頭` : `${side}${rank.name}${number}枚目`;
};

const formatRecordText = (wins: number, losses: number, absent: number): string =>
  `${wins}勝${losses}敗${absent > 0 ? `${absent}休` : ""}`;

const resolveRankSlot = (rank: Rank, scaleSlots?: RankScaleSlots): number => {
  const limits = resolveRankLimits(scaleSlots);
  const offset = resolveRankSlotOffset(scaleSlots);
  const sideOff = rank.side === "West" ? 1 : 0;
  if (rank.division === "Makuuchi") {
    if (rank.name === "横綱") return 0 + sideOff;
    if (rank.name === "大関") return 2 + sideOff;
    if (rank.name === "関脇") return 4 + sideOff;
    if (rank.name === "小結") return 6 + sideOff;
    return 8 + (clamp(rank.number || 1, 1, limits.MAEGASHIRA_MAX) - 1) * 2 + sideOff;
  }
  if (rank.division === "Juryo") return offset.Juryo + (clamp(rank.number || 1, 1, limits.JURYO_MAX) - 1) * 2 + sideOff;
  if (rank.division === "Makushita") return offset.Makushita + (clamp(rank.number || 1, 1, limits.MAKUSHITA_MAX) - 1) * 2 + sideOff;
  if (rank.division === "Sandanme") return offset.Sandanme + (clamp(rank.number || 1, 1, limits.SANDANME_MAX) - 1) * 2 + sideOff;
  if (rank.division === "Jonidan") return offset.Jonidan + (clamp(rank.number || 1, 1, limits.JONIDAN_MAX) - 1) * 2 + sideOff;
  if (rank.division === "Jonokuchi") return offset.Jonokuchi + (clamp(rank.number || 1, 1, limits.JONOKUCHI_MAX) - 1) * 2 + sideOff;
  return offset.Maezumo;
};

const formatBanzukeDelta = (delta: number): string => {
  const abs = Math.abs(delta);
  const magnitude = Number.isInteger(abs) ? `${abs}` : `${abs.toFixed(1)}`;
  if (delta > 0) return `+${magnitude}`;
  if (delta < 0) return `-${magnitude}`;
  return "±0";
};

type RivalryEntry = TitleBlockerEntry | EraTitanEntry | NemesisEntry;

interface SnapshotModalState {
  categoryLabel: string;
  entry: RivalryEntry;
  snapshot: ReportBanzukeSnapshot;
  boutMarks: Record<string, string>;
}

interface DecisionSnapshotModalState {
  highlight: ReportImportantDecisionHighlight;
  snapshot: ReportBanzukeSnapshot;
  boutMarks: Record<string, string>;
}

interface TorikumiModalState {
  highlight: ReportImportantDecisionHighlight;
  bout?: {
    result: "WIN" | "LOSS" | "ABSENT";
    kimarite?: string;
    opponentShikona?: string;
  };
}

const EMPTY_RIVALRY_DIGEST: CareerRivalryDigest = {
  titleBlockers: [],
  eraTitans: [],
  nemesis: [],
};

const EMPTY_IMPORTANT_DECISION_DIGEST: ReportImportantDecisionDigest = {
  highlights: [],
  timelineItems: [],
};

const headToHeadLabel = (entry: RivalryEntry): string =>
  `${entry.headToHead.wins}勝${entry.headToHead.losses}敗${entry.headToHead.absences > 0 ? ` ${entry.headToHead.absences}や` : ""}`;

const resolveRivalryAccent = (categoryLabel: string): string => {
  if (categoryLabel === "優勝を阻んだ相手") return "border-warning/45 bg-warning/8";
  if (categoryLabel === "時代を築いた強敵") return "border-brand-line/35 bg-brand-ink/60";
  return "border-action/35 bg-action/6";
};

const emptyRivalryText = (careerId?: string | null): string => {
  if (!careerId) return "保存済みキャリアを開くと、対戦相手との因縁を復元できます。";
  return "根拠が十分な優勝阻止や宿敵は見つかりませんでした。";
};

interface ReportDetailsTabProps {
  status: RikishiStatus;
  careerId?: string | null;
  mode?: "full" | "story" | "profile";
}

export const ReportDetailsTab: React.FC<ReportDetailsTabProps> = ({
  status,
  careerId = null,
  mode = "full",
}) => {
  const divisionStats = React.useMemo(() => {
    const divisions = ["Makuuchi", "Juryo", "Makushita", "Sandanme", "Jonidan", "Jonokuchi", "Maezumo"] as const;
    return divisions
      .map((division) => {
        const records = status.history.records.filter((record) => record.rank.division === division);
        return {
          name: division,
          basho: records.length,
          wins: records.reduce((sum, record) => sum + record.wins, 0),
          losses: records.reduce((sum, record) => sum + record.losses, 0),
          absent: records.reduce((sum, record) => sum + record.absent, 0),
        };
      })
      .filter((row) => row.basho > 0);
  }, [status.history.records]);

  const abilityHistoryData = React.useMemo(() => {
    if (!status.statHistory?.length) return [];
    return status.statHistory.map((item) => ({
      age: item.age,
      tsuki: Math.round(item.stats.tsuki),
      oshi: Math.round(item.stats.oshi),
      kumi: Math.round(item.stats.kumi),
      nage: Math.round(item.stats.nage),
      koshi: Math.round(item.stats.koshi),
      deashi: Math.round(item.stats.deashi),
      waza: Math.round(item.stats.waza),
      power: Math.round(item.stats.power),
    }));
  }, [status.statHistory]);

  const kimariteData = React.useMemo(() => {
    const total = status.history.kimariteTotal || {};
    return Object.entries(total)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  }, [status.history.kimariteTotal]);

  const kimariteSummary = React.useMemo(() => {
    const usage = summarizeKimariteUsage(status.history.kimariteTotal);
    return {
      uniqueOfficial: usage.officialUniqueCount,
      top3ShareText: `${(usage.top3MoveShare * 100).toFixed(1)}%`,
      rareMoveCount: usage.rareOrExtremeUniqueCount,
    };
  }, [status.history.kimariteTotal]);

  const rankMovements = React.useMemo(() => {
    return status.history.records.map((record, index) => {
      const next = status.history.records[index + 1];
      if (!next) {
        return {
          basho: `${record.year}年${record.month}月`,
          rank: formatRankName(record.rank),
          record: formatRecordText(record.wins, record.losses, record.absent),
          nextRank: "最終場所",
          deltaText: "-",
          deltaKind: "last" as const,
        };
      }
      const deltaSlots =
        resolveRankSlot(record.rank, record.scaleSlots) - resolveRankSlot(next.rank, next.scaleSlots);
      const deltaInBanzuke = deltaSlots / 2;
      return {
        basho: `${record.year}年${record.month}月`,
        rank: formatRankName(record.rank),
        record: formatRecordText(record.wins, record.losses, record.absent),
        nextRank: formatRankName(next.rank),
        deltaText: formatBanzukeDelta(deltaInBanzuke),
        deltaKind: deltaInBanzuke > 0 ? "up" as const : deltaInBanzuke < 0 ? "down" as const : "stay" as const,
      };
    });
  }, [status.history.records]);

  const [rivalryDigest, setRivalryDigest] = React.useState<CareerRivalryDigest>(EMPTY_RIVALRY_DIGEST);
  const [rivalryBashoRows, setRivalryBashoRows] = React.useState<CareerBashoRecordsBySeq[]>([]);
  const [rivalryBoutsBySeq, setRivalryBoutsBySeq] = React.useState<Array<{ bashoSeq: number; bouts: Array<{ day: number; result: "WIN" | "LOSS" | "ABSENT"; kimarite?: string; opponentId?: string; opponentShikona?: string; opponentRankName?: string; opponentRankNumber?: number; opponentRankSide?: "East" | "West"; }> }>>([]);
  const [rivalryLoading, setRivalryLoading] = React.useState(false);
  const [rivalryErrorMessage, setRivalryErrorMessage] = React.useState<string | null>(null);
  const [importantDecisionDigest, setImportantDecisionDigest] = React.useState<ReportImportantDecisionDigest>(EMPTY_IMPORTANT_DECISION_DIGEST);
  const [importantDecisionErrorMessage, setImportantDecisionErrorMessage] = React.useState<string | null>(null);
  const [snapshotModal, setSnapshotModal] = React.useState<SnapshotModalState | null>(null);
  const [decisionSnapshotModal, setDecisionSnapshotModal] = React.useState<DecisionSnapshotModalState | null>(null);
  const [torikumiModal, setTorikumiModal] = React.useState<TorikumiModalState | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!careerId) {
      setRivalryDigest(EMPTY_RIVALRY_DIGEST);
      setImportantDecisionDigest(EMPTY_IMPORTANT_DECISION_DIGEST);
      setRivalryBashoRows([]);
      setRivalryBoutsBySeq([]);
      setRivalryLoading(false);
      setRivalryErrorMessage(null);
      setImportantDecisionErrorMessage(null);
      return () => {
        cancelled = true;
      };
    }

    setRivalryLoading(true);
    setRivalryErrorMessage(null);
    setImportantDecisionErrorMessage(null);
    void (async () => {
      try {
        const [headToHeadRows, boutsByBasho, bashoRowsBySeq, banzukeDecisionLogs, importantTorikumiRows] = await Promise.all([
          getCareerHeadToHead(careerId),
          listCareerPlayerBoutsByBasho(careerId),
          listCareerBashoRecordsBySeq(careerId),
          listCareerBanzukeDecisions(careerId),
          listCareerImportantTorikumi(careerId),
        ]);
        if (cancelled) return;
        setRivalryDigest(
          buildCareerRivalryDigest(
            status,
            headToHeadRows,
            boutsByBasho,
            bashoRowsBySeq,
            banzukeDecisionLogs,
          ),
        );
        setImportantDecisionDigest(
          buildImportantDecisionDigest(
            buildImportantBanzukeDecisionDigests(status, banzukeDecisionLogs, bashoRowsBySeq),
            buildImportantTorikumiDigests(importantTorikumiRows),
          ),
        );
        setRivalryBashoRows(bashoRowsBySeq);
        setRivalryBoutsBySeq(boutsByBasho);
      } catch {
        if (cancelled) return;
        setRivalryDigest(EMPTY_RIVALRY_DIGEST);
        setImportantDecisionDigest(EMPTY_IMPORTANT_DECISION_DIGEST);
        setRivalryBashoRows([]);
        setRivalryBoutsBySeq([]);
        setRivalryErrorMessage("宿敵データの取得に失敗したため、このセクションだけ省略しています。");
        setImportantDecisionErrorMessage("重要判断の読み出しに失敗したため、このセクションだけ省略しています。");
      } finally {
        if (!cancelled) setRivalryLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [careerId, status]);

  const rivalryBoutsMap = React.useMemo(
    () => new Map(rivalryBoutsBySeq.map((entry) => [entry.bashoSeq, entry.bouts])),
    [rivalryBoutsBySeq],
  );
  const rivalryBashoRowsMap = React.useMemo(
    () => new Map(rivalryBashoRows.map((entry) => [entry.bashoSeq, entry.rows])),
    [rivalryBashoRows],
  );

  const openSnapshot = React.useCallback(
    (categoryLabel: string, entry: RivalryEntry) => {
      const playerRecord = status.history.records[entry.featuredSeq - 1];
      if (!playerRecord) return;
      const snapshot = buildBanzukeSnapshotForSeq(
        entry.featuredSeq,
        playerRecord.rank.division,
        rivalryBashoRowsMap.get(entry.featuredSeq) ?? [],
      );
      const boutMarks = Object.fromEntries(
        buildSnapshotBoutMarks(snapshot, rivalryBoutsMap.get(entry.featuredSeq) ?? []),
      );
      setSnapshotModal({
        categoryLabel,
        entry,
        snapshot,
        boutMarks,
      });
    },
    [rivalryBashoRowsMap, rivalryBoutsMap, status.history.records],
  );

  React.useEffect(() => {
    if (!snapshotModal && !decisionSnapshotModal && !torikumiModal) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSnapshotModal(null);
        setDecisionSnapshotModal(null);
        setTorikumiModal(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [decisionSnapshotModal, snapshotModal, torikumiModal]);

  const openDecisionSnapshot = React.useCallback(
    (highlight: ReportImportantDecisionHighlight) => {
      const playerRecord = status.history.records[highlight.bashoSeq - 1];
      if (!playerRecord) return;
      const snapshot = buildBanzukeSnapshotForSeq(
        highlight.bashoSeq,
        playerRecord.rank.division,
        rivalryBashoRowsMap.get(highlight.bashoSeq) ?? [],
      );
      const boutMarks = Object.fromEntries(
        buildSnapshotBoutMarks(snapshot, rivalryBoutsMap.get(highlight.bashoSeq) ?? []),
      );
      setDecisionSnapshotModal({
        highlight,
        snapshot,
        boutMarks,
      });
    },
    [rivalryBashoRowsMap, rivalryBoutsMap, status.history.records],
  );

  const openTorikumiDetail = React.useCallback(
    (highlight: ReportImportantDecisionHighlight) => {
      const bouts = rivalryBoutsMap.get(highlight.bashoSeq) ?? [];
      const bout = highlight.day ? bouts.find((entry) => entry.day === highlight.day) : undefined;
      setTorikumiModal({
        highlight,
        bout,
      });
    },
    [rivalryBoutsMap],
  );

  return (
    <div className="space-y-4 animate-in">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.9fr)] gap-4">
        {mode !== "profile" && (
        <div className="report-detail-card p-4 sm:p-5 xl:col-span-2">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="section-header">
              <ScrollText className="w-4 h-4 text-warning" /> 重要判断
            </h3>
            <p className="text-xs text-text-dim">重要昇進と特殊据え置き、異例の本割だけを残します</p>
          </div>
          {rivalryLoading ? (
            <div className="report-empty">重要判断を読み込んでいます。</div>
          ) : importantDecisionDigest.highlights.length === 0 ? (
            <div className="report-empty">
              {careerId ? "このキャリアでは説明が必要な重要判断は見つかりませんでした。" : "保存済みキャリアを開くと、重要判断だけを読み返せます。"}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {importantDecisionDigest.highlights.map((highlight) => (
                <ImportantDecisionCard
                  key={highlight.key}
                  highlight={highlight}
                  onOpen={highlight.kind === "BANZUKE" ? openDecisionSnapshot : openTorikumiDetail}
                />
              ))}
            </div>
          )}
          {importantDecisionErrorMessage && <div className="mt-3 text-xs text-warning-bright">{importantDecisionErrorMessage}</div>}
        </div>
        )}

        {mode !== "story" && (
        <div className="report-detail-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="section-header">
              <Activity className="w-4 h-4 text-action" /> 能力推移
            </h3>
            <p className="text-xs text-text-dim">強さの山がどこで来たかを年齢別に確認</p>
          </div>
          {abilityHistoryData.length > 1 ? (
            <div className="h-[260px] sm:h-[330px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={abilityHistoryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(157, 172, 191, 0.12)" />
                  <XAxis dataKey="age" tick={{ fontSize: 11, fill: "#9dacbf" }} />
                  <YAxis domain={[0, 150]} tick={{ fontSize: 11, fill: "#9dacbf" }} width={35} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#9dacbf" }} />
                  {[
                    { key: "tsuki", name: "突き", color: "#d26b52" },
                    { key: "oshi", name: "押し", color: "#ef9d4a" },
                    { key: "kumi", name: "組力", color: "#4c7bff" },
                    { key: "nage", name: "投げ", color: "#49b97b" },
                    { key: "koshi", name: "腰", color: "#c49a4d" },
                    { key: "deashi", name: "出足", color: "#7ac6d7" },
                    { key: "waza", name: "技術", color: "#d19bff" },
                    { key: "power", name: "筋力", color: "#f7d18a" },
                  ].map((line) => (
                    <Line key={line.key} type="monotone" dataKey={line.key} name={line.name} stroke={line.color} dot={false} strokeWidth={2} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="report-empty">能力履歴が少ないため、番付推移と転機の履歴を優先して読む設計です。</div>
          )}
        </div>
        )}

        {mode !== "story" && (
        <div className="report-detail-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="section-header">
              <Trophy className="w-4 h-4 text-brand-line" /> 階級別比較
            </h3>
            <p className="text-xs text-text-dim">長く戦った階級ほど横幅で見せます</p>
          </div>
          <div className="space-y-3">
            {divisionStats.map((row) => {
              const total = row.wins + row.losses;
              const maxTotal = Math.max(...divisionStats.map((item) => item.wins + item.losses), 1);
              const width = (total / maxTotal) * 100;
              const winPct = total > 0 ? (row.wins / total) * 100 : 0;
              return (
                <div key={row.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs gap-3">
                    <span style={{ color: DIVISION_COLORS[row.name] }}>{DIVISION_NAMES[row.name]}</span>
                    <span className="text-text-dim">
                      {row.basho}場所 / {row.wins}勝 {row.losses}敗{row.absent > 0 ? ` ${row.absent}休` : ""}
                    </span>
                  </div>
                  <div className="h-3 flex overflow-hidden border border-brand-muted/60 bg-surface-base">
                    <div style={{ width: `${Math.max(width * (winPct / 100), 0)}%`, backgroundColor: DIVISION_COLORS[row.name] }} />
                    <div style={{ width: `${Math.max(width * ((100 - winPct) / 100), 8)}%`, backgroundColor: "rgba(76, 93, 121, 0.55)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}
      </div>

      {mode !== "story" && (
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
        <div className="report-detail-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="section-header">
              <Swords className="w-4 h-4 text-action" /> 決まり手の偏り
            </h3>
            <p className="text-xs text-text-dim">上位8手に絞りつつ、多様性の指標も残します</p>
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div className="metric-card">
              <div className="metric-label">通算種類数</div>
              <div className="metric-value">{kimariteSummary.uniqueOfficial}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">主力3手比率</div>
              <div className="metric-value">{kimariteSummary.top3ShareText}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">レア技数</div>
              <div className="metric-value">{kimariteSummary.rareMoveCount}</div>
            </div>
          </div>
          {kimariteData.length > 0 ? (
            <div className="h-[260px] sm:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={kimariteData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(157, 172, 191, 0.12)" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#9dacbf" }} />
                  <YAxis dataKey="name" type="category" width={82} tick={{ fontSize: 11, fill: "#efe6cf" }} />
                  <Tooltip formatter={(value: number) => [`${value}回`, "回数"]} contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="count" name="回数" fill="#4c7bff" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="report-empty">決まり手データが少ないため、型はまだ明確ではありません。</div>
          )}
        </div>

        <div className="report-detail-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="section-header">
              <ScrollText className="w-4 h-4 text-brand-line" /> 番付変動の読み筋
            </h3>
            <p className="text-xs text-text-dim">次場所との上下だけを残した比較表</p>
          </div>
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {rankMovements.map((row, index) => (
              <div
                key={`${row.basho}-${index}`}
                className="grid grid-cols-[84px_minmax(0,1fr)_70px] sm:grid-cols-[84px_minmax(0,1fr)_88px_72px] gap-2 text-xs border border-brand-muted/50 bg-surface-base/70 px-3 py-2"
              >
                <div className="text-text-dim">{row.basho}</div>
                <div className="min-w-0">
                  <div className="truncate text-text">{row.rank}</div>
                  <div className="text-text-dim">{row.record}</div>
                </div>
                <div className="hidden sm:block text-text-dim truncate">{row.nextRank}</div>
                <div className={row.deltaKind === "up" ? "text-state-bright" : row.deltaKind === "down" ? "text-warning-bright" : "text-text-dim"}>
                  {row.deltaKind === "up" ? "↑" : row.deltaKind === "down" ? "↓" : "→"} {row.deltaText}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      {mode !== "profile" && (
      <div className="report-detail-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="section-header">
            <Trophy className="w-4 h-4 text-warning" /> 壁だった力士
          </h3>
          <p className="text-xs text-text-dim">優勝阻止と宿敵だけを、根拠が強い順に残します</p>
        </div>
        <div className="space-y-4">
          <RivalryBlock
            title="優勝を阻んだ相手"
            description="同星で並んだ場所や、直接対決で賜杯を遠ざけた相手だけを拾います。"
            entries={rivalryDigest.titleBlockers}
            isLoading={rivalryLoading}
            emptyText={emptyRivalryText(careerId)}
            onOpenSnapshot={openSnapshot}
          />
          <RivalryBlock
            title="時代を築いた強敵"
            description="上位在位期に何度も前にいた横綱・大関だけを並べます。"
            entries={rivalryDigest.eraTitans}
            isLoading={rivalryLoading}
            emptyText={emptyRivalryText(careerId)}
            onOpenSnapshot={openSnapshot}
          />
          <RivalryBlock
            title="宿敵"
            description="長期の負け越しで、何度も壁になった相手です。"
            entries={rivalryDigest.nemesis}
            isLoading={rivalryLoading}
            emptyText={emptyRivalryText(careerId)}
            onOpenSnapshot={openSnapshot}
          />
          {rivalryErrorMessage && <div className="text-xs text-warning-bright">{rivalryErrorMessage}</div>}
        </div>
      </div>
      )}

      {mode !== "story" && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InfoCard
          title="プロフィール"
          icon={<Sparkles className="w-4 h-4 text-brand-line" />}
          footer={
            status.bodyType && CONSTANTS.BODY_TYPE_DATA[status.bodyType]
              ? CONSTANTS.BODY_TYPE_DATA[status.bodyType].description
              : undefined
          }
          rows={[
            ["本名", status.profile?.realName || "未設定"],
            ["出身地", status.profile?.birthplace || "未設定"],
            ["性格", PERSONALITY_LABELS[status.profile?.personality || "CALM"] || "冷静"],
            ["体格", `${Math.round(status.bodyMetrics?.heightCm || 0)}cm / ${Math.round(status.bodyMetrics?.weightKg || 0)}kg`],
            ["体型", status.bodyType && CONSTANTS.BODY_TYPE_DATA[status.bodyType] ? CONSTANTS.BODY_TYPE_DATA[status.bodyType].name : "不明"],
          ]}
        />

        <div className="report-detail-card p-4 sm:p-5">
          <h3 className="section-header mb-3">スキル</h3>
          {status.traits?.length > 0 ? (
            <div className="space-y-2">
              {status.traits.map((traitId) => {
                const trait = CONSTANTS.TRAIT_DATA[traitId];
                if (!trait) return null;
                const rarity = RARITY_COLORS[trait.rarity];
                return (
                  <div key={traitId} className={`border p-3 ${rarity.bg} ${rarity.border}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm ${trait.isNegative ? "text-warning-bright" : "text-text"}`}>{trait.name}</span>
                      <span className={`text-[11px] px-2 py-0.5 border ui-text-label ${rarity.text} ${rarity.border}`}>{trait.rarity}</span>
                    </div>
                    <p className="text-xs text-text-dim mt-1 leading-relaxed">{trait.description}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="report-empty">スキルは付与されていません。身体条件と番付運の比重が高い力士です。</div>
          )}
        </div>
      </div>
      )}

      {mode !== "story" && (
      <div className="report-detail-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="section-header">
            <Heart className="w-4 h-4 text-warning" /> 引退時の身体状態
          </h3>
          <p className="text-xs text-text-dim">欠損時は大過なしとして自然に扱います</p>
        </div>
        {status.injuries?.length > 0 ? (
          <div className="flex flex-col xl:flex-row gap-5 items-start">
            <DamageMap injuries={status.injuries} bodyType={status.bodyType} className="w-full xl:w-3/5 mx-auto pixel-art-surface" />
            <div className="grid grid-cols-1 gap-2 w-full xl:w-2/5">
              {status.injuries.map((injury) => {
                const isChronic = injury.status === "CHRONIC";
                const isHealed = injury.status === "HEALED";
                return (
                  <div key={injury.id} className={`border p-3 ${isHealed ? "border-brand-muted/60 bg-surface-base/80" : isChronic ? "border-warning/55 bg-warning/10" : "border-warning/40 bg-warning/8"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className={`text-sm ${isHealed ? "text-text-dim" : "text-text"}`}>{injury.name}</span>
                      <span className={`text-[11px] px-2 py-0.5 border ui-text-label ${isHealed ? "border-brand-muted/60 text-text-dim" : "border-warning/45 text-warning-bright"}`}>
                        {isHealed ? "完治" : isChronic ? "慢性" : "治療中"}
                      </span>
                    </div>
                    <div className="text-xs text-text-dim mt-1">{isHealed ? "回復済み" : `重症度 ${injury.severity}/10`}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="report-empty">深刻な怪我や古傷は確認されませんでした。</div>
        )}
      </div>
      )}

      {mode !== "story" && status.genome && (
        <div className="report-detail-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="section-header">DNA要約</h3>
            <p className="text-xs text-text-dim">細部は残すが、比較軸を4群に整理</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DnaBlock title="初期能力" items={[["筋力上限", Math.round(status.genome.base.powerCeiling)], ["技術上限", Math.round(status.genome.base.techCeiling)], ["速度上限", Math.round(status.genome.base.speedCeiling)], ["土俵感覚", Math.round(status.genome.base.ringSense)], ["戦術適性", Math.round(status.genome.base.styleFit)]]} />
            <DnaBlock title="成長曲線" items={[["ピーク年齢", `${Math.round(status.genome.growth.maturationAge)}歳`], ["ピーク期間", `${Math.round(status.genome.growth.peakLength)}年`], ["衰退速度", `${status.genome.growth.lateCareerDecay.toFixed(1)}x`], ["適応力", Math.round(status.genome.growth.adaptability)]]} />
            <DnaBlock title="耐久性" items={[["怪我リスク", `${status.genome.durability.baseInjuryRisk.toFixed(2)}x`], ["回復力", `${status.genome.durability.recoveryRate.toFixed(1)}x`], ["慢性化耐性", Math.round(status.genome.durability.chronicResistance)]]} />
            <DnaBlock title="変動性" items={[["調子の振れ", Math.round(status.genome.variance.formVolatility)], ["勝負強さ", `${status.genome.variance.clutchBias > 0 ? "+" : ""}${Math.round(status.genome.variance.clutchBias)}`], ["復帰力", Math.round(status.genome.variance.slumpRecovery)], ["連勝感度", Math.round(status.genome.variance.streakSensitivity)]]} />
          </div>
        </div>
      )}

      {snapshotModal && (
        <SnapshotModal
          state={snapshotModal}
          onClose={() => setSnapshotModal(null)}
        />
      )}
      {decisionSnapshotModal && (
        <DecisionSnapshotModal
          state={decisionSnapshotModal}
          onClose={() => setDecisionSnapshotModal(null)}
        />
      )}
      {torikumiModal && (
        <TorikumiDetailModal
          state={torikumiModal}
          onClose={() => setTorikumiModal(null)}
        />
      )}
    </div>
  );
};

const InfoCard: React.FC<{ title: string; rows: Array<[string, string]>; icon?: React.ReactNode; footer?: string }> = ({ title, rows, icon, footer }) => (
  <div className="report-detail-card p-4 sm:p-5">
    <h3 className="section-header mb-3">
      {icon}
      {title}
    </h3>
    <div className="space-y-1 text-xs">
      {rows.map(([key, value]) => (
        <div key={key} className="data-row gap-4">
          <span className="data-key">{key}</span>
          <span className="data-val text-right break-words">{value}</span>
        </div>
      ))}
    </div>
    {footer && <p className="mt-3 pt-3 border-t border-brand-muted/60 text-xs text-text-dim leading-relaxed">{footer}</p>}
  </div>
);

const DnaBlock: React.FC<{ title: string; items: Array<[string, string | number]> }> = ({ title, items }) => (
  <div className="border border-brand-muted/65 bg-surface-base/85 p-3 space-y-1">
    <div className="ui-text-label text-brand-line text-xs mb-1">{title}</div>
    {items.map(([key, value]) => (
      <div key={key} className="data-row gap-4">
        <span className="data-key">{key}</span>
        <span className="data-val text-right">{value}</span>
      </div>
    ))}
  </div>
);

const RivalryBlock: React.FC<{
  title: string;
  description: string;
  entries: RivalryEntry[];
  isLoading: boolean;
  emptyText: string;
  onOpenSnapshot: (categoryLabel: string, entry: RivalryEntry) => void;
}> = ({ title, description, entries, isLoading, emptyText, onOpenSnapshot }) => (
  <div className="space-y-2">
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
      <div className="ui-text-label text-sm text-text">{title}</div>
      <div className="text-xs text-text-dim">{description}</div>
    </div>
    {isLoading ? (
      <div className="report-empty">宿敵史を読み込んでいます。</div>
    ) : entries.length === 0 ? (
      <div className="report-empty">{emptyText}</div>
    ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {entries.map((entry) => (
          <div
            key={`${title}-${entry.opponentId}`}
            className={`border p-3 space-y-3 ${resolveRivalryAccent(title)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-text">{entry.shikona}</div>
                <div className="text-xs text-text-dim">{entry.representativeRankLabel}</div>
              </div>
              <div className="text-right text-[11px] text-text-dim">
                <div>{entry.featuredBashoLabel}</div>
                <div>根拠 {entry.evidenceCount}件</div>
              </div>
            </div>
            <p className="text-xs text-text leading-relaxed">{entry.summary}</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="border border-brand-muted/60 bg-surface-base/75 px-2 py-1.5">
                <div className="text-text-dim">通算対戦</div>
                <div className="text-text">{headToHeadLabel(entry)}</div>
              </div>
              <div className="border border-brand-muted/60 bg-surface-base/75 px-2 py-1.5">
                <div className="text-text-dim">象徴の場所</div>
                <div className="text-text">{entry.featuredBashoLabel}</div>
              </div>
            </div>
            <p className="text-xs text-text-dim leading-relaxed">{entry.featuredReason}</p>
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => onOpenSnapshot(title, entry)}>
              <Eye className="w-3.5 h-3.5" />
              当時の番付表を見る
            </Button>
          </div>
        ))}
      </div>
    )}
  </div>
);

const ImportantDecisionCard: React.FC<{
  highlight: ReportImportantDecisionHighlight;
  onOpen: (highlight: ReportImportantDecisionHighlight) => void;
}> = ({ highlight, onOpen }) => {
  const toneClass =
    highlight.tone === "warning"
      ? "border-warning/45 bg-warning/8"
      : highlight.tone === "state"
        ? "border-state/40 bg-state/10"
        : "border-brand-line/35 bg-brand-ink/60";

  return (
    <div className={`border p-3 space-y-3 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-text">{highlight.title}</div>
          <div className="text-xs text-text-dim">
            {highlight.bashoLabel}
            {highlight.day ? ` ${highlight.day}日目` : ""}
          </div>
        </div>
        <div className="text-[11px] text-text-dim">{highlight.kind === "BANZUKE" ? "番付" : "本割"}</div>
      </div>
      <p className="text-xs text-text leading-relaxed">{highlight.summary}</p>
      <div className="space-y-1 text-xs text-text-dim">
        {highlight.detailLines.map((line, index) => (
          <div key={`${highlight.key}-${index}`} className="leading-relaxed">
            {line}
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => onOpen(highlight)}>
        <Eye className="w-3.5 h-3.5" />
        {highlight.kind === "BANZUKE" ? "当時の番付表を見る" : "その日の対戦情報を見る"}
      </Button>
    </div>
  );
};

const SnapshotModal: React.FC<{
  state: SnapshotModalState;
  onClose: () => void;
}> = ({ state, onClose }) => (
  <div
    className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center"
    onClick={onClose}
  >
    <div
      className="w-full max-w-4xl max-h-[88vh] overflow-hidden border border-brand-muted/70 bg-surface-panel shadow-rpg"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-4 border-b border-brand-muted/60 px-4 py-3 sm:px-5">
        <div className="space-y-1">
          <div className="ui-text-label text-xs text-warning-bright">{state.categoryLabel}</div>
          <h4 className="text-sm sm:text-base text-text">{state.snapshot.bashoLabel}の番付表</h4>
          <p className="text-xs text-text-dim">
            {DIVISION_NAMES[state.snapshot.division]} / {state.entry.shikona} が壁として立った場所
          </p>
        </div>
        <button
          type="button"
          className="p-2 text-text-dim hover:text-text border border-transparent hover:border-brand-muted/70"
          onClick={onClose}
          aria-label="番付表を閉じる"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-3 px-4 py-3 sm:px-5 sm:py-4 overflow-y-auto max-h-[calc(88vh-72px)]">
        <div className="border border-brand-muted/60 bg-surface-base/80 px-3 py-2 text-xs text-text-dim leading-relaxed">
          {state.entry.featuredReason}
        </div>
        <div className="space-y-2">
          {state.snapshot.rows.length === 0 ? (
            <div className="report-empty">この場所の番付表は保存されていません。</div>
          ) : (
            state.snapshot.rows.map((row) => {
              const boutMark = state.boutMarks[row.entityId];
              const highlightClass = row.isPlayer
                ? "border-action/55 bg-action/10"
                : row.entityId === state.entry.opponentId
                  ? "border-warning/55 bg-warning/10"
                  : "border-brand-muted/55 bg-surface-base/75";
              return (
                <div
                  key={`${state.snapshot.seq}-${row.entityId}`}
                  className={`grid grid-cols-[78px_minmax(0,1fr)_70px] sm:grid-cols-[94px_minmax(0,1fr)_92px_120px] gap-2 items-start border px-3 py-2 text-xs ${highlightClass}`}
                >
                  <div className="text-text-dim">{formatRankName(row.rank)}</div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`truncate ${row.isPlayer || row.entityId === state.entry.opponentId ? "text-text" : "text-text-dim"}`}>
                        {row.shikona}
                      </span>
                      {boutMark && (
                        <span className="ui-text-label border border-brand-muted/60 px-1.5 py-0.5 text-[10px] text-brand-line">
                          {boutMark}
                        </span>
                      )}
                      {row.isYushoWinner && (
                        <span className="ui-text-label border border-warning/45 px-1.5 py-0.5 text-[10px] text-warning-bright">
                          優勝
                        </span>
                      )}
                    </div>
                    {row.titles.filter((title) => title !== "YUSHO").length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {row.titles
                          .filter((title) => title !== "YUSHO")
                          .map((title) => (
                            <span
                              key={`${row.entityId}-${title}`}
                              className="ui-text-label border border-brand-muted/60 px-1.5 py-0.5 text-[10px] text-text-dim"
                            >
                              {title}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                  <div className="text-text">{row.recordText}</div>
                  <div className="hidden sm:block text-text-dim">
                    {row.isPlayer ? "プレイヤー" : row.entityId === state.entry.opponentId ? "ライバル" : ""}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  </div>
);

const DecisionSnapshotModal: React.FC<{
  state: DecisionSnapshotModalState;
  onClose: () => void;
}> = ({ state, onClose }) => (
  <div
    className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center"
    onClick={onClose}
  >
    <div
      className="w-full max-w-4xl max-h-[88vh] overflow-hidden border border-brand-muted/70 bg-surface-panel shadow-rpg"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-4 border-b border-brand-muted/60 px-4 py-3 sm:px-5">
        <div className="space-y-1">
          <div className="ui-text-label text-xs text-warning-bright">重要番付判断</div>
          <h4 className="text-sm sm:text-base text-text">{state.highlight.bashoLabel}の番付表</h4>
          <p className="text-xs text-text-dim">{state.highlight.summary}</p>
        </div>
        <button
          type="button"
          className="p-2 text-text-dim hover:text-text border border-transparent hover:border-brand-muted/70"
          onClick={onClose}
          aria-label="番付表を閉じる"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-3 px-4 py-3 sm:px-5 sm:py-4 overflow-y-auto max-h-[calc(88vh-72px)]">
        <div className="border border-brand-muted/60 bg-surface-base/80 px-3 py-2 text-xs text-text-dim leading-relaxed">
          {state.highlight.detailLines.join(" / ")}
        </div>
        <div className="space-y-2">
          {state.snapshot.rows.length === 0 ? (
            <div className="report-empty">この場所の番付表は保存されていません。</div>
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
                  <div className="text-text-dim">{formatRankName(row.rank)}</div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`${row.isPlayer ? "text-text" : "text-text-dim"} truncate`}>{row.shikona}</span>
                      {boutMark && (
                        <span className="ui-text-label border border-brand-muted/60 px-1.5 py-0.5 text-[10px] text-brand-line">
                          {boutMark}
                        </span>
                      )}
                      {row.isYushoWinner && (
                        <span className="ui-text-label border border-warning/45 px-1.5 py-0.5 text-[10px] text-warning-bright">
                          優勝
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-text">{row.recordText}</div>
                  <div className="hidden sm:block text-text-dim">{row.isPlayer ? "プレイヤー" : ""}</div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  </div>
);

const TorikumiDetailModal: React.FC<{
  state: TorikumiModalState;
  onClose: () => void;
}> = ({ state, onClose }) => (
  <div
    className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center"
    onClick={onClose}
  >
    <div
      className="w-full max-w-2xl border border-brand-muted/70 bg-surface-panel shadow-rpg"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-4 border-b border-brand-muted/60 px-4 py-3 sm:px-5">
        <div className="space-y-1">
          <div className="ui-text-label text-xs text-brand-line">重要本割判断</div>
          <h4 className="text-sm sm:text-base text-text">
            {state.highlight.bashoLabel}
            {state.highlight.day ? ` ${state.highlight.day}日目` : ""}
          </h4>
          <p className="text-xs text-text-dim">{state.highlight.summary}</p>
        </div>
        <button
          type="button"
          className="p-2 text-text-dim hover:text-text border border-transparent hover:border-brand-muted/70"
          onClick={onClose}
          aria-label="対戦情報を閉じる"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-3 px-4 py-4 sm:px-5">
        <div className="border border-brand-muted/60 bg-surface-base/80 px-3 py-2 text-xs text-text-dim leading-relaxed">
          {state.highlight.detailLines.join(" / ")}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="border border-brand-muted/60 bg-surface-base/75 px-3 py-2">
            <div className="text-text-dim">対戦結果</div>
            <div className="text-text">
              {state.bout ? (state.bout.result === "WIN" ? "○ 勝ち" : state.bout.result === "LOSS" ? "● 負け" : "や 休場") : "保存なし"}
            </div>
          </div>
          <div className="border border-brand-muted/60 bg-surface-base/75 px-3 py-2">
            <div className="text-text-dim">決まり手</div>
            <div className="text-text">{state.bout?.kimarite || "記録なし"}</div>
          </div>
        </div>
        {state.bout?.opponentShikona && (
          <div className="text-xs text-text-dim">
            相手: {state.bout.opponentShikona}
          </div>
        )}
      </div>
    </div>
  </div>
);
