import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
from sumo_api_data.normalize import (
    EN_TO_JA, SIDE_MAP, parse_api_rank, to_banzuke_label,
)


def test_east_to_ja():
    assert SIDE_MAP["East"] == "東"


def test_west_to_ja():
    assert SIDE_MAP["West"] == "西"


def test_yokozuna_to_ja():
    assert EN_TO_JA["Yokozuna"] == "横綱"


def test_maegashira_to_ja():
    assert EN_TO_JA["Maegashira"] == "前頭"


def test_juryo_to_ja():
    assert EN_TO_JA["Juryo"] == "十両"


def test_makushita_to_ja():
    assert EN_TO_JA["Makushita"] == "幕下"


def test_make_label():
    label = to_banzuke_label("Maegashira 5 East")
    assert label == "東前頭5枚目"


def test_make_label_yokozuna():
    label = to_banzuke_label("Yokozuna 1 East")
    assert label == "東横綱1枚目"


def test_make_label_west():
    label = to_banzuke_label("Juryo 12 West")
    assert label == "西十両12枚目"


def test_empty_rank_returns_none():
    assert to_banzuke_label("") is None
    assert to_banzuke_label("   ") is None
