import { Division } from '../../models';
import { EnemyStyleBias } from '../../catalog/enemyData';

export type TopDivision = 'Makuuchi' | 'Juryo';
export type LowerDivision = 'Makushita' | 'Sandanme' | 'Jonidan' | 'Jonokuchi';
export type ActiveDivision = TopDivision | LowerDivision;

export interface NpcBashoResult {
  division: Division;
  wins: number;
  losses: number;
}

export interface PersistentNpc {
  id: string;
  seedId: string;
  shikona: string;
  stableId: string;
  division: Division;
  currentDivision: Division;
  rankScore: number;
  basePower: number;
  form: number;
  volatility: number;
  styleBias: EnemyStyleBias;
  heightCm: number;
  weightKg: number;
  growthBias: number;
  retirementBias: number;
  entryAge: number;
  age: number;
  careerBashoCount: number;
  active: boolean;
  entrySeq: number;
  retiredAtSeq?: number;
  riseBand?: 1 | 2 | 3;
  recentBashoResults: NpcBashoResult[];
}

export type NpcRegistry = Map<string, PersistentNpc>;

export interface NpcNameContext {
  usedNormalizedShikona: Set<string>;
  stableGlyphById: Map<string, string>;
  fallbackSerial: number;
}

export interface NpcUniverse {
  registry: NpcRegistry;
  rosters: Record<ActiveDivision, PersistentNpc[]>;
  maezumoPool: PersistentNpc[];
  nameContext: NpcNameContext;
  nextNpcSerial: number;
}

export const TOP_DIVISION_SLOTS: Record<TopDivision, number> = {
  Makuuchi: 42,
  Juryo: 28,
};

export const LOWER_DIVISION_SLOTS: Record<LowerDivision, number> = {
  Makushita: 120,
  Sandanme: 180,
  Jonidan: 200,
  Jonokuchi: 60,
};

export const ACTIVE_DIVISIONS: ActiveDivision[] = [
  'Makuuchi',
  'Juryo',
  'Makushita',
  'Sandanme',
  'Jonidan',
  'Jonokuchi',
];

export const isTopDivision = (division: Division): division is TopDivision =>
  division === 'Makuuchi' || division === 'Juryo';

export const isLowerDivision = (division: Division): division is LowerDivision =>
  division === 'Makushita' ||
  division === 'Sandanme' ||
  division === 'Jonidan' ||
  division === 'Jonokuchi';
