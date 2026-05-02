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

const RUNS = Number(process.env.DIAGNOSTIC_RUNS || 20);
const REFERENCE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'sumo-db',
  'data',
  'analysis',
  'realism_reference_heisei.json',
);
const BANZUKE_TRANSITION_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'sumo-db',
  'data',
  'analysis',
  'banzuke_transition_heisei.json',
);
const BANZUKE_CALIBRATION_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'sumo-db',
  'data',
  'analysis',
  'banzuke_calibration_heisei.json',
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
const winLossKey = (w, l) => `${w}-${l}`;

const SIDE_LABEL = { East: '東', West: '西' };
const RANK_BASE_HALF_STEPS = {
  横綱: 0,
  大関: 2,
  関脇: 4,
  小結: 6,
  前頭: 8,
  十両: 42,
  幕下: 70,
  三段目: 190,
  序二段: 390,
  序ノ口: 590,
};
const DIVISION_RANK_NAME = {
  Makuuchi: '前頭',
  Juryo: '十両',
  Makushita: '幕下',
  Sandanme: '三段目',
  Jonidan: '序二段',
  Jonokuchi: '序ノ口',
};
const RANK_NAME_TO_DIVISION = {
  横綱: 'Makuuchi',
  大関: 'Makuuchi',
  関脇: 'Makuuchi',
  小結: 'Makuuchi',
  前頭: 'Makuuchi',
  十両: 'Juryo',
  幕下: 'Makushita',
  三段目: 'Sandanme',
  序二段: 'Jonidan',
  序ノ口: 'Jonokuchi',
};

const rankToLabel = (rank) => {
  if (!rank || rank.division === 'Maezumo') return null;
  const side = SIDE_LABEL[rank.side] || '東';
  const number = Math.max(1, Math.floor(rank.number || 1));
  return `${side}${rank.name}${number}枚目`;
};

const rankToComparableSlot = (rank) => {
  if (!rank) return null;
  const side = rank.side === 'West' ? 1 : 0;
  const number = Math.max(1, Math.floor(rank.number || 1));
  const rankName = rank.division === 'Makuuchi'
    ? rank.name
    : DIVISION_RANK_NAME[rank.division] ?? rank.name;
  const base = RANK_BASE_HALF_STEPS[rankName];
  if (!Number.isFinite(base)) return null;
  return base + (number - 1) * 2 + side;
};

const labelToComparableSlot = (label) => {
  const normalized = String(label || '').replace('張出', '');
  const match = normalized.match(/^([東西])(.+?)(\d+)枚目$/);
  if (!match) return null;
  const [, sideLabel, rankName, numberText] = match;
  const division = RANK_NAME_TO_DIVISION[rankName];
  if (!division) return null;
  return rankToComparableSlot({
    division,
    name: rankName,
    number: Number(numberText),
    side: sideLabel === '西' ? 'West' : 'East',
  });
};

const quantile = (values, q) => {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] === undefined
    ? sorted[base]
    : sorted[base] + rest * (sorted[base + 1] - sorted[base]);
};

const summarizeValues = (values) => ({
  count: values.length,
  mean: values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length),
  p10: quantile(values, 0.1),
  p50: quantile(values, 0.5),
  p90: quantile(values, 0.9),
});

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
    if (Array.isArray(f.retiredNpcCareerBashoCounts) && f.retiredNpcCareerBashoCounts.length > 0) {
      for (const count of f.retiredNpcCareerBashoCounts) {
        if (Number.isFinite(count) && count > 0) careerLengths.push(count);
      }
    }
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
        life = { firstFrame: i, lastFrame: i, basho: 0, lastCareerBashoCount: undefined };
        npcLifetimes.set(id, life);
      }
      life.lastFrame = i;
      life.basho += 1;
      if (Number.isFinite(npc.careerBashoCount)) {
        life.lastCareerBashoCount = npc.careerBashoCount;
      }
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
    const hasDirectRetirementCounts = (r.frames || []).some(
      (frame) => Array.isArray(frame.retiredNpcCareerBashoCounts),
    );
    if (hasDirectRetirementCounts) continue;
    // NPC retirement detection: NPC dropped before final frame → career ended in sim
    const cutoff = totalFrames - 4; // 4 場所以上前に消えたら引退とみなす
    // 1 frame 出現で消える NPC は entityId 切替や maezumo 卒業等の
    // 測定ノイズが大半 (実データ p10=4 で 1 場所引退はほぼゼロ)。
    // 信頼できる引退検出のため、2 場所以上出現した NPC のみ計上する。
    npcLifetimesPerRun.forEach((life) => {
      if (life.lastFrame < cutoff && life.basho >= 2) {
        careerLengths.push(life.lastCareerBashoCount ?? life.basho);
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

const resolveTransitionBucket = (entry, wins, losses, absent) => {
  const byRecord = entry.byRecord?.[recordKey(wins, losses, absent)];
  if (byRecord) return { level: 'byRecord', bucket: byRecord };
  const byWinLoss = entry.byWinLoss?.[winLossKey(wins, losses)];
  if (byWinLoss) return { level: 'byWinLoss', bucket: byWinLoss };
  if (entry.marginal) return { level: 'marginal', bucket: entry.marginal };
  return null;
};

const summarizeReferenceTransition = (fromLabel, bucket) => {
  const fromSlot = labelToComparableSlot(fromLabel);
  if (fromSlot === null) return null;
  const deltas = [];
  for (const row of bucket.top || []) {
    const toSlot = labelToComparableSlot(row.to);
    if (toSlot === null) continue;
    deltas.push({
      delta: fromSlot - toSlot,
      n: row.n,
      p: row.p,
      to: row.to,
    });
  }
  if (!deltas.length) return null;
  const total = deltas.reduce((sum, row) => sum + row.n, 0);
  const mean = deltas.reduce((sum, row) => sum + row.delta * row.n, 0) / Math.max(1, total);
  const sorted = deltas.slice().sort((a, b) => a.delta - b.delta);
  let cursor = 0;
  let p50 = sorted[0].delta;
  for (const row of sorted) {
    cursor += row.n;
    if (cursor >= total / 2) {
      p50 = row.delta;
      break;
    }
  }
  return {
    total: bucket.total,
    topCovered: total,
    mean,
    p50,
    topTo: (bucket.top || [])[0]?.to,
  };
};

const resolveLowerCalibrationReference = (decision, calibrationReference) => {
  const division = decision.fromRank?.division;
  if (!['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'].includes(division)) return null;
  const rankBand = decision.rankBand;
  const recordBucket = decision.recordBucket;
  const row =
    rankBand && recordBucket
      ? calibrationReference.recordBucketRules?.recordAwareQuantiles?.[division]?.[rankBand]?.[recordBucket]
      : null;
  if (!row) return null;
  return {
    total: row.sampleSize,
    topCovered: row.sampleSize,
    mean: row.p50HalfStep,
    p50: row.p50HalfStep,
    p10: row.p10HalfStep,
    p90: row.p90HalfStep,
    topTo: null,
    level: 'calibration',
  };
};

const compareBanzukeMovement = (results, transitionReference, calibrationReference) => {
  const rows = [];
  for (const result of results) {
    for (const frame of result.frames || []) {
      for (const decision of frame.banzukeDecisions || []) {
        if (decision.rikishiId !== 'PLAYER') continue;
        const wins = decision.wins ?? frame.record?.wins;
        const losses = decision.losses ?? frame.record?.losses;
        const absent = decision.absent ?? frame.record?.absent ?? 0;
        if (!Number.isFinite(wins) || !Number.isFinite(losses)) continue;
        const fromLabel = rankToLabel(decision.fromRank);
        const fromSlot = rankToComparableSlot(decision.fromRank);
        const toSlot = rankToComparableSlot(decision.finalRank);
        if (!fromLabel || fromSlot === null || toSlot === null) continue;
        const calibrationRef = resolveLowerCalibrationReference(decision, calibrationReference);
        const refEntry = transitionReference.transitions[fromLabel];
        const resolved = calibrationRef
          ? { level: calibrationRef.level, bucket: { total: calibrationRef.total } }
          : refEntry
            ? resolveTransitionBucket(refEntry, wins, losses, absent)
            : null;
        if (!resolved) continue;
        const ref = calibrationRef ?? summarizeReferenceTransition(fromLabel, resolved.bucket);
        if (!ref) continue;
        const actualDelta = fromSlot - toSlot;
        rows.push({
          seq: frame.seq,
          division: decision.fromRank.division,
          rankBand: decision.rankBand,
          recordBucket: decision.recordBucket,
          fromLabel,
          toLabel: rankToLabel(decision.finalRank),
          record: recordKey(wins, losses, absent),
          fallbackLevel: resolved.level,
          actualDelta,
          refMeanDelta: ref.mean,
          refP50Delta: ref.p50,
          refP10Delta: ref.p10,
          refP90Delta: ref.p90,
          diffFromMean: actualDelta - ref.mean,
          refSample: resolved.bucket.total,
          refTopCovered: ref.topCovered,
          refTopTo: ref.topTo,
        });
      }
    }
  }

  const buildBuckets = (keyResolver, limit) => {
    const byBucket = new Map();
    for (const row of rows) {
      const key = keyResolver(row);
      if (!key) continue;
      const bucket = byBucket.get(key) ?? [];
      bucket.push(row);
      byBucket.set(key, bucket);
    }
    return [...byBucket.entries()]
      .map(([key, bucketRows]) => {
        const actual = bucketRows.map((row) => row.actualDelta);
        const diff = bucketRows.map((row) => row.diffFromMean);
        const refs = bucketRows.map((row) => row.refMeanDelta);
        const refSamples = bucketRows
          .map((row) => row.refSample)
          .filter((value) => Number.isFinite(value));
        return {
          key,
          sample: bucketRows.length,
          actual: summarizeValues(actual),
          refTargetAverage: refs.reduce((sum, value) => sum + value, 0) / Math.max(1, refs.length),
          averageError: diff.reduce((sum, value) => sum + value, 0) / Math.max(1, diff.length),
          meanAbsError: diff.reduce((sum, value) => sum + Math.abs(value), 0) / Math.max(1, diff.length),
          refSampleP50: quantile(refSamples, 0.5),
          fallbackMix: bucketRows.reduce((acc, row) => {
            acc[row.fallbackLevel] = (acc[row.fallbackLevel] || 0) + 1;
            return acc;
          }, {}),
        };
      })
      .sort((a, b) => b.sample - a.sample || b.meanAbsError - a.meanAbsError)
      .slice(0, limit);
  };

  const buckets = buildBuckets((row) => `${row.division}:${row.record}`, 16);
  const rankBandBuckets = buildBuckets((row) => {
    if (!row.rankBand || !row.recordBucket) return null;
    return `${row.division}:${row.rankBand}:${row.recordBucket}`;
  }, 18);
  const topDivergent = rows
    .slice()
    .sort((a, b) => Math.abs(b.diffFromMean) - Math.abs(a.diffFromMean))
    .slice(0, TOP_DIVERGENT);
  return {
    sample: rows.length,
    comparedBuckets: new Set(rows.map((row) => `${row.division}:${row.record}`)).size,
    meanAbsError:
      rows.reduce((sum, row) => sum + Math.abs(row.diffFromMean), 0) / Math.max(1, rows.length),
    buckets,
    rankBandBuckets,
    topDivergent,
  };
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

  if (payload.banzukeMovementCompare) {
    const m = payload.banzukeMovementCompare;
    lines.push('## 3. 勝敗別の昇降幅');
    lines.push('');
    lines.push('- 尺度: 平成実データの `slot_rank_value` 差と同じ半枚刻み。表示は 2 で割った「枚相当」。');
    lines.push('- 下位番付は rank band / record bucket 別の実データ中央値、関取以上は同番付ラベルの経験的遷移から参照中心値を作る。');
    lines.push(`- 比較サンプル: ${m.sample}`);
    lines.push(`- 比較bucket数: ${m.comparedBuckets}`);
    lines.push(`- 平均絶対誤差: ${(m.meanAbsError / 2).toFixed(2)}枚相当`);
    lines.push('');
    lines.push('### 部屋別・勝敗別');
    lines.push('');
    lines.push('| bucket | n | actual p50 | ref target | avg error | fallback |');
    lines.push('|---|---:|---:|---:|---:|---|');
    for (const row of m.buckets) {
      const fallback = Object.entries(row.fallbackMix).map(([k, v]) => `${k}:${v}`).join(', ');
      lines.push(
        `| ${row.key} | ${row.sample} | ${(row.actual.p50 / 2).toFixed(1)} | ${(row.refTargetAverage / 2).toFixed(1)} | ${(row.averageError / 2).toFixed(1)} | ${fallback} |`,
      );
    }
    lines.push('');
    lines.push('### 番付帯・成績型別');
    lines.push('');
    lines.push('| bucket | n | actual p50 | ref target | avg error | ref n p50 |');
    lines.push('|---|---:|---:|---:|---:|---:|');
    for (const row of m.rankBandBuckets) {
      lines.push(
        `| ${row.key} | ${row.sample} | ${(row.actual.p50 / 2).toFixed(1)} | ${(row.refTargetAverage / 2).toFixed(1)} | ${(row.averageError / 2).toFixed(1)} | ${Number.isFinite(row.refSampleP50) ? row.refSampleP50.toFixed(0) : 'n/a'} |`,
      );
    }
    lines.push('');
    lines.push('### 昇降幅の大きな乖離例');
    lines.push('');
    lines.push('| from | record | sim next | sim delta | ref target | ref n | ref top | fallback |');
    lines.push('|---|---|---|---:|---:|---:|---|---|');
    for (const row of m.topDivergent) {
      lines.push(
        `| ${row.fromLabel} | ${row.record} | ${row.toLabel ?? 'n/a'} | ${(row.actualDelta / 2).toFixed(1)} | ${(row.refMeanDelta / 2).toFixed(1)} | ${Number.isFinite(row.refSample) ? row.refSample : 'n/a'} | ${row.refTopTo ?? 'n/a'} | ${row.fallbackLevel} |`,
      );
    }
    lines.push('');
  }
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
  const banzukeTransitionReference = JSON.parse(fs.readFileSync(BANZUKE_TRANSITION_PATH, 'utf-8'));
  const banzukeCalibrationReference = JSON.parse(fs.readFileSync(BANZUKE_CALIBRATION_PATH, 'utf-8'));
  const recordCompare = compareRecords(agg.cellsByDivision, reference.recordHistogramByDivision);
  const careerCompare = compareCareer(agg.careerBins, reference.careerBashoHistogram);
  const banzukeMovementCompare = compareBanzukeMovement(
    results,
    banzukeTransitionReference,
    banzukeCalibrationReference,
  );

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
    banzukeMovementCompare,
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
  console.log(`  banzuke movement: sample=${banzukeMovementCompare.sample} meanAbsError=${(banzukeMovementCompare.meanAbsError / 2).toFixed(2)}枚`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
