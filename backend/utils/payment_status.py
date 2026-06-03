from database import Database
from utils.auth import AuthHandler
import json
import secrets
import string
from datetime import datetime

# ── Tunable constants ─────────────────────────────────────────────────────────

# Codes Interswitch returns when user cancels with no transaction made
CANCELLED_CODES = {'Z0', 'Z9', ''}

# Codes that mean "not processed yet or transient status – try again later"
# These should NEVER be marked failed, even after multiple requeries
PENDING_CODES = {'T0', 'T03', 'Z62', 'Z25', '99', '96', 'Z16'}

# Definitive failure codes — only these should cause IMMEDIATE failure
# These represent permanent declines (not transient network/timeout issues)
DEFINITIVE_FAILURE_CODES = {
    'Z6',   # Declined by card issuer
    'T9',   # Transaction declined
    '91',   # Issuer unavailable (permanent)
    'Z23',  # Invalid card
    'Z28',  # Transaction not permissible
}

# Only flip status to 'failed' after this many confirmed non-success requeries.
# Note: Codes in PENDING_CODES are never marked failed by count.
FAIL_AFTER_REQUERIES = 3

# Minutes after creation before a still-pending transaction is considered stale
STALE_THRESHOLD_MINUTES = 60


# ── Core classifier ───────────────────────────────────────────────────────────

def generate_receipt_no() -> str:
    """pcu-{YYYYMMDD}-{16 hex chars uppercase}"""
    return f"pcu-{datetime.now().strftime('%Y%m%d')}-{secrets.token_hex(8).upper()}"


def classify_response(response_code: str, current_requery_count: int) -> str:
    """
    Return the tran_status to write, given the Interswitch ResponseCode.
    
    CRITICAL: Default to 'pending' for unknown codes, NOT 'failed'.
    Only mark as 'failed' if we have a definitive failure code OR we've
    exhausted retries with non-pending codes.
    
    This prevents the bug where a timeout causes FAILED when ISW eventually settles.

    Params
    ------
    response_code        : raw ResponseCode from Interswitch (may be None/empty)
    current_requery_count: the requery_count value already in the DB row

    Returns
    -------
    'successful' | 'cancelled' | 'pending' | 'failed'
    """
    code = (response_code or '').strip()

    # Successful payment
    if code == '00':
        return 'successful'

    # User cancelled on gateway (empty response, no transaction made)
    if code in CANCELLED_CODES:
        return 'cancelled'

    # Transient/processing codes — NEVER mark as failed, always PENDING
    if code in PENDING_CODES:
        return 'pending'

    # Definitive failure codes — mark failed immediately
    if code in DEFINITIVE_FAILURE_CODES:
        return 'failed'

    # ✅ CRITICAL FIX: Unknown codes default to PENDING, not FAILED
    # Better to keep retrying than to incorrectly mark as failed
    # (Unknown codes may be new ISW codes not in our enum yet)
    return 'pending'


# ── Application row creation (post-payment) ──────────────────────────────────

def _prog_code_from_id(pt_id) -> str:
    """Return a short uppercase code for a program_type (e.g. UTME, PG, DE)."""
    res  = Database.execute_query('SELECT name FROM program_types WHERE id = %s', (pt_id,))
    name = (res[0]['name'] if res else '').upper()
    TYPE_MAP = {
        'UTME':         'UTME',
        'POSTGRADUATE': 'PG',
        'DIRECT':       'DE',
        'JUPEB':        'JUP',
        'PART':         'PT',
        'HND':          'HND',
    }
    for key, code in TYPE_MAP.items():
        if key in name:
            return code
    letters = ''.join(c for c in name if c.isalpha())
    return letters[:4] if letters else 'APP'


def _create_application_row_on_success(user_id: int, reference_no: str):
    txn_res = Database.execute_query(
        '''SELECT raw_request_payload, academic_session_id
           FROM payment_transactions
           WHERE reference_no = %s
           ORDER BY created_at DESC LIMIT 1''',
        (reference_no,)
    )
    if not txn_res:
        return

    txn             = txn_res[0]
    session_id      = txn.get('academic_session_id')
    raw_payload     = txn.get('raw_request_payload') or {}
    if isinstance(raw_payload, str):
        try:
            raw_payload = json.loads(raw_payload)
        except Exception:
            raw_payload = {}

    program_type_id = raw_payload.get('program_type_id')
    if not program_type_id or not session_id:
        return

    # Check if a row already exists for this user + prog_type + session
    existing = Database.execute_query(
        '''SELECT id, application_payment_reference
           FROM applications
           WHERE user_id = %s AND prog_type = %s AND academic_session_id = %s''',
        (user_id, program_type_id, session_id)
    )
    if existing:
        # Row already exists — update the reference so it stays linked
        Database.execute_update(
            '''UPDATE applications
               SET application_payment_reference = %s, updated_at = NOW()
               WHERE id = %s''',
            (reference_no, existing[0]['id'])
        )
        return

    # Generate a unique form_no
    year = datetime.now().year
    code = _prog_code_from_id(program_type_id)
    while True:
        suffix  = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))
        form_no = f"PCU/{year}/{code}{suffix}"
        if not Database.execute_query(
            'SELECT id FROM applications WHERE form_no = %s', (form_no,)
        ):
            break

    Database.execute_update(
        '''INSERT INTO applications
               (user_id, form_no, prog_type, academic_session_id,
                applicant_stage, application_payment_reference)
           VALUES (%s, %s, %s, %s, %s, %s)''',
        (user_id, form_no, program_type_id, session_id, 'started', reference_no)
    )


# ── Downstream business effects ───────────────────────────────────────────────

def apply_downstream_success(user_id: int, payment_type: str, reference_no: str | None = None) -> None:
    """
    Apply business-logic side-effects of a confirmed successful payment.
    Centralised here so verify_payment, payment_webhook, and the background
    worker all use identical logic.

    Role-promotion rules:
      application_fee  → create application row + form_no, promote user_type_id = 2 (applicant)
      acceptance_fee   → applicant_stage = 'accepted'
                         user_type_id = 13 (admitted — limited student portal)
      tuition          → applicant_stage = 'enrolled'
                         user_type_id = student role (looked up from DB)
                         INSERT into students with current_level_id resolved from
                         degree_program → program_types → level_id
    """
    if payment_type == 'application_fee':
        # ── Create the application row (form_no) only on confirmed success ────
        if reference_no is not None:
            _create_application_row_on_success(user_id, reference_no)

        Database.execute_update(
            "UPDATE users SET user_type_id = 2, updated_at = NOW() WHERE id = %s",
            (user_id,)
        )

    elif payment_type == 'acceptance_fee':
        # Mark application as accepted
        Database.execute_update(
            """UPDATE applications
               SET applicant_stage = 'accepted', updated_at = NOW()
               WHERE user_id = %s AND applicant_stage = 'admitted'""",
            (user_id,)
        )
        # Promote user to 'admitted' role (id=13) — stays on applicant portal
        Database.execute_update(
            "UPDATE users SET user_type_id = 13, updated_at = NOW() WHERE id = %s",
            (user_id,)
        )

    elif payment_type == 'tuition':
        # Mark application as enrolled
        Database.execute_update(
            """UPDATE applications
               SET applicant_stage = 'enrolled', updated_at = NOW()
               WHERE user_id = %s AND applicant_stage = 'accepted'""",
            (user_id,)
        )
        # Promote to full student role (user_type_id = 7)
        Database.execute_update(
            "UPDATE users SET user_type_id = 7, updated_at = NOW() WHERE id = %s",
            (user_id,)
        )

        # ── Fetch user + application + biodata ───────────────────────────────
        user_data = Database.execute_query(
            '''SELECT u.surname, u.firstname, u.email, u.phone_number,
                      a.degree_id, a.prog_type, a.program_setup_id, a.level_id,
                      b.middle_name, b.address, b.gender, b.date_of_birth,
                      b.marital_status, b.nationality, b.state, b.lga
               FROM users u
               LEFT JOIN applications a ON a.user_id = u.id AND a.applicant_stage = 'enrolled'
               LEFT JOIN biodata b ON b.id = a.bio_data_id
               WHERE u.id = %s
               ORDER BY a.updated_at DESC LIMIT 1''',
            (user_id,)
        )

        if user_data:
            ud = user_data[0]

            # Check if student already exists — avoid duplicate inserts
            existing_student = Database.execute_query(
                'SELECT "Id" FROM students WHERE "UserId" = %s', (user_id,)
            )
            if not existing_student:
                year_of_entry = str(datetime.now().year)

                # Ensure non-nullable fields are never empty
                last_name  = ud['surname']   if ud['surname']   else 'Unknown'
                first_name = ud['firstname'] if ud['firstname'] else 'Unknown'
                email      = ud['email']     if ud['email']     else f'user{user_id}@example.com'

                # ── Resolve entry level from applications.level_id (with fallback to program_types.level_id) ──
                entry_level_id = ud.get('level_id')
                if not entry_level_id:
                    prog_type = ud.get('prog_type')
                    if prog_type:
                        level_res = Database.execute_query(
                            'SELECT level_id FROM program_types WHERE id = %s',
                            (prog_type,)
                        )
                        if level_res:
                            entry_level_id = level_res[0]['level_id']

                # ── Resolve department name via program_setup → departments ──
                department_name = None
                ps_id = ud.get('program_setup_id')
                if ps_id:
                    dept_res = Database.execute_query(
                        '''SELECT d.name FROM program_setup ps
                           JOIN departments d ON d.id = ps.department_id
                           WHERE ps.id = %s''',
                        (ps_id,)
                    )
                    if dept_res:
                        department_name = dept_res[0]['name']

                # ── Generate a unique MatricNo: PCU/YYYY/XXXXXX ───────────────
                while True:
                    suffix    = ''.join(secrets.choice(string.digits) for _ in range(6))
                    matric_no = f"PCU/{year_of_entry}/{suffix}"
                    clash = Database.execute_query(
                        'SELECT "Id" FROM students WHERE "MatricNo" = %s', (matric_no,)
                    )
                    if not clash:
                        break

                # Set default password to surname (lowercase) for first student portal login;
                # is_first_login in student_auth will force a password change.
                default_password = (last_name or '').strip().lower() or matric_no.lower()
                hashed_password = AuthHandler.hash_password(default_password)
                Database.execute_update(
                    'UPDATE users SET matric_no = %s, password_hash = %s, updated_at = NOW() WHERE id = %s',
                    (matric_no, hashed_password, user_id)
                )

                Database.execute_update(
                    '''INSERT INTO students (
                           "LastName", "FirstName", "OtherName", "Email", "MobileNumber",
                           "Address", "Gender", "DOB", "MaritalStatus", "Nationality",
                           "State", "LGA", "MatricNo",
                           "UserId", "CurrentUserId", "DegreeId", department, "YearOfEntry", "IsGraduate",
                           current_level_id,
                           "CreatedDate", "UpdatedDate"
                       ) VALUES (
                           %s, %s, %s, %s, %s,
                           %s, %s, %s, %s, %s,
                           %s, %s, %s,
                           %s, %s, %s, %s, %s, %s,
                           %s,
                           NOW(), NOW()
                       )''',
                    (
                        last_name, first_name, ud['middle_name'], email, ud['phone_number'],
                        ud['address'], ud['gender'], ud['date_of_birth'], ud['marital_status'], ud['nationality'],
                        ud['state'], ud['lga'], matric_no,
                        user_id, user_id, ud['degree_id'], department_name, year_of_entry, False,
                        entry_level_id,
                    )
                )
                student_row = Database.execute_query(
                    'SELECT "Id" as id FROM students WHERE "UserId" = %s ORDER BY "CreatedDate" DESC LIMIT 1',
                    (user_id,)
                )
                if student_row:
                    student_id = student_row[0]['id']
                    Database.execute_update(
                        '''INSERT INTO student_auth (userid, studentid, is_first_login, last_login, failed_attempts, locked_until, createddate, updateddate)
                           VALUES (%s, %s, TRUE, NULL, 0, NULL, NOW(), NOW())
                           ON CONFLICT (userid) DO NOTHING''',
                        (user_id, student_id)
                    )


# ── Shared DB update helper ───────────────────────────────────────────────────

def build_update_sql_params(
    tran_status: str,
    reference_no: str,
    response_code: str,
    response_desc: str,
    isw_resp: dict,
    amount_kobo: int,
    receipt_no: str | None = None,
) -> tuple:
    """
    Build the (sql, params) tuple that updates a payment_transactions row.
    Used by verify_payment, payment_webhook, and the background worker so the
    SQL is never duplicated.
    """
    is_successful    = (tran_status == 'successful')
    amount_paid_kobo = isw_resp.get('Amount', amount_kobo)
    amount_paid      = float(amount_paid_kobo) / 100 if amount_paid_kobo else None
    is_mismatch      = (amount_paid_kobo != amount_kobo) if amount_paid_kobo else False
    payment_method   = (isw_resp.get('PaymentMethodCode') or '').upper() or None
    card_number      = isw_resp.get('CardNumber') or None
    bank_code        = isw_resp.get('BankCode')   or None
    bank_name        = isw_resp.get('BankName')   or None

    sql = '''UPDATE payment_transactions
               SET tran_status          = %s,
                   tran_ref             = %s,
                   response_code        = %s,
                   response_description = %s,
                   amount_paid          = %s,
                   amount_paid_in_kobo  = %s,
                   is_amount_mismatch   = %s,
                   payment_method       = %s,
                   card_number          = %s,
                   bank_code            = %s,
                   bank_name            = %s,
                   raw_response_payload = %s::jsonb,
                   requery_count        = COALESCE(requery_count, 0) + 1,
                   payment_at    = CASE WHEN %s THEN NOW() ELSE payment_at END,
                   confirmed_at  = CASE WHEN %s THEN NOW() ELSE confirmed_at END,
                   receipt_no    = CASE WHEN %s THEN COALESCE(receipt_no, %s) ELSE receipt_no END,
                   updated_at    = NOW()
               WHERE reference_no = %s'''

    params = (
        tran_status, reference_no,
        response_code, response_desc,
        amount_paid, amount_paid_kobo,
        is_mismatch,
        payment_method, card_number, bank_code, bank_name,
        json.dumps(isw_resp),
        is_successful, is_successful,
        is_successful, receipt_no,
        reference_no,
    )
    return sql, params


# ── Atomic settlement with race condition prevention ────────────────────────

def atomic_settle_payment(reference_no: str, user_id: int, payment_type: str) -> bool:
    """
    Atomically settle a payment transaction. Only one process (callback, worker, or verify)
    can win the race to settle a given transaction.
    
    This prevents duplicate downstream operations (e.g., creating two student records).
    
    Returns:
        True if this process won the settlement race and applied downstream logic
        False if another process already won (abort silently)
    """
    # ✅ ATOMIC: Only update if status is still 'pending'
    # If this succeeds with 1 row affected, we own this transaction
    update_sql = '''UPDATE payment_transactions
                   SET tran_status = 'processing'
                   WHERE reference_no = %s AND user_id = %s AND tran_status = 'pending' '''
    
    Database.execute_update(update_sql, (reference_no, user_id))
    
    # Check if we actually updated the row (only 1 process can win)
    check_res = Database.execute_query(
        'SELECT tran_status FROM payment_transactions WHERE reference_no = %s AND user_id = %s',
        (reference_no, user_id)
    )
    
    if not check_res or check_res[0]['tran_status'] != 'processing':
        # Another process already grabbed it or it's already settled
        print(f"[atomic_settle] {reference_no} already being processed by another handler")
        return False
    
    # ✅ We own this transaction — apply downstream
    print(f"[atomic_settle] {reference_no} acquired lock, applying downstream success")
    apply_downstream_success(user_id, payment_type, reference_no=reference_no)
    
    # ✅ If this is a tuition payment, update the fully_paid_for_session flag
    if payment_type == 'tuition':
        update_session_payment_status(reference_no, user_id)
    
    return True


# ── Session-based fee tracking ────────────────────────────────────────────────

def update_session_payment_status(reference_no: str, user_id: int) -> None:
    """
    After a tuition payment is marked successful, check if the student has now
    fully paid all fees for that academic session.
    
    Logic:
      1. Get the academic_session_id from this transaction
      2. Get the student's program_type, level, and faculty_id (same as frontend uses)
      3. Query: SUM(amount_paid) for all successful tuition payments for this user+session
      4. Query: expected fees for this student+session using SAME FILTERS as frontend
      5. If SUM >= expected_fees: Set fully_paid_for_session = TRUE for ALL txns in this session
      6. Else: Set to FALSE
    """
    # Get the academic_session_id from this transaction
    txn = Database.execute_query(
        '''SELECT academic_session_id FROM payment_transactions
           WHERE reference_no = %s AND user_id = %s''',
        (reference_no, user_id)
    )
    
    if not txn or not txn[0].get('academic_session_id'):
        print(f"[update_session_payment_status] {reference_no}: No academic_session_id found")
        return
    
    session_id = txn[0]['academic_session_id']
    
    # Get current student level AND program context (program_type, faculty_id)
    # Uses SAME query as frontend's _get_applicant_fee_context()
    student_res = Database.execute_query(
        '''SELECT s.current_level_id,
                  app.prog_type,
                  ps.faculty_id
           FROM students s
           JOIN users u ON u.id = s."UserId"
           LEFT JOIN applications app ON app.user_id = u.id 
              AND app.applicant_stage IN ('admitted', 'accepted', 'enrolled')
              AND app.created_at = (
                SELECT MAX(created_at) FROM applications WHERE user_id = u.id
              )
           LEFT JOIN program_setup ps ON LOWER(ps.name) = LOWER(COALESCE(app.finalised_course, app.approved_course))
           WHERE s."UserId" = %s
           ORDER BY s."CreatedDate" DESC LIMIT 1''',
        (user_id,)
    )
    
    if not student_res:
        print(f"[update_session_payment_status] {reference_no}: No student record found")
        return
    
    current_level_id = student_res[0].get('current_level_id')
    program_type = student_res[0].get('prog_type')
    faculty_id = student_res[0].get('faculty_id')
    
    if not current_level_id:
        print(f"[update_session_payment_status] {reference_no}: No current_level_id found")
        return
    
    if not program_type or not faculty_id:
        print(f"[update_session_payment_status] {reference_no}: Missing program_type ({program_type}) or faculty_id ({faculty_id})")
        return
    
    # Get total amount paid for this session
    paid_res = Database.execute_query(
        '''SELECT COALESCE(SUM(amount_paid), 0) as total_paid,
                  COUNT(*) as payment_count,
                  STRING_AGG(DISTINCT tran_status, ', ') as statuses,
                  STRING_AGG(DISTINCT tran_type, ', ') as types,
                  STRING_AGG(CAST(amount_paid AS VARCHAR), ', ') as individual_amounts
           FROM payment_transactions
           WHERE user_id = %s 
             AND academic_session_id = %s 
             AND tran_type = 'tuition'
             AND tran_status = 'successful' ''',
        (user_id, session_id)
    )
    
    total_paid = float(paid_res[0]['total_paid'] or 0) if paid_res else 0
    payment_count = paid_res[0]['payment_count'] if paid_res else 0
    
    # Debug: Log all tuition transactions for this user+session
    if paid_res and payment_count > 0:
        print(f"[update_session_payment_status] {reference_no}: Found {payment_count} successful tuition payments: {paid_res[0]['individual_amounts']}")
    else:
        print(f"[update_session_payment_status] {reference_no}: WARNING - No successful tuition payments found for user {user_id}, session {session_id}")
        all_txns = Database.execute_query(
            '''SELECT reference_no, tran_type, tran_status, amount_paid, amount_paid_in_kobo
               FROM payment_transactions
               WHERE user_id = %s AND academic_session_id = %s
               LIMIT 10''',
            (user_id, session_id)
        )
        print(f"[update_session_payment_status] {reference_no}: All transactions for this user+session: {all_txns}")
    
    # Get expected fees for this student+session+level
    # Uses SAME filters as frontend's getTuitionBreakdown:
    # program_type, level, faculty_id
    expected_res = Database.execute_query(
        '''SELECT COALESCE(SUM(pf.amount), 0) as expected_fees
           FROM program_fees pf
           JOIN fee_components fc ON fc.id = pf.fee_component_id
           WHERE pf.program_type = %s
             AND pf.level = %s
             AND pf.faculty_id = %s
             AND pf.academic_session_id = %s
             AND LOWER(fc.name) NOT LIKE '%%acceptance%%' ''',
        (str(program_type), str(current_level_id), str(faculty_id), session_id)
    )
    
    expected_fees = float(expected_res[0]['expected_fees'] or 0) if expected_res else 0
    
    # Debug: Log which fees were matched (same breakdown as frontend shows)
    fee_check = Database.execute_query(
        '''SELECT fc.name, SUM(pf.amount) as total
           FROM program_fees pf
           JOIN fee_components fc ON fc.id = pf.fee_component_id
           WHERE pf.program_type = %s
             AND pf.level = %s
             AND pf.faculty_id = %s
             AND pf.academic_session_id = %s
             AND LOWER(fc.name) NOT LIKE '%%acceptance%%'
           GROUP BY fc.name
           ORDER BY fc.name ASC''',
        (str(program_type), str(current_level_id), str(faculty_id), session_id)
    )
    print(f"[update_session_payment_status] {reference_no}: Fee breakdown (program_type={program_type}, level={current_level_id}, faculty_id={faculty_id}): {fee_check}")
    print(f"[update_session_payment_status] {reference_no}: "
          f"Session {session_id}, Level {current_level_id}, "
          f"Paid: ₦{total_paid}, Expected: ₦{expected_fees}")
    
    # Determine if fully paid
    is_fully_paid = (total_paid >= expected_fees) if expected_fees > 0 else False
    
    # Update ALL tuition transactions for this session to have the same fully_paid_for_session flag
    # (This ensures consistency across installments)
    Database.execute_update(
        '''UPDATE payment_transactions
           SET fully_paid_for_session = %s,
               updated_at = NOW()
           WHERE user_id = %s 
             AND academic_session_id = %s 
             AND tran_type = 'tuition' ''',
        (is_fully_paid, user_id, session_id)
    )
    
    print(f"[update_session_payment_status] {reference_no}: "
          f"Set fully_paid_for_session = {is_fully_paid}")


def get_session_payment_summary(user_id: int, session_id: int) -> dict:
    """
    Get payment summary for a student for a specific academic session.
    Uses SAME fee lookup as getTuitionBreakdown (program_type, level, faculty_id).
    
    Returns:
      {
        'total_expected': float,
        'total_paid': float,
        'is_fully_paid': bool,
        'remaining': float,
        'payment_percentage': int (0-100)
      }
    """
    # Get student's current level, program_type, and faculty_id
    student_res = Database.execute_query(
        '''SELECT s.current_level_id,
                  app.prog_type,
                  ps.faculty_id
           FROM students s
           JOIN users u ON u.id = s."UserId"
           LEFT JOIN applications app ON app.user_id = u.id 
              AND app.applicant_stage IN ('admitted', 'accepted', 'enrolled')
              AND app.created_at = (
                SELECT MAX(created_at) FROM applications WHERE user_id = u.id
              )
           LEFT JOIN program_setup ps ON LOWER(ps.name) = LOWER(COALESCE(app.finalised_course, app.approved_course))
           WHERE s."UserId" = %s
           ORDER BY s."CreatedDate" DESC LIMIT 1''',
        (user_id,)
    )
    
    if not student_res or not student_res[0].get('current_level_id'):
        return {
            'total_expected': 0,
            'total_paid': 0,
            'is_fully_paid': False,
            'remaining': 0,
            'payment_percentage': 0,
        }
    
    current_level_id = student_res[0]['current_level_id']
    program_type = student_res[0].get('prog_type')
    faculty_id = student_res[0].get('faculty_id')
    
    if not program_type or not faculty_id:
        return {
            'total_expected': 0,
            'total_paid': 0,
            'is_fully_paid': False,
            'remaining': 0,
            'payment_percentage': 0,
        }
    
    # Get total paid
    paid_res = Database.execute_query(
        '''SELECT COALESCE(SUM(amount_paid), 0) as total_paid
           FROM payment_transactions
           WHERE user_id = %s 
             AND academic_session_id = %s 
             AND tran_type = 'tuition'
             AND tran_status = 'successful' ''',
        (user_id, session_id)
    )
    
    total_paid = float(paid_res[0]['total_paid'] or 0) if paid_res else 0
    
    # Get expected fees using SAME filters as frontend
    expected_res = Database.execute_query(
        '''SELECT COALESCE(SUM(pf.amount), 0) as expected_fees
           FROM program_fees pf
           JOIN fee_components fc ON fc.id = pf.fee_component_id
           WHERE pf.program_type = %s
             AND pf.level = %s
             AND pf.faculty_id = %s
             AND pf.academic_session_id = %s
             AND LOWER(fc.name) NOT LIKE '%%acceptance%%' ''',
        (str(program_type), str(current_level_id), str(faculty_id), session_id)
    )
    
    expected_fees = float(expected_res[0]['expected_fees'] or 0) if expected_res else 0
    
    is_fully_paid = (total_paid >= expected_fees) if expected_fees > 0 else False
    remaining = max(0, expected_fees - total_paid)
    
    if expected_fees > 0:
        payment_percentage = min(100, int((total_paid / expected_fees) * 100))
    else:
        payment_percentage = 0
    
    return {
        'total_expected': expected_fees,
        'total_paid': total_paid,
        'is_fully_paid': is_fully_paid,
        'remaining': remaining,
        'payment_percentage': payment_percentage,
    }