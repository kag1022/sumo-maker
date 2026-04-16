import argparse
import json
import math
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from _paths import ANALYSIS_DIR, DB_PATH

DOCS_SUMMARY_PATH = ANALYSIS_DIR.parents[2] / "docs" / "balance" / "calibration-targets.md"
CAREER_PATH = ANALYSIS_DIR / "career_calibration_1965plus.json"
BANZUKE_PATH = ANALYSIS_DIR / "banzuke_calibration_heisei.json"
POPULATION_PATH = ANALYSIS_DIR / "population_calibration_heisei.json"
BUNDLE_PATH = ANALYSIS_DIR / "calibration_bundle.json"
COLLECTION_REPORT_PATH = ANALYSIS_DIR / "heisei_collection_report.json"

HEISEI_MAX_BASHO_CODE = "201903"
DIVISION_SCOPE = ("Makuuchi", "Juryo", "Makushita", "Sandanme", "Jonidan", "Jonokuchi")
LOWER_DIVISION_SCOPE = ("Makushita", "Sandanme", "Jonidan", "Jonokuchi")
DIVISION_LABELS = {
    "幕内": "Makuuchi",
    "十両": "Juryo",
    "幕下": "Makushita",
    "三段目": "Sandanme",
    "序二段": "Jonidan",
    "序ノ口": "Jonokuchi",
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
OFFICIAL_BASHO_MONTHS = (1, 3, 5, 7, 9, 11)
LOWER_RANK_BANDS = {
    "Makushita": [(1, 5, "1-5"), (6, 15, "6-15"), (16, 30, "16-30"), (31, 45, "31-45"), (46, None, "46+")],
    "Sandanme": [(1, 10, "1-10"), (11, 30, "11-30"), (31, 60, "31-60"), (61, 90, "61-90"), (91, None, "91+")],
    "Jonidan": [(1, 20, "1-20"), (21, 50, "21-50"), (51, 100, "51-100"), (101, 150, "101-150"), (151, None, "151+")],
    "Jonokuchi": [(1, 10, "1-10"), (11, 20, "11-20"), (21, 30, "21-30"), (31, None, "31+")],
}


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


def summarize_quantiles(values: list[float]) -> dict | None:
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


def summarize_distribution(values: list[float], digits: int = 3) -> dict | None:
    if not values:
        return None
    values = sorted(values)
    return {
        "sampleSize": len(values),
        "min": round_num(values[0], digits),
        "p10": round_num(quantile(values, 0.1), digits),
        "p50": round_num(quantile(values, 0.5), digits),
        "p90": round_num(quantile(values, 0.9), digits),
        "max": round_num(values[-1], digits),
    }


def next_official_basho_code(basho_code: str) -> str:
    year = int(basho_code[:4])
    month = int(basho_code[4:])
    month_index = OFFICIAL_BASHO_MONTHS.index(month)
    if month_index == len(OFFICIAL_BASHO_MONTHS) - 1:
        return f"{year + 1}01"
    return f"{year}{OFFICIAL_BASHO_MONTHS[month_index + 1]:02d}"


def parse_era_basho_code(raw: str | None) -> str | None:
    if not raw:
        return None
    text = raw.strip()
    if len(text) == 6 and text.isdigit():
        return text
    if not text.startswith("平成") or "年" not in text or "月" not in text:
        return None
    year_text, rest = text[2:].split("年", 1)
    month_text = rest.replace("月", "")
    era_year = 1 if year_text == "元" else int(year_text)
    gregorian_year = 1988 + era_year
    return f"{gregorian_year}{int(month_text):02d}"


def resolve_lower_rank_band(division: str, rank_number: int | None) -> str:
    if rank_number is None:
        return "unknown"
    for lower, upper, label in LOWER_RANK_BANDS[division]:
        if rank_number >= lower and (upper is None or rank_number <= upper):
            return label
    return "other"


def resolve_record_bucket(wins: int | None, losses: int | None, absences: int | None) -> str:
    wins_value = int(wins or 0)
    losses_value = int(losses or 0)
    absences_value = int(absences or 0)
    if absences_value == 0 and wins_value + losses_value in (7, 15):
        return f"{wins_value}-{losses_value}"
    return f"{wins_value}-{losses_value}-{absences_value}"


def compute_banzuke_alignment_rate(con: sqlite3.Connection) -> tuple[int, int]:
    row = con.execute(
        """
        SELECT
            SUM(
                CASE
                    WHEN b.id IS NOT NULL
                     AND r.division = b.division
                     AND COALESCE(r.rank_name, '') = COALESCE(b.rank_name, '')
                     AND COALESCE(r.rank_number, -1) = COALESCE(b.rank_number, -1)
                     AND COALESCE(r.side, '') = COALESCE(b.side, '')
                     AND COALESCE(r.is_haridashi, 0) = COALESCE(b.is_haridashi, 0)
                    THEN 1 ELSE 0
                END
            ) AS matched,
            COUNT(*) AS total
        FROM rikishi_basho_record r
        JOIN basho_banzuke_entry b
            ON b.rikishi_id = r.rikishi_id
           AND b.basho_code = r.basho_code
        WHERE r.parse_status = 'ok'
          AND r.division != 'Maezumo'
        """
    ).fetchone()
    return int(row[0] or 0), int(row[1] or 0)


def compute_candidate_pair_counts(con: sqlite3.Connection) -> tuple[int, int]:
    rows = con.execute(
        """
        SELECT rikishi_id, basho_code
        FROM basho_banzuke_entry
        WHERE rikishi_id IS NOT NULL
        ORDER BY rikishi_id, basho_code
        """
    ).fetchall()
    candidate_pairs = 0
    consecutive_pairs = 0
    previous_by_rikishi: dict[int, str] = {}
    for rikishi_id, basho_code in rows:
        prev = previous_by_rikishi.get(int(rikishi_id))
        if prev is not None:
            candidate_pairs += 1
            if basho_code == next_official_basho_code(prev):
                consecutive_pairs += 1
        previous_by_rikishi[int(rikishi_id)] = basho_code
    return candidate_pairs, consecutive_pairs


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
        "SandanmeToMakushita": {"count": 0, "sampleSize": 0},
        "MakushitaToSandanme": {"count": 0, "sampleSize": 0},
        "JonidanToSandanme": {"count": 0, "sampleSize": 0},
        "SandanmeToJonidan": {"count": 0, "sampleSize": 0},
        "JonokuchiToJonidan": {"count": 0, "sampleSize": 0},
        "JonidanToJonokuchi": {"count": 0, "sampleSize": 0},
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
        elif from_division == "Sandanme" and to_division == "Makushita":
            buckets[from_division]["promoted"].append(steps * 2)
            boundary_counts["SandanmeToMakushita"]["count"] += 1
        elif from_division == "Makushita" and to_division == "Sandanme":
            buckets[from_division]["demoted"].append(steps * 2)
            boundary_counts["MakushitaToSandanme"]["count"] += 1
        elif from_division == "Jonidan" and to_division == "Sandanme":
            buckets[from_division]["promoted"].append(steps * 2)
            boundary_counts["JonidanToSandanme"]["count"] += 1
        elif from_division == "Sandanme" and to_division == "Jonidan":
            buckets[from_division]["demoted"].append(steps * 2)
            boundary_counts["SandanmeToJonidan"]["count"] += 1
        elif from_division == "Jonokuchi" and to_division == "Jonidan":
            buckets[from_division]["promoted"].append(steps * 2)
            boundary_counts["JonokuchiToJonidan"]["count"] += 1
        elif from_division == "Jonidan" and to_division == "Jonokuchi":
            buckets[from_division]["demoted"].append(steps * 2)
            boundary_counts["JonidanToJonokuchi"]["count"] += 1
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
            boundary_counts["MakushitaToSandanme"]["sampleSize"] += 1
        elif from_division == "Sandanme":
            boundary_counts["SandanmeToMakushita"]["sampleSize"] += 1
            boundary_counts["SandanmeToJonidan"]["sampleSize"] += 1
        elif from_division == "Jonidan":
            boundary_counts["JonidanToSandanme"]["sampleSize"] += 1
            boundary_counts["JonidanToJonokuchi"]["sampleSize"] += 1
        elif from_division == "Jonokuchi":
            boundary_counts["JonokuchiToJonidan"]["sampleSize"] += 1

    lower_rows = con.execute(
        """
        SELECT
            from_division,
            source_rank_number,
            source_wins,
            source_losses,
            source_absences,
            movement_steps
        FROM rank_movement_with_record
        WHERE from_basho_code <= ?
          AND to_basho_code <= ?
          AND from_division IN ('幕下', '三段目', '序二段', '序ノ口')
          AND source_wins IS NOT NULL
        """,
        (HEISEI_MAX_BASHO_CODE, HEISEI_MAX_BASHO_CODE),
    ).fetchall()

    record_aware_quantiles: dict[str, dict[str, dict[str, dict | None]]] = {
        division: {} for division in LOWER_DIVISION_SCOPE
    }
    grouped_lower: dict[str, dict[str, dict[str, list[float]]]] = {
        division: {} for division in LOWER_DIVISION_SCOPE
    }
    for from_division_ja, rank_number, wins, losses, absences, movement_steps in lower_rows:
        division = DIVISION_LABELS[from_division_ja]
        rank_band = resolve_lower_rank_band(division, rank_number)
        record_bucket = resolve_record_bucket(wins, losses, absences)
        grouped_lower.setdefault(division, {}).setdefault(rank_band, {}).setdefault(record_bucket, []).append(
            float(movement_steps) * 2
        )

    for division, rank_bands in grouped_lower.items():
        record_aware_quantiles[division] = {
            rank_band: {
                record_bucket: summarize_quantiles(values)
                for record_bucket, values in sorted(record_bands.items())
            }
            for rank_band, record_bands in sorted(rank_bands.items())
        }

    candidate_pairs, consecutive_pairs = compute_candidate_pair_counts(con)
    rikishi_basho_record_count = con.execute(
        "SELECT COUNT(*) FROM rikishi_basho_record WHERE parse_status = 'ok'"
    ).fetchone()[0]
    movement_join_count = con.execute(
        """
        SELECT COUNT(*)
        FROM rank_movement_with_record
        WHERE source_wins IS NOT NULL
        """
    ).fetchone()[0]
    movement_total = con.execute("SELECT COUNT(*) FROM rank_movement").fetchone()[0]
    valid_day_count, total_day_count = con.execute(
        """
        SELECT
            SUM(CASE WHEN wins + losses + absences IN (0, 7, 15) THEN 1 ELSE 0 END),
            COUNT(*)
        FROM rikishi_basho_record
        WHERE parse_status = 'ok'
        """
    ).fetchone()
    aligned_rows, aligned_total = compute_banzuke_alignment_rate(con)

    return {
        "meta": {
            "generatedAt": generated_at,
            "source": "rank_movement",
            "era": "heisei_banzuke",
            "cohort": "heisei_banzuke",
            "sampleSize": len(rows),
            "bashoCount": basho_count,
            "divisionScope": list(DIVISION_SCOPE),
            "note": "Per-basho win/loss records are joined from rikishi_basho_record.",
            "dataQuality": {
                "rikishiBashoRecordCount": int(rikishi_basho_record_count),
                "candidatePairCount": int(candidate_pairs),
                "consecutivePairCount": int(consecutive_pairs),
                "consecutiveMovementRate": round_num(consecutive_pairs / candidate_pairs) if candidate_pairs else 0.0,
                "rankMovementJoinSuccessRate": round_num(movement_join_count / movement_total) if movement_total else 0.0,
                "validBoutLengthRate": round_num((valid_day_count or 0) / total_day_count) if total_day_count else 0.0,
                "banzukeAlignmentRate": round_num(aligned_rows / aligned_total) if aligned_total else 0.0,
            },
        },
        "divisionMovementQuantiles": {
            division: {key: summarize_quantiles(values) for key, values in bucket.items()}
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
            "supported": True,
            "source": "rank_movement_with_record.from_basho_code",
            "recordLinkMeaning": "movement is linked to the source basho record on from_basho_code",
            "lowerDivisionScope": list(LOWER_DIVISION_SCOPE),
            "rankBands": LOWER_RANK_BANDS,
            "recordAwareQuantiles": record_aware_quantiles,
        },
    }


def fetch_population_target(con: sqlite3.Connection, generated_at: str) -> dict:
    basho_rows = con.execute(
        """
        SELECT
            b.basho_code,
            CAST(SUBSTR(b.basho_code, 1, 4) AS INTEGER) AS year,
            CAST(SUBSTR(b.basho_code, 5, 2) AS INTEGER) AS month,
            b.division,
            COUNT(*) AS headcount
        FROM basho_banzuke_entry b
        JOIN basho_metadata m
          ON m.basho_code = b.basho_code
        WHERE m.parse_status = 'ok'
          AND b.basho_code <= ?
          AND b.division IN ('幕内', '十両', '幕下', '三段目', '序二段', '序ノ口')
        GROUP BY b.basho_code, b.division
        ORDER BY b.basho_code, b.division
        """,
        (HEISEI_MAX_BASHO_CODE,),
    ).fetchall()
    if not basho_rows:
        raise RuntimeError("No population rows found for calibration export.")

    basho_stats: dict[str, dict] = {}
    for basho_code, year, month, division_ja, headcount in basho_rows:
        stats = basho_stats.setdefault(
            basho_code,
            {
                "bashoCode": basho_code,
                "year": int(year),
                "month": int(month),
                "divisions": {division: 0 for division in DIVISION_SCOPE},
            },
        )
        division = DIVISION_LABELS[division_ja]
        stats["divisions"][division] = int(headcount)

    basho_list = sorted(basho_stats.values(), key=lambda row: row["bashoCode"])
    total_headcounts = [
        float(sum(row["divisions"][division] for division in DIVISION_SCOPE))
        for row in basho_list
    ]
    jonidan_headcounts = [float(row["divisions"]["Jonidan"]) for row in basho_list]
    jonokuchi_headcounts = [float(row["divisions"]["Jonokuchi"]) for row in basho_list]

    year_groups: dict[int, list[dict]] = {}
    for row in basho_list:
        year_groups.setdefault(int(row["year"]), []).append(row)

    total_delta_values: list[float] = []
    total_swing_values: list[float] = []
    jonidan_delta_values: list[float] = []
    jonidan_swing_values: list[float] = []
    jonokuchi_delta_values: list[float] = []
    jonokuchi_swing_values: list[float] = []
    year_end_total_values: list[float] = []
    year_end_jonidan_values: list[float] = []
    year_end_jonokuchi_values: list[float] = []

    for rows in year_groups.values():
        ordered = sorted(rows, key=lambda row: row["month"])
        total_series = [sum(row["divisions"][division] for division in DIVISION_SCOPE) for row in ordered]
        jonidan_series = [row["divisions"]["Jonidan"] for row in ordered]
        jonokuchi_series = [row["divisions"]["Jonokuchi"] for row in ordered]

        total_delta_values.append(float(total_series[-1] - total_series[0]))
        total_swing_values.append(float(max(total_series) - min(total_series)))
        jonidan_delta_values.append(float(jonidan_series[-1] - jonidan_series[0]))
        jonidan_swing_values.append(float(max(jonidan_series) - min(jonidan_series)))
        jonokuchi_delta_values.append(float(jonokuchi_series[-1] - jonokuchi_series[0]))
        jonokuchi_swing_values.append(float(max(jonokuchi_series) - min(jonokuchi_series)))
        year_end_total_values.append(float(total_series[-1]))
        year_end_jonidan_values.append(float(jonidan_series[-1]))
        year_end_jonokuchi_values.append(float(jonokuchi_series[-1]))

    monthly_intake_values: dict[int, list[float]] = {month: [] for month in OFFICIAL_BASHO_MONTHS}
    summary_debut_rows = con.execute(
        """
        SELECT debut_basho
        FROM rikishi_summary
        WHERE status = 'ok'
          AND debut_basho IS NOT NULL
        """
    ).fetchall()
    debut_counts_by_basho: dict[str, int] = {}
    for (debut_basho_raw,) in summary_debut_rows:
        basho_code = parse_era_basho_code(debut_basho_raw)
        if basho_code is None:
            continue
        if basho_code < "199001" or basho_code > HEISEI_MAX_BASHO_CODE:
            continue
        debut_counts_by_basho[basho_code] = debut_counts_by_basho.get(basho_code, 0) + 1
    for basho_code, debut_count in sorted(debut_counts_by_basho.items()):
        month_value = int(basho_code[4:])
        if month_value in monthly_intake_values:
            monthly_intake_values[month_value].append(float(debut_count))

    return {
        "meta": {
            "generatedAt": generated_at,
            "source": "basho_banzuke_entry",
            "era": "heisei_population",
            "cohort": "heisei_population",
            "sampleSize": len(basho_list),
            "bashoCount": len(basho_list),
            "divisionScope": list(DIVISION_SCOPE),
            "countMeaning": "active banzuke headcount excluding maezumo",
            "monthlyIntakeMeaning": "first banzuke appearance count by basho month",
        },
        "annualTotalHeadcount": summarize_distribution(year_end_total_values, 3),
        "annualTotalDelta": summarize_distribution(total_delta_values, 3),
        "annualTotalSwing": summarize_distribution(total_swing_values, 3),
        "annualJonidanHeadcount": summarize_distribution(year_end_jonidan_values, 3),
        "annualJonidanDelta": summarize_distribution(jonidan_delta_values, 3),
        "annualJonidanSwing": summarize_distribution(jonidan_swing_values, 3),
        "annualJonokuchiHeadcount": summarize_distribution(year_end_jonokuchi_values, 3),
        "annualJonokuchiDelta": summarize_distribution(jonokuchi_delta_values, 3),
        "annualJonokuchiSwing": summarize_distribution(jonokuchi_swing_values, 3),
        "monthlyIntakeByMonth": {
            str(month): summarize_distribution(values, 3)
            for month, values in monthly_intake_values.items()
        },
        "bashoLevelReference": {
            "totalHeadcount": summarize_distribution(total_headcounts, 3),
            "jonidanHeadcount": summarize_distribution(jonidan_headcounts, 3),
            "jonokuchiHeadcount": summarize_distribution(jonokuchi_headcounts, 3),
        },
    }


def write_json(target_path: Path, payload: dict) -> None:
    ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)
    target_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_summary_markdown(career: dict, banzuke: dict, population: dict, bundle: dict) -> str:
    lines = [
        "# 校正データサマリー",
        "",
        "## Bundle",
        f"- generatedAt: {bundle['meta']['generatedAt']}",
        f"- cohort: {bundle['meta']['cohort']}",
        f"- includedCount: {bundle['meta']['includedCount']}",
        f"- pendingCount: {bundle['meta']['pendingCount']}",
        "",
        "## Career",
        f"- source: {career['meta']['source']}",
        f"- era: {career['meta']['era']}",
        f"- sampleSize: {career['meta']['sampleSize']}",
        "",
        "## Banzuke",
        f"- source: {banzuke['meta']['source']}",
        f"- era: {banzuke['meta']['era']}",
        f"- bashoCount: {banzuke['meta']['bashoCount']}",
        "",
        "## Population",
        f"- source: {population['meta']['source']}",
        f"- era: {population['meta']['era']}",
        f"- bashoCount: {population['meta']['bashoCount']}",
        "",
        "## record bucket support",
        f"- supported: {str(banzuke['recordBucketRules']['supported']).lower()}",
        f"- source: {banzuke['recordBucketRules']['source']}",
        f"- lowerDivisionScope: {', '.join(banzuke['recordBucketRules']['lowerDivisionScope'])}",
        "",
    ]
    return "\n".join(lines)


def write_summary_markdown(target_path: Path, career: dict, banzuke: dict, population: dict, bundle: dict) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text(
        build_summary_markdown(career, banzuke, population, bundle) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parse_args()
    generated_at = iso_now()
    collection_report = load_collection_report()
    con = sqlite3.connect(DB_PATH)
    try:
        career = fetch_career_target(con, generated_at)
        banzuke = fetch_banzuke_target(con, generated_at)
        population = fetch_population_target(con, generated_at)
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
        "population": population,
        "collection": collection_report,
    }

    write_json(CAREER_PATH, career)
    write_json(BANZUKE_PATH, banzuke)
    write_json(POPULATION_PATH, population)
    write_json(BUNDLE_PATH, bundle)
    write_summary_markdown(DOCS_SUMMARY_PATH, career, banzuke, population, bundle)
    print(f"written: {CAREER_PATH}")
    print(f"written: {BANZUKE_PATH}")
    print(f"written: {POPULATION_PATH}")
    print(f"written: {BUNDLE_PATH}")
    print(f"written: {DOCS_SUMMARY_PATH}")


if __name__ == "__main__":
    main()
