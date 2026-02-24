import { createInitialRikishi } from '../../logic/initialization';
import { Rank, RikishiStatus, Trait } from '../../logic/models';
import { resolveAbilityFromStats } from '../../logic/simulation/strength/model';
import { LogicLabPresetId } from './types';

type RandomSource = () => number;

export interface LogicLabPresetDefinition {
  id: LogicLabPresetId;
  label: string;
  description: string;
}

const PRESET_ORDER: LogicLabPresetId[] = [
  'M8_BALANCED',
  'J2_MONSTER',
  'JK_MONSTER',
  'K_BALANCED',
  'SD70_MIX',
  'JD70_MIX',
];

const PRESET_META: Record<LogicLabPresetId, Omit<LogicLabPresetDefinition, 'id'>> = {
  M8_BALANCED: {
    label: '幕内8枚目・均衡',
    description: '前頭8枚目・標準型。中盤帯の挙動確認用。',
  },
  J2_MONSTER: {
    label: '十両2枚目・怪物',
    description: '十両上位・高能力。昇進レーン検証用。',
  },
  JK_MONSTER: {
    label: '序ノ口・怪物',
    description: '序ノ口筆頭・超高能力。下位からの急上昇検証用。',
  },
  K_BALANCED: {
    label: '小結・均衡',
    description: '小結・標準上位。三役帯の変動確認用。',
  },
  SD70_MIX: {
    label: '三段目70枚目・混合',
    description: '三段目70枚目。下位大幅変動確認用。',
  },
  JD70_MIX: {
    label: '序二段70枚目・混合',
    description: '序二段70枚目。下位帯ランダム性確認用。',
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

const applyBaseStats = (
  status: RikishiStatus,
  base: number,
  traits: Trait[],
  targetAbility?: number,
): RikishiStatus => {
  const stats: RikishiStatus['stats'] = {
    tsuki: base,
    oshi: base,
    kumi: base,
    nage: base,
    koshi: base,
    deashi: base,
    waza: base,
    power: base,
  };
  const derivedAbility = resolveAbilityFromStats(stats, status.currentCondition, status.bodyMetrics);
  return {
    ...status,
    stats,
    traits,
    ratingState: {
      ability: targetAbility ?? derivedAbility,
      form: 0,
      uncertainty: status.ratingState?.uncertainty ?? 1.1,
      lastBashoExpectedWins: status.ratingState?.lastBashoExpectedWins,
    },
  };
};

const createPresetStatus = (
  rank: Rank,
  base: number,
  traits: Trait[],
  targetAbility: number,
  rng: RandomSource,
): RikishiStatus => {
  const status = createInitialRikishi(
    {
      shikona: '検証山',
      age: 22,
      startingRank: rank,
      archetype: 'HARD_WORKER',
      tactics: 'BALANCE',
      signatureMove: '寄り切り',
      bodyType: 'NORMAL',
      traits: [],
      historyBonus: 0,
      profile: {
        realName: '検証 太郎',
        birthplace: '東京都',
        personality: 'CALM',
      },
      bodyMetrics: {
        heightCm: 183,
        weightKg: 146,
      },
    },
    rng,
  );
  return applyBaseStats(status, base, traits, targetAbility);
};

const FACTORIES: Record<LogicLabPresetId, (rng: RandomSource) => RikishiStatus> = {
  M8_BALANCED: (rng) => createPresetStatus(createRank('Makuuchi', '前頭', 8), 156, [], 132, rng),
  J2_MONSTER: (rng) =>
    createPresetStatus(createRank('Juryo', '十両', 2), 176, ['HEAVY_PRESSURE', 'CLUTCH_REVERSAL'], 145, rng),
  JK_MONSTER: (rng) =>
    createPresetStatus(createRank('Jonokuchi', '序ノ口', 1), 186, ['OPENING_DASH', 'TRAILING_FIRE'], 152, rng),
  K_BALANCED: (rng) =>
    createPresetStatus(createRank('Makuuchi', '小結'), 168, ['READ_THE_BOUT'], 138, rng),
  SD70_MIX: (rng) =>
    createPresetStatus(createRank('Sandanme', '三段目', 70), 132, ['TRAILING_FIRE'], 92, rng),
  JD70_MIX: (rng) =>
    createPresetStatus(createRank('Jonidan', '序二段', 70), 118, ['OPENING_DASH'], 80, rng),
};

export const LOGIC_LAB_DEFAULT_PRESET: LogicLabPresetId = 'M8_BALANCED';

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
