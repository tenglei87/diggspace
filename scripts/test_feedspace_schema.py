#!/usr/bin/env python3
"""Validate D1 migrations and permanent removal of legacy site data."""
from pathlib import Path
import sqlite3

root = Path(__file__).resolve().parent.parent
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys = ON")
migrations = sorted((root / "frontend" / "migrations").glob("*.sql"))
assert migrations and migrations[-1].name == "0016_drop_retired_legacy.sql", migrations[-1].name

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

    if file.name == "0016_drop_retired_legacy.sql":
        # Legacy data exists until this migration; preserve independent RSS
        # articles while dropping account, interaction, old blog and cache data.
        original = db.execute("SELECT removed,feed,source_origin FROM blogs WHERE id='csv.example.com'").fetchone()
        assert original == (1, None, "retired_catalog"), original
        assert db.execute("SELECT COUNT(*) FROM posts WHERE blog_id='csv.example.com'").fetchone()[0] == 1
        adopted = db.execute("SELECT removed,feed,source_group,source_origin FROM blogs WHERE id='adopted.example.com'").fetchone()
        assert adopted == (0, "https://adopted.example.com/rss", "feeds", "manual"), adopted
        assert db.execute("SELECT COUNT(*) FROM source_groups WHERE id='blogs'").fetchone()[0] == 0
        assert db.execute("SELECT name FROM source_groups WHERE id='feeds'").fetchone()[0] == "订阅源"
        assert db.execute("SELECT COUNT(*) FROM meta WHERE key='snapshot'").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM blogs WHERE removed=0 AND source_origin='retired_catalog'").fetchone()[0] == 0
        db.execute("INSERT INTO users (id, username, email, created_at) VALUES (1, 'legacy', 'old@example.test', 1800000000)")
        db.execute("INSERT INTO sessions (token_hash,user_id,created_at,expires_at) VALUES ('old-token',1,1800000000,1900000000)")
        db.execute("INSERT INTO email_codes (email,code_hash,created_at,expires_at) VALUES ('old@example.test','hash',1800000000,1900000000)")
        db.execute("INSERT INTO avatars (user_id,content_type,data,updated_at) VALUES (1,'image/png',x'89504E47',1800000000)")
        db.execute("INSERT INTO follows (user_id,blog_id,created_at) VALUES (1,'csv.example.com',1800000000)")
        db.execute("INSERT INTO blocked_blogs (user_id,blog_id,created_at) VALUES (1,'csv.example.com',1800000000)")
        post_id = db.execute("SELECT id FROM posts WHERE blog_id='csv.example.com'").fetchone()[0]
        db.execute("INSERT INTO votes (user_id,post_id,created_at) VALUES (?,?,?)", (1,post_id,1800000000))
        db.execute("INSERT INTO comments (id,post_id,user_id,body,created_at) VALUES (1,?,1,'Legacy parent',1800000000)", (post_id,))
        db.execute("INSERT INTO comments (id,post_id,parent_id,user_id,body,created_at) VALUES (2,?,1,1,'Legacy reply',1800000000)", (post_id,))
        db.execute("INSERT INTO comment_votes (user_id,comment_id,created_at) VALUES (1,2,1800000000)")
        db.execute("INSERT INTO notifications (user_id,type,comment_id,created_at) VALUES (1,'reply',2,1800000000)")
        db.execute("INSERT INTO favicons (key,blog_id,data,fetched_at) VALUES ('old-icon','csv.example.com',x'01',1800000000)")
        db.execute("INSERT INTO meta (key,value,updated_at) VALUES ('legacy','secret',1800000000)")
        db.execute("""INSERT INTO news_sources (id,category,name,site_url,feed_url)
                      VALUES ('keep','hot','Keep News','https://example.org','https://example.org/rss')""")
        db.execute("""INSERT INTO news_items (source_id,url,title,published_at,first_seen_at)
                      VALUES ('keep','https://example.org/post','Keep Article',1800000000,1800000000)""")
        db.execute("INSERT INTO news_meta (key,value,updated_at) VALUES ('catalog_version','preserved',1800000000)")
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []

    db.executescript(file.read_text(encoding="utf-8"))

# Account, community and previous Indi content tables must be gone.
legacy_tables = (
    'notifications', 'comment_votes', 'votes', 'blocked_blogs', 'follows',
    'avatars', 'sessions', 'email_codes', 'comments', 'users', 'posts',
    'favicons', 'source_groups', 'meta', 'blogs',
)
existing = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
assert not (set(legacy_tables) & existing), set(legacy_tables) & existing
assert {'news_sources', 'news_items', 'news_meta'}.issubset(existing), existing
assert 'aihot_cache' not in existing
assert db.execute("SELECT COUNT(*) FROM news_sources").fetchone()[0] == 1
assert db.execute("SELECT COUNT(*) FROM news_items").fetchone()[0] == 1
assert db.execute("SELECT title FROM news_items").fetchone()[0] == 'Keep Article'
assert db.execute("SELECT value FROM news_meta WHERE key='catalog_version'").fetchone()[0] == 'preserved'
assert db.execute("PRAGMA foreign_key_check").fetchall() == []
print("PASS: 16 migrations; 15 retired tables dropped; all independent news tables and rows preserved")
