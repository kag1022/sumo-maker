const DEFAULT_EMPTY_WIN_RATE = 0.5;

const resolveOfficialCareerWinRate = (wins, losses) => {
  const total = wins + losses;
  return total > 0 ? wins / total : DEFAULT_EMPTY_WIN_RATE;
};

const resolveEffectiveCareerWinRate = (wins, losses, absent = 0) => {
  const total = wins + losses + absent;
  return total > 0 ? wins / total : DEFAULT_EMPTY_WIN_RATE;
};

const buildCareerRateSample = ({ wins, losses, absent = 0 }) => ({
  wins,
  losses,
  absent,
  officialWinRate: resolveOfficialCareerWinRate(wins, losses),
  effectiveWinRate: resolveEffectiveCareerWinRate(wins, losses, absent),
  effectiveIsLosing: wins < losses + absent,
});

const createCareerRateAccumulator = () => ({
  sampleCount: 0,
  officialWinRateTotal: 0,
  effectiveWinRateTotal: 0,
  pooledWins: 0,
  pooledLosses: 0,
  totalAbsent: 0,
  losingCareerCount: 0,
});

const pushCareerRateSample = (accumulator, sampleInput) => {
  const sample = buildCareerRateSample(sampleInput);
  accumulator.sampleCount += 1;
  accumulator.officialWinRateTotal += sample.officialWinRate;
  accumulator.effectiveWinRateTotal += sample.effectiveWinRate;
  accumulator.pooledWins += sample.wins;
  accumulator.pooledLosses += sample.losses;
  accumulator.totalAbsent += sample.absent;
  if (sample.effectiveIsLosing) {
    accumulator.losingCareerCount += 1;
  }
  return sample;
};

const finalizeCareerRateAccumulator = (accumulator) => ({
  sampleCount: accumulator.sampleCount,
  officialWinRate:
    accumulator.sampleCount > 0
      ? accumulator.officialWinRateTotal / accumulator.sampleCount
      : Number.NaN,
  effectiveWinRate:
    accumulator.sampleCount > 0
      ? accumulator.effectiveWinRateTotal / accumulator.sampleCount
      : Number.NaN,
  pooledWinRate:
    accumulator.pooledWins / Math.max(1, accumulator.pooledWins + accumulator.pooledLosses),
  losingCareerRate:
    accumulator.sampleCount > 0
      ? accumulator.losingCareerCount / accumulator.sampleCount
      : Number.NaN,
  totalAbsent: accumulator.totalAbsent,
});

module.exports = {
  buildCareerRateSample,
  createCareerRateAccumulator,
  finalizeCareerRateAccumulator,
  pushCareerRateSample,
  resolveEffectiveCareerWinRate,
  resolveOfficialCareerWinRate,
};
