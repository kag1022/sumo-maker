import argparse
import json
import math
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from _paths import ANALYSIS_DIR, DB_PATH

CAREER_PATH = ANALYSIS_DIR / "career_calibration_1965plus.json"
BANZUKE_PATH = ANALYSIS_DIR / "banzuke_calibration_heisei.json"
BUNDLE_PATH = ANALYSIS_DIR / "calibration_bundle.json"
COLLECTION_REPORT_PATH = ANALYSIS_DIR / "heisei_collection_report.json"

HEISEI_MAX_BASHO_CODE = "201903"
DIVISION_SCOPE = ("Makuuchi", "Juryo", "Makushita")
DIVISION_LABELS = {
    "幕内": "Makuuchi",
    "十両": "Juryo",
    "幕下": "Makushita",
}
RANK_LABELS = {"横綱", "大関", "関脇", "小結", "前頭", "十両"}
WIN_RATE_BUCKETS = [
    "<0.35",
    "0.35-0.39",
    "0.40-0.44",
    "0.45-0.49",
    "0.50-0.54",
    "0.55-0.59",
    "0.60-0.64",
    ">=0.65",
]
CAREER_BASHO_BUCKETS = ["<12", "12-23", "24-35", "36-59", "60-89", "90-119", ">=120"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="校正 JSON を出力する")
    parser.add_argument(
        "--cohort",
        choices=["heisei"],
        default="heisei",
        help="出力対象 cohort",
    )
    return parser.parse_args()


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def quantile(sorted_values: list[float], ratio: float) -> float:
    if not sorted_values:
        return float("nan")
    if len(sorted_values) == 1:
        return float(sorted_values[0])
    pos = (len(sorted_values) - 1) * ratio
    lo = math.floor(pos)
    hi = math.ceil(pos)
    if lo == hi:
        return float(sorted_values[lo])
    weight = pos - lo
    return float(sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * weight)


def round_num(value: float, digits: int = 6) -> float:
    return round(float(value), digits)


def load_collection_report() -> dict:
    if COLLECTION_REPORT_PATH.exists():
        return json.loads(COLLECTION_REPORT_PATH.read_text(encoding="utf-8"))
    return {
        "counts": {
            "includedCount": 0,
            "excludedCount": 0,
            "pendingCount": 0,
            "errorCount": 0,
            "discoveredCount": 0,
        },
        "stabilityStatus": {
            "isStable": False,
            "recommendedStopReason": "report_missing",
            "stableRunLength": 0,
            "reachedMinimumSample": False,
        },
        "checkpoints": [],
    }


def fetch_career_target(con: sqlite3.Connection, generated_at: str) -> dict:
    rows = con.execute(
        """
        SELECT
            highest_rank_name,
            career_bashos,
            CAST(career_wins AS REAL) / NULLIF(career_wins + career_losses, 0) AS official_win_rate
        FROM rikishi_summary
        WHERE cohort = 'heisei_debut'
          AND status = 'ok'
        """
    ).fetchall()
    if not rows:
        raise RuntimeError("No heisei_debut rows found for calibration export.")

    highest_rank_counts: dict[str, int] = {}
    career_bashos: list[float] = []
    win_rates: list[float] = []
    low_win_long_career = 0

    for highest_rank_name, basho_count, win_rate in rows:
        rank_name = highest_rank_name or "不明"
        highest_rank_counts[rank_name] = highest_rank_counts.get(rank_name, 0) + 1
        basho_value = float(basho_count or 0)
        win_rate_value = 0.5 if win_rate is None else float(win_rate)
        career_bashos.append(basho_value)
        win_rates.append(win_rate_value)
        if basho_value >= 60 and win_rate_value < 0.45:
            low_win_long_career += 1

    career_bashos.sort()
    win_rates.sort()
    sample_size = len(rows)
    highest_rank_rates = {rank: count / sample_size for rank, count in highest_rank_counts.items()}

    def rate_sum(labels: set[str]) -> float:
        return sum(highest_rank_rates.get(label, 0.0) for label in labels)

    win_rate_bucket_counts = {bucket: 0 for bucket in WIN_RATE_BUCKETS}
    for value in win_rates:
        if value < 0.35:
            win_rate_bucket_counts["<0.35"] += 1
        elif value < 0.40:
            win_rate_bucket_counts["0.35-0.39"] += 1
        elif value < 0.45:
            win_rate_bucket_counts["0.40-0.44"] += 1
        elif value < 0.50:
            win_rate_bucket_counts["0.45-0.49"] += 1
        elif value < 0.55:
            win_rate_bucket_counts["0.50-0.54"] += 1
        elif value < 0.60:
            win_rate_bucket_counts["0.55-0.59"] += 1
        elif value < 0.65:
            win_rate_bucket_counts["0.60-0.64"] += 1
        else:
            win_rate_bucket_counts[">=0.65"] += 1

    career_basho_bucket_counts = {bucket: 0 for bucket in CAREER_BASHO_BUCKETS}
    for value in career_bashos:
        if value < 12:
            career_basho_bucket_counts["<12"] += 1
        elif value < 24:
            career_basho_bucket_counts["12-23"] += 1
        elif value < 36:
            career_basho_bucket_counts["24-35"] += 1
        elif value < 60:
            career_basho_bucket_counts["36-59"] += 1
        elif value < 90:
            career_basho_bucket_counts["60-89"] += 1
        elif value < 120:
            career_basho_bucket_counts["90-119"] += 1
        else:
            career_basho_bucket_counts[">=120"] += 1

    return {
        "meta": {
            "generatedAt": generated_at,
            "source": "rikishi_summary",
            "era": "heisei_debut",
            "cohort": "heisei_debut",
            "sampleSize": sample_size,
            "minDebutYear": 1989,
        },
        "rankRates": {
            "sekitoriRate": round_num(rate_sum(RANK_LABELS)),
            "makuuchiRate": round_num(rate_sum({"横綱", "大関", "関脇", "小結", "前頭"})),
            "sanyakuRate": round_num(rate_sum({"横綱", "大関", "関脇", "小結"})),
            "ozekiRate": round_num(rate_sum({"横綱", "大関"})),
            "yokozunaRate": round_num(highest_rank_rates.get("横綱", 0.0)),
        },
        "careerLength": {
            "mean": round_num(sum(career_bashos) / sample_size, 3),
            "p10": round_num(quantile(career_bashos, 0.1), 3),
            "p50": round_num(quantile(career_bashos, 0.5), 3),
            "p90": round_num(quantile(career_bashos, 0.9), 3),
        },
        "careerWinRate": {
            "mean": round_num(sum(win_rates) / sample_size, 6),
            "median": round_num(quantile(win_rates, 0.5), 6),
            "bucketRates": {bucket: round_num(count / sample_size) for bucket, count in win_rate_bucket_counts.items()},
        },
        "distributionBuckets": {
            "highestRank": {rank: round_num(count / sample_size) for rank, count in sorted(highest_rank_counts.items())},
            "careerBasho": {bucket: round_num(count / sample_size) for bucket, count in career_basho_bucket_counts.items()},
            "careerWinRate": {bucket: round_num(count / sample_size) for bucket, count in win_rate_bucket_counts.items()},
        },
        "longTailSignals": {
            "lowWinLongCareerRate": round_num(low_win_long_career / sample_size),
        },
    }


def fetch_banzuke_target(con: sqlite3.Connection, generated_at: str) -> dict:
    basho_count = con.execute(
        "SELECT COUNT(*) FROM basho_metadata WHERE basho_code <= ?",
        (HEISEI_MAX_BASHO_CODE,),
    ).fetchone()[0]
    rows = con.execute(
        """
        SELECT from_division, to_division, movement_steps
        FROM rank_movement
        WHERE from_basho_code <= ?
          AND to_basho_code <= ?
          AND from_division IN ('幕内', '十両', '幕下')
        """,
        (HEISEI_MAX_BASHO_CODE, HEISEI_MAX_BASHO_CODE),
    ).fetchall()
    if not rows:
        raise RuntimeError("No banzuke rows found for calibration export.")

    buckets: dict[str, dict[str, list[float]]] = {
        division: {"stayed": [], "promoted": [], "demoted": []} for division in DIVISION_SCOPE
    }
    boundary_counts: dict[str, dict[str, float]] = {
        "JuryoToMakuuchi": {"count": 0, "sampleSize": 0},
        "MakuuchiToJuryo": {"count": 0, "sampleSize": 0},
        "MakushitaToJuryo": {"count": 0, "sampleSize": 0},
        "JuryoToMakushita": {"count": 0, "sampleSize": 0},
    }

    for from_division_ja, to_division_ja, movement_steps in rows:
        from_division = DIVISION_LABELS[from_division_ja]
        to_division = DIVISION_LABELS.get(to_division_ja)
        steps = float(movement_steps)
        if to_division == from_division:
            buckets[from_division]["stayed"].append(steps * 2)
        elif from_division == "Juryo" and to_division == "Makuuchi":
            buckets[from_division]["promoted"].append(steps * 2)
            boundary_counts["JuryoToMakuuchi"]["count"] += 1
        elif from_division == "Makuuchi" and to_division == "Juryo":
            buckets[from_division]["demoted"].append(steps * 2)
            boundary_counts["MakuuchiToJuryo"]["count"] += 1
        elif from_division == "Makushita" and to_division == "Juryo":
            buckets[from_division]["promoted"].append(steps * 2)
            boundary_counts["MakushitaToJuryo"]["count"] += 1
        elif from_division == "Juryo" and to_division == "Makushita":
            buckets[from_division]["demoted"].append(steps * 2)
            boundary_counts["JuryoToMakushita"]["count"] += 1
        elif to_division in DIVISION_SCOPE:
            if DIVISION_SCOPE.index(to_division) < DIVISION_SCOPE.index(from_division):
                buckets[from_division]["promoted"].append(steps * 2)
            else:
                buckets[from_division]["demoted"].append(steps * 2)

        if from_division == "Juryo":
            boundary_counts["JuryoToMakuuchi"]["sampleSize"] += 1
            boundary_counts["JuryoToMakushita"]["sampleSize"] += 1
        elif from_division == "Makuuchi":
            boundary_counts["MakuuchiToJuryo"]["sampleSize"] += 1
        elif from_division == "Makushita":
            boundary_counts["MakushitaToJuryo"]["sampleSize"] += 1

    def summarize(values: list[float]) -> dict | None:
        if not values:
            return None
        values = sorted(values)
        return {
            "sampleSize": len(values),
            "p10HalfStep": round_num(quantile(values, 0.1), 3),
            "p50HalfStep": round_num(quantile(values, 0.5), 3),
            "p90HalfStep": round_num(quantile(values, 0.9), 3),
            "p10Rank": round_num(quantile(values, 0.1) / 2, 3),
            "p50Rank": round_num(quantile(values, 0.5) / 2, 3),
            "p90Rank": round_num(quantile(values, 0.9) / 2, 3),
        }

    return {
        "meta": {
            "generatedAt": generated_at,
            "source": "rank_movement",
            "era": "heisei_banzuke",
            "cohort": "heisei_banzuke",
            "sampleSize": len(rows),
            "bashoCount": basho_count,
            "divisionScope": list(DIVISION_SCOPE),
            "note": "Per-basho win/loss records are unavailable in the current sumo-db snapshot.",
        },
        "divisionMovementQuantiles": {
            division: {key: summarize(values) for key, values in bucket.items()}
            for division, bucket in buckets.items()
        },
        "boundaryExchangeRates": {
            key: {
                "sampleSize": int(value["sampleSize"]),
                "count": int(value["count"]),
                "rate": round_num(value["count"] / value["sampleSize"]) if value["sampleSize"] else 0.0,
            }
            for key, value in boundary_counts.items()
        },
        "recordBucketRules": {
            "supported": False,
            "reason": "Historical per-basho win/loss records are not available in the current sumo-db snapshot.",
            "fallbackComparisonKeys": [
                "MakuuchiStayed",
                "JuryoStayed",
                "MakushitaStayed",
                "JuryoToMakuuchi",
                "MakuuchiToJuryo",
                "MakushitaToJuryo",
                "JuryoToMakushita",
            ],
        },
    }


def write_json(target_path: Path, payload: dict) -> None:
    ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)
    target_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parse_args()
    generated_at = iso_now()
    collection_report = load_collection_report()
    con = sqlite3.connect(DB_PATH)
    try:
        career = fetch_career_target(con, generated_at)
        banzuke = fetch_banzuke_target(con, generated_at)
    finally:
        con.close()

    bundle = {
        "meta": {
            "generatedAt": generated_at,
            "cohort": "heisei_debut",
            "sampleSize": career["meta"]["sampleSize"],
            "includedCount": collection_report["counts"]["includedCount"],
            "excludedCount": collection_report["counts"]["excludedCount"],
            "pendingCount": collection_report["counts"]["pendingCount"],
            "stabilityStatus": collection_report["stabilityStatus"],
        },
        "career": career,
        "banzuke": banzuke,
        "collection": collection_report,
    }

    write_json(CAREER_PATH, career)
    write_json(BANZUKE_PATH, banzuke)
    write_json(BUNDLE_PATH, bundle)
    print(f"written: {CAREER_PATH}")
    print(f"written: {BANZUKE_PATH}")
    print(f"written: {BUNDLE_PATH}")


if __name__ == "__main__":
    main()
