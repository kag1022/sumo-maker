"""sumo-api.com への HTTP クライアント。

API アクセスルール:
  1. リクエスト間隔 1.0 秒以上
  2. HTTP エラー時は指数バックオフ（1s, 2s, 4s, 8s, 16s）
  3. 404 や空レスポンスは None を返し、呼び出し側でレポートに記録
"""

import json
import ssl
import time
import urllib.request
import urllib.error

API_BASE = "https://sumo-api.com/api"
_MIN_INTERVAL = 1.0
_MAX_RETRIES = 4
_BACKOFF_BASE = 1.0

_last_call = 0.0


def _rate_limit():
    global _last_call
    now = time.monotonic()
    wait = _MIN_INTERVAL - (now - _last_call)
    if wait > 0:
        time.sleep(wait)
    _last_call = time.monotonic()


def _fetch(url: str, timeout: int) -> tuple[int, dict | list | None]:
    """内部: 単一リクエスト。"""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
        body = resp.read()
        data = json.loads(body)
        return resp.status, data


def get_json(path: str, timeout: int = 30) -> dict | list | None:
    """API から JSON を取得する。404/空/エラー時は None。

    指数バックオフ: 1s → 2s → 4s → 8s → 16s（最大5回試行）。
    """
    url = f"{API_BASE}{path}"
    _rate_limit()

    for attempt in range(_MAX_RETRIES + 1):
        try:
            status, data = _fetch(url, timeout)
            if data is None:
                return None
            return data
        except urllib.error.HTTPError as e:
            # 404 はリトライしない
            if e.code == 404:
                return None
            if attempt == _MAX_RETRIES:
                return None
            wait = _BACKOFF_BASE * (2 ** attempt)
            time.sleep(wait)
        except Exception:
            if attempt == _MAX_RETRIES:
                return None
            wait = _BACKOFF_BASE * (2 ** attempt)
            time.sleep(wait)

    return None


def get_json_detailed(path: str, timeout: int = 30) -> dict:
    """get_json の詳細版。成功/失敗のメタ情報付き。

    Returns:
      {"ok": bool, "httpStatus": int, "data": dict|list|None, "error": str|None, "retries": int}
    """
    url = f"{API_BASE}{path}"
    _rate_limit()

    for attempt in range(_MAX_RETRIES + 1):
        try:
            status, data = _fetch(url, timeout)
            if data is None:
                return {"ok": False, "httpStatus": status, "data": None, "error": "null response", "retries": attempt}
            return {"ok": True, "httpStatus": status, "data": data, "error": None, "retries": attempt}
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {"ok": False, "httpStatus": 404, "data": None, "error": f"HTTP 404", "retries": attempt}
            if attempt == _MAX_RETRIES:
                return {"ok": False, "httpStatus": e.code, "data": None, "error": f"HTTP {e.code}", "retries": attempt}
            time.sleep(_BACKOFF_BASE * (2 ** attempt))
        except Exception as e:
            if attempt == _MAX_RETRIES:
                return {"ok": False, "httpStatus": -1, "data": None, "error": str(e)[:200], "retries": attempt}
            time.sleep(_BACKOFF_BASE * (2 ** attempt))

    return {"ok": False, "httpStatus": -1, "data": None, "error": "max retries", "retries": _MAX_RETRIES}
