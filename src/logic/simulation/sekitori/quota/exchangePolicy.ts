import {
  buildJuryoDemotionCandidates,
  buildJuryoFallbackDemotionCandidates,
  buildMakushitaFallbackPromotionCandidates,
  buildMakushitaPromotionCandidates,
  resolveExchangeSlots,
} from '../candidates';
import { BoundarySnapshot, SekitoriExchange } from '../types';

export interface ResolveSekitoriExchangePolicyParams {
  juryoResults: BoundarySnapshot[];
  makushitaResults: BoundarySnapshot[];
  playerJuryoIsMakekoshi: boolean;
  playerJuryoFullAbsence: boolean;
  playerMakushitaIsKachikoshi: boolean;
}

export interface ResolvedSekitoriExchangePolicy {
  exchange: SekitoriExchange;
  promotedToJuryoIds: string[];
  demotedToMakushitaIds: string[];
}

export const resolveSekitoriExchangePolicy = (
  params: ResolveSekitoriExchangePolicyParams,
): ResolvedSekitoriExchangePolicy => {
  const {
    juryoResults,
    makushitaResults,
    playerJuryoIsMakekoshi,
    playerJuryoFullAbsence,
    playerMakushitaIsKachikoshi,
  } = params;

  let demotionPool = buildJuryoDemotionCandidates(juryoResults);
  let promotionPool = buildMakushitaPromotionCandidates(makushitaResults);
  const mandatoryDemotions = demotionPool.filter((candidate) => candidate.mandatory).length;
  const mandatoryPromotions = promotionPool.filter((candidate) => candidate.mandatory).length;
  if (!demotionPool.length && !promotionPool.length) {
    demotionPool = buildJuryoFallbackDemotionCandidates(juryoResults, new Set<string>());
    promotionPool = buildMakushitaFallbackPromotionCandidates(
      makushitaResults,
      new Set<string>(),
    );
  }

  if (mandatoryPromotions > demotionPool.length) {
    const exclude = new Set(demotionPool.map((candidate) => candidate.id));
    const fallbackDemotions = buildJuryoFallbackDemotionCandidates(juryoResults, exclude);
    const minimumDemotions = Math.min(juryoResults.length, Math.max(1, mandatoryPromotions));
    demotionPool = demotionPool.concat(fallbackDemotions).slice(0, minimumDemotions);
  }
  if (mandatoryDemotions > promotionPool.length) {
    const exclude = new Set(promotionPool.map((candidate) => candidate.id));
    const fallbackPromotions = buildMakushitaFallbackPromotionCandidates(makushitaResults, exclude);
    const minimumPromotions = Math.min(
      makushitaResults.length,
      Math.max(1, mandatoryDemotions),
    );
    promotionPool = promotionPool.concat(fallbackPromotions).slice(0, minimumPromotions);
  }

  const resolved = resolveExchangeSlots(demotionPool, promotionPool);
  const demotedToMakushitaIds = resolved.demotions.map((candidate) => candidate.id);
  const promotedToJuryoIds = resolved.promotions.map((candidate) => candidate.id);
  const forcedDemotedIdsRaw = demotedToMakushitaIds.includes('PLAYER')
    ? demotedToMakushitaIds
    : playerJuryoFullAbsence
      ? [...demotedToMakushitaIds, 'PLAYER']
      : demotedToMakushitaIds;
  const forcedPromotedIdsRaw =
    playerJuryoFullAbsence && forcedDemotedIdsRaw.length > promotedToJuryoIds.length
      ? [
        ...promotedToJuryoIds,
        (
          promotionPool.find((candidate) => !promotedToJuryoIds.includes(candidate.id))?.id ??
          makushitaResults.find((result) => result.id !== 'PLAYER')?.id ??
          makushitaResults[0]?.id
        ) as string,
      ].filter((id, index, arr) => Boolean(id) && arr.indexOf(id) === index)
      : promotedToJuryoIds;
  const forcedDemotedIds = forcedDemotedIdsRaw.filter((id) =>
    id !== 'PLAYER' || playerJuryoFullAbsence || playerJuryoIsMakekoshi);
  const forcedPromotedIds = forcedPromotedIdsRaw.filter((id) =>
    id !== 'PLAYER' || playerMakushitaIsKachikoshi);
  const resolvedSlots = playerJuryoFullAbsence ? Math.max(1, resolved.slots) : resolved.slots;
  const normalizedSlots = Math.min(resolvedSlots, forcedPromotedIds.length, forcedDemotedIds.length);

  return {
    exchange: {
      slots: normalizedSlots,
      promotedToJuryoIds: forcedPromotedIds,
      demotedToMakushitaIds: forcedDemotedIds,
      playerPromotedToJuryo: forcedPromotedIds.includes('PLAYER'),
      playerDemotedToMakushita: forcedDemotedIds.includes('PLAYER'),
      reason: playerJuryoFullAbsence ? 'MANDATORY_ABSENCE_DEMOTION' : 'NORMAL',
    },
    promotedToJuryoIds: forcedPromotedIds,
    demotedToMakushitaIds: forcedDemotedIds,
  };
};
