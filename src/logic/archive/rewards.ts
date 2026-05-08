import type { ArchiveCategoryId, CareerTitle, CareerTitleTier } from './types';

export const ARCHIVE_REWARD_CAP = 8;

export interface ArchiveRewardBreakdown {
  newEntry: number;
  newCategories: number;
  rareTitle: number;
  epicTitle: number;
  legendaryTitle: number;
}

export interface ArchiveRewardResult {
  delta: number;
  breakdown: ArchiveRewardBreakdown;
}

const tierRank: Record<CareerTitleTier, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

export const computeArchiveReward = (params: {
  isFirstEntry: boolean;
  newCategories: ArchiveCategoryId[];
  titles: CareerTitle[];
}): ArchiveRewardResult => {
  const breakdown: ArchiveRewardBreakdown = {
    newEntry: params.isFirstEntry ? 1 : 0,
    newCategories: params.newCategories.length * 2,
    rareTitle: 0,
    epicTitle: 0,
    legendaryTitle: 0,
  };

  let highestTier = -1;
  for (const t of params.titles) {
    const r = tierRank[t.tier];
    if (r > highestTier) highestTier = r;
  }

  // Award only the highest tier reward to avoid stacking.
  if (highestTier >= tierRank.legendary) breakdown.legendaryTitle = 8;
  else if (highestTier >= tierRank.epic) breakdown.epicTitle = 5;
  else if (highestTier >= tierRank.rare) breakdown.rareTitle = 3;

  const sum =
    breakdown.newEntry +
    breakdown.newCategories +
    breakdown.rareTitle +
    breakdown.epicTitle +
    breakdown.legendaryTitle;

  return { delta: Math.min(ARCHIVE_REWARD_CAP, sum), breakdown };
};
