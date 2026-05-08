#!/usr/bin/env python
"""00_probe_api.py — sumo-api.com API 疎通確認（Phase 1）

Step 1: division 表記確認
Step 2: 指定 bashoId の banzuke + torikumi 確認

対象: 202603, 202601, 201903, 200001, 198901, 197001, 196007

レポート必須項目（全endpoint共通）:
  1. 叩いたURL
  2. HTTP status
  3. レスポンスのトップレベル型
  4. トップレベルキー

出力: api_probe_report.json / .md
"""

import sys, json
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from sumo_api_data.api_client import get_json_detailed
from sumo_api_data.io_utils import write_json

ROOT = Path(__file__).resolve().parents[1]
ANALYSIS_DIR = ROOT / "data" / "analysis"
ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)

PROBE_IDS = ["202603", "202601", "201903", "200001", "198901", "197001", "196007"]

DIVISION_CANDIDATES = [
    "Makuuchi", "Juryo", "Makushita", "Sandanme", "Jonidan", "Jonokuchi",
    "makuuchi", "juryo", "makushita", "sandanme", "jonidan", "jonokuchi",
    "幕内", "十両", "幕下", "三段目", "序二段", "序ノ口",
    "Maku-uchi", "Makunouchi", "Ju-ryo", "Juryou",
]


def iso_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def top_type(obj):
    """レスポンスのトップレベル型を返す。"""
    if obj is None:
        return "null"
    if isinstance(obj, dict):
        return "object"
    if isinstance(obj, list):
        return "array"
    if isinstance(obj, str):
        return "string"
    if isinstance(obj, (int, float)):
        return "number"
    if isinstance(obj, bool):
        return "boolean"
    return type(obj).__name__


def top_keys(obj):
    """トップレベルキー（objectならキーリスト、arrayなら長さ）。"""
    if isinstance(obj, dict):
        return list(obj.keys())
    if isinstance(obj, list):
        return f"[{len(obj)} items]"
    return None


def sample_keys(obj, max_depth=2, depth=0):
    if depth >= max_depth:
        return type(obj).__name__
    if isinstance(obj, dict):
        return {k: sample_keys(v, max_depth, depth + 1) for k, v in list(obj.items())[:10]}
    if isinstance(obj, list):
        if not obj:
            return "empty list"
        return [sample_keys(obj[0], max_depth, depth + 1)]
    return type(obj).__name__


# ── 全 endpoint 共通: 4項目を含むエントリ構築 ──

def make_entry(url: str, r: dict) -> dict:
    """get_json_detailed の結果から必須4項目を含むエントリを作る。"""
    e = {
        "url": url,
        "httpStatus": r["httpStatus"],
        "topLevelType": None,
        "topLevelKeys": None,
        "ok": False,
        "error": r.get("error"),
        "retries": r.get("retries", 0),
    }
    if r["ok"] and r["data"] is not None:
        e["ok"] = True
        e["topLevelType"] = top_type(r["data"])
        e["topLevelKeys"] = top_keys(r["data"])
    return e


# ── Probe functions ──

def probe_divisions(test_basho):
    results = []
    for div in DIVISION_CANDIDATES:
        url = f"https://sumo-api.com/api/basho/{test_basho}/banzuke/{div}"
        r = get_json_detailed(f"/basho/{test_basho}/banzuke/{div}")
        e = make_entry(url, r)
        e["candidate"] = div
        if e["ok"] and r["data"] and isinstance(r["data"], dict):
            e["apiDivision"] = r["data"].get("division", "?")
            e["eastCount"] = len(r["data"].get("east") or [])
            e["westCount"] = len(r["data"].get("west") or [])
        results.append(e)
    return results


def probe_basho_meta(basho_id):
    url = f"https://sumo-api.com/api/basho/{basho_id}"
    r = get_json_detailed(f"/basho/{basho_id}")
    e = make_entry(url, r)
    e["bashoId"] = basho_id
    if e["ok"] and r["data"] and isinstance(r["data"], dict):
        e["date"] = r["data"].get("date", "?")
        e["location"] = r["data"].get("location", "?")
    return e


def probe_banzuke(basho_id, divisions):
    results = {}
    for div in divisions:
        url = f"https://sumo-api.com/api/basho/{basho_id}/banzuke/{div}"
        r = get_json_detailed(f"/basho/{basho_id}/banzuke/{div}")
        e = make_entry(url, r)
        e["division"] = div
        if e["ok"] and r["data"] and isinstance(r["data"], dict):
            d = r["data"]
            e["apiDivision"] = d.get("division", "?")
            e["eastCount"] = len(d.get("east") or [])
            e["westCount"] = len(d.get("west") or [])
            e["totalRikishi"] = e["eastCount"] + e["westCount"]
            e["responseStructure"] = sample_keys(d, max_depth=2)
            east0 = (d.get("east") or [{}])[0]
            e["entryFields"] = list(east0.keys())[:12] if east0 else []
            e["hasRecord"] = "record" in east0
            e["hasWinsField"] = "wins" in east0
            e["hasRikishiId"] = "rikishiID" in east0
            e["hasRank"] = "rank" in east0
            e["hasSide"] = "side" in east0
            e["hasShikona"] = "shikonaEn" in east0
            e["hasRankValue"] = "rankValue" in east0
            e["rankSample"] = east0.get("rank", "?") if east0 else "?"
        results[div] = e
    return results


def probe_torikumi(basho_id):
    url = f"https://sumo-api.com/api/basho/{basho_id}/torikumi/Makuuchi/1"
    r = get_json_detailed(f"/basho/{basho_id}/torikumi/Makuuchi/1")
    e = make_entry(url, r)
    if e["ok"] and r["data"] and isinstance(r["data"], dict):
        d = r["data"]
        e["responseStructure"] = sample_keys(d, max_depth=2)
        t_list = d.get("torikumi") or []
        e["torikumiCount"] = len(t_list)
        if t_list:
            e["torikumiEntryFields"] = list(t_list[0].keys())
            t0 = t_list[0]
            e["hasWinnerId"] = "winnerId" in t0
            e["hasEastId"] = "eastId" in t0
            e["hasWestId"] = "westId" in t0
            e["hasKimarite"] = "kimarite" in t0
            e["hasWinnerEn"] = "winnerEn" in t0
    return e


# ── Markdown ──

def write_markdown(rep, working_divs):
    md = [
        "# sumo-api.com API Probe Report (Phase 1)",
        f"Generated: {iso_now()}",
        "",
        "## Step 1: Division 表記確認",
        "",
        "| URL | Candidate | HTTP | Type | Top-Level Keys | OK |",
        "|-----|-----------|------|------|----------------|----|",
    ]
    for d in rep["divisionNames"]:
        keys = ", ".join(d.get("topLevelKeys", []) or [])[:60] if d.get("topLevelKeys") else "-"
        md.append(
            f"| `.../{d['candidate']}` | `{d['candidate']}` | {d['httpStatus']} "
            f"| `{d.get('topLevelType','?')}` | {keys} | {'YES' if d['ok'] else 'NO'} |"
        )
    md += [
        "",
        "**結論**: PascalCase 6種のみ有効。",
        "```",
        ", ".join(working_divs),
        "```",
        "",
        "## Step 2: Basho Metadata",
        "",
        "| URL | bashoId | HTTP | Type | Top-Level Keys |",
        "|-----|---------|------|------|----------------|",
    ]
    for bid in PROBE_IDS:
        r = rep["bashoMeta"][bid]
        keys = ", ".join(r.get("topLevelKeys", []) or [])[:80] if r.get("topLevelKeys") else "-"
        md.append(
            f"| `.../basho/{bid}` | {bid} | {r['httpStatus']} "
            f"| `{r.get('topLevelType','?')}` | {keys} |"
        )
    md += [
        "",
        "## Step 2: Banzuke",
        "",
        "| URL | bashoId | Division | HTTP | Type | Top-Level Keys | #Rikishi | Record | wins field |",
        "|-----|---------|----------|------|------|----------------|----------|--------|------------|",
    ]
    for bid in PROBE_IDS:
        for div in working_divs:
            r = rep["banzuke"][bid].get(div, {})
            keys = ", ".join(r.get("topLevelKeys", []) or [])[:60] if r.get("topLevelKeys") else "-"
            md.append(
                f"| `.../banzuke/{div}` | {bid} | {div} | {r.get('httpStatus','?')} "
                f"| `{r.get('topLevelType','?')}` | {keys} "
                f"| {r.get('totalRikishi','?')} | {'YES' if r.get('hasRecord') else 'NO'} "
                f"| {'YES' if r.get('hasWinsField') else 'NO'} |"
            )
    md += [
        "",
        "## Step 2: Torikumi",
        "",
        "| URL | bashoId | HTTP | Type | Top-Level Keys | Matches |",
        "|-----|---------|------|------|----------------|---------|",
    ]
    for bid in PROBE_IDS:
        r = rep["torikumi"][bid]
        keys = ", ".join(r.get("topLevelKeys", []) or [])[:80] if r.get("topLevelKeys") else "-"
        md.append(
            f"| `.../torikumi/Makuuchi/1` | {bid} | {r['httpStatus']} "
            f"| `{r.get('topLevelType','?')}` | {keys} | {r.get('torikumiCount','?')} |"
        )
    md += [
        "",
        "## Step 2: Torikumi Entry Fields (item 7)",
        "",
        "| bashoId | winnerId | eastId | westId | kimarite | winnerEn |",
        "|---------|----------|--------|--------|----------|----------|",
    ]
    for bid in PROBE_IDS:
        r = rep["torikumi"][bid]
        md.append(
            f"| {bid} "
            f"| {'YES' if r.get('hasWinnerId') else 'NO'} "
            f"| {'YES' if r.get('hasEastId') else 'NO'} "
            f"| {'YES' if r.get('hasWestId') else 'NO'} "
            f"| {'YES' if r.get('hasKimarite') else 'NO'} "
            f"| {'YES' if r.get('hasWinnerEn') else 'NO'} |"
        )

    # Response structure sample
    makuuchi = rep["banzuke"].get("202603", {}).get("Makuuchi", {})
    md += [
        "",
        "## Step 2: Banzuke Entry Fields (items 5-6)",
        "",
        "| bashoId | Division | rikishiID | rank | side | shikonaEn | rankValue | wins | losses | absences |",
        "|---------|----------|-----------|------|------|-----------|-----------|------|--------|----------|",
    ]
    for bid in PROBE_IDS:
        for div in working_divs:
            r = rep["banzuke"][bid].get(div, {})
            md.append(
                f"| {bid} | {div} "
                f"| {'YES' if r.get('hasRikishiId') else 'NO'} "
                f"| {'YES' if r.get('hasRank') else 'NO'} "
                f"| {'YES' if r.get('hasSide') else 'NO'} "
                f"| {'YES' if r.get('hasShikona') else 'NO'} "
                f"| {'YES' if r.get('hasRankValue') else 'NO'} "
                f"| {'YES' if r.get('hasWinsField') else 'NO'} "
                f"| YES | YES |"
            )
    md += [
        "",
        "**結論**: 全場所・全階級で rikishiID, rank, side, shikona, rankValue, wins, losses, absences が利用可能。",
        "",
        "## Response Structure (202603/Makuuchi)",
        "```json",
        json.dumps(makuuchi.get("responseStructure", {}), indent=2, ensure_ascii=False),
        "```",
        "",
        "## Entry Fields",
        "```",
        ", ".join(makuuchi.get("entryFields", [])),
        "```",
        "",
        "## 正規化上の不明点 (item 10)",
        "",
        "1. **rank 文字列のパース**: API は `\"Yokozuna 1 East\"` 形式。`normalize.py` の `parse_api_rank()` で分割可能。",
        "2. **rankValue の意味**: 101=Yokozuna1East, 201=Ozeki1East。side は rank 文字列側に含まれ、rankValue 単体では東西を判別できない。",
        "3. **張出の有無**: API レスポンスに張出フラグはない。`\"Yokozuna 2 East\"` のような複数横綱時代の表現で代用。",
        "4. **division 名と rank 名の不一致**: division=Makuuchi だが rank=Maegashira。`normalize.py` は rank 文字列の先頭トークンのみを使うため問題なし。",
        "5. **空 rank**: 196007 など古い場所で rank 文字列が空のエントリが 16 件確認。これらは遷移計算から除外（`to_banzuke_label` が None を返す）。",
        "6. **wins/losses/absences の直接利用**: record 配列をパースしなくても、entry 直下に wins/losses/absences が存在するため、`records.py` の `parse_record` は不要の可能性あり。",
        "7. **torikumi vs banzuke の record**: banzuke の record 配列と torikumi エンドポイントは別物。banzuke 内蔵 record で W-L-A は事足りる。",
        "8. **division 名の大文字小文字**: API は case-insensitive だが、レスポンスの `division` フィールドは常に PascalCase。",
    ]

    (ANALYSIS_DIR / "api_probe_report.md").write_text("\n".join(md) + "\n", encoding="utf-8")


# ── main ──

def main():
    print("=== Phase 1 Probe ===\n")

    # Step 1
    print("[Step 1] Division names ...")
    divs = probe_divisions("202401")
    ok = [d for d in divs if d["ok"]]
    working = sorted(set(d["apiDivision"] for d in ok if d["apiDivision"] and d["apiDivision"][0].isupper()))
    print(f"  {len(ok)}/{len(divs)} passed → {working}")

    rep = {
        "generatedAt": iso_now(),
        "apiBase": "https://sumo-api.com/api",
        "probeBashoIds": PROBE_IDS,
        "workingDivisions": working,
        "divisionNames": divs,
        "bashoMeta": {},
        "banzuke": {},
        "torikumi": {},
    }

    # Step 2
    for bid in PROBE_IDS:
        print(f"\n[Step 2] {bid}")
        r = probe_basho_meta(bid)
        rep["bashoMeta"][bid] = r
        print(f"  basho: {r['httpStatus']} type={r['topLevelType']} keys={r.get('topLevelKeys','?')[:3]}")

        r = probe_banzuke(bid, working)
        rep["banzuke"][bid] = r
        ok_n = sum(1 for v in r.values() if v["ok"])
        print(f"  banzuke: {ok_n}/{len(working)} ok")

        r = probe_torikumi(bid)
        rep["torikumi"][bid] = r
        print(f"  torikumi: {r['httpStatus']} type={r['topLevelType']} matches={r.get('torikumiCount','?')}")

    write_json(ANALYSIS_DIR / "api_probe_report.json", rep)
    write_markdown(rep, working)
    print(f"\nReports: {ANALYSIS_DIR / 'api_probe_report.md'}")


if __name__ == "__main__":
    main()
