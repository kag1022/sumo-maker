// 力士の素質タイプ (アーキタイプ)
export type TalentArchetype = 'MONSTER' | 'GENIUS' | 'HARD_WORKER' | 'AVG_JOE' | 
                              'UNIVERSITY_YOKOZUNA' | 'HIGH_SCHOOL_CHAMP' | 'STREET_FIGHTER';

// 入門区分
export type EntryDivision = 'Maezumo' | 'Makushita10' | 'Makushita15';

// 力士の成長タイプ
export type GrowthType = 'EARLY' | 'NORMAL' | 'LATE' | 'GENIUS';

// 戦術タイプ
export type TacticsType = 'PUSH' | 'GRAPPLE' | 'TECHNIQUE' | 'BALANCE';

// 怪我の種類
export type InjuryType = 'KNEE' | 'SHOULDER' | 'ELBOW' | 'BACK' | 'ANKLE' | 'NECK';

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
  archetype?: TalentArchetype; // 素質タイプ (NEW)
  entryDivision?: EntryDivision; // 入門区分 (NEW)
  signatureMoves: string[];    // 得意技リスト (NEW)
  durability: number;      // 基礎耐久力
  currentCondition: number; // 現在の調子 (0-100)
  injuryLevel: number;   // 【非推奨】怪我レベル (0:なし, >0:休場期間) - 後方互換性のため残す
  injuries: Injury[];    // 詳細な怪我リスト
  isOzekiKadoban?: boolean; // 大関カド番

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
  kimariteCount?: Record<string, number>; // 決まり手カウント (勝ち技のみ)
}

// タイムラインイベント
export interface TimelineEvent {
  year: number;
  month: number;
  type: 'ENTRY' | 'PROMOTION' | 'DEMOTION' | 'YUSHO' | 'INJURY' | 'RETIREMENT' | 'OTHER';
  description: string;
}
