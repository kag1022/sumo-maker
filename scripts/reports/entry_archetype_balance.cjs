const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'balance');
const JSON_PATH = path.join(OUT_DIR, 'entry-archetype-balance.json');
const MD_PATH = path.join(OUT_DIR, 'entry-archetype-balance.md');
const SAMPLE_COUNT = 240;

const { createInitialRikishi } = require(path.join(
  ROOT,
  '.tmp',
  'sim-tests',
  'src',
  'logic',
  'initialization.js',
));
const {
  ENTRY_ARCHETYPES,
  ENTRY_ARCHETYPE_LABELS,
} = require(path.join(
  ROOT,
  '.tmp',
  'sim-tests',
  'src',
  'logic',
  'career',
  'entryArchetype.js',
));
const { formatRankDisplayName } = require(path.join(
  ROOT,
  '.tmp',
  'sim-tests',
  'src',
  'logic',
  'ranking',
  'index.js',
));

const createSeededRandom = (seed) => {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

const createParams = (entryArchetype) => ({
  shikona: `診断${entryArchetype}`,
  age: entryArchetype === 'ORDINARY_RECRUIT' || entryArchetype === 'EARLY_PROSPECT' ? 18 : 22,
  startingRank: { division: 'Maezumo', name: '前相撲', side: 'East', number: 1 },
  archetype: 'HARD_WORKER',
  entryArchetype,
  aptitudeTier: entryArchetype === 'MONSTER'
    ? 'S'
    : entryArchetype === 'ELITE_TSUKEDASHI'
      ? 'A'
      : entryArchetype === 'TSUKEDASHI'
        ? 'B'
        : 'C',
  tactics: 'BALANCE',
  signatureMove: '',
  bodyType: 'NORMAL',
  traits: [],
  historyBonus: 0,
  stableId: 'stable-001',
  ichimonId: 'TAIJU',
  stableArchetypeId: 'TRADITIONAL_LARGE',
});

const summarize = (entryArchetype) => {
  const rows = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const status = createInitialRikishi(
      createParams(entryArchetype),
      createSeededRandom(0x20260513 + index * 17 + entryArchetype.length),
    );
    const statAverage = mean(Object.values(status.stats));
    rows.push({
      ability: status.ratingState.ability,
      statAverage,
      potential: status.potential,
      durability: status.durability,
      growthType: status.growthType,
      careerBand: status.careerBand,
      rankLabel: formatRankDisplayName(status.rank),
    });
  }
  const countBy = (key) => rows.reduce((acc, row) => {
    acc[row[key]] = (acc[row[key]] ?? 0) + 1;
    return acc;
  }, {});
  return {
    entryArchetype,
    label: ENTRY_ARCHETYPE_LABELS[entryArchetype],
    samples: rows.length,
    averageAbility: Number(mean(rows.map((row) => row.ability)).toFixed(2)),
    averageStat: Number(mean(rows.map((row) => row.statAverage)).toFixed(2)),
    averagePotential: Number(mean(rows.map((row) => row.potential)).toFixed(2)),
    averageDurability: Number(mean(rows.map((row) => row.durability)).toFixed(2)),
    rankLabels: countBy('rankLabel'),
    growthTypes: countBy('growthType'),
    careerBands: countBy('careerBand'),
  };
};

const rows = ENTRY_ARCHETYPES.map(summarize);
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(JSON_PATH, JSON.stringify({
  generatedAt: new Date().toISOString(),
  samplesPerArchetype: SAMPLE_COUNT,
  rows,
}, null, 2));

const md = [
  '# Entry Archetype Balance',
  '',
  `samples/archetype: ${SAMPLE_COUNT}`,
  '',
  '| archetype | label | avg ability | avg stat | avg potential | primary rank labels | growth mix | career band mix |',
  '|---|---:|---:|---:|---:|---|---|---|',
  ...rows.map((row) => {
    const rankLabels = Object.entries(row.rankLabels).map(([key, value]) => `${key}:${value}`).join(', ');
    const growthTypes = Object.entries(row.growthTypes).map(([key, value]) => `${key}:${value}`).join(', ');
    const careerBands = Object.entries(row.careerBands).map(([key, value]) => `${key}:${value}`).join(', ');
    return `| ${row.entryArchetype} | ${row.label} | ${row.averageAbility} | ${row.averageStat} | ${row.averagePotential} | ${rankLabels} | ${growthTypes} | ${careerBands} |`;
  }),
  '',
  '- 初期 ability は番付 baseline と初期 stat から算出する。',
  '- potential は aptitude の initialFactor ではなく、才能型と entry archetype の ceiling 補正として扱う。',
  '- 付出の表示は初場所だけの specialStatus に依存する。通常の昇降格計算では通常 rank へ戻る。',
  '',
].join('\n');

fs.writeFileSync(MD_PATH, md);
console.log(`wrote ${JSON_PATH}`);
console.log(`wrote ${MD_PATH}`);
