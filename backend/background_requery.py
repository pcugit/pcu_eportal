"""
background_requery.py — Background worker that periodically requeries
pending Interswitch transactions and resolves them.

Started automatically when the Flask app boots (see app.py).
Uses only stdlib threading — no extra dependencies required.

Schedule:
  - Every 5 minutes: requery all 'pending' / 'requery_error' transactions
    that are <= 24 hours old.
  - Logs a WARNING for any transaction pending > STALE_THRESHOLD_MINUTES.
  - Marks 'failed' only after requery_count reaches FAIL_AFTER_REQUERIES.
"""

import threading
import time
import json
import logging

logger = logging.getLogger('payment_requery')
logger.setLevel(logging.INFO)

# ── How often to run (seconds) ────────────────────────────────────────────────
POLL_INTERVAL_SECONDS = 5 * 60   # 5 minutes

# ── Imported lazily inside the worker so we don't import at module load time ──
_started = False
_lock    = threading.Lock()


# ─────────────────────────────────────────────────────────────────────────────
# Core requery logic (also imported by the manual script)
# ─────────────────────────────────────────────────────────────────────────────

def requery_all_pending(dry_run: bool = False) -> dict:
    """
    Fetch all unresolved transactions and requery each one.

    Returns a summary dict: {total, resolved_success, resolved_failed,
                              still_pending, errors, stale_alerts}.
    """
    from database import Database
    from utils.interswitch import InterswitchClient
    from utils.payment_status import (
        classify_response,
        apply_downstream_success,
        build_update_sql_params,
        generate_receipt_no,
        FAIL_AFTER_REQUERIES,
        STALE_THRESHOLD_MINUTES,
    )

    summary = dict(total=0, resolved_success=0, resolved_failed=0,
                   still_pending=0, errors=0, stale_alerts=0)

    pending = Database.execute_query(
        """SELECT id, reference_no, receipt_no, amount_in_kobo, amount,
                  tran_type, user_id,
                  COALESCE(requery_count, 0)  AS requery_count,
                  EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 AS age_minutes
           FROM payment_transactions
           WHERE tran_status IN ('pending', 'requery_error')
             AND created_at >= NOW() - INTERVAL '24 hours'
           ORDER BY created_at ASC"""
    )

    if not pending:
        return summary

    summary['total'] = len(pending)

    for txn in pending:
        ref           = txn['reference_no']
        amount_kobo   = txn['amount_in_kobo'] or int(float(txn['amount'] or 0) * 100)
        requery_count = int(txn['requery_count'])
        age_minutes   = float(txn['age_minutes'] or 0)
        payment_type  = txn['tran_type']
        user_id       = txn['user_id']

        
        if age_minutes > STALE_THRESHOLD_MINUTES:
            if not dry_run:
                Database.execute_update(
                    """UPDATE payment_transactions
                       SET tran_status = 'failed',
                           response_description = 'Transaction expired (stale pending)',
                           updated_at = NOW()
                       WHERE reference_no = %s""",
                    (ref,)
                )
            summary['resolved_failed'] += 1
            continue

        # ── Requery Interswitch ───────────────────────────────────────────────
        try:
            isw_resp = InterswitchClient.requery_transaction(ref, amount_kobo)
        except Exception as exc:
            logger.error(f'[requery_worker] Requery network error for {ref}: {exc}')
            if not dry_run:
                Database.execute_update(
                    """UPDATE payment_transactions
                       SET tran_status    = 'requery_error',
                           requery_count  = COALESCE(requery_count, 0) + 1,
                           updated_at     = NOW()
                       WHERE reference_no = %s""",
                    (ref,)
                )
            summary['errors'] += 1
            continue

        response_code = str(isw_resp.get('ResponseCode', '')).strip()
        response_desc = isw_resp.get('ResponseDescription', '')
        tran_status   = classify_response(response_code, requery_count)


        if dry_run:
            if tran_status == 'pending':
                summary['still_pending'] += 1
            elif tran_status == 'successful':
                summary['resolved_success'] += 1
            else:
                summary['resolved_failed'] += 1
            continue

        # ── Write to DB ───────────────────────────────────────────────────────
        receipt_no = txn['receipt_no'] or (generate_receipt_no() if tran_status == 'successful' else None)
        sql, params = build_update_sql_params(
            tran_status, ref, response_code, response_desc,
            isw_resp, amount_kobo, receipt_no,
        )
        Database.execute_update(sql, params)

        if tran_status == 'successful':
            from utils.payment_status import atomic_settle_payment
            if atomic_settle_payment(ref, user_id, payment_type):
                logger.info(
                    f'[requery_worker] SUCCESS: {ref} | type={payment_type} | user={user_id}'
                )
                summary['resolved_success'] += 1
            else:
                logger.info(f'[requery_worker] Already settled by another handler: {ref}')
                summary['resolved_success'] += 1

        elif tran_status == 'failed':
            logger.warning(
                f'[requery_worker] FAILED: {ref} | code={response_code} | '
                f'requery_count={requery_count + 1}'
            )
            summary['resolved_failed'] += 1

        else:  
            summary['still_pending'] += 1

    logger.info(f'[requery_worker] Run complete: {summary}')
    return summary


# ─────────────────────────────────────────────────────────────────────────────
# Background thread
# ─────────────────────────────────────────────────────────────────────────────

def _worker_loop():
    while True:
        try:
            requery_all_pending()
        except Exception as exc:
            logger.exception(f'[requery_worker] Unhandled error in worker loop: {exc}')
        time.sleep(POLL_INTERVAL_SECONDS)


def start_background_worker():
    global _started
    with _lock:
        if _started:
            return
        thread = threading.Thread(target=_worker_loop, name='payment-requery', daemon=True)
        thread.start()
        _started = True
