#!/usr/bin/env python
"""06_export_predict_json.py — 遷移テーブル JSON を predict:demo 互換形式で出力する。

入力:
  data/intermediate/rank_movements/
  data/intermediate/basho_records/
出力:
  data/analysis/banzuke_transition_sumo_api_196007_202603.json
  data/analysis/banzuke_transition_sumo_api_sample.json （先頭10ラベルのみ、軽量サンプル）
"""

import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from sumo_api_data.io_utils import read_json, write_json
from sumo_api_data.transition_model import build_transitions
from sumo_api_data.report import iso_now
from sumo_api_data.basho_ids import next_basho_id

ROOT = Path(__file__).resolve().parents[1]
MOVEMENTS_DIR = ROOT / "data" / "intermediate" / "rank_movements"
RECORDS_DIR = ROOT / "data" / "intermediate" / "basho_records"
ANALYSIS_DIR = ROOT / "data" / "analysis"
ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)

START = "196007"
END = "202603"
TOP_N = 10


def main():
    # 力士タイムライン構築
    rikishi_timeline: dict[int, list[tuple[str, str]]] = {}
    for path in sorted(MOVEMENTS_DIR.glob("*.json")):
        rid = int(path.stem)
        movements = read_json(path)
        if movements is None:
            continue
        tl: list[tuple[str, str]] = []
        for m in movements:
            tl.append((m["fromBasho"], m["fromLabel"]))
            # 最終場所の toLabel も追加
            if m == movements[-1]:
                tl.append((m["toBasho"], m["toLabel"]))
        rikishi_timeline[rid] = tl

    # 成績インデックス読込
    record_index: dict[int, dict[str, dict]] = {}
    for path in sorted(RECORDS_DIR.glob("*.json")):
        rid = int(path.stem)
        recs = read_json(path)
        if recs:
            record_index[rid] = recs

    # 遷移構築
    transitions, total_marginal, total_record, skipped = build_transitions(
        rikishi_timeline, record_index, next_basho_id, top_n=TOP_N
    )

    basho_count = len(set(
        m.get("fromBasho", "")
        for path in MOVEMENTS_DIR.glob("*.json")
        for m in (read_json(path) or [])
    ))

    payload = {
        "meta": {
            "generatedAt": iso_now(),
            "source": "sumo-api.com /api/basho/{id}/banzuke/{division}",
            "era": "showa-heisei-reiwa",
            "bashoRange": f"{START}~{END}",
            "bashoCount": basho_count,
            "marginalSampleCount": total_marginal,
            "recordSampleCount": total_record,
            "uniqueFromLabels": len(transitions),
            "topN": TOP_N,
            "schema": {
                "marginal": "P(next | label)",
                "byWinLoss": "P(next | label, wins, losses)  key='W-L'",
                "byRecord": "P(next | label, wins, losses, absences)  key='W-L-A'",
            },
        },
        "transitions": transitions,
    }

    # フル版
    full_path = ANALYSIS_DIR / f"banzuke_transition_sumo_api_{START}_{END}.json"
    write_json(full_path, payload)
    print(f"Full: {full_path}")
    print(f"  labels={len(transitions)} marginal={total_marginal} record={total_record}")

    # サンプル版（もっともサンプル数が多い上位10ラベル）
    label_by_count = sorted(
        transitions.keys(),
        key=lambda k: transitions[k].get("marginal", {}).get("total", 0),
        reverse=True,
    )
    sample_labels = label_by_count[:20]  # 20ラベルあれば十分
    sample_transitions = {k: transitions[k] for k in sample_labels}
    sample_payload = {**payload, "transitions": sample_transitions}
    sample_payload["meta"]["note"] = "Sample: first 10 labels only. Use full version for actual prediction."
    sample_path = ANALYSIS_DIR / "banzuke_transition_sumo_api_sample.json"
    write_json(sample_path, sample_payload)
    print(f"Sample: {sample_path}")


if __name__ == "__main__":
    main()
