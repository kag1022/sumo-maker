import type {
  EntryArchetype,
  GrowthType,
  StyleArchetype,
} from '../../logic/models';
import type { ScoutTalentProfile } from '../../logic/scout/gacha';
import type { StableEnvironmentChoiceId } from '../../logic/simulation/heya/stableEnvironment';

export interface ObservationBuildModeCostInput {
  growthType?: GrowthType;
  preferredStyle?: StyleArchetype;
  entryArchetype?: EntryArchetype;
  talentProfile: ScoutTalentProfile;
  stableEnvironmentChoiceId: StableEnvironmentChoiceId;
}

export const GROWTH_TYPE_BUILD_COST: Record<GrowthType, number> = {
  EARLY: 5,
  NORMAL: 2,
  LATE: 8,
  GENIUS: 18,
};

export const STYLE_BUILD_COST: Record<StyleArchetype, number> = {
  YOTSU: 4,
  TSUKI_OSHI: 6,
  MOROZASHI: 6,
  DOHYOUGIWA: 5,
  NAGE_TECH: 7,
  POWER_PRESSURE: 8,
};

export const ENTRY_ARCHETYPE_BUILD_COST: Record<EntryArchetype, number> = {
  ORDINARY_RECRUIT: 0,
  EARLY_PROSPECT: 4,
  TSUKEDASHI: 10,
  ELITE_TSUKEDASHI: 18,
  MONSTER: 24,
};

export const TALENT_PROFILE_BUILD_COST: Record<ScoutTalentProfile, number> = {
  AUTO: 0,
  STANDARD: 2,
  PROMISING: 12,
  GENIUS: 25,
};

export const STABLE_ENVIRONMENT_BUILD_COST = 3;

export const computeObservationBuildModeCost = (input: ObservationBuildModeCostInput): number => {
  let total = 0;
  if (input.growthType) total += GROWTH_TYPE_BUILD_COST[input.growthType];
  if (input.preferredStyle) total += STYLE_BUILD_COST[input.preferredStyle];
  if (input.entryArchetype) total += ENTRY_ARCHETYPE_BUILD_COST[input.entryArchetype];
  total += TALENT_PROFILE_BUILD_COST[input.talentProfile];
  if (input.stableEnvironmentChoiceId !== 'AUTO') total += STABLE_ENVIRONMENT_BUILD_COST;
  return total;
};
