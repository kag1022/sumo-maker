import { Rank } from '../../models';
import { MakuuchiLayout } from '../banzukeLayout';
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
