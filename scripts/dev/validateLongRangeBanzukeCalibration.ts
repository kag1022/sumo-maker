import fs from 'fs';
import path from 'path';
import { LONG_RANGE_BANZUKE_CALIBRATION } from '../../src/logic/calibration/banzukeLongRange';

const ROOT = process.cwd();
const OUT_JSON = path.join(ROOT, 'docs', 'design', 'lower_division_long_range_calibration_validation.json');
const OUT_MD = path.join(ROOT, 'docs', 'design', 'lower_division_long_range_calibration_validation.md');
const LOWER_DIVISIONS = ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'];
const REQUIRED_RECORDS = ['0-7', '1-6', '2-5', '3-4', '4-3', '5-2', '6-1', '7-0'];

interface BucketSampleRow {
  division: string;
  rankBand: string;
  record: string;
  sampleSize: number;
  p50HalfStep: number;
  p90HalfStep: number;
}

const fail = (message: string): never => {
  throw new Error(`long-range calibration validation failed: ${message}`);
};

const main = (): void => {
  const target = LONG_RANGE_BANZUKE_CALIBRATION;
  if (!target.divisionMovementQuantiles) fail('missing divisionMovementQuantiles');
  if (!target.boundaryExchangeRates) fail('missing boundaryExchangeRates');
  if (!target.recordBucketRules?.rankBands) fail('missing recordBucketRules.rankBands');
  if (!target.recordBucketRules?.recordAwareQuantiles) fail('missing recordBucketRules.recordAwareQuantiles');

  const bucketSamples: BucketSampleRow[] = [];
  for (const division of LOWER_DIVISIONS) {
    const rankBands = target.recordBucketRules.rankBands[division];
    const quantileBands = target.recordBucketRules.recordAwareQuantiles[division];
    if (!rankBands?.length) fail(`missing rank bands for ${division}`);
    if (!quantileBands) fail(`missing record-aware quantiles for ${division}`);

    for (const [, , rankBand] of rankBands) {
      const buckets = quantileBands[rankBand];
      if (!buckets) fail(`missing bucket map for ${division}/${rankBand}`);
      for (const record of REQUIRED_RECORDS) {
        const quantiles = buckets[record];
        if (!quantiles) fail(`missing ${division}/${rankBand}/${record}`);
        if (quantiles.sampleSize <= 0) fail(`empty ${division}/${rankBand}/${record}`);
        bucketSamples.push({
          division,
          rankBand,
          record,
          sampleSize: quantiles.sampleSize,
          p50HalfStep: quantiles.p50HalfStep,
          p90HalfStep: quantiles.p90HalfStep,
        });
      }
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: target.meta.source,
    sampleSize: target.meta.sampleSize,
    divisions: LOWER_DIVISIONS,
    requiredRecords: REQUIRED_RECORDS,
    bucketSamples,
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(payload, null, 2)}\n`);

  const lines = [
    '# Long Range Banzuke Calibration Validation',
    '',
    `- generatedAt: ${payload.generatedAt}`,
    `- source: ${payload.source}`,
    `- sampleSize: ${payload.sampleSize}`,
    '',
    '| division | rankBand | record | sample | p50HalfStep | p90HalfStep |',
    '| --- | --- | --- | ---: | ---: | ---: |',
    ...bucketSamples.map((row) =>
      `| ${row.division} | ${row.rankBand} | ${row.record} | ${row.sampleSize} | ${row.p50HalfStep} | ${row.p90HalfStep} |`),
    '',
  ];
  fs.writeFileSync(OUT_MD, lines.join('\n'));
  console.log(`validated buckets=${bucketSamples.length}`);
  console.log(path.relative(ROOT, OUT_MD));
  console.log(path.relative(ROOT, OUT_JSON));
};

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
