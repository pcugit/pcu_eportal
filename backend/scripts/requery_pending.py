"""
Manual Interswitch requery script.
Run from the backend/ directory:
    python scripts/requery_pending.py            # live run
    python scripts/requery_pending.py --dry-run  # print only, no DB writes

Uses the same classify_response() logic as the live server:
  - '00'           → successful
  - Z0 / T0 / ''  → pending  (never mark failed on first encounter)
  - other codes    → failed only after requery_count >= FAIL_AFTER_REQUERIES
"""

import sys
import os
import argparse

# Allow imports from backend root
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv()

from background_requery import requery_all_pending

def main():
    parser = argparse.ArgumentParser(description='Requery pending Interswitch transactions.')
    parser.add_argument('--dry-run', action='store_true',
                        help='Print what would happen without writing to DB.')
    args = parser.parse_args()

    dry_run = args.dry_run
    if dry_run:
        print('=== DRY RUN — no database changes will be made ===\n')

    summary = requery_all_pending(dry_run=dry_run)
    print('\n=== Summary ===')
    for k, v in summary.items():
        print(f'  {k}: {v}')

if __name__ == '__main__':
    main()
