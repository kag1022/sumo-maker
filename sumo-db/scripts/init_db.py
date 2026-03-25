import argparse
import sqlite3
from pathlib import Path

from _paths import DB_PATH, ROOT

SCHEMA_PATH = ROOT / "schema.sql"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="sumo-db を初期化する")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="既存 DB を削除してから再作成する",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if args.reset and DB_PATH.exists():
        DB_PATH.unlink()
        print(f"Removed DB: {DB_PATH}")

    con = sqlite3.connect(DB_PATH)
    try:
        con.executescript(schema_sql)
        con.commit()
        print(f"Initialized DB: {DB_PATH}")
    finally:
        con.close()


if __name__ == "__main__":
    main()
