import type { Division } from '../models';

export type EraTag =
  | 'yokozuna_stable'
  | 'yokozuna_absent'
  | 'ozeki_crowded'
  | 'top_division_turbulent'
  | 'generation_shift'
  | 'sekitori_boundary_hot'
  | 'makushita_congested'
  | 'young_wave'
  | 'veteran_heavy'
  | 'balanced_era';

export type EraDataQualityStatus = 'complete' | 'partial' | 'fallback';

export interface EraQuantileProfile {
  p25: number;
  p50: number;
  p75: number;
}

export interface EraStrengthProfile extends EraQuantileProfile {
  p90?: number;
}

export interface EraBodyProfile {
  heightP50?: number;
  weightP50?: number;
}

export interface EraCareerStageProfile {
  rookie: number;
  rising: number;
  prime: number;
  veteran: number;
  declining: number;
}

export interface EraTopRankStructure {
  yokozunaCount: number;
  ozekiCount: number;
  sekiwakeCount: number;
  komusubiCount: number;
  maegashiraCount: number;
  juryoCount: number;
  makushitaUpperCount: number;
}

export interface EraBoundaryProfile {
  sekitoriBoundaryPressure: number;
  makushitaUpperCongestion: number;
  juryoDemotionPressure: number;
  crossDivisionBoutIntensity: number;
}

export interface EraSourceCompleteness {
  status: EraDataQualityStatus;
  actualDivisionCount: number;
  missingDivisions: Division[];
  fallbackSourceBashoKey?: string;
}

export interface EraSnapshot {
  id: string;
  sourceBashoKey: string;
  sourceLabelInternal: string;
  publicEraLabel: string;
  eraTags: EraTag[];
  divisionHeadcounts: Partial<Record<Division, number>>;
  topRankStructure: EraTopRankStructure;
  divisionAgeProfile: Partial<Record<Division, EraQuantileProfile>>;
  divisionBodyProfile?: Partial<Record<Division, EraBodyProfile>>;
  divisionStrengthProfile: Partial<Record<Division, EraStrengthProfile>>;
  careerStageProfile: Partial<Record<Division, EraCareerStageProfile>>;
  boundaryProfile: EraBoundaryProfile;
  sourceCompleteness?: EraSourceCompleteness;
  anonymity: {
    usesRealNames: false;
    usesRealShikona: false;
    oneToOnePersonMapping: false;
  };
}

export interface EraRunMetadata {
  eraSnapshotId?: string;
  eraTags?: EraTag[];
  publicEraLabel?: string;
}
