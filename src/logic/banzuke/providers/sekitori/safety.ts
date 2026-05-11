import { Rank } from '../../../models';
import { MakuuchiLayout } from '../../scale/banzukeLayout';
import { resolveRequiredSekitoriDemotionSlots } from './bands';
import { fromSekitoriSlot, isSekitoriDivision, SEKITORI_CAPACITY, toMakuuchiSlot, toSekitoriSlot } from './slots';
import { BanzukeCandidate } from './types';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const applySekitoriSafetyGuard = (
  candidate: BanzukeCandidate,
  proposed: Rank,
  layout: MakuuchiLayout,
): Rank => {
  const current = candidate.snapshot.rank;
  if (!isSekitoriDivision(current.division) || !isSekitoriDivision(proposed.division)) return proposed;

  if (current.division === 'Makuuchi' && current.name === '横綱') {
    return proposed.division === 'Makuuchi' && proposed.name === '横綱'
      ? proposed
      : current;
  }

  if (current.division === 'Makuuchi' && current.name === '大関') {
    if (candidate.directive.preferredTopName === '横綱' || candidate.directive.preferredTopName === '大関') {
      return proposed;
    }
    if (candidate.directive.preferredTopName === '関脇') {
      return {
        division: 'Makuuchi',
        name: '関脇',
        side: proposed.side ?? 'East',
      };
    }
  }

  const wins = candidate.snapshot.wins;
  const losses = candidate.normalizedLosses;
  const diff = wins - losses;
  const currentSlot = toSekitoriSlot(current, layout);
  let proposedSlot = toSekitoriSlot(proposed, layout);
  const isCurrentSanyaku = current.division === 'Makuuchi' && ['関脇', '小結'].includes(current.name);

  if (wins < losses && proposedSlot < currentSlot) proposedSlot = currentSlot;
  if (wins > losses && proposedSlot > currentSlot && !isCurrentSanyaku) {
    proposedSlot = currentSlot;
  }

  if (wins < losses) {
    const minimumDrop = resolveRequiredSekitoriDemotionSlots(candidate);
    const minimumDemotedSlot = clamp(
      currentSlot + minimumDrop,
      currentSlot,
      SEKITORI_CAPACITY.Makuuchi + SEKITORI_CAPACITY.Juryo,
    );
    proposedSlot = Math.max(proposedSlot, minimumDemotedSlot);
  }

  const maegashiraNumber = current.number ?? 99;
  const severeMakuuchiDemotion =
    current.division === 'Makuuchi' &&
    current.name === '前頭' &&
    maegashiraNumber >= 12 &&
    (
      candidate.snapshot.absent >= 8 ||
      wins === 0 ||
      (maegashiraNumber >= 15 && losses - wins >= 8)
    );
  if (severeMakuuchiDemotion) {
    proposedSlot = Math.max(proposedSlot, SEKITORI_CAPACITY.Makuuchi + 1);
  }

  if (
    current.division === 'Makuuchi' &&
    current.name === '前頭' &&
    (current.number || 99) <= 5 &&
    diff === 1
  ) {
    const upperMaegashiraFloor = toMakuuchiSlot(
      { division: 'Makuuchi', name: '前頭', number: 1, side: 'East' },
      layout,
    );
    proposedSlot = Math.max(proposedSlot, currentSlot - 2, upperMaegashiraFloor);
  }

  if (current.division === 'Makuuchi' && current.name === '小結' && diff === -1) {
    proposedSlot = Math.min(
      proposedSlot,
      toMakuuchiSlot({ division: 'Makuuchi', name: '前頭', number: 6, side: 'West' }, layout),
    );
  }
  if (current.division === 'Makuuchi' && current.name === '関脇' && diff === -1) {
    proposedSlot = Math.min(
      proposedSlot,
      toMakuuchiSlot({ division: 'Makuuchi', name: '前頭', number: 4, side: 'West' }, layout),
    );
  }

  return fromSekitoriSlot(proposedSlot, layout);
};
