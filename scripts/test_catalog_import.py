#!/usr/bin/env python3
"""Test real generated D1 import SQL against the repository's full migrations."""
import sqlite3
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent.parent
subprocess.run(["node", str(root/"scripts/generate-catalog-import.mjs")], cwd=root, check=True)
chunks = sorted((root/"frontend/.wrangler/bootstrap-sql").glob("*.sql"))
assert len(chunks) > 15 and len(chunks) < 100, len(chunks)

db = sqlite3.connect(":memory:")
for migration in sorted((root/"frontend/migrations").glob("*.sql")):
    db.executescript(migration.read_text(encoding="utf-8"))

# A manually-added feed must survive the seed, including if its number
# happens to sit ahead of the initial catalog's number range.
db.execute("""INSERT INTO blogs (id,num,name,url,feed,tags,categories,position,source_group,source_origin)
VALUES ('existing.example.com', 8000, 'My new source', 'https://existing.example.com',
'https://existing.example.com/feed', '[]', '[]', 9999, 'forum', 'manual')""")
for chunk in chunks:
    db.executescript(chunk.read_text(encoding="utf-8"))

count = db.execute("SELECT COUNT(*) FROM blogs WHERE source_origin = 'csv'").fetchone()[0]
assert count == 1609, count
assert db.execute("SELECT COUNT(DISTINCT num) FROM blogs").fetchone()[0] == 1610
assert db.execute("SELECT MIN(num) FROM blogs WHERE source_origin='csv'").fetchone()[0] > 8000
assert db.execute("SELECT name FROM blogs WHERE id='existing.example.com'").fetchone()[0] == "My new source"
assert db.execute("SELECT COUNT(*) FROM blogs WHERE source_group='blogs' AND source_origin='csv'").fetchone()[0] == 1609

# Idempotence after partial retries / repeat full import
for chunk in chunks:
    db.executescript(chunk.read_text(encoding="utf-8"))
assert db.execute("SELECT COUNT(*) FROM blogs").fetchone()[0] == 1610
assert db.execute("SELECT COUNT(DISTINCT num) FROM blogs").fetchone()[0] == 1610

# Emulate a partially completed first run; retry starts from first chunk.
fresh = sqlite3.connect(":memory:")
for migration in sorted((root/"frontend/migrations").glob("*.sql")):
    fresh.executescript(migration.read_text(encoding="utf-8"))
for chunk in chunks[:3]:
    fresh.executescript(chunk.read_text(encoding="utf-8"))
for chunk in chunks:
    fresh.executescript(chunk.read_text(encoding="utf-8"))
assert fresh.execute("SELECT COUNT(*) FROM blogs WHERE source_origin='csv'").fetchone()[0] == 1609
assert fresh.execute("SELECT COUNT(DISTINCT num) FROM blogs").fetchone()[0] == 1609

print("PASS: 1609 blogs imported via 41 bounded SQL files, safe on repeats, partial retries, and manual sources")
