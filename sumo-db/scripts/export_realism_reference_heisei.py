"""平成期 (1989/01–2019/03) の参照分布を、ゲームシミュレーション診断用に書き出す。

出力: data/analysis/realism_reference_heisei.json

含まれる分布:
  - recordHistogramByDivision : (wins, losses, absent) 出現頻度 / 部屋格別
  - recordHistogramOverall    : (wins, losses, absent) 全部屋まとめ
  - careerBashoHistogram      : 引退力士のキャリア場所数ヒストグラム
"""

import json
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime, timezone

from _paths import ANALYSIS_DIR, DB_PATH

OUTPUT_PATH = ANALYSIS_DIR / "realism_reference_heisei.json"
HEISEI_MAX_BASHO_CODE = "201903"

DIVISION_MAP = {
    "幕内": "Makuuchi",
    "十両": "Juryo",
    "幕下": "Makushita",
    "三段目": "Sandanme",
    "序二段": "Jonidan",
    "序ノ口": "Jonokuchi",
}

CAREER_BASHO_BINS = [
    (1, 1), (2, 2), (3, 3), (4, 6), (7, 12), (13, 24),
    (25, 48), (49, 72), (73, 96), (97, 144), (145, 9999),
]


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def bin_career_basho(value: int) -> str:
    for lo, hi in CAREER_BASHO_BINS:
        if lo <= value <= hi:
            return f"{lo}-{hi}" if lo != hi else str(lo)
    return "other"


def main() -> None:
    if not DB_PATH.exists():
        raise SystemExit(f"DB not found: {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # --- record histogram ---
    cur.execute(
        """
        SELECT rbr.division, rbr.wins, rbr.losses, rbr.absences
        FROM rikishi_basho_record rbr
        JOIN basho_metadata bm ON bm.basho_code = rbr.basho_code
        WHERE bm.basho_code <= ?
          AND bm.parse_status = 'ok'
          AND rbr.parse_status = 'ok'
        """,
        (HEISEI_MAX_BASHO_CODE,),
    )
    by_division: dict[str, Counter] = defaultdict(Counter)
    overall: Counter = Counter()
    skipped = 0
    for row in cur:
        canonical = DIVISION_MAP.get(row["division"])
        if canonical is None:
            skipped += 1
            continue
        key = (int(row["wins"]), int(row["losses"]), int(row["absences"] or 0))
        by_division[canonical][key] += 1
        overall[key] += 1

    def to_payload(ctr: Counter) -> dict:
        total = sum(ctr.values())
        cells = [
            {"w": w, "l": l, "a": a, "n": n, "p": round(n / total, 6)}
            for (w, l, a), n in sorted(ctr.items(), key=lambda kv: -kv[1])
        ]
        return {"total": total, "cells": cells}

    record_by_division = {
        division: to_payload(ctr) for division, ctr in sorted(by_division.items())
    }
    record_overall = to_payload(overall)

    # --- career basho histogram (retired in Heisei) ---
    # last_basho は和暦表記なので era フィルタは sumo-db ロード時点で
    # Heisei 中心になっている前提で、retired (career_bashos > 0) のみを抽出。
    cur.execute(
        """
        SELECT career_bashos FROM rikishi_summary
        WHERE status = 'ok'
          AND last_basho IS NOT NULL
          AND career_bashos IS NOT NULL
          AND career_bashos > 0
        """,
    )
    career_bins: Counter = Counter()
    career_raw_counts: Counter = Counter()
    raw_values: list[int] = []
    for row in cur:
        v = int(row["career_bashos"])
        career_bins[bin_career_basho(v)] += 1
        career_raw_counts[v] += 1
        raw_values.append(v)

    raw_values.sort()
    n = len(raw_values)

    def pct(p: float) -> float:
        if not raw_values:
            return float("nan")
        idx = max(0, min(n - 1, int(p * (n - 1))))
        return float(raw_values[idx])

    bin_total = sum(career_bins.values())
    career_basho_payload = {
        "sample": bin_total,
        "p10": pct(0.10),
        "p50": pct(0.50),
        "p90": pct(0.90),
        "mean": round(sum(raw_values) / n, 3) if n else float("nan"),
        "bins": [
            {"bin": label, "n": cnt, "p": round(cnt / bin_total, 6) if bin_total else 0.0}
            for label, cnt in sorted(
                career_bins.items(),
                key=lambda kv: CAREER_BASHO_BINS.index(
                    next(b for b in CAREER_BASHO_BINS if (
                        f"{b[0]}-{b[1]}" if b[0] != b[1] else str(b[0])
                    ) == kv[0])
                ),
            )
        ],
    }

    conn.close()

    payload = {
        "meta": {
            "generatedAt": iso_now(),
            "era": "heisei",
            "heiseiMaxBashoCode": HEISEI_MAX_BASHO_CODE,
            "note": "Per-basho records and per-rikishi career length, all retired in Heisei.",
        },
        "recordHistogramOverall": record_overall,
        "recordHistogramByDivision": record_by_division,
        "careerBashoHistogram": career_basho_payload,
    }

    ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"wrote {OUTPUT_PATH}")
    print(
        f"  records: total={record_overall['total']} "
        f"divisions={list(record_by_division)} skipped={skipped}"
    )
    print(
        f"  careerBasho: sample={career_basho_payload['sample']} "
        f"p10={career_basho_payload['p10']} p50={career_basho_payload['p50']} "
        f"p90={career_basho_payload['p90']}"
    )


if __name__ == "__main__":
    main()
