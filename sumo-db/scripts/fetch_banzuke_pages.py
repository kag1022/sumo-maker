import argparse
import hashlib
import re
import sqlite3
import time
from typing import Optional

import requests
from bs4 import BeautifulSoup, Tag

from _paths import DB_PATH, RAW_HTML_DIR

RAW_DIR = RAW_HTML_DIR / "banzuke"
RAW_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/146.0 Safari/537.36"
    )
}

DIVISION_ORDER = {
    "幕内": 0,
    "十両": 1,
    "幕下": 2,
    "三段目": 3,
    "序二段": 4,
    "序ノ口": 5,
}
DIVISION_NAMES = tuple(DIVISION_ORDER.keys())

RANK_ABBR_MAP = {
    "口": "序ノ口",
    "二": "序二段",
    "三": "三段目",
    "下": "幕下",
    "十": "十両",
    "前": "前頭",
    "小結": "小結",
    "関脇": "関脇",
    "大関": "大関",
    "横綱": "横綱",
}
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
SIDE_ORDER = {"東": 0, "西": 1}

RANK_BASE_OFFSET = {
    "横綱": 0.0,
    "大関": 1.0,
    "関脇": 2.0,
    "小結": 3.0,
    "前頭": 4.0,
    "十両": 21.0,
    "幕下": 35.0,
    "三段目": 95.0,
    "序二段": 195.0,
    "序ノ口": 295.0,
}

RANK_CELL_RE = re.compile(r"^(横綱|大関|関脇|小結|前|十|下|三|二|口)([0-9]+)?(張出)?$")
RIKISHI_HREF_RE = re.compile(r"Rikishi\.aspx\?r=([0-9]+)")


def parse_basho_code(basho_code: str) -> tuple[int, int]:
    return int(basho_code[:4]), int(basho_code[4:6])


def calc_basho_rank_value(basho_rank_index: int) -> float:
    return (basho_rank_index - 1) * 0.5


def calc_slot_rank_value(rank_name: str, rank_number: int, side: str) -> float:
    base = RANK_BASE_OFFSET[rank_name]
    side_offset = 0.0 if side == "東" else 0.5
    return base + (rank_number - 1) + side_offset


def parse_rank_cell(rank_text: str, implicit_rank_counts: dict[str, int]) -> dict:
    text = "".join(rank_text.split())
    match = RANK_CELL_RE.match(text)
    if not match:
        raise ValueError(f"unsupported rank cell: {rank_text}")

    rank_token = match.group(1)
    rank_name = RANK_ABBR_MAP[rank_token]
    explicit_number = match.group(2)
    is_haridashi = 1 if match.group(3) else 0

    if explicit_number is not None:
        rank_number = int(explicit_number)
        implicit_rank_counts[rank_name] = max(implicit_rank_counts.get(rank_name, 0), rank_number)
    else:
        rank_number = implicit_rank_counts.get(rank_name, 0) + 1
        implicit_rank_counts[rank_name] = rank_number

    return {
        "rank_name": rank_name,
        "rank_number": rank_number,
        "is_haridashi": is_haridashi,
    }


def find_rikishi_cell(cells: list[Tag], reverse: bool = False) -> Optional[Tag]:
    sequence = reversed(cells) if reverse else cells
    for cell in sequence:
        if cell.find("a", href=RIKISHI_HREF_RE):
            return cell
    return None


def extract_rikishi_id(cell: Tag) -> Optional[int]:
    anchor = cell.find("a", href=RIKISHI_HREF_RE)
    if not anchor:
        return None

    match = RIKISHI_HREF_RE.search(anchor.get("href", ""))
    return int(match.group(1)) if match else None


def build_entry(
    basho_code: str,
    division: str,
    side: str,
    rank_meta: dict,
    rikishi_cell: Tag,
) -> dict:
    shikona = rikishi_cell.get_text(" ", strip=True) or None
    rank_name = rank_meta["rank_name"]
    rank_number = rank_meta["rank_number"]
    is_haridashi = rank_meta["is_haridashi"]

    banzuke_label = f"{side}{rank_name}{rank_number}枚目"
    if is_haridashi:
        banzuke_label += "張出"

    raw_line = f"{basho_code} {division} {banzuke_label} {shikona or ''}".strip()

    return {
        "rikishi_id": extract_rikishi_id(rikishi_cell),
        "division": division,
        "side": side,
        "rank_name": rank_name,
        "rank_number": rank_number,
        "is_haridashi": is_haridashi,
        "banzuke_label": banzuke_label,
        "shikona": shikona,
        "raw_line": raw_line,
    }


def parse_division_table(basho_code: str, division: str, table: Tag) -> list[dict]:
    entries: list[dict] = []
    implicit_rank_counts: dict[str, int] = {}

    for row in table.find_all("tr"):
        cells = row.find_all("td", recursive=False)
        if not cells:
            continue

        rank_cell = row.find("td", class_="short_rank")
        if rank_cell is None:
            continue

        rank_index = cells.index(rank_cell)
        left_cells = cells[:rank_index]
        right_cells = cells[rank_index + 1 :]

        rank_meta = parse_rank_cell(rank_cell.get_text(" ", strip=True), implicit_rank_counts)

        east_cell = find_rikishi_cell(left_cells, reverse=True)
        if east_cell is not None:
            entries.append(build_entry(basho_code, division, "東", rank_meta, east_cell))

        west_cell = find_rikishi_cell(right_cells, reverse=False)
        if west_cell is not None:
            entries.append(build_entry(basho_code, division, "西", rank_meta, west_cell))

    return entries


def parse_banzuke_html(basho_code: str, html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    entries: list[dict] = []

    for table in soup.select("table.banzuke"):
        strings = list(table.stripped_strings)
        if not strings:
            continue

        division = strings[0]
        if division not in DIVISION_ORDER:
            continue

        entries.extend(parse_division_table(basho_code, division, table))

    entries.sort(
        key=lambda entry: (
            DIVISION_ORDER[entry["division"]],
            RANK_ORDER[entry["rank_name"]],
            entry["rank_number"],
            SIDE_ORDER[entry["side"]],
            entry["is_haridashi"],
        )
    )

    division_counts: dict[str, int] = {}
    for index, entry in enumerate(entries, start=1):
        division = entry["division"]
        division_counts[division] = division_counts.get(division, 0) + 1
        entry["basho_rank_index"] = index
        entry["division_rank_index"] = division_counts[division]
        entry["basho_rank_value"] = calc_basho_rank_value(index)
        entry["slot_rank_value"] = calc_slot_rank_value(
            entry["rank_name"], entry["rank_number"], entry["side"]
        )

    return entries


def upsert_basho_metadata(
    con: sqlite3.Connection,
    basho_code: str,
    source_url: str,
    raw_html_path: Optional[str],
    http_status: Optional[int],
    parse_status: str,
    error_message: Optional[str],
) -> None:
    year, month = parse_basho_code(basho_code)
    cur = con.cursor()
    cur.execute(
        """
        INSERT INTO basho_metadata (
            basho_code, basho_year, basho_month, source_url, raw_html_path,
            fetched_at, http_status, parse_status, error_message
        ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)
        ON CONFLICT(basho_code) DO UPDATE SET
            basho_year=excluded.basho_year,
            basho_month=excluded.basho_month,
            source_url=excluded.source_url,
            raw_html_path=excluded.raw_html_path,
            fetched_at=CURRENT_TIMESTAMP,
            http_status=excluded.http_status,
            parse_status=excluded.parse_status,
            error_message=excluded.error_message
        """,
        (
            basho_code,
            year,
            month,
            source_url,
            raw_html_path,
            http_status,
            parse_status,
            error_message,
        ),
    )


def replace_banzuke_entries(con: sqlite3.Connection, basho_code: str, entries: list[dict]) -> None:
    cur = con.cursor()
    cur.execute("DELETE FROM basho_banzuke_entry WHERE basho_code = ?", (basho_code,))
    for entry in entries:
        cur.execute(
            """
            INSERT INTO basho_banzuke_entry (
                basho_code, rikishi_id, division, basho_rank_index, division_rank_index,
                basho_rank_value, slot_rank_value,
                side, rank_name, rank_number, is_haridashi,
                banzuke_label, shikona, raw_line
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                basho_code,
                entry["rikishi_id"],
                entry["division"],
                entry["basho_rank_index"],
                entry["division_rank_index"],
                entry["basho_rank_value"],
                entry["slot_rank_value"],
                entry["side"],
                entry["rank_name"],
                entry["rank_number"],
                entry["is_haridashi"],
                entry["banzuke_label"],
                entry["shikona"],
                entry["raw_line"],
            ),
        )


def fetch_one(con: sqlite3.Connection, basho_code: str) -> None:
    url = f"https://sumodb.sumogames.de/Banzuke.aspx?l=j&b={basho_code}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        status_code = resp.status_code
        if status_code != 200:
            upsert_basho_metadata(con, basho_code, url, None, status_code, "http_error", f"HTTP {status_code}")
            con.commit()
            return

        resp.encoding = resp.apparent_encoding
        html = resp.text
        _ = hashlib.sha256(html.encode("utf-8")).hexdigest()

        raw_path = RAW_DIR / f"banzuke_{basho_code}.html"
        raw_path.write_text(html, encoding="utf-8")

        entries = parse_banzuke_html(basho_code, html)
        parse_status = "ok" if entries else "parse_error"
        error_message = None if entries else "番付行が抽出できない"

        upsert_basho_metadata(con, basho_code, url, str(raw_path), status_code, parse_status, error_message)
        if entries:
            replace_banzuke_entries(con, basho_code, entries)

        con.commit()
    except Exception as exc:
        upsert_basho_metadata(con, basho_code, url, None, None, "error", str(exc))
        con.commit()


def generate_heisei_basho_codes(start_year: int = 1989, end_year: int = 2019) -> list[str]:
    basho_codes: list[str] = []
    for year in range(start_year, end_year + 1):
        months = [1, 3, 5, 7, 9, 11]
        if year == 2019:
            months = [1, 3]
        for month in months:
            basho_codes.append(f"{year}{month:02d}")
    return basho_codes


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="平成番付を rikishi_id 付きで取得する")
    parser.add_argument(
        "--from-start",
        action="store_true",
        help="etl_state を無視して最初から再取得する",
    )
    parser.add_argument(
        "--only-basho",
        type=str,
        default=None,
        help="単一場所だけ再取得する。例: 201901",
    )
    parser.add_argument(
        "--sleep-seconds",
        type=float,
        default=2.0,
        help="各リクエスト間隔",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    basho_codes = generate_heisei_basho_codes()
    if args.only_basho:
        basho_codes = [args.only_basho]

    print(f"対象場所数: {len(basho_codes)}")
    print(f"先頭5件: {basho_codes[:5]}")
    print(f"末尾5件: {basho_codes[-5:]}")

    con = sqlite3.connect(DB_PATH)
    try:
        cur = con.cursor()
        cur.execute("SELECT value FROM etl_state WHERE key = 'last_heisei_banzuke_code'")
        row = cur.fetchone()
        last_done = row[0] if row else None

        start_index = 0
        if not args.from_start and last_done and last_done in basho_codes:
            start_index = basho_codes.index(last_done) + 1

        for basho_code in basho_codes[start_index:]:
            print(f"[banzuke] {basho_code}")
            fetch_one(con, basho_code)

            cur.execute(
                """
                INSERT INTO etl_state(key, value, updated_at)
                VALUES ('last_heisei_banzuke_code', ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET
                    value=excluded.value,
                    updated_at=CURRENT_TIMESTAMP
                """,
                (basho_code,),
            )
            con.commit()

            time.sleep(args.sleep_seconds)
    finally:
        con.close()


if __name__ == "__main__":
    main()
