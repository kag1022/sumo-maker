import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.environ.get("SUMODB_DATA_DIR", ROOT / "data"))
DB_PATH = Path(os.environ.get("SUMODB_DB_PATH", DATA_DIR / "sumodb.sqlite"))
ANALYSIS_DIR = Path(os.environ.get("SUMODB_ANALYSIS_DIR", DATA_DIR / "analysis"))
RAW_HTML_DIR = Path(os.environ.get("SUMODB_RAW_HTML_DIR", DATA_DIR / "raw_html"))
