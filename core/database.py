"""
SQLite Database Module for saving, retrieving, and managing generated smart lecture notes.
"""

import sqlite3
import json
import os
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from contextlib import contextmanager

class NotesDatabase:
    def __init__(self, db_path: Optional[str] = None):
        if db_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            db_path = os.path.join(base_dir, "notes.db")
        self.db_path = db_path
        self._init_db()

    @contextmanager
    def _connection(self):
        conn = sqlite3.connect(self.db_path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA busy_timeout = 5000;")
        conn.execute("PRAGMA foreign_keys = ON;")
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_db(self):
        with self._connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS notes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    video_id TEXT NOT NULL,
                    video_url TEXT NOT NULL,
                    title TEXT NOT NULL,
                    channel TEXT,
                    thumbnail_url TEXT,
                    duration_formatted TEXT,
                    note_style TEXT DEFAULT 'comprehensive',
                    notes_markdown TEXT NOT NULL,
                    notes_html TEXT,
                    flashcards_json TEXT,
                    quiz_json TEXT,
                    mindmap_mermaid TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_video_id ON notes(video_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_created_at ON notes(created_at DESC)")

    def save_note(self, note_data: Dict[str, Any]) -> int:
        with self._connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO notes (
                    video_id, video_url, title, channel, thumbnail_url,
                    duration_formatted, note_style, notes_markdown, notes_html,
                    flashcards_json, quiz_json, mindmap_mermaid, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                note_data.get("video_id", ""),
                note_data.get("video_url", ""),
                note_data.get("title", "Untitled Lecture"),
                note_data.get("channel", "YouTube"),
                note_data.get("thumbnail_url", ""),
                note_data.get("duration_formatted", "00:00"),
                note_data.get("note_style", "comprehensive"),
                note_data.get("notes_markdown", ""),
                note_data.get("notes_html", ""),
                json.dumps(note_data.get("flashcards", [])),
                json.dumps(note_data.get("quiz", [])),
                note_data.get("mindmap_mermaid", ""),
                datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
            ))
            return cursor.lastrowid

    def get_note_by_id(self, note_id: int) -> Optional[Dict[str, Any]]:
        with self._connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM notes WHERE id = ?", (note_id,))
            row = cursor.fetchone()
            if row:
                return self._row_to_dict(row)
            return None

    def get_latest_by_video_id(self, video_id: str, note_style: str = "comprehensive") -> Optional[Dict[str, Any]]:
        with self._connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM notes WHERE video_id = ? AND note_style = ? ORDER BY id DESC LIMIT 1",
                (video_id, note_style)
            )
            row = cursor.fetchone()
            if row:
                return self._row_to_dict(row)
            return None

    def get_recent_notes(self, limit: int = 15) -> List[Dict[str, Any]]:
        with self._connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, video_id, title, channel, thumbnail_url, duration_formatted, note_style, created_at
                FROM notes ORDER BY id DESC LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    def search_notes(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        with self._connection() as conn:
            cursor = conn.cursor()
            wildcard = f"%{query.strip()}%"
            cursor.execute("""
                SELECT id, video_id, title, channel, thumbnail_url, duration_formatted, note_style, created_at
                FROM notes 
                WHERE title LIKE ? OR channel LIKE ? OR notes_markdown LIKE ?
                ORDER BY id DESC LIMIT ?
            """, (wildcard, wildcard, wildcard, limit))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    def delete_note(self, note_id: int) -> bool:
        with self._connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM notes WHERE id = ?", (note_id,))
            return cursor.rowcount > 0

    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        data = dict(row)
        try:
            data["flashcards"] = json.loads(data.get("flashcards_json") or "[]")
        except Exception:
            data["flashcards"] = []
        try:
            data["quiz"] = json.loads(data.get("quiz_json") or "[]")
        except Exception:
            data["quiz"] = []
        return data
