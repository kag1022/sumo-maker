// Per-career diagnostic feature extractor.
// No simulation logic; only reads the observation result frames + status history.
// Pure read-only diagnostics for pipeline / washout analysis.

const MAKUSHITA_UPPER_LIMIT = 5;

const divisionOf = (rank) => (rank && rank.division) || 'Unknown';
const isJuryo = (rank) => divisionOf(rank) === 'Juryo';
const isMakuuchi = (rank) => divisionOf(rank) === 'Makuuchi';
const isMakushita = (rank) => divisionOf(rank) === 'Makushita';
const isSandanme = (rank) => divisionOf(rank) === 'Sandanme';
const isJonidan = (rank) => divisionOf(rank) === 'Jonidan';
const isJonokuchi = (rank) => divisionOf(rank) === 'Jonokuchi';
const isMakushitaUpper = (rank) =>
  isMakushita(rank) && Number.isFinite(rank.number) && rank.number <= MAKUSHITA_UPPER_LIMIT;

const firstIndex = (records, predicate) => records.findIndex((record) => predicate(record.rank));

const extractCareerFeatures = (result) => {
  const summary = result.summary;
  const finalStatus = result.finalStatus;
  const records = finalStatus?.history?.records ?? [];
  const events = finalStatus?.history?.events ?? [];
  const totalBasho = records.length;

  const firstMakushita = firstIndex(records, isMakushita);
  const firstMakushitaUpper = firstIndex(records, isMakushitaUpper);
  const firstJuryo = firstIndex(records, isJuryo);
  const firstMakuuchi = firstIndex(records, isMakuuchi);

  const makushitaCount = records.filter((record) => isMakushita(record.rank)).length;
  const makushitaUpperCount = records.filter((record) => isMakushitaUpper(record.rank)).length;
  const juryoCount = records.filter((record) => isJuryo(record.rank)).length;
  const makuuchiCount = records.filter((record) => isMakuuchi(record.rank)).length;
  const sandanmeCount = records.filter((record) => isSandanme(record.rank)).length;
  const jonidanCount = records.filter((record) => isJonidan(record.rank)).length;
  const jonokuchiCount = records.filter((record) => isJonokuchi(record.rank)).length;

  // 5-basho fall back rates
  const fallBackToMakushitaWithin5OfJuryo = (() => {
    if (firstJuryo < 0) return null;
    const window = records.slice(firstJuryo, firstJuryo + 5);
    return window.some((record) => !isJuryo(record.rank) && !isMakuuchi(record.rank));
  })();
  const fallBackToJuryoWithin5OfMakuuchi = (() => {
    if (firstMakuuchi < 0) return null;
    const window = records.slice(firstMakuuchi, firstMakuuchi + 5);
    return window.some((record) => !isMakuuchi(record.rank));
  })();

  // Sekitori average win rate (Juryo + Makuuchi)
  const sekitoriRecords = records.filter((record) => isJuryo(record.rank) || isMakuuchi(record.rank));
  const sekitoriWins = sekitoriRecords.reduce((sum, record) => sum + (record.wins || 0), 0);
  const sekitoriLosses = sekitoriRecords.reduce((sum, record) => sum + (record.losses || 0), 0);
  const sekitoriWinRate = sekitoriWins + sekitoriLosses > 0
    ? sekitoriWins / (sekitoriWins + sekitoriLosses)
    : null;

  // Promotion review observation (juryo->makuuchi candidate but not promoted)
  let juryoPromotionCandidate = 0;
  let juryoPromotionPassedOver = 0;
  for (const frame of result.frames) {
    const review = frame.promotionReview;
    if (!review) continue;
    if (frame.rank && frame.rank.division === 'Juryo' && review.candidate) {
      juryoPromotionCandidate += 1;
      if (!review.promote) juryoPromotionPassedOver += 1;
    }
  }

  // Last basho before retirement
  const lastRecord = records[records.length - 1];
  const lastWins = lastRecord ? lastRecord.wins || 0 : 0;
  const lastLosses = lastRecord ? lastRecord.losses || 0 : 0;
  const lastBashoKachikoshi = lastRecord ? lastWins > lastLosses : null;

  // Retirement reason / kachikoshi-then-retire flag
  const retiredAfterKachikoshi = !!summary.careerOutcome.retiredAfterKachikoshi;

  // Stagnation in lower divisions: number of basho spent in jonokuchi/jonidan/sandanme
  const lowerStagnationBasho = jonokuchiCount + jonidanCount + sandanmeCount;

  // Career win rate
  const careerWinRate = summary.careerOutcome.officialWinRate;
  const lowWinLongCareer = totalBasho >= 12 && careerWinRate < 0.45;

  // No-update period (longest streak without max-rank advance)
  let longestNoMaxRankUpdate = 0;
  let currentStreak = 0;
  let prevMaxBucket = null;
  // Approximate using running max rank by division ordering.
  const divisionOrder = { Maezumo: 0, Jonokuchi: 1, Jonidan: 2, Sandanme: 3, Makushita: 4, Juryo: 5, Makuuchi: 6 };
  let runningMaxScore = -1;
  for (const record of records) {
    const score = divisionOrder[divisionOf(record.rank)] ?? -1;
    if (score > runningMaxScore) {
      runningMaxScore = score;
      currentStreak = 0;
    } else {
      currentStreak += 1;
      if (currentStreak > longestNoMaxRankUpdate) longestNoMaxRankUpdate = currentStreak;
    }
    prevMaxBucket = score;
  }

  // SPIRIT/MAKEKOSHI_STREAK/CHRONIC_INJURY flags
  const reasonCode = summary.careerOutcome.retirementReasonCode || 'OTHER';

  return {
    seed: summary.seed,
    aptitudeTier: summary.aptitudeTier,
    entryPath: summary.initialPopulation?.entryPath,
    entryAge: summary.initialPopulation?.entryAge,
    bodyType: summary.initialPopulation?.bodyType,
    temperament: summary.initialPopulation?.temperament,
    bodySeed: summary.initialPopulation?.bodySeed,
    careerBandLabel: summary.initialPopulation?.careerBandLabel,
    // aptitudeTier以外の強さ決定要素 (finalStatusから取得)
    careerBand: finalStatus?.careerBand,
    growthType: finalStatus?.growthType,
    retirementProfile: finalStatus?.retirementProfile,
    archetype: finalStatus?.archetype,
    highestRankBucket: summary.rankOutcome.highestRankBucket,
    careerBasho: totalBasho,
    careerWinRate,
    sekitoriWinRate,
    retirementReasonCode: reasonCode,
    retiredAfterKachikoshi,
    lastBashoKachikoshi,
    firstMakushitaBasho: firstMakushita >= 0 ? firstMakushita + 1 : null,
    firstMakushitaUpperBasho: firstMakushitaUpper >= 0 ? firstMakushitaUpper + 1 : null,
    firstJuryoBasho: firstJuryo >= 0 ? firstJuryo + 1 : null,
    firstMakuuchiBasho: firstMakuuchi >= 0 ? firstMakuuchi + 1 : null,
    reachedMakushita: firstMakushita >= 0,
    reachedMakushitaUpper: firstMakushitaUpper >= 0,
    reachedJuryo: firstJuryo >= 0,
    reachedMakuuchi: firstMakuuchi >= 0,
    makushitaCount,
    makushitaUpperCount,
    juryoCount,
    makuuchiCount,
    sandanmeCount,
    jonidanCount,
    jonokuchiCount,
    lowerStagnationBasho,
    fallBackToMakushitaWithin5OfJuryo,
    fallBackToJuryoWithin5OfMakuuchi,
    juryoPromotionCandidate,
    juryoPromotionPassedOver,
    lowWinLongCareer,
    longestNoMaxRankUpdate,
  };
};

module.exports = {
  extractCareerFeatures,
};
