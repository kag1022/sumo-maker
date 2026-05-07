// Per-career feature extractor for NPC relative strength diagnostics.
// Focuses on player ability vs opponent (NPC) ability per basho.
// Uses strengthOfSchedule as mean opponent ability; extracts playerRatingAbility
// from frame.runtime.actor.status.ratingState for direct comparison.

const LOGISTIC_SCALE = 0.082; // from src/logic/simulation/strength/model.ts

// Implied player effective ability from expected win rate and mean opponent ability.
// Uses the logistic formula: ewRate = 1 / (1 + exp(-0.082 * (pa - sos)))
// Inverted: pa = sos + logit(ewRate) / 0.082
const impliedPlayerAbility = (ewRate, sos) => {
  if (!Number.isFinite(ewRate) || !Number.isFinite(sos) || ewRate <= 0.001 || ewRate >= 0.999) return null;
  const logitEw = Math.log(ewRate / (1 - ewRate));
  return sos + logitEw / LOGISTIC_SCALE;
};

const rankBandOf = (division, rankNumber) => {
  if (!rankNumber) return 'all';
  if (division === 'Makuuchi') {
    if (rankNumber <= 3) return 'sanyaku';
    if (rankNumber <= 8) return 'upper';
    if (rankNumber <= 14) return 'middle';
    return 'lower';
  }
  if (division === 'Juryo') return rankNumber <= 7 ? 'upper' : 'lower';
  if (division === 'Makushita') {
    if (rankNumber <= 5) return 'upper5';
    if (rankNumber <= 15) return 'upper';
    if (rankNumber <= 30) return 'middle';
    return 'lower';
  }
  if (division === 'Sandanme') {
    if (rankNumber <= 30) return 'upper';
    if (rankNumber <= 60) return 'middle';
    return 'lower';
  }
  return rankNumber <= 20 ? 'upper' : 'lower';
};

const extractNpcStrengthFeatures = (result) => {
  const summary = result.summary;
  const finalStatus = result.finalStatus;
  const frames = result.frames ?? [];

  // Career metadata
  const aptitudeTier = summary?.aptitudeTier ?? null;
  const careerBand = finalStatus?.careerBand ?? null;
  const growthType = finalStatus?.growthType ?? null;
  const retirementProfile = finalStatus?.retirementProfile ?? null;
  const entryPath = summary?.initialPopulation?.entryPath ?? null;
  const reachedJuryo = summary?.rankOutcome?.isSekitori ?? false;
  const reachedMakuuchi = summary?.rankOutcome?.isMakuuchi ?? false;

  // styleRelevantCeiling (same computation as career_diagnostics_features)
  const styleRelevantCeiling = (() => {
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
    const ceilings = [pc, tc, sc, rs, sf].filter(Number.isFinite);
    return ceilings.length > 0 ? Math.round(ceilings.reduce((s, v) => s + v, 0) / ceilings.length) : null;
  })();

  // Per-basho records
  const bashoRecords = [];

  for (const frame of frames) {
    if (frame.kind !== 'BASHO') continue;
    const diag = frame.diagnostics;
    const record = frame.record;
    if (!diag && !record) continue;

    const divisionObj = diag?.rank ?? record?.rank ?? frame.rank;
    const division = divisionObj?.division ?? 'Unknown';
    const rankNumber = divisionObj?.number ?? null;
    const rankName = divisionObj?.name ?? null;
    const rankBand = rankBandOf(division, rankNumber);

    const wins = diag?.wins ?? record?.wins ?? 0;
    const losses = diag?.losses ?? record?.losses ?? 0;
    const totalBouts = wins + losses;

    const expectedWins = diag?.expectedWins ?? record?.expectedWins ?? null;
    const sos = diag?.strengthOfSchedule ?? record?.strengthOfSchedule ?? null;
    const performanceOverExpected = diag?.performanceOverExpected ?? record?.performanceOverExpected ?? null;

    const ewRate = (expectedWins != null && totalBouts > 0) ? expectedWins / totalBouts : null;
    const actualWinRate = totalBouts > 0 ? wins / totalBouts : null;
    const ipa = impliedPlayerAbility(ewRate, sos);

    // Player rating ability from runtime snapshot (base rating, pre-form)
    const ratingState = frame.runtime?.actor?.status?.ratingState;
    const playerRatingAbility = ratingState?.ability ?? null;
    const playerRatingForm = ratingState?.form ?? null;

    // Ability gap (implied effective ability minus SOS = advantage over average opponent)
    const abilityGap = (ipa != null && sos != null) ? ipa - sos : null;

    // Next-frame division for promotion tracking (populated in report, not here)
    bashoRecords.push({
      seq: frame.seq,
      year: frame.year,
      month: frame.month,
      division,
      rankNumber,
      rankName,
      rankBand,
      wins,
      losses,
      totalBouts,
      expectedWins,
      expectedWinRate: ewRate,
      actualWinRate,
      strengthOfSchedule: sos,
      impliedPlayerAbility: ipa,
      abilityGap,
      playerRatingAbility,
      playerRatingForm,
      performanceOverExpected,
      formDelta: diag?.bashoVariance?.playerBashoFormDelta ?? null,
      crossDivisionBoutCount: diag?.crossDivisionBoutCount ?? null,
      lateCrossDivisionBoutCount: diag?.lateCrossDivisionBoutCount ?? null,
    });
  }

  return {
    seed: result.seed,
    aptitudeTier,
    careerBand,
    growthType,
    retirementProfile,
    entryPath,
    styleRelevantCeiling,
    reachedJuryo,
    reachedMakuuchi,
    bashoRecords,
  };
};

module.exports = { extractNpcStrengthFeatures, impliedPlayerAbility };
