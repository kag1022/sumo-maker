import type { EraTag } from './era/types';

// 力士の素質タイプ (アーキタイプ)
export type TalentArchetype = 'MONSTER' | 'GENIUS' | 'HARD_WORKER' | 'AVG_JOE' | 
                              'UNIVERSITY_YOKOZUNA' | 'HIGH_SCHOOL_CHAMP' | 'STREET_FIGHTER';
export type AptitudeTier = 'S' | 'A' | 'B' | 'C' | 'D';
export type CareerBand = 'ELITE' | 'STRONG' | 'STANDARD' | 'GRINDER' | 'WASHOUT';

// 入門区分
export type EntryDivision = 'Maezumo' | 'Makushita60' | 'Sandanme90';

// 力士の成長タイプ
export type GrowthType = 'EARLY' | 'NORMAL' | 'LATE' | 'GENIUS';

// 戦術タイプ
export type TacticsType = 'PUSH' | 'GRAPPLE' | 'TECHNIQUE' | 'BALANCE';

// 体格タイプ
export type BodyType = 'NORMAL' | 'SOPPU' | 'ANKO' | 'MUSCULAR';
export type IchimonId = 'TAIJU' | 'KUROGANE' | 'RAIMEI' | 'HAKUTSURU' | 'HAYATE';
export type StableArchetypeId =
  | 'TRADITIONAL_LARGE'
  | 'TSUKI_OSHI_GROUP'
  | 'GIANT_YOTSU'
  | 'TECHNICAL_SMALL'
  | 'MODERN_SCIENCE'
  | 'MASTER_DISCIPLE';

export type PersonalityType = 'CALM' | 'AGGRESSIVE' | 'SERIOUS' | 'WILD' | 'CHEERFUL' | 'SHY';
export type RetirementProfile = 'EARLY_EXIT' | 'STANDARD' | 'IRONMAN';
export type CollectionType = 'RIKISHI' | 'OYAKATA' | 'KIMARITE' | 'ACHIEVEMENT' | 'RECORD';
export type CollectionTier = 'BRONZE' | 'SILVER' | 'GOLD';

// レア度
export type Rarity = 'N' | 'R' | 'SR' | 'UR';

// スキル（特性）ID
export type Trait =
  // 身体・体質系
  | 'KEIKO_NO_MUSHI'     // 稽古の虫
  | 'TETSUJIN'           // 鉄人
  | 'SOUJUKU'            // 早熟
  | 'TAIKI_BANSEI'       // 大器晩成
  | 'BUJI_KORE_MEIBA'    // 無事之名馬
  | 'GLASS_KNEE'         // ガラスの膝
  | 'BAKUDAN_MOCHI'      // 爆弾持ち
  | 'SABORI_GUSE'        // サボり癖
  // 精神・メンタル系
  | 'OOBUTAI_NO_ONI'     // 大舞台の鬼
  | 'KYOUSHINZOU'        // 強心臓
  | 'KINBOSHI_HUNTER'    // 金星ハンター
  | 'RENSHOU_KAIDOU'     // 連勝街道
  | 'KIBUNYA'            // 気分屋
  | 'NOMI_NO_SHINZOU'    // ノミの心臓
  | 'SLOW_STARTER'       // スロースターター
  // 技術・相性系
  | 'KYOJIN_GOROSHI'     // 巨人殺し
  | 'KOHEI_KILLER'       // 小兵キラー
  | 'DOHYOUGIWA_MAJUTSU' // 土俵際の魔術師
  | 'YOTSU_NO_ONI'       // 四つの鬼
  | 'TSUPPARI_TOKKA'     // 突っ張り特化
  | 'ARAWAZASHI'         // 荒技師
  // 追加スキル
  | 'LONG_REACH'
  | 'HEAVY_PRESSURE'
  | 'RECOVERY_MONSTER'
  | 'WEAK_LOWER_BACK'
  | 'OPENING_DASH'
  | 'SENSHURAKU_KISHITSU'
  | 'TRAILING_FIRE'
  | 'PROTECT_LEAD'
  | 'BELT_COUNTER'
  | 'THRUST_RUSH'
  | 'READ_THE_BOUT'
  | 'CLUTCH_REVERSAL';

export type TraitJourneyState = 'LOCKED' | 'LEARNED';
export type TraitJourneySource =
  | 'MENTAL_TRAIT'
  | 'INJURY_RESISTANCE'
  | 'BODY_CONSTITUTION'
  | 'DEBT_CARD'
  | 'LEGACY';

export interface TraitJourneyEntry {
  trait: Trait;
  state: TraitJourneyState;
  source: TraitJourneySource;
  learnedAtBashoSeq?: number;
  learnedYear?: number;
  learnedMonth?: number;
  triggerLabel?: string;
  triggerDetail?: string;
  legacy?: boolean;
}

export interface TraitAwakening {
  trait: Trait;
  bashoSeq: number;
  year: number;
  month: number;
  triggerLabel: string;
  triggerDetail: string;
  legacy?: boolean;
}

export interface BasicProfile {
  realName: string;
  birthplace: string;
  personality: PersonalityType;
}

export interface BodyMetrics {
  heightCm: number;
  weightKg: number;
  reachDeltaCm?: number;
}

export interface RatingState {
  ability: number;
  form: number;
  uncertainty: number;
  lastBashoExpectedWins?: number;
}

export interface AptitudeProfile {
  initialFactor: number;
  growthFactor: number;
  boutFactor: number;
  longevityFactor: number;
}

export interface StagnationState {
  pressure: number;
  makekoshiStreak: number;
  lowWinRateStreak: number;
  stuckBasho: number;
  reboundBoost: number;
  lastTrigger?: 'MAKEKOSHI' | 'LOW_WIN_RATE' | 'BOUNDARY_MISS';
}

// 怪我の種類
export type InjuryType =
  | 'KNEE'
  | 'SHOULDER'
  | 'ELBOW'
  | 'BACK'
  | 'ANKLE'
  | 'NECK'
  | 'WRIST'
  | 'RIB'
  | 'HAMSTRING'
  | 'HIP';

// 怪我の状態
export type InjuryStatusType = 'ACUTE' | 'SUBACUTE' | 'CHRONIC' | 'HEALED';

// 怪我データ
export interface Injury {
  id: string;
  type: InjuryType;
  name: string;      // 表示名（例: 右膝半月板損傷）
  severity: number;  // 重症度 (1-10)
  status: InjuryStatusType;
  occurredAt: { year: number; month: number };
}

// === 三層DNA型 ===

/** 初期能力の天井値を決める軸群 (各 0-100) */
export interface BaseAbilityDNA {
  powerCeiling: number;    // 筋力系統上限
  techCeiling: number;     // 技術系統上限
  speedCeiling: number;    // 出足・足腰系統上限
  ringSense: number;       // 土俵感覚（waza/koshiへの寄与）
  styleFit: number;        // 戦術適性（tacticsボーナスの係数）
}

/** 成長カーブを決める軸 */
export interface GrowthCurveDNA {
  maturationAge: number;   // 18-35: ピーク到達年齢
  peakLength: number;      // 1-12: ピーク持続期間（年）
  lateCareerDecay: number; // 0.1-2.0: 衰退速度係数
  adaptability: number;    // 0-100: 戦術変更時の成長ペナルティ軽減
}

/** 怪我耐性を決める軸 */
export interface DurabilityDNA {
  baseInjuryRisk: number;  // 0.3-2.0: 怪我発生率係数
  partVulnerability: Partial<Record<InjuryType, number>>; // 部位別脆弱性 (0.5-3.0)
  recoveryRate: number;    // 0.5-2.0: 回復力係数
  chronicResistance: number; // 0-100: 慢性化耐性
}

/** キャリア中の変動を決める軸 */
export interface CareerVarianceDNA {
  formVolatility: number;  // 0-100: 調子の振れ幅
  clutchBias: number;      // -50〜+50: 勝負強さ（正で強い）
  slumpRecovery: number;   // 0-100: スランプ復帰速度
  streakSensitivity: number; // 0-100: 連勝/連敗影響度
}

/** 三層DNA + 変動層 = ゲノム */
export interface RikishiGenome {
  base: BaseAbilityDNA;
  growth: GrowthCurveDNA;
  durability: DurabilityDNA;
  variance: CareerVarianceDNA;
}

// 力士の現在の状態（動的に変化）
export interface RikishiStatus {
  stableId: string;
  ichimonId: IchimonId;
  stableArchetypeId: StableArchetypeId;
  shikona: string; // 四股名
  entryAge: number; // 入門時年齢（表示や分析の基準）
  age: number;      // 年齢 (15歳〜)
  rank: Rank;       // 現在の番付
  
  // 8軸能力値 (0-100+)
  stats: {
    tsuki: number;  // 突き
    oshi: number;   // 押し
    kumi: number;   // 組力
    nage: number;   // 投げ
    koshi: number;  // 腰
    deashi: number; // 出足
    waza: number;   // 技術
    power: number;  // 筋力
  };

  // 内部パラメータ
  potential: number;     // 潜在能力（成長限界に影響）
  growthType: GrowthType;
  tactics: TacticsType;    // 戦術タイプ
  archetype?: TalentArchetype; // 素質タイプ
  aptitudeTier: AptitudeTier; // 素質ランク
  aptitudeFactor: number; // 隠し素質係数
  aptitudeProfile?: AptitudeProfile;
  careerBand?: CareerBand;
  entryDivision?: EntryDivision; // 入門区分
  signatureMoves: string[];    // 得意技リスト
  kimariteRepertoire?: KimariteRepertoire;
  styleIdentityProfile?: StyleIdentityProfile;
  bodyType: BodyType;          // 体格タイプ
  profile: BasicProfile;       // 基本プロフィール
  bodyMetrics: BodyMetrics;    // 身長・体重
  traits: Trait[];             // スキル（特性）リスト
  traitJourney?: TraitJourneyEntry[];
  durability: number;      // 基礎耐久力
  currentCondition: number; // 現在の調子 (0-100)
  ratingState: RatingState; // 連続実力モデル状態
  injuryLevel: number;   // 【非推奨】怪我レベル (0:なし, >0:負傷あり) - 後方互換性のため残す
  injuries: Injury[];    // 詳細な怪我リスト
  isOzekiKadoban?: boolean; // 大関カド番
  isOzekiReturn?: boolean; // 大関陥落直後の特例復帰チャンス（次の1場所のみ）
  retirementProfile?: RetirementProfile; // 引退傾向プロファイル
  genome?: RikishiGenome;  // 三層DNA（v9以降で必須化、後方互換のためoptional）
  kataProfile?: KataProfile;
  buildSummary?: BuildSummary;
  careerSeed?: CareerSeed;
  careerNarrative?: CareerNarrativeSummary;
  careerRivalryDigest?: CareerRivalryDigest;
  mentorId?: string;
  spirit: number;
  stagnation?: StagnationState;

  history: CareerHistory;
  
  // 統計履歴（年ごとの能力値）
  statHistory: { age: number; stats: RikishiStatus['stats'] }[];
}

// 階級定義
export type Division = 'Makuuchi' | 'Juryo' | 'Makushita' | 'Sandanme' | 'Jonidan' | 'Jonokuchi' | 'Maezumo';
export type RankedDivision = Exclude<Division, 'Maezumo'>;
export type RankScaleSlots = Partial<Record<RankedDivision, number>>;

// 番付情報
export interface Rank {
  division: Division;
  name: string; // "横綱", "大関", "前頭" など
  side?: 'East' | 'West';
  number?: number; // 枚数
}

// 親方（プレイヤー補正）
export interface Oyakata {
  id: string;
  name: string;
  trait: string; // 特性名
  secretStyle?: StyleArchetype;
  // 補正係数 (1.0 = 標準)
  growthMod: {
    [key: string]: number; // 'tsuki': 1.2 など
  };
  injuryMod: number; // 怪我しやすさ
  spiritMods?: {
    injuryPenalty?: number;
    slumpPenalty?: number;
    promotionBonus?: number;
  };
}

export interface OyakataProfile {
  id: string;
  sourceCareerId: string;
  shikona: string;
  displayName: string;
  trait: string;
  secretStyle?: StyleArchetype;
  growthMod: Oyakata['growthMod'];
  injuryMod: number;
  maxRank: Rank;
  legacyStars: 1 | 2 | 3 | 4 | 5;
  cooldownUntilCareerIndex?: number;
}

export type StyleArchetype =
  | 'YOTSU'
  | 'TSUKI_OSHI'
  | 'MOROZASHI'
  | 'DOHYOUGIWA'
  | 'NAGE_TECH'
  | 'POWER_PRESSURE';

export type StyleCompatibility = 'EXCELLENT' | 'GOOD' | 'NEUTRAL' | 'POOR';

export type BodyConstitution =
  | 'BALANCED_FRAME'
  | 'HEAVY_BULK'
  | 'LONG_REACH'
  | 'SPRING_LEGS';

export type AmateurBackground =
  | 'MIDDLE_SCHOOL'
  | 'HIGH_SCHOOL'
  | 'STUDENT_ELITE'
  | 'COLLEGE_YOKOZUNA';

export type MentalTraitType =
  | 'CALM_ENGINE'
  | 'BIG_STAGE'
  | 'VOLATILE_FIRE'
  | 'STONEWALL';

export type InjuryResistanceType =
  | 'FRAGILE'
  | 'STANDARD'
  | 'IRON_BODY';

export type DebtCardId = 'OLD_KNEE' | 'PRESSURE_LINEAGE' | 'LATE_START';

export interface StyleProfile {
  primary: StyleArchetype;
  secondary: StyleArchetype;
  secret?: StyleArchetype;
  dominant: StyleArchetype;
  compatibility: StyleCompatibility;
  label: string;
  confidence: number;
  source: 'DESIGNED' | 'REALIZED';
  locked?: boolean;
}

export interface StyleIdentityEntry {
  aptitude: number;
  resistance: number;
  sample: number;
  lastDelta: number;
}

export interface StyleIdentityProfile {
  version: 1;
  styles: Record<StyleArchetype, StyleIdentityEntry>;
  lastUpdatedBashoSeq?: number;
}

export type WinRoute =
  | 'PUSH_OUT'
  | 'BELT_FORCE'
  | 'THROW_BREAK'
  | 'PULL_DOWN'
  | 'EDGE_REVERSAL'
  | 'REAR_FINISH'
  | 'LEG_ATTACK';

export type KimariteRepertoireTier = 'PRIMARY' | 'SECONDARY' | 'CONTEXT' | 'RARE';

export interface KimariteRepertoireEntry {
  kimarite: string;
  route: WinRoute;
  tier: KimariteRepertoireTier;
  affinity: number;
  unlockedAtBashoSeq?: number;
}

export interface KimariteRepertoire {
  version: 1;
  provisional: boolean;
  primaryRoutes: WinRoute[];
  secondaryRoutes: WinRoute[];
  routeLockConfidence?: number;
  settledAtBashoSeq?: number;
  entries: KimariteRepertoireEntry[];
}

export interface StyleEvolutionProfile {
  techniqueAffinity: number;
  birthStyleBias: TacticsType;
  branchState: 'NONE' | 'PENDING' | 'LOCKED';
  pendingTechniqueCount: number;
  branchedAtBashoSeq?: number;
}

export interface LifeCardSummary {
  slot: '経歴' | '骨格' | '相撲観' | '気質' | '背負うもの';
  label: string;
  previewTag: string;
  reportLine: string;
}

export type CareerDesignPremiseCategory =
  | '入門背景'
  | '身体的前提'
  | '年齢・開始条件'
  | '部屋・環境'
  | '気質'
  | '期待'
  | '不安材料'
  | '観測軸';

export interface CareerDesignPremise {
  category: CareerDesignPremiseCategory;
  label: string;
  summary: string;
  interpretation: string;
}

export interface CareerDesignInterpretation {
  growth: string;
  durability: string;
  stability: string;
  promotion: string;
  variance: string;
}

export interface BuildSummary {
  oyakataName: string;
  amateurBackground: AmateurBackground;
  bodyConstitution: BodyConstitution;
  heightPotentialCm: number;
  weightPotentialKg: number;
  reachDeltaCm: number;
  spentPoints: number;
  remainingPoints: number;
  debtCount: number;
  debtCards?: DebtCardId[];
  secretStyle?: StyleArchetype;
  careerBandLabel: string;
  initialConditionSummary?: {
    birthplace: string;
    stableName: string;
    entryAge: number;
    entryPathLabel: string;
    temperamentLabel: string;
    bodySeedLabel: string;
    initialHeightCm: number;
    initialWeightKg: number;
  };
  growthSummary?: {
    peakHeightCm: number;
    peakWeightKg: number;
    bodyTypeLabel: string;
  };
  lifeCards?: LifeCardSummary[];
  dominantLifeCard?: LifeCardSummary['slot'];
  lifeCardNarrativeSeeds?: {
    dominant: string;
    burden: string;
    frameAndInjury: string;
    designedVsRealized: string;
  };
  designPremises?: CareerDesignPremise[];
  designInterpretation?: CareerDesignInterpretation;
}

export interface CareerSeedBiases {
  startRankBias: number;
  earlyGrowthBias: number;
  peakAgeShift: number;
  peakDurationBias: number;
  styleBias: number;
  styleSettlingBias: number;
  durabilityBias: number;
  injuryRiskBias: number;
  slumpResistanceBias: number;
  reboundBias: number;
  volatilityBias: number;
  clutchBias: number;
  socialPressureBias: number;
  rivalryBias: number;
}

export interface CareerSeed {
  birthplace: string;
  stableId: string;
  stableName: string;
  entryAge: number;
  entryPath: string;
  entryPathLabel: string;
  temperament: string;
  temperamentLabel: string;
  bodySeed: string;
  bodySeedLabel: string;
  initialHeightCm: number;
  initialWeightKg: number;
  peakHeightCm: number;
  peakWeightKg: number;
  primaryStyle: StyleArchetype;
  secondaryStyle: StyleArchetype;
  biases: CareerSeedBiases;
}

export interface RivalSummary {
  shikona: string;
  balance: string;
  summary: string;
}

export interface TurningPointSummary {
  bashoSeq: number;
  year: number;
  month: number;
  label: string;
  summary: string;
  severity: number;
}

export interface CareerNarrativeSummary {
  initialConditions: string;
  growthArc: string;
  careerIdentity: string;
  designEchoes?: string[];
  turningPoints: TurningPointSummary[];
  rivalDigest?: RivalSummary;
  retirementDigest: string;
}

export interface RivalHeadToHeadSummary {
  bouts: number;
  wins: number;
  losses: number;
  absences: number;
}

export interface RivalryEpisodeDigest {
  bashoSeq: number;
  bashoLabel: string;
  summary: string;
}

export interface RivalryEntryBase {
  opponentId: string;
  shikona: string;
  representativeRank: Rank;
  representativeRankLabel: string;
  headToHead: RivalHeadToHeadSummary;
  summary: string;
  evidenceCount: number;
  featuredSeq: number;
  featuredBashoLabel: string;
  featuredReason: string;
}

export interface TitleBlockerEntry extends RivalryEntryBase {
  kind: 'TIED_FINAL' | 'DIRECT_BLOCK' | 'TITLE_RACE';
  blockedYushoCount: number;
  episodes: RivalryEpisodeDigest[];
}

export interface EraTitanEntry extends RivalryEntryBase {
  overlapCount: number;
  yushoCount: number;
  ozekiYokozunaBasho: number;
  episodes: RivalryEpisodeDigest[];
}

export interface NemesisEntry extends RivalryEntryBase {
  lossMargin: number;
  sameDivisionOverlapCount: number;
  hasTitleBlockHistory: boolean;
  episodes: RivalryEpisodeDigest[];
}

export interface CareerRivalryDigest {
  titleBlockers: TitleBlockerEntry[];
  eraTitans: EraTitanEntry[];
  nemesis: NemesisEntry[];
}

export interface OyakataUnlockRule {
  type: 'STARTER' | 'CAREER';
  summary: string;
}

export interface OyakataBlueprint {
  id: string;
  name: string;
  ichimonId: IchimonId;
  advantage: string;
  drawback: string;
  secretStyle: StyleArchetype;
  growthMods: Oyakata['growthMod'];
  spiritMods: NonNullable<Oyakata['spiritMods']>;
  injuryMod: number;
  unlockRule: OyakataUnlockRule;
  sourceCareerId?: string;
  maxRank?: Rank;
}

export interface PrizeBreakdownEntry {
  key:
    | 'MAKUUCHI_YUSHO'
    | 'JURYO_YUSHO'
    | 'MAKUSHITA_YUSHO'
    | 'SANDANME_YUSHO'
    | 'JONIDAN_YUSHO'
    | 'JONOKUCHI_YUSHO'
    | 'SHUKUN'
    | 'KANTO'
    | 'GINO';
  label: string;
  unitYen: number;
  count: number;
  subtotalYen: number;
}

export interface CareerPrizeBreakdown {
  asOf: string;
  totalYen: number;
  entries: PrizeBreakdownEntry[];
  conversion: PointConversionBreakdown;
}

export interface PointConversionBreakdown {
  tier1Yen: number;
  tier1Pt: number;
  tier2Yen: number;
  tier2Pt: number;
  tier3Yen: number;
  tier3Pt: number;
  rawPoints: number;
  cappedPt: number;
}

export interface CareerRewardSummary {
  conversionRuleId: string;
  rawPoints: number;
  awardedPoints: number;
  convertedPoints: number; // deprecated: alias of awardedPoints
  granted: boolean;
  grantedAt?: string;
}

export type WalletTransactionReason =
  | 'BUILD_REGISTRATION'
  | 'SCOUT_DRAW'
  | 'SCOUT_OVERRIDE'
  | 'CAREER_START'
  | 'EXPERIMENT_START'
  | 'OBSERVER_UPGRADE'
  | 'CAREER_PRIZE_REWARD'
  | 'MANUAL_TOP_UP'
  | 'AD_REWARD'
  | 'AD_REWARD_TOKEN'
  | 'OTHER';

export interface WalletTransaction {
  id: string;
  kind: 'SPEND' | 'EARN';
  amount: number;
  balanceAfter: number;
  reason: WalletTransactionReason;
  careerId?: string;
  createdAt: string;
}

export interface CollectionEntry {
  id: string;
  type: CollectionType;
  key: string;
  sourceCareerId?: string;
  unlockedAt: string;
  tier?: CollectionTier;
  progress?: number;
  target?: number;
  isNew?: boolean;
}

export type BuildAxisWinStyle = 'STABILITY' | 'BURST' | 'COMEBACK';
export type BuildAxisPeakDesign = 'EARLY' | 'BALANCED' | 'LATE';
export type BuildAxisVolatility = 'LOW' | 'MID' | 'HIGH';
export type BuildAxisDurability = 'IRON' | 'BALANCED' | 'GAMBLE';
export type BuildAxisClutch = 'BIG_MATCH' | 'BALANCED' | 'DEVELOPMENT';
export type BuildIntent = 'YUSHO' | 'LONGEVITY' | 'COLLECTOR' | 'BALANCE';
export type CareerSaveTag =
  | 'GREAT_RIKISHI'
  | 'UNFINISHED_TALENT'
  | 'LATE_BLOOM_SUCCESS'
  | 'INJURY_TRAGEDY'
  | 'TURBULENT_LIFE'
  | 'STABLE_MAKUUCHI'
  | 'JURYO_CRAFTSMAN'
  | 'GENERATION_LEADER'
  | 'RIVALRY_MEMORY'
  | 'RARE_RECORD'
  | 'FAVORITE'
  | 'MEMORABLE_SUPPORT'
  | 'UNEXPECTED'
  | 'RESEARCH_SAMPLE'
  | 'REREAD';
export type ObservationRuleMode = 'STANDARD' | 'EXPERIMENT';
export type ObservationStanceId =
  | 'PROMOTION_EXPECTATION'
  | 'LATE_BLOOM'
  | 'STABILITY'
  | 'TURBULENCE'
  | 'RIVALRY'
  | 'RARE_RECORD'
  | 'INJURY_COMEBACK'
  | 'LONGEVITY';
export type ExperimentPresetId =
  | 'INJURY_LOW'
  | 'INJURY_HIGH'
  | 'PROMOTION_SOFT'
  | 'PROMOTION_STRICT'
  | 'LATE_BLOOM'
  | 'RETIREMENT_SOFT';
export type ObserverUpgradeId =
  | 'SCOUT_NOTES'
  | 'SAVE_TAGS_PLUS'
  | 'ARCHIVE_FILTERS'
  | 'RIVALRY_READING'
  | 'KEY_BASHO_PICKUP'
  | 'EXPERIMENT_LAB';

export interface AptitudePlan {
  reveal: boolean;
  tuneStep: -2 | -1 | 0 | 1 | 2;
}

export type KataArchetype =
  | 'TSUKI_OSHI'
  | 'HIDARI_YOTSU_YORI'
  | 'MIGI_YOTSU_YORI'
  | 'YOTSU_NAGE'
  | 'BATTLECRAFT';

export interface KataProfile {
  settled: boolean;
  confidence: number;
  archetype?: KataArchetype;
  displayName?: string;
  dominantMove?: string;
  settledAtBashoSeq?: number;
  // 内部状態（表示・公開用途では未使用）
  pendingArchetype?: KataArchetype;
  pendingCount?: number;
}

export interface BuildSpecV4 {
  shikona: string;
  profile: BasicProfile;
  history: 'JHS_GRAD' | 'HS_GRAD' | 'HS_YOKOZUNA' | 'UNI_YOKOZUNA';
  entryDivision: EntryDivision;
  bodyType: BodyType;
  bodyMetrics: BodyMetrics;
  traitSlots: number;
  selectedTraits: Trait[];
  genome: RikishiGenome;
  aptitudeBaseTier: AptitudeTier;
  aptitudePlan: AptitudePlan;
  selectedStableId: string | null;
  selectedOyakataId: string | null;
  abstractAxes: {
    winStyle: BuildAxisWinStyle;
    peakDesign: BuildAxisPeakDesign;
    volatility: BuildAxisVolatility;
    durability: BuildAxisDurability;
    clutch: BuildAxisClutch;
  };
}

export type BuildSpecV3 = BuildSpecV4;
export type BuildSpecV2 = BuildSpecV4;

export interface BuildSpecVNext {
  oyakataId: string;
  aptitudeTier?: AptitudeTier;
  heightPotentialCm: number;
  weightPotentialKg: number;
  reachDeltaCm: number;
  bodyConstitution: BodyConstitution;
  amateurBackground: AmateurBackground;
  primaryStyle: StyleArchetype;
  secondaryStyle: StyleArchetype;
  mentalTrait: MentalTraitType;
  injuryResistance: InjuryResistanceType;
  debtCards: DebtCardId[];
}

export interface SimulationRunOptions {
  selectedOyakataId?: string | null;
  observationRuleMode?: ObservationRuleMode;
  observationStanceId?: ObservationStanceId;
  experimentPresetId?: ExperimentPresetId;
  // Career-archive observation build metadata (Phase 2)
  observationThemeId?: string;
  observationModifierIds?: string[];
  // 匿名時代スナップショット metadata
  eraSnapshotId?: string;
  eraTags?: EraTag[];
  publicEraLabel?: string;
}

// キャリア履歴
export interface CareerHistory {
  records: BashoRecord[];
  events: TimelineEvent[];
  maxRank: Rank;
  totalWins: number;
  totalLosses: number;
  totalAbsent: number;
  yushoCount: {
    makuuchi: number;
    juryo: number;
    makushita: number;
    others: number;
  };
  kimariteTotal: Record<string, number>; // 通算決まり手カウント
  winRouteTotal?: Partial<Record<WinRoute, number>>;
  title?: string; // 二つ名
  prizeBreakdown?: CareerPrizeBreakdown;
  rewardSummary?: CareerRewardSummary;
  bodyTimeline?: Array<{ bashoSeq: number; year: number; month: number; weightKg: number }>;
  highlightEvents?: HighlightEvent[];
  traitAwakenings?: TraitAwakening[];
  careerTurningPoints?: CareerTurningPoint[];
  careerTurningPoint?: CareerTurningPoint;
  realismKpi?: RealismKpiSnapshot;
}

// 1場所ごとの記録
export interface BashoRecord {
  year: number;
  month: number; // 1, 3, 5, 7, 9, 11
  rank: Rank;
  wins: number;
  losses: number;
  absent: number;
  yusho: boolean; // 優勝したか
  junYusho?: boolean; // 準優勝したか（決定戦敗者、または単独トップ時の次点勝ち星集団）
  specialPrizes: string[]; // 三賞
  expectedWins?: number;
  strengthOfSchedule?: number;
  performanceOverExpected?: number;
  kinboshi?: number; // 金星獲得数（平幕が横綱を破った回数）
  kimariteCount?: Record<string, number>; // 決まり手カウント (勝ち技のみ)
  winRouteCount?: Partial<Record<WinRoute, number>>;
  scaleSlots?: RankScaleSlots; // その場所時点の番付スロット構成（相対スケール）
  bodyWeightKg?: number;
}

export type HighlightEventTag =
  | 'MAJOR_INJURY'
  | 'KINBOSHI'
  | 'YUSHO'
  | 'PROMOTION'
  | 'RETIREMENT'
  | 'FIRST_SEKITORI'
  | 'JURYO_DROP';

export type CareerTurningPointKind =
  | 'FIRST_SEKITORI'
  | 'MAKUUCHI_PROMOTION'
  | 'YUSHO'
  | 'MAJOR_INJURY'
  | 'JURYO_DROP'
  | 'SLUMP_RECOVERY'
  | 'RETIREMENT';

export interface HighlightEvent {
  bashoSeq: number;
  year: number;
  month: number;
  tag: HighlightEventTag;
  label: string;
}

export interface CareerTurningPoint {
  bashoSeq: number;
  year: number;
  month: number;
  kind: CareerTurningPointKind;
  label: string;
  reason: string;
  severity: number;
}

export interface RealismKpiSnapshot {
  careerWinRate: number;
  nonSekitoriCareerWinRate?: number;
  losingCareerRate?: number;
  careerWinRateLe35Rate?: number;
  careerWinRateLe30Rate?: number;
  allCareerRetireAgeP50?: number;
  nonSekitoriMedianBasho?: number;
  stagnationPressure?: number;
}

export type RealismProbeRunKind =
  | 'quick'
  | 'retire'
  | 'aptitude'
  | 'full';

export interface RealismStyleBucketMetrics {
  sample: number;
  uniqueKimariteP50: number;
  uniqueKimariteP90: number;
  top1MoveShareP50: number;
  top3MoveShareP50: number;
  rareMoveRate: number;
}

export interface RealismProbeMetrics extends RealismKpiSnapshot {
  sekitoriRate?: number;
  makuuchiRate?: number;
  sanyakuRate?: number;
  yokozunaRate?: number;
  lowTierRate?: number;
  tierCareerWinRate?: Partial<Record<AptitudeTier, number>>;
  uniqueKimariteP50?: number;
  uniqueKimariteP90?: number;
  topMoveShareP50?: number;
  top3MoveShareP50?: number;
  rareMoveRate?: number;
  kimariteVariety20Rate?: number;
  techniqueBranchRate?: number;
  finalTechniqueRate?: number;
  styleBucketMetrics?: Partial<Record<'PUSH' | 'GRAPPLE' | 'TECHNIQUE', RealismStyleBucketMetrics>>;
}

export interface RealismProbeResult {
  runKind: RealismProbeRunKind;
  scenarioId: string;
  sample: number;
  modelVersion: string;
  compiledAt?: string;
  generatedAt: string;
  metrics: RealismProbeMetrics;
  gateResult: Record<string, boolean>;
}

// タイムラインイベント
export interface TimelineEvent {
  year: number;
  month: number;
  type: 'ENTRY' | 'PROMOTION' | 'DEMOTION' | 'YUSHO' | 'INJURY' | 'RETIREMENT' | 'TRAIT_AWAKENING' | 'OTHER';
  description: string;
}
