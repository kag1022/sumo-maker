#!/usr/bin/env python
"""04_build_basho_records.py — 番付 raw JSON から力士別場所別成績を構築する。

入力: data/raw_json/banzuke/{bashoId}_{division}.json
出力:
  data/intermediate/banzuke_entries/{bashoId}_{division}.json
  data/intermediate/basho_records/{rikishiId}.json
  data/analysis/basho_records_sumo_api_sample.json
  data/analysis/basho_records_sumo_api_196007_202603.json
"""

import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from sumo_api_data.io_utils import read_json, write_json
from sumo_api_data.normalize import to_banzuke_label
from sumo_api_data.basho_ids import generate_basho_ids

ROOT = Path(__file__).resolve().parents[1]
BANZUKE_RAW = ROOT / "data" / "raw_json" / "banzuke"
ENTRIES_DIR = ROOT / "data" / "intermediate" / "banzuke_entries"
RECORDS_DIR = ROOT / "data" / "intermediate" / "basho_records"
ANALYSIS_DIR = ROOT / "data" / "analysis"
ENTRIES_DIR.mkdir(parents=True, exist_ok=True)
RECORDS_DIR.mkdir(parents=True, exist_ok=True)
ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)

DIVISIONS = ["Makuuchi", "Juryo", "Makushita", "Sandanme", "Jonidan", "Jonokuchi"]
START_Y, START_M = 1960, 7
END_Y, END_M = 2026, 3


def main():
    basho_ids = generate_basho_ids(START_Y, START_M, END_Y, END_M)
    record_index: dict[int, dict[str, dict]] = defaultdict(dict)

    total_entries = 0
    skipped_empty = 0
    all_records: list[dict] = []

    for code in basho_ids:
        for div in DIVISIONS:
            raw = read_json(BANZUKE_RAW / f"{code}_{div}.json")
            if raw is None:
                continue

            entries = []
            for side in ("east", "west"):
                for e in raw.get(side, []) or []:
                    rid = e.get("rikishiID")
                    rank_str = e.get("rank", "")
                    if rid is None:
                        continue

                    label = to_banzuke_label(rank_str)
                    if label is None:
                        skipped_empty += 1
                        continue

                    # banzuke 内蔵の wins/losses/absences を直接使う
                    w = e.get("wins", 0) or 0
                    l = e.get("losses", 0) or 0
                    a = e.get("absences", 0) or 0
                    wl = {"wins": w, "losses": l, "absences": a}

                    entry = {
                        "rikishiId": rid,
                        "shikonaEn": e.get("shikonaEn", ""),
                        "rank": rank_str,
                        "banzukeLabel": label,
                        **wl,
                    }
                    entries.append(entry)
                    total_entries += 1
                    record_index[rid][code] = wl

                    all_records.append({
                        "bashoId": code, "division": div,
                        "rikishiId": rid, "shikona": e.get("shikonaEn", ""),
                        "banzukeLabel": label, **wl, "parseStatus": "ok",
                    })

            write_json(ENTRIES_DIR / f"{code}_{div}.json", entries)

    for rid, recs in record_index.items():
        write_json(RECORDS_DIR / f"{rid}.json", recs)

    # analysis/ 出力
    sampled = [r for r in all_records if r["bashoId"] in basho_ids[:10]]
    write_json(ANALYSIS_DIR / "basho_records_sumo_api_sample.json", sampled[:500])
    write_json(ANALYSIS_DIR / "basho_records_sumo_api_196007_202603.json", all_records)

    print(f"entries: {total_entries} (empty_skip={skipped_empty})")
    print(f"rikishi with records: {len(record_index)}")
    print(f"Sample: {ANALYSIS_DIR / 'basho_records_sumo_api_sample.json'}")
    print(f"Full: {ANALYSIS_DIR / 'basho_records_sumo_api_196007_202603.json'}")


if __name__ == "__main__":
    main()
