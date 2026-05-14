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
  readonly outcome: BoutFlowCommentaryOutcome;
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

export type BoutFlowCommentaryOutcome = 'WIN' | 'LOSS';

interface MaterialSpec {
  readonly variant: string;
  readonly text: string;
  readonly tags: readonly string[];
}

const firstTag = <T extends string>(
  tags: readonly T[],
  priority: readonly T[],
): T | undefined =>
    priority.find((tag) => tags.includes(tag)) ?? tags[0];

const unique = <T extends string>(values: readonly T[]): readonly T[] =>
  Array.from(new Set(values));

const textOf = (
  value: string,
  labels: Record<string, string>,
  fallback: string,
): string => labels[value] ?? fallback;

const createMaterial = (
  axis: BoutExplanationMaterialAxis,
  segmentKind: BoutFlowCommentarySegmentKind,
  key: string,
  spec: MaterialSpec,
): BoutFlowCommentaryMaterial => ({
  key: `${key}:${spec.variant}`,
  axis,
  segmentKind,
  text: spec.text,
  tags: spec.tags,
});

const openingSpec = (snapshot: BoutFlowDiagnosticSnapshot): MaterialSpec => {
  switch (snapshot.openingPhase) {
    case 'THRUST_BATTLE':
      return snapshot.transitionClassification === 'ALIGNED_FLOW'
        ? {
          variant: 'straight-attack',
          text: '立合いから押して、正面の圧力を先に出した。',
          tags: ['opening:THRUST_BATTLE', 'opening-style:oshi'],
        }
        : {
          variant: 'push-start-shift',
          text: '立合いは押し合い、途中で攻め方が変わった。',
          tags: ['opening:THRUST_BATTLE', 'transition-shape:shift'],
        };
    case 'BELT_BATTLE':
      return snapshot.controlPhaseCandidate === 'THRUST_BATTLE'
        ? {
          variant: 'belt-to-distance',
          text: '序盤は差し手争い、そこから離れて押す形に移った。',
          tags: ['opening:BELT_BATTLE', 'opening-style:yotsu', 'transition-shape:release'],
        }
        : {
          variant: 'belt-first',
          text: '序盤は四つの攻防、まわしを巡る展開になった。',
          tags: ['opening:BELT_BATTLE', 'opening-style:yotsu'],
        };
    case 'TECHNIQUE_SCRAMBLE':
      return {
        variant: 'read-and-move',
        text: '立合い後は相手の出方を見て、技へ移る間を作った。',
        tags: ['opening:TECHNIQUE_SCRAMBLE', 'opening-style:waza'],
      };
    case 'EDGE_BATTLE':
      return snapshot.finishRoute === 'EDGE_REVERSAL'
        ? {
          variant: 'edge-from-start-reversal',
          text: '序盤から土俵際、残し合いのまま勝負が進んだ。',
          tags: ['opening:EDGE_BATTLE', 'edge:early', 'finish:EDGE_REVERSAL'],
        }
        : {
          variant: 'edge-from-start-pressure',
          text: '序盤から土俵際を背負い、窮屈な体勢が続いた。',
          tags: ['opening:EDGE_BATTLE', 'edge:early'],
        };
    case 'QUICK_COLLAPSE':
      return {
        variant: 'instant-break',
        text: '立合い直後に体勢が崩れ、短い相撲になった。',
        tags: ['opening:QUICK_COLLAPSE', 'tempo:quick'],
      };
    case 'MIXED':
      return {
        variant: 'mixed-entry',
        text: '序盤は押し、組み、いなしが混じり、形が定まらなかった。',
        tags: ['opening:MIXED', 'opening-style:mixed'],
      };
  }
};

const controlSpec = (snapshot: BoutFlowDiagnosticSnapshot): MaterialSpec => {
  const phase = snapshot.controlPhaseCandidate;
  if (!phase) {
    return {
      variant: `unavailable-${snapshot.controlConfidence}`,
      text: '中盤の主導権は読み切れず、最後の形から補う内容になった。',
      tags: ['control:UNAVAILABLE', `confidence:${snapshot.controlConfidence}`],
    };
  }

  const variantByPhase: Record<ControlPhaseCandidate, MaterialSpec> = {
    THRUST_BATTLE: snapshot.finishRoute === 'PUSH_OUT'
      ? snapshot.openingPhase === 'BELT_BATTLE'
        ? {
          variant: `release-to-press-${snapshot.controlConfidence}`,
          text: '差し手争いから離れ、押して前に出た。',
          tags: ['control:THRUST_BATTLE', `confidence:${snapshot.controlConfidence}`, 'opening:BELT_BATTLE', 'finish:PUSH_OUT'],
        }
        : {
          variant: `press-to-out-${snapshot.controlConfidence}`,
          text: '中盤も押す圧力を保ち、相手を下がらせた。',
          tags: ['control:THRUST_BATTLE', `confidence:${snapshot.controlConfidence}`, 'finish:PUSH_OUT'],
        }
      : {
        variant: `press-control-${snapshot.controlConfidence}`,
        text: '中盤は押しで主導権を握った。',
        tags: ['control:THRUST_BATTLE', `confidence:${snapshot.controlConfidence}`],
      },
    BELT_BATTLE: snapshot.finishRoute === 'BELT_FORCE'
      ? {
        variant: `belt-force-${snapshot.controlConfidence}`,
        text: '組み止めて腰を寄せ、寄りの形を作った。',
        tags: ['control:BELT_BATTLE', `confidence:${snapshot.controlConfidence}`, 'finish:BELT_FORCE'],
      }
      : {
        variant: `belt-control-${snapshot.controlConfidence}`,
        text: '中盤はまわしと差し手の主導権を争った。',
        tags: ['control:BELT_BATTLE', `confidence:${snapshot.controlConfidence}`],
      },
    TECHNIQUE_SCRAMBLE: snapshot.finishRoute === 'LEG_ATTACK'
      ? {
        variant: `low-attack-${snapshot.controlConfidence}`,
        text: '技の応酬から低い攻めへつなげた。',
        tags: ['control:TECHNIQUE_SCRAMBLE', `confidence:${snapshot.controlConfidence}`, 'finish:LEG_ATTACK'],
      }
      : {
        variant: `technique-convert-${snapshot.controlConfidence}`,
        text: '中盤は相手の動きに合わせ、技へ変えた。',
        tags: ['control:TECHNIQUE_SCRAMBLE', `confidence:${snapshot.controlConfidence}`],
      },
    EDGE_BATTLE: snapshot.finishRoute === 'EDGE_REVERSAL'
      ? {
        variant: `edge-reverse-${snapshot.controlConfidence}`,
        text: '土俵際で残し、反転の機を逃さなかった。',
        tags: ['control:EDGE_BATTLE', `confidence:${snapshot.controlConfidence}`, 'finish:EDGE_REVERSAL'],
      }
      : {
        variant: `edge-hold-${snapshot.controlConfidence}`,
        text: '土俵際で残しながら、押し返す余地を作った。',
        tags: ['control:EDGE_BATTLE', `confidence:${snapshot.controlConfidence}`],
      },
    QUICK_COLLAPSE: {
      variant: `collapse-catch-${snapshot.controlConfidence}`,
      text: '相手の崩れを見て、勝負を長引かせなかった。',
      tags: ['control:QUICK_COLLAPSE', `confidence:${snapshot.controlConfidence}`],
    },
    MIXED: {
      variant: `mixed-control-${snapshot.controlConfidence}`,
      text: '押し、組み、いなしが交じり、主導権は一方向に固まらなかった。',
      tags: ['control:MIXED', `confidence:${snapshot.controlConfidence}`],
    },
  };
  return variantByPhase[phase];
};

const transitionSpec = (snapshot: BoutFlowDiagnosticSnapshot): MaterialSpec => {
  const specs: Record<BoutFlowTransitionClassification, MaterialSpec> = {
    ALIGNED_FLOW: snapshot.finishRoute === 'BELT_FORCE'
      ? {
        variant: 'yotsu-aligned',
        text: '序盤の四つ相撲をそのまま寄りに結びつけた。',
        tags: ['transition:ALIGNED_FLOW', 'finish:BELT_FORCE'],
      }
      : {
        variant: 'aligned',
        text: '序盤の形を崩さず、流れのまま決めた。',
        tags: ['transition:ALIGNED_FLOW'],
      },
    CONTROL_SHIFT: {
      variant: `${snapshot.openingPhase.toLowerCase()}-to-${snapshot.controlPhaseCandidate ?? 'unknown'.toLowerCase()}`,
      text: snapshot.controlPhaseCandidate === 'THRUST_BATTLE'
        ? '序盤の形から押しに切り替えた。'
        : '序盤の形から主導権が移った。',
      tags: ['transition:CONTROL_SHIFT', `opening:${snapshot.openingPhase}`, `control:${snapshot.controlPhaseCandidate ?? 'UNAVAILABLE'}`],
    },
    TECHNIQUE_CONVERSION: snapshot.finishRoute === 'PULL_DOWN'
      ? {
        variant: 'pull-conversion',
        text: '前へ出る相手を見て、いなしから崩した。',
        tags: ['transition:TECHNIQUE_CONVERSION', 'finish:PULL_DOWN'],
      }
      : snapshot.finishRoute === 'LEG_ATTACK'
        ? {
          variant: 'leg-conversion',
          text: '技の流れから足元を攻めた。',
          tags: ['transition:TECHNIQUE_CONVERSION', 'finish:LEG_ATTACK'],
        }
        : snapshot.finishRoute === 'THROW_BREAK'
          ? {
            variant: 'throw-conversion',
            text: '体勢を見て投げに移った。',
            tags: ['transition:TECHNIQUE_CONVERSION', 'finish:THROW_BREAK'],
          }
          : {
            variant: 'waza-conversion',
            text: '途中で技に変え、相手の重心を外した。',
            tags: ['transition:TECHNIQUE_CONVERSION'],
          },
    EDGE_TURNAROUND: snapshot.finishRoute === 'EDGE_REVERSAL'
      ? {
        variant: 'edge-reversal',
        text: '土俵際で残し、反転して逆転した。',
        tags: ['transition:EDGE_TURNAROUND', 'finish:EDGE_REVERSAL'],
      }
      : {
        variant: 'edge-push-back',
        text: '土俵際の攻防から押し返し、流れを戻した。',
        tags: ['transition:EDGE_TURNAROUND'],
      },
    QUICK_FINISH: {
      variant: 'quick',
      text: '崩れを逃さず、短い手順で勝負をまとめた。',
      tags: ['transition:QUICK_FINISH'],
    },
    AMBIGUOUS_CONTROL: {
      variant: 'last-shape',
      text: '主導権の読みは割れるが、最後の形が勝敗を決めた。',
      tags: ['transition:AMBIGUOUS_CONTROL'],
    },
  };
  return specs[snapshot.transitionClassification];
};

const finishSpec = (snapshot: BoutFlowDiagnosticSnapshot): MaterialSpec => {
  switch (snapshot.finishRoute) {
    case 'PUSH_OUT':
      return snapshot.openingPhase === 'BELT_BATTLE'
        ? {
          variant: 'release-and-push',
          text: '最後は離れて押し、土俵外へ出した。',
          tags: ['finish:PUSH_OUT', 'opening:BELT_BATTLE'],
        }
        : {
          variant: snapshot.openingPhase === 'EDGE_BATTLE' ? 'edge-push-out' : 'front-push-out',
          text: snapshot.openingPhase === 'EDGE_BATTLE'
            ? '最後は土俵際から押し返して外へ運んだ。'
            : '最後は正面から押し切って土俵外へ出した。',
          tags: ['finish:PUSH_OUT', `opening:${snapshot.openingPhase}`],
        };
    case 'BELT_FORCE':
      return {
        variant: 'yori',
        text: '最後は体を寄せ、寄り切る形で決めた。',
        tags: ['finish:BELT_FORCE'],
      };
    case 'THROW_BREAK':
      return {
        variant: 'throw-axis',
        text: '最後は投げで相手の軸を崩した。',
        tags: ['finish:THROW_BREAK'],
      };
    case 'PULL_DOWN':
      return {
        variant: 'pull-down',
        text: '最後はいなしに乗せ、前のめりに崩した。',
        tags: ['finish:PULL_DOWN'],
      };
    case 'EDGE_REVERSAL':
      return {
        variant: 'edge-turn',
        text: '最後は土俵際で体を入れ替えた。',
        tags: ['finish:EDGE_REVERSAL'],
      };
    case 'REAR_FINISH':
      return {
        variant: 'behind',
        text: '最後は相手の後ろを取り、向きを制した。',
        tags: ['finish:REAR_FINISH'],
      };
    case 'LEG_ATTACK':
      return {
        variant: 'leg',
        text: '最後は足元を攻めて崩し切った。',
        tags: ['finish:LEG_ATTACK'],
      };
  }
};

const KIMARITE_FAMILY_TEXT: Record<string, string> = {
  PUSH_THRUST: '押し・突きの形で、前に出る圧力が決まり手に出た。',
  FORCE_OUT: '寄りの形で、密着して前へ運んだ。',
  THROW: '投げの形で、相手の重心を外した。',
  TWIST_DOWN: '落とし・捻りの形で、相手の前進を崩した。',
  TRIP_PICK: '足技の形で、足元から崩した。',
  BACKWARD_BODY_DROP: '反りの形で、特殊な体勢を勝ちにつなげた。',
  REAR: '送りの形で、相手の向きを制した。',
  NON_TECHNIQUE: '非技の結果で、崩れ方そのものが勝敗になった。',
};

const kimariteSpec = (snapshot: BoutFlowDiagnosticSnapshot): MaterialSpec => {
  const family = snapshot.kimarite.family ?? snapshot.kimarite.diagnosticFamily;
  const transitionVariant = snapshot.transitionClassification === 'CONTROL_SHIFT'
    ? 'after-shift'
    : snapshot.transitionClassification === 'EDGE_TURNAROUND'
      ? 'after-edge'
      : 'flow';
  return {
    variant: `${family}:${transitionVariant}`,
    text: `${snapshot.kimarite.name}。${textOf(family, KIMARITE_FAMILY_TEXT, '決まり手は流れ全体と合わせて読む必要がある。')}`,
    tags: [`kimarite:${snapshot.kimarite.name}`, `family:${family}`, `transition:${snapshot.transitionClassification}`],
  };
};

const FACTOR_LABELS: Record<string, string> = {
  'victory-factor:ability': '地力',
  'victory-factor:style': '取り口',
  'victory-factor:body': '体格',
  'victory-factor:form': '調子',
  'victory-factor:momentum': '流れ',
  'victory-factor:injury': '状態差',
  'victory-factor:pressure': '重圧対応',
  'victory-factor:kimarite-fit': '得意形',
  'victory-factor:phase-shape': '展開',
  'victory-factor:realism-compression': '番付上の地力',
};

const buildVictoryFactorLabels = (
  tags: readonly string[],
): readonly string[] =>
  unique(
    tags
      .filter((tag) => FACTOR_LABELS[tag])
      .map((tag) => FACTOR_LABELS[tag]),
  ).slice(0, 4);

const victorySpec = (
  tags: readonly string[],
  labels: readonly string[],
  outcome: BoutFlowCommentaryOutcome,
): MaterialSpec => ({
  variant: tags.slice(0, 3).join('+') || 'mixed',
  text: labels.length > 0
    ? `${outcome === 'WIN' ? '勝因' : '敗因'}は${labels.join('、')}。`
    : `${outcome === 'WIN' ? '勝因' : '敗因'}は展開全体に分散した。`,
  tags: [...tags, `outcome:${outcome}`],
});

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
  EARLY_BASHO: '序盤の白星で、場所の流れを作った。',
  MIDDLE_BASHO: '中盤の一番で、星勘定を整えた。',
  FINAL_BOUT: 'この場所最後の一番を白星で締めた。',
  KACHIKOSHI_DECIDER: '勝ち越しを決める白星になった。',
  MAKEKOSHI_DECIDER: '負け越しを避ける意味のある白星になった。',
  KACHI_MAKE_DECIDER: '勝ち越しと負け越しの境目で白星を挙げた。',
  YUSHO_DIRECT: '優勝争いを直接動かす白星になった。',
  YUSHO_CHASE: '優勝争いを追う立場で、落とせない一番を取った。',
  WIN_STREAK: '連勝を伸ばし、場所の勢いを保った。',
  LOSS_STREAK: '連敗を止め、流れを戻した。',
  RECOVERY_BOUT: '前の黒星から立て直す白星になった。',
  LEAD_PROTECTION: '白星先行を守る一番になった。',
};

const HOSHITORI_LOSS_TEXT: Record<HoshitoriContextTag, string> = {
  EARLY_BASHO: '序盤の黒星で、場所の立て直しが必要になった。',
  MIDDLE_BASHO: '中盤の一番を落とし、星勘定が重くなった。',
  FINAL_BOUT: 'この場所最後の一番を黒星で終えた。',
  KACHIKOSHI_DECIDER: '勝ち越しを決めきれない黒星になった。',
  MAKEKOSHI_DECIDER: '負け越しが決まる黒星になった。',
  KACHI_MAKE_DECIDER: '勝ち越しと負け越しの境目で黒星を喫した。',
  YUSHO_DIRECT: '優勝争いを直接左右する痛い黒星になった。',
  YUSHO_CHASE: '優勝争いを追う立場で、落とせない一番を落とした。',
  WIN_STREAK: '連勝が止まり、場所の勢いに区切りがついた。',
  LOSS_STREAK: '連敗が続き、流れを戻せなかった。',
  RECOVERY_BOUT: '前の黒星から立て直せず、連敗となった。',
  LEAD_PROTECTION: '白星先行を守りきれない一番になった。',
};

const hoshitoriSpec = (tag: HoshitoriContextTag, outcome: BoutFlowCommentaryOutcome): MaterialSpec => ({
  variant: tag,
  text: outcome === 'WIN' ? HOSHITORI_TEXT[tag] : HOSHITORI_LOSS_TEXT[tag],
  tags: [`hoshitori:${tag}`, `outcome:${outcome}`],
});

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
  PROMOTION_RELEVANT: '昇進へ向けて材料となる白星。',
  DEMOTION_RELEVANT: '番付降下の圧力を和らげる白星。',
  SAN_YAKU_PRESSURE: '三役以上の地位で内容も問われる白星。',
  SEKITORI_BOUNDARY: '関取境界で重みのある白星。',
  MAKUUCHI_BOUNDARY: '幕内境界で地位を左右する白星。',
  KINBOSHI_CHANCE: '格上相手に価値のある白星。',
  RANK_GAP_UPSET: '番付差を覆す印象の強い白星。',
  RANK_EXPECTED_WIN: '番付上、取りこぼせない一番を取った。',
};

const BANZUKE_LOSS_TEXT: Record<BanzukeContextTag, string> = {
  PROMOTION_RELEVANT: '昇進へ向けて痛い黒星。',
  DEMOTION_RELEVANT: '番付降下の圧力が増す黒星。',
  SAN_YAKU_PRESSURE: '三役以上の地位で内容も問われる黒星。',
  SEKITORI_BOUNDARY: '関取境界で重みのある黒星。',
  MAKUUCHI_BOUNDARY: '幕内境界で地位を左右する黒星。',
  KINBOSHI_CHANCE: '格上相手に及ばない一番になった。',
  RANK_GAP_UPSET: '番付差を生かせず、印象の残る黒星。',
  RANK_EXPECTED_WIN: '番付上、落としたくない一番を落とした。',
};

const banzukeSpec = (tag: BanzukeContextTag, outcome: BoutFlowCommentaryOutcome): MaterialSpec => ({
  variant: tag,
  text: outcome === 'WIN' ? BANZUKE_TEXT[tag] : BANZUKE_LOSS_TEXT[tag],
  tags: [`banzuke:${tag}`, `outcome:${outcome}`],
});

const shortOpeningClause = (snapshot: BoutFlowDiagnosticSnapshot): string => {
  switch (snapshot.openingPhase) {
    case 'THRUST_BATTLE':
      return '立合いから押し';
    case 'BELT_BATTLE':
      return snapshot.controlPhaseCandidate === 'THRUST_BATTLE'
        ? '差し手争いから離れ'
        : '四つの攻防から組み止め';
    case 'TECHNIQUE_SCRAMBLE':
      return '相手の出方を見て';
    case 'EDGE_BATTLE':
      return '土俵際で残し';
    case 'QUICK_COLLAPSE':
      return '立合い直後の崩れを逃さず';
    case 'MIXED':
      return '押し、組み、いなしが交じる中で';
  }
};

const shortControlClause = (snapshot: BoutFlowDiagnosticSnapshot): string => {
  switch (snapshot.controlPhaseCandidate) {
    case 'THRUST_BATTLE':
      return snapshot.openingPhase === 'BELT_BATTLE'
        ? '押して'
        : '前に出て';
    case 'BELT_BATTLE':
      return snapshot.openingPhase === 'BELT_BATTLE' ? '' : '組み止めて';
    case 'TECHNIQUE_SCRAMBLE':
      return '動きに合わせ';
    case 'EDGE_BATTLE':
      return snapshot.openingPhase === 'EDGE_BATTLE' ? '' : '体を残し';
    case 'QUICK_COLLAPSE':
      return '';
    case 'MIXED':
      return '形を探り';
    case undefined:
      return '';
  }
};

const shortFinishClause = (snapshot: BoutFlowDiagnosticSnapshot): string => {
  switch (snapshot.finishRoute) {
    case 'PUSH_OUT':
      return '土俵外へ出した';
    case 'BELT_FORCE':
      return '寄り切った';
    case 'THROW_BREAK':
      return '投げで崩した';
    case 'PULL_DOWN':
      return snapshot.openingPhase === 'QUICK_COLLAPSE'
        ? '前に落とした'
        : 'いなしで前に落とした';
    case 'EDGE_REVERSAL':
      return '体を入れ替えた';
    case 'REAR_FINISH':
      return '後ろを取って決めた';
    case 'LEG_ATTACK':
      return '足元から崩した';
  }
};

const createShortCommentary = (
  snapshot: BoutFlowDiagnosticSnapshot,
  hoshitori: BoutFlowCommentaryMaterial,
  banzuke: BoutFlowCommentaryMaterial,
): string => {
  const flowText = [
    shortOpeningClause(snapshot),
    shortControlClause(snapshot),
    shortFinishClause(snapshot),
  ].filter((text) => text.length > 0).join('、');

  return `${snapshot.kimarite.name}。${flowText}。${hoshitori.text}${banzuke.text}`;
};

export const createBoutFlowCommentaryDiagnostic = (
  snapshot: BoutFlowDiagnosticSnapshot,
  outcome: BoutFlowCommentaryOutcome = 'WIN',
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
  const victoryFactorLabels = buildVictoryFactorLabels(snapshot.victoryFactorTags);

  const opening = createMaterial('OPENING', 'OPENING', `opening:${snapshot.openingPhase}`, openingSpec(snapshot));
  const control = createMaterial(
    'CONTROL',
    'CONTROL',
    `control:${snapshot.controlPhaseCandidate ?? 'UNAVAILABLE'}:${snapshot.controlConfidence}`,
    controlSpec(snapshot),
  );
  const transition = createMaterial(
    'TRANSITION',
    'TRANSITION',
    `transition:${snapshot.transitionClassification}`,
    transitionSpec(snapshot),
  );
  const finish = createMaterial('FINISH_ROUTE', 'FINISH', `finish:${snapshot.finishRoute}`, finishSpec(snapshot));
  const kimarite = createMaterial(
    'KIMARITE',
    'KIMARITE',
    `kimarite:${snapshot.kimarite.name}`,
    kimariteSpec(snapshot),
  );
  const victory = createMaterial(
    'VICTORY_FACTOR',
    'VICTORY_FACTOR',
    'victory',
    victorySpec(snapshot.victoryFactorTags, victoryFactorLabels, outcome),
  );
  const hoshitori = createMaterial(
    'HOSHITORI_CONTEXT',
    'HOSHITORI',
    'hoshitori',
    hoshitoriSpec(hoshitoriTag, outcome),
  );
  const banzuke = createMaterial(
    'BANZUKE_CONTEXT',
    'BANZUKE',
    'banzuke',
    banzukeSpec(banzukeTag, outcome),
  );
  const materials = [
    opening,
    control,
    transition,
    finish,
    kimarite,
    victory,
    hoshitori,
    banzuke,
  ] as const;

  const flowExplanation = [
    `${opening.text}${control.text}`,
    `${transition.text}${finish.text}${kimarite.text}`,
    `${victory.text}${hoshitori.text}${banzuke.text}`,
  ];
  const shortCommentary = createShortCommentary(snapshot, hoshitori, banzuke);

  return {
    generated: true,
    reasonTags: ['bout-flow-commentary:generated'],
    commentary: {
      version: 'BOUT_FLOW_COMMENTARY_RUNTIME_V1',
      kimarite: snapshot.kimarite.name,
      outcome,
      shortCommentary,
      victoryFactorLabels,
      flowExplanation,
      materialKeys: materials.map((material) => material.key),
      materials,
    },
  };
};
