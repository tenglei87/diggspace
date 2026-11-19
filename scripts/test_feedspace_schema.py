#!/usr/bin/env python3
"""Offline migration check using the exact SQL files included with the project."""
from pathlib import Path
import sqlite3

root = Path(__file__).resolve().parent.parent
conn = sqlite3.connect(":memory:")
migrations = sorted((root / "frontend" / "migrations").glob("*.sql"))
assert migrations and migrations[-1].name == "0011_feedspace_sources.sql", "Unexpected migrations"
for path in migrations:
    if path.name == "0011_feedspace_sources.sql":
        conn.execute(
            "INSERT INTO blogs (id, num, name, url, feed, tags, categories, position) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            ("example.com", 1, "Original blog", "https://example.com", "https://example.com/feed",
             "[]", "[]", 0),
        )
    conn.executescript(path.read_text(encoding="utf-8"))

row = conn.execute("SELECT source_group, source_origin FROM blogs WHERE id='example.com'").fetchone()
assert row == ("blogs", "csv"), row
assert conn.execute("SELECT name FROM source_groups WHERE id='blogs'").fetchone()[0] == "独立博客"
conn.execute("INSERT INTO source_groups VALUES ('forum', '论坛社区', 10)")
conn.execute(
    "INSERT INTO blogs (id, num, name, url, feed, tags, categories, position, source_group, source_origin) "
    "VALUES ('forum.example.com', 2, 'Forum', 'https://forum.example.com', "
    "'https://forum.example.com/rss', '[]', '[]', 1, 'forum', 'manual')"
)
assert conn.execute("SELECT source_origin FROM blogs WHERE num=2").fetchone()[0] == "manual"
print("PASS: all D1 SQL migrations apply; legacy and manual source groups coexist")
