import React from "react";
import { clsx } from "clsx";
import type { CareerLedgerPoint } from "../utils/careerResultModel";
import { useLocale } from "../../../shared/hooks/useLocale";
import typography from "../../../shared/styles/typography.module.css";

interface BashoHeatmapStripProps {
  points: CareerLedgerPoint[];
  selectedBashoSeq: number | null;
  onSelectBasho: (seq: number) => void;
}

const winRateToColor = (wins: number, losses: number, absent: number): string => {
  const total = wins + losses;
  if (total === 0) return "rgba(76,93,121,0.3)";
  const rate = wins / total;
  if (rate >= 0.8) return "rgba(88,181,135,0.85)";
  if (rate >= 0.6) return "rgba(88,181,135,0.55)";
  if (rate >= 0.5) return "rgba(88,181,135,0.35)";
  if (rate >= 0.4) return "rgba(203,122,92,0.45)";
  if (absent >= 15) return "rgba(76,93,121,0.5)";
  return "rgba(203,122,92,0.7)";
};

export const BashoHeatmapStrip: React.FC<BashoHeatmapStripProps> = ({
  points,
  selectedBashoSeq,
  onSelectBasho,
}) => {
  const { locale } = useLocale();
  if (points.length === 0) return null;

  return (
    <div className="border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className={clsx(typography.kicker, "mb-2")}>
        {locale === "en" ? "Basho Record Heatmap" : "場所別成績ヒートマップ"}
      </div>
      <div className="flex gap-0.5 overflow-x-auto pb-1" role="list">
        {points.map((point) => {
          const color = winRateToColor(point.wins, point.losses, point.absent);
          const isSelected = point.bashoSeq === selectedBashoSeq;
          return (
            <button
              key={point.bashoSeq}
              role="listitem"
              type="button"
              title={`${point.bashoLabel} / ${point.rankShortLabel} / ${point.recordCompactLabel}`}
              onClick={() => onSelectBasho(point.bashoSeq)}
              className={clsx(
                "flex-shrink-0 transition-all duration-100",
                isSelected ? "ring-1 ring-[var(--ui-brand-line)]/60 ring-offset-0 scale-y-110" : "hover:scale-y-105",
              )}
              style={{
                width: 8,
                height: 24,
                backgroundColor: color,
              }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex gap-4 text-[9px] text-text-dim">
        <span style={{ color: "rgba(88,181,135,0.85)" }}>■ {locale === "en" ? "Winning" : "勝ち越し"}</span>
        <span style={{ color: "rgba(203,122,92,0.7)" }}>■ {locale === "en" ? "Losing" : "負け越し"}</span>
        <span style={{ color: "rgba(76,93,121,0.5)" }}>■ {locale === "en" ? "Absent" : "全休"}</span>
      </div>
    </div>
  );
};
