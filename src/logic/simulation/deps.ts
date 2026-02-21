export type RandomSource = () => number;

export interface SimulationDependencies {
  random: RandomSource;
  getCurrentYear: () => number;
  yieldControl: () => Promise<void>;
}

export const defaultSimulationDependencies: SimulationDependencies = {
  random: () => Math.random(),
  getCurrentYear: () => new Date().getFullYear(),
  yieldControl: () => new Promise((resolve) => setTimeout(resolve, 0)),
};

export const resolveSimulationDependencies = (
  overrides?: Partial<SimulationDependencies>,
): SimulationDependencies => ({
  ...defaultSimulationDependencies,
  ...(overrides ?? {}),
});
