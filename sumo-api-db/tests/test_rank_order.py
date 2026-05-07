import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
from sumo_api_data.normalize import RANK_ORDER, SIDE_ORDER


def test_yokozuna_above_ozeki():
    assert RANK_ORDER["横綱"] < RANK_ORDER["大関"]


def test_ozeki_above_sekiwake():
    assert RANK_ORDER["大関"] < RANK_ORDER["関脇"]


def test_east_above_west():
    assert SIDE_ORDER["東"] < SIDE_ORDER["西"]


def test_maegashira_order():
    assert RANK_ORDER["前頭"] < RANK_ORDER["十両"]
    assert RANK_ORDER["十両"] < RANK_ORDER["幕下"]
