import fs from 'fs';
import path from 'path';
import { TestCase, TestModule } from '../types';

const ROOT_DIR = process.cwd();
const CAREER_PATH = path.join(ROOT_DIR, 'sumo-db', 'data', 'analysis', 'career_calibration_1965plus.json');
const BANZUKE_PATH = path.join(ROOT_DIR, 'sumo-db', 'data', 'analysis', 'banzuke_calibration_heisei.json');
const POPULATION_PATH = path.join(ROOT_DIR, 'sumo-db', 'data', 'analysis', 'population_calibration_heisei.json');
const BUNDLE_PATH = path.join(ROOT_DIR, 'sumo-db', 'data', 'analysis', 'calibration_bundle.json');
const SUMMARY_PATH = path.join(ROOT_DIR, 'docs', 'balance', 'calibration-targets.md');
const COLLECTION_REPORT_PATH = path.join(ROOT_DIR, 'sumo-db', 'data', 'analysis', 'heisei_collection_report.json');

const assert = {
  ok(condition: unknown, message: string): void {
    if (!condition) {
      throw new Error(message);
    }
  },
  equal<T>(actual: T, expected: T, message?: string): void {
    if (actual !== expected) {
      throw new Error(message ?? `Expected ${String(expected)} but got ${String(actual)}`);
    }
  },
};

const readJson = <T>(filePath: string): T => {
  assert.ok(fs.existsSync(filePath), `Missing file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
};

const createVerificationCase = (name: string, run: () => void): TestCase => ({
  name,
  suite: 'verification',
  run,
});

const createDocsCase = (name: string, run: () => void): TestCase => ({
  name,
  suite: 'docs',
  run,
});

type CareerCalibration = {
  meta: { sampleSize: number; minDebutYear: number; source: string; era: string; generatedAt: string; cohort?: string };
  rankRates: Record<string, number>;
  careerLength: { mean: number; p10: number; p50: number; p90: number };
  careerWinRate: { mean: number; median: number; bucketRates: Record<string, number> };
  distributionBuckets: {
    highestRank: Record<string, number>;
    careerBasho: Record<string, number>;
    careerWinRate: Record<string, number>;
  };
  longTailSignals: { lowWinLongCareerRate: number };
};

type BanzukeCalibration = {
  meta: {
    sampleSize: number;
    bashoCount: number;
    source: string;
    era: string;
    divisionScope: string[];
    note?: string;
    dataQuality?: Record<string, number>;
  };
  divisionMovementQuantiles: Record<
    string,
    Record<string, { sampleSize: number; p10Rank: number; p50Rank: number; p90Rank: number } | null>
  >;
  boundaryExchangeRates: Record<string, { sampleSize: number; count: number; rate: number }>;
  recordBucketRules: {
    supported: boolean;
    source: string;
    recordLinkMeaning: string;
    lowerDivisionScope: string[];
    rankBands: Record<string, Array<[number, number | null, string]>>;
    recordAwareQuantiles: Record<string, Record<string, Record<string, { sampleSize: number } | null>>>;
  };
};

type CalibrationBundle = {
  meta?: {
    cohort: string;
    includedCount: number;
    excludedCount: number;
    pendingCount: number;
    stabilityStatus: { recommendedStopReason: string };
  };
  career: CareerCalibration;
  banzuke: BanzukeCalibration;
  population?: PopulationCalibration;
};

type PopulationCalibration = {
  meta: {
    sampleSize: number;
    bashoCount: number;
    source: string;
    era: string;
    divisionScope: string[];
  };
  annualTotalHeadcount: { sampleSize: number; p10: number; p50: number; p90: number; min: number; max: number };
  annualTotalDelta: { sampleSize: number; p10: number; p50: number; p90: number; min: number; max: number };
  annualTotalSwing: { sampleSize: number; p10: number; p50: number; p90: number; min: number; max: number };
  annualJonidanSwing: { sampleSize: number; p10: number; p50: number; p90: number; min: number; max: number };
  annualJonokuchiSwing: { sampleSize: number; p10: number; p50: number; p90: number; min: number; max: number };
  monthlyIntakeByMonth: Record<string, { sampleSize: number; p10: number; p50: number; p90: number } | null>;
};

type CollectionReport = {
  counts: {
    includedCount: number;
    excludedCount: number;
    pendingCount: number;
  };
  stabilityStatus: {
    recommendedStopReason: string;
  };
};

const cases: TestCase[] = [
  createVerificationCase(
    'calibration: calibration bundle is loadable and consistent',
    () => {
      const career = readJson<CareerCalibration>(CAREER_PATH);
      const banzuke = readJson<BanzukeCalibration>(BANZUKE_PATH);
      const population = readJson<PopulationCalibration>(POPULATION_PATH);
      const bundle = readJson<CalibrationBundle>(BUNDLE_PATH);

      assert.equal(bundle.career.meta.sampleSize, career.meta.sampleSize);
      assert.equal(bundle.banzuke.meta.bashoCount, banzuke.meta.bashoCount);
      assert.equal(career.meta.minDebutYear, 1989);
      assert.equal(career.meta.source, 'rikishi_summary');
      assert.equal(banzuke.meta.source, 'rank_movement');
      assert.equal(career.meta.era, 'heisei_debut');
      assert.equal(career.meta.cohort, 'heisei_debut');
      assert.equal(population.meta.source, 'basho_banzuke_entry');
      assert.equal(population.meta.era, 'heisei_population');
      assert.ok(career.meta.sampleSize > 0, 'Expected career calibration sample size > 0');
      assert.ok(banzuke.meta.sampleSize > 0, 'Expected banzuke calibration sample size > 0');
      assert.ok(population.meta.sampleSize > 0, 'Expected population calibration sample size > 0');
      assert.ok(Array.isArray(banzuke.meta.divisionScope) && banzuke.meta.divisionScope.length === 6, 'Expected 6 scoped divisions');
      assert.equal(bundle.meta?.cohort, 'heisei_debut');
      assert.equal(bundle.population?.meta.bashoCount, population.meta.bashoCount);
    },
  ),
  createVerificationCase(
    'calibration: career rates stay internally coherent',
    () => {
      const career = readJson<CareerCalibration>(CAREER_PATH);
      assert.ok(career.rankRates.yokozunaRate <= career.rankRates.sanyakuRate, 'Yokozuna rate must not exceed sanyaku rate');
      assert.ok(career.rankRates.sanyakuRate <= career.rankRates.makuuchiRate, 'Sanyaku rate must not exceed makuuchi rate');
      assert.ok(career.rankRates.makuuchiRate <= career.rankRates.sekitoriRate, 'Makuuchi rate must not exceed sekitori rate');
      assert.ok(career.careerLength.p10 <= career.careerLength.p50, 'Career length p10 must be <= p50');
      assert.ok(career.careerLength.p50 <= career.careerLength.p90, 'Career length p50 must be <= p90');
      assert.ok(career.careerWinRate.mean >= 0 && career.careerWinRate.mean <= 1, 'Career win rate mean must be a rate');
      assert.ok(career.careerWinRate.median >= 0 && career.careerWinRate.median <= 1, 'Career win rate median must be a rate');
      assert.ok(career.longTailSignals.lowWinLongCareerRate >= 0, 'Expected low-win-long-career rate >= 0');
    },
  ),
  createVerificationCase(
    'calibration: banzuke record buckets are available',
    () => {
      const banzuke = readJson<BanzukeCalibration>(BANZUKE_PATH);
      assert.equal(banzuke.recordBucketRules.supported, true);
      assert.equal(
        banzuke.recordBucketRules.source,
        'rank_movement_with_record.from_basho_code',
      );
      assert.ok(
        banzuke.recordBucketRules.recordLinkMeaning.includes('from_basho_code'),
        'Expected record link meaning to mention from_basho_code',
      );
      assert.ok(
        banzuke.recordBucketRules.lowerDivisionScope.includes('Makushita'),
        'Expected lower division scope to include Makushita',
      );
      assert.ok(
        (banzuke.recordBucketRules.recordAwareQuantiles.Makushita?.['1-5']?.['4-3']?.sampleSize ?? 0) > 0,
        'Expected Makushita 1-5 4-3 sample',
      );
      assert.ok(
        (banzuke.divisionMovementQuantiles.Makuuchi?.stayed?.sampleSize ?? 0) > 0,
        'Expected Makuuchi stayed calibration sample',
      );
      assert.ok(
        (banzuke.divisionMovementQuantiles.Juryo?.promoted?.sampleSize ?? 0) > 0,
        'Expected Juryo promoted calibration sample',
      );
    },
  ),
  createVerificationCase(
    'calibration: population annual swings and monthly intake are available',
    () => {
      const population = readJson<PopulationCalibration>(POPULATION_PATH);
      assert.ok(population.annualTotalDelta.sampleSize > 0, 'Expected annual total delta samples');
      assert.ok(population.annualTotalSwing.p50 > 0, 'Expected annual total swing median > 0');
      assert.ok(population.annualJonidanSwing.p50 > 0, 'Expected Jonidan swing median > 0');
      assert.ok(population.annualJonokuchiSwing.p50 > 0, 'Expected Jonokuchi swing median > 0');
      for (const month of ['1', '3', '5', '7', '9', '11']) {
        assert.ok(population.monthlyIntakeByMonth[month] != null, `Expected monthly intake stats for ${month}`);
      }
    },
  ),
  createDocsCase(
    'calibration: summary markdown reflects bundle metadata',
    () => {
      const bundle = readJson<CalibrationBundle>(BUNDLE_PATH);
      assert.ok(fs.existsSync(SUMMARY_PATH), `Missing file: ${SUMMARY_PATH}`);
      const summary = fs.readFileSync(SUMMARY_PATH, 'utf8');
      assert.ok(summary.includes('# 校正データサマリー'), 'Expected summary title');
      assert.ok(summary.includes(bundle.career.meta.source), 'Expected career source in summary');
      assert.ok(summary.includes(bundle.banzuke.meta.era), 'Expected banzuke era in summary');
      assert.ok(summary.includes('record bucket support'), 'Expected record bucket support section');
      assert.ok(summary.includes(bundle.banzuke.recordBucketRules.source), 'Expected record source in summary');
    },
  ),
  createVerificationCase(
    'calibration: heisei collection report matches bundle meta',
    () => {
      const bundle = readJson<CalibrationBundle>(BUNDLE_PATH);
      const report = readJson<CollectionReport>(COLLECTION_REPORT_PATH);
      assert.equal(bundle.meta?.includedCount, report.counts.includedCount);
      assert.equal(bundle.meta?.excludedCount, report.counts.excludedCount);
      assert.equal(bundle.meta?.pendingCount, report.counts.pendingCount);
      assert.equal(bundle.meta?.stabilityStatus.recommendedStopReason, report.stabilityStatus.recommendedStopReason);
    },
  ),
];

export const calibrationTestModule: TestModule = {
  id: 'calibration',
  cases,
};
