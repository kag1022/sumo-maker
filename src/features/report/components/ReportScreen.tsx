import React from "react";
import { Archive, BookOpenText, Save, Scale, ScrollText, Swords, UserRound } from "lucide-react";
import {
  getCareerBashoDetail,
  listCareerBashoRecordsBySeq,
  type CareerBashoDetail,
  type CareerBashoRecordsBySeq,
} from "../../../logic/persistence/careerHistory";
import { RikishiStatus } from "../../../logic/models";
import {
  getCareerSaveIncentiveSummary,
  type CareerSaveIncentiveSummary,
} from "../../../logic/persistence/careers";
import { Button } from "../../../shared/ui/Button";
import { BanzukeReviewTab } from "./BanzukeReviewTab";
import { formatRankDisplayName } from "../utils/reportFormatters";
import { buildBanzukeReviewTabModel } from "../utils/banzukeReview";
import { RankTrajectoryTab } from "./RankTrajectoryTab";
import { RecordTab } from "./RecordTab";
import { RivalryTab } from "./RivalryTab";

const PERSONALITY_LABELS: Record<string, string> = {
  CALM: "冷静",
  AGGRESSIVE: "闘争的",
  SERIOUS: "真面目",
  WILD: "奔放",
  CHEERFUL: "陽気",
  SHY: "人見知り",
};

const TABS = [
  { id: "review", label: "番付審議", icon: Scale },
  { id: "profile", label: "プロフィール", icon: UserRound },
  { id: "records", label: "戦績", icon: BookOpenText },
  { id: "rank", label: "番付推移", icon: ScrollText },
  { id: "rivals", label: "対戦・宿敵", icon: Swords },
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

const formatRecordText = (wins: number, losses: number, absent: number): string =>
  `${wins}勝${losses}敗${absent > 0 ? `${absent}休` : ""}`;

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-4 border-b border-gold/10 py-2 text-sm">
    <span className="ui-text-label text-gold/60">{label}</span>
    <span className="text-right text-text">{value}</span>
  </div>
);

const surface = "surface-panel border border-gold/10 bg-bg-panel/70";
const insetSurface = "border border-gold/10 bg-bg/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";

export const ReportScreen: React.FC<ReportScreenProps> = ({
  status,
  onReset,
  onSave,
  onOpenCollection,
  isSaved = false,
  careerId = null,
}) => {
  const [activeTab, setActiveTab] = React.useState<TabId>("review");
  const [saveIncentive, setSaveIncentive] = React.useState<CareerSaveIncentiveSummary | null>(null);
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">(isSaved ? "saved" : "idle");
  const [bashoRows, setBashoRows] = React.useState<CareerBashoRecordsBySeq[]>([]);
  const [detail, setDetail] = React.useState<CareerBashoDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  const initial = status.buildSummary?.initialConditionSummary;
  const growth = status.buildSummary?.growthSummary;
  const narrative = status.careerNarrative;
  const totalRecord = formatRecordText(
    status.history.totalWins,
    status.history.totalLosses,
    status.history.totalAbsent,
  );
  const currentHeight = Math.round(status.bodyMetrics.heightCm);
  const currentWeight = Math.round(status.bodyMetrics.weightKg);
  const narrativeTurningNotes = React.useMemo(
    () =>
      (narrative?.turningPoints ?? [])
        .map((point) => point.summary)
        .filter((summary, index, array) => Boolean(summary) && array.indexOf(summary) === index)
        .slice(0, 2),
    [narrative],
  );

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const summary = await getCareerSaveIncentiveSummary(status, {
          careerId,
          isSaved,
          includeOyakata: true,
        });
        if (!cancelled) setSaveIncentive(summary);
      } catch {
        if (!cancelled) setSaveIncentive(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [careerId, isSaved, status]);

  const latestBashoSeq = React.useMemo(
    () => status.history.records.filter((record) => record.rank.division !== "Maezumo").length,
    [status.history.records],
  );

  React.useEffect(() => {
    let cancelled = false;
    if (!careerId || activeTab !== "review") {
      if (!careerId) {
        setBashoRows([]);
        setDetail(null);
      }
      if (!careerId || activeTab !== "review") {
        setDetailLoading(false);
      }
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const [nextRows, nextDetail] = await Promise.all([
        listCareerBashoRecordsBySeq(careerId),
        latestBashoSeq ? getCareerBashoDetail(careerId, latestBashoSeq) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setBashoRows(nextRows);
      setDetail(nextDetail);
      setDetailLoading(false);
    })().catch(() => {
      if (!cancelled) {
        setDetail(null);
        setDetailLoading(false);
      }
    });

    setDetailLoading(true);
    return () => {
      cancelled = true;
    };
  }, [activeTab, careerId, latestBashoSeq]);

  const reviewModel = React.useMemo(
    () => buildBanzukeReviewTabModel({ detail, bashoRows }),
    [bashoRows, detail],
  );

  const handleSave = async () => {
    if (!onSave || isSaved || saveState === "saving") return;
    setSaveState("saving");
    try {
      await onSave();
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  const saveLabel =
    saveState === "saved" || isSaved
      ? "保存済み"
      : saveState === "saving"
        ? "保存中..."
        : "この人生を保存";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="premium-panel relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(196,154,77,0.12),transparent_32%),linear-gradient(180deg,rgba(8,18,35,0.16),transparent_38%)]" />
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-end">
          <div className="relative space-y-5">
            <div className="space-y-3">
              <p className="text-[10px] ui-text-label tracking-[0.5em] text-gold/60 uppercase">Rikishi Record</p>
              <div className="flex flex-wrap items-end gap-4">
                <h1 className="text-5xl sm:text-7xl ui-text-heading text-text">{status.shikona}</h1>
                <div className="mb-2 inline-flex items-center border border-gold/15 bg-bg/30 px-3 py-1 text-[10px] ui-text-label tracking-[0.3em] text-gold/70 uppercase">
                  最高位 {formatRankDisplayName(status.history.maxRank)}
                </div>
              </div>
              <p className="text-sm leading-relaxed text-text/68">
                {initial?.birthplace ?? status.profile.birthplace} / {initial?.stableName ?? "所属不明"}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className={`${surface} relative overflow-hidden p-5`}>
                <div className="absolute inset-y-0 left-0 w-1 bg-gold/35" />
                <p className="text-[10px] ui-text-label tracking-[0.3em] text-gold/55 uppercase">到達点</p>
                <div className="mt-3 space-y-2">
                  <InfoRow label="最高位" value={formatRankDisplayName(status.history.maxRank)} />
                  <InfoRow label="通算成績" value={totalRecord} />
                  <InfoRow label="幕内優勝" value={`${status.history.yushoCount.makuuchi}回`} />
                  <InfoRow label="引退年齢" value={`${status.age}歳`} />
                </div>
              </div>

              <div className={`${surface} relative overflow-hidden p-5`}>
                <div className="absolute inset-y-0 left-0 w-1 bg-brand-line/35" />
                <p className="text-[10px] ui-text-label tracking-[0.3em] text-gold/55 uppercase">入門時と晩年</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className={`${insetSurface} p-4`}>
                    <div className="text-xs text-text/58">入門時</div>
                    <div className="mt-2 text-lg ui-text-heading text-text">
                      {initial ? `${initial.initialHeightCm}cm / ${initial.initialWeightKg}kg` : "-"}
                    </div>
                    <div className="mt-1 text-xs text-text/58">
                      {initial ? `${initial.entryAge}歳 / ${initial.entryPathLabel}` : "入門情報なし"}
                    </div>
                  </div>
                  <div className={`${insetSurface} p-4`}>
                    <div className="text-xs text-text/58">晩年時点</div>
                    <div className="mt-2 text-lg ui-text-heading text-text">
                      {currentHeight}cm / {currentWeight}kg
                    </div>
                    <div className="mt-1 text-xs text-text/58">
                      {growth ? `成長見込み ${growth.peakHeightCm}cm / ${growth.peakWeightKg}kg` : `${status.age}歳時点`}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void handleSave()} disabled={saveState === "saving" || isSaved}>
                <Save className="mr-2 h-4 w-4" />
                {saveLabel}
              </Button>
              <Button variant="secondary" onClick={onReset}>
                新弟子設計へ戻る
              </Button>
              {onOpenCollection && (
                <Button variant="ghost" onClick={onOpenCollection}>
                  <Archive className="mr-2 h-4 w-4" />
                  資料館を開く
                </Button>
              )}
            </div>
          </div>

          <aside className={`${surface} relative overflow-hidden p-5`}>
            <div className="absolute inset-y-0 left-0 w-1 bg-warning/35" />
            <p className="text-[10px] ui-text-label tracking-[0.3em] text-gold/55 uppercase">記録メモ</p>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-text/70">
              <p className={`${insetSurface} p-3`}>{narrative?.initialConditions ?? "この力士の入口は、記録の行間に残ります。"}</p>
              <p className={`${insetSurface} p-3`}>{narrativeTurningNotes[0] ?? status.history.careerTurningPoint?.reason ?? "転機は番付推移と対戦史の中から読み取ります。"}</p>
              {narrativeTurningNotes[1] && <p className={`${insetSurface} p-3`}>{narrativeTurningNotes[1]}</p>}
              <p className={`${insetSurface} p-3`}>
                {narrative?.rivalDigest?.summary ??
                  saveIncentive?.rewardDetail ??
                  "強さだけでなく、保存したくなる人生として残すかをここで判断します。"}
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className={`${surface} p-2`}>
        <nav className="grid gap-2 sm:grid-cols-5" aria-label="力士記録タブ">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                className={`group flex min-w-[120px] items-center gap-3 border px-4 py-3 text-left transition-colors ${
                  activeTab === tab.id
                    ? "border-gold/35 bg-gold/10 text-text"
                    : "border-gold/10 bg-bg/20 text-text/70 hover:border-brand-line/30 hover:bg-brand-ink/25 hover:text-text"
                }`}
                data-active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className={`flex h-9 w-9 items-center justify-center border ${activeTab === tab.id ? "border-gold/25 bg-gold/10" : "border-gold/10 bg-bg/25"}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex flex-col">
                  <span className="text-sm">{tab.label}</span>
                  <span className="text-[10px] ui-text-label tracking-[0.2em] text-gold/45 uppercase">
                    {tab.id === "review"
                      ? "Review"
                      : tab.id === "profile"
                        ? "Identity"
                        : tab.id === "records"
                          ? "Records"
                          : tab.id === "rank"
                            ? "Trajectory"
                            : "Rivalry"}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
      </section>

      {activeTab === "review" && (
        <section className={`${surface} p-4 sm:p-5`}>
          <BanzukeReviewTab
            model={reviewModel}
            isLoading={detailLoading}
            emptyLabel={careerId ? "このキャリアには保存済みの番付審議がありません。" : "保存済みキャリアを開くと番付審議が読めます。"}
          />
        </section>
      )}

      {activeTab === "profile" && (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
          <div className={`${surface} relative overflow-hidden p-5`}>
            <div className="absolute inset-y-0 left-0 w-1 bg-brand-line/35" />
            <div className="mb-4">
              <p className="text-[10px] ui-text-label tracking-[0.3em] text-gold/55 uppercase">人物の入口</p>
              <h2 className="mt-2 text-2xl ui-text-heading text-text">プロフィール</h2>
            </div>
            <div className="space-y-2">
              <InfoRow label="出身地" value={initial?.birthplace ?? status.profile.birthplace} />
              <InfoRow label="所属部屋" value={initial?.stableName ?? "不明"} />
              <InfoRow label="入門年齢" value={`${initial?.entryAge ?? status.entryAge}歳`} />
              <InfoRow label="学歴・競技歴" value={initial?.entryPathLabel ?? "記録なし"} />
              <InfoRow label="気質" value={initial?.temperamentLabel ?? PERSONALITY_LABELS[status.profile.personality]} />
              <InfoRow label="身体の素地" value={initial?.bodySeedLabel ?? "記録なし"} />
              <InfoRow label="初期体格" value={initial ? `${initial.initialHeightCm}cm / ${initial.initialWeightKg}kg` : "-"} />
              <InfoRow label="現在体格" value={`${currentHeight}cm / ${currentWeight}kg`} />
              <InfoRow label="成長見込み" value={growth ? `${growth.peakHeightCm}cm / ${growth.peakWeightKg}kg` : "-"} />
            </div>
          </div>

          <div className={`${surface} relative overflow-hidden p-5`}>
            <div className="absolute inset-y-0 left-0 w-1 bg-warning/35" />
            <div className="mb-4">
              <p className="text-[10px] ui-text-label tracking-[0.3em] text-gold/55 uppercase">人物像の読み口</p>
              <h2 className="mt-2 text-2xl ui-text-heading text-text">記録から見えること</h2>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-text/70">
              <p>{narrative?.growthArc ?? "身体の伸び方と残り方は、番付の浮沈と共に現れます。"}</p>
              <p>{narrative?.careerIdentity ?? "どんな相撲が定着したかは、決まり手と対戦の積み重ねで読みます。"}</p>
              {narrative?.designEchoes?.slice(0, 2).map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p>
                {status.history.totalAbsent > 0
                  ? `生涯で${status.history.totalAbsent}休があり、怪我や停滞もこの力士像の一部として残っています。`
                  : "長い休場は少なく、番付の推移で地力の積み上がりを読みやすい経歴です。"}
              </p>
            </div>
          </div>
        </section>
      )}

      {activeTab === "records" && <RecordTab status={status} careerId={careerId} />}
      {activeTab === "rank" && <RankTrajectoryTab status={status} careerId={careerId} />}
      {activeTab === "rivals" && <RivalryTab status={status} careerId={careerId} />}
    </div>
  );
};
