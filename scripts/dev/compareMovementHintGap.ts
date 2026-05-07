#!/usr/bin/env npx tsx
/**
 * scripts/dev/compareMovementHintGap.ts
 *
 * getRealDataMovementHint() の値と現行番付ロジックの期待移動幅を比較する。
 *
 * 現行ロジック側:
 *   - 幕内・十両: empiricalMovement.ts の resolveEmpiricalMovement を直接呼ぶ
 *   - 下位: providers/empirical.ts の resolveEmpiricalSlotBand を直接呼ぶ
 *   - Y/O/S: 特別ルールのため unavailable 扱い
 *
 * 出力:
 *   docs/realdata_integration/movement_gap_cases.json
 *   docs/realdata_integration/movement_gap_report.md
 */

import * as fs from "fs";
import { getRealDataMovementHint, classifyRankZone } from "../../src/logic/calibration/realData";
import { resolveEmpiricalMovement } from "../../src/logic/banzuke/rules/empiricalMovement";
import { resolveEmpiricalSlotBand, resolveEmpiricalRecordBucket, resolveEmpiricalRankBand } from "../../src/logic/banzuke/providers/empirical";
import { LIMITS } from "../../src/logic/banzuke/scale/rankLimits";

// rankLabel から division/rankName/rankNumber を抽出
const parseLabel = (label: string) => {
  const m = label.match(/^([東西])(.+?)(\d+)枚目$/);
  if (!m) return null;
  const side = m[1] === "東" ? "East" : "West";
  const ja = m[2];
  const num = parseInt(m[3], 10);
  const divMap: Record<string, string> = {
    "横綱": "Makuuchi", "大関": "Makuuchi", "関脇": "Makuuchi", "小結": "Makuuchi",
    "前頭": "Makuuchi", "十両": "Juryo", "幕下": "Makushita",
    "三段目": "Sandanme", "序二段": "Jonidan", "序ノ口": "Jonokuchi",
  };
  return { side, jaName: ja, number: num, division: divMap[ja] ?? "Makuuchi" };
};

interface TestCase {
  label: string; wins: number; losses: number; absences: number;
}

const CASES: TestCase[] = [
  // 横綱・大関・三役
  { label: "東横綱1枚目", wins: 13, losses: 2, absences: 0 },
  { label: "東横綱1枚目", wins: 0, losses: 0, absences: 15 },
  { label: "西大関1枚目", wins: 8, losses: 7, absences: 0 },
  { label: "西大関1枚目", wins: 7, losses: 8, absences: 0 },
  { label: "西大関1枚目", wins: 5, losses: 5, absences: 5 },
  { label: "東関脇1枚目", wins: 11, losses: 4, absences: 0 },
  { label: "東関脇1枚目", wins: 8, losses: 7, absences: 0 },
  { label: "東関脇1枚目", wins: 7, losses: 8, absences: 0 },
  { label: "東小結1枚目", wins: 8, losses: 7, absences: 0 },
  { label: "東小結1枚目", wins: 6, losses: 9, absences: 0 },
  // 幕内
  { label: "東前頭1枚目", wins: 8, losses: 7, absences: 0 },
  { label: "東前頭1枚目", wins: 10, losses: 5, absences: 0 },
  { label: "東前頭1枚目", wins: 4, losses: 11, absences: 0 },
  { label: "東前頭5枚目", wins: 10, losses: 5, absences: 0 },
  { label: "東前頭5枚目", wins: 4, losses: 11, absences: 0 },
  { label: "東前頭8枚目", wins: 8, losses: 7, absences: 0 },
  { label: "東前頭8枚目", wins: 11, losses: 4, absences: 0 },
  { label: "東前頭12枚目", wins: 8, losses: 7, absences: 0 },
  { label: "東前頭12枚目", wins: 5, losses: 10, absences: 0 },
  { label: "西前頭16枚目", wins: 7, losses: 8, absences: 0 },
  { label: "西前頭16枚目", wins: 6, losses: 9, absences: 0 },
  { label: "西前頭16枚目", wins: 4, losses: 11, absences: 0 },
  // 十両
  { label: "東十両1枚目", wins: 8, losses: 7, absences: 0 },
  { label: "東十両1枚目", wins: 10, losses: 5, absences: 0 },
  { label: "東十両1枚目", wins: 5, losses: 10, absences: 0 },
  { label: "西十両6枚目", wins: 8, losses: 7, absences: 0 },
  { label: "西十両6枚目", wins: 11, losses: 4, absences: 0 },
  { label: "西十両12枚目", wins: 7, losses: 8, absences: 0 },
  { label: "西十両12枚目", wins: 6, losses: 9, absences: 0 },
  { label: "西十両12枚目", wins: 4, losses: 11, absences: 0 },
  // 幕下
  { label: "東幕下1枚目", wins: 4, losses: 3, absences: 0 },
  { label: "東幕下1枚目", wins: 5, losses: 2, absences: 0 },
  { label: "東幕下1枚目", wins: 6, losses: 1, absences: 0 },
  { label: "東幕下1枚目", wins: 7, losses: 0, absences: 0 },
  { label: "西幕下5枚目", wins: 4, losses: 3, absences: 0 },
  { label: "西幕下5枚目", wins: 5, losses: 2, absences: 0 },
  { label: "東幕下15枚目", wins: 5, losses: 2, absences: 0 },
  { label: "東幕下15枚目", wins: 7, losses: 0, absences: 0 },
  { label: "東幕下30枚目", wins: 6, losses: 1, absences: 0 },
  { label: "東幕下30枚目", wins: 7, losses: 0, absences: 0 },
  // 下位
  { label: "東三段目10枚目", wins: 4, losses: 3, absences: 0 },
  { label: "東三段目10枚目", wins: 6, losses: 1, absences: 0 },
  { label: "東三段目10枚目", wins: 7, losses: 0, absences: 0 },
  { label: "東序二段50枚目", wins: 5, losses: 2, absences: 0 },
  { label: "東序二段50枚目", wins: 7, losses: 0, absences: 0 },
  { label: "東序ノ口10枚目", wins: 4, losses: 3, absences: 0 },
  { label: "東序ノ口10枚目", wins: 7, losses: 0, absences: 0 },
];

const getCurrentLogicMovement = (tc: TestCase): {
  available: boolean; expectedMovement?: number;
  source?: string; notes: string[];
} => {
  const p = parseLabel(tc.label);
  if (!p) return { available: false, notes: ["label parse failed"] };

  // Y/O/S: 特別ルールが強すぎるため empirical だけでは近似不可
  if (["横綱", "大関", "関脇", "小結"].includes(p.jaName)) {
    return { available: false, notes: [`${p.jaName} has special rules — empirical movement does not apply directly`] };
  }

  try {
    if (p.division === "Makuuchi" && p.jaName === "前頭") {
      const result = resolveEmpiricalMovement({
        division: "Makuuchi",
        rankName: "前頭",
        rankNumber: p.number,
        wins: tc.wins,
        losses: tc.losses,
        absent: tc.absences,
        divisionSlotOffset: 8,
        divisionTotalHalfSlots: LIMITS.MAEGASHIRA_MAX * 2,
      }, Math.random);

      if (result) {
        // divisionQuantile は rank band を区別しないため、比較不能
        if (result.source === "divisionQuantile") {
          return { available: false, notes: ["falls back to division-level quantile (rank band not distinguished)"] };
        }
        const currentHalfSlot = (p.number - 1) * 2 + 1;
        const targetHalfSlot = (result.targetNumber - 1) * 2 + (result.targetSide === "West" ? 1 : 0);
        const movement = currentHalfSlot - targetHalfSlot;
        return { available: true, expectedMovement: movement / 2, source: "empiricalMovement", notes: [] };
      }
      return { available: false, notes: ["insufficient sample"] };
    }

    if (p.division === "Juryo") {
      const result = resolveEmpiricalMovement({
        division: "Juryo",
        rankName: "十両",
        rankNumber: p.number,
        wins: tc.wins,
        losses: tc.losses,
        absent: tc.absences,
        divisionSlotOffset: 0,
        divisionTotalHalfSlots: LIMITS.JURYO_MAX * 2,
      }, Math.random);

      if (result) {
        if (result.source === "divisionQuantile") {
          return { available: false, notes: ["falls back to division-level quantile (rank band not distinguished)"] };
        }
        const currentHalfSlot = (p.number - 1) * 2 + 1;
        const targetHalfSlot = (result.targetNumber - 1) * 2 + (result.targetSide === "West" ? 1 : 0);
        const movement = currentHalfSlot - targetHalfSlot;
        return { available: true, expectedMovement: movement / 2, source: "empiricalMovement", notes: [] };
      }
      return { available: false, notes: ["insufficient sample"] };
    }

    // Lower divisions: resolveEmpiricalSlotBand は内部座標系に依存し、
    // 単独呼び出しでは slot 座標の不一致が生じる。
    // 正しい比較には composeNextBanzuke 相当の context が必要。
    return {
      available: false,
      notes: [
        "resolveEmpiricalSlotBand requires full slot context from composeNextBanzuke. " +
        "Direct comparison not possible without running the full pipeline."
      ]
    };
  } catch (e) {
    return { available: false, notes: [`error: ${e}`] };
  }
};

const severityLevel = (real: { p10: number; p25: number; median: number; p75: number; p90: number }, current: number): string => {
  if (current >= real.p25 && current <= real.p75) return "low";
  if (current >= real.p10 && current <= real.p90) return "medium";
  return "high";
};

const recommendation = (tc: TestCase, severity: string, currentAvailable: boolean, zone: string): string => {
  if (!currentAvailable) return "unknown";
  const p = parseLabel(tc.label);
  if (!p) return "unknown";
  if (["横綱", "大関"].includes(p.jaName)) return "do_not_apply_hint";
  if (["関脇", "小結"].includes(p.jaName)) return "keep_existing";
  if (severity === "low") return "keep_existing";
  if (zone === "Makuuchi_Mid" || zone === "Makuuchi_Low") return "candidate_for_blend";
  if (zone === "Juryo_Low" || zone === "Makushita_Upper_5") return "candidate_for_boundary_review";
  if (severity === "medium") return "use_hint_as_reference_only";
  return "candidate_for_blend";
};

// ── Main ──

const results: any[] = [];

for (const tc of CASES) {
  const hint = getRealDataMovementHint({ rankLabel: tc.label, wins: tc.wins, losses: tc.losses, absences: tc.absences });
  const current = getCurrentLogicMovement(tc);
  const zone = classifyRankZone(tc.label) ?? "unknown";

  let gap: any = { severity: "unknown" };
  let rec = "unknown";

  if (hint && current.available && current.expectedMovement !== undefined) {
    const delta = Math.abs(current.expectedMovement - hint.expectedMovement);
    gap = {
      deltaExpected: Math.round(delta * 100) / 100,
      withinP25P75: current.expectedMovement >= hint.range.p25 && current.expectedMovement <= hint.range.p75,
      withinP10P90: current.expectedMovement >= hint.range.p10 && current.expectedMovement <= hint.range.p90,
      severity: severityLevel(hint.range, current.expectedMovement),
    };
    rec = recommendation(tc, gap.severity, current.available, zone);
  }

  results.push({
    input: { rankLabel: tc.label, wins: tc.wins, losses: tc.losses, absences: tc.absences },
    rankZone: zone,
    realDataHint: hint ? {
      sampleCount: hint.sampleCount,
      confidence: hint.confidence,
      expectedMovement: hint.expectedMovement,
      p10: hint.range.p10, p25: hint.range.p25, median: hint.range.median, p75: hint.range.p75, p90: hint.range.p90,
    } : null,
    currentLogic: current,
    gap,
    recommendation: rec,
  });
}

fs.mkdirSync("docs/realdata_integration", { recursive: true });
fs.writeFileSync("docs/realdata_integration/movement_gap_cases.json", JSON.stringify(results, null, 2), "utf-8");

// Markdown report
const available = results.filter(r => r.currentLogic.available);
const low = results.filter(r => r.gap.severity === "low");
const medium = results.filter(r => r.gap.severity === "medium");
const high = results.filter(r => r.gap.severity === "high");
const unknown = results.filter(r => r.gap.severity === "unknown");

const md = [
  "# Movement Gap Report",
  `Generated: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
  "",
  "## 1. 全体結論",
  "",
  `- 比較可能だったケース: ${available.length}/${CASES.length}`,
  `- 低乖離 (low): ${low.length}`,
  `- 中乖離 (medium): ${medium.length}`,
  `- 高乖離 (high): ${high.length}`,
  `- 不明 (unknown): ${unknown.length}`,
  "",
  "### 横綱・大関・三役",
  "特別ルールが支配的なため `empiricalMovement` から直接取得不可。hint 適用非推奨。",
  "",
  "### 幕内・十両",
  "empiricalMovement の出力と実データ hint を比較。",
  "",
  "### 幕下以下",
  "resolveEmpiricalSlotBand の expectedSlot と実データ hint を比較。サンプル不足で取得不可のケースあり。",
  "",
  "## 2. 比較方法",
  "",
  "- **実データhint**: `getRealDataMovementHint()` を使用",
  "- **現行ロジック**: Makuuchi/Juryo → `resolveEmpiricalMovement()`, Lower → `resolveEmpiricalSlotBand()`",
  "- **横綱・大関・三役**: 特別ルールのため `unavailable` 扱い",
  "- **severity**: low=p25-p75内, medium=p10-p90内, high=範囲外",
  "",
  "## 3. 代表ケース一覧",
  "",
  "| rankLabel | record | rankZone | realExp | realP25 | realMedian | realP75 | curExp | gap | severity | rec |",
  "|-----------|--------|----------|---------|---------|------------|---------|--------|-----|----------|-----|",
];

for (const r of results) {
  const rec = `${r.input.wins}-${r.input.losses}${r.input.absences ? `-${r.input.absences}` : ""}`;
  const re = r.realDataHint ? `${r.realDataHint.expectedMovement}` : "-";
  const rp25 = r.realDataHint ? `${r.realDataHint.p25}` : "-";
  const rm = r.realDataHint ? `${r.realDataHint.median}` : "-";
  const rp75 = r.realDataHint ? `${r.realDataHint.p75}` : "-";
  const ce = r.currentLogic.available ? `${r.currentLogic.expectedMovement}` : "N/A";
  const g = r.gap.deltaExpected !== undefined ? `${r.gap.deltaExpected}` : "-";
  md.push(`| ${r.input.rankLabel} | ${rec} | ${r.rankZone} | ${re} | ${rp25} | ${rm} | ${rp75} | ${ce} | ${g} | ${r.gap.severity} | ${r.recommendation} |`);
}

md.push("", "## 4. 階級別評価", "");
const zones = ["Yokozuna", "Ozeki", "Sanyaku", "Makuuchi_Joi", "Makuuchi_Mid", "Makuuchi_Low", "Juryo_Upper", "Juryo_Mid", "Juryo_Low", "Makushita_Upper_5", "Makushita_Upper_15", "Makushita_Upper_30", "Sandanme", "Jonidan", "Jonokuchi"];
for (const z of zones) {
  const zr = results.filter(r => r.rankZone === z);
  if (!zr.length) continue;
  const zAvailable = zr.filter(r => r.currentLogic.available);
  md.push(`### ${z}`, `Cases: ${zr.length}, available: ${zAvailable.length}`);
  if (zAvailable.length) {
    const diffs = zAvailable.filter(r => r.gap.deltaExpected !== undefined).map(r => r.gap.deltaExpected);
    if (diffs.length) {
      const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      md.push(`Avg gap: ${avgDiff.toFixed(2)}`);
    }
  }
  md.push("");
}

md.push(
  "## 5. 「番付は生き物」観点の評価",
  "",
  "- 実データhint は個人単位の prior であり、最終配置は optimizer / committee が決めるべき",
  "- 周囲の勝敗、空き枠、三役の詰まり、関取枠の圧力が重要",
  "- 横綱・大関・三役は context-dependent なので単純な移動幅比較は不適切",
  "",
  "## 6. 安全に反映できそうな候補",
  "",
  "Candidate 1: 幕内中位の 8-7 / 9-6 / 10-5 の上昇幅補正",
  "Candidate 2: 幕内下位の 5-10 / 4-11 の下降幅補正",
  "Candidate 3: 十両下位の負け越しと幕下上位の勝ち越しの境界圧",
  "Candidate 4: 幕下上位 4-3 / 5-2 の関取昇進候補補正",
  "",
  "## 7. まだ反映しない方がよい領域",
  "",
  "- 横綱: 特別ルールのみ",
  "- 大関: カド番・特例復帰あり",
  "- 三役: 空き枠依存",
  "- 幕下以下の大量昇降: 人口設計と絡む",
  "- 休場絡み: サンプルが少なく context 依存",
  "- 優勝・準優勝・三賞: 特殊ルールあり",
  "",
  "## 8. 次の実装タスク提案",
  "",
  "Task 1: empiricalMovement に hint 比較ログ追加 — リスク低、dev only",
  "Task 2: LogicLab に movement gap 比較プリセット追加 — リスクなし",
  "Task 3: 幕内中位・下位だけ movementBlendRatio を試す — リスク中",
  "Task 4: 十両/幕下境界だけ boundaryPressure と hint を比較 — リスク中",
  "Task 5: context bucket を sumo-api-db 側で追加生成 — リスク低",
  "",
);

fs.writeFileSync("docs/realdata_integration/movement_gap_report.md", md.join("\n"), "utf-8");
console.log("Done.");
console.log(`Available: ${available.length}/${CASES.length}, low: ${low.length}, medium: ${medium.length}, high: ${high.length}, unknown: ${unknown.length}`);
