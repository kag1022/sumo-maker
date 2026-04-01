import { CONSTANTS } from './constants';
import {
  BashoRecord,
  Rank,
  RikishiStatus,
  TimelineEvent,
  Trait,
  TraitAwakening,
  TraitJourneyEntry,
  TraitJourneySource,
} from './models';
import type { ImportantTorikumiNote, PlayerBoutDetail } from './simulation/basho';

const TRAIT_JOURNEY_ORDER: Trait[] = [
  'OOBUTAI_NO_ONI',
  'KYOUSHINZOU',
  'TRAILING_FIRE',
  'KIBUNYA',
  'TETSUJIN',
  'READ_THE_BOUT',
  'BUJI_KORE_MEIBA',
  'RECOVERY_MONSTER',
  'LONG_REACH',
  'HEAVY_PRESSURE',
  'GLASS_KNEE',
];

const TRAIT_JOURNEY_INDEX = new Map(TRAIT_JOURNEY_ORDER.map((trait, index) => [trait, index]));
const MAJOR_INJURY_PATTERN = /重症度 ([7-9]|10)/;

export const TRAIT_CATEGORY_LABELS: Record<string, string> = {
  BODY: '体質',
  MENTAL: '精神',
  TECHNIQUE: '技術',
};

const isKachikoshi = (record: BashoRecord): boolean => record.wins > record.losses;

const dedupeTraits = (traits: Trait[]): Trait[] => {
  const seen = new Set<Trait>();
  const result: Trait[] = [];
  for (const trait of traits) {
    if (seen.has(trait)) continue;
    seen.add(trait);
    result.push(trait);
  }
  return result;
};

const sortLockedEntries = (entries: TraitJourneyEntry[]): TraitJourneyEntry[] =>
  entries.slice().sort((left, right) => {
    const leftIndex = TRAIT_JOURNEY_INDEX.get(left.trait) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = TRAIT_JOURNEY_INDEX.get(right.trait) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });

const sortLearnedEntries = (entries: TraitJourneyEntry[]): TraitJourneyEntry[] =>
  entries.slice().sort((left, right) => {
    const leftSeq = left.learnedAtBashoSeq;
    const rightSeq = right.learnedAtBashoSeq;
    if (typeof leftSeq === 'number' && typeof rightSeq === 'number' && leftSeq !== rightSeq) {
      return leftSeq - rightSeq;
    }
    if (typeof leftSeq === 'number' && typeof rightSeq !== 'number') return -1;
    if (typeof leftSeq !== 'number' && typeof rightSeq === 'number') return 1;
    const leftIndex = TRAIT_JOURNEY_INDEX.get(left.trait) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = TRAIT_JOURNEY_INDEX.get(right.trait) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });

const mergeJourneyEntries = (entries: TraitJourneyEntry[]): TraitJourneyEntry[] => {
  const byTrait = new Map<Trait, TraitJourneyEntry>();
  for (const entry of entries) {
    const current = byTrait.get(entry.trait);
    if (!current) {
      byTrait.set(entry.trait, { ...entry });
      continue;
    }
    if (current.state === 'LOCKED' && entry.state === 'LEARNED') {
      byTrait.set(entry.trait, { ...current, ...entry });
      continue;
    }
    byTrait.set(entry.trait, {
      ...current,
      ...entry,
      source: current.source,
    });
  }
  return [...byTrait.values()];
};

const createLegacyJourneyEntries = (traits: Trait[]): TraitJourneyEntry[] =>
  traits.map((trait) => ({
    trait,
    state: 'LEARNED',
    source: 'LEGACY',
    triggerLabel: '旧仕様で初期付与',
    triggerDetail: '段階習得化以前のキャリアから引き継がれた特性。',
    legacy: true,
  }));

export const buildLockedTraitJourney = (
  groups: Array<{ source: TraitJourneySource; traits: Trait[] }>,
): TraitJourneyEntry[] => {
  const entries: TraitJourneyEntry[] = [];
  const seen = new Set<Trait>();
  for (const group of groups) {
    for (const trait of group.traits) {
      if (seen.has(trait)) continue;
      seen.add(trait);
      entries.push({
        trait,
        state: 'LOCKED',
        source: group.source,
      });
    }
  }
  return sortLockedEntries(entries);
};

export const formatTraitAcquisitionLabel = (entry: TraitJourneyEntry): string => {
  if (entry.legacy) return '旧仕様キャリア';
  if (entry.learnedYear && entry.learnedMonth) return `${entry.learnedYear}年${entry.learnedMonth}月場所`;
  return '時期不明';
};

export const normalizeTraitProgress = (status: RikishiStatus): RikishiStatus => {
  const history = status.history;
  if (!history.traitAwakenings) history.traitAwakenings = [];

  const normalizedJourney = mergeJourneyEntries(
    status.traitJourney && status.traitJourney.length > 0
      ? status.traitJourney
      : status.traits.length > 0
        ? createLegacyJourneyEntries(status.traits)
        : [],
  );

  if (normalizedJourney.length > 0) {
    status.traitJourney = sortLockedEntries(
      normalizedJourney.filter((entry) => entry.state === 'LOCKED'),
    ).concat(sortLearnedEntries(normalizedJourney.filter((entry) => entry.state === 'LEARNED')));
  } else {
    status.traitJourney = [];
  }

  const learnedEntries = status.traitJourney.filter((entry) => entry.state === 'LEARNED');
  if (learnedEntries.length === 0) {
    status.traits = [];
    return status;
  }

  const shouldPreserveLegacyOrder =
    learnedEntries.every((entry) => entry.legacy) &&
    Array.isArray(status.traits) &&
    status.traits.length > 0;

  status.traits = shouldPreserveLegacyOrder
    ? dedupeTraits(status.traits)
    : dedupeTraits(sortLearnedEntries(learnedEntries).map((entry) => entry.trait));

  return status;
};

const hasCurrentTrait = (status: RikishiStatus, trait: Trait): boolean =>
  status.traitJourney?.some((entry) => entry.trait === trait && entry.state === 'LEARNED') ?? false;

const hasLockedTrait = (status: RikishiStatus, trait: Trait): boolean =>
  status.traitJourney?.some((entry) => entry.trait === trait && entry.state === 'LOCKED') ?? false;

const toTraitEventDescription = (trait: Trait, triggerLabel: string): string => {
  const traitData = CONSTANTS.TRAIT_DATA[trait];
  const verb = traitData?.isNegative ? '発現' : '開花';
  return `特性「${traitData?.name ?? trait}」が${verb}: ${triggerLabel}`;
};

const hasMajorInjuryAt = (events: TimelineEvent[], year: number, month: number): boolean =>
  events.some((event) =>
    event.type === 'INJURY' &&
    event.year === year &&
    event.month === month &&
    MAJOR_INJURY_PATTERN.test(event.description));

const getStreakRecords = (records: BashoRecord[], length: number): BashoRecord[] =>
  records.length >= length ? records.slice(records.length - length) : [];

const reachedTwoAndFourDeficit = (playerBouts: PlayerBoutDetail[]): boolean => {
  let wins = 0;
  let losses = 0;
  const bouts = playerBouts.slice().sort((left, right) => left.day - right.day);
  for (const bout of bouts) {
    if (bout.result === 'WIN') wins += 1;
    if (bout.result === 'LOSS' || bout.result === 'ABSENT') losses += 1;
    if (bout.day <= 8 && wins <= 2 && losses >= 4) {
      return true;
    }
  }
  return false;
};

const createAwakening = (
  status: RikishiStatus,
  trait: Trait,
  meta: {
    bashoSeq: number;
    year: number;
    month: number;
    triggerLabel: string;
    triggerDetail: string;
  },
): TraitAwakening => {
  const journey = status.traitJourney ?? [];
  const nextJourney = journey.map((entry) =>
    entry.trait === trait
      ? {
          ...entry,
          state: 'LEARNED' as const,
          learnedAtBashoSeq: meta.bashoSeq,
          learnedYear: meta.year,
          learnedMonth: meta.month,
          triggerLabel: meta.triggerLabel,
          triggerDetail: meta.triggerDetail,
          legacy: false,
        }
      : entry,
  );
  status.traitJourney = nextJourney;
  return {
    trait,
    bashoSeq: meta.bashoSeq,
    year: meta.year,
    month: meta.month,
    triggerLabel: meta.triggerLabel,
    triggerDetail: meta.triggerDetail,
  };
};

export interface TraitAwakeningEvaluationInput {
  status: RikishiStatus;
  bashoSeq: number;
  bashoRecord: BashoRecord;
  playerBouts: PlayerBoutDetail[];
  importantTorikumiNotes?: ImportantTorikumiNote[];
  currentRank: Rank;
  nextRank: Rank;
}

export const applyTraitAwakeningsForBasho = (
  input: TraitAwakeningEvaluationInput,
): { awakenings: TraitAwakening[]; events: TimelineEvent[] } => {
  normalizeTraitProgress(input.status);

  const awakenings: TraitAwakening[] = [];
  const events: TimelineEvent[] = [];
  const { status, bashoSeq, bashoRecord, currentRank, nextRank } = input;
  const records = status.history.records;
  const previousRecord = records.length >= 2 ? records[records.length - 2] : undefined;
  const currentPerformanceOverExpected =
    bashoRecord.performanceOverExpected ?? bashoRecord.wins - (bashoRecord.expectedWins ?? bashoRecord.wins);
  const previousPerformanceOverExpected =
    previousRecord?.performanceOverExpected ??
    (previousRecord ? previousRecord.wins - (previousRecord.expectedWins ?? previousRecord.wins) : undefined);
  const promotedToSekitori =
    currentRank.division !== 'Juryo' &&
    currentRank.division !== 'Makuuchi' &&
    (nextRank.division === 'Juryo' || nextRank.division === 'Makuuchi');
  const promotedToMakuuchi = currentRank.division === 'Juryo' && nextRank.division === 'Makuuchi';

  const tryAwaken = (
    trait: Trait,
    condition: boolean,
    triggerLabel: string,
    triggerDetail: string,
  ) => {
    if (!condition || hasCurrentTrait(status, trait) || !hasLockedTrait(status, trait)) return;
    const awakening = createAwakening(status, trait, {
      bashoSeq,
      year: bashoRecord.year,
      month: bashoRecord.month,
      triggerLabel,
      triggerDetail,
    });
    awakenings.push(awakening);
    events.push({
      year: bashoRecord.year,
      month: bashoRecord.month,
      type: 'TRAIT_AWAKENING',
      description: toTraitEventDescription(trait, triggerLabel),
    });
  };

  tryAwaken(
    'LONG_REACH',
    Math.round(status.bodyMetrics.heightCm) >= 188,
    '188cm到達',
    `身長が${Math.round(status.bodyMetrics.heightCm)}cmに達し、長い間合いが土俵で武器として定着した。`,
  );

  tryAwaken(
    'HEAVY_PRESSURE',
    Math.round(status.bodyMetrics.weightKg) >= 155 && isKachikoshi(bashoRecord),
    '155kgで勝ち越し',
    `体重${Math.round(status.bodyMetrics.weightKg)}kgの圧力を勝ち越しへ繋げ、重さが勝ち筋として形になった。`,
  );

  tryAwaken(
    'READ_THE_BOUT',
    Boolean(previousRecord && (previousRecord.absent > 0 || previousRecord.wins <= previousRecord.losses) && isKachikoshi(bashoRecord)),
    '負け越し後の修正',
    '前場所の崩れを踏まえて相手への対応を修正し、次場所で勝ち越しへ立て直した。',
  );

  const wonBigStage =
    (bashoRecord.kinboshi ?? 0) > 0 ||
    bashoRecord.specialPrizes.length > 0 ||
    promotedToSekitori ||
    promotedToMakuuchi;
  const bigStageTrigger =
    (bashoRecord.kinboshi ?? 0) > 0
      ? `金星${bashoRecord.kinboshi}個獲得`
      : bashoRecord.specialPrizes.length > 0
        ? `三賞受賞: ${bashoRecord.specialPrizes.join('・')}`
        : promotedToMakuuchi
          ? '新入幕決定'
          : promotedToSekitori
            ? '関取到達'
            : '大一番の実績';

  tryAwaken(
    'KYOUSHINZOU',
    wonBigStage,
    bigStageTrigger,
    '注目が集まる局面で結果を残し、大一番に強い気質が特性として表面化した。',
  );

  const titleRaceNote = (input.importantTorikumiNotes ?? []).some((note) =>
    note.trigger === 'YUSHO_DIRECT' || note.trigger === 'YUSHO_PURSUIT' || note.trigger === 'YUSHO_RACE');
  tryAwaken(
    'OOBUTAI_NO_ONI',
    titleRaceNote && (bashoRecord.wins >= 10 || bashoRecord.yusho || bashoRecord.specialPrizes.length > 0),
    '優勝線で結果',
    '優勝争いの割で結果を残し、重圧のかかる土俵ほど力が出る性質が固まった。',
  );

  tryAwaken(
    'TRAILING_FIRE',
    reachedTwoAndFourDeficit(input.playerBouts) && isKachikoshi(bashoRecord),
    '劣勢からの勝ち越し',
    '序盤に大きく出遅れながらも勝ち越しまで戻し、追い込まれてから火が付く型が定着した。',
  );

  tryAwaken(
    'KIBUNYA',
    typeof previousPerformanceOverExpected === 'number' &&
      ((currentPerformanceOverExpected >= 3 && previousPerformanceOverExpected <= -3) ||
        (currentPerformanceOverExpected <= -3 && previousPerformanceOverExpected >= 3)),
    '極端な波が連続',
    '期待値から大きく上振れた場所と下振れた場所を続けて記録し、気分の波が強く出る型になった。',
  );

  const healthySix = getStreakRecords(records, 6);
  tryAwaken(
    'BUJI_KORE_MEIBA',
    healthySix.length === 6 && healthySix.every((record) => record.absent === 0),
    '6場所連続で休場なし',
    '六場所続けて休場せず土俵を守り、大崩れしにくい丈夫さが特性として定着した。',
  );

  tryAwaken(
    'RECOVERY_MONSTER',
    Boolean(previousRecord && previousRecord.absent > 0 && bashoRecord.absent === 0 && isKachikoshi(bashoRecord)),
    '休場明け勝ち越し',
    '休場を挟んだ直後に勝ち越しへ戻し、回復の速さがはっきり表に出た。',
  );

  const healthyTwelve = getStreakRecords(records, 12);
  const healthyTwelveWithoutMajorInjury =
    healthyTwelve.length === 12 &&
    healthyTwelve.every((record) => record.absent === 0) &&
    !healthyTwelve.some((record) => hasMajorInjuryAt(status.history.events, record.year, record.month));
  tryAwaken(
    'TETSUJIN',
    healthyTwelveWithoutMajorInjury,
    '12場所連続で休場なし',
    '一年間休場せず、重大な故障も挟まずに土俵を守り抜いたことで鉄人ぶりが完成した。',
  );

  tryAwaken(
    'GLASS_KNEE',
    status.injuries.some((injury) => injury.type === 'KNEE'),
    '膝の古傷が発現',
    '膝の故障が初めて履歴に刻まれ、以後の土俵人生に影を落とす弱点として表に出た。',
  );

  if (awakenings.length > 0) {
    const existing = new Set((status.history.traitAwakenings ?? []).map((entry) => entry.trait));
    status.history.traitAwakenings = [
      ...(status.history.traitAwakenings ?? []),
      ...awakenings.filter((entry) => !existing.has(entry.trait)),
    ];
    status.history.events.push(...events);
    normalizeTraitProgress(status);
  }

  return { awakenings, events };
};
