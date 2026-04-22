import { Division, Rank, RikishiStatus, TimelineEvent } from '../models';
import { ActorType } from './npc/types';
import { SimulationDiagnostics } from './diagnostics';
import { SimulationModelVersion } from './modelVersion';

export type SeasonPhase =
  | 'preseason'
  | 'competition'
  | 'promotion'
  | 'attrition'
  | 'narrative'
  | 'postseason';

export type DomainEventKind =
  | 'SLUMP_STARTED'
  | 'REBOUND_STARTED'
  | 'MAJOR_INJURY'
  | 'PROMOTION'
  | 'DEMOTION'
  | 'SEKITORI_BREAKTHROUGH'
  | 'CAREER_COLLAPSE'
  | 'RETIREMENT'
  | 'YUSHO';

export type DomainEventSeverity = 'info' | 'warning' | 'critical';

export interface DomainEvent {
  seq: number;
  year: number;
  month: number;
  kind: DomainEventKind;
  severity: DomainEventSeverity;
  title: string;
  description: string;
  relatedRank?: Rank;
  metadata?: Record<string, string | number | boolean>;
}

export type GrowthCurveClass = 'EARLY' | 'NORMAL' | 'LATE' | 'GENIUS';
export type VolatilityClass = 'STEADY' | 'SWING' | 'CHAOTIC';
export type DurabilityClass = 'IRON' | 'STANDARD' | 'FRAGILE';
export type ReboundClass = 'RESILIENT' | 'STANDARD' | 'STICKY';
export type RetirementClass = 'EARLY_EXIT' | 'STANDARD' | 'IRONMAN';
export type CeilingBand = 'LOWER' | 'UPPER_MAKUSHITA' | 'SEKITORI' | 'SANYAKU' | 'YOKOZUNA';

export interface TrajectoryProfile {
  growthCurve: GrowthCurveClass;
  volatilityClass: VolatilityClass;
  durabilityClass: DurabilityClass;
  reboundClass: ReboundClass;
  retirementClass: RetirementClass;
  ceilingBand: CeilingBand;
}

export type ArcPhase = 'ASCENT' | 'STALL' | 'SLUMP' | 'REBOUND' | 'COLLAPSE';

export interface ArcState {
  phase: ArcPhase;
  phaseIntensity: number;
  phaseDuration: number;
  carryoverPressure: number;
  trigger?: string;
}

export interface LeagueDivisionEntry {
  id: string;
  shikona: string;
  stableId: string;
  rankScore: number;
  actorType: ActorType;
  entrySeq: number;
  active: boolean;
}

export interface LeagueDivisionState {
  division: Division;
  headcount: number;
  activeHeadcount: number;
  vacancies: number;
  ranks: LeagueDivisionEntry[];
}

export interface LeagueBoundaryContext {
  headcountPressure: number;
  promotionPressure: number;
  demotionPressure: number;
  makushitaExchangeSlots: number;
}

export interface LeaguePopulationState {
  totalHeadcount: number;
  totalActiveHeadcount: number;
  activeBanzukeHeadcount: number;
  maezumoHeadcount: number;
}

export interface LeagueState {
  currentSeason: {
    seq: number;
    year: number;
    month: number;
  };
  population: LeaguePopulationState;
  divisions: Record<Division, LeagueDivisionState>;
  currentCohort: string[];
  boundaryContext: LeagueBoundaryContext;
}

export interface CareerActorState {
  status: RikishiStatus;
  trajectoryProfile: TrajectoryProfile;
  arcState: ArcState;
}

export interface RuntimeTimeline {
  timelineEvents: TimelineEvent[];
  domainEvents: DomainEvent[];
}

export interface RuntimeDiagnostics {
  latest?: SimulationDiagnostics;
  lastCommitteeWarnings: number;
}

export interface SimulationRuntimeSnapshot {
  bundle: SimulationModelBundle;
  league: LeagueState;
  actor: CareerActorState;
  timeline: RuntimeTimeline;
  diagnostics: RuntimeDiagnostics;
}

export interface SimulationPolicyDescriptor {
  id: string;
  label: string;
}

export interface SimulationModelBundle {
  id: string;
  version: SimulationModelVersion;
  competitionPolicy: SimulationPolicyDescriptor;
  trajectoryPolicy: SimulationPolicyDescriptor;
  promotionPolicy: SimulationPolicyDescriptor;
  populationPolicy: SimulationPolicyDescriptor;
  narrativePolicy: SimulationPolicyDescriptor;
}
