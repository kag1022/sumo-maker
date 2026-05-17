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
import { CONSTANTS } from "../../../logic/constants";
import { useLocale } from "../../../shared/hooks/useLocale";
import { cn } from "../../../shared/lib/cn";
import type { LocaleCode } from "../../../shared/lib/locale";
import surface from "../../../shared/styles/surface.module.css";
import typography from "../../../shared/styles/typography.module.css";
import { Button } from "../../../shared/ui/Button";
import { BanzukeReviewTab } from "./BanzukeReviewTab";
import { buildBanzukeReviewTabModel } from "../utils/banzukeReview";
import { RankTrajectoryTab } from "./RankTrajectoryTab";
import { RecordTab } from "./RecordTab";
import { RivalryTab } from "./RivalryTab";
import {
  formatPersonalityLabel,
  formatReportAge,
  formatReportHighestRankLabel,
  formatReportRecordText,
  formatTraitAcquisitionLabel as formatReportTraitAcquisitionLabel,
  formatTraitCategoryLabel,
  formatTraitDescription,
  formatTraitName,
  textForLocale,
} from "../utils/reportLocale";

const PERSONALITY_LABELS: Record<string, string> = {
  CALM: "冷静",
  AGGRESSIVE: "闘争的",
  SERIOUS: "真面目",
  WILD: "奔放",
  CHEERFUL: "陽気",
  SHY: "人見知り",
};

const TABS = [
  { id: "review", labels: { ja: "番付審議", en: "Banzuke Review" }, subLabels: { ja: "Review", en: "Review" }, icon: Scale },
  { id: "profile", labels: { ja: "プロフィール", en: "Profile" }, subLabels: { ja: "Identity", en: "Identity" }, icon: UserRound },
  { id: "records", labels: { ja: "戦績", en: "Records" }, subLabels: { ja: "Records", en: "Basho" }, icon: BookOpenText },
  { id: "rank", labels: { ja: "番付推移", en: "Rank Arc" }, subLabels: { ja: "Trajectory", en: "Trajectory" }, icon: ScrollText },
  { id: "rivals", labels: { ja: "対戦・宿敵", en: "Rivals" }, subLabels: { ja: "Rivalry", en: "Rivalry" }, icon: Swords },
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

const formatProfileText = (
  value: string | null | undefined,
  locale: LocaleCode,
  englishFallback: string,
): string => textForLocale(locale, value, englishFallback);

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-4 border-b border-gold/10 py-2 text-sm">
    <span className={cn(typography.label, "text-gold/60")}>{label}</span>
    <span className="text-right text-text">{value}</span>
  </div>
);

const panelClassName = cn(surface.panel, "border border-gold/10 bg-bg-panel/70");
const insetSurface = "border border-gold/10 bg-bg/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";

export const ReportScreen: React.FC<ReportScreenProps> = ({
  status,
  onReset,
  onSave,
  onOpenCollection,
  isSaved = false,
  careerId = null,
}) => {
  const { locale } = useLocale();
  const [activeTab, setActiveTab] = React.useState<TabId>("review");
  const [saveIncentive, setSaveIncentive] = React.useState<CareerSaveIncentiveSummary | null>(null);
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">(isSaved ? "saved" : "idle");
  const [bashoRows, setBashoRows] = React.useState<CareerBashoRecordsBySeq[]>([]);
  const [detail, setDetail] = React.useState<CareerBashoDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  const initial = status.buildSummary?.initialConditionSummary;
  const growth = status.buildSummary?.growthSummary;
  const narrative = status.careerNarrative;
  const totalRecord = formatReportRecordText(
    status.history.totalWins,
    status.history.totalLosses,
    status.history.totalAbsent,
    locale,
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
  const learnedTraits = React.useMemo(
    () =>
      (status.traitJourney ?? [])
        .filter((entry) => entry.state === "LEARNED")
        .map((entry) => ({
          ...entry,
          data: CONSTANTS.TRAIT_DATA[entry.trait],
        })),
    [status.traitJourney],
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
    () => buildBanzukeReviewTabModel({ detail, bashoRows, locale }),
    [bashoRows, detail, locale],
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
      ? locale === "en" ? "Saved" : "保存済み"
      : saveState === "saving"
        ? locale === "en" ? "Saving..." : "保存中..."
        : locale === "en" ? "Save Career" : "この人生を保存";

  const birthplaceLabel = formatProfileText(initial?.birthplace ?? status.profile.birthplace, locale, "Birthplace unknown");
  const stableLabel = formatProfileText(initial?.stableName, locale, "Stable unknown");
  const entryPathLabel = formatProfileText(initial?.entryPathLabel, locale, "Entry route unrecorded");
  const bodySeedLabel = formatProfileText(initial?.bodySeedLabel, locale, "Body type unrecorded");
  const memoInitial = textForLocale(
    locale,
    narrative?.initialConditions,
    "The entry profile is preserved as part of this saved career.",
  );
  const memoTurning = textForLocale(
    locale,
    narrativeTurningNotes[0] ?? status.history.careerTurningPoint?.reason,
    "The turning points are available through the rank arc and rivalry records.",
  );
  const memoSecondTurning = narrativeTurningNotes[1]
    ? textForLocale(locale, narrativeTurningNotes[1], "Another career note is attached to this saved record.")
    : null;
  const memoRival = textForLocale(
    locale,
    narrative?.rivalDigest?.summary ?? saveIncentive?.rewardDetail,
    "This page records why the career was worth saving, beyond strength alone.",
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className={cn(surface.premium, "relative overflow-hidden p-6 sm:p-8")}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(196,154,77,0.12),transparent_32%),linear-gradient(180deg,rgba(8,18,35,0.16),transparent_38%)]" />
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-end">
          <div className="relative space-y-5">
            <div className="space-y-3">
              <p className={cn(typography.label, "text-[10px] tracking-[0.5em] text-gold/60 uppercase")}>{locale === "en" ? "Saved Rikishi Record" : "Rikishi Record"}</p>
              <div className="flex flex-wrap items-end gap-4">
                <h1 className={cn(typography.heading, "text-5xl sm:text-7xl text-text")}>{status.shikona}</h1>
                <div className={cn(typography.label, "mb-2 inline-flex items-center border border-gold/15 bg-bg/30 px-3 py-1 text-[10px] tracking-[0.3em] text-gold/70 uppercase")}>
                  {locale === "en" ? "Peak " : "最高位 "}{formatReportHighestRankLabel(status.history.maxRank, locale)}
                </div>
              </div>
              <p className="text-sm leading-relaxed text-text/68">
                {birthplaceLabel} / {stableLabel}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className={cn(panelClassName, "relative overflow-hidden p-5")}>
                <div className="absolute inset-y-0 left-0 w-1 bg-gold/35" />
                <p className={cn(typography.label, "text-[10px] tracking-[0.3em] text-gold/55 uppercase")}>{locale === "en" ? "Career Marks" : "到達点"}</p>
                <div className="mt-3 space-y-2">
                  <InfoRow label={locale === "en" ? "Peak Rank" : "最高位"} value={formatReportHighestRankLabel(status.history.maxRank, locale)} />
                  <InfoRow label={locale === "en" ? "Career Record" : "通算成績"} value={totalRecord} />
                  <InfoRow label={locale === "en" ? "Makuuchi Yusho" : "幕内優勝"} value={locale === "en" ? `${status.history.yushoCount.makuuchi}` : `${status.history.yushoCount.makuuchi}回`} />
                  <InfoRow label={locale === "en" ? "Retirement Age" : "引退年齢"} value={formatReportAge(status.age, locale)} />
                </div>
              </div>

              <div className={cn(panelClassName, "relative overflow-hidden p-5")}>
                <div className="absolute inset-y-0 left-0 w-1 bg-brand-line/35" />
                <p className={cn(typography.label, "text-[10px] tracking-[0.3em] text-gold/55 uppercase")}>{locale === "en" ? "Entry And Final Form" : "入門時と晩年"}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className={`${insetSurface} p-4`}>
                    <div className="text-xs text-text/58">{locale === "en" ? "Entry" : "入門時"}</div>
                    <div className={cn(typography.heading, "mt-2 text-lg text-text")}>
                      {initial ? `${initial.initialHeightCm}cm / ${initial.initialWeightKg}kg` : "-"}
                    </div>
                    <div className="mt-1 text-xs text-text/58">
                      {initial ? `${formatReportAge(initial.entryAge, locale)} / ${entryPathLabel}` : locale === "en" ? "Entry profile unavailable" : "入門情報なし"}
                    </div>
                  </div>
                  <div className={`${insetSurface} p-4`}>
                    <div className="text-xs text-text/58">{locale === "en" ? "Final state" : "晩年時点"}</div>
                    <div className={cn(typography.heading, "mt-2 text-lg text-text")}>
                      {currentHeight}cm / {currentWeight}kg
                    </div>
                    <div className="mt-1 text-xs text-text/58">
                      {growth
                        ? locale === "en" ? `Projected peak ${growth.peakHeightCm}cm / ${growth.peakWeightKg}kg` : `成長見込み ${growth.peakHeightCm}cm / ${growth.peakWeightKg}kg`
                        : locale === "en" ? `At age ${status.age}` : `${status.age}歳時点`}
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
                {locale === "en" ? "Return to Observation Setup" : "観測設計へ戻る"}
              </Button>
              {onOpenCollection && (
                <Button variant="ghost" onClick={onOpenCollection}>
                  <Archive className="mr-2 h-4 w-4" />
                  {locale === "en" ? "Open Collection" : "資料館を開く"}
                </Button>
              )}
            </div>
          </div>

          <aside className={cn(panelClassName, "relative overflow-hidden p-5")}>
            <div className="absolute inset-y-0 left-0 w-1 bg-warning/35" />
            <p className={cn(typography.label, "text-[10px] tracking-[0.3em] text-gold/55 uppercase")}>{locale === "en" ? "Record Notes" : "記録メモ"}</p>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-text/70">
              <p className={`${insetSurface} p-3`}>{memoInitial}</p>
              <p className={`${insetSurface} p-3`}>{memoTurning}</p>
              {memoSecondTurning && <p className={`${insetSurface} p-3`}>{memoSecondTurning}</p>}
              <p className={`${insetSurface} p-3`}>{memoRival}</p>
            </div>
          </aside>
        </div>
      </section>

      <section className={cn(panelClassName, "p-2")}>
        <nav className="grid gap-2 sm:grid-cols-5" aria-label={locale === "en" ? "Rikishi record tabs" : "力士記録タブ"}>
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
                  <span className="text-sm">{tab.labels[locale]}</span>
                  <span className={cn(typography.label, "text-[10px] tracking-[0.2em] text-gold/45 uppercase")}>
                    {tab.subLabels[locale]}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
      </section>

      {activeTab === "review" && (
        <section className={cn(panelClassName, "p-4 sm:p-5")}>
          <BanzukeReviewTab
            model={reviewModel}
            isLoading={detailLoading}
            emptyLabel={careerId
              ? locale === "en" ? "No saved banzuke review is available for this career." : "このキャリアには保存済みの番付審議がありません。"
              : locale === "en" ? "Open a saved career to read its banzuke review." : "保存済みキャリアを開くと番付審議が読めます。"}
          />
        </section>
      )}

      {activeTab === "profile" && (
        <section className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
            <div className={cn(panelClassName, "relative overflow-hidden p-5")}>
              <div className="absolute inset-y-0 left-0 w-1 bg-brand-line/35" />
              <div className="mb-4">
                <p className={cn(typography.label, "text-[10px] tracking-[0.3em] text-gold/55 uppercase")}>{locale === "en" ? "Entry Profile" : "人物の入口"}</p>
                <h2 className={cn(typography.heading, "mt-2 text-2xl text-text")}>{locale === "en" ? "Profile" : "プロフィール"}</h2>
              </div>
              <div className="space-y-2">
                <InfoRow label={locale === "en" ? "Birthplace" : "出身地"} value={birthplaceLabel} />
                <InfoRow label={locale === "en" ? "Stable" : "所属部屋"} value={stableLabel} />
                <InfoRow label={locale === "en" ? "Entry Age" : "入門年齢"} value={formatReportAge(initial?.entryAge ?? status.entryAge, locale)} />
                <InfoRow label={locale === "en" ? "Entry Route" : "学歴・競技歴"} value={entryPathLabel} />
                <InfoRow label={locale === "en" ? "Temperament" : "気質"} value={locale === "en" ? formatPersonalityLabel(status.profile.personality, locale) : initial?.temperamentLabel ?? PERSONALITY_LABELS[status.profile.personality]} />
                <InfoRow label={locale === "en" ? "Body Type" : "身体の素地"} value={bodySeedLabel} />
                <InfoRow label={locale === "en" ? "Entry Body" : "初期体格"} value={initial ? `${initial.initialHeightCm}cm / ${initial.initialWeightKg}kg` : "-"} />
                <InfoRow label={locale === "en" ? "Final Body" : "現在体格"} value={`${currentHeight}cm / ${currentWeight}kg`} />
                <InfoRow label={locale === "en" ? "Projected Peak" : "成長見込み"} value={growth ? `${growth.peakHeightCm}cm / ${growth.peakWeightKg}kg` : "-"} />
              </div>
            </div>

            <div className={cn(panelClassName, "relative overflow-hidden p-5")}>
              <div className="absolute inset-y-0 left-0 w-1 bg-warning/35" />
              <div className="mb-4">
                <p className={cn(typography.label, "text-[10px] tracking-[0.3em] text-gold/55 uppercase")}>{locale === "en" ? "Reading The Record" : "人物像の読み口"}</p>
                <h2 className={cn(typography.heading, "mt-2 text-2xl text-text")}>{locale === "en" ? "What The Record Shows" : "記録から見えること"}</h2>
              </div>
              <div className="space-y-3 text-sm leading-relaxed text-text/70">
                <p>{textForLocale(locale, narrative?.growthArc, "Growth and decline are read through the rank arc and body record.")}</p>
                <p>{textForLocale(locale, narrative?.careerIdentity, "The career identity is preserved through rank movement, kimarite, and rivalry records.")}</p>
                {narrative?.designEchoes?.slice(0, 2).map((line) => (
                  <p key={line}>{textForLocale(locale, line, "An observation premise is attached to this saved career.")}</p>
                ))}
                <p>
                  {status.history.totalAbsent > 0
                    ? locale === "en" ? `${status.history.totalAbsent} absences are part of this career record.` : `生涯で${status.history.totalAbsent}休があり、怪我や停滞もこの力士像の一部として残っています。`
                    : locale === "en" ? "Long absences were limited, making the rank arc easier to read." : "長い休場は少なく、番付の推移で地力の積み上がりを読みやすい経歴です。"}
                </p>
              </div>
            </div>
          </div>

          <div className={cn(panelClassName, "relative overflow-hidden p-5")}>
            <div className="absolute inset-y-0 left-0 w-1 bg-gold/35" />
            <div className="mb-4">
              <p className={cn(typography.label, "text-[10px] tracking-[0.3em] text-gold/55 uppercase")}>{locale === "en" ? "Learned Traits" : "習得した特性"}</p>
              <h2 className={cn(typography.heading, "mt-2 text-2xl text-text")}>{locale === "en" ? "Traits" : "特性"}</h2>
            </div>
            {learnedTraits.length > 0 ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {learnedTraits.map((entry) => (
                  <article key={`${entry.trait}-${entry.learnedAtBashoSeq ?? "legacy"}`} className={`${insetSurface} p-4 space-y-2`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className={cn(typography.heading, "text-lg text-text")}>{formatTraitName(entry.trait, entry.data?.name, locale)}</div>
                        <div className="text-xs text-gold/70">
                          {formatTraitCategoryLabel(entry.data?.category, locale)} / {formatReportTraitAcquisitionLabel(entry, locale)}
                        </div>
                      </div>
                      <span className={cn(typography.label, `px-2 py-1 text-[10px] border ${entry.data?.isNegative ? "border-warning/30 text-warning-bright" : "border-state/30 text-state-bright"}`)}>
                        {entry.data?.isNegative ? (locale === "en" ? "Manifested" : "発現") : (locale === "en" ? "Learned" : "習得")}
                      </span>
                    </div>
                    <div className="text-sm text-text/72">{textForLocale(locale, entry.triggerLabel, "Trigger not recorded")}</div>
                    <div className="text-xs leading-relaxed text-text/58">{textForLocale(locale, entry.triggerDetail, "No detailed trigger was saved.")}</div>
                    <div className="border-t border-gold/10 pt-2 text-xs text-text/60">{formatTraitDescription(entry.trait, entry.data?.description, locale)}</div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={`${insetSurface} p-4 text-sm text-text/60`}>
                {locale === "en" ? "No learned traits are recorded." : "習得が記録された特性はありません。"}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === "records" && <RecordTab status={status} careerId={careerId} />}
      {activeTab === "rank" && <RankTrajectoryTab status={status} careerId={careerId} />}
      {activeTab === "rivals" && <RivalryTab status={status} careerId={careerId} />}
    </div>
  );
};
