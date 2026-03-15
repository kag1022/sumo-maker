import React from "react";
import { Award, ScrollText, Sparkles } from "lucide-react";
import { RikishiStatus } from "../../../logic/models";
import { listCareerPlayerBoutsByBasho } from "../../../logic/persistence/repository";
import { HoshitoriCareerRecord } from "./HoshitoriTable";
import { ReportAchievementsTab } from "./ReportAchievementsTab";
import { ReportDetailsTab } from "./ReportDetailsTab";
import { ReportHero } from "./ReportHero";
import { ReportTimelineTab } from "./ReportTimelineTab";
import {
  buildReportHeroSummary,
  buildReportSpotlightPayload,
  buildReportTimelineDigest,
  formatRankDisplayName,
} from "../utils/reportCareer";

const TABS = [
  { id: "details", label: "詳細", icon: Sparkles },
  { id: "timeline", label: "転機", icon: ScrollText },
  { id: "achievements", label: "実績", icon: Award },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface ReportScreenProps {
  status: RikishiStatus;
  onReset: () => void;
  onSave?: () => void | Promise<void>;
  isSaved?: boolean;
  careerId?: string | null;
}

export const ReportScreen: React.FC<ReportScreenProps> = ({
  status,
  onReset,
  onSave,
  isSaved = false,
  careerId = null,
}) => {
  const [activeTab, setActiveTab] = React.useState<TabId>("details");
  const [timelineFilter, setTimelineFilter] = React.useState<"IMPORTANT" | "ALL">("IMPORTANT");
  const [hoshitoriCareerRecords, setHoshitoriCareerRecords] = React.useState<HoshitoriCareerRecord[]>([]);
  const [isHoshitoriLoading, setIsHoshitoriLoading] = React.useState(false);
  const [hoshitoriErrorMessage, setHoshitoriErrorMessage] = React.useState<string | undefined>(undefined);
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

  React.useEffect(() => {
    if (isSaved) {
      setSaveState("saved");
      setSaveErrorMessage(null);
    }
  }, [isSaved]);

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

  return (
    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6">
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

      {activeTab === "details" && <ReportDetailsTab status={status} careerId={careerId} />}
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
      {activeTab === "achievements" && (
        <ReportAchievementsTab
          status={status}
          achievementSummary={achievementSummary}
          winRate={winRate}
          awardsSummary={awardsSummary}
        />
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
