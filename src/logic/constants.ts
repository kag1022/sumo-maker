import { BodyType, Division, InjuryType, Rarity, TalentArchetype, Trait } from './models';

export const CONSTANTS = {
  // 力士設定
  MIN_AGE: 15,
  PHYSICAL_LIMIT_RETIREMENT_AGE: 50, // ゲーム上の寿命上限（定年ではなく体力限界）
  
  // 場所設定
  BASHO_PER_YEAR: 6,
  
  // 階級ごとの取組数
  BOUTS_MAP: {
    'Makuuchi': 15,
    'Juryo': 15,
    'Makushita': 7,
    'Sandanme': 7,
    'Jonidan': 7,
    'Jonokuchi': 7,
    'Maezumo': 3 // 前相撲は簡易的に3番とする
  } as Record<Division, number>,

  // 番付の序列（数値が小さいほど偉い）
  RANK_VALUE: {
    'Makuuchi': 5, // 前頭相当
    'Yokozuna': 1,
    'Ozeki': 2,
    'Sekiwake': 3,
    'Komusubi': 4,
    'Maegashira': 5,
    'Juryo': 6,
    'Makushita': 7,
    'Sandanme': 8,
    'Jonidan': 9,
    'Jonokuchi': 10,
    'Maezumo': 11
  },

  // 才能タイプ定義
  TALENT_ARCHETYPES: {
    'MONSTER': { name: '怪物', description: '100年に1人の逸材。規格外のパワーを持つ。', potentialRange: [85, 100], initialStatBonus: 14 },
    'GENIUS': { name: '天才', description: '天性の相撲センスを持つ若武者。', potentialRange: [72, 92], initialStatBonus: 8 },
    'HARD_WORKER': { name: '叩き上げ', description: '地道な稽古で強くなる、標準的な入門者。', potentialRange: [45, 82], initialStatBonus: 0 },
    'AVG_JOE': { name: '一般', description: '体格には恵まれていないが、相撲への熱意はある。', potentialRange: [30, 70], initialStatBonus: -10 },
    'UNIVERSITY_YOKOZUNA': { name: '学生横綱', description: '大学相撲の頂点。即戦力として期待される。', potentialRange: [70, 95], initialStatBonus: 30, canTsukedashi: true },
    'HIGH_SCHOOL_CHAMP': { name: '高校横綱', description: '高校相撲界の覇者。将来性は抜群。', potentialRange: [60, 90], initialStatBonus: 15 },
    'STREET_FIGHTER': { name: '喧嘩屋', description: '荒削りだが、強烈な闘争心を持つ。', potentialRange: [50, 90], initialStatBonus: 20 }
  } as Record<TalentArchetype, { name: string, description: string, potentialRange: [number, number], initialStatBonus: number, canTsukedashi?: boolean }>,

  // 得意技データ
  SIGNATURE_MOVE_DATA: {
    '押し出し': { relatedStats: ['tsuki', 'oshi', 'deashi'], winRateBonus: 0.4 }, 
    '突き出し': { relatedStats: ['tsuki', 'deashi', 'power'], winRateBonus: 0.4 },
    '寄り切り': { relatedStats: ['kumi', 'koshi', 'deashi'], winRateBonus: 0.4 },
    '上手投げ': { relatedStats: ['nage', 'power', 'kumi'], winRateBonus: 0.5 },
    '掬い投げ': { relatedStats: ['nage', 'waza', 'kumi'], winRateBonus: 0.5 },
    '叩き込み': { relatedStats: ['tsuki', 'waza', 'deashi'], winRateBonus: 0.32 },
    '突き落とし': { relatedStats: ['tsuki', 'waza', 'kumi'], winRateBonus: 0.32 },
  } as Record<string, { relatedStats: string[], winRateBonus: number }>,

  // 成長タイプごとの補正
  GROWTH_PARAMS: {
    'EARLY': { peakStart: 20, peakEnd: 25, decayStart: 26, growthRate: 1.2 },
    'NORMAL': { peakStart: 24, peakEnd: 29, decayStart: 30, growthRate: 0.82 },
    'LATE': { peakStart: 28, peakEnd: 33, decayStart: 34, growthRate: 0.68 }, // 長く伸びる
    'GENIUS': { peakStart: 22, peakEnd: 30, decayStart: 32, growthRate: 1.0 }
  },

  // 戦術タイプごとの成長補正 (1.0 = 標準, >1.0 = 成長しやすい)
  TACTICAL_GROWTH_MODIFIERS: {
    'PUSH': { tsuki: 1.5, oshi: 1.5, deashi: 1.5, kumi: 0.8, nage: 0.8, koshi: 1.0, waza: 1.0, power: 1.2 },
    'GRAPPLE': { kumi: 1.5, nage: 1.5, koshi: 1.2, tsuki: 0.8, oshi: 0.8, deashi: 1.0, waza: 1.0, power: 1.2 },
    'TECHNIQUE': { waza: 1.5, nage: 1.2, koshi: 0.8, deashi: 1.2, tsuki: 0.9, oshi: 0.9, kumi: 1.0, power: 0.8 },
    'BALANCE': { tsuki: 1.0, oshi: 1.0, kumi: 1.0, nage: 1.0, koshi: 1.0, deashi: 1.0, waza: 1.0, power: 1.0 }
  },

  // 確率・イベント系
  PROBABILITY: {
    INJURY_PER_BOUT: 0.008, // 0.8%
    AWAKENING_GROWTH: 0.02, // 2%
    CHRONIC_CONVERSION: 0.1, // 10%
    // 優勝判定 (勝利数に応じた確率)
    YUSHO: {
        MAKUUCHI_14: 0.8,
        MAKUUCHI_13: 0.3,
        JURYO_14: 0.9,
        LOWER_7: 0.9
    }
  },

  // 怪我の種類定義
  INJURY_DATA: {
    'KNEE': { name: '膝半月板損傷', weight: 30, severityMin: 3, severityMax: 8, affectedStats: ['deashi', 'oshi', 'kumi'] },
    'SHOULDER': { name: '肩脱臼', weight: 20, severityMin: 2, severityMax: 7, affectedStats: ['tsuki', 'nage', 'power'] },
    'ELBOW': { name: '肘靭帯損傷', weight: 15, severityMin: 2, severityMax: 6, affectedStats: ['tsuki', 'waza'] },
    'BACK': { name: '腰椎分離症', weight: 15, severityMin: 4, severityMax: 9, affectedStats: ['koshi', 'power', 'deashi'] },
    'ANKLE': { name: '足首捻挫', weight: 10, severityMin: 1, severityMax: 5, affectedStats: ['deashi', 'waza'] },
    'NECK': { name: '頸椎捻挫', weight: 10, severityMin: 5, severityMax: 10, affectedStats: ['kumi', 'tsuki', 'power'] },
    'WRIST': { name: '手首腱鞘炎', weight: 14, severityMin: 1, severityMax: 5, affectedStats: ['tsuki', 'waza'] },
    'RIB': { name: '肋骨打撲', weight: 12, severityMin: 2, severityMax: 7, affectedStats: ['power', 'koshi'] },
    'HAMSTRING': { name: 'ハムストリング肉離れ', weight: 11, severityMin: 2, severityMax: 8, affectedStats: ['deashi', 'koshi'] },
    'HIP': { name: '股関節痛', weight: 9, severityMin: 3, severityMax: 8, affectedStats: ['koshi', 'kumi', 'deashi'] }
  } as Record<InjuryType, { name: string, weight: number, severityMin: number, severityMax: number, affectedStats: string[] }>,

  // === 体格データ ===
  BODY_TYPE_DATA: {
    'NORMAL': {
      name: '普通', weight: 40,
      description: '突出した長所・短所がないバランス型。親方の指導を最も素直に受ける。',
      growthMod: {}, // 補正なし
      oyakataBuffMod: 1.2, // 親方バフ効果が1.2倍
      injuryMod: 1.0,
    },
    'SOPPU': {
      name: 'ソップ型', weight: 30,
      description: '細身で筋肉質。出足・技術が伸びやすく、引き技に長ける。',
      growthMod: { deashi: 1.2, waza: 1.2 },
      oyakataBuffMod: 1.0,
      injuryMod: 1.0,
    },
    'ANKO': {
      name: 'アンコ型', weight: 25,
      description: '丸みを帯びた重量級。押し・腰が伸びやすいが膝・足首の怪我率UP。',
      growthMod: { oshi: 1.2, koshi: 1.2 },
      oyakataBuffMod: 1.0,
      injuryMod: 1.1,
      injuryWeightMod: { KNEE: 1.5, ANKLE: 1.5 }, // 特定部位の怪我率UP
    },
    'MUSCULAR': {
      name: '筋骨隆々', weight: 5,
      description: '究極の肉体。筋力・組力が異常に伸び、怪我をしにくい大当たり体格。',
      growthMod: { power: 1.25, kumi: 1.25 },
      oyakataBuffMod: 1.0,
      injuryMod: 0.75, // 全体的に怪我しにくい
    },
  } as Record<BodyType, {
    name: string, weight: number, description: string,
    growthMod: Partial<Record<string, number>>,
    oyakataBuffMod: number, injuryMod: number,
    injuryWeightMod?: Partial<Record<string, number>>,
  }>,

  // === スキルデータ ===
  TRAIT_DATA: {
    // --- A. 身体・体質系 ---
    'KEIKO_NO_MUSHI': {
      name: '稽古の虫', rarity: 'SR' as Rarity, category: 'BODY',
      description: '怪我をしていない能力の成長率が常時1.12倍。', isNegative: false,
    },
    'TETSUJIN': {
      name: '鉄人', rarity: 'SR' as Rarity, category: 'BODY',
      description: '全部位の怪我発生率が半減し、加齢による衰えの開始が遅い。', isNegative: false,
    },
    'SOUJUKU': {
      name: '早熟', rarity: 'R' as Rarity, category: 'BODY',
      description: '20代前半までの成長率が劇的に高いが、20代後半で急激に衰える。', isNegative: false,
    },
    'TAIKI_BANSEI': {
      name: '大器晩成', rarity: 'R' as Rarity, category: 'BODY',
      description: '20代のうちは伸びないが、30歳を超えてからピークを迎える。', isNegative: false,
    },
    'BUJI_KORE_MEIBA': {
      name: '無事之名馬', rarity: 'R' as Rarity, category: 'BODY',
      description: '軽傷は頻発するが、大怪我（休場レベル）は絶対にしない。', isNegative: false,
    },
    'GLASS_KNEE': {
      name: 'ガラスの膝', rarity: 'N' as Rarity, category: 'BODY',
      description: '膝の怪我発生率が通常の2.5倍。', isNegative: true,
    },
    'BAKUDAN_MOCHI': {
      name: '爆弾持ち', rarity: 'N' as Rarity, category: 'BODY',
      description: 'ランダムな1箇所の怪我が必ず慢性化してしまう。', isNegative: true,
    },
    'SABORI_GUSE': {
      name: 'サボり癖', rarity: 'N' as Rarity, category: 'BODY',
      description: '成長率が常に0.8倍。ただし覚醒（大成長）の確率UP。', isNegative: true,
    },
    // --- B. 精神・メンタル系 ---
    'OOBUTAI_NO_ONI': {
      name: '大舞台の鬼', rarity: 'UR' as Rarity, category: 'MENTAL',
      description: '優勝がかかった千秋楽や優勝決定戦で勝率が大幅アップ。', isNegative: false,
    },
    'KYOUSHINZOU': {
      name: '強心臓', rarity: 'SR' as Rarity, category: 'MENTAL',
      description: '幕内での取組、または勝ち越しがかかった一番で能力にバフ。', isNegative: false,
    },
    'KINBOSHI_HUNTER': {
      name: '金星ハンター', rarity: 'SR' as Rarity, category: 'MENTAL',
      description: '相手が横綱・大関の時のみ、自分の能力値が1.25倍に跳ね上がる。', isNegative: false,
    },
    'RENSHOU_KAIDOU': {
      name: '連勝街道', rarity: 'R' as Rarity, category: 'MENTAL',
      description: '3連勝以上で能力値にボーナスが加算され続ける。', isNegative: false,
    },
    'KIBUNYA': {
      name: '気分屋', rarity: 'N' as Rarity, category: 'MENTAL',
      description: '毎場所の調子が「絶好調」か「絶不調」のどちらかにしか振れない。', isNegative: false,
    },
    'NOMI_NO_SHINZOU': {
      name: 'ノミの心臓', rarity: 'N' as Rarity, category: 'MENTAL',
      description: '上位陣との対戦や大事な一番で能力値がダウン。', isNegative: true,
    },
    'SLOW_STARTER': {
      name: 'スロースターター', rarity: 'N' as Rarity, category: 'MENTAL',
      description: '場所前半は勝率が下がり、後半に勝率が上がる。', isNegative: false,
    },
    // --- C. 技術・相性系 ---
    'KYOJIN_GOROSHI': {
      name: '巨人殺し', rarity: 'SR' as Rarity, category: 'TECHNIQUE',
      description: '自分より格上の相手との対戦時に勝率ボーナス。', isNegative: false,
    },
    'KOHEI_KILLER': {
      name: '小兵キラー', rarity: 'R' as Rarity, category: 'TECHNIQUE',
      description: '自分より格下の相手に対して取りこぼし確率が大幅に減る。', isNegative: false,
    },
    'DOHYOUGIWA_MAJUTSU': {
      name: '土俵際の魔術師', rarity: 'R' as Rarity, category: 'TECHNIQUE',
      description: '負け判定を引いた際、低確率で逆転勝利に書き換える。', isNegative: false,
    },
    'YOTSU_NO_ONI': {
      name: '四つの鬼', rarity: 'R' as Rarity, category: 'TECHNIQUE',
      description: '四つに組む戦術設定時、寄り切り・上手投げの威力がさらに上昇。', isNegative: false,
    },
    'TSUPPARI_TOKKA': {
      name: '突っ張り特化', rarity: 'R' as Rarity, category: 'TECHNIQUE',
      description: '突き押し戦術設定時、突き出し・押し出しの威力がさらに上昇。', isNegative: false,
    },
    'ARAWAZASHI': {
      name: '荒技師', rarity: 'N' as Rarity, category: 'TECHNIQUE',
      description: '勝った時の決まり手がレア技になりやすい。（図鑑埋め用）', isNegative: false,
    },
    'LONG_REACH': {
      name: '長いリーチ', rarity: 'R' as Rarity, category: 'TECHNIQUE',
      description: '身長190cm以上の取組で勝率が上がる。', isNegative: false,
    },
    'HEAVY_PRESSURE': {
      name: '重量圧', rarity: 'SR' as Rarity, category: 'BODY',
      description: '相手より15kg以上重いと勝率ボーナス。', isNegative: false,
    },
    'RECOVERY_MONSTER': {
      name: '超回復', rarity: 'SR' as Rarity, category: 'BODY',
      description: '怪我の回復量が増える。', isNegative: false,
    },
    'WEAK_LOWER_BACK': {
      name: '腰痛持ち', rarity: 'N' as Rarity, category: 'BODY',
      description: '負け先行時に勝率が下がる。', isNegative: true,
    },
    'OPENING_DASH': {
      name: '立ち上がり最速', rarity: 'R' as Rarity, category: 'MENTAL',
      description: '序盤（1-3日目）の勝率が上がる。', isNegative: false,
    },
    'SENSHURAKU_KISHITSU': {
      name: '千秋楽気質', rarity: 'SR' as Rarity, category: 'MENTAL',
      description: '千秋楽の勝率が上がる。', isNegative: false,
    },
    'TRAILING_FIRE': {
      name: '劣勢の炎', rarity: 'SR' as Rarity, category: 'MENTAL',
      description: '負け先行時に勝率が上がる。', isNegative: false,
    },
    'PROTECT_LEAD': {
      name: '逃げ切り名人', rarity: 'R' as Rarity, category: 'MENTAL',
      description: '3勝以上リード時に勝率が上がる。', isNegative: false,
    },
    'BELT_COUNTER': {
      name: '差し返し', rarity: 'R' as Rarity, category: 'TECHNIQUE',
      description: '四つ相撲で相手が重い時に勝率が上がる。', isNegative: false,
    },
    'THRUST_RUSH': {
      name: '突進連打', rarity: 'R' as Rarity, category: 'TECHNIQUE',
      description: '押し相撲かつ序盤〜中盤序盤で勝率が上がる。', isNegative: false,
    },
    'READ_THE_BOUT': {
      name: '取り口解析', rarity: 'SR' as Rarity, category: 'TECHNIQUE',
      description: '前日に敗れていると勝率が上がる。', isNegative: false,
    },
    'CLUTCH_REVERSAL': {
      name: '土壇場返し', rarity: 'SR' as Rarity, category: 'TECHNIQUE',
      description: '負け判定時、低確率で逆転する。', isNegative: false,
    },
  } as Record<Trait, {
    name: string, rarity: Rarity, category: 'BODY' | 'MENTAL' | 'TECHNIQUE',
    description: string, isNegative: boolean,
  }>,

  // === スキル抽選テーブル ===
  TRAIT_GACHA: {
    // スキル個数の確率
    COUNT_WEIGHTS: [
      { count: 0, weight: 45 },
      { count: 1, weight: 35 },
      { count: 2, weight: 15 },
      { count: 3, weight: 5 },
    ],
    // デメリットスキルの追加確率
    NEGATIVE_CHANCE: 0.15,
    // レア度抽選ウェイト
    RARITY_WEIGHTS: {
      'N': 60,
      'R': 25,
      'SR': 12,
      'UR': 3,
    } as Record<Rarity, number>,
  },

  // === 三層DNA（ゲノム）定数 ===
  GENOME: {
    // アーキタイプごとのDNA初期分布 [中央値, 分散(標準偏差相当)]
    ARCHETYPE_DNA: {
      'MONSTER': {
        base: { powerCeiling: [90, 6], techCeiling: [75, 10], speedCeiling: [80, 8], ringSense: [70, 12], styleFit: [75, 10] },
        growth: { maturationAge: [23, 2], peakLength: [8, 2], lateCareerDecay: [0.8, 0.2], adaptability: [60, 15] },
        durability: { baseInjuryRisk: [0.6, 0.15], recoveryRate: [1.5, 0.2], chronicResistance: [70, 12] },
        variance: { formVolatility: [35, 10], clutchBias: [20, 15], slumpRecovery: [70, 12], streakSensitivity: [50, 15] },
      },
      'GENIUS': {
        base: { powerCeiling: [70, 10], techCeiling: [85, 8], speedCeiling: [80, 8], ringSense: [85, 6], styleFit: [80, 8] },
        growth: { maturationAge: [22, 2], peakLength: [7, 2], lateCareerDecay: [1.0, 0.3], adaptability: [75, 10] },
        durability: { baseInjuryRisk: [0.9, 0.2], recoveryRate: [1.2, 0.2], chronicResistance: [55, 15] },
        variance: { formVolatility: [45, 12], clutchBias: [10, 20], slumpRecovery: [60, 15], streakSensitivity: [55, 15] },
      },
      'HARD_WORKER': {
        base: { powerCeiling: [55, 12], techCeiling: [55, 12], speedCeiling: [55, 12], ringSense: [50, 15], styleFit: [50, 15] },
        growth: { maturationAge: [26, 3], peakLength: [5, 2], lateCareerDecay: [1.0, 0.3], adaptability: [50, 15] },
        durability: { baseInjuryRisk: [1.0, 0.25], recoveryRate: [1.0, 0.2], chronicResistance: [50, 15] },
        variance: { formVolatility: [50, 15], clutchBias: [0, 15], slumpRecovery: [50, 15], streakSensitivity: [50, 15] },
      },
      'AVG_JOE': {
        base: { powerCeiling: [40, 10], techCeiling: [40, 10], speedCeiling: [40, 10], ringSense: [35, 12], styleFit: [40, 12] },
        growth: { maturationAge: [25, 3], peakLength: [4, 2], lateCareerDecay: [1.2, 0.3], adaptability: [40, 15] },
        durability: { baseInjuryRisk: [1.2, 0.3], recoveryRate: [0.9, 0.2], chronicResistance: [40, 15] },
        variance: { formVolatility: [60, 15], clutchBias: [-5, 15], slumpRecovery: [40, 15], streakSensitivity: [55, 15] },
      },
      'UNIVERSITY_YOKOZUNA': {
        base: { powerCeiling: [75, 8], techCeiling: [80, 8], speedCeiling: [70, 10], ringSense: [80, 8], styleFit: [75, 10] },
        growth: { maturationAge: [24, 2], peakLength: [6, 2], lateCareerDecay: [1.0, 0.3], adaptability: [70, 10] },
        durability: { baseInjuryRisk: [0.85, 0.2], recoveryRate: [1.2, 0.2], chronicResistance: [55, 15] },
        variance: { formVolatility: [40, 12], clutchBias: [10, 15], slumpRecovery: [60, 12], streakSensitivity: [45, 15] },
      },
      'HIGH_SCHOOL_CHAMP': {
        base: { powerCeiling: [65, 10], techCeiling: [65, 10], speedCeiling: [70, 10], ringSense: [60, 12], styleFit: [65, 12] },
        growth: { maturationAge: [25, 3], peakLength: [6, 2], lateCareerDecay: [0.9, 0.25], adaptability: [60, 12] },
        durability: { baseInjuryRisk: [0.9, 0.2], recoveryRate: [1.1, 0.2], chronicResistance: [55, 15] },
        variance: { formVolatility: [45, 12], clutchBias: [5, 15], slumpRecovery: [55, 15], streakSensitivity: [50, 15] },
      },
      'STREET_FIGHTER': {
        base: { powerCeiling: [80, 10], techCeiling: [45, 15], speedCeiling: [65, 12], ringSense: [40, 15], styleFit: [50, 15] },
        growth: { maturationAge: [24, 3], peakLength: [5, 2], lateCareerDecay: [1.1, 0.3], adaptability: [35, 15] },
        durability: { baseInjuryRisk: [1.1, 0.25], recoveryRate: [1.3, 0.2], chronicResistance: [45, 15] },
        variance: { formVolatility: [65, 15], clutchBias: [15, 20], slumpRecovery: [45, 15], streakSensitivity: [65, 15] },
      },
    } as Record<TalentArchetype, {
      base: Record<string, [number, number]>;
      growth: Record<string, [number, number]>;
      durability: Record<string, [number, number]>;
      variance: Record<string, [number, number]>;
    }>,

    // GrowthType から DNA.growth への変換ヒント
    GROWTH_TYPE_TO_DNA: {
      'EARLY': { maturationAge: 20, peakLength: 4, lateCareerDecay: 1.5 },
      'NORMAL': { maturationAge: 26, peakLength: 5, lateCareerDecay: 1.0 },
      'LATE': { maturationAge: 30, peakLength: 7, lateCareerDecay: 0.7 },
      'GENIUS': { maturationAge: 22, peakLength: 8, lateCareerDecay: 0.9 },
    } as Record<string, { maturationAge: number; peakLength: number; lateCareerDecay: number }>,

    // 予算コスト: DNA軸1ポイント上書きあたりのコスト
    DNA_OVERRIDE_COST_PER_POINT: 2,
    // 予算コスト上限
    DNA_OVERRIDE_COST_MAX: 500,
  },
};
