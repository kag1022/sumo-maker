#!/usr/bin/env python
"""07_compare_with_existing_predict.py — sumo-api 長期データと既存平成データの比較レポート。

出力: data/analysis/compare_with_existing_predict.md
"""

import sys, json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

ROOT = Path(__file__).resolve().parents[1]
ANALYSIS = ROOT / "data" / "analysis"
HEISEI_PATH = ROOT.parent / "sumo-db" / "data" / "analysis" / "banzuke_transition_heisei.json"
SUMOAPI_PATH = ANALYSIS / "banzuke_transition_sumo_api_196007_202603.json"


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main():
    if not HEISEI_PATH.exists():
        print("Heisei data not found, skipping compare.")
        return
    if not SUMOAPI_PATH.exists():
        print("Sumo-api data not found. Run 06 first.")
        return

    h = load(HEISEI_PATH)
    s = load(SUMOAPI_PATH)

    hm = h["meta"]
    sm = s["meta"]

    h_labels = set(h["transitions"])
    s_labels = set(s["transitions"])
    common = h_labels & s_labels
    only_heisei = h_labels - s_labels
    only_sumoapi = s_labels - h_labels

    lines = [
        "# Long-Range vs Heisei Comparison",
        "",
        "## Coverage",
        "",
        f"| | Heisei | Sumo-API |",
        f"|---|---|---|",
        f"| Bashos | {hm['bashoCount']} | {sm['bashoCount']} |",
        f"| Marginal samples | {hm['marginalSampleCount']} | {sm['marginalSampleCount']} |",
        f"| Record samples | {hm['recordSampleCount']} | {sm['recordSampleCount']} |",
        f"| Unique labels | {len(h_labels)} | {len(s_labels)} |",
        f"| Common labels | {len(common)} | — |",
        f"| Only Heisei | {len(only_heisei)} | — |",
        f"| Only Sumo-API | — | {len(only_sumoapi)} |",
        "",
        "## Sample Common Labels (first 5)",
        "",
    ]
    for label in sorted(common)[:5]:
        lines.append(f"- {label}")

    out = ANALYSIS / "compare_with_existing_predict.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"Written: {out}")


if __name__ == "__main__":
    main()
