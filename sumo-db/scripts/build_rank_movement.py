import sqlite3

from _paths import DB_PATH


def movement_label(steps: float) -> str:
    if abs(steps) < 1e-9:
        return "変動なし"
    if steps > 0:
        return f"+{steps:.1f}枚"
    return f"{steps:.1f}枚"


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
    for rikishi_id, items in by_rikishi.items():
        items.sort(key=lambda item: item["basho_code"])
        for index in range(1, len(items)):
            prev_row = items[index - 1]
            curr_row = items[index]
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

    cur.execute(
        """
        INSERT INTO etl_state(key, value, updated_at)
        VALUES ('rank_movement_last_build', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
            value=excluded.value,
            updated_at=CURRENT_TIMESTAMP
        """
    )

    con.commit()
    con.close()
    print(
        "rank_movement built: "
        f"rikishi={len(by_rikishi)} movements={movement_count} "
        f"source_rows_without_rikishi_id={missing_rikishi_id_rows}"
    )


if __name__ == "__main__":
    main()
