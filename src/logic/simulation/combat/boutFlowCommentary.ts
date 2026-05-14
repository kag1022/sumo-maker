import type {
  BanzukeContextTag,
  BoutExplanationMaterialAxis,
  HoshitoriContextTag,
} from './boutFlowModel';
import type {
  BoutFlowDiagnosticSnapshot,
  BoutFlowTransitionClassification,
} from './boutFlowDiagnosticSnapshot';
import type { ControlPhaseCandidate } from './controlPhaseAdapter';

export type BoutFlowCommentaryContractVersion = 'BOUT_FLOW_COMMENTARY_RUNTIME_V1';

export type BoutFlowCommentarySegmentKind =
  | 'OPENING'
  | 'CONTROL'
  | 'TRANSITION'
  | 'FINISH'
  | 'KIMARITE'
  | 'VICTORY_FACTOR'
  | 'HOSHITORI'
  | 'BANZUKE';

export interface BoutFlowCommentaryMaterial {
  readonly key: string;
  readonly axis: BoutExplanationMaterialAxis;
  readonly segmentKind: BoutFlowCommentarySegmentKind;
  readonly text: string;
  readonly tags: readonly string[];
}

export interface BoutFlowCommentary {
  readonly version: BoutFlowCommentaryContractVersion;
  readonly kimarite: string;
  readonly shortCommentary: string;
  readonly victoryFactorLabels: readonly string[];
  readonly flowExplanation: readonly string[];
  readonly materialKeys: readonly string[];
  readonly materials: readonly BoutFlowCommentaryMaterial[];
}

export interface BoutFlowCommentaryDiagnostic {
  readonly generated: boolean;
  readonly reasonTags: readonly string[];
  readonly commentary?: BoutFlowCommentary;
}

const labelOf = (
  tag: string,
  labels: Record<string, string>,
  fallback: string,
): string => labels[tag] ?? fallback;

const firstTag = <T extends string>(
  tags: readonly T[],
  priority: readonly T[],
): T | undefined =>
    priority.find((tag) => tags.includes(tag)) ?? tags[0];

const unique = <T extends string>(values: readonly T[]): readonly T[] =>
  Array.from(new Set(values));

const OPENING_TEXT: Record<string, string> = {
  THRUST_BATTLE: '立合いから押し合いになり、先に前へ出る形を作った。',
  BELT_BATTLE: '序盤は四つに近い探り合いで、まわしと差し手の攻防が先に立った。',
  TECHNIQUE_SCRAMBLE: '立合い後は技の探り合いになり、相手の出方を読む間が生まれた。',
  EDGE_BATTLE: '序盤から土俵際を意識する窮屈な展開になった。',
  QUICK_COLLAPSE: '立合い直後に体勢が崩れ、短い勝負の気配が濃かった。',
  MIXED: '序盤は押しと組みが混ざり、はっきりした形に固定されなかった。',
};

const CONTROL_TEXT: Record<ControlPhaseCandidate, string> = {
  THRUST_BATTLE: '主導権は押し合いの中で決まり、相手を下がらせる流れが続いた。',
  BELT_BATTLE: '中盤は組み合いの主導権が焦点となり、腰の位置で優劣が出た。',
  TECHNIQUE_SCRAMBLE: '主導権は技への変換で動き、単純な前進だけでは終わらなかった。',
  EDGE_BATTLE: '土俵際で主導権が揺れ、残す力と詰める力がぶつかった。',
  QUICK_COLLAPSE: '相手の体勢が早く崩れ、主導権争いは長引かなかった。',
  MIXED: '押し、組み、いなしが混ざり、主導権は一方向には読みにくかった。',
};

const TRANSITION_TEXT: Record<BoutFlowTransitionClassification, string> = {
  ALIGNED_FLOW: '序盤の形と決着までの流れがそのままつながった。',
  CONTROL_SHIFT: '序盤の形から主導権が移り、勝ち筋が途中で変わった。',
  TECHNIQUE_CONVERSION: '途中で技への変換が入り、流れを作り替えて決着した。',
  EDGE_TURNAROUND: '土俵際の攻防が勝敗の焦点になり、そこで流れが決まった。',
  QUICK_FINISH: '体勢の崩れを逃さず、短い手順で勝負をまとめた。',
  AMBIGUOUS_CONTROL: '主導権の読みは割れたが、最後の形だけは結果に残った。',
};

const FINISH_TEXT: Record<string, string> = {
  PUSH_OUT: '最後は押し込んで土俵の外へ運んだ。',
  BELT_FORCE: '最後は組み止めて寄り切る形に収束した。',
  THROW_BREAK: '最後は投げや崩しで相手の軸を外した。',
  PULL_DOWN: '最後はいなしや引きで前のめりを誘った。',
  EDGE_REVERSAL: '最後は土俵際の反転で勝敗をひっくり返した。',
  REAR_FINISH: '最後は相手の後ろを取る形に近づけた。',
  LEG_ATTACK: '最後は足技や低い攻めで崩し切った。',
};

const KIMARITE_FAMILY_TEXT: Record<string, string> = {
  PUSH_THRUST: '決まり手は押し・突きの系統で、前へ出る流れと結びついた。',
  FORCE_OUT: '決まり手は寄り・極めの系統で、体を密着させた圧力が残った。',
  THROW: '決まり手は投げの系統で、相手の重心を外す技量が結果になった。',
  TWIST_DOWN: '決まり手は捻り・落としの系統で、相手の前進を逆用した。',
  TRIP_PICK: '決まり手は足取り・掛けの系統で、足元への崩しが効いた。',
  BACKWARD_BODY_DROP: '決まり手は反りの系統で、かなり特殊な体勢からの決着になった。',
  REAR: '決まり手は送りの系統で、相手の向きを制したことが大きかった。',
  NON_TECHNIQUE: '決まり手は非技で、勝負の崩れ方そのものが記録になった。',
};

const FACTOR_LABELS: Record<string, string> = {
  'victory-factor:ability': '基礎能力差',
  'victory-factor:style': '取り口相性',
  'victory-factor:body': '体格差',
  'victory-factor:form': '場所ごとの調子',
  'victory-factor:momentum': '場所内の流れ',
  'victory-factor:injury': '負傷影響',
  'victory-factor:pressure': '勝負所の圧力',
  'victory-factor:kimarite-fit': '決まり手適性',
  'victory-factor:phase-shape': '展開の形',
  'victory-factor:realism-compression': '番付帯の力関係',
};

const HOSHITORI_PRIORITY: readonly HoshitoriContextTag[] = [
  'YUSHO_DIRECT',
  'YUSHO_CHASE',
  'KACHI_MAKE_DECIDER',
  'KACHIKOSHI_DECIDER',
  'MAKEKOSHI_DECIDER',
  'FINAL_BOUT',
  'WIN_STREAK',
  'LOSS_STREAK',
  'RECOVERY_BOUT',
  'LEAD_PROTECTION',
  'EARLY_BASHO',
  'MIDDLE_BASHO',
];

const HOSHITORI_TEXT: Record<HoshitoriContextTag, string> = {
  EARLY_BASHO: '場所序盤の一番で、流れを作る意味が強い。',
  MIDDLE_BASHO: '場所中盤の一番で、星の積み方が問われる局面だった。',
  FINAL_BOUT: '当人にとっての最終取組で、場所の印象を締める一番だった。',
  KACHIKOSHI_DECIDER: '勝ち越しを決める文脈があり、白星の意味は成績以上に重い。',
  MAKEKOSHI_DECIDER: '負け越し回避の文脈があり、黒星なら場所の読みが変わる一番だった。',
  KACHI_MAKE_DECIDER: '勝ち越しと負け越しの境目に立つ一番だった。',
  YUSHO_DIRECT: '優勝争いを直接左右する一番で、勝敗の重みが明確だった。',
  YUSHO_CHASE: '優勝争いを追う文脈があり、落とせない一番として読める。',
  WIN_STREAK: '連勝の流れを背負っており、勢いを継続する白星になった。',
  LOSS_STREAK: '連敗の流れを断つかどうかが見える一番だった。',
  RECOVERY_BOUT: '前の黒星から立て直す意味を持つ一番だった。',
  LEAD_PROTECTION: '勝ち星先行を守る文脈があり、崩れないことが価値になった。',
};

const BANZUKE_PRIORITY: readonly BanzukeContextTag[] = [
  'PROMOTION_RELEVANT',
  'DEMOTION_RELEVANT',
  'KINBOSHI_CHANCE',
  'SAN_YAKU_PRESSURE',
  'MAKUUCHI_BOUNDARY',
  'SEKITORI_BOUNDARY',
  'RANK_GAP_UPSET',
  'RANK_EXPECTED_WIN',
];

const BANZUKE_TEXT: Record<BanzukeContextTag, string> = {
  PROMOTION_RELEVANT: '番付上は昇進材料になり得る白星で、次の評価に残りやすい。',
  DEMOTION_RELEVANT: '番付上は降下圧を避ける意味があり、この白星で踏みとどまった。',
  SAN_YAKU_PRESSURE: '三役以上の地位に見合う内容が問われる文脈だった。',
  SEKITORI_BOUNDARY: '関取境界に関わる番付文脈があり、単なる一勝以上の意味を持つ。',
  MAKUUCHI_BOUNDARY: '幕内境界に関わる番付文脈があり、地位維持や上昇の読みを左右する。',
  KINBOSHI_CHANCE: '格上相手の白星として、番付差を超える記録性がある。',
  RANK_GAP_UPSET: '番付差を覆す意味があり、結果の印象が強く残る。',
  RANK_EXPECTED_WIN: '番付上は自然に求められる内容で、取りこぼさないことが評価になる。',
};

const createMaterial = (
  key: string,
  axis: BoutExplanationMaterialAxis,
  segmentKind: BoutFlowCommentarySegmentKind,
  text: string,
  tags: readonly string[],
): BoutFlowCommentaryMaterial => ({
  key,
  axis,
  segmentKind,
  text,
  tags,
});

const buildVictoryFactorLabels = (
  tags: readonly string[],
): readonly string[] =>
  unique(
    tags
      .filter((tag) => FACTOR_LABELS[tag])
      .map((tag) => FACTOR_LABELS[tag]),
  ).slice(0, 4);

export const createBoutFlowCommentaryDiagnostic = (
  snapshot: BoutFlowDiagnosticSnapshot,
): BoutFlowCommentaryDiagnostic => {
  if (snapshot.explanationCompleteness !== 'COMPLETE_CONTEXT') {
    return {
      generated: false,
      reasonTags: [
        'bout-flow-commentary:requires-complete-context',
        ...snapshot.missingExplanationAxes.map((axis) => `missing:${axis}`),
      ],
    };
  }

  const hoshitoriTag = firstTag(snapshot.hoshitoriContextTags, HOSHITORI_PRIORITY) ?? 'MIDDLE_BASHO';
  const banzukeTag = firstTag(snapshot.banzukeContextTags, BANZUKE_PRIORITY) ?? 'RANK_EXPECTED_WIN';
  const kimariteFamily = snapshot.kimarite.family ?? snapshot.kimarite.diagnosticFamily;
  const victoryFactorLabels = buildVictoryFactorLabels(snapshot.victoryFactorTags);
  const factorSummary = victoryFactorLabels.length
    ? `勝敗要因は${victoryFactorLabels.join('、')}。`
    : '勝敗要因は展開全体に分散している。';

  const materials = [
    createMaterial(
      `opening:${snapshot.openingPhase}`,
      'OPENING',
      'OPENING',
      OPENING_TEXT[snapshot.openingPhase],
      [`opening:${snapshot.openingPhase}`],
    ),
    createMaterial(
      `control:${snapshot.controlPhaseCandidate ?? 'UNAVAILABLE'}:${snapshot.controlConfidence}`,
      'CONTROL',
      'CONTROL',
      snapshot.controlPhaseCandidate
        ? CONTROL_TEXT[snapshot.controlPhaseCandidate]
        : '主導権は明確に読みにくく、決着側の情報から補う必要がある。',
      [`control:${snapshot.controlPhaseCandidate ?? 'UNAVAILABLE'}`, `confidence:${snapshot.controlConfidence}`],
    ),
    createMaterial(
      `transition:${snapshot.transitionClassification}`,
      'TRANSITION',
      'TRANSITION',
      TRANSITION_TEXT[snapshot.transitionClassification],
      [`transition:${snapshot.transitionClassification}`],
    ),
    createMaterial(
      `finish:${snapshot.finishRoute}`,
      'FINISH_ROUTE',
      'FINISH',
      FINISH_TEXT[snapshot.finishRoute],
      [`finish:${snapshot.finishRoute}`],
    ),
    createMaterial(
      `kimarite:${snapshot.kimarite.name}:${kimariteFamily}`,
      'KIMARITE',
      'KIMARITE',
      `${snapshot.kimarite.name}。${labelOf(kimariteFamily, KIMARITE_FAMILY_TEXT, '決まり手の分類は補助的で、流れ全体と合わせて読む必要がある。')}`,
      [`kimarite:${snapshot.kimarite.name}`, `family:${kimariteFamily}`],
    ),
    createMaterial(
      `victory:${snapshot.victoryFactorTags.join('+') || 'mixed'}`,
      'VICTORY_FACTOR',
      'VICTORY_FACTOR',
      factorSummary,
      snapshot.victoryFactorTags,
    ),
    createMaterial(
      `hoshitori:${hoshitoriTag}`,
      'HOSHITORI_CONTEXT',
      'HOSHITORI',
      HOSHITORI_TEXT[hoshitoriTag],
      [`hoshitori:${hoshitoriTag}`],
    ),
    createMaterial(
      `banzuke:${banzukeTag}`,
      'BANZUKE_CONTEXT',
      'BANZUKE',
      BANZUKE_TEXT[banzukeTag],
      [`banzuke:${banzukeTag}`],
    ),
  ] as const;

  const flowExplanation = [
    `${materials[0].text}${materials[1].text}`,
    `${materials[2].text}${materials[3].text}${materials[4].text}`,
    `${materials[5].text}${materials[6].text}${materials[7].text}`,
  ];
  const shortCommentary = `${snapshot.kimarite.name}: ${materials[2].text}${materials[6].text}${materials[7].text}`;

  return {
    generated: true,
    reasonTags: ['bout-flow-commentary:generated'],
    commentary: {
      version: 'BOUT_FLOW_COMMENTARY_RUNTIME_V1',
      kimarite: snapshot.kimarite.name,
      shortCommentary,
      victoryFactorLabels,
      flowExplanation,
      materialKeys: materials.map((material) => material.key),
      materials,
    },
  };
};
