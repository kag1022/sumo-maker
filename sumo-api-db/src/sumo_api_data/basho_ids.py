"""basho ID の生成・検証ユーティリティ。"""

OFFICIAL_MONTHS = (1, 3, 5, 7, 9, 11)


def generate_basho_ids(
    start_year: int, start_month: int,
    end_year: int, end_month: int,
) -> list[str]:
    """指定範囲の本場所 ID リストを生成する。"""
    ids = []
    for y in range(start_year, end_year + 1):
        for m in OFFICIAL_MONTHS:
            if y == start_year and m < start_month:
                continue
            if y == end_year and m > end_month:
                continue
            ids.append(f"{y}{m:02d}")
    return ids


def next_basho_id(basho_id: str) -> str:
    """次の本場所 ID を返す。"""
    year = int(basho_id[:4])
    month = int(basho_id[4:])
    try:
        idx = OFFICIAL_MONTHS.index(month)
    except ValueError:
        return ""
    if idx == len(OFFICIAL_MONTHS) - 1:
        return f"{year + 1}{OFFICIAL_MONTHS[0]:02d}"
    return f"{year}{OFFICIAL_MONTHS[idx + 1]:02d}"
