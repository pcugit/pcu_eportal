"""
Manual Interswitch requery script.
Run from the backend/ directory:
    python scripts/requery_pending.py

Fetches all 'pending' transactions, requeries Interswitch for each,
and prints + optionally updates the DB.
"""

import sys
import os

# Allow imports from backend root
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv()

from database import Database
from utils.interswitch import InterswitchClient
import json

# Set to False to actually write updates to the DB
DRY_RUN = False

def main():
    pending = Database.execute_query(
        """SELECT id, reference_no, receipt_no, amount_in_kobo, amount,
                  tran_type, user_id
           FROM payment_transactions
           WHERE tran_status = 'pending'
           ORDER BY created_at DESC"""
    )

    if not pending:
        print("No pending transactions found.")
        return

    print(f"Found {len(pending)} pending transaction(s).\n")

    for txn in pending:
        ref         = txn['reference_no']
        amount_kobo = txn['amount_in_kobo'] or int(float(txn['amount'] or 0) * 100)
        print(f"--- {ref}  (type={txn['tran_type']}, NGN {txn['amount']}) ---")

        try:
            resp = InterswitchClient.requery_transaction(ref, amount_kobo)
        except Exception as e:
            print(f"  ERROR - Requery failed: {e}\n")
            continue

        code = str(resp.get('ResponseCode', '')).strip()
        desc = resp.get('ResponseDescription', 'N/A')
        print(f"  ResponseCode : {code}")
        print(f"  Description  : {desc}")
        print(f"  Raw          : {json.dumps(resp, indent=4)}")

        is_successful = (code == '00')
        tran_status   = 'successful' if is_successful else ('pending' if code in ('T0', '') else 'failed')
        print(f"  -> New status : {tran_status}")

        if DRY_RUN:
            print("  [DRY RUN - no DB update]\n")
            continue

        if tran_status == 'pending':
            print("  Still pending - skipping DB update.\n")
            continue

        # Update the transaction
        Database.execute_update(
            """UPDATE payment_transactions
               SET tran_status          = %s,
                   response_code        = %s,
                   response_description = %s,
                   raw_response_payload = %s::jsonb,
                   requery_count        = COALESCE(requery_count, 0) + 1,
                   payment_at    = CASE WHEN %s THEN NOW() ELSE payment_at END,
                   confirmed_at  = CASE WHEN %s THEN NOW() ELSE confirmed_at END,
                   updated_at    = NOW()
               WHERE reference_no = %s""",
            (
                tran_status,
                code, desc,
                json.dumps(resp),
                is_successful, is_successful,
                ref,
            )
        )

        # Downstream effects on success
        if is_successful:
            user_id      = txn['user_id']
            payment_type = txn['tran_type']
            if payment_type == 'application_fee':
                Database.execute_update(
                    "UPDATE users SET user_type_id = 2, updated_at = NOW() WHERE id = %s",
                    (user_id,)
                )
                print(f"  [OK] User {user_id} upgraded to applicant role.")
            elif payment_type == 'acceptance_fee':
                Database.execute_update(
                    """UPDATE applications SET applicant_stage = 'accepted', updated_at = NOW()
                       WHERE user_id = %s AND applicant_stage = 'admitted'""",
                    (user_id,)
                )
                print(f"  [OK] Application marked accepted for user {user_id}.")
            elif payment_type == 'tuition':
                Database.execute_update(
                    """UPDATE applications SET applicant_stage = 'enrolled', updated_at = NOW()
                       WHERE user_id = %s AND applicant_stage = 'accepted'""",
                    (user_id,)
                )
                print(f"  [OK] Application marked enrolled for user {user_id}.")

        print()

    print("Done.")

if __name__ == '__main__':
    main()
