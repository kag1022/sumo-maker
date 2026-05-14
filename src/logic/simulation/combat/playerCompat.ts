import type { BattleOpponent, BoutContext } from '../../battle';
import type { RikishiStatus, WinRoute } from '../../models';
import type { RandomSource } from '../deps';
import type { BoutFlowCommentary } from './boutFlowCommentary';

export interface PlayerBoutCompatInput {
  readonly rikishi: RikishiStatus;
  readonly enemy: BattleOpponent;
  readonly context?: BoutContext;
  readonly rng: RandomSource;
}

export interface PlayerBoutCompatNormalizedInput {
  readonly rikishi: RikishiStatus;
  readonly enemy: BattleOpponent;
  readonly context?: BoutContext;
  readonly rng: RandomSource;
}

export interface PlayerBoutCompatResult {
  readonly isWin: boolean;
  readonly kimarite: string;
  readonly winRoute?: WinRoute;
  readonly winProbability: number;
  readonly opponentAbility: number;
  readonly boutFlowCommentary?: BoutFlowCommentary;
}

export type PlayerBoutCompatResolver = (
  input: PlayerBoutCompatNormalizedInput,
) => PlayerBoutCompatResult;

export const normalizePlayerBoutCompatInput = (
  input: PlayerBoutCompatInput,
): PlayerBoutCompatNormalizedInput => ({
  rikishi: input.rikishi,
  enemy: input.enemy,
  context: input.context,
  rng: input.rng,
});

export const resolvePlayerBoutCompat = (
  input: PlayerBoutCompatInput,
  resolveLegacy: PlayerBoutCompatResolver,
): PlayerBoutCompatResult => {
  const normalized = normalizePlayerBoutCompatInput(input);
  return resolveLegacy(normalized);
};
