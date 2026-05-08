// Applies observation-build biases to a freshly-rolled RikishiStatus.
// MVP scope: surface-level adjustments only — no deep generation surgery.
//   * Initial stat nudges (small additive deltas, clamped 0..100).
//   * Body height/weight deltas (clamped to plausible ranges).
//   * growthType swap when the bias clearly points to LATE.
//   * retirementProfile swap when bias clearly favors STABLE.
// The full bias config is also stashed on the status for traceability.

import type { GrowthType, RikishiStatus } from '../models';
import { composeBias } from './observationBuild';
import type {
  ObservationBuildConfig,
  ObservationBiasDefinition,
} from './types';

const STAT_KEYS = ['tsuki', 'oshi', 'kumi', 'nage', 'koshi', 'deashi', 'waza', 'power'] as const;

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

const pickHighestBiasKey = (
  bias: Record<string, number> | undefined,
  threshold = 0.25,
): string | null => {
  if (!bias) return null;
  let bestKey: string | null = null;
  let bestVal = threshold;
  for (const [k, v] of Object.entries(bias)) {
    if (v > bestVal) {
      bestVal = v;
      bestKey = k;
    }
  }
  return bestKey;
};

const applyStatBias = (
  status: RikishiStatus,
  initialStatBias: Record<string, number> | undefined,
): void => {
  if (!initialStatBias) return;
  for (const k of STAT_KEYS) {
    const delta = initialStatBias[k];
    if (!delta) continue;
    status.stats[k] = clamp(Math.round(status.stats[k] + delta), 0, 120);
  }
};

const applyBodyBias = (
  status: RikishiStatus,
  bodyBias: ObservationBiasDefinition['bodyMetricsBias'],
): void => {
  if (!bodyBias) return;
  const metrics = status.bodyMetrics;
  if (!metrics) return;
  if (bodyBias.heightCm) {
    if (typeof metrics.heightCm === 'number') {
      metrics.heightCm = clamp(metrics.heightCm + bodyBias.heightCm, 150, 210);
    }
  }
  if (bodyBias.weightKg) {
    if (typeof metrics.weightKg === 'number') {
      metrics.weightKg = clamp(metrics.weightKg + bodyBias.weightKg, 70, 230);
    }
  }
};

const applyGrowthBias = (
  status: RikishiStatus,
  growthTypeBias: Record<string, number> | undefined,
): void => {
  const top = pickHighestBiasKey(growthTypeBias, 0.3);
  if (!top) return;
  // Only swap to LATE when explicitly biased — most conservative change.
  if (top === 'LATE' && status.growthType !== 'LATE') {
    status.growthType = 'LATE' as GrowthType;
  }
};

const applyRetirementBias = (
  status: RikishiStatus,
  retirementProfileBias: Record<string, number> | undefined,
): void => {
  if (!retirementProfileBias || !status.retirementProfile) return;
  // Pure metadata nudge: leave as-is for MVP. Future: re-roll retirementProfile.
};

export interface AppliedBiasResult {
  status: RikishiStatus;
  appliedBias: ObservationBiasDefinition;
}

export const applyObservationBuildBias = (
  baseStatus: RikishiStatus,
  config: ObservationBuildConfig,
): AppliedBiasResult => {
  const bias = composeBias(config.themeId, config.modifierIds);
  // Mutate a shallow clone so caller is safe.
  const status: RikishiStatus = {
    ...baseStatus,
    stats: { ...baseStatus.stats },
    bodyMetrics: baseStatus.bodyMetrics ? { ...baseStatus.bodyMetrics } : baseStatus.bodyMetrics,
  };
  applyStatBias(status, bias.initialStatBias);
  applyBodyBias(status, bias.bodyMetricsBias);
  applyGrowthBias(status, bias.growthTypeBias);
  applyRetirementBias(status, bias.retirementProfileBias);
  return { status, appliedBias: bias };
};
