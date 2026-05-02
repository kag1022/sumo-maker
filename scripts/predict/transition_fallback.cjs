const MIN_NEARBY_SAMPLES = 3;

const RANK_NAME_ORDER = new Map([
  ['横綱', 0],
  ['大関', 1],
  ['関脇', 2],
  ['小結', 3],
  ['前頭', 4],
  ['十両', 5],
  ['幕下', 6],
  ['三段目', 7],
  ['序二段', 8],
  ['序ノ口', 9],
]);

const parseRankLabel = (label) => {
  const match = String(label).match(/^([東西])(.+?)(\d+)枚目$/);
  if (!match) return null;
  const name = match[2];
  return {
    side: match[1],
    name,
    number: Number.parseInt(match[3], 10),
    order: RANK_NAME_ORDER.get(name) ?? 99,
  };
};

const recordKey = (record) => `${record.wins}-${record.losses}-${record.absences ?? record.absent ?? 0}`;

const winLossKey = (record) => `${record.wins}-${record.losses}`;

const aggregateBuckets = (buckets, source) => {
  const counts = new Map();
  let total = 0;
  for (const bucket of buckets) {
    for (const row of bucket.top || []) {
      counts.set(row.to, (counts.get(row.to) || 0) + row.n);
      total += row.n;
    }
  }
  if (total <= 0) return null;
  const top = [...counts.entries()]
    .map(([to, n]) => ({ to, n, p: n / total }))
    .sort((a, b) => b.n - a.n || a.to.localeCompare(b.to, 'ja-JP'));
  return { total, top, source };
};

const collectNearbyBuckets = (data, label, record, exactRecord, radius) => {
  const parsed = parseRankLabel(label);
  if (!parsed) return [];
  const buckets = [];
  for (const [candidateLabel, entry] of Object.entries(data.transitions || {})) {
    if (candidateLabel === label) continue;
    const candidate = parseRankLabel(candidateLabel);
    if (!candidate) continue;
    if (candidate.name !== parsed.name) continue;
    if (Math.abs(candidate.number - parsed.number) > radius) continue;
    const bucket = exactRecord
      ? entry.byRecord?.[recordKey(record)]
      : entry.byWinLoss?.[winLossKey(record)];
    if (bucket) buckets.push(bucket);
  }
  return buckets;
};

const resolveNearbyDistribution = (data, label, record, exactRecord) => {
  for (const radius of [1, 2, 3, 5, 8]) {
    const buckets = collectNearbyBuckets(data, label, record, exactRecord, radius);
    const total = buckets.reduce((sum, bucket) => sum + (bucket.total || 0), 0);
    if (total >= MIN_NEARBY_SAMPLES) {
      const key = exactRecord ? recordKey(record) : winLossKey(record);
      const source = `nearby${exactRecord ? 'ByRecord' : 'ByWinLoss'}[${key},±${radius}]`;
      return aggregateBuckets(buckets, source);
    }
  }
  return null;
};

const pickTransitionDistribution = (data, label, record, options = {}) => {
  const minSamples = options.minSamples ?? 5;
  const entry = data.transitions?.[label];
  if (!entry) return null;

  if (record) {
    const keyA = recordKey(record);
    if (entry.byRecord?.[keyA]?.total >= minSamples) {
      return { ...entry.byRecord[keyA], source: `byRecord[${keyA}]` };
    }
    const keyB = winLossKey(record);
    if (entry.byWinLoss?.[keyB]?.total >= minSamples) {
      return { ...entry.byWinLoss[keyB], source: `byWinLoss[${keyB}] (休フォールバック)` };
    }

    const nearbyRecord = resolveNearbyDistribution(data, label, record, true);
    if (nearbyRecord) return nearbyRecord;
    const nearbyWinLoss = resolveNearbyDistribution(data, label, record, false);
    if (nearbyWinLoss) return nearbyWinLoss;

    if (entry.byRecord?.[keyA]) {
      return { ...entry.byRecord[keyA], source: `byRecord[${keyA}] (n<${minSamples})` };
    }
    if (entry.byWinLoss?.[keyB]) {
      return { ...entry.byWinLoss[keyB], source: `byWinLoss[${keyB}] (n<${minSamples})` };
    }
  }

  if (entry.marginal) {
    return { ...entry.marginal, source: 'marginal (成績条件なし)' };
  }
  return null;
};

module.exports = {
  pickTransitionDistribution,
};
