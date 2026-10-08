import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

REPORTS_DIR = ROOT / "reports"
REPORTS_DIR.mkdir(exist_ok=True)


def env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


GROQ_API_KEY = env("GROQ_API_KEY")
GROQ_MODEL = env("GROQ_MODEL", "llama-3.3-70b-versatile")

SMTP_HOST = env("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(env("SMTP_PORT", "465"))
SMTP_USER = env("SMTP_USER")
# Google shows app passwords with spaces; strip them.
SMTP_PASSWORD = env("SMTP_PASSWORD").replace(" ", "")
MAIL_FROM_NAME = env("MAIL_FROM_NAME", "WebScope")


def mail_configured() -> bool:
    return bool(SMTP_USER and SMTP_PASSWORD)
