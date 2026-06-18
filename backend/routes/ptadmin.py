"""routes/ptadmin.py — PT Admin: part-time applications portal."""
import os
import math
from datetime import datetime
from flask import Blueprint, request, jsonify, Response
from database import Database
from utils.auth import AuthHandler
from utils.pt_application_generator import PTApplicationPDFGenerator

ptadmin_bp = Blueprint('ptadmin', __name__)

USER_NAME_EXPR = "u.firstname || ' ' || COALESCE(u.middlename || ' ', '') || u.surname"
PT_PROG_TYPE = 7  # Part Time
PT_PROG_TYPES = (4, 7)  # Part Time (7) and HND Direct Entry Conversion (4)

# ─── Dashboard ─────────────────────────────────────────────────────────────────

@ptadmin_bp.route('/dashboard', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.ptadmin_required
def dashboard(payload):
    """PT-only stats + recent activity for the Admin's dashboard."""
    activity_limit = int(request.args.get('limit', 10))

    # Aggregate counts — PT and HND Conversion
    counts = Database.execute_query(
        '''SELECT
               COUNT(*) FILTER (WHERE applicant_stage NOT IN ('started', 'in_progress')) AS total_applications,
               COUNT(*) FILTER (WHERE applicant_stage IN ('admitted','accepted','enrolled')) AS total_admitted,
               COUNT(*) FILTER (WHERE applicant_stage IN ('started', 'in_progress'))        AS pending_submission,
               COUNT(*) FILTER (WHERE applicant_stage = 'submitted')                        AS new_applications,
               COUNT(*) FILTER (WHERE applicant_stage IN ('screening', 'accepted_recommendation', 'applicant_recommended', 'shortlisted')) AS under_review,
               COUNT(*) FILTER (WHERE applicant_stage = 'rejected')                         AS total_rejected
           FROM applications
           WHERE prog_type IN (4, 7)''',
        ()
    )
    row = counts[0] if counts else {}

    # Status breakdown
    by_status = Database.execute_query(
        '''SELECT CASE WHEN applicant_stage = 'in_progress' THEN 'started' ELSE applicant_stage END AS application_status,
                  COUNT(*) AS count
           FROM applications
           WHERE prog_type IN (4, 7)
           GROUP BY 1
           ORDER BY count DESC''',
        ()
    )

    # Program breakdown (PT / HND Conversion programmes)
    by_program = Database.execute_query(
        '''SELECT COALESCE(dg.code || ' ', '') || COALESCE(ps.name, 'Unknown') AS name,
                  COUNT(*) AS count
           FROM applications app
           LEFT JOIN degrees dg ON app.degree_id = dg.id
           LEFT JOIN program_choice pc ON pc.application_id = app.id
           LEFT JOIN program_setup ps ON pc.first_choice = ps.id
           WHERE app.prog_type IN (4, 7)
           GROUP BY 1
           ORDER BY count DESC
           LIMIT 10''',
        ()
    )

    # Recent activity — PT and HND Conversion
    activity_rows = Database.execute_query(
        f'''SELECT event_type, form_no, applicant_name, event_time
            FROM (
                SELECT app.decision          AS event_type,
                       app.form_no,
                       {USER_NAME_EXPR}      AS applicant_name,
                       app.decision_date     AS event_time
                FROM applications app
                JOIN users u ON app.user_id = u.id
                WHERE app.prog_type IN (4, 7)
                  AND app.decision IS NOT NULL
                  AND app.decision_date IS NOT NULL

                UNION ALL

                SELECT 'submitted'           AS event_type,
                       app.form_no,
                       {USER_NAME_EXPR}      AS applicant_name,
                       app.updated_at        AS event_time
                FROM applications app
                JOIN users u ON app.user_id = u.id
                WHERE app.prog_type IN (4, 7)
                  AND app.applicant_stage = 'submitted'
            ) combined
            ORDER BY event_time DESC NULLS LAST
            LIMIT %s''',
        (activity_limit,)
    )

    label_map = {
        'admit':      lambda r: f"{r['form_no']} admitted — {r['applicant_name']}",
        'accept':     lambda r: f"{r['form_no']} accepted — {r['applicant_name']}",
        'reject':     lambda r: f"{r['form_no']} rejected — {r['applicant_name']}",
        'shortlist':  lambda r: f"{r['form_no']} shortlisted — {r['applicant_name']}",
        'incomplete': lambda r: f"{r['form_no']} marked incomplete — {r['applicant_name']}",
        'submitted':  lambda r: f"New PT application — {r['applicant_name']}",
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

@ptadmin_bp.route('/applications', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.ptadmin_required
def get_applications(payload):
    """Paginated, filtered list of PT applications."""
    status   = request.args.get('status', 'submitted')
    search   = request.args.get('search', '').strip()
    page     = max(int(request.args.get('page', 1)), 1)
    per_page = max(int(request.args.get('per_page', 10)), 1)

    base_select = f'''SELECT app.id, app.user_id,
                             {USER_NAME_EXPR} AS name,
                             u.email, u.phone_number,
                             app.prog_type AS program_id,
                             COALESCE(
                                 CASE
                                     WHEN app.applicant_stage IN ('started', 'in_progress')
                                     THEN pt.name
                                     WHEN app.applicant_stage IN ('admitted', 'accepted', 'enrolled')
                                     THEN app.finalised_course
                                 END,
                                 app.approved_course,
                                 COALESCE(dg.code || ' ', '') || COALESCE(ps.name, '')
                             ) AS program_name,
                             app.applicant_stage AS application_status,
                             app.updated_at AS submitted_at,
                             app.form_no,
                             COALESCE(asess.name, CAST(app.academic_session_id AS TEXT)) AS session
                       FROM applications app
                       JOIN users u ON app.user_id = u.id
                       LEFT JOIN academic_sessions asess ON app.academic_session_id = asess.id
                       LEFT JOIN program_types pt ON app.prog_type = pt.id
                       LEFT JOIN degrees dg ON app.degree_id = dg.id
                       LEFT JOIN program_choice pc ON pc.application_id = app.id
                       LEFT JOIN program_setup ps ON pc.first_choice = ps.id'''

    where_clauses = ["app.prog_type IN (4, 7)"]
    params = []

    if status == 'admitted':
        where_clauses.append("app.applicant_stage IN ('admitted', 'accepted', 'enrolled')")
    elif status == 'screening':
        where_clauses.append("app.applicant_stage IN ('screening', 'accepted_recommendation', 'applicant_recommended', 'shortlisted')")
    elif status == 'all':
        where_clauses.append("app.applicant_stage IN ('submitted', 'screening', 'accepted_recommendation', 'applicant_recommended', 'shortlisted', 'admitted', 'accepted', 'enrolled', 'recommended', 'rejected', 'incomplete')")
    elif status == 'started':
        where_clauses.append("app.applicant_stage IN ('started', 'in_progress')")
    else:
        where_clauses.append("app.applicant_stage = %s")
        params.append(status)

    if search:
        where_clauses.append(f"(({USER_NAME_EXPR}) ILIKE %s OR app.form_no ILIKE %s)")
        pat = f'%{search}%'
        params.extend([pat, pat])

    where_str = " WHERE " + " AND ".join(where_clauses)

    count_query = f'''SELECT COUNT(*) AS total
                      FROM applications app
                      JOIN users u ON app.user_id = u.id
                      LEFT JOIN academic_sessions asess ON app.academic_session_id = asess.id
                      LEFT JOIN degrees dg ON app.degree_id = dg.id
                      LEFT JOIN program_choice pc ON pc.application_id = app.id
                      LEFT JOIN program_setup ps ON pc.first_choice = ps.id''' + where_str

    count_result = Database.execute_query(count_query, tuple(params))
    total_count  = int(count_result[0]['total']) if count_result else 0
    total_pages  = math.ceil(total_count / per_page) if total_count > 0 else 1
    offset       = (page - 1) * per_page

    query = base_select + where_str + ' ORDER BY app.updated_at DESC LIMIT %s OFFSET %s'
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

@ptadmin_bp.route('/application/<application_id>', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.ptadmin_required
def get_application_detail(payload, application_id):
    """Full PT application detail."""
    applicant = Database.execute_query(
        f'''SELECT app.id, app.user_id,
                   {USER_NAME_EXPR} AS name,
                   u.email, u.phone_number,
                   app.prog_type AS program_id,
                   COALESCE(
                       CASE
                           WHEN app.applicant_stage IN ('admitted', 'accepted', 'enrolled')
                           THEN app.finalised_course
                       END,
                       app.approved_course,
                       COALESCE(dg.code || ' ', '') || COALESCE(ps.name, '')
                   ) AS program_name,
                   app.applicant_stage AS application_status,
                   app.updated_at AS submitted_at,
                   app.form_no,
                   app.decision,
                   app.decision_date,
                   app.approved_course,
                   app.finalised_course,
                   app.applicant_recommended_course,
                   app.admission_letter_sent,
                   COALESCE(asess.name, '') AS session
            FROM applications app
            JOIN users u ON app.user_id = u.id
            LEFT JOIN degrees dg ON app.degree_id = dg.id
            LEFT JOIN academic_sessions asess ON app.academic_session_id = asess.id
            LEFT JOIN program_choice pc ON pc.application_id = app.id
            LEFT JOIN program_setup ps ON pc.first_choice = ps.id
            WHERE app.id = %s AND app.prog_type IN (4, 7)''',
        (application_id,)
    )

    if not applicant:
        return jsonify({'message': 'PT application not found'}), 404

    # Load biodata, next of kin, sponsor, academic qualification
    form_data = {}
    bd_res = Database.execute_query('SELECT * FROM biodata WHERE application_id = %s', (application_id,))
    nok_res = Database.execute_query('SELECT * FROM next_of_kin WHERE application_id = %s', (application_id,))
    sponsor_res = Database.execute_query('SELECT * FROM sponsor WHERE application_id = %s', (application_id,))
    aq_res = Database.execute_query(
        'SELECT aq.* FROM academic_qualification aq JOIN applications a ON aq.user_id = a.user_id WHERE a.id = %s',
        (application_id,)
    )

    if bd_res:
        form_data = dict(bd_res[0])
        if 'surname' in form_data:
            form_data['last_name'] = form_data['surname']
        if form_data.get('date_of_birth'):
            try:
                dob = form_data['date_of_birth']
                if hasattr(dob, 'strftime'):
                    form_data['date_of_birth'] = dob.strftime('%Y-%m-%d')
            except Exception:
                pass
        names = [form_data.get('first_name'), form_data.get('middle_name'), form_data.get('surname')]
        form_data['full_name'] = ' '.join(filter(None, names))

    if nok_res:
        nok_data = dict(nok_res[0])
        form_data['next_of_kin_name']         = nok_data.get('full_name')
        form_data['next_of_kin_phone_number'] = nok_data.get('phone_number')
        form_data['next_of_kin_address']      = nok_data.get('address')

    if sponsor_res:
        sponsor_data = dict(sponsor_res[0])
        form_data['sponsor_name']         = sponsor_data.get('full_name')
        form_data['sponsor_address']      = sponsor_data.get('address')
        form_data['sponsor_phone_number'] = sponsor_data.get('phone_number')

    if aq_res:
        aq = aq_res[0]
        # Resolve entry details
        form_data['utme_score'] = aq.get('utme_score')
        form_data['mode_of_entry'] = aq.get('mode_of_entry')
        form_data['previous_institution'] = aq.get('previous_institution') or aq.get('institution')
        form_data['previous_course'] = aq.get('previous_course') or aq.get('course')
        form_data['department'] = aq.get('department')

    # Resolve course & faculty names
    app_choice = Database.execute_query(
        '''SELECT ps.name AS course_name, f.name AS faculty_name
           FROM program_choice pc
           LEFT JOIN program_setup ps ON pc.first_choice = ps.id
           LEFT JOIN faculties f ON ps.faculty_id = f.id
           WHERE pc.application_id = %s''',
        (application_id,)
    )
    if app_choice:
        form_data['proposed_course_name'] = app_choice[0]['course_name']
        form_data['proposed_faculty_name'] = app_choice[0]['faculty_name']

    # Uploaded documents
    documents = Database.execute_query(
        '''SELECT id, document_type, file_type, file_name AS original_filename, file_size
           FROM documents WHERE application_id = %s''',
        (application_id,)
    )

    return jsonify({
        'applicant':  dict(applicant[0]),
        'form':       form_data or None,
        'documents':  documents or [],
    }), 200

# ─── Review Application (Finalisation) ─────────────────────────────────────────

@ptadmin_bp.route('/review-application', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.ptadmin_required
def review_application(payload):
    """Review and approve/reject/shortlist/incomplete application."""
    data = request.get_json()

    if not data or 'applicant_id' not in data or 'decision' not in data:
        return jsonify({'message': 'applicant_id and decision are required'}), 400

    applicant_id = data['applicant_id']
    decision     = data['decision']        # 'admit', 'reject', 'shortlist', 'incomplete'

    if decision not in ['admit', 'reject', 'shortlist', 'incomplete']:
        return jsonify({'message': 'Invalid decision. Must be admit, reject, shortlist, or incomplete'}), 400

    admin_user_id = payload['user_id']

    current_app = Database.execute_query(
        '''SELECT applicant_stage, approved_course, finalised_course, prog_type
           FROM applications WHERE id = %s AND prog_type IN (4, 7)''',
        (applicant_id,)
    )
    
    if not current_app:
        return jsonify({'message': 'Applicant not found'}), 404

    # Map decision to new applicant_stage status
    status_map = {
        'admit': 'admitted',
        'reject': 'rejected',
        'shortlist': 'shortlisted',
        'incomplete': 'incomplete'
    }
    new_status = status_map[decision]

    # If admitting, we also finalize course based on the first choice
    finalised_course = current_app[0].get('finalised_course')
    approved_course = current_app[0].get('approved_course')
    app_prog_type = current_app[0].get('prog_type')

    if decision == 'admit' and not finalised_course:
        # Default to first choice from program_choice
        choice_res = Database.execute_query(
            '''SELECT ps.name, ps.id, ps.degree_id
               FROM program_choice pc
               LEFT JOIN program_setup ps ON pc.first_choice = ps.id
               WHERE pc.application_id = %s''',
            (applicant_id,)
        )
        if choice_res and choice_res[0]['name']:
            finalised_course = choice_res[0]['name']
            approved_course = choice_res[0]['name']
            ps_id = choice_res[0]['id']
            degree_id = choice_res[0]['degree_id']
            
            # Update program setup ID on applications row
            Database.execute_update(
                '''UPDATE applications
                   SET program_setup_id = %s, degree_id = %s
                   WHERE id = %s''',
                (ps_id, degree_id, applicant_id)
            )

    success = Database.execute_update(
        '''UPDATE applications
           SET applicant_stage         = %s,
               decision                = %s,
               decision_date           = NOW(),
               approved_course         = COALESCE(approved_course, %s),
               finalised_course        = COALESCE(finalised_course, %s),
               decision_maker_user_id  = %s,
               updated_at              = NOW()
           WHERE id = %s AND prog_type = %s''',
        (new_status, decision, approved_course, finalised_course, admin_user_id, applicant_id, app_prog_type)
    )

    if not success:
        return jsonify({'message': 'Failed to review application'}), 500

    return jsonify({
        'message': f'PT Application {decision}ed successfully',
        'new_status': new_status
    }), 200

# ─── Print Application (PDF) ──────────────────────────────────────────────────

@ptadmin_bp.route('/print-application/<application_id>', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('ptadmin', 'admin')
def print_application(payload, application_id):
    """Retrieve the application summary and generate PDF for PT."""
    app_row = Database.execute_query(
        f'''SELECT app.id, app.user_id,
                   {USER_NAME_EXPR} AS name, u.email, u.phone_number,
                   app.form_no, app.applicant_stage,
                   COALESCE(asess.name, '') AS session
            FROM applications app
            JOIN users u ON app.user_id = u.id
            LEFT JOIN academic_sessions asess ON app.academic_session_id = asess.id
            WHERE app.id = %s AND app.prog_type IN (4, 7)''',
        (application_id,)
    )
    if not app_row:
        return jsonify({'message': 'PT application not found'}), 404

    app_data = dict(app_row[0])

    form_data = {}
    bd_res = Database.execute_query('SELECT * FROM biodata WHERE application_id = %s', (application_id,))
    nok_res = Database.execute_query('SELECT * FROM next_of_kin WHERE application_id = %s', (application_id,))
    sponsor_res = Database.execute_query('SELECT * FROM sponsor WHERE application_id = %s', (application_id,))
    aq_res = Database.execute_query(
        'SELECT aq.* FROM academic_qualification aq JOIN applications a ON aq.user_id = a.user_id WHERE a.id = %s',
        (application_id,)
    )

    if bd_res:
        form_data = dict(bd_res[0])
        if 'surname' in form_data:
            form_data['last_name'] = form_data['surname']
        if form_data.get('date_of_birth'):
            try:
                dob = form_data['date_of_birth']
                if hasattr(dob, 'strftime'):
                    form_data['date_of_birth'] = dob.strftime('%Y-%m-%d')
            except Exception:
                pass
        names = [form_data.get('first_name'), form_data.get('middle_name'), form_data.get('surname')]
        form_data['full_name'] = ' '.join(filter(None, names))

    if nok_res:
        nok_data = dict(nok_res[0])
        form_data['next_of_kin_name']         = nok_data.get('full_name')
        form_data['next_of_kin_phone_number'] = nok_data.get('phone_number')
        form_data['next_of_kin_address']      = nok_data.get('address')

    if sponsor_res:
        sponsor_data = dict(sponsor_res[0])
        form_data['sponsor_name']         = sponsor_data.get('full_name')
        form_data['sponsor_address']      = sponsor_data.get('address')
        form_data['sponsor_phone_number'] = sponsor_data.get('phone_number')

    if aq_res:
        aq = aq_res[0]
        form_data['utme_score'] = aq.get('utme_score')
        form_data['mode_of_entry'] = aq.get('mode_of_entry')
        form_data['previous_institution'] = aq.get('previous_institution') or aq.get('institution')
        form_data['previous_course'] = aq.get('previous_course') or aq.get('course')
        form_data['department'] = aq.get('department')

    app_choice = Database.execute_query(
        '''SELECT ps.name AS course_name, f.name AS faculty_name, dg.name AS degree_name, dg.code AS degree_code
           FROM program_choice pc
           LEFT JOIN program_setup ps ON pc.first_choice = ps.id
           LEFT JOIN faculties f ON ps.faculty_id = f.id
           LEFT JOIN degrees dg ON ps.degree_id = dg.id
           WHERE pc.application_id = %s''',
        (application_id,)
    )
    course_name = faculty_name = degree_name = degree_code = ''
    if app_choice:
        course_name = app_choice[0]['course_name'] or ''
        faculty_name = app_choice[0]['faculty_name'] or ''
        degree_name = app_choice[0]['degree_name'] or ''
        degree_code = app_choice[0]['degree_code'] or ''

    # Get signature if any
    sig_res = Database.execute_query(
        "SELECT file_url FROM documents WHERE application_id = %s AND document_type = 'signature'",
        (application_id,)
    )
    signature_file = sig_res[0]['file_url'] if sig_res else None

    signature_b64 = ''
    if signature_file:
        if not os.path.exists(signature_file):
            parts = signature_file.replace('\\', '/').split('/uploads/')
            if len(parts) > 1:
                base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                signature_file = os.path.join(base_dir, 'uploads', parts[1].replace('/', os.sep))
        if os.path.exists(signature_file):
            try:
                import base64 as _b64
                with open(signature_file, 'rb') as _f:
                    signature_b64 = _b64.b64encode(_f.read()).decode('utf-8')
            except Exception as _e:
                print(f"Could not read signature file: {_e}")

    try:
        pdf_bytes = PTApplicationPDFGenerator.generate_pdf(
            app_data=app_data,
            form=form_data,
            degree_name=degree_name,
            degree_code=degree_code,
            course_name=course_name,
            faculty_name=faculty_name,
            signature_b64=signature_b64
        )
        filename = f"pt_application_{app_data.get('form_no') or application_id}.pdf"
        return Response(
            pdf_bytes,
            mimetype='application/pdf',
            headers={'Content-Disposition': f'attachment; filename={filename}'}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'message': f'PDF generation failed: {str(e)}'}), 500


# ─── Letter Management ─────────────────────────────────────────────────────────

def _get_pt_admission_ref(applicant_id):
    """Build a reference string like PCU/PT/ADM/2025 or PCU/HND/ADM/2025 based on prog_type."""
    res = Database.execute_query(
        '''SELECT asess.name AS session_name, app.prog_type
           FROM applications app
           LEFT JOIN academic_sessions asess ON app.academic_session_id = asess.id
           WHERE app.id = %s AND app.prog_type IN (4, 7)''',
        (applicant_id,)
    )
    session_name = res[0]['session_name'] if res and res[0]['session_name'] else '2025/2026'
    prog_type = res[0]['prog_type'] if res else PT_PROG_TYPE
    code = 'HND' if prog_type == 4 else 'PT'
    session_year = session_name.split('/')[0] if '/' in session_name else datetime.now().strftime('%Y')
    return f"PCU/{code}/ADM/{session_year}"


@ptadmin_bp.route('/faculty-departments', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.ptadmin_required
def get_pt_faculty_departments(payload):
    """Return PT admitted applicants grouped by finalised/approved course (used as the 'department' selector)."""
    query = f'''
        SELECT COALESCE(app.finalised_course, app.approved_course, 'Unassigned') AS programme,
               COUNT(app.id) AS pending_count,
               app.prog_type
        FROM applications app
        WHERE app.prog_type IN (4, 7)
          AND app.applicant_stage IN ('admitted', 'accepted', 'enrolled')
          AND (app.admission_letter_sent IS NULL OR app.admission_letter_sent = FALSE)
        GROUP BY 1, app.prog_type
        ORDER BY 1
    '''
    results = Database.execute_query(query)

    faculties = {}
    if results:
        for row in results:
            prog = row['programme'] or 'Part Time'
            prog_type = row['prog_type']
            heading = "HND Conversion" if prog_type == 4 else "Part Time"
            if heading not in faculties:
                faculties[heading] = []
            faculties[heading].append({'name': prog, 'pending_count': int(row['pending_count'])})

    return jsonify({'faculties': faculties}), 200


@ptadmin_bp.route('/department-applicants/<department_name>', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.ptadmin_required
def get_pt_department_applicants(payload, department_name):
    """Return PT admitted applicants for a given programme/department group."""
    query = f'''
        SELECT app.id,
               {USER_NAME_EXPR} AS name,
               u.email,
               COALESCE(app.finalised_course, app.approved_course, 'Part Time') AS program_name
        FROM applications app
        JOIN users u ON app.user_id = u.id
        WHERE app.prog_type IN (4, 7)
          AND app.applicant_stage IN ('admitted', 'accepted', 'enrolled')
          AND (app.admission_letter_sent IS NULL OR app.admission_letter_sent = FALSE)
          AND COALESCE(app.finalised_course, app.approved_course, 'Unassigned') = %s
        ORDER BY u.firstname ASC
    '''
    applicants = Database.execute_query(query, (department_name,))
    return jsonify({'department': department_name, 'applicants': applicants or []}), 200


@ptadmin_bp.route('/send-department-letters', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.ptadmin_required
def send_pt_department_letters(payload):
    """Send admission letters to selected PT applicants."""
    import resend as _resend
    from config import Config
    from utils.pdf_generator import PDFGenerator

    data = request.get_json()
    department_name    = data.get('department_name')
    applicant_ids      = data.get('applicant_ids', [])
    admission_date_str = data.get('admission_date', datetime.now().strftime('%Y-%m-%d'))

    if not department_name or not applicant_ids:
        return jsonify({'message': 'department_name and applicant_ids required'}), 400

    try:
        date_obj = datetime.strptime(admission_date_str, '%Y-%m-%d')
        admission_date_display = date_obj.strftime('%d %B, %Y')
    except Exception:
        admission_date_display = admission_date_str

    session_res     = Database.execute_query("SELECT name AS value FROM academic_sessions WHERE is_active = TRUE LIMIT 1")
    default_session = session_res[0]['value'] if session_res else '2025/2026'

    sent_list   = []
    failed_list = []
    applicants_with_pdfs = []

    for applicant_id in applicant_ids:
        try:
            ref_no = _get_pt_admission_ref(applicant_id)

            applicant = Database.execute_query(
                f'''SELECT app.id,
                           {USER_NAME_EXPR} AS name,
                           u.email,
                           app.prog_type AS program_id,
                           COALESCE(app.finalised_course, app.approved_course, 'Part Time') AS program_name,
                           COALESCE(s.name, %s) AS session
                    FROM applications app
                    JOIN users u ON app.user_id = u.id
                    LEFT JOIN academic_sessions s ON app.academic_session_id = s.id
                    WHERE app.id = %s
                      AND app.prog_type IN (4, 7)
                      AND app.applicant_stage IN ('admitted', 'accepted', 'enrolled')''',
                (default_session, applicant_id)
            )

            if not applicant:
                failed_list.append({'applicant_id': applicant_id, 'error': 'Applicant not found or not admitted'})
                continue

            applicant_data = applicant[0]

            fees = Database.execute_query(
                '''SELECT fc.name, pf.amount
                   FROM program_fees pf
                   JOIN fee_components fc ON pf.fee_component_id = fc.id
                   WHERE pf.program_type = %s''',
                (applicant_data['program_id'],)
            )
            acceptance_fee_str = tuition_fee_str = other_fees_str = ''
            if fees:
                for fee in fees:
                    name   = (fee['name'] or '').lower()
                    amount = fee['amount'] or 0
                    if 'acceptance' in name:
                        acceptance_fee_str = f"₦{amount:,.2f}"
                    elif 'tuition' in name or 'accommodation' in name:
                        tuition_fee_str = f"₦{amount:,.2f}"
                    elif 'sundry' in name or 'other' in name or 'digital' in name:
                        other_fees_str = f"₦{amount:,.2f}"

            pdf_bytes = PDFGenerator.generate_admission_letter_pdf(
                candidate_name=applicant_data['name'],
                email=applicant_data['email'],
                programme=applicant_data['program_name'] or 'Part Time',
                level='100 Level',
                department='',
                faculty='',
                session=applicant_data.get('session') or default_session,
                mode='Part Time' if applicant_data['program_id'] == 7 else 'HND Conversion',
                date=admission_date_display,
                acceptanceFee=acceptance_fee_str,
                tuition=tuition_fee_str,
                otherFees=other_fees_str,
                resumptionDate='',
                reference=ref_no,
                body_html=''
            )

            applicants_with_pdfs.append({
                'applicant_id': applicant_id,
                'email':        applicant_data['email'],
                'name':         applicant_data['name'],
                'pdf_bytes':    pdf_bytes
            })

        except Exception as e:
            failed_list.append({'applicant_id': applicant_id, 'error': str(e)})

    if not applicants_with_pdfs:
        return jsonify({'message': 'No valid applicants to send letters', 'sent': 0, 'failed': len(failed_list)}), 400

    try:
        if not all([Config.RESEND_API_KEY, Config.RESEND_FROM_EMAIL]):
            raise ValueError("Resend not configured")

        _resend.api_key = Config.RESEND_API_KEY
        from_email_str  = f"{Config.RESEND_FROM_NAME} <{Config.RESEND_FROM_EMAIL}>"

        for a in applicants_with_pdfs:
            try:
                resp = _resend.Emails.send({
                    "from":    from_email_str,
                    "to":      [a['email']],
                    "subject": "Provisional Part-Time Admission Letter",
                    "html":    f"<p>Dear {a['name']},</p><p>Please find attached your provisional admission letter.</p><p>Best regards,<br>Part-Time Admissions Office</p>",
                    "attachments": [{"filename": "admission_letter.pdf", "content": list(a['pdf_bytes'])}]
                })
                if resp and resp.get("id"):
                    Database.execute_update(
                        'UPDATE applications SET admission_letter_sent = TRUE, updated_at = NOW() WHERE id = %s',
                        (a['applicant_id'],)
                    )
                    sent_list.append({'applicant_id': a['applicant_id'], 'name': a['name'], 'email': a['email']})
                else:
                    failed_list.append({'applicant_id': a['applicant_id'], 'error': f"Resend error: {resp}"})
            except Exception as _e:
                failed_list.append({'applicant_id': a['applicant_id'], 'error': str(_e)})

    except Exception as e:
        for a in applicants_with_pdfs:
            failed_list.append({'applicant_id': a['applicant_id'], 'error': str(e)})

    return jsonify({
        'message':     'Batch send completed',
        'sent':        len(sent_list),
        'failed':      len(failed_list),
        'sent_list':   sent_list,
        'failed_list': failed_list
    }), 201


@ptadmin_bp.route('/letter-status-summary', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.ptadmin_required
def get_pt_letter_status_summary(payload):
    """Return sent / failed letter status summary for PT applicants."""
    sent_query = f'''SELECT app.id,
                            app.form_no,
                            {USER_NAME_EXPR} AS name,
                            u.email,
                            COALESCE(app.finalised_course, app.approved_course, 'Part Time') AS course,
                            CASE WHEN app.prog_type = 4 THEN 'HND Conversion' ELSE 'Part Time' END AS program_name,
                            app.updated_at AS sent_at
                     FROM applications app
                     JOIN users u ON app.user_id = u.id
                     WHERE app.prog_type IN (4, 7)
                       AND app.admission_letter_sent = TRUE
                     ORDER BY app.updated_at DESC'''

    sent_rows = Database.execute_query(sent_query) or []
    sent = [
        {
            'applicant_id': r['id'],
            'form_no':      r['form_no'],
            'name':         r['name'],
            'email':        r['email'],
            'course':       r['course'] or '—',
            'program':      r['program_name'],
            'sent_at':      r['sent_at'].isoformat() if r['sent_at'] else None,
        }
        for r in sent_rows
    ]

    # Pending / failed: those admitted but letter not sent
    pending_query = f'''SELECT app.id,
                               app.form_no,
                               {USER_NAME_EXPR} AS name,
                               u.email,
                               CASE WHEN app.prog_type = 4 THEN 'HND Conversion' ELSE 'Part Time' END AS program_name,
                               NULL AS status, NULL AS sent_at, NULL AS error_message, 0 AS retry_count
                        FROM applications app
                        JOIN users u ON app.user_id = u.id
                        WHERE app.prog_type IN (4, 7)
                          AND app.applicant_stage IN ('admitted', 'accepted', 'enrolled')
                          AND (app.admission_letter_sent IS NULL OR app.admission_letter_sent = FALSE)
                        ORDER BY app.updated_at DESC'''

    pending_rows = Database.execute_query(pending_query) or []
    failed  = []
    pending = []
    for row in pending_rows:
        item = {
            'applicant_id':  row['id'],
            'form_no':       row['form_no'],
            'name':          row['name'],
            'email':         row['email'],
            'program':       row['program_name'],
            'status':        'pending',
            'sent_at':       None,
            'error_message': None,
            'retry_count':   0,
        }
        pending.append(item)

    return jsonify({
        'sent':    sent,
        'failed':  failed,
        'pending': pending,
        'summary': {
            'total_sent':    len(sent),
            'total_failed':  len(failed),
            'total_pending': len(pending),
        }
    }), 200


@ptadmin_bp.route('/resend-letter/<applicant_id>', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.ptadmin_required
def resend_pt_letter(payload, applicant_id):
    """Resend admission letter to a single PT applicant."""
    import resend as _resend
    from config import Config
    from utils.pdf_generator import PDFGenerator

    data = request.get_json() or {}
    admission_date_str = data.get('admission_date', datetime.now().strftime('%Y-%m-%d'))
    try:
        date_obj = datetime.strptime(admission_date_str, '%Y-%m-%d')
        admission_date_display = date_obj.strftime('%d %B, %Y')
    except Exception:
        admission_date_display = admission_date_str

    ref_no = _get_pt_admission_ref(applicant_id)

    session_res     = Database.execute_query("SELECT name AS value FROM academic_sessions WHERE is_active = TRUE LIMIT 1")
    default_session = session_res[0]['value'] if session_res else '2025/2026'

    applicant = Database.execute_query(
        f'''SELECT app.id,
                   {USER_NAME_EXPR} AS name,
                   u.email,
                   app.prog_type AS program_id,
                   COALESCE(app.finalised_course, app.approved_course, 'Part Time') AS program_name,
                   COALESCE(s.name, %s) AS session
            FROM applications app
            JOIN users u ON app.user_id = u.id
            LEFT JOIN academic_sessions s ON app.academic_session_id = s.id
            WHERE app.id = %s AND app.prog_type IN (4, 7)''',
        (default_session, applicant_id)
    )

    if not applicant:
        return jsonify({'message': 'PT applicant not found'}), 404

    applicant_data = applicant[0]

    fees = Database.execute_query(
        '''SELECT fc.name, pf.amount
           FROM program_fees pf
           JOIN fee_components fc ON pf.fee_component_id = fc.id
           WHERE pf.program_type = %s''',
        (applicant_data['program_id'],)
    )
    acceptance_fee_str = tuition_fee_str = other_fees_str = ''
    if fees:
        for fee in fees:
            name   = (fee['name'] or '').lower()
            amount = fee['amount'] or 0
            if 'acceptance' in name:
                acceptance_fee_str = f"₦{amount:,.2f}"
            elif 'tuition' in name or 'accommodation' in name:
                tuition_fee_str = f"₦{amount:,.2f}"
            elif 'sundry' in name or 'other' in name or 'digital' in name:
                other_fees_str = f"₦{amount:,.2f}"

    pdf_bytes = PDFGenerator.generate_admission_letter_pdf(
        candidate_name=applicant_data['name'],
        email=applicant_data['email'],
        programme=applicant_data['program_name'] or 'Part Time',
        level='100 Level', department='', faculty='',
        session=applicant_data.get('session') or default_session,
        mode='Part Time' if applicant_data['program_id'] == 7 else 'HND Conversion',
        date=admission_date_display,
        acceptanceFee=acceptance_fee_str, tuition=tuition_fee_str, otherFees=other_fees_str,
        resumptionDate='', reference=ref_no, body_html=''
    )

    try:
        if not all([Config.RESEND_API_KEY, Config.RESEND_FROM_EMAIL]):
            raise ValueError("Resend not configured")

        _resend.api_key = Config.RESEND_API_KEY
        from_email_str  = f"{Config.RESEND_FROM_NAME} <{Config.RESEND_FROM_EMAIL}>"

        resp = _resend.Emails.send({
            "from":    from_email_str,
            "to":      [applicant_data['email']],
            "subject": "Provisional Part-Time Admission Letter - Resend",
            "html":    f"<p>Dear {applicant_data['name']},</p><p>Please find attached your provisional admission letter.</p><p>Best regards,<br>Part-Time Admissions Office</p>",
            "attachments": [{"filename": "admission_letter.pdf", "content": list(pdf_bytes)}]
        })

        if resp and resp.get("id"):
            Database.execute_update(
                'UPDATE applications SET admission_letter_sent = TRUE, updated_at = NOW() WHERE id = %s',
                (applicant_id,)
            )
            return jsonify({'message': 'Letter resent successfully', 'applicant_id': applicant_id}), 200
        else:
            return jsonify({'message': 'Failed to resend letter', 'error': str(resp)}), 500

    except Exception as e:
        return jsonify({'message': 'Error resending letter', 'error': str(e)}), 500
