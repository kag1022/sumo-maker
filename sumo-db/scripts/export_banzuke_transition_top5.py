"""平成期の rank_movement_with_record から、
(from_banzuke_label, wins, losses, absences) 別に
次場所 to_banzuke_label の経験的遷移確率テーブルを書き出す。

サンプル不足時に CLI 側でフォールバックできるよう、以下を併せて保存:
  - byRecord:  完全な (w, l, a) 条件分布
  - byWinLoss: (w, l) のみ条件（休場マージナル化）
  - marginal:  ラベルのみ条件（成績マージナル化）

出力: data/analysis/banzuke_transition_heisei.json
"""

import json
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime, timezone

from _paths import ANALYSIS_DIR, DB_PATH

OUTPUT_PATH = ANALYSIS_DIR / "banzuke_transition_heisei.json"
HEISEI_MAX_BASHO_CODE = "201903"
TOP_N = 10


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def top_payload(counter: Counter) -> dict:
    total = sum(counter.values())
    top = [
        {"to": to_label, "n": n, "p": round(n / total, 6)}
        for to_label, n in counter.most_common(TOP_N)
    ]
    return {"total": total, "top": top}


def main() -> None:
    if not DB_PATH.exists():
        raise SystemExit(f"DB not found: {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # 全遷移（成績無しでもマージナル分布の母集団に含める）
    cur.execute(
        """
        SELECT from_banzuke_label, to_banzuke_label
        FROM rank_movement
        WHERE from_basho_code <= ? AND to_basho_code <= ?
        """,
        (HEISEI_MAX_BASHO_CODE, HEISEI_MAX_BASHO_CODE),
    )
    marginal: dict[str, Counter] = defaultdict(Counter)
    total_all = 0
    for row in cur:
        marginal[row["from_banzuke_label"]][row["to_banzuke_label"]] += 1
        total_all += 1

    # 成績付き遷移
    cur.execute(
        """
        SELECT from_banzuke_label, to_banzuke_label,
               source_wins, source_losses, source_absences
        FROM rank_movement_with_record
        WHERE from_basho_code <= ? AND to_basho_code <= ?
          AND source_wins IS NOT NULL
          AND source_losses IS NOT NULL
        """,
        (HEISEI_MAX_BASHO_CODE, HEISEI_MAX_BASHO_CODE),
    )
    by_record: dict[str, dict[tuple[int, int, int], Counter]] = defaultdict(
        lambda: defaultdict(Counter)
    )
    by_winloss: dict[str, dict[tuple[int, int], Counter]] = defaultdict(
        lambda: defaultdict(Counter)
    )
    record_total = 0
    for row in cur:
        label = row["from_banzuke_label"]
        w = int(row["source_wins"])
        l = int(row["source_losses"])
        a = int(row["source_absences"] or 0)
        to = row["to_banzuke_label"]
        by_record[label][(w, l, a)][to] += 1
        by_winloss[label][(w, l)][to] += 1
        record_total += 1

    cur.execute(
        "SELECT COUNT(DISTINCT basho_code) FROM basho_metadata "
        "WHERE basho_code <= ? AND parse_status = 'ok'",
        (HEISEI_MAX_BASHO_CODE,),
    )
    basho_count = cur.fetchone()[0]
    conn.close()

    transitions: dict[str, dict] = {}
    all_labels = set(marginal) | set(by_record)
    for label in sorted(all_labels):
        entry: dict = {}
        if label in marginal:
            entry["marginal"] = top_payload(marginal[label])
        if label in by_winloss:
            entry["byWinLoss"] = {
                f"{w}-{l}": top_payload(ctr)
                for (w, l), ctr in sorted(by_winloss[label].items())
            }
        if label in by_record:
            entry["byRecord"] = {
                f"{w}-{l}-{a}": top_payload(ctr)
                for (w, l, a), ctr in sorted(by_record[label].items())
            }
        transitions[label] = entry

    payload = {
        "meta": {
            "generatedAt": iso_now(),
            "source": "rank_movement_with_record",
            "era": "heisei",
            "heiseiMaxBashoCode": HEISEI_MAX_BASHO_CODE,
            "bashoCount": basho_count,
            "marginalSampleCount": total_all,
            "recordSampleCount": record_total,
            "uniqueFromLabels": len(transitions),
            "topN": TOP_N,
            "schema": {
                "marginal": "P(next | label)",
                "byWinLoss": "P(next | label, wins, losses)  key='W-L'",
                "byRecord": "P(next | label, wins, losses, absences)  key='W-L-A'",
            },
            "note": "CLI fallback: byRecord -> byWinLoss -> marginal when sample is sparse.",
        },
        "transitions": transitions,
    }

    ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"wrote {OUTPUT_PATH}")
    print(
        f"  uniqueFromLabels={len(transitions)} "
        f"marginal={total_all} record={record_total} basho={basho_count}"
    )


if __name__ == "__main__":
    main()
