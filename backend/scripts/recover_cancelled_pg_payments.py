"""
Recover PG application-fee payments that were wrongly marked cancelled.

Run from the backend/ directory:
    python scripts/recover_cancelled_pg_payments.py
    python scripts/recover_cancelled_pg_payments.py --apply
    python scripts/recover_cancelled_pg_payments.py --days 14 --limit 50

Dry-run is the default. The script only settles a transaction when a fresh
Interswitch requery returns ResponseCode "00".

python scripts/recover_cancelled_pg_payments.py --apply
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv

load_dotenv()

from database import Database
from utils.interswitch import InterswitchClient
from utils.payment_status import (
    atomic_settle_payment,
    build_update_sql_params,
    classify_response,
    generate_receipt_no,
)


def fetch_candidates(days: int, limit: int):
    return Database.execute_query(
        """
        SELECT id, reference_no, user_id, amount_in_kobo, amount, receipt_no,
               tran_type, response_description,
               COALESCE(requery_count, 0) AS requery_count
        FROM payment_transactions
        WHERE tran_status = 'cancelled'
          AND tran_type = 'application_fee'
          AND COALESCE(response_description, '') <> 'Cancelled by user'
          AND COALESCE(raw_request_payload->>'program_type_id', '') = '2'
          AND created_at >= NOW() - (%s || ' days')::interval
        ORDER BY created_at DESC
        LIMIT %s
        """,
        (days, limit),
    ) or []


def recover_candidate(txn: dict, apply: bool):
    ref = txn["reference_no"]
    amount_kobo = txn["amount_in_kobo"] or round(float(txn["amount"] or 0) * 100)

    isw_resp = InterswitchClient.requery_transaction(ref, amount_kobo)
    response_code = str(isw_resp.get("ResponseCode", "")).strip()
    response_desc = isw_resp.get("ResponseDescription", "")
    tran_status = classify_response(response_code, int(txn["requery_count"]))

    result = {
        "reference_no": ref,
        "response_code": response_code,
        "response_desc": response_desc,
        "classified_as": tran_status,
        "settled": False,
        "updated": False,
    }

    if tran_status != "successful":
        return result

    if not apply:
        return result

    receipt_no = txn.get("receipt_no") or generate_receipt_no()
    settled = atomic_settle_payment(ref, txn["user_id"], txn["tran_type"])
    sql, params = build_update_sql_params(
        "successful",
        ref,
        response_code,
        response_desc,
        isw_resp,
        amount_kobo,
        receipt_no,
    )
    updated = Database.execute_update(sql, params)

    result["settled"] = bool(settled)
    result["updated"] = bool(updated)
    return result


def main():
    parser = argparse.ArgumentParser(
        description="Recover wrongly-cancelled PG application fee payments."
    )
    parser.add_argument("--apply", action="store_true", help="Write successful recoveries.")
    parser.add_argument("--days", type=int, default=30, help="How many recent days to scan.")
    parser.add_argument("--limit", type=int, default=100, help="Maximum rows to inspect.")
    args = parser.parse_args()

    if not args.apply:
        print("=== DRY RUN: no database changes will be made ===")

    candidates = fetch_candidates(args.days, args.limit)
    print(f"Found {len(candidates)} candidate(s).")

    summary = {
        "checked": 0,
        "successful_at_isw": 0,
        "settled": 0,
        "updated": 0,
        "still_not_successful": 0,
        "errors": 0,
    }

    for txn in candidates:
        summary["checked"] += 1
        ref = txn["reference_no"]
        try:
            result = recover_candidate(txn, args.apply)
        except Exception as exc:
            summary["errors"] += 1
            print(f"{ref}: ERROR {exc}")
            continue

        if result["classified_as"] == "successful":
            summary["successful_at_isw"] += 1
        else:
            summary["still_not_successful"] += 1

        if result["settled"]:
            summary["settled"] += 1
        if result["updated"]:
            summary["updated"] += 1

        print(
            f"{ref}: code={result['response_code']!r} "
            f"status={result['classified_as']} "
            f"settled={result['settled']} updated={result['updated']}"
        )

    print("\n=== Summary ===")
    for key, value in summary.items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
