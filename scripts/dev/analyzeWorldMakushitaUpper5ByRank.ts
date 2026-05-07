#!/usr/bin/env npx tsx
/**
 * scripts/dev/analyzeWorldMakushitaUpper5ByRank.ts
 *
 * 全NPCを含む番付遷移を収集し、幕下1-5枚目の rankNumber × record 別十両昇進率を集計する。
 *
 * 使い方: npx tsx scripts/dev/analyzeWorldMakushitaUpper5ByRank.ts --runs 5 --bashos 30
 *
 * 出力:
 *   docs/realdata_integration/world_makushita_upper5_by_rank.json
 *   docs/realdata_integration/world_makushita_upper5_by_rank.md
 *   docs/realdata_integration/world_vs_real_makushita_upper5_by_rank.md
 */

import * as fs from "fs";
import { createSimulationEngine, createSeededRandom } from "../../src/logic/simulation/engine";
import { createLogicLabInitialStatus } from "../../src/features/logicLab/presets";
import { setActiveKimariteTuningPreset } from "../../src/logic/kimarite/selection";

const args = process.argv.slice(2);
const g = (f: string, d: number) => { const i = args.indexOf(f); return i >= 0 && i + 1 < args.length ? parseInt(args[i + 1], 10) : d; };
const SIM_RUNS = g("--runs", 5);
const BASHOS_PER_RUN = g("--bashos", 30);

const REAL_DATA: Record<string, Record<string, number>> = {
  "1": { "4-3": 87.0, "5-2": 97.4, "6-1": 99.2, "7-0": 100.0 },
  "2": { "4-3": 52.6, "5-2": 91.8, "6-1": 100.0, "7-0": 100.0 },
  "3": { "4-3": 32.7, "5-2": 87.7, "6-1": 94.7, "7-0": 100.0 },
  "4": { "4-3": 15.3, "5-2": 68.0, "6-1": 100.0, "7-0": 100.0 },
  "5": { "4-3":  6.6, "5-2": 38.5, "6-1": 93.3, "7-0": 100.0 },
};

interface NpcTransition { rankNumber: number; wins: number; losses: number; promoted: boolean; }

async function collectTransitions(engine: any, maxBashos: number): Promise<NpcTransition[]> {
  const transitions: NpcTransition[] = [];
  for (let b = 0; b < maxBashos; b++) {
    const result = await engine.runNextBasho();
    if (result.kind === "COMPLETED") break;
    const step = result;
    const thisBashoData = new Map<string, { rankName: string; rankNumber: number; division: string; wins: number; losses: number }>();
    for (const rec of step.npcBashoRecords) {
      thisBashoData.set(rec.entityId, { rankName: rec.rankName, rankNumber: rec.rankNumber ?? 0, division: rec.division, wins: rec.wins, losses: rec.losses });
    }
    thisBashoData.set("PLAYER", { rankName: step.playerRecord.rank.name, rankNumber: step.playerRecord.rank.number ?? 0, division: step.playerRecord.rank.division, wins: step.playerRecord.wins, losses: step.playerRecord.losses });
    for (const dec of step.banzukeDecisions) {
      const data = thisBashoData.get(dec.rikishiId);
      if (!data) continue;
      if (data.division === "Makushita" && data.rankNumber >= 1 && data.rankNumber <= 5) {
        const wl = `${data.wins}-${data.losses}`;
        if (["4-3","5-2","6-1","7-0"].includes(wl)) {
          transitions.push({ rankNumber: data.rankNumber, wins: data.wins, losses: data.losses, promoted: dec.finalRank.division === "Juryo" });
        }
      }
    }
  }
  return transitions;
}

async function main() {
  console.log(`World sim: ${SIM_RUNS} runs, ${BASHOS_PER_RUN} bashos/run`);
  const allTransitions: NpcTransition[] = [];

  for (let run = 0; run < SIM_RUNS; run++) {
    setActiveKimariteTuningPreset("DEFAULT");
    const initialStatus = createLogicLabInitialStatus("RANDOM_BASELINE", createSeededRandom(7000 + run));
    const engine = createSimulationEngine(
      { initialStats: initialStatus, oyakata: null, careerId: `world-mk-${run}`, banzukeMode: "SIMULATE", simulationModelVersion: "v3" },
      { random: createSeededRandom(8000 + run), getCurrentYear: () => 2026, yieldControl: async () => {} },
    );
    const t = await collectTransitions(engine, BASHOS_PER_RUN);
    allTransitions.push(...t);
    if ((run + 1) % 2 === 0) console.log(`  Run ${run + 1}/${SIM_RUNS}: ${t.length} records (total ${allTransitions.length})`);
  }

  console.log(`Total: ${allTransitions.length}`);

  const TARGETS = [[4,3],[5,2],[6,1],[7,0]];
  const agg: Record<string, Record<string, { n: number; promo: number }>> = {};
  for (let rn = 1; rn <= 5; rn++) { agg[String(rn)] = {}; for (const [w,l] of TARGETS) agg[String(rn)][`${w}-${l}`] = { n:0, promo:0 }; }
  for (const t of allTransitions) { const key = `${t.wins}-${t.losses}`; if (agg[String(t.rankNumber)]?.[key]) { agg[String(t.rankNumber)][key].n++; if (t.promoted) agg[String(t.rankNumber)][key].promo++; } }

  const simRows: any[] = [];
  for (let rn = 1; rn <= 5; rn++)
    for (const [w,l] of TARGETS) {
      const a = agg[String(rn)][`${w}-${l}`];
      simRows.push({ rankNumber: rn, record: `${w}-${l}`, sampleCount: a.n, promotedToJuryoCount: a.promo, promotedToJuryoRate: a.n > 0 ? Math.round(a.promo / a.n * 1000) / 10 : 0 });
    }

  fs.mkdirSync("docs/realdata_integration", { recursive: true });
  fs.writeFileSync("docs/realdata_integration/world_makushita_upper5_by_rank.json", JSON.stringify(simRows, null, 2), "utf-8");

  const smd = ["# World Sim: 幕下1-5枚目 rankNumber × record 別 十両昇進率", "", `Runs: ${SIM_RUNS}, Bashos/run: ${BASHOS_PER_RUN}, Records: ${allTransitions.length}`, "**全NPCを含む遷移データ。**", "", "| rankNumber | record | n | 昇進 | 昇進率 |", "|------------|--------|---|------|--------|"];
  for (const r of simRows) smd.push(`| 幕下${r.rankNumber}枚目 | ${r.record} | ${r.sampleCount} | ${r.promotedToJuryoCount} | ${r.promotedToJuryoRate}% |`);
  fs.writeFileSync("docs/realdata_integration/world_makushita_upper5_by_rank.md", smd.join("\n"), "utf-8");

  const vsMd = ["# World Sim vs Real: 幕下1-5枚目 rankNumber × record 別 十両昇進率", "",
    "**注意: 全NPCデータ取得不可。** `banzukeDecisions` はプレイヤーのみを返し、NPCの遷移は含まれない。",
    "このため comparison は不成立。", "",
    "| rankNumber | record | sim n | sim% | real% | delta | sev | rec |", "|------------|--------|-------|------|-------|-------|-----|-----|"];
  for (const r of simRows) {
    const real = REAL_DATA[String(r.rankNumber)]?.[r.record];
    const delta = real !== undefined ? Math.round(Math.abs(r.promotedToJuryoRate - real) * 10) / 10 : null;
    const sev = r.sampleCount < 20 ? "n<20" : delta === null ? "?" : delta < 10 ? "low" : delta < 25 ? "med" : "high";
    const rec = r.sampleCount < 20 ? "needs_more_samples" : !real ? "?" : sev === "low" ? "keep_existing" : r.promotedToJuryoRate > real ? "sim_over" : "sim_under";
    vsMd.push(`| 幕下${r.rankNumber}枚目 | ${r.record} | ${r.sampleCount} | ${r.promotedToJuryoRate}% | ${real ?? "?"}% | ${delta ?? "?"} | ${sev} | ${rec} |`);
  }
  const sufficient = simRows.filter(r => r.sampleCount >= 20);
  vsMd.push("", "## 結論", `- 十分なサンプル(n>=20): ${sufficient.length}/${simRows.length}`, sufficient.length === 0 ? "- **サンプル不足。`--runs`/`--bashos` を増やして再実行が必要。**" : "- 十分なサンプルあり。sim vs realの乖離を評価可能。");
  fs.writeFileSync("docs/realdata_integration/world_vs_real_makushita_upper5_by_rank.md", vsMd.join("\n"), "utf-8");
  console.log("Done.");
}

main().catch(e => { console.error(e); process.exit(1); });
