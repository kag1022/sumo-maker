import { createInitialRikishi } from '../../logic/initialization';
import { resolveAptitudeProfile } from '../../logic/constants';
import { Rank, RikishiStatus } from '../../logic/models';
import { resolveAbilityFromStats } from '../../logic/simulation/strength/model';
import { LogicLabPresetId } from './types';

type RandomSource = () => number;

export interface LogicLabPresetDefinition {
  id: LogicLabPresetId;
  label: string;
  description: string;
}

const PRESET_ORDER: LogicLabPresetId[] = [
  'RANDOM_BASELINE',
  'LOW_TALENT_CD',
  'STANDARD_B_GRINDER',
  'HIGH_TALENT_AS',
];

const PRESET_META: Record<LogicLabPresetId, Omit<LogicLabPresetDefinition, 'id'>> = {
  RANDOM_BASELINE: {
    label: '無編集ランダム',
    description: '標準的な新弟子を基準に、自然なキャリア汚れを確認する。',
  },
  LOW_TALENT_CD: {
    label: '低素質 C/D',
    description: '負け越し常連と下位停滞の再現確認用。',
  },
  STANDARD_B_GRINDER: {
    label: '標準 B grinder',
    description: '3-4 / 4-3 周回層の可視化用。',
  },
  HIGH_TALENT_AS: {
    label: '上位素質 A/S',
    description: '厳格化後も上振れ経路が残るかを確認する。',
  },
};

const createRank = (
  division: Rank['division'],
  name: string,
  number?: number,
): Rank => ({
  division,
  name,
  side: 'East',
  ...(typeof number === 'number' ? { number } : {}),
});

const finalizeStatus = (
  status: RikishiStatus,
  careerBand: RikishiStatus['careerBand'],
): RikishiStatus => {
  const ability = resolveAbilityFromStats(status.stats, status.currentCondition, status.bodyMetrics);
  return {
    ...status,
    careerBand,
    ratingState: {
      ability,
      form: 0,
      uncertainty: 1.35,
      lastBashoExpectedWins: undefined,
    },
  };
};

const createBaseStatus = (
  input: {
    rank: Rank;
    age: number;
    aptitudeTier: RikishiStatus['aptitudeTier'];
    careerBand: RikishiStatus['careerBand'];
    bodyMetrics: RikishiStatus['bodyMetrics'];
    historyBonus: number;
    archetype: NonNullable<RikishiStatus['archetype']>;
  },
  rng: RandomSource,
): RikishiStatus => finalizeStatus(createInitialRikishi(
  {
    shikona: '検証山',
    age: input.age,
    startingRank: input.rank,
    archetype: input.archetype,
    aptitudeTier: input.aptitudeTier,
    aptitudeProfile: resolveAptitudeProfile(input.aptitudeTier),
    careerBand: input.careerBand,
    tactics: 'BALANCE',
    signatureMove: '寄り切り',
    bodyType: 'NORMAL',
    traits: [],
    historyBonus: input.historyBonus,
    profile: {
      realName: '検証 太郎',
      birthplace: '東京都',
      personality: 'CALM',
    },
    bodyMetrics: input.bodyMetrics,
    stableId: 'stable-001',
    ichimonId: 'TAIJU',
    stableArchetypeId: 'TRADITIONAL_LARGE',
  },
  rng,
), input.careerBand);

const FACTORIES: Record<LogicLabPresetId, (rng: RandomSource) => RikishiStatus> = {
  RANDOM_BASELINE: (rng) =>
    createBaseStatus(
      {
        rank: createRank('Jonokuchi', '序ノ口', 12),
        age: 17,
        aptitudeTier: 'B',
        careerBand: 'STANDARD',
        bodyMetrics: { heightCm: 181, weightKg: 132 },
        historyBonus: 0,
        archetype: 'HARD_WORKER',
      },
      rng,
    ),
  LOW_TALENT_CD: (rng) =>
    createBaseStatus(
      {
        rank: createRank('Jonidan', '序二段', 74),
        age: 19,
        aptitudeTier: rng() < 0.5 ? 'C' : 'D',
        careerBand: 'WASHOUT',
        bodyMetrics: { heightCm: 178, weightKg: 124 },
        historyBonus: -8,
        archetype: 'AVG_JOE',
      },
      rng,
    ),
  STANDARD_B_GRINDER: (rng) =>
    createBaseStatus(
      {
        rank: createRank('Sandanme', '三段目', 68),
        age: 20,
        aptitudeTier: 'B',
        careerBand: 'GRINDER',
        bodyMetrics: { heightCm: 182, weightKg: 137 },
        historyBonus: -2,
        archetype: 'HARD_WORKER',
      },
      rng,
    ),
  HIGH_TALENT_AS: (rng) =>
    createBaseStatus(
      {
        rank: createRank('Makushita', '幕下', 10),
        age: 20,
        aptitudeTier: rng() < 0.82 ? 'A' : 'S',
        careerBand: 'ELITE',
        bodyMetrics: { heightCm: 186, weightKg: 152 },
        historyBonus: 12,
        archetype: 'HIGH_SCHOOL_CHAMP',
      },
      rng,
    ),
};

export const LOGIC_LAB_DEFAULT_PRESET: LogicLabPresetId = 'RANDOM_BASELINE';

export const LOGIC_LAB_PRESETS: LogicLabPresetDefinition[] = PRESET_ORDER.map((id) => ({
  id,
  ...PRESET_META[id],
}));

export const resolveLogicLabPresetLabel = (presetId: LogicLabPresetId): string =>
  PRESET_META[presetId].label;

export const createLogicLabInitialStatus = (
  presetId: LogicLabPresetId,
  rng: RandomSource,
): RikishiStatus => FACTORIES[presetId](rng);
