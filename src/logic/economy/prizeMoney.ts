import {
  CareerPrizeBreakdown,
  CareerRewardSummary,
  PointConversionBreakdown,
  PrizeBreakdownEntry,
  RikishiStatus,
} from '../models';
import { PRIZE_MONEY, PRIZE_MONEY_AS_OF } from './prizeConfig';

export const POINT_CONVERSION_RULE_ID = 'yen-v1-2026-03-05';
export const POINT_CONVERSION_MAX = 400;

const hasPrize = (prizes: string[] | undefined, code: 'SHUKUN' | 'KANTO' | 'GINO'): boolean => {
  if (!prizes?.length) return false;
  if (code === 'SHUKUN') return prizes.includes('SHUKUN') || prizes.includes('殊勲賞');
  if (code === 'KANTO') return prizes.includes('KANTO') || prizes.includes('敢闘賞');
  return prizes.includes('GINO') || prizes.includes('技能賞');
};

const countDivisionYusho = (
  status: RikishiStatus,
): { sandanme: number; jonidan: number; jonokuchi: number } => {
  let sandanme = 0;
  let jonidan = 0;
  let jonokuchi = 0;
  for (const record of status.history.records) {
    if (!record.yusho) continue;
    if (record.rank.division === 'Sandanme') sandanme += 1;
    if (record.rank.division === 'Jonidan') jonidan += 1;
    if (record.rank.division === 'Jonokuchi') jonokuchi += 1;
  }
  return { sandanme, jonidan, jonokuchi };
};

const countSansho = (status: RikishiStatus): { shukun: number; kanto: number; gino: number } => {
  let shukun = 0;
  let kanto = 0;
  let gino = 0;
  for (const record of status.history.records) {
    if (hasPrize(record.specialPrizes, 'SHUKUN')) shukun += 1;
    if (hasPrize(record.specialPrizes, 'KANTO')) kanto += 1;
    if (hasPrize(record.specialPrizes, 'GINO')) gino += 1;
  }
  return { shukun, kanto, gino };
};

const toEntry = (
  key: PrizeBreakdownEntry['key'],
  label: string,
  unitYen: number,
  count: number,
): PrizeBreakdownEntry => ({
  key,
  label,
  unitYen,
  count,
  subtotalYen: unitYen * count,
});

export const calculateCareerPrizeBreakdown = (status: RikishiStatus): CareerPrizeBreakdown => {
  const { yushoCount } = status.history;
  const lower = countDivisionYusho(status);
  const sansho = countSansho(status);

  const entries: PrizeBreakdownEntry[] = [
    toEntry('MAKUUCHI_YUSHO', '幕内優勝', YEN.MAKUUCHI_YUSHO, yushoCount.makuuchi),
    toEntry('JURYO_YUSHO', '十両優勝', YEN.JURYO_YUSHO, yushoCount.juryo),
    toEntry('MAKUSHITA_YUSHO', '幕下優勝', YEN.MAKUSHITA_YUSHO, yushoCount.makushita),
    toEntry('SANDANME_YUSHO', '三段目優勝', YEN.SANDANME_YUSHO, lower.sandanme),
    toEntry('JONIDAN_YUSHO', '序二段優勝', YEN.JONIDAN_YUSHO, lower.jonidan),
    toEntry('JONOKUCHI_YUSHO', '序ノ口優勝', YEN.JONOKUCHI_YUSHO, lower.jonokuchi),
    toEntry('SHUKUN', '殊勲賞', YEN.SANSHO, sansho.shukun),
    toEntry('KANTO', '敢闘賞', YEN.SANSHO, sansho.kanto),
    toEntry('GINO', '技能賞', YEN.SANSHO, sansho.gino),
  ];
  const totalYen = entries.reduce((sum, entry) => sum + entry.subtotalYen, 0);
  const conversion = convertPrizeYenToPointsDetailed(totalYen);
  return {
    asOf: PRIZE_MONEY_AS_OF,
    totalYen,
    entries,
    conversion,
  };
};

const YEN = {
  MAKUUCHI_YUSHO: PRIZE_MONEY.MAKUUCHI_YUSHO,
  JURYO_YUSHO: PRIZE_MONEY.JURYO_YUSHO,
  MAKUSHITA_YUSHO: PRIZE_MONEY.MAKUSHITA_YUSHO,
  SANDANME_YUSHO: PRIZE_MONEY.SANDANME_YUSHO,
  JONIDAN_YUSHO: PRIZE_MONEY.JONIDAN_YUSHO,
  JONOKUCHI_YUSHO: PRIZE_MONEY.JONOKUCHI_YUSHO,
  SANSHO: PRIZE_MONEY.SANSHO,
} as const;

export const convertPrizeYenToPointsDetailed = (totalYen: number): PointConversionBreakdown => {
  const tier1Yen = Math.min(totalYen, 5_000_000);
  const tier2Yen = Math.min(Math.max(totalYen - 5_000_000, 0), 15_000_000);
  const tier3Yen = Math.max(totalYen - 20_000_000, 0);

  const tier1Pt = Math.floor(tier1Yen / 100_000);
  const tier2Pt = Math.floor(tier2Yen / 200_000);
  const tier3Pt = Math.floor(tier3Yen / 500_000);
  const rawPoints = tier1Pt + tier2Pt + tier3Pt;
  const cappedPt = Math.max(0, Math.min(POINT_CONVERSION_MAX, rawPoints));

  return {
    tier1Yen,
    tier1Pt,
    tier2Yen,
    tier2Pt,
    tier3Yen,
    tier3Pt,
    rawPoints,
    cappedPt,
  };
};

export const convertPrizeYenToPoints = (totalYen: number): number => {
  return convertPrizeYenToPointsDetailed(totalYen).cappedPt;
};

export const buildCareerRewardSummary = (breakdown: CareerPrizeBreakdown): CareerRewardSummary => ({
  conversionRuleId: POINT_CONVERSION_RULE_ID,
  rawPoints: breakdown.conversion.rawPoints,
  awardedPoints: breakdown.conversion.cappedPt,
  convertedPoints: breakdown.conversion.cappedPt,
  granted: false,
});
