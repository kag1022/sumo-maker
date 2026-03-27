import fs from 'fs';
import path from 'path';
import { createFacedMap } from '../../src/logic/simulation/matchmaking';
import { DEFAULT_TORIKUMI_BOUNDARY_BANDS } from '../../src/logic/simulation/torikumi/policy';
import { scheduleTorikumiBasho } from '../../src/logic/simulation/torikumi/scheduler';
import { TorikumiParticipant } from '../../src/logic/simulation/torikumi/types';

type QuickSummary = {
  generatedAt: string;
  verdict: {
    overall: 'PASS' | 'WARN';
    headline: string;
  };
  checks: {
    makuuchiJuryoCrossCount: number;
    juryoMakushitaCrossCount: number;
    lowerBoundaryCrossCount: number;
    lateDirectTitleBoutCount: number;
    scheduleViolationCount: number;
  };
  signals: {
    juryoMakushitaReasons: string[];
    lowerBoundaryIds: string[];
    titlePair?: string;
  };
};

const REPORT_PATH = path.join('docs', 'balance', 'torikumi-quick-checks.md');
const JSON_PATH = path.join('.tmp', 'torikumi-quick-checks.json');

const writeFile = (filePath: string, text: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
};

const createParticipant = (
  id: string,
  division: TorikumiParticipant['division'],
  rankName: string,
  rankNumber: number,
  stableId: string,
): TorikumiParticipant => ({
  id,
  shikona: id,
  isPlayer: false,
  stableId,
  division,
  rankScore: rankNumber * 2 - 1,
  rankName,
  rankNumber,
  power: 80,
  wins: 0,
  losses: 0,
  active: true,
  targetBouts: division === 'Makuuchi' || division === 'Juryo' ? 15 : 7,
  boutsDone: 0,
});

const buildSekitoriSeparationScenario = (): TorikumiParticipant[] => [
  createParticipant('M16E', 'Makuuchi', '前頭', 16, 'm-a'),
  createParticipant('M17W', 'Makuuchi', '前頭', 17, 'm-b'),
  createParticipant('J1E', 'Juryo', '十両', 1, 'j-a'),
  createParticipant('J2W', 'Juryo', '十両', 2, 'j-b'),
];

const buildJuryoMakushitaScenario = (): TorikumiParticipant[] => [
  { ...createParticipant('J13E', 'Juryo', '十両', 13, 'j-a'), wins: 5, losses: 8, boutsDone: 13 },
  { ...createParticipant('J14W', 'Juryo', '十両', 14, 'j-b'), wins: 4, losses: 9, boutsDone: 13 },
  { ...createParticipant('MS2E', 'Makushita', '幕下', 2, 'm-a'), wins: 5, losses: 1, boutsDone: 6 },
  { ...createParticipant('MS4W', 'Makushita', '幕下', 4, 'm-b'), wins: 4, losses: 2, boutsDone: 6 },
];

const buildLowerBoundaryScenario = (): TorikumiParticipant[] => [
  { ...createParticipant('MS59E', 'Makushita', '幕下', 59, 'ms-stable'), wins: 3, losses: 3, boutsDone: 6 },
  { ...createParticipant('MS60W', 'Makushita', '幕下', 60, 'ms-stable'), wins: 2, losses: 4, boutsDone: 6 },
  { ...createParticipant('SD1E', 'Sandanme', '三段目', 1, 'sd-stable'), wins: 5, losses: 1, boutsDone: 6 },
  { ...createParticipant('SD3W', 'Sandanme', '三段目', 3, 'sd-stable'), wins: 4, losses: 2, boutsDone: 6 },
];

const buildTitleScenario = (): TorikumiParticipant[] => [
  { ...createParticipant('Y1', 'Makuuchi', '横綱', 1, 'y-a'), wins: 12, losses: 1, rankScore: 1, rankNumber: 1 },
  { ...createParticipant('O1', 'Makuuchi', '大関', 1, 'o-b'), wins: 12, losses: 1, rankScore: 2, rankNumber: 1 },
  { ...createParticipant('M1E', 'Makuuchi', '前頭', 1, 'm-c'), wins: 10, losses: 3 },
  { ...createParticipant('M2W', 'Makuuchi', '前頭', 2, 'm-d'), wins: 9, losses: 4 },
];

const run = (): void => {
  const sekitoriParticipants = buildSekitoriSeparationScenario();
  const sekitoriResult = scheduleTorikumiBasho({
    participants: sekitoriParticipants,
    days: [13],
    boundaryBands: DEFAULT_TORIKUMI_BOUNDARY_BANDS.filter((band) => band.id === 'MakuuchiJuryo'),
    facedMap: createFacedMap(sekitoriParticipants),
    dayEligibility: () => true,
  });

  const exchangeParticipants = buildJuryoMakushitaScenario();
  const exchangeResult = scheduleTorikumiBasho({
    participants: exchangeParticipants,
    days: [14],
    boundaryBands: DEFAULT_TORIKUMI_BOUNDARY_BANDS.filter((band) => band.id === 'JuryoMakushita'),
    facedMap: createFacedMap(exchangeParticipants),
    dayEligibility: () => true,
  });

  const lowerParticipants = buildLowerBoundaryScenario();
  const lowerResult = scheduleTorikumiBasho({
    participants: lowerParticipants,
    days: [15],
    boundaryBands: DEFAULT_TORIKUMI_BOUNDARY_BANDS.filter((band) => band.id === 'MakushitaSandanme'),
    facedMap: createFacedMap(lowerParticipants),
    dayEligibility: () => true,
  });

  const titleParticipants = buildTitleScenario();
  const titleResult = scheduleTorikumiBasho({
    participants: titleParticipants,
    days: [13],
    boundaryBands: [],
    facedMap: createFacedMap(titleParticipants),
    dayEligibility: () => true,
  });

  const makuuchiJuryoCrossCount = sekitoriResult.days[0]?.pairs.filter((pair) => pair.boundaryId === 'MakuuchiJuryo').length ?? 0;
  const juryoMakushitaPairs = exchangeResult.days[0]?.pairs.filter((pair) => pair.boundaryId === 'JuryoMakushita') ?? [];
  const lowerBoundaryPairs = lowerResult.days[0]?.pairs.filter((pair) => pair.boundaryId === 'MakushitaSandanme') ?? [];
  const titlePair = titleResult.days[0]?.pairs.find((pair) => pair.matchReason === 'YUSHO_DIRECT');
  const scheduleViolationCount =
    sekitoriResult.diagnostics.scheduleViolations.length +
    exchangeResult.diagnostics.scheduleViolations.length +
    lowerResult.diagnostics.scheduleViolations.length +
    titleResult.diagnostics.scheduleViolations.length;

  const summary: QuickSummary = {
    generatedAt: new Date().toISOString(),
    verdict:
      makuuchiJuryoCrossCount === 0 &&
      juryoMakushitaPairs.length > 0 &&
      lowerBoundaryPairs.length > 0 &&
      (titleResult.diagnostics.lateDirectTitleBoutCount ?? 0) > 0 &&
      scheduleViolationCount === 0
        ? {
          overall: 'PASS',
          headline: '本割 quick check では重大な崩れは検出されませんでした。',
        }
        : {
          overall: 'WARN',
          headline: '本割 quick check で仕様逸脱シグナルが出ています。',
        },
    checks: {
      makuuchiJuryoCrossCount,
      juryoMakushitaCrossCount: juryoMakushitaPairs.length,
      lowerBoundaryCrossCount: lowerBoundaryPairs.length,
      lateDirectTitleBoutCount: titleResult.diagnostics.lateDirectTitleBoutCount,
      scheduleViolationCount,
    },
    signals: {
      juryoMakushitaReasons: juryoMakushitaPairs.map((pair) => pair.matchReason),
      lowerBoundaryIds: lowerBoundaryPairs.map((pair) => pair.boundaryId ?? 'NONE'),
      titlePair: titlePair ? `${titlePair.a.id} vs ${titlePair.b.id}` : undefined,
    },
  };

  const report = [
    '# 本割 Quick Check',
    '',
    `- 実行日: ${summary.generatedAt}`,
    `- 総合判定: ${summary.verdict.overall}`,
    `- 所見: ${summary.verdict.headline}`,
    '',
    '## 主要チェック',
    '',
    `- 幕内-十両 regular 越境戦: ${summary.checks.makuuchiJuryoCrossCount}件`,
    `- 十両-幕下 交換戦: ${summary.checks.juryoMakushitaCrossCount}件`,
    `- 下位境界戦: ${summary.checks.lowerBoundaryCrossCount}件`,
    `- 終盤優勝直接戦: ${summary.checks.lateDirectTitleBoutCount}件`,
    `- schedule violation: ${summary.checks.scheduleViolationCount}件`,
    '',
    '## シグナル',
    '',
    `- 十両-幕下の理由: ${summary.signals.juryoMakushitaReasons.join(' / ') || 'なし'}`,
    `- 下位境界 ID: ${summary.signals.lowerBoundaryIds.join(' / ') || 'なし'}`,
    `- 優勝直接戦: ${summary.signals.titlePair ?? 'なし'}`,
    '',
  ].join('\n');

  writeFile(JSON_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  writeFile(REPORT_PATH, report);
  console.log(report);
};

run();
