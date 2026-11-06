"""Central configuration, loaded from environment / .env."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

HINDSIGHT_URL = os.getenv("HINDSIGHT_URL", "").strip()          # e.g. your Hindsight Cloud API URL or http://localhost:8888
HINDSIGHT_API_KEY = os.getenv("HINDSIGHT_API_KEY", "").strip() or None
BANK_PREFIX = os.getenv("NEXUS_BANK_PREFIX", "nexus")

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_FALLBACK_MODEL = os.getenv("GROQ_FALLBACK_MODEL", "qwen/qwen3-32b")

DB_PATH = Path(os.getenv("NEXUS_DB", ROOT / "data" / "nexus.db"))
DATA_DIR = ROOT / "data"
TEAMS = [t.strip() for t in os.getenv("NEXUS_TEAMS", "payments,platform").split(",") if t.strip()]
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")
