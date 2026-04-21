import React from "react";
import { motion } from "framer-motion";
import { cn } from "../../../shared/lib/cn";
import typography from "../../../shared/styles/typography.module.css";

interface LiveHoshitoriGridProps {
  day: number | null;
  wins: number;
  losses: number;
  absent: number;
  totalDays?: number;
}

type CellState = "win" | "loss" | "absent" | "future";

const buildCells = (
  day: number | null,
  wins: number,
  losses: number,
  absent: number,
  total: number,
): CellState[] => {
  const cells: CellState[] = [];
  const currentDay = day ?? wins + losses + absent;
  let w = wins;
  let l = losses;
  let a = absent;
  for (let i = 1; i <= total; i++) {
    if (i > currentDay) {
      cells.push("future");
    } else if (a > 0 && i <= a) {
      cells.push("absent");
      a--;
    } else if (w > 0) {
      cells.push("win");
      w--;
    } else if (l > 0) {
      cells.push("loss");
      l--;
    } else {
      cells.push("future");
    }
  }
  return cells;
};

const CELL_STYLE: Record<CellState, string> = {
  win: "bg-[var(--chart-win)]",
  loss: "bg-[var(--chart-loss)]",
  absent: "bg-[var(--chart-absent)]",
  future: "bg-white/8",
};

const CELL_SYMBOL: Record<CellState, string> = {
  win: "○",
  loss: "●",
  absent: "休",
  future: "",
};

export const LiveHoshitoriGrid: React.FC<LiveHoshitoriGridProps> = ({
  day,
  wins,
  losses,
  absent,
  totalDays = 15,
}) => {
  const cells = buildCells(day, wins, losses, absent, totalDays);
  const currentDay = day ?? wins + losses + absent;
  const kachikoshi = wins >= 8;
  const makekoshi = losses >= 8;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className={cn(typography.label, "text-[10px] tracking-[0.35em] text-[var(--ui-brand-line)]/55 uppercase")}>
          星取
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          {kachikoshi ? (
            <span className="text-[var(--chart-win)] font-medium">勝ち越し</span>
          ) : makekoshi ? (
            <span className="text-[var(--chart-loss)] font-medium">負け越し</span>
          ) : null}
          <span className="text-text-dim">{wins}勝{losses}敗{absent > 0 ? `${absent}休` : ""}</span>
        </div>
      </div>

      <div className="flex gap-1 flex-wrap">
        {cells.map((state, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.03, duration: 0.15 }}
            className={`flex h-7 w-7 items-center justify-center text-[10px] font-medium transition-all ${CELL_STYLE[state]}`}
            style={{ color: state === "future" ? "transparent" : "rgba(238,242,246,0.85)" }}
            title={`${i + 1}日目`}
          >
            {CELL_SYMBOL[state]}
          </motion.div>
        ))}
      </div>

      {totalDays > currentDay ? (
        <div className="h-1.5 overflow-hidden bg-white/8">
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${(currentDay / totalDays) * 100}%`,
              backgroundColor: kachikoshi
                ? "var(--chart-win)"
                : makekoshi
                  ? "var(--chart-loss)"
                  : "var(--ui-brand-line)",
              opacity: 0.7,
            }}
          />
        </div>
      ) : null}

      {totalDays > currentDay ? (
        <div className="flex items-center justify-between text-[10px] text-text-dim">
          <span>{currentDay}日目 / 残り{totalDays - currentDay}日</span>
          {!kachikoshi ? (
            <span>
              勝ち越しまで <span className="text-text">{8 - wins}</span> 勝
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
