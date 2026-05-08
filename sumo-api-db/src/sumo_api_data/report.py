"""レポート・サマリ生成ユーティリティ。"""

from datetime import datetime, timezone


def iso_now() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def transition_summary(transitions: dict) -> dict:
    """遷移テーブルのサマリ統計。"""
    total_labels = len(transitions)
    with_marginal = sum(1 for v in transitions.values() if "marginal" in v)
    with_wl = sum(1 for v in transitions.values() if "byWinLoss" in v)
    with_rec = sum(1 for v in transitions.values() if "byRecord" in v)
    total_marginal_samples = sum(
        v["marginal"]["total"] for v in transitions.values() if "marginal" in v
    )
    total_record_samples = sum(
        v["byRecord"].get("total", sum(e["total"] for e in v["byRecord"].values()))
        if isinstance(v.get("byRecord"), dict) and "total" not in v.get("byRecord", {})
        else v.get("byRecord", {}).get("total", 0)
        for v in transitions.values()
    )
    return {
        "uniqueFromLabels": total_labels,
        "withMarginal": with_marginal,
        "withWinLoss": with_wl,
        "withRecord": with_rec,
        "marginalSamples": total_marginal_samples,
    }
