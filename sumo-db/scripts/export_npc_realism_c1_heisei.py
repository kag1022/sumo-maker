import json
import math
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone

from _paths import ANALYSIS_DIR, DB_PATH

OUT_PATH = ANALYSIS_DIR / "npc_realism_c1_heisei.json"
HEISEI_MAX_BASHO_CODE = "201903"
SAMPLE_SIZE_THRESHOLD = 20

BASHO_MONTH_INDEX = {1: 0, 3: 1, 5: 2, 7: 3, 9: 4, 11: 5}
BOUTS_BY_DIVISION = {
    "Makuuchi": 15,
    "Juryo": 15,
    "Makushita": 7,
    "Sandanme": 7,
    "Jonidan": 7,
    "Jonokuchi": 7,
}
RANK_ORDER = [
    "序ノ口",
    "序二段",
    "三段目",
    "幕下",
    "十両",
    "前頭",
    "小結",
    "関脇",
    "大関",
    "横綱",
]
CAREER_BASHO_BUCKETS = ["<12", "12-23", "24-35", "36-59", "60-89", "90-119", ">=120"]
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
APTITUDE_TIERS = ["S", "A", "B", "C", "D"]
CAREER_BANDS = ["ELITE", "STRONG", "STANDARD", "GRINDER", "WASHOUT"]
RETIREMENT_PROFILES = ["EARLY_EXIT", "STANDARD", "IRONMAN"]
RISE_BANDS = [1, 2, 3]
DIVISION_AGE_PROFILE_ORDER = [
    "Makuuchi",
    "Juryo",
    "Makushita",
    "Sandanme",
    "Jonidan",
    "Jonokuchi",
    "Maezumo",
]
DIVISION_NAME_MAP = {
    "幕内": "Makuuchi",
    "十両": "Juryo",
    "幕下": "Makushita",
    "三段目": "Sandanme",
    "序二段": "Jonidan",
    "序ノ口": "Jonokuchi",
    "前相撲": "Maezumo",
    "Makuuchi": "Makuuchi",
    "Juryo": "Juryo",
    "Makushita": "Makushita",
    "Sandanme": "Sandanme",
    "Jonidan": "Jonidan",
    "Jonokuchi": "Jonokuchi",
    "Maezumo": "Maezumo",
}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def round_num(value: float, digits: int = 6) -> float:
    return round(float(value), digits)


def quantile(values: list[float], ratio: float) -> float:
    if not values:
        return float("nan")
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    pos = (len(ordered) - 1) * ratio
    lo = math.floor(pos)
    hi = math.ceil(pos)
    if lo == hi:
        return float(ordered[lo])
    weight = pos - lo
    return float(ordered[lo] + (ordered[hi] - ordered[lo]) * weight)


def summarize_distribution(values: list[float]) -> dict:
    ordered = sorted(values)
    return {
        "sampleSize": len(ordered),
        "min": round_num(ordered[0], 3),
        "p10": round_num(quantile(ordered, 0.1), 3),
        "p50": round_num(quantile(ordered, 0.5), 3),
        "p90": round_num(quantile(ordered, 0.9), 3),
        "max": round_num(ordered[-1], 3),
    }


def bucket_career_bashos(career_bashos: int) -> str:
    if career_bashos < 12:
        return "<12"
    if career_bashos < 24:
        return "12-23"
    if career_bashos < 36:
        return "24-35"
    if career_bashos < 60:
        return "36-59"
    if career_bashos < 90:
        return "60-89"
    if career_bashos < 120:
        return "90-119"
    return ">=120"


def bucket_win_rate(win_rate: float) -> str:
    if win_rate < 0.35:
        return "<0.35"
    if win_rate < 0.40:
        return "0.35-0.39"
    if win_rate < 0.45:
        return "0.40-0.44"
    if win_rate < 0.50:
        return "0.45-0.49"
    if win_rate < 0.55:
        return "0.50-0.54"
    if win_rate < 0.60:
        return "0.55-0.59"
    if win_rate < 0.65:
        return "0.60-0.64"
    return ">=0.65"


def resolve_age_band(age: float) -> str:
    if age <= 18:
        return "15-18"
    if age <= 21:
        return "19-21"
    if age <= 24:
        return "22-24"
    if age <= 27:
        return "25-27"
    if age <= 30:
        return "28-30"
    if age <= 33:
        return "31-33"
    if age <= 36:
        return "34-36"
    if age <= 39:
        return "37-39"
    return "40+"


def resolve_absence_band(absences: int) -> str:
    if absences <= 0:
        return "0"
    if absences <= 2:
        return "1-2"
    if absences <= 5:
        return "3-5"
    return "6+"


def resolve_result_class(division: str, wins: int, losses: int, absences: int) -> str:
    scheduled = BOUTS_BY_DIVISION.get(division, 7)
    if absences >= scheduled:
        return "FULL_KYUJO"
    diff = wins - (losses + absences)
    if diff > 0:
        return "KK"
    if diff == 0:
        return "EVEN"
    if diff >= -2:
        return "MK_LIGHT"
    return "MK_HEAVY"


def basho_code_to_index(basho_code: str) -> int:
    year = int(basho_code[:4])
    month = int(basho_code[4:])
    return year * 6 + BASHO_MONTH_INDEX[month]


def parse_era_basho_code(raw: str | None) -> str | None:
    if not raw:
        return None
    text = str(raw).strip()
    if len(text) == 6 and text.isdigit():
        return text
    if not text.startswith("平成") or "年" not in text or "月" not in text:
        return None
    year_text, rest = text[2:].split("年", 1)
    month_text = rest.replace("月", "")
    era_year = 1 if year_text == "元" else int(year_text)
    gregorian_year = 1988 + era_year
    return f"{gregorian_year}{int(month_text):02d}"


def estimate_age(debut_basho: str, current_basho: str, assumed_entry_age: float = 15.0) -> float:
    elapsed = max(0, basho_code_to_index(current_basho) - basho_code_to_index(debut_basho))
    return assumed_entry_age + elapsed / 6.0


def resolve_rank_band(division: str, rank_name: str | None, rank_number: int | None) -> str:
    number = int(rank_number or 1)
    if division == "Makuuchi":
        if rank_name in ("横綱", "大関"):
            return "Y/O"
        if rank_name in ("関脇", "小結"):
            return "S/K"
        if number <= 5:
            return "1-5"
        if number <= 10:
            return "6-10"
        return "11+"
    if division == "Juryo":
        if number <= 3:
            return "1-3"
        if number <= 7:
            return "4-7"
        if number <= 11:
            return "8-11"
        return "12-14"
    if division == "Makushita":
        if number <= 5:
            return "1-5"
        if number <= 15:
            return "6-15"
        if number <= 30:
            return "16-30"
        if number <= 45:
            return "31-45"
        return "46+"
    if division == "Sandanme":
        if number <= 10:
            return "1-10"
        if number <= 30:
            return "11-30"
        if number <= 60:
            return "31-60"
        if number <= 90:
            return "61-90"
        return "91+"
    if division == "Jonidan":
        if number <= 20:
            return "1-20"
        if number <= 50:
            return "21-50"
        if number <= 100:
            return "51-100"
        if number <= 150:
            return "101-150"
        return "151+"
    if number <= 10:
        return "1-10"
    if number <= 20:
        return "11-20"
    if number <= 30:
        return "21-30"
    return "31+"


def normalize_division_name(raw: str | None) -> str | None:
    if not raw:
        return None
    return DIVISION_NAME_MAP.get(str(raw).strip())


def gaussian_bucket_probs(categories: list[str], center_index: float, sigma: float) -> dict[str, float]:
    weights = []
    for index, _ in enumerate(categories):
        exponent = -((index - center_index) ** 2) / max(0.0001, 2 * sigma * sigma)
        weights.append(math.exp(exponent))
    total = sum(weights) or 1.0
    return {category: weight / total for category, weight in zip(categories, weights)}


def recipe_profiles(recipe: dict) -> dict[str, dict[str, float]]:
    tier_score = {"S": 2.2, "A": 1.15, "B": 0.0, "C": -1.05, "D": -2.0}[recipe["aptitudeTier"]]
    band_score = {"ELITE": 2.45, "STRONG": 1.15, "STANDARD": 0.0, "GRINDER": -0.85, "WASHOUT": -1.9}[recipe["careerBand"]]
    profile_score = {"EARLY_EXIT": -0.95, "STANDARD": 0.0, "IRONMAN": 0.95}[recipe["retirementProfile"]]
    rise_score = {1: 0.7, 2: 0.0, 3: -0.45}[recipe["riseBand"]]

    power_score = tier_score * 0.72 + band_score * 0.88 + rise_score * 0.28
    longevity_score = tier_score * 0.22 + band_score * 0.38 + profile_score * 0.95 + rise_score * 0.12
    win_score = tier_score * 0.66 + band_score * 0.72 + rise_score * 0.12

    highest_center = clamp(3.0 + power_score * 1.18 + longevity_score * 0.24, 0.0, len(RANK_ORDER) - 1)
    career_center = clamp(3.0 + longevity_score * 1.05 + power_score * 0.18, 0.0, len(CAREER_BASHO_BUCKETS) - 1)
    win_center = clamp(3.4 + win_score * 0.92 + longevity_score * 0.06, 0.0, len(WIN_RATE_BUCKETS) - 1)

    return {
        "highestRank": gaussian_bucket_probs(RANK_ORDER, highest_center, 1.15),
        "careerBasho": gaussian_bucket_probs(CAREER_BASHO_BUCKETS, career_center, 1.05),
        "careerWinRate": gaussian_bucket_probs(WIN_RATE_BUCKETS, win_center, 0.95),
    }


def normalize_distribution(counter: dict[str, int]) -> dict[str, float]:
    total = sum(counter.values()) or 1
    return {key: value / total for key, value in counter.items()}


def build_seed_mix(con: sqlite3.Connection) -> tuple[list[dict], dict]:
    rows = con.execute(
        """
        SELECT
            highest_rank_name,
            career_bashos,
            career_wins,
            career_losses
        FROM rikishi_summary
        WHERE cohort = 'heisei_debut'
          AND status = 'ok'
        """
    ).fetchall()
    rank_target = defaultdict(int)
    career_target = defaultdict(int)
    win_target = defaultdict(int)
    for highest_rank_name, career_bashos, career_wins, career_losses in rows:
        rank_target[str(highest_rank_name or "序ノ口")] += 1
        career_target[bucket_career_bashos(int(career_bashos or 0))] += 1
        total = int(career_wins or 0) + int(career_losses or 0)
        win_rate = (int(career_wins or 0) / total) if total > 0 else 0.5
        win_target[bucket_win_rate(win_rate)] += 1

    target_rank = normalize_distribution(rank_target)
    target_career = normalize_distribution(career_target)
    target_win = normalize_distribution(win_target)

    recipes = []
    for aptitude_tier in APTITUDE_TIERS:
        for career_band in CAREER_BANDS:
            for retirement_profile in RETIREMENT_PROFILES:
                for rise_band in RISE_BANDS:
                    recipe = {
                        "id": f"{aptitude_tier}-{career_band}-{retirement_profile}-{rise_band}",
                        "aptitudeTier": aptitude_tier,
                        "careerBand": career_band,
                        "retirementProfile": retirement_profile,
                        "riseBand": rise_band,
                    }
                    recipe["profiles"] = recipe_profiles(recipe)
                    recipe["logWeight"] = math.log(
                        {"S": 1, "A": 12, "B": 55, "C": 22, "D": 10}[aptitude_tier]
                    ) + math.log(
                        {"ELITE": 4, "STRONG": 14, "STANDARD": 38, "GRINDER": 28, "WASHOUT": 16}[career_band]
                    ) + math.log(
                        {"EARLY_EXIT": 9, "STANDARD": 82, "IRONMAN": 9}[retirement_profile]
                    ) + math.log(
                        {1: 16, 2: 34, 3: 50}[rise_band]
                    )
                    recipes.append(recipe)

    learning_rate = 0.9
    for _ in range(320):
        weights = [math.exp(recipe["logWeight"]) for recipe in recipes]
        total_weight = sum(weights) or 1.0
        rank_pred = {key: 0.0 for key in RANK_ORDER}
        career_pred = {key: 0.0 for key in CAREER_BASHO_BUCKETS}
        win_pred = {key: 0.0 for key in WIN_RATE_BUCKETS}
        for recipe, weight in zip(recipes, weights):
            scaled = weight / total_weight
            for key, value in recipe["profiles"]["highestRank"].items():
                rank_pred[key] += scaled * value
            for key, value in recipe["profiles"]["careerBasho"].items():
                career_pred[key] += scaled * value
            for key, value in recipe["profiles"]["careerWinRate"].items():
                win_pred[key] += scaled * value

        for recipe in recipes:
            delta = 0.0
            for key, value in recipe["profiles"]["highestRank"].items():
                delta += (target_rank.get(key, 0.0) - rank_pred.get(key, 0.0)) * value * 2.0
            for key, value in recipe["profiles"]["careerBasho"].items():
                delta += (target_career.get(key, 0.0) - career_pred.get(key, 0.0)) * value * 1.5
            for key, value in recipe["profiles"]["careerWinRate"].items():
                delta += (target_win.get(key, 0.0) - win_pred.get(key, 0.0)) * value * 1.4
            recipe["logWeight"] += delta * learning_rate
        learning_rate *= 0.992

    raw_weights = [math.exp(recipe["logWeight"]) for recipe in recipes]
    total_weight = sum(raw_weights) or 1.0
    seed_mix = []
    for recipe, weight in zip(recipes, raw_weights):
        normalized = weight / total_weight
        if normalized < 0.00035:
            continue
        seed_mix.append(
            {
                "id": recipe["id"],
                "aptitudeTier": recipe["aptitudeTier"],
                "careerBand": recipe["careerBand"],
                "retirementProfile": recipe["retirementProfile"],
                "riseBand": recipe["riseBand"],
                "weight": round_num(normalized, 8),
            }
        )
    seed_total = sum(item["weight"] for item in seed_mix) or 1.0
    for item in seed_mix:
        item["weight"] = round_num(item["weight"] / seed_total, 8)

    fit_summary = {
        "targetHighestRank": target_rank,
        "targetCareerBasho": target_career,
        "targetCareerWinRate": target_win,
    }
    return seed_mix, fit_summary


def build_division_age_profiles(con: sqlite3.Connection) -> dict[str, dict]:
    rows = con.execute(
        """
        SELECT
            rs.debut_basho,
            rbr.basho_code,
            rbr.division
        FROM rikishi_summary rs
        JOIN rikishi_basho_record rbr
          ON rbr.rikishi_id = rs.rikishi_id
        WHERE rs.cohort = 'heisei_debut'
          AND rs.status = 'ok'
          AND rbr.parse_status = 'ok'
          AND rbr.basho_code <= ?
        """,
        (HEISEI_MAX_BASHO_CODE,),
    ).fetchall()
    values_by_division: dict[str, list[float]] = defaultdict(list)
    for debut_basho, basho_code, division in rows:
        normalized_debut = parse_era_basho_code(debut_basho)
        normalized_division = normalize_division_name(division)
        if not normalized_debut or not basho_code or not normalized_division:
            continue
        values_by_division[normalized_division].append(estimate_age(normalized_debut, str(basho_code)))

    profiles = {}
    for division in DIVISION_AGE_PROFILE_ORDER:
        if division == "Maezumo":
            profiles[division] = {
                "sampleSize": 3,
                "min": 15,
                "p10": 15,
                "p50": 18,
                "p90": 22,
                "max": 24,
            }
            continue
        values = values_by_division.get(division, [])
        if not values:
            continue
        profiles[division] = summarize_distribution(values)
    return profiles


def build_retirement_tables(con: sqlite3.Connection) -> tuple[dict[str, dict], dict[str, dict]]:
    rows = con.execute(
        """
        SELECT
            rs.rikishi_id,
            rs.debut_basho,
            rs.last_basho,
            rbr.basho_code,
            rbr.division,
            rbr.rank_name,
            rbr.rank_number,
            rbr.wins,
            rbr.losses,
            rbr.absences
        FROM rikishi_summary rs
        JOIN rikishi_basho_record rbr
          ON rbr.rikishi_id = rs.rikishi_id
        WHERE rs.cohort = 'heisei_debut'
          AND rs.status = 'ok'
          AND rbr.parse_status = 'ok'
          AND rbr.basho_code <= ?
        ORDER BY rs.rikishi_id, rbr.basho_code
        """,
        (HEISEI_MAX_BASHO_CODE,),
    ).fetchall()

    full_counts: dict[str, dict[str, int]] = defaultdict(lambda: {"sampleSize": 0, "retirements": 0})
    fallback_counts: dict[str, dict[str, dict[str, int]]] = {
        "dropFormerSekitori": defaultdict(lambda: {"sampleSize": 0, "retirements": 0}),
        "dropRankBand": defaultdict(lambda: {"sampleSize": 0, "retirements": 0}),
        "divisionAgeResult": defaultdict(lambda: {"sampleSize": 0, "retirements": 0}),
        "divisionOnly": defaultdict(lambda: {"sampleSize": 0, "retirements": 0}),
    }

    current_rikishi_id = None
    had_sekitori = False
    for row in rows:
        (
            rikishi_id,
            debut_basho,
            last_basho,
            basho_code,
            division,
            rank_name,
            rank_number,
            wins,
            losses,
            absences,
        ) = row
        if current_rikishi_id != rikishi_id:
            current_rikishi_id = rikishi_id
            had_sekitori = False
        normalized_debut = parse_era_basho_code(debut_basho)
        normalized_last_basho = parse_era_basho_code(last_basho) or (str(last_basho) if last_basho else None)
        if not normalized_debut or not normalized_last_basho:
            continue

        division = normalize_division_name(division)
        if not division:
            continue
        wins = int(wins or 0)
        losses = int(losses or 0)
        absences = int(absences or 0)
        age_band = resolve_age_band(estimate_age(normalized_debut, str(basho_code)))
        rank_band = resolve_rank_band(division, rank_name, rank_number)
        result_class = resolve_result_class(division, wins, losses, absences)
        absence_band = resolve_absence_band(absences)
        former_sekitori = had_sekitori or division in ("Makuuchi", "Juryo")
        retired = str(basho_code) == normalized_last_basho

        full_key = f"{division}|{rank_band}|{age_band}|{result_class}|{absence_band}|{1 if former_sekitori else 0}"
        drop_former_key = f"{division}|{rank_band}|{age_band}|{result_class}|{absence_band}"
        drop_rank_key = f"{division}|{age_band}|{result_class}|{absence_band}|{1 if former_sekitori else 0}"
        division_age_result_key = f"{division}|{age_band}|{result_class}"
        division_only_key = division

        full_counts[full_key]["sampleSize"] += 1
        fallback_counts["dropFormerSekitori"][drop_former_key]["sampleSize"] += 1
        fallback_counts["dropRankBand"][drop_rank_key]["sampleSize"] += 1
        fallback_counts["divisionAgeResult"][division_age_result_key]["sampleSize"] += 1
        fallback_counts["divisionOnly"][division_only_key]["sampleSize"] += 1
        if retired:
            full_counts[full_key]["retirements"] += 1
            fallback_counts["dropFormerSekitori"][drop_former_key]["retirements"] += 1
            fallback_counts["dropRankBand"][drop_rank_key]["retirements"] += 1
            fallback_counts["divisionAgeResult"][division_age_result_key]["retirements"] += 1
            fallback_counts["divisionOnly"][division_only_key]["retirements"] += 1

        if division in ("Makuuchi", "Juryo"):
            had_sekitori = True

    hazard_by_state = {}
    for key, value in full_counts.items():
        hazard_by_state[key] = {
            "sampleSize": value["sampleSize"],
            "retirements": value["retirements"],
            "hazard": round_num(value["retirements"] / max(1, value["sampleSize"]), 8),
        }

    fallbacks = {}
    for level, rows_by_key in fallback_counts.items():
        fallbacks[level] = {}
        for key, value in rows_by_key.items():
            fallbacks[level][key] = {
                "sampleSize": value["sampleSize"],
                "retirements": value["retirements"],
                "hazard": round_num(value["retirements"] / max(1, value["sampleSize"]), 8),
            }
    return hazard_by_state, fallbacks


def main() -> None:
    con = sqlite3.connect(DB_PATH)
    seed_mix, fit_summary = build_seed_mix(con)
    division_age_profile = build_division_age_profiles(con)
    hazard_by_state, fallbacks = build_retirement_tables(con)
    sample_size = con.execute(
        """
        SELECT COUNT(*)
        FROM rikishi_summary
        WHERE cohort = 'heisei_debut'
          AND status = 'ok'
        """
    ).fetchone()[0]
    con.close()

    payload = {
        "meta": {
            "generatedAt": iso_now(),
            "source": "sumodb.sqlite",
            "era": "heisei_debut",
            "cohort": "heisei_debut",
            "sampleSize": int(sample_size or 0),
            "sampleSizeThreshold": SAMPLE_SIZE_THRESHOLD,
        },
        "npcSeedMix": seed_mix,
        "retirementHazardByState": hazard_by_state,
        "retirementFallbacks": fallbacks,
        "divisionAgeProfile": division_age_profile,
        "fitSummary": fit_summary,
    }
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"written: {OUT_PATH}")


if __name__ == "__main__":
    main()
