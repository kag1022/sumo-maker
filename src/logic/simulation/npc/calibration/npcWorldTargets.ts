/**
 * Real-data target distribution for NPC world generation/career/retirement.
 *
 * Sourced from:
 * - docs/realdata_integration/career_reality_gap_report.md (Heisei cohort, sample=7867)
 * - sumo-api-db/data/analysis/basho_records_sumo_api_196007_202603.json
 *
 * Numbers are rounded to 4 decimal places where applicable. Career-basho
 * targets (mean, p10, p50, p90) come directly from the C_career section.
 * Division tenure p50s come from the D_tenure section.
 */

export interface NpcWorldTargetDistribution {
  /** Highest-rank reach rates over a full career cohort. */
  reachRates: {
    juryo: number;
    makuuchi: number;
    sanyaku: number;
    ozeki: number;
    yokozuna: number;
  };
  /** Highest-rank bucket exclusive distribution (sums to ~1). */
  highestBucket: {
    yokozuna: number;
    ozeki: number;
    sanyaku: number;
    maegashira: number;
    juryo: number;
    makushita: number;
    sandanme: number;
    jonidan: number;
    jonokuchi: number;
  };
  /** Career length in number of bashos served (across all divisions). */
  careerBashos: {
    mean: number;
    p10: number;
    p50: number;
    p90: number;
    /** Fraction of cohort with strictly fewer than 12 bashos served. */
    underTwelveRatio: number;
  };
  /** Division tenure p50 in bashos (median time spent in a division). */
  divisionTenureP50: {
    jonokuchi: number;
    jonidan: number;
    sandanme: number;
    makushita: number;
    juryo: number;
    makuuchi: number;
  };
}

export const NPC_WORLD_TARGET_DISTRIBUTION_REALDATA_V1: NpcWorldTargetDistribution = {
  reachRates: {
    juryo: 0.0910,
    makuuchi: 0.0566,
    sanyaku: 0.0258,
    ozeki: 0.0076,
    yokozuna: 0.0036,
  },
  highestBucket: {
    yokozuna: 0.0036,
    ozeki: 0.0041,
    sanyaku: 0.0182,
    maegashira: 0.0308,
    juryo: 0.0344,
    makushita: 0.2012,
    sandanme: 0.2427,
    jonidan: 0.3272,
    jonokuchi: 0.1379,
  },
  careerBashos: {
    mean: 30.6,
    p10: 2,
    p50: 21,
    p90: 75,
    underTwelveRatio: 0.3592,
  },
  divisionTenureP50: {
    jonokuchi: 2,
    jonidan: 10,
    sandanme: 13,
    makushita: 14,
    juryo: 11,
    makuuchi: 25,
  },
};
