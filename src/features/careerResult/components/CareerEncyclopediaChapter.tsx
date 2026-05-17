import React from "react";
import {
  BarChart3,
  BookOpenText,
  Swords,
  Trophy,
} from "lucide-react";
import { CONSTANTS } from "../../../logic/constants";
import { type CareerSaveTag, type ObservationStanceId, type RikishiStatus } from "../../../logic/models";
import type { CareerBashoRecordsBySeq } from "../../../logic/persistence/careerHistory";
import {
  buildCareerAnalysisSummary,
  buildCareerStanceAnalysis,
} from "../../../logic/career/analysis";
import { buildCareerClearScoreSummary } from "../../../logic/career/clearScore";
import {
  ensureStyleIdentityProfile,
  resolveDisplayedStrengthStyles,
  resolveDisplayedWeakStyles,
  resolveStyleLabelsOrFallback,
} from "../../../logic/style/identity";
import { summarizeRareKimariteEncounters } from "../../../logic/kimarite/rareEncounters";
import { summarizeSignatureKimarite } from "../../../logic/kimarite/signature";
import { TRAIT_CATEGORY_LABELS, formatTraitAcquisitionLabel } from "../../../logic/traits";
import { buildStableEnvironmentReading } from "../../../logic/simulation/heya/stableEnvironment";
import { buildStablemateSummaries } from "../../shared/utils/stablemateReading";
import { useLocale } from "../../../shared/hooks/useLocale";
import type { LocaleCode } from "../../../shared/lib/locale";
import type {
  CareerDesignReadingModel,
  CareerLedgerPoint,
  CareerOverviewModel,
} from "../utils/careerResultModel";
import { buildCareerMilestones } from "../utils/careerMilestones";
import { RELEASE_KNOWN_LIMITATIONS } from "../utils/releaseFeedback";
import type { DetailBuildProgress } from "../../../logic/simulation/workerProtocol";
import { WinRateTrendChart } from "./WinRateTrendChart";
import { BodyWeightChart } from "./BodyWeightChart";
import { TraitTimeline } from "./TraitTimeline";
import { BracketFrame } from "./encyclopedia/BracketFrame";
import { ModuleHeader } from "./encyclopedia/ModuleHeader";
import { DataSheet, type DataSheetRow } from "./encyclopedia/DataSheet";
import { SubjectCard } from "./encyclopedia/SubjectCard";
import { TrajectoryScope } from "./encyclopedia/TrajectoryScope";
import { RegistrationConsole } from "./encyclopedia/RegistrationConsole";
import {
  ChipList,
  CopyStack,
  Lead,
} from "./encyclopedia/TelemetryModule";
import { EventLog } from "./encyclopedia/EventLog";
import styles from "./CareerEncyclopediaChapter.module.css";

interface CareerEncyclopediaChapterProps {
  status: RikishiStatus;
  overview: CareerOverviewModel;
  designReading: CareerDesignReadingModel;
  highestRankLabel: string;
  ledgerPoints?: CareerLedgerPoint[];
  bashoRows: CareerBashoRecordsBySeq[];
  isSaved: boolean;
  detailState: "idle" | "building" | "ready" | "error";
  detailBuildProgress: DetailBuildProgress | null;
  observationPointsAwarded?: number;
  observationStanceId?: ObservationStanceId;
  onSave: (metadata?: { saveTags?: CareerSaveTag[]; observerMemo?: string }) => void | Promise<void>;
  onReturnToScout: () => void;
  onOpenArchive: () => void;
  onOpenChapter: (chapter: "trajectory" | "place") => void;
}

const BODY_LABELS: Record<RikishiStatus["bodyType"], string> = {
  NORMAL: "均整型",
  SOPPU: "ソップ型",
  ANKO: "アンコ型",
  MUSCULAR: "筋骨型",
};

const BODY_LABELS_EN: Record<RikishiStatus["bodyType"], string> = {
  NORMAL: "Balanced",
  SOPPU: "Lean",
  ANKO: "Heavy",
  MUSCULAR: "Muscular",
};

const PERSONALITY_LABELS_EN: Record<string, string> = {
  CALM: "Calm",
  AGGRESSIVE: "Combative",
  SERIOUS: "Serious",
  WILD: "Unrestrained",
  CHEERFUL: "Cheerful",
  SHY: "Reserved",
};

const TRAIT_CATEGORY_EN_LABELS: Record<string, string> = {
  BODY: "Body",
  MENTAL: "Mental",
  TECHNIQUE: "Technique",
};

const JAPANESE_TEXT_PATTERN = /[ぁ-んァ-ン一-龥]/;

const hasJapaneseText = (value: string | null | undefined): boolean =>
  Boolean(value && JAPANESE_TEXT_PATTERN.test(value));

const textForLocale = (
  locale: LocaleCode,
  value: string | null | undefined,
  englishFallback: string,
): string => {
  if (locale !== "en") return value ?? englishFallback;
  if (!value || hasJapaneseText(value)) return englishFallback;
  return value;
};

const humanizeCode = (value: string): string =>
  value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const formatRecordText = (wins: number, losses: number, absent: number, locale: LocaleCode): string =>
  locale === "en"
    ? `${wins}-${losses}${absent > 0 ? `, ${absent} absences` : ""}`
    : `${wins}勝${losses}敗${absent > 0 ? `${absent}休` : ""}`;

const formatWinRate = (wins: number, losses: number): string => {
  const total = wins + losses;
  if (total <= 0) return "-";
  return `${((wins / total) * 100).toFixed(1)}%`;
};

const toBodyTypeLabel = (raw: string | undefined, fallback: RikishiStatus["bodyType"], locale: LocaleCode): string => {
  if (locale === "en") {
    if (raw && !hasJapaneseText(raw)) return raw;
    return BODY_LABELS_EN[fallback] ?? fallback;
  }
  if (raw && BODY_LABELS[raw as keyof typeof BODY_LABELS]) return BODY_LABELS[raw as keyof typeof BODY_LABELS];
  if (raw && raw.length > 0) return raw;
  return BODY_LABELS[fallback];
};

const resolveRetirementReason = (status: RikishiStatus, locale: LocaleCode): string | null => {
  const event = [...status.history.events].reverse().find((entry) => entry.type === "RETIREMENT");
  if (!event) return null;
  const reason = event.description.replace(/^引退 \(/, "").replace(/\)$/, "") || null;
  if (locale === "en") return textForLocale(locale, reason, "Retired after accumulated career wear");
  return reason;
};

const toCoverReadingLine = (
  designReading: CareerDesignReadingModel,
  initial: NonNullable<RikishiStatus["buildSummary"]>["initialConditionSummary"] | undefined,
  locale: LocaleCode,
): string => {
  const expectation = designReading.premiseRows.find((row) => row.label === "期待")?.interpreted;
  if (expectation) return textForLocale(locale, expectation, "Use the entry premise as a starting point, then read the rank arc and stalls.");
  const firstInterpretation = designReading.interpretationRows[0]?.interpreted;
  if (firstInterpretation) return textForLocale(locale, firstInterpretation, "Compare the entry premise with the actual career record.");
  const entryLine = [initial?.entryPathLabel, initial?.temperamentLabel, initial?.bodySeedLabel]
    .filter(Boolean)
    .join("、");
  if (locale === "en") return "Read the gap between the entry premise and the actual record through rank movement and basho results.";
  return entryLine ? `${entryLine}として入口条件を読む。` : "入口条件と実結果の差を、番付推移と場所別記録から読む。";
};

export const CareerEncyclopediaChapter: React.FC<CareerEncyclopediaChapterProps> = ({
  status,
  overview,
  designReading,
  highestRankLabel,
  ledgerPoints,
  bashoRows,
  isSaved,
  detailState,
  detailBuildProgress,
  observationPointsAwarded,
  observationStanceId,
  onSave,
  onReturnToScout,
  onOpenArchive,
  onOpenChapter,
}) => {
  const { locale } = useLocale();
  const analysis = React.useMemo(() => buildCareerAnalysisSummary(status), [status]);
  const clearScoreSummary = React.useMemo(() => buildCareerClearScoreSummary(status), [status]);
  const stanceAnalysis = React.useMemo(
    () => buildCareerStanceAnalysis(analysis, observationStanceId),
    [analysis, observationStanceId],
  );

  const initial = status.buildSummary?.initialConditionSummary;
  const growth = status.buildSummary?.growthSummary;
  const narrative = status.careerNarrative;
  const stableEnvironment = React.useMemo(() => buildStableEnvironmentReading(status), [status]);
  const stablemates = React.useMemo(() => buildStablemateSummaries(status, bashoRows), [bashoRows, status]);
  const retirementReason = React.useMemo(() => resolveRetirementReason(status, locale), [locale, status]);
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
  const totalSansho = React.useMemo(
    () => status.history.records.reduce((sum, record) => sum + (record.specialPrizes?.length ?? 0), 0),
    [status.history.records],
  );
  const kinboshi = React.useMemo(
    () => status.history.records.reduce((sum, record) => sum + (record.kinboshi ?? 0), 0),
    [status.history.records],
  );
  const styleIdentity = React.useMemo(() => ensureStyleIdentityProfile(status).styleIdentityProfile, [status]);
  const strengthStyles = React.useMemo(() => resolveDisplayedStrengthStyles(styleIdentity), [styleIdentity]);
  const strengthLabel = React.useMemo(() => resolveStyleLabelsOrFallback(strengthStyles), [strengthStyles]);
  const weaknessLabel = React.useMemo(
    () => resolveStyleLabelsOrFallback(resolveDisplayedWeakStyles(styleIdentity)),
    [styleIdentity],
  );
  const signatureSummary = React.useMemo(
    () => summarizeSignatureKimarite(status.history.kimariteTotal, strengthStyles, 3),
    [status.history.kimariteTotal, strengthStyles],
  );
  const rareKimariteEncounters = React.useMemo(
    () => summarizeRareKimariteEncounters(status.history.kimariteTotal).slice(0, 4),
    [status.history.kimariteTotal],
  );
  const careerMilestones = React.useMemo(
    () => buildCareerMilestones(ledgerPoints, status.entryAge),
    [ledgerPoints, status.entryAge],
  );
  const bodyTimeline = status.history.bodyTimeline ?? [];
  const entryWeight = bodyTimeline.length > 0 ? bodyTimeline[0].weightKg : undefined;
  const peakWeight = bodyTimeline.length > 0 ? Math.max(...bodyTimeline.map((b) => b.weightKg)) : undefined;
  const traitAwakenings = status.history.traitAwakenings ?? [];
  const totalBashoForTimeline = status.history.records.filter((r) => r.rank.division !== "Maezumo").length;
  const nonMaezumoRecords = status.history.records.filter((record) => record.rank.division !== "Maezumo");
  const makuuchiBasho = nonMaezumoRecords.filter((record) => record.rank.division === "Makuuchi").length;
  const yushoCount = status.history.yushoCount;
  const coverReadingLine = React.useMemo(() => toCoverReadingLine(designReading, initial, locale), [designReading, initial, locale]);
  const coverSummaryLine = textForLocale(
    locale,
    narrative?.careerIdentity ?? narrative?.retirementDigest ?? overview.lifeSummary,
    overview.lifeSummary,
  );

  const detailReady = detailState === "ready";
  const saveProgressLabel = `${detailBuildProgress?.flushedBashoCount ?? 0}/${detailBuildProgress?.totalBashoCount ?? status.history.records.length}`;

  const memoLines = React.useMemo(
    () => {
      const lines = [
        narrative?.initialConditions,
        narrative?.careerIdentity,
        narrative?.growthArc,
        narrative?.retirementDigest,
      ]
        .map((line) => textForLocale(locale, line, "A saved career note is attached to this record."))
        .filter((line): line is string => Boolean(line))
        .filter((line, index, array) => array.indexOf(line) === index);
      return lines.slice(0, 4);
    },
    [
      locale,
      narrative?.careerIdentity,
      narrative?.growthArc,
      narrative?.initialConditions,
      narrative?.retirementDigest,
    ],
  );

  const profileRows: DataSheetRow[] = React.useMemo(
    () =>
      [
        { label: locale === "en" ? "Birthplace" : "出身", value: initial?.birthplace ?? status.profile.birthplace },
        { label: locale === "en" ? "Stable" : "所属", value: stableEnvironment.stableName },
        {
          label: locale === "en" ? "Entry" : "入門",
          value: locale === "en"
            ? `${initial?.entryAge ?? status.entryAge} yrs / ${textForLocale(locale, initial?.entryPathLabel, "Entry route recorded")}`
            : `${initial?.entryAge ?? status.entryAge}歳 / ${initial?.entryPathLabel ?? "経路未詳"}`,
        },
        { label: locale === "en" ? "Temperament" : "気質", value: locale === "en" ? PERSONALITY_LABELS_EN[status.profile.personality] ?? humanizeCode(status.profile.personality) : initial?.temperamentLabel ?? status.profile.personality },
        { label: locale === "en" ? "Body Type" : "体型", value: toBodyTypeLabel(growth?.bodyTypeLabel, status.bodyType, locale) },
        {
          label: locale === "en" ? "Final Body" : "晩年体格",
          value: `${Math.round(status.bodyMetrics.heightCm)}cm / ${Math.round(status.bodyMetrics.weightKg)}kg`,
        },
        retirementReason ? { label: locale === "en" ? "Ending" : "終幕", value: retirementReason } : null,
      ].filter((row): row is DataSheetRow => Boolean(row)),
    [
      growth?.bodyTypeLabel,
      initial,
      locale,
      retirementReason,
      stableEnvironment.stableName,
      status.bodyMetrics.heightCm,
      status.bodyMetrics.weightKg,
      status.bodyType,
      status.entryAge,
      status.profile.birthplace,
      status.profile.personality,
    ],
  );

  const styleRows: DataSheetRow[] = React.useMemo(
    () => [
      { label: locale === "en" ? "Strength Style" : "得意な型", value: textForLocale(locale, strengthLabel, "Recorded strength style") },
      { label: locale === "en" ? "Weak Style" : "苦手な型", value: textForLocale(locale, weaknessLabel, "No clear weak style") },
      {
        label: locale === "en" ? "Signature Kimarite" : "代表技",
        value:
          signatureSummary.selectedMoves.length > 0
            ? signatureSummary.selectedMoves.map((move) => textForLocale(locale, move, "Recorded kimarite")).join(" / ")
            : locale === "en" ? "No record" : "記録なし",
      },
    ],
    [locale, signatureSummary.selectedMoves, strengthLabel, weaknessLabel],
  );

  const stableRows: DataSheetRow[] = React.useMemo(
    () => [
      { label: locale === "en" ? "Stable" : "所属部屋", value: stableEnvironment.stableName },
      { label: locale === "en" ? "Ichimon" : "一門", value: textForLocale(locale, stableEnvironment.ichimonName, "Ichimon recorded") },
      { label: locale === "en" ? "Stable Type" : "部屋系統", value: textForLocale(locale, stableEnvironment.archetypeName, "Stable profile recorded") },
      { label: locale === "en" ? "Scale" : "規模", value: textForLocale(locale, stableEnvironment.scaleLabel, "Scale recorded") },
    ],
    [
      locale,
      stableEnvironment.archetypeName,
      stableEnvironment.ichimonName,
      stableEnvironment.scaleLabel,
      stableEnvironment.stableName,
    ],
  );

  const recordRows: DataSheetRow[] = React.useMemo(
    () =>
      [
        {
          label: locale === "en" ? "Career Record" : "通算成績",
          value: formatRecordText(
            status.history.totalWins,
            status.history.totalLosses,
            status.history.totalAbsent,
            locale,
          ),
        },
        { label: locale === "en" ? "Career Win Rate" : "通算勝率", value: formatWinRate(status.history.totalWins, status.history.totalLosses) },
        { label: locale === "en" ? "Highest Rank" : "最高位", value: highestRankLabel },
        { label: locale === "en" ? "Basho" : "在位場所", value: locale === "en" ? `${nonMaezumoRecords.length} basho` : `${nonMaezumoRecords.length}場所` },
        { label: locale === "en" ? "Makuuchi Basho" : "幕内在位", value: locale === "en" ? `${makuuchiBasho} basho` : `${makuuchiBasho}場所` },
        { label: locale === "en" ? "Makuuchi Yusho" : "幕内優勝", value: locale === "en" ? `${yushoCount.makuuchi}` : `${yushoCount.makuuchi}回` },
        { label: locale === "en" ? "Juryo Yusho" : "十両優勝", value: locale === "en" ? `${yushoCount.juryo ?? 0}` : `${yushoCount.juryo ?? 0}回` },
        { label: locale === "en" ? "Makushita Yusho" : "幕下優勝", value: locale === "en" ? `${yushoCount.makushita ?? 0}` : `${yushoCount.makushita ?? 0}回` },
        { label: locale === "en" ? "Lower Yusho" : "下位優勝", value: locale === "en" ? `${yushoCount.others ?? 0}` : `${yushoCount.others ?? 0}回` },
        { label: locale === "en" ? "Sansho" : "三賞", value: locale === "en" ? `${totalSansho}` : `${totalSansho}回` },
        { label: locale === "en" ? "Kinboshi" : "金星", value: locale === "en" ? `${kinboshi}` : `${kinboshi}個` },
      ],
    [
      highestRankLabel,
      kinboshi,
      locale,
      makuuchiBasho,
      nonMaezumoRecords.length,
      status.history.totalAbsent,
      status.history.totalLosses,
      status.history.totalWins,
      totalSansho,
      yushoCount.juryo,
      yushoCount.makushita,
      yushoCount.makuuchi,
      yushoCount.others,
    ],
  );

  const designRows = (designReading.premiseRows.length > 0
    ? designReading.premiseRows
    : designReading.interpretationRows
  ).slice(0, 5);

  const subjectId = status.shikona;

  return (
    <section className={styles.shell}>
      <SubjectCard
        status={status}
        overview={overview}
        highestRankLabel={highestRankLabel}
        observationPointsAwarded={observationPointsAwarded}
        coverSummaryLine={coverSummaryLine}
        coverReadingLine={coverReadingLine}
        profileRows={profileRows}
        subjectId={subjectId}
        isSaved={isSaved}
        detailReady={detailReady}
      />

      <TrajectoryScope points={ledgerPoints} onOpenChapter={onOpenChapter} />

      <RegistrationConsole
        analysis={analysis}
        clearScoreSummary={clearScoreSummary}
        designReading={designReading}
        isSaved={isSaved}
        detailReady={detailReady}
        saveProgressLabel={saveProgressLabel}
        onSave={onSave}
        onReturnToScout={onReturnToScout}
        onOpenArchive={onOpenArchive}
      />

      <BracketFrame variant="phantom" padding="zero" bodyClassName={styles.crossModeStrip}>
        <button type="button" className={styles.crossModeButton} onClick={() => onOpenChapter("trajectory")}>
          <BarChart3 className="h-4 w-4" />
          <span className={styles.crossModeLabel}>{locale === "en" ? "Open Rank Trajectory" : "番付推移を見る"}</span>
          <span className={styles.crossModeDesc}>{locale === "en" ? "Read rise, stalls, drops, and recoveries" : "上昇、停滞、陥落、復帰の流れを読む"}</span>
        </button>
        <button type="button" className={styles.crossModeButton} onClick={() => onOpenChapter("place")}>
          <BookOpenText className="h-4 w-4" />
          <span className={styles.crossModeLabel}>{locale === "en" ? "Open Basho Records" : "場所別記録を見る"}</span>
          <span className={styles.crossModeDesc}>{locale === "en" ? "Inspect banzuke rows, bouts, and nearby rikishi" : "番付表、取組、周辺力士の詳細"}</span>
        </button>
      </BracketFrame>

      <EventLog milestones={careerMilestones} />

      <BracketFrame variant="module" padding="default">
        <ModuleHeader
          kicker={locale === "en" ? "Supplement" : "補足記録"}
          title={locale === "en" ? "Record Details" : "情報の整理"}
          copy={locale === "en" ? "Related information is grouped so the record can be read in layers." : "似ている情報をまとめ、必要なところだけ開いて読めるようにします。"}
        />
        <div className={styles.groupedRecords}>
          <details className={styles.infoGroup} open>
            <summary className={styles.infoGroupSummary}>
              <span>{locale === "en" ? "Profile And Style" : "プロフィールと取り口"}</span>
              <em>{locale === "en" ? "Identity, body, stable, and strength style" : "人物像、体格、所属、得意な型"}</em>
            </summary>
            <div className={styles.infoGroupBody}>
              <div className={styles.infoPanel}>
                <ModuleHeader kicker={locale === "en" ? "Identity" : "人物"} title={locale === "en" ? "Profile" : "プロフィール"} size="sm" density="compact" />
                <DataSheet rows={profileRows} layout="grid" mono />
              </div>
              <div className={styles.infoPanel}>
                <ModuleHeader kicker={locale === "en" ? "Reading" : "人物像"} title={locale === "en" ? "Career Reading" : "一代の読み筋"} size="sm" density="compact" />
                <CopyStack lines={memoLines.length > 0 ? memoLines : [overview.lifeSummary]} />
              </div>
              <div className={styles.infoPanel}>
                <ModuleHeader kicker={locale === "en" ? "Sumo" : "相撲"} title={locale === "en" ? "Style" : "取り口"} size="sm" density="compact" />
                <DataSheet rows={styleRows} layout="grid" mono />
                {rareKimariteEncounters.length > 0 ? (
                  <ChipList
                    items={rareKimariteEncounters.map((encounter) => ({
                      key: encounter.kimariteId,
                      label: locale === "en"
                        ? `${textForLocale(locale, encounter.name, "Rare kimarite")} / ${encounter.count}`
                        : `${encounter.name} / ${encounter.count}回`,
                    }))}
                  />
                ) : null}
              </div>
              <div className={styles.infoPanel}>
                <ModuleHeader kicker={locale === "en" ? "Environment" : "環境"} title={locale === "en" ? "Stable" : "所属部屋"} size="sm" density="compact" />
                <Lead>{textForLocale(locale, stableEnvironment.lead, "The stable environment is part of the career context.")}</Lead>
                <DataSheet rows={stableRows} layout="grid" mono />
              </div>
            </div>
          </details>

          {designRows.length > 0 ? (
            <details className={styles.infoGroup}>
              <summary className={styles.infoGroupSummary}>
                <span>{locale === "en" ? "Entry Conditions" : "入門時の条件"}</span>
                <em>{locale === "en" ? "The gap between premise and actual career" : "入口条件と実際の一代の差"}</em>
              </summary>
              <div className={styles.infoGroupBody}>
                <div className={styles.infoPanelWide}>
                  <div className={styles.designTable}>
                    {designRows.map((row) => (
                      <div key={`${row.label}-${row.designed}`} className={styles.designRow}>
                        <span>{textForLocale(locale, row.label, "Premise")}</span>
                        <p>{textForLocale(locale, row.interpreted, "This premise is recorded for later comparison.")}</p>
                        <strong>{textForLocale(locale, row.realized, "Actual outcome recorded")}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </details>
          ) : null}

          <details className={styles.infoGroup}>
            <summary className={styles.infoGroupSummary}>
              <span>{locale === "en" ? "Records And Honors" : "成績と実績"}</span>
              <em>{locale === "en" ? "Career record, yusho, sansho, and kinboshi" : "通算、優勝、三賞、金星"}</em>
            </summary>
            <div className={styles.infoGroupBody}>
              <div className={styles.infoPanelWide}>
                <DataSheet rows={recordRows} layout="grid" mono />
              </div>
            </div>
          </details>

          <details className={styles.infoGroup}>
            <summary className={styles.infoGroupSummary}>
              <span>{locale === "en" ? "Nearby Rikishi And Traits" : "周辺力士と特性"}</span>
              <em>{locale === "en" ? "Stablemates and learned traits" : "同部屋の力士、習得した特性"}</em>
            </summary>
            <div className={styles.infoGroupBody}>
              {stablemates.length > 0 ? (
                <div className={styles.infoPanel}>
                  <ModuleHeader kicker={locale === "en" ? "Stablemates" : "同部屋"} title={locale === "en" ? "Notable Stablemates" : "同部屋の主な力士"} size="sm" density="compact" />
                  <div className={styles.stablemateGrid}>
                    {stablemates.map((mate) => (
                      <div
                        key={mate.entityId}
                        className={styles.stablemateCard}
                        data-relation={mate.relation}
                      >
                        <span>{locale === "en" ? "Stablemate" : mate.relationLabel} / {locale === "en" ? `${mate.overlapBashoCount} basho` : `${mate.overlapBashoCount}場所`}</span>
                        <strong>{mate.shikona}</strong>
                        <p>
                          {mate.rankLabel} / {mate.recordLabel}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className={styles.groupEmpty}>{locale === "en" ? "No strongly overlapping stablemate was recorded." : "同部屋で強く重なった力士は記録されていません。"}</div>
              )}

              {learnedTraits.length > 0 ? (
                <div className={styles.infoPanel}>
                  <ModuleHeader kicker={locale === "en" ? "Learned" : "習得"} title={locale === "en" ? "Traits" : "特性"} size="sm" density="compact" />
                  <div className={styles.traitGrid}>
                    {learnedTraits.slice(0, 8).map((entry) => (
                      <div
                        key={`${entry.trait}-${entry.learnedAtBashoSeq ?? "legacy"}`}
                        className={styles.traitCard}
                      >
                        <strong>{locale === "en" ? humanizeCode(entry.trait) : entry.data?.name ?? entry.trait}</strong>
                        <span>
                          {locale === "en"
                            ? TRAIT_CATEGORY_EN_LABELS[entry.data?.category ?? ""] ?? "Trait"
                            : TRAIT_CATEGORY_LABELS[entry.data?.category ?? ""] ?? "特性"} /{" "}
                          {locale === "en"
                            ? entry.legacy
                              ? "Legacy career"
                              : entry.learnedAtBashoSeq
                                ? `Basho ${entry.learnedAtBashoSeq}`
                                : "Timing unknown"
                            : formatTraitAcquisitionLabel(entry)}
                        </span>
                        <p>{locale === "en" ? "Trait effect recorded." : entry.data?.description ?? entry.triggerDetail ?? "特性の説明は記録されていません。"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className={styles.groupEmpty}>{locale === "en" ? "No learned traits were recorded." : "習得済みの特性は記録されていません。"}</div>
              )}

              {traitAwakenings.length > 0 ? (
                <div className={styles.infoPanelWide}>
                  <ModuleHeader kicker={locale === "en" ? "Traits" : "特性"} title={locale === "en" ? "Trait Timeline" : "特性の推移"} size="sm" density="compact" />
                  <TraitTimeline traitAwakenings={traitAwakenings} totalBasho={totalBashoForTimeline} />
                </div>
              ) : null}
            </div>
          </details>

          {(ledgerPoints && ledgerPoints.length > 4) || bodyTimeline.length > 4 ? (
            <details className={styles.infoGroup}>
              <summary className={styles.infoGroupSummary}>
                <span>{locale === "en" ? "Metric Trends" : "数値の推移"}</span>
                <em>{locale === "en" ? "Win rate and body weight support charts" : "勝率と体重の補助グラフ"}</em>
              </summary>
              <div className={styles.infoGroupBody}>
                <div className={styles.infoPanelWide}>
                  <div className={styles.chartGrid}>
                    {ledgerPoints && ledgerPoints.length > 4 ? <WinRateTrendChart points={ledgerPoints} /> : null}
                    {bodyTimeline.length > 4 ? (
                      <BodyWeightChart
                        bodyTimeline={bodyTimeline}
                        entryWeight={entryWeight}
                        peakWeight={peakWeight}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </details>
          ) : null}
        </div>
      </BracketFrame>

      {import.meta.env.DEV ? (
        <BracketFrame variant="data" padding="default">
          <ModuleHeader
            kicker={locale === "en" ? "Dev Check" : "開発検証"}
            title={locale === "en" ? "Verification Panel" : "検証欄"}
            copy={locale === "en" ? "Developer-only checks are kept separate from the normal reading flow." : "通常の読解画面から分離した開発確認用の領域です。"}
            led="warn"
          />
          <div className={styles.devGrid}>
            <div className={styles.observationPanel} data-tone={stanceAnalysis.tone}>
              <span>{textForLocale(locale, stanceAnalysis.stanceLabel, "Observation Stance")}</span>
              <strong>{textForLocale(locale, stanceAnalysis.verdict, "Observation verdict recorded")}</strong>
              <em>{stanceAnalysis.score}</em>
              {stanceAnalysis.reasonLines.map((line) => (
                <p key={line}>{textForLocale(locale, line, "A stance-specific reason is recorded.")}</p>
              ))}
              <span className="sr-only">
                <Swords />
                <Trophy />
              </span>
            </div>
            <div className={styles.limitList}>
              {RELEASE_KNOWN_LIMITATIONS.map((limitation) => (
                <span key={limitation}>{textForLocale(locale, limitation, "Known limitation recorded")}</span>
              ))}
            </div>
          </div>
        </BracketFrame>
      ) : null}
    </section>
  );
};
