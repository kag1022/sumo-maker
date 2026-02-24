export interface OptimizerConfig {
  quantileOutsidePenalty: number;
  quantileCenterPenalty: number;
  expectedSlotPenalty: number;
  currentSlotDriftPenalty: number;
  directionViolationPenalty: number;
  mandatoryViolationPenalty: number;
  pressureLinearPenalty: number;
  promotionTiltWeight: number;
  demotionTiltWeight: number;
  scoreTieBreakScale: number;
  minimumQuantileSpread: number;
}

// Keep manual tuning points intentionally small to avoid coefficient-sprawl.
export const OPTIMIZER_CONFIG: OptimizerConfig = {
  quantileOutsidePenalty: 22,
  quantileCenterPenalty: 2.2,
  expectedSlotPenalty: 0.95,
  currentSlotDriftPenalty: 0.34,
  directionViolationPenalty: 9000,
  mandatoryViolationPenalty: 12000,
  pressureLinearPenalty: 2.4,
  promotionTiltWeight: 0.52,
  demotionTiltWeight: 0.52,
  scoreTieBreakScale: 0.0006,
  minimumQuantileSpread: 2,
};

