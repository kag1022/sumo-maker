import type { BashoRecord, RikishiStatus } from '../models';
import type { PlayerBoutDetail } from '../simulation/basho/types';
import {
  ensureStyleIdentityProfile,
  updateStyleIdentityAfterBasho,
} from './identity';

export interface LegacyStyleEvolutionProfile {
  techniqueAffinity: number;
  birthStyleBias: RikishiStatus['tactics'];
  branchState: 'NONE' | 'PENDING' | 'LOCKED';
  pendingTechniqueCount: number;
  branchedAtBashoSeq?: number;
}

export const ensureStyleEvolutionProfile = (status: RikishiStatus): RikishiStatus =>
  ensureStyleIdentityProfile(status);

export const updateStyleEvolutionAfterBasho = (
  status: RikishiStatus,
  record: BashoRecord,
  bashoSeq: number,
  bouts?: PlayerBoutDetail[],
): RikishiStatus => updateStyleIdentityAfterBasho(status, record, bashoSeq, bouts);

export const hasTechniqueBranchLocked = (_status: RikishiStatus): boolean => false;
