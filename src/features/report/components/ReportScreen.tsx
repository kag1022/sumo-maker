import React from "react";
import { Award, BookOpenText, Save, Sparkles, Trophy, AlertTriangle, Swords, ScrollText } from "lucide-react";
import {
  buildCareerClearScoreSummary,
  resolveCareerRecordBadgeLabel,
  type CareerClearScoreSummary,
  type CareerRecordBadge,
} from "../../../logic/career/clearScore";
import { RikishiStatus } from "../../../logic/models";
import {
  getCareerSaveIncentiveSummary,
  type CareerSaveIncentiveSummary,
} from "../../../logic/persistence/careers";
import { listCareerPlayerBoutsByBasho } from "../../../logic/persistence/careerHistory";
import { Button } from "../../../shared/ui/Button";
import { HoshitoriCareerRecord } from "./HoshitoriTable";
import { ReportDetailsTab } from "./ReportDetailsTab";
import { ReportHero } from "./ReportHero";
import { ReportOverviewTab } from "./ReportOverviewTab";
import { ReportTimelineTab } from "./ReportTimelineTab";
import {
  buildReportHeroSummary,
  buildReportSpotlightPayload,
} from "../utils/reportHero";
import {
  buildReportTimelineDigest,
} from "../utils/reportTimeline";
import {
  formatRankDisplayName,
} from "../utils/reportFormatters";

const TABS = [
  { id: "overview", label: "概況", icon: Sparkles },
  { id: "timeline", label: "場所史", icon: ScrollText },
  { id: "story", label: "歩みとライバル", icon: Swords },
  { id: "profile", label: "能力と型", icon: BookOpenText },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface ReportScreenProps {
  status: RikishiStatus;
  onReset: () => void;
  onSave?: () => void | Promise<void>;
  onOpenCollection?: () => void;
  isSaved?: boolean;
  careerId?: string | null;
}

export const ReportScreen: React.FC<ReportScreenProps> = ({
  status,
  onReset,
  onSave,
  onOpenCollection,
  isSaved = false,
  careerId = null,
}) => {
  const [viewMode, setViewMode] = React.useState<"reveal" | "details">("reveal");
  const [activeTab, setActiveTab] = React.useState<TabId>("overview");
  const [timelineFilter, setTimelineFilter] = React.useState<"IMPORTANT" | "ALL">("IMPORTANT");
  const [hoshitoriCareerRecords, setHoshitoriCareerRecords] = React.useState<HoshitoriCareerRecord[]>([]);
  const [isHoshitoriLoading, setIsHoshitoriLoading] = React.useState(false);
  const [hoshitoriErrorMessage, setHoshitoriErrorMessage] = React.useState<string | undefined>(undefined);
  const [saveIncentive, setSaveIncentive] = React.useState<CareerSaveIncentiveSummary | null>(null);
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">(
    isSaved ? "saved" : "idle",
  );
  const [saveErrorMessage, setSaveErrorMessage] = React.useState<string | null>(null);

  const entryAge = React.useMemo(() => resolveEntryAge(status), [status]);
  const totalWins = status.history.totalWins;
  const totalLosses = status.history.totalLosses;
  const totalAbsent = status.history.totalAbsent;
  const winRate =
    totalWins + totalLosses > 0 ? ((totalWins / (totalWins + totalLosses)) * 100).toFixed(1) : "0.0";
  const fallbackClearScore = React.useMemo(() => buildCareerClearScoreSummary(status), [status]);

  React.useEffect(() => {
    if (isSaved) {
      setSaveState("saved");
      setSaveErrorMessage(null);
    }
  }, [isSaved]);

  React.useEffect(() => {
    setViewMode("reveal");
    setActiveTab("overview");
  }, [careerId, status.age, status.history.records.length, status.shikona]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const summary = await getCareerSaveIncentiveSummary(status, {
          careerId,
          isSaved,
          includeOyakata: true,
        });
        if (!cancelled) {
          setSaveIncentive(summary);
        }
      } catch {
        if (!cancelled) {
          setSaveIncentive(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [careerId, isSaved, saveState, status]);

  const awardsSummary = React.useMemo(() => {
    let kinboshi = 0;
    let shukun = 0;
    let kantou = 0;
    let ginou = 0;
    status.history.records.forEach((record) => {
      kinboshi += record.kinboshi || 0;
      record.specialPrizes?.forEach((prize) => {
        if (prize === "殊勲賞") shukun++;
        if (prize === "敢闘賞") kantou++;
        if (prize === "技能賞") ginou++;
      });
    });
    return { kinboshi, totalSansho: shukun + kantou + ginou };
  }, [status.history.records]);

  const heroSummary = React.useMemo(() => buildReportHeroSummary(status), [status]);
  const spotlight = React.useMemo(() => buildReportSpotlightPayload(status, entryAge), [status, entryAge]);
  const timelineDigest = React.useMemo(
    () => buildReportTimelineDigest(status.history.events, entryAge),
    [entryAge, status.history.events],
  );

  const chartTicks = React.useMemo(
    () => spotlight.points.filter((point) => point.axisLabel).map((point) => point.slot),
    [spotlight.points],
  );

  const chartMin = React.useMemo(
    () => Math.min(-470, ...spotlight.points.map((point) => point.plotValue)),
    [spotlight.points],
  );

  const achievementSummary = React.useMemo(() => {
    const parts: string[] = [];
    if (status.history.yushoCount.makuuchi > 0) parts.push(`幕内優勝 ${status.history.yushoCount.makuuchi}回`);
    if (awardsSummary.kinboshi > 0) parts.push(`金星 ${awardsSummary.kinboshi}個`);
    if (awardsSummary.totalSansho > 0) parts.push(`三賞 ${awardsSummary.totalSansho}回`);
    if (parts.length === 0) parts.push(`${formatRankDisplayName(status.history.maxRank)}まで到達`);
    return parts.join(" / ");
  }, [awardsSummary.kinboshi, awardsSummary.totalSansho, status.history.maxRank, status.history.yushoCount.makuuchi]);

  React.useEffect(() => {
    let cancelled = false;
    const baseRecords: HoshitoriCareerRecord[] = status.history.records
      .filter((record) => record.rank.division !== "Maezumo")
      .map((record) => ({
        year: record.year,
        month: record.month,
        rank: record.rank,
        wins: record.wins,
        losses: record.losses,
        absent: record.absent,
        bouts: [],
      }));

    if (!careerId) {
      setHoshitoriCareerRecords(baseRecords);
      setIsHoshitoriLoading(false);
      setHoshitoriErrorMessage("場所別の取組詳細データが未保存のため、記号のみで表示しています。");
      return () => {
        cancelled = true;
      };
    }

    setIsHoshitoriLoading(true);
    setHoshitoriErrorMessage(undefined);
    void (async () => {
      try {
        const boutRows = await listCareerPlayerBoutsByBasho(careerId);
        if (cancelled) return;
        const boutsBySeq = new Map(boutRows.map((entry) => [entry.bashoSeq, entry.bouts]));
        setHoshitoriCareerRecords(
          status.history.records
            .map((record, index) => ({
              year: record.year,
              month: record.month,
              rank: record.rank,
              wins: record.wins,
              losses: record.losses,
              absent: record.absent,
              bouts: boutsBySeq.get(index + 1) || [],
            }))
            .filter((record) => record.rank.division !== "Maezumo"),
        );
      } catch {
        if (!cancelled) {
          setHoshitoriCareerRecords(baseRecords);
          setHoshitoriErrorMessage("星取表データの取得に失敗したため、記号のみで表示しています。");
        }
      } finally {
        if (!cancelled) setIsHoshitoriLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [careerId, status.history.records]);

  const handleSave = async () => {
    if (!onSave || isSaved || saveState === "saving") return;
    setSaveState("saving");
    setSaveErrorMessage(null);
    try {
      await onSave();
      setSaveState("saved");
    } catch {
      setSaveState("error");
      setSaveErrorMessage("殿堂入りの保存に失敗しました。もう一度お試しください。");
    }
  };

  const revealSummary = saveIncentive?.clearScore ?? fallbackClearScore;
  const featuredBadges = saveIncentive?.featuredBadges ?? fallbackClearScore.badges.slice(0, 3);

  return (
    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6">
      {viewMode === "reveal" ? (
        <ReportRevealPanel
          status={status}
          clearScore={revealSummary}
          incentive={saveIncentive}
          featuredBadges={featuredBadges}
          winRate={winRate}
          saveState={saveState}
          isSaved={isSaved}
          saveErrorMessage={saveErrorMessage}
          onReset={onReset}
          onSave={() => void handleSave()}
          onOpenCollection={onOpenCollection}
          onShowDetails={() => setViewMode("details")}
        />
      ) : (
        <>
          <div className="flex justify-end">
            <button
              type="button"
              className="report-tab-button"
              onClick={() => setViewMode("reveal")}
            >
              開封面へ戻る
            </button>
          </div>
          <ReportHero
            shikona={status.shikona}
            maxRank={status.history.maxRank}
            summary={heroSummary}
            spotlight={spotlight}
            winRate={winRate}
            totalWins={totalWins}
            totalLosses={totalLosses}
            totalAbsent={totalAbsent}
            yushoCountMakuuchi={status.history.yushoCount.makuuchi}
            awardsSummary={awardsSummary}
            chartMin={chartMin}
            chartTicks={chartTicks}
            activeTab={activeTab}
            tabs={[...TABS]}
            saveState={saveState}
            isSaved={isSaved}
            saveErrorMessage={saveErrorMessage}
            onReset={onReset}
            onSave={() => void handleSave()}
            onShowTimeline={() => setActiveTab("timeline")}
            onTabChange={(tabId) => setActiveTab(tabId as TabId)}
          />

          {activeTab === "overview" && (
            <ReportOverviewTab
              status={status}
              achievementSummary={achievementSummary}
              winRate={winRate}
              clearScore={revealSummary}
              awardsSummary={awardsSummary}
            />
          )}
          {activeTab === "timeline" && (
            <ReportTimelineTab
              items={timelineDigest}
              status={status}
              careerId={careerId}
              filter={timelineFilter}
              onFilterChange={setTimelineFilter}
              hoshitoriCareerRecords={hoshitoriCareerRecords}
              shikona={status.shikona}
              isHoshitoriLoading={isHoshitoriLoading}
              hoshitoriErrorMessage={hoshitoriErrorMessage}
            />
          )}
          {activeTab === "story" && (
            <ReportDetailsTab status={status} careerId={careerId} mode="story" />
          )}
          {activeTab === "profile" && (
            <ReportDetailsTab status={status} careerId={careerId} mode="profile" />
          )}
        </>
      )}
    </div>
  );
};

interface ReportRevealPanelProps {
  status: RikishiStatus;
  clearScore: CareerClearScoreSummary;
  incentive: CareerSaveIncentiveSummary | null;
  featuredBadges: CareerRecordBadge[];
  winRate: string;
  saveState: "idle" | "saving" | "saved" | "error";
  isSaved: boolean;
  saveErrorMessage: string | null;
  onReset: () => void;
  onSave: () => void;
  onOpenCollection?: () => void;
  onShowDetails: () => void;
}

const ReportRevealPanel: React.FC<ReportRevealPanelProps> = ({
  status,
  clearScore,
  incentive,
  featuredBadges,
  winRate,
  saveState,
  isSaved,
  saveErrorMessage,
  onReset,
  onSave,
  onOpenCollection,
  onShowDetails,
}) => {
  const saveLabel = saveState === "saved" || isSaved
    ? "保存済み"
    : saveState === "saving"
      ? "保存中..."
      : incentive?.saveLabel ?? "保存する";

  return (
    <div className="space-y-6 animate-in zoom-in-95">
      {/* ヒーローヘッダー: 四股名の威厳 */}
      <section className="relative overflow-hidden py-16 sm:py-24 text-center">
        <div className="absolute inset-0 bg-asanoha opacity-5 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-washi/30 via-washi/5 to-transparent pointer-events-none" />
        
        <div className="relative z-10 space-y-8">
          <div className="inline-flex items-center gap-3 px-6 py-2 washi-surface border-gold/20 text-[10px] ui-text-label text-gold tracking-widest uppercase mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            {isSaved ? "殿堂入り力士" : "今回の相撲ライフ結果"}
          </div>
          <div className="flex flex-col items-center justify-center space-y-6">
             {/* 肖像画を中央に */}
             <div className="rpg-panel p-2 shadow-2xl relative group bg-white/20">
                <img 
                   src="/images/rikishi/normal_front.png" 
                   alt="Rikishi" 
                   className="h-64 sm:h-80 object-contain pixelated drop-shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
                />
             </div>

             <div className="space-y-4">
                <h1 className="text-6xl sm:text-8xl ui-text-heading text-text tracking-widest drop-shadow-md py-4">
                  {status.shikona}
                </h1>
                <div className="flex flex-col items-center gap-3">
                  <p className="text-2xl ui-text-label text-gold border-b-2 border-gold/30 pb-2 px-8">
                    最高位 {formatRankDisplayName(status.history.maxRank)}
                  </p>
                  {incentive?.projectedBestScoreRank && (
                    <span className="text-xs ui-text-label px-3 py-1 bg-gold/20 text-text">
                      歴代{incentive.projectedBestScoreRank}位相当の記録
                    </span>
                  )}
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* スコア・スタッツグリッド */}
      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] items-start">
        <section className="washi-surface p-10 flex flex-col justify-center items-center text-center space-y-6 border-gold/30 shadow-2xl bg-bg-panel/40">
          <div className="ui-text-label text-xs text-gold/60 tracking-[0.3em] uppercase">トータルスコア</div>
          <div className="text-8xl sm:text-9xl ui-text-metric text-text drop-shadow-sm">
            {clearScore.clearScore}
          </div>
          <div className="inline-flex items-center gap-3 px-6 py-3 bg-bg text-text ui-text-label text-sm tracking-widest border border-gold/30">
            <Trophy className="w-5 h-5 text-gold" />
            {incentive?.rewardLabel ?? "判定結果"}
          </div>
          <p className="text-sm text-text-dim max-w-sm leading-relaxed">
            {incentive?.rewardDetail ?? "今回の相撲人生を振り返り、その実績をスコアとして算出しました。"}
          </p>
        </section>

        <section className="washi-surface p-8 space-y-6 border-gold/30 shadow-xl bg-bg-panel/40">
          <div className="ui-text-label text-xs text-gold/80 border-b border-gold/20 pb-3 mb-2 tracking-widest uppercase">スコア内訳</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {[
              { label: "競技記録", val: clearScore.competitiveScore, note: "星取・番付" },
              { label: "勲章加点", val: clearScore.recordBonus, note: "バッジ獲得" },
              { label: "生涯勝率", val: `${winRate}%`, note: "安定性" },
              { label: "優勝回数", val: `${status.history.yushoCount.makuuchi}回`, note: "栄冠" },
            ].map((item) => (
              <div key={item.label} className="space-y-2">
                <div className="text-[10px] ui-text-label text-gold/50 uppercase">{item.label}</div>
                <div className="text-3xl ui-text-decoration text-text">{item.val}</div>
                <div className="text-[9px] text-text-dim/60 font-serif italic">{item.note}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 主要記録バッジ */}
      <section className="space-y-8">
        <div className="flex items-center gap-4 text-xl ui-text-decoration text-text">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-gold/30" />
          <Award className="w-6 h-6 text-gold" />
          <span className="tracking-widest">獲得せし勲章</span>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-gold/30" />
        </div>
        
        {featuredBadges.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featuredBadges.map((badge) => (
              <div key={badge.key} className="washi-surface p-6 border-gold/20 group hover:translate-y-[-4px] transition-all duration-300 bg-bg-panel/20 shadow-lg">
                <div className="flex items-center justify-between mb-3 border-b border-gold/10 pb-2">
                  <div className="ui-text-label text-sm text-text group-hover:text-gold transition-colors">{resolveCareerRecordBadgeLabel(badge.key)}</div>
                  <div className="text-sm ui-text-decoration text-gold group-hover:scale-110 transition-transform">+{badge.scoreBonus}</div>
                </div>
                <p className="text-xs text-text-dim leading-relaxed font-serif italic">{badge.detail}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="washi-surface p-12 text-center text-text-dim/40 text-sm italic border-gold/10 opacity-60">
            特筆すべき記録は確認されませんでした。
          </div>
        )}
      </section>

      {/* 保存報酬・統計 (未保存時のみ) */}
      {!isSaved && (
        <section className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "保存報酬", val: incentive?.rewardLabel ?? "判定中", color: "text-award" },
            { label: "新規記録", val: `${incentive?.newRecordCount ?? 0}件`, color: "text-action" },
            { label: "図鑑進捗", val: `+${incentive?.collectionDeltaCount ?? 0}`, color: "text-state" },
          ].map((item) => (
            <div key={item.label} className="surface-card p-4 text-center border-gold-muted/10">
              <div className="text-[10px] ui-text-label text-text-dim mb-1">{item.label}</div>
              <div className={`text-xl ui-text-metric ${item.color}`}>{item.val}</div>
            </div>
          ))}
        </section>
      )}

      {/* アクションボタン */}
      <div className="flex flex-wrap justify-center gap-6 pt-10 pb-20">
        <Button
          size="lg"
          onClick={onSave}
          disabled={saveState === "saving" || isSaved}
          className="min-w-[200px] h-16 text-xl ui-text-decoration relative group overflow-hidden"
        >
          <div className="absolute inset-0 bg-gold/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          <Save className="w-6 h-6 mr-3 relative z-10" />
          <span className="relative z-10">{saveLabel}</span>
        </Button>
        
        <Button size="lg" variant="secondary" onClick={onShowDetails} className="min-w-[200px] h-16 text-xl ui-text-heading">
          <BookOpenText className="w-6 h-6 mr-3" />
          歩みを振り返る
        </Button>

        <div className="w-full flex justify-center gap-4 mt-4">
           {onOpenCollection && (
             <Button variant="ghost" onClick={onOpenCollection} className="text-sm ui-text-label text-sumi/60 hover:text-sumi">
               殿堂を閲覧する
             </Button>
           )}
           <Button variant="outline" onClick={onReset} className="text-sm ui-text-label text-sumi/40 hover:text-sumi italic">
             新弟子を待つ
           </Button>
        </div>
      </div>

      {saveErrorMessage && (
        <div className="animate-in slide-in-from-bottom-2 text-xs text-center text-warning-bright border border-warning/35 bg-warning/10 px-4 py-2 mt-4">
          <AlertTriangle className="w-3.5 h-3.5 inline mr-2" />
          {saveErrorMessage}
        </div>
      )}
    </div>
  );
};

const resolveEntryAge = (status: RikishiStatus): number => {
  if (typeof status.entryAge === "number" && Number.isFinite(status.entryAge)) return status.entryAge;
  const records = status.history.records;
  if (!records.length) return status.age;
  const elapsed = Math.max(0, records[records.length - 1].year - records[0].year);
  return Math.max(15, status.age - elapsed);
};
