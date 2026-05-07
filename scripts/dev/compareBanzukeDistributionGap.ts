#!/usr/bin/env npx tsx
/**
 * scripts/dev/compareBanzukeDistributionGap.ts (Expanded)
 *
 * 現行シミュレーション分布と実データhintを比較する（拡張版）。
 *
 * 使い方:
 *   npx tsx scripts/dev/compareBanzukeDistributionGap.ts --runs 12 --bashos 90
 *
 * アプローチ: LogicLabの複数プリセットを使い、多様なrankZoneのデータを収集。
 *
 * 出力:
 *   docs/realdata_integration/banzuke_distribution_gap_expanded.json
 *   docs/realdata_integration/banzuke_distribution_gap_expanded.md
 *   docs/realdata_integration/banzuke_distribution_gap_expanded_summary.md
 */

import * as fs from "fs";
import { createLogicLabRun } from "../../src/features/logicLab/runner";
import { classifyRankZone, LONG_RANGE_BUCKETS } from "../../src/logic/calibration/realData";
import type { RealDataMovementHint } from "../../src/logic/calibration/realData/realDataTypes";
import { getRankValue } from "../../src/logic/ranking/rankScore";

// ── CLI args ──
const args = process.argv.slice(2);
const getArg = (flag: string, def: number) => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? parseInt(args[i + 1], 10) : def;
};
const SIM_RUNS = getArg("--runs", 12);
const BASHOS_PER_RUN = getArg("--bashos", 90);
const MIN_SAMPLES = 5;

// 複数プリセットを使い多様なrankZoneをカバー
const PRESETS = [
  { id: "RANDOM_BASELINE" as const, label: "baseline" },
  { id: "STANDARD_B_GRINDER" as const, label: "grinder" },
  { id: "HIGH_TALENT_AS" as const, label: "elite" },
  { id: "LOW_TALENT_CD" as const, label: "washout" },
];

interface MovementRecord { rankLabel: string; wins: number; losses: number; absences: number; movementSteps: number; zone: string; }
function parseRankLabel(rankName: string, rankNumber?: number, rankSide?: "East" | "West"): string {
  const side = rankSide === "West" ? "西" : "東";
  return ["横綱","大関","関脇","小結"].includes(rankName)
    ? `${side}${rankName}1枚目` : `${side}${rankName}${rankNumber ?? 1}枚目`;
}
function resolveAbsencesBucket(absences: number): string {
  if (absences <= 0) return "0"; if (absences <= 7) return "1-7"; if (absences <= 14) return "8-14"; return "15";
}
function quantiles(values: number[]) {
  if (values.length < MIN_SAMPLES) return null;
  const s = [...values].sort((a,b)=>a-b); const n = s.length;
  const q = (p: number) => { const idx = p*(n-1); const lo = Math.floor(idx); const hi = Math.min(lo+1,n-1); return s[lo]+(idx-lo)*(s[hi]-s[lo]); };
  return { p10: Math.round(q(.10)*100)/100, p25: Math.round(q(.25)*100)/100, median: Math.round(q(.50)*100)/100, p75: Math.round(q(.75)*100)/100, p90: Math.round(q(.90)*100)/100 };
}

async function main() {
  console.log(`Starting expanded comparison: ${SIM_RUNS} runs, ${BASHOS_PER_RUN} bashos/run, ${PRESETS.length} presets`);

  const allMovements: MovementRecord[] = [];
  const zoneTransitionCounts: Record<string, number> = {};
  let totalRuns = 0;

  for (const preset of PRESETS) {
    const runsPerPreset = Math.max(1, Math.ceil(SIM_RUNS / PRESETS.length));
    for (let r = 0; r < runsPerPreset; r++) {
      totalRuns++;
      const lab = createLogicLabRun({ presetId: preset.id, seed: 2000 + totalRuns, maxBasho: BASHOS_PER_RUN });
      while (true) {
        const step = await lab.step();
        if (step.kind !== "BASHO") break;
        const label = parseRankLabel(step.logRow.rankBefore.name, step.logRow.rankBefore.number, step.logRow.rankBefore.side);
        const playerMove = getRankValue(step.logRow.rankAfter) - getRankValue(step.logRow.rankBefore);
        const zone = classifyRankZone(label) ?? "unknown";
        allMovements.push({ rankLabel: label, wins: step.logRow.record.wins, losses: step.logRow.record.losses, absences: step.logRow.record.absent, movementSteps: -playerMove, zone });
        zoneTransitionCounts[zone] = (zoneTransitionCounts[zone] ?? 0) + 1;
      }
      if (totalRuns % 4 === 0) console.log(`  ${totalRuns} runs, ${allMovements.length} transitions`);
    }
  }

  console.log(`Total: ${allMovements.length} transitions across ${Object.keys(zoneTransitionCounts).length} zones`);
  for (const [z, c] of Object.entries(zoneTransitionCounts).sort()) console.log(`  ${z}: ${c}`);

  // 集計
  const simBuckets = new Map<string, number[]>();
  for (const m of allMovements) {
    const key = `${m.zone}|${m.wins}|${m.losses}|${resolveAbsencesBucket(m.absences)}`;
    if (!simBuckets.has(key)) simBuckets.set(key, []);
    simBuckets.get(key)!.push(m.movementSteps);
  }

  function findRealHint(zone: string, wins: number, losses: number, absences: number): RealDataMovementHint | null {
    const absB = resolveAbsencesBucket(absences);
    let best: (typeof LONG_RANGE_BUCKETS)[number] | null = null;
    for (const b of LONG_RANGE_BUCKETS) {
      if (b.rankZone !== zone || b.wins !== wins || b.losses !== losses) continue;
      if (b.absencesBucket === absB) return { source:"sumo-api-long-range", rankZone:b.rankZone, wins:b.wins, losses:b.losses, absences, sampleCount:b.sampleCount, confidence:b.confidence, expectedMovement:b.expectedMovement, range:{p10:b.p10,p25:b.p25,median:b.median,p75:b.p75,p90:b.p90} };
      if (!best || b.sampleCount > best.sampleCount) best = b;
    }
    if (!best) return null;
    return { source:"sumo-api-long-range", rankZone:best.rankZone, wins:best.wins, losses:best.losses, absences, sampleCount:best.sampleCount, confidence:best.confidence, expectedMovement:best.expectedMovement, range:{p10:best.p10,p25:best.p25,median:best.median,p75:best.p75,p90:best.p90} };
  }

  interface Gap { zone:string; wins:number; losses:number; absBucket:string; simCount:number; realCount:number; simExpected:number; realExpected:number; deltaExpected:number; simMedian:number; realMedian:number; simP25:number; realP25:number; simP75:number; realP75:number; severity:string; recommendation:string; }
  const gaps: Gap[] = [];

  for (const [key, simVals] of simBuckets) {
    const [zone, w, l, absBucket] = key.split("|");
    const wins = parseInt(w), losses = parseInt(l);
    const simQ = quantiles(simVals); if (!simQ) continue;
    const realHint = findRealHint(zone, wins, losses, absBucket==="0"?0:1); if (!realHint) continue;
    const simExp = Math.round(simVals.reduce((a,b)=>a+b,0)/simVals.length*100)/100;
    const delta = Math.abs(simExp - realHint.expectedMovement);
    const sev = delta < 1 ? "low" : delta < 3 ? "medium" : "high";
    const rec = (["Yokozuna","Ozeki","Sanyaku"].includes(zone)) ? "needs_context_model"
      : sev==="low" ? "keep_existing"
      : (zone==="Juryo_Low"||zone==="Makushita_Upper_5"||zone==="Makushita_Upper_15") ? "candidate_for_boundary_review"
      : sev==="high" ? "candidate_for_blend" : "use_hint_as_reference_only";
    gaps.push({ zone,wins,losses,absBucket, simCount:simVals.length, realCount:realHint.sampleCount, simExpected:simExp, realExpected:realHint.expectedMovement, deltaExpected:Math.round(delta*100)/100, simMedian:simQ.median, realMedian:realHint.range.median, simP25:simQ.p25, realP25:realHint.range.p25, simP75:simQ.p75, realP75:realHint.range.p75, severity:sev, recommendation:rec });
  }
  gaps.sort((a,b)=>b.deltaExpected-a.deltaExpected);

  // ── Output ──
  fs.mkdirSync("docs/realdata_integration", { recursive: true });
  fs.writeFileSync("docs/realdata_integration/banzuke_distribution_gap_expanded.json", JSON.stringify({ meta: { runs:totalRuns, bashosPerRun:BASHOS_PER_RUN, totalTransitions:allMovements.length, comparableBuckets:gaps.length, zoneTransitionCounts }, gaps }, null, 2), "utf-8");

  const low=gaps.filter(g=>g.severity==="low"), med=gaps.filter(g=>g.severity==="medium"), hi=gaps.filter(g=>g.severity==="high");
  const zones = [...new Set(gaps.map(g=>g.zone))].sort();
  const zoneComparable: Record<string,number> = {}; for (const g of gaps) zoneComparable[g.zone] = (zoneComparable[g.zone]??0)+1;

  const md = ["# Banzuke Distribution Gap Report (Expanded)", `Generated: ${new Date().toISOString().slice(0,19).replace("T"," ")}`, "",
    "## 1. 実行条件", `- runs: ${totalRuns}`, `- bashosPerRun: ${BASHOS_PER_RUN}`, `- totalTransitions: ${allMovements.length}`, `- comparableBuckets: ${gaps.length}`,
    "", "## 2. rankZone別 到達数", "| zone | transitions | comparable |", "|------|-------------|------------|"];
  for (const z of zones) md.push(`| ${z} | ${zoneTransitionCounts[z]??0} | ${zoneComparable[z]??0} |`);

  md.push("", "## 3. 全体統計", `- low: ${low.length}`, `- medium: ${med.length}`, `- high: ${hi.length}`,
    "", "## 4. rankZone別サマリ", "| zone | buckets | avgDelta | high | medium | low |", "|------|---------|----------|------|--------|-----|");
  for (const z of zones) { const zg=gaps.filter(g=>g.zone===z); const avg=zg.reduce((s,g)=>s+g.deltaExpected,0)/zg.length; md.push(`| ${z} | ${zg.length} | ${avg.toFixed(2)} | ${zg.filter(g=>g.severity==="high").length} | ${zg.filter(g=>g.severity==="medium").length} | ${zg.filter(g=>g.severity==="low").length} |`); }

  md.push("", "## 5. 幕内のズレ", "| zone | record | simExp | realExp | delta | sev |", "|------|--------|--------|---------|-------|-----|");
  for (const g of gaps.filter(g=>g.zone.startsWith("Makuuchi"))) md.push(`| ${g.zone} | ${g.wins}-${g.losses} | ${g.simExpected} | ${g.realExpected} | ${g.deltaExpected} | ${g.severity} |`);

  md.push("", "## 6. 十両のズレ", "| zone | record | simExp | realExp | delta | sev |", "|------|--------|--------|---------|-------|-----|");
  for (const g of gaps.filter(g=>g.zone.startsWith("Juryo"))) md.push(`| ${g.zone} | ${g.wins}-${g.losses} | ${g.simExpected} | ${g.realExpected} | ${g.deltaExpected} | ${g.severity} |`);

  md.push("", "## 7. 幕下上位のズレ", "| zone | record | simExp | realExp | delta | sev |", "|------|--------|--------|---------|-------|-----|");
  for (const g of gaps.filter(g=>g.zone.startsWith("Makushita"))) md.push(`| ${g.zone} | ${g.wins}-${g.losses} | ${g.simExpected} | ${g.realExpected} | ${g.deltaExpected} | ${g.severity} |`);

  md.push("", "## 8. Boundary Buckets", "| zone | record | delta | simExp | realExp | rec |", "|------|--------|-------|--------|---------|-----|");
  for (const g of gaps.filter(g=>g.recommendation==="candidate_for_boundary_review")) md.push(`| ${g.zone} | ${g.wins}-${g.losses} | ${g.deltaExpected} | ${g.simExpected} | ${g.realExpected} | ${g.recommendation} |`);

  md.push("", "## 9. candidate_for_blend", "| zone | record | delta | simExp | realExp |", "|------|--------|-------|--------|---------|");
  for (const g of gaps.filter(g=>g.recommendation==="candidate_for_blend")) md.push(`| ${g.zone} | ${g.wins}-${g.losses} | ${g.deltaExpected} | ${g.simExpected} | ${g.realExpected} |`);

  md.push("", "## 10. needs_context_model", "| zone | record | sev |", "|------|--------|-----|");
  for (const g of gaps.filter(g=>g.recommendation==="needs_context_model")) md.push(`| ${g.zone} | ${g.wins}-${g.losses} | ${g.severity} |`);

  md.push("", "## 11. 次に実装すべきタスク",
    "1. 幕内のズレが大きいrecordでblend候補をLogicLab検証",
    "2. 十両/幕下境界の `candidate_for_boundary_review` を重点検証",
    "3. 実データhintをoptimizerのpriorとして追加（blendではなくpressure）",
    "4. 長期データのweight付け（昭和より平成・令和を重視するか）の検討");
  fs.writeFileSync("docs/realdata_integration/banzuke_distribution_gap_expanded.md", md.join("\n"), "utf-8");

  // Summary
  const hiBlend = gaps.filter(g=>g.severity==="high"&&g.recommendation==="candidate_for_blend");
  const hiBoundary = gaps.filter(g=>g.severity==="high"&&g.recommendation==="candidate_for_boundary_review");
  const hasMakuuchi = gaps.some(g=>g.zone.startsWith("Makuuchi"));
  const hasJuryo = gaps.some(g=>g.zone.startsWith("Juryo"));
  const hasMakushita = gaps.some(g=>g.zone.startsWith("Makushita"));

  const summary = ["# Banzuke Distribution Gap — Expanded Summary", "",
    `**${totalRuns} runs × ${BASHOS_PER_RUN} bashos = ${allMovements.length} transitions**. ${gaps.length} comparable buckets (${low.length} low, ${med.length} medium, ${hi.length} high).`,
    "",
    "## カバレッジ", `- 幕内: ${hasMakuuchi?"✅":"❌ 到達せず"}`, `- 十両: ${hasJuryo?"✅":"❌ 到達せず"}`, `- 幕下上位: ${hasMakushita?"✅":"❌ 到達せず"}`,
    "",
    "## 現行ロジックの昇進強度",
    hiBlend.length > 0
      ? `- 現行ロジックは実データより昇進が${hiBlend.filter(g=>g.simExpected>g.realExpected).length>hiBlend.filter(g=>g.simExpected<g.realExpected).length?"強い":"弱い"}傾向（${hiBlend.length}個のhigh gap）`
      : "- high gap不足のため判断保留",
    "",
    "## B tier 幕下吸着関連",
    hiBoundary.length > 0 ? `- 境界で ${hiBoundary.length} 個のhigh gap。B tier吸着との関連性を要調査` : "- 境界での顕著な乖離は検出されず",
    "",
    "## すぐblendしてよい領域",
    gaps.filter(g=>g.recommendation==="candidate_for_blend").length > 0
      ? `- ${gaps.filter(g=>g.recommendation==="candidate_for_blend").length} bucketsがblend候補`
      : "- blend候補なし（サンプル不足または乖離が小さい）",
    "",
    "## context modelが必要な領域",
    "- 三役以上: 空き枠・優勝・連続成績が支配的",
    "- 境界（十両/幕下）: 人口変動・関取定員の影響大",
    "",
    "## 制限",
    "- LogicLabのプレイヤー単体追跡のため、NPC含む全番付の分布は取得不可",
    "- 幕内到達には長期間のシミュレーションが必要（プレイヤー次第）",
  ];
  fs.writeFileSync("docs/realdata_integration/banzuke_distribution_gap_expanded_summary.md", summary.join("\n"), "utf-8");

  console.log(`\nDone. ${gaps.length} buckets (low:${low.length} med:${med.length} high:${hi.length})`);
}

main().catch(e=>{console.error(e);process.exit(1);});
