import re
import sqlite3
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "sumodb.sqlite"
MIN_DEBUT_YEAR = 1965

def normalize_line(line: str) -> str:
    s = unicodedata.normalize("NFKC", line)
    return s.strip()

def era_year_to_western(era_name: str, era_year_str: str) -> int:
    era_year = 1 if era_year_str == "元" else int(era_year_str)
    if era_name == "昭和":
        return 1925 + era_year
    if era_name == "平成":
        return 1988 + era_year
    if era_name == "令和":
        return 2018 + era_year
    raise ValueError(era_name)

def parse_basho_western_year(basho_str):
    if not basho_str:
        return None
    s = normalize_line(basho_str)
    m = re.match(r"^(昭和|平成|令和)([0-9元]+)年([0-9]+)月$", s)
    if not m:
        return None
    return era_year_to_western(m.group(1), m.group(2))

def main():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    cur.execute("""
    SELECT rikishi_id, shikona, debut_basho, highest_rank_name
    FROM rikishi_summary
    WHERE status = 'ok'
    ORDER BY rikishi_id
    """)

    selected = []
    for rikishi_id, shikona, debut_basho, highest_rank_name in cur.fetchall():
        year = parse_basho_western_year(debut_basho)
        if year is not None and year >= MIN_DEBUT_YEAR:
            selected.append((rikishi_id, shikona, debut_basho, highest_rank_name))

    print(f"selected_count={len(selected)}")
    print("first_20:")
    for row in selected[:20]:
        print(row)

    con.close()

if __name__ == "__main__":
    main()