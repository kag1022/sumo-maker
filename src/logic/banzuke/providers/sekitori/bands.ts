import { getHeiseiBoundaryExchangeRate } from '../../../calibration/banzukeHeisei';
import { BanzukeCandidate, SekitoriDeltaBand, SekitoriZone } from './types';
import { resolveEmpiricalSlotBand } from '../empirical';

const LIMITS = {
  MAEGASHIRA_MAX: 17,
  SEKITORI_TOTAL: 70,
} as const;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const resolveSekitoriZone = (candidate: BanzukeCandidate): SekitoriZone => {
  const rank = candidate.snapshot.rank;
  if (rank.division === 'Juryo') return 'Juryo';
  if (rank.name !== '前頭') return 'MakuuchiTop';
  const num = clamp(rank.number || 17, 1, LIMITS.MAEGASHIRA_MAX);
  return num <= 5 ? 'MakuuchiTop' : 'MakuuchiMidLow';
};

const resolveBoundaryPressure = (
  candidate: BanzukeCandidate,
  direction: 'promotion' | 'demotion',
): number => {
  const rank = candidate.snapshot.rank;
  const division = rank.division;
  const number = rank.number ?? (division === 'Juryo' ? 14 : 17);
  const rate =
    division === 'Juryo'
      ? getHeiseiBoundaryExchangeRate(direction === 'promotion' ? 'JuryoToMakuuchi' : 'JuryoToMakushita')
      : getHeiseiBoundaryExchangeRate(direction === 'demotion' ? 'MakuuchiToJuryo' : 'JuryoToMakuuchi');
  if (rate <= 0) return 0;
  const losses = candidate.snapshot.losses + candidate.snapshot.absent;
  const diff = candidate.snapshot.wins - losses;
  if (direction === 'promotion' && diff <= 0) return 0;
  if (direction === 'demotion' && diff >= 0) return 0;
  const max = division === 'Juryo' ? 14 : 17;
  const proximity =
    direction === 'promotion'
      ? 1 - (number - 1) / Math.max(1, max - 1)
      : (number - 1) / Math.max(1, max - 1);
  return clamp(rate * proximity * Math.abs(diff), 0, 1);
};

export const resolveSekitoriDeltaBand = (candidate: BanzukeCandidate): SekitoriDeltaBand => {
  const rank = candidate.snapshot.rank;
  const zone = resolveSekitoriZone(candidate);
  const empirical = resolveEmpiricalSlotBand({
    division: rank.division,
    rankName: rank.name,
    rankNumber: rank.number,
    currentSlot: candidate.currentSlot,
    totalSlots: LIMITS.SEKITORI_TOTAL,
    wins: candidate.snapshot.wins,
    losses: candidate.snapshot.losses,
    absent: candidate.snapshot.absent,
    promotionPressure: resolveBoundaryPressure(candidate, 'promotion'),
    demotionPressure: resolveBoundaryPressure(candidate, 'demotion'),
  });
  const minSlotDelta = candidate.currentSlot - empirical.maxSlot;
  const maxSlotDelta = candidate.currentSlot - empirical.minSlot;
  return {
    zone,
    minSlotDelta: Math.min(minSlotDelta, maxSlotDelta),
    maxSlotDelta: Math.max(minSlotDelta, maxSlotDelta),
  };
};

export const resolveSekitoriPreferredSlot = (
  candidate: BanzukeCandidate,
  band: SekitoriDeltaBand,
): number => {
  const preferredDelta = Math.round((band.minSlotDelta + band.maxSlotDelta) / 2);
  return candidate.currentSlot - preferredDelta;
};

export const resolveBandSlotBounds = (
  currentSlot: number,
  band: SekitoriDeltaBand,
): { minSlot: number; maxSlot: number } => {
  const a = currentSlot - band.minSlotDelta;
  const b = currentSlot - band.maxSlotDelta;
  return { minSlot: Math.min(a, b), maxSlot: Math.max(a, b) };
};

export const resolveRequiredSekitoriDemotionSlots = (candidate: BanzukeCandidate): number => {
  const band = resolveSekitoriDeltaBand(candidate);
  return Math.max(0, -band.maxSlotDelta);
};
