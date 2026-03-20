import { HEISEI_BANZUKE_CALIBRATION } from '../../calibration/banzukeHeisei';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const resolveMaxMakushitaDemotionNumber = (
  juryoNumber: number,
  wins: number,
  losses: number,
  options?: { fullAbsence?: boolean },
): number => {
  const config = HEISEI_BANZUKE_CALIBRATION.boundaryExchange.juryoMakushita;
  const makekoshi = Math.max(1, losses - wins);
  const cap = options?.fullAbsence
    ? config.fullAbsenceDemotionMaxMakushitaRank
    : config.demotionMaxMakushitaRank;
  const candidate =
    config.demotionBaseMakushitaRank +
    Math.max(0, juryoNumber - 14) +
    Math.floor(Math.max(0, makekoshi - 1) / 3);
  return clamp(candidate, config.demotionBaseMakushitaRank, cap);
};

export const resolveMinJuryoPromotionNumber = (
  makushitaNumber: number,
  wins: number,
): number => {
  const config = HEISEI_BANZUKE_CALIBRATION.boundaryExchange.juryoMakushita;
  const candidate =
    config.promotionBestJuryoNumber +
    Math.floor(Math.max(0, makushitaNumber - 1) / 3) -
    (wins >= 7 ? 1 : 0);
  return clamp(candidate, config.promotionBestJuryoNumber, config.promotionWorstJuryoNumber);
};

export const resolveMakuuchiPromotionLandingNumber = (
  juryoNumber: number,
  wins: number,
): number => {
  const boundedJuryo = clamp(juryoNumber, 1, 14);
  const bonus =
    wins >= 14 ? 3 :
      wins >= 13 ? 2 :
        wins >= 12 ? 1 :
          0;

  if (boundedJuryo === 1 && wins >= 9) {
    return clamp(16 - bonus, 13, 17);
  }
  if (boundedJuryo === 2 && wins >= 10) {
    return clamp(16 - bonus, 13, 17);
  }
  if (boundedJuryo <= 4 && wins >= 11) {
    return clamp(16 + (boundedJuryo - 2) - bonus, 13, 17);
  }
  if (boundedJuryo <= 7 && wins >= 12) {
    return clamp(15 + Math.max(0, boundedJuryo - 4) - bonus, 13, 17);
  }
  return 17;
};

export const resolveJuryoLandingNumberFromMakuuchiDemotion = (
  maegashiraNumber: number,
  wins: number,
  losses: number,
): number => {
  const boundedMaegashira = clamp(maegashiraNumber, 1, 17);
  const makekoshi = Math.max(1, losses - wins);
  const base =
    boundedMaegashira >= 16 ? 1 :
      boundedMaegashira >= 14 ? 2 :
        boundedMaegashira >= 12 ? 3 :
          4;
  const severity =
    makekoshi >= 10 ? 3 :
      makekoshi >= 7 ? 2 :
        makekoshi >= 4 ? 1 :
          0;
  return clamp(base + severity, 1, 8);
};
