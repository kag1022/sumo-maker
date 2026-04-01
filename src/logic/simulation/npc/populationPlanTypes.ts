export interface PopulationPlan {
  sampledAtYear: number;
  annualIntakeShock: number;
  annualRetirementShock: number;
  annualIntakeHardCap: number;
  jonidanShock: number;
  jonokuchiShock: number;
  lowerDivisionElasticity: number;
  sampledTotalSwing: number;
  sampledJonidanSwing: number;
  sampledJonokuchiSwing: number;
}
