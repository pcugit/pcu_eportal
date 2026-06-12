import os
import sys
import argparse
import json
from datetime import datetime

# Add parent directory to sys.path so we can import database helper
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import Database

TYPE_CODES = {
    'application_fee': 'APP',
    'acceptance_fee':  'ACC',
    'tuition':         'TUI',
}

session_cache = {}

def resolve_session_label(session_id, created_at):
    if not session_id:
        return str(created_at.year) if created_at else str(datetime.now().year)
    if session_id in session_cache:
        return session_cache[session_id]
    
    sess_res = Database.execute_query(
        'SELECT name FROM academic_sessions WHERE id = %s LIMIT 1',
        (session_id,)
    )
    if sess_res and sess_res[0].get('name'):
        raw = sess_res[0]['name'].strip()
        if '/' in raw:
            parts = raw.split('/')
            if len(parts) == 2:
                start, end = parts[0].strip(), parts[1].strip()
                if len(end) == 4:
                    end = end[2:]
                raw = f"{start}-{end}"
        session_cache[session_id] = raw
        return raw
    
    fallback = str(created_at.year) if created_at else str(datetime.now().year)
    session_cache[session_id] = fallback
    return fallback

def migrate(commit=False):
    print("Connecting to database and inspecting existing receipts...")
    
    # 1. Fetch any existing new-format receipt numbers to find max sequence per prefix
    # We escape % as %% for psycopg2 query string
    existing_new = Database.execute_query(
        "SELECT receipt_no FROM payment_transactions WHERE receipt_no LIKE 'PCU/%%'"
    )
    
    max_sequence = {}
    if existing_new:
        for row in existing_new:
            rno = row['receipt_no']
            # Expected format: PCU/TYPE/SESSION/COUNTER e.g. PCU/ACC/2025-26/000247
            parts = rno.split('/')
            if len(parts) == 4:
                prefix = "/".join(parts[:3])  # PCU/ACC/2025-26
                try:
                    seq = int(parts[3])
                    if seq > max_sequence.get(prefix, 0):
                        max_sequence[prefix] = seq
                except ValueError:
                    pass
    
    if max_sequence:
        print(f"Loaded {len(max_sequence)} existing prefixes with their max sequences:")
        for pref, max_seq in max_sequence.items():
            print(f"  - {pref}: starts at sequence {max_seq + 1}")
    else:
        print("No receipt numbers already exist in the new format.")

    # 2. Fetch all old-format receipts to migrate (ordered by created_at to preserve chronological sequence)
    to_migrate = Database.execute_query(
        "SELECT id, receipt_no, tran_type, academic_session_id, created_at "
        "FROM payment_transactions "
        "WHERE receipt_no IS NOT NULL AND receipt_no NOT LIKE 'PCU/%%' "
        "ORDER BY created_at ASC"
    )
    
    if not to_migrate:
        print("No receipt numbers require transformation (0 records found).")
        return

    print(f"\nFound {len(to_migrate)} receipt numbers to transform.")

    migrations = []
    prefix_counts = {}
    
    # Calculate target receipt numbers
    for row in to_migrate:
        row_id = row['id']
        old_rno = row['receipt_no']
        tran_type = row['tran_type']
        session_id = row['academic_session_id']
        created_at = row['created_at']
        
        type_code = TYPE_CODES.get((tran_type or '').lower(), 'PAY')
        session_label = resolve_session_label(session_id, created_at)
        prefix = f"PCU/{type_code}/{session_label}"
        
        if prefix not in max_sequence:
            max_sequence[prefix] = 0
            
        max_sequence[prefix] += 1
        new_seq = max_sequence[prefix]
        new_rno = f"{prefix}/{new_seq:06d}"
        
        migrations.append((row_id, old_rno, new_rno))
        prefix_counts[prefix] = prefix_counts.get(prefix, 0) + 1

    # Print summary of proposed changes
    print("\nProposed breakdown of migrated receipts:")
    for pref, count in prefix_counts.items():
        start_seq = max_sequence[pref] - count + 1
        end_seq = max_sequence[pref]
        print(f"  - {pref}: {count} records (sequences {start_seq:06d} to {end_seq:06d})")

    print("\nSample migrations (first 10):")
    for row_id, old, new in migrations[:10]:
        print(f"  {old}  -->  {new}")

    if len(migrations) > 20:
        print("  ...")
        print("Sample migrations (last 10):")
        for row_id, old, new in migrations[-10:]:
            print(f"  {old}  -->  {new}")

    # Generate mapping log to be saved on disk
    log_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "migration_mapping.json")
    mapping_data = {old: new for _, old, new in migrations}
    try:
        with open(log_file, "w") as f:
            json.dump(mapping_data, f, indent=2)
        print(f"\nSaved mapping audit log of old-to-new receipt numbers to '{log_file}'")
    except Exception as e:
        print(f"\nWarning: Could not save mapping log: {e}")

    if not commit:
        print("\n*** DRY-RUN ONLY ***")
        print("No changes were made to the database.")
        print("To apply these changes permanently to the database, run this script with --commit:")
        print("  python scripts/transform_receipts.py --commit")
        return

    print(f"\nApplying updates to the database (updating {len(migrations)} records)...")
    
    # Run updates in a single atomic transaction
    success = False
    try:
        with Database.get_cursor() as cursor:
            for row_id, old, new in migrations:
                cursor.execute(
                    "UPDATE payment_transactions SET receipt_no = %s WHERE id = %s",
                    (new, row_id)
                )
        success = True
        print("\nDatabase migration completed successfully!")
        print("All receipt numbers have been transformed.")
    except Exception as e:
        print(f"\nError occurred during database update: {e}")
        print("Database transaction has been rolled back. No changes were saved.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Transform old payment receipt numbers to the new format.")
    parser.add_argument("--commit", action="store_true", help="Actually write the changes to the database.")
    args = parser.parse_args()
    
    migrate(commit=args.commit)
