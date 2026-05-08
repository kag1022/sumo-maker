"""番付遷移確率モデル。

marginal, byWinLoss, byRecord の3層遷移テーブルを構築する。
"""

from collections import Counter, defaultdict


def top_payload(counter: Counter, top_n: int = 10) -> dict:
    total = sum(counter.values())
    top = [
        {"to": to_label, "n": n, "p": round(n / total, 6)}
        for to_label, n in counter.most_common(top_n)
    ]
    return {"total": total, "top": top}


def build_transitions(
    rikishi_timeline: dict[int, list[tuple[str, str]]],
    record_index: dict[int, dict[str, dict]],
    next_basho_id_fn,
    top_n: int = 10,
) -> tuple[dict, int, int, int]:
    """遷移テーブルを構築する。

    Args:
      rikishi_timeline: {rikishi_id: [(basho_code, banzuke_label), ...]}
      record_index: {rikishi_id: {basho_code: {wins, losses, absences}}}
      next_basho_id_fn: 次の本場所IDを返す関数
      top_n: Top-N の N

    Returns:
      (transitions, total_marginal, total_record, skipped_nonconsec)
    """
    marginal: dict[str, Counter] = defaultdict(Counter)
    by_winloss: dict[str, dict[tuple[int, int], Counter]] = defaultdict(
        lambda: defaultdict(Counter)
    )
    by_record: dict[str, dict[tuple[int, int, int], Counter]] = defaultdict(
        lambda: defaultdict(Counter)
    )
    total_marginal = 0
    total_record = 0
    skipped_nonconsec = 0

    for rid, timeline in rikishi_timeline.items():
        timeline.sort(key=lambda x: x[0])
        for i in range(1, len(timeline)):
            prev_code, prev_label = timeline[i - 1]
            curr_code, curr_label = timeline[i]
            if curr_code != next_basho_id_fn(prev_code):
                skipped_nonconsec += 1
                continue

            marginal[prev_label][curr_label] += 1
            total_marginal += 1

            rec_entry = (record_index.get(rid) or {}).get(prev_code)
            if rec_entry is None:
                continue

            w = rec_entry["wins"]
            l = rec_entry["losses"]
            a = rec_entry["absences"]

            by_winloss[prev_label][(w, l)][curr_label] += 1
            by_record[prev_label][(w, l, a)][curr_label] += 1
            total_record += 1

    # 出力形式に整形
    transitions: dict[str, dict] = {}
    all_labels = set(marginal) | set(by_winloss) | set(by_record)

    for label in sorted(all_labels):
        entry: dict = {}
        if label in marginal:
            entry["marginal"] = top_payload(marginal[label], top_n)
        if label in by_winloss:
            entry["byWinLoss"] = {
                f"{w}-{l}": top_payload(ctr, top_n)
                for (w, l), ctr in sorted(by_winloss[label].items())
            }
        if label in by_record:
            entry["byRecord"] = {
                f"{w}-{l}-{a}": top_payload(ctr, top_n)
                for (w, l, a), ctr in sorted(by_record[label].items())
            }
        transitions[label] = entry

    return transitions, total_marginal, total_record, skipped_nonconsec
