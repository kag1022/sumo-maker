"""rank の数値化・順序付け。"""

from .normalize import RANK_ORDER, SIDE_ORDER, parse_api_rank

# slot_rank_value の基準値（旧 sumo-db と互換）
RANK_BASE_OFFSET: dict[str, float] = {
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


def calc_slot_rank_value(ja_name: str, number: int, side: str) -> float:
    """番付ラベルから slot_rank_value を計算する。"""
    base = RANK_BASE_OFFSET.get(ja_name, 999.0)
    side_offset = 0.0 if side == "東" else 0.5
    return base + (number - 1) + side_offset


def rank_sort_key(label: str) -> tuple:
    """日本語ラベルのソートキー。"""
    p = parse_api_rank(label)
    if p is None:
        return (99, 0, 0)
    return (
        RANK_ORDER.get(p["ja_name"], 99),
        SIDE_ORDER.get(p["side"], 0),
        p["number"],
    )
