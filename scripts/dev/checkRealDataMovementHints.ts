#!/usr/bin/env npx ts-node
/**
 * scripts/dev/checkRealDataMovementHints.ts
 *
 * 代表ケースに対して getRealDataMovementHint を呼び出し、結果を検証する。
 *
 * 使い方: npx ts-node scripts/dev/checkRealDataMovementHints.ts
 */

import { getRealDataMovementHint } from "../../src/logic/calibration/realData";

const TEST_CASES = [
  { label: "東前頭5枚目", record: "10-5" },
  { label: "東前頭5枚目", record: "4-11" },
  { label: "東小結1枚目", record: "8-7" },
  { label: "西大関1枚目", record: "5-5-5" },
  { label: "東幕下1枚目", record: "4-3" },
  { label: "西十両12枚目", record: "7-8" },
  { label: "東関脇1枚目", record: "11-4" },
  { label: "東横綱1枚目", record: "13-2" },
];

const parseRecord = (s: string): { wins: number; losses: number; absences: number } => {
  const parts = s.split("-").map(Number);
  return { wins: parts[0], losses: parts[1], absences: parts[2] ?? 0 };
};

const lines: string[] = [
  "# Real Data Movement Hint Check",
  "",
  "| 入力 | rankZone | sampleCount | confidence | expected | p10 | p25 | median | p75 | p90 |",
  "|------|----------|-------------|------------|----------|-----|-----|--------|-----|-----|",
];

let found = 0;
let notFound = 0;

for (const tc of TEST_CASES) {
  const { wins, losses, absences } = parseRecord(tc.record);
  const hint = getRealDataMovementHint({ rankLabel: tc.label, wins, losses, absences });

  if (hint) {
    found++;
    lines.push(
      `| ${tc.label} ${tc.record} | ${hint.rankZone} | ${hint.sampleCount} | ${hint.confidence} | ${hint.expectedMovement} | ${hint.range.p10} | ${hint.range.p25} | ${hint.range.median} | ${hint.range.p75} | ${hint.range.p90} |`
    );
  } else {
    notFound++;
    lines.push(`| ${tc.label} ${tc.record} | — | — | — | — | — | — | — | — | — |`);
  }
}

lines.push("");
lines.push(`Found: ${found}, Not found: ${notFound}`);

import * as fs from "fs";
const outPath = "docs/realdata_integration/realdata_hint_check.md";
fs.mkdirSync("docs/realdata_integration", { recursive: true });
fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf-8");
console.log(`Written: ${outPath}`);
console.log(`Results: ${found}/${TEST_CASES.length} hints found`);
