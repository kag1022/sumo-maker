const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const resolveMaxMakushitaDemotionNumber = (
  juryoNumber: number,
  wins: number,
  losses: number,
  _options?: { fullAbsence?: boolean },
): number => {
  const boundedJuryo = clamp(juryoNumber, 1, 14);
  const deficit = Math.max(1, losses - wins);
  const base =
    boundedJuryo >= 14 ? 1 :
      boundedJuryo >= 12 ? 3 :
        boundedJuryo >= 10 ? 6 :
          boundedJuryo >= 8 ? 10 :
            14;
  const depth = Math.floor(Math.max(0, deficit - 1) / 2);
  return clamp(base + depth, 1, 15);
};

export const resolveMinJuryoPromotionNumber = (
  makushitaNumber: number,
  wins: number,
): number => {
  const boundedMakushita = clamp(makushitaNumber, 1, 15);
  if (boundedMakushita <= 5) {
    return wins >= 7 ? 12 : 13;
  }
  if (boundedMakushita <= 10) {
    return wins >= 7 ? 13 : 14;
  }
  return 14;
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
  const deficit = Math.max(1, losses - wins);
  const base =
    boundedMaegashira >= 16 ? 1 :
      boundedMaegashira >= 14 ? 2 :
        boundedMaegashira >= 12 ? 3 :
          4;
  const severity =
    deficit >= 10 ? 3 :
      deficit >= 7 ? 2 :
        deficit >= 4 ? 1 :
          0;
  return clamp(base + severity, 1, 8);
};
