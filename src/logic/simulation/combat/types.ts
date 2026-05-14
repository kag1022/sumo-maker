import type { EnemyStyleBias } from '../../catalog/enemyData';
import type { Division } from '../../models';
import type { BashoFormatKind } from '../basho/formatPolicy';

export type CombatProfileSource =
  | 'PLAYER'
  | 'NPC'
  | 'GENERATED_OPPONENT';

export type CombatStyle =
  | 'PUSH'
  | 'GRAPPLE'
  | 'TECHNIQUE'
  | 'BALANCED';

export interface BashoCombatProfile {
  readonly id: string;
  readonly name: string;
  readonly division: Division;
  readonly formatKind?: BashoFormatKind;
  readonly source: CombatProfileSource;
  readonly basePower: number;
  readonly baseAbility?: number;
  readonly bashoFormDelta: number;
  readonly competitiveFactor: number;
  readonly stablePerformanceFactor: number;
  readonly heightCm: number;
  readonly weightKg: number;
  readonly style?: CombatStyle;
  readonly styleBias?: EnemyStyleBias;
  readonly rankValue?: number;
  readonly rankBaselineAbility?: number;
  readonly bodyScore?: number;
  readonly pushStrength?: number;
  readonly beltStrength?: number;
  readonly techniqueStrength?: number;
  readonly edgeStrength?: number;
}
