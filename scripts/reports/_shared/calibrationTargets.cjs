const fs = require('fs');
const path = require('path');

const ROOT_DIR = process.cwd();
const ANALYSIS_DIR = path.join(ROOT_DIR, 'sumo-db', 'data', 'analysis');
const DOCS_DIR = path.join(ROOT_DIR, 'docs', 'balance');

const CAREER_TARGET_PATH = path.join(ANALYSIS_DIR, 'career_calibration_1965plus.json');
const BANZUKE_TARGET_PATH = path.join(ANALYSIS_DIR, 'banzuke_calibration_heisei.json');
const BUNDLE_PATH = path.join(ANALYSIS_DIR, 'calibration_bundle.json');
const SUMMARY_MARKDOWN_PATH = path.join(DOCS_DIR, 'calibration-targets.md');

const hasNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const ensureObject = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
};

const ensureKeys = (value, keys, label) => {
  ensureObject(value, label);
  for (const key of keys) {
    if (!(key in value)) {
      throw new Error(`${label}.${key} is required`);
    }
  }
};

const readJson = (filePath, required = true) => {
  if (!fs.existsSync(filePath)) {
    if (!required) return null;
    throw new Error(`Calibration file is missing: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const validateCareerTarget = (target) => {
  ensureKeys(target, ['meta', 'rankRates', 'careerLength', 'careerWinRate', 'distributionBuckets', 'longTailSignals'], 'career');
  ensureKeys(target.meta, ['generatedAt', 'source', 'era', 'sampleSize', 'minDebutYear'], 'career.meta');
  if (!hasNumber(target.meta.sampleSize) || target.meta.sampleSize <= 0) {
    throw new Error('career.meta.sampleSize must be > 0');
  }
  ensureKeys(target.rankRates, ['sekitoriRate', 'makuuchiRate', 'sanyakuRate', 'ozekiRate', 'yokozunaRate'], 'career.rankRates');
  ensureKeys(target.careerLength, ['mean', 'p10', 'p50', 'p90'], 'career.careerLength');
  ensureKeys(target.careerWinRate, ['mean', 'median', 'bucketRates'], 'career.careerWinRate');
  if (!ensureBucketObject(target.careerWinRate.bucketRates, 'career.careerWinRate.bucketRates')) return;
  ensureBucketObject(target.distributionBuckets.highestRank, 'career.distributionBuckets.highestRank');
  ensureBucketObject(target.distributionBuckets.careerBasho, 'career.distributionBuckets.careerBasho');
  ensureBucketObject(target.distributionBuckets.careerWinRate, 'career.distributionBuckets.careerWinRate');
  ensureKeys(target.longTailSignals, ['lowWinLongCareerRate'], 'career.longTailSignals');
  return target;
};

const ensureBucketObject = (value, label) => {
  ensureObject(value, label);
  const entries = Object.entries(value);
  if (!entries.length) {
    throw new Error(`${label} must not be empty`);
  }
  for (const [, bucketValue] of entries) {
    if (!hasNumber(bucketValue)) {
      throw new Error(`${label} must contain finite numeric values`);
    }
  }
  return true;
};

const validateMovementQuantiles = (value, label) => {
  if (value === null) return value;
  ensureKeys(value, ['sampleSize', 'p10HalfStep', 'p50HalfStep', 'p90HalfStep', 'p10Rank', 'p50Rank', 'p90Rank'], label);
  if (!hasNumber(value.sampleSize) || value.sampleSize <= 0) {
    throw new Error(`${label}.sampleSize must be > 0`);
  }
  return value;
};

const validateBanzukeTarget = (target) => {
  ensureKeys(target, ['meta', 'divisionMovementQuantiles', 'boundaryExchangeRates', 'recordBucketRules'], 'banzuke');
  ensureKeys(target.meta, ['generatedAt', 'source', 'era', 'sampleSize', 'bashoCount', 'divisionScope'], 'banzuke.meta');
  if (!hasNumber(target.meta.sampleSize) || target.meta.sampleSize <= 0) {
    throw new Error('banzuke.meta.sampleSize must be > 0');
  }
  if (!hasNumber(target.meta.bashoCount) || target.meta.bashoCount <= 0) {
    throw new Error('banzuke.meta.bashoCount must be > 0');
  }
  ensureObject(target.divisionMovementQuantiles, 'banzuke.divisionMovementQuantiles');
  for (const [division, rows] of Object.entries(target.divisionMovementQuantiles)) {
    ensureKeys(rows, ['stayed', 'promoted', 'demoted'], `banzuke.divisionMovementQuantiles.${division}`);
    validateMovementQuantiles(rows.stayed, `banzuke.divisionMovementQuantiles.${division}.stayed`);
    validateMovementQuantiles(rows.promoted, `banzuke.divisionMovementQuantiles.${division}.promoted`);
    validateMovementQuantiles(rows.demoted, `banzuke.divisionMovementQuantiles.${division}.demoted`);
  }
  ensureObject(target.boundaryExchangeRates, 'banzuke.boundaryExchangeRates');
  for (const [key, row] of Object.entries(target.boundaryExchangeRates)) {
    ensureKeys(row, ['sampleSize', 'count', 'rate'], `banzuke.boundaryExchangeRates.${key}`);
  }
  ensureKeys(
    target.recordBucketRules,
    ['supported', 'source', 'recordLinkMeaning', 'lowerDivisionScope', 'rankBands', 'recordAwareQuantiles'],
    'banzuke.recordBucketRules',
  );
  return target;
};

const loadCalibrationBundle = ({ required = true } = {}) => {
  const bundle = readJson(BUNDLE_PATH, false);
  if (bundle) {
    ensureKeys(bundle, ['career', 'banzuke'], 'bundle');
    return {
      meta: bundle.meta ?? null,
      career: validateCareerTarget(bundle.career),
      banzuke: validateBanzukeTarget(bundle.banzuke),
      collection: bundle.collection ?? null,
    };
  }

  if (!required) return null;

  return {
    meta: null,
    career: validateCareerTarget(readJson(CAREER_TARGET_PATH)),
    banzuke: validateBanzukeTarget(readJson(BANZUKE_TARGET_PATH)),
    collection: null,
  };
};

const toPct = (value) => `${(value * 100).toFixed(2)}%`;

const buildCalibrationSummaryMarkdown = (bundle) => {
  const lines = [
    '# 校正データサマリー',
    '',
    `- generatedAt: ${bundle.career.meta.generatedAt}`,
    `- career source: ${bundle.career.meta.source}`,
    `- banzuke source: ${bundle.banzuke.meta.source}`,
    `- career era: ${bundle.career.meta.era}`,
    `- banzuke era: ${bundle.banzuke.meta.era}`,
    `- cohort: ${bundle.career.meta.cohort ?? bundle.meta?.cohort ?? 'n/a'}`,
    '',
    '## キャリア校正',
    '',
    `- sampleSize: ${bundle.career.meta.sampleSize}`,
    `- 関取率: ${toPct(bundle.career.rankRates.sekitoriRate)}`,
    `- 幕内率: ${toPct(bundle.career.rankRates.makuuchiRate)}`,
    `- 三役率: ${toPct(bundle.career.rankRates.sanyakuRate)}`,
    `- 横綱率: ${toPct(bundle.career.rankRates.yokozunaRate)}`,
    `- 平均場所数: ${bundle.career.careerLength.mean.toFixed(2)}`,
    `- 場所数中央値: ${bundle.career.careerLength.p50.toFixed(2)}`,
    `- 勝率平均: ${toPct(bundle.career.careerWinRate.mean)}`,
    `- 勝率中央値: ${toPct(bundle.career.careerWinRate.median)}`,
    `- 低勝率長期キャリア率: ${toPct(bundle.career.longTailSignals.lowWinLongCareerRate)}`,
    '',
    '## 番付校正',
    '',
    `- sampleSize: ${bundle.banzuke.meta.sampleSize}`,
    `- bashoCount: ${bundle.banzuke.meta.bashoCount}`,
    `- divisionScope: ${bundle.banzuke.meta.divisionScope.join(', ')}`,
    `- note: ${bundle.banzuke.meta.note ?? 'none'}`,
    '',
    '## 収集状況',
    '',
    `- includedCount: ${bundle.meta?.includedCount ?? bundle.collection?.counts?.includedCount ?? 'n/a'}`,
    `- excludedCount: ${bundle.meta?.excludedCount ?? bundle.collection?.counts?.excludedCount ?? 'n/a'}`,
    `- pendingCount: ${bundle.meta?.pendingCount ?? bundle.collection?.counts?.pendingCount ?? 'n/a'}`,
    `- stopReason: ${bundle.meta?.stabilityStatus?.recommendedStopReason ?? bundle.collection?.stabilityStatus?.recommendedStopReason ?? 'n/a'}`,
    '',
    '### 境界交換率',
    '',
  ];

  for (const [key, row] of Object.entries(bundle.banzuke.boundaryExchangeRates)) {
    lines.push(`- ${key}: ${row.count} / ${row.sampleSize} (${toPct(row.rate)})`);
  }

  lines.push('');
  lines.push('### division quantiles');
  lines.push('');
  for (const [division, row] of Object.entries(bundle.banzuke.divisionMovementQuantiles)) {
    lines.push(`- ${division} stayed: ${formatQuantileRow(row.stayed)}`);
    lines.push(`- ${division} promoted: ${formatQuantileRow(row.promoted)}`);
    lines.push(`- ${division} demoted: ${formatQuantileRow(row.demoted)}`);
  }
  lines.push('');
  lines.push('### record bucket support');
  lines.push('');
  lines.push(`- supported: ${bundle.banzuke.recordBucketRules.supported ? 'yes' : 'no'}`);
  lines.push(`- source: ${bundle.banzuke.recordBucketRules.source}`);
  lines.push(`- link: ${bundle.banzuke.recordBucketRules.recordLinkMeaning}`);
  lines.push(`- lower divisions: ${bundle.banzuke.recordBucketRules.lowerDivisionScope.join(', ')}`);
  lines.push('');
  return lines.join('\n');
};

const formatQuantileRow = (row) => {
  if (!row) return 'n/a';
  return `n=${row.sampleSize}, p10=${row.p10Rank.toFixed(1)}, p50=${row.p50Rank.toFixed(1)}, p90=${row.p90Rank.toFixed(1)}`;
};

module.exports = {
  ANALYSIS_DIR,
  DOCS_DIR,
  CAREER_TARGET_PATH,
  BANZUKE_TARGET_PATH,
  BUNDLE_PATH,
  SUMMARY_MARKDOWN_PATH,
  buildCalibrationSummaryMarkdown,
  loadCalibrationBundle,
};
