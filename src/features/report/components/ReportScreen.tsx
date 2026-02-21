import React from "react";
import { RikishiStatus, Rank, Rarity } from "../../../logic/models";
import { getRankValueForChart } from "../../../logic/ranking";
import { CONSTANTS } from "../../../logic/constants";
import { Card } from "../../../shared/ui/Card";
import { Button } from "../../../shared/ui/Button";
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
} from "lucide-react";
import { AchievementView } from "./AchievementView";
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

// --- 共通ヘルパー ---
const RARITY_COLORS: Record<
  Rarity,
  { bg: string; text: string; border: string }
> = {
  N: {
    bg: "bg-washi border border-sumi",
    text: "text-sumi",
    border: "border-sumi",
  },
  R: {
    bg: "text-kassairo border border-kassairo",
    text: "text-kassairo",
    border: "border-kassairo",
  },
  SR: {
    bg: "text-kuroboshi border border-kuroboshi",
    text: "text-kuroboshi",
    border: "border-kuroboshi",
  },
  UR: {
    bg: "text-shuiro border border-shuiro",
    text: "text-shuiro",
    border: "border-shuiro",
  },
};
const RarityBadge: React.FC<{ rarity: Rarity }> = ({ rarity }) => {
  const c = RARITY_COLORS[rarity];
  return (
    <span
      className={`text-[10px] font-black px-1.5 py-0.5 rounded-none border border-sumi-none ${c.bg} ${c.text} border ${c.border}`}
    >
      {rarity}
    </span>
  );
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
  Makuuchi: "#6366f1",
  Juryo: "#8b5cf6",
  Makushita: "#0ea5e9",
  Sandanme: "#14b8a6",
  Jonidan: "#22c55e",
  Jonokuchi: "#84cc16",
  Maezumo: "#a3a3a3",
};

const RANK_CHART_BANDS: Array<{
  key: "Makuuchi" | "Juryo" | "Makushita" | "Sandanme" | "Jonidan" | "Jonokuchi";
  label: string;
  top: number;
  bottom: number;
}> = [
  { key: "Makuuchi", label: "幕内", top: 0, bottom: 57 },
  { key: "Juryo", label: "十両", top: 60, bottom: 74 },
  { key: "Makushita", label: "幕下", top: 80, bottom: 140 },
  { key: "Sandanme", label: "三段目", top: 150, bottom: 250 },
  { key: "Jonidan", label: "序二段", top: 260, bottom: 360 },
  { key: "Jonokuchi", label: "序ノ口", top: 370, bottom: 400 },
];

const JONOKUCHI_BOTTOM_RANK_VALUE = getRankValueForChart({
  division: "Jonokuchi",
  name: "序ノ口",
  number: 30,
  side: "West",
});

const PERSONALITY_LABELS: Record<string, string> = {
  CALM: "冷静",
  AGGRESSIVE: "闘争的",
  SERIOUS: "真面目",
  WILD: "奔放",
  CHEERFUL: "陽気",
  SHY: "人見知り",
};

const formatRankName = (rank: Rank, simple = false) => {
  if (rank.name === "前相撲") return rank.name;

  const side = rank.side === "West" ? "西" : rank.side === "East" ? "東" : "";
  const sidePrefix = simple ? "" : side;

  if (["横綱", "大関", "関脇", "小結"].includes(rank.name)) {
    return `${sidePrefix}${rank.name}`;
  }

  const number = rank.number || 1;
  if (number === 1) return `${sidePrefix}${rank.name}筆頭`;
  return `${sidePrefix}${rank.name}${number}枚目`;
};

const formatRecordText = (
  wins: number,
  losses: number,
  absent: number,
): string => `${wins}勝${losses}敗${absent > 0 ? `${absent}休` : ""}`;

const DISPLAY_LIMITS = {
  MAEGASHIRA_MAX: 17,
  JURYO_MAX: 14,
  MAKUSHITA_MAX: 60,
  SANDANME_MAX: 100,
  JONIDAN_MAX: 100,
  JONOKUCHI_MAX: 30,
};

const DIVISION_SLOT_OFFSET = {
  Makuuchi: 0,
  Juryo: 42, // (横綱〜小結 8slot) + (前頭17枚 x 2slot)
  Makushita: 70, // + 十両14枚 x 2slot
  Sandanme: 190, // + 幕下60枚 x 2slot
  Jonidan: 390, // + 三段目100枚 x 2slot
  Jonokuchi: 590, // + 序二段100枚 x 2slot
  Maezumo: 650, // + 序ノ口30枚 x 2slot
} as const;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const resolveRankSlot = (rank: Rank): number => {
  const sideOffset = rank.side === "West" ? 1 : 0;
  if (rank.division === "Makuuchi") {
    if (rank.name === "横綱") return 0 + sideOffset;
    if (rank.name === "大関") return 2 + sideOffset;
    if (rank.name === "関脇") return 4 + sideOffset;
    if (rank.name === "小結") return 6 + sideOffset;
    const n = clamp(rank.number || 1, 1, DISPLAY_LIMITS.MAEGASHIRA_MAX);
    return 8 + (n - 1) * 2 + sideOffset;
  }
  if (rank.division === "Juryo") {
    const n = clamp(rank.number || 1, 1, DISPLAY_LIMITS.JURYO_MAX);
    return DIVISION_SLOT_OFFSET.Juryo + (n - 1) * 2 + sideOffset;
  }
  if (rank.division === "Makushita") {
    const n = clamp(rank.number || 1, 1, DISPLAY_LIMITS.MAKUSHITA_MAX);
    return DIVISION_SLOT_OFFSET.Makushita + (n - 1) * 2 + sideOffset;
  }
  if (rank.division === "Sandanme") {
    const n = clamp(rank.number || 1, 1, DISPLAY_LIMITS.SANDANME_MAX);
    return DIVISION_SLOT_OFFSET.Sandanme + (n - 1) * 2 + sideOffset;
  }
  if (rank.division === "Jonidan") {
    const n = clamp(rank.number || 1, 1, DISPLAY_LIMITS.JONIDAN_MAX);
    return DIVISION_SLOT_OFFSET.Jonidan + (n - 1) * 2 + sideOffset;
  }
  if (rank.division === "Jonokuchi") {
    const n = clamp(rank.number || 1, 1, DISPLAY_LIMITS.JONOKUCHI_MAX);
    return DIVISION_SLOT_OFFSET.Jonokuchi + (n - 1) * 2 + sideOffset;
  }
  return DIVISION_SLOT_OFFSET.Maezumo;
};

const formatBanzukeDelta = (deltaInBanzuke: number): string => {
  const abs = Math.abs(deltaInBanzuke);
  const magnitude = Number.isInteger(abs) ? `${abs}` : `${abs.toFixed(1)}`;
  if (deltaInBanzuke > 0) return `↑ +${magnitude}`;
  if (deltaInBanzuke < 0) return `↓ -${magnitude}`;
  return "→ ±0";
};

type RankMovement = {
  basho: string;
  rank: string;
  record: string;
  nextRank: string;
  deltaText: string;
  deltaKind: "up" | "down" | "stay" | "last";
};

const resolveEntryAge = (status: RikishiStatus): number => {
  if (typeof status.entryAge === "number" && Number.isFinite(status.entryAge)) {
    return status.entryAge;
  }

  const records = status.history.records;
  if (!records.length) {
    return status.age;
  }

  const firstYear = records[0].year;
  const lastYear = records[records.length - 1].year;
  const elapsedYears = Math.max(0, lastYear - firstYear);
  return Math.max(15, status.age - elapsedYears);
};

// --- タブ定義 ---
type TabId = "overview" | "charts" | "timeline" | "achievements";
const TABS: {
  id: TabId;
  label: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { id: "overview", label: "概要", icon: BarChart3 },
  { id: "charts", label: "グラフ", icon: Activity },
  { id: "timeline", label: "年表", icon: ScrollText },
  { id: "achievements", label: "実績", icon: Award },
];

// --- メインコンポーネント ---
interface ReportScreenProps {
  status: RikishiStatus;
  onReset: () => void;
  onSave?: () => void | Promise<void>;
  isSaved?: boolean;
}

export const ReportScreen: React.FC<ReportScreenProps> = ({
  status,
  onReset,
  onSave,
  isSaved = false,
}) => {
  const [activeTab, setActiveTab] = React.useState<TabId>("overview");
  const [savedFlash, setSavedFlash] = React.useState(false);
  const entryAge = React.useMemo(() => resolveEntryAge(status), [status]);

  const { shikona, history } = status;
  const { title, maxRank, totalWins, totalLosses, totalAbsent, yushoCount } =
    history;
  const totalBashoCount = history.records.length;
  const winRate =
    totalWins + totalLosses > 0
      ? ((totalWins / (totalWins + totalLosses)) * 100).toFixed(1)
      : "0.0";

  const makuuchiStats = React.useMemo(() => {
    const records = history.records.filter(
      (r) => r.rank.division === "Makuuchi",
    );
    return {
      wins: records.reduce((a, c) => a + c.wins, 0),
      losses: records.reduce((a, c) => a + c.losses, 0),
      absent: records.reduce((a, c) => a + c.absent, 0),
      bashoCount: records.length,
    };
  }, [history.records]);

  const divisionStats = React.useMemo(() => {
    const divs = [
      "Makuuchi",
      "Juryo",
      "Makushita",
      "Sandanme",
      "Jonidan",
      "Jonokuchi",
      "Maezumo",
    ] as const;
    return divs
      .map((div) => {
        const records = history.records.filter((r) => r.rank.division === div);
        return {
          name: div,
          basho: records.length,
          wins: records.reduce((a, c) => a + c.wins, 0),
          losses: records.reduce((a, c) => a + c.losses, 0),
          absent: records.reduce((a, c) => a + c.absent, 0),
          yusho: records.filter((r) => r.yusho).length,
        };
      })
      .filter((d) => d.basho > 0);
  }, [history.records]);

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
    const total = history.kimariteTotal || {};
    return Object.entries(total)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
  }, [history.kimariteTotal]);

  const firstRecordYear = history.records[0]?.year ?? new Date().getFullYear();
  const lineData = history.records
    .filter((r) => r.rank.division !== "Maezumo")
    .map((r) => ({
    time: `${r.year}年${r.month}月`,
    age: entryAge + (r.year - firstRecordYear),
    rankVal: -1 * getRankValueForChart(r.rank),
    rankLabel: formatRankName(r.rank),
    }));

  const rankMovements = React.useMemo<RankMovement[]>(() => {
    return history.records.map((record, index) => {
      const next = history.records[index + 1];
      if (!next) {
        return {
          basho: `${record.year}年${record.month}月`,
          rank: formatRankName(record.rank),
          record: formatRecordText(record.wins, record.losses, record.absent),
          nextRank: "最終場所",
          deltaText: "-",
          deltaKind: "last",
        };
      }

      const currentSlot = resolveRankSlot(record.rank);
      const nextSlot = resolveRankSlot(next.rank);
      const deltaSlots = currentSlot - nextSlot;
      const deltaInBanzuke = deltaSlots / 2; // 1slot = 半枚（東西）
      const deltaKind: RankMovement["deltaKind"] =
        deltaInBanzuke > 0 ? "up" : deltaInBanzuke < 0 ? "down" : "stay";
      const deltaText = formatBanzukeDelta(deltaInBanzuke);

      return {
        basho: `${record.year}年${record.month}月`,
        rank: formatRankName(record.rank),
        record: formatRecordText(record.wins, record.losses, record.absent),
        nextRank: formatRankName(next.rank),
        deltaText,
        deltaKind,
      };
    });
  }, [history.records]);

  const handleSave = async () => {
    if (!onSave) return;
    await onSave();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 3000);
  };

  // -- 概要タブ --
  const renderOverview = () => (
    <div className="space-y-6 animate-in">
      {/* 成績サマリーカード群 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="通算勝利"
          value={`${totalWins}`}
          sub={`${totalBashoCount}場所`}
          color="indigo"
        />
        <StatCard
          label="勝率"
          value={`${winRate}%`}
          sub={`${totalWins}勝${totalLosses}敗`}
          color="emerald"
        />
        <StatCard
          label="幕内優勝"
          value={`${yushoCount.makuuchi}`}
          sub="回"
          color="amber"
          icon={<Trophy className="w-4 h-4 text-shuiro" />}
        />
        <StatCard
          label="最高位"
          value={formatRankName(maxRank, true)}
          sub={`${totalBashoCount}場所`}
          color="purple"
        />
      </div>

      {/* 幕内成績 */}
      {makuuchiStats.bashoCount > 0 && (
        <Card className="overflow-hidden border-sumi">
          <div className="px-5 py-4">
            <h3 className="text-sm font-bold text-sumi mb-3">幕内成績</h3>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between text-xs text-sumi mb-1">
                  <span>{makuuchiStats.wins}勝</span>
                  <span>
                    {makuuchiStats.losses}敗{" "}
                    {makuuchiStats.absent > 0
                      ? `${makuuchiStats.absent}休`
                      : ""}
                  </span>
                </div>
                <div className="h-3 bg-washi border border-sumi rounded-none border border-sumi-none overflow-hidden">
                  <div
                    className="h-full bg-sumi text-washi border border-sumi rounded-none border border-sumi-none transition-all"
                    style={{
                      width: `${(makuuchiStats.wins / Math.max(1, makuuchiStats.wins + makuuchiStats.losses)) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-2xl font-black text-sumi">
                  {makuuchiStats.wins + makuuchiStats.losses > 0
                    ? (
                        (makuuchiStats.wins /
                          (makuuchiStats.wins + makuuchiStats.losses)) *
                        100
                      ).toFixed(1)
                    : "0.0"}
                  %
                </span>
                <div className="text-[10px] text-sumi-light">
                  {makuuchiStats.bashoCount}場所
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 階級別成績 */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4">
          <h3 className="text-sm font-bold text-sumi mb-4">階級別成績</h3>
          {/* 凡例 */}
          <div className="flex items-center gap-4 mb-3 text-[10px] text-sumi-light">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-none border border-sumi-sm bg-sumi border border-sumi inline-block" />{" "}
              勝ち
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-none border border-sumi-sm bg-washi border border-sumi inline-block" />{" "}
              敗け
            </span>
          </div>
          <div className="space-y-2.5">
            {(() => {
              const maxTotal = Math.max(
                ...divisionStats.map((d) => d.wins + d.losses),
                1,
              );
              return divisionStats.map((d) => {
                const total = d.wins + d.losses;
                const barWidthPct = (total / maxTotal) * 100;
                const winPct = total > 0 ? (d.wins / total) * 100 : 0;
                return (
                  <div key={d.name} className="flex items-center gap-3">
                    <span
                      className="text-xs font-bold w-14 shrink-0 text-right"
                      style={{ color: DIVISION_COLORS[d.name] }}
                    >
                      {DIVISION_NAMES[d.name]}
                    </span>
                    {/* バーエリア（全行同じ幅を確保） */}
                    <div className="flex-1">
                      <div
                        className="h-6 rounded-none border border-sumi-none overflow-hidden flex"
                        style={{ width: `${Math.max(barWidthPct, 8)}%` }}
                      >
                        {/* 勝ち部分 */}
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${winPct}%`,
                            backgroundColor: DIVISION_COLORS[d.name],
                            opacity: 0.75,
                          }}
                        />
                        {/* 敗け部分 */}
                        <div
                          className="h-full bg-washi border border-sumi"
                          style={{ width: `${100 - winPct}%` }}
                        />
                      </div>
                    </div>
                    {/* 数値（全行統一幅） */}
                    <div className="shrink-0 text-right w-32">
                      <span className="text-xs font-bold text-sumi-dark">
                        {d.wins}
                      </span>
                      <span className="text-[10px] text-sumi-light">勝</span>
                      <span className="text-xs font-bold text-sumi ml-0.5">
                        {d.losses}
                      </span>
                      <span className="text-[10px] text-sumi-light">敗</span>
                      <span className="text-[10px] text-sumi-light ml-1">
                        ({d.basho}場所)
                      </span>
                    </div>
                    {/* 優勝列（全行統一幅） */}
                    <div className="shrink-0 w-14 text-center">
                      {d.yusho > 0 ? (
                        <span className="text-xs font-bold text-shuiro">
                          <Trophy className="w-3 h-3 inline -mt-0.5 mr-0.5" />
                          {d.yusho}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-200">-</span>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </Card>

      {/* 体格・スキル */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4">
          <h3 className="text-sm font-bold text-sumi mb-3 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-shuiro" /> 体格・スキル
          </h3>
          <div className="mb-3 p-3 rounded-none border-2 border-sumi bg-washi-dark text-xs font-bold space-y-1">
            <p>本名: {status.profile?.realName || "（未設定）"}</p>
            <p>出身地: {status.profile?.birthplace || "（未設定）"}</p>
            <p>性格: {PERSONALITY_LABELS[status.profile?.personality || "CALM"] || "冷静"}</p>
            <p>
              身長 / 体重: {Math.round(status.bodyMetrics?.heightCm || 0)}cm /{" "}
              {Math.round(status.bodyMetrics?.weightKg || 0)}kg
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              {status.bodyType && CONSTANTS.BODY_TYPE_DATA[status.bodyType] ? (
                <div className="p-3 rounded-none border border-sumi-none border-2 border-sumi bg-washi border border-sumi/80">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold">
                      {CONSTANTS.BODY_TYPE_DATA[status.bodyType].name}
                    </span>
                  </div>
                  <p className="text-[11px] text-sumi leading-snug">
                    {CONSTANTS.BODY_TYPE_DATA[status.bodyType].description}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-sumi-light">データなし</p>
              )}
            </div>
            <div className="space-y-2">
              {status.traits?.length > 0 ? (
                status.traits.map((traitId) => {
                  const td = CONSTANTS.TRAIT_DATA[traitId];
                  if (!td) return null;
                  return (
                    <div
                      key={traitId}
                      className={`p-2.5 rounded-none border border-sumi-none border ${
                        td.rarity === "UR"
                          ? "border-shuiro bg-washi border border-shuiro"
                          : td.isNegative
                            ? "border-shuiro bg-washi/50"
                            : "border-sumi bg-washi border border-sumi/50"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-bold text-sm ${td.isNegative ? "text-shuiro" : ""}`}
                        >
                          {td.name}
                        </span>
                        <RarityBadge rarity={td.rarity} />
                      </div>
                      <p className="text-[10px] text-sumi mt-0.5">
                        {td.description}
                      </p>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-sumi-light py-2">スキルなし</p>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* 怪我ステータス */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4">
          <h3 className="text-sm font-bold text-sumi mb-3 flex items-center gap-1.5">
            <Heart className="w-4 h-4 text-shuiro" /> 引退時の身体状態
          </h3>
          {status.injuries?.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {status.injuries.map((injury) => {
                const isChronic = injury.status === "CHRONIC";
                const isHealed = injury.status === "HEALED";
                return (
                  <div
                    key={injury.id}
                    className={`p-3 rounded-none border border-sumi-none border ${
                      isHealed
                        ? "border-sumi bg-washi border border-sumi/50"
                        : isChronic
                          ? "border-kassairo bg-washi/50"
                          : "border-shuiro bg-washi/50"
                    }`}
                  >
                    <div className="flex justify-between items-center mb-0.5">
                      <span
                        className={`font-bold text-sm ${isHealed ? "text-sumi-light" : ""}`}
                      >
                        {injury.name}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-none border border-sumi-none font-bold ${
                          isHealed
                            ? "bg-washi border border-sumi text-sumi-light"
                            : isChronic
                              ? "text-shuiro border border-shuiro text-shuiro"
                              : "bg-red-100 text-shuiro"
                        }`}
                      >
                        {isHealed ? "完治" : isChronic ? "慢性" : "治療中"}
                      </span>
                    </div>
                    <div className="text-[11px] text-sumi">
                      {isHealed ? "回復済み" : `重症度: ${injury.severity}/10`}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-sumi-light text-center py-3">
              深刻な怪我や古傷はありませんでした。
            </p>
          )}
        </div>
      </Card>
    </div>
  );

  // -- グラフタブ --
  const renderCharts = () => (
    <div className="space-y-6 animate-in">
      {/* 能力推移 */}
      <Card className="overflow-hidden">
        <div className="px-5 pt-4 pb-2">
          <h3 className="text-sm font-bold text-sumi flex items-center gap-1.5">
            <Activity className="w-4 h-4" /> 能力推移 (年齢別)
          </h3>
        </div>
        <div className="px-2 h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={abilityHistoryData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="age"
                tick={{ fontSize: 11 }}
                label={{
                  value: "年齢",
                  position: "insideBottomRight",
                  offset: -5,
                  fontSize: 11,
                }}
              />
              <YAxis domain={[0, 150]} tick={{ fontSize: 11 }} width={35} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="tsuki"
                name="突き"
                stroke="#ef4444"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="oshi"
                name="押し"
                stroke="#f97316"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="kumi"
                name="組力"
                stroke="#3b82f6"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="nage"
                name="投げ"
                stroke="#22c55e"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="koshi"
                name="腰"
                stroke="#a855f7"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="deashi"
                name="出足"
                stroke="#06b6d4"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="waza"
                name="技術"
                stroke="#ec4899"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="power"
                name="筋力"
                stroke="#854d0e"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 番付推移 */}
      <Card className="overflow-hidden">
        <div className="px-5 pt-4 pb-2">
          <h3 className="text-sm font-bold text-sumi flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4" /> 番付推移
          </h3>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-sumi-light">
            {RANK_CHART_BANDS.map((band) => (
              <span key={band.key} className="inline-flex items-center gap-1">
                <span
                  className="inline-block w-2.5 h-2.5 border border-sumi/30"
                  style={{
                    backgroundColor: DIVISION_COLORS[band.key],
                    opacity: 0.24,
                  }}
                />
                {band.label}
              </span>
            ))}
          </div>
        </div>
        <div className="px-2 h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="time"
                hide={false}
                interval={5}
                tick={{ fontSize: 10 }}
              />
              <YAxis
                domain={[-1 * JONOKUCHI_BOTTOM_RANK_VALUE, 10]}
                tickFormatter={(v) => {
                  const abs = Math.abs(v);
                  if (abs === 0) return "横綱";
                  if (abs === 10) return "大関";
                  if (abs === 40) return "幕内";
                  if (abs === 60) return "十両";
                  if (abs === 80) return "幕下";
                  if (abs === 150) return "三段目";
                  if (abs === 260) return "序二段";
                  if (abs === 470) return "序ノ口";
                  return "";
                }}
                ticks={[0, -10, -40, -60, -80, -150, -260, -470]}
                width={50}
                tick={{ fontSize: 10 }}
              />
              <Tooltip
                labelFormatter={(l) => `${l}`}
                formatter={(
                  _v: number,
                  _n: string,
                  p: { payload?: { rankLabel: string } },
                ) => [p.payload?.rankLabel || "", "番付"]}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  fontSize: 12,
                }}
              />
              {RANK_CHART_BANDS.map((band) => (
                <ReferenceArea
                  key={band.key}
                  y1={-1 * band.top}
                  y2={-1 * band.bottom}
                  strokeOpacity={0}
                  fill={DIVISION_COLORS[band.key]}
                  fillOpacity={0.07}
                />
              ))}
              <Line
                type="stepAfter"
                dataKey="rankVal"
                stroke="#6366f1"
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 番付変動表 */}
      <Card className="overflow-hidden">
        <div className="px-5 pt-4 pb-2">
          <h3 className="text-sm font-bold text-sumi flex items-center gap-1.5">
            <ScrollText className="w-4 h-4" /> 番付変動表
          </h3>
        </div>
        <div className="px-3 pb-3">
          <div className="rounded-none border border-sumi-none border border-sumi overflow-hidden">
            <div className="grid grid-cols-[88px_minmax(120px,1fr)_96px_minmax(120px,1fr)_72px] bg-washi border border-sumi text-[11px] font-bold text-sumi px-3 py-2">
              <div>場所</div>
              <div>番付</div>
              <div>成績</div>
              <div>翌場所</div>
              <div className="text-right">変動</div>
            </div>
            <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100 bg-washi">
              {rankMovements.map((row, idx) => (
                <div
                  key={`${row.basho}-${idx}`}
                  className="grid grid-cols-[88px_minmax(120px,1fr)_96px_minmax(120px,1fr)_72px] px-3 py-2.5 text-xs items-center"
                >
                  <div className="text-sumi">{row.basho}</div>
                  <div className="font-bold text-sumi-dark">{row.rank}</div>
                  <div className="text-sumi">{row.record}</div>
                  <div className="text-sumi-dark">{row.nextRank}</div>
                  <div
                    className={`text-right font-bold ${
                      row.deltaKind === "up"
                        ? "text-matcha"
                        : row.deltaKind === "down"
                          ? "text-shuiro"
                          : row.deltaKind === "stay"
                            ? "text-sumi"
                            : "text-sumi-light"
                    }`}
                  >
                    {row.deltaText}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* 決まり手 */}
      {kimariteData.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-5 pt-4 pb-2">
            <h3 className="text-sm font-bold text-sumi flex items-center gap-1.5">
              <Swords className="w-4 h-4" /> 決まり手傾向 (上位10)
            </h3>
          </div>
          <div className="px-2 h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={kimariteData}
                layout="vertical"
                margin={{ left: 20, right: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={80}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value: number) => [`${value}回`, "回数"]}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="count"
                  name="回数"
                  fill="#6366f1"
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );

  // -- 年表タブ --
  const renderTimeline = () => (
    <EnhancedTimeline history={history} entryAge={entryAge} />
  );

  return (
    <div className="space-y-0 max-w-3xl mx-auto">
      {/* ヒーローセクション */}
      <div className="relative bg-washi border-4 border-sumi text-sumi rounded-none border border-sumi-none shadow-[8px_8px_0px_0px_#2b2b2b] overflow-hidden mb-6">
        {/* 背景パターン */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-none border border-sumi-none blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-none border border-sumi-none blur-3xl" />

        <div className="relative z-10 px-8 py-10 text-center">
          <div className="inline-block mb-3">
            <span className="text-xs font-bold tracking-[0.3em] uppercase px-4 py-1.5 rounded-none border border-sumi-none bg-washi border-shuiro text-shuiro border border-shuiro">
              {title || "無名の力士"}
            </span>
          </div>
          <h1 className="text-5xl sm:text-6xl font-black mb-6 tracking-tight">
            {shikona}
          </h1>

          <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-sumi-light mb-1">
                最高位
              </div>
              <div className="text-xl sm:text-2xl font-black">
                {formatRankName(maxRank, true)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-sumi-light mb-1">
                通算
              </div>
              <div className="text-xl sm:text-2xl font-black">
                {totalWins}
                <span className="text-sm font-normal text-sumi-light">勝</span>
              </div>
              <div className="text-xs text-sumi-light">
                {totalLosses}敗 {totalAbsent > 0 ? `${totalAbsent}休` : ""}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-sumi-light mb-1">
                幕内優勝
              </div>
              <div className="text-xl sm:text-2xl font-black text-shuiro">
                {yushoCount.makuuchi}
                <span className="text-sm font-normal text-sumi-light">回</span>
              </div>
            </div>
          </div>

          {makuuchiStats.bashoCount > 0 && (
            <div className="mt-4 text-xs text-sumi-light">
              幕内 {makuuchiStats.wins}勝{makuuchiStats.losses}敗 (
              {makuuchiStats.bashoCount}場所)
            </div>
          )}
        </div>
      </div>

      {/* タブ + アクションバー */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex bg-washi border border-sumi p-1 rounded-none border border-sumi-none gap-0.5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-none border border-sumi-none text-sm font-medium transition-all ${
                  isActive
                    ? "bg-washi text-slate-800 shadow-[2px_2px_0px_0px_#2b2b2b]"
                    : "text-sumi hover:text-sumi-dark"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onReset}
            className="rounded-none border border-sumi-none text-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> もう一度
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={isSaved}
            className={`rounded-none border border-sumi-none text-xs transition-all ${
              isSaved || savedFlash
                ? "bg-matcha text-washi hover:bg-washi hover:text-matcha border-matcha text-sumi"
                : "bg-sumi text-washi hover:bg-washi hover:text-sumi border-sumi text-sumi"
            }`}
          >
            {isSaved || savedFlash ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1" /> 保存済み
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 mr-1" /> 殿堂入り
              </>
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

// --- サブコンポーネント ---
type StatCardColor = "indigo" | "emerald" | "amber" | "purple";

const STAT_CARD_VALUE_COLOR: Record<StatCardColor, string> = {
  indigo: "text-sumi",
  emerald: "text-matcha",
  amber: "text-shuiro",
  purple: "text-kuroboshi",
};

const StatCard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  color: StatCardColor;
  icon?: React.ReactNode;
}> = ({ label, value, sub, color, icon }) => (
  <div
    className={`p-4 rounded-none border border-sumi-none border bg-washi shadow-[2px_2px_0px_0px_#2b2b2b]`}
  >
    <div className="flex items-center justify-between mb-1">
      <span className="text-[11px] font-medium text-sumi-light uppercase tracking-wider">
        {label}
      </span>
      {icon}
    </div>
    <div className={`text-2xl font-black ${STAT_CARD_VALUE_COLOR[color]}`}>
      {value}
    </div>
    {sub && <div className="text-[11px] text-sumi-light">{sub}</div>}
  </div>
);

const EnhancedTimeline: React.FC<{
  history: import("../../../logic/models").CareerHistory;
  entryAge: number;
}> = ({ history, entryAge }) => {
  const [filter, setFilter] = React.useState<"ALL" | "IMPORTANT">("ALL");

  const processedEvents = React.useMemo(() => {
    const startYear =
      history.events.find((e) => e.type === "ENTRY")?.year ||
      history.events[0]?.year;
    return history.events.map((ev) => ({
      ...ev,
      age: entryAge + Math.floor(ev.year - (startYear ?? ev.year)),
    }));
  }, [entryAge, history.events]);

  const filteredEvents = React.useMemo(() => {
    if (filter === "ALL") return processedEvents;
    return processedEvents.filter(
      (ev) =>
        ev.type === "YUSHO" ||
        ev.type === "PROMOTION" ||
        ev.type === "RETIREMENT" ||
        ev.type === "ENTRY" ||
        (ev.type === "INJURY" && ev.description.includes("全治")),
    );
  }, [filter, processedEvents]);

  const getIconConfig = (type: string) => {
    switch (type) {
      case "ENTRY":
        return {
          icon: <UserPlus className="w-4 h-4 text-sumi" />,
          bg: "bg-washi border border-sumi",
        };
      case "PROMOTION":
        return {
          icon: <TrendingUp className="w-4 h-4 text-matcha" />,
          bg: "bg-emerald-50",
        };
      case "DEMOTION":
        return {
          icon: <TrendingDown className="w-4 h-4 text-shuiro" />,
          bg: "bg-washi",
        };
      case "YUSHO":
        return {
          icon: <Trophy className="w-4 h-4 text-shuiro" />,
          bg: "bg-washi",
        };
      case "INJURY":
        return {
          icon: <Activity className="w-4 h-4 text-shuiro" />,
          bg: "bg-washi",
        };
      case "RETIREMENT":
        return {
          icon: <Flag className="w-4 h-4 text-sumi" />,
          bg: "bg-washi border border-sumi",
        };
      default:
        return {
          icon: (
            <div className="w-2 h-2 rounded-none border border-sumi-none bg-slate-400" />
          ),
          bg: "bg-washi border border-sumi",
        };
    }
  };

  return (
    <div className="animate-in space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-sumi flex items-center gap-1.5">
          <ScrollText className="w-4 h-4" /> 相撲人生記
        </h3>
        <div className="flex bg-washi border border-sumi p-0.5 rounded-none border border-sumi-none gap-0.5">
          <button
            onClick={() => setFilter("ALL")}
            className={`px-3 py-1 rounded-none border border-sumi-none text-xs font-medium transition-all ${filter === "ALL" ? "bg-washi text-slate-800 shadow-[2px_2px_0px_0px_#2b2b2b]" : "text-sumi"}`}
          >
            全て
          </button>
          <button
            onClick={() => setFilter("IMPORTANT")}
            className={`px-3 py-1 rounded-none border border-sumi-none text-xs font-medium transition-all ${filter === "IMPORTANT" ? "bg-washi text-slate-800 shadow-[2px_2px_0px_0px_#2b2b2b]" : "text-sumi"}`}
          >
            主な出来事
          </button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="max-h-[500px] overflow-y-auto p-5 space-y-0">
          {filteredEvents.map((ev, idx) => {
            const { icon, bg } = getIconConfig(ev.type);
            return (
              <div key={idx} className="flex gap-4 relative">
                {idx !== filteredEvents.length - 1 && (
                  <div className="absolute left-[17px] top-10 bottom-0 w-px bg-washi border border-sumi" />
                )}
                <div
                  className={`w-9 h-9 rounded-none border border-sumi-none flex items-center justify-center shrink-0 z-10 border-2 border-white shadow-[2px_2px_0px_0px_#2b2b2b] ${bg}`}
                >
                  {icon}
                </div>
                <div className="flex-1 pb-5 pt-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold text-sumi-dark text-sm">
                      {ev.year}年{ev.month}月
                    </span>
                    <span className="text-[10px] text-sumi-light bg-washi border border-sumi px-1.5 py-0.5 rounded-none border border-sumi">
                      {ev.age}歳
                    </span>
                    {ev.type === "YUSHO" && (
                      <span className="text-[10px] font-black text-shuiro bg-washi px-2 py-0.5 rounded-none border border-sumi-none border border-kassairo">
                        優勝
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-sm ${ev.type === "INJURY" ? "text-shuiro" : "text-sumi"}`}
                  >
                    {ev.description}
                  </p>
                </div>
              </div>
            );
          })}
          {filteredEvents.length === 0 && (
            <p className="text-sumi-light text-center py-8 text-sm">
              表示する出来事がありません
            </p>
          )}
        </div>
      </Card>
    </div>
  );
};
