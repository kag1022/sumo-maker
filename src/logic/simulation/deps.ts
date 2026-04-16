export type RandomSource = () => number;

export interface SimulationDependencies {
  random: RandomSource;
  getCurrentYear: () => number;
  now: () => number;
  yieldControl: () => Promise<void>;
}

export const defaultSimulationDependencies: SimulationDependencies = {
  random: () => Math.random(),
  getCurrentYear: () => new Date().getFullYear(),
  now: () => globalThis.performance?.now?.() ?? Date.now(),
  yieldControl: () => new Promise((resolve) => setTimeout(resolve, 0)),
};

export const resolveSimulationDependencies = (
  overrides?: Partial<SimulationDependencies>,
): SimulationDependencies => ({
  ...defaultSimulationDependencies,
  ...(overrides ?? {}),
});
