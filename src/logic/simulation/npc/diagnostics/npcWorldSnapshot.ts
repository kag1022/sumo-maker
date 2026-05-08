/**
 * Dev-only NPC world snapshot — DO NOT import from production runtime/UI.
 *
 * Iterates `world.actorRegistry` directly to capture every NPC (active and
 * retired, all divisions) for diagnostic harnesses. The production
 * `npcBashoRecords` stream is sekitori + player's current lower division only;
 * this module exists to close that coverage gap. See
 * docs/npc_rework/npc_observation_gap_report.md.
 */

import type { SimulationWorld } from '../../world';
import type { PersistentActor } from '../types';

const PLAYER_ACTOR_ID = 'PLAYER';

export interface NpcWorldSnapshotRecord {
  seq: number;
  bashoIndex: number;
  actorId: string;
  shikona: string;
  active: boolean;
  currentDivision: string | null;
  rankLabel: string | null;
  rankScore: number | null;
  careerBashoCount: number;
  plannedCareerBasho?: number | null;
  wins?: number;
  losses?: number;
  absences?: number;
  abilitySummary?: { total?: number; average?: number; max?: number };
  careerBand?: string | null;
  aptitudeTier?: string | null;
  retirementProfile?: string | null;
  growthType?: string | null;
  highestObservedDivision?: string | null;
  highestObservedRankLabel?: string | null;
}

const lastResultOf = (actor: PersistentActor) => {
  const arr = actor.recentBashoResults;
  return arr && arr.length > 0 ? arr[arr.length - 1] : undefined;
};

// growthBias is a continuous knob; bucket it for diagnostic reporting only.
const growthTypeFromBias = (bias: number | undefined): string | null => {
  if (bias === undefined || bias === null || Number.isNaN(bias)) return null;
  if (bias >= 0.15) return 'EARLY';
  if (bias <= -0.15) return 'LATE';
  return 'STANDARD';
};

const summarizeAbility = (
  actor: PersistentActor,
): { total?: number; average?: number; max?: number } | undefined => {
  const ability = typeof actor.ability === 'number' ? actor.ability : undefined;
  const basePower = typeof actor.basePower === 'number' ? actor.basePower : undefined;
  if (ability === undefined && basePower === undefined) return undefined;
  const total = (ability ?? 0) + (basePower ?? 0);
  const components = [ability, basePower].filter(
    (v): v is number => typeof v === 'number',
  );
  return {
    total,
    average: components.length ? total / components.length : undefined,
    max: components.length ? Math.max(...components) : undefined,
  };
};

export const snapshotNpcWorldForDiagnostics = (
  world: SimulationWorld,
  opts: { seq: number; bashoIndex: number },
): NpcWorldSnapshotRecord[] => {
  const out: NpcWorldSnapshotRecord[] = [];
  for (const actor of world.actorRegistry.values()) {
    if (actor.actorId === PLAYER_ACTOR_ID || actor.actorType === 'PLAYER') continue;
    const last = lastResultOf(actor);
    out.push({
      seq: opts.seq,
      bashoIndex: opts.bashoIndex,
      actorId: actor.actorId,
      shikona: actor.shikona,
      active: actor.active,
      currentDivision: actor.currentDivision ?? actor.division ?? null,
      rankLabel: last?.rankName ?? null,
      rankScore: typeof actor.rankScore === 'number' ? actor.rankScore : null,
      careerBashoCount: actor.careerBashoCount ?? 0,
      plannedCareerBasho: actor.plannedCareerBasho ?? null,
      wins: last?.wins,
      losses: last?.losses,
      absences: last?.absent,
      abilitySummary: summarizeAbility(actor),
      careerBand: actor.careerBand ?? null,
      aptitudeTier: actor.aptitudeTier ?? null,
      retirementProfile: actor.retirementProfile ?? null,
      growthType: growthTypeFromBias(actor.growthBias),
      // Highest-observed fields are populated by the harness over time, not here.
      highestObservedDivision: null,
      highestObservedRankLabel: null,
    });
  }
  return out;
};
