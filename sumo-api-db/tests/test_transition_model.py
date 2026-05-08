import sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
from sumo_api_data.transition_model import build_transitions, top_payload
from sumo_api_data.basho_ids import next_basho_id


def test_top_payload():
    c = Counter({"A": 3, "B": 2, "C": 1})
    result = top_payload(c, top_n=10)
    assert result["total"] == 6
    assert len(result["top"]) == 3
    assert result["top"][0] == {"to": "A", "n": 3, "p": 0.5}


def test_build_transitions_basic():
    timeline = {
        1: [("202401", "東前頭5枚目"), ("202403", "東前頭3枚目")],
        2: [("202401", "東前頭5枚目"), ("202403", "東前頭1枚目")],
    }
    records = {
        1: {"202401": {"wins": 10, "losses": 5, "absences": 0}},
        2: {"202401": {"wins": 8, "losses": 7, "absences": 0}},
    }
    transitions, total_m, total_r, skipped = build_transitions(
        timeline, records, next_basho_id, top_n=10,
    )
    assert total_m == 2
    assert total_r == 2
    assert "東前頭5枚目" in transitions
    entry = transitions["東前頭5枚目"]
    assert "marginal" in entry
    assert "byWinLoss" in entry
    assert "byRecord" in entry
    assert entry["byRecord"]["10-5-0"]["total"] == 1
    assert entry["byRecord"]["8-7-0"]["total"] == 1


def test_non_consecutive_skipped():
    timeline = {
        1: [("202401", "東前頭5枚目"), ("202405", "東前頭3枚目")],
    }
    records = {}
    transitions, total_m, total_r, skipped = build_transitions(
        timeline, records, next_basho_id, top_n=10,
    )
    assert total_m == 0
    assert skipped == 1
