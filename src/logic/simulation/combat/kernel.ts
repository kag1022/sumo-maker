import type { EnemyStyleBias } from '../../catalog/enemyData';
import type { Division } from '../../models';
import type { BashoFormatKind, BoutPressureContext } from '../basho/formatPolicy';
import { resolveBoutWinProb } from '../strength/model';

export type CombatKernelSource =
  | 'PLAYER_BASE'
  | 'PLAYER_BASELINE'
  | 'NPC_MAIN';

export interface CombatKernelInput {
  readonly source: CombatKernelSource;
  readonly attackerAbility: number;
  readonly defenderAbility: number;
  readonly attackerStyle?: EnemyStyleBias;
  readonly defenderStyle?: EnemyStyleBias;
  readonly injuryPenalty?: number;
  readonly bonus?: number;
  readonly diffSoftCap?: number;
  readonly metadata?: {
    readonly division?: Division;
    readonly formatKind?: BashoFormatKind;
    readonly calendarDay?: number;
    readonly boutOrdinal?: number;
    readonly pressureFlags?: Partial<BoutPressureContext>;
  };
}

export interface CombatKernelOutput {
  readonly probability: number;
  readonly input: CombatKernelInput;
}

export const resolveCombatKernelProbability = (
  input: CombatKernelInput,
): CombatKernelOutput => ({
  probability: resolveBoutWinProb({
    attackerAbility: input.attackerAbility,
    defenderAbility: input.defenderAbility,
    attackerStyle: input.attackerStyle,
    defenderStyle: input.defenderStyle,
    injuryPenalty: input.injuryPenalty,
    bonus: input.bonus,
    diffSoftCap: input.diffSoftCap,
  }),
  input: { ...input },
});
