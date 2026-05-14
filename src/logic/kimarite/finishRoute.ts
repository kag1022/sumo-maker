import type { WinRoute } from '../models';
import type { RandomSource } from '../simulation/deps';
import {
  type BoutEngagement,
  resolveEngagementRouteBias,
} from './engagement';
import type { KimariteCompetitorProfile } from './selection.types';

export interface FinishRouteContext {
  readonly isHighPressure: boolean;
  readonly isLastDay: boolean;
  readonly isUnderdog: boolean;
  readonly isEdgeCandidate: boolean;
  readonly weightDiff: number;
  readonly heightDiff: number;
}

export interface ResolveFinishRouteInput {
  readonly winner: Pick<
    KimariteCompetitorProfile,
    'style' | 'stats' | 'traits' | 'bodyType' | 'repertoire'
  >;
  readonly context: FinishRouteContext;
  readonly engagement?: BoutEngagement;
  readonly rng: RandomSource;
  readonly routeMultipliers?: Partial<Record<WinRoute, number>>;
}

export type ResolveFinishRouteCandidatesInput = Omit<ResolveFinishRouteInput, 'rng'>;

export interface FinishRouteCandidate {
  readonly value: WinRoute;
  readonly weight: number;
}

const weightedPick = <T,>(
  entries: Array<{ value: T; weight: number }>,
  rng: RandomSource,
): T => {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= Math.max(0, entry.weight);
    if (roll <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
};

export const resolveFinishRouteCandidates = ({
  winner,
  context,
  engagement,
  routeMultipliers,
}: ResolveFinishRouteCandidatesInput): FinishRouteCandidate[] => {
  // Engagement に応じて route の重みを事前スケーリング。
  // BELT_BATTLE 下で PUSH 力士が無理に PUSH_OUT を取らないよう、×0.2〜×2.2 で引き寄せる。
  const routeBias = engagement ? resolveEngagementRouteBias(engagement) : {};
  const biasOf = (route: WinRoute): number => routeBias[route as keyof typeof routeBias] ?? 1;
  const multiplierOf = (route: WinRoute): number => routeMultipliers?.[route] ?? 1;
  const primaryRoute = winner.repertoire?.primaryRoutes[0];
  const secondaryRoutes = winner.repertoire?.secondaryRoutes ?? [];
  const secondaryBoost = (route: WinRoute, value: number): number =>
    secondaryRoutes.includes(route) ? value : 0;
  const rawWeights: FinishRouteCandidate[] = [
    {
      value: 'PUSH_OUT',
      weight:
        (winner.style === 'PUSH' ? 2.6 : 0.2) +
        (primaryRoute === 'PUSH_OUT' ? 2.2 : 0) +
        secondaryBoost('PUSH_OUT', 1.3) +
        ((winner.stats.oshi ?? 50) + (winner.stats.tsuki ?? 50)) / 90 +
        (context.weightDiff >= 6 ? 0.35 : 0),
    },
    {
      value: 'BELT_FORCE',
      weight:
        (winner.style === 'GRAPPLE' ? 2.6 : 0.25) +
        (primaryRoute === 'BELT_FORCE' ? 2.2 : 0) +
        secondaryBoost('BELT_FORCE', 1.3) +
        ((winner.stats.kumi ?? 50) + (winner.stats.koshi ?? 50)) / 92 +
        (context.weightDiff >= 0 ? 0.45 : 0),
    },
    {
      value: 'THROW_BREAK',
      weight:
        (winner.style === 'TECHNIQUE' ? 2.4 : winner.style === 'GRAPPLE' ? 0.9 : 0.12) +
        (primaryRoute === 'THROW_BREAK' ? 2.05 : 0) +
        secondaryBoost('THROW_BREAK', 1.55) +
        ((winner.stats.nage ?? 50) + (winner.stats.waza ?? 50)) / 94,
    },
    {
      value: 'PULL_DOWN',
      weight:
        (winner.style === 'PUSH' ? 1.55 : winner.style === 'TECHNIQUE' ? 1.7 : winner.style === 'GRAPPLE' ? 0.38 : 0.22) +
        (primaryRoute === 'PULL_DOWN' ? 2.05 : 0) +
        secondaryBoost('PULL_DOWN', 1.65) +
        (context.isUnderdog ? 0.45 : 0) +
        (context.heightDiff >= 6 ? 0.18 : 0),
    },
    {
      value: 'EDGE_REVERSAL',
      weight:
        context.isEdgeCandidate
          ? 0.14 +
            secondaryBoost('EDGE_REVERSAL', 0.45) +
            (winner.traits.includes('DOHYOUGIWA_MAJUTSU') ? 1.2 : 0) +
            (winner.traits.includes('CLUTCH_REVERSAL') ? 1.0 : 0) +
            (context.isUnderdog ? 0.45 : 0)
          : 0,
    },
    {
      value: 'REAR_FINISH',
      weight:
        context.isHighPressure || context.isLastDay
          ? 0.04 +
            secondaryBoost('REAR_FINISH', 0.32) +
            (winner.traits.includes('READ_THE_BOUT') ? 0.65 : 0) +
            (winner.style === 'TECHNIQUE' ? 0.3 : 0)
          : 0,
    },
    {
      value: 'LEG_ATTACK',
      weight:
        winner.style === 'TECHNIQUE' || winner.traits.includes('ARAWAZASHI')
          ? 0.015 +
            secondaryBoost('LEG_ATTACK', 0.1) +
            (winner.bodyType === 'SOPPU' ? 0.08 : 0) +
            (context.isUnderdog ? 0.08 : 0)
          : 0,
    },
  ];
  return rawWeights
    .map((entry) => ({ ...entry, weight: entry.weight * biasOf(entry.value) * multiplierOf(entry.value) }))
    .filter((entry) => entry.weight > 0.04);
};

export const resolveFinishRoute = (input: ResolveFinishRouteInput): WinRoute => {
  const { rng } = input;
  const weights = resolveFinishRouteCandidates(input);
  return weightedPick(weights, rng);
};
