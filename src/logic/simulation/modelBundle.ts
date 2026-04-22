import {
  DEFAULT_SIMULATION_MODEL_VERSION,
  normalizeNewRunModelVersion,
  SimulationModelVersion,
} from './modelVersion';
import { SimulationModelBundle } from './runtimeTypes';

const BUNDLES: Record<SimulationModelVersion, SimulationModelBundle> = {
  v3: {
    id: 'sumo-maker-v3-runtime',
    version: 'v3',
    competitionPolicy: {
      id: 'competition-unified-v3-variance',
      label: '取組と勝敗は unified-v3-variance 系の競技政策を使う',
    },
    trajectoryPolicy: {
      id: 'trajectory-stagnation-pressure',
      label: '停滞圧と反発を含むキャリア変動政策を使う',
    },
    promotionPolicy: {
      id: 'promotion-merit-first',
      label: '番付は merit-first の昇降格政策を使う',
    },
    populationPolicy: {
      id: 'population-heisei-flow',
      label: '人口は Heisei 校正ベースの流量政策を使う',
    },
    narrativePolicy: {
      id: 'narrative-domain-events',
      label: '物語生成は domain event を中心に行う',
    },
  },
};

export const DEFAULT_SIMULATION_MODEL_BUNDLE: SimulationModelBundle =
  BUNDLES[DEFAULT_SIMULATION_MODEL_VERSION];

export const resolveSimulationModelBundle = (
  requested?: string,
): SimulationModelBundle => {
  const normalized = normalizeNewRunModelVersion(requested);
  return BUNDLES[normalized] ?? DEFAULT_SIMULATION_MODEL_BUNDLE;
};
