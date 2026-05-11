import { AptitudeProfile, AptitudeTier, CareerBand, Division, RetirementProfile, StagnationState } from '../../models';
import { EnemyStyleBias } from '../../catalog/enemyData';

export type TopDivision = 'Makuuchi' | 'Juryo';
export type LowerDivision = 'Makushita' | 'Sandanme' | 'Jonidan' | 'Jonokuchi';
export type ActiveDivision = TopDivision | LowerDivision;
export type ActorType = 'PLAYER' | 'NPC';
export type NpcNamingSchoolId = 'HAYATE' | 'TRADITION' | 'KAREI' | 'GORIKI';
export type NpcStableNamingProfileId =
  | 'CLASSIC_WAKA'
  | 'REFINED_KOTO'
  | 'GORIKI_DRAGON'
  | 'NATURE'
  | 'LOCAL'
  | 'PLAIN'
  | 'SURNAME';

export interface NpcBashoResult {
  division: Division;
  rankName?: string;
  rankNumber?: number;
  wins: number;
  losses: number;
  absent?: number;
}

export interface PersistentActor {
  actorId: string;
  actorType: ActorType;
  id: string;
  seedId: string;
  shikona: string;
  stableId: string;
  division: Division;
  currentDivision: Division;
  rankScore: number;
  basePower: number;
  ability: number;
  uncertainty: number;
  form: number;
  volatility: number;
  styleBias: EnemyStyleBias;
  heightCm: number;
  weightKg: number;
  growthBias: number;
  retirementBias: number;
  retirementProfile?: RetirementProfile;
  aptitudeTier?: AptitudeTier;
  aptitudeFactor?: number;
  aptitudeProfile?: AptitudeProfile;
  careerBand?: CareerBand;
  entryAge: number;
  age: number;
  careerBashoCount: number;
  /**
   * Fix-3: NPC 生成時に Heisei 期 career_bashos 分布から triangular サンプリングした
   * 想定キャリア場所数。runNpcRetirementStep がこの値の周辺で sigmoid hazard を発火し、
   * 生存曲線を実史 (p10=4 / p50=32 / p90=89) に整合させる。
   * 未設定の旧 NPC は Heisei 中央値 32 にフォールバック。
   */
  plannedCareerBasho?: number;
  active: boolean;
  entrySeq: number;
  retiredAtSeq?: number;
  riseBand?: 1 | 2 | 3;
  stagnation?: StagnationState;
  recentBashoResults: NpcBashoResult[];
  /**
   * EraSnapshot に基づく synthetic career start year。NPC が「既にその番付にいる」
   * 状態を作るために、生成時の age と initialCareerStage から逆算した擬似入門年。
   * - 過去場所履歴は生成しない (age / careerBashoCount / rank と矛盾しない値)
   * - 全 NPC が同じ値にならないこと
   * EraSnapshot 不在時は undefined。
   */
  syntheticCareerStartYear?: number;
  /**
   * EraSnapshot.careerStageProfile から sampling した初期キャリアステージ。
   * 上位 sanyaku スロットには rookie/rising が割り当たらないように gating される。
   * EraSnapshot 不在時は undefined (legacy 動作)。
   */
  initialCareerStage?: 'rookie' | 'rising' | 'prime' | 'veteran' | 'declining';
}

export type PersistentNpc = PersistentActor;

export type ActorRegistry = Map<string, PersistentActor>;
export type NpcRegistry = ActorRegistry;

export interface NpcNameContext {
  blockedNormalizedShikona: Set<string>;
  stableCrownById: Map<string, string>;
  stableSchoolById: Map<string, NpcNamingSchoolId>;
  stableProfileById: Map<string, NpcStableNamingProfileId>;
  fallbackSerial: number;
  denylistRejectedCount: number;
}

export interface NpcUniverse {
  registry: ActorRegistry;
  rosters: Record<ActiveDivision, PersistentActor[]>;
  maezumoPool: PersistentActor[];
  nameContext: NpcNameContext;
  nextNpcSerial: number;
}

export const TOP_DIVISION_SLOTS: Record<TopDivision, number> = {
  Makuuchi: 42,
  Juryo: 28,
};

export const LOWER_DIVISION_SLOTS: Record<LowerDivision, number> = {
  Makushita: 120,
  // Heisei-wide lower-division centerline used for initial world seeding.
  Sandanme: 200,
  Jonidan: 250,
  Jonokuchi: 78,
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
