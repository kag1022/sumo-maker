import {
  AmateurBackground,
  BodyConstitution,
  DebtCardId,
  InjuryResistanceType,
  MentalTraitType,
  StyleArchetype,
} from '../models';
import {
  AMATEUR_BACKGROUND_CONFIG,
  BODY_CONSTITUTION_LABELS,
  DEBT_CARD_LABELS,
  MENTAL_TRAIT_LABELS,
} from '../careerSeed';
import { STYLE_LABELS } from '../styleProfile';

export type ScoutLifeCardSlot = '経歴' | '骨格' | '相撲観' | '気質' | '背負うもの';
export type ScoutBurdenCardId =
  | 'IRON_BODY'
  | 'STANDARD'
  | 'FRAGILE'
  | 'OLD_KNEE'
  | 'PRESSURE_LINEAGE'
  | 'LATE_START';

export interface ScoutLifeCardChoice<TValue extends string> {
  id: TValue;
  slot: ScoutLifeCardSlot;
  name: string;
  flavor: string;
  help: string;
  previewTag: string;
  strengthText: string;
  tradeoffText: string;
  reportLineSeed: string;
  autoPairSecondaryStyle?: StyleArchetype;
}

export interface ScoutBurdenCardChoice extends ScoutLifeCardChoice<ScoutBurdenCardId> {
  injuryResistance: InjuryResistanceType;
  debtCardIds: DebtCardId[];
}

export const SCOUT_BACKGROUND_CARDS: Record<
  AmateurBackground,
  ScoutLifeCardChoice<AmateurBackground>
> = {
  MIDDLE_SCHOOL: {
    id: 'MIDDLE_SCHOOL',
    slot: '経歴',
    name: '中卒たたき上げ',
    flavor: '若さを武器に、前相撲から全部を積み上げる。',
    help: '15歳入門。完成は遅いが、積み上げた場所数がそのまま人生の厚みになる。',
    previewTag: '長い下積み',
    strengthText: '若く入るため、伸びしろと場所数が最大化される。',
    tradeoffText: '序盤は未完成で、関取まで遠回りになりやすい。',
    reportLineSeed: '若さから始まった長い下積みが、この人生の土台になった。',
  },
  HIGH_SCHOOL: {
    id: 'HIGH_SCHOOL',
    slot: '経歴',
    name: '高卒入門',
    flavor: '高校で鍛えた体を持ち込み、前相撲から実直に登る。',
    help: '18歳入門。突出はないが、現実味のある完成度で始まる。',
    previewTag: '標準始動',
    strengthText: '初期完成度と伸びしろのバランスが良い。',
    tradeoffText: '劇的な出世補正はなく、型の良し悪しがそのまま出る。',
    reportLineSeed: '堅実な出発点だったからこそ、地力の差がはっきり出た。',
  },
  STUDENT_ELITE: {
    id: 'STUDENT_ELITE',
    slot: '経歴',
    name: '学生エリート',
    flavor: '学生相撲で結果を残し、三段目付出に近い期待を背負う。',
    help: '22歳入門。下位を短縮しやすく、早く番付勝負へ入る。',
    previewTag: '即戦力',
    strengthText: '出世の初速が高く、完成形の輪郭が早く見えやすい。',
    tradeoffText: '残された時間は短く、伸び返しの余白は少ない。',
    reportLineSeed: '最初から即戦力として見られたことが、人生の速度を決めた。',
  },
  COLLEGE_YOKOZUNA: {
    id: 'COLLEGE_YOKOZUNA',
    slot: '経歴',
    name: '学生横綱',
    flavor: '幕下付出級の評価で、最初から大きな期待を浴びる。',
    help: '22歳入門。高い初期完成度と番付の近さを持つ、最も派手な札。',
    previewTag: '大器の看板',
    strengthText: '関取到達までの距離が短く、序盤から高い注目を集める。',
    tradeoffText: '期待外れが目立ちやすく、停滞時の物語も重くなる。',
    reportLineSeed: '大きな看板を背負って始まったことが、その後の評価を支配した。',
  },
};

export const SCOUT_CONSTITUTION_CARDS: Record<
  BodyConstitution,
  ScoutLifeCardChoice<BodyConstitution>
> = {
  BALANCED_FRAME: {
    id: 'BALANCED_FRAME',
    slot: '骨格',
    name: BODY_CONSTITUTION_LABELS.BALANCED_FRAME,
    flavor: '大きな欠点がなく、どの道にも進める均整の骨格。',
    help: '標準的な体。型の良し悪しが素直に出る。',
    previewTag: '均整',
    strengthText: '扱いやすく、相撲観や気質の個性がそのまま出る。',
    tradeoffText: '骨格だけで人生をねじ曲げる爆発力は持たない。',
    reportLineSeed: '均整の取れた体だったからこそ、選んだ相撲観がそのまま人生になった。',
  },
  HEAVY_BULK: {
    id: 'HEAVY_BULK',
    slot: '骨格',
    name: BODY_CONSTITUTION_LABELS.HEAVY_BULK,
    flavor: '質量で土俵を制圧する、重量級の前提条件。',
    help: '馬力と圧力に優れる。重さゆえの消耗も抱える。',
    previewTag: '重量の圧',
    strengthText: '馬力と押しの上限が高く、勝ち筋が太い。',
    tradeoffText: '膝と腰への負担が重く、動きの軽さは失いやすい。',
    reportLineSeed: '重い骨格そのものが、勝ち方と傷み方の両方を決めた。',
  },
  LONG_REACH: {
    id: 'LONG_REACH',
    slot: '骨格',
    name: BODY_CONSTITUTION_LABELS.LONG_REACH,
    flavor: '長身長腕で先手を取る、間合いを支配する骨格。',
    help: '懐の深さと長い手足が武器。接近戦では脆さも出る。',
    previewTag: '長身長腕',
    strengthText: '懐の深さと技の届き方で独特の勝ち筋を作れる。',
    tradeoffText: '細さが出ると押し返し切れず、持久戦で削られやすい。',
    reportLineSeed: '長い体が、勝ち筋にも故障の偏りにも色濃く出た。',
  },
  SPRING_LEGS: {
    id: 'SPRING_LEGS',
    slot: '骨格',
    name: BODY_CONSTITUTION_LABELS.SPRING_LEGS,
    flavor: '足腰で土俵を支え、踏ん張りと出足で勝負する。',
    help: '出足と反応が強く、勝負どころで踏みとどまりやすい。',
    previewTag: '足腰',
    strengthText: '出足と粘りが強く、土俵際や切り返しに返りがある。',
    tradeoffText: '上半身の迫力では見劣りし、押し潰す相撲は作りにくい。',
    reportLineSeed: '足腰の強さが、しぶとさと山場での返しを支えた。',
  },
};

export const SCOUT_STYLE_CARDS: Record<
  StyleArchetype,
  ScoutLifeCardChoice<StyleArchetype>
> = {
  YOTSU: {
    id: 'YOTSU',
    slot: '相撲観',
    name: STYLE_LABELS.YOTSU,
    flavor: '差して寄る、力士としての教科書を信じる。',
    help: '組み止めて前に出る思想。安定しやすい。',
    previewTag: '正攻法',
    strengthText: '安定感があり、設計と実戦のズレが小さくなりやすい。',
    tradeoffText: '爆発的な速攻や奇襲で上振れを作るには向かない。',
    reportLineSeed: '四つの思想を通したことが、この力士の芯になった。',
    autoPairSecondaryStyle: 'MOROZASHI',
  },
  TSUKI_OSHI: {
    id: 'TSUKI_OSHI',
    slot: '相撲観',
    name: STYLE_LABELS.TSUKI_OSHI,
    flavor: '立合いから押し切る、前進の圧力を信じる。',
    help: '出足と圧で押し切る思想。勝ち負けの波も大きくなりやすい。',
    previewTag: '前進圧',
    strengthText: '短期決戦で強く、押し切れた時の勝ち方が派手。',
    tradeoffText: '受けに回ると脆く、型崩れした時の落差が大きい。',
    reportLineSeed: '突き押しの前進圧が、番付の上振れと下振れを両方生んだ。',
    autoPairSecondaryStyle: 'DOHYOUGIWA',
  },
  MOROZASHI: {
    id: 'MOROZASHI',
    slot: '相撲観',
    name: STYLE_LABELS.MOROZASHI,
    flavor: '懐に潜り込んで差し手を作る、密着戦の美学。',
    help: '差し勝って主導権を取る。体格差への対応力が問われる。',
    previewTag: '差し手',
    strengthText: '技術寄りに伸びやすく、完成時の決まり手が美しい。',
    tradeoffText: '形に入れない取組では、もろさが露出しやすい。',
    reportLineSeed: '差し手を求める相撲観が、勝ち筋をはっきり細くした。',
    autoPairSecondaryStyle: 'YOTSU',
  },
  DOHYOUGIWA: {
    id: 'DOHYOUGIWA',
    slot: '相撲観',
    name: STYLE_LABELS.DOHYOUGIWA,
    flavor: '残す、ひねる、かわす。土俵際で人生を延命する。',
    help: '際の強さと土俵感覚に寄る。勝負強さと紙一重。',
    previewTag: '残し',
    strengthText: '接戦に強く、ここ一番をひっくり返す余地がある。',
    tradeoffText: '圧倒する相撲になりにくく、安定して勝ち切るには工夫が要る。',
    reportLineSeed: '土俵際を信じた発想が、この人生の名場面を作った。',
    autoPairSecondaryStyle: 'NAGE_TECH',
  },
  NAGE_TECH: {
    id: 'NAGE_TECH',
    slot: '相撲観',
    name: STYLE_LABELS.NAGE_TECH,
    flavor: '一瞬の技術で形勢を変える、技巧派の設計図。',
    help: '投げや崩しで勝機を作る。技の再現性は骨格に左右される。',
    previewTag: '技巧',
    strengthText: '実戦で型が噛み合うと、多彩な勝ち筋が生まれる。',
    tradeoffText: '土台が足りないと、器用貧乏で終わりやすい。',
    reportLineSeed: '投げ技を軸に据えたことで、勝ち方に強い個性が出た。',
    autoPairSecondaryStyle: 'DOHYOUGIWA',
  },
  POWER_PRESSURE: {
    id: 'POWER_PRESSURE',
    slot: '相撲観',
    name: STYLE_LABELS.POWER_PRESSURE,
    flavor: '受け止めず、止まらず、力で押し込む設計。',
    help: '馬力と圧力を前提にした相撲。噛み合えば非常に強い。',
    previewTag: '圧殺',
    strengthText: 'ピーク時の制圧力が高く、番付を一気に駆け上がる力がある。',
    tradeoffText: '消耗も大きく、体が悲鳴を上げた時の失速も激しい。',
    reportLineSeed: '圧力相撲を選んだことが、人生の頂点と摩耗を同時に生んだ。',
    autoPairSecondaryStyle: 'TSUKI_OSHI',
  },
};

export const SCOUT_MENTAL_CARDS: Record<
  MentalTraitType,
  ScoutLifeCardChoice<MentalTraitType>
> = {
  CALM_ENGINE: {
    id: 'CALM_ENGINE',
    slot: '気質',
    name: MENTAL_TRAIT_LABELS.CALM_ENGINE,
    flavor: '平常のまま積み上げる、冷えた炉のような気質。',
    help: '大崩れしにくく、型の再現性が高い。',
    previewTag: '平常',
    strengthText: '調子の波が穏やかで、長いキャリアを組み立てやすい。',
    tradeoffText: '爆発的な上振れや劇的な逆転劇は起きにくい。',
    reportLineSeed: '平常心が、浮き沈みの少ない力士人生を支えた。',
  },
  BIG_STAGE: {
    id: 'BIG_STAGE',
    slot: '気質',
    name: MENTAL_TRAIT_LABELS.BIG_STAGE,
    flavor: '注目が集まるほど力を出す、舞台映えする気質。',
    help: '山場で強く、昇進際や注目の一番で返りを作りやすい。',
    previewTag: '大舞台',
    strengthText: '勝負どころで一段上の相撲が出やすい。',
    tradeoffText: '平場では気が抜けやすく、取りこぼしが混ざる。',
    reportLineSeed: '大舞台に強い気質が、人生の山場を鮮やかにした。',
  },
  VOLATILE_FIRE: {
    id: 'VOLATILE_FIRE',
    slot: '気質',
    name: MENTAL_TRAIT_LABELS.VOLATILE_FIRE,
    flavor: '火がつけば止まらないが、波が激しい。',
    help: '連勝の勢いと大崩れが同居する、最もドラマが出る気質。',
    previewTag: '激情',
    strengthText: '勢いに乗った時の上振れが大きく、番付を跳ねやすい。',
    tradeoffText: '不調に入ると崩れやすく、結果の振れ幅も大きい。',
    reportLineSeed: '激情型だったからこそ、上昇も失速も人目を引いた。',
  },
  STONEWALL: {
    id: 'STONEWALL',
    slot: '気質',
    name: MENTAL_TRAIT_LABELS.STONEWALL,
    flavor: '崩れず、受け止め、静かに前へ出る。',
    help: '窮地で折れにくく、連敗後も戻しやすい。',
    previewTag: '不動',
    strengthText: '停滞や負け越しからの立て直しに強い。',
    tradeoffText: '感情の爆発が少なく、上振れの演出は地味になりやすい。',
    reportLineSeed: '不動心が、苦しい局面で人生を折らせなかった。',
  },
};

export const SCOUT_BURDEN_CARDS: Record<ScoutBurdenCardId, ScoutBurdenCardChoice> = {
  IRON_BODY: {
    id: 'IRON_BODY',
    slot: '背負うもの',
    name: '頑丈',
    flavor: '壊れにくい体そのものが、大きな武器になる。',
    help: '怪我に強く、長く土俵に立ちやすい。',
    previewTag: '壊れにくい',
    strengthText: '長い場所数と継続性を取りやすい。',
    tradeoffText: '極端な上振れより、堅実な積み上げに寄る。',
    reportLineSeed: '頑丈さが、この人生から大きな途切れを遠ざけた。',
    injuryResistance: 'IRON_BODY',
    debtCardIds: [],
  },
  STANDARD: {
    id: 'STANDARD',
    slot: '背負うもの',
    name: '標準',
    flavor: '大きな追い風も逆風もない、素のままの人生。',
    help: '平均的な怪我耐性。ほかの札の色が出やすい。',
    previewTag: '標準',
    strengthText: '他の札の個性がそのまま前に出る。',
    tradeoffText: '背負うもの自体が人生を押し上げることはない。',
    reportLineSeed: '標準的な背負い方だったからこそ、他の札の色が濃く出た。',
    injuryResistance: 'STANDARD',
    debtCardIds: [],
  },
  FRAGILE: {
    id: 'FRAGILE',
    slot: '背負うもの',
    name: '脆さを抱える',
    flavor: '体はもろいが、短く燃える時の輝きは強い。',
    help: '故障の火種を抱える代わりに、危うい上振れを引き寄せる。',
    previewTag: '危うさ',
    strengthText: 'ピーク時の爆発力や危機反応に返りが出る。',
    tradeoffText: '怪我と失速が人生を切り分けやすい。',
    reportLineSeed: '脆さを抱えたことが、この人生に危うい輝きを与えた。',
    injuryResistance: 'FRAGILE',
    debtCardIds: [],
  },
  OLD_KNEE: {
    id: 'OLD_KNEE',
    slot: '背負うもの',
    name: DEBT_CARD_LABELS.OLD_KNEE,
    flavor: '膝に古傷を抱えたまま、勝ち方を変えて生きる。',
    help: '膝のリスクが増えるが、際の工夫や型の偏りが強く出る。',
    previewTag: '膝の不安',
    strengthText: '土俵際の工夫や技の個性が際立ちやすい。',
    tradeoffText: '膝由来の怪我と失速が人生の節目になりやすい。',
    reportLineSeed: '古傷の膝が、勝ち方まで変える人生の重さになった。',
    injuryResistance: 'STANDARD',
    debtCardIds: ['OLD_KNEE'],
  },
  PRESSURE_LINEAGE: {
    id: 'PRESSURE_LINEAGE',
    slot: '背負うもの',
    name: DEBT_CARD_LABELS.PRESSURE_LINEAGE,
    flavor: '注目も重圧も受け継いだまま、土俵に上がる。',
    help: '大舞台で振れやすいが、成功時の物語密度が高い。',
    previewTag: '重圧',
    strengthText: '山場で成功した時、称号や語りの濃さが一段上がる。',
    tradeoffText: '期待の重さが、そのまま失速や停滞の影にもなる。',
    reportLineSeed: '重圧を背負って始まったことが、この人生の温度を上げた。',
    injuryResistance: 'STANDARD',
    debtCardIds: ['PRESSURE_LINEAGE'],
  },
  LATE_START: {
    id: 'LATE_START',
    slot: '背負うもの',
    name: DEBT_CARD_LABELS.LATE_START,
    flavor: '開花は遅い。だが遅いぶん、後半に返る可能性を持つ。',
    help: '序盤は苦しいが、成熟後の伸び返しが物語になる。',
    previewTag: '遅咲き',
    strengthText: '後半の伸び返しと長い熟成の語りを作りやすい。',
    tradeoffText: '序盤は明確に苦しく、早期評価では見劣りしやすい。',
    reportLineSeed: '遅咲きの器だったことが、後半の伸び返しを物語に変えた。',
    injuryResistance: 'STANDARD',
    debtCardIds: ['LATE_START'],
  },
};

export const resolveScoutBurdenCardId = (input: {
  injuryResistance: InjuryResistanceType;
  debtCardIds: DebtCardId[];
}): ScoutBurdenCardId => {
  const [debt] = input.debtCardIds;
  if (debt === 'OLD_KNEE') return 'OLD_KNEE';
  if (debt === 'PRESSURE_LINEAGE') return 'PRESSURE_LINEAGE';
  if (debt === 'LATE_START') return 'LATE_START';
  if (input.injuryResistance === 'IRON_BODY') return 'IRON_BODY';
  if (input.injuryResistance === 'FRAGILE') return 'FRAGILE';
  return 'STANDARD';
};

export const resolveSecondaryStyleForPrimary = (primaryStyle: StyleArchetype): StyleArchetype =>
  SCOUT_STYLE_CARDS[primaryStyle].autoPairSecondaryStyle ?? primaryStyle;

export const SCOUT_CARD_LABELS = {
  background: '経歴',
  constitution: '骨格',
  style: '相撲観',
  mental: '気質',
  burden: '背負うもの',
} as const;

export const AMATEUR_BACKGROUND_LABELS: Record<AmateurBackground, string> = {
  MIDDLE_SCHOOL: AMATEUR_BACKGROUND_CONFIG.MIDDLE_SCHOOL.label,
  HIGH_SCHOOL: AMATEUR_BACKGROUND_CONFIG.HIGH_SCHOOL.label,
  STUDENT_ELITE: AMATEUR_BACKGROUND_CONFIG.STUDENT_ELITE.label,
  COLLEGE_YOKOZUNA: AMATEUR_BACKGROUND_CONFIG.COLLEGE_YOKOZUNA.label,
};
