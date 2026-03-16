import React from "react";
import { Award, BookOpenText, ScrollText, Sparkles, Swords } from "lucide-react";
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
  { id: "story", label: "宿敵と判断", icon: Swords },
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
    <>
      <section className="surface-panel space-y-6">
        <div className="space-y-3 text-center">
          <div className="app-kicker">{isSaved ? "保存済み記録" : "開封結果"}</div>
          <h1 className="text-4xl sm:text-6xl ui-text-heading text-text break-words">{status.shikona}</h1>
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-text-dim">
            最高位 {formatRankDisplayName(status.history.maxRank)}
            {incentive?.projectedBestScoreRank ? ` / 総評点歴代${incentive.projectedBestScoreRank}位` : ""}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <div className="report-hero-panel px-4 py-5 sm:px-6">
            <div className="text-xs ui-text-label tracking-[0.18em] text-text-dim">総評点</div>
            <div className="mt-2 text-6xl sm:text-7xl ui-text-heading text-award">{clearScore.clearScore}</div>
            <div className="mt-4 inline-flex items-center gap-2 rounded-none border border-award/35 bg-award/8 px-3 py-2 text-sm text-award">
              <Award className="h-4 w-4" />
              {incentive?.rewardLabel ?? "集計中"}
            </div>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-text-dim">
              {incentive?.rewardDetail ?? "競技成績と記録樹立をもとに、今回の力士人生を採点しています。"}
            </p>
          </div>

          <div className="report-detail-card space-y-3 p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-text-dim">競技スコア</div>
                <div className="ui-text-heading text-xl text-text">{clearScore.competitiveScore}</div>
              </div>
              <div>
                <div className="text-xs text-text-dim">記録ボーナス</div>
                <div className="ui-text-heading text-xl text-text">{clearScore.recordBonus}</div>
              </div>
              <div>
                <div className="text-xs text-text-dim">勝率</div>
                <div className="ui-text-label text-text">{winRate}%</div>
              </div>
              <div>
                <div className="text-xs text-text-dim">幕内優勝</div>
                <div className="ui-text-label text-text">{status.history.yushoCount.makuuchi}回</div>
              </div>
            </div>
            <div className="rounded-none border border-line bg-surface px-3 py-3 text-sm text-text-dim">
              最高位の価値を軸に、優勝、三賞、金星、勝率、主要記録バッジをまとめて採点します。
            </div>
          </div>
        </div>

        <section className="space-y-3">
          <div className="panel-title">主要記録バッジ</div>
          {featuredBadges.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-3">
              {featuredBadges.map((badge) => (
                <div key={badge.key} className="rounded-none border border-line bg-surface px-3 py-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="ui-text-label text-sm text-text">{resolveCareerRecordBadgeLabel(badge.key)}</div>
                    <div className="text-xs text-award">+{badge.scoreBonus}</div>
                  </div>
                  <p className="text-sm leading-relaxed text-text-dim">{badge.detail}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-none border border-line bg-surface px-3 py-4 text-sm text-text-dim">
              今回は大きな記録バッジなしで終えた人生です。詳しく見るから場所史や能力分析へ進めます。
            </div>
          )}
        </section>

        {!isSaved && (
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="metric-card">
              <div className="metric-label">保存報酬</div>
              <div className="metric-value">{incentive?.rewardLabel ?? "判定中"}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">新規記録</div>
              <div className="metric-value">{incentive?.newRecordCount ?? 0}件</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">図鑑進捗</div>
              <div className="metric-value">+{incentive?.collectionDeltaCount ?? 0}</div>
            </div>
          </section>
        )}

        <div className="flex flex-wrap justify-center gap-3">
          <Button
            size="lg"
            onClick={onSave}
            disabled={saveState === "saving" || isSaved}
          >
            {saveLabel}
          </Button>
          <Button size="lg" variant="secondary" onClick={onShowDetails}>
            詳しく見る
          </Button>
          {onOpenCollection ? (
            <Button size="lg" variant="ghost" onClick={onOpenCollection}>
              図鑑を見る
            </Button>
          ) : null}
          <Button size="lg" variant="outline" onClick={onReset}>
            もう一度
          </Button>
        </div>

        {saveErrorMessage && (
          <div className="text-xs text-warning-bright border border-warning/35 bg-warning/10 px-3 py-2">
            {saveErrorMessage}
          </div>
        )}
      </section>
    </>
  );
};

const resolveEntryAge = (status: RikishiStatus): number => {
  if (typeof status.entryAge === "number" && Number.isFinite(status.entryAge)) return status.entryAge;
  const records = status.history.records;
  if (!records.length) return status.age;
  const elapsed = Math.max(0, records[records.length - 1].year - records[0].year);
  return Math.max(15, status.age - elapsed);
};
