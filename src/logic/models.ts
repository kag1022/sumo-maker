// 力士の素質タイプ (アーキタイプ)
export type TalentArchetype = 'MONSTER' | 'GENIUS' | 'HARD_WORKER' | 'AVG_JOE' | 
                              'UNIVERSITY_YOKOZUNA' | 'HIGH_SCHOOL_CHAMP' | 'STREET_FIGHTER';

// 入門区分
export type EntryDivision = 'Maezumo' | 'Makushita60' | 'Sandanme90';

// 力士の成長タイプ
export type GrowthType = 'EARLY' | 'NORMAL' | 'LATE' | 'GENIUS';

// 戦術タイプ
export type TacticsType = 'PUSH' | 'GRAPPLE' | 'TECHNIQUE' | 'BALANCE';

// 体格タイプ
export type BodyType = 'NORMAL' | 'SOPPU' | 'ANKO' | 'MUSCULAR';

export type PersonalityType = 'CALM' | 'AGGRESSIVE' | 'SERIOUS' | 'WILD' | 'CHEERFUL' | 'SHY';

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

export interface BasicProfile {
  realName: string;
  birthplace: string;
  personality: PersonalityType;
}

export interface BodyMetrics {
  heightCm: number;
  weightKg: number;
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

// 力士の現在の状態（動的に変化）
export interface RikishiStatus {
  heyaId: string;
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
  entryDivision?: EntryDivision; // 入門区分
  signatureMoves: string[];    // 得意技リスト
  bodyType: BodyType;          // 体格タイプ
  profile: BasicProfile;       // 基本プロフィール
  bodyMetrics: BodyMetrics;    // 身長・体重
  traits: Trait[];             // スキル（特性）リスト
  durability: number;      // 基礎耐久力
  currentCondition: number; // 現在の調子 (0-100)
  injuryLevel: number;   // 【非推奨】怪我レベル (0:なし, >0:負傷あり) - 後方互換性のため残す
  injuries: Injury[];    // 詳細な怪我リスト
  isOzekiKadoban?: boolean; // 大関カド番
  isOzekiReturn?: boolean; // 大関陥落直後の特例復帰チャンス（次の1場所のみ）

  history: CareerHistory;
  
  // 統計履歴（年ごとの能力値）
  statHistory: { age: number; stats: RikishiStatus['stats'] }[];
}

// 階級定義
export type Division = 'Makuuchi' | 'Juryo' | 'Makushita' | 'Sandanme' | 'Jonidan' | 'Jonokuchi' | 'Maezumo';

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
  // 補正係数 (1.0 = 標準)
  growthMod: {
    [key: string]: number; // 'tsuki': 1.2 など
  };
  injuryMod: number; // 怪我しやすさ
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
  title?: string; // 二つ名
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
  specialPrizes: string[]; // 三賞
  kinboshi?: number; // 金星獲得数（平幕が横綱を破った回数）
  kimariteCount?: Record<string, number>; // 決まり手カウント (勝ち技のみ)
}

// タイムラインイベント
export interface TimelineEvent {
  year: number;
  month: number;
  type: 'ENTRY' | 'PROMOTION' | 'DEMOTION' | 'YUSHO' | 'INJURY' | 'RETIREMENT' | 'OTHER';
  description: string;
}
