import React from "react";
import { RankScaleSlots, RikishiStatus, Rank, Rarity } from "../../../logic/models";
import { getRankValueForChart } from "../../../logic/ranking";
import { LIMITS, resolveRankLimits, resolveRankSlotOffset } from "../../../logic/banzuke/scale/rankLimits";
import { CONSTANTS } from "../../../logic/constants";
import { Button } from "../../../shared/ui/Button";
import { DamageMap } from "../../../shared/ui/DamageMap";
import {
  ArrowLeft,
  Trophy,
  Activity,
  TrendingUp,
  TrendingDown,
  UserPlus,
  Flag,
  Sparkles,
  BarChart3,
  ScrollText,
  Save,
  Check,
  Swords,
  Heart,
  Award,
  Star,
} from "lucide-react";
import { AchievementView } from "./AchievementView";
import { HoshitoriCareerRecord, HoshitoriTable } from "./HoshitoriTable";
import { listCareerPlayerBoutsByBasho } from "../../../logic/persistence/repository";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  ReferenceArea,
} from "recharts";

// === 共通ヘルパー ===

const RARITY_COLORS: Record<Rarity, { bg: string; text: string; border: string }> = {
  N: { bg: "bg-bg-light border-2 border-text-dim/30", text: "text-text-dim", border: "border-text-dim/30" },
  R: { bg: "bg-bg/20 border-2 border-gold-muted/40", text: "text-gold-muted", border: "border-gold-muted/40" },
  SR: { bg: "bg-gold/10 border-2 border-gold/30", text: "text-gold", border: "border-gold/30" },
  UR: { bg: "bg-crimson/15 border-2 border-crimson/40", text: "text-crimson", border: "border-crimson/40" },
};

const RarityBadge: React.FC<{ rarity: Rarity }> = ({ rarity }) => {
  const c = RARITY_COLORS[rarity];
  return (
    <span className={`text-xs ui-text-label px-1.5 py-0.5 ${c.bg} ${c.text}`}>
      {rarity}
    </span>
  );
};

const DIVISION_NAMES: Record<string, string> = {
  Makuuchi: "幕内", Juryo: "十両", Makushita: "幕下",
  Sandanme: "三段目", Jonidan: "序二段", Jonokuchi: "序ノ口", Maezumo: "前相撲",
};

const DIVISION_COLORS: Record<string, string> = {
  Makuuchi: "#D4A017", Juryo: "#8B6914", Makushita: "#4488DD",
  Sandanme: "#44AA44", Jonidan: "#7a9a5a", Jonokuchi: "#6a8a5a", Maezumo: "#555555",
};

const RANK_CHART_BANDS: Array<{
  key: "Makuuchi" | "Juryo" | "Makushita" | "Sandanme" | "Jonidan" | "Jonokuchi";
  label: string; top: number; bottom: number;
}> = [
    { key: "Makuuchi", label: "幕内", top: 0, bottom: 57 },
    { key: "Juryo", label: "十両", top: 60, bottom: 74 },
    { key: "Makushita", label: "幕下", top: 80, bottom: 140 },
    { key: "Sandanme", label: "三段目", top: 150, bottom: 250 },
    { key: "Jonidan", label: "序二段", top: 260, bottom: 360 },
    { key: "Jonokuchi", label: "序ノ口", top: 370, bottom: 400 },
  ];

const PERSONALITY_LABELS: Record<string, string> = {
  CALM: "冷静", AGGRESSIVE: "闘争的", SERIOUS: "真面目",
  WILD: "奔放", CHEERFUL: "陽気", SHY: "人見知り",
};

const TOOLTIP_STYLE = {
  borderRadius: 0,
  background: "#0a0e1a",
  border: "2px solid #D4A017",
  color: "#e8e0d0",
  fontSize: 12,
};

const formatRankName = (rank: Rank, simple = false) => {
  if (rank.name === "前相撲") return rank.name;
  const side = rank.side === "West" ? "西" : rank.side === "East" ? "東" : "";
  const sidePrefix = simple ? "" : side;
  if (["横綱", "大関", "関脇", "小結"].includes(rank.name)) return `${sidePrefix}${rank.name}`;
  const number = rank.number || 1;
  if (number === 1) return `${sidePrefix}${rank.name}筆頭`;
  return `${sidePrefix}${rank.name}${number}枚目`;
};

const formatRecordText = (w: number, l: number, a: number): string =>
  `${w}勝${l}敗${a > 0 ? `${a}休` : ""}`;

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

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

const formatBanzukeDelta = (d: number): string => {
  const abs = Math.abs(d);
  const mag = Number.isInteger(abs) ? `${abs}` : `${abs.toFixed(1)}`;
  if (d > 0) return `+${mag}`;
  if (d < 0) return `-${mag}`;
  return "±0";
};

type RankMovement = {
  basho: string; rank: string; record: string;
  nextRank: string; deltaText: string;
  deltaKind: "up" | "down" | "stay" | "last";
};

const resolveEntryAge = (status: RikishiStatus): number => {
  if (typeof status.entryAge === "number" && Number.isFinite(status.entryAge)) return status.entryAge;
  const records = status.history.records;
  if (!records.length) return status.age;
  const elapsed = Math.max(0, records[records.length - 1].year - records[0].year);
  return Math.max(15, status.age - elapsed);
};

// === タブ定義 ===
type TabId = "overview" | "charts" | "timeline" | "achievements";
const TABS: { id: TabId; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: "overview", label: "概要", icon: BarChart3 },
  { id: "charts", label: "グラフ", icon: Activity },
  { id: "timeline", label: "年表", icon: ScrollText },
  { id: "achievements", label: "実績", icon: Award },
];

// === メインコンポーネント ===
interface ReportScreenProps {
  status: RikishiStatus;
  onReset: () => void;
  onSave?: () => void | Promise<void>;
  isSaved?: boolean;
  careerId?: string | null;
}

export const ReportScreen: React.FC<ReportScreenProps> = ({
  status, onReset, onSave, isSaved = false, careerId = null,
}) => {
  const [activeTab, setActiveTab] = React.useState<TabId>("overview");
  const [savedFlash, setSavedFlash] = React.useState(false);
  const [hoshitoriCareerRecords, setHoshitoriCareerRecords] = React.useState<HoshitoriCareerRecord[]>([]);
  const [isHoshitoriLoading, setIsHoshitoriLoading] = React.useState(false);
  const [hoshitoriErrorMessage, setHoshitoriErrorMessage] = React.useState<string | undefined>(undefined);
  const entryAge = React.useMemo(() => resolveEntryAge(status), [status]);

  const { shikona, history } = status;
  const { title, maxRank, totalWins, totalLosses, totalAbsent, yushoCount } = history;
  const totalBashoCount = history.records.length;
  const winRate = totalWins + totalLosses > 0 ? ((totalWins / (totalWins + totalLosses)) * 100).toFixed(1) : "0.0";

  const makuuchiStats = React.useMemo(() => {
    const recs = history.records.filter((r) => r.rank.division === "Makuuchi");
    return {
      wins: recs.reduce((a, c) => a + c.wins, 0),
      losses: recs.reduce((a, c) => a + c.losses, 0),
      absent: recs.reduce((a, c) => a + c.absent, 0),
      bashoCount: recs.length,
    };
  }, [history.records]);

  const awardsSummary = React.useMemo(() => {
    let kinboshi = 0, shukun = 0, kantou = 0, ginou = 0;
    history.records.forEach((r) => {
      kinboshi += r.kinboshi || 0;
      r.specialPrizes?.forEach((p) => {
        if (p === "殊勲賞") shukun++;
        if (p === "敢闘賞") kantou++;
        if (p === "技能賞") ginou++;
      });
    });
    return { kinboshi, shukun, kantou, ginou, totalSansho: shukun + kantou + ginou };
  }, [history.records]);

  const divisionStats = React.useMemo(() => {
    const divs = ["Makuuchi", "Juryo", "Makushita", "Sandanme", "Jonidan", "Jonokuchi", "Maezumo"] as const;
    return divs.map((div) => {
      const recs = history.records.filter((r) => r.rank.division === div);
      return {
        name: div, basho: recs.length,
        wins: recs.reduce((a, c) => a + c.wins, 0),
        losses: recs.reduce((a, c) => a + c.losses, 0),
        absent: recs.reduce((a, c) => a + c.absent, 0),
        yusho: recs.filter((r) => r.yusho).length,
      };
    }).filter((d) => d.basho > 0);
  }, [history.records]);

  const abilityHistoryData = React.useMemo(() => {
    if (!status.statHistory?.length) return [];
    return status.statHistory.map((item) => ({
      age: item.age,
      tsuki: Math.round(item.stats.tsuki), oshi: Math.round(item.stats.oshi),
      kumi: Math.round(item.stats.kumi), nage: Math.round(item.stats.nage),
      koshi: Math.round(item.stats.koshi), deashi: Math.round(item.stats.deashi),
      waza: Math.round(item.stats.waza), power: Math.round(item.stats.power),
    }));
  }, [status.statHistory]);

  const kimariteData = React.useMemo(() => {
    const total = history.kimariteTotal || {};
    return Object.entries(total).sort(([, a], [, b]) => b - a).slice(0, 10).map(([name, count]) => ({ name, count }));
  }, [history.kimariteTotal]);

  const jonokuchiBottomRankValue = React.useMemo(() => {
    const maxNum = history.records.reduce((max, r) => {
      const m = resolveRankLimits(r.scaleSlots).JONOKUCHI_MAX;
      return Math.max(max, m, r.rank.division === "Jonokuchi" ? (r.rank.number || 1) : 0);
    }, LIMITS.JONOKUCHI_MAX);
    return getRankValueForChart({ division: "Jonokuchi", name: "序ノ口", number: maxNum, side: "West" });
  }, [history.records]);

  const firstRecordYear = history.records[0]?.year ?? new Date().getFullYear();
  const lineData = history.records.filter((r) => r.rank.division !== "Maezumo").map((r) => ({
    time: `${r.year}年${r.month}月`, age: entryAge + (r.year - firstRecordYear),
    rankVal: -1 * getRankValueForChart(r.rank), rankLabel: formatRankName(r.rank),
  }));

  const rankMovements = React.useMemo<RankMovement[]>(() => {
    return history.records.map((record, index) => {
      const next = history.records[index + 1];
      if (!next) return {
        basho: `${record.year}年${record.month}月`, rank: formatRankName(record.rank),
        record: formatRecordText(record.wins, record.losses, record.absent),
        nextRank: "最終場所", deltaText: "-", deltaKind: "last",
      };
      const deltaSlots = resolveRankSlot(record.rank, record.scaleSlots) - resolveRankSlot(next.rank, next.scaleSlots);
      const deltaInBanzuke = deltaSlots / 2;
      return {
        basho: `${record.year}年${record.month}月`, rank: formatRankName(record.rank),
        record: formatRecordText(record.wins, record.losses, record.absent),
        nextRank: formatRankName(next.rank), deltaText: formatBanzukeDelta(deltaInBanzuke),
        deltaKind: deltaInBanzuke > 0 ? "up" : deltaInBanzuke < 0 ? "down" : "stay",
      };
    });
  }, [history.records]);

  // 星取表データ読み込み
  React.useEffect(() => {
    let cancelled = false;
    const baseRecords: HoshitoriCareerRecord[] = history.records
      .filter((r) => r.rank.division !== "Maezumo")
      .map((r) => ({ year: r.year, month: r.month, rank: r.rank, wins: r.wins, losses: r.losses, absent: r.absent, bouts: [] }));
    if (!careerId) {
      setHoshitoriCareerRecords(baseRecords);
      setIsHoshitoriLoading(false);
      setHoshitoriErrorMessage("場所別の取組詳細データが見つからないため、記号のみで表示しています。");
      return () => { cancelled = true; };
    }
    setIsHoshitoriLoading(true);
    setHoshitoriErrorMessage(undefined);
    void (async () => {
      try {
        const boutRows = await listCareerPlayerBoutsByBasho(careerId);
        if (cancelled) return;
        const boutsBySeq = new Map(boutRows.map((e) => [e.bashoSeq, e.bouts]));
        setHoshitoriCareerRecords(
          history.records.map((r, i) => ({
            year: r.year, month: r.month, rank: r.rank, wins: r.wins, losses: r.losses, absent: r.absent,
            bouts: boutsBySeq.get(i + 1) || [],
          })).filter((r) => r.rank.division !== "Maezumo"),
        );
      } catch {
        if (!cancelled) { setHoshitoriCareerRecords(baseRecords); setHoshitoriErrorMessage("星取表データの取得に失敗したため、記号のみで表示しています。"); }
      } finally { if (!cancelled) setIsHoshitoriLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [careerId, history.records]);

  const handleSave = async () => {
    if (!onSave) return;
    await onSave();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 3000);
  };

  // === 概要タブ ===
  const renderOverview = () => (
    <div className="space-y-4 animate-in">
      {/* 成績サマリー */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
        <StatBlock label="通算成績" value={`${totalWins}勝`} sub={`${totalLosses}敗${totalAbsent > 0 ? ` ${totalAbsent}休` : ""}`} />
        <StatBlock label="最高位" value={formatRankName(maxRank, true)} sub={`${totalBashoCount}場所 / 勝率${winRate}%`} />
        <StatBlock label="幕内優勝" value={`${yushoCount.makuuchi}`} sub="回" accent />
        <StatBlock label="金星" value={`${awardsSummary.kinboshi}`} sub="個" icon={<Star className="w-4 h-4 text-gold fill-gold/30" />} />
        <StatBlock label="三賞" value={`${awardsSummary.totalSansho}`} sub={`殊${awardsSummary.shukun} 敢${awardsSummary.kantou} 技${awardsSummary.ginou}`} />
        <StatBlock
          label="十両以下優勝"
          value={`${yushoCount.juryo + yushoCount.makushita + yushoCount.others}`}
          sub="回"
        />
      </div>

      {/* 幕内勝率バー */}
      {makuuchiStats.bashoCount > 0 && (
        <div className="rpg-panel p-4 sm:p-5">
          <h3 className="section-header mb-3">幕内成績</h3>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex-1">
              <div className="flex justify-between text-xs text-text mb-1">
                <span>{makuuchiStats.wins}勝</span>
                <span>{makuuchiStats.losses}敗{makuuchiStats.absent > 0 ? ` ${makuuchiStats.absent}休` : ""}</span>
              </div>
              <div className="gauge-bar">
                <div
                  className="gauge-fill bg-gold"
                  style={{ width: `${(makuuchiStats.wins / Math.max(1, makuuchiStats.wins + makuuchiStats.losses)) * 100}%` }}
                />
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-xl sm:text-2xl ui-text-label text-gold">
                {makuuchiStats.wins + makuuchiStats.losses > 0
                  ? ((makuuchiStats.wins / (makuuchiStats.wins + makuuchiStats.losses)) * 100).toFixed(1) : "0.0"}%
              </span>
              <div className="text-xs text-text-dim">{makuuchiStats.bashoCount}場所</div>
            </div>
          </div>
        </div>
      )}

      {/* 階級別成績 */}
      <div className="rpg-panel p-4 sm:p-5">
        <h3 className="section-header mb-3">階級別成績</h3>
        <div className="space-y-2">
          {(() => {
            const maxTotal = Math.max(...divisionStats.map((d) => d.wins + d.losses), 1);
            return divisionStats.map((d) => {
              const total = d.wins + d.losses;
              const barW = (total / maxTotal) * 100;
              const winPct = total > 0 ? (d.wins / total) * 100 : 0;
              return (
                <div key={d.name} className="flex items-center gap-2 sm:gap-3">
                  <span className="text-xs w-12 sm:w-14 shrink-0 text-right" style={{ color: DIVISION_COLORS[d.name] }}>
                    {DIVISION_NAMES[d.name]}
                  </span>
                  <div className="flex-1">
                    <div className="h-4 sm:h-5 overflow-hidden flex" style={{ width: `${Math.max(barW, 8)}%` }}>
                      <div className="h-full transition-all" style={{ width: `${winPct}%`, backgroundColor: DIVISION_COLORS[d.name], opacity: 0.75 }} />
                      <div className="h-full bg-bg-light" style={{ width: `${100 - winPct}%` }} />
                    </div>
                  </div>
                  <div className="shrink-0 text-right w-24 sm:w-28 text-xs">
                    <span className="text-text">{d.wins}</span>
                    <span className="text-text-dim">勝</span>
                    <span className="text-text ml-0.5">{d.losses}</span>
                    <span className="text-text-dim">敗 ({d.basho}場所)</span>
                  </div>
                  <div className="shrink-0 w-10 sm:w-12 text-center">
                    {d.yusho > 0 ? (
                      <span className="text-xs text-crimson">
                        <Trophy className="w-3 h-3 inline -mt-0.5 mr-0.5" />{d.yusho}
                      </span>
                    ) : <span className="text-xs text-text-dim">-</span>}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* プロフィール・スキル */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rpg-panel p-4 sm:p-5">
          <h3 className="section-header mb-3">
            <Sparkles className="w-4 h-4 text-crimson" /> プロフィール
          </h3>
          <div className="space-y-1 text-xs">
            {[
              ["本名", status.profile?.realName || "（未設定）"],
              ["出身地", status.profile?.birthplace || "（未設定）"],
              ["性格", PERSONALITY_LABELS[status.profile?.personality || "CALM"] || "冷静"],
              ["体格", `${Math.round(status.bodyMetrics?.heightCm || 0)}cm / ${Math.round(status.bodyMetrics?.weightKg || 0)}kg`],
              ["体型", status.bodyType && CONSTANTS.BODY_TYPE_DATA[status.bodyType] ? CONSTANTS.BODY_TYPE_DATA[status.bodyType].name : "不明"],
            ].map(([k, v]) => (
              <div key={k} className="data-row">
                <span className="data-key">{k}</span>
                <span className="data-val">{v}</span>
              </div>
            ))}
          </div>
          {status.bodyType && CONSTANTS.BODY_TYPE_DATA[status.bodyType] && (
            <p className="mt-3 text-xs text-text-dim leading-snug border-t-2 border-gold-muted pt-3">
              {CONSTANTS.BODY_TYPE_DATA[status.bodyType].description}
            </p>
          )}
        </div>
        <div className="rpg-panel p-4 sm:p-5">
          <h3 className="section-header mb-3">スキル</h3>
          {status.traits?.length > 0 ? (
            <div className="space-y-2">
              {status.traits.map((traitId) => {
                const td = CONSTANTS.TRAIT_DATA[traitId];
                if (!td) return null;
                return (
                  <div key={traitId} className={`p-2.5 border-2 ${td.rarity === "UR" ? "border-crimson/40 bg-crimson/5" : td.isNegative ? "border-crimson/30 bg-bg" : "border-gold-muted bg-bg"}`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm ${td.isNegative ? "text-crimson" : ""}`}>{td.name}</span>
                      <RarityBadge rarity={td.rarity} />
                    </div>
                    <p className="text-xs text-text-dim mt-0.5">{td.description}</p>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-sm text-text-dim py-2">スキルなし</p>}
        </div>
      </div>

      {/* 怪我ステータス */}
      <div className="rpg-panel p-4 sm:p-5">
        <h3 className="section-header mb-3">
          <Heart className="w-4 h-4 text-crimson" /> 引退時の身体状態
        </h3>
        {status.injuries?.length > 0 ? (
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <DamageMap
              injuries={status.injuries}
              heightCm={status.bodyMetrics?.heightCm}
              weightKg={status.bodyMetrics?.weightKg}
              className="w-64 sm:w-72 h-auto shrink-0 mx-auto sm:mx-0"
            />
            <div className="grid grid-cols-1 gap-2 flex-grow w-full">
              {status.injuries.map((injury) => {
                const isChronic = injury.status === "CHRONIC";
                const isHealed = injury.status === "HEALED";
                return (
                  <div key={injury.id} className={`p-3 border-2 ${isHealed ? "border-gold-muted bg-bg" : isChronic ? "border-crimson/30 bg-crimson/5" : "border-crimson/40 bg-crimson/5"}`}>
                    <div className="flex justify-between items-center mb-0.5">
                      <span className={`text-sm ${isHealed ? "text-text-dim" : ""}`}>{injury.name}</span>
                      <span className={`text-xs px-2 py-0.5 ui-text-label border-2 ${isHealed ? "border-gold-muted text-text-dim" : "border-crimson/30 text-crimson"}`}>
                        {isHealed ? "完治" : isChronic ? "慢性" : "治療中"}
                      </span>
                    </div>
                    <div className="text-xs text-text-dim">
                      {isHealed ? "回復済み" : `重症度: ${injury.severity}/10`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : <p className="text-sm text-text-dim text-center py-3">深刻な怪我や古傷はありませんでした。</p>}
      </div>

      {/* DNA要約 */}
      {status.genome && (
        <div className="rpg-panel p-4 sm:p-5">
          <h3 className="section-header mb-3">DNA要約</h3>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs">
            <DnaBlock title="初期能力" items={[
              ["筋力上限", Math.round(status.genome.base.powerCeiling)],
              ["技術上限", Math.round(status.genome.base.techCeiling)],
              ["速度上限", Math.round(status.genome.base.speedCeiling)],
              ["土俵感覚", Math.round(status.genome.base.ringSense)],
              ["戦術適性", Math.round(status.genome.base.styleFit)],
            ]} />
            <DnaBlock title="成長曲線" items={[
              ["ピーク年齢", `${Math.round(status.genome.growth.maturationAge)}歳`],
              ["ピーク期間", `${Math.round(status.genome.growth.peakLength)}年`],
              ["衰退速度", `${status.genome.growth.lateCareerDecay.toFixed(1)}x`],
              ["適応力", Math.round(status.genome.growth.adaptability)],
            ]} />
            <DnaBlock title="耐久性" items={[
              ["怪我リスク", `${status.genome.durability.baseInjuryRisk.toFixed(2)}x`],
              ["回復力", `${status.genome.durability.recoveryRate.toFixed(1)}x`],
              ["慢性化耐性", Math.round(status.genome.durability.chronicResistance)],
            ]} />
            <DnaBlock title="変動性" items={[
              ["調子の振れ", Math.round(status.genome.variance.formVolatility)],
              ["勝負強さ", `${status.genome.variance.clutchBias > 0 ? "+" : ""}${Math.round(status.genome.variance.clutchBias)}`],
              ["復帰力", Math.round(status.genome.variance.slumpRecovery)],
              ["連勝感度", Math.round(status.genome.variance.streakSensitivity)],
            ]} />
          </div>
        </div>
      )}
    </div>
  );

  // === グラフタブ ===
  const renderCharts = () => (
    <div className="space-y-4 animate-in">
      <div className="rpg-panel p-4 sm:p-5">
        <h3 className="section-header mb-2">
          <Activity className="w-4 h-4" /> 能力推移 (年齢別)
        </h3>
        <div className="h-[240px] sm:h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={abilityHistoryData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,160,23,0.1)" />
              <XAxis dataKey="age" tick={{ fontSize: 11, fill: "#8a8472" }} label={{ value: "年齢", position: "insideBottomRight", offset: -5, fontSize: 11, fill: "#8a8472" }} />
              <YAxis domain={[0, 150]} tick={{ fontSize: 11, fill: "#8a8472" }} width={35} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {[
                { key: "tsuki", name: "突き", color: "#ef4444" },
                { key: "oshi", name: "押し", color: "#f97316" },
                { key: "kumi", name: "組力", color: "#4488DD" },
                { key: "nage", name: "投げ", color: "#44AA44" },
                { key: "koshi", name: "腰", color: "#a855f7" },
                { key: "deashi", name: "出足", color: "#06b6d4" },
                { key: "waza", name: "技術", color: "#ec4899" },
                { key: "power", name: "筋力", color: "#854d0e" },
              ].map((l) => (
                <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} dot={false} strokeWidth={2} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rpg-panel p-4 sm:p-5">
        <h3 className="section-header mb-2">
          <TrendingUp className="w-4 h-4" /> 番付推移
        </h3>
        <div className="flex flex-wrap gap-2 text-xs text-text-dim mb-2">
          {RANK_CHART_BANDS.map((b) => (
            <span key={b.key} className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 border border-gold-muted" style={{ backgroundColor: DIVISION_COLORS[b.key], opacity: 0.24 }} />
              {b.label}
            </span>
          ))}
        </div>
        <div className="h-[240px] sm:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,160,23,0.1)" />
              <XAxis dataKey="time" interval={5} tick={{ fontSize: 10, fill: "#8a8472" }} />
              <YAxis
                domain={[-1 * jonokuchiBottomRankValue, 10]}
                tickFormatter={(v) => {
                  const abs = Math.abs(v);
                  if (abs === 0) return "横綱"; if (abs === 10) return "大関";
                  if (abs === 40) return "幕内"; if (abs === 60) return "十両";
                  if (abs === 80) return "幕下"; if (abs === 150) return "三段目";
                  if (abs === 260) return "序二段"; if (abs === 470) return "序ノ口";
                  return "";
                }}
                ticks={[0, -10, -40, -60, -80, -150, -260, -470]}
                width={50} tick={{ fontSize: 10, fill: "#8a8472" }}
              />
              <Tooltip
                labelFormatter={(l) => `${l}`}
                formatter={(_v: number, _n: string, p: { payload?: { rankLabel: string } }) => [p.payload?.rankLabel || "", "番付"]}
                contentStyle={TOOLTIP_STYLE}
              />
              {RANK_CHART_BANDS.map((b) => (
                <ReferenceArea key={b.key} y1={-1 * b.top} y2={-1 * b.bottom} strokeOpacity={0} fill={DIVISION_COLORS[b.key]} fillOpacity={0.07} />
              ))}
              <Line type="stepAfter" dataKey="rankVal" stroke="#D4A017" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 番付変動表 */}
      <div className="rpg-panel p-4 sm:p-5">
        <h3 className="section-header mb-3">
          <ScrollText className="w-4 h-4" /> 番付変動表
        </h3>
        <div className="border-2 border-gold-muted overflow-hidden">
          <div className="hidden sm:grid grid-cols-[88px_minmax(120px,1fr)_96px_minmax(120px,1fr)_72px] bg-bg-light text-xs ui-text-label text-gold px-3 py-2 border-b-2 border-gold-muted">
            <div>場所</div><div>番付</div><div>成績</div><div>翌場所</div><div className="text-right">変動</div>
          </div>
          <div className="max-h-[300px] overflow-y-auto divide-y divide-gold-muted/20">
            {rankMovements.map((row, idx) => (
              <div key={`${row.basho}-${idx}`} className="sm:grid sm:grid-cols-[88px_minmax(120px,1fr)_96px_minmax(120px,1fr)_72px] px-3 py-2 text-xs items-center">
                <div className="text-text-dim">{row.basho}</div>
                <div className="text-text">{row.rank}</div>
                <div className="text-text">{row.record}</div>
                <div className="text-text-dim hidden sm:block">{row.nextRank}</div>
                <div className={`text-right ${row.deltaKind === "up" ? "text-hp" : row.deltaKind === "down" ? "text-crimson" : "text-text-dim"}`}>
                  {row.deltaKind === "up" ? "↑" : row.deltaKind === "down" ? "↓" : "→"} {row.deltaText}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 決まり手 */}
      {kimariteData.length > 0 && (
        <div className="rpg-panel p-4 sm:p-5">
          <h3 className="section-header mb-2"><Swords className="w-4 h-4" /> 決まり手傾向 (上位10)</h3>
          <div className="h-[280px] sm:h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={kimariteData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,160,23,0.1)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#8a8472" }} />
                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12, fill: "#e8e0d0" }} />
                <Tooltip formatter={(value: number) => [`${value}回`, "回数"]} contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" name="回数" fill="#D4A017" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );

  // === 年表タブ ===
  const renderTimeline = () => (
    <div className="space-y-4 animate-in">
      <HoshitoriTable careerRecords={hoshitoriCareerRecords} isLoading={isHoshitoriLoading} errorMessage={hoshitoriErrorMessage} />
      <EnhancedTimeline history={history} entryAge={entryAge} />
    </div>
  );

  return (
    <div className="space-y-0 max-w-3xl mx-auto">
      {/* === ヒーローセクション === */}
      <div className="relative rpg-panel overflow-hidden mb-4 sm:mb-6">
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: `radial-gradient(circle at 20% 50%, rgba(212,160,23,0.5) 1px, transparent 1px), radial-gradient(circle at 80% 20%, rgba(212,160,23,0.3) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }} />
        <div className="absolute top-0 right-0 w-48 sm:w-64 h-48 sm:h-64 bg-gold/5 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-36 sm:w-48 h-36 sm:h-48 bg-crimson/5 blur-3xl" />

        <div className="relative z-10 px-4 sm:px-8 py-6 sm:py-10 text-center">
          {/* 称号 */}
          <div className="inline-block mb-3">
            <span className="text-xs ui-text-label tracking-[0.2em] px-3 sm:px-4 py-1 sm:py-1.5 border-2 border-gold/40 text-gold bg-gold/10">
              {title || "無名の力士"}
            </span>
          </div>
          {/* 四股名 */}
          <h1 className="text-3xl sm:text-5xl ui-text-label mb-3 sm:mb-4 tracking-tight text-gold">
            {shikona}
          </h1>
          {/* プロフィール行 */}
          <div className="flex flex-wrap justify-center gap-x-3 sm:gap-x-4 gap-y-1 text-xs text-text-dim mb-4 sm:mb-6">
            <span>{status.profile?.realName || "（本名不明）"}</span>
            <span>{status.profile?.birthplace || "（出身不明）"}</span>
            <span>{Math.round(status.bodyMetrics?.heightCm || 0)}cm / {Math.round(status.bodyMetrics?.weightKg || 0)}kg</span>
            <span>{entryAge}歳入門 / {status.age}歳引退</span>
          </div>
          {/* メイン記録グリッド */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 max-w-lg mx-auto">
            <div>
              <div className="text-xs ui-text-label tracking-widest text-text-dim mb-1">最高位</div>
              <div className="text-lg sm:text-xl ui-text-label">{formatRankName(maxRank, true)}</div>
            </div>
            <div>
              <div className="text-xs ui-text-label tracking-widest text-text-dim mb-1">通算</div>
              <div className="text-lg sm:text-xl ui-text-label">{totalWins}<span className="text-sm text-text-dim">勝</span></div>
              <div className="text-xs text-text-dim">{totalLosses}敗{totalAbsent > 0 ? ` ${totalAbsent}休` : ""}</div>
            </div>
            <div>
              <div className="text-xs ui-text-label tracking-widest text-text-dim mb-1">幕内優勝</div>
              <div className="text-lg sm:text-xl ui-text-label text-gold">{yushoCount.makuuchi}<span className="text-sm text-text-dim">回</span></div>
            </div>
            <div>
              <div className="text-xs ui-text-label tracking-widest text-text-dim mb-1">金星</div>
              <div className="text-lg sm:text-xl ui-text-label">{awardsSummary.kinboshi}<span className="text-sm text-text-dim">個</span></div>
            </div>
            <div>
              <div className="text-xs ui-text-label tracking-widest text-text-dim mb-1">三賞</div>
              <div className="text-lg sm:text-xl ui-text-label">{awardsSummary.totalSansho}<span className="text-sm text-text-dim">回</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* タブ + アクション */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between mb-4 gap-2 sm:gap-3">
        <div className="flex bg-bg-panel border-2 border-gold-muted p-0.5 gap-0.5 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm ui-text-label transition-all whitespace-nowrap ${isActive
                  ? "bg-gold/15 text-gold border-2 border-gold/30"
                  : "text-text-dim hover:text-gold border-2 border-transparent"
                  }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onReset}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> もう一度
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={isSaved}
            className={`transition-all ${isSaved || savedFlash ? "bg-hp/20 text-hp border-hp" : ""}`}
          >
            {isSaved || savedFlash ? (
              <><Check className="w-3.5 h-3.5 mr-1" /> 保存済み</>
            ) : (
              <><Save className="w-3.5 h-3.5 mr-1" /> 殿堂入り</>
            )}
          </Button>
        </div>
      </div>

      {/* タブコンテンツ */}
      {activeTab === "overview" && renderOverview()}
      {activeTab === "charts" && renderCharts()}
      {activeTab === "timeline" && renderTimeline()}
      {activeTab === "achievements" && <AchievementView status={status} />}
    </div>
  );
};

// === サブコンポーネント ===

const StatBlock: React.FC<{
  label: string; value: string; sub?: string; accent?: boolean; icon?: React.ReactNode;
}> = ({ label, value, sub, accent, icon }) => (
  <div className="stat-block">
    <div className="flex items-center justify-between">
      <div className="stat-label">{label}</div>
      {icon}
    </div>
    <div className={`stat-value ${accent ? "text-gold" : ""}`}>{value}</div>
    {sub && <div className="stat-sub">{sub}</div>}
  </div>
);

const DnaBlock: React.FC<{
  title: string; items: Array<[string, string | number]>;
}> = ({ title, items }) => (
  <div className="p-3 border-2 border-gold-muted bg-bg space-y-1">
    <div className="ui-text-label text-gold text-xs mb-1">{title}</div>
    {items.map(([k, v]) => (
      <div key={k} className="data-row">
        <span className="data-key">{k}</span>
        <span className="data-val">{v}</span>
      </div>
    ))}
  </div>
);

const EnhancedTimeline: React.FC<{
  history: import("../../../logic/models").CareerHistory;
  entryAge: number;
}> = ({ history, entryAge }) => {
  const [filter, setFilter] = React.useState<"ALL" | "IMPORTANT">("ALL");

  const processedEvents = React.useMemo(() => {
    const startYear = history.events.find((e) => e.type === "ENTRY")?.year || history.events[0]?.year;
    return history.events.map((ev) => ({ ...ev, age: entryAge + Math.floor(ev.year - (startYear ?? ev.year)) }));
  }, [entryAge, history.events]);

  const filteredEvents = React.useMemo(() => {
    if (filter === "ALL") return processedEvents;
    return processedEvents.filter(
      (ev) => ev.type === "YUSHO" || ev.type === "PROMOTION" || ev.type === "RETIREMENT" || ev.type === "ENTRY" || (ev.type === "INJURY" && ev.description.includes("全治")),
    );
  }, [filter, processedEvents]);

  const getIconConfig = (type: string) => {
    switch (type) {
      case "ENTRY": return { icon: <UserPlus className="w-4 h-4 text-text" />, bg: "bg-bg-light border-2 border-gold-muted" };
      case "PROMOTION": return { icon: <TrendingUp className="w-4 h-4 text-hp" />, bg: "bg-hp/10 border-2 border-hp/20" };
      case "DEMOTION": return { icon: <TrendingDown className="w-4 h-4 text-crimson" />, bg: "bg-crimson/10 border-2 border-crimson/20" };
      case "YUSHO": return { icon: <Trophy className="w-4 h-4 text-gold" />, bg: "bg-gold/10 border-2 border-gold/20" };
      case "INJURY": return { icon: <Activity className="w-4 h-4 text-crimson" />, bg: "bg-crimson/10 border-2 border-crimson/20" };
      case "RETIREMENT": return { icon: <Flag className="w-4 h-4 text-text" />, bg: "bg-bg-light border-2 border-gold-muted" };
      default: return { icon: <div className="w-2 h-2 bg-text-dim" />, bg: "bg-bg-light border-2 border-gold-muted" };
    }
  };

  return (
    <div className="animate-in space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="section-header"><ScrollText className="w-4 h-4" /> 相撲人生記</h3>
        <div className="flex border-2 border-gold-muted p-0.5 gap-0.5 text-xs">
          {(["ALL", "IMPORTANT"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2 sm:px-3 py-1 ui-text-label transition-all ${filter === f ? "bg-gold/15 text-gold" : "text-text-dim hover:text-gold"}`}
            >
              {f === "ALL" ? "全て" : "主な出来事"}
            </button>
          ))}
        </div>
      </div>

      <div className="rpg-panel overflow-hidden">
        <div className="max-h-[500px] overflow-y-auto p-4 sm:p-5 space-y-0">
          {filteredEvents.map((ev, idx) => {
            const { icon, bg } = getIconConfig(ev.type);
            return (
              <div key={idx} className="flex gap-3 sm:gap-4 relative">
                {idx !== filteredEvents.length - 1 && (
                  <div className="absolute left-[17px] top-10 bottom-0 w-px bg-gold-muted/20" />
                )}
                <div className={`w-9 h-9 flex items-center justify-center shrink-0 z-10 ${bg}`}>
                  {icon}
                </div>
                <div className="flex-1 pb-4 sm:pb-5 pt-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-text text-sm">{ev.year}年{ev.month}月</span>
                    <span className="text-xs text-text-dim bg-bg-light border-2 border-gold-muted px-1.5 py-0.5 ui-text-label">{ev.age}歳</span>
                    {ev.type === "YUSHO" && (
                      <span className="text-xs ui-text-label text-gold bg-gold/10 px-2 py-0.5 border-2 border-gold/20">優勝</span>
                    )}
                  </div>
                  <p className={`text-xs sm:text-sm ${ev.type === "INJURY" ? "text-crimson" : "text-text-dim"}`}>
                    {ev.description}
                  </p>
                </div>
              </div>
            );
          })}
          {filteredEvents.length === 0 && (
            <p className="text-text-dim text-center py-8 text-sm">表示する出来事がありません</p>
          )}
        </div>
      </div>
    </div>
  );
};
