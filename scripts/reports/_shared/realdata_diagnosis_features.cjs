// Extended career feature extractor for realdata-career-diagnosis-bundle.
// READ-ONLY: only reads observation result; no logic changes.
//
// Returns the same per-career features that the real-data aggregator
// computes per rikishi (highest-rank bucket, first-reach indices,
// division residence, per-division win/loss/kachikoshi, 7-bout/15-bout
// wins distribution) PLUS the sim-only initial-population fields
// (aptitudeTier, careerBand, growthType, retirementProfile, entryPath,
// bodyType, temperament, entryAge, genome ceiling/durability, traits).
'use strict';

const SANYAKU_RANK_NAMES = new Set(['横綱', '大関', '関脇', '小結']);

const recordHighestBucket = (record) => {
  const rank = record.rank;
  if (!rank) return null;
  const div = rank.division;
  const name = rank.name;
  if (div === 'Makuuchi') {
    if (name === '横綱') return '横綱';
    if (name === '大関') return '大関';
    if (name === '関脇' || name === '小結') return '三役';
    return '前頭';
  }
  if (div === 'Juryo') return '十両';
  if (div === 'Makushita') return '幕下';
  if (div === 'Sandanme') return '三段目';
  if (div === 'Jonidan') return '序二段';
  if (div === 'Jonokuchi') return '序ノ口';
  return null;
};

const HIGHEST_BUCKETS = ['横綱', '大関', '三役', '前頭', '十両', '幕下', '三段目', '序二段', '序ノ口'];
const bucketIndex = (bucket) => {
  const idx = HIGHEST_BUCKETS.indexOf(bucket);
  return idx < 0 ? -1 : (HIGHEST_BUCKETS.length - 1 - idx);
};

const extractRealdataDiagnosisFeatures = (result) => {
  const summary = result.summary;
  const finalStatus = result.finalStatus;
  const records = finalStatus?.history?.records ?? [];

  const divisionCounts = {
    Makuuchi: 0, Juryo: 0, Makushita: 0, Sandanme: 0, Jonidan: 0, Jonokuchi: 0, Maezumo: 0,
  };
  const divisionWins = {
    Makuuchi: 0, Juryo: 0, Makushita: 0, Sandanme: 0, Jonidan: 0, Jonokuchi: 0,
  };
  const divisionLosses = {
    Makuuchi: 0, Juryo: 0, Makushita: 0, Sandanme: 0, Jonidan: 0, Jonokuchi: 0,
  };
  const divisionKachikoshi = {
    Makuuchi: 0, Juryo: 0, Makushita: 0, Sandanme: 0, Jonidan: 0, Jonokuchi: 0,
  };
  const divisionBoutBashos = {
    Makuuchi: 0, Juryo: 0, Makushita: 0, Sandanme: 0, Jonidan: 0, Jonokuchi: 0,
  };
  const lower7Wins = {};
  const sek15Wins = {};

  let totalWins = 0;
  let totalLosses = 0;
  let totalAbsences = 0;

  let bestBucketIdx = -1;
  let bestBucket = null;
  const firstReach = {
    makushita: null, juryo: null, makuuchi: null,
    sanyaku: null, ozeki: null, yokozuna: null,
  };

  for (let i = 0; i < records.length; i += 1) {
    const r = records[i];
    const rank = r.rank;
    if (!rank) continue;
    const div = rank.division;
    if (divisionCounts[div] != null) divisionCounts[div] += 1;
    const wins = r.wins || 0;
    const losses = r.losses || 0;
    const absences = r.absences || 0;
    totalWins += wins;
    totalLosses += losses;
    totalAbsences += absences;
    if (divisionWins[div] != null) {
      divisionWins[div] += wins;
      divisionLosses[div] += losses;
      if (wins + losses > 0) {
        divisionBoutBashos[div] += 1;
        if (wins > losses) divisionKachikoshi[div] += 1;
      }
    }
    if (div === 'Makuuchi' || div === 'Juryo') {
      if (wins + losses + absences > 0) sek15Wins[wins] = (sek15Wins[wins] || 0) + 1;
    } else if (div === 'Makushita' || div === 'Sandanme' || div === 'Jonidan' || div === 'Jonokuchi') {
      if (wins + losses > 0) lower7Wins[wins] = (lower7Wins[wins] || 0) + 1;
    }

    const bucket = recordHighestBucket(r);
    if (bucket) {
      const idx = bucketIndex(bucket);
      if (idx > bestBucketIdx) {
        bestBucketIdx = idx;
        bestBucket = bucket;
      }
    }

    if (firstReach.makushita == null && (div === 'Makushita' || div === 'Juryo' || div === 'Makuuchi')) {
      firstReach.makushita = i + 1;
    }
    if (firstReach.juryo == null && (div === 'Juryo' || div === 'Makuuchi')) {
      firstReach.juryo = i + 1;
    }
    if (firstReach.makuuchi == null && div === 'Makuuchi') {
      firstReach.makuuchi = i + 1;
    }
    if (div === 'Makuuchi') {
      const name = rank.name;
      if (firstReach.sanyaku == null && SANYAKU_RANK_NAMES.has(name)) firstReach.sanyaku = i + 1;
      if (firstReach.ozeki == null && (name === '大関' || name === '横綱')) firstReach.ozeki = i + 1;
      if (firstReach.yokozuna == null && name === '横綱') firstReach.yokozuna = i + 1;
    }
  }

  const careerBasho = records.length;
  const totalBouts = totalWins + totalLosses;
  const careerWinRate = totalBouts > 0 ? totalWins / totalBouts : null;

  // sim-only initial-population fields
  const initial = summary.initialPopulation || {};
  const genome = finalStatus?.genome;
  const genomeCeilings = (() => {
    if (!genome) return null;
    const b = genome.base ?? {};
    const arr = [b.powerCeiling, b.techCeiling, b.speedCeiling, b.ringSense, b.styleFit].filter(Number.isFinite);
    if (!arr.length) return null;
    const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
    return {
      averageCeiling: Math.round(avg),
      maxCeiling: Math.max(...arr),
      minCeiling: Math.min(...arr),
    };
  })();
  const styleRelevantCeiling = (() => {
    if (!genome) return null;
    const b = genome.base ?? {};
    const tactics = finalStatus?.tactics ?? 'BALANCE';
    const pc = b.powerCeiling ?? 0, tc = b.techCeiling ?? 0, sc = b.speedCeiling ?? 0;
    const rs = b.ringSense ?? 0, sf = b.styleFit ?? 0;
    if (tactics === 'PUSH') return Math.round(pc * 0.40 + sc * 0.35 + tc * 0.15 + rs * 0.05 + sf * 0.05);
    if (tactics === 'GRAPPLE') return Math.round(pc * 0.30 + tc * 0.25 + rs * 0.25 + sc * 0.10 + sf * 0.10);
    if (tactics === 'TECHNIQUE') return Math.round(tc * 0.35 + rs * 0.30 + sc * 0.20 + pc * 0.10 + sf * 0.05);
    if (genomeCeilings) return genomeCeilings.averageCeiling;
    return null;
  })();
  const durabilityScore = (() => {
    const d = genome?.durability ?? {};
    if (!Number.isFinite(d.baseInjuryRisk) || !Number.isFinite(d.recoveryRate)) return null;
    return Math.round(100 * (1 / Math.max(0.3, d.baseInjuryRisk)) * d.recoveryRate);
  })();
  const traits = finalStatus?.traits ?? [];
  const hasTetsujin = traits.includes('TETSUJIN');
  const hasIronman = finalStatus?.retirementProfile === 'IRONMAN';
  const hasHighDurability = durabilityScore != null && durabilityScore >= 130;

  return {
    seed: summary.seed,
    careerBasho,
    totalWins,
    totalLosses,
    totalAbsences,
    careerWinRate,
    highestRankBucket: bestBucket,
    firstReach,
    reachedMakushita: firstReach.makushita != null,
    reachedJuryo: firstReach.juryo != null,
    reachedMakuuchi: firstReach.makuuchi != null,
    reachedSanyaku: firstReach.sanyaku != null,
    reachedOzeki: firstReach.ozeki != null,
    reachedYokozuna: firstReach.yokozuna != null,
    divisionCounts,
    divisionWins,
    divisionLosses,
    divisionKachikoshi,
    divisionBoutBashos,
    lower7Wins,
    sek15Wins,
    // sim-only
    aptitudeTier: summary.aptitudeTier,
    entryPath: initial.entryPath,
    entryAge: initial.entryAge,
    bodyType: initial.bodyType,
    temperament: initial.temperament,
    careerBandLabel: initial.careerBandLabel,
    careerBand: finalStatus?.careerBand,
    growthType: finalStatus?.growthType,
    retirementProfile: finalStatus?.retirementProfile,
    archetype: finalStatus?.archetype,
    tactics: finalStatus?.tactics ?? 'BALANCE',
    hasTetsujin,
    hasIronman,
    hasHighDurability,
    genomeAverageCeiling: genomeCeilings?.averageCeiling ?? null,
    styleRelevantCeiling,
    durabilityScore,
    retirementReasonCode: summary.careerOutcome?.retirementReasonCode || 'OTHER',
    retiredAfterKachikoshi: !!summary.careerOutcome?.retiredAfterKachikoshi,
    retireAge: summary.careerOutcome?.retireAge,
  };
};

module.exports = {
  extractRealdataDiagnosisFeatures,
  HIGHEST_BUCKETS,
  bucketIndex,
};
