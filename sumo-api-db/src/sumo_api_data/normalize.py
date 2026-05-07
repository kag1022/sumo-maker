"""rank 文字列の正規化・日本語ラベル変換。"""

# API の英語 rank → 日本語 rank 名
EN_TO_JA: dict[str, str] = {
    "Yokozuna": "横綱",
    "Ozeki": "大関",
    "Sekiwake": "関脇",
    "Komusubi": "小結",
    "Maegashira": "前頭",
    "Juryo": "十両",
    "Makushita": "幕下",
    "Sandanme": "三段目",
    "Jonidan": "序二段",
    "Jonokuchi": "序ノ口",
}

SIDE_MAP: dict[str, str] = {
    "East": "東",
    "West": "西",
}

# 既知の division 名（APIレスポンスに含まれる値）
KNOWN_DIVISIONS = ["Makuuchi", "Juryo", "Makushita", "Sandanme", "Jonidan", "Jonokuchi"]

# rank 順序（数値が小さいほど上位）
RANK_ORDER: dict[str, int] = {
    "横綱": 0, "大関": 1, "関脇": 2, "小結": 3,
    "前頭": 4, "十両": 5, "幕下": 6, "三段目": 7,
    "序二段": 8, "序ノ口": 9,
}

SIDE_ORDER: dict[str, int] = {"東": 0, "西": 1}


def parse_api_rank(rank_str: str) -> dict | None:
    """API の "Yokozuna 1 East" 形式を {ja_name, number, side} に分解。"""
    if not rank_str or not rank_str.strip():
        return None
    parts = rank_str.strip().split()
    if len(parts) < 3:
        return None
    en_name = parts[0]
    number_part = parts[1]
    side_part = parts[2]
    if not number_part.isdigit():
        return None
    ja_name = EN_TO_JA.get(en_name)
    side = SIDE_MAP.get(side_part)
    if ja_name is None or side is None:
        return None
    return {"ja_name": ja_name, "number": int(number_part), "side": side}


def to_banzuke_label(rank_str: str) -> str | None:
    """API rank → 日本語番付ラベル "東横綱1枚目"."""
    p = parse_api_rank(rank_str)
    if p is None:
        return None
    return f"{p['side']}{p['ja_name']}{p['number']}枚目"


def rank_sort_key(label: str) -> tuple:
    """ラベルのソートキー。"""
    p = parse_api_rank(label)
    if p is None:
        return (99, 0, 0)
    return (
        RANK_ORDER.get(p["ja_name"], 99),
        SIDE_ORDER.get(p["side"], 0),
        p["number"],
    )
