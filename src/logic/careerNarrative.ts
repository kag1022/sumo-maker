import {
  BashoRecord,
  CareerHistory,
  CareerNarrativeSummary,
  CareerTurningPoint,
  HighlightEvent,
  HighlightEventTag,
  Rank,
  RikishiStatus,
  TurningPointSummary,
} from './models';
import { STYLE_LABELS } from './styleProfile';
import { normalizeTraitProgress } from './traits';

interface RivalHeadToHeadInput {
  latestShikona: string;
  bouts: number;
  wins: number;
  losses: number;
  firstSeenSeq: number;
  lastSeenSeq: number;
}

const rankToNumericTier = (rank: Rank): number => {
  if (rank.division === 'Makuuchi') return 6;
  if (rank.division === 'Juryo') return 5;
  if (rank.division === 'Makushita') return 4;
  if (rank.division === 'Sandanme') return 3;
  if (rank.division === 'Jonidan') return 2;
  if (rank.division === 'Jonokuchi') return 1;
  return 0;
};

export const ensureCareerHistory = (history: CareerHistory): CareerHistory => {
  if (!history.bodyTimeline) history.bodyTimeline = [];
  if (!history.highlightEvents) history.highlightEvents = [];
  if (!history.traitAwakenings) history.traitAwakenings = [];
  if (!history.careerTurningPoints) history.careerTurningPoints = [];
  if (!history.winRouteTotal) history.winRouteTotal = {};
  return history;
};

export const pushBodyTimelinePoint = (
  history: CareerHistory,
  record: BashoRecord,
  bashoSeq: number,
  weightKg: number,
): void => {
  ensureCareerHistory(history);
  history.bodyTimeline!.push({
    bashoSeq,
    year: record.year,
    month: record.month,
    weightKg: Math.round(weightKg * 10) / 10,
  });
};

export const pushHighlightEvent = (
  history: CareerHistory,
  event: HighlightEvent,
): void => {
  ensureCareerHistory(history);
  const exists = history.highlightEvents!.some((entry) =>
    entry.bashoSeq === event.bashoSeq && entry.tag === event.tag);
  if (!exists) {
    history.highlightEvents!.push(event);
  }
};

export const pushCareerTurningPoint = (
  history: CareerHistory,
  turningPoint: CareerTurningPoint,
): void => {
  ensureCareerHistory(history);
  const existingIndex = history.careerTurningPoints!.findIndex((entry) =>
    entry.bashoSeq === turningPoint.bashoSeq && entry.kind === turningPoint.kind);
  if (existingIndex >= 0) {
    history.careerTurningPoints![existingIndex] = {
      ...history.careerTurningPoints![existingIndex],
      ...turningPoint,
    };
  } else {
    history.careerTurningPoints!.push(turningPoint);
  }
  history.careerTurningPoints!.sort((left, right) =>
    right.severity - left.severity || right.bashoSeq - left.bashoSeq);
  history.careerTurningPoint = history.careerTurningPoints![0];
};

export const setCareerTurningPoint = (
  history: CareerHistory,
  turningPoint: CareerTurningPoint,
): void => {
  pushCareerTurningPoint(history, turningPoint);
};

export const inferHighlightEvents = (status: RikishiStatus): HighlightEvent[] => {
  const result: HighlightEvent[] = [...(status.history.highlightEvents ?? [])];
  const ensure = (tag: HighlightEventTag, bashoSeq: number, year: number, month: number, label: string) => {
    if (!result.some((event) => event.tag === tag && event.bashoSeq === bashoSeq)) {
      result.push({ tag, bashoSeq, year, month, label });
    }
  };
  status.history.records.forEach((record, index) => {
    const seq = index + 1;
    if (record.yusho) ensure('YUSHO', seq, record.year, record.month, '優勝');
    if ((record.kinboshi ?? 0) > 0) ensure('KINBOSHI', seq, record.year, record.month, '金星');
    if (record.rank.division === 'Juryo') {
      const prev = status.history.records[index - 1];
      if (!prev || (prev.rank.division !== 'Juryo' && prev.rank.division !== 'Makuuchi')) {
        ensure('FIRST_SEKITORI', seq, record.year, record.month, '初関取');
      }
    }
    const prev = status.history.records[index - 1];
    if (prev?.rank.division === 'Juryo' && record.rank.division === 'Makushita') {
      ensure('JURYO_DROP', seq, record.year, record.month, '十両陥落');
    }
  });
  status.history.events.forEach((event) => {
    const matchingIndex = status.history.records.findIndex((record) => record.year === event.year && record.month === event.month);
    const bashoSeq = matchingIndex >= 0 ? matchingIndex + 1 : status.history.records.length;
    if (event.type === 'PROMOTION') ensure('PROMOTION', bashoSeq, event.year, event.month, '昇進');
    if (event.type === 'RETIREMENT') ensure('RETIREMENT', bashoSeq, event.year, event.month, '引退');
    if (event.type === 'INJURY' && /重症度 ([7-9]|10)/.test(event.description)) {
      ensure('MAJOR_INJURY', bashoSeq, event.year, event.month, '大怪我');
    }
  });
  return result.sort((a, b) => a.bashoSeq - b.bashoSeq);
};

export const inferCareerTurningPoint = (status: RikishiStatus): CareerTurningPoint | undefined => {
  const pointFromList = status.history.careerTurningPoints?.[0];
  if (pointFromList) return pointFromList;
  const fromHistory = status.history.careerTurningPoint;
  if (fromHistory) return fromHistory;
  let candidate: CareerTurningPoint | undefined;
  status.history.events.forEach((event) => {
    if (event.type !== 'INJURY') return;
    const match = event.description.match(/重症度 (\d+)/);
    const severity = match ? Number(match[1]) : 0;
    if (severity < 7) return;
    const bashoSeq = Math.max(1, status.history.records.findIndex((record) =>
      record.year === event.year && record.month === event.month) + 1);
    if (!candidate || severity > candidate.severity) {
      candidate = {
        bashoSeq,
        year: event.year,
        month: event.month,
        kind: 'MAJOR_INJURY',
        label: '大怪我',
        reason: event.description,
        severity,
      };
    }
  });
  return candidate;
};

const inferCareerTurningPoints = (status: RikishiStatus): CareerTurningPoint[] => {
  const eventMap = new Map<string, CareerTurningPoint>();
  const upsert = (point: CareerTurningPoint) => {
    const key = `${point.bashoSeq}:${point.kind}`;
    const existing = eventMap.get(key);
    if (!existing || point.severity >= existing.severity) {
      eventMap.set(key, point);
    }
  };
  for (const point of status.history.careerTurningPoints ?? []) {
    upsert(point);
  }
  const singlePoint = inferCareerTurningPoint(status);
  if (singlePoint) {
    upsert(singlePoint);
  }
  status.history.records.forEach((record, index) => {
    const bashoSeq = index + 1;
    const prev = status.history.records[index - 1];
    if (record.yusho) {
      upsert({
        bashoSeq,
        year: record.year,
        month: record.month,
        kind: 'YUSHO',
        label: record.rank.division === 'Makuuchi' ? '幕内優勝' : '優勝',
        reason: `${record.year}年${record.month}月場所で優勝し、番付の空気を大きく変えた。`,
        severity: record.rank.division === 'Makuuchi' ? 10 : record.rank.division === 'Juryo' ? 8 : 6,
      });
    }
    if (record.rank.division === 'Juryo' && (!prev || !['Juryo', 'Makuuchi'].includes(prev.rank.division))) {
      upsert({
        bashoSeq,
        year: record.year,
        month: record.month,
        kind: 'FIRST_SEKITORI',
        label: '初関取',
        reason: `${record.year}年${record.month}月場所で関取に届き、見られ方が変わった。`,
        severity: 7,
      });
    }
    if (record.rank.division === 'Makuuchi' && prev?.rank.division === 'Juryo') {
      upsert({
        bashoSeq,
        year: record.year,
        month: record.month,
        kind: 'MAKUUCHI_PROMOTION',
        label: '新入幕',
        reason: `${record.year}年${record.month}月を越えて新入幕。相撲人生の主戦場が変わった。`,
        severity: 8,
      });
    }
    if (prev?.rank.division === 'Juryo' && record.rank.division === 'Makushita') {
      upsert({
        bashoSeq,
        year: record.year,
        month: record.month,
        kind: 'JURYO_DROP',
        label: '十両陥落',
        reason: `${record.year}年${record.month}月場所で関取の座を失い、人生の重心が揺れた。`,
        severity: 7,
      });
    }
  });
  status.history.events.forEach((event) => {
    if (event.type !== 'RETIREMENT') return;
    const bashoSeq = Math.max(
      1,
      status.history.records.findIndex((record) => record.year === event.year && record.month === event.month) + 1 || status.history.records.length,
    );
    upsert({
      bashoSeq,
      year: event.year,
      month: event.month,
      kind: 'RETIREMENT',
      label: '引退',
      reason: event.description.replace(/^引退 \(/, '').replace(/\)$/, '') || '土俵を去った',
      severity: 5,
    });
  });
  return [...eventMap.values()].sort((left, right) =>
    right.severity - left.severity || right.bashoSeq - left.bashoSeq);
};

const toTurningPointSummaries = (status: RikishiStatus): TurningPointSummary[] => {
  const eventMap = new Map<number, TurningPointSummary>();
  for (const event of inferHighlightEvents(status)) {
    if (!['YUSHO', 'FIRST_SEKITORI', 'MAJOR_INJURY', 'PROMOTION', 'JURYO_DROP'].includes(event.tag)) continue;
    const summary =
      event.tag === 'YUSHO'
        ? `${event.year}年${event.month}月場所で優勝し、番付の空気を大きく変えた。`
        : event.tag === 'FIRST_SEKITORI'
          ? `${event.year}年${event.month}月場所で関取に届き、見られ方が変わった。`
          : event.tag === 'MAJOR_INJURY'
            ? `${event.year}年${event.month}月場所の大怪我が、その後の浮沈を決めた。`
            : event.tag === 'JURYO_DROP'
              ? `${event.year}年${event.month}月場所で関取の座を失い、人生の重心が揺れた。`
              : `${event.year}年${event.month}月場所で番付の節目を迎えた。`;
    eventMap.set(event.bashoSeq, {
      bashoSeq: event.bashoSeq,
      year: event.year,
      month: event.month,
      label: event.label,
      summary,
      severity: event.tag === 'MAJOR_INJURY' ? 9 : event.tag === 'YUSHO' ? 8 : 6,
    });
  }

  for (const turningPoint of inferCareerTurningPoints(status)) {
    eventMap.set(turningPoint.bashoSeq, {
      bashoSeq: turningPoint.bashoSeq,
      year: turningPoint.year,
      month: turningPoint.month,
      label: turningPoint.label,
      summary: turningPoint.reason,
      severity: turningPoint.severity,
    });
  }

  return [...eventMap.values()]
    .sort((a, b) => b.severity - a.severity || a.bashoSeq - b.bashoSeq)
    .slice(0, 4);
};

export const getRetirementSpiritReason = (status: RikishiStatus): string => {
  if (status.spirit <= 0) return '気力が尽きて土俵を去った';
  if (status.age >= 31 && status.spirit <= 15) return '気力の細りにより引退';
  return '気力・体力の限界により引退';
};

export const buildCounterfactualInjuryText = (status: RikishiStatus): string | null => {
  const turningPoint = inferCareerTurningPoint(status);
  if (!turningPoint) return null;
  const after = status.history.records.filter((_record, index) => index + 1 > turningPoint.bashoSeq);
  if (after.length === 0) return null;
  const avgWins = after.reduce((sum, record) => sum + record.wins, 0) / after.length;
  const nextTier =
    rankToNumericTier(status.history.maxRank) >= 6 ? '横綱・大関線' :
    rankToNumericTier(status.history.maxRank) >= 5 ? '幕内上位線' :
    rankToNumericTier(status.history.maxRank) >= 4 ? '関取上位線' :
    '関取線';
  return `もし${turningPoint.year}年${turningPoint.month}月の怪我がなければ、その後は平均${avgWins.toFixed(1)}勝ペースで${nextTier}まで届いた可能性がある。`;
};

export const buildFantasyHooks = (status: RikishiStatus): string[] => {
  const hooks: string[] = [];
  const highlights = inferHighlightEvents(status);
  const yusho = highlights.find((event) => event.tag === 'YUSHO');
  const firstSekitori = highlights.find((event) => event.tag === 'FIRST_SEKITORI');
  const majorInjury = highlights.find((event) => event.tag === 'MAJOR_INJURY');
  const kinboshi = highlights.find((event) => event.tag === 'KINBOSHI');

  if (firstSekitori) hooks.push(`${firstSekitori.year}年${firstSekitori.month}月に関取へ届いた瞬間が、この系譜の分岐点になった。`);
  if (yusho) hooks.push(`${yusho.year}年${yusho.month}月の優勝で、一門の看板候補として空気が変わった。`);
  if (kinboshi) hooks.push(`${kinboshi.year}年${kinboshi.month}月の金星が、型の完成を世間に知らしめた。`);
  if (majorInjury) hooks.push(`${majorInjury.year}年${majorInjury.month}月の大怪我がなければ、もう一段上の番付争いが見えた。`);
  if (status.designedStyleProfile && status.realizedStyleProfile) {
    if (status.designedStyleProfile.dominant !== status.realizedStyleProfile.dominant) {
      hooks.push(`設計では${STYLE_LABELS[status.designedStyleProfile.dominant]}型だったが、土俵では${STYLE_LABELS[status.realizedStyleProfile.dominant]}に化けた。`);
    } else {
      hooks.push(`設計どおり${STYLE_LABELS[status.designedStyleProfile.dominant]}を通し切った、珍しい完成形だった。`);
    }
  }
  if (hooks.length < 3) {
    hooks.push(`最高位 ${status.history.maxRank.name} までの曲線に、この力士らしい癖がはっきり残った。`);
  }
  return hooks.slice(0, 5);
};

export const applySpiritChangeAfterBasho = (input: {
  status: RikishiStatus;
  record: BashoRecord;
  previousRank: Rank;
  nextRank: Rank;
  newEvents: Array<{ type: string; description: string }>;
}): number => {
  let delta = 0;
  if (input.record.yusho) delta += 8;
  if (input.newEvents.some((event) => event.type === 'PROMOTION')) delta += 4;
  if (input.newEvents.some((event) => event.type === 'INJURY' && /重症度 ([7-9]|10)/.test(event.description))) {
    delta -= 14;
  }
  const recent = input.status.history.records.slice(-3);
  if (recent.length === 3 && recent.every((record) => record.wins < record.losses + record.absent)) {
    delta -= 6;
  }
  if (input.previousRank.division === 'Juryo' && input.nextRank.division === 'Makushita') {
    delta -= 7;
  }
  if (
    input.record.wins === 7 &&
    input.record.losses >= 8 &&
    (input.previousRank.division === 'Makuuchi' || input.previousRank.division === 'Juryo')
  ) {
    delta -= 4;
  }
  const pressureBias = input.status.careerSeed?.biases.socialPressureBias ?? 0;
  const slumpBias = input.status.careerSeed?.biases.slumpResistanceBias ?? 0;
  if (delta < 0) {
    delta = Math.floor(delta * Math.max(0.75, 1 + pressureBias * 0.12 - slumpBias * 0.08));
  }
  if (delta > 0) {
    delta = Math.ceil(delta * Math.max(0.85, 1 + (input.status.careerSeed?.biases.reboundBias ?? 0) * 0.08));
  }
  return delta;
};

export const buildCareerNarrativeSummary = (status: RikishiStatus): CareerNarrativeSummary => {
  const seed = status.careerSeed;
  const designEchoes = seed
    ? [
        `${seed.entryPathLabel}として入ったことが、入口番付と序盤の見られ方を決めた。`,
        `${seed.temperamentLabel}気質は、${status.history.totalAbsent > 0 ? "停滞や休場を含む波" : "踏みとどまり方"}に残った。`,
        `${seed.bodySeedLabel}は、最終的な${Math.round(status.bodyMetrics.heightCm)}cm・${Math.round(status.bodyMetrics.weightKg)}kgと${status.realizedStyleProfile ? STYLE_LABELS[status.realizedStyleProfile.dominant] : "実戦型"}の輪郭に繋がった。`,
      ]
    : undefined;
  const initialConditions = seed
    ? `${seed.birthplace}から${seed.stableName}へ入り、${seed.entryAge}歳で土俵に立った。${seed.entryPathLabel}として見られ、${seed.temperamentLabel}気質と${seed.bodySeedLabel}が入口に置かれていた。`
    : `${status.profile.birthplace}から角界へ入り、${status.entryAge}歳で土俵に立った。`;
  const growthArc =
    seed
      ? `${seed.initialHeightCm}cm・${seed.initialWeightKg}kgの入口から、最終的に${Math.round(status.bodyMetrics.heightCm)}cm・${Math.round(status.bodyMetrics.weightKg)}kgまで形を変えた。`
      : `番付の浮沈とともに、体格と地力の輪郭が固まっていった。`;
  const careerIdentity =
    status.realizedStyleProfile
      ? `実戦では${STYLE_LABELS[status.realizedStyleProfile.dominant]}を主軸に戦い、最高位は${status.history.maxRank.name}まで届いた。`
      : `型は固定され切らず、それでも最高位は${status.history.maxRank.name}まで届いた。`;
  const retirementDigest = `引退時は${status.age}歳。${getRetirementSpiritReason(status)}。`;
  return {
    initialConditions,
    growthArc,
    careerIdentity,
    designEchoes,
    turningPoints: toTurningPointSummaries(status),
    retirementDigest,
  };
};

export const buildRivalSummaryFromHeadToHead = (
  rows: RivalHeadToHeadInput[],
): CareerNarrativeSummary['rivalDigest'] => {
  const candidate = rows
    .map((row) => {
      const decisiveLosses = Math.max(0, row.losses - row.wins);
      const closeness = row.bouts - Math.abs(row.wins - row.losses);
      const recency = Math.max(0, row.lastSeenSeq - row.firstSeenSeq);
      const score = row.bouts * 1.6 + closeness * 1.2 + decisiveLosses * 1.8 + recency * 0.12;
      const balance =
        row.wins === row.losses
          ? `五分 (${row.wins}勝${row.losses}敗)`
          : row.losses > row.wins
            ? `苦手 (${row.wins}勝${row.losses}敗)`
            : `勝ち越し (${row.wins}勝${row.losses}敗)`;
      const summary =
        row.losses > row.wins
          ? `${row.latestShikona}には通算${row.wins}勝${row.losses}敗。番付の節目ごとに前へ立たれやすかった。`
          : row.wins === row.losses
            ? `${row.latestShikona}とは通算五分で、時代を通して何度もぶつかった。`
            : `${row.latestShikona}とは多く対戦し、人生の輪郭を決める相手関係として残った。`;
      return {
        shikona: row.latestShikona,
        balance,
        summary,
        score,
      };
    })
    .filter((row) => row.score >= 8)
    .sort((left, right) => right.score - left.score)[0];

  if (!candidate) return undefined;
  return {
    shikona: candidate.shikona,
    balance: candidate.balance,
    summary: candidate.summary,
  };
};

export const withRivalSummary = (
  status: RikishiStatus,
  rows: RivalHeadToHeadInput[],
): RikishiStatus => {
  const rivalDigest = buildRivalSummaryFromHeadToHead(rows);
  if (!rivalDigest) return status;
  return {
    ...status,
    careerNarrative: {
      ...(status.careerNarrative ?? buildCareerNarrativeSummary(status)),
      rivalDigest,
    },
  };
};

export const ensureCareerRecordStatus = (status: RikishiStatus): RikishiStatus => {
  const next = normalizeTraitProgress({ ...status });
  next.spirit = Number.isFinite(next.spirit) ? next.spirit : 70;
  next.history = ensureCareerHistory({ ...next.history });
  next.history.highlightEvents = inferHighlightEvents(next);
  next.history.careerTurningPoints = inferCareerTurningPoints(next);
  next.history.careerTurningPoint = next.history.careerTurningPoints[0];
  next.careerNarrative = buildCareerNarrativeSummary(next);
  return next;
};
