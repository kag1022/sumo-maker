// Per-career feature extractor for battle/torikumi realism diagnostics.
// Extracts per-basho records including expected wins, strength of schedule,
// torikumi quality metrics, and win/loss distributions.
// No simulation logic; read-only diagnostics only.

const extractBattleTorikumiFeatures = (result) => {
  const summary = result.summary;
  const finalStatus = result.finalStatus;
  const frames = result.frames ?? [];

  // Per-basho records: one entry per basho played
  const bashoRecords = [];

  for (const frame of frames) {
    if (frame.kind !== 'BASHO') continue;

    const diag = frame.diagnostics;
    const record = frame.record;
    if (!diag && !record) continue;

    // Prefer diagnostics for computed fields; fall back to record
    const division = (diag?.rank ?? record?.rank ?? frame.rank)?.division ?? 'Unknown';
    const rankName = (diag?.rank ?? record?.rank ?? frame.rank)?.name ?? null;
    const rankNumber = (diag?.rank ?? record?.rank ?? frame.rank)?.number ?? null;
    const rankSide = (diag?.rank ?? record?.rank ?? frame.rank)?.side ?? null;

    const wins = diag?.wins ?? record?.wins ?? 0;
    const losses = diag?.losses ?? record?.losses ?? 0;
    const absent = diag?.absent ?? record?.absent ?? 0;
    const totalBouts = wins + losses;

    // Strength/schedule metrics
    const expectedWins = diag?.expectedWins ?? record?.expectedWins ?? null;
    const strengthOfSchedule = diag?.strengthOfSchedule ?? record?.strengthOfSchedule ?? null;
    const performanceOverExpected = diag?.performanceOverExpected ?? record?.performanceOverExpected ?? null;
    const avgWinProb = (expectedWins != null && totalBouts > 0) ? expectedWins / totalBouts : null;

    // Torikumi quality metrics
    const relaxHist = diag?.torikumiRelaxationHistogram ?? {};
    const repairHist = diag?.torikumiRepairHistogram ?? {};
    const crossDivisionBoutCount = diag?.crossDivisionBoutCount ?? 0;
    const lateCrossDivisionBoutCount = diag?.lateCrossDivisionBoutCount ?? 0;
    const sameStableViolationCount = diag?.sameStableViolationCount ?? 0;
    const sameCardViolationCount = diag?.sameCardViolationCount ?? 0;
    const torikumiScheduleViolations = diag?.torikumiScheduleViolations ?? 0;
    const sanyakuRoundRobinCoverageRate = diag?.sanyakuRoundRobinCoverageRate ?? null;
    const joiAssignmentCoverageRate = diag?.joiAssignmentCoverageRate ?? null;
    const yokozunaOzekiTailBoutRatio = diag?.yokozunaOzekiTailBoutRatio ?? null;

    // Relaxation depth (max stage used this basho)
    const maxRelaxationStage = Object.keys(relaxHist).reduce(
      (max, k) => Math.max(max, Number(k)),
      0,
    );
    // Total repair attempts
    const totalRepairs = Object.values(repairHist).reduce((s, v) => s + Number(v), 0);

    // Basho variance
    const formDelta = diag?.bashoVariance?.playerBashoFormDelta ?? null;
    const conditionBefore = diag?.bashoVariance?.conditionBefore ?? null;

    // Promotion/demotion
    const promoted = diag?.promoted ?? false;
    const demoted = diag?.demoted ?? false;
    const rankChangeReason = diag?.reason ?? null;

    // Torikumi context (upper rank scheduling quality per frame)
    const upperRankEarlyDeep = frame.upperRankEarlyDeepOpponents ?? 0;
    const upperRankEarlyTotal = frame.upperRankEarlyTotalOpponents ?? 0;

    // Promotion review (幕下上位 → 十両)
    const promotionReviewCandidate = frame.promotionReview?.candidate ?? false;
    const promotionReviewPromote = frame.promotionReview?.promote ?? false;
    const promotionReviewBlockReason = frame.promotionReview?.blockReason ?? null;
    const promotionReviewScore = frame.promotionReview?.score ?? null;

    bashoRecords.push({
      seq: frame.seq,
      year: frame.year,
      month: frame.month,
      division,
      rankName,
      rankNumber,
      rankSide,
      wins,
      losses,
      absent,
      totalBouts,
      expectedWins,
      strengthOfSchedule,
      performanceOverExpected,
      avgWinProb,
      crossDivisionBoutCount,
      lateCrossDivisionBoutCount,
      sameStableViolationCount,
      sameCardViolationCount,
      torikumiScheduleViolations,
      maxRelaxationStage,
      totalRepairs,
      sanyakuRoundRobinCoverageRate,
      joiAssignmentCoverageRate,
      yokozunaOzekiTailBoutRatio,
      formDelta,
      conditionBefore,
      promoted,
      demoted,
      rankChangeReason,
      upperRankEarlyDeep,
      upperRankEarlyTotal,
      promotionReviewCandidate,
      promotionReviewPromote,
      promotionReviewBlockReason,
      promotionReviewScore,
    });
  }

  // Career-level league outcome totals
  const league = summary?.leagueOutcome ?? {};
  const careerSameStableViolations = league.sameStableViolations ?? 0;
  const careerSameCardViolations = league.sameCardViolations ?? 0;
  const careerCrossDivisionBouts = league.crossDivisionBouts ?? 0;
  const careerLateCrossDivisionBouts = league.lateCrossDivisionBouts ?? 0;
  const careerUpperRankEarlyDeep = league.upperRankEarlyDeepOpponents ?? 0;
  const careerUpperRankEarlyTotal = league.upperRankEarlyTotalOpponents ?? 0;

  return {
    seed: result.seed,
    aptitudeTier: summary?.aptitudeTier,
    careerBand: finalStatus?.careerBand,
    growthType: finalStatus?.growthType,
    retirementProfile: finalStatus?.retirementProfile,
    entryPath: summary?.initialPopulation?.entryPath,
    styleRelevantCeiling: (() => {
      const genome = finalStatus?.genome;
      if (!genome) return null;
      const b = genome.base ?? {};
      const tactics = finalStatus?.tactics ?? 'BALANCE';
      const pc = b.powerCeiling ?? 0;
      const tc = b.techCeiling ?? 0;
      const sc = b.speedCeiling ?? 0;
      const rs = b.ringSense ?? 0;
      const sf = b.styleFit ?? 0;
      if (tactics === 'PUSH') return Math.round(pc * 0.40 + sc * 0.35 + tc * 0.15 + rs * 0.05 + sf * 0.05);
      if (tactics === 'GRAPPLE') return Math.round(pc * 0.30 + tc * 0.25 + rs * 0.25 + sc * 0.10 + sf * 0.10);
      if (tactics === 'TECHNIQUE') return Math.round(tc * 0.35 + rs * 0.30 + sc * 0.20 + pc * 0.10 + sf * 0.05);
      const ceilings = [b.powerCeiling, b.techCeiling, b.speedCeiling, b.ringSense, b.styleFit].filter(Number.isFinite);
      return ceilings.length > 0 ? Math.round(ceilings.reduce((s, v) => s + v, 0) / ceilings.length) : null;
    })(),
    highestRankBucket: summary?.rankOutcome?.highestRankBucket,
    reachedJuryo: summary?.rankOutcome?.isSekitori ?? false,
    reachedMakuuchi: summary?.rankOutcome?.isMakuuchi ?? false,
    careerBashoTotal: bashoRecords.length,
    careerWinRate: summary?.careerOutcome?.officialWinRate ?? null,
    // Career-level league
    careerSameStableViolations,
    careerSameCardViolations,
    careerCrossDivisionBouts,
    careerLateCrossDivisionBouts,
    careerUpperRankEarlyDeep,
    careerUpperRankEarlyTotal,
    // Per-basho data
    bashoRecords,
  };
};

module.exports = { extractBattleTorikumiFeatures };
