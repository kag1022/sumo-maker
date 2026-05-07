"""取組 record からの W-L-A 集計。"""


def parse_record(record: list[dict]) -> dict[str, int]:
    """1場所分の record リストから {wins, losses, absences} を集計する。

    record の各要素:
      {"result": "win"|"loss"|"", "opponentID": int, "kimarite": str}
    """
    wins = 0
    losses = 0
    absences = 0
    if not record:
        return {"wins": 0, "losses": 0, "absences": 0}
    for r in record:
        result = r.get("result", "")
        if result == "win":
            wins += 1
        elif result == "loss":
            losses += 1
        elif result == "" and r.get("opponentID", 0) != 0:
            absences += 1
    return {"wins": wins, "losses": losses, "absences": absences}
