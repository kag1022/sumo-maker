#!/usr/bin/env python
"""05_build_rank_movement.py — 連続場所間の番付遷移を構築する。

入力: data/intermediate/banzuke_entries/
出力:
  data/intermediate/rank_movements/{rikishiId}.json
  data/analysis/rank_movement_sumo_api_sample.json
  data/analysis/rank_movement_sumo_api_196007_202603.json
"""

import sys, json
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from sumo_api_data.io_utils import read_json, write_json
from sumo_api_data.basho_ids import generate_basho_ids, next_basho_id
from sumo_api_data.normalize import rank_sort_key

ROOT = Path(__file__).resolve().parents[1]
ENTRIES_DIR = ROOT / "data" / "intermediate" / "banzuke_entries"
MOVEMENTS_DIR = ROOT / "data" / "intermediate" / "rank_movements"
ANALYSIS_DIR = ROOT / "data" / "analysis"
MOVEMENTS_DIR.mkdir(parents=True, exist_ok=True)
ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)

DIVISIONS = ["Makuuchi", "Juryo", "Makushita", "Sandanme", "Jonidan", "Jonokuchi"]
START_Y, START_M = 1960, 7
END_Y, END_M = 2026, 3


def build_global_rank_index(basho_ids: list[str]) -> dict[str, dict[int, int]]:
    """場所ごとの global_rank_index を構築する。
    全階級の全エントリを rank 順にソートし、0-based の index を割り当てる。
    小さいほど上位。
    """
    index: dict[str, dict[int, int]] = {}
    for code in basho_ids:
        all_entries = []
        for div in DIVISIONS:
            entries = read_json(ENTRIES_DIR / f"{code}_{div}.json")
            if entries:
                all_entries.extend(entries)
        all_entries.sort(key=lambda e: rank_sort_key(e["banzukeLabel"]))
        rank_map = {}
        for i, e in enumerate(all_entries):
            rank_map[e["rikishiId"]] = i
        index[code] = rank_map
    return index


def main():
    basho_ids = generate_basho_ids(START_Y, START_M, END_Y, END_M)

    # rikishi_id → [(basho_code, banzuke_label)]
    timeline: dict[int, list[tuple[str, str]]] = defaultdict(list)

    for code in basho_ids:
        for div in DIVISIONS:
            entries = read_json(ENTRIES_DIR / f"{code}_{div}.json")
            if entries is None:
                continue
            for e in entries:
                timeline[e["rikishiId"]].append((code, e["banzukeLabel"]))

    # global_rank_index
    print("Building global rank index ...")
    global_index = build_global_rank_index(basho_ids)
    print(f"  {len(global_index)} bashos indexed")

    # 遷移構築
    movement_count = 0
    skipped_nonconsec = 0
    all_movements: list[dict] = []

    for rid, tl in timeline.items():
        tl.sort(key=lambda x: x[0])
        movements = []
        for i in range(1, len(tl)):
            prev_code, prev_label = tl[i - 1]
            curr_code, curr_label = tl[i]
            if curr_code != next_basho_id(prev_code):
                skipped_nonconsec += 1
                continue

            from_idx = (global_index.get(prev_code) or {}).get(rid)
            to_idx = (global_index.get(curr_code) or {}).get(rid)
            steps = from_idx - to_idx if (from_idx is not None and to_idx is not None) else None

            m = {
                "fromBasho": prev_code,
                "toBasho": curr_code,
                "fromLabel": prev_label,
                "toLabel": curr_label,
                "fromGlobalRankIndex": from_idx,
                "toGlobalRankIndex": to_idx,
                "movementSteps": steps,
            }
            movements.append(m)
            all_movements.append(m)

        if movements:
            write_json(MOVEMENTS_DIR / f"{rid}.json", movements)
            movement_count += len(movements)

    print(f"rikishi: {len(timeline)}")
    print(f"movements: {movement_count}")
    print(f"skipped_nonconsec: {skipped_nonconsec}")

    # analysis/ 出力
    sampled = [m for m in all_movements if m["fromBasho"] in basho_ids[:10]]
    write_json(ANALYSIS_DIR / "rank_movement_sumo_api_sample.json", sampled[:1000])
    write_json(ANALYSIS_DIR / "rank_movement_sumo_api_196007_202603.json", all_movements)
    print(f"Sample: {ANALYSIS_DIR / 'rank_movement_sumo_api_sample.json'} ({len(sampled[:1000])} items)")
    print(f"Full: {ANALYSIS_DIR / 'rank_movement_sumo_api_196007_202603.json'} ({len(all_movements)} items)")


if __name__ == "__main__":
    main()
