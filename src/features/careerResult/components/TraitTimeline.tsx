import React from "react";
import type { TraitAwakening } from "../../../logic/models";
import { CONSTANTS } from "../../../logic/constants";
import styles from "./TraitTimeline.module.css";

interface TraitTimelineProps {
  traitAwakenings: TraitAwakening[];
  totalBasho: number;
}

type Category = "BODY" | "MENTAL" | "TECHNIQUE" | "OTHER";

const CAT_MAP: Record<Category, { label: string; color: string; bg: string }> = {
  BODY:      { label: "体質", color: "#2d7a52", bg: "rgba(45,122,82,0.18)" },
  MENTAL:    { label: "精神", color: "#4c7bff", bg: "rgba(76,123,255,0.18)" },
  TECHNIQUE: { label: "技術", color: "#b88a3e", bg: "rgba(184,138,62,0.18)" },
  OTHER:     { label: "その他", color: "#7a8499", bg: "rgba(122,132,153,0.18)" },
};

const resolveCategory = (raw: string | undefined): Category => {
  if (raw === "BODY" || raw === "MENTAL" || raw === "TECHNIQUE") return raw;
  return "OTHER";
};

interface TraitItem {
  idx: number;
  awakening: TraitAwakening;
  traitName: string;
  description: string;
  rarity: string;
  category: Category;
  pct: number;
}

const buildTicks = (total: number): number[] => {
  if (total <= 1) return [1];
  const step = total <= 10 ? 2 : total <= 30 ? 5 : total <= 60 ? 10 : 15;
  const ticks: number[] = [1];
  for (let t = step; t < total; t += step) ticks.push(t);
  if (ticks[ticks.length - 1] !== total) ticks.push(total);
  return ticks;
};

export const TraitTimeline: React.FC<TraitTimelineProps> = ({ traitAwakenings, totalBasho }) => {
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);

  const items = React.useMemo<TraitItem[]>(() => {
    const sorted = [...traitAwakenings].sort((a, b) => a.bashoSeq - b.bashoSeq);
    const scale = Math.max(totalBasho, 1);
    return sorted.map((awakening, i) => {
      const data = CONSTANTS.TRAIT_DATA[awakening.trait] as
        | { name?: string; category?: string; rarity?: string; description?: string }
        | undefined;
      return {
        idx: i + 1,
        awakening,
        traitName: data?.name ?? awakening.trait,
        description: data?.description ?? awakening.triggerDetail ?? "",
        rarity: data?.rarity ?? "N",
        category: resolveCategory(data?.category),
        pct: Math.min(98, Math.max(1, (awakening.bashoSeq / scale) * 100)),
      };
    });
  }, [traitAwakenings, totalBasho]);

  const catCounts = React.useMemo(() => {
    const c: Record<Category, number> = { BODY: 0, MENTAL: 0, TECHNIQUE: 0, OTHER: 0 };
    items.forEach((item) => { c[item.category] += 1; });
    return c;
  }, [items]);

  const ticks = React.useMemo(() => buildTicks(Math.max(totalBasho, 1)), [totalBasho]);

  if (items.length === 0) return null;

  return (
    <div className={styles.root}>
      {/* ── ヘッダー ── */}
      <div className={styles.header}>
        <span className={styles.title}>特性の習得タイミング</span>
        <div className={styles.legend}>
          {(Object.keys(CAT_MAP) as Category[]).map((cat) => {
            const count = catCounts[cat];
            if (count === 0) return null;
            return (
              <span key={cat} className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: CAT_MAP[cat].color }} />
                {CAT_MAP[cat].label}
                <span className={styles.legendCount}>{count}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* ── タイムライン軸 ── */}
      <div className={styles.axisShell}>
        {/* 番号付きピン */}
        <div className={styles.pins}>
          {items.map((item) => (
            <button
              key={item.idx}
              type="button"
              className={styles.pin}
              data-active={hoveredIdx === item.idx}
              style={{
                left: `${item.pct}%`,
                background: CAT_MAP[item.category].color,
              }}
              onMouseEnter={() => setHoveredIdx(item.idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              onFocus={() => setHoveredIdx(item.idx)}
              onBlur={() => setHoveredIdx(null)}
              aria-label={`${item.traitName}（${item.awakening.bashoSeq}場所目）`}
            >
              {item.idx}
            </button>
          ))}
        </div>
        {/* 軸線 */}
        <div className={styles.axisLine} />
        {/* 目盛り */}
        <div className={styles.ticks}>
          {ticks.map((tick) => {
            const tickPct = totalBasho > 0 ? (tick / totalBasho) * 100 : 0;
            return (
              <div key={tick} className={styles.tick} style={{ left: `${tickPct}%` }}>
                <span className={styles.tickMark} />
                <span className={styles.tickLabel}>{tick}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 特性リスト ── */}
      <div className={styles.list}>
        {items.map((item) => {
          const cat = CAT_MAP[item.category];
          const isHovered = hoveredIdx === item.idx;
          return (
            <div
              key={item.idx}
              className={styles.row}
              data-active={isHovered}
              onMouseEnter={() => setHoveredIdx(item.idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <span className={styles.rowNum} style={{ background: cat.color }}>
                {item.idx}
              </span>
              <div className={styles.rowMain}>
                <div className={styles.rowTop}>
                  <span className={styles.rowName}>{item.traitName}</span>
                  <span className={styles.rowMeta}>
                    <span className={styles.rowCat} style={{ color: cat.color }}>{cat.label}</span>
                    <span className={styles.rowRarity}>{item.rarity}</span>
                    <span className={styles.rowBasho}>{item.awakening.bashoSeq}場所目</span>
                  </span>
                </div>
                {item.description && (
                  <p className={styles.rowDesc}>{item.description}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
