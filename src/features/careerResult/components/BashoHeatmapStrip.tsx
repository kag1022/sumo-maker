import React from "react";
import type { CareerLedgerPoint } from "../utils/careerResultModel";

interface BashoHeatmapStripProps {
  points: CareerLedgerPoint[];
  selectedBashoSeq: number | null;
  onSelectBasho: (seq: number) => void;
}

const getMarkStyle = (wins: number, losses: number, absent: number): { symbol: string; color: string } => {
  const total = wins + losses;
  if (total === 0) return { symbol: "休", color: "var(--chart-absent)" };
  const rate = wins / total;
  if (absent >= 10) return { symbol: "休", color: "var(--chart-absent)" };
  if (rate >= 0.8) return { symbol: "◎", color: "var(--chart-win)" };
  if (rate >= 0.534) return { symbol: "○", color: "rgba(88,181,135,0.75)" };
  if (rate >= 0.5) return { symbol: "△", color: "rgba(184,155,104,0.65)" };
  return { symbol: "●", color: "var(--chart-loss)" };
};

export const BashoHeatmapStrip: React.FC<BashoHeatmapStripProps> = ({
  points,
  selectedBashoSeq,
  onSelectBasho,
}) => {
  if (points.length === 0) return null;

  return (
    <div className="basho-hoshi-strip">
      <div className="basho-hoshi-strip-label">星取一覧</div>
      <div className="basho-hoshi-strip-track" role="list">
        {points.map((point) => {
          const mark = getMarkStyle(point.wins, point.losses, point.absent);
          const isSelected = point.bashoSeq === selectedBashoSeq;
          const hasMilestone = point.milestoneTags.length > 0;
          return (
            <button
              key={point.bashoSeq}
              role="listitem"
              type="button"
              title={`${point.bashoLabel} / ${point.rankShortLabel} / ${point.recordCompactLabel}`}
              onClick={() => onSelectBasho(point.bashoSeq)}
              className={`basho-hoshi-mark${isSelected ? " selected" : ""}${hasMilestone ? " milestone" : ""}`}
              style={{ color: mark.color }}
            >
              {mark.symbol}
            </button>
          );
        })}
      </div>
      <div className="basho-hoshi-strip-legend">
        <span style={{ color: "var(--chart-win)" }}>◎ 大勝ち越し</span>
        <span style={{ color: "rgba(88,181,135,0.75)" }}>○ 勝ち越し</span>
        <span style={{ color: "rgba(184,155,104,0.65)" }}>△ 五分前後</span>
        <span style={{ color: "var(--chart-loss)" }}>● 負け越し</span>
        <span style={{ color: "var(--chart-absent)" }}>休 全休</span>
      </div>
    </div>
  );
};
