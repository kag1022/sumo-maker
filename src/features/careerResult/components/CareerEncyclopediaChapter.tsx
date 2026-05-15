import React from "react";
import {
  Archive,
  BarChart3,
  BookOpenText,
  Check,
  Copy,
  ExternalLink,
  Landmark,
  Save,
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
  AUTO_TAG_LABELS,
  MANUAL_SAVE_TAG_LABELS,
  buildCareerAnalysisSummary,
  buildCareerStanceAnalysis,
} from "../../../logic/career/analysis";
import { buildCareerClearScoreSummary, type CareerClearScoreSummary } from "../../../logic/career/clearScore";
import {
  ensureStyleIdentityProfile,
  resolveDisplayedStrengthStyles,
  resolveDisplayedWeakStyles,
  resolveStyleLabelsOrFallback,
} from "../../../logic/style/identity";
import { summarizeRareKimariteEncounters } from "../../../logic/kimarite/rareEncounters";
import { summarizeSignatureKimarite } from "../../../logic/kimarite/signature";
import { formatHighestRankDisplayName } from "../../../logic/ranking";
import { TRAIT_CATEGORY_LABELS, formatTraitAcquisitionLabel } from "../../../logic/traits";
import { buildStableEnvironmentReading } from "../../../logic/simulation/heya/stableEnvironment";
import { buildStablemateSummaries } from "../../shared/utils/stablemateReading";
import { Button } from "../../../shared/ui/Button";
import { RikishiPortrait } from "../../../shared/ui/RikishiPortrait";
import { RankBadge } from "../../../shared/ui/RankBadge";
import type { CareerDesignReadingModel, CareerLedgerPoint, CareerOverviewModel, CareerRankScaleLayoutBand } from "../utils/careerResultModel";
import { CAREER_RANK_SCALE_BANDS, getCareerRankScalePosition } from "../utils/careerResultModel";
import { FEEDBACK_FORM_URL, RELEASE_KNOWN_LIMITATIONS } from "../utils/releaseFeedback";
import type { DetailBuildProgress } from "../../../logic/simulation/workerProtocol";
import { WinRateTrendChart } from "./WinRateTrendChart";
import { BodyWeightChart } from "./BodyWeightChart";
import { TraitTimeline } from "./TraitTimeline";
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

type CareerMilestoneTone = "start" | "rise" | "peak" | "honor" | "injury" | "return" | "end";

const CAREER_MILESTONE_LIMIT = 10;
const PINNED_MILESTONE_LABELS = new Set(["初土俵", "初勝ち越し", "最高位", "引退前最後"]);
const PROMOTION_MILESTONE_LABELS = new Set(["新十両", "再十両", "新入幕", "再入幕", "新小結", "再小結", "新関脇", "再関脇", "新大関", "再大関", "横綱昇進"]);

interface CareerMilestoneView {
  key: string;
  label: string;
  bashoLabel: string;
  rankLabel: string;
  recordLabel: string;
  description: string;
  tone: CareerMilestoneTone;
  bashoSeq: number;
  order: number;
  priority: number;
}

const BODY_LABELS: Record<RikishiStatus["bodyType"], string> = {
  NORMAL: "均整型",
  SOPPU: "ソップ型",
  ANKO: "アンコ型",
  MUSCULAR: "筋骨型",
};

const SAVE_TAGS: CareerSaveTag[] = [
  "GREAT_RIKISHI",
  "UNFINISHED_TALENT",
  "LATE_BLOOM_SUCCESS",
  "INJURY_TRAGEDY",
  "TURBULENT_LIFE",
  "STABLE_MAKUUCHI",
  "JURYO_CRAFTSMAN",
  "GENERATION_LEADER",
  "RIVALRY_MEMORY",
  "RARE_RECORD",
  "RESEARCH_SAMPLE",
  "FAVORITE",
];

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
  const entryLine = [
    initial?.entryPathLabel,
    initial?.temperamentLabel,
    initial?.bodySeedLabel,
  ].filter(Boolean).join("、");
  return entryLine ? `${entryLine}として入口条件を読む。` : "入口条件と実結果の差を、番付推移と場所別記録から読む。";
};

const toMilestoneTone = (label: string, point: CareerLedgerPoint): CareerMilestoneTone => {
  if (label === "初土俵") return "start";
  if (label === "最高位") return "peak";
  if (label.includes("優勝")) return "honor";
  if (label.includes("休場")) return "injury";
  if (label.includes("復帰") || label.startsWith("再")) return "return";
  if (label.includes("最後")) return "end";
  if (point.deltaValue > 0 || label.startsWith("新") || label.includes("勝ち越し")) return "rise";
  return "start";
};

const getMilestonePriority = (label: string): number => {
  if (label === "初土俵") return 0;
  if (label === "引退前最後") return 1;
  if (label === "最高位") return 2;
  if (PROMOTION_MILESTONE_LABELS.has(label)) return 3;
  if (label === "初勝ち越し") return 4;
  if (label.includes("優勝")) return 5;
  if (label.includes("復帰") || label.startsWith("再")) return 6;
  if (label.includes("休場") || label === "全休") return 7;
  return 8;
};

const selectCareerMilestones = (items: CareerMilestoneView[]): CareerMilestoneView[] => {
  const sorted = items.sort((a, b) => a.bashoSeq - b.bashoSeq || a.order - b.order);
  const unique = sorted.filter((item, index, current) =>
    index === 0 ||
    item.label !== current[index - 1].label ||
    item.bashoSeq !== current[index - 1].bashoSeq,
  );
  if (unique.length <= CAREER_MILESTONE_LIMIT) return unique;

  const selected = new Map<string, CareerMilestoneView>();
  const add = (item: CareerMilestoneView | undefined) => {
    if (item) selected.set(item.key, item);
  };

  for (const label of PINNED_MILESTONE_LABELS) add(unique.find((item) => item.label === label));
  for (const label of PROMOTION_MILESTONE_LABELS) add(unique.find((item) => item.label === label));
  add(unique.find((item) => item.label.includes("優勝")));
  add(unique.find((item) => item.label.includes("休場") || item.label === "全休"));
  add(unique.find((item) => item.label.includes("復帰") || item.label.startsWith("再")));

  unique
    .filter((item) => !selected.has(item.key))
    .sort((a, b) => a.priority - b.priority || a.bashoSeq - b.bashoSeq || a.order - b.order)
    .slice(0, Math.max(0, CAREER_MILESTONE_LIMIT - selected.size))
    .forEach(add);

  return [...selected.values()].sort((a, b) => a.bashoSeq - b.bashoSeq || a.order - b.order);
};

const buildCareerMilestones = (points: CareerLedgerPoint[] | undefined): CareerMilestoneView[] => {
  if (!points?.length) return [];

  const items: CareerMilestoneView[] = [];
  const used = new Set<string>();
  const push = (point: CareerLedgerPoint, label: string, description: string, order: number, displayRankLabel = point.rankLabel) => {
    const key = `${point.bashoSeq}-${label}`;
    if (used.has(key)) return;
    used.add(key);
    items.push({
      key,
      label,
      bashoLabel: point.bashoLabel,
      rankLabel: displayRankLabel,
      recordLabel: point.recordLabel,
      description,
      tone: toMilestoneTone(label, point),
      bashoSeq: point.bashoSeq,
      order,
      priority: getMilestonePriority(label),
    });
  };

  const firstPoint = points[0];
  push(firstPoint, "初土俵", `${firstPoint.rankLabel}で記録が始まる。`, 0);

  const firstKachikoshi = points.find((point) => point.wins > point.losses);
  if (firstKachikoshi) push(firstKachikoshi, "初勝ち越し", `${firstKachikoshi.recordLabel}で白星が先行した。`, 10);

  let sawAbsence = false;
  for (const point of points) {
    for (const tag of point.milestoneTags) {
      const label = tag === "最高位到達" ? "最高位" : tag;
      const rankLabel = label === "最高位" ? formatHighestRankDisplayName(point.rank) : point.rankLabel;
      push(point, label, `${rankLabel} / ${point.recordLabel}`, 20, rankLabel);
    }
    if (point.eventFlags.includes("yusho")) push(point, "優勝", `${point.rankLabel}で${point.recordLabel}。`, 30);
    if (point.eventFlags.includes("absent")) {
      sawAbsence = true;
      push(point, point.isFullAbsence ? "全休" : "休場", `${point.absent}休を記録。`, 40);
    } else if (sawAbsence) {
      sawAbsence = false;
      push(point, "復帰", `${point.rankLabel}で土俵へ戻る。`, 45);
    }
  }

  const lastPoint = points[points.length - 1];
  push(lastPoint, "引退前最後", `${lastPoint.rankLabel} / ${lastPoint.recordLabel}`, 90);

  return selectCareerMilestones(items);
};

const SectionHeading: React.FC<{ eyebrow: string; title: string; copy?: string }> = ({ eyebrow, title, copy }) => (
  <div className={styles.sectionHead}>
    <div>
      <div className={styles.eyebrow}>{eyebrow}</div>
      <h2>{title}</h2>
    </div>
    {copy ? <p>{copy}</p> : null}
  </div>
);

const DataGrid: React.FC<{ rows: Array<{ label: string; value: string }> }> = ({ rows }) => (
  <div className={styles.dataGrid}>
    {rows.map((row) => (
      <div key={row.label} className={styles.dataCell}>
        <span>{row.label}</span>
        <strong>{row.value}</strong>
      </div>
    ))}
  </div>
);

const buildMiniRankScaleLayout = (
  points: CareerLedgerPoint[],
  plotHeight: number,
): CareerRankScaleLayoutBand[] => {
  const observedValues = points.map((point) => point.rankValue);
  const highestValue = Math.min(...observedValues);
  const lowestValue = Math.max(...observedValues);
  const firstBandIndex = CAREER_RANK_SCALE_BANDS.findIndex((band) => highestValue >= band.min && highestValue <= band.max);
  const lastBandIndex = CAREER_RANK_SCALE_BANDS.findIndex((band) => lowestValue >= band.min && lowestValue <= band.max);
  const from = Math.max(0, (firstBandIndex < 0 ? 0 : firstBandIndex) - 1);
  const to = Math.min(
    CAREER_RANK_SCALE_BANDS.length - 1,
    (lastBandIndex < 0 ? CAREER_RANK_SCALE_BANDS.length - 1 : lastBandIndex) + 1,
  );
  const visibleBands = CAREER_RANK_SCALE_BANDS.slice(from, to + 1);
  const totalWeight = visibleBands.reduce((sum, band) => sum + band.weight, 0);
  let cursor = 0;
  return visibleBands.map((band) => {
    const height = (band.weight / totalWeight) * plotHeight;
    const result = {
      ...band,
      y: cursor,
      height,
    };
    cursor += height;
    return result;
  });
};

const MiniTrajectory: React.FC<{ points: CareerLedgerPoint[] | undefined }> = ({ points }) => {
  if (!points || points.length < 2) {
    return <div className={styles.sparkEmpty}>番付推移は詳細整理後に表示されます。</div>;
  }
  const width = 560;
  const height = 176;
  const padding = { top: 8, right: 18, bottom: 24, left: 58 };
  const plotHeight = height - padding.top - padding.bottom;
  const plotWidth = width - padding.left - padding.right;
  const bandLayout = buildMiniRankScaleLayout(points, plotHeight);
  const toPointPosition = (point: CareerLedgerPoint, index: number) => {
    const rankPosition = getCareerRankScalePosition(point.rankValue, bandLayout);
    return {
      x: padding.left + (index / Math.max(1, points.length - 1)) * plotWidth,
      y: padding.top + rankPosition.y,
    };
  };
  const path = points.map((point, index) => {
    const { x, y } = toPointPosition(point, index);
    return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  const peak = points.reduce((best, point) => (point.rankValue < best.rankValue ? point : best), points[0]);
  const peakIndex = points.findIndex((point) => point.bashoSeq === peak.bashoSeq);
  const peakPosition = toPointPosition(peak, peakIndex);
  const firstPosition = toPointPosition(points[0], 0);
  const lastPosition = toPointPosition(points[points.length - 1], points.length - 1);
  const peakLabelX = Math.min(width - 58, Math.max(padding.left + 16, peakPosition.x + 12));
  const peakLabelY = peakPosition.y < padding.top + 24
    ? peakPosition.y + 22
    : Math.max(padding.top + 16, peakPosition.y - 10);

  return (
    <svg className={styles.sparkline} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="階級帯上の番付推移要約">
      {bandLayout.map((band) => (
        <g key={`mini-band-${band.key}`}>
          <rect
            x={padding.left}
            y={padding.top + band.y}
            width={plotWidth}
            height={band.height}
            className={styles.sparkBand}
            data-band={band.key}
          />
          <text x={padding.left - 8} y={padding.top + band.y + band.height / 2 + 4} className={styles.sparkBandLabel}>
            {band.label}
          </text>
        </g>
      ))}
      <path d={path} className={styles.sparkPathGhost} />
      <path d={path} className={styles.sparkPath} />
      <circle cx={firstPosition.x} cy={firstPosition.y} r="4" className={styles.sparkEndpoint} />
      <circle cx={lastPosition.x} cy={lastPosition.y} r="4" className={styles.sparkEndpoint} />
      <circle cx={peakPosition.x} cy={peakPosition.y} r="6" className={styles.sparkPeak} />
      <text x={peakLabelX} y={peakLabelY} className={styles.sparkLabel}>最高位</text>
      <text x={firstPosition.x} y={height - 6} className={styles.sparkAxisLabel} textAnchor="middle">初土俵</text>
      <text x={lastPosition.x} y={height - 6} className={styles.sparkAxisLabel} textAnchor="middle">終幕</text>
    </svg>
  );
};

const ClearScoreBreakdown: React.FC<{ summary: CareerClearScoreSummary }> = ({ summary }) => (
  <section className={styles.clearScorePanel} aria-label="総評点の内訳">
    <div className={styles.clearScoreHead}>
      <div>
        <span>総評点</span>
        <p>保存後の記録帳で並び替えに使う評価点です。</p>
      </div>
      <strong>{summary.clearScore}</strong>
    </div>
    <div className={styles.clearScoreRows}>
      {summary.categories.map((category) => {
        const percent = Math.round((category.score / category.maxScore) * 100);
        const detail = category.items.slice(0, 2).map((item) => item.detail).join(" / ") || category.detail;
        return (
          <article key={category.key} className={styles.clearScoreRow}>
            <div className={styles.clearScoreRowTop}>
              <span>{category.label}</span>
              <strong>+{category.score}</strong>
            </div>
            <p>{detail}</p>
            <div className={styles.clearScoreMeter} aria-hidden="true">
              <span style={{ width: `${Math.min(100, percent)}%` }} />
            </div>
          </article>
        );
      })}
    </div>
  </section>
);

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
  const [selectedSaveTags, setSelectedSaveTags] = React.useState<CareerSaveTag[]>([]);
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "error">("idle");
  const [copyState, setCopyState] = React.useState<"idle" | "copied" | "error">("idle");
  const analysis = React.useMemo(() => buildCareerAnalysisSummary(status), [status]);
  const clearScoreSummary = React.useMemo(() => buildCareerClearScoreSummary(status), [status]);
  const stanceAnalysis = React.useMemo(
    () => buildCareerStanceAnalysis(analysis, observationStanceId),
    [analysis, observationStanceId],
  );
  React.useEffect(() => {
    setSelectedSaveTags(analysis.saveRecommendation.suggestedManualTags.slice(0, 3));
  }, [analysis.saveRecommendation.suggestedManualTags]);

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
  const saveDisabled = detailState !== "ready";
  const saveProgress = `${detailBuildProgress?.flushedBashoCount ?? 0}/${detailBuildProgress?.totalBashoCount ?? status.history.records.length}`;
  const saveCopy = saveDisabled
    ? `詳細記録を整理中 ${saveProgress}。保存判断は読めますが、保存操作は整理完了後に開きます。`
    : `分類「${analysis.classificationLabel}」。保存推奨 ${analysis.saveRecommendation.score}点、珍記録度 ${analysis.saveRecommendation.rarityScore}点。`;
  const memoLines = React.useMemo(
    () =>
      [
        narrative?.initialConditions,
        narrative?.careerIdentity,
        narrative?.growthArc,
        narrative?.retirementDigest,
      ].filter((line): line is string => Boolean(line)).slice(0, 4),
    [narrative?.careerIdentity, narrative?.growthArc, narrative?.initialConditions, narrative?.retirementDigest],
  );

  const profileRows = React.useMemo(
    () =>
      [
        { label: "出身", value: initial?.birthplace ?? status.profile.birthplace },
        { label: "所属", value: stableEnvironment.stableName },
        { label: "入門", value: `${initial?.entryAge ?? status.entryAge}歳 / ${initial?.entryPathLabel ?? "経路未詳"}` },
        { label: "気質", value: initial?.temperamentLabel ?? status.profile.personality },
        { label: "体型", value: toBodyTypeLabel(growth?.bodyTypeLabel, status.bodyType) },
        { label: "晩年体格", value: `${Math.round(status.bodyMetrics.heightCm)}cm / ${Math.round(status.bodyMetrics.weightKg)}kg` },
        retirementReason ? { label: "終幕", value: retirementReason } : null,
      ].filter((row): row is { label: string; value: string } => Boolean(row)),
    [growth?.bodyTypeLabel, initial, retirementReason, stableEnvironment.stableName, status.bodyMetrics.heightCm, status.bodyMetrics.weightKg, status.bodyType, status.entryAge, status.profile.birthplace, status.profile.personality],
  );

  const recordRows = React.useMemo(
    () =>
      [
        { label: "通算成績", value: formatRecordText(status.history.totalWins, status.history.totalLosses, status.history.totalAbsent) },
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
    [highestRankLabel, kinboshi, makuuchiBasho, nonMaezumoRecords.length, status.history.totalAbsent, status.history.totalLosses, status.history.totalWins, totalSansho, yushoCount.juryo, yushoCount.makushita, yushoCount.makuuchi, yushoCount.others],
  );

  const designRows = (designReading.premiseRows.length > 0 ? designReading.premiseRows : designReading.interpretationRows).slice(0, 5);

  const toggleSaveTag = React.useCallback((tag: CareerSaveTag) => {
    setSelectedSaveTags((current) =>
      current.includes(tag)
        ? current.filter((entry) => entry !== tag)
        : [...current, tag],
    );
  }, []);
  const handleSave = React.useCallback(async () => {
    if (saveDisabled || saveState === "saving") return;
    setSaveState("saving");
    try {
      await onSave({ saveTags: selectedSaveTags });
      setSaveState("idle");
    } catch {
      setSaveState("error");
    }
  }, [onSave, saveDisabled, saveState, selectedSaveTags]);
  const handleCopyReport = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(designReading.feedbackReportText);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("error");
    }
  }, [designReading.feedbackReportText]);

  return (
    <section className={styles.shell}>
      <div className={styles.resultDesk}>
        <aside className={styles.identityPanel}>
          <div className={styles.portraitStage}>
            <RikishiPortrait
              bodyType={status.bodyType}
              bodyMetrics={status.bodyMetrics}
              rank={status.history.maxRank}
              className={styles.portrait}
              innerClassName={styles.portraitInner}
              presentation="blend"
            />
          </div>
          <div className={styles.identityStack}>
            <div className={styles.rankSeal}>
              <span>最高位</span>
              <strong>{highestRankLabel}</strong>
            </div>
            <DataGrid rows={profileRows} />
          </div>
        </aside>

        <main className={styles.outcomePanel}>
          <div className={styles.titleBlock}>
            <div className={styles.eyebrow}>Rikishi Dossier</div>
            <h1>{status.shikona}</h1>
            <div className={styles.rankLine}>
              <RankBadge division={status.history.maxRank.division} name={highestRankLabel} size="sm" />
              <span>{initial?.birthplace ?? overview.birthplace} / {stableEnvironment.stableName}</span>
            </div>
            <p className={styles.statement}>{coverSummaryLine}</p>
            <div className={styles.readingLine}>
              <span>入口条件</span>
              <strong>{coverReadingLine}</strong>
            </div>
          </div>

          <div className={styles.kpiGrid}>
            <article>
              <span>通算</span>
              <strong>{overview.totalRecordLabel}</strong>
            </article>
            <article>
              <span>勝率</span>
              <strong>{overview.winRateLabel}</strong>
            </article>
            <article>
              <span>在位</span>
              <strong>{overview.careerPeriodLabel}</strong>
            </article>
            <article>
              <span>観測点</span>
              <strong>{observationPointsAwarded ?? 0}</strong>
            </article>
          </div>

          <div className={styles.trajectoryPreview}>
            <div className={styles.previewHead}>
              <div>
                <span className={styles.eyebrow}>Career Arc</span>
                <h3>階級帯で見る番付人生</h3>
                <p className={styles.previewCopy}>横方向は時間、線は場所ごとの在位階級を表します。</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => onOpenChapter("trajectory")}>
                <BarChart3 className="mr-2 h-4 w-4" />
                番付推移へ
              </Button>
            </div>
            <MiniTrajectory points={ledgerPoints} />
          </div>
        </main>

        <aside className={styles.decisionPanel}>
          {!isSaved ? (
            <>
              <div className={styles.decisionScore}>
                <span>保存推奨</span>
                <strong>{analysis.saveRecommendation.score}</strong>
                <em>{analysis.classificationLabel}</em>
              </div>
              <p className={styles.decisionCopy}>{saveCopy}</p>
              <ClearScoreBreakdown summary={clearScoreSummary} />
              <div className={styles.reasonList}>
                {analysis.saveRecommendation.reasons.slice(0, 4).map((reason) => (
                  <div key={reason}>{reason}</div>
                ))}
              </div>
              {analysis.saveRecommendation.autoTags.length > 0 ? (
                <div className={styles.tagCloud}>
                  {analysis.saveRecommendation.autoTags.map((tag) => (
                    <span key={tag} className={styles.autoTag}>{AUTO_TAG_LABELS[tag]}</span>
                  ))}
                </div>
              ) : null}
              <div className={styles.saveTags}>
                {SAVE_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={styles.saveTag}
                    data-active={selectedSaveTags.includes(tag)}
                    data-suggested={analysis.saveRecommendation.suggestedManualTags.includes(tag)}
                    onClick={() => toggleSaveTag(tag)}
                  >
                    {MANUAL_SAVE_TAG_LABELS[tag]}
                  </button>
                ))}
              </div>
              <div className={styles.commandStack}>
                <Button size="lg" disabled={saveDisabled || saveState === "saving"} onClick={() => void handleSave()}>
                  <Save className="mr-2 h-4 w-4" />
                  {saveDisabled ? "記録整理中" : saveState === "saving" ? "保存中" : "この人生を保存"}
                </Button>
                <Button variant="outline" onClick={onReturnToScout}>
                  保存せず次の観測へ
                </Button>
                {saveState === "error" ? <div className={styles.saveError}>保存に失敗しました。</div> : null}
              </div>
            </>
          ) : (
            <>
              <div className={styles.savedState}>
                <Check className="h-5 w-5" />
                <div>
                  <span>保存完了</span>
                  <strong>この一代は名鑑に残っています。</strong>
                </div>
              </div>
              <p className={styles.decisionCopy}>保存済み記録から再読、比較、類似検索に進めます。</p>
              <ClearScoreBreakdown summary={clearScoreSummary} />
              <div className={styles.commandStack}>
                <Button size="lg" onClick={onOpenArchive}>
                  <Archive className="mr-2 h-4 w-4" />
                  保存済み記録を開く
                </Button>
                <Button variant="outline" onClick={onReturnToScout}>
                  次の観測へ
                </Button>
              </div>
            </>
          )}
          {import.meta.env.DEV ? (
            <div className={styles.devCommands}>
              <Button variant="secondary" size="sm" onClick={() => void handleCopyReport()}>
                <Copy className="mr-2 h-4 w-4" />
                {copyState === "copied" ? "コピー済み" : "検証情報"}
              </Button>
              <a href={FEEDBACK_FORM_URL} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                検証フォーム
              </a>
              {copyState === "error" ? <span>コピーに失敗しました。</span> : null}
            </div>
          ) : null}
        </aside>
      </div>

      <div className={styles.chapterJump}>
        <button type="button" onClick={() => onOpenChapter("trajectory")}>
          <BarChart3 className="h-4 w-4" />
          <span>番付推移を読む</span>
          <strong>上昇、停滞、陥落、復帰</strong>
        </button>
        <button type="button" onClick={() => onOpenChapter("place")}>
          <BookOpenText className="h-4 w-4" />
          <span>場所別を読む</span>
          <strong>番付表、取組、周辺力士</strong>
        </button>
      </div>

      <section className={styles.insightGrid}>
        <article className={styles.insightCard} data-tone="story">
          <div className={styles.cardHead}>
            <Sparkles className="h-4 w-4" />
            <h3>人物像</h3>
          </div>
          <div className={styles.copyStack}>
            {(memoLines.length > 0 ? memoLines : [overview.lifeSummary]).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </article>

        <article className={styles.insightCard} data-tone="style">
          <div className={styles.cardHead}>
            <Swords className="h-4 w-4" />
            <h3>取り口</h3>
          </div>
          <DataGrid
            rows={[
              { label: "得意な型", value: strengthLabel },
              { label: "苦手な型", value: weaknessLabel },
              { label: "代表技", value: signatureSummary.selectedMoves.length > 0 ? signatureSummary.selectedMoves.join(" / ") : "記録なし" },
            ]}
          />
          {rareKimariteEncounters.length > 0 ? (
            <div className={styles.rareList}>
              {rareKimariteEncounters.map((encounter) => (
                <span key={encounter.kimariteId}>{encounter.name} / {encounter.count}回</span>
              ))}
            </div>
          ) : null}
        </article>

        <article className={styles.insightCard} data-tone="stable">
          <div className={styles.cardHead}>
            <Landmark className="h-4 w-4" />
            <h3>所属部屋</h3>
          </div>
          <p className={styles.cardLead}>{stableEnvironment.lead}</p>
          <DataGrid
            rows={[
              { label: "所属部屋", value: stableEnvironment.stableName },
              { label: "一門", value: stableEnvironment.ichimonName },
              { label: "部屋系統", value: stableEnvironment.archetypeName },
              { label: "規模", value: stableEnvironment.scaleLabel },
            ]}
          />
        </article>

        <article className={styles.insightCard} data-tone="record">
          <div className={styles.cardHead}>
            <Trophy className="h-4 w-4" />
            <h3>主要実績</h3>
          </div>
          <DataGrid rows={recordRows} />
        </article>
      </section>

      {careerMilestones.length > 0 ? (
        <section className={styles.timelinePanel}>
          <SectionHeading
            eyebrow="Milestones"
            title="この一代の節目"
            copy="初土俵から終幕まで、主要な転機だけを一本の時間軸で読ませます。"
          />
          <div className={styles.timelineRail}>
            {careerMilestones.map((milestone) => (
              <article key={milestone.key} className={styles.timelineItem} data-tone={milestone.tone}>
                <div className={styles.timelineDate}>
                  <span>{milestone.bashoLabel}</span>
                  <em>{milestone.recordLabel}</em>
                </div>
                <div className={styles.timelineEvent}>
                  <strong>{milestone.label}</strong>
                  <em>{milestone.rankLabel}</em>
                </div>
                <p className={styles.timelineDescription}>{milestone.description}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.atlas}>
        <SectionHeading
          eyebrow="Database"
          title="読解データベース"
          copy="表紙で判断し、ここでは根拠を確認します。詳細な時系列は番付推移と場所別へ送ります。"
        />
        <div className={styles.atlasGrid}>
          <article className={styles.atlasPanel}>
            <div className={styles.cardHead}>
              <UserRound className="h-4 w-4" />
              <h3>基本帳面</h3>
            </div>
            <DataGrid rows={profileRows} />
          </article>

          {designRows.length > 0 ? (
            <article className={styles.atlasPanel}>
              <div className={styles.cardHead}>
                <Star className="h-4 w-4" />
                <h3>設計との差分</h3>
              </div>
              <div className={styles.designTable}>
                {designRows.map((row) => (
                  <div key={`${row.label}-${row.designed}`}>
                    <span>{row.label}</span>
                    <p>{row.interpreted}</p>
                    <strong>{row.realized}</strong>
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          {stablemates.length > 0 ? (
            <article className={styles.atlasPanel}>
              <div className={styles.cardHead}>
                <Landmark className="h-4 w-4" />
                <h3>同部屋の主な力士</h3>
              </div>
              <div className={styles.stablemateGrid}>
                {stablemates.map((mate) => (
                  <div key={mate.entityId} className={styles.stablemateCard} data-relation={mate.relation}>
                    <span>{mate.relationLabel} / {mate.overlapBashoCount}場所</span>
                    <strong>{mate.shikona}</strong>
                    <p>{mate.rankLabel} / {mate.recordLabel}</p>
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          {learnedTraits.length > 0 ? (
            <article className={styles.atlasPanel}>
              <div className={styles.cardHead}>
                <Sparkles className="h-4 w-4" />
                <h3>特性</h3>
              </div>
              <div className={styles.traitGrid}>
                {learnedTraits.slice(0, 8).map((entry) => (
                  <div key={`${entry.trait}-${entry.learnedAtBashoSeq ?? "legacy"}`} className={styles.traitCard}>
                    <strong>{entry.data?.name ?? entry.trait}</strong>
                    <span>{TRAIT_CATEGORY_LABELS[entry.data?.category ?? ""] ?? "特性"} / {formatTraitAcquisitionLabel(entry)}</span>
                    <p>{entry.data?.description ?? entry.triggerDetail ?? "特性の説明は記録されていません。"}</p>
                  </div>
                ))}
              </div>
            </article>
          ) : null}
        </div>
      </section>

      {(ledgerPoints && ledgerPoints.length > 4) || bodyTimeline.length > 4 ? (
        <section className={styles.chartSection}>
          <SectionHeading eyebrow="Graphs" title="補助図譜" copy="数値は記録を読むための補助に留めます。" />
          <div className={styles.chartGrid}>
            {ledgerPoints && ledgerPoints.length > 4 ? <WinRateTrendChart points={ledgerPoints} /> : null}
            {bodyTimeline.length > 4 ? (
              <BodyWeightChart bodyTimeline={bodyTimeline} entryWeight={entryWeight} peakWeight={peakWeight} />
            ) : null}
          </div>
        </section>
      ) : null}

      {traitAwakenings.length > 0 ? (
        <section className={styles.chartSection}>
          <SectionHeading eyebrow="Traits" title="特性年譜" />
          <TraitTimeline traitAwakenings={traitAwakenings} totalBasho={totalBashoForTimeline} />
        </section>
      ) : null}

      {import.meta.env.DEV ? (
        <section className={styles.devPanel}>
          <SectionHeading eyebrow="Dev" title="検証欄" copy="通常の読解UIから分離した開発確認用の領域です。" />
          <div className={styles.devGrid}>
            <div className={styles.observationPanel} data-tone={stanceAnalysis.tone}>
              <span>{stanceAnalysis.stanceLabel}</span>
              <strong>{stanceAnalysis.verdict}</strong>
              <em>{stanceAnalysis.score}</em>
              {stanceAnalysis.reasonLines.map((line) => <p key={line}>{line}</p>)}
            </div>
            <div className={styles.limitList}>
              {RELEASE_KNOWN_LIMITATIONS.map((limitation) => (
                <span key={limitation}>{limitation}</span>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
};
