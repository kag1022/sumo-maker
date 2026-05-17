import React from "react";
import { BarChart3 } from "lucide-react";
import { useLocale } from "../../../../shared/hooks/useLocale";
import type { LocaleCode } from "../../../../shared/lib/locale";
import { Button } from "../../../../shared/ui/Button";
import {
  CAREER_RANK_SCALE_BANDS,
  getCareerRankScalePosition,
  type CareerLedgerPoint,
  type CareerRankScaleLayoutBand,
} from "../../utils/careerResultModel";
import { BracketFrame } from "./BracketFrame";
import { ModuleHeader } from "./ModuleHeader";
import styles from "./TrajectoryScope.module.css";

interface TrajectoryScopeProps {
  points: CareerLedgerPoint[] | undefined;
  onOpenChapter: (chapter: "trajectory") => void;
}

interface ResidenceBar {
  key: string;
  label: string;
  count: number;
  ratio: number;
}

const BAND_EN_LABELS: Record<string, string> = {
  YOKOZUNA: "Yokozuna",
  OZEKI: "Ozeki",
  SEKIWAKE: "Sekiwake",
  KOMUSUBI: "Komusubi",
  MAEGASHIRA: "Maegashira",
  JURYO: "Juryo",
  MAKUSHITA: "Makushita",
  SANDANME: "Sandanme",
  JONIDAN: "Jonidan",
  JONOKUCHI: "Jonokuchi",
};

const formatBandLabel = (band: { key: string; label: string }, locale: LocaleCode): string =>
  locale === "en" ? BAND_EN_LABELS[band.key] ?? band.label : band.label;

const buildResidenceBars = (points: CareerLedgerPoint[] | undefined, locale: LocaleCode): ResidenceBar[] => {
  if (!points?.length) return [];
  const counts = new Map<string, number>();
  for (const point of points) {
    counts.set(point.bandKey, (counts.get(point.bandKey) ?? 0) + 1);
  }
  const maxCount = Math.max(1, ...counts.values());
  return CAREER_RANK_SCALE_BANDS.map((band) => {
    const count = counts.get(band.key) ?? 0;
    return {
      key: band.key,
      label: formatBandLabel(band, locale),
      count,
      ratio: count / maxCount,
    };
  }).filter((bar) => bar.count > 0);
};

const buildMiniRankScaleLayout = (
  points: CareerLedgerPoint[],
  plotHeight: number,
): CareerRankScaleLayoutBand[] => {
  const observedValues = points.map((point) => point.rankValue);
  const highestValue = Math.min(...observedValues);
  const lowestValue = Math.max(...observedValues);
  const firstBandIndex = CAREER_RANK_SCALE_BANDS.findIndex(
    (band) => highestValue >= band.min && highestValue <= band.max,
  );
  const lastBandIndex = CAREER_RANK_SCALE_BANDS.findIndex(
    (band) => lowestValue >= band.min && lowestValue <= band.max,
  );
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

const RankResidenceChart: React.FC<{ points: CareerLedgerPoint[] | undefined; locale: LocaleCode }> = ({ points, locale }) => {
  const bars = React.useMemo(() => buildResidenceBars(points, locale), [locale, points]);
  const total = points?.length ?? 0;

  if (!points || points.length === 0) {
    return <div className={styles.residenceEmpty}>{locale === "en" ? "Residence counts appear after detail records are ready." : "在籍数は詳細整理後に表示されます。"}</div>;
  }

  return (
    <aside className={styles.residencePanel} aria-label={locale === "en" ? "Basho count by rank band" : "階級別の在籍場所数"}>
      <div className={styles.residenceHead}>
        <span>{locale === "en" ? "Rank Residence" : "階級別の在籍"}</span>
        <strong>{locale === "en" ? `${total} basho` : `${total}場所`}</strong>
      </div>
      <div className={styles.residenceBars}>
        {bars.map((bar) => (
          <div key={bar.key} className={styles.residenceRow}>
            <span className={styles.residenceLabel}>{bar.label}</span>
            <span className={styles.residenceTrack} aria-hidden="true">
              <span className={styles.residenceFill} style={{ width: `${Math.max(8, bar.ratio * 100)}%` }} />
            </span>
            <strong className={styles.residenceCount}>{locale === "en" ? `${bar.count} basho` : `${bar.count}場所`}</strong>
          </div>
        ))}
      </div>
    </aside>
  );
};

const MiniTrajectorySvg: React.FC<{ points: CareerLedgerPoint[] | undefined; locale: LocaleCode }> = ({ points, locale }) => {
  if (!points || points.length < 2) {
    return <div className={styles.sparkEmpty}>{locale === "en" ? "Rank trajectory appears after detail records are ready." : "番付推移は詳細整理後に表示されます。"}</div>;
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
  const path = points
    .map((point, index) => {
      const { x, y } = toPointPosition(point, index);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const peak = points.reduce((best, point) => (point.rankValue < best.rankValue ? point : best), points[0]);
  const peakIndex = points.findIndex((point) => point.bashoSeq === peak.bashoSeq);
  const peakPosition = toPointPosition(peak, peakIndex);
  const firstPosition = toPointPosition(points[0], 0);
  const lastPosition = toPointPosition(points[points.length - 1], points.length - 1);
  const peakLabelX = Math.min(width - 58, Math.max(padding.left + 16, peakPosition.x + 12));
  const peakLabelY =
    peakPosition.y < padding.top + 24
      ? peakPosition.y + 22
      : Math.max(padding.top + 16, peakPosition.y - 10);

  return (
    <svg
      className={styles.sparkline}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={locale === "en" ? "Rank trajectory summary by band" : "階級帯上の番付推移要約"}
    >
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
          <text
            x={padding.left - 8}
            y={padding.top + band.y + band.height / 2 + 4}
            className={styles.sparkBandLabel}
          >
            {formatBandLabel(band, locale)}
          </text>
        </g>
      ))}
      <path d={path} className={styles.sparkPathGhost} />
      <path d={path} className={styles.sparkPath} />
      <circle cx={firstPosition.x} cy={firstPosition.y} r="4" className={styles.sparkEndpoint} />
      <circle cx={lastPosition.x} cy={lastPosition.y} r="4" className={styles.sparkEndpoint} />
      <circle cx={peakPosition.x} cy={peakPosition.y} r="6" className={styles.sparkPeak} />
      <text x={peakLabelX} y={peakLabelY} className={styles.sparkLabel}>
        {locale === "en" ? "Peak" : "最高位"}
      </text>
      <text x={firstPosition.x} y={height - 6} className={styles.sparkAxisLabel} textAnchor="middle">
        {locale === "en" ? "Start" : "初土俵"}
      </text>
      <text x={lastPosition.x} y={height - 6} className={styles.sparkAxisLabel} textAnchor="middle">
        {locale === "en" ? "End" : "終幕"}
      </text>
    </svg>
  );
};

export const TrajectoryScope: React.FC<TrajectoryScopeProps> = ({ points, onOpenChapter }) => {
  const { locale } = useLocale();
  return (
    <BracketFrame variant="log" padding="default" bodyClassName={styles.scope}>
      <ModuleHeader
        title={locale === "en" ? "Rank Trajectory by Band" : "階級帯で見る番付推移"}
        copy={locale === "en" ? "The horizontal axis is time; the line shows each basho's rank band." : "横方向は時間、線は場所ごとの在位階級を表します。"}
        kicker={locale === "en" ? "Rank Arc" : "番付推移"}
        led="info"
        action={
          <Button variant="secondary" size="sm" onClick={() => onOpenChapter("trajectory")}>
            <BarChart3 className="mr-2 h-4 w-4" />
            {locale === "en" ? "Open Rank Trajectory" : "番付推移を見る"}
          </Button>
        }
      />
      <div className={styles.scopeBody}>
        <div className={styles.scopePlot}>
          <MiniTrajectorySvg points={points} locale={locale} />
        </div>
        <RankResidenceChart points={points} locale={locale} />
      </div>
      <div className={styles.legend}>
        <span>
          <i className={styles.dotPeak} aria-hidden="true" />
          <em>{locale === "en" ? "Peak rank" : "最高位"}</em>
        </span>
        <span>
          <i className={styles.dotEdge} aria-hidden="true" />
          <em>{locale === "en" ? "Start / End" : "初土俵・終幕"}</em>
        </span>
      </div>
    </BracketFrame>
  );
};
