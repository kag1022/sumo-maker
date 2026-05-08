import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
from sumo_api_data.basho_ids import generate_basho_ids


def test_first_is_196007():
    ids = generate_basho_ids(1960, 7, 2026, 3)
    assert ids[0] == "196007"


def test_last_is_202603():
    ids = generate_basho_ids(1960, 7, 2026, 3)
    assert ids[-1] == "202603"


def test_excludes_196005():
    ids = generate_basho_ids(1960, 7, 2026, 3)
    assert "196005" not in ids
    assert "196001" not in ids
    assert "196003" not in ids


def test_excludes_202605():
    ids = generate_basho_ids(1960, 7, 2026, 3)
    assert "202605" not in ids
    assert "202607" not in ids


def test_only_honbasho_months():
    ids = generate_basho_ids(1960, 7, 2026, 3)
    for bid in ids:
        month = int(bid[4:])
        assert month in (1, 3, 5, 7, 9, 11), f"{bid} has invalid month {month}"


def test_count_is_395():
    ids = generate_basho_ids(1960, 7, 2026, 3)
    # 1960: 3 (7,9,11) + 1961-2025: 65*6=390 + 2026: 2 (1,3) = 395
    assert len(ids) == 395
