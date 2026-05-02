#!/usr/bin/env node
/**
 * 番付遷移 Top5 予測 CLI（成績条件付き）
 *
 * 使い方:
 *   node scripts/predict/predict_banzuke_top5.cjs <ラベル> <勝>-<負>[-<休>]
 *   node scripts/predict/predict_banzuke_top5.cjs --file banzuke.txt
 *   node scripts/predict/predict_banzuke_top5.cjs --list-labels
 *   node scripts/predict/predict_banzuke_top5.cjs --help
 *
 * 例:
 *   npm run predict:demo -- 東横綱1枚目 13-2
 *   npm run predict:demo -- 東前頭5枚目 8-7
 *   npm run predict:demo -- 西大関1枚目 5-5-5
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'sumo-db',
  'data',
  'analysis',
  'banzuke_transition_heisei.json',
);

const MIN_SAMPLES = 5;

function loadData() {
  if (!fs.existsSync(DATA_PATH)) {
    console.error(`遷移テーブルが見つかりません: ${DATA_PATH}`);
    console.error('先に Stage 1 を実行してください: npm run predict:export');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
}

function printHelp() {
  console.log(`番付遷移 Top5 予測 CLI（成績条件付き）

ラベル形式: 平成期データそのまま（例: 東横綱1枚目, 東前頭5枚目, 西十両3枚目）
成績形式:   <勝>-<負>[-<休>]   例: 8-7, 13-2, 5-5-5, 0-0-15

使い方:
  node scripts/predict/predict_banzuke_top5.cjs <ラベル> <成績>
  node scripts/predict/predict_banzuke_top5.cjs --file banzuke.txt   # 1行に "ラベル 成績"
  node scripts/predict/predict_banzuke_top5.cjs --list-labels
  node scripts/predict/predict_banzuke_top5.cjs --top N

例:
  npm run predict:demo -- 東横綱1枚目 13-2
  npm run predict:demo -- 東前頭5枚目 10-5
  npm run predict:demo -- 東幕下1枚目 4-3
  npm run predict:demo -- 西大関1枚目 5-5-5
  npm run predict:demo -- 東前頭16枚目 4-11

成績を省略するとラベル周辺分布（成績マージナル）で予測します。
サンプル不足時は (W-L-A) → (W-L) → ラベル周辺 の順にフォールバック。
`);
}

function parseArgs(argv) {
  const opts = {
    topN: 5,
    file: null,
    listLabels: false,
    help: false,
    queries: [],
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--list-labels') opts.listLabels = true;
    else if (a === '--file') opts.file = argv[++i];
    else if (a === '--top') opts.topN = parseInt(argv[++i], 10);
    else positional.push(a);
  }
  // positional: pairs of (label, record) or single label
  let i = 0;
  while (i < positional.length) {
    const label = positional[i++];
    let record = null;
    if (i < positional.length && /^\d+-\d+(-\d+)?$/.test(positional[i])) {
      record = positional[i++];
    }
    opts.queries.push({ label, record });
  }
  return opts;
}

function parseRecord(s) {
  if (!s) return null;
  const m = s.match(/^(\d+)-(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  return {
    wins: parseInt(m[1], 10),
    losses: parseInt(m[2], 10),
    absences: m[3] ? parseInt(m[3], 10) : 0,
  };
}

function suggestNeighbors(input, allLabels, limit = 5) {
  const norm = (s) => s.replace(/\s+/g, '');
  const target = norm(input);
  const scored = allLabels
    .map((label) => {
      const l = norm(label);
      let score = 0;
      if (l.includes(target) || target.includes(l)) score += 100;
      const minLen = Math.min(l.length, target.length);
      let common = 0;
      for (let k = 0; k < minLen; k++) if (l[k] === target[k]) common++;
      score += common;
      return { label, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .filter((x) => x.score > 0);
  return scored.map((x) => x.label);
}

function pickDistribution(entry, record) {
  if (record) {
    const keyA = `${record.wins}-${record.losses}-${record.absences}`;
    if (entry.byRecord && entry.byRecord[keyA] && entry.byRecord[keyA].total >= MIN_SAMPLES) {
      return { ...entry.byRecord[keyA], source: `byRecord[${keyA}]` };
    }
    const keyB = `${record.wins}-${record.losses}`;
    if (entry.byWinLoss && entry.byWinLoss[keyB] && entry.byWinLoss[keyB].total >= MIN_SAMPLES) {
      return { ...entry.byWinLoss[keyB], source: `byWinLoss[${keyB}] (休フォールバック)` };
    }
    if (entry.byRecord && entry.byRecord[keyA]) {
      return { ...entry.byRecord[keyA], source: `byRecord[${keyA}] (n<${MIN_SAMPLES})` };
    }
    if (entry.byWinLoss && entry.byWinLoss[keyB]) {
      return { ...entry.byWinLoss[keyB], source: `byWinLoss[${keyB}] (n<${MIN_SAMPLES})` };
    }
  }
  if (entry.marginal) {
    return { ...entry.marginal, source: 'marginal (成績条件なし)' };
  }
  return null;
}

function formatRow(rank, to, p, n) {
  const pct = (p * 100).toFixed(1).padStart(5);
  const idx = String(rank).padStart(2);
  return `  ${idx}. ${to.padEnd(16)} ${pct}%  (n=${n})`;
}

function predictOne(query, data, topN) {
  const { label, record } = query;
  const recordStr = record
    ? `${record.wins}-${record.losses}${record.absences ? `-${record.absences}` : ''}`
    : '(成績指定なし)';
  const entry = data.transitions[label];
  if (!entry) {
    console.log(`\n[該当ラベルなし] "${label}" ${recordStr}`);
    const suggestions = suggestNeighbors(label, Object.keys(data.transitions));
    if (suggestions.length) {
      console.log('  近いラベル候補:');
      suggestions.forEach((s) => console.log(`    - ${s}`));
    }
    return;
  }
  const dist = pickDistribution(entry, record);
  if (!dist) {
    console.log(`\n[分布なし] "${label}" ${recordStr}`);
    return;
  }
  console.log(`\n入力: ${label}  ${recordStr}  (n=${dist.total}, 出典: ${dist.source})`);
  const rows = dist.top.slice(0, topN);
  rows.forEach((r, i) => console.log(formatRow(i + 1, r.to, r.p, r.n)));
  const covered = rows.reduce((s, r) => s + r.p, 0);
  if (covered < 0.999) {
    console.log(
      `     (Top${topN} カバレッジ ${(covered * 100).toFixed(1)}% / 残り ${((1 - covered) * 100).toFixed(1)}%)`,
    );
  }
}

function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

function gatherQueries(opts) {
  const queries = [...opts.queries];
  const parseLine = (line) => {
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return null;
    const label = tokens[0];
    const recordTok = tokens[1];
    return { label, record: recordTok && /^\d+-\d+(-\d+)?$/.test(recordTok) ? recordTok : null };
  };
  if (opts.file) {
    const content = fs.readFileSync(opts.file, 'utf-8');
    content.split(/\r?\n/).forEach((line) => {
      const q = parseLine(line);
      if (q) queries.push(q);
    });
  }
  if (queries.length === 0 && !process.stdin.isTTY) {
    readStdinSync().split(/\r?\n/).forEach((line) => {
      const q = parseLine(line);
      if (q) queries.push(q);
    });
  }
  return queries.map((q) => ({ label: q.label, record: parseRecord(q.record) }));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }
  const data = loadData();

  if (opts.listLabels) {
    Object.keys(data.transitions).forEach((k) => console.log(k));
    return;
  }

  const queries = gatherQueries(opts);
  if (queries.length === 0) {
    printHelp();
    console.error('\n入力がありません。');
    process.exit(1);
  }

  const meta = data.meta;
  console.log(
    `番付遷移 Top${opts.topN} 予測  (era=${meta.era}, basho=${meta.bashoCount}, ` +
      `marginal=${meta.marginalSampleCount}, record=${meta.recordSampleCount})`,
  );

  queries.forEach((q) => predictOne(q, data, opts.topN));
}

main();
