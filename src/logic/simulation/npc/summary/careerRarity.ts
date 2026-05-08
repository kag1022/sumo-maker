import type { Rank } from "../../../models";
import type { CareerRaritySummary, RarityTier } from "./types";

// Real-data reach rates from docs/realdata_integration/career_reality_gap_report.md (A_reach).
// These are intentionally hard-coded so the browser does not need to import the large JSON.
const REACH_RATES = {
  yokozuna: 0.0036,
  ozeki: 0.0076,
  sanyaku: 0.0258,
  makuuchi: 0.0566,
  juryo: 0.091,
  makushita: 0.25,
} as const;

const formatPercent = (rate: number): string => {
  if (rate >= 0.1) return `約${(rate * 100).toFixed(0)}%`;
  if (rate >= 0.01) return `約${(rate * 100).toFixed(1)}%`;
  return `約${(rate * 100).toFixed(2)}%`;
};

const isSanyakuName = (name: string): boolean => name === "関脇" || name === "小結";

export const buildCareerRaritySummary = (maxRank: Rank): CareerRaritySummary => {
  const { division, name } = maxRank;
  const reasonCodes: string[] = [];
  let bucket = "三段目以下";
  let rate: number | null = null;
  let tier: RarityTier = "common";
  let title = "入門者";
  // positionText: ユーザー向けの自然文。実データ参照外は使わない。
  let positionText = "一般的な下位キャリア";

  if (name === "横綱") {
    bucket = "横綱";
    rate = REACH_RATES.yokozuna;
    tier = "legendary";
    title = "歴代横綱に名を連ねた者";
    positionText = `歴史に残る級のキャリア (実データ上位 ${formatPercent(rate)})`;
  } else if (name === "大関") {
    bucket = "大関";
    rate = REACH_RATES.ozeki;
    tier = "legendary";
    title = "大関に到達した者";
    positionText = `歴史に残る級のキャリア (実データ上位 ${formatPercent(rate)})`;
  } else if (isSanyakuName(name)) {
    bucket = "三役";
    rate = REACH_RATES.sanyaku;
    tier = "elite";
    title = "三役の壁を越えた者";
    positionText = `上位数%の三役到達キャリア (実データ上位 ${formatPercent(rate)})`;
  } else if (division === "Makuuchi") {
    bucket = "幕内";
    rate = REACH_RATES.makuuchi;
    tier = "elite";
    title = "幕内到達者";
    positionText = `上位数%の幕内到達キャリア (実データ上位 ${formatPercent(rate)})`;
  } else if (division === "Juryo") {
    bucket = "十両";
    rate = REACH_RATES.juryo;
    tier = "rare";
    title = "関取到達者";
    positionText = `珍しい関取到達キャリア (実データ上位 ${formatPercent(rate)})`;
  } else if (division === "Makushita") {
    bucket = "幕下";
    rate = REACH_RATES.makushita;
    tier = "uncommon";
    title = "幕下で関取を狙った者";
    positionText = `関取まであと一歩のキャリア (実データ上位 ${formatPercent(rate)})`;
  } else if (division === "Sandanme") {
    bucket = "三段目";
    tier = "common";
    title = "三段目の挑戦者";
    positionText = "一般的な下位キャリア";
  } else if (division === "Jonidan") {
    bucket = "序二段";
    tier = "common";
    title = "序二段で土俵を重ねた者";
    positionText = "下位番付で戦い続けたキャリア";
  } else if (division === "Jonokuchi") {
    bucket = "序ノ口";
    tier = "common";
    title = "短期で土俵を去った者";
    positionText = "短いキャリア";
  } else {
    // Maezumo or unknown
    bucket = "前相撲";
    tier = "common";
    title = "土俵に上がった者";
    positionText = "ごく短いキャリア";
  }

  reasonCodes.push(title);

  return {
    highestRankLabel: maxRank.number ? `${name}${maxRank.number}` : name,
    highestRankBucket: bucket,
    realDataPercentileText: positionText,
    rarityTier: tier,
    reasonCodes,
  };
};

// User-facing rarity tier label (Japanese).
export const RARITY_TIER_LABEL: Record<RarityTier, string> = {
  common: "一般的な下位キャリア",
  uncommon: "関取まであと一歩のキャリア",
  rare: "珍しい関取到達キャリア",
  elite: "上位数%の幕内到達キャリア",
  legendary: "歴史に残る級のキャリア",
};
