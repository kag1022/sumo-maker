import { formatHighestRankDisplayName } from "../../../logic/ranking";
import type { CareerLedgerPoint } from "./careerResultModel";

export type CareerMilestoneTone = "start" | "rise" | "peak" | "honor" | "injury" | "return" | "end";

export interface CareerMilestoneView {
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

const CAREER_MILESTONE_LIMIT = 10;

export const PINNED_MILESTONE_LABELS = new Set(["初土俵", "初勝ち越し", "最高位", "引退前最後"]);

export const PROMOTION_MILESTONE_LABELS = new Set([
  "新十両",
  "再十両",
  "新入幕",
  "再入幕",
  "新小結",
  "再小結",
  "新関脇",
  "再関脇",
  "新大関",
  "再大関",
  "横綱昇進",
]);

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

export const buildCareerMilestones = (points: CareerLedgerPoint[] | undefined): CareerMilestoneView[] => {
  if (!points?.length) return [];

  const items: CareerMilestoneView[] = [];
  const used = new Set<string>();
  const push = (
    point: CareerLedgerPoint,
    label: string,
    description: string,
    order: number,
    displayRankLabel = point.rankLabel,
  ) => {
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
