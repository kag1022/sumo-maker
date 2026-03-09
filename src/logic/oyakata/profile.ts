import { Oyakata, OyakataProfile, RikishiStatus, Trait } from '../models';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const buildTraitLabel = (status: RikishiStatus): string => {
  const topTrait = status.traits[0];
  if (!topTrait) return '経験則';
  return topTraitToLabel(topTrait);
};

const topTraitToLabel = (trait: Trait): string => {
  const map: Partial<Record<Trait, string>> = {
    TETSUJIN: '鉄壁育成',
    OOBUTAI_NO_ONI: '勝負師育成',
    KEIKO_NO_MUSHI: '猛稽古育成',
    KYOUSHINZOU: '胆力育成',
    RECOVERY_MONSTER: '回復重視育成',
  };
  return map[trait] ?? '技能継承';
};

const pickTopStats = (status: RikishiStatus): Array<keyof RikishiStatus['stats']> => {
  return (Object.entries(status.stats) as Array<[keyof RikishiStatus['stats'], number]>)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([key]) => key);
};

const resolveLegacyStars = (status: RikishiStatus): 1 | 2 | 3 | 4 | 5 => {
  const rank = status.history.maxRank.name;
  if (rank === '横綱') return 5;
  if (rank === '大関') return 4;
  if (rank === '関脇' || rank === '小結') return 3;
  if (rank === '前頭') return 2;
  return 1;
};

const normalizeGrowthModBudget = (
  growthMod: Oyakata['growthMod'],
  budget: number,
): Oyakata['growthMod'] => {
  const entries = Object.entries(growthMod);
  const used = entries.reduce((sum, [, value]) => sum + Math.abs(value - 1.0), 0);
  if (used <= budget || entries.length === 0) return growthMod;
  const scale = budget / used;
  const next: Oyakata['growthMod'] = {};
  for (const [key, value] of entries) {
    const normalized = 1 + (value - 1) * scale;
    next[key] = clamp(normalized, 0.92, 1.12);
  }
  return next;
};

export const deriveOyakataProfile = (
  sourceCareerId: string,
  status: RikishiStatus,
): OyakataProfile => {
  const topStats = pickTopStats(status);
  const legacyStars = resolveLegacyStars(status);
  const primaryBoost = clamp(1.05 + legacyStars * 0.015, 1.05, 1.12);
  const secondaryBoost = clamp(1.03 + legacyStars * 0.01, 1.03, 1.09);
  const growthMod: Oyakata['growthMod'] = {};
  if (topStats[0]) {
    growthMod[topStats[0]] = primaryBoost;
  }
  if (topStats[1]) {
    growthMod[topStats[1]] = secondaryBoost;
  }

  const totalBasho = Math.max(1, status.history.records.length);
  const absenceRate = status.history.totalAbsent / (totalBasho * 15);
  const injuryMod = clamp(1.0 + absenceRate * 0.2, 0.9, 1.05);
  const normalizedGrowthMod = normalizeGrowthModBudget(growthMod, 0.3);

  return {
    id: `oyakata:${sourceCareerId}`,
    sourceCareerId,
    shikona: status.shikona,
    displayName: `${status.shikona}親方`,
    trait: buildTraitLabel(status),
    growthMod: normalizedGrowthMod,
    injuryMod,
    maxRank: status.history.maxRank,
    legacyStars,
  };
};

export const toOyakata = (profile: OyakataProfile): Oyakata => ({
  id: profile.id,
  name: profile.displayName,
  trait: profile.trait,
  growthMod: normalizeGrowthModBudget(profile.growthMod, 0.3),
  injuryMod: clamp(profile.injuryMod, 0.9, 1.05),
});
