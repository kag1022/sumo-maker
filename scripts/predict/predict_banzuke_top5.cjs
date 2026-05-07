#!/usr/bin/env node
/**
 * 番付遷移 Top5 予測 CLI（成績条件付き）
 *
 * 使い方:
 *   node scripts/predict/predict_banzuke_top5.cjs <ラベル> <勝>-<負>[-<休>]
 *   node scripts/predict/predict_banzuke_top5.cjs --source sumo-api <ラベル> <成績>
 *   node scripts/predict/predict_banzuke_top5.cjs --compare <ラベル> <成績>
 *   node scripts/predict/predict_banzuke_top5.cjs --help
 *
 * --source:  データソースを切り替える。
 *            heisei    = 既存平成データ (sumo-db, 既定)
 *            sumo-api  = sumo-api.com 長期データ (1960-2026)
 *            <path>    = 任意の JSON ファイル
 *
 * --compare: 平成データと sumo-api 長期データを並べて比較する。
 *
 * 例:
 *   npm run predict:demo -- 東横綱1枚目 13-2
 *   npm run predict:demo -- --compare 東横綱1枚目 13-2
 *   npm run predict:demo -- --source sumo-api 東前頭5枚目 8-7
 */

const fs = require('fs');
const path = require('path');
const { pickTransitionDistribution } = require('./transition_fallback.cjs');

const DATA_PATHS = {
  heisei: path.resolve(
    __dirname, '..', '..', 'sumo-db', 'data', 'analysis',
    'banzuke_transition_heisei.json',
  ),
  'sumo-api': path.resolve(
    __dirname, '..', '..', 'sumo-api-db', 'data', 'analysis',
    'banzuke_transition_sumo_api_196007_202603.json',
  ),
};

const MIN_SAMPLES = 5;

function resolveDataPath(source) {
  if (!source || source === 'heisei') return DATA_PATHS.heisei;
  if (source === 'sumo-api' || source === 'sumoapi' || source === 'sumo-api-long') return DATA_PATHS['sumo-api'];
  if (fs.existsSync(source)) return source;
  console.error(`不明なデータソース: "${source}"`);
  console.error(`有効な値: heisei, sumo-api, sumo-api-long, またはファイルパス`);
  process.exit(1);
}

function loadData(source) {
  const dataPath = resolveDataPath(source);
  if (!fs.existsSync(dataPath)) {
    console.error(`遷移テーブルが見つかりません: ${dataPath}`);
    if (source === 'sumo-api' || source === 'sumoapi' || source === 'sumo-api-long') {
      console.error('先に fetch + build を実行してください:');
      console.error('  npm run fetch:sumo-api');
      console.error('  npm run fetch:sumo-api:matches');
      console.error('  npm run build:sumo-api');
    } else {
      console.error('先に Stage 1 を実行してください: npm run predict:export');
    }
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
}

function printHelp() {
  console.log(`番付遷移 Top5 予測 CLI（成績条件付き）

ラベル形式: 平成期データそのまま（例: 東横綱1枚目, 東前頭5枚目, 西十両3枚目）
成績形式:   <勝>-<負>[-<休>]   例: 8-7, 13-2, 5-5-5, 0-0-15

使い方:
  node scripts/predict/predict_banzuke_top5.cjs <ラベル> <成績>
  node scripts/predict/predict_banzuke_top5.cjs --compare <ラベル> <成績>
  node scripts/predict/predict_banzuke_top5.cjs --source sumo-api <ラベル> <成績>
  node scripts/predict/predict_banzuke_top5.cjs --file banzuke.txt
  node scripts/predict/predict_banzuke_top5.cjs --list-labels
  node scripts/predict/predict_banzuke_top5.cjs --top N

例:
  npm run predict:demo -- 東横綱1枚目 13-2
  npm run predict:demo -- --compare 東横綱1枚目 13-2
  npm run predict:demo -- --source sumo-api 東前頭5枚目 10-5

成績を省略するとラベル周辺分布（成績マージナル）で予測します。
サンプル不足時は (W-L-A) → (W-L) → ラベル周辺 の順にフォールバック。

データソース:
  --source heisei     平成期データ (sumo-db, 既定)
  --source sumo-api   sumo-api.com 長期データ (196007-202603)
  --source <path>     任意の transition JSON
  --compare           平成 vs sumo-api を並列比較
`);
}

function parseArgs(argv) {
  const opts = {
    topN: 5,
    file: null,
    listLabels: false,
    help: false,
    compare: false,
    source: 'heisei',
    queries: [],
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--list-labels') opts.listLabels = true;
    else if (a === '--compare') opts.compare = true;
    else if (a === '--file') opts.file = argv[++i];
    else if (a === '--top') opts.topN = parseInt(argv[++i], 10);
    else if (a === '--source' || a === '--data') opts.source = argv[++i];
    else positional.push(a);
  }
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

function formatRow(rank, to, p, n) {
  const pct = (p * 100).toFixed(1).padStart(5);
  const idx = String(rank).padStart(2);
  return `  ${idx}. ${to.padEnd(16)} ${pct}%  (n=${n})`;
}

function getDist(data, label, record) {
  const entry = data.transitions[label];
  if (!entry) return null;
  return pickTransitionDistribution(data, label, record, { minSamples: MIN_SAMPLES });
}

function predictOne(query, data, topN, prefix) {
  const { label, record } = query;
  const recordStr = record
    ? `${record.wins}-${record.losses}${record.absences ? `-${record.absences}` : ''}`
    : '(成績指定なし)';
  const dist = getDist(data, label, record);

  if (!dist) {
    const entry = data.transitions[label];
    if (!entry) {
      console.log(`${prefix}[該当ラベルなし] "${label}" ${recordStr}`);
      const suggestions = suggestNeighbors(label, Object.keys(data.transitions));
      if (suggestions.length) {
        console.log(`${prefix}  近いラベル候補:`);
        suggestions.forEach((s) => console.log(`${prefix}    - ${s}`));
      }
    } else {
      console.log(`${prefix}[分布なし] "${label}" ${recordStr}`);
    }
    return;
  }

  console.log(`${prefix}${label}  ${recordStr}  (n=${dist.total}, ${dist.source})`);
  const rows = dist.top.slice(0, topN);
  rows.forEach((r, i) => console.log(prefix + formatRow(i + 1, r.to, r.p, r.n)));
  const covered = rows.reduce((s, r) => s + r.p, 0);
  if (covered < 0.999) {
    console.log(
      `${prefix}     (Top${topN} カバレッジ ${(covered * 100).toFixed(1)}% / 残り ${((1 - covered) * 100).toFixed(1)}%)`,
    );
  }
}

function compareOne(query, dataHeisei, dataSumoApi, topN) {
  const { label, record } = query;
  const recordStr = record
    ? `${record.wins}-${record.losses}${record.absences ? `-${record.absences}` : ''}`
    : '(成績指定なし)';

  const distH = getDist(dataHeisei, label, record);
  const distS = getDist(dataSumoApi, label, record);

  const metaH = dataHeisei.meta;
  const metaS = dataSumoApi.meta;

  console.log(`\n比較: ${label}  ${recordStr}\n`);
  console.log(
    `  平成 (${metaH.bashoCount}場所, record=${metaH.recordSampleCount})` +
    `          sumo-api (${metaS.bashoCount}場所, record=${metaS.recordSampleCount})`,
  );
  console.log('  ' + '-'.repeat(66));

  if (!distH && !distS) {
    if (!dataHeisei.transitions[label] && !dataSumoApi.transitions[label]) {
      console.log(`  [該当ラベルなし] "${label}"`);
    } else {
      console.log(`  [分布なし]`);
    }
    return;
  }

  const maxRows = Math.max(
    distH ? distH.top.length : 0,
    distS ? distS.top.length : 0,
  );
  const rows = Math.min(maxRows, topN);

  for (let i = 0; i < rows; i++) {
    const left = (distH && distH.top[i])
      ? `${String(i + 1).padStart(2)}. ${distH.top[i].to.padEnd(14)} ${(distH.top[i].p * 100).toFixed(1).padStart(5)}% (n=${distH.top[i].n})`
      : '                                        ';
    const right = (distS && distS.top[i])
      ? `${String(i + 1).padStart(2)}. ${distS.top[i].to.padEnd(14)} ${(distS.top[i].p * 100).toFixed(1).padStart(5)}% (n=${distS.top[i].n})`
      : '                                        ';
    console.log(`  ${left}   ${right}`);
  }

  if (distH || distS) {
    console.log(`  出典: ${(distH ? distH.source : 'n/a').padEnd(24)}   出典: ${distS ? distS.source : 'n/a'}`);
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

  const queries = gatherQueries(opts);
  if (queries.length === 0) {
    printHelp();
    console.error('\n入力がありません。');
    process.exit(1);
  }

  // --compare モード: 両方ロードして並列表示
  if (opts.compare) {
    const dataHeisei = loadData('heisei');
    const dataSumoApi = loadData('sumo-api');
    console.log('番付遷移 Top5 比較（平成 vs sumo-api長期）');
    queries.forEach((q) => compareOne(q, dataHeisei, dataSumoApi, opts.topN));
    return;
  }

  // 通常モード
  const data = loadData(opts.source);

  if (opts.listLabels) {
    Object.keys(data.transitions).forEach((k) => console.log(k));
    return;
  }

  const meta = data.meta;
  console.log(
    `番付遷移 Top${opts.topN} 予測  (source=${opts.source}, era=${meta.era}, basho=${meta.bashoCount}, ` +
      `marginal=${meta.marginalSampleCount}, record=${meta.recordSampleCount})`,
  );

  queries.forEach((q) => predictOne(q, data, opts.topN, ''));
}

main();
