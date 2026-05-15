import type { EntryArchetype, ExperimentPresetId, GrowthType, StyleArchetype } from "../../../logic/models";
import { ENTRY_ARCHETYPE_LABELS } from "../../../logic/career/entryArchetype";
import {
  SCOUT_BODY_SEED_LABELS,
  SCOUT_ENTRY_PATH_LABELS,
  SCOUT_GROWTH_TYPE_LABELS,
  SCOUT_TALENT_PROFILE_LABELS,
  SCOUT_TEMPERAMENT_LABELS,
  type ScoutTalentProfile,
  type ScoutBodySeed,
  type ScoutEntryPath,
  type ScoutTemperament,
} from "../../../logic/scout/gacha";
import { STABLE_CATALOG } from "../../../logic/simulation/heya/stableCatalog";
import { STYLE_LABELS } from "../../../logic/styleProfile";

export type ScoutGenerationMode = "OBSERVE_RANDOM" | "BUILD";
export type ScoutStepId = "identity" | "seed" | "body" | "build";

export const STEP_ORDER: ScoutStepId[] = ["identity", "seed", "body", "build"];

export const STEP_COPY: Record<ScoutStepId, { title: string; body: string; action: string }> = {
  identity: {
    title: "人物像",
    body: "四股名と出身、それから最初の印象を決めます。",
    action: "まず人物像を整える",
  },
  seed: {
    title: "相撲人生の種",
    body: "入口の経歴と気質を決めます。",
    action: "次に入口の条件を選ぶ",
  },
  body: {
    title: "身体と部屋",
    body: "体格と所属部屋で輪郭を固めます。",
    action: "次にビルド方針を決める",
  },
  build: {
    title: "ビルド方針",
    body: "成長型、得意な型、付出、天才型など、直接能力値ではない前提だけを調整します。",
    action: "設計を確認する",
  },
};

export const ENTRY_AGE_OPTIONS = [15, 18, 22] as const;
export const HEIGHT_OPTIONS = [175, 178, 181, 184, 187, 190, 193];
export const WEIGHT_OPTIONS = [105, 115, 125, 135, 145, 155, 165];

export const EXPERIMENT_PRESETS: Array<{ id: ExperimentPresetId; label: string; note: string }> = [
  { id: "INJURY_LOW", label: "怪我少なめ", note: "故障の揺らぎを抑えた実験記録。" },
  { id: "INJURY_HIGH", label: "怪我多め", note: "波乱が起きやすい実験記録。" },
  { id: "PROMOTION_SOFT", label: "昇進甘め", note: "番付上昇の余地を見る実験記録。" },
  { id: "PROMOTION_STRICT", label: "昇進厳しめ", note: "壁の厚さを見る実験記録。" },
  { id: "LATE_BLOOM", label: "晩成寄り", note: "遅咲きの出方を見る実験記録。" },
  { id: "RETIREMENT_SOFT", label: "引退圧弱め", note: "長く残る人生を見る実験記録。" },
];

export const GENERATION_MODE_OPTIONS: Array<{ value: ScoutGenerationMode; label: string; note: string }> = [
  {
    value: "OBSERVE_RANDOM",
    label: "観測モード",
    note: "観測視点だけを選び、人物・経歴・体格・部屋・素質は候補札のランダム値を使う。",
  },
  {
    value: "BUILD",
    label: "ビルドモード",
    note: "直接能力値を触らず、成長型・型・付出・天才型などキャリア前提を選ぶ。",
  },
];

export const GROWTH_TYPE_OPTIONS: Array<{ value: GrowthType; label: string; note: string }> = [
  { value: "EARLY", label: SCOUT_GROWTH_TYPE_LABELS.EARLY, note: "若いうちに伸び、後半は衰えも早めに出る。" },
  { value: "NORMAL", label: SCOUT_GROWTH_TYPE_LABELS.NORMAL, note: "伸び方と衰え方を標準に置く。" },
  { value: "LATE", label: SCOUT_GROWTH_TYPE_LABELS.LATE, note: "序盤は重いが、後半の伸び返しを読む。" },
  { value: "GENIUS", label: SCOUT_GROWTH_TYPE_LABELS.GENIUS, note: "完成の速さと長いピークを期待する特殊な成長型。" },
];

export const PREFERRED_STYLE_OPTIONS: Array<{ value: StyleArchetype; label: string; note: string }> = [
  { value: "YOTSU", label: STYLE_LABELS.YOTSU, note: "差して寄る正攻法を入口の型にする。" },
  { value: "TSUKI_OSHI", label: STYLE_LABELS.TSUKI_OSHI, note: "前に出る圧力を勝ち筋の中心に置く。" },
  { value: "MOROZASHI", label: STYLE_LABELS.MOROZASHI, note: "懐へ入る技術と差し手を重視する。" },
  { value: "DOHYOUGIWA", label: STYLE_LABELS.DOHYOUGIWA, note: "残しと反応で山場を作る型に寄せる。" },
  { value: "NAGE_TECH", label: STYLE_LABELS.NAGE_TECH, note: "投げと崩しの技巧を読み筋にする。" },
  { value: "POWER_PRESSURE", label: STYLE_LABELS.POWER_PRESSURE, note: "馬力で押し込む圧力相撲を狙う。" },
];

export const ENTRY_ARCHETYPE_OPTIONS: Array<{ value: EntryArchetype; label: string; note: string }> = [
  { value: "ORDINARY_RECRUIT", label: ENTRY_ARCHETYPE_LABELS.ORDINARY_RECRUIT, note: "付出なし。前相撲から下積みを読む。" },
  { value: "EARLY_PROSPECT", label: ENTRY_ARCHETYPE_LABELS.EARLY_PROSPECT, note: "肩書は強くないが、序盤の期待を少し持たせる。" },
  { value: "TSUKEDASHI", label: ENTRY_ARCHETYPE_LABELS.TSUKEDASHI, note: "三段目付出相当として、下位を短縮する。" },
  { value: "ELITE_TSUKEDASHI", label: ENTRY_ARCHETYPE_LABELS.ELITE_TSUKEDASHI, note: "幕下付出相当として、大きな看板を背負う。" },
  { value: "MONSTER", label: ENTRY_ARCHETYPE_LABELS.MONSTER, note: "まれな怪物候補として、期待と落差を大きくする。" },
];

export const TALENT_PROFILE_OPTIONS: Array<{ value: ScoutTalentProfile; label: string; note: string }> = [
  { value: "AUTO", label: SCOUT_TALENT_PROFILE_LABELS.AUTO, note: "候補札の素質をそのまま使う。" },
  { value: "STANDARD", label: SCOUT_TALENT_PROFILE_LABELS.STANDARD, note: "極端な上振れを抑え、標準的な読み味に寄せる。" },
  { value: "PROMISING", label: SCOUT_TALENT_PROFILE_LABELS.PROMISING, note: "有望株として、関取到達の期待を少し厚くする。" },
  { value: "GENIUS", label: SCOUT_TALENT_PROFILE_LABELS.GENIUS, note: "天才型として、素質と成長の上振れを明示的に置く。" },
];

export const FIELD_OPTIONS = {
  entryPath: [
    { value: "LOCAL", label: SCOUT_ENTRY_PATH_LABELS.LOCAL, note: "肩書より土台を優先する。" },
    { value: "SCHOOL", label: SCOUT_ENTRY_PATH_LABELS.SCHOOL, note: "学校相撲の反復が入口になる。" },
    { value: "COLLEGE", label: SCOUT_ENTRY_PATH_LABELS.COLLEGE, note: "学生相撲の経験が入口に効く。" },
    { value: "CHAMPION", label: SCOUT_ENTRY_PATH_LABELS.CHAMPION, note: "看板を背負って土俵へ入る。" },
  ] as Array<{ value: ScoutEntryPath; label: string; note: string }>,
  temperament: [
    { value: "STEADY", label: SCOUT_TEMPERAMENT_LABELS.STEADY, note: "停滞にも崩れにくい。" },
    { value: "AMBITION", label: SCOUT_TEMPERAMENT_LABELS.AMBITION, note: "上を狙う気配が強い。" },
    { value: "STUBBORN", label: SCOUT_TEMPERAMENT_LABELS.STUBBORN, note: "折れずに踏みとどまりやすい。" },
    { value: "EXPLOSIVE", label: SCOUT_TEMPERAMENT_LABELS.EXPLOSIVE, note: "流れが極端に振れやすい。" },
  ] as Array<{ value: ScoutTemperament; label: string; note: string }>,
  bodySeed: [
    { value: "BALANCED", label: SCOUT_BODY_SEED_LABELS.BALANCED, note: "癖の少ない土台から育つ。" },
    { value: "LONG", label: SCOUT_BODY_SEED_LABELS.LONG, note: "長さと間合いが後から効く。" },
    { value: "HEAVY", label: SCOUT_BODY_SEED_LABELS.HEAVY, note: "重さと圧力が人生の軸になる。" },
    { value: "SPRING", label: SCOUT_BODY_SEED_LABELS.SPRING, note: "足腰の弾みが残り方を変える。" },
  ] as Array<{ value: ScoutBodySeed; label: string; note: string }>,
} as const;

export const stableOptions = STABLE_CATALOG.slice(0, 9).map((stable) => ({
  value: stable.id,
  label: stable.displayName,
  note: stable.flavor,
}));
