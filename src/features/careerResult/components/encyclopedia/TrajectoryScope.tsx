import React from "react";
import { BarChart3 } from "lucide-react";
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

const MiniTrajectorySvg: React.FC<{ points: CareerLedgerPoint[] | undefined }> = ({ points }) => {
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
      aria-label="階級帯上の番付推移要約"
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
            {band.label}
          </text>
        </g>
      ))}
      <path d={path} className={styles.sparkPathGhost} />
      <path d={path} className={styles.sparkPath} />
      <circle cx={firstPosition.x} cy={firstPosition.y} r="4" className={styles.sparkEndpoint} />
      <circle cx={lastPosition.x} cy={lastPosition.y} r="4" className={styles.sparkEndpoint} />
      <circle cx={peakPosition.x} cy={peakPosition.y} r="6" className={styles.sparkPeak} />
      <text x={peakLabelX} y={peakLabelY} className={styles.sparkLabel}>
        最高位
      </text>
      <text x={firstPosition.x} y={height - 6} className={styles.sparkAxisLabel} textAnchor="middle">
        初土俵
      </text>
      <text x={lastPosition.x} y={height - 6} className={styles.sparkAxisLabel} textAnchor="middle">
        終幕
      </text>
    </svg>
  );
};

export const TrajectoryScope: React.FC<TrajectoryScopeProps> = ({ points, onOpenChapter }) => {
  return (
    <BracketFrame variant="log" padding="default" bodyClassName={styles.scope}>
      <ModuleHeader
        title="階級帯で見る番付推移"
        copy="横方向は時間、線は場所ごとの在位階級を表します。"
        kicker="番付推移"
        led="info"
        action={
          <Button variant="secondary" size="sm" onClick={() => onOpenChapter("trajectory")}>
            <BarChart3 className="mr-2 h-4 w-4" />
            番付推移を見る
          </Button>
        }
      />
      <div className={styles.scopePlot}>
        <MiniTrajectorySvg points={points} />
      </div>
      <div className={styles.legend}>
        <span>
          <i className={styles.dotPeak} aria-hidden="true" />
          <em>最高位</em>
        </span>
        <span>
          <i className={styles.dotEdge} aria-hidden="true" />
          <em>初土俵・終幕</em>
        </span>
      </div>
    </BracketFrame>
  );
};
