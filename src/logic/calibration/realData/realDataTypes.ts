// AUTO-GENERATED FILE.
// Generated from sumo-api-db.
// Do not edit manually.

/**
 * 長期実データ movement hint 型
 *
 * ゲーム本体の番付ロジックを直接変更せず、
 * 「実データ上の自然な移動幅」を取得するための軽量層。
 */

export type RealDataSource = "sumo-api-long-range";

export type RealDataConfidence = "high" | "medium" | "low";

export type RealDataRankZone =
  | "Yokozuna"
  | "Ozeki"
  | "Sanyaku"
  | "Makuuchi_Joi"
  | "Makuuchi_Mid"
  | "Makuuchi_Low"
  | "Juryo_Upper"
  | "Juryo_Mid"
  | "Juryo_Low"
  | "Makushita_Upper_5"
  | "Makushita_Upper_15"
  | "Makushita_Upper_30"
  | "Makushita_Lower"
  | "Sandanme"
  | "Jonidan"
  | "Jonokuchi";

export interface RealDataWinMovementBucket {
  source: RealDataSource;
  rankZone: RealDataRankZone;
  wins: number;
  losses: number;
  absencesBucket: string;
  sampleCount: number;
  confidence: RealDataConfidence;
  expectedMovement: number;
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
}

export interface RealDataMovementHint {
  source: RealDataSource;
  rankZone: RealDataRankZone;
  wins: number;
  losses: number;
  absences: number;
  sampleCount: number;
  confidence: RealDataConfidence;
  expectedMovement: number;
  range: {
    p10: number;
    p25: number;
    median: number;
    p75: number;
    p90: number;
  };
}
