import { Rank } from '../models';
import { BashoStepResult, CompletedStepResult } from './engine/types';

export type SimulationChapterKind =
  | 'DEBUT'
  | 'SEKITORI'
  | 'SANYAKU'
  | 'TITLE_RACE'
  | 'INJURY'
  | 'RETIREMENT'
  | 'EPILOGUE';

export interface SimulationObservationEntry {
  seq: number;
  year: number;
  month: number;
  kind: 'milestone' | 'result' | 'danger' | 'closing';
  chapterKind: SimulationChapterKind | null;
  headline: string;
  detail: string;
}

export type SimulationRuntimePacing = 'chaptered' | 'observe' | 'skip_to_end';

export interface RuntimeChapterCopy {
  chapterTitle: string;
  chapterReason: string;
  heroMoment: string;
  nextBeatLabel: string;
}

export interface RuntimeNarrativeStep {
  chapterKind: SimulationChapterKind | null;
  markChapterKind: SimulationChapterKind | null;
  observation: SimulationObservationEntry;
  chapterCopy: RuntimeChapterCopy;
  pauseForChapter: boolean;
}

const formatRankName = (rank: Rank): string => {
  if (rank.name === '前相撲') return rank.name;
  const side = rank.side === 'West' ? '西' : rank.side === 'East' ? '東' : '';
  if (['横綱', '大関', '関脇', '小結'].includes(rank.name)) {
    return `${side}${rank.name}`;
  }
  return `${side}${rank.name}${rank.number || 1}枚目`;
};

const hasTitleRaceSignal = (step: BashoStepResult): boolean =>
  step.playerRecord.rank.division === 'Makuuchi' && (
    step.playerRecord.yusho === true ||
    step.importantTorikumiNotes?.some((note) =>
      note.trigger === 'YUSHO_DIRECT' ||
      note.trigger === 'YUSHO_PURSUIT' ||
      note.trigger === 'YUSHO_RACE',
    ) === true ||
    step.playerRecord.wins >= 10
  );

const resolveChapterKind = (
  step: BashoStepResult | CompletedStepResult,
  seenChapterKinds: ReadonlySet<SimulationChapterKind>,
): SimulationChapterKind | null => {
  if (step.kind === 'COMPLETED') {
    const hasRetirement = step.domainEvents?.some((event) => event.kind === 'RETIREMENT') === true
      || step.events.some((event) => event.type === 'RETIREMENT');
    return hasRetirement && !seenChapterKinds.has('RETIREMENT')
      ? 'RETIREMENT'
      : !seenChapterKinds.has('EPILOGUE')
        ? 'EPILOGUE'
        : null;
  }

  if (step.seq === 1 && !seenChapterKinds.has('DEBUT')) return 'DEBUT';
  if (
    step.playerRecord.rank.division === 'Juryo' &&
    !seenChapterKinds.has('SEKITORI')
  ) {
    return 'SEKITORI';
  }
  if (
    ['関脇', '小結', '大関', '横綱'].includes(step.playerRecord.rank.name) &&
    !seenChapterKinds.has('SANYAKU')
  ) {
    return 'SANYAKU';
  }
  if (hasTitleRaceSignal(step) && !seenChapterKinds.has('TITLE_RACE')) {
    return 'TITLE_RACE';
  }
  if (
    (step.pauseReason === 'INJURY' ||
      step.domainEvents?.some((event) => event.kind === 'MAJOR_INJURY') === true ||
      step.events.some((event) => event.type === 'INJURY')) &&
    !seenChapterKinds.has('INJURY')
  ) {
    return 'INJURY';
  }

  return null;
};

const buildObservation = (
  step: BashoStepResult | CompletedStepResult,
  chapterKind: SimulationChapterKind | null,
): SimulationObservationEntry => {
  if (step.kind === 'COMPLETED') {
    const finalRank = formatRankName(step.statusSnapshot.history.maxRank);
    const retired = step.events.find((event) => event.type === 'RETIREMENT');
    return {
      seq: step.progress.bashoCount,
      year: step.progress.year,
      month: step.progress.month,
      kind: chapterKind === 'RETIREMENT' ? 'closing' : 'milestone',
      chapterKind,
      headline: chapterKind === 'RETIREMENT' ? '土俵を去る時が来た' : '一代の記録が閉じた',
      detail:
        retired?.description ??
        `最高位 ${finalRank} / 通算 ${step.statusSnapshot.history.totalWins}勝${step.statusSnapshot.history.totalLosses}敗`,
    };
  }

  const stagnationWarning = step.events.find((row) =>
    row.type === 'OTHER' && row.description.startsWith('師匠の示唆:'));
  const event = step.events.find((row) => row.type === 'RETIREMENT')
    ?? step.events.find((row) => row.type === 'YUSHO')
    ?? step.events.find((row) => row.type === 'PROMOTION')
    ?? step.events.find((row) => row.type === 'INJURY');
  const recordText = `${step.playerRecord.wins}勝${step.playerRecord.losses}敗${step.playerRecord.absent > 0 ? ` ${step.playerRecord.absent}休` : ''}`;
  const rankLabel = formatRankName(step.playerRecord.rank);

  return {
    seq: step.seq,
    year: step.year,
    month: step.month,
    kind:
      stagnationWarning
        ? 'danger'
        :
        chapterKind === 'INJURY'
          ? 'danger'
          : chapterKind === 'TITLE_RACE' || chapterKind === 'SEKITORI' || chapterKind === 'SANYAKU' || chapterKind === 'DEBUT'
            ? 'milestone'
            : 'result',
    chapterKind,
    headline:
      stagnationWarning
        ? `${step.year}年${step.month}月場所で空気が変わる`
        : chapterKind === 'DEBUT'
          ? `${step.year}年${step.month}月場所で初土俵を踏む`
          : chapterKind === 'SEKITORI'
            ? `${step.year}年${step.month}月場所で関取に届く`
            : chapterKind === 'SANYAKU'
              ? `${step.year}年${step.month}月場所で三役の景色へ入る`
              : chapterKind === 'TITLE_RACE'
                ? `${step.year}年${step.month}月場所で優勝線に絡む`
                : chapterKind === 'INJURY'
                  ? `${step.year}年${step.month}月場所で影が差す`
                  : `${step.year}年${step.month}月場所を見届けた`,
    detail: stagnationWarning?.description ?? event?.description ?? `${rankLabel}で ${recordText}`,
  };
};

const buildChapterCopy = (
  chapterKind: SimulationChapterKind | null,
  observation: SimulationObservationEntry,
): RuntimeChapterCopy => {
  if (!chapterKind) {
    return {
      chapterTitle: '場所の観測',
      chapterReason: 'この場所は節目ではありませんが、流れを読むための観測点として扱います。',
      heroMoment: observation.detail,
      nextBeatLabel: '次へ進む',
    };
  }
  if (chapterKind === 'DEBUT') {
    return {
      chapterTitle: '初土俵',
      chapterReason: 'ここが相撲人生の最初の記録です。才能ではなく、入口の条件が初めて実際の番付へ触れます。',
      heroMoment: observation.detail,
      nextBeatLabel: '次の節目へ進む',
    };
  }
  if (chapterKind === 'SEKITORI') {
    return {
      chapterTitle: '関取到達',
      chapterReason: '十両に届いた瞬間から、力士としての見られ方が変わります。ここから一代の輪郭が一段濃くなります。',
      heroMoment: observation.detail,
      nextBeatLabel: '次の節目を読む',
    };
  }
  if (chapterKind === 'SANYAKU') {
    return {
      chapterTitle: '三役の景色',
      chapterReason: '三役に入ると、番付表の中での役割も対戦の重みも変わります。',
      heroMoment: observation.detail,
      nextBeatLabel: '次の節目を読む',
    };
  }
  if (chapterKind === 'TITLE_RACE') {
    return {
      chapterTitle: '優勝線',
      chapterReason: 'この場所は、単なる勝ち越しではなく賜杯の文脈で読まれる段階に入っています。',
      heroMoment: observation.detail,
      nextBeatLabel: '次の節目を読む',
    };
  }
  if (chapterKind === 'INJURY') {
    return {
      chapterTitle: '休場の影',
      chapterReason: '怪我や休場は、能力値ではなく人生の流れそのものを曲げます。ここがその分岐点です。',
      heroMoment: observation.detail,
      nextBeatLabel: 'その後を読む',
    };
  }
  if (chapterKind === 'RETIREMENT') {
    return {
      chapterTitle: '引退',
      chapterReason: '土俵人生はここで閉じます。この場面を読んだあと、記録帳で一代全体を読み返します。',
      heroMoment: observation.detail,
      nextBeatLabel: '記録帳を開く',
    };
  }
  return {
    chapterTitle: '最終総括',
    chapterReason: 'この一代を短く総括したあと、記録帳で詳しく読めます。',
    heroMoment: observation.detail,
    nextBeatLabel: '記録帳を開く',
  };
};

const shouldPauseForChapter = (
  pacing: SimulationRuntimePacing,
  chapterKind: SimulationChapterKind | null,
  observation: SimulationObservationEntry,
): boolean =>
  pacing === 'chaptered' && (chapterKind !== null || observation.kind === 'danger');

export const resolveRuntimeNarrativeStep = ({
  step,
  seenChapterKinds,
  pacing,
  completedFallbackChapterKind,
}: {
  step: BashoStepResult | CompletedStepResult;
  seenChapterKinds: ReadonlySet<SimulationChapterKind>;
  pacing: SimulationRuntimePacing;
  completedFallbackChapterKind?: SimulationChapterKind;
}): RuntimeNarrativeStep => {
  const resolvedChapterKind = resolveChapterKind(step, seenChapterKinds);
  const chapterKind =
    step.kind === 'COMPLETED'
      ? resolvedChapterKind ?? completedFallbackChapterKind ?? null
      : resolvedChapterKind;
  const observation = buildObservation(step, chapterKind);
  return {
    chapterKind,
    markChapterKind: resolvedChapterKind,
    observation,
    chapterCopy: buildChapterCopy(chapterKind, observation),
    pauseForChapter: shouldPauseForChapter(pacing, chapterKind, observation),
  };
};
