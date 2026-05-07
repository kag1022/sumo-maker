#!/usr/bin/env python
"""08_validate_long_range.py — 長期データの簡易整合性検証。

出力: data/analysis/long_range_summary.md
"""

import sys, json
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

ROOT = Path(__file__).resolve().parents[1]
ANALYSIS = ROOT / "data" / "analysis"
SUMOAPI_PATH = ANALYSIS / "banzuke_transition_sumo_api_196007_202603.json"


def main():
    if not SUMOAPI_PATH.exists():
        print("Sumo-api data not found. Run 06 first.")
        return

    with open(SUMOAPI_PATH, encoding="utf-8") as f:
        data = json.load(f)

    m = data["meta"]
    t = data["transitions"]

    # 統計
    label_counts = []
    for label, entry in t.items():
        if "marginal" in entry:
            label_counts.append((label, entry["marginal"]["total"]))

    label_counts.sort(key=lambda x: -x[1])

    has_record = sum(1 for e in t.values() if "byRecord" in e)
    has_wl = sum(1 for e in t.values() if "byWinLoss" in e)

    lines = [
        "# Long-Range Sumo-API Data Summary",
        "",
        f"Generated: {m['generatedAt']}",
        f"Source: {m['source']}",
        "",
        "## Statistics",
        "",
        f"- Basho range: {m['bashoRange']}",
        f"- Basho count: {m['bashoCount']}",
        f"- Unique from-labels: {m['uniqueFromLabels']}",
        f"- Marginal transitions: {m['marginalSampleCount']}",
        f"- Record transitions: {m['recordSampleCount']}",
        f"- Labels with byWinLoss: {has_wl}",
        f"- Labels with byRecord: {has_record}",
        "",
        "## Top 10 Labels (by marginal samples)",
        "",
        "| Label | Samples |",
        "|---|---|",
    ]
    for label, count in label_counts[:10]:
        lines.append(f"| {label} | {count} |")

    out = ANALYSIS / "long_range_summary.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"Written: {out}")


if __name__ == "__main__":
    main()
