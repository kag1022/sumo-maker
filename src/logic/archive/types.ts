// Observation Build — types

export type ObservationThemeId =
  | 'random'
  | 'realistic'
  | 'featured'
  | 'makushita_wall'
  | 'late_bloomer';

export type ObservationModifierId =
  | 'small_body'
  | 'large_body'
  | 'oshizumo_style'
  | 'technical_style'
  | 'late_growth_bias'
  | 'stable_temperament'
  | 'volatile_temperament'
  | 'injury_risk_high';

export type ObservationModifierGroup = 'body' | 'style' | 'growth' | 'risk';

export interface ObservationBiasDefinition {
  entryArchetypeBias?: Record<string, number>;
  aptitudeTierBias?: Record<string, number>;
  careerBandBias?: Record<string, number>;
  growthTypeBias?: Record<string, number>;
  retirementProfileBias?: Record<string, number>;
  genomeBias?: Record<string, number>;
  initialStatBias?: Record<string, number>;
  /** Soft hint for body metrics (cm/kg deltas applied probabilistically). */
  bodyMetricsBias?: { heightCm?: number; weightKg?: number };
  /** Soft hint for injury risk; informational only at MVP. */
  injuryRiskBias?: number;
  /** Soft hint for variance; informational only at MVP. */
  varianceBias?: number;
}

export interface ObservationThemeDefinition {
  id: ObservationThemeId;
  label: string;
  description: string;
  cost: number;
  riskText: string;
  bias: ObservationBiasDefinition;
}

export interface ObservationModifierDefinition {
  id: ObservationModifierId;
  label: string;
  description: string;
  cost: number;
  riskText?: string;
  bias: ObservationBiasDefinition;
  exclusiveGroup?: ObservationModifierGroup;
}

export interface ObservationBuildConfig {
  themeId: ObservationThemeId;
  modifierIds: ObservationModifierId[];
  totalCost: number;
}
