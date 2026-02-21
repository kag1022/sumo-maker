import {
  BasicProfile,
  BodyMetrics,
  BodyType,
  EntryDivision,
  GrowthType,
  Rank,
  RikishiStatus,
  TacticsType,
  TalentArchetype,
  Trait,
} from './models';
import { CONSTANTS } from './constants';

export interface CreateInitialRikishiParams {
  shikona: string;
  age: number;
  startingRank: Rank;
  archetype: TalentArchetype;
  tactics: TacticsType;
  signatureMove: string;
  bodyType: BodyType;
  traits: Trait[];
  historyBonus: number;
  entryDivision?: EntryDivision;
  growthType?: GrowthType;
  profile?: BasicProfile;
  bodyMetrics?: BodyMetrics;
}

const DEFAULT_PROFILE: BasicProfile = {
  realName: '',
  birthplace: '',
  personality: 'CALM',
};

const DEFAULT_BODY_METRICS: Record<BodyType, BodyMetrics> = {
  NORMAL: { heightCm: 182, weightKg: 138 },
  SOPPU: { heightCm: 186, weightKg: 124 },
  ANKO: { heightCm: 180, weightKg: 162 },
  MUSCULAR: { heightCm: 184, weightKg: 152 },
};

export const createInitialRikishi = (params: CreateInitialRikishiParams): RikishiStatus => {
  const archData = CONSTANTS.TALENT_ARCHETYPES[params.archetype];
  const [minPot, maxPot] = archData.potentialRange;
  const potential = minPot + Math.floor(Math.random() * (maxPot - minPot + 1));

  const stats: RikishiStatus['stats'] = {
    tsuki: 20,
    oshi: 20,
    kumi: 20,
    nage: 20,
    koshi: 20,
    deashi: 20,
    waza: 20,
    power: 20,
  };

  const baseBonus = archData.initialStatBonus + params.historyBonus;
  (Object.keys(stats) as (keyof typeof stats)[]).forEach((k) => {
    stats[k] += baseBonus;
  });

  const tacticMods = CONSTANTS.TACTICAL_GROWTH_MODIFIERS[params.tactics];
  (Object.keys(stats) as (keyof typeof stats)[]).forEach((k) => {
    if (tacticMods[k] > 1.0) {
      stats[k] += 10;
    } else if (tacticMods[k] < 1.0) {
      stats[k] -= 5;
    }
  });

  (Object.keys(stats) as (keyof typeof stats)[]).forEach((k) => {
    stats[k] += Math.floor(Math.random() * 11) - 5;
    stats[k] = Math.max(1, stats[k]);
  });

  const entryDivision =
    params.entryDivision && params.entryDivision !== 'Maezumo'
      ? params.entryDivision
      : undefined;

  return {
    heyaId: 'my-heya',
    shikona: params.shikona,
    entryAge: params.age,
    age: params.age,
    rank: { ...params.startingRank },
    stats,
    potential,
    growthType: params.growthType ?? 'NORMAL',
    archetype: params.archetype,
    entryDivision,
    tactics: params.tactics,
    signatureMoves: [params.signatureMove],
    bodyType: params.bodyType,
    profile: params.profile ? { ...params.profile } : { ...DEFAULT_PROFILE },
    bodyMetrics: params.bodyMetrics
      ? { ...params.bodyMetrics }
      : { ...DEFAULT_BODY_METRICS[params.bodyType] },
    traits: [...params.traits],
    durability: 80,
    currentCondition: 50,
    injuryLevel: 0,
    injuries: [],
    isOzekiKadoban: false,
    isOzekiReturn: false,
    history: {
      records: [],
      events: [],
      maxRank: { ...params.startingRank },
      totalWins: 0,
      totalLosses: 0,
      totalAbsent: 0,
      yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
      kimariteTotal: {},
    },
    statHistory: [],
  };
};
