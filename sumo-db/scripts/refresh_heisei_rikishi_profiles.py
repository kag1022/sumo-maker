import argparse
import hashlib
import json
import re
import sqlite3
import time
import unicodedata
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from statistics import median
from typing import Optional

import requests
try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

from _paths import ANALYSIS_DIR, DB_PATH, RAW_HTML_DIR

RAW_DIR = RAW_HTML_DIR / "rikishi"
RAW_DIR.mkdir(parents=True, exist_ok=True)
ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)

BASE_URL = "https://sumodb.sumogames.de/Rikishi.aspx?r={}&l=j&t=1"
CHECKPOINT_INTERVAL = 250
MIN_INCLUDED_FOR_STABILITY = 2500
STABILITY_THRESHOLDS = {
    "sekitoriRate": 0.005,
    "makuuchiRate": 0.004,
    "sanyakuRate": 0.0025,
    "careerBashoP50": 1.0,
    "careerWinRateMean": 0.003,
}
CHECKPOINT_STATE_KEY = "heisei_collection_checkpoints"
STOP_STATE_KEY = "heisei_collection_stop_reason"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/146.0 Safari/537.36"
    )
}

CAREER_RE = re.compile(
    r"生涯戦歴\s*([0-9]+)勝([0-9]+)敗(?:([0-9]+)休)?(?:([0-9]+)分)?[／/]([0-9]+)出\(([0-9]+)場所\)"
)
LABEL_VALUE_PATTERNS = {
    "highest_rank_raw": re.compile(r"最高位\s+(.+)"),
    "debut_basho": re.compile(r"初土俵\s+((?:昭和|平成|令和)[0-9元]+年[0-9]+月)"),
    "last_basho": re.compile(r"最終場所\s+((?:昭和|平成|令和)[0-9元]+年[0-9]+月)"),
}
NOISE_SUFFIXES = ["力士情報", "テキスト力士情報"]
NOISE_EXACT = {
    "力士情報",
    "テキスト力士情報",
    "生涯戦歴",
    "初土俵",
    "最終場所",
    "最高位",
    "年寄名跡",
    "改名歴",
    "戦歴",
    "幕内戦歴",
    "十両戦歴",
    "優勝",
    "三賞",
    "金星",
}
SEKITORI_RANKS = {"横綱", "大関", "関脇", "小結", "前頭", "十両"}
MAKUUCHI_RANKS = {"横綱", "大関", "関脇", "小結", "前頭"}
SANYAKU_RANKS = {"横綱", "大関", "関脇", "小結"}
ERA_BASE_YEAR = {"昭和": 1925, "平成": 1988, "令和": 2018}
STAR_RECORD_RE = re.compile(r"^[O0o\-\*#%xX=]+$")
BASHO_RECORD_LINE_RE = re.compile(
    r"^(昭和|平成|令和)([0-9元]+)年([0-9]+)月\s+(.+?)\s+([0-9]+)勝([0-9]+)敗(?:([0-9]+)休)?(?:([0-9]+)分)?\s*(.*)$"
)
RANK_TOKEN_RE = re.compile(r"^(東|西)(横綱|大関|関脇|小結|前|十|下|三|二|口)([0-9]+)(張出)?$")
RANK_TOKEN_LABELS = {
    "横綱": ("幕内", "横綱"),
    "大関": ("幕内", "大関"),
    "関脇": ("幕内", "関脇"),
    "小結": ("幕内", "小結"),
    "前": ("幕内", "前頭"),
    "十": ("十両", "十両"),
    "下": ("幕下", "幕下"),
    "三": ("三段目", "三段目"),
    "二": ("序二段", "序二段"),
    "口": ("序ノ口", "序ノ口"),
}
SANSHO_TOKENS = ("殊勲賞", "敢闘賞", "技能賞")


class PreBlockParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.pre_blocks: list[str] = []
        self._in_pre = False
        self._parts: list[str] = []
        self._text_parts: list[str] = []
        self._in_title = False
        self.title_text = ""
        self._heading_level: Optional[str] = None
        self.headings: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        if tag == "pre":
            self._in_pre = True
            self._parts = []
        elif tag == "title":
            self._in_title = True
        elif tag in ("h1", "h2", "h3"):
            self._heading_level = tag
            self._parts = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "pre" and self._in_pre:
            self.pre_blocks.append("".join(self._parts))
            self._in_pre = False
            self._parts = []
        elif tag == "title":
            self._in_title = False
        elif tag == self._heading_level and self._heading_level is not None:
            self.headings.append((self._heading_level, "".join(self._parts)))
            self._heading_level = None
            self._parts = []

    def handle_data(self, data: str) -> None:
        self._text_parts.append(data)
        if self._in_pre or self._heading_level is not None:
            self._parts.append(data)
        if self._in_title:
            self.title_text += data

    def text(self) -> str:
        return "".join(self._text_parts)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="平成初土俵の力士プロフィールを補完する")
    parser.add_argument("--max-fetch", type=int, default=None, help="今回の取得件数上限")
    parser.add_argument("--sleep-seconds", type=float, default=2.0, help="各取得間隔")
    parser.add_argument(
        "--retry-errors",
        action="store_true",
        help="fetch_state=error の catalog も再試行する",
    )
    parser.add_argument(
        "--reparse-cached",
        action="store_true",
        help="既存 raw_html を再解析して summary と場所別成績を再生成する",
    )
    return parser.parse_args()


def normalize_line(line: str) -> str:
    value = unicodedata.normalize("NFKC", line)
    return re.sub(r"\s+", " ", value.strip())


def html_to_text(html: str) -> str:
    if BeautifulSoup is None:
        parser = PreBlockParser()
        parser.feed(html)
        return parser.text()
    soup = BeautifulSoup(html, "lxml")
    return soup.get_text("\n")


def extract_profile_text(html: str) -> str:
    if BeautifulSoup is None:
        parser = PreBlockParser()
        parser.feed(html)
        if parser.pre_blocks:
            return "\n".join(parser.pre_blocks)
        return parser.text()
    soup = BeautifulSoup(html, "lxml")
    pre_blocks = [block.get_text("\n") for block in soup.find_all("pre")]
    if pre_blocks:
        return "\n".join(pre_blocks)
    return soup.get_text("\n")


def extract_page_shikona(html: str) -> Optional[str]:
    if BeautifulSoup is None:
        parser = PreBlockParser()
        parser.feed(html)
        title = normalize_line(parser.title_text.replace("力士情報", ""))
        if title:
            return title
        for level, heading in parser.headings:
            if level == "h2":
                text = normalize_line(heading)
                text = re.sub(r"^第[0-9]+代(横綱|大関|関脇|小結)\s+", "", text)
                text = re.sub(r"[（(].*$", "", text).strip()
                return text or None
        return None
    soup = BeautifulSoup(html, "lxml")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    title = normalize_line(title.replace("力士情報", ""))
    if title:
        return title
    heading = soup.find("h2")
    if not heading:
        return None
    text = normalize_line(heading.get_text(" ", strip=True))
    text = re.sub(r"^第[0-9]+代(横綱|大関|関脇|小結)\s+", "", text)
    text = re.sub(r"[（(].*$", "", text).strip()
    return text or None


def extract_shikona(text: str) -> Optional[str]:
    lines = [normalize_line(line) for line in text.splitlines() if line.strip()]
    for line in lines[:30]:
        candidate = line
        for suffix in NOISE_SUFFIXES:
            if candidate.endswith(suffix):
                candidate = candidate[: -len(suffix)].strip()
        if not candidate:
            continue
        if candidate in NOISE_EXACT:
            continue
        if any(token in candidate for token in ("初土俵", "最終場所", "生涯戦歴", "最高位")):
            continue
        if re.search(r"[0-9]", candidate):
            continue
        if len(candidate) > 24:
            continue
        return candidate
    return None


def extract_label_value(text: str, field_name: str) -> Optional[str]:
    normalized_text = "\n".join(normalize_line(line) for line in text.splitlines())
    match = LABEL_VALUE_PATTERNS[field_name].search(normalized_text)
    return normalize_line(match.group(1)) if match else None


def extract_career(text: str) -> Optional[dict]:
    normalized_text = "\n".join(normalize_line(line) for line in text.splitlines())
    match = CAREER_RE.search(normalized_text)
    if not match:
        return None
    return {
        "career_wins": int(match.group(1)),
        "career_losses": int(match.group(2)),
        "career_absences": int(match.group(3) or 0),
        "career_appearances": int(match.group(5)),
        "career_bashos": int(match.group(6)),
    }


def parse_era_year(value: str) -> int:
    return 1 if value == "元" else int(value)


def to_basho_code(era: str, era_year: str, month: str) -> str:
    year = ERA_BASE_YEAR[era] + parse_era_year(era_year)
    return f"{year}{int(month):02d}"


def is_shikona_heading_line(line: str) -> bool:
    if not line or line.startswith(("昭和", "平成", "令和")):
        return False
    if re.search(r"[0-9]", line):
        return False
    if any(token in line for token in ("最高位", "本名", "生涯戦歴", "戦歴", "場所", "勝", "敗", "休")):
        return False
    return "（" in line or "(" in line


def normalize_heading_shikona(line: str) -> str:
    value = re.sub(r"[（(].*$", "", line).strip()
    return value


def split_rank_and_record(body: str) -> tuple[str, Optional[str]]:
    parts = body.split()
    if len(parts) >= 2 and STAR_RECORD_RE.fullmatch(parts[-1]):
        return " ".join(parts[:-1]), parts[-1]
    return body, None


def parse_rank_token(rank_token: str) -> Optional[dict]:
    token = rank_token.strip()
    if token == "前相":
        return {
            "division": "Maezumo",
            "rank_name": "前相撲",
            "rank_number": None,
            "side": None,
            "is_haridashi": 0,
            "banzuke_label": "前相",
        }
    match = RANK_TOKEN_RE.fullmatch(token)
    if not match:
        return None
    side, rank_key, rank_number, haridashi = match.groups()
    division, rank_name = RANK_TOKEN_LABELS[rank_key]
    label = f"{side}{rank_name if rank_key in {'横綱', '大関', '関脇', '小結'} else rank_key}{rank_number}"
    if haridashi:
        label += haridashi
    return {
        "division": division,
        "rank_name": rank_name,
        "rank_number": int(rank_number),
        "side": side,
        "is_haridashi": 1 if haridashi else 0,
        "banzuke_label": label,
    }


def parse_kinboshi_count(notes: str) -> int:
    total = 0
    for match in re.finditer(r"(?:(\d+))?金星", notes):
        total += int(match.group(1) or 1)
    return total


def extract_basho_record_notes(notes: str) -> tuple[Optional[str], Optional[str], int]:
    note_text = normalize_line(notes)
    if not note_text:
        return None, None, 0
    yusho_parts = [part for part in re.split(r"\s+", note_text) if "優勝" in part]
    sansho_parts = [part for part in re.split(r"\s+", note_text) if any(token in part for token in SANSHO_TOKENS)]
    kinboshi_count = parse_kinboshi_count(note_text)
    return (
        " ".join(yusho_parts) if yusho_parts else None,
        " ".join(sansho_parts) if sansho_parts else None,
        kinboshi_count,
    )


def extract_basho_records(text: str, default_shikona: Optional[str]) -> list[dict]:
    records: list[dict] = []
    current_shikona = default_shikona
    for raw_line in text.splitlines():
        line = normalize_line(raw_line)
        if not line:
            continue
        if is_shikona_heading_line(line):
            heading_shikona = normalize_heading_shikona(line)
            if heading_shikona:
                current_shikona = heading_shikona
            continue
        match = BASHO_RECORD_LINE_RE.match(line)
        if not match:
            continue
        era, era_year, month, body, wins, losses, absences, _draws, notes = match.groups()
        rank_token, record_raw = split_rank_and_record(body)
        rank = parse_rank_token(rank_token)
        if not rank:
            continue
        yusho_text, sansho_text, kinboshi_count = extract_basho_record_notes(notes)
        records.append(
            {
                "basho_code": to_basho_code(era, era_year, month),
                "shikona": current_shikona or default_shikona,
                "division": rank["division"],
                "rank_name": rank["rank_name"],
                "rank_number": rank["rank_number"],
                "side": rank["side"],
                "is_haridashi": rank["is_haridashi"],
                "banzuke_label": rank["banzuke_label"],
                "record_raw": record_raw,
                "wins": int(wins),
                "losses": int(losses),
                "absences": int(absences or 0),
                "yusho_text": yusho_text,
                "sansho_text": sansho_text,
                "kinboshi_count": kinboshi_count,
            }
        )
    return records


def parse_highest_rank_name(highest_rank_raw: Optional[str]) -> Optional[str]:
    if not highest_rank_raw:
        return None
    match = re.match(r"^(横綱|大関|関脇|小結|前頭|十両|幕下|三段目|序二段|序ノ口)", highest_rank_raw)
    return match.group(1) if match else highest_rank_raw


def is_heisei_debut(basho: Optional[str]) -> bool:
    return bool(basho and normalize_line(basho).startswith("平成"))


def quantile(sorted_values: list[float], ratio: float) -> float:
    if not sorted_values:
        return float("nan")
    if len(sorted_values) == 1:
        return float(sorted_values[0])
    pos = (len(sorted_values) - 1) * ratio
    lo = int(pos)
    hi = min(len(sorted_values) - 1, lo + 1)
    if lo == hi:
        return float(sorted_values[lo])
    frac = pos - lo
    return float(sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * frac)


def get_catalog_ids(con: sqlite3.Connection, retry_errors: bool, reparse_cached: bool) -> list[int]:
    if reparse_cached:
        rows = con.execute(
            """
            SELECT rikishi_id
            FROM rikishi_discovery_catalog
            WHERE raw_html_path IS NOT NULL
            ORDER BY first_seen_basho_code, rikishi_id
            """
        ).fetchall()
        return [int(rikishi_id) for (rikishi_id,) in rows]
    states = ("pending", "error") if retry_errors else ("pending",)
    placeholders = ",".join("?" for _ in states)
    rows = con.execute(
        f"""
        SELECT rikishi_id
        FROM rikishi_discovery_catalog
        WHERE discovery_source = 'heisei_banzuke'
          AND fetch_state IN ({placeholders})
        ORDER BY first_seen_basho_code, rikishi_id
        """,
        states,
    ).fetchall()
    return [int(rikishi_id) for (rikishi_id,) in rows]


def upsert_summary(
    con: sqlite3.Connection,
    rikishi_id: int,
    shikona: Optional[str],
    highest_rank_raw: Optional[str],
    debut_basho: Optional[str],
    last_basho: Optional[str],
    career: dict,
) -> None:
    con.execute(
        """
        INSERT INTO rikishi_summary (
            rikishi_id, cohort, shikona, highest_rank_raw, highest_rank_name,
            debut_basho, last_basho,
            career_wins, career_losses, career_absences, career_appearances, career_bashos,
            status, error_message, updated_at
        ) VALUES (?, 'heisei_debut', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', NULL, CURRENT_TIMESTAMP)
        ON CONFLICT(rikishi_id) DO UPDATE SET
            cohort='heisei_debut',
            shikona=excluded.shikona,
            highest_rank_raw=excluded.highest_rank_raw,
            highest_rank_name=excluded.highest_rank_name,
            debut_basho=excluded.debut_basho,
            last_basho=excluded.last_basho,
            career_wins=excluded.career_wins,
            career_losses=excluded.career_losses,
            career_absences=excluded.career_absences,
            career_appearances=excluded.career_appearances,
            career_bashos=excluded.career_bashos,
            status='ok',
            error_message=NULL,
            updated_at=CURRENT_TIMESTAMP
        """,
        (
            rikishi_id,
            shikona,
            highest_rank_raw,
            parse_highest_rank_name(highest_rank_raw),
            debut_basho,
            last_basho,
            career["career_wins"],
            career["career_losses"],
            career["career_absences"],
            career["career_appearances"],
            career["career_bashos"],
        ),
    )


def remove_summary(con: sqlite3.Connection, rikishi_id: int) -> None:
    con.execute("DELETE FROM rikishi_summary WHERE rikishi_id = ?", (rikishi_id,))


def replace_basho_records(
    con: sqlite3.Connection,
    rikishi_id: int,
    source_url: str,
    raw_html_path: str,
    records: list[dict],
) -> None:
    con.execute("DELETE FROM rikishi_basho_record WHERE rikishi_id = ?", (rikishi_id,))
    if not records:
        return
    con.executemany(
        """
        INSERT INTO rikishi_basho_record (
            rikishi_id,
            basho_code,
            shikona,
            division,
            rank_name,
            rank_number,
            side,
            is_haridashi,
            banzuke_label,
            record_raw,
            wins,
            losses,
            absences,
            yusho_text,
            sansho_text,
            kinboshi_count,
            source_url,
            raw_html_path,
            parse_status,
            error_message,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', NULL, CURRENT_TIMESTAMP)
        """,
        [
            (
                rikishi_id,
                record["basho_code"],
                record["shikona"],
                record["division"],
                record["rank_name"],
                record["rank_number"],
                record["side"],
                record["is_haridashi"],
                record["banzuke_label"],
                record["record_raw"],
                record["wins"],
                record["losses"],
                record["absences"],
                record["yusho_text"],
                record["sansho_text"],
                record["kinboshi_count"],
                source_url,
                raw_html_path,
            )
            for record in records
        ],
    )


def remove_basho_records(con: sqlite3.Connection, rikishi_id: int) -> None:
    con.execute("DELETE FROM rikishi_basho_record WHERE rikishi_id = ?", (rikishi_id,))


def update_catalog(
    con: sqlite3.Connection,
    rikishi_id: int,
    *,
    fetch_state: str,
    cohort_state: str,
    cohort_reason: str,
    source_url: str,
    raw_html_path: Optional[str],
    http_status: Optional[int],
    content_hash: Optional[str],
    shikona: Optional[str],
    highest_rank_raw: Optional[str],
    debut_basho: Optional[str],
    last_basho: Optional[str],
    career: Optional[dict],
    error_message: Optional[str],
) -> None:
    con.execute(
        """
        UPDATE rikishi_discovery_catalog
        SET fetch_state = ?,
            cohort_state = ?,
            cohort_reason = ?,
            source_url = ?,
            raw_html_path = ?,
            http_status = ?,
            content_hash = ?,
            debut_basho = ?,
            last_basho = ?,
            highest_rank_raw = ?,
            highest_rank_name = ?,
            career_wins = ?,
            career_losses = ?,
            career_absences = ?,
            career_appearances = ?,
            career_bashos = ?,
            error_message = ?,
            attempt_count = attempt_count + 1,
            last_attempted_at = CURRENT_TIMESTAMP,
            included_at = CASE
                WHEN ? = 'included' AND included_at IS NULL THEN CURRENT_TIMESTAMP
                ELSE included_at
            END,
            excluded_at = CASE
                WHEN ? = 'excluded' AND excluded_at IS NULL THEN CURRENT_TIMESTAMP
                ELSE excluded_at
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE rikishi_id = ?
        """,
        (
            fetch_state,
            cohort_state,
            cohort_reason,
            source_url,
            raw_html_path,
            http_status,
            content_hash,
            debut_basho,
            last_basho,
            highest_rank_raw,
            parse_highest_rank_name(highest_rank_raw),
            career["career_wins"] if career else None,
            career["career_losses"] if career else None,
            career["career_absences"] if career else None,
            career["career_appearances"] if career else None,
            career["career_bashos"] if career else None,
            error_message,
            cohort_state,
            cohort_state,
            rikishi_id,
        ),
    )


def upsert_etl_state(con: sqlite3.Connection, key: str, value: str) -> None:
    con.execute(
        """
        INSERT INTO etl_state(key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
            value=excluded.value,
            updated_at=CURRENT_TIMESTAMP
        """,
        (key, value),
    )


def load_checkpoints(con: sqlite3.Connection) -> list[dict]:
    row = con.execute("SELECT value FROM etl_state WHERE key = ?", (CHECKPOINT_STATE_KEY,)).fetchone()
    if not row:
        return []
    try:
        return json.loads(row[0])
    except json.JSONDecodeError:
        return []


def save_checkpoints(con: sqlite3.Connection, checkpoints: list[dict]) -> None:
    upsert_etl_state(con, CHECKPOINT_STATE_KEY, json.dumps(checkpoints, ensure_ascii=False))


def compute_metrics(con: sqlite3.Connection) -> Optional[dict]:
    rows = con.execute(
        """
        SELECT highest_rank_name, career_bashos, career_wins, career_losses
        FROM rikishi_summary
        WHERE cohort = 'heisei_debut' AND status = 'ok'
        """
    ).fetchall()
    if not rows:
        return None

    career_bashos: list[float] = []
    win_rates: list[float] = []
    sekitori = 0
    makuuchi = 0
    sanyaku = 0

    for highest_rank_name, basho_count, wins, losses in rows:
        rank_name = highest_rank_name or "不明"
        career_bashos.append(float(basho_count or 0))
        total = (wins or 0) + (losses or 0)
        win_rates.append(((wins or 0) / total) if total > 0 else 0.5)
        if rank_name in SEKITORI_RANKS:
            sekitori += 1
        if rank_name in MAKUUCHI_RANKS:
            makuuchi += 1
        if rank_name in SANYAKU_RANKS:
            sanyaku += 1

    sample_size = len(rows)
    career_bashos.sort()
    win_rates.sort()
    return {
        "includedCount": sample_size,
        "sekitoriRate": sekitori / sample_size,
        "makuuchiRate": makuuchi / sample_size,
        "sanyakuRate": sanyaku / sample_size,
        "careerBashoP50": quantile(career_bashos, 0.5),
        "careerWinRateMean": sum(win_rates) / sample_size,
    }


def checkpoint_delta(left: dict, right: dict) -> dict:
    return {
        key: abs(float(right[key]) - float(left[key]))
        for key in STABILITY_THRESHOLDS
    }


def is_stable_delta(delta: dict) -> bool:
    return all(delta[key] <= threshold for key, threshold in STABILITY_THRESHOLDS.items())


def enrich_checkpoints(checkpoints: list[dict]) -> tuple[list[dict], int]:
    stable_run_length = 0
    enriched: list[dict] = []
    previous = None
    for checkpoint in checkpoints:
        current = dict(checkpoint)
        if previous is None:
            current["deltaFromPrevious"] = None
            current["stableVsPrevious"] = None
            stable_run_length = 0
        else:
            delta = checkpoint_delta(previous, checkpoint)
            stable = is_stable_delta(delta)
            current["deltaFromPrevious"] = delta
            current["stableVsPrevious"] = stable
            stable_run_length = stable_run_length + 1 if stable else 0
        current["stableRunLength"] = stable_run_length
        enriched.append(current)
        previous = checkpoint
    return enriched, stable_run_length


def build_collection_report(con: sqlite3.Connection) -> dict:
    counts = {
        "discoveredCount": con.execute("SELECT COUNT(*) FROM rikishi_discovery_catalog").fetchone()[0],
        "pendingCount": con.execute(
            "SELECT COUNT(*) FROM rikishi_discovery_catalog WHERE fetch_state = 'pending'"
        ).fetchone()[0],
        "fetchedCount": con.execute(
            "SELECT COUNT(*) FROM rikishi_discovery_catalog WHERE fetch_state = 'fetched'"
        ).fetchone()[0],
        "errorCount": con.execute(
            "SELECT COUNT(*) FROM rikishi_discovery_catalog WHERE fetch_state = 'error'"
        ).fetchone()[0],
        "includedCount": con.execute(
            "SELECT COUNT(*) FROM rikishi_discovery_catalog WHERE cohort_state = 'included'"
        ).fetchone()[0],
        "excludedCount": con.execute(
            "SELECT COUNT(*) FROM rikishi_discovery_catalog WHERE cohort_state = 'excluded'"
        ).fetchone()[0],
    }

    metrics = compute_metrics(con)
    checkpoints, stable_run_length = enrich_checkpoints(load_checkpoints(con))
    reached_minimum = counts["includedCount"] >= MIN_INCLUDED_FOR_STABILITY
    is_stable = reached_minimum and stable_run_length >= 3
    if counts["pendingCount"] == 0:
        stop_reason = "discovery_exhausted"
    elif is_stable:
        stop_reason = "distribution_stable"
    else:
        stop_reason = "continue"

    return {
        "meta": {
            "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "cohort": "heisei_debut",
            "discoverySource": "heisei_banzuke",
            "checkpointInterval": CHECKPOINT_INTERVAL,
            "minimumIncludedCount": MIN_INCLUDED_FOR_STABILITY,
            "stabilityThresholds": STABILITY_THRESHOLDS,
        },
        "counts": counts,
        "metrics": metrics,
        "checkpoints": checkpoints,
        "stabilityStatus": {
            "reachedMinimumSample": reached_minimum,
            "stableRunLength": stable_run_length,
            "isStable": is_stable,
            "recommendedStopReason": stop_reason,
        },
    }


def write_collection_report(con: sqlite3.Connection) -> dict:
    report = build_collection_report(con)
    json_path = ANALYSIS_DIR / "heisei_collection_report.json"
    md_path = ANALYSIS_DIR / "heisei_collection_report.md"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# 平成初土俵収集レポート",
        "",
        f"- generatedAt: {report['meta']['generatedAt']}",
        f"- cohort: {report['meta']['cohort']}",
        f"- discoverySource: {report['meta']['discoverySource']}",
        f"- discovered: {report['counts']['discoveredCount']}",
        f"- included: {report['counts']['includedCount']}",
        f"- excluded: {report['counts']['excludedCount']}",
        f"- pending: {report['counts']['pendingCount']}",
        f"- errors: {report['counts']['errorCount']}",
        f"- stopReason: {report['stabilityStatus']['recommendedStopReason']}",
        "",
        "## Stability",
        "",
        f"- reachedMinimumSample: {'yes' if report['stabilityStatus']['reachedMinimumSample'] else 'no'}",
        f"- stableRunLength: {report['stabilityStatus']['stableRunLength']}",
        f"- isStable: {'yes' if report['stabilityStatus']['isStable'] else 'no'}",
        "",
    ]
    if report["metrics"]:
        lines.extend(
            [
                "## Metrics",
                "",
                f"- sekitoriRate: {report['metrics']['sekitoriRate']:.4f}",
                f"- makuuchiRate: {report['metrics']['makuuchiRate']:.4f}",
                f"- sanyakuRate: {report['metrics']['sanyakuRate']:.4f}",
                f"- careerBashoP50: {report['metrics']['careerBashoP50']:.2f}",
                f"- careerWinRateMean: {report['metrics']['careerWinRateMean']:.4f}",
                "",
            ]
        )
    if report["checkpoints"]:
        lines.extend(["## Checkpoints", ""])
        for checkpoint in report["checkpoints"][-6:]:
            lines.append(
                f"- included={checkpoint['includedCount']} stableRun={checkpoint['stableRunLength']} "
                f"sekitori={checkpoint['sekitoriRate']:.4f} makuuchi={checkpoint['makuuchiRate']:.4f} "
                f"sanyaku={checkpoint['sanyakuRate']:.4f} p50={checkpoint['careerBashoP50']:.2f} "
                f"winMean={checkpoint['careerWinRateMean']:.4f}"
            )
        lines.append("")

    md_path.write_text("\n".join(lines), encoding="utf-8")
    return report


def maybe_checkpoint(con: sqlite3.Connection) -> dict:
    metrics = compute_metrics(con)
    if not metrics:
        return write_collection_report(con)

    if metrics["includedCount"] >= CHECKPOINT_INTERVAL and metrics["includedCount"] % CHECKPOINT_INTERVAL == 0:
        checkpoints = load_checkpoints(con)
        if not checkpoints or checkpoints[-1]["includedCount"] != metrics["includedCount"]:
            checkpoint = {
                "includedCount": metrics["includedCount"],
                "sekitoriRate": metrics["sekitoriRate"],
                "makuuchiRate": metrics["makuuchiRate"],
                "sanyakuRate": metrics["sanyakuRate"],
                "careerBashoP50": metrics["careerBashoP50"],
                "careerWinRateMean": metrics["careerWinRateMean"],
                "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            }
            checkpoints.append(checkpoint)
            save_checkpoints(con, checkpoints)
    return write_collection_report(con)


def ingest_profile_html(
    con: sqlite3.Connection,
    rikishi_id: int,
    url: str,
    html: str,
    *,
    status_code: Optional[int],
    raw_path: Path,
    persist_html: bool,
) -> tuple[str, str]:
    if persist_html:
        raw_path.write_text(html, encoding="utf-8")

    content_hash = hashlib.sha256(html.encode("utf-8")).hexdigest()
    text = extract_profile_text(html)
    if "生涯戦歴" not in text:
        update_catalog(
            con,
            rikishi_id,
            fetch_state="error",
            cohort_state="unknown",
            cohort_reason="parse_error",
            source_url=url,
            raw_html_path=str(raw_path),
            http_status=status_code,
            content_hash=content_hash,
            shikona=None,
            highest_rank_raw=None,
            debut_basho=None,
            last_basho=None,
            career=None,
            error_message="生涯戦歴が見つからない",
        )
        remove_summary(con, rikishi_id)
        remove_basho_records(con, rikishi_id)
        con.commit()
        return "error", "parse_error"

    shikona = extract_page_shikona(html) or extract_shikona(text)
    highest_rank_raw = extract_label_value(text, "highest_rank_raw")
    debut_basho = extract_label_value(text, "debut_basho")
    last_basho = extract_label_value(text, "last_basho")
    career = extract_career(text)
    basho_records = extract_basho_records(text, shikona)
    if not career or not debut_basho or not basho_records:
        update_catalog(
            con,
            rikishi_id,
            fetch_state="error",
            cohort_state="unknown",
            cohort_reason="parse_error",
            source_url=url,
            raw_html_path=str(raw_path),
            http_status=status_code,
            content_hash=content_hash,
            shikona=shikona,
            highest_rank_raw=highest_rank_raw,
            debut_basho=debut_basho,
            last_basho=last_basho,
            career=career,
            error_message="必要項目のパース失敗",
        )
        remove_summary(con, rikishi_id)
        remove_basho_records(con, rikishi_id)
        con.commit()
        return "error", "parse_error"

    replace_basho_records(con, rikishi_id, url, str(raw_path), basho_records)
    if is_heisei_debut(debut_basho):
        upsert_summary(con, rikishi_id, shikona, highest_rank_raw, debut_basho, last_basho, career)
        update_catalog(
            con,
            rikishi_id,
            fetch_state="fetched",
            cohort_state="included",
            cohort_reason="heisei_debut",
            source_url=url,
            raw_html_path=str(raw_path),
            http_status=status_code,
            content_hash=content_hash,
            shikona=shikona,
            highest_rank_raw=highest_rank_raw,
            debut_basho=debut_basho,
            last_basho=last_basho,
            career=career,
            error_message=None,
        )
        con.commit()
        return "included", "heisei_debut"

    remove_summary(con, rikishi_id)
    update_catalog(
        con,
        rikishi_id,
        fetch_state="fetched",
        cohort_state="excluded",
        cohort_reason="pre_heisei_debut",
        source_url=url,
        raw_html_path=str(raw_path),
        http_status=status_code,
        content_hash=content_hash,
        shikona=shikona,
        highest_rank_raw=highest_rank_raw,
        debut_basho=debut_basho,
        last_basho=last_basho,
        career=career,
        error_message=None,
    )
    con.commit()
    return "excluded", "pre_heisei_debut"


def fetch_one(con: sqlite3.Connection, rikishi_id: int) -> tuple[str, str]:
    url = BASE_URL.format(rikishi_id)
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        status_code = resp.status_code
        if status_code != 200:
            update_catalog(
                con,
                rikishi_id,
                fetch_state="error",
                cohort_state="unknown",
                cohort_reason="http_error",
                source_url=url,
                raw_html_path=None,
                http_status=status_code,
                content_hash=None,
                shikona=None,
                highest_rank_raw=None,
                debut_basho=None,
                last_basho=None,
                career=None,
                error_message=f"HTTP {status_code}",
            )
            remove_summary(con, rikishi_id)
            remove_basho_records(con, rikishi_id)
            con.commit()
            return "error", "http_error"

        resp.encoding = resp.apparent_encoding
        return ingest_profile_html(
            con,
            rikishi_id,
            url,
            resp.text,
            status_code=status_code,
            raw_path=RAW_DIR / f"{rikishi_id}.html",
            persist_html=True,
        )
    except Exception as exc:
        update_catalog(
            con,
            rikishi_id,
            fetch_state="error",
            cohort_state="unknown",
            cohort_reason="parse_error",
            source_url=url,
            raw_html_path=None,
            http_status=None,
            content_hash=None,
            shikona=None,
            highest_rank_raw=None,
            debut_basho=None,
            last_basho=None,
            career=None,
            error_message=str(exc),
        )
        remove_summary(con, rikishi_id)
        remove_basho_records(con, rikishi_id)
        con.commit()
        return "error", "parse_error"


def reparse_cached_one(con: sqlite3.Connection, rikishi_id: int) -> tuple[str, str]:
    row = con.execute(
        """
        SELECT source_url, raw_html_path, http_status
        FROM rikishi_discovery_catalog
        WHERE rikishi_id = ?
        """,
        (rikishi_id,),
    ).fetchone()
    url = row[0] if row and row[0] else BASE_URL.format(rikishi_id)
    raw_path = Path(row[1]) if row and row[1] else RAW_DIR / f"{rikishi_id}.html"
    status_code = int(row[2]) if row and row[2] is not None else 200
    if not raw_path.exists():
        update_catalog(
            con,
            rikishi_id,
            fetch_state="error",
            cohort_state="unknown",
            cohort_reason="missing_cache",
            source_url=url,
            raw_html_path=str(raw_path),
            http_status=status_code,
            content_hash=None,
            shikona=None,
            highest_rank_raw=None,
            debut_basho=None,
            last_basho=None,
            career=None,
            error_message="cached raw_html not found",
        )
        remove_summary(con, rikishi_id)
        remove_basho_records(con, rikishi_id)
        con.commit()
        return "error", "missing_cache"
    html = raw_path.read_text(encoding="utf-8", errors="ignore")
    try:
        return ingest_profile_html(
            con,
            rikishi_id,
            url,
            html,
            status_code=status_code,
            raw_path=raw_path,
            persist_html=False,
        )
    except Exception as exc:
        update_catalog(
            con,
            rikishi_id,
            fetch_state="error",
            cohort_state="unknown",
            cohort_reason="parse_error",
            source_url=url,
            raw_html_path=str(raw_path),
            http_status=status_code,
            content_hash=None,
            shikona=None,
            highest_rank_raw=None,
            debut_basho=None,
            last_basho=None,
            career=None,
            error_message=str(exc),
        )
        remove_summary(con, rikishi_id)
        remove_basho_records(con, rikishi_id)
        con.commit()
        return "error", "parse_error"


def main() -> None:
    args = parse_args()
    con = sqlite3.connect(DB_PATH)
    try:
        candidate_ids = get_catalog_ids(con, args.retry_errors, args.reparse_cached)
        print(f"pending rikishi ids: {len(candidate_ids)}")
        processed = 0
        report = write_collection_report(con)
        for rikishi_id in candidate_ids:
            if args.max_fetch is not None and processed >= args.max_fetch:
                break
            status, reason = (
                reparse_cached_one(con, rikishi_id)
                if args.reparse_cached
                else fetch_one(con, rikishi_id)
            )
            processed += 1
            print(f"[{status}] rikishi_id={rikishi_id} reason={reason}")
            report = maybe_checkpoint(con)
            upsert_etl_state(con, STOP_STATE_KEY, report["stabilityStatus"]["recommendedStopReason"])
            con.commit()

            if not args.reparse_cached and report["stabilityStatus"]["recommendedStopReason"] != "continue":
                print(f"stop reason reached: {report['stabilityStatus']['recommendedStopReason']}")
                break
            if not args.reparse_cached:
                time.sleep(args.sleep_seconds)

        report = write_collection_report(con)
        upsert_etl_state(con, STOP_STATE_KEY, report["stabilityStatus"]["recommendedStopReason"])
        con.commit()
        print(
            f"completed processed={processed} included={report['counts']['includedCount']} "
            f"pending={report['counts']['pendingCount']} stop={report['stabilityStatus']['recommendedStopReason']}"
        )
    finally:
        con.close()


if __name__ == "__main__":
    main()
