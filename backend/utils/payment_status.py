from database import Database
import json
import secrets
import string
from datetime import datetime

# ── Tunable constants ─────────────────────────────────────────────────────────

# Codes that mean "not processed yet or transient status – try again later"
PENDING_CODES = {'Z0', 'T0', 'Z62', 'Z25', '99', '96', ''}

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
    Return the tran_status to write, given the Interswitch ResponseCode
    and how many times we have already requeried this transaction.

    Params
    ------
    response_code        : raw ResponseCode from Interswitch (may be None/empty)
    current_requery_count: the requery_count value already in the DB row
                           (i.e. *before* incrementing for this attempt)

    Returns
    -------
    'successful' | 'pending' | 'failed'
    """
    code = (response_code or '').strip()

    if code == '00':
        return 'successful'

    if code in PENDING_CODES:
        return 'pending'

    # Any other response code (e.g. insufficient funds, card declined) is a definitive failure
    return 'failed'


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
        # Promote user to 'admitted' role (id=13) — grants limited student portal access
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
                      a.degree_id, a.prog_type, a.department_id,
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

                # ── Resolve entry level from program_types.level_id via prog_type ──
                # prog_type on applications stores the program_types id.
                # program_types.level_id holds the entry level for that type.
                entry_level_id = None
                prog_type = ud.get('prog_type')
                if prog_type:
                    level_res = Database.execute_query(
                        'SELECT level_id FROM program_types WHERE id = %s',
                        (prog_type,)
                    )
                    if level_res:
                        entry_level_id = level_res[0]['level_id']

                # ── Resolve department name from departments via department_id ──
                department_name = None
                dept_id = ud.get('department_id')
                if dept_id:
                    dept_res = Database.execute_query(
                        'SELECT name FROM departments WHERE id = %s',
                        (dept_id,)
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