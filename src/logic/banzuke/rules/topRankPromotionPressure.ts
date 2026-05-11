export interface TopRankPopulationContext {
  currentYokozunaCount?: number;
  currentOzekiCount?: number;
}

export const resolveYokozunaPromotionPressure = (
  currentYokozunaCount?: number,
): number => {
  if (currentYokozunaCount == null) return 0;
  if (currentYokozunaCount <= 0) return -0.5;
  if (currentYokozunaCount === 1) return -0.25;
  if (currentYokozunaCount <= 3) return 0;
  if (currentYokozunaCount === 4) return 0.25;
  if (currentYokozunaCount === 5) return 0.5;
  return 0.75;
};

export const resolveOzekiPromotionPressure = (
  currentOzekiCount?: number,
): number => {
  if (currentOzekiCount == null) return 0;
  if (currentOzekiCount <= 1) return -0.5;
  if (currentOzekiCount <= 3) return 0;
  if (currentOzekiCount === 4) return 1;
  return 2;
};
