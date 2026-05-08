// AUTO-GENERATED FILE.
// Generated from sumo-api-db.
// Do not edit manually.

/**
 * 実データ movement hint 取得関数
 *
 * これは「番付を実際に動かす値」ではなく、hint である。
 * ゲーム本体の番付ロジックはこの hint を参照してもよいが、
 * 直接適用してはならない。最終的な番付は composeNextBanzuke が決定する。
 */

import type { RealDataMovementHint } from "./realDataTypes";
import { classifyRankZone } from "./rankZone";
import { LONG_RANGE_BUCKETS } from "./generatedLongRangeWinMovement";

const resolveAbsencesBucket = (absences: number): string => {
  if (absences <= 0) return "0";
  if (absences <= 7) return "1-7";
  if (absences <= 14) return "8-14";
  return "15";
};

const EXACT_MATCH_WEIGHT = 10;
const WL_MATCH_WEIGHT = 5;

interface HintInput {
  /** 日本語番付ラベル "東前頭5枚目" */
  rankLabel: string;
  wins: number;
  losses: number;
  absences?: number;
}

/**
 * 実データから、指定された番付・成績に対する自然な移動幅の hint を取得する。
 *
 * @returns hint。見つからない場合は null。
 */
export const getRealDataMovementHint = (
  input: HintInput,
): RealDataMovementHint | null => {
  const zone = classifyRankZone(input.rankLabel);
  if (zone === null) return null;

  const absences = input.absences ?? 0;
  const targetAbsBucket = resolveAbsencesBucket(absences);

  // 完全一致探索
  let best: (typeof LONG_RANGE_BUCKETS)[number] | null = null;
  let bestScore = -1;

  for (const bucket of LONG_RANGE_BUCKETS) {
    if (bucket.rankZone !== zone) continue;

    let score = 0;
    if (bucket.wins === input.wins && bucket.losses === input.losses) {
      score += WL_MATCH_WEIGHT;
      if (bucket.absencesBucket === targetAbsBucket) {
        score += EXACT_MATCH_WEIGHT;
      }
    }
    if (score > bestScore || (score === bestScore && bucket.sampleCount > (best?.sampleCount ?? 0))) {
      best = bucket;
      bestScore = score;
    }
  }

  if (!best) return null;

  return {
    source: "sumo-api-long-range",
    rankZone: best.rankZone,
    wins: best.wins,
    losses: best.losses,
    absences: absences,
    sampleCount: best.sampleCount,
    confidence: best.confidence,
    expectedMovement: best.expectedMovement,
    range: {
      p10: best.p10,
      p25: best.p25,
      median: best.median,
      p75: best.p75,
      p90: best.p90,
    },
  };
};
