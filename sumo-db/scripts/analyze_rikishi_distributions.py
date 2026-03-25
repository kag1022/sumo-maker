import re
import json
import sqlite3
import unicodedata
from pathlib import Path
from statistics import median

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "sumodb.sqlite"
OUT_DIR = ROOT / "data" / "analysis"
OUT_DIR.mkdir(parents=True, exist_ok=True)

MIN_DEBUT_YEAR = 1965

RANK_ORDER = {
    "横綱": 0,
    "大関": 1,
    "関脇": 2,
    "小結": 3,
    "前頭": 4,
    "十両": 5,
    "幕下": 6,
    "三段目": 7,
    "序二段": 8,
    "序ノ口": 9,
}


def normalize_line(line) -> str:
    if line is None:
        return ""

    # pandas の NaN 対策
    if pd.isna(line):
        return ""

    return unicodedata.normalize("NFKC", str(line)).strip()


def era_year_to_western(era_name: str, era_year_str: str) -> int:
    era_year = 1 if era_year_str == "元" else int(era_year_str)

    if era_name == "昭和":
        return 1925 + era_year
    if era_name == "平成":
        return 1988 + era_year
    if era_name == "令和":
        return 2018 + era_year

    raise ValueError(f"unknown era: {era_name}")


def parse_basho_western_year(basho_str) -> int | None:
    s = normalize_line(basho_str)
    if not s:
        return None

    m = re.match(r"^(昭和|平成|令和)([0-9元]+)年([0-9]+)月$", s)
    if not m:
        return None

    return era_year_to_western(m.group(1), m.group(2))


def calc_win_rate(wins: int | None, losses: int | None) -> float | None:
    if wins is None or losses is None:
        return None
    total = wins + losses
    if total <= 0:
        return None
    return wins / total


def bucket_win_rate(win_rate: float | None) -> str | None:
    if win_rate is None:
        return None

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


def bucket_career_bashos(career_bashos: int | None) -> str | None:
    if career_bashos is None:
        return None

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


def rank_sort_key(rank_name: str | None) -> int:
    if rank_name is None:
        return 999
    return RANK_ORDER.get(rank_name, 999)


def build_highest_rank_distribution(df: pd.DataFrame) -> list[dict]:
    vc = (
        df["highest_rank_name"]
        .fillna("不明")
        .value_counts(dropna=False)
    )

    total = int(vc.sum())
    rows = []
    for rank_name, count in vc.items():
        rows.append({
            "rank_name": rank_name,
            "count": int(count),
            "ratio": round(float(count) / total, 6) if total > 0 else 0.0,
        })

    rows.sort(key=lambda x: rank_sort_key(x["rank_name"]))
    return rows


def build_bucket_distribution(series: pd.Series) -> list[dict]:
    vc = series.dropna().value_counts()
    total = int(vc.sum())
    rows = []
    for bucket, count in vc.items():
        rows.append({
            "bucket": bucket,
            "count": int(count),
            "ratio": round(float(count) / total, 6) if total > 0 else 0.0,
        })
    return rows


def main():
    con = sqlite3.connect(DB_PATH)

    df = pd.read_sql_query("""
    SELECT
        rikishi_id,
        shikona,
        highest_rank_name,
        debut_basho,
        last_basho,
        career_wins,
        career_losses,
        career_absences,
        career_appearances,
        career_bashos,
        status
    FROM rikishi_summary
    WHERE status = 'ok'
    """, con)

    con.close()

    if df.empty:
        print("rikishi_summary に status='ok' のデータがありません。")
        return

    # 初土俵西暦
    df["debut_year"] = df["debut_basho"].apply(parse_basho_western_year)
    df["last_year"] = df["last_basho"].apply(parse_basho_western_year)

    # 1965年以降に絞る
    df = df[df["debut_year"].notna()]
    df = df[df["debut_year"] >= MIN_DEBUT_YEAR].copy()

    if df.empty:
        print(f"初土俵が {MIN_DEBUT_YEAR} 年以降のデータがありません。")
        return

    # 勝率
    df["win_rate"] = df.apply(
        lambda row: calc_win_rate(row["career_wins"], row["career_losses"]),
        axis=1
    )
    df["win_rate_bucket"] = df["win_rate"].apply(bucket_win_rate)

    # 在位場所数バケット
    df["career_bashos_bucket"] = df["career_bashos"].apply(bucket_career_bashos)

    # 引退年数の粗い指標
    df["career_year_span"] = df.apply(
        lambda row: (row["last_year"] - row["debut_year"]) if pd.notna(row["last_year"]) and pd.notna(row["debut_year"]) else None,
        axis=1
    )

    # 低勝率長寿フラグ
    df["is_low_win_long_career"] = df.apply(
        lambda row: bool(
            row["win_rate"] is not None and
            pd.notna(row["win_rate"]) and
            row["win_rate"] < 0.45 and
            pd.notna(row["career_bashos"]) and
            row["career_bashos"] >= 60
        ),
        axis=1
    )

    # 基本統計
    valid_win_rates = [float(x) for x in df["win_rate"].dropna().tolist()]
    valid_bashos = [int(x) for x in df["career_bashos"].dropna().tolist()]

    summary = {
        "sample_size": int(len(df)),
        "min_debut_year": MIN_DEBUT_YEAR,
        "win_rate": {
            "mean": round(sum(valid_win_rates) / len(valid_win_rates), 6) if valid_win_rates else None,
            "median": round(float(median(valid_win_rates)), 6) if valid_win_rates else None,
            "min": round(min(valid_win_rates), 6) if valid_win_rates else None,
            "max": round(max(valid_win_rates), 6) if valid_win_rates else None,
        },
        "career_bashos": {
            "mean": round(sum(valid_bashos) / len(valid_bashos), 3) if valid_bashos else None,
            "median": int(median(valid_bashos)) if valid_bashos else None,
            "min": min(valid_bashos) if valid_bashos else None,
            "max": max(valid_bashos) if valid_bashos else None,
        },
        "low_win_long_career_count": int(df["is_low_win_long_career"].sum()),
        "low_win_long_career_ratio": round(float(df["is_low_win_long_career"].mean()), 6),
    }

    win_rate_distribution = build_bucket_distribution(df["win_rate_bucket"])
    career_bashos_distribution = build_bucket_distribution(df["career_bashos_bucket"])
    highest_rank_distribution = build_highest_rank_distribution(df)

    # CSV 出力用の人別表
    export_df = df[[
        "rikishi_id",
        "shikona",
        "highest_rank_name",
        "debut_basho",
        "last_basho",
        "debut_year",
        "last_year",
        "career_wins",
        "career_losses",
        "career_absences",
        "career_appearances",
        "career_bashos",
        "win_rate",
        "win_rate_bucket",
        "career_bashos_bucket",
        "career_year_span",
        "is_low_win_long_career",
    ]].copy()

    export_df.to_csv(
        OUT_DIR / "rikishi_distribution_summary.csv",
        index=False,
        encoding="utf-8-sig"
    )

    pd.DataFrame(highest_rank_distribution).to_csv(
        OUT_DIR / "highest_rank_distribution.csv",
        index=False,
        encoding="utf-8-sig"
    )

    game_balance = {
        "meta": {
            "source": "rikishi_summary",
            "min_debut_year": MIN_DEBUT_YEAR,
            "sample_size": int(len(df)),
        },
        "summary": summary,
        "win_rate_distribution": win_rate_distribution,
        "career_bashos_distribution": career_bashos_distribution,
        "highest_rank_distribution": highest_rank_distribution,
    }

    with open(OUT_DIR / "game_balance_basic.json", "w", encoding="utf-8") as f:
        json.dump(game_balance, f, ensure_ascii=False, indent=2)

    print("完了")
    print(f"sample_size={len(df)}")
    print(f"output_dir={OUT_DIR}")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()