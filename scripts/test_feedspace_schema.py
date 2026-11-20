#!/usr/bin/env python3
"""Validate the actual D1 migrations and retirement of Indi subscriptions."""
from pathlib import Path
import sqlite3

root = Path(__file__).resolve().parent.parent
db = sqlite3.connect(":memory:")
migrations = sorted((root / "frontend" / "migrations").glob("*.sql"))
assert migrations and migrations[-1].name == "0014_drop_aihot_cache.sql", migrations[-1].name

for file in migrations:
    if file.name == "0011_feedspace_sources.sql":
        db.execute(
            "INSERT INTO blogs (id,num,name,url,feed,tags,categories,position) VALUES (?,?,?,?,?,?,?,?)",
            ("csv.example.com", 1, "Indi original", "https://csv.example.com", "https://csv.example.com/feed", "[]", "[]", 0),
        )
    if file.name == "0012_retire_indi_catalog.sql":
        # A source adopted by an administrator is intentionally preserved.
        db.execute(
            "INSERT INTO blogs (id,num,name,url,feed,tags,categories,position,source_group,source_origin) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            ("adopted.example.com", 2, "Adopted", "https://adopted.example.com",
             "https://adopted.example.com/rss", "[]", "[]", 1, "blogs", "manual"),
        )
        db.execute("INSERT INTO posts (blog_id,url,title,published_at,first_seen_at) VALUES (?,?,?,?,?)",
                   ("csv.example.com", "https://csv.example.com/old", "Historical post", 1800000000, 1800000000))
        db.execute("INSERT INTO meta (key,value,updated_at) VALUES ('snapshot','{}',1800000000)")
    db.executescript(file.read_text(encoding="utf-8"))

original = db.execute("SELECT removed,feed,source_origin FROM blogs WHERE id='csv.example.com'").fetchone()
assert original == (1, None, "retired_catalog"), original
assert db.execute("SELECT COUNT(*) FROM posts WHERE blog_id='csv.example.com'").fetchone()[0] == 1
adopted = db.execute("SELECT removed,feed,source_group,source_origin FROM blogs WHERE id='adopted.example.com'").fetchone()
assert adopted == (0, "https://adopted.example.com/rss", "feeds", "manual"), adopted
assert db.execute("SELECT COUNT(*) FROM source_groups WHERE id='blogs'").fetchone()[0] == 0
assert db.execute("SELECT name FROM source_groups WHERE id='feeds'").fetchone()[0] == "订阅源"
assert db.execute("SELECT COUNT(*) FROM meta WHERE key='snapshot'").fetchone()[0] == 0
assert db.execute("SELECT COUNT(*) FROM blogs WHERE removed=0 AND source_origin='retired_catalog'").fetchone()[0] == 0

assert db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='aihot_cache'").fetchone() is None
print("PASS: 14 migrations; legacy feeds preserved, external AI content cache removed")
