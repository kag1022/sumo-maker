#!/usr/bin/env node
/**
 * リアリズム診断: ゲームシミュレーションの出力を平成実データと比較する。
 *
 * 比較軸:
 *   1. 場所成績 (W, L, A) ヒストグラム / 部屋格別
 *   2. 引退時のキャリア場所数分布
 *
 * 出力:
 *   .tmp/realism-diagnostic.json
 *   docs/balance/realism-diagnostic.md
 *
 * 使い方:
 *   node scripts/predict/realism_diagnostic.cjs            # N=10 (既定)
 *   DIAGNOSTIC_RUNS=20 node scripts/predict/realism_diagnostic.cjs
 */

const fs = require('fs');
const path = require('path');
const { ensureSimTestsBuild } = require('../shared/ensure_simtests_build.cjs');
const { loadObservationModule } = require('../reports/_shared/observation_module.cjs');

const RUNS = Number(process.env.DIAGNOSTIC_RUNS || 10);
const REFERENCE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'sumo-db',
  'data',
  'analysis',
  'realism_reference_heisei.json',
);
const JSON_OUT = path.join('.tmp', 'realism-diagnostic.json');
const MD_OUT = path.join('docs', 'balance', 'realism-diagnostic.md');

const TOP_DIVERGENT = 8;
const CAREER_BINS = [
  [1, 1], [2, 2], [3, 3], [4, 6], [7, 12], [13, 24],
  [25, 48], [49, 72], [73, 96], [97, 144], [145, 9999],
];

const binCareer = (v) => {
  for (const [lo, hi] of CAREER_BINS) {
    if (v >= lo && v <= hi) return lo === hi ? String(lo) : `${lo}-${hi}`;
  }
  return 'other';
};

const recordKey = (w, l, a) => `${w}-${l}-${a}`;

// 平滑化付きカテゴリカル分布の KL(P||Q)
const klDivergence = (pMap, qMap, smoothing = 1e-6) => {
  const keys = new Set([...Object.keys(pMap), ...Object.keys(qMap)]);
  let pTotal = 0;
  let qTotal = 0;
  for (const k of keys) {
    pTotal += (pMap[k] || 0) + smoothing;
    qTotal += (qMap[k] || 0) + smoothing;
  }
  let kl = 0;
  for (const k of keys) {
    const p = ((pMap[k] || 0) + smoothing) / pTotal;
    const q = ((qMap[k] || 0) + smoothing) / qTotal;
    if (p > 0) kl += p * Math.log(p / q);
  }
  return kl;
};

const collectFromCareer = (career, perDivisionRecords, perKeyCellsByDiv, careerLengths, npcLifetimes) => {
  // career: CareerObservationResult
  const frames = career.frames || [];
  const playerHistoryRecords = career.finalStatus?.history?.records || [];
  // Player records (BashoRecord)
  for (const rec of playerHistoryRecords) {
    const div = rec?.rank?.division;
    if (!div) continue;
    const w = rec.wins | 0;
    const l = rec.losses | 0;
    const a = rec.absent | 0;
    perDivisionRecords[div] = (perDivisionRecords[div] || 0) + 1;
    if (!perKeyCellsByDiv[div]) perKeyCellsByDiv[div] = {};
    const key = recordKey(w, l, a);
    perKeyCellsByDiv[div][key] = (perKeyCellsByDiv[div][key] || 0) + 1;
  }
  // Player career length
  if (career.summary?.careerOutcome?.bashoCount > 0) {
    careerLengths.push(career.summary.careerOutcome.bashoCount);
  }
  // NPC per-frame records & lifetime tracking
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (f.kind !== 'BASHO') continue;
    for (const npc of f.npcResults || []) {
      const div = npc.division;
      if (!div) continue;
      const w = npc.wins | 0;
      const l = npc.losses | 0;
      const a = npc.absent | 0;
      perDivisionRecords[div] = (perDivisionRecords[div] || 0) + 1;
      if (!perKeyCellsByDiv[div]) perKeyCellsByDiv[div] = {};
      const key = recordKey(w, l, a);
      perKeyCellsByDiv[div][key] = (perKeyCellsByDiv[div][key] || 0) + 1;
      // Lifetime tracking
      const id = npc.entityId;
      if (!id) continue;
      let life = npcLifetimes.get(id);
      if (!life) {
        life = { firstFrame: i, lastFrame: i, basho: 0 };
        npcLifetimes.set(id, life);
      }
      life.lastFrame = i;
      life.basho += 1;
    }
  }
};

const aggregate = (results) => {
  const totalsByDivision = {};
  const cellsByDivision = {};
  const careerLengths = [];

  for (const r of results) {
    const npcLifetimesPerRun = new Map();
    const totalFrames = (r.frames || []).length;
    collectFromCareer(r, totalsByDivision, cellsByDivision, careerLengths, npcLifetimesPerRun);
    // NPC retirement detection: NPC dropped before final frame → career ended in sim
    const cutoff = totalFrames - 4; // 4 場所以上前に消えたら引退とみなす
    // 1 frame 出現で消える NPC は entityId 切替や maezumo 卒業等の
    // 測定ノイズが大半 (実データ p10=4 で 1 場所引退はほぼゼロ)。
    // 信頼できる引退検出のため、2 場所以上出現した NPC のみ計上する。
    npcLifetimesPerRun.forEach((life) => {
      if (life.lastFrame < cutoff && life.basho >= 2) {
        careerLengths.push(life.basho);
      }
    });
  }

  const careerBins = {};
  for (const v of careerLengths) {
    const b = binCareer(v);
    careerBins[b] = (careerBins[b] || 0) + 1;
  }

  return { totalsByDivision, cellsByDivision, careerLengths, careerBins };
};

const compareRecords = (simCells, refCells) => {
  // simCells: { division: { 'W-L-A': count } }
  // refCells: from JSON, recordHistogramByDivision[div].cells: [{w,l,a,n,p}]
  const result = {};
  for (const div of Object.keys(simCells)) {
    const refDiv = refCells[div];
    if (!refDiv) {
      result[div] = { error: 'no reference', sim: simCells[div] };
      continue;
    }
    const refMap = {};
    for (const cell of refDiv.cells) {
      refMap[recordKey(cell.w, cell.l, cell.a)] = cell.n;
    }
    const kl = klDivergence(simCells[div], refMap);
    // Top-divergent cells: sort by |sim_p - ref_p| descending
    const simTotal = Object.values(simCells[div]).reduce((s, v) => s + v, 0);
    const refTotal = refDiv.total;
    const allKeys = new Set([...Object.keys(simCells[div]), ...Object.keys(refMap)]);
    const diffs = [];
    for (const k of allKeys) {
      const sP = (simCells[div][k] || 0) / Math.max(1, simTotal);
      const rP = (refMap[k] || 0) / Math.max(1, refTotal);
      diffs.push({
        key: k,
        simP: sP,
        refP: rP,
        diff: sP - rP,
        ratio: rP > 0 ? sP / rP : Infinity,
        simN: simCells[div][k] || 0,
        refN: refMap[k] || 0,
      });
    }
    diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    result[div] = {
      kl: Number(kl.toFixed(4)),
      simSample: simTotal,
      refSample: refTotal,
      topDivergent: diffs.slice(0, TOP_DIVERGENT),
    };
  }
  return result;
};

const compareCareer = (simBins, refHist) => {
  const refMap = {};
  for (const b of refHist.bins) refMap[b.bin] = b.n;
  const kl = klDivergence(simBins, refMap);
  const simTotal = Object.values(simBins).reduce((s, v) => s + v, 0);
  const refTotal = Object.values(refMap).reduce((s, v) => s + v, 0);
  const allKeys = new Set([...Object.keys(simBins), ...Object.keys(refMap)]);
  const diffs = [];
  for (const k of allKeys) {
    const sP = (simBins[k] || 0) / Math.max(1, simTotal);
    const rP = (refMap[k] || 0) / Math.max(1, refTotal);
    diffs.push({ bin: k, simP: sP, refP: rP, diff: sP - rP, simN: simBins[k] || 0, refN: refMap[k] || 0 });
  }
  // Sort by bin order (use CAREER_BINS)
  const order = CAREER_BINS.map(([lo, hi]) => (lo === hi ? String(lo) : `${lo}-${hi}`));
  diffs.sort((a, b) => order.indexOf(a.bin) - order.indexOf(b.bin));
  return { kl: Number(kl.toFixed(4)), simSample: simTotal, refSample: refTotal, bins: diffs };
};

const renderMarkdown = (payload) => {
  const lines = [];
  lines.push('# リアリズム診断レポート');
  lines.push('');
  lines.push(`- 生成: ${payload.generatedAt}`);
  lines.push(`- シム実行数: ${payload.runs} (player careers, それぞれの全 NPC を含む)`);
  lines.push(`- 平成参照: ${payload.reference.recordSample} 場所記録, ${payload.reference.careerSample} 引退力士`);
  lines.push('');
  lines.push('## 1. 場所成績ヒストグラム (W-L-A) — 部屋格別 KL(sim || real)');
  lines.push('');
  lines.push('| 部屋 | sim n | ref n | KL | 上位乖離セル |');
  lines.push('|---|---:|---:|---:|---|');
  for (const [div, r] of Object.entries(payload.recordCompare)) {
    if (r.error) {
      lines.push(`| ${div} | – | – | – | ${r.error} |`);
      continue;
    }
    const top = r.topDivergent.slice(0, 5).map((d) => {
      const arrow = d.diff > 0 ? '↑' : '↓';
      return `${d.key} ${arrow}${(Math.abs(d.diff) * 100).toFixed(1)}pp (sim ${(d.simP * 100).toFixed(1)}% vs ref ${(d.refP * 100).toFixed(1)}%)`;
    }).join('<br>');
    lines.push(`| ${div} | ${r.simSample} | ${r.refSample} | ${r.kl} | ${top} |`);
  }
  lines.push('');
  lines.push('### 解釈の指標');
  lines.push('- KL < 0.05: ほぼ実データ通り');
  lines.push('- KL 0.05–0.20: 軽い偏り (調整余地あり)');
  lines.push('- KL > 0.20: 明確な乖離 (要修正)');
  lines.push('- 上位乖離セルが 8-7 / 7-8 / 4-3 / 3-4 に集中していれば「成績収束」問題が確認される');
  lines.push('');

  lines.push('## 2. 引退時キャリア場所数分布');
  lines.push('');
  const c = payload.careerCompare;
  lines.push(`- KL: **${c.kl}**  (sim n=${c.simSample}, ref n=${c.refSample})`);
  lines.push('');
  lines.push('| ビン (場所数) | sim % | ref % | 差分 (pp) |');
  lines.push('|---|---:|---:|---:|');
  for (const b of c.bins) {
    const arrow = b.diff > 0 ? '↑' : (b.diff < 0 ? '↓' : '·');
    lines.push(`| ${b.bin} | ${(b.simP * 100).toFixed(1)} | ${(b.refP * 100).toFixed(1)} | ${arrow}${(b.diff * 100).toFixed(1)} |`);
  }
  lines.push('');
  lines.push('## 推奨修正優先度 (粗診断)');
  lines.push('');
  const recordKls = Object.values(payload.recordCompare).filter((r) => !r.error).map((r) => r.kl);
  const maxRecordKl = recordKls.length ? Math.max(...recordKls) : 0;
  const careerKl = c.kl;
  const recos = [];
  if (maxRecordKl > 0.20) recos.push(`場所成績分布の修正 (最大 KL=${maxRecordKl}, 8-7/7-8/4-3 等を確認)`);
  if (careerKl > 0.20) recos.push(`引退タイミング修正 (KL=${careerKl})`);
  if (!recos.length) recos.push('明確な KL > 0.20 はなし。それでも体感に違和感があれば、より細かい (rank-band 別) 分析が必要。');
  recos.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
  lines.push('');
  return lines.join('\n');
};

(async () => {
  console.log(`診断: ${RUNS} runs を実行します。`);
  const build = ensureSimTestsBuild();
  console.log(`compiledAt: ${build.compiledAt}`);

  const obs = loadObservationModule();
  const results = [];
  for (let i = 0; i < RUNS; i++) {
    const seed = ((i + 1) * 2654435761 + 97) >>> 0;
    process.stdout.write(`  run ${i + 1}/${RUNS} (seed=${seed})... `);
    const t0 = Date.now();
    const r = await obs.runCareerObservation({ seed });
    results.push(r);
    console.log(`done (${((Date.now() - t0) / 1000).toFixed(1)}s, ${r.frames.length} frames)`);
  }

  const agg = aggregate(results);
  const reference = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf-8'));
  const recordCompare = compareRecords(agg.cellsByDivision, reference.recordHistogramByDivision);
  const careerCompare = compareCareer(agg.careerBins, reference.careerBashoHistogram);

  const payload = {
    generatedAt: new Date().toISOString(),
    compiledAt: build.compiledAt,
    runs: RUNS,
    reference: {
      recordSample: reference.recordHistogramOverall.total,
      careerSample: reference.careerBashoHistogram.sample,
    },
    sim: {
      perDivisionTotals: agg.totalsByDivision,
      careerLengthSample: agg.careerLengths.length,
    },
    recordCompare,
    careerCompare,
  };

  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.mkdirSync(path.dirname(MD_OUT), { recursive: true });
  fs.writeFileSync(JSON_OUT, JSON.stringify(payload, null, 2));
  fs.writeFileSync(MD_OUT, renderMarkdown(payload));

  console.log(`\n書き出し:`);
  console.log(`  ${JSON_OUT}`);
  console.log(`  ${MD_OUT}`);
  console.log('');
  console.log('--- サマリ ---');
  for (const [div, r] of Object.entries(recordCompare)) {
    if (r.error) {
      console.log(`  records ${div}: ${r.error}`);
    } else {
      console.log(`  records ${div}: KL=${r.kl}  (sim ${r.simSample} vs ref ${r.refSample})`);
    }
  }
  console.log(`  career length: KL=${careerCompare.kl}  (sim ${careerCompare.simSample} vs ref ${careerCompare.refSample})`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
