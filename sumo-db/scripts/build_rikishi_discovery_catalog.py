import sqlite3

from _paths import DB_PATH

HEISEI_START_BASHO = "198901"
HEISEI_END_BASHO = "201903"
DISCOVERY_SOURCE = "heisei_banzuke"


def upsert_etl_state(cur: sqlite3.Cursor, key: str, value: str) -> None:
    cur.execute(
        """
        INSERT INTO etl_state(key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
            value=excluded.value,
            updated_at=CURRENT_TIMESTAMP
        """,
        (key, value),
    )


def main() -> None:
    con = sqlite3.connect(DB_PATH)
    try:
        cur = con.cursor()
        rows = cur.execute(
            """
            SELECT
                rikishi_id,
                MIN(basho_code) AS first_seen_basho_code,
                MAX(basho_code) AS last_seen_basho_code
            FROM basho_banzuke_entry
            WHERE rikishi_id IS NOT NULL
              AND basho_code BETWEEN ? AND ?
            GROUP BY rikishi_id
            ORDER BY first_seen_basho_code, rikishi_id
            """,
            (HEISEI_START_BASHO, HEISEI_END_BASHO),
        ).fetchall()

        inserted = 0
        updated = 0
        for rikishi_id, first_seen_basho_code, last_seen_basho_code in rows:
            exists = cur.execute(
                "SELECT 1 FROM rikishi_discovery_catalog WHERE rikishi_id = ?",
                (rikishi_id,),
            ).fetchone()
            cur.execute(
                """
                INSERT INTO rikishi_discovery_catalog (
                    rikishi_id,
                    discovery_source,
                    first_seen_basho_code,
                    last_seen_basho_code,
                    fetch_state,
                    cohort_state,
                    updated_at
                ) VALUES (?, ?, ?, ?, 'pending', 'unknown', CURRENT_TIMESTAMP)
                ON CONFLICT(rikishi_id) DO UPDATE SET
                    discovery_source=excluded.discovery_source,
                    first_seen_basho_code=excluded.first_seen_basho_code,
                    last_seen_basho_code=excluded.last_seen_basho_code,
                    updated_at=CURRENT_TIMESTAMP
                """,
                (
                    rikishi_id,
                    DISCOVERY_SOURCE,
                    first_seen_basho_code,
                    last_seen_basho_code,
                ),
            )
            if exists:
                updated += 1
            else:
                inserted += 1

        upsert_etl_state(cur, "heisei_discovery_catalog_last_build", HEISEI_END_BASHO)
        con.commit()
        print(
            f"rikishi_discovery_catalog built: total={len(rows)} inserted={inserted} updated={updated}"
        )
    finally:
        con.close()


if __name__ == "__main__":
    main()
