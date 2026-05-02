import {
  pushCareerTurningPoint,
  pushHighlightEvent,
  setCareerTurningPoint,
} from '../careerNarrative';
import { BashoRecord, Rank, RikishiStatus, TimelineEvent } from '../models';
import { PlayerStagnationResolution } from './playerRealism';

const STAGNATION_BAND_ORDER: Record<PlayerStagnationResolution['band'], number> = {
  NORMAL: 0,
  STALLED: 1,
  CRITICAL: 2,
};

const isLowerDivision = (rank: Rank): boolean =>
  rank.division === 'Makushita' ||
  rank.division === 'Sandanme' ||
  rank.division === 'Jonidan' ||
  rank.division === 'Jonokuchi';

const isSekitoriDivision = (rank: Rank): boolean =>
  rank.division === 'Juryo' || rank.division === 'Makuuchi';

export const appendStagnationAdvisoryEvent = ({
  events,
  year,
  month,
  before,
  after,
}: {
  events: TimelineEvent[];
  year: number;
  month: number;
  before: PlayerStagnationResolution;
  after: PlayerStagnationResolution;
}): TimelineEvent[] => {
  if (STAGNATION_BAND_ORDER[after.band] <= STAGNATION_BAND_ORDER[before.band]) {
    return events;
  }

  return [
    ...events,
    {
      year,
      month,
      type: 'OTHER',
      description:
        after.band === 'CRITICAL'
          ? '師匠の示唆: 稽古場の空気が重い。今場所を落とすと、土俵際ではなく力士人生そのものが苦しくなる。'
          : '師匠の示唆: 稽古場の空気が少し変わった。今の足踏みを次の場所へ持ち越すと、番付も先行きも苦しくなる。',
    },
  ];
};

export const recordBashoMilestones = ({
  status,
  bashoSeq,
  bashoRecord,
  currentRank,
  nextRank,
  events,
}: {
  status: RikishiStatus;
  bashoSeq: number;
  bashoRecord: BashoRecord;
  currentRank: Rank;
  nextRank: Rank;
  events: TimelineEvent[];
}): void => {
  if (bashoRecord.yusho) {
    pushHighlightEvent(status.history, {
      bashoSeq,
      year: bashoRecord.year,
      month: bashoRecord.month,
      tag: 'YUSHO',
      label: '優勝',
    });
    pushCareerTurningPoint(status.history, {
      bashoSeq,
      year: bashoRecord.year,
      month: bashoRecord.month,
      kind: 'YUSHO',
      label: currentRank.division === 'Makuuchi' ? '幕内優勝' : '優勝',
      reason:
        currentRank.division === 'Makuuchi'
          ? `${bashoRecord.year}年${bashoRecord.month}月に幕内優勝。力士人生の景色を変えた。`
          : `${bashoRecord.year}年${bashoRecord.month}月に${currentRank.division}で優勝。番付の流れを一段押し上げた。`,
      severity: currentRank.division === 'Makuuchi' ? 10 : currentRank.division === 'Juryo' ? 8 : 6,
    });
  }
  if ((bashoRecord.kinboshi ?? 0) > 0) {
    pushHighlightEvent(status.history, {
      bashoSeq,
      year: bashoRecord.year,
      month: bashoRecord.month,
      tag: 'KINBOSHI',
      label: '金星',
    });
  }
  if (events.some((event) => event.type === 'PROMOTION')) {
    pushHighlightEvent(status.history, {
      bashoSeq,
      year: bashoRecord.year,
      month: bashoRecord.month,
      tag: 'PROMOTION',
      label: '昇進',
    });
  }
  if (isLowerDivision(currentRank) && isSekitoriDivision(nextRank)) {
    pushHighlightEvent(status.history, {
      bashoSeq,
      year: bashoRecord.year,
      month: bashoRecord.month,
      tag: 'FIRST_SEKITORI',
      label: '初関取',
    });
    pushCareerTurningPoint(status.history, {
      bashoSeq,
      year: bashoRecord.year,
      month: bashoRecord.month,
      kind: 'FIRST_SEKITORI',
      label: '初関取',
      reason: `${bashoRecord.year}年${bashoRecord.month}月に関取へ届き、人生の見られ方が変わった。`,
      severity: 7,
    });
  }
  if (currentRank.division === 'Juryo' && nextRank.division === 'Makuuchi') {
    pushCareerTurningPoint(status.history, {
      bashoSeq,
      year: bashoRecord.year,
      month: bashoRecord.month,
      kind: 'MAKUUCHI_PROMOTION',
      label: '新入幕',
      reason: `${bashoRecord.year}年${bashoRecord.month}月を越えて新入幕。相撲人生の主戦場が変わった。`,
      severity: 8,
    });
  }
  if (currentRank.division === 'Juryo' && nextRank.division === 'Makushita') {
    pushHighlightEvent(status.history, {
      bashoSeq,
      year: bashoRecord.year,
      month: bashoRecord.month,
      tag: 'JURYO_DROP',
      label: '十両陥落',
    });
    pushCareerTurningPoint(status.history, {
      bashoSeq,
      year: bashoRecord.year,
      month: bashoRecord.month,
      kind: 'JURYO_DROP',
      label: '十両陥落',
      reason: `${bashoRecord.year}年${bashoRecord.month}月に関取の座を失い、人生の重心が揺れた。`,
      severity: 7,
    });
  }

  const majorInjuryEvent = events.find((event) => event.type === 'INJURY' && /重症度 (\d+)/.test(event.description));
  if (!majorInjuryEvent) return;

  const severityMatch = majorInjuryEvent.description.match(/重症度 (\d+)/);
  const severity = severityMatch ? Number(severityMatch[1]) : 0;
  if (severity < 7) return;

  pushHighlightEvent(status.history, {
    bashoSeq,
    year: bashoRecord.year,
    month: bashoRecord.month,
    tag: 'MAJOR_INJURY',
    label: '大怪我',
  });
  setCareerTurningPoint(status.history, {
    bashoSeq,
    year: bashoRecord.year,
    month: bashoRecord.month,
    kind: 'MAJOR_INJURY',
    label: '大怪我',
    reason: majorInjuryEvent.description,
    severity,
  });
};

export const recordSlumpRecoveryMilestone = ({
  status,
  bashoSeq,
  bashoRecord,
  stagnationPressureBeforeBasho,
}: {
  status: RikishiStatus;
  bashoSeq: number;
  bashoRecord: BashoRecord;
  stagnationPressureBeforeBasho: number;
}): void => {
  if (
    stagnationPressureBeforeBasho < 3 ||
    (status.stagnation?.pressure ?? 0) > 1 ||
    bashoRecord.wins < 10 ||
    bashoRecord.wins <= bashoRecord.losses + bashoRecord.absent
  ) {
    return;
  }

  pushCareerTurningPoint(status.history, {
    bashoSeq,
    year: bashoRecord.year,
    month: bashoRecord.month,
    kind: 'SLUMP_RECOVERY',
    label: '停滞脱出',
    reason: `${bashoRecord.year}年${bashoRecord.month}月に勝ち星をまとめ、長い停滞から立て直した。`,
    severity: 6,
  });
};
