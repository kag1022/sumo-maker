import type { NpcTsukedashiYearPlan } from './tsukedashi';

export interface PopulationPlan {
  sampledAtYear: number;
  annualIntakeShock: number;
  annualRetirementShock: number;
  annualIntakeHardCap: number;
  annualStartHeadcount?: number;
  annualTargetHeadcount?: number;
  annualHeadcountDrift?: number;
  annualSwingAmplitude?: number;
  annualSwingPhase?: number;
  jonidanShock: number;
  jonokuchiShock: number;
  lowerDivisionElasticity: number;
  sampledTotalSwing: number;
  sampledJonidanSwing: number;
  sampledJonokuchiSwing: number;
  npcTsukedashiPlan?: NpcTsukedashiYearPlan;
}
