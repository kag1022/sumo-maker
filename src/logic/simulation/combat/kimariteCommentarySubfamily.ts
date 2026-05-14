import type { WinRoute } from '../../models';
import {
  normalizeKimariteName,
  type KimariteFamily,
  type KimaritePattern,
} from '../../kimarite/catalog';
import type { BoutFlowTransitionClassification } from './boutFlowDiagnosticSnapshot';

export type CommentaryKimariteSubfamily =
  | 'PUSH_OUT'
  | 'THRUST_OUT'
  | 'PUSH_DOWN'
  | 'THRUST_DOWN'
  | 'PUSH_BREAK'
  | 'YORI_OUT'
  | 'YORI_DOWN'
  | 'ABISE_DOWN'
  | 'KIME_FORCE'
  | 'LIFT_FORCE'
  | 'EDGE_FORCE'
  | 'BELT_THROW'
  | 'ARM_THROW'
  | 'SCOOP_THROW'
  | 'EDGE_REVERSAL_THROW'
  | 'BODY_BREAK_THROW'
  | 'TSUKIOTOSHI'
  | 'HATAKIKOMI'
  | 'HIKIOTOSHI'
  | 'MAKIOTOSHI'
  | 'TWIST_BREAK'
  | 'PULL_BREAK'
  | 'EDGE_TWIST'
  | 'LEG_TWIST'
  | 'LEG_PICK'
  | 'OUTER_TRIP'
  | 'INNER_TRIP'
  | 'KICK_TRIP'
  | 'HOOK_THROW'
  | 'LEG_BREAK'
  | 'SORITECH'
  | 'SUTEMI'
  | 'BIG_ARCH'
  | 'REAR_PUSH_OUT'
  | 'REAR_DOWN'
  | 'REAR_GRIP'
  | 'REAR_BREAK'
  | 'REAR_LIFT'
  | 'ISAMIASHI'
  | 'KOSHIKUDAKE'
  | 'TOUCH_DOWN'
  | 'STEP_OUT'
  | 'FOUL'
  | 'FUSEN'
  | 'GENERIC';

export interface CommentaryKimariteSubfamilyResolution {
  readonly family: KimariteFamily;
  readonly subfamily: CommentaryKimariteSubfamily;
  readonly source: 'NAME' | 'FAMILY_CONTEXT' | 'GENERIC';
  readonly reasonTags: readonly string[];
}

export interface ResolveCommentaryKimariteSubfamilyInput {
  readonly name: string;
  readonly family?: string;
  readonly diagnosticFamily?: string;
  readonly pattern?: KimaritePattern;
  readonly finishRoute?: WinRoute;
  readonly transitionClassification?: BoutFlowTransitionClassification;
}

const COMMENTARY_KIMARITE_FAMILIES: readonly KimariteFamily[] = [
  'PUSH_THRUST',
  'FORCE_OUT',
  'THROW',
  'TWIST_DOWN',
  'TRIP_PICK',
  'BACKWARD_BODY_DROP',
  'REAR',
  'NON_TECHNIQUE',
];

export const COMMENTARY_KIMARITE_SUBFAMILIES_BY_FAMILY: Readonly<Record<KimariteFamily, readonly CommentaryKimariteSubfamily[]>> = {
  PUSH_THRUST: ['PUSH_OUT', 'THRUST_OUT', 'PUSH_DOWN', 'THRUST_DOWN', 'PUSH_BREAK', 'GENERIC'],
  FORCE_OUT: ['YORI_OUT', 'YORI_DOWN', 'ABISE_DOWN', 'KIME_FORCE', 'LIFT_FORCE', 'EDGE_FORCE', 'GENERIC'],
  THROW: ['BELT_THROW', 'ARM_THROW', 'SCOOP_THROW', 'EDGE_REVERSAL_THROW', 'BODY_BREAK_THROW', 'GENERIC'],
  TWIST_DOWN: ['TSUKIOTOSHI', 'HATAKIKOMI', 'HIKIOTOSHI', 'MAKIOTOSHI', 'TWIST_BREAK', 'PULL_BREAK', 'EDGE_TWIST', 'LEG_TWIST', 'GENERIC'],
  TRIP_PICK: ['LEG_PICK', 'OUTER_TRIP', 'INNER_TRIP', 'KICK_TRIP', 'HOOK_THROW', 'LEG_BREAK', 'GENERIC'],
  BACKWARD_BODY_DROP: ['SORITECH', 'SUTEMI', 'BIG_ARCH', 'GENERIC'],
  REAR: ['REAR_PUSH_OUT', 'REAR_DOWN', 'REAR_GRIP', 'REAR_BREAK', 'REAR_LIFT', 'GENERIC'],
  NON_TECHNIQUE: ['ISAMIASHI', 'KOSHIKUDAKE', 'TOUCH_DOWN', 'STEP_OUT', 'FOUL', 'FUSEN', 'GENERIC'],
};

const KNOWN_FAMILY_SET = new Set<string>(COMMENTARY_KIMARITE_FAMILIES);

const NAME_SUBFAMILY: Readonly<Record<string, CommentaryKimariteSubfamily>> = {
  押し出し: 'PUSH_OUT',
  押し倒し: 'PUSH_DOWN',
  突き出し: 'THRUST_OUT',
  突き倒し: 'THRUST_DOWN',
  寄り切り: 'YORI_OUT',
  寄り倒し: 'YORI_DOWN',
  浴びせ倒し: 'ABISE_DOWN',
  極め出し: 'KIME_FORCE',
  極め倒し: 'KIME_FORCE',
  吊り出し: 'LIFT_FORCE',
  吊り落とし: 'LIFT_FORCE',
  鯖折り: 'ABISE_DOWN',
  割り出し: 'KIME_FORCE',
  上手投げ: 'BELT_THROW',
  下手投げ: 'BELT_THROW',
  上手出し投げ: 'BELT_THROW',
  下手出し投げ: 'BELT_THROW',
  掛け投げ: 'BELT_THROW',
  腰投げ: 'BELT_THROW',
  櫓投げ: 'BELT_THROW',
  つかみ投げ: 'BELT_THROW',
  小手投げ: 'ARM_THROW',
  首投げ: 'ARM_THROW',
  一本背負い: 'ARM_THROW',
  掬い投げ: 'SCOOP_THROW',
  二丁投げ: 'BODY_BREAK_THROW',
  うっちゃり: 'EDGE_REVERSAL_THROW',
  網打ち: 'EDGE_TWIST',
  波離間投げ: 'EDGE_TWIST',
  突き落とし: 'TSUKIOTOSHI',
  叩き込み: 'HATAKIKOMI',
  はたき込み: 'HATAKIKOMI',
  引き落とし: 'HIKIOTOSHI',
  巻き落とし: 'MAKIOTOSHI',
  肩透かし: 'PULL_BREAK',
  素首落とし: 'PULL_BREAK',
  引っ掛け: 'PULL_BREAK',
  呼び戻し: 'EDGE_TWIST',
  渡し込み: 'LEG_TWIST',
  外無双: 'LEG_TWIST',
  内無双: 'LEG_TWIST',
  合掌捻り: 'TWIST_BREAK',
  腕捻り: 'TWIST_BREAK',
  小手捻り: 'TWIST_BREAK',
  首捻り: 'TWIST_BREAK',
  大逆手: 'TWIST_BREAK',
  逆とったり: 'TWIST_BREAK',
  下手捻り: 'TWIST_BREAK',
  上手捻り: 'TWIST_BREAK',
  徳利投げ: 'TWIST_BREAK',
  とったり: 'TWIST_BREAK',
  ずぶねり: 'TWIST_BREAK',
  足取り: 'LEG_PICK',
  小股掬い: 'LEG_PICK',
  小褄取り: 'LEG_PICK',
  裾取り: 'LEG_PICK',
  褄取り: 'LEG_PICK',
  外掛け: 'OUTER_TRIP',
  外小股: 'OUTER_TRIP',
  内掛け: 'INNER_TRIP',
  ちょん掛け: 'INNER_TRIP',
  蹴返し: 'KICK_TRIP',
  蹴手繰り: 'KICK_TRIP',
  裾払い: 'KICK_TRIP',
  河津掛け: 'HOOK_THROW',
  切り返し: 'HOOK_THROW',
  三所攻め: 'LEG_BREAK',
  大股: 'LEG_BREAK',
  二枚蹴り: 'KICK_TRIP',
  居反り: 'SORITECH',
  掛け反り: 'SORITECH',
  撞木反り: 'SORITECH',
  外たすき反り: 'SORITECH',
  たすき反り: 'SORITECH',
  伝え反り: 'SORITECH',
  送り出し: 'REAR_PUSH_OUT',
  送り倒し: 'REAR_DOWN',
  送り掛け: 'REAR_BREAK',
  送り引き落とし: 'REAR_BREAK',
  送り投げ: 'REAR_BREAK',
  送り吊り出し: 'REAR_LIFT',
  送り吊り落とし: 'REAR_LIFT',
  後ろもたれ: 'REAR_GRIP',
  勇み足: 'ISAMIASHI',
  腰砕け: 'KOSHIKUDAKE',
  つき手: 'TOUCH_DOWN',
  つきひざ: 'TOUCH_DOWN',
  踏み出し: 'STEP_OUT',
  反則: 'FOUL',
  不戦: 'FUSEN',
};

const toKnownFamily = (value: string | undefined): KimariteFamily | undefined =>
  value && KNOWN_FAMILY_SET.has(value) ? value as KimariteFamily : undefined;

const familyFromFinishRoute = (finishRoute: WinRoute | undefined): KimariteFamily | undefined => {
  if (finishRoute === 'PUSH_OUT') return 'PUSH_THRUST';
  if (finishRoute === 'BELT_FORCE') return 'FORCE_OUT';
  if (finishRoute === 'THROW_BREAK') return 'THROW';
  if (finishRoute === 'PULL_DOWN') return 'TWIST_DOWN';
  if (finishRoute === 'LEG_ATTACK') return 'TRIP_PICK';
  if (finishRoute === 'EDGE_REVERSAL') return 'BACKWARD_BODY_DROP';
  if (finishRoute === 'REAR_FINISH') return 'REAR';
  return undefined;
};

const familyFromPattern = (pattern: KimaritePattern | undefined): KimariteFamily | undefined => {
  if (pattern === 'PUSH_ADVANCE') return 'PUSH_THRUST';
  if (pattern === 'BELT_FORCE') return 'FORCE_OUT';
  if (pattern === 'THROW_EXCHANGE') return 'THROW';
  if (pattern === 'PULL_DOWN') return 'TWIST_DOWN';
  if (pattern === 'LEG_TRIP_PICK') return 'TRIP_PICK';
  if (pattern === 'BACKWARD_ARCH') return 'BACKWARD_BODY_DROP';
  if (pattern === 'REAR_CONTROL') return 'REAR';
  if (pattern === 'NON_TECHNIQUE') return 'NON_TECHNIQUE';
  return undefined;
};

const resolveFamily = (input: ResolveCommentaryKimariteSubfamilyInput): KimariteFamily =>
  toKnownFamily(input.family) ??
  toKnownFamily(input.diagnosticFamily) ??
  familyFromPattern(input.pattern) ??
  familyFromFinishRoute(input.finishRoute) ??
  'NON_TECHNIQUE';

const contextualSubfamily = (
  family: KimariteFamily,
  input: ResolveCommentaryKimariteSubfamilyInput,
): CommentaryKimariteSubfamily => {
  if (family === 'PUSH_THRUST') {
    if (input.pattern === 'PUSH_ADVANCE' || input.finishRoute === 'PUSH_OUT') return 'PUSH_BREAK';
  }
  if (family === 'FORCE_OUT') {
    if (input.transitionClassification === 'EDGE_TURNAROUND' || input.finishRoute === 'EDGE_REVERSAL') return 'EDGE_FORCE';
    if (input.pattern === 'BELT_FORCE' || input.finishRoute === 'BELT_FORCE') return 'YORI_OUT';
  }
  if (family === 'THROW') {
    if (input.transitionClassification === 'EDGE_TURNAROUND' || input.finishRoute === 'EDGE_REVERSAL') return 'EDGE_REVERSAL_THROW';
    if (input.pattern === 'THROW_EXCHANGE' || input.finishRoute === 'THROW_BREAK') return 'BODY_BREAK_THROW';
  }
  if (family === 'TWIST_DOWN') {
    if (input.transitionClassification === 'EDGE_TURNAROUND' || input.finishRoute === 'EDGE_REVERSAL') return 'EDGE_TWIST';
    if (input.pattern === 'PULL_DOWN' || input.finishRoute === 'PULL_DOWN') return 'PULL_BREAK';
  }
  if (family === 'TRIP_PICK') {
    if (input.pattern === 'LEG_TRIP_PICK' || input.finishRoute === 'LEG_ATTACK') return 'LEG_BREAK';
  }
  if (family === 'BACKWARD_BODY_DROP') {
    if (input.pattern === 'BACKWARD_ARCH') return 'BIG_ARCH';
    if (input.transitionClassification === 'EDGE_TURNAROUND' || input.finishRoute === 'EDGE_REVERSAL') return 'SUTEMI';
  }
  if (family === 'REAR') {
    if (input.finishRoute === 'REAR_FINISH' || input.pattern === 'REAR_CONTROL') return 'REAR_GRIP';
  }
  return 'GENERIC';
};

export const resolveCommentaryKimariteSubfamily = (
  input: ResolveCommentaryKimariteSubfamilyInput,
): CommentaryKimariteSubfamilyResolution => {
  const family = resolveFamily(input);
  const normalizedName = normalizeKimariteName(input.name);
  const namedSubfamily = NAME_SUBFAMILY[normalizedName];
  if (
    namedSubfamily &&
    COMMENTARY_KIMARITE_SUBFAMILIES_BY_FAMILY[family].includes(namedSubfamily)
  ) {
    return {
      family,
      subfamily: namedSubfamily,
      source: 'NAME',
      reasonTags: [`kimarite-subfamily:name:${normalizedName}`, `family:${family}`, `subfamily:${namedSubfamily}`],
    };
  }
  const contextual = contextualSubfamily(family, input);
  return {
    family,
    subfamily: contextual,
    source: contextual === 'GENERIC' ? 'GENERIC' : 'FAMILY_CONTEXT',
    reasonTags: [
      `kimarite-subfamily:${contextual === 'GENERIC' ? 'generic' : 'context'}`,
      `family:${family}`,
      `subfamily:${contextual}`,
    ],
  };
};
