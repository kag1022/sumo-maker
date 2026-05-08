import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
from sumo_api_data.records import parse_record


def test_8_7_is_kachikoshi():
    r = parse_record([{"result": "win"}]*8 + [{"result": "loss"}]*7)
    assert r["wins"] == 8
    assert r["losses"] == 7
    assert r["absences"] == 0


def test_7_8_is_makekoshi():
    r = parse_record([{"result": "win"}]*7 + [{"result": "loss"}]*8)
    assert r["wins"] == 7
    assert r["losses"] == 8
    assert r["absences"] == 0


def test_4_3_7day():
    r = parse_record([{"result": "win"}]*4 + [{"result": "loss"}]*3)
    assert r["wins"] == 4
    assert r["losses"] == 3


def test_3_4_7day():
    r = parse_record([{"result": "win"}]*3 + [{"result": "loss"}]*4)
    assert r["wins"] == 3
    assert r["losses"] == 4


def test_empty_record():
    r = parse_record([])
    assert r == {"wins": 0, "losses": 0, "absences": 0}


def test_fusen_as_absence():
    r = parse_record([
        {"result": "win"}, {"result": "loss"},
        {"result": "", "opponentID": 5}
    ])
    assert r["absences"] == 1
