import { Division } from '../models';

export type EnemyStyleBias = 'PUSH' | 'GRAPPLE' | 'TECHNIQUE' | 'BALANCE';

export interface EnemyStats {
  id?: string;
  shikona: string;
  rankValue: number;
  power: number;
  heightCm: number;
  weightKg: number;
  styleBias?: EnemyStyleBias;
  rankName?: string;
  rankNumber?: number;
  rankSide?: 'East' | 'West';
}

export interface EnemySeedProfile {
  seedId: string;
  division: Division;
  rankValue: number;
  basePower: number;
  powerVariance: number;
  growthBias: number;
  volatilityBase: number;
  retirementBias: number;
  styleBias: EnemyStyleBias;
}

const STYLE_TABLE: EnemySeedProfile['styleBias'][] = ['PUSH', 'GRAPPLE', 'TECHNIQUE', 'BALANCE'];

const deterministicSeed = (index: number): number => ((index * 37 + 17) % 997) / 997;

const createDivisionSeedProfiles = (
  division: Division,
  count: number,
  rankValue: number,
  powerMin: number,
  powerMax: number,
): EnemySeedProfile[] => {
  const span = Math.max(1, powerMax - powerMin);
  return Array.from({ length: count }, (_, index) => {
    const drift = deterministicSeed(index);
    const power = Math.round(powerMin + drift * span);
    return {
      seedId: `${division}-seed-${index}`,
      division,
      rankValue,
      basePower: power,
      powerVariance: 1.8 + deterministicSeed(index + 100) * 2.4,
      growthBias: -0.08 + deterministicSeed(index + 200) * 0.16,
      volatilityBase: 0.9 + deterministicSeed(index + 300) * 1.9,
      retirementBias: 0.86 + deterministicSeed(index + 400) * 0.4,
      styleBias: STYLE_TABLE[index % STYLE_TABLE.length],
    };
  });
};

export const ENEMY_SEED_POOL: Record<Division, EnemySeedProfile[]> = {
  Makuuchi: createDivisionSeedProfiles('Makuuchi', 64, 5, 104, 150),
  Juryo: createDivisionSeedProfiles('Juryo', 48, 6, 88, 112),
  Makushita: createDivisionSeedProfiles('Makushita', 64, 7, 72, 96),
  Sandanme: createDivisionSeedProfiles('Sandanme', 56, 8, 58, 84),
  Jonidan: createDivisionSeedProfiles('Jonidan', 56, 9, 46, 76),
  Jonokuchi: createDivisionSeedProfiles('Jonokuchi', 40, 10, 34, 66),
  Maezumo: createDivisionSeedProfiles('Maezumo', 24, 11, 28, 52),
};

export const ENEMY_BODY_METRIC_BASE: Record<Division, { heightCm: number; weightKg: number }> = {
  Makuuchi: { heightCm: 188, weightKg: 160 },
  Juryo: { heightCm: 186, weightKg: 152 },
  Makushita: { heightCm: 184, weightKg: 140 },
  Sandanme: { heightCm: 182, weightKg: 130 },
  Jonidan: { heightCm: 180, weightKg: 120 },
  Jonokuchi: { heightCm: 178, weightKg: 110 },
  Maezumo: { heightCm: 176, weightKg: 100 },
};

const BODY_VARIANCE_BY_DIVISION: Record<Division, { height: number; weight: number }> = {
  Makuuchi: { height: 8, weight: 22 },
  Juryo: { height: 7, weight: 20 },
  Makushita: { height: 6, weight: 18 },
  Sandanme: { height: 6, weight: 16 },
  Jonidan: { height: 5, weight: 14 },
  Jonokuchi: { height: 5, weight: 12 },
  Maezumo: { height: 4, weight: 10 },
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const deterministicHash = (text: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1_000_003) / 1_000_003;
};

const resolveCenteredNoise = (seedText: string): number =>
  deterministicHash(seedText) * 2 - 1;

export const resolveEnemySeedBodyMetrics = (
  division: Division,
  seedId: string,
): { heightCm: number; weightKg: number } => {
  const base = ENEMY_BODY_METRIC_BASE[division];
  const variance = BODY_VARIANCE_BY_DIVISION[division];
  const heightNoise = resolveCenteredNoise(`${seedId}-h`);
  const weightNoise = resolveCenteredNoise(`${seedId}-w`);
  return {
    heightCm: clamp(Math.round(base.heightCm + heightNoise * variance.height), 165, 215),
    weightKg: clamp(Math.round(base.weightKg + weightNoise * variance.weight), 85, 240),
  };
};
