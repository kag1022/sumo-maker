// AUTO-GENERATED FILE.
// Generated from sumo-api-db.
// Do not edit manually.

import type { RealDataRankZone } from "./realDataTypes";

/**
 * 日本語番付ラベル → RealDataRankZone の分類。
 *
 * ラベル形式: 東横綱1枚目, 西前頭5枚目, 東十両12枚目 など
 */

export const RANK_ZONE_LIST: RealDataRankZone[] = [
  "Yokozuna",
  "Ozeki",
  "Sanyaku",
  "Makuuchi_Joi",
  "Makuuchi_Mid",
  "Makuuchi_Low",
  "Juryo_Upper",
  "Juryo_Mid",
  "Juryo_Low",
  "Makushita_Upper_5",
  "Makushita_Upper_15",
  "Makushita_Upper_30",
  "Makushita_Lower",
  "Sandanme",
  "Jonidan",
  "Jonokuchi",
];

const JA_NAME_TO_ZONE: Record<string, (n: number) => RealDataRankZone> = {
  "横綱": () => "Yokozuna",
  "大関": () => "Ozeki",
  "関脇": () => "Sanyaku",
  "小結": () => "Sanyaku",
  "前頭": (n) => (n <= 5 ? "Makuuchi_Joi" : n <= 10 ? "Makuuchi_Mid" : "Makuuchi_Low"),
  "十両": (n) => (n <= 5 ? "Juryo_Upper" : n <= 9 ? "Juryo_Mid" : "Juryo_Low"),
  "幕下": (n) =>
    n <= 5
      ? "Makushita_Upper_5"
      : n <= 15
        ? "Makushita_Upper_15"
        : n <= 30
          ? "Makushita_Upper_30"
          : "Makushita_Lower",
  "三段目": () => "Sandanme",
  "序二段": () => "Jonidan",
  "序ノ口": () => "Jonokuchi",
};

/**
 * 日本語番付ラベルから rankZone を判定する。
 * "東横綱1枚目" → "Yokozuna"
 * パースできない場合は null。
 */
export const classifyRankZone = (label: string): RealDataRankZone | null => {
  const m = label.match(/^([東西])(.+?)(\d+)枚目$/);
  if (!m) return null;
  const jaName = m[2];
  const number = parseInt(m[3], 10);
  const fn = JA_NAME_TO_ZONE[jaName];
  return fn ? fn(number) : null;
};
