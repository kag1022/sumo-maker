#!/usr/bin/env python
"""09_export_game_calibration.py — 長期遷移JSON → 軽量ゲーム用係数 JSON

入力: data/analysis/banzuke_transition_sumo_api_196007_202603.json
出力: data/analysis/game_calibration_long_range.json

rankZone をキーに、wins-losses-absences 別の移動幅分布（p10/p25/median/p75/p90）を出力。
"""

import sys, json, math
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from sumo_api_data.normalize import parse_api_rank, RANK_ORDER
from sumo_api_data.rank_order import calc_slot_rank_value, RANK_BASE_OFFSET

ROOT = Path(__file__).resolve().parents[1]
ANALYSIS_DIR = ROOT / "data" / "analysis"
INPUT_PATH = ANALYSIS_DIR / "banzuke_transition_sumo_api_196007_202603.json"
OUTPUT_PATH = ANALYSIS_DIR / "game_calibration_long_range.json"

# rankZone 定義
RANK_ZONES = [
    "Yokozuna",
    "Ozeki",
    "Sanyaku",
    "Makuuchi_Joi",
    "Makuuchi_Mid",
    "Makuuchi_Low",
    "Juryo_Upper",
    "Juryo_Mid",
    "Juryo_Low",
    "Makushita_Upper_5",
    "Makushita_Upper_15",
    "Makushita_Upper_30",
    "Makushita_Lower",
    "Sandanme",
    "Jonidan",
    "Jonokuchi",
]


def parse_japanese_label(label: str) -> dict | None:
    """日本語ラベル "東横綱1枚目" を {side, ja_name, number} に分解する。"""
    import re
    m = re.match(r'^([東西])(.+?)(\d+)枚目$', label)
    if not m:
        return None
    return {"side": m.group(1), "ja_name": m.group(2), "number": int(m.group(3))}


def classify_rank_zone(label: str) -> str | None:
    """日本語ラベルを rankZone に分類する。"""
    p = parse_japanese_label(label)
    if p is None:
        return None
    ja = p["ja_name"]
    n = p["number"]

    if ja == "横綱":
        return "Yokozuna"
    if ja == "大関":
        return "Ozeki"
    if ja in ("関脇", "小結"):
        return "Sanyaku"
    if ja == "前頭":
        if n <= 5:
            return "Makuuchi_Joi"
        if n <= 10:
            return "Makuuchi_Mid"
        return "Makuuchi_Low"
    if ja == "十両":
        if n <= 5:
            return "Juryo_Upper"
        if n <= 9:
            return "Juryo_Mid"
        return "Juryo_Low"
    if ja == "幕下":
        if n <= 5:
            return "Makushita_Upper_5"
        if n <= 15:
            return "Makushita_Upper_15"
        if n <= 30:
            return "Makushita_Upper_30"
        return "Makushita_Lower"
    if ja == "三段目":
        return "Sandanme"
    if ja == "序二段":
        return "Jonidan"
    if ja == "序ノ口":
        return "Jonokuchi"
    return None


def compute_movement_steps(from_label: str, to_label: str) -> float:
    """from_label → to_label の移動幅を slot_rank_value の差で計算する。"""
    f = parse_japanese_label(from_label)
    t = parse_japanese_label(to_label)
    if f is None or t is None:
        return 0.0
    from_val = calc_slot_rank_value(f["ja_name"], f["number"], f["side"])
    to_val = calc_slot_rank_value(t["ja_name"], t["number"], t["side"])
    return from_val - to_val


def quantiles(values: list[float]) -> dict:
    """p10, p25, median, p75, p90 を計算する。"""
    if not values:
        return {"p10": 0, "p25": 0, "median": 0, "p75": 0, "p90": 0}
    s = sorted(values)
    n = len(s)
    def q(p):
        idx = p * (n - 1)
        lo = int(idx)
        hi = min(lo + 1, n - 1)
        frac = idx - lo
        return s[lo] * (1 - frac) + s[hi] * frac
    return {
        "p10": round(q(0.10), 2),
        "p25": round(q(0.25), 2),
        "median": round(q(0.50), 2),
        "p75": round(q(0.75), 2),
        "p90": round(q(0.90), 2),
    }


def confidence(sample_count: int) -> str:
    if sample_count >= 50:
        return "high"
    if sample_count >= 15:
        return "medium"
    return "low"


def main():
    with open(INPUT_PATH, encoding="utf-8") as f:
        data = json.load(f)

    transitions = data["transitions"]
    print(f"Loading {len(transitions)} labels ...")

    # zone → (w,l,a) → [movement_steps]
    buckets: dict[str, dict[tuple[int, int, int], list[float]]] = defaultdict(
        lambda: defaultdict(list)
    )

    for from_label, entry in transitions.items():
        zone = classify_rank_zone(from_label)
        if zone is None:
            continue

        by_record = entry.get("byRecord") or {}
        for wla_key, dist in by_record.items():
            parts = wla_key.split("-")
            w = int(parts[0])
            l = int(parts[1])
            a = int(parts[2]) if len(parts) > 2 else 0

            for row in dist.get("top", []):
                steps = compute_movement_steps(from_label, row["to"])
                if steps == 0 and from_label != row["to"]:
                    continue  # skip if movement=0 only because of parse failure
                for _ in range(row["n"]):
                    buckets[zone][(w, l, a)].append(steps)

    print(f"Buckets: {sum(len(v) for v in buckets.values())} zone×record combinations")

    # 出力構築
    output: list[dict] = []

    for zone in RANK_ZONES:
        zone_buckets = buckets.get(zone, {})
        if not zone_buckets:
            continue

        # wins/losses で最も出現するパターン順にソート
        for (w, l, a), movements in sorted(zone_buckets.items(), key=lambda x: -len(x[1])):
            sample_count = len(movements)
            q = quantiles(movements)
            expected = round(sum(movements) / sample_count, 2) if sample_count else 0

            # absences bucket: "0", "1-7", "8-14", "15"
            if a == 0:
                abs_bucket = "0"
            elif a <= 7:
                abs_bucket = "1-7"
            elif a <= 14:
                abs_bucket = "8-14"
            else:
                abs_bucket = "15"

            output.append({
                "source": "sumo-api-long-range",
                "rankZone": zone,
                "wins": w,
                "losses": l,
                "absencesBucket": abs_bucket,
                "sampleCount": sample_count,
                "confidence": confidence(sample_count),
                "expectedMovement": expected,
                **q,
            })

    output.sort(key=lambda x: (
        RANK_ZONES.index(x["rankZone"]) if x["rankZone"] in RANK_ZONES else 99,
        -x["sampleCount"],
    ))

    payload = {
        "meta": {
            "generatedFrom": "banzuke_transition_sumo_api_196007_202603.json",
            "rankZones": RANK_ZONES,
            "note": "Movement values in rank slot units. Positive = promotion.",
            "bucketCount": len(output),
        },
        "buckets": output,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"Output: {OUTPUT_PATH} ({size_kb:.0f} KB, {len(output)} buckets)")


if __name__ == "__main__":
    main()
