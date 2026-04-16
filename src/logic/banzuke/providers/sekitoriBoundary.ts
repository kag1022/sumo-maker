import { Rank } from '../../models';
import { BoundarySnapshot, JURYO_SIZE, SekitoriExchange } from '../../simulation/sekitori/types';
import {
  resolveJuryoLandingNumberFromMakuuchiDemotion,
  resolveMaxMakushitaDemotionNumber,
  resolveMinJuryoPromotionNumber,
} from '../../simulation/sekitori/boundaryTuning';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const toJuryoNumber = (rankScore: number): number => Math.floor((clamp(rankScore, 1, JURYO_SIZE) - 1) / 2) + 1;
const toMakushitaNumber = (rankScore: number): number =>
  Math.floor((clamp(rankScore, 1, 120) - 1) / 2) + 1;

const buildPromotionPressure = (
  juryoResults: BoundarySnapshot[],
): number => juryoResults.filter((row) => {
  const diff = row.wins - row.losses;
  const number = toJuryoNumber(row.rankScore);
  return number >= 11 && diff < 0;
}).length;

const buildDemotionPressure = (
  makushitaResults: BoundarySnapshot[],
): number => makushitaResults.filter((row) => {
  const diff = row.wins - row.losses;
  const number = toMakushitaNumber(row.rankScore);
  return number <= 5 && diff > 0;
}).length;

export const resolveSekitoriBoundaryAssignedRank = (
  juryoResults: BoundarySnapshot[],
  makushitaResults: BoundarySnapshot[],
  exchange: SekitoriExchange,
  playerFullAbsence: boolean,
): Rank | undefined => {
  const playerJuryo = juryoResults.find((row) => row.id === 'PLAYER');
  const playerMakushita = makushitaResults.find((row) => row.id === 'PLAYER');

  if (playerJuryo && exchange.playerDemotedToMakushita) {
    const currentNumber = toJuryoNumber(playerJuryo.rankScore);
    const baseLanding = resolveMaxMakushitaDemotionNumber(
      currentNumber,
      playerJuryo.wins,
      playerJuryo.losses,
      { fullAbsence: playerFullAbsence },
    );
    const exchangeRelief = exchange.slots >= 3 ? -2 : exchange.slots >= 2 ? -1 : 0;
    const competitionPenalty = buildDemotionPressure(makushitaResults) >= 4 ? 1 : 0;
    const number = clamp(baseLanding + exchangeRelief + competitionPenalty, 1, 15);
    return {
      division: 'Makushita',
      name: '幕下',
      number,
      side: 'East',
    };
  }

  if (playerMakushita && exchange.playerPromotedToJuryo && playerMakushita.wins > playerMakushita.losses) {
    const currentNumber = toMakushitaNumber(playerMakushita.rankScore);
    const baseLanding =
      currentNumber === 1 && playerMakushita.wins >= 4
        ? resolveJuryoLandingNumberFromMakuuchiDemotion(16, playerMakushita.wins, playerMakushita.losses)
        : resolveMinJuryoPromotionNumber(currentNumber, playerMakushita.wins);
    const openingShift = exchange.slots >= 4 ? -2 : exchange.slots >= 2 ? -1 : 0;
    const upperPressureShift = buildPromotionPressure(juryoResults) >= 4 ? -1 : 0;
    const number = clamp(baseLanding + openingShift + upperPressureShift, 1, 14);
    return {
      division: 'Juryo',
      name: '十両',
      number,
      side: 'East',
    };
  }

  if (playerMakushita) {
    return {
      division: 'Makushita',
      name: '幕下',
      number: toMakushitaNumber(playerMakushita.rankScore),
      side: playerMakushita.rankScore % 2 === 1 ? 'East' : 'West',
    };
  }

  return undefined;
};
