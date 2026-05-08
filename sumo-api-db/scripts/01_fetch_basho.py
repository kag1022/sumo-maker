#!/usr/bin/env python
"""01_fetch_basho.py — 全場所のメタデータを取得する。

出力: data/raw_json/basho/{bashoId}.json

取得範囲:
  --sample       指定された8場所のみ
  --range S E   bashoId S から E まで
  --all         全範囲（既定: 196007-202603）
"""

import sys, json
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from sumo_api_data.api_client import get_json_detailed
from sumo_api_data.basho_ids import generate_basho_ids
from sumo_api_data.io_utils import write_json

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw_json" / "basho"
ANALYSIS_DIR = ROOT / "data" / "analysis"
RAW_DIR.mkdir(parents=True, exist_ok=True)
ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)

# --sample で使う固定bashoIdリスト（Phase 5 仕様）
SAMPLE_BASHO_IDS = ["196007", "196009", "196011", "197001", "198901", "200001", "201903", "202603"]

DEFAULT_START = "196007"
DEFAULT_END = "202603"


def iso_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_args():
    mode = "all"
    range_start = DEFAULT_START
    range_end = DEFAULT_END
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--sample":
            mode = "sample"
            i += 1
        elif args[i] == "--range" and i + 2 < len(args):
            mode = "range"
            range_start = args[i + 1]
            range_end = args[i + 2]
            i += 3
        elif args[i] == "--all":
            mode = "all"
            i += 1
        else:
            i += 1
    return mode, range_start, range_end


def main():
    mode, range_start, range_end = parse_args()

    if mode == "sample":
        basho_ids = SAMPLE_BASHO_IDS
    elif mode == "range":
        start_y, start_m = int(range_start[:4]), int(range_start[4:])
        end_y, end_m = int(range_end[:4]), int(range_end[4:])
        basho_ids = generate_basho_ids(start_y, start_m, end_y, end_m)
    else:
        start_y, start_m = int(DEFAULT_START[:4]), int(DEFAULT_START[4:])
        end_y, end_m = int(DEFAULT_END[:4]), int(DEFAULT_END[4:])
        basho_ids = generate_basho_ids(start_y, start_m, end_y, end_m)

    print(f"Mode: {mode}")
    print(f"Target: {len(basho_ids)} basho")
    print()

    failures = []
    fetched = skipped = errors = 0

    for code in basho_ids:
        out = RAW_DIR / f"{code}.json"
        if out.exists():
            skipped += 1
            continue

        result = get_json_detailed(f"/basho/{code}")
        if result["ok"] and result["data"] and isinstance(result["data"], dict) and "date" in result["data"]:
            write_json(out, result["data"])
            fetched += 1
            if fetched % 10 == 0:
                print(f"  {code}: OK ({fetched} fetched)")
        else:
            errors += 1
            failures.append({
                "bashoId": code, "endpoint": f"/basho/{code}",
                "httpStatus": result["httpStatus"], "error": result["error"],
                "retries": result["retries"], "savePath": str(out),
            })
            print(f"  {code}: FAIL ({result['error']})")

    # collection_report
    report_path = ANALYSIS_DIR / "collection_report.md"
    lines = [f"# Collection Report — basho", "",
             f"Generated: {iso_now()}", f"Mode: {mode}", f"Target: {len(basho_ids)}",
             f"Fetched: {fetched}", f"Skipped: {skipped}", f"Errors: {errors}", ""]
    if failures:
        lines += ["## Failures", "", "| bashoId | HTTP | Error | Retries |",
                   "|---------|------|-------|---------|"]
        for f in failures:
            lines.append(f"| {f['bashoId']} | {f['httpStatus']} | {f['error']} | {f['retries']} |")
    else:
        lines.append("No failures.")
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"\nDone: fetched={fetched} skipped={skipped} errors={errors}")
    print(f"Report: {report_path}")


if __name__ == "__main__":
    main()
