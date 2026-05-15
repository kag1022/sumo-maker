import React from "react";
import {
  BarChart3,
  BookOpenText,
  Landmark,
  Sparkles,
  Star,
  Swords,
  Trophy,
  UserRound,
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
  TelemetryGrid,
  TelemetryGridCell,
  TelemetryModule,
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

const formatRecordText = (wins: number, losses: number, absent: number): string =>
  `${wins}勝${losses}敗${absent > 0 ? `${absent}休` : ""}`;

const formatWinRate = (wins: number, losses: number): string => {
  const total = wins + losses;
  if (total <= 0) return "-";
  return `${((wins / total) * 100).toFixed(1)}%`;
};

const toBodyTypeLabel = (raw: string | undefined, fallback: RikishiStatus["bodyType"]): string => {
  if (raw && BODY_LABELS[raw as keyof typeof BODY_LABELS]) return BODY_LABELS[raw as keyof typeof BODY_LABELS];
  if (raw && raw.length > 0) return raw;
  return BODY_LABELS[fallback];
};

const resolveRetirementReason = (status: RikishiStatus): string | null => {
  const event = [...status.history.events].reverse().find((entry) => entry.type === "RETIREMENT");
  if (!event) return null;
  return event.description.replace(/^引退 \(/, "").replace(/\)$/, "") || null;
};

const toCoverReadingLine = (
  designReading: CareerDesignReadingModel,
  initial: NonNullable<RikishiStatus["buildSummary"]>["initialConditionSummary"] | undefined,
): string => {
  const expectation = designReading.premiseRows.find((row) => row.label === "期待")?.interpreted;
  if (expectation) return expectation;
  const firstInterpretation = designReading.interpretationRows[0]?.interpreted;
  if (firstInterpretation) return firstInterpretation;
  const entryLine = [initial?.entryPathLabel, initial?.temperamentLabel, initial?.bodySeedLabel]
    .filter(Boolean)
    .join("、");
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
  const retirementReason = React.useMemo(() => resolveRetirementReason(status), [status]);
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
  const careerMilestones = React.useMemo(() => buildCareerMilestones(ledgerPoints), [ledgerPoints]);
  const bodyTimeline = status.history.bodyTimeline ?? [];
  const entryWeight = bodyTimeline.length > 0 ? bodyTimeline[0].weightKg : undefined;
  const peakWeight = bodyTimeline.length > 0 ? Math.max(...bodyTimeline.map((b) => b.weightKg)) : undefined;
  const traitAwakenings = status.history.traitAwakenings ?? [];
  const totalBashoForTimeline = status.history.records.filter((r) => r.rank.division !== "Maezumo").length;
  const nonMaezumoRecords = status.history.records.filter((record) => record.rank.division !== "Maezumo");
  const makuuchiBasho = nonMaezumoRecords.filter((record) => record.rank.division === "Makuuchi").length;
  const yushoCount = status.history.yushoCount;
  const coverReadingLine = React.useMemo(() => toCoverReadingLine(designReading, initial), [designReading, initial]);
  const coverSummaryLine = narrative?.careerIdentity ?? narrative?.retirementDigest ?? overview.lifeSummary;

  const detailReady = detailState === "ready";
  const saveProgressLabel = `${detailBuildProgress?.flushedBashoCount ?? 0}/${detailBuildProgress?.totalBashoCount ?? status.history.records.length}`;

  const memoLines = React.useMemo(
    () =>
      [
        narrative?.initialConditions,
        narrative?.careerIdentity,
        narrative?.growthArc,
        narrative?.retirementDigest,
      ]
        .filter((line): line is string => Boolean(line))
        .slice(0, 4),
    [
      narrative?.careerIdentity,
      narrative?.growthArc,
      narrative?.initialConditions,
      narrative?.retirementDigest,
    ],
  );

  const profileRows: DataSheetRow[] = React.useMemo(
    () =>
      [
        { label: "出身", value: initial?.birthplace ?? status.profile.birthplace },
        { label: "所属", value: stableEnvironment.stableName },
        {
          label: "入門",
          value: `${initial?.entryAge ?? status.entryAge}歳 / ${initial?.entryPathLabel ?? "経路未詳"}`,
        },
        { label: "気質", value: initial?.temperamentLabel ?? status.profile.personality },
        { label: "体型", value: toBodyTypeLabel(growth?.bodyTypeLabel, status.bodyType) },
        {
          label: "晩年体格",
          value: `${Math.round(status.bodyMetrics.heightCm)}cm / ${Math.round(status.bodyMetrics.weightKg)}kg`,
        },
        retirementReason ? { label: "終幕", value: retirementReason } : null,
      ].filter((row): row is DataSheetRow => Boolean(row)),
    [
      growth?.bodyTypeLabel,
      initial,
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

  const recordRows: DataSheetRow[] = React.useMemo(
    () =>
      [
        {
          label: "通算成績",
          value: formatRecordText(
            status.history.totalWins,
            status.history.totalLosses,
            status.history.totalAbsent,
          ),
        },
        { label: "通算勝率", value: formatWinRate(status.history.totalWins, status.history.totalLosses) },
        { label: "最高位", value: highestRankLabel },
        { label: "在位場所", value: `${nonMaezumoRecords.length}場所` },
        { label: "幕内在位", value: `${makuuchiBasho}場所` },
        { label: "幕内優勝", value: `${yushoCount.makuuchi}回` },
        { label: "十両優勝", value: `${yushoCount.juryo ?? 0}回` },
        { label: "幕下優勝", value: `${yushoCount.makushita ?? 0}回` },
        { label: "下位優勝", value: `${yushoCount.others ?? 0}回` },
        { label: "三賞", value: `${totalSansho}回` },
        { label: "金星", value: `${kinboshi}個` },
      ],
    [
      highestRankLabel,
      kinboshi,
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
          <span className={styles.crossModeLabel}>番付推移を見る</span>
          <span className={styles.crossModeDesc}>上昇、停滞、陥落、復帰の流れを読む</span>
        </button>
        <button type="button" className={styles.crossModeButton} onClick={() => onOpenChapter("place")}>
          <BookOpenText className="h-4 w-4" />
          <span className={styles.crossModeLabel}>場所別記録を見る</span>
          <span className={styles.crossModeDesc}>番付表、取組、周辺力士の詳細</span>
        </button>
      </BracketFrame>

      <TelemetryGrid>
        <TelemetryGridCell tone="story">
          <TelemetryModule title="人物像" tone="story">
            <CopyStack lines={memoLines.length > 0 ? memoLines : [overview.lifeSummary]} />
          </TelemetryModule>
        </TelemetryGridCell>
        <TelemetryGridCell tone="style">
          <TelemetryModule title="取り口" tone="style">
            <DataSheet
              rows={[
                { label: "得意な型", value: strengthLabel },
                { label: "苦手な型", value: weaknessLabel },
                {
                  label: "代表技",
                  value:
                    signatureSummary.selectedMoves.length > 0
                      ? signatureSummary.selectedMoves.join(" / ")
                      : "記録なし",
                },
              ]}
            />
            {rareKimariteEncounters.length > 0 ? (
              <ChipList
                items={rareKimariteEncounters.map((encounter) => ({
                  key: encounter.kimariteId,
                  label: `${encounter.name} / ${encounter.count}回`,
                }))}
              />
            ) : null}
          </TelemetryModule>
        </TelemetryGridCell>
        <TelemetryGridCell tone="stable">
          <TelemetryModule title="所属部屋" tone="stable">
            <Lead>{stableEnvironment.lead}</Lead>
            <DataSheet
              rows={[
                { label: "所属部屋", value: stableEnvironment.stableName },
                { label: "一門", value: stableEnvironment.ichimonName },
                { label: "部屋系統", value: stableEnvironment.archetypeName },
                { label: "規模", value: stableEnvironment.scaleLabel },
              ]}
            />
          </TelemetryModule>
        </TelemetryGridCell>
        <TelemetryGridCell tone="record">
          <TelemetryModule title="主な実績" tone="record">
            <DataSheet rows={recordRows} />
          </TelemetryModule>
        </TelemetryGridCell>
      </TelemetryGrid>

      <EventLog milestones={careerMilestones} />

      <BracketFrame variant="module" padding="default">
        <ModuleHeader
          kicker="詳細分析"
          title="記録の根拠"
          copy="力士名鑑で全体像を掴み、ここで根拠を確認します。詳しい時系列は番付推移と場所別記録で読みます。"
        />
        <div className={styles.analysisGrid}>
          <div className={styles.analysisPanel}>
            <ModuleHeader
              kicker="基本情報"
              title="プロフィール"
              size="sm"
              density="compact"
            />
            <DataSheet rows={profileRows} layout="grid" mono />
            <span className="sr-only">
              <UserRound />
            </span>
          </div>

          {designRows.length > 0 ? (
            <div className={styles.analysisPanel}>
              <ModuleHeader
                kicker="入門時"
                title="入門時の条件"
                size="sm"
                density="compact"
              />
              <div className={styles.designTable}>
                {designRows.map((row) => (
                  <div key={`${row.label}-${row.designed}`} className={styles.designRow}>
                    <span>{row.label}</span>
                    <p>{row.interpreted}</p>
                    <strong>{row.realized}</strong>
                  </div>
                ))}
              </div>
              <span className="sr-only">
                <Star />
              </span>
            </div>
          ) : null}

          {stablemates.length > 0 ? (
            <div className={styles.analysisPanel}>
              <ModuleHeader
                kicker="同部屋"
                title="同部屋の主な力士"
                size="sm"
                density="compact"
              />
              <div className={styles.stablemateGrid}>
                {stablemates.map((mate) => (
                  <div
                    key={mate.entityId}
                    className={styles.stablemateCard}
                    data-relation={mate.relation}
                  >
                    <span>{mate.relationLabel} / {mate.overlapBashoCount}場所</span>
                    <strong>{mate.shikona}</strong>
                    <p>
                      {mate.rankLabel} / {mate.recordLabel}
                    </p>
                  </div>
                ))}
              </div>
              <span className="sr-only">
                <Landmark />
              </span>
            </div>
          ) : null}

          {learnedTraits.length > 0 ? (
            <div className={styles.analysisPanel}>
              <ModuleHeader
                kicker="習得"
                title="特性"
                size="sm"
                density="compact"
              />
              <div className={styles.traitGrid}>
                {learnedTraits.slice(0, 8).map((entry) => (
                  <div
                    key={`${entry.trait}-${entry.learnedAtBashoSeq ?? "legacy"}`}
                    className={styles.traitCard}
                  >
                    <strong>{entry.data?.name ?? entry.trait}</strong>
                    <span>
                      {TRAIT_CATEGORY_LABELS[entry.data?.category ?? ""] ?? "特性"} /{" "}
                      {formatTraitAcquisitionLabel(entry)}
                    </span>
                    <p>{entry.data?.description ?? entry.triggerDetail ?? "特性の説明は記録されていません。"}</p>
                  </div>
                ))}
              </div>
              <span className="sr-only">
                <Sparkles />
              </span>
            </div>
          ) : null}
        </div>
      </BracketFrame>

      {(ledgerPoints && ledgerPoints.length > 4) || bodyTimeline.length > 4 ? (
        <BracketFrame variant="module" padding="default">
          <ModuleHeader
            kicker="推移グラフ"
            title="数値の補助線"
            copy="数値は記録を読むための補助に留めます。"
          />
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
        </BracketFrame>
      ) : null}

      {traitAwakenings.length > 0 ? (
        <BracketFrame variant="module" padding="default">
          <ModuleHeader
            kicker="特性"
            title="特性の推移"
            copy="特性が発現した場所と契機を時系列で読み直します。"
          />
          <TraitTimeline traitAwakenings={traitAwakenings} totalBasho={totalBashoForTimeline} />
        </BracketFrame>
      ) : null}

      {import.meta.env.DEV ? (
        <BracketFrame variant="data" padding="default">
          <ModuleHeader
            kicker="開発検証"
            title="検証欄"
            copy="通常の読解画面から分離した開発確認用の領域です。"
            led="warn"
          />
          <div className={styles.devGrid}>
            <div className={styles.observationPanel} data-tone={stanceAnalysis.tone}>
              <span>{stanceAnalysis.stanceLabel}</span>
              <strong>{stanceAnalysis.verdict}</strong>
              <em>{stanceAnalysis.score}</em>
              {stanceAnalysis.reasonLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <span className="sr-only">
                <Swords />
                <Trophy />
              </span>
            </div>
            <div className={styles.limitList}>
              {RELEASE_KNOWN_LIMITATIONS.map((limitation) => (
                <span key={limitation}>{limitation}</span>
              ))}
            </div>
          </div>
        </BracketFrame>
      ) : null}
    </section>
  );
};
