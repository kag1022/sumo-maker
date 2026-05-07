// AUTO-GENERATED FILE.
// Generated from sumo-api-db.
// Do not edit manually.

import type { RealDataRankZone } from "./realDataTypes";
import rawData from "../../../../sumo-api-db/data/analysis/game_calibration_long_range.json";

interface CalibrationMeta {
  generatedFrom: string;
  rankZones: RealDataRankZone[];
  note: string;
  bucketCount: number;
}

export const LONG_RANGE_META =
  (rawData as { meta: CalibrationMeta }).meta ?? {};
