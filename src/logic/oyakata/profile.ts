import { Oyakata, OyakataProfile, RikishiStatus, StyleArchetype, Trait } from '../models';
import { STYLE_LABELS } from '../phaseA';

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

const resolveSekitoriExperience = (status: RikishiStatus): boolean =>
  status.history.records.some((record) => record.rank.division === 'Makuuchi' || record.rank.division === 'Juryo')
  || status.history.maxRank.division === 'Makuuchi'
  || status.history.maxRank.division === 'Juryo';

const resolveOyakataEligibility = (status: RikishiStatus): boolean => {
  if (!resolveSekitoriExperience(status)) return false;
  const makuuchiBasho = status.history.records.filter((record) => record.rank.division === 'Makuuchi').length;
  const sansho = status.history.records.reduce((sum, record) => sum + (record.specialPrizes?.length ?? 0), 0);
  const sekitoriBasho = status.history.records.filter((record) =>
    record.rank.division === 'Makuuchi' || record.rank.division === 'Juryo').length;
  const totalYusho =
    status.history.yushoCount.makuuchi +
    status.history.yushoCount.juryo +
    status.history.yushoCount.makushita +
    status.history.yushoCount.others;
  return makuuchiBasho >= 6 || totalYusho >= 1 || sansho >= 1 || sekitoriBasho >= 30;
};

const resolveSecretStyle = (status: RikishiStatus): StyleArchetype | undefined =>
  status.realizedStyleProfile?.dominant ?? status.designedStyleProfile?.dominant;

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
): OyakataProfile | undefined => {
  if (!resolveOyakataEligibility(status)) return undefined;
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
    trait: `${buildTraitLabel(status)}${resolveSecretStyle(status) ? ` / ${STYLE_LABELS[resolveSecretStyle(status)!]}` : ''}`,
    secretStyle: resolveSecretStyle(status),
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
  secretStyle: profile.secretStyle,
  growthMod: normalizeGrowthModBudget(profile.growthMod, 0.3),
  injuryMod: clamp(profile.injuryMod, 0.9, 1.05),
  spiritMods: {
    injuryPenalty: 1,
    slumpPenalty: 1,
    promotionBonus: 1 + profile.legacyStars * 0.01,
  },
});
