import type { ExperimentPresetId } from "../../../logic/models";
import {
  SCOUT_BODY_SEED_LABELS,
  SCOUT_ENTRY_PATH_LABELS,
  SCOUT_TEMPERAMENT_LABELS,
  type ScoutBodySeed,
  type ScoutEntryPath,
  type ScoutTemperament,
} from "../../../logic/scout/gacha";
import { STABLE_CATALOG } from "../../../logic/simulation/heya/stableCatalog";

export type ScoutStepId = "identity" | "seed" | "body";

export const STEP_ORDER: ScoutStepId[] = ["identity", "seed", "body"];

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
    action: "最後に体格と部屋を決める",
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
