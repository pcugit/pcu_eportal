"""routes/pgadmin.py — PG Admin: postgraduate applications portal."""
import os
import math
from datetime import datetime
from flask import Blueprint, request, jsonify, Response
from database import Database
from utils.auth import AuthHandler
from utils.pg_application_generator import PGApplicationPDFGenerator

pgadmin_bp = Blueprint('pgadmin', __name__)

# ─── Helpers ──────────────────────────────────────────────────────────────────

USER_NAME_EXPR = "u.firstname || ' ' || COALESCE(u.middlename || ' ', '') || u.surname"

PG_PROG_TYPE = 2  # prog_type id for Postgraduate in program_types table


def _ensure_recommendation_columns():
    Database.execute_update(
        '''ALTER TABLE pg_application
           ADD COLUMN IF NOT EXISTS approved_course TEXT,
           ADD COLUMN IF NOT EXISTS finalised_course TEXT,
           ADD COLUMN IF NOT EXISTS applicant_recommended_course TEXT'''
    )


def get_pg_admission_ref(applicant_id):
    res = Database.execute_query(
        '''SELECT asess.name AS session_name
           FROM pg_application pg
           LEFT JOIN academic_sessions asess ON pg.academic_session_id = asess.id
           WHERE pg.uuid = %s''',
        (applicant_id,)
    )
    session_name = res[0]['session_name'] if res and res[0]['session_name'] else '2025/2026'
    session_year = session_name.split('/')[0] if '/' in session_name else datetime.now().strftime('%Y')
    return f"PCU/PG/ADM/{session_year}"


# ─── Dashboard ─────────────────────────────────────────────────────────────────

@pgadmin_bp.route('/dashboard', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.pgadmin_required
def dashboard(payload):
    """PG-only stats + recent activity for the Admin's dashboard."""
    _ensure_evaluation_table()
    activity_limit = int(request.args.get('limit', 10))

    # Aggregate counts — PG only
    counts = Database.execute_query(
        '''SELECT
               COUNT(*)                                                                    AS total_applications,
               COUNT(*) FILTER (WHERE applicant_stage IN ('admitted','accepted','enrolled')) AS total_admitted,
               COUNT(*) FILTER (WHERE applicant_stage IN ('started', 'in_progress'))        AS pending_submission,
               COUNT(*) FILTER (WHERE applicant_stage = 'submitted')                        AS new_applications,
               COUNT(*) FILTER (WHERE applicant_stage = 'screening')                        AS under_review,
               COUNT(*) FILTER (WHERE applicant_stage = 'rejected')                         AS total_rejected
           FROM pg_application''',
        ()
    )
    row = counts[0] if counts else {}

    # Status breakdown
    by_status = Database.execute_query(
        '''SELECT applicant_stage AS application_status, COUNT(*) AS count
           FROM pg_application
           GROUP BY applicant_stage
           ORDER BY count DESC''',
        ()
    )

    # Program breakdown (PG programmes)
    by_program = Database.execute_query(
        '''SELECT COALESCE(dg.code || ' ', '') || COALESCE(pgps.name, 'Unknown') AS name,
                  COUNT(*) AS count
           FROM pg_application pg
           LEFT JOIN degrees dg ON pg.degree_id = dg.id
           LEFT JOIN pg_program_setup pgps ON pg.proposed_course = pgps.id
           GROUP BY 1
           ORDER BY count DESC
           LIMIT 10''',
        ()
    )

    # Recent activity — PG only
    activity_rows = Database.execute_query(
        f'''SELECT event_type, form_no, applicant_name, event_time
            FROM (
                SELECT pg.decision          AS event_type,
                       pg.form_no,
                       {USER_NAME_EXPR}      AS applicant_name,
                       pg.decision_date     AS event_time
                FROM pg_application pg
                JOIN users u ON pg.user_id = u.id
                WHERE pg.decision IS NOT NULL
                  AND pg.decision_date IS NOT NULL

                UNION ALL

                SELECT 'submitted'           AS event_type,
                       pg.form_no,
                       {USER_NAME_EXPR}      AS applicant_name,
                       pg.updated_date        AS event_time
                FROM pg_application pg
                JOIN users u ON pg.user_id = u.id
                WHERE pg.applicant_stage = 'submitted'

                UNION ALL

                SELECT 'pg_evaluated'        AS event_type,
                       pg.form_no,
                       {USER_NAME_EXPR}      AS applicant_name,
                       pde.evaluated_at      AS event_time
                FROM pg_application pg
                JOIN users u ON pg.user_id = u.id
                JOIN pg_dean_evaluation pde ON pde.application_id = pg.uuid
            ) combined
            ORDER BY event_time DESC NULLS LAST
            LIMIT %s''',
        (activity_limit,)
    )

    label_map = {
        'accept':       lambda r: f"{r['form_no']} accepted — {r['applicant_name']}",
        'reject':       lambda r: f"{r['form_no']} rejected — {r['applicant_name']}",
        'recommend':    lambda r: f"{r['form_no']} recommended — {r['applicant_name']}",
        'submitted':    lambda r: f"New PG application — {r['applicant_name']}",
        'pg_evaluated': lambda r: f"Section B evaluated — {r['applicant_name']}",
    }

    activities = []
    for r in (activity_rows or []):
        etype = r['event_type']
        fn = label_map.get(etype) or (lambda r: f"{r['form_no']} updated — {r['applicant_name']}")
        activities.append({
            'type':       etype,
            'label':      fn(r),
            'event_time': r['event_time'].isoformat() if r['event_time'] else None,
        })

    return jsonify({
        'statistics': {
            'total_applications': int(row.get('total_applications', 0)),
            'total_admitted':     int(row.get('total_admitted', 0)),
            'pending_submission': int(row.get('pending_submission', 0)),
            'new_applications':   int(row.get('new_applications', 0)),
            'under_review':       int(row.get('under_review', 0)),
            'total_rejected':     int(row.get('total_rejected', 0)),
            'by_status':          by_status or [],
            'by_program':         by_program or [],
        },
        'recent_activity': activities,
    }), 200


# ─── Applications list ─────────────────────────────────────────────────────────

@pgadmin_bp.route('/applications', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.pgadmin_required
def get_applications(payload):
    """Paginated, filtered list of PG applications."""
    _ensure_evaluation_table()
    status   = request.args.get('status', 'submitted')
    search   = request.args.get('search', '').strip()
    page     = max(int(request.args.get('page', 1)), 1)
    per_page = max(int(request.args.get('per_page', 10)), 1)

    base_select = f'''SELECT pg.uuid AS id, pg.user_id,
                             {USER_NAME_EXPR} AS name,
                             u.email, u.phone_number,
                             2 AS program_id,
                             COALESCE(
                                 CASE
                                     WHEN pg.applicant_stage IN ('admitted', 'accepted', 'enrolled')
                                     THEN pg.finalised_course
                                 END,
                                 pg.approved_course,
                                 COALESCE(dg.code || ' ', '') || COALESCE(pgps.name, '')
                             ) AS program_name,
                             pg.applicant_stage AS application_status,
                             pg.updated_date AS submitted_at,
                             pg.form_no,
                             COALESCE(asess.name, CAST(pg.academic_session_id AS TEXT)) AS session,
                             pde.id IS NOT NULL AS has_evaluation
                       FROM pg_application pg
                       JOIN users u ON pg.user_id = u.id
                       LEFT JOIN academic_sessions asess ON pg.academic_session_id = asess.id
                       LEFT JOIN degrees dg ON pg.degree_id = dg.id
                       LEFT JOIN pg_program_setup pgps ON pgps.id = pg.proposed_course
                       LEFT JOIN pg_dean_evaluation pde ON pde.application_id = pg.uuid'''

    if status == 'admitted':
        where_clause = " WHERE pg.applicant_stage IN ('admitted', 'accepted', 'enrolled')"
        params = []
    else:
        where_clause = " WHERE pg.applicant_stage = %s"
        params = [status]

    if search:
        where_clause += f" AND (({USER_NAME_EXPR}) ILIKE %s OR pg.form_no ILIKE %s)"
        pat = f'%{search}%'
        params.extend([pat, pat])

    count_query = f'''SELECT COUNT(*) AS total
                      FROM pg_application pg
                      JOIN users u ON pg.user_id = u.id
                      LEFT JOIN academic_sessions asess ON pg.academic_session_id = asess.id
                      LEFT JOIN degrees dg ON pg.degree_id = dg.id
                      LEFT JOIN pg_program_setup pgps ON pgps.id = pg.proposed_course
                      LEFT JOIN pg_dean_evaluation pde ON pde.application_id = pg.uuid''' + where_clause

    count_result = Database.execute_query(count_query, tuple(params))
    total_count  = int(count_result[0]['total']) if count_result else 0
    total_pages  = math.ceil(total_count / per_page) if total_count > 0 else 1
    offset       = (page - 1) * per_page

    query = base_select + where_clause + ' ORDER BY pg.updated_date DESC LIMIT %s OFFSET %s'
    params.extend([per_page, offset])

    applications = Database.execute_query(query, tuple(params))

    return jsonify({
        'count':       total_count,
        'page':        page,
        'per_page':    per_page,
        'total_pages': total_pages,
        'applications': applications or [],
    }), 200


# ─── Application detail ────────────────────────────────────────────────────────

@pgadmin_bp.route('/application/<application_id>', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.pgadmin_required
def get_application_detail(payload, application_id):
    """Full PG application detail."""
    _ensure_evaluation_table()

    applicant = Database.execute_query(
        f'''SELECT pg.uuid AS id, pg.user_id,
                   {USER_NAME_EXPR} AS name,
                   u.email, u.phone_number,
                   2 AS program_id,
                   COALESCE(
                       CASE
                           WHEN pg.applicant_stage IN ('admitted', 'accepted', 'enrolled')
                           THEN pg.finalised_course
                       END,
                       pg.approved_course,
                       COALESCE(dg.code || ' ', '') || COALESCE(pgps.name, '')
                   ) AS program_name,
                   pg.applicant_stage AS application_status,
                   pg.updated_date AS submitted_at,
                   pg.form_no,
                   pg.decision,
                   pg.decision_date,
                   pg.approved_course,
                   pg.finalised_course,
                   pg.applicant_recommended_course,
                   pg.admission_letter_sent,
                   COALESCE(asess.name, '') AS session
            FROM pg_application pg
            JOIN users u ON pg.user_id = u.id
            LEFT JOIN degrees dg ON pg.degree_id = dg.id
            LEFT JOIN academic_sessions asess ON pg.academic_session_id = asess.id
            LEFT JOIN pg_program_setup pgps ON pgps.id = pg.proposed_course
            WHERE pg.uuid = %s''',
        (application_id,)
    )

    if not applicant:
        return jsonify({'message': 'PG application not found'}), 404

    # Load full PG form data
    pg_app = Database.execute_query(
        '''SELECT pg.*,
                  ns.name AS next_of_kin_name, ns.address AS next_of_kin_address,
                  ns.phone_number AS next_of_kin_phone_number,
                  ns.secondary_number AS next_of_kin_secondary_phone_number,
                  ns.sponsor_name, ns.sponsor_address,
                  ref.name1 AS referee_name1, ref.address1 AS referee_address1,
                  ref.name2 AS referee_name2, ref.address2 AS referee_address2,
                  ref.name3 AS referee_name3, ref.address3 AS referee_address3
           FROM pg_application pg
           LEFT JOIN nextofkin_sponsor ns ON ns.id = pg.nextofkin_sponsor_id
           LEFT JOIN pg_reference ref ON ref.id = pg.pg_reference_id
           WHERE pg.uuid = %s''',
        (application_id,)
    )

    form_data = {}
    if pg_app:
        row = pg_app[0]
        
        # Load signature and transcript dynamically
        sig_res = Database.execute_query(
            "SELECT file_url FROM pg_document WHERE pg_application_id = %s AND document_type = 'signature'",
            (application_id,)
        )
        signature_file = sig_res[0]['file_url'] if sig_res else None

        trans_res = Database.execute_query(
            "SELECT file_url FROM pg_document WHERE pg_application_id = %s AND document_type = 'transcript'",
            (application_id,)
        )
        transcript_file = trans_res[0]['file_url'] if trans_res else None

        form_data = {
            'first_name':               row['first_name'],
            'last_name':                row['surname'],
            'middle_name':              row['middle_name'],
            'email':                    row['email'],
            'gender':                   row['gender'],
            'date_of_birth':            row['date_of_birth'].strftime('%Y-%m-%d') if row['date_of_birth'] else None,
            'phone_number':             row['phone_number'],
            'secondary_phone_number':   row['secondary_phone_number'],
            'address':                  row['address'],
            'physically_challenged':    row['physically_challenged'],
            'previous_institution':     row['previous_institution'],
            'previous_course':          row['previous_course'],
            'department':               row['department'],
            'class_of_degree':          row['class_of_degree'],
            'proposed_course':          row['proposed_course'],
            'proposed_faculty_id':      row['proposed_faculty_id'],
            'degree_id':                row['degree_id'],
            'area_of_specialisation':   row['area_of_specialisation'],
            'proposed_research_title':  row['proposed_research_title'],
            'mode_of_study':            row['mode_of_study'],
            'sponsor_name':             row['sponsor_name'],
            'sponsor_address':          row['sponsor_address'],
            'next_of_kin_name':         row['next_of_kin_name'],
            'next_of_kin_address':      row['next_of_kin_address'],
            'next_of_kin_phone_number': row['next_of_kin_phone_number'],
            'next_of_kin_secondary_phone_number': row['next_of_kin_secondary_phone_number'],
            'referee_name1':            row['referee_name1'],
            'referee_address1':         row['referee_address1'],
            'referee_name2':            row['referee_name2'],
            'referee_address2':         row['referee_address2'],
            'referee_name3':            row['referee_name3'],
            'referee_address3':         row['referee_address3'],
            'document_signature':       signature_file,
            'document_transcript':      transcript_file,
        }
        names = [form_data.get('first_name'), form_data.get('middle_name'), form_data.get('last_name')]
        form_data['full_name'] = ' '.join(filter(None, names))

        if form_data['physically_challenged'] and form_data['physically_challenged'] != 'No':
            form_data['physical_challenge_reason'] = form_data['physically_challenged']
            form_data['physically_challenged'] = 'Yes'
        else:
            form_data['physically_challenged'] = 'No'
            form_data['physical_challenge_reason'] = ''

        if row['proposed_course']:
            c = Database.execute_query('SELECT name FROM pg_program_setup WHERE id = %s', (row['proposed_course'],))
            if c: form_data['proposed_course_name'] = c[0]['name']
        if row['proposed_faculty_id']:
            f = Database.execute_query('SELECT name FROM faculties WHERE id = %s', (row['proposed_faculty_id'],))
            if f: form_data['proposed_faculty_name'] = f[0]['name']
        if row['degree_id']:
            d = Database.execute_query('SELECT name, code FROM degrees WHERE id = %s', (row['degree_id'],))
            if d:
                form_data['degree_name'] = d[0]['name']
                form_data['degree_code'] = d[0]['code']

    # Uploaded documents
    documents = Database.execute_query(
        '''SELECT id, document_type, file_type, file_name AS original_filename, file_size
           FROM pg_document WHERE pg_application_id = %s''',
        (application_id,)
    )

    # Existing Section B evaluation
    evaluation = _get_evaluation(application_id)

    return jsonify({
        'applicant':  dict(applicant[0]),
        'form':       form_data or None,
        'documents':  documents or [],
        'evaluation': evaluation,
    }), 200


# ─── Section B Evaluation ──────────────────────────────────────────────────────

def _ensure_evaluation_table():
    """Create pg_dean_evaluation table if it doesn't exist yet."""
    Database.execute_update(
        '''CREATE TABLE IF NOT EXISTS pg_dean_evaluation (
               id                  SERIAL PRIMARY KEY,
               application_id      UUID NOT NULL UNIQUE,
               transcript_received VARCHAR(10) DEFAULT 'No',
               transcript_comment  TEXT,
               ref_letters_count   INTEGER DEFAULT 0,
               recommendation      TEXT,
               supervisor_name     VARCHAR(255),
               dean_user_id        UUID,
               evaluated_at        TIMESTAMP DEFAULT NOW(),
               updated_at          TIMESTAMP DEFAULT NOW()
           )''',
        ()
    )


def _get_evaluation(application_id):
    rows = Database.execute_query(
        '''SELECT pde.*,
                  u.firstname || ' ' || COALESCE(u.middlename || ' ', '') || u.surname AS dean_name
           FROM pg_dean_evaluation pde
           LEFT JOIN users u ON u.id = pde.dean_user_id
           WHERE pde.application_id = %s''',
        (str(application_id),)
    )
    if rows:
        r = dict(rows[0])
        if r.get('evaluated_at'):
            r['evaluated_at'] = r['evaluated_at'].isoformat()
        if r.get('updated_at'):
            r['updated_at'] = r['updated_at'].isoformat()
        return r
    return None


@pgadmin_bp.route('/evaluation/<application_id>', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.pgadmin_required
def get_evaluation(payload, application_id):
    """Retrieve the Section B evaluation for a PG application."""
    _ensure_evaluation_table()
    evaluation = _get_evaluation(application_id)
    return jsonify({'evaluation': evaluation}), 200


@pgadmin_bp.route('/evaluate/<application_id>', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.pgadmin_required
def save_evaluation(payload, application_id):
    """Save or update the Section B evaluation."""
    _ensure_evaluation_table()

    # Make sure this is a real PG application
    app_check = Database.execute_query(
        'SELECT uuid FROM pg_application WHERE uuid = %s',
        (application_id,)
    )
    if not app_check:
        return jsonify({'message': 'PG application not found'}), 404

    data               = request.get_json() or {}
    transcript_received = data.get('transcript_received', 'No')
    transcript_comment  = data.get('transcript_comment', '')
    ref_letters_count   = int(data.get('ref_letters_count', 0))
    recommendation      = data.get('recommendation', '')
    supervisor_name     = data.get('supervisor_name', '')
    dean_user_id        = payload['user_id']

    existing = Database.execute_query(
        'SELECT id FROM pg_dean_evaluation WHERE application_id = %s', (str(application_id),)
    )

    if existing:
        Database.execute_update(
            '''UPDATE pg_dean_evaluation
               SET transcript_received = %s,
                   transcript_comment  = %s,
                   ref_letters_count   = %s,
                   recommendation      = %s,
                   supervisor_name     = %s,
                   dean_user_id        = %s,
                   updated_at          = NOW()
               WHERE application_id = %s''',
            (transcript_received, transcript_comment, ref_letters_count,
             recommendation, supervisor_name, dean_user_id, str(application_id))
        )
    else:
        Database.execute_update(
            '''INSERT INTO pg_dean_evaluation
                   (application_id, transcript_received, transcript_comment,
                    ref_letters_count, recommendation, supervisor_name, dean_user_id, evaluated_at, updated_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW())''',
            (str(application_id), transcript_received, transcript_comment,
             ref_letters_count, recommendation, supervisor_name, dean_user_id)
        )

    # After Admin evaluates, move application to 'screening' so it is ready for review/finalization
    Database.execute_update(
        '''UPDATE pg_application
           SET applicant_stage = 'screening', updated_date = NOW()
           WHERE uuid = %s AND applicant_stage = 'submitted' ''',
        (application_id,)
    )

    evaluation = _get_evaluation(application_id)
    return jsonify({
        'message':    'Section B evaluation saved successfully',
        'evaluation': evaluation,
    }), 200


# ─── Review Application (Finalisation) ─────────────────────────────────────────

@pgadmin_bp.route('/programs', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.pgadmin_required
def get_programs(payload):
    """Return active postgraduate programs for admin review decisions."""
    programs = Database.execute_query(
        '''SELECT
               ps.id,
               ps.name,
               COALESCE(dg.code || ' ', '') || ps.name AS full_name,
               d.id AS department_id,
               d.name AS department,
               dg.id AS degree_id,
               dg.name AS degree,
               dg.code AS degree_code
           FROM pg_program_setup ps
           LEFT JOIN departments d ON ps.department_id = d.id
           LEFT JOIN degrees dg ON ps.degree_id = dg.id
           WHERE ps.is_active = TRUE
           ORDER BY d.name, ps.name''',
        ()
    )
    return jsonify(programs or []), 200


@pgadmin_bp.route('/review-application', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.pgadmin_required
def review_application(payload):
    """Review and approve/reject/recommend application."""
    _ensure_recommendation_columns()
    

    data = request.get_json()

    if not data or 'applicant_id' not in data or 'decision' not in data:
        return jsonify({'message': 'applicant_id and decision are required'}), 400

    applicant_id    = data['applicant_id']
    decision        = data['decision']        # 'accept', 'reject', 'recommend'
    approved_course = data.get('approved_course')  # course name string

    if decision not in ['accept', 'reject', 'recommend']:
        return jsonify({'message': 'Invalid decision. Must be accept, reject, or recommend'}), 400

    if decision in ['accept', 'recommend'] and not approved_course:
        return jsonify({'message': 'approved_course is required when decision is accept or recommend'}), 400

    admin_user_id = payload['user_id']

    current_app = Database.execute_query(
        '''SELECT applicant_stage, approved_course, applicant_recommended_course
           FROM pg_application WHERE uuid = %s''',
        (applicant_id,)
    )
    
    if not current_app:
        return jsonify({'message': 'Applicant not found'}), 404
    
    current_stage = current_app[0]['applicant_stage']
    current_approved_course = current_app[0].get('approved_course')
    applicant_rec_course = current_app[0].get('applicant_recommended_course')
    # Determine new status based on decision and current context
    if decision == 'recommend':
        new_status = 'recommended'
        stored_approved_course = approved_course
        finalised_course = None
    elif decision == 'reject':
        new_status = 'rejected'
        stored_approved_course = current_approved_course or approved_course
        finalised_course = None
    else:  # decision == 'accept'
        stored_approved_course = current_approved_course or approved_course
        if current_stage == 'accepted_recommendation':
            # Applicant accepted the recommendation → finalize it
            new_status = 'admitted'
            finalised_course = approved_course
        elif current_stage == 'applicant_recommended':
            # Applicant recommended alternative → accept their recommendation
            new_status = 'admitted'
            finalised_course = approved_course
        else:
            # Direct acceptance
            new_status = 'admitted'
            finalised_course = approved_course
        if current_stage == 'applicant_recommended':
            finalised_course = applicant_rec_course or finalised_course
        elif current_stage == 'accepted_recommendation':
            finalised_course = stored_approved_course

    ps_id = None
    department_id = None
    degree_id = None
    
    # Resolve only the final admitted course. Recommendation should not alter
    # the applicant's original proposed_course/program metadata.
    course_to_resolve = finalised_course
    if course_to_resolve:
        ps_res = Database.execute_query(
            '''SELECT ps.id, ps.department_id, ps.degree_id
               FROM pg_program_setup ps
               LEFT JOIN degrees dg ON ps.degree_id = dg.id
               WHERE LOWER(ps.name) = LOWER(%s)
                  OR LOWER(COALESCE(dg.code || ' ', '') || ps.name) = LOWER(%s)
               LIMIT 1''',
            (course_to_resolve, course_to_resolve)
        )
        if ps_res:
            ps_id = ps_res[0]['id']
            department_id = ps_res[0]['department_id']
            degree_id = ps_res[0]['degree_id']

    success = Database.execute_update(
        '''UPDATE pg_application
           SET applicant_stage         = %s,
               decision                = %s,
               decision_date           = NOW(),
               approved_course         = %s,
               finalised_course        = %s,
               degree_id               = COALESCE(%s, degree_id),
               decision_maker_user_id  = %s,
               updated_date            = NOW()
           WHERE uuid = %s''',
        (new_status, decision, stored_approved_course, finalised_course, degree_id, admin_user_id, applicant_id)
    )

    return jsonify({
        'message': f'PG Application {decision}ed successfully',
        'new_status': new_status
    }), 200


# ─── Send Admission Letter ─────────────────────────────────────────────────────

@pgadmin_bp.route('/send-admission-letter', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.pgadmin_required
def send_admission_letter(payload):
    
    
    """Send admission letter to single PG applicant"""

    from email_utils import send_email
    from utils.pdf_generator import PDFGenerator

    data = request.get_json()

    if not data or 'applicant_id' not in data:
        return jsonify({'message': 'applicant_id is required'}), 400

    applicant_id       = data['applicant_id']
    admission_date_db  = data.get('admission_date', datetime.now().strftime('%Y-%m-%d'))
    try:
        date_obj = datetime.strptime(admission_date_db, '%Y-%m-%d')
        admission_date_display = date_obj.strftime('%d %B, %Y')
    except Exception:
        admission_date_display = admission_date_db

    ref_no = get_pg_admission_ref(applicant_id)

    applicant = Database.execute_query(
        f'''SELECT u.id,
                   {USER_NAME_EXPR} AS name,
                   u.email,
                   2 AS program_id,
                   'Postgraduate' AS program_name,
                   '100 Level' AS level, 'N/A' AS department, 'N/A' AS faculty,
                   'Postgraduate' AS mode, pg.form_no AS session, 'TBD' AS resumption_date,
                   pg.applicant_stage
            FROM pg_application pg
            JOIN users u ON pg.user_id = u.id
            WHERE pg.uuid = %s AND pg.applicant_stage IN ('admitted', 'accepted')''',
        (applicant_id,)
    )

    if not applicant:
        return jsonify({'message': 'Applicant not found or PG application not admitted'}), 404

    if applicant[0]['applicant_stage'] != 'accepted':
        return jsonify({'message': 'Cannot send admission letter — applicant has not paid the acceptance fee yet'}), 402

    applicant_data = applicant[0]

    fees = Database.execute_query(
        '''SELECT fc.name, pf.amount
        FROM program_fees pf
        JOIN fee_components fc ON pf.fee_component_id = fc.id
        WHERE pf.program_type = 2''',
        ()
    )
    acceptance_fee_str = tuition_fee_str = other_fees_str = ''
    if fees:
        for fee in fees:
            name = (fee['name'] or '').lower()
            amount = fee['amount'] or 0
            if 'acceptance' in name:
                acceptance_fee_str = f"₦{amount:,.2f}"
            elif 'tuition' in name or 'accommodation' in name:
                tuition_fee_str = f"₦{amount:,.2f}"
            elif 'sundry' in name or 'other' in name or 'digital' in name:
                other_fees_str = f"₦{amount:,.2f}"

    session_res = Database.execute_query("SELECT name AS value FROM academic_sessions WHERE is_active = TRUE LIMIT 1")
    default_session = session_res[0]['value'] if session_res else '2025/2026'

    pdf_bytes = PDFGenerator.generate_admission_letter_pdf(
        candidateName=applicant_data['name'],
        email=applicant_data['email'],
        programme=applicant_data['program_name'] or '',
        level=applicant_data.get('level') or '100 Level',
        department=applicant_data.get('department') or '',
        faculty=applicant_data.get('faculty') or '',
        session=applicant_data.get('session') or default_session,
        mode=applicant_data.get('mode') or 'Full-Time',
        date=admission_date_display,
        acceptanceFee=acceptance_fee_str,
        tuition=tuition_fee_str,
        otherFees=other_fees_str,
        resumptionDate=applicant_data.get('resumption_date') or '',
        reference=ref_no,
        body_html=''
    )

    Database.execute_update(
        'UPDATE pg_application SET admission_letter_sent = TRUE, updated_date = NOW() WHERE uuid = %s',
        (applicant_id,)
    )

    body_text = f"Dear {applicant_data['name']},\n\nPlease find attached your provisional PG admission letter.\n\nBest regards,\nPostgraduate School Administration"
    email_sent = send_email(
        to_email=applicant_data['email'],
        subject='Provisional PG Admission Letter',
        body_text=body_text,
        attachments=[('admission_letter.pdf', pdf_bytes)]
    )

    return jsonify({
        'message':        'Admission letter sent successfully' if email_sent else 'Failed to send admission letter',
        'recipient_email': applicant_data['email'],
        'email_sent':     email_sent
    }), 201 if email_sent else 500


# ─── Print Application (PDF) ──────────────────────────────────────────────────

@pgadmin_bp.route('/print-application/<application_id>', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('pgadmin', 'pgdean', 'admissionofficer', 'admin')
def print_application(payload, application_id):
    _ensure_evaluation_table()

    app_row = Database.execute_query(
        f'''SELECT pg.uuid AS id, pg.user_id,
                   {USER_NAME_EXPR} AS name, u.email, u.phone_number,
                   pg.form_no, pg.applicant_stage,
                   COALESCE(asess.name, '') AS session
            FROM pg_application pg
            JOIN users u ON pg.user_id = u.id
            LEFT JOIN academic_sessions asess ON pg.academic_session_id = asess.id
            WHERE pg.uuid = %s''',
        (application_id,)
    )
    if not app_row:
        return jsonify({'message': 'PG application not found'}), 404

    app_data = dict(app_row[0])

    pg_app = Database.execute_query(
        '''SELECT pg.*,
                  ns.name AS next_of_kin_name, ns.address AS next_of_kin_address,
                  ns.phone_number AS next_of_kin_phone_number,
                  ns.secondary_number AS next_of_kin_secondary_phone_number,
                  ns.sponsor_name, ns.sponsor_address,
                  ref.name1 AS referee_name1, ref.address1 AS referee_address1,
                  ref.name2 AS referee_name2, ref.address2 AS referee_address2,
                  ref.name3 AS referee_name3, ref.address3 AS referee_address3
           FROM pg_application pg
           LEFT JOIN nextofkin_sponsor ns ON ns.id = pg.nextofkin_sponsor_id
           LEFT JOIN pg_reference ref ON ref.id = pg.pg_reference_id
           WHERE pg.uuid = %s''',
        (application_id,)
    )

    form = dict(pg_app[0]) if pg_app else {}

    # Load signature and transcript dynamically
    sig_res = Database.execute_query(
        "SELECT file_url FROM pg_document WHERE pg_application_id = %s AND document_type = 'signature'",
        (application_id,)
    )
    signature_file = sig_res[0]['file_url'] if sig_res else None

    trans_res = Database.execute_query(
        "SELECT file_url FROM pg_document WHERE pg_application_id = %s AND document_type = 'transcript'",
        (application_id,)
    )
    transcript_file = trans_res[0]['file_url'] if trans_res else None

    form['document_signature'] = signature_file
    form['document_transcript'] = transcript_file

    # Resolve names from FK ids
    course_name = faculty_name = degree_name = degree_code = ''
    if form.get('proposed_course'):
        c = Database.execute_query('SELECT name FROM pg_program_setup WHERE id = %s', (form['proposed_course'],))
        if c: course_name = c[0]['name']
    if form.get('proposed_faculty_id'):
        f = Database.execute_query('SELECT name FROM faculties WHERE id = %s', (form['proposed_faculty_id'],))
        if f: faculty_name = f[0]['name']
    if form.get('degree_id'):
        d = Database.execute_query('SELECT name, code FROM degrees WHERE id = %s', (form['degree_id'],))
        if d:
            degree_name = d[0]['name']
            degree_code = d[0]['code']

    evaluation = _get_evaluation(application_id)

    # --- Build references list ---
    referees = []
    for i in range(1, 4):
        rname = form.get(f'referee_name{i}', '') or ''
        raddr = form.get(f'referee_address{i}', '') or ''
        referees.append({'name': rname, 'address': raddr})

    # --- Signature: read from disk and encode as base64 ---
    signature_b64 = ''
    sig_path = form.get('document_signature') or ''
    if sig_path:
        # Normalise path (same as download-document logic)
        if not os.path.exists(sig_path):
            parts = sig_path.replace('\\', '/').split('/uploads/')
            if len(parts) > 1:
                base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                sig_path = os.path.join(base_dir, 'uploads', parts[1].replace('/', os.sep))
        if os.path.exists(sig_path):
            try:
                import base64 as _b64
                with open(sig_path, 'rb') as _f:
                    signature_b64 = _b64.b64encode(_f.read()).decode('utf-8')
            except Exception as _e:
                print(f"Could not read signature file: {_e}")
        else:
            print(f"Signature file not found on disk: {sig_path}")

    # --- Generate PDF using ReportLab ---
    try:
        pdf_bytes = PGApplicationPDFGenerator.generate_pdf(
            app_data=app_data,
            form=form,
            degree_name=degree_name,
            degree_code=degree_code,
            course_name=course_name,
            faculty_name=faculty_name,
            referees=referees,
            evaluation=evaluation,
            signature_b64=signature_b64
        )
        filename = f"pg_application_{app_data.get('form_no') or application_id}.pdf"
        return Response(
            pdf_bytes,
            mimetype='application/pdf',
            headers={'Content-Disposition': f'attachment; filename={filename}'}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'message': f'PDF generation failed: {str(e)}'}), 500
