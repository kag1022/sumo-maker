#!/usr/bin/env python
"""03_fetch_torikumi.py — 全場所×全階級×全日の取組を取得する。

エンドポイント: GET /api/basho/{id}/torikumi/{division}/{day}
出力: data/raw_json/torikumi/{bashoId}_{division}_{day}.json

注: データ量が多いため、初回は数十分かかる。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from sumo_api_data.api_client import get_json
from sumo_api_data.basho_ids import generate_basho_ids
from sumo_api_data.io_utils import write_json

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw_json" / "torikumi"
RAW_DIR.mkdir(parents=True, exist_ok=True)

DIVISIONS = ["Makuuchi", "Juryo"]
MAX_DAYS = 15

START_Y, START_M = 1960, 7
END_Y, END_M = 2026, 3


def main():
    basho_ids = generate_basho_ids(START_Y, START_M, END_Y, END_M)
    total = len(basho_ids) * len(DIVISIONS) * MAX_DAYS
    print(f"Target: {len(basho_ids)} basho x {len(DIVISIONS)} div x {MAX_DAYS} days = {total}")
    print("Note: only Makuuchi + Juryo (predict:demo で使う上位2階級)")
    print()

    fetched = skipped = errors = 0
    for code in basho_ids:
        for div in DIVISIONS:
            for day in range(1, MAX_DAYS + 1):
                filename = f"{code}_{div}_{day:02d}.json"
                out = RAW_DIR / filename
                if out.exists():
                    skipped += 1
                    continue

                data = get_json(f"/basho/{code}/torikumi/{div}/{day}")
                if data is None or not isinstance(data, dict):
                    errors += 1
                    continue

                write_json(out, data)
                fetched += 1

    print(f"Done: fetched={fetched} skipped={skipped} errors={errors}")


if __name__ == "__main__":
    main()
