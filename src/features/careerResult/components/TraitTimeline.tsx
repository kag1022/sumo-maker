import React from "react";
import { Sparkles } from "lucide-react";
import type { TraitAwakening } from "../../../logic/models";
import { CONSTANTS } from "../../../logic/constants";

interface TraitTimelineProps {
  traitAwakenings: TraitAwakening[];
  totalBasho: number;
}

export const TraitTimeline: React.FC<TraitTimelineProps> = ({ traitAwakenings, totalBasho }) => {
  if (traitAwakenings.length === 0) return null;

  const sorted = [...traitAwakenings].sort((a, b) => a.bashoSeq - b.bashoSeq);

  return (
    <div className="border border-white/10 bg-white/[0.02] px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-[var(--ui-brand-line)]/60" />
        <div className="text-[10px] ui-text-label tracking-[0.35em] text-[var(--ui-brand-line)]/55 uppercase">
          特技覚醒
        </div>
      </div>

      <div className="relative">
        <div className="absolute left-0 right-0 top-3 h-px bg-white/8" />
        <div className="flex gap-4 overflow-x-auto pb-2">
          {sorted.map((awakening) => {
            const pct = totalBasho > 0 ? (awakening.bashoSeq / totalBasho) * 100 : 0;
            const data = CONSTANTS.TRAIT_DATA[awakening.trait];
            return (
              <div
                key={`${awakening.trait}-${awakening.bashoSeq}`}
                className="group relative flex flex-col items-center gap-1.5 flex-shrink-0"
                style={{ marginLeft: `${pct}%` }}
                title={`${data?.name ?? awakening.trait}: ${awakening.triggerDetail}`}
              >
                <div className="h-2 w-2 border border-[var(--ui-brand-line)]/60 bg-[var(--ui-brand-line)]/30 z-10" />
                <div className="text-[10px] text-text-dim whitespace-nowrap max-w-[80px] text-center leading-tight">
                  {data?.name ?? awakening.trait}
                </div>
                <div className="text-[9px] text-[var(--ui-brand-line)]/40">
                  {awakening.bashoSeq}場所目
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {sorted.map((awakening) => {
          const data = CONSTANTS.TRAIT_DATA[awakening.trait];
          return (
            <span
              key={`chip-${awakening.trait}-${awakening.bashoSeq}`}
              className="inline-flex items-center gap-1 border border-[var(--ui-brand-line)]/20 bg-[var(--ui-brand-line)]/5 px-2 py-0.5 text-[10px] text-[var(--ui-brand-line)]/70"
              title={awakening.triggerDetail}
            >
              <Sparkles className="h-2.5 w-2.5" />
              {data?.name ?? awakening.trait}
            </span>
          );
        })}
      </div>
    </div>
  );
};
