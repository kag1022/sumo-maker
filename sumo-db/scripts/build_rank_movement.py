import sqlite3
from datetime import datetime, timezone

from _paths import DB_PATH

OFFICIAL_BASHO_MONTHS = (1, 3, 5, 7, 9, 11)


def movement_label(steps: float) -> str:
    if abs(steps) < 1e-9:
        return "変動なし"
    if steps > 0:
        return f"+{steps:.1f}枚"
    return f"{steps:.1f}枚"


def next_official_basho_code(basho_code: str) -> str:
    year = int(basho_code[:4])
    month = int(basho_code[4:])
    month_index = OFFICIAL_BASHO_MONTHS.index(month)
    if month_index == len(OFFICIAL_BASHO_MONTHS) - 1:
        return f"{year + 1}01"
    return f"{year}{OFFICIAL_BASHO_MONTHS[month_index + 1]:02d}"


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


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def main() -> None:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    cur.execute("DELETE FROM rank_movement")
    missing_rikishi_id_rows = cur.execute(
        "SELECT COUNT(*) FROM basho_banzuke_entry WHERE rikishi_id IS NULL"
    ).fetchone()[0]

    cur.execute(
        """
        SELECT
            rikishi_id,
            shikona,
            basho_code,
            division,
            banzuke_label,
            basho_rank_index,
            basho_rank_value,
            slot_rank_value
        FROM basho_banzuke_entry
        WHERE rikishi_id IS NOT NULL
        ORDER BY rikishi_id, basho_code
        """
    )
    rows = cur.fetchall()

    by_rikishi: dict[int, list[dict]] = {}
    for (
        rikishi_id,
        shikona,
        basho_code,
        division,
        banzuke_label,
        basho_rank_index,
        basho_rank_value,
        slot_rank_value,
    ) in rows:
        by_rikishi.setdefault(int(rikishi_id), []).append(
            {
                "shikona": shikona,
                "basho_code": basho_code,
                "division": division,
                "banzuke_label": banzuke_label,
                "basho_rank_index": basho_rank_index,
                "basho_rank_value": float(basho_rank_value),
                "slot_rank_value": float(slot_rank_value),
            }
        )

    movement_count = 0
    candidate_pair_count = 0
    skipped_non_consecutive_count = 0
    for rikishi_id, items in by_rikishi.items():
        items.sort(key=lambda item: item["basho_code"])
        for index in range(1, len(items)):
            prev_row = items[index - 1]
            curr_row = items[index]
            candidate_pair_count += 1
            if curr_row["basho_code"] != next_official_basho_code(prev_row["basho_code"]):
                skipped_non_consecutive_count += 1
                continue
            steps = prev_row["slot_rank_value"] - curr_row["slot_rank_value"]
            display_shikona = curr_row["shikona"] or prev_row["shikona"] or f"rikishi_{rikishi_id}"

            cur.execute(
                """
                INSERT INTO rank_movement (
                    rikishi_id,
                    shikona,
                    from_basho_code,
                    to_basho_code,
                    from_division,
                    to_division,
                    from_banzuke_label,
                    to_banzuke_label,
                    from_basho_rank_index,
                    to_basho_rank_index,
                    from_basho_rank_value,
                    to_basho_rank_value,
                    from_slot_rank_value,
                    to_slot_rank_value,
                    movement_steps,
                    movement_label
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    rikishi_id,
                    display_shikona,
                    prev_row["basho_code"],
                    curr_row["basho_code"],
                    prev_row["division"],
                    curr_row["division"],
                    prev_row["banzuke_label"],
                    curr_row["banzuke_label"],
                    prev_row["basho_rank_index"],
                    curr_row["basho_rank_index"],
                    prev_row["basho_rank_value"],
                    curr_row["basho_rank_value"],
                    prev_row["slot_rank_value"],
                    curr_row["slot_rank_value"],
                    steps,
                    movement_label(steps),
                ),
            )
            movement_count += 1

    upsert_etl_state(cur, "rank_movement_last_build", iso_now())
    upsert_etl_state(cur, "rank_movement_candidate_pairs", str(candidate_pair_count))
    upsert_etl_state(cur, "rank_movement_non_consecutive_pairs", str(skipped_non_consecutive_count))
    upsert_etl_state(cur, "rank_movement_consecutive_pairs", str(movement_count))

    con.commit()
    con.close()
    print(
        "rank_movement built: "
        f"rikishi={len(by_rikishi)} movements={movement_count} "
        f"candidate_pairs={candidate_pair_count} "
        f"skipped_non_consecutive={skipped_non_consecutive_count} "
        f"source_rows_without_rikishi_id={missing_rikishi_id_rows}"
    )


if __name__ == "__main__":
    main()
