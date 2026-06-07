from flask import Blueprint, request, jsonify, Response
from database import Database
from utils.auth import AuthHandler
from datetime import datetime
from email_utils import send_email
from utils.pdf_generator import PDFGenerator
from utils.letter_templates import get_template_by_id, get_all_templates

admin_bp = Blueprint('admin', __name__)

# Helper: build full name from users table columns
# users table has: firstname, middlename, surname  (same as applicant_bp)
USER_NAME_EXPR = "u.firstname || ' ' || COALESCE(u.middlename || ' ', '') || u.surname"


def _get_pg_evaluation(application_id):
    """Retrieve the PG Dean Section B evaluation for a given application."""
    from routes.pgdean import _ensure_evaluation_table
    _ensure_evaluation_table()
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


def get_admission_ref(applicant_id):
    res = Database.execute_query(
        '''SELECT asess.name AS session_name
           FROM pg_application pg
           LEFT JOIN academic_sessions asess ON pg.academic_session_id = asess.id
           WHERE pg.uuid = %s''',
        (applicant_id,)
    )
    if not res:
        res = Database.execute_query(
            '''SELECT asess.name AS session_name
               FROM applications app
               LEFT JOIN academic_sessions asess ON app.academic_session_id = asess.id
               WHERE app.id = %s''',
            (applicant_id,)
        )
    session_name = res[0]['session_name'] if res and res[0]['session_name'] else '2025/2026'
    session_year = session_name.split('/')[0] if '/' in session_name else datetime.now().strftime('%Y')
    return f"PCU/ADM/{session_year}"



@admin_bp.route('/applications', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_applications(payload):
    """Get list of all applications with filtering, search, and pagination"""
    status = request.args.get('status', 'submitted')
    program_id = request.args.get('program_id')
    search = request.args.get('search', '').strip()
    page = max(int(request.args.get('page', 1)), 1)
    per_page = max(int(request.args.get('per_page', 10)), 1)

    include_pg = False
    include_non_pg = True

    if program_id:
        if int(program_id) == 2:
            include_non_pg = False
        else:
            include_pg = False

    if status == 'submitted':
        include_pg = False

    queries = []
    combined_params = []

    if include_non_pg:
        non_pg_where = []
        non_pg_params = []
        if status == 'admitted':
            non_pg_where.append("app.applicant_stage IN ('admitted', 'accepted', 'enrolled')")
        elif status == 'submitted':
            non_pg_where.append("app.applicant_stage = 'submitted' AND (app.prog_type != 2 OR app.prog_type IS NULL)")
        else:
            non_pg_where.append("app.applicant_stage = %s")
            non_pg_params.append(status)

        if program_id:
            non_pg_where.append("app.prog_type = %s")
            non_pg_params.append(program_id)

        if search:
            non_pg_where.append(f"(({USER_NAME_EXPR}) ILIKE %s OR app.form_no ILIKE %s)")
            non_pg_params.extend([f'%{search}%', f'%{search}%'])

        where_str = " AND ".join(non_pg_where)
        if where_str:
            where_str = " WHERE " + where_str

        q_non_pg = f'''
            SELECT app.id, app.user_id,
                   {USER_NAME_EXPR} AS name,
                   u.email, u.phone_number,
                   app.prog_type AS program_id,
                   (
                       CASE 
                           WHEN app.applicant_stage = 'submitted' THEN 
                               COALESCE(dg.code || ' ', '') || COALESCE(ps1.name, '')
                           WHEN app.applicant_stage = 'screening' THEN 
                               COALESCE(dg.code || ' ', '') || COALESCE(app.approved_course, ps1.name, '')
                           WHEN app.applicant_stage IN ('admitted', 'accepted') THEN 
                               COALESCE(dg.code || ' ', '') || COALESCE(app.finalised_course, app.approved_course, ps1.name, '')
                           ELSE 
                               COALESCE(dg.code || ' ', '') || COALESCE(app.finalised_course, app.approved_course, ps1.name, '')
                       END
                   ) AS program_name,
                   app.applicant_stage AS application_status,
                   app.updated_at AS submitted_at,
                   app.form_no,
                   COALESCE(asess.name, CAST(app.academic_session_id AS TEXT)) AS session
            FROM applications app
            JOIN users u ON app.user_id = u.id
            LEFT JOIN academic_sessions asess ON app.academic_session_id = asess.id
            LEFT JOIN degrees dg ON app.degree_id = dg.id
            LEFT JOIN program_choice pc ON pc.application_id = app.id
            LEFT JOIN program_setup ps1 ON pc.first_choice = ps1.id
            {where_str}
        '''
        queries.append((q_non_pg, non_pg_params))

    if include_pg:
        pg_where = []
        pg_params = []
        if status == 'admitted':
            pg_where.append("pg.applicant_stage IN ('admitted', 'accepted', 'enrolled')")
        else:
            pg_where.append("pg.applicant_stage = %s")
            pg_params.append(status)

        if search:
            pg_where.append(f"(({USER_NAME_EXPR}) ILIKE %s OR pg.form_no ILIKE %s)")
            pg_params.extend([f'%{search}%', f'%{search}%'])

        where_str = " AND ".join(pg_where)
        if where_str:
            where_str = " WHERE " + where_str

        q_pg = f'''
            SELECT pg.uuid AS id, pg.user_id,
                   {USER_NAME_EXPR} AS name,
                   u.email, u.phone_number,
                   2 AS program_id,
                   COALESCE(dg.code || ' ', '') || COALESCE(pg.finalised_course, pg.approved_course, pgps.name, '') AS program_name,
                   pg.applicant_stage AS application_status,
                   pg.updated_date AS submitted_at,
                   pg.form_no,
                   COALESCE(asess.name, CAST(pg.academic_session_id AS TEXT)) AS session
            FROM pg_application pg
            JOIN users u ON pg.user_id = u.id
            LEFT JOIN academic_sessions asess ON pg.academic_session_id = asess.id
            LEFT JOIN degrees dg ON pg.degree_id = dg.id
            LEFT JOIN pg_program_setup pgps ON pgps.id = pg.proposed_course
            {where_str}
        '''
        queries.append((q_pg, pg_params))

    if len(queries) == 2:
        combined_query = f"({queries[0][0]}) UNION ALL ({queries[1][0]})"
        combined_params = queries[0][1] + queries[1][1]
    else:
        combined_query = queries[0][0]
        combined_params = queries[0][1]

    count_query = f"SELECT COUNT(*) AS total FROM ({combined_query}) AS count_t"
    count_result = Database.execute_query(count_query, tuple(combined_params) if combined_params else None)
    total_count = int(count_result[0]['total']) if count_result else 0

    import math
    total_pages = math.ceil(total_count / per_page) if total_count > 0 else 1
    offset = (page - 1) * per_page

    final_query = f"SELECT * FROM ({combined_query}) AS final_t ORDER BY submitted_at DESC LIMIT %s OFFSET %s"
    final_params = combined_params + [per_page, offset]

    applications = Database.execute_query(final_query, tuple(final_params))

    return jsonify({
        'count': total_count,
        'page': page,
        'per_page': per_page,
        'total_pages': total_pages,
        'applications': applications or []
    }), 200


@admin_bp.route('/application/<applicant_id>', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_application_details(payload, applicant_id):
    """Get detailed application information"""

    pg_check = Database.execute_query(
        'SELECT uuid FROM pg_application WHERE uuid = %s', (applicant_id,)
    )
    if pg_check:
        applicant = Database.execute_query(
            f'''SELECT pg.uuid AS id, pg.user_id,
                       {USER_NAME_EXPR} AS name,
                       u.email, u.phone_number,
                       2 AS program_id,
                       COALESCE(dg.code || ' ', '') || COALESCE(pg.finalised_course, pg.approved_course, pgps.name, '') AS program_name,
                       pg.applicant_stage AS application_status,
                       pg.updated_date AS submitted_at,
                       pg.form_no,
                       pg.decision,
                       pg.decision_date,
                       pg.approved_course,
                       pg.finalised_course,
                       pg.admission_letter_sent,
                       (pg.applicant_stage = 'accepted') AS has_paid_acceptance_fee
                FROM pg_application pg
                JOIN users u ON pg.user_id = u.id
                LEFT JOIN degrees dg ON pg.degree_id = dg.id
                LEFT JOIN pg_program_setup pgps ON pgps.id = pg.proposed_course
                WHERE pg.uuid = %s''',
            (applicant_id,)
        )
    else:
        applicant = Database.execute_query(
            f'''SELECT app.id, app.user_id,
                       {USER_NAME_EXPR} AS name,
                       u.email, u.phone_number,
                       app.prog_type AS program_id,
                       (
                           CASE 
                               WHEN app.applicant_stage = 'submitted' THEN 
                                   COALESCE(dg.code || ' ', '') || COALESCE(ps1.name, '')
                               WHEN app.applicant_stage = 'screening' THEN 
                                   COALESCE(dg.code || ' ', '') || COALESCE(app.approved_course, ps1.name, '')
                               WHEN app.applicant_stage IN ('admitted', 'accepted') THEN 
                                   COALESCE(dg.code || ' ', '') || COALESCE(app.finalised_course, app.approved_course, ps1.name, '')
                               ELSE 
                                   COALESCE(dg.code || ' ', '') || COALESCE(app.finalised_course, app.approved_course, ps1.name, '')
                           END
                       ) AS program_name,
                       app.applicant_stage AS application_status,
                       app.updated_at AS submitted_at,
                       app.form_no,
                       app.decision,
                       app.decision_date,
                       app.approved_course,
                       app.finalised_course,
                       app.admission_letter_sent,
                       (app.applicant_stage = 'accepted') AS has_paid_acceptance_fee
                FROM applications app
                JOIN users u ON app.user_id = u.id
                LEFT JOIN program_types pt ON app.prog_type = pt.id
                LEFT JOIN degrees dg ON app.degree_id = dg.id
                LEFT JOIN academic_qualification aq ON aq.user_id = app.user_id
                LEFT JOIN program_choice pc ON pc.application_id = app.id
                LEFT JOIN program_setup ps1 ON pc.first_choice = ps1.id
                WHERE app.id = %s''',
            (applicant_id,)
        )

    if not applicant:
        return jsonify({'message': 'Applicant not found'}), 404

    application_id = applicant_id
    program_id = applicant[0]['program_id']
    form_data = {}

    if program_id == 2:
        pg_app = Database.execute_query(
            '''SELECT pg.*, 
                      ns.name AS next_of_kin_name, ns.address AS next_of_kin_address, 
                      ns.phone_number AS next_of_kin_phone_number, ns.secondary_number AS next_of_kin_secondary_phone_number,
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
        if pg_app:
            row = pg_app[0]
            form_data = {
                'first_name': row['first_name'],
                'last_name': row['surname'],
                'middle_name': row['middle_name'],
                'email': row['email'],
                'gender': row['gender'],
                'date_of_birth': row['date_of_birth'].strftime('%Y-%m-%d') if row['date_of_birth'] else None,
                'phone_number': row['phone_number'],
                'secondary_phone_number': row['secondary_phone_number'],
                'address': row['address'],
                'physically_challenged': row['physically_challenged'],
                'previous_institution': row['previous_institution'],
                'previous_course': row['previous_course'],
                'department': row['department'],
                'class_of_degree': row['class_of_degree'],
                'proposed_course': row['proposed_course'],
                'proposed_faculty': row['proposed_faculty_id'],
                'degree_id': row['degree_id'],
                'area_of_specialisation': row['area_of_specialisation'],
                'proposed_research_title': row['proposed_research_title'],
                'mode_of_study': row['mode_of_study'],
                'sponsor_name': row['sponsor_name'],
                'sponsor_address': row['sponsor_address'],
                'next_of_kin_name': row['next_of_kin_name'],
                'next_of_kin_address': row['next_of_kin_address'],
                'next_of_kin_phone_number': row['next_of_kin_phone_number'],
                'next_of_kin_secondary_phone_number': row['next_of_kin_secondary_phone_number'],
                'referee_name1': row['referee_name1'],
                'referee_address1': row['referee_address1'],
                'referee_name2': row['referee_name2'],
                'referee_address2': row['referee_address2'],
                'referee_name3': row['referee_name3'],
                'referee_address3': row['referee_address3'],
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
                c_res = Database.execute_query('SELECT name FROM pg_program_setup WHERE id = %s', (row['proposed_course'],))
                if c_res:
                    form_data['proposed_course_name'] = c_res[0]['name']
            if row['proposed_faculty_id']:
                f_res = Database.execute_query('SELECT name FROM faculties WHERE id = %s', (row['proposed_faculty_id'],))
                if f_res:
                    form_data['proposed_faculty_name'] = f_res[0]['name']
            if row['degree_id']:
                d_res = Database.execute_query('SELECT name, code FROM degrees WHERE id = %s', (row['degree_id'],))
                if d_res:
                    form_data['degree_name'] = d_res[0]['name']
                    form_data['degree_code'] = d_res[0]['code']
    else:
        pi_res      = Database.execute_query('SELECT * FROM biodata WHERE application_id = %s', (application_id,))
        nok_res     = Database.execute_query('SELECT * FROM next_of_kin WHERE application_id = %s', (application_id,))
        sponsor_res = Database.execute_query('SELECT * FROM sponsor WHERE application_id = %s', (application_id,))

        if pi_res:
            form_data = dict(pi_res[0])
            if 'surname' in form_data:
                form_data['last_name'] = form_data['surname']
            if form_data.get('date_of_birth'):
                try:
                    from datetime import date, datetime as dt
                    dob = form_data['date_of_birth']
                    if isinstance(dob, (date, dt)):
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
            form_data['sponsor_relationship'] = sponsor_data.get('relationship')
            form_data['sponsor_email']        = sponsor_data.get('email')

        aq_res = Database.execute_query(
            'SELECT aq.* FROM academic_qualification aq JOIN applications a ON aq.user_id = a.user_id WHERE a.id = %s',
            (application_id,)
        )

        if aq_res:
            aq = aq_res[0]
            olevel_exams = []

            if aq.get('exam_type'):
                subjects = []
                for i in range(1, 6):
                    subj  = aq.get(f'subject{i}')
                    grade = aq.get(f'grade{i}')
                    if subj and grade:
                        subjects.append({'subject_id': subj, 'grade_id': grade, 'subject': subj, 'grade': grade})
                olevel_exams.append({'name': aq.get('exam_type'), 'number': aq.get('exam_no'), 'subjects': subjects})

            if aq.get('exam_type1'):
                subjects = []
                for i in range(1, 6):
                    subj  = aq.get(f'second_subject{i}')
                    grade = aq.get(f'second_grade{i}')
                    if subj and grade:
                        subjects.append({'subject_id': subj, 'grade_id': grade, 'subject': subj, 'grade': grade})
                olevel_exams.append({'name': aq.get('exam_type1'), 'number': aq.get('exam_no1'), 'subjects': subjects})

            if olevel_exams:
                form_data['olevel_results'] = olevel_exams

            # Load university choices from program_choice table
            pc_res = Database.execute_query(
                '''SELECT pc.first_choice, pc.second_choice, ps1.name AS first_choice_name, ps2.name AS second_choice_name
                   FROM program_choice pc
                   LEFT JOIN program_setup ps1 ON pc.first_choice = ps1.id
                   LEFT JOIN program_setup ps2 ON pc.second_choice = ps2.id
                   WHERE pc.application_id = %s''',
                (application_id,)
            )
            if pc_res:
                pc_row = pc_res[0]
                if pc_row.get('first_choice'):
                    form_data['first_choice_program_id'] = pc_row['first_choice']
                    form_data['first_choice_program_name'] = pc_row['first_choice_name']
                if pc_row.get('second_choice'):
                    form_data['second_choice_program_id'] = pc_row['second_choice']
                    form_data['second_choice_program_name'] = pc_row['second_choice_name']

            # Load original JAMB choices (manually typed) & other UTME details
            utme_fields = [
                'utme_reg_no', 'utme_score', 'mode_of_entry', 'choice1', 'choice2',
                'utme_subject1', 'utme_score1',
                'utme_subject2', 'utme_score2',
                'utme_subject3', 'utme_score3',
                'utme_subject4', 'utme_score4'
            ]
            for f in utme_fields:
                if aq.get(f) is not None:
                    form_data[f] = aq.get(f)

        import json as _json
        if form_data.get('additional_info'):
            try:
                ai = form_data['additional_info']
                if isinstance(ai, str):
                    additional_info_data = _json.loads(ai)
                    form_data = {**additional_info_data, **form_data}
            except (_json.JSONDecodeError, TypeError):
                pass

    if program_id == 2:
        documents = Database.execute_query(
            '''SELECT id, document_type, file_type, file_name AS original_filename,
                      file_size, 0 AS compressed_size, false AS is_compressed
               FROM pg_document
               WHERE pg_application_id = %s''',
            (applicant_id,)
        )
    else:
        documents = Database.execute_query(
            '''SELECT id, document_type, file_type, file_name AS original_filename,
                      file_size, 0 AS compressed_size, false AS is_compressed
               FROM documents
               WHERE application_id = %s''',
            (applicant_id,)
        )

    return jsonify({
        'applicant':  applicant[0],
        'form':       form_data if form_data else None,
        'documents':  documents or [],
        'reviews':    [],
        'pg_evaluation': _get_pg_evaluation(applicant_id) if program_id == 2 else None,
    }), 200


@admin_bp.route('/review-application', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def review_application(payload):
    """Review and approve/reject/recommend application.
    Saves decision, decision_date, approved_course and finalised_course
    directly onto the applications row — no application_reviews insert.
    """
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

    officer_user_id = payload['user_id']

    stage_map  = {'accept': 'admitted', 'reject': 'rejected', 'recommend': 'screening'}
    new_status = stage_map[decision]

    pg_app = Database.execute_query('SELECT uuid FROM pg_application WHERE uuid = %s', (applicant_id,))
    is_pg = bool(pg_app)
    if is_pg:
        return jsonify({'message': 'PG applications are managed by the PG Admin'}), 403

    ps_id = None
    department_id = None
    degree_id = None
    if approved_course:
        if is_pg:
            ps_res = Database.execute_query(
                '''SELECT ps.id, ps.department_id, ps.degree_id
                   FROM pg_program_setup ps
                   LEFT JOIN degrees dg ON ps.degree_id = dg.id
                   WHERE LOWER(ps.name) = LOWER(%s)
                      OR LOWER(COALESCE(dg.code || ' ', '') || ps.name) = LOWER(%s)
                   LIMIT 1''',
                (approved_course, approved_course)
            )
        else:
            ps_res = Database.execute_query(
                '''SELECT ps.id, ps.department_id, ps.degree_id
                   FROM program_setup ps
                   WHERE LOWER(ps.name) = LOWER(%s)
                   LIMIT 1''',
                (approved_course,)
            )
        if ps_res:
            ps_id = ps_res[0]['id']
            department_id = ps_res[0]['department_id']
            degree_id = ps_res[0]['degree_id']

    if is_pg:
        success = Database.execute_update(
            '''UPDATE pg_application
               SET applicant_stage         = %s,
                   decision                = %s,
                   decision_date           = NOW(),
                   approved_course         = %s,
                   finalised_course        = %s,
                   proposed_course         = COALESCE(%s, proposed_course),
                   degree_id               = COALESCE(%s, degree_id),
                   decision_maker_user_id  = %s,
                   updated_date            = NOW()
               WHERE uuid = %s''',
            (new_status, decision, approved_course, approved_course, ps_id, degree_id, officer_user_id, applicant_id)
        )
    else:
        success = Database.execute_update(
            '''UPDATE applications
               SET applicant_stage         = %s,
                   decision                = %s,
                   decision_date           = NOW(),
                   approved_course         = %s,
                   finalised_course        = %s,
                   program_setup_id        = COALESCE(%s, program_setup_id),
                   degree_id               = COALESCE(%s, degree_id),
                   decision_maker_user_id  = %s,
                   updated_at              = NOW()
               WHERE id = %s''',
            (new_status, decision, approved_course, approved_course, ps_id, degree_id, officer_user_id, applicant_id)
        )

    if not success:
        return jsonify({'message': 'Failed to save review'}), 500

    return jsonify({
        'message':    'Application reviewed successfully',
        'new_status': new_status
    }), 200


@admin_bp.route('/send-admission-letter', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def send_admission_letter(payload):
    """Send admission letter to single applicant"""
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

    ref_no = get_admission_ref(applicant_id)

    pg_check = Database.execute_query(
        'SELECT uuid FROM pg_application WHERE uuid = %s', (applicant_id,)
    )
    is_pg = bool(pg_check)
    if is_pg:
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
    else:
        applicant = Database.execute_query(
            f'''SELECT u.id,
                       {USER_NAME_EXPR} AS name,
                       u.email,
                       app.prog_type AS program_id,
                       pt.name AS program_name,
                       '100 Level' AS level, 'N/A' AS department, 'N/A' AS faculty,
                       pt.name AS mode, app.form_no AS session, 'TBD' AS resumption_date,
                       app.applicant_stage
                FROM applications app
                JOIN users u ON app.user_id = u.id
                LEFT JOIN program_types pt ON app.prog_type = pt.id
                WHERE app.id = %s AND app.applicant_stage IN ('admitted', 'accepted')''',
            (applicant_id,)
        )

    if not applicant:
        return jsonify({'message': 'Applicant not found or application not admitted'}), 404

    if applicant[0]['applicant_stage'] != 'accepted':
        return jsonify({'message': 'Cannot send admission letter — applicant has not paid the acceptance fee yet'}), 402

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

    if is_pg:
        Database.execute_update(
            'UPDATE pg_application SET admission_letter_sent = TRUE, updated_date = NOW() WHERE uuid = %s',
            (applicant_id,)
        )
    else:
        Database.execute_update(
            'UPDATE applications SET admission_letter_sent = TRUE, updated_at = NOW() WHERE id = %s',
            (applicant_id,)
        )

    body_text = f"Dear {applicant_data['name']},\n\nPlease find attached your admission letter.\n\nBest regards,\nAdmissions Office"
    email_sent = send_email(
        to_email=applicant_data['email'],
        subject='Provisional Admission Letter',
        body_text=body_text,
        attachments=[('admission_letter.pdf', pdf_bytes)]
    )

    return jsonify({
        'message':        'Admission letter sent successfully' if email_sent else 'Failed to send admission letter',
        'recipient_email': applicant_data['email'],
        'email_sent':     email_sent
    }), 201 if email_sent else 500


@admin_bp.route('/preview-admission-letter', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def preview_admission_letter(payload):
    data = request.get_json() or {}
    if 'applicant_id' not in data:
        return jsonify({'message': 'applicant_id is required'}), 400
 
    applicant_id      = data['applicant_id']
    admission_date_db = data.get('admission_date', datetime.now().strftime('%Y-%m-%d'))
    try:
        date_obj = datetime.strptime(admission_date_db, '%Y-%m-%d')
        admission_date_display = date_obj.strftime('%d %B, %Y')
    except Exception:
        admission_date_display = admission_date_db
 
    ref_no = get_admission_ref(applicant_id)
 
    pg_check = Database.execute_query(
        'SELECT uuid FROM pg_application WHERE uuid = %s', (applicant_id,)
    )
    is_pg = bool(pg_check)
    if is_pg:
        applicant = Database.execute_query(
            f'''SELECT u.id,
                       {USER_NAME_EXPR} AS name,
                       u.email,
                       2 AS program_id,
                       'Postgraduate' AS program_name,
                       '100 Level' AS level, 'N/A' AS department, 'N/A' AS faculty,
                       'Postgraduate' AS mode, pg.form_no AS session, 'TBD' AS resumption_date
                FROM pg_application pg
                JOIN users u ON pg.user_id = u.id
                WHERE pg.uuid = %s AND pg.applicant_stage IN ('admitted', 'accepted') ''',
            (applicant_id,)
        )
    else:
        applicant = Database.execute_query(
            f'''SELECT u.id,
                       {USER_NAME_EXPR} AS name,
                       u.email,
                       app.prog_type AS program_id,
                       pt.name AS program_name,
                       '100 Level' AS level, 'N/A' AS department, 'N/A' AS faculty,
                       pt.name AS mode, app.form_no AS session, 'TBD' AS resumption_date
                FROM applications app
                JOIN users u ON app.user_id = u.id
                LEFT JOIN program_types pt ON app.prog_type = pt.id
                WHERE app.id = %s AND app.applicant_stage IN ('admitted', 'accepted') ''',
            (applicant_id,)
        )
 
    if not applicant:
        return jsonify({'message': 'Applicant not found or application not admitted'}), 404
 
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
            name = (fee['name'] or '').lower()
            amount = fee['amount'] or 0
            if 'acceptance' in name:
                acceptance_fee_str = f"₦{amount:,.2f}"
            elif 'tuition' in name or 'accommodation' in name:
                tuition_fee_str = f"₦{amount:,.2f}"
            elif 'sundry' in name or 'other' in name or 'digital' in name:
                other_fees_str = f"₦{amount:,.2f}"
 
    pdf_bytes = PDFGenerator.generate_admission_letter_pdf(
        candidateName=applicant_data['name'],
        email=applicant_data['email'],
        programme=applicant_data['program_name'] or '',
        level=applicant_data.get('level') or '100 Level',
        department=applicant_data.get('department') or '',
        faculty=applicant_data.get('faculty') or '',
        session=applicant_data.get('session') or '2025/2026',
        mode=applicant_data.get('mode') or 'Full-Time',
        date=admission_date_display,
        acceptanceFee=acceptance_fee_str,
        tuition=tuition_fee_str,
        otherFees=other_fees_str,
        resumptionDate=applicant_data.get('resumption_date') or '',
        reference=ref_no,
        body_html=''
    )
 
    return Response(pdf_bytes, mimetype='application/pdf', headers={
        'Content-Disposition': 'inline; filename=admission_preview.pdf'
    })


@admin_bp.route('/send-batch-letters', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def send_batch_letters(payload):
    """Send admission letters to multiple applicants"""
    data = request.get_json()

    if not data or 'applicant_ids' not in data:
        return jsonify({'message': 'applicant_ids is required'}), 400

    applicant_ids = data['applicant_ids']
    if not isinstance(applicant_ids, list) or len(applicant_ids) == 0:
        return jsonify({'message': 'applicant_ids must be a non-empty list'}), 400

    admission_date_db = data.get('admission_date', datetime.now().strftime('%Y-%m-%d'))
    try:
        date_obj = datetime.strptime(admission_date_db, '%Y-%m-%d')
        admission_date_display = date_obj.strftime('%d %B, %Y')
    except Exception:
        admission_date_display = admission_date_db

    applicants_with_pdfs = []
    letters_created      = []
    errors               = []

    for applicant_id in applicant_ids:
        try:
            ref_no = get_admission_ref(applicant_id)

            pg_check = Database.execute_query(
                'SELECT uuid FROM pg_application WHERE uuid = %s', (applicant_id,)
            )
            is_pg = bool(pg_check)
            if is_pg:
                applicant = Database.execute_query(
                    f'''SELECT u.id,
                               {USER_NAME_EXPR} AS name,
                               u.email,
                               2 AS program_id,
                               'Postgraduate' AS program_name,
                               '100 Level' AS level, 'N/A' AS department, 'N/A' AS faculty,
                               'Postgraduate' AS mode, pg.form_no AS session, 'TBD' AS resumption_date
                        FROM pg_application pg
                        JOIN users u ON pg.user_id = u.id
                        WHERE pg.uuid = %s AND pg.applicant_stage = 'accepted' ''',
                    (applicant_id,)
                )
            else:
                applicant = Database.execute_query(
                    f'''SELECT u.id,
                               {USER_NAME_EXPR} AS name,
                               u.email,
                               app.prog_type AS program_id,
                               pt.name AS program_name,
                               '100 Level' AS level, 'N/A' AS department, 'N/A' AS faculty,
                               pt.name AS mode, app.form_no AS session, 'TBD' AS resumption_date
                        FROM applications app
                        JOIN users u ON app.user_id = u.id
                        LEFT JOIN program_types pt ON app.prog_type = pt.id
                        WHERE app.id = %s AND app.applicant_stage = 'accepted' ''',
                    (applicant_id,)
                )

            if not applicant:
                errors.append({'applicant_id': applicant_id, 'error': 'Not found or not accepted'})
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
                    name = (fee['name'] or '').lower()
                    amount = fee['amount'] or 0
                    if 'acceptance' in name:
                        acceptance_fee_str = f"₦{amount:,.2f}"
                    elif 'tuition' in name or 'accommodation' in name:
                        tuition_fee_str = f"₦{amount:,.2f}"
                    elif 'sundry' in name or 'other' in name or 'digital' in name:
                        other_fees_str = f"₦{amount:,.2f}"

            pdf_bytes = PDFGenerator.generate_admission_letter_pdf(
                candidateName=applicant_data['name'],
                email=applicant_data['email'],
                programme=applicant_data['program_name'] or '',
                level=applicant_data.get('level') or '100 Level',
                department=applicant_data.get('department') or '',
                faculty=applicant_data.get('faculty') or '',
                session=applicant_data.get('session') or '2025/2026',
                mode=applicant_data.get('mode') or 'Full-Time',
                date=admission_date_display,
                acceptanceFee=acceptance_fee_str,
                tuition=tuition_fee_str,
                otherFees=other_fees_str,
                resumptionDate=applicant_data.get('resumption_date') or '',
                reference=ref_no,
                body_html=''
            )

            if is_pg:
                Database.execute_update(
                    'UPDATE pg_application SET admission_letter_sent = TRUE, updated_date = NOW() WHERE uuid = %s',
                    (applicant_id,)
                )
            else:
                Database.execute_update(
                    'UPDATE applications SET admission_letter_sent = TRUE, updated_at = NOW() WHERE id = %s',
                    (applicant_id,)
                )

            applicants_with_pdfs.append({
                'email':        applicant_data['email'],
                'name':         applicant_data['name'],
                'applicant_id': applicant_id,
                'pdf_bytes':    pdf_bytes
            })
            letters_created.append({'applicant_id': applicant_id})

        except Exception as e:
            errors.append({'applicant_id': applicant_id, 'error': str(e)})

    if not applicants_with_pdfs:
        return jsonify({
            'message':         'No valid applicants to send letters to',
            'total_requested': len(applicant_ids),
            'letters_created': 0,
            'errors':          len(errors),
            'created':         [],
            'failed':          errors
        }), 400

    email_result = {'success': 0, 'failed': 0, 'total': len(applicants_with_pdfs), 'errors': []}

    try:
        import resend as _resend
        from config import Config

        if not all([Config.RESEND_API_KEY, Config.RESEND_FROM_EMAIL]):
            raise ValueError("Resend API key or sender email not configured")

        _resend.api_key   = Config.RESEND_API_KEY
        from_email_str    = f"{Config.RESEND_FROM_NAME} <{Config.RESEND_FROM_EMAIL}>"

        for a in applicants_with_pdfs:
            try:
                resp = _resend.Emails.send({
                    "from":    from_email_str,
                    "to":      [a['email']],
                    "subject": "Provisional Admission Letter",
                    "html":    "<p>Dear " + a['name'] + ",</p><p>Please find attached your provisional admission letter.</p><p>Best regards,<br>Admissions Office</p>",
                    "attachments": [{"filename": "admission_letter.pdf", "content": list(a['pdf_bytes'])}]
                })
                if resp and resp.get("id"):
                    email_result['success'] += 1
                else:
                    email_result['failed'] += 1
                    email_result['errors'].append(f"Resend error for {a['email']}: {resp}")
            except Exception as _e:
                email_result['failed'] += 1
                email_result['errors'].append(f"Error sending to {a['email']}: {str(_e)}")

    except Exception as e:
        email_result['failed'] = len(applicants_with_pdfs)
        email_result['errors'] = [str(e)]

    return jsonify({
        'message':         'Batch letters sent successfully',
        'total_requested': len(applicant_ids),
        'letters_created': len(letters_created),
        'emails_sent':     email_result.get('success', 0),
        'emails_failed':   email_result.get('failed', 0),
        'errors':          len(errors),
        'created':         letters_created,
        'failed':          errors,
        'email_errors':    email_result.get('errors')
    }), 201


@admin_bp.route('/revoke-admission', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def revoke_admission(payload):
    """Revoke admission for an applicant"""
    data = request.get_json()

    if not data or 'applicant_id' not in data:
        return jsonify({'message': 'applicant_id is required'}), 400

    applicant_id = int(data['applicant_id'])

    success = Database.execute_update(
        "UPDATE applications SET applicant_stage = 'rejected', updated_at = NOW() WHERE id = %s",
        (applicant_id,)
    )

    if not success:
        return jsonify({'message': 'Failed to revoke admission'}), 500

    return jsonify({'message': 'Admission revoked successfully'}), 200


@admin_bp.route('/dashboard', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_dashboard(payload):
    """
    Single endpoint that returns both statistics and recent activity.
    Replaces two separate HTTP calls from the frontend with one.
    All heavy lifting is done server-side in 3 DB queries total.
    """
    activity_limit = int(request.args.get('limit', 10))

    # ── 1. All scalar counts in one aggregation pass ─────────────────────────
    counts = Database.execute_query(
        '''SELECT
               COUNT(*)                                                          AS total_applications,
               COUNT(*) FILTER (WHERE applicant_stage IN ('admitted','accepted','enrolled')) AS total_admitted,
               COUNT(*) FILTER (WHERE applicant_stage IN ('started', 'in_progress'))           AS pending_submission,
               COUNT(*) FILTER (WHERE applicant_stage = 'submitted' AND (prog_type != 2 OR prog_type IS NULL)) AS review_applications,
               COUNT(*) FILTER (WHERE applicant_stage = 'screening')             AS under_review
           FROM applications'''
    )
    row = counts[0] if counts else {}

    # ── 2. Status + program breakdowns (two GROUP BY queries) ────────────────
    by_status = Database.execute_query(
        '''SELECT applicant_stage AS application_status, COUNT(*) AS count
           FROM applications
           GROUP BY applicant_stage
           ORDER BY count DESC'''
    )

    by_program = Database.execute_query(
        '''SELECT pt.name, COUNT(*) AS count
           FROM applications app
           LEFT JOIN program_types pt ON app.prog_type = pt.id
           GROUP BY pt.name
           ORDER BY count DESC'''
    )

    # ── 3. Recent activity — single UNION ALL ────────────────────────────────
    activity_rows = Database.execute_query(
        f'''SELECT event_type, form_no, applicant_name, event_time
            FROM (
                SELECT app.decision          AS event_type,
                       app.form_no,
                       {USER_NAME_EXPR}      AS applicant_name,
                       app.decision_date     AS event_time
                FROM applications app
                JOIN users u ON app.user_id = u.id
                WHERE app.decision IS NOT NULL
                  AND app.decision_date IS NOT NULL

                UNION ALL

                SELECT 'submitted'           AS event_type,
                       app.form_no,
                       {USER_NAME_EXPR}      AS applicant_name,
                       app.updated_at        AS event_time
                FROM applications app
                JOIN users u ON app.user_id = u.id
                WHERE app.applicant_stage = 'submitted'

                UNION ALL

                SELECT 'fee_paid'            AS event_type,
                       app.form_no,
                       {USER_NAME_EXPR}      AS applicant_name,
                       app.updated_at        AS event_time
                FROM applications app
                JOIN users u ON app.user_id = u.id
                WHERE app.applicant_stage = 'accepted'
            ) combined
            ORDER BY event_time DESC NULLS LAST
            LIMIT %s''',
        (activity_limit,)
    )

    label_map = {
        'accept':    lambda r: f"{r['form_no']} accepted — {r['applicant_name']}",
        'reject':    lambda r: f"{r['form_no']} rejected — {r['applicant_name']}",
        'recommend': lambda r: f"{r['form_no']} recommended — {r['applicant_name']}",
        'submitted': lambda r: f"New application received — {r['applicant_name']}",
        'fee_paid':  lambda r: f"Acceptance fee paid — {r['applicant_name']}",
    }

    activities = []
    for r in (activity_rows or []):
        etype = r['event_type']
        fn = label_map.get(etype) or (lambda r: f"{r['form_no']} reviewed — {r['applicant_name']}")
        activities.append({
            'type':       etype,
            'label':      fn(r),
            'event_time': r['event_time'].isoformat() if r['event_time'] else None,
        })

    return jsonify({
        'statistics': {
            'total_applications':  int(row.get('total_applications', 0)),
            'total_admitted':      int(row.get('total_admitted', 0)),
            'pending_submission':  int(row.get('pending_submission', 0)),
            'review_applications': int(row.get('review_applications', 0)),
            'under_review':        int(row.get('under_review', 0)),
            'by_status':           by_status  or [],
            'by_program':          by_program or [],
        },
        'recent_activity': activities,
    }), 200


@admin_bp.route('/recent-activity', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_recent_activity(payload):
    """Unified recent activity feed — single UNION ALL query."""
    limit = int(request.args.get('limit', 15))

    # One round-trip: merge reviews, submissions, and fee-paid events
    rows = Database.execute_query(
        f'''SELECT event_type, form_no, applicant_name, event_time
            FROM (
                -- Reviewed applications
                SELECT app.decision          AS event_type,
                       app.form_no,
                       {USER_NAME_EXPR}      AS applicant_name,
                       app.decision_date     AS event_time
                FROM applications app
                JOIN users u ON app.user_id = u.id
                WHERE app.decision IS NOT NULL
                  AND app.decision_date IS NOT NULL

                UNION ALL

                -- Submitted applications
                SELECT 'submitted'           AS event_type,
                       app.form_no,
                       {USER_NAME_EXPR}      AS applicant_name,
                       app.updated_at        AS event_time
                FROM applications app
                JOIN users u ON app.user_id = u.id
                WHERE app.applicant_stage = 'submitted'

                UNION ALL

                -- Acceptance fee paid
                SELECT 'fee_paid'            AS event_type,
                       app.form_no,
                       {USER_NAME_EXPR}      AS applicant_name,
                       app.updated_at        AS event_time
                FROM applications app
                JOIN users u ON app.user_id = u.id
                WHERE app.applicant_stage = 'accepted'
            ) combined
            ORDER BY event_time DESC NULLS LAST
            LIMIT %s''',
        (limit,)
    )

    label_map = {
        'accept':    lambda r: f"{r['form_no']} accepted — {r['applicant_name']}",
        'reject':    lambda r: f"{r['form_no']} rejected — {r['applicant_name']}",
        'recommend': lambda r: f"{r['form_no']} recommended — {r['applicant_name']}",
        'submitted': lambda r: f"New application received — {r['applicant_name']}",
        'fee_paid':  lambda r: f"Acceptance fee paid — {r['applicant_name']}",
    }

    activities = []
    for r in (rows or []):
        etype = r['event_type']
        fn = label_map.get(etype) or (lambda r: f"{r['form_no']} reviewed — {r['applicant_name']}")
        activities.append({
            'type':       etype,
            'label':      fn(r),
            'event_time': r['event_time'].isoformat() if r['event_time'] else None,
        })

    return jsonify({'activities': activities}), 200


@admin_bp.route('/statistics', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_statistics(payload):
    """Get application statistics — all counts in a single aggregation pass."""

    # ── One query: all scalar counts + status breakdown in one pass ──────────
    counts = Database.execute_query(
        '''SELECT
               COUNT(*)                                                          AS total_applications,
               COUNT(*) FILTER (WHERE applicant_stage IN ('admitted','accepted','enrolled')) AS total_admitted,
               COUNT(*) FILTER (WHERE applicant_stage IN ('started', 'in_progress'))           AS pending_submission,
               COUNT(*) FILTER (WHERE applicant_stage = 'submitted')             AS review_applications,
               COUNT(*) FILTER (WHERE applicant_stage = 'screening')             AS under_review
           FROM applications'''
    )
    row = counts[0] if counts else {}

    # ── Status breakdown ─────────────────────────────────────────────────────
    by_status = Database.execute_query(
        '''SELECT applicant_stage AS application_status, COUNT(*) AS count
           FROM applications
           GROUP BY applicant_stage
           ORDER BY count DESC'''
    )

    # ── Program breakdown ────────────────────────────────────────────────────
    by_program = Database.execute_query(
        '''SELECT pt.name, COUNT(*) AS count
           FROM applications app
           LEFT JOIN program_types pt ON app.prog_type = pt.id
           GROUP BY pt.name
           ORDER BY count DESC'''
    )

    return jsonify({
        'total_applications':  int(row.get('total_applications', 0)),
        'total_admitted':      int(row.get('total_admitted', 0)),
        'pending_submission':  int(row.get('pending_submission', 0)),
        'review_applications': int(row.get('review_applications', 0)),
        'under_review':        int(row.get('under_review', 0)),
        'by_status':           by_status  or [],
        'by_program':          by_program or [],
    }), 200


@admin_bp.route('/letter-templates', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_letter_templates(payload):
    templates = get_all_templates()
    return jsonify({'templates': templates}), 200


@admin_bp.route('/faculty-departments', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_faculty_departments(payload):
    query = '''
        SELECT pt.name AS faculty, pt.name AS department, COUNT(app.id) AS pending_count
        FROM applications app
        JOIN program_types pt ON app.prog_type = pt.id
        WHERE app.applicant_stage = 'accepted'
          AND (app.admission_letter_sent IS NULL OR app.admission_letter_sent = FALSE)
        GROUP BY pt.name
        ORDER BY pt.name
    '''
    results = Database.execute_query(query)

    faculties = {}
    if results:
        for row in results:
            faculty = row['faculty'] or 'Other'
            if faculty not in faculties:
                faculties[faculty] = []
            faculties[faculty].append({'name': row['department'] or 'General', 'pending_count': row['pending_count']})

    return jsonify({'faculties': faculties}), 200


@admin_bp.route('/department-applicants/<department_name>', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_department_applicants(payload, department_name):
    query = f'''
        SELECT app.id,
               {USER_NAME_EXPR} AS name,
               u.email,
               pt.name AS program_name
        FROM applications app
        JOIN users u ON app.user_id = u.id
        JOIN program_types pt ON app.prog_type = pt.id
        WHERE app.applicant_stage = 'accepted'
          AND (app.admission_letter_sent IS NULL OR app.admission_letter_sent = FALSE)
          AND pt.name = %s
        ORDER BY u.firstname ASC
    '''
    applicants = Database.execute_query(query, (department_name,))

    return jsonify({'department': department_name, 'applicants': applicants or []}), 200


@admin_bp.route('/send-department-letters', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def send_department_letters(payload):
    """Send admission letters to all pending applicants in a department"""
    import resend as _resend
    from config import Config

    data            = request.get_json()
    department_name = data.get('department_name')
    applicant_ids   = data.get('applicant_ids', [])
    admission_date_str = data.get('admission_date', datetime.now().strftime('%Y-%m-%d'))

    if not department_name or not applicant_ids:
        return jsonify({'message': 'department_name and applicant_ids required'}), 400

    try:
        date_obj = datetime.strptime(admission_date_str, '%Y-%m-%d')
        admission_date_display = date_obj.strftime('%d %B, %Y')
    except Exception:
        admission_date_display = admission_date_str

    sent_list          = []
    failed_list        = []
    applicants_with_pdfs = []

    session_res     = Database.execute_query("SELECT name AS value FROM academic_sessions WHERE is_active = TRUE LIMIT 1")
    default_session = session_res[0]['value'] if session_res else '2025/2026'

    for applicant_id in applicant_ids:
        try:
            ref_no = get_admission_ref(applicant_id)

            applicant = Database.execute_query(
                f'''SELECT app.id,
                           {USER_NAME_EXPR} AS name,
                           u.email,
                           app.prog_type AS program_id,
                           pt.name AS program_name,
                           '100 Level' AS level, 'N/A' AS department, 'N/A' AS faculty,
                           pt.name AS mode, app.form_no AS session, 'TBD' AS resumption_date
                    FROM applications app
                    JOIN users u ON app.user_id = u.id
                    LEFT JOIN program_types pt ON app.prog_type = pt.id
                    WHERE app.id = %s AND app.applicant_stage = 'accepted' ''',
                (applicant_id,)
            )

            if not applicant:
                failed_list.append({'applicant_id': applicant_id, 'error': 'Applicant not found or not accepted'})
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
                    name = (fee['name'] or '').lower()
                    amount = fee['amount'] or 0
                    if 'acceptance' in name:
                        acceptance_fee_str = f"₦{amount:,.2f}"
                    elif 'tuition' in name or 'accommodation' in name:
                        tuition_fee_str = f"₦{amount:,.2f}"
                    elif 'sundry' in name or 'other' in name or 'digital' in name:
                        other_fees_str = f"₦{amount:,.2f}"

            pdf_bytes = PDFGenerator.generate_admission_letter_pdf(
                candidateName=applicant_data['name'],
                email=applicant_data['email'],
                programme=applicant_data['program_name'] or '',
                level='100 Level',
                department='',
                faculty='',
                session=applicant_data.get('session') or default_session,
                mode=applicant_data.get('mode') or 'Full-Time',
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
        return jsonify({'message': 'No valid applicants to send letters', 'sent': sent_list, 'failed': failed_list}), 400

    try:
        if not all([Config.RESEND_API_KEY, Config.RESEND_FROM_EMAIL]):
            raise ValueError("Resend not configured")

        _resend.api_key  = Config.RESEND_API_KEY
        from_email_str   = f"{Config.RESEND_FROM_NAME} <{Config.RESEND_FROM_EMAIL}>"

        for a in applicants_with_pdfs:
            try:
                resp = _resend.Emails.send({
                    "from":    from_email_str,
                    "to":      [a['email']],
                    "subject": "Provisional Admission Letter",
                    "html":    "<p>Dear " + a['name'] + ",</p><p>Please find attached your provisional admission letter.</p><p>Best regards,<br>Admissions Office</p>",
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


@admin_bp.route('/letter-status-summary', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_letter_status_summary(payload):
    # --- Sent: derive from admission_letter_sent column (source of truth) ---
    sent_query = f'''SELECT app.id,
                            app.form_no,
                            {USER_NAME_EXPR} AS name,
                            u.email,
                            COALESCE(app.approved_course, pt.name) AS course,
                            pt.name AS program_name,
                            app.updated_at AS sent_at
                     FROM applications app
                     JOIN users u ON app.user_id = u.id
                     LEFT JOIN program_types pt ON app.prog_type = pt.id
                     WHERE app.admission_letter_sent = TRUE
                     ORDER BY app.updated_at DESC'''

    sent_rows = Database.execute_query(sent_query) or []
    sent = [
        {
            'applicant_id': r['id'],
            'form_no':      r['form_no'],
            'name':         r['name'],
            'email':        r['email'],
            'course':       r['course'] or r['program_name'] or '—',
            'program':      r['program_name'],
            'sent_at':      r['sent_at'].isoformat() if r['sent_at'] else None,
        }
        for r in sent_rows
    ]

    # --- Failed / Pending: use tracking table for applicants who haven't been sent yet ---
    tracking_query = f'''SELECT app.id,
                                app.form_no,
                                {USER_NAME_EXPR} AS name,
                                u.email,
                                pt.name AS program_name,
                                alt.status, alt.sent_at, alt.error_message, alt.retry_count
                         FROM applications app
                         JOIN users u ON app.user_id = u.id
                         LEFT JOIN program_types pt ON app.prog_type = pt.id
                         LEFT JOIN admission_letter_tracking alt ON app.id = alt.applicant_id
                         WHERE app.applicant_stage = 'accepted'
                           AND (app.admission_letter_sent IS NULL OR app.admission_letter_sent = FALSE)
                         ORDER BY alt.status NULLS LAST, app.updated_at DESC'''

    tracking_rows = Database.execute_query(tracking_query) or []
    failed  = []
    pending = []

    for row in tracking_rows:
        item = {
            'applicant_id':  row['id'],
            'form_no':       row['form_no'],
            'name':          row['name'],
            'email':         row['email'],
            'program':       row['program_name'],
            'status':        row['status'] or 'pending',
            'sent_at':       row['sent_at'].isoformat() if row['sent_at'] else None,
            'error_message': row['error_message'],
            'retry_count':   row['retry_count'] or 0
        }
        if row['status'] in ['failed', 'sent_with_errors']:
            failed.append(item)
        else:
            pending.append(item)

    return jsonify({
        'sent':    sent,
        'failed':  failed,
        'pending': pending,
        'summary': {
            'total_sent':    len(sent),
            'total_failed':  len(failed),
            'total_pending': len(pending)
        }
    }), 200


@admin_bp.route('/resend-letter/<int:applicant_id>', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def resend_letter(payload, applicant_id):
    import resend as _resend
    from config import Config

    data = request.get_json()
    admission_date_str = data.get('admission_date', datetime.now().strftime('%Y-%m-%d'))

    try:
        try:
            date_obj = datetime.strptime(admission_date_str, '%Y-%m-%d')
            admission_date_display = date_obj.strftime('%d %B, %Y')
        except Exception:
            admission_date_display = admission_date_str

        ref_no = get_admission_ref(applicant_id)

        applicant = Database.execute_query(
            f'''SELECT u.id,
                       {USER_NAME_EXPR} AS name,
                       u.email,
                       app.prog_type AS program_id,
                       pt.name AS program_name,
                       '100 Level' AS level, 'N/A' AS department, 'N/A' AS faculty,
                       pt.name AS mode, app.form_no AS session, 'TBD' AS resumption_date
                FROM applications app
                JOIN users u ON app.user_id = u.id
                LEFT JOIN program_types pt ON app.prog_type = pt.id
                WHERE app.id = %s AND app.applicant_stage = 'accepted' ''',
            (applicant_id,)
        )

        if not applicant:
            return jsonify({'message': 'Applicant not found or not accepted'}), 404

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
                name = (fee['name'] or '').lower()
                amount = fee['amount'] or 0
                if 'acceptance' in name:
                    acceptance_fee_str = f"₦{amount:,.2f}"
                elif 'tuition' in name or 'accommodation' in name:
                    tuition_fee_str = f"₦{amount:,.2f}"
                elif 'sundry' in name or 'other' in name or 'digital' in name:
                    other_fees_str = f"₦{amount:,.2f}"

        pdf_bytes = PDFGenerator.generate_admission_letter_pdf(
            candidateName=applicant_data['name'],
            email=applicant_data['email'],
            programme=applicant_data['program_name'] or '',
            level='100 Level', department='', faculty='',
            session=applicant_data.get('session') or '2025/2026',
            mode=applicant_data.get('mode') or 'Full-Time',
            date=admission_date_display,
            acceptanceFee=acceptance_fee_str, tuition=tuition_fee_str, otherFees=other_fees_str,
            resumptionDate='', reference=ref_no, body_html=''
        )

        if not all([Config.RESEND_API_KEY, Config.RESEND_FROM_EMAIL]):
            raise ValueError("Resend not configured")

        _resend.api_key = Config.RESEND_API_KEY
        from_email_str  = f"{Config.RESEND_FROM_NAME} <{Config.RESEND_FROM_EMAIL}>"

        resp = _resend.Emails.send({
            "from":    from_email_str,
            "to":      [applicant_data['email']],
            "subject": "Provisional Admission Letter - Resend",
            "html":    f"<p>Dear {applicant_data['name']},</p><p>Please find attached your provisional admission letter.</p><p>Best regards,<br>Admissions Office</p>",
            "attachments": [{"filename": "admission_letter.pdf", "content": list(pdf_bytes)}]
        })

        if resp and resp.get("id"):
            Database.execute_update(
                "UPDATE admission_letter_tracking SET status = 'sent', sent_at = NOW(), retry_count = retry_count + 1 WHERE applicant_id = %s",
                (applicant_id,)
            )
            return jsonify({'message': 'Letter resent successfully', 'applicant_id': applicant_id, 'status': 'sent'}), 200
        else:
            error_msg = f"Resend error: {resp}"
            Database.execute_update(
                "UPDATE admission_letter_tracking SET status = 'failed', error_message = %s, retry_count = retry_count + 1 WHERE applicant_id = %s",
                (error_msg, applicant_id)
            )
            return jsonify({'message': 'Failed to resend letter', 'error': error_msg}), 500

    except Exception as e:
        Database.execute_update(
            "UPDATE admission_letter_tracking SET status = 'failed', error_message = %s, retry_count = retry_count + 1 WHERE applicant_id = %s",
            (str(e), applicant_id)
        )
        return jsonify({'message': 'Error resending letter', 'error': str(e)}), 500


@admin_bp.route('/preview-letter/<applicant_id>', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def preview_letter(payload, applicant_id):
    admission_date_str = request.args.get('admission_date', datetime.now().strftime('%Y-%m-%d'))

    try:
        try:
            date_obj = datetime.strptime(admission_date_str, '%Y-%m-%d')
            admission_date_display = date_obj.strftime('%d %B, %Y')
        except Exception:
            admission_date_display = admission_date_str

        ref_no = get_admission_ref(applicant_id)

        applicant = Database.execute_query(
            f'''SELECT u.id,
                       {USER_NAME_EXPR} AS name,
                       u.email,
                       app.prog_type AS program_id,
                       pt.name AS program_name,
                       '100 Level' AS level, 'N/A' AS department, 'N/A' AS faculty,
                       pt.name AS mode, app.form_no AS session, 'TBD' AS resumption_date
                FROM applications app
                JOIN users u ON app.user_id = u.id
                LEFT JOIN program_types pt ON app.prog_type = pt.id
                WHERE app.id = %s AND app.applicant_stage = 'accepted' ''',
            (applicant_id,)
        )

        if not applicant:
            return jsonify({'message': 'Applicant not found or not accepted'}), 404

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
                name = (fee['name'] or '').lower()
                amount = fee['amount'] or 0
                if 'acceptance' in name:
                    acceptance_fee_str = f"₦{amount:,.2f}"
                elif 'tuition' in name or 'accommodation' in name:
                    tuition_fee_str = f"₦{amount:,.2f}"
                elif 'sundry' in name or 'other' in name or 'digital' in name:
                    other_fees_str = f"₦{amount:,.2f}"

        pdf_bytes = PDFGenerator.generate_admission_letter_pdf(
            candidateName=applicant_data['name'],
            email=applicant_data['email'],
            programme=applicant_data['program_name'] or '',
            level='100 Level', department='', faculty='',
            session=applicant_data.get('session') or '2025/2026',
            mode=applicant_data.get('mode') or 'Full-Time',
            date=admission_date_display,
            acceptanceFee=acceptance_fee_str, tuition=tuition_fee_str, otherFees=other_fees_str,
            resumptionDate='', reference=ref_no, body_html=''
        )

        return Response(
            pdf_bytes,
            mimetype='application/pdf',
            headers={'Content-Disposition': f'inline; filename=admission_letter_{applicant_id}.pdf'}
        )

    except Exception as e:
        return jsonify({'message': 'Error generating preview', 'error': str(e)}), 500


# ==========================================
# STAGE 2: PORTAL MANAGEMENT ROUTES
# ==========================================

@admin_bp.route('/programs', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_programs(payload):
    programs = Database.execute_query(
        '''SELECT pt.id AS program_type_id, pt.name AS program_type,
                  d.id AS department_id, d.name AS course,
                  dg.name AS degree, dy.years AS duration
           FROM program_setup ps
           JOIN degree_program dp ON ps.degree_program_id = dp.id
           JOIN program_types pt  ON dp.program_type_id   = pt.id
           JOIN degrees dg        ON dp.degree_id         = dg.id
           JOIN departments d     ON ps.department_id     = d.id
           JOIN duration_years dy ON dp.duration_id       = dy.id
           WHERE ps.is_active = TRUE
           ORDER BY pt.name, d.name'''
    )
    return jsonify({'programs': programs or []}), 200


@admin_bp.route('/faculties', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_faculties(payload):
    faculties = Database.execute_query('SELECT * FROM faculties ORDER BY name')
    return jsonify({'faculties': faculties or []}), 200


@admin_bp.route('/departments', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_departments(payload):
    faculty_id = request.args.get('faculty_id')
    if faculty_id:
        departments = Database.execute_query(
            'SELECT d.*, f.name AS faculty_name FROM departments d JOIN faculties f ON d.faculty_id = f.id WHERE d.faculty_id = %s ORDER BY d.name',
            (faculty_id,)
        )
    else:
        departments = Database.execute_query(
            'SELECT d.*, f.name AS faculty_name FROM departments d JOIN faculties f ON d.faculty_id = f.id ORDER BY f.name, d.name'
        )
    return jsonify({'departments': departments or []}), 200


@admin_bp.route('/program/<int:program_id>', methods=['PUT'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def update_program(payload, program_id):
    data = request.get_json()
    if not data:
        return jsonify({'message': 'No data provided'}), 400

    updates = []
    params  = []

    for field in ['name', 'description', 'level', 'session', 'resumption_date', 'registration_deadline']:
        if field in data:
            updates.append(f"{field} = %s")
            params.append(data[field])

    if 'department' in data:
        dept = Database.execute_query('SELECT id FROM departments WHERE name = %s', (data['department'],))
        if dept:
            updates.append("department_id = %s")
            params.append(dept[0]['id'])

    if 'mode' in data:
        pt = Database.execute_query('SELECT id FROM program_types WHERE name = %s', (data['mode'],))
        if pt:
            updates.append("program_type_id = %s")
            params.append(pt[0]['id'])

    if not updates:
        return jsonify({'message': 'No valid fields provided for update'}), 400

    params.append(program_id)

    try:
        Database.execute_update(
            f"UPDATE program_setup SET {', '.join(updates)}, updated_at = NOW() WHERE id = %s",
            tuple(params)
        )
        return jsonify({'message': 'Program updated successfully'}), 200
    except Exception as e:
        return jsonify({'message': f'Error updating program: {e}'}), 500


@admin_bp.route('/students', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_students(payload):
    program_id = request.args.get('program_id')
    level      = request.args.get('level')

    query = f'''SELECT s.id,
                       {USER_NAME_EXPR} AS name,
                       u.email, s.matric_number,
                       pt.name AS program_name,
                       s.current_level, s.session, s.is_first_login
                FROM students s
                JOIN users u ON s.user_id = u.id
                LEFT JOIN program_types pt ON s.program_id = pt.id
                WHERE 1=1'''
    params = []

    if program_id:
        query += ' AND s.program_id = %s'
        params.append(program_id)
    if level:
        query += ' AND s.current_level = %s'
        params.append(level)

    students = Database.execute_query(query, tuple(params) if params else None)
    return jsonify({'students': students or []}), 200


@admin_bp.route('/student/<int:student_id>/registration', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_student_registration(payload, student_id):
    session_res     = Database.execute_query("SELECT name AS value FROM academic_sessions WHERE is_active = TRUE LIMIT 1")
    default_session = session_res[0]['value'] if session_res else '2025/2026'

    semester = request.args.get('semester', 'First')
    session  = request.args.get('session', default_session)

    registration = Database.execute_query(
        'SELECT * FROM course_registrations WHERE student_id = %s AND semester = %s AND session = %s',
        (student_id, semester, session)
    )

    if not registration:
        return jsonify({'message': 'No registration found for this student/semester'}), 404

    courses = Database.execute_query(
        '''SELECT c.course_code, c.course_title, c.credit_units, c.category
           FROM registered_courses rc
           JOIN courses c ON rc.course_id = c.id
           WHERE rc.registration_id = %s''',
        (registration[0]['id'],)
    )

    return jsonify({'registration': registration[0], 'courses': courses or []}), 200


@admin_bp.route('/courses-list', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_courses_list(payload):
    dept_id = request.args.get('department_id')
    query   = 'SELECT id, course_code, course_title FROM courses'
    params  = None
    if dept_id:
        query  += ' WHERE department_id = %s'
        params  = (dept_id,)
    query += ' ORDER BY course_code'
    courses = Database.execute_query(query, params)
    return jsonify({'courses': courses or []}), 200



@admin_bp.route('/staff/lecturer', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.roles_required('admin')
def create_lecturer(payload):
    data     = request.get_json()
    required = ['name', 'email', 'password', 'department_id']
    if not all(k in data for k in required):
        return jsonify({'message': 'Missing required fields'}), 400

    import bcrypt

    existing = Database.execute_query("SELECT id FROM users WHERE email = %s", (data['email'],))
    if existing:
        return jsonify({'message': 'Email already exists'}), 400

    hashed = bcrypt.hashpw(data['password'].encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    conn = Database.get_connection()
    if not conn:
        return jsonify({'message': 'DB Error'}), 500

    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (name, email, password_hash, role, status) VALUES (%s, %s, %s, 'lecturer', 'active') RETURNING id",
                (data['name'], data['email'], hashed)
            )
            user_id = cur.fetchone()['id']
            cur.execute(
                "INSERT INTO staff (user_id, department_id, title) VALUES (%s, %s, %s) RETURNING id",
                (user_id, data['department_id'], data.get('title', 'Lecturer'))
            )
        conn.commit()
        return jsonify({'message': 'Lecturer created successfully', 'user_id': user_id}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'message': str(e)}), 500
    finally:
        Database.release_connection(conn)