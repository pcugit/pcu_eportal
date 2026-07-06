from database import Database
from utils.auth import AuthHandler
from utils.pg_fees import get_pg_fee_context_by_user
import json
import secrets
import string
from datetime import datetime

# ── Tunable constants ─────────────────────────────────────────────────────────

CANCELLED_CODES = {
    'Z0',   # User cancelled on ISW gateway (no transaction)
    'Z6',   # User cancelled (must be recorded as cancelled, NOT failed)
    'Z9',   # User cancelled / session expired on gateway
}

CANCELLED_DESCRIPTION_MARKERS = (
    'cancel',
    'cancelled',
    'canceled',
    'abort',
    'aborted',
    'abandon',
    'abandoned',
    'user closed',
    'closed by user',
    'user terminated',
)

PENDING_CODES = {
    'T0',    # Transaction pending / processing (very common for bank transfers)
    'T03',   # Transaction pending at processor
    'Z62',   # Pending — waiting on processor (common for NIP transfers)
    'Z25',   # Transaction pending
    'Z16',   # Transaction pending / incomplete
    '09',    # Request in progress (bank transfer awaiting NIBSS response)
    '91',    # Issuer or switch inoperative (temporary — bank may come back)
    '92',    # Routing Error (temporary network/routing issue)
    '94',    # Duplicate transaction — pending verification
    '96',    # System Malfunction (temporary system issue)
    '99',    # General pending / timeout
    '70120', # Beneficiary bank service unavailability (temporary)
    'SP',    # Settlement pending (NIP interbank transfer)
    'Z5',    # Transaction under review (bank transfer)
    'Z52',   # Insufficient balance — may be a timing issue on transfer
    'PE',    # Pending (used by some ISW integrations for transfers)
}

PT_HND_DEVELOPMENT_PROGRAM_TYPES = {'4', '7'}
DEVELOPMENT_FEE_MARKER = 'development'


def is_development_fee_name(name) -> bool:
    return DEVELOPMENT_FEE_MARKER in str(name or '').lower()


def is_pt_hnd_program(program_type) -> bool:
    return str(program_type) in PT_HND_DEVELOPMENT_PROGRAM_TYPES


def has_successful_tuition_payment(user_id, before_session_id=None) -> bool:
    clause = ''
    params = [user_id]
    if before_session_id is not None:
        clause = 'AND academic_session_id < %s'
        params.append(before_session_id)

    res = Database.execute_query(
        f'''SELECT id
            FROM payment_transactions
            WHERE user_id = %s
              AND tran_type = 'tuition'
              AND tran_status = 'successful'
              {clause}
            LIMIT 1''',
        tuple(params),
    )
    return bool(res)


def get_development_fee_amount(context: dict, session_id) -> float:
    if not context or not is_pt_hnd_program(context.get('program_type')):
        return 0.0

    res = Database.execute_query(
        '''SELECT pf.amount
           FROM program_fees pf
           JOIN fee_components fc ON fc.id = pf.fee_component_id
           WHERE pf.program_type = %s
             AND (pf.level = %s OR pf.level IS NULL)
             AND (pf.faculty_id = %s OR pf.faculty_id IS NULL)
             AND pf.academic_session_id = %s
             AND LOWER(fc.name) LIKE '%%development%%'
           ORDER BY
             CASE WHEN pf.level = %s THEN 1 ELSE 0 END DESC,
             CASE WHEN pf.faculty_id = %s THEN 1 ELSE 0 END DESC,
             pf.id DESC
           LIMIT 1''',
        (
            str(context.get('program_type')),
            context.get('level'),
            context.get('faculty_id'),
            session_id,
            context.get('level'),
            context.get('faculty_id'),
        ),
    )
    return float(res[0]['amount'] or 0) if res else 0.0


def requires_development_fee(user_id, context: dict) -> bool:
    return (
        is_pt_hnd_program(context.get('program_type'))
        and not has_successful_tuition_payment(user_id)
    )


def get_required_development_fee_amount(user_id, context: dict, session_id) -> float:
    if not requires_development_fee(user_id, context):
        return 0.0

    amount = get_development_fee_amount(context, session_id)
    if amount <= 0:
        raise ValueError(
            'Development fee is required for first tuition payment, but it is not configured for this programme.'
        )
    return amount


def get_recurring_tuition_total(context: dict, session_id) -> float:
    res = Database.execute_query(
        '''SELECT COALESCE(SUM(pf.amount), 0) AS amount
           FROM program_fees pf
           JOIN fee_components fc ON fc.id = pf.fee_component_id
           WHERE pf.program_type = %s
             AND pf.level = %s
             AND pf.faculty_id = %s
             AND pf.academic_session_id = %s
             AND LOWER(fc.name) NOT LIKE '%%acceptance%%'
             AND LOWER(fc.name) NOT LIKE '%%development%%' ''',
        (
            str(context.get('program_type')),
            str(context.get('level')),
            str(context.get('faculty_id')),
            session_id,
        ),
    )
    return float(res[0]['amount'] or 0) if res else 0.0


def should_charge_development_fee(user_id, context: dict, session_id) -> bool:
    return (
        requires_development_fee(user_id, context)
        and get_development_fee_amount(context, session_id) > 0
    )


def get_recurring_tuition_paid(user_id, session_id, context: dict) -> float:
    paid_res = Database.execute_query(
        '''SELECT COALESCE(SUM(COALESCE(amount_paid, amount, 0)), 0) AS total_paid
           FROM payment_transactions
           WHERE user_id = %s
             AND academic_session_id = %s
             AND tran_type = 'tuition'
             AND tran_status = 'successful' ''',
        (user_id, session_id),
    )
    total_paid = float(paid_res[0]['total_paid'] or 0) if paid_res else 0.0
    if total_paid <= 0:
        return 0.0

    if is_pt_hnd_program(context.get('program_type')) and not has_successful_tuition_payment(user_id, before_session_id=session_id):
        total_paid = max(0.0, total_paid - get_development_fee_amount(context, session_id))

    return total_paid

DEFINITIVE_FAILURE_CODES = {
    '06',   # Error (generic permanent error from issuer)
    '30',   # Format Error (malformed transaction data)
    '51',   # Insufficient Funds (confirmed, not a timing issue)
    '55',   # Incorrect PIN
    '57',   # Transaction not permitted to cardholder
    '58',   # Transaction not permitted to terminal
    '59',   # Suspected Fraud
    '63',   # Security Violation
    'T9',   # Transaction declined by gateway
    'Z23',  # Invalid card
    'Z28',  # Transaction not permissible
}

FAIL_AFTER_REQUERIES = 6

STALE_THRESHOLD_MINUTES = 24 * 60  # 24 hours


# ── Core classifier ───────────────────────────────────────────────────────────


def generate_receipt_no(payment_type: str = '', session_id=None) -> str:
    """
    Generate a human-readable, sequential receipt number in the format:
        PCU/{TYPE}/{SESSION}/{COUNTER}
    e.g. PCU/ACC/2025-26/000247

    payment_type : 'application_fee' | 'acceptance_fee' | 'tuition' | ''
    session_id   : FK to academic_sessions.id (used to resolve the session label)
    """
    # ── Map payment type → short code ────────────────────────────────────────
    TYPE_CODES = {
        'application_fee': 'APP',
        'acceptance_fee':  'ACC',
        'tuition':         'TUI',
    }
    type_code = TYPE_CODES.get((payment_type or '').lower(), 'PAY')

    # ── Resolve session label ─────────────────────────────────────────────────
    session_label = str(datetime.now().year)   # sane fallback
    if session_id:
        try:
            sess_res = Database.execute_query(
                'SELECT name FROM academic_sessions WHERE id = %s LIMIT 1',
                (session_id,)
            )
            if sess_res and sess_res[0].get('name'):
                raw = sess_res[0]['name'].strip()
                # Normalize "2026/2027" → "2026-27" and "2026/27" → "2026-27"
                if '/' in raw:
                    parts = raw.split('/')
                    if len(parts) == 2:
                        start, end = parts[0].strip(), parts[1].strip()
                        # Shorten end year to last 2 digits if it's a full year
                        if len(end) == 4:
                            end = end[2:]
                        raw = f"{start}-{end}"
                session_label = raw
        except Exception:
            pass

    # ── Build the receipt prefix and get the next sequential number ───────────
    prefix = f"PCU/{type_code}/{session_label}"
    try:
        count_res = Database.execute_query(
            "SELECT COUNT(*) AS cnt FROM payment_transactions WHERE receipt_no LIKE %s",
            (f"{prefix}/%",)
        )
        seq = (int(count_res[0]['cnt']) if count_res else 0) + 1
    except Exception:
        # Fallback: use a random 6-digit number to avoid collisions
        seq = int(secrets.token_hex(3), 16) % 900000 + 100000

    return f"{prefix}/{seq:06d}"


def classify_response(
    response_code: str,
    current_requery_count: int,
    response_desc: str = '',
) -> str:
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
    response_desc        : raw ResponseDescription from Interswitch

    Returns
    -------
    'successful' | 'cancelled' | 'pending' | 'failed'
    """
    code = (response_code or '').strip()
    desc = (response_desc or '').strip().lower()

    # Successful payment
    if code == '00':
        return 'successful'

    # User cancelled on gateway. Empty/unknown requery responses are not
    # cancellations; they remain pending so async confirmation can still land.
    if code in CANCELLED_CODES or any(marker in desc for marker in CANCELLED_DESCRIPTION_MARKERS):
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

    if program_type_id == 2:
        user_res = Database.execute_query(
            '''SELECT surname, firstname, middlename, email, phone_number
               FROM users WHERE id = %s LIMIT 1''',
            (user_id,)
        )
        user_profile = user_res[0] if user_res else {}

        # Check if a row already exists in pg_application for this user + session
        existing = Database.execute_query(
            '''SELECT uuid, application_payment_reference
               FROM pg_application
               WHERE user_id = %s AND academic_session_id = %s''',
            (user_id, session_id)
        )
        if existing:
            # Row already exists — update the reference so it stays linked
            Database.execute_update(
                '''UPDATE pg_application
                   SET application_payment_reference = %s,
                       surname = COALESCE(NULLIF(surname, ''), %s),
                       first_name = COALESCE(NULLIF(first_name, ''), %s),
                       middle_name = COALESCE(NULLIF(middle_name, ''), %s),
                       email = COALESCE(NULLIF(email, ''), %s),
                       phone_number = COALESCE(NULLIF(phone_number, ''), %s),
                       updated_date = NOW()
                   WHERE uuid = %s''',
                (
                    reference_no,
                    user_profile.get('surname'),
                    user_profile.get('firstname'),
                    user_profile.get('middlename'),
                    user_profile.get('email'),
                    user_profile.get('phone_number'),
                    existing[0]['uuid'],
                )
            )
            return

        # Generate a unique form_no
        year = datetime.now().year
        code = _prog_code_from_id(program_type_id)
        while True:
            suffix  = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))
            form_no = f"PCU/{year}/{code}{suffix}"
            if not Database.execute_query(
                'SELECT uuid FROM pg_application WHERE form_no = %s', (form_no,)
            ):
                break

        Database.execute_update(
            '''INSERT INTO pg_application
                   (user_id, form_no, academic_session_id,
                    surname, first_name, middle_name, email, phone_number,
                    applicant_stage, application_payment_reference)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)''',
            (
                user_id,
                form_no,
                session_id,
                user_profile.get('surname'),
                user_profile.get('firstname'),
                user_profile.get('middlename'),
                user_profile.get('email'),
                user_profile.get('phone_number'),
                'started',
                reference_no,
            )
        )
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

MATRIC_SEQUENCE_WIDTH = 3
UNDERGRADUATE_MATRIC_OFFSETS = (1, 2, 3, 4)
PT_HND_MATRIC_OFFSETS = (5, 6)
PG_MATRIC_OFFSETS = (7, 8, 9)


def _matric_prefixes(offsets):
    prefixes = []
    for decade in range(20, 100):
        prefixes.extend(f"{decade}{offset}" for offset in offsets)
    return prefixes


def _next_segmented_matric_no(offsets) -> str:
    prefixes = _matric_prefixes(offsets)
    prefix_set = set(prefixes)
    prefix_order = {prefix: index for index, prefix in enumerate(prefixes)}

    rows = Database.execute_query(
        '''SELECT "MatricNo" AS matric_no
             FROM students
            WHERE "MatricNo" ~ '^[0-9]{6}$'
           UNION ALL
           SELECT matric_no
             FROM users
            WHERE matric_no ~ '^[0-9]{6}$' '''
    )

    latest_prefix_index = -1
    latest_suffix = 0
    for row in rows or []:
        matric_no = str(row.get('matric_no') or '')
        prefix = matric_no[:3]
        if prefix not in prefix_set:
            continue

        suffix = int(matric_no[3:])
        prefix_index = prefix_order[prefix]
        if prefix_index > latest_prefix_index or (
            prefix_index == latest_prefix_index and suffix > latest_suffix
        ):
            latest_prefix_index = prefix_index
            latest_suffix = suffix

    if latest_prefix_index < 0:
        next_prefix_index = 0
        next_suffix = 1
    elif latest_suffix < 999:
        next_prefix_index = latest_prefix_index
        next_suffix = latest_suffix + 1
    else:
        next_prefix_index = latest_prefix_index + 1
        next_suffix = 1

    if next_prefix_index >= len(prefixes):
        raise RuntimeError('No matric number range is available for this programme group')

    while next_prefix_index < len(prefixes):
        matric_no = f"{prefixes[next_prefix_index]}{next_suffix:0{MATRIC_SEQUENCE_WIDTH}d}"
        clash = Database.execute_query(
            '''SELECT 1
                 FROM students
                WHERE "MatricNo" = %s
                UNION ALL
               SELECT 1
                 FROM users
                WHERE matric_no = %s
                LIMIT 1''',
            (matric_no, matric_no)
        )
        if not clash:
            return matric_no

        if next_suffix < 999:
            next_suffix += 1
        else:
            next_prefix_index += 1
            next_suffix = 1

    raise RuntimeError('No matric number range is available for this programme group')


def generate_undergraduate_matric_no() -> str:
    """Generate undergraduate MatricNo: 201001-204999, then 211001-214999, etc."""
    return _next_segmented_matric_no(UNDERGRADUATE_MATRIC_OFFSETS)


def generate_pg_matric_no() -> str:
    """Generate postgraduate MatricNo: 207001-209999, then 217001-219999, etc."""
    return _next_segmented_matric_no(PG_MATRIC_OFFSETS)


def generate_pt_hnd_matric_no() -> str:
    """Generate Part-Time/HND MatricNo: 205001-206999, then 215001-216999, etc."""
    return _next_segmented_matric_no(PT_HND_MATRIC_OFFSETS)


def apply_downstream_success(user_id: int, payment_type: str, reference_no: str | None = None) -> None:
    """
    Apply business-logic side-effects of a confirmed successful payment.
    Centralised here so verify_payment, payment_webhook, and the background
    worker all use identical logic.

    Role-promotion rules:
      application_fee  → create application row + form_no, promote user_type_id = 2 (applicant)
      acceptance_fee   → applicant_stage advances past admin acceptance
                         user_type_id = 13 (admitted — limited student portal)
      tuition          → applicant_stage = 'enrolled'
                         user_type_id = student role (looked up from DB)
                         INSERT into students with current_level_id resolved from
                         degree_program → program_types → level_id
    """
    is_pg = bool(Database.execute_query('SELECT uuid FROM pg_application WHERE user_id = %s LIMIT 1', (user_id,)))

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
        if is_pg:
            Database.execute_update(
                """UPDATE pg_application
                   SET applicant_stage = 'accepted', acceptance_payment_reference = %s, updated_date = NOW()
                   WHERE user_id = %s AND applicant_stage = 'admitted'""",
                (reference_no, user_id)
            )
        else:
            Database.execute_update(
                """UPDATE applications
                   SET applicant_stage = 'admitted', updated_at = NOW()
                   WHERE user_id = %s
                     AND prog_type IN (4, 7)
                     AND applicant_stage = 'accepted'""",
                (user_id,)
            )
            Database.execute_update(
                """UPDATE applications
                   SET applicant_stage = 'accepted', updated_at = NOW()
                   WHERE user_id = %s
                     AND (prog_type NOT IN (4, 7) OR prog_type IS NULL)
                     AND applicant_stage = 'admitted'""",
                (user_id,)
            )
        # Promote user to 'admitted' role (id=13) — stays on applicant portal
        Database.execute_update(
            "UPDATE users SET user_type_id = 13, updated_at = NOW() WHERE id = %s",
            (user_id,)
        )

    elif payment_type == 'tuition':
        # Mark application as enrolled
        if is_pg:
            Database.execute_update(
                """UPDATE pg_application
                   SET applicant_stage = 'enrolled', updated_date = NOW()
                   WHERE user_id = %s AND applicant_stage = 'accepted'""",
                (user_id,)
            )
        else:
            Database.execute_update(
                """UPDATE applications
                   SET applicant_stage = 'enrolled', updated_at = NOW()
                   WHERE user_id = %s
                     AND prog_type IN (4, 7)
                     AND applicant_stage IN ('admitted', 'accepted')""",
                (user_id,)
            )
            Database.execute_update(
                """UPDATE applications
                   SET applicant_stage = 'enrolled', updated_at = NOW()
                   WHERE user_id = %s
                     AND (prog_type NOT IN (4, 7) OR prog_type IS NULL)
                     AND applicant_stage = 'accepted'""",
                (user_id,)
            )
        # Promote to full student role (user_type_id = 7)
        Database.execute_update(
            "UPDATE users SET user_type_id = 7, updated_at = NOW() WHERE id = %s",
            (user_id,)
        )

        # ── Fetch user + application + biodata ───────────────────────────────
        if is_pg:
            user_data = Database.execute_query(
                '''SELECT u.surname, u.firstname, u.email, u.phone_number,
                          pg.degree_id, 2 AS prog_type, pg.proposed_course AS program_setup_id,
                          NULL AS level_id,
                          pg.middle_name, pg.address, pg.gender, pg.date_of_birth,
                          'Single' AS marital_status, 'Nigerian' AS nationality, '' AS state, '' AS lga,
                          pg.pg_reference_id
                   FROM users u
                   LEFT JOIN pg_application pg ON pg.user_id = u.id AND pg.applicant_stage = 'enrolled'
                   WHERE u.id = %s
                   ORDER BY pg.updated_date DESC LIMIT 1''',
                (user_id,)
            )
        else:
            user_data = Database.execute_query(
                '''SELECT u.surname, u.firstname, u.email, u.phone_number,
                          a.degree_id, a.prog_type, a.program_setup_id, a.level_id,
                          b.middle_name, b.address, b.gender, b.date_of_birth,
                          b.marital_status, b.nationality, b.state, b.lga,
                          NULL AS pg_reference_id
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
                if is_pg:
                    try:
                        pg_fee_context = get_pg_fee_context_by_user(user_id)
                        entry_level_id = pg_fee_context.get('level')
                    except Exception as e:
                        print(f"[apply_downstream_success] PG level lookup failed for user {user_id}: {e}")
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
                    if is_pg:
                        dept_res = Database.execute_query(
                            '''SELECT d.name FROM pg_program_setup ps
                               JOIN departments d ON d.id = ps.department_id
                               WHERE ps.id = %s''',
                            (ps_id,)
                        )
                    else:
                        dept_res = Database.execute_query(
                            '''SELECT d.name FROM program_setup ps
                               JOIN departments d ON d.id = ps.department_id
                               WHERE ps.id = %s''',
                            (ps_id,)
                        )
                    if dept_res:
                        department_name = dept_res[0]['name']

                # Generate a unique MatricNo using the programme-specific format.
                prog_type = ud.get('prog_type')
                if is_pg:
                    matric_no = generate_pg_matric_no()
                elif is_pt_hnd_program(prog_type):
                    matric_no = generate_pt_hnd_matric_no()
                else:
                    matric_no = generate_undergraduate_matric_no()

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
                           "State", "LGA", "MatricNo", "RefNo",
                           "UserId", "CurrentUserId", "DegreeId", department, "YearOfEntry", "IsGraduate",
                           current_level_id,
                           "CreatedDate", "UpdatedDate"
                       ) VALUES (
                           %s, %s, %s, %s, %s,
                           %s, %s, %s, %s, %s,
                           %s, %s, %s,
                           %s,
                           %s, %s, %s, %s, %s, %s,
                           %s,
                           NOW(), NOW()
                       )''',
                    (
                        last_name, first_name, ud['middle_name'], email, ud['phone_number'],
                        ud['address'], ud['gender'], ud['date_of_birth'], ud['marital_status'], ud['nationality'],
                        ud['state'], ud['lga'], matric_no,
                        str(ud.get('pg_reference_id')) if ud.get('pg_reference_id') else None,
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
            elif is_pg and ud.get('pg_reference_id'):
                Database.execute_update(
                    '''UPDATE students
                       SET "RefNo" = COALESCE("RefNo", %s::text),
                           "UpdatedDate" = NOW()
                       WHERE "UserId" = %s''',
                    (str(ud['pg_reference_id']), user_id)
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
    # ✅ ATOMIC: Only update if status is still 'pending' OR 'requery_error'
    # (transfer payments may be in 'requery_error' when the background worker
    # finally gets the '00' confirmation from the bank hours later)
    update_sql = '''UPDATE payment_transactions
                   SET tran_status = 'processing'
                   WHERE reference_no = %s AND user_id = %s
                     AND (
                         tran_status IN ('pending', 'requery_error')
                         OR (
                             tran_status = 'cancelled'
                             AND COALESCE(response_description, '') <> 'Cancelled by user'
                         )
                     ) '''
    
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
    is_pg = bool(Database.execute_query('SELECT uuid FROM pg_application WHERE user_id = %s LIMIT 1', (user_id,)))

    student_res = None
    if is_pg:
        student_res = Database.execute_query(
            '''SELECT s.current_level_id,
                      2 AS prog_type,
                      pg.proposed_faculty_id AS faculty_id
               FROM students s
               JOIN users u ON u.id = s."UserId"
               LEFT JOIN pg_application pg ON pg.user_id = u.id AND pg.applicant_stage IN ('admitted', 'accepted', 'enrolled')
               WHERE s."UserId" = %s
               ORDER BY s."CreatedDate" DESC LIMIT 1''',
            (user_id,)
        )
    else:
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
    
    current_level_id = None
    program_type = None
    faculty_id = None

    if is_pg:
        try:
            pg_fee_context = get_pg_fee_context_by_user(user_id)
            current_level_id = pg_fee_context.get('level')
            program_type = pg_fee_context.get('program_type')
            faculty_id = pg_fee_context.get('faculty_id')
        except Exception as e:
            print(f"[update_session_payment_status] PG fee context lookup failed: {e}")
    
    if not current_level_id and student_res and student_res[0].get('current_level_id'):
        current_level_id = student_res[0]['current_level_id']
        program_type = student_res[0].get('prog_type')
        faculty_id = student_res[0].get('faculty_id')
    elif not current_level_id:
        # Fallback for new students who don't have a record in `students` yet
        try:
            if is_pg:
                pg_res = Database.execute_query(
                    '''SELECT pg.uuid, 2 AS prog_type, pg.proposed_course, pg.proposed_faculty_id, pt.level_id,
                              pg.finalised_course, pg.approved_course
                       FROM pg_application pg
                       LEFT JOIN program_types pt ON pt.id = 2
                       WHERE pg.user_id = %s AND pg.applicant_stage IN ('admitted', 'accepted', 'enrolled')
                       ORDER BY pg.updated_date DESC LIMIT 1''',
                    (user_id,)
                )
                if pg_res:
                    app_row = pg_res[0]
                    program_type = 2
                    current_level_id = app_row['level_id'] or 5
                    faculty_id = app_row['proposed_faculty_id']
            else:
                app_res = Database.execute_query(
                    '''SELECT app.prog_type,
                              pt.level_id,
                              app.finalised_course,
                              app.approved_course,
                              app.program_setup_id
                       FROM applications app
                       JOIN program_types pt ON app.prog_type = pt.id
                       WHERE app.user_id = %s AND app.applicant_stage IN ('admitted', 'accepted', 'enrolled')
                       ORDER BY app.created_at DESC LIMIT 1''',
                    (user_id,)
                )
                if app_res:
                    app_row = app_res[0]
                    program_type = app_row['prog_type']
                    current_level_id = app_row['level_id']
                    
                    finalised_course = (app_row.get('finalised_course') or '').strip()
                    if not finalised_course:
                        finalised_course = (app_row.get('approved_course') or '').strip()
                    if not finalised_course and app_row.get('program_setup_id'):
                        ps_res = Database.execute_query(
                            'SELECT name FROM program_setup WHERE id = %s',
                            (app_row['program_setup_id'],)
                        )
                        if ps_res:
                            finalised_course = ps_res[0]['name']
                    
                    if finalised_course:
                        faculty_res = Database.execute_query(
                            '''SELECT faculty_id
                               FROM program_setup
                               WHERE LOWER(name) = LOWER(%s)
                               LIMIT 1''',
                            (finalised_course,)
                        )
                        if faculty_res:
                            faculty_id = faculty_res[0].get('faculty_id')
        except Exception as e:
            print(f"[update_session_payment_status] Fallback lookup failed: {e}")

    if not current_level_id:
        print(f"[update_session_payment_status] {reference_no}: No current_level_id found")
        return
    
    if not program_type or not faculty_id:
        print(f"[update_session_payment_status] {reference_no}: Missing program_type ({program_type}) or faculty_id ({faculty_id})")
        return
    
    # Get total amount paid for this session
    paid_res = Database.execute_query(
        '''SELECT COALESCE(SUM(COALESCE(amount_paid, amount, 0)), 0) as total_paid,
                  COUNT(*) as payment_count,
                  STRING_AGG(DISTINCT tran_status, ', ') as statuses,
                  STRING_AGG(DISTINCT tran_type, ', ') as types,
                  STRING_AGG(CAST(COALESCE(amount_paid, amount, 0) AS VARCHAR), ', ') as individual_amounts
           FROM payment_transactions
           WHERE user_id = %s 
             AND academic_session_id = %s 
             AND tran_type = 'tuition'
             AND tran_status = 'successful' ''',
        (user_id, session_id)
    )
    
    total_paid = float(paid_res[0]['total_paid'] or 0) if paid_res else 0
    payment_count = paid_res[0]['payment_count'] if paid_res else 0
    fee_context = {
        'program_type': program_type,
        'level': current_level_id,
        'faculty_id': faculty_id,
    }
    recurring_paid = get_recurring_tuition_paid(user_id, session_id, fee_context)
    
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
    expected_fees = get_recurring_tuition_total(fee_context, session_id)
    
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
             AND LOWER(fc.name) NOT LIKE '%%development%%'
           GROUP BY fc.name
           ORDER BY fc.name ASC''',
        (str(program_type), str(current_level_id), str(faculty_id), session_id)
    )
    print(f"[update_session_payment_status] {reference_no}: Fee breakdown (program_type={program_type}, level={current_level_id}, faculty_id={faculty_id}): {fee_check}")
    print(f"[update_session_payment_status] {reference_no}: "
          f"Session {session_id}, Level {current_level_id}, "
          f"Paid: ₦{total_paid}, Expected: ₦{expected_fees}")
    
    # Determine if fully paid
    is_fully_paid = (recurring_paid >= expected_fees) if expected_fees > 0 else False
    
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
    is_pg = bool(Database.execute_query('SELECT uuid FROM pg_application WHERE user_id = %s LIMIT 1', (user_id,)))

    student_res = None
    if is_pg:
        student_res = Database.execute_query(
            '''SELECT s.current_level_id,
                      2 AS prog_type,
                      pg.proposed_faculty_id AS faculty_id
               FROM students s
               JOIN users u ON u.id = s."UserId"
               LEFT JOIN pg_application pg ON pg.user_id = u.id AND pg.applicant_stage IN ('admitted', 'accepted', 'enrolled')
               WHERE s."UserId" = %s
               ORDER BY s."CreatedDate" DESC LIMIT 1''',
            (user_id,)
        )
    else:
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
    
    current_level_id = None
    program_type = None
    faculty_id = None

    if is_pg:
        try:
            pg_fee_context = get_pg_fee_context_by_user(user_id)
            current_level_id = pg_fee_context.get('level')
            program_type = pg_fee_context.get('program_type')
            faculty_id = pg_fee_context.get('faculty_id')
        except Exception as e:
            print(f"[get_session_payment_summary] PG fee context lookup failed: {e}")
    
    if not current_level_id and student_res and student_res[0].get('current_level_id'):
        current_level_id = student_res[0]['current_level_id']
        program_type = student_res[0].get('prog_type')
        faculty_id = student_res[0].get('faculty_id')
    elif not current_level_id:
        # Fallback for new students who don't have a record in `students` yet
        try:
            if is_pg:
                pg_res = Database.execute_query(
                    '''SELECT pg.uuid, 2 AS prog_type, pg.proposed_course, pg.proposed_faculty_id, pt.level_id,
                              pg.finalised_course, pg.approved_course
                       FROM pg_application pg
                       LEFT JOIN program_types pt ON pt.id = 2
                       WHERE pg.user_id = %s AND pg.applicant_stage IN ('admitted', 'accepted', 'enrolled')
                       ORDER BY pg.updated_date DESC LIMIT 1''',
                    (user_id,)
                )
                if pg_res:
                    app_row = pg_res[0]
                    program_type = 2
                    current_level_id = app_row['level_id'] or 5
                    faculty_id = app_row['proposed_faculty_id']
            else:
                app_res = Database.execute_query(
                    '''SELECT app.prog_type,
                              pt.level_id,
                              app.finalised_course,
                              app.approved_course,
                              app.program_setup_id
                       FROM applications app
                       JOIN program_types pt ON app.prog_type = pt.id
                       WHERE app.user_id = %s AND app.applicant_stage IN ('admitted', 'accepted', 'enrolled')
                       ORDER BY app.created_at DESC LIMIT 1''',
                    (user_id,)
                )
                if app_res:
                    app_row = app_res[0]
                    program_type = app_row['prog_type']
                    current_level_id = app_row['level_id']
                    
                    finalised_course = (app_row.get('finalised_course') or '').strip()
                    if not finalised_course:
                        finalised_course = (app_row.get('approved_course') or '').strip()
                    if not finalised_course and app_row.get('program_setup_id'):
                        ps_res = Database.execute_query(
                            'SELECT name FROM program_setup WHERE id = %s',
                            (app_row['program_setup_id'],)
                        )
                        if ps_res:
                            finalised_course = ps_res[0]['name']
                    
                    if finalised_course:
                        faculty_res = Database.execute_query(
                            '''SELECT faculty_id
                               FROM program_setup
                               WHERE LOWER(name) = LOWER(%s)
                               LIMIT 1''',
                            (finalised_course,)
                        )
                        if faculty_res:
                            faculty_id = faculty_res[0].get('faculty_id')
        except Exception as e:
            print(f"[get_session_payment_summary] Fallback lookup failed: {e}")

    if not current_level_id or not program_type or not faculty_id:
        return {
            'total_expected': 0,
            'total_paid': 0,
            'is_fully_paid': False,
            'remaining': 0,
            'payment_percentage': 0,
        }
    
    # Get total paid
    paid_res = Database.execute_query(
        '''SELECT COALESCE(SUM(COALESCE(amount_paid, amount, 0)), 0) as total_paid
           FROM payment_transactions
           WHERE user_id = %s 
             AND academic_session_id = %s 
             AND tran_type = 'tuition'
             AND tran_status = 'successful' ''',
        (user_id, session_id)
    )
    
    total_paid = float(paid_res[0]['total_paid'] or 0) if paid_res else 0
    
    fee_context = {
        'program_type': program_type,
        'level': current_level_id,
        'faculty_id': faculty_id,
    }
    recurring_paid = get_recurring_tuition_paid(user_id, session_id, fee_context)
    development_fee_due = (
        get_development_fee_amount(fee_context, session_id)
        if should_charge_development_fee(user_id, fee_context, session_id)
        else 0.0
    )

    # Get expected recurring tuition fees using SAME filters as frontend.
    expected_fees = get_recurring_tuition_total(fee_context, session_id)
    total_expected = expected_fees + development_fee_due
    
    is_fully_paid = (recurring_paid >= expected_fees) if expected_fees > 0 else False
    remaining = max(0, expected_fees - recurring_paid) + development_fee_due
    
    if total_expected > 0:
        paid_for_progress = max(0, total_expected - remaining)
        payment_percentage = min(100, int((paid_for_progress / total_expected) * 100))
    else:
        payment_percentage = 0
    
    return {
        'total_expected': total_expected,
        'total_paid': total_paid,
        'recurring_expected': expected_fees,
        'recurring_paid': recurring_paid,
        'development_fee_due': development_fee_due,
        'is_fully_paid': is_fully_paid,
        'remaining': remaining,
        'payment_percentage': payment_percentage,
    }
