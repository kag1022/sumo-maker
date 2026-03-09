import { BashoRecord, KataArchetype, KataProfile, RikishiStatus, TacticsType } from '../models';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const KATA_DISPLAY: Record<KataArchetype, string> = {
  TSUKI_OSHI: '突き押し',
  HIDARI_YOTSU_YORI: '左四つ・寄り',
  MIGI_YOTSU_YORI: '右四つ・寄り',
  YOTSU_NAGE: '四つ・投げ',
  BATTLECRAFT: '技巧派',
};

const KATA_TACTICS: Record<KataArchetype, TacticsType> = {
  TSUKI_OSHI: 'PUSH',
  HIDARI_YOTSU_YORI: 'GRAPPLE',
  MIGI_YOTSU_YORI: 'GRAPPLE',
  YOTSU_NAGE: 'TECHNIQUE',
  BATTLECRAFT: 'TECHNIQUE',
};

const DEFAULT_KATA_PROFILE: KataProfile = {
  settled: false,
  confidence: 0,
};

const normalizeMove = (move: string): string => move.replace(/\s/g, '');

const resolveMoveBucket = (move: string): 'PUSH' | 'YORI' | 'NAGE' | 'BATTLE' => {
  const normalized = normalizeMove(move);
  if (normalized === '不戦勝' || normalized === '不戦敗') return 'BATTLE';
  if (
    normalized.includes('押') ||
    normalized.includes('突') ||
    normalized === '電車道'
  ) {
    return 'PUSH';
  }
  if (
    normalized.includes('寄') ||
    normalized.includes('極め')
  ) {
    return 'YORI';
  }
  if (normalized.includes('投')) {
    return 'NAGE';
  }
  if (
    normalized.includes('叩') ||
    normalized.includes('引') ||
    normalized.includes('引き') ||
    normalized.includes('捻') ||
    normalized.includes('すくい')
  ) {
    return 'BATTLE';
  }
  return 'BATTLE';
};

const resolveMoveScores = (
  kimariteCount?: Record<string, number>,
): {
  push: number;
  yori: number;
  nage: number;
  battle: number;
  dominantMove?: string;
  concentration: number;
} => {
  const entries = Object.entries(kimariteCount ?? {}).filter(([, count]) => count > 0);
  if (entries.length === 0) {
    return { push: 0, yori: 0, nage: 0, battle: 0, concentration: 0 };
  }
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  let push = 0;
  let yori = 0;
  let nage = 0;
  let battle = 0;
  let dominantMove: string | undefined;
  let topCount = 0;
  for (const [move, count] of entries) {
    if (count > topCount) {
      topCount = count;
      dominantMove = move;
    }
    const ratio = count / Math.max(1, total);
    const bucket = resolveMoveBucket(move);
    if (bucket === 'PUSH') push += ratio;
    else if (bucket === 'YORI') yori += ratio;
    else if (bucket === 'NAGE') nage += ratio;
    else battle += ratio;
  }
  return {
    push,
    yori,
    nage,
    battle,
    dominantMove,
    concentration: topCount / Math.max(1, total),
  };
};

const resolveAbilityScores = (
  status: RikishiStatus,
): { push: number; yori: number; nage: number; battle: number; sideBias: 'HIDARI' | 'MIGI' } => {
  const { stats } = status;
  const normalize = (value: number): number => clamp(value / 140, 0, 1);
  const push = normalize((stats.tsuki + stats.oshi + stats.deashi + stats.power) / 4);
  const yori = normalize((stats.kumi + stats.koshi + stats.deashi + stats.power) / 4);
  const nage = normalize((stats.nage + stats.waza + stats.kumi + stats.koshi) / 4);
  const battle = normalize((stats.waza + stats.nage + stats.tsuki + stats.deashi) / 4);
  const sideBias: 'HIDARI' | 'MIGI' =
    stats.kumi + stats.koshi >= stats.tsuki + stats.oshi ? 'HIDARI' : 'MIGI';
  return { push, yori, nage, battle, sideBias };
};

const resolveRecordVolatilityPenalty = (records: BashoRecord[]): number => {
  const window = records.slice(-6);
  if (window.length < 2) return 0;
  const rates = window.map((record) => {
    const total = record.wins + record.losses;
    return total > 0 ? record.wins / total : 0;
  });
  const mean = rates.reduce((sum, value) => sum + value, 0) / rates.length;
  const variance =
    rates.reduce((sum, value) => sum + (value - mean) ** 2, 0) / rates.length;
  return clamp(Math.sqrt(variance) * 0.18, 0, 0.18);
};

const resolveKataScores = (
  status: RikishiStatus,
  record: BashoRecord,
): Array<{ archetype: KataArchetype; score: number; dominantMove?: string }> => {
  const moveScores = resolveMoveScores(record.kimariteCount);
  const ability = resolveAbilityScores(status);
  const sideBiasBonus = ability.sideBias === 'HIDARI' ? 0.05 : -0.01;

  return [
    {
      archetype: 'TSUKI_OSHI' as KataArchetype,
      score: moveScores.push * 0.5 + ability.push * 0.35 + moveScores.concentration * 0.15,
      dominantMove: moveScores.push >= 0.3 ? moveScores.dominantMove : undefined,
    },
    {
      archetype: 'HIDARI_YOTSU_YORI' as KataArchetype,
      score:
        moveScores.yori * 0.46 +
        ability.yori * 0.37 +
        moveScores.concentration * 0.17 +
        sideBiasBonus,
      dominantMove: moveScores.yori >= 0.3 ? moveScores.dominantMove : undefined,
    },
    {
      archetype: 'MIGI_YOTSU_YORI' as KataArchetype,
      score:
        moveScores.yori * 0.46 +
        ability.yori * 0.37 +
        moveScores.concentration * 0.17 -
        sideBiasBonus,
      dominantMove: moveScores.yori >= 0.3 ? moveScores.dominantMove : undefined,
    },
    {
      archetype: 'YOTSU_NAGE' as KataArchetype,
      score: moveScores.nage * 0.5 + ability.nage * 0.35 + moveScores.concentration * 0.15,
      dominantMove: moveScores.nage >= 0.25 ? moveScores.dominantMove : undefined,
    },
    {
      archetype: 'BATTLECRAFT' as KataArchetype,
      score: moveScores.battle * 0.45 + ability.battle * 0.4 + moveScores.concentration * 0.15,
      dominantMove: moveScores.battle >= 0.3 ? moveScores.dominantMove : undefined,
    },
  ].sort((a, b) => b.score - a.score);
};

const resolveFallbackMove = (archetype: KataArchetype): string => {
  if (archetype === 'TSUKI_OSHI') return '押し出し';
  if (archetype === 'HIDARI_YOTSU_YORI' || archetype === 'MIGI_YOTSU_YORI') return '寄り切り';
  if (archetype === 'YOTSU_NAGE') return '上手投げ';
  return '叩き込み';
};

const inferLegacyArchetype = (status: RikishiStatus): KataArchetype | undefined => {
  const move = status.signatureMoves?.[0] ?? '';
  const normalized = normalizeMove(move);
  if (status.tactics === 'PUSH') return 'TSUKI_OSHI';
  if (status.tactics === 'GRAPPLE') {
    return status.stats.kumi + status.stats.koshi >= status.stats.tsuki + status.stats.oshi
      ? 'HIDARI_YOTSU_YORI'
      : 'MIGI_YOTSU_YORI';
  }
  if (status.tactics === 'TECHNIQUE') {
    if (normalized.includes('投')) return 'YOTSU_NAGE';
    return 'BATTLECRAFT';
  }
  if (normalized.includes('押') || normalized.includes('突')) return 'TSUKI_OSHI';
  if (normalized.includes('寄')) return 'HIDARI_YOTSU_YORI';
  if (normalized.includes('投')) return 'YOTSU_NAGE';
  return undefined;
};

export const inferLegacyKataProfile = (status: RikishiStatus): KataProfile => {
  const archetype = inferLegacyArchetype(status);
  if (!archetype) return { ...DEFAULT_KATA_PROFILE };
  const dominantMove = status.signatureMoves?.[0];
  return {
    settled: status.tactics !== 'BALANCE' || Boolean(dominantMove),
    confidence: status.tactics === 'BALANCE' ? 0.5 : 0.76,
    archetype,
    displayName: KATA_DISPLAY[archetype],
    dominantMove,
    settledAtBashoSeq: status.history.records.length || undefined,
  };
};

export const ensureKataProfile = (status: RikishiStatus): RikishiStatus => {
  if (status.kataProfile) return status;
  return {
    ...status,
    kataProfile: inferLegacyKataProfile(status),
  };
};

export const updateKataProfileAfterBasho = (
  status: RikishiStatus,
  record: BashoRecord,
  bashoSeq: number,
): RikishiStatus => {
  const baseStatus = ensureKataProfile(status);
  const prev = baseStatus.kataProfile ?? { ...DEFAULT_KATA_PROFILE };
  const ranked = resolveKataScores(baseStatus, record);
  const top = ranked[0];
  const second = ranked[1] ?? { score: 0 };
  const scoreGap = top ? top.score - second.score : 0;

  const experienceCoeff = clamp(0.02 + bashoSeq * 0.01, 0, 0.22);
  const moveScores = resolveMoveScores(record.kimariteCount);
  const attendancePenalty = clamp((record.absent / 15) * 0.16, 0, 0.16);
  const volatilityPenalty = clamp(
    ((baseStatus.genome?.variance.formVolatility ?? 50) / 100) * 0.08,
    0,
    0.12,
  );
  const recordVolPenalty = resolveRecordVolatilityPenalty(baseStatus.history.records);
  const instabilityPenalty = Math.abs(record.wins - record.losses) >= 7 ? 0.04 : 0;
  const confidenceDelta =
    experienceCoeff +
    moveScores.concentration * 0.24 +
    (top?.score ?? 0) * 0.28 -
    attendancePenalty -
    volatilityPenalty -
    recordVolPenalty -
    instabilityPenalty;
  const confidence = clamp(prev.confidence * 0.62 + confidenceDelta * 0.58, 0, 1);

  const canSettle =
    bashoSeq >= 10 &&
    confidence >= 0.72 &&
    scoreGap >= 0.15 &&
    Boolean(top);

  let pendingArchetype = prev.pendingArchetype;
  let pendingCount = prev.pendingCount ?? 0;
  let settled = prev.settled;
  let archetype = prev.archetype;
  let displayName = prev.displayName;
  let settledAtBashoSeq = prev.settledAtBashoSeq;
  let dominantMove = prev.dominantMove;

  if (!settled) {
    if (canSettle && top) {
      if (pendingArchetype === top.archetype) pendingCount += 1;
      else {
        pendingArchetype = top.archetype;
        pendingCount = 1;
      }
      if (pendingCount >= 2) {
        settled = true;
        archetype = top.archetype;
        displayName = KATA_DISPLAY[top.archetype];
        dominantMove = top.dominantMove ?? resolveFallbackMove(top.archetype);
        settledAtBashoSeq = bashoSeq;
      }
    } else {
      pendingArchetype = undefined;
      pendingCount = 0;
    }
  }

  const nextProfile: KataProfile = {
    settled,
    confidence,
    archetype,
    displayName,
    dominantMove,
    settledAtBashoSeq,
    pendingArchetype,
    pendingCount,
  };

  const provisionalArchetype = settled
    ? archetype
    : confidence >= 0.45
      ? top?.archetype
      : undefined;
  const nextTactics: TacticsType = provisionalArchetype
    ? KATA_TACTICS[provisionalArchetype]
    : 'BALANCE';
  const nextSignatureMoves =
    settled && dominantMove
      ? [dominantMove]
      : [];

  return {
    ...baseStatus,
    tactics: nextTactics,
    signatureMoves: nextSignatureMoves,
    kataProfile: nextProfile,
  };
};

export const resolveKataDisplay = (
  kataProfile?: KataProfile,
): { styleLabel: string; dominantMoveLabel: string } => {
  if (!kataProfile || !kataProfile.settled || !kataProfile.displayName) {
    return { styleLabel: 'なし', dominantMoveLabel: '' };
  }
  return {
    styleLabel: kataProfile.displayName,
    dominantMoveLabel: kataProfile.dominantMove ?? '',
  };
};
