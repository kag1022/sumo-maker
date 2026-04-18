import type { RandomSource } from '../simulation/deps';
import type { KimaritePattern, OfficialKimariteEntry } from './catalog';
import type { KimariteBoutContext, KimariteCompetitorProfile } from './selection.types';

/**
 * 取組の「型」。立合い〜寄り合い〜決め手までの流れを、勝者だけでなく
 * 両力士の型・スタッツ・体格・状況の相互作用から導出する中間状態。
 *
 * これを導入する理由（設計意図）:
 *  - 既存の winner.style → WinRoute → KimaritePattern → 候補プール は winner 単独駆動のため、
 *    TSUKI_OSHI 勝者はほぼ PUSH_ADVANCE パターン 4 手に押し込まれ、押し出しが常に最有利になっていた。
 *  - Engagement を介して「相手がグリップを先に取ったので BELT_BATTLE になった」「土俵際で粘ったので
 *    EDGE_SCRAMBLE になった」といった取組の形を先に決め、ここから候補プールを横断的に広げる。
 */
export type EngagementPhase =
  | 'THRUST_BATTLE'    // 押し相撲の応酬
  | 'BELT_BATTLE'      // 四つ相撲（まわし勝負）
  | 'MIXED'            // 半身 / 取り直し / 押し＋組み混合
  | 'EDGE_SCRAMBLE'    // 土俵際の攻防
  | 'QUICK_COLLAPSE';  // 立合い即決・体格差や失速による急展開

export interface BoutEngagement {
  phase: EngagementPhase;
  defenderCollapsed: boolean;
  edgeCrisis: boolean;
  gripEstablished: boolean;
  weightDomination: boolean;
}

const ALL_PHASES: EngagementPhase[] = [
  'THRUST_BATTLE',
  'BELT_BATTLE',
  'MIXED',
  'EDGE_SCRAMBLE',
  'QUICK_COLLAPSE',
];

/**
 * 各 Engagement × 各 KimaritePattern の相性係数。
 * 0 に近いほどその組み合わせでは選ばれにくく、1 以上はむしろ後押し。
 *
 * 例: BELT_BATTLE では PUSH_ADVANCE は 0.72 まで下がるため、押し出しの
 * historicalWeight は鈍るが、現実寄りに「組み切る前の押し切り」までは残す。
 */
export const ENGAGEMENT_PATTERN_AFFINITY: Record<
  EngagementPhase,
  Partial<Record<KimaritePattern, number>>
> = {
  THRUST_BATTLE: {
    PUSH_ADVANCE: 1.18,
    PULL_DOWN: 0.64,
    LEG_TRIP_PICK: 0.22,
    THROW_EXCHANGE: 0.18,
    BELT_FORCE: 0.12,
    REAR_CONTROL: 0.15,
    EDGE_REVERSAL: 0.1,
    BACKWARD_ARCH: 0.04,
  },
  BELT_BATTLE: {
    BELT_FORCE: 0.88,
    THROW_EXCHANGE: 0.48,
    LEG_TRIP_PICK: 0.4,
    REAR_CONTROL: 0.35,
    PULL_DOWN: 0.18,
    PUSH_ADVANCE: 0.72,
    EDGE_REVERSAL: 0.2,
    BACKWARD_ARCH: 0.08,
  },
  MIXED: {
    PUSH_ADVANCE: 1.08,
    BELT_FORCE: 0.48,
    PULL_DOWN: 0.82,
    THROW_EXCHANGE: 0.42,
    LEG_TRIP_PICK: 0.5,
    REAR_CONTROL: 0.55,
    EDGE_REVERSAL: 0.25,
    BACKWARD_ARCH: 0.08,
  },
  EDGE_SCRAMBLE: {
    EDGE_REVERSAL: 1.0,
    PULL_DOWN: 0.7,
    THROW_EXCHANGE: 0.75,
    BELT_FORCE: 0.4,
    REAR_CONTROL: 0.55,
    PUSH_ADVANCE: 0.78,
    LEG_TRIP_PICK: 0.4,
    BACKWARD_ARCH: 0.18,
  },
  QUICK_COLLAPSE: {
    PUSH_ADVANCE: 1.02,
    PULL_DOWN: 1.08,
    BELT_FORCE: 0.22,
    THROW_EXCHANGE: 0.25,
    LEG_TRIP_PICK: 0.18,
    REAR_CONTROL: 0.42,
    EDGE_REVERSAL: 0.15,
    BACKWARD_ARCH: 0.02,
  },
};

const weightedPhasePick = (
  weights: Record<EngagementPhase, number>,
  rng: RandomSource,
): EngagementPhase => {
  const entries = ALL_PHASES.map((phase) => ({
    phase,
    weight: Math.max(0, weights[phase] ?? 0),
  })).filter((entry) => entry.weight > 0);
  if (!entries.length) return 'MIXED';
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.phase;
  }
  return entries[entries.length - 1].phase;
};

const pushStatOf = (profile: KimariteCompetitorProfile): number =>
  ((profile.stats.tsuki ?? 50) + (profile.stats.oshi ?? 50)) / 100;

const gripStatOf = (profile: KimariteCompetitorProfile): number =>
  ((profile.stats.kumi ?? 50) + (profile.stats.koshi ?? 50)) / 100;

const throwStatOf = (profile: KimariteCompetitorProfile): number =>
  ((profile.stats.nage ?? 50) + (profile.stats.waza ?? 50)) / 100;

/**
 * 勝者と敗者の型・スタッツ・体格・状況から Engagement をサンプリング。
 *
 * キー設計:
 *  - 同型同士（PUSH vs PUSH, GRAPPLE vs GRAPPLE）は純粋な衝突 → THRUST/BELT_BATTLE。
 *  - 異型同士は誰が立合いを取ったか不確定 → MIXED 寄り。
 *  - 土俵際候補・敗者失速・大番狂わせ → EDGE_SCRAMBLE / QUICK_COLLAPSE を加点。
 *  - TECHNIQUE 勝者は相手の型に合わせつつ独自に EDGE/MIXED を広げる。
 */
export const resolveBoutEngagement = (
  winner: KimariteCompetitorProfile,
  loser: KimariteCompetitorProfile,
  context: KimariteBoutContext | undefined,
  rng: RandomSource,
): BoutEngagement => {
  const weights: Record<EngagementPhase, number> = {
    THRUST_BATTLE: 0.2,
    BELT_BATTLE: 0.2,
    MIXED: 0.35,
    EDGE_SCRAMBLE: 0.08,
    QUICK_COLLAPSE: 0.08,
  };

  // 勝者 style が engagement を強くアンカーする。
  // 「その型で勝ったのはその型の決めが主導した」という実相撲の傾向を反映。
  const w = winner.style;
  const l = loser.style;
  if (w === 'PUSH') {
    weights.THRUST_BATTLE += 2.35;
    weights.MIXED += 0.12;
  } else if (w === 'GRAPPLE') {
    weights.BELT_BATTLE += 1.8;
    weights.MIXED += 0.2;
  } else if (w === 'TECHNIQUE') {
    weights.MIXED += 1.0;
    weights.EDGE_SCRAMBLE += 0.4;
    weights.BELT_BATTLE += 0.22;
    weights.THRUST_BATTLE += 0.32;
  } else {
    // BALANCE
    weights.THRUST_BATTLE += 0.55;
    weights.BELT_BATTLE += 0.55;
    weights.MIXED += 0.4;
  }

  // 敗者 style は engagement を弱く変化させる（勝者アンカーより弱め）。
  if (w === l) {
    if (w === 'PUSH') weights.THRUST_BATTLE += 0.6;
    if (w === 'GRAPPLE') weights.BELT_BATTLE += 0.6;
  } else if (w === 'PUSH' && l === 'GRAPPLE') {
    // GRAPPLE 敗者相手の押し出し → BELT にもつれ込む可能性を少しだけ加点。
    weights.BELT_BATTLE += 0.15;
    weights.MIXED += 0.25;
  } else if (w === 'GRAPPLE' && l === 'PUSH') {
    weights.MIXED += 0.2;
    weights.QUICK_COLLAPSE += 0.15;
  } else if (l === 'TECHNIQUE') {
    weights.MIXED += 0.2;
  }

  // スタッツ相互作用（style アンカーよりは弱い影響）。
  const wPush = pushStatOf(winner);
  const lPush = pushStatOf(loser);
  const wGrip = gripStatOf(winner);
  const lGrip = gripStatOf(loser);
  const wThrow = throwStatOf(winner);

  if (wPush >= 0.8) weights.THRUST_BATTLE += 0.6;
  if (wGrip >= 0.8) weights.BELT_BATTLE += 0.6;
  if (wPush >= 0.55 && lPush >= 0.55) weights.THRUST_BATTLE += 0.2;
  if (wGrip >= 0.55 && lGrip >= 0.55) weights.BELT_BATTLE += 0.2;
  if (wThrow >= 0.7 && w !== 'PUSH') weights.MIXED += 0.2;

  // 体格・体勢
  const weightDiff = winner.weightKg - loser.weightKg;
  if (Math.abs(weightDiff) >= 20) weights.QUICK_COLLAPSE += 0.35;
  if (weightDiff >= 12) weights.THRUST_BATTLE += 0.1;

  // 状況
  if (context?.isEdgeCandidate) weights.EDGE_SCRAMBLE += 0.9;
  if (context?.loserExhausted) {
    weights.QUICK_COLLAPSE += 0.35;
    weights.EDGE_SCRAMBLE += 0.15;
  }
  const dominance = context?.dominance ?? 0;
  if (dominance <= -0.3) weights.EDGE_SCRAMBLE += 0.4; // 番狂わせ
  if (dominance >= 0.6) weights.QUICK_COLLAPSE += 0.2;

  // 特性
  if (winner.traits.includes('DOHYOUGIWA_MAJUTSU') || winner.traits.includes('CLUTCH_REVERSAL')) {
    weights.EDGE_SCRAMBLE += 0.45;
  }
  if (winner.traits.includes('READ_THE_BOUT')) {
    weights.MIXED += 0.15;
  }
  if (winner.traits.includes('ARAWAZASHI')) {
    weights.MIXED += 0.15;
    weights.EDGE_SCRAMBLE += 0.1;
  }

  const phase = weightedPhasePick(weights, rng);
  return {
    phase,
    defenderCollapsed: Boolean(context?.loserExhausted) || phase === 'QUICK_COLLAPSE',
    edgeCrisis: phase === 'EDGE_SCRAMBLE',
    gripEstablished:
      phase === 'BELT_BATTLE' ||
      (phase === 'MIXED' && (w === 'GRAPPLE' || wGrip >= 0.55)),
    weightDomination: Math.abs(weightDiff) >= 20 && weightDiff > 0,
  };
};

/**
 * 決まり手エントリが現在の engagement に適合する度合い。
 * entry.requiredPatterns のうち、engagement の affinity が最も高いものを採用。
 * 0 が返った場合、この engagement では実質選ばれない。
 */
export const resolveEngagementPatternFit = (
  entry: Pick<OfficialKimariteEntry, 'requiredPatterns'>,
  engagement: BoutEngagement,
): number => {
  const affinities = ENGAGEMENT_PATTERN_AFFINITY[engagement.phase];
  let best = 0;
  for (const pattern of entry.requiredPatterns) {
    const value = affinities[pattern] ?? 0;
    if (value > best) best = value;
  }
  return best;
};

/**
 * Engagement から WinRoute 選択時のバイアスを導出。
 * resolveWinRoute 側で掛け算することで、BELT_BATTLE engagement でも
 * winner.style=PUSH が無理やり PUSH_OUT を取らないようにする。
 */
export const resolveEngagementRouteBias = (
  engagement: BoutEngagement,
): Partial<Record<
  'PUSH_OUT' | 'BELT_FORCE' | 'THROW_BREAK' | 'PULL_DOWN' | 'EDGE_REVERSAL' | 'REAR_FINISH' | 'LEG_ATTACK',
  number
>> => {
  switch (engagement.phase) {
    case 'THRUST_BATTLE':
      return {
        PUSH_OUT: 1.6,
        PULL_DOWN: 1.2,
        BELT_FORCE: 0.25,
        THROW_BREAK: 0.3,
        LEG_ATTACK: 0.35,
      };
    case 'BELT_BATTLE':
      return {
        BELT_FORCE: 1.45,
        THROW_BREAK: 1.55,
        PUSH_OUT: 0.9,
        PULL_DOWN: 0.3,
        LEG_ATTACK: 0.8,
        REAR_FINISH: 0.5,
      };
    case 'MIXED':
      return {
        PUSH_OUT: 1.05,
        BELT_FORCE: 0.95,
        THROW_BREAK: 1.15,
        PULL_DOWN: 1.1,
        LEG_ATTACK: 0.85,
        REAR_FINISH: 0.55,
      };
    case 'EDGE_SCRAMBLE':
      return {
        EDGE_REVERSAL: 2.2,
        PULL_DOWN: 1.15,
        THROW_BREAK: 1.25,
        BELT_FORCE: 0.6,
        PUSH_OUT: 0.95,
        REAR_FINISH: 0.75,
        LEG_ATTACK: 0.55,
      };
    case 'QUICK_COLLAPSE':
      return {
        PUSH_OUT: 1.55,
        PULL_DOWN: 1.25,
        BELT_FORCE: 0.55,
        THROW_BREAK: 0.4,
        LEG_ATTACK: 0.3,
      };
  }
};
