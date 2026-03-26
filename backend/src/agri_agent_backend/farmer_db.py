"""SQLite database for farmer profiles and message logging."""

import sqlite3
import os
import json
import time
from typing import Optional, Dict, Any

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "farmer_profiles.db")


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    """Create tables if they don't exist."""
    conn = _get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS farmer_profiles (
            phone_number TEXT PRIMARY KEY,
            preferred_language TEXT DEFAULT 'hi',
            farm_location TEXT,
            channel TEXT DEFAULT 'sms',
            registered_at TEXT DEFAULT (datetime('now')),
            last_active TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS message_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone_number TEXT,
            direction TEXT,
            channel TEXT,
            original_text TEXT,
            translated_text TEXT,
            response_text TEXT,
            pipeline_metadata TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (phone_number) REFERENCES farmer_profiles(phone_number)
        );
    """)
    conn.commit()
    conn.close()


# Initialize on import
init_db()


# --------------- Profile Operations ---------------

def get_or_create_farmer(phone: str, channel: str = "sms") -> Dict[str, Any]:
    """Get existing farmer profile or create new one with default Hindi."""
    conn = _get_conn()
    row = conn.execute(
        "SELECT * FROM farmer_profiles WHERE phone_number = ?", (phone,)
    ).fetchone()

    if row:
        conn.execute(
            "UPDATE farmer_profiles SET last_active = datetime('now') WHERE phone_number = ?",
            (phone,),
        )
        conn.commit()
        profile = dict(row)
    else:
        conn.execute(
            "INSERT INTO farmer_profiles (phone_number, channel) VALUES (?, ?)",
            (phone, channel),
        )
        conn.commit()
        profile = {
            "phone_number": phone,
            "preferred_language": "hi",
            "farm_location": None,
            "channel": channel,
        }

    conn.close()
    return profile


def update_language(phone: str, lang_code: str) -> str:
    """Update farmer's preferred language. Returns the language name."""
    from .agent import get_lang_info

    lang_info = get_lang_info(lang_code)
    conn = _get_conn()
    conn.execute(
        "UPDATE farmer_profiles SET preferred_language = ?, last_active = datetime('now') WHERE phone_number = ?",
        (lang_code, phone),
    )
    conn.commit()
    conn.close()
    return lang_info["name"]


def get_farmer_language(phone: str) -> str:
    """Get farmer's preferred language code. Default: 'hi'."""
    conn = _get_conn()
    row = conn.execute(
        "SELECT preferred_language FROM farmer_profiles WHERE phone_number = ?",
        (phone,),
    ).fetchone()
    conn.close()
    return row["preferred_language"] if row else "hi"


# --------------- Message Logging ---------------

def log_message(
    phone: str,
    direction: str,
    channel: str,
    original_text: str,
    translated_text: str = "",
    response_text: str = "",
    pipeline_metadata: Optional[Dict] = None,
) -> None:
    """Log an inbound or outbound message."""
    conn = _get_conn()
    conn.execute(
        """INSERT INTO message_log
        (phone_number, direction, channel, original_text, translated_text, response_text, pipeline_metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            phone,
            direction,
            channel,
            original_text,
            translated_text,
            response_text,
            json.dumps(pipeline_metadata) if pipeline_metadata else None,
        ),
    )
    conn.commit()
    conn.close()


def get_message_history(phone: str, limit: int = 10) -> list:
    """Get recent messages for a farmer."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM message_log WHERE phone_number = ? ORDER BY created_at DESC LIMIT ?",
        (phone, limit),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
