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
import {
  resolveCommentaryKimariteSubfamily,
  type CommentaryKimariteSubfamily,
  type CommentaryKimariteSubfamilyResolution,
} from './kimariteCommentarySubfamily';

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

const deterministicIndex = (
  parts: readonly string[],
  length: number,
): number => {
  if (length <= 1) return 0;
  let hash = 2166136261;
  for (const part of parts) {
    for (let index = 0; index < part.length; index += 1) {
      hash ^= part.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return Math.abs(hash) % length;
};

const selectVariant = (
  variants: readonly string[],
  parts: readonly string[],
): string => variants[deterministicIndex(parts, variants.length)] ?? variants[0] ?? '';

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
        text: '立合い直後に姿勢が乱れ、短い相撲になった。',
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
      text: '相手の乱れを見て、勝負を長引かせなかった。',
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
      text: '乱れを逃さず、短い手順で勝負をまとめた。',
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
        text: '最後は投げで相手の軸を外した。',
        tags: ['finish:THROW_BREAK'],
      };
    case 'PULL_DOWN':
      return {
        variant: 'pull-down',
        text: '最後はいなしに乗せ、前のめりに落とした。',
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
        text: '最後は足元を攻めて踏ん張りを奪った。',
        tags: ['finish:LEG_ATTACK'],
      };
  }
};

const KIMARITE_SUBFAMILY_TEXT: Record<CommentaryKimariteSubfamily, Record<BoutFlowCommentaryOutcome, string>> = {
  PUSH_OUT: {
    WIN: '押しの圧力を保ち、正面から外へ運んだ。',
    LOSS: '押しの圧力を受け、正面から外へ運ばれた。',
  },
  THRUST_OUT: {
    WIN: '突き放して距離を作り、相手を土俵外へ出した。',
    LOSS: '突き放されて距離を詰められず、土俵外へ出された。',
  },
  PUSH_DOWN: {
    WIN: '押す力で上体を崩し、前へ倒した。',
    LOSS: '押す力を受けて上体が浮き、前へ倒された。',
  },
  THRUST_DOWN: {
    WIN: '突きの圧力で姿勢を崩し、倒す形にした。',
    LOSS: '突きの圧力で姿勢を崩され、倒れる形になった。',
  },
  PUSH_BREAK: {
    WIN: '押しの流れから崩し、最後の形をまとめた。',
    LOSS: '押しの流れで崩され、最後まで体勢を戻せなかった。',
  },
  YORI_OUT: {
    WIN: '胸を合わせて前へ出て、寄りの形で外へ運んだ。',
    LOSS: '胸を合わせたところで前へ出られ、寄りの形で外へ運ばれた。',
  },
  YORI_DOWN: {
    WIN: '寄る圧力で体勢を崩し、倒す形まで持ち込んだ。',
    LOSS: '寄る圧力で体勢を崩され、倒れる形まで持ち込まれた。',
  },
  ABISE_DOWN: {
    WIN: '体重を浴びせて圧力をかけ、上から崩した。',
    LOSS: '体重を浴びせられて圧力を受け、上から崩された。',
  },
  KIME_FORCE: {
    WIN: '相手の腕を極め、動きを止めて前へ出た。',
    LOSS: '腕を極められて動きを止められ、前へ出られた。',
  },
  LIFT_FORCE: {
    WIN: '密着した形から相手を浮かせ、土俵外へ運んだ。',
    LOSS: '密着した形で浮かされ、土俵外へ運ばれた。',
  },
  EDGE_FORCE: {
    WIN: '土俵際の寄り合いで体を預け、外へ詰めた。',
    LOSS: '土俵際の寄り合いで体を預けられ、外へ詰められた。',
  },
  BELT_THROW: {
    WIN: 'まわしを引きつけ、体を開いて相手の重心を外した。',
    LOSS: 'まわしを引きつけられ、体を開かれて重心を外された。',
  },
  ARM_THROW: {
    WIN: '腕を抱える形で振り、相手の上体を泳がせた。',
    LOSS: '腕を抱えられて振られ、上体が泳いだ。',
  },
  SCOOP_THROW: {
    WIN: '差し手からすくい、相手の体を横へ流した。',
    LOSS: '差し手からすくわれ、体を横へ流された。',
  },
  EDGE_REVERSAL_THROW: {
    WIN: '土俵際で残し、投げで流れを返した。',
    LOSS: '土俵際で残され、投げで流れを返された。',
  },
  BODY_BREAK_THROW: {
    WIN: '乱れた体勢を投げに変え、相手の軸を外した。',
    LOSS: '乱れた体勢を投げに変えられ、軸を外された。',
  },
  TSUKIOTOSHI: {
    WIN: '相手の前進を横から突き、土俵へ落とした。',
    LOSS: '前へ出たところを横から突かれ、土俵へ落ちた。',
  },
  HATAKIKOMI: {
    WIN: '前に出る相手をはたき、手をつかせる形にした。',
    LOSS: '前に出たところをはたかれ、手をつく形になった。',
  },
  HIKIOTOSHI: {
    WIN: '引く動きで相手を呼び込み、前へ落とした。',
    LOSS: '引く動きに呼び込まれ、前へ落ちた。',
  },
  MAKIOTOSHI: {
    WIN: '巻き込む形で相手の向きをずらし、下へ落とした。',
    LOSS: '巻き込まれて向きをずらされ、下へ落とされた。',
  },
  TWIST_BREAK: {
    WIN: '捻る形で相手の重心をずらし、土俵へ向かわせた。',
    LOSS: '捻る形で重心をずらされ、土俵へ向かわされた。',
  },
  PULL_BREAK: {
    WIN: 'いなしと引きで相手の前進を空転させた。',
    LOSS: 'いなしと引きで前進が空転した。',
  },
  EDGE_TWIST: {
    WIN: '土俵際の捻り合いで向きを変え、相手を外へ向かわせた。',
    LOSS: '土俵際の捻り合いで向きを変えられ、外へ向かされた。',
  },
  LEG_TWIST: {
    WIN: '足元と上体の動きを合わせ、相手の軸をずらした。',
    LOSS: '足元と上体を合わせて攻められ、軸をずらされた。',
  },
  LEG_PICK: {
    WIN: '足を取り、低い攻めから相手の出足を止めた。',
    LOSS: '足を取られ、低い攻めで出足を止められた。',
  },
  OUTER_TRIP: {
    WIN: '外から足を掛け、相手の踏ん張りを外した。',
    LOSS: '外から足を掛けられ、踏ん張りを外された。',
  },
  INNER_TRIP: {
    WIN: '内から足を掛け、相手の重心を内側へ寄せた。',
    LOSS: '内から足を掛けられ、重心を内側へ寄せられた。',
  },
  KICK_TRIP: {
    WIN: '蹴る足技で相手の足元を払い、体勢を乱した。',
    LOSS: '蹴る足技で足元を払われ、体勢を乱した。',
  },
  HOOK_THROW: {
    WIN: '足を掛けた投げで、相手の体を横へ振った。',
    LOSS: '足を掛けた投げで、体を横へ振られた。',
  },
  LEG_BREAK: {
    WIN: '足元への攻めを重ね、相手の踏ん張りを奪った。',
    LOSS: '足元への攻めを重ねられ、踏ん張りを失った。',
  },
  SORITECH: {
    WIN: '反る体勢で相手を崩し、大きな技に結びつけた。',
    LOSS: '反る体勢で崩され、大きな技に持ち込まれた。',
  },
  SUTEMI: {
    WIN: '捨て身気味の体勢から、相手の重心を返した。',
    LOSS: '捨て身気味の体勢から、重心を返された。',
  },
  BIG_ARCH: {
    WIN: '反り技の大きな動きで、勝負の向きを変えた。',
    LOSS: '反り技の大きな動きで、勝負の向きを変えられた。',
  },
  REAR_PUSH_OUT: {
    WIN: '後ろを取り、相手の向きを制して外へ送った。',
    LOSS: '後ろを取られ、向きを制されて外へ送られた。',
  },
  REAR_DOWN: {
    WIN: '背後から体勢を崩し、倒す形で決めた。',
    LOSS: '背後から体勢を崩され、倒れる形で決まった。',
  },
  REAR_GRIP: {
    WIN: '相手の後ろに回り、動きを止めて勝負をまとめた。',
    LOSS: '後ろに回られて動きを止められ、勝負をまとめられた。',
  },
  REAR_BREAK: {
    WIN: '背後を取った流れで向きを制し、最後の形につなげた。',
    LOSS: '背後を取られた流れで向きを制され、最後の形につなげられた。',
  },
  REAR_LIFT: {
    WIN: '後ろから浮かせる形で、相手を土俵外へ運んだ。',
    LOSS: '後ろから浮かされる形で、土俵外へ運ばれた。',
  },
  ISAMIASHI: {
    WIN: '相手が先に踏み出し、記録上は非技の白星になった。',
    LOSS: '先に踏み出し、記録上は非技の黒星になった。',
  },
  KOSHIKUDAKE: {
    WIN: '相手が腰から落ち、攻防の途中で勝負が決まった。',
    LOSS: '腰から落ち、攻防の途中で勝負が決まった。',
  },
  TOUCH_DOWN: {
    WIN: '相手の手や膝が先につき、土俵上の結果が先に出た。',
    LOSS: '手や膝が先につき、土俵上の結果が先に出た。',
  },
  STEP_OUT: {
    WIN: '相手が先に土俵外へ出て、勝負はそこで決まった。',
    LOSS: '先に土俵外へ出て、勝負はそこで決まった。',
  },
  FOUL: {
    WIN: '反則による結果で、勝敗だけが記録に残った。',
    LOSS: '反則による結果で、黒星だけが記録に残った。',
  },
  FUSEN: {
    WIN: '不戦の結果で、取組内容は記録されない白星になった。',
    LOSS: '不戦の結果で、取組内容は記録されない黒星になった。',
  },
  GENERIC: {
    WIN: '細部の型は限定せず、最後の形で勝敗がまとまった。',
    LOSS: '細部の型は限定せず、最後の形で後手に回った。',
  },
};

const resolveKimariteSubfamily = (
  snapshot: BoutFlowDiagnosticSnapshot,
): CommentaryKimariteSubfamilyResolution =>
  resolveCommentaryKimariteSubfamily({
    name: snapshot.kimarite.name,
    family: snapshot.kimarite.family,
    diagnosticFamily: snapshot.kimarite.diagnosticFamily,
    pattern: snapshot.kimaritePattern,
    finishRoute: snapshot.finishRoute,
    transitionClassification: snapshot.transitionClassification,
  });

const kimariteSpec = (
  snapshot: BoutFlowDiagnosticSnapshot,
  outcome: BoutFlowCommentaryOutcome,
  resolution: CommentaryKimariteSubfamilyResolution,
): MaterialSpec => {
  const transitionVariant = snapshot.transitionClassification === 'CONTROL_SHIFT'
    ? 'after-shift'
    : snapshot.transitionClassification === 'EDGE_TURNAROUND'
      ? 'after-edge'
      : 'flow';
  return {
    variant: `${resolution.family}:${resolution.subfamily}:${transitionVariant}:${outcome.toLowerCase()}`,
    text: `${snapshot.kimarite.name}。${KIMARITE_SUBFAMILY_TEXT[resolution.subfamily][outcome]}`,
    tags: [
      `kimarite:${snapshot.kimarite.name}`,
      `family:${resolution.family}`,
      `subfamily:${resolution.subfamily}`,
      `subfamily-source:${resolution.source}`,
      `transition:${snapshot.transitionClassification}`,
      `outcome:${outcome}`,
      ...resolution.reasonTags,
    ],
  };
};

const FACTOR_LABELS: Record<string, string> = {
  'victory-factor:ability': '地力',
  'victory-factor:style': '相撲の形',
  'victory-factor:body': '当たりの強さ',
  'victory-factor:form': '当日の動き',
  'victory-factor:momentum': '場所の流れ',
  'victory-factor:injury': '状態',
  'victory-factor:pressure': '勝負所',
  'victory-factor:kimarite-fit': '決め手',
  'victory-factor:phase-shape': '立合い',
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
    ? `${outcome === 'WIN' ? '勝因' : '敗因'}は${labels.join('、')}に出た。`
    : `${outcome === 'WIN' ? '勝因' : '敗因'}は最後の形に集約された。`,
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
  EARLY_BASHO: '序盤の白星で、場所の入りを整えた。',
  MIDDLE_BASHO: '中盤の一番を取り、星勘定を崩さなかった。',
  FINAL_BOUT: '場所最後の一番を白星で締めた。',
  KACHIKOSHI_DECIDER: '勝ち越しを決める白星になった。',
  MAKEKOSHI_DECIDER: '負け越しを避け、踏みとどまる白星になった。',
  KACHI_MAKE_DECIDER: '勝ち越しと負け越しの境目で白星を挙げた。',
  YUSHO_DIRECT: '優勝争いを直接動かす白星になった。',
  YUSHO_CHASE: '優勝争いを追う立場で、落とせない一番を取った。',
  WIN_STREAK: '連勝を伸ばし、場所の勢いを保った。',
  LOSS_STREAK: '連敗を止め、流れを戻した。',
  RECOVERY_BOUT: '前の黒星から立て直す白星になった。',
  LEAD_PROTECTION: '白星先行を守る一番になった。',
};

const HOSHITORI_LOSS_TEXT: Record<HoshitoriContextTag, string> = {
  EARLY_BASHO: '序盤の黒星で、早い立て直しが必要になった。',
  MIDDLE_BASHO: '中盤の一番を落とし、星勘定が重くなった。',
  FINAL_BOUT: '場所最後の一番を黒星で終えた。',
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

const hoshitoriLead = (
  snapshot: BoutFlowDiagnosticSnapshot,
  outcome: BoutFlowCommentaryOutcome,
): string => {
  if (snapshot.finishRoute === 'PUSH_OUT') return outcome === 'WIN' ? '押し相撲で' : '押し込まれて';
  if (snapshot.finishRoute === 'BELT_FORCE') return outcome === 'WIN' ? '四つに組んで' : '組み止められて';
  if (snapshot.finishRoute === 'THROW_BREAK') return outcome === 'WIN' ? '投げで崩し' : '投げで崩され';
  if (snapshot.finishRoute === 'PULL_DOWN') return outcome === 'WIN' ? 'いなしで崩し' : 'いなしに崩され';
  if (snapshot.finishRoute === 'EDGE_REVERSAL') return outcome === 'WIN' ? '土俵際で残し' : '土俵際で逆転を許し';
  if (snapshot.finishRoute === 'REAR_FINISH') return outcome === 'WIN' ? '後ろを取り' : '後ろを取られ';
  return outcome === 'WIN' ? '足元を攻め' : '足元を攻められ';
};

const banzukeLead = (
  snapshot: BoutFlowDiagnosticSnapshot,
  outcome: BoutFlowCommentaryOutcome,
): string => {
  if (snapshot.openingPhase === 'EDGE_BATTLE') return outcome === 'WIN' ? '土俵際をしのぎ、' : '土俵際で後手となり、';
  if (snapshot.openingPhase === 'BELT_BATTLE') return outcome === 'WIN' ? '組み合いを制し、' : '組み合いで主導権を渡し、';
  if (snapshot.openingPhase === 'TECHNIQUE_SCRAMBLE') return outcome === 'WIN' ? '技の流れをつかみ、' : '技の流れで崩され、';
  if (snapshot.openingPhase === 'QUICK_COLLAPSE') return outcome === 'WIN' ? '短い相撲をものにし、' : '早い崩れを止められず、';
  if (snapshot.openingPhase === 'MIXED') return outcome === 'WIN' ? '攻防が移る中で取り切り、' : '攻防が移る中で取り切れず、';
  return outcome === 'WIN' ? '前に出る内容で、' : '前に出られ、';
};

const hoshitoriSpec = (
  tag: HoshitoriContextTag,
  outcome: BoutFlowCommentaryOutcome,
  snapshot: BoutFlowDiagnosticSnapshot,
): MaterialSpec => ({
  variant: `${tag}:${outcome}:${snapshot.finishRoute}`,
  text: `${hoshitoriLead(snapshot, outcome)}${outcome === 'WIN' ? HOSHITORI_TEXT[tag] : HOSHITORI_LOSS_TEXT[tag]}`,
  tags: [`hoshitori:${tag}`, `outcome:${outcome}`, `finish:${snapshot.finishRoute}`],
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
  RANK_EXPECTED_WIN: '番付上の特別な条件は薄く、星取を一つ進めた。',
};

const BANZUKE_LOSS_TEXT: Record<BanzukeContextTag, string> = {
  PROMOTION_RELEVANT: '昇進へ向けて痛い黒星。',
  DEMOTION_RELEVANT: '番付降下の圧力が増す黒星。',
  SAN_YAKU_PRESSURE: '三役以上の地位で内容も問われる黒星。',
  SEKITORI_BOUNDARY: '関取境界で重みのある黒星。',
  MAKUUCHI_BOUNDARY: '幕内境界で地位を左右する黒星。',
  KINBOSHI_CHANCE: '格上相手に及ばない一番になった。',
  RANK_GAP_UPSET: '番付差を生かせず、印象の残る黒星。',
  RANK_EXPECTED_WIN: '番付上の特別な条件は薄く、星取に黒星が残った。',
};

const banzukeSpec = (
  tag: BanzukeContextTag,
  outcome: BoutFlowCommentaryOutcome,
  snapshot: BoutFlowDiagnosticSnapshot,
): MaterialSpec => ({
  variant: `${tag}:${outcome}:${snapshot.openingPhase}`,
  text: `${banzukeLead(snapshot, outcome)}${outcome === 'WIN' ? BANZUKE_TEXT[tag] : BANZUKE_LOSS_TEXT[tag]}`,
  tags: [`banzuke:${tag}`, `outcome:${outcome}`, `opening:${snapshot.openingPhase}`],
});

const SHORT_HOSHITORI_TEXT: Record<BoutFlowCommentaryOutcome, Record<HoshitoriContextTag, readonly string[]>> = {
  WIN: {
    EARLY_BASHO: ['序盤の流れを作り', '場所の入りを整え', '序盤で星を先に積み'],
    MIDDLE_BASHO: ['中盤の星勘定を整え', '中日の前後で流れを保ち', '中盤の一番を取り切り'],
    FINAL_BOUT: ['場所を白星で締め', '最後の一番を取り切り', '千秋楽相当の一番をまとめ'],
    KACHIKOSHI_DECIDER: ['勝ち越しを決め', '勝ち越しの線を越え', '白星先行を確定させ'],
    MAKEKOSHI_DECIDER: ['負け越しを避け', '土俵際の星勘定で踏みとどまり', '負け越し回避へつなげ'],
    KACHI_MAKE_DECIDER: ['勝ち越しと負け越しの境目を制し', '星勘定の分かれ目を取り', '勝敗の節目で踏み込み'],
    YUSHO_DIRECT: ['優勝争いを直接動かし', '賜杯争いの流れを動かし', '優勝線上の一番を取ったうえで'],
    YUSHO_CHASE: ['優勝争いで落とせない一番を取り', '追う立場で星を落とさず', '優勝争いに残る星を拾い'],
    WIN_STREAK: ['連勝を伸ばし', '白星の流れを続け', '場所の勢いを保ち'],
    LOSS_STREAK: ['連敗を止め', '悪い流れを切り', '黒星続きから戻し'],
    RECOVERY_BOUT: ['前の黒星から立て直し', '前日の負けを引きずらず', '立て直しの白星として'],
    LEAD_PROTECTION: ['白星先行を守り', '勝ち越し側の流れを保ち', '星の余裕を残し'],
  },
  LOSS: {
    EARLY_BASHO: ['序盤で立て直しを迫られ', '場所の入りでつまずき', '序盤の星勘定を重くし'],
    MIDDLE_BASHO: ['中盤の星勘定を重くし', '中盤で流れを止められ', '星を伸ばしたい場面で落とし'],
    FINAL_BOUT: ['場所を黒星で終え', '最後の一番を落とし', '締めの一番を取り切れず'],
    KACHIKOSHI_DECIDER: ['勝ち越しを決めきれず', '勝ち越し目前で足踏みし', '白星先行を確定できず'],
    MAKEKOSHI_DECIDER: ['負け越しが決まり', '踏みとどまれず負け越しとなり', '星勘定の土俵際で落とし'],
    KACHI_MAKE_DECIDER: ['勝ち越しと負け越しの境目で落とし', '星勘定の分かれ目を落とし', '節目の一番を取り切れず'],
    YUSHO_DIRECT: ['優勝争いを左右する一番を落とし', '賜杯争いの流れから後退し', '優勝線上の一番を失い'],
    YUSHO_CHASE: ['優勝争いで落とせない一番を落とし', '追う立場で星を落とし', '優勝争いに残る星を失い'],
    WIN_STREAK: ['連勝が止まり', '白星の流れを止められ', '場所の勢いに区切りがつき'],
    LOSS_STREAK: ['連敗を止められず', '悪い流れを切れず', '黒星続きから戻せず'],
    RECOVERY_BOUT: ['前の黒星から立て直せず', '連敗を避けたい場面で落とし', '立て直しの一番を逃し'],
    LEAD_PROTECTION: ['白星先行を守れず', '星の余裕を削られ', '勝ち越し側の流れを保てず'],
  },
};

const SHORT_BANZUKE_TEXT: Record<BoutFlowCommentaryOutcome, Record<BanzukeContextTag, readonly string[]>> = {
  WIN: {
    PROMOTION_RELEVANT: ['昇進へ向けても材料を残した', '上を狙う足場を固めた', '番付を上げる材料を積んだ'],
    DEMOTION_RELEVANT: ['番付降下の圧力を和らげた', '地位を守る一番にした', '下への圧力を押し返した'],
    SAN_YAKU_PRESSURE: ['地位に見合う内容を示した', '上位の地位で求められる星を挙げた', '役力士としての責任を果たした'],
    SEKITORI_BOUNDARY: ['関取境界で重みのある白星にした', '十両境界で価値のある星を取った', '関取圏の評価につながる一番にした'],
    MAKUUCHI_BOUNDARY: ['幕内境界で地位を支える白星にした', '幕内の地位を支える材料を残した', '上位在位へつながる星を取った'],
    KINBOSHI_CHANCE: ['格上相手に価値を出した', '相手の地位を考えても大きい星にした', '番付差を越える内容を残した'],
    RANK_GAP_UPSET: ['番付差を覆す印象を残した', '下位側から存在感を示した', '番付差以上の内容を見せた'],
    RANK_EXPECTED_WIN: ['星取を一つ進めた', '白星を一つ積んだ', '場所成績を一つ前へ進めた'],
  },
  LOSS: {
    PROMOTION_RELEVANT: ['昇進へ向けて痛い黒星となった', '上を狙う流れに待ったがかかった', '番付を上げる材料を積み損ねた'],
    DEMOTION_RELEVANT: ['番付降下の圧力を強めた', '地位を守るうえで痛い星になった', '下への圧力を受ける結果になった'],
    SAN_YAKU_PRESSURE: ['地位に見合う内容を残せなかった', '上位の地位で求められる星を逃した', '役力士として苦しい内容になった'],
    SEKITORI_BOUNDARY: ['関取境界で重い黒星となった', '十両境界で痛い星を残した', '関取圏の評価に響く一番になった'],
    MAKUUCHI_BOUNDARY: ['幕内境界で地位を揺らす黒星となった', '幕内の地位を支える材料を逃した', '上位在位へ重い星になった'],
    KINBOSHI_CHANCE: ['格上相手に及ばなかった', '相手の地位を崩すところまでは届かなかった', '番付差を越える内容には至らなかった'],
    RANK_GAP_UPSET: ['番付差を生かしきれなかった', '上位側として印象を落とした', '番付差を結果に結びつけられなかった'],
    RANK_EXPECTED_WIN: ['星取に黒星が残った', '黒星を一つ増やした', '場所成績を伸ばせなかった'],
  },
};

const variantParts = (
  snapshot: BoutFlowDiagnosticSnapshot,
  outcome: BoutFlowCommentaryOutcome,
  segment: string,
): readonly string[] => [
  segment,
  outcome,
  snapshot.openingPhase,
  snapshot.controlPhaseCandidate ?? 'UNAVAILABLE',
  snapshot.transitionClassification,
  snapshot.finishRoute,
  snapshot.kimarite.name,
  snapshot.kimarite.family ?? snapshot.kimarite.diagnosticFamily,
  snapshot.hoshitoriContextTags.join('|'),
  snapshot.banzukeContextTags.join('|'),
];

const SHORT_SUBFAMILY_FINISH_TEXT: Record<CommentaryKimariteSubfamily, Record<BoutFlowCommentaryOutcome, readonly string[]>> = {
  PUSH_OUT: {
    WIN: ['押し出す形で決めた', '正面から外へ運んだ'],
    LOSS: ['押し出される形で決まった', '正面から外へ運ばれた'],
  },
  THRUST_OUT: {
    WIN: ['突き放して外へ出した', '突きで距離を作って決めた'],
    LOSS: ['突き放されて外へ出された', '突きで距離を作られた'],
  },
  PUSH_DOWN: {
    WIN: ['押して上体を倒した', '押す圧力で崩した'],
    LOSS: ['押されて上体を倒された', '押す圧力で崩された'],
  },
  THRUST_DOWN: {
    WIN: ['突きで体勢を倒した', '突きの圧力で崩した'],
    LOSS: ['突きで体勢を倒された', '突きの圧力で崩された'],
  },
  PUSH_BREAK: {
    WIN: ['押しの流れで崩した', '前へ出る圧力でまとめた'],
    LOSS: ['押しの流れで崩された', '前へ出る圧力を受けた'],
  },
  YORI_OUT: {
    WIN: ['寄り切った', '胸を合わせて前へ出た'],
    LOSS: ['寄り切られた', '胸を合わせられて前へ出られた'],
  },
  YORI_DOWN: {
    WIN: ['寄り倒す形で決めた', '寄る圧力で倒した'],
    LOSS: ['寄り倒される形で決まった', '寄る圧力で倒された'],
  },
  ABISE_DOWN: {
    WIN: ['浴びせる圧力で崩した', '体重を預けて倒した'],
    LOSS: ['浴びせる圧力で崩された', '体重を預けられて倒された'],
  },
  KIME_FORCE: {
    WIN: ['腕を極めて前へ出た', '相手の動きを止めて出た'],
    LOSS: ['腕を極められて前へ出られた', '動きを止められて出られた'],
  },
  LIFT_FORCE: {
    WIN: ['相手を浮かせて運んだ', '吊る形で外へ出した'],
    LOSS: ['浮かされて運ばれた', '吊る形で外へ出された'],
  },
  EDGE_FORCE: {
    WIN: ['際の寄り合いで出た', '土俵際から寄りを残した'],
    LOSS: ['際の寄り合いで出られた', '土俵際から寄り切られた'],
  },
  BELT_THROW: {
    WIN: ['まわしから投げた', 'まわしを引いて体を開いた'],
    LOSS: ['まわしから投げられた', 'まわしを引かれて体を開かれた'],
  },
  ARM_THROW: {
    WIN: ['腕を抱えて投げた', '腕を使って振った'],
    LOSS: ['腕を抱えられて投げられた', '腕を使って振られた'],
  },
  SCOOP_THROW: {
    WIN: ['差し手からすくった', 'すくい上げて横へ流した'],
    LOSS: ['差し手からすくわれた', 'すくい上げられて横へ流された'],
  },
  EDGE_REVERSAL_THROW: {
    WIN: ['際で投げ返した', '土俵際から投げに転じた'],
    LOSS: ['際で投げ返された', '土俵際から投げに転じられた'],
  },
  BODY_BREAK_THROW: {
    WIN: ['乱れた体勢から投げた', '相手の軸を外した'],
    LOSS: ['体勢の乱れを投げにされた', '軸を外された'],
  },
  TSUKIOTOSHI: {
    WIN: ['横から落とした', '前進を突いて落とした'],
    LOSS: ['横から落とされた', '前進を突かれて落ちた'],
  },
  HATAKIKOMI: {
    WIN: ['はたいて前に落とした', '前へ出る相手を落とした'],
    LOSS: ['はたかれて前に落ちた', '前へ出たところを落とされた'],
  },
  HIKIOTOSHI: {
    WIN: ['引いて前に落とした', '引きに乗せて手をつかせた'],
    LOSS: ['引かれて前に落ちた', '引きに乗って手をついた'],
  },
  MAKIOTOSHI: {
    WIN: ['巻き込んで落とした', '向きをずらして下へ送った'],
    LOSS: ['巻き込まれて落とされた', '向きをずらされて下へ送られた'],
  },
  TWIST_BREAK: {
    WIN: ['捻って向きを変えた', '重心をずらして落とした'],
    LOSS: ['捻られて向きを変えられた', '重心をずらされて落ちた'],
  },
  PULL_BREAK: {
    WIN: ['いなしから落とした', '引きの流れで呼び込んだ'],
    LOSS: ['いなしから落とされた', '引きの流れに呼び込まれた'],
  },
  EDGE_TWIST: {
    WIN: ['際で捻って向きを変えた', '土俵際で体を入れ替えた'],
    LOSS: ['際で捻られて向きを変えられた', '土俵際で体を入れ替えられた'],
  },
  LEG_TWIST: {
    WIN: ['足元から捻って向きを変えた', '足元と上体を合わせて軸をずらした'],
    LOSS: ['足元から捻られて向きを変えられた', '足元と上体を合わせて軸をずらされた'],
  },
  LEG_PICK: {
    WIN: ['足を取って出足を止めた', '低く入って足を攻めた'],
    LOSS: ['足を取られて出足を止められた', '低く入られて足を攻められた'],
  },
  OUTER_TRIP: {
    WIN: ['外から足を掛けた', '外掛けで踏ん張りを外した'],
    LOSS: ['外から足を掛けられた', '外掛けで踏ん張りを外された'],
  },
  INNER_TRIP: {
    WIN: ['内から足を掛けた', '内掛けで重心を崩した'],
    LOSS: ['内から足を掛けられた', '内掛けで重心を崩された'],
  },
  KICK_TRIP: {
    WIN: ['蹴る足技で足を払った', '足払いで体勢を乱した'],
    LOSS: ['蹴る足技で足を払われた', '足払いで体勢を乱された'],
  },
  HOOK_THROW: {
    WIN: ['足を掛けて投げた', '掛ける形で体を振った'],
    LOSS: ['足を掛けられて投げられた', '掛ける形で体を振られた'],
  },
  LEG_BREAK: {
    WIN: ['足元を攻め切った', '下から踏ん張りを奪った'],
    LOSS: ['足元を攻め切られた', '下から踏ん張りを失った'],
  },
  SORITECH: {
    WIN: ['反る体勢で返した', '反り技に持ち込んだ'],
    LOSS: ['反る体勢で返された', '反り技に持ち込まれた'],
  },
  SUTEMI: {
    WIN: ['捨て身気味に重心を返した', '体を預けて流れを返した'],
    LOSS: ['捨て身気味に重心を返された', '体を預けられて流れを返された'],
  },
  BIG_ARCH: {
    WIN: ['大きな反りで決めた', '反り技で向きを変えた'],
    LOSS: ['大きな反りで決められた', '反り技で向きを変えられた'],
  },
  REAR_PUSH_OUT: {
    WIN: ['後ろから外へ送った', '背後を取って押し出した'],
    LOSS: ['後ろから外へ送られた', '背後を取られて押し出された'],
  },
  REAR_DOWN: {
    WIN: ['背後から倒した', '後ろを取って体を預けた'],
    LOSS: ['背後から倒された', '後ろを取られて体を預けられた'],
  },
  REAR_GRIP: {
    WIN: ['後ろに回って決めた', '背後から動きを止めた'],
    LOSS: ['後ろに回られて決められた', '背後から動きを止められた'],
  },
  REAR_BREAK: {
    WIN: ['背後を取って向きを制した', '相手の向きを制して決めた'],
    LOSS: ['背後を取られて向きを制された', '向きを制されて決められた'],
  },
  REAR_LIFT: {
    WIN: ['後ろから浮かせて運んだ', '背後から吊る形にした'],
    LOSS: ['後ろから浮かされて運ばれた', '背後から吊る形にされた'],
  },
  ISAMIASHI: {
    WIN: ['相手の踏み出しで白星になった', '非技の形で勝負が決まった'],
    LOSS: ['踏み出して黒星になった', '非技の形で勝負が決まった'],
  },
  KOSHIKUDAKE: {
    WIN: ['相手が腰から落ちた', '非技の形で白星になった'],
    LOSS: ['腰から落ちた', '非技の形で黒星になった'],
  },
  TOUCH_DOWN: {
    WIN: ['相手が先に手をついた', '非技の結果で白星になった'],
    LOSS: ['先に手をついた', '非技の結果で黒星になった'],
  },
  STEP_OUT: {
    WIN: ['相手が先に土俵を出た', '非技の結果で白星になった'],
    LOSS: ['先に土俵を出た', '非技の結果で黒星になった'],
  },
  FOUL: {
    WIN: ['反則で白星になった', '非技の結果で勝敗がついた'],
    LOSS: ['反則で黒星になった', '非技の結果で勝敗がついた'],
  },
  FUSEN: {
    WIN: ['不戦で白星になった', '取組なしで星がついた'],
    LOSS: ['不戦で黒星になった', '取組なしで星がついた'],
  },
  GENERIC: {
    WIN: ['最後の形をまとめた', '勝負の形を残した'],
    LOSS: ['最後の形で後手に回った', '勝負の形を作れなかった'],
  },
};

const winOpeningClause = (snapshot: BoutFlowDiagnosticSnapshot): string => {
  switch (snapshot.openingPhase) {
    case 'THRUST_BATTLE':
      return selectVariant([
        '立合いから押し',
        '当たりで前に出て',
        '正面から圧力をかけ',
      ], variantParts(snapshot, 'WIN', 'opening'));
    case 'BELT_BATTLE':
      return snapshot.controlPhaseCandidate === 'THRUST_BATTLE'
        ? selectVariant([
          '差し手争いから離れ',
          '組み合いから距離を取り',
          'まわしの攻防から押しに移り',
        ], variantParts(snapshot, 'WIN', 'opening-belt-release'))
        : selectVariant([
          '四つの攻防から組み止め',
          'まわしを巡る攻防で形を作り',
          '差し手を争って胸を合わせ',
        ], variantParts(snapshot, 'WIN', 'opening-belt'));
    case 'TECHNIQUE_SCRAMBLE':
      return selectVariant([
        '相手の出方を見て',
        '動きの中で機を捉え',
        '攻防の間合いを読んで',
      ], variantParts(snapshot, 'WIN', 'opening-technique'));
    case 'EDGE_BATTLE':
      return selectVariant([
        '土俵際で残し',
        '俵に詰まりながら体を残し',
        '際の攻防で踏みとどまり',
      ], variantParts(snapshot, 'WIN', 'opening-edge'));
    case 'QUICK_COLLAPSE':
      return selectVariant([
        '立合い直後の乱れを逃さず',
        '短い相撲で相手の動きを突き',
        '早い展開をそのままものにし',
      ], variantParts(snapshot, 'WIN', 'opening-quick'));
    case 'MIXED':
      return selectVariant([
        '押し、組み、いなしが交じる中で',
        '攻防が何度か入れ替わる中で',
        '形が定まらない流れの中で',
      ], variantParts(snapshot, 'WIN', 'opening-mixed'));
  }
};

const lossOpeningClause = (snapshot: BoutFlowDiagnosticSnapshot): string => {
  switch (snapshot.openingPhase) {
    case 'THRUST_BATTLE':
      return selectVariant([
        '相手に立合いから押され',
        '当たりで後手に回り',
        '正面から圧力を受け',
      ], variantParts(snapshot, 'LOSS', 'opening'));
    case 'BELT_BATTLE':
      return snapshot.controlPhaseCandidate === 'THRUST_BATTLE'
        ? selectVariant([
          '差し手争いから離れたところを押され',
          '組み合いから離れた局面で押され',
          'まわしの攻防から押しに持ち込まれ',
        ], variantParts(snapshot, 'LOSS', 'opening-belt-release'))
        : selectVariant([
          '四つの攻防で組み止められ',
          '胸を合わせた形で主導権を渡し',
          '差し手争いで相手の形を許し',
        ], variantParts(snapshot, 'LOSS', 'opening-belt'));
    case 'TECHNIQUE_SCRAMBLE':
      return selectVariant([
        '動きに合わせられ',
        '攻防の間で先に動かれ',
        '技の流れで後手となり',
      ], variantParts(snapshot, 'LOSS', 'opening-technique'));
    case 'EDGE_BATTLE':
      return selectVariant([
        '土俵際の攻防で残され',
        '俵際で相手に踏みとどまられ',
        '際の攻防を取り切れず',
      ], variantParts(snapshot, 'LOSS', 'opening-edge'));
    case 'QUICK_COLLAPSE':
      return selectVariant([
        '立合い直後の乱れを突かれ',
        '短い相撲で姿勢を乱し',
        '早い展開に対応し切れず',
      ], variantParts(snapshot, 'LOSS', 'opening-quick'));
    case 'MIXED':
      return selectVariant([
        '押し、組み、いなしが交じる中で後手に回り',
        '攻防が入れ替わる中で主導権を失い',
        '形が定まらない流れで相手に合わせられ',
      ], variantParts(snapshot, 'LOSS', 'opening-mixed'));
  }
};

const winControlClause = (snapshot: BoutFlowDiagnosticSnapshot): string => {
  switch (snapshot.controlPhaseCandidate) {
    case 'THRUST_BATTLE':
      return snapshot.openingPhase === 'BELT_BATTLE'
        ? selectVariant(['押して', '押す形に切り替え', '前に圧力をかけ'], variantParts(snapshot, 'WIN', 'control-push-release'))
        : selectVariant(['前に出て', '押し続け', '相手を下げ'], variantParts(snapshot, 'WIN', 'control-push'));
    case 'BELT_BATTLE':
      return snapshot.openingPhase === 'BELT_BATTLE'
        ? ''
        : selectVariant(['組み止めて', '胸を合わせ', '寄りの形を作り'], variantParts(snapshot, 'WIN', 'control-belt'));
    case 'TECHNIQUE_SCRAMBLE':
      return selectVariant(['動きに合わせ', '相手の重心を見て', '技の間合いを作り'], variantParts(snapshot, 'WIN', 'control-technique'));
    case 'EDGE_BATTLE':
      return snapshot.openingPhase === 'EDGE_BATTLE'
        ? ''
        : selectVariant(['体を残し', '際で踏みとどまり', '俵に詰まりながら残し'], variantParts(snapshot, 'WIN', 'control-edge'));
    case 'QUICK_COLLAPSE':
      return '';
    case 'MIXED':
      return selectVariant(['形を探り', '攻防をつなぎ', '流れを切らさず'], variantParts(snapshot, 'WIN', 'control-mixed'));
    case undefined:
      return '';
  }
};

const subfamilyFinishClause = (
  snapshot: BoutFlowDiagnosticSnapshot,
  outcome: BoutFlowCommentaryOutcome,
  resolution: CommentaryKimariteSubfamilyResolution,
): string =>
  selectVariant(
    SHORT_SUBFAMILY_FINISH_TEXT[resolution.subfamily][outcome],
    variantParts(snapshot, outcome, `finish-subfamily:${resolution.family}:${resolution.subfamily}:${resolution.source}`),
  );

const winFinishClause = (
  snapshot: BoutFlowDiagnosticSnapshot,
  resolution: CommentaryKimariteSubfamilyResolution,
): string => subfamilyFinishClause(snapshot, 'WIN', resolution);

const lossFinishClause = (
  snapshot: BoutFlowDiagnosticSnapshot,
  resolution: CommentaryKimariteSubfamilyResolution,
): string => subfamilyFinishClause(snapshot, 'LOSS', resolution);

const firstSentence = (
  snapshot: BoutFlowDiagnosticSnapshot,
  outcome: BoutFlowCommentaryOutcome,
  resolution: CommentaryKimariteSubfamilyResolution,
): string => {
  const clauses = outcome === 'WIN'
    ? [
      winOpeningClause(snapshot),
      winControlClause(snapshot),
      winFinishClause(snapshot, resolution),
    ]
    : [
      lossOpeningClause(snapshot),
      lossFinishClause(snapshot, resolution),
    ];
  const flowText = clauses.filter((text) => text.length > 0).join('、');
  return `${flowText}。`;
};

const createShortCommentary = (
  snapshot: BoutFlowDiagnosticSnapshot,
  hoshitoriTag: HoshitoriContextTag,
  banzukeTag: BanzukeContextTag,
  outcome: BoutFlowCommentaryOutcome,
  resolution: CommentaryKimariteSubfamilyResolution,
): string => {
  const hoshitoriText = selectVariant(
    SHORT_HOSHITORI_TEXT[outcome][hoshitoriTag],
    variantParts(snapshot, outcome, `short-hoshitori:${hoshitoriTag}`),
  );
  const banzukeText = selectVariant(
    SHORT_BANZUKE_TEXT[outcome][banzukeTag],
    variantParts(snapshot, outcome, `short-banzuke:${banzukeTag}`),
  );
  return `${firstSentence(snapshot, outcome, resolution)}${hoshitoriText}、${banzukeText}。`;
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
  const kimariteSubfamily = resolveKimariteSubfamily(snapshot);

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
    kimariteSpec(snapshot, outcome, kimariteSubfamily),
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
    hoshitoriSpec(hoshitoriTag, outcome, snapshot),
  );
  const banzuke = createMaterial(
    'BANZUKE_CONTEXT',
    'BANZUKE',
    'banzuke',
    banzukeSpec(banzukeTag, outcome, snapshot),
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
    `${transition.text}${finish.text}`,
    `${victory.text}${kimarite.text}`,
  ];
  const shortCommentary = createShortCommentary(snapshot, hoshitoriTag, banzukeTag, outcome, kimariteSubfamily);

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
