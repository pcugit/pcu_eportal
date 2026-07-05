"""
Migration: Add qualification_type, qualification_institution, qualification_year
to the academic_qualification table (and biodata as a fallback).
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from database import Database

def run():
    print("Running migration...")

    # 1. academic_qualification
    r1 = Database.execute_update("""
        ALTER TABLE academic_qualification
        ADD COLUMN IF NOT EXISTS qualification_type        TEXT,
        ADD COLUMN IF NOT EXISTS qualification_institution TEXT,
        ADD COLUMN IF NOT EXISTS qualification_year        TEXT
    """)
    print("academic_qualification ALTER:", r1)

    # 2. biodata (belt-and-suspenders; these may already exist on live)
    r2 = Database.execute_update("""
        ALTER TABLE biodata
        ADD COLUMN IF NOT EXISTS qualification_type        TEXT,
        ADD COLUMN IF NOT EXISTS qualification_institution TEXT,
        ADD COLUMN IF NOT EXISTS qualification_year        TEXT
    """)
    print("biodata ALTER:", r2)

    # 3. Verify
    cols = Database.execute_query(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = 'academic_qualification' ORDER BY ordinal_position",
        ()
    )
    names = [c["column_name"] for c in (cols or [])]
    print("academic_qualification columns:", names)

    for expected in ("qualification_type", "qualification_institution", "qualification_year"):
        status = "OK" if expected in names else "MISSING"
        print(f"  {expected}: {status}")

if __name__ == "__main__":
    run()
