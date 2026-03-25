import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "sumodb.sqlite"

def main():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    print("=== table counts ===")
    for table_name in [
        "rikishi_summary",
        "rikishi_source_page",
        "basho_metadata",
        "basho_banzuke_entry",
        "rank_movement",
        "etl_state",
    ]:
        cur.execute(f"SELECT COUNT(*) FROM {table_name}")
        print(table_name, cur.fetchone()[0])

    print("\n=== rikishi_summary sample ===")
    for row in cur.execute("""
    SELECT rikishi_id, shikona, highest_rank_name, career_wins, career_losses, career_bashos, status
    FROM rikishi_summary
    ORDER BY rikishi_id
    LIMIT 10
    """):
        print(row)

    print("\n=== basho_banzuke_entry sample ===")
    for row in cur.execute("""
    SELECT basho_code, division, basho_rank_index, banzuke_label, shikona
    FROM basho_banzuke_entry
    ORDER BY basho_code, basho_rank_index
    LIMIT 20
    """):
        print(row)

    print("\n=== rank_movement sample ===")
    for row in cur.execute("""
    SELECT shikona, from_basho_code, to_basho_code, from_banzuke_label, to_banzuke_label, movement_label
    FROM rank_movement
    ORDER BY shikona, from_basho_code
    LIMIT 20
    """):
        print(row)

    con.close()

if __name__ == "__main__":
    main()