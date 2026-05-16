import fs from 'fs';
import path from 'path';
import { getRankValueForChart } from '../../src/logic/ranking/rankScore';
import { createSimulationEngine, createSeededRandom } from '../../src/logic/simulation/engine';
import { Rank, RikishiStatus } from '../../src/logic/models';
import type {
  BanzukeCalibrationTarget,
  BanzukeMovementQuantiles,
} from '../../src/logic/calibration/types';

type Scenario = {
  name: string;
  initial: RikishiStatus;
  seeds: number;
  steps: number;
};

type QuantileSummary = {
  key: string;
  count: number;
  p10: number;
  p50: number;
  p90: number;
  min: number;
  max: number;
};

type ComparisonKey =
  | 'MakuuchiStayed'
  | 'JuryoStayed'
  | 'MakushitaStayed'
  | 'JuryoToMakuuchi'
  | 'MakuuchiToJuryo'
  | 'MakushitaToJuryo'
  | 'JuryoToMakushita';

type ComparisonRow = {
  key: ComparisonKey;
  label: string;
  sampleSize: number;
  actual: {
    p10HalfStep: number;
    p50HalfStep: number;
    p90HalfStep: number;
  } | null;
  historical: BanzukeMovementQuantiles | null;
  heiseiReference: BanzukeMovementQuantiles | null;
  pass: boolean | null;
  note?: string;
};

const ROOT_DIR = process.cwd();
const RUNTIME_TARGET_PATH = path.join(ROOT_DIR, 'sumo-api-db', 'data', 'analysis', 'banzuke_calibration_long_range.json');
const HEISEI_TARGET_PATH = path.join(ROOT_DIR, 'sumo-db', 'data', 'analysis', 'banzuke_calibration_heisei.json');
const REPORT_PATH = path.join(ROOT_DIR, 'docs', 'balance', 'banzuke-quantile-report.md');
const JSON_PATH = path.join(ROOT_DIR, '.tmp', 'banzuke-quantile-report.json');

const toHalfStep = (rank: Rank): number => {
  const side = rank.side === 'West' ? 1 : 0;
  return getRankValueForChart(rank) * 2 + side;
};

const createStatus = (rank: Rank, base: number): RikishiStatus => ({
  stableId: 'stable-001',
  ichimonId: 'TAIJU',
  stableArchetypeId: 'MASTER_DISCIPLE',
  shikona: '分析山',
  entryAge: 15,
  age: 23,
  rank,
  stats: {
    tsuki: base,
    oshi: base,
    kumi: base,
    nage: base,
    koshi: base,
    deashi: base,
    waza: base,
    power: base,
  },
  potential: 74,
  growthType: 'NORMAL',
  tactics: 'BALANCE',
  archetype: 'HARD_WORKER',
  aptitudeTier: 'B',
  aptitudeFactor: 1,
  signatureMoves: ['寄り切り'],
  bodyType: 'NORMAL',
  profile: {
    realName: '分析 太郎',
    birthplace: '東京都',
    personality: 'CALM',
  },
  bodyMetrics: {
    heightCm: 182,
    weightKg: 142,
  },
  traits: [],
  durability: 84,
  currentCondition: 54,
  ratingState: {
    ability: base * 1.04,
    form: 0,
    uncertainty: 2.1,
  },
  injuryLevel: 0,
  injuries: [],
  isOzekiKadoban: false,
  isOzekiReturn: false,
  spirit: 70,
  history: {
    records: [],
    events: [],
    maxRank: rank,
    totalWins: 0,
    totalLosses: 0,
    totalAbsent: 0,
    yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
    kimariteTotal: {},
  },
  statHistory: [],
});

const scenarios: Scenario[] = [
  {
    name: 'M8_balanced',
    initial: createStatus({ division: 'Makuuchi', name: '前頭', number: 8, side: 'East' }, 90),
    seeds: 16,
    steps: 12,
  },
  {
    name: 'J8_balanced',
    initial: createStatus({ division: 'Juryo', name: '十両', number: 8, side: 'East' }, 95),
    seeds: 14,
    steps: 14,
  },
  {
    name: 'J2_strong',
    initial: createStatus({ division: 'Juryo', name: '十両', number: 2, side: 'East' }, 128),
    seeds: 12,
    steps: 10,
  },
  {
    name: 'Ms35_strong',
    initial: createStatus({ division: 'Makushita', name: '幕下', number: 35, side: 'East' }, 130),
    seeds: 14,
    steps: 12,
  },
];

const quantile = (sorted: number[], q: number): number => {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const t = pos - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * t;
};

const summarize = (key: string, values: number[]): QuantileSummary => {
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    key,
    count: sorted.length,
    p10: Number(quantile(sorted, 0.1).toFixed(2)),
    p50: Number(quantile(sorted, 0.5).toFixed(2)),
    p90: Number(quantile(sorted, 0.9).toFixed(2)),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
};

const writeFile = (filePath: string, text: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
};

const loadCalibrationTarget = (filePath: string): BanzukeCalibrationTarget => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Banzuke calibration target is missing: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as BanzukeCalibrationTarget;
};

const buildComparisonKeys = (_target: BanzukeCalibrationTarget): ComparisonKey[] => [
  'MakuuchiStayed',
  'JuryoStayed',
  'MakushitaStayed',
  'JuryoToMakuuchi',
  'MakuuchiToJuryo',
  'MakushitaToJuryo',
  'JuryoToMakushita',
];

const toActualQuantiles = (values: number[]) => {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    p10HalfStep: Number(quantile(sorted, 0.1).toFixed(2)),
    p50HalfStep: Number(quantile(sorted, 0.5).toFixed(2)),
    p90HalfStep: Number(quantile(sorted, 0.9).toFixed(2)),
  };
};

const resolveHistoricalTarget = (
  target: BanzukeCalibrationTarget,
  key: ComparisonKey,
): BanzukeMovementQuantiles | null => {
  switch (key) {
    case 'MakuuchiStayed':
      return target.divisionMovementQuantiles.Makuuchi.stayed;
    case 'JuryoStayed':
      return target.divisionMovementQuantiles.Juryo.stayed;
    case 'MakushitaStayed':
      return target.divisionMovementQuantiles.Makushita.stayed;
    case 'JuryoToMakuuchi':
      return target.divisionMovementQuantiles.Juryo.promoted;
    case 'MakuuchiToJuryo':
      return target.divisionMovementQuantiles.Makuuchi.demoted;
    case 'MakushitaToJuryo':
      return target.divisionMovementQuantiles.Makushita.promoted;
    case 'JuryoToMakushita':
      return target.divisionMovementQuantiles.Juryo.demoted;
    default:
      return null;
  }
};

const matchComparisonKey = (key: ComparisonKey, before: Rank, after: Rank): boolean => {
  switch (key) {
    case 'MakuuchiStayed':
      return before.division === 'Makuuchi' && after.division === 'Makuuchi';
    case 'JuryoStayed':
      return before.division === 'Juryo' && after.division === 'Juryo';
    case 'MakushitaStayed':
      return before.division === 'Makushita' && after.division === 'Makushita';
    case 'JuryoToMakuuchi':
      return before.division === 'Juryo' && after.division === 'Makuuchi';
    case 'MakuuchiToJuryo':
      return before.division === 'Makuuchi' && after.division === 'Juryo';
    case 'MakushitaToJuryo':
      return before.division === 'Makushita' && after.division === 'Juryo';
    case 'JuryoToMakushita':
      return before.division === 'Juryo' && after.division === 'Makushita';
    default:
      return false;
  }
};

const comparisonLabelMap: Record<ComparisonKey, string> = {
  MakuuchiStayed: '幕内残留の移動幅',
  JuryoStayed: '十両残留の移動幅',
  MakushitaStayed: '幕下残留の移動幅',
  JuryoToMakuuchi: '十両→幕内の移動幅',
  MakuuchiToJuryo: '幕内→十両の移動幅',
  MakushitaToJuryo: '幕下→十両の移動幅',
  JuryoToMakushita: '十両→幕下の移動幅',
};

const run = async (): Promise<void> => {
  const banzukeTarget = loadCalibrationTarget(RUNTIME_TARGET_PATH);
  const heiseiReferenceTarget = loadCalibrationTarget(HEISEI_TARGET_PATH);
  const comparisonKeys = buildComparisonKeys(banzukeTarget);

  let transitions = 0;
  const bucket = new Map<string, number[]>();
  const allTransitions: Array<{ before: Rank; after: Rank; deltaHalfStep: number }> = [];

  for (const scenario of scenarios) {
    for (let seed = 1; seed <= scenario.seeds; seed += 1) {
      const random = createSeededRandom(seed * 6151 + scenario.name.length * 131);
      const engine = createSimulationEngine(
        {
          initialStats: JSON.parse(JSON.stringify(scenario.initial)) as RikishiStatus,
          oyakata: null,
          banzukeEngineVersion: 'optimizer-v2',
        },
        {
          random,
          getCurrentYear: () => 2026,
          yieldControl: async () => {},
        },
      );
      for (let i = 0; i < scenario.steps; i += 1) {
        const step = await engine.runNextBasho();
        if (step.kind !== 'BASHO') break;
        transitions += 1;
        const before = step.playerRecord.rank;
        const after = step.statusSnapshot!.rank;
        const deltaHalfStep = toHalfStep(before) - toHalfStep(after);
        const key = `${before.division}:${step.playerRecord.wins}-${step.playerRecord.losses}-${step.playerRecord.absent}`;
        const list = bucket.get(key) ?? [];
        list.push(deltaHalfStep);
        bucket.set(key, list);
        allTransitions.push({ before, after, deltaHalfStep });
      }
    }
  }

  const recordBucketQuantiles = [...bucket.entries()]
    .filter(([, values]) => values.length >= 6)
    .map(([key, values]) => summarize(key, values))
    .sort((a, b) => b.count - a.count)
    .slice(0, 40);

  const comparisonRows: ComparisonRow[] = comparisonKeys.map((key) => {
    const matching = allTransitions
      .filter((row) => matchComparisonKey(key, row.before, row.after))
      .map((row) => row.deltaHalfStep);
    const actual = toActualQuantiles(matching);
    const historical = resolveHistoricalTarget(banzukeTarget, key);
    const heiseiReference = resolveHistoricalTarget(heiseiReferenceTarget, key);
    const pass =
      actual && historical
        ? actual.p50HalfStep >= historical.p10HalfStep &&
          actual.p50HalfStep <= historical.p90HalfStep
        : null;
    return {
      key,
      label: comparisonLabelMap[key],
      sampleSize: matching.length,
      actual,
      historical,
      heiseiReference,
      pass,
      note:
        actual && historical
          ? 'actual p50 must stay inside runtime target p10-p90 band; heisei is reference only'
          : 'insufficient sample or missing runtime target',
    };
  });

  const summary = {
    meta: {
      transitions,
      scenarioCount: scenarios.length,
      generatedAt: new Date().toISOString(),
      engineVersion: 'optimizer-v2',
      targetPath: path.relative(ROOT_DIR, RUNTIME_TARGET_PATH),
      calibrationSource: banzukeTarget.meta.source,
      calibrationEra: banzukeTarget.meta.era,
      calibrationMovementClassSemantics: banzukeTarget.meta.movementClassSemantics ?? 'unknown',
      heiseiReferencePath: path.relative(ROOT_DIR, HEISEI_TARGET_PATH),
      heiseiReferenceSource: heiseiReferenceTarget.meta.source,
      heiseiReferenceEra: heiseiReferenceTarget.meta.era,
      recordBucketSupported: banzukeTarget.recordBucketRules.supported,
    },
    comparison: comparisonRows,
    boundaryExchangeRates: banzukeTarget.boundaryExchangeRates,
    recordBucketQuantiles,
  };

  const lines = [
    '# 番付 Quantile Calibration',
    '',
    `- 実行日: ${summary.meta.generatedAt}`,
    `- engineVersion: ${summary.meta.engineVersion}`,
    `- runtime target: ${summary.meta.targetPath}`,
    `- calibration source: ${summary.meta.calibrationSource}`,
    `- calibration era: ${summary.meta.calibrationEra}`,
    `- movement semantics: ${summary.meta.calibrationMovementClassSemantics}`,
    `- heisei reference: ${summary.meta.heiseiReferencePath}`,
    `- シナリオ数: ${summary.meta.scenarioCount}`,
    `- 遷移数: ${summary.meta.transitions}`,
    '',
    '## 史実比較',
    '',
  ];

  for (const row of comparisonRows) {
    const actualText = row.actual
      ? `p10=${(row.actual.p10HalfStep / 2).toFixed(1)} / p50=${(row.actual.p50HalfStep / 2).toFixed(1)} / p90=${(row.actual.p90HalfStep / 2).toFixed(1)}`
      : 'n/a';
    const historicalText = row.historical
      ? `p10=${row.historical.p10Rank.toFixed(1)} / p50=${row.historical.p50Rank.toFixed(1)} / p90=${row.historical.p90Rank.toFixed(1)}`
      : 'n/a';
    const heiseiText = row.heiseiReference
      ? `p10=${row.heiseiReference.p10Rank.toFixed(1)} / p50=${row.heiseiReference.p50Rank.toFixed(1)} / p90=${row.heiseiReference.p90Rank.toFixed(1)}`
      : 'n/a';
    lines.push(`- ${row.label}: runtime target ${historicalText} / actual ${actualText} / heisei ref ${heiseiText} / ${row.pass === null ? 'N/A' : row.pass ? 'PASS' : 'WARN'}`);
  }

  lines.push('');
  lines.push('## 境界交換率 (史実基準)');
  lines.push('');
  for (const [key, value] of Object.entries(summary.boundaryExchangeRates)) {
    lines.push(`- ${key}: ${value.count} / ${value.sampleSize} (${(value.rate * 100).toFixed(2)}%)`);
  }

  lines.push('');
  lines.push('## 注記');
  lines.push('');
  lines.push(`- record bucket support: ${banzukeTarget.recordBucketRules.supported ? 'yes' : 'no'}`);
  lines.push(`- source: ${banzukeTarget.recordBucketRules.source}`);
  lines.push(`- link: ${banzukeTarget.recordBucketRules.recordLinkMeaning}`);
  lines.push(`- lower scope: ${banzukeTarget.recordBucketRules.lowerDivisionScope.join(', ')}`);
  lines.push('');

  const markdown = lines.join('\n');
  writeFile(REPORT_PATH, markdown);
  writeFile(JSON_PATH, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
};

run().catch((error) => {
  console.error(error);
  throw error;
});
