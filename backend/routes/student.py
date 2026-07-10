from flask import Blueprint, request, jsonify
from database import Database
from utils.auth import AuthHandler
import datetime
import psycopg2

student_bp = Blueprint('student', __name__)

def check_registration_status():
    """Verify if the registration portal is globally locked."""
    try:
        res = Database.execute_query("SELECT value FROM system_settings WHERE key = 'course_registration_locked'")
        if res and res[0]['value'] == 'true':
            return True
        return False
    except:
        return False


def _get_active_semester():
    """Return the active semester row or None."""
    res = Database.execute_query(
        """SELECT s.id, s.name, s.session_id, acs.name AS session_name
           FROM semesters s
           JOIN academic_sessions acs ON acs.id = s.session_id
           WHERE s.is_active = TRUE
           LIMIT 1"""
    )
    return res[0] if res else None


def _verify_tuition_paid(user_id, session_id, semester_id):
    """
    Return True if the student has a confirmed successful tuition payment
    for the given academic session + semester.

    Falls back gracefully:
    - If no active semester is configured (semester_id is None), only checks
      that ANY successful tuition payment exists for the session.
    """
    if semester_id:
        res = Database.execute_query(
            """SELECT id FROM payment_transactions
               WHERE user_id = %s
                 AND tran_type = 'tuition'
                 AND tran_status = 'successful'
                 AND academic_session_id = %s
                 AND semester_id = %s
               LIMIT 1""",
            (user_id, session_id, semester_id)
        )
    else:
        res = Database.execute_query(
            """SELECT id FROM payment_transactions
               WHERE user_id = %s
                 AND tran_type = 'tuition'
                 AND tran_status = 'successful'
                 AND academic_session_id = %s
               LIMIT 1""",
            (user_id, session_id)
        )
    return bool(res)


def _has_any_tuition_paid(user_id):
    """Grandfather clause: return True if the student has ANY ever-successful tuition
    payment (used to avoid locking out students who paid before semester tracking
    was introduced and whose transactions therefore have NULL semester_id)."""
    res = Database.execute_query(
        """SELECT id FROM payment_transactions
           WHERE user_id = %s
             AND tran_type = 'tuition'
             AND tran_status = 'successful'
           LIMIT 1""",
        (user_id,)
    )
    return bool(res)


def _has_installment_tuition_paid(user_id):
    """Return True when the student is paying tuition through semester installments."""
    res = Database.execute_query(
        """SELECT id FROM payment_transactions
           WHERE user_id = %s
             AND tran_type = 'tuition'
             AND tran_status = 'successful'
             AND installment_plan_id IS NOT NULL
           LIMIT 1""",
        (user_id,)
    )
    return bool(res)


def _is_pt_or_hnd(student_row):
    return str(student_row.get('prog_type')) in {'4', '7'}


def _registration_payment_satisfied(user_id, active_semester, is_pt_or_hnd_student):
    if not active_semester:
        return _has_any_tuition_paid(user_id)

    paid_for_active_semester = _verify_tuition_paid(
        user_id,
        active_semester['session_id'],
        active_semester['id'],
    )

    if is_pt_or_hnd_student and _has_installment_tuition_paid(user_id):
        return paid_for_active_semester

    return paid_for_active_semester or _has_any_tuition_paid(user_id)


def _course_department_candidates(student_row):
    candidates = []

    def add(value):
        value = (value or '').strip()
        if value and value not in candidates:
            candidates.append(value)

    add(student_row.get('course_department'))
    add(student_row.get('finalised_course'))
    add(student_row.get('department_name'))
    return candidates


def _fetch_courses_for_departments(cur, departments, level, semester=None):
    sem_filter = ''
    params = []
    if semester:
        sem_filter = 'AND c.semester ILIKE %s'

    for department in departments:
        query_params = [department, str(level)]
        if semester:
            query_params.append(f'{semester} semester')

        cur.execute(
            f'''SELECT c.id, c.course_code, c.course_title,
                      c.unit AS credit_units, c.semester,
                      LOWER(TRIM(c.remark)) AS remark
               FROM course c
               WHERE UPPER(TRIM(c.department)) = UPPER(TRIM(%s))
                 AND c.level::text = %s
                 AND c.status = 'active'
                 {sem_filter}
               ORDER BY c.semester, c.remark, c.course_code''',
            query_params
        )
        courses = cur.fetchall()
        if courses:
            return courses

    return []


def _fetch_valid_courses_for_departments(departments, level, db_semester=None):
    sem_filter = ''
    params_suffix = []
    if db_semester:
        sem_filter = 'AND c.semester ILIKE %s'
        params_suffix.append(db_semester)

    for department in departments:
        courses = Database.execute_query(
            f'''SELECT c.id, c.unit AS credit_units, c.remark AS category, c.course_code
               FROM course c
               WHERE UPPER(TRIM(c.department)) = UPPER(TRIM(%s))
                 AND c.level::text = %s
                 {sem_filter}
                 AND c.status = 'active' ''',
            (department, str(level), *params_suffix)
        )
        if courses:
            return courses
    return []


def _fetch_pg_courses(cur, program_setup_id, degree_id, semester=None, departments=None):
    # If program_setup_id is not resolved directly, fall back to matching department names
    if not program_setup_id and departments:
        for department in departments:
            cur.execute(
                "SELECT id FROM program_setup WHERE UPPER(TRIM(name)) = UPPER(TRIM(%s)) LIMIT 1",
                (department,)
            )
            res = cur.fetchone()
            if res:
                program_setup_id = res['id']
                break
            
    if not program_setup_id:
        return []
        
    sem_filter = ''
    params = [program_setup_id, degree_id]
    if semester:
        sem_filter = 'AND c.semester ILIKE %s'
        params.append(f'{semester} semester')
        
    cur.execute(
        f'''SELECT c.id, c.course_code, c.course_title,
                  c.unit AS credit_units, c.semester,
                  LOWER(TRIM(c.remark)) AS remark
           FROM pg_courses c
           WHERE c.program_setup_id = %s
             AND c.degree_id = %s
             AND c.status = 'active'
             {sem_filter}
           ORDER BY c.semester, c.remark, c.course_code''',
        params
    )
    return cur.fetchall()


def _fetch_valid_pg_courses(program_setup_id, degree_id, db_semester=None, departments=None):
    # If program_setup_id is not resolved directly, fall back to matching department names
    if not program_setup_id and departments:
        for department in departments:
            res = Database.execute_query(
                "SELECT id FROM program_setup WHERE UPPER(TRIM(name)) = UPPER(TRIM(%s)) LIMIT 1",
                (department,)
            )
            if res:
                program_setup_id = res[0]['id']
                break
            
    if not program_setup_id:
        return []
        
    sem_filter = ''
    params = [program_setup_id, degree_id]
    if db_semester:
        sem_filter = 'AND c.semester ILIKE %s'
        params.append(db_semester)
        
    courses = Database.execute_query(
        f'''SELECT c.id, c.unit AS credit_units, c.remark AS category, c.course_code
           FROM pg_courses c
           WHERE c.program_setup_id = %s
             AND c.degree_id = %s
             AND c.status = 'active'
             {sem_filter}''',
        params
    )
    return courses


@student_bp.route('/change-password', methods=['POST'])
@AuthHandler.token_required
def change_password(payload):
    """Change student password on first login"""
    user_id = payload['user_id']
    data = request.get_json()
    
    if not data or 'new_password' not in data:
        return jsonify({'message': 'New password required'}), 400
        
    if len(data['new_password']) < 6:
         return jsonify({'message': 'Password must be at least 6 characters'}), 400

    hashed_pw = AuthHandler.hash_password(data['new_password'])
    
    try:
        Database.execute_update(
            'UPDATE users SET password_hash = %s WHERE id = %s',
            (hashed_pw, user_id)
        )
        if payload.get('role') == 'student':
            Database.execute_update(
                '''UPDATE student_auth
                   SET is_first_login = FALSE,
                       password_changed_at = NOW(),
                       updateddate = NOW()
                   WHERE userid = %s''',
                (user_id,)
            )
        return jsonify({'message': 'Password updated successfully'}), 200
    except Exception as e:
        return jsonify({'message': f'Error updating password: {e}'}), 500

@student_bp.route('/profile', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.require_password_change
def get_profile(payload):
    """Get student profile with faculty/department info, biodata, and documents"""
    user_id = payload['user_id']

    student = Database.execute_query(
        '''SELECT s."Id" as id, s."MatricNo" as matric_number, 
                  l.name as current_level, acs.name as session, 
                  COALESCE(sa.is_first_login, FALSE) as is_first_login,
                  u.firstname || ' ' || COALESCE(u.middlename || ' ', '') || u.surname as name,
                  u.firstname as first_name, u.surname as last_name, u.middlename as middle_name,
                  u.username as username,
                  s."Email" as email, s."MobileNumber" as phone_number,
                  ps.name as program_name, pt.name as program_type,
                  ps.program_type_id,
                  s.department as department, f.name as faculty,
                  a.id as application_id
           FROM students s
           JOIN users u ON s."UserId" = u.id
           LEFT JOIN student_auth sa ON sa.userid = u.id
           LEFT JOIN applications a ON a.user_id = u.id
           LEFT JOIN level l ON s.current_level_id = l.id
           LEFT JOIN academic_sessions acs ON a.academic_session_id = acs.id
           LEFT JOIN program_setup ps ON COALESCE(a.program_setup_id, 0) = ps.id OR (a.program_setup_id IS NULL AND a.degree_id = ps.degree_id)
           LEFT JOIN program_types pt ON ps.program_type_id = pt.id
           LEFT JOIN departments d ON LOWER(s.department) = LOWER(d.name)
           LEFT JOIN faculties f ON d.faculty_id = f.id
           WHERE s."UserId" = %s
           ORDER BY a.updated_at DESC LIMIT 1''',
        (user_id,)
    )

    if not student:
        return jsonify({'message': 'Student record not found'}), 404

    student_data = dict(student[0])
    personal_info = {}
    documents = []

    # Check if they are postgraduate
    is_pg = (student_data.get('program_type_id') == 2)
    if not is_pg:
        # Fallback check on pg_application table
        pg_check = Database.execute_query('SELECT uuid FROM pg_application WHERE user_id = %s LIMIT 1', (user_id,))
        if pg_check:
            is_pg = True

    if is_pg:
        pg_res = Database.execute_query(
            '''SELECT pg.* FROM pg_application pg WHERE pg.user_id = %s ORDER BY pg.created_date DESC LIMIT 1''',
            (user_id,)
        )
        if pg_res:
            row = pg_res[0]
            personal_info = {
                'first_name': row.get('first_name'),
                'last_name': row.get('surname'),
                'surname': row.get('surname'),
                'middle_name': row.get('middle_name'),
                'email': row.get('email'),
                'gender': row.get('gender'),
                'date_of_birth': row.get('date_of_birth').strftime('%Y-%m-%d') if row.get('date_of_birth') else None,
                'phone_number': row.get('phone_number'),
                'secondary_phone_number': row.get('secondary_phone_number'),
                'address': row.get('address'),
                'physically_challenged': row.get('physically_challenged'),
                'physical_challenge_reason': row.get('physically_challenged') if row.get('physically_challenged') != 'No' else '',
            }
            # Fetch postgraduate documents
            docs = Database.execute_query(
                '''SELECT d.id AS document_id, d.document_type, d.document_type AS display_name,
                          d.file_name AS original_filename, d.file_size, d.status
                   FROM pg_document d
                   WHERE d.pg_application_id = %s''',
                (row['uuid'],)
            )
            documents = [dict(d) for d in (docs or [])]
    else:
        # Undergraduate/other - fetch from applications and biodata
        app_id = student_data.get('application_id')
        if not app_id:
            # Fallback if the join didn't yield an application_id directly
            app_res = Database.execute_query(
                'SELECT id FROM applications WHERE user_id = %s ORDER BY updated_at DESC LIMIT 1',
                (user_id,)
            )
            if app_res:
                app_id = app_res[0]['id']
                student_data['application_id'] = app_id

        if app_id:
            bio_res = Database.execute_query(
                'SELECT * FROM biodata WHERE application_id = %s',
                (app_id,)
            )
            if bio_res:
                row = dict(bio_res[0])
                dob = row.get('date_of_birth')
                if dob and hasattr(dob, 'strftime'):
                    row['date_of_birth'] = dob.strftime('%Y-%m-%d')
                personal_info = row
                if 'surname' in personal_info:
                    personal_info['last_name'] = personal_info['surname']

            # Fetch documents
            docs = Database.execute_query(
                '''SELECT d.id AS document_id, d.document_type, d.document_type AS display_name,
                          d.file_name AS original_filename, d.file_size, d.status
                   FROM documents d
                   WHERE d.application_id = %s''',
                (app_id,)
            )
            documents = [dict(d) for d in (docs or [])]

    # Fill default fields from users/students tables if not found in personal_info
    name_parts = student_data.get('name', '').split()
    first_name = name_parts[0] if len(name_parts) > 0 else ''
    last_name = name_parts[-1] if len(name_parts) > 1 else ''
    middle_name = ' '.join(name_parts[1:-1]) if len(name_parts) > 2 else ''

    if not personal_info.get('first_name'):
        personal_info['first_name'] = first_name
    if not personal_info.get('last_name'):
        personal_info['last_name'] = last_name
        personal_info['surname'] = last_name
    if not personal_info.get('middle_name'):
        personal_info['middle_name'] = middle_name
    if not personal_info.get('email'):
        personal_info['email'] = student_data.get('email')
    if not personal_info.get('phone_number'):
        personal_info['phone_number'] = student_data.get('phone_number')

    return jsonify({
        'profile': student_data,
        'personal_info': personal_info,
        'documents': documents
    }), 200


@student_bp.route('/courses', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.require_password_change
def get_courses(payload):
    user_id  = payload['user_id']
    semester = request.args.get('semester')  # optional filter; None = all semesters

    conn = Database.get_connection()
    if not conn:
        return jsonify({'message': 'Database connection failed'}), 500

    try:
        # Check global lock
        if check_registration_status():
            return jsonify({'message': 'The registration portal is currently closed by the administration. Please contact the ICT center for details.'}), 403

        with conn.cursor() as cur:
            # 1) Resolve student's program context
            # Try to resolve as PG student first from pg_application
            cur.execute(
                '''SELECT pg.uuid as pg_app_uuid,
                          pg.degree_id,
                          pg.academic_session_id,
                          acs.name AS session,
                          COALESCE(l.name, '700') AS current_level,
                          s.department AS department_name,
                          pg.finalised_course,
                          COALESCE(s."Id", 0) AS student_id,
                          d.name as degree_name,
                          COALESCE(ps.id, ps_fallback.id) AS program_setup_id
                   FROM pg_application pg
                   JOIN academic_sessions acs ON acs.id = pg.academic_session_id
                   LEFT JOIN pg_program_setup pgps ON pgps.id = pg.proposed_course
                   LEFT JOIN program_setup ps ON UPPER(TRIM(ps.name)) = UPPER(TRIM(pgps.name)) AND ps.department_id = pgps.department_id
                   LEFT JOIN students s ON s."UserId" = pg.user_id
                   LEFT JOIN program_setup ps_fallback ON UPPER(TRIM(ps_fallback.name)) = UPPER(TRIM(s.department))
                   LEFT JOIN level l ON l.id = s.current_level_id
                   LEFT JOIN degrees d ON d.id = pg.degree_id
                   WHERE pg.user_id = %s
                     AND pg.applicant_stage IN ('accepted', 'enrolled')
                   ORDER BY pg.updated_date DESC LIMIT 1''',
                (user_id,)
            )
            pg_row = cur.fetchone()
            
            if pg_row:
                student = {
                    'degree_id': pg_row['degree_id'],
                    'prog_type': 2,  # Postgraduate program type
                    'current_level': pg_row['current_level'],
                    'session': pg_row['session'],
                    'department_name': pg_row['department_name'],
                    'finalised_course': pg_row['finalised_course'],
                    'course_department': pg_row['finalised_course'] or pg_row['department_name'],
                    'student_id': pg_row['student_id'],
                    'degree_name': pg_row['degree_name'],
                    'program_setup_id': pg_row['program_setup_id']
                }
            else:
                # Resolve regular student's program context
                cur.execute(
                    '''SELECT a.degree_id,
                              a.prog_type,
                              COALESCE(l.name, '100') AS current_level,
                              acs.name AS session,
                              s.department AS department_name,
                              a.finalised_course,
                              d.name AS course_department,
                              COALESCE(s."Id", 0) AS student_id
                       FROM applications a
                       JOIN academic_sessions acs ON acs.id = a.academic_session_id
                       LEFT JOIN students s ON s."UserId" = a.user_id
                       LEFT JOIN level l ON l.id = s.current_level_id
                       LEFT JOIN program_setup ps ON ps.id = a.program_setup_id
                       LEFT JOIN departments d ON d.id = ps.department_id
                       WHERE a.user_id = %s
                       AND a.applicant_stage IN ('accepted', 'enrolled')
                       ORDER BY a.updated_at DESC LIMIT 1''',
                    (user_id,)
                )
                student = cur.fetchone()
                
            if not student:
                return jsonify({'message': 'Student record not found. Please contact the admissions office.', 'payment_required': False}), 404

            # ── Tuition payment guard ─────────────────────────────────────────
            active_sem = _get_active_semester()
            is_pt_hnd_student = _is_pt_or_hnd(student)
            can_submit_registration = True
            if active_sem:
                paid = _registration_payment_satisfied(user_id, active_sem, is_pt_hnd_student)
                can_submit_registration = paid
                if not paid and not is_pt_hnd_student:
                    return jsonify({
                        'message': (
                            f'Tuition payment for {active_sem["session_name"]} '
                            f'{active_sem["name"]} semester is required before '
                            f'you can register courses.'
                        ),
                        'payment_required': True,
                        'semester': active_sem['name'],
                        'session':  active_sem['session_name'],
                    }), 402

            current_level   = student['current_level'] 
            db_session      = student['session']
            student_id      = student['student_id']
            
            is_pg_student = (student.get('prog_type') == 2)
            if is_pg_student:
                all_courses = _fetch_pg_courses(
                    cur,
                    student.get('program_setup_id'),
                    student['degree_id'],
                    None,
                    _course_department_candidates(student),
                )
            else:
                all_courses = _fetch_courses_for_departments(
                    cur,
                    _course_department_candidates(student),
                    current_level,
                    semester,
                )

            # 3) Registered course ids for this student + session.
            # PG registration is active-semester based, but the PG course catalog
            # itself is not filtered by course semester.
            if is_pg_student and active_sem:
                cur.execute(
                    '''SELECT rc.course_id, cr.semester, cr.id AS reg_id, cr.status
                       FROM course_registrations cr
                       JOIN registered_courses rc ON rc.registration_id = cr.id
                       WHERE cr.student_id = %s AND cr.session = %s AND cr.semester = %s''',
                    (student_id, db_session, active_sem['name'])
                )
            else:
                cur.execute(
                    '''SELECT rc.course_id, cr.semester, cr.id AS reg_id, cr.status
                       FROM course_registrations cr
                       JOIN registered_courses rc ON rc.registration_id = cr.id
                       WHERE cr.student_id = %s AND cr.session = %s''',
                    (student_id, db_session)
                )
            reg_rows = cur.fetchall()

        # ── Build registered lookup ───────────────────────────────────────────
        registered_ids     = [r['course_id'] for r in reg_rows]
        reg_status_by_sem  = {}   # { "First": "submitted", ... }
        reg_id_by_sem      = {}   # { "First": cr_id, ... }
        for r in reg_rows:
            s = r['semester']
            reg_status_by_sem[s] = r['status']
            reg_id_by_sem[s]     = r['reg_id']

        # ── Classify courses ──────────────────────────────────────────────────
        COMPULSORY_REMARKS = {'compulsory', 'compulsary'}   # handle typo in DB
        CORE_REMARKS       = {'core'}
        ELECTIVE_REMARKS   = {'elective', 'rlective'}        # handle typo in DB
        REQUIRED_REMARKS   = {'required'}

        semesters_data  = {}   # { semester_label: { compulsory: [], core: [] } }
        available       = []   # elective + required across all semesters

        for c in all_courses:
            row = dict(c)
            row['is_registered'] = c['id'] in registered_ids
            remark = (c['remark'] or '').lower().strip()
            sem    = c['semester'] or 'Unknown'   # "First semester" / "Second semester"
            if sem and sem.lower().endswith('semester'):
                parts = sem.split()
                sem = f"{parts[0].capitalize()} semester"

            if remark in COMPULSORY_REMARKS or remark in CORE_REMARKS:
                bucket = 'compulsory' if remark in COMPULSORY_REMARKS else 'core'
                if sem not in semesters_data:
                    semesters_data[sem] = {'compulsory': [], 'core': []}
                
                # Limit selected (compulsory/core) courses to a maximum of 10 per semester.
                # Any excess courses will fall under available courses instead.
                current_selected_count = len(semesters_data[sem]['compulsory']) + len(semesters_data[sem]['core'])
                if current_selected_count < 10:
                    semesters_data[sem][bucket].append(row)
                else:
                    available.append(row)
            else:
                # elective, required, unknown → available for manual selection
                available.append(row)

        return jsonify({
            'student':               dict(student),
            'semesters':             semesters_data,
            'all_courses':           [dict(c) for c in all_courses],
            'available_courses':     available,
            'registered_course_ids': registered_ids,
            'reg_status_by_semester': reg_status_by_sem,
            'active_semester':       dict(active_sem) if active_sem else None,
            'is_pt_registration':    is_pt_hnd_student,
            'is_pg_registration':    is_pg_student,
            'can_submit_registration': can_submit_registration,
            'is_global_locked':      check_registration_status(),
        }), 200

    except Exception as e:
        print(f'Error in get_courses: {e}')
        import traceback; traceback.print_exc()
        return jsonify({'message': 'An unexpected error occurred while fetching courses. Please try again later or contact support.'}), 500
    finally:
        Database.release_connection(conn)


@student_bp.route('/register-courses', methods=['POST'])
@AuthHandler.token_required
def register_courses(payload):
    """Submit course registration"""
    # Check global lock
    if check_registration_status():
         return jsonify({'message': 'Registration is currently locked.'}), 403

    user_id = payload['user_id']
    data = request.get_json()
    
    if not data or 'course_ids' not in data or 'semester' not in data:
        return jsonify({'message': 'course_ids and semester are required'}), 400
        
    course_ids = data['course_ids']
    semester = data['semester']
    status = data.get('status', 'submitted')
    if status not in ('draft', 'submitted'):
        status = 'submitted'
    
    if not isinstance(course_ids, list):
         return jsonify({'message': 'course_ids must be a list'}), 400

    # Try resolving as PG student first from pg_application
    pg_student = Database.execute_query(
        '''SELECT pg.uuid as pg_app_uuid,
                  pg.degree_id,
                  pg.academic_session_id,
                  acs.name AS session,
                  COALESCE(l.name, '700') AS current_level,
                  s.department AS department_name,
                  pg.finalised_course,
                  COALESCE(s."Id", 0) AS student_id,
                  d.name as degree_name,
                  COALESCE(ps.id, ps_fallback.id) AS program_setup_id
           FROM pg_application pg
           JOIN academic_sessions acs ON acs.id = pg.academic_session_id
           LEFT JOIN pg_program_setup pgps ON pgps.id = pg.proposed_course
           LEFT JOIN program_setup ps ON UPPER(TRIM(ps.name)) = UPPER(TRIM(pgps.name)) AND ps.department_id = pgps.department_id
           LEFT JOIN students s ON s."UserId" = pg.user_id
           LEFT JOIN program_setup ps_fallback ON UPPER(TRIM(ps_fallback.name)) = UPPER(TRIM(s.department))
           LEFT JOIN level l ON l.id = s.current_level_id
           LEFT JOIN degrees d ON d.id = pg.degree_id
           WHERE pg.user_id = %s
             AND pg.applicant_stage IN ('accepted', 'enrolled')
           ORDER BY pg.updated_date DESC LIMIT 1''',
        (user_id,)
    )

    if pg_student:
        pg_row = pg_student[0]
        s_data = {
            'degree_id': pg_row['degree_id'],
            'prog_type': 2,  # Postgraduate program type
            'current_level': pg_row['current_level'],
            'session': pg_row['session'],
            'department_name': pg_row['department_name'],
            'finalised_course': pg_row['finalised_course'],
            'course_department': pg_row['finalised_course'] or pg_row['department_name'],
            'student_id': pg_row['student_id'],
            'degree_name': pg_row['degree_name'],
            'program_setup_id': pg_row['program_setup_id']
        }
    else:
        student = Database.execute_query(
            '''SELECT a.degree_id,
                      a.prog_type,
                      COALESCE(l.name, '100') AS current_level,
                      acs.name as session,
                      s.department AS department_name,
                      a.finalised_course,
                      d.name AS course_department,
                      COALESCE(s."Id", 0) AS student_id
               FROM applications a
               JOIN academic_sessions acs ON acs.id = a.academic_session_id
               LEFT JOIN students s ON s."UserId" = a.user_id
               LEFT JOIN level l ON l.id = s.current_level_id
               LEFT JOIN program_setup ps ON ps.id = a.program_setup_id
               LEFT JOIN departments d ON d.id = ps.department_id
               WHERE a.user_id = %s
               AND a.applicant_stage IN ('accepted', 'enrolled')
               ORDER BY a.updated_at DESC LIMIT 1''',
            (user_id,)
        )
        if not student:
            return jsonify({'message': 'Student record not found. Please contact the admissions office.', 'payment_required': False}), 404
        s_data = student[0]

    # ── Independent tuition payment check per session + semester ─────────────
    active_sem = _get_active_semester()
    is_pt_hnd_student = _is_pt_or_hnd(s_data)
    if active_sem:
        paid = _registration_payment_satisfied(user_id, active_sem, is_pt_hnd_student)
        if not paid and (not is_pt_hnd_student or status == 'submitted'):
            return jsonify({
                'message': (
                    f'Tuition payment for {active_sem["session_name"]} '
                    f'{active_sem["name"]} semester is required before '
                    f'you can register courses.'
                ),
                'payment_required': True,
                'semester': active_sem['name'],
                'session':  active_sem['session_name'],
            }), 402

    student_id = s_data['student_id']
    current_session = s_data['session']
    current_level = s_data['current_level']
    is_pg_student = (s_data.get('prog_type') == 2)
    registration_semester = active_sem['name'] if (is_pt_hnd_student or is_pg_student) and active_sem else semester
    
    # Check for existing registration record (no longer locks if submitted)
    reg = Database.execute_query(
        'SELECT id, status FROM course_registrations WHERE student_id = %s AND session = %s AND semester = %s',
        (student_id, current_session, registration_semester)
    )
    
    db_semester = None if (is_pt_hnd_student or is_pg_student) else f"{semester} semester"

    if is_pg_student:
        valid_courses = _fetch_valid_pg_courses(
            s_data.get('program_setup_id'),
            s_data['degree_id'],
            db_semester,
            _course_department_candidates(s_data),
        )
    else:
        valid_courses = _fetch_valid_courses_for_departments(
            _course_department_candidates(s_data),
            current_level,
            db_semester,
        )
    valid_map = {c['id']: c for c in (valid_courses or [])}
    
    # Calculate totals
    total_credits = 0
    selected_valid = []
    
    for cid in course_ids:
        try:
             cid = int(cid)
        except:
             continue
             
        if cid in valid_map:
             selected_valid.append(cid)
             total_credits += valid_map[cid]['credit_units']
        else:
             # Look it up globally if it is an external elective that they searched for explicitly
             course_table = 'pg_courses' if is_pg_student else 'course'
             ext_course = Database.execute_query(f'SELECT id, unit as credit_units FROM {course_table} WHERE id = %s', (cid,))
             if ext_course:
                  selected_valid.append(cid)
                  total_credits += ext_course[0]['credit_units']
             
    # Compulsory courses are pre-selected in the UI but students can remove them if needed
    # so we no longer enforce that all compulsory courses must be selected.

    if is_pt_hnd_student and status == 'submitted' and total_credits < 15:
        return jsonify({'message': 'Part-time and HND conversion students must register a minimum of 15 units per semester.'}), 400
        
    try:
        if reg:
            reg_id = reg[0]['id']
            Database.execute_update(
                'UPDATE course_registrations SET total_credits = %s, status = %s, submitted_at = NOW() WHERE id = %s',
                (total_credits, status, reg_id)
            )
            Database.execute_update('DELETE FROM registered_courses WHERE registration_id = %s', (reg_id,))
        else:
            reg_id = Database.execute_update(
                '''INSERT INTO course_registrations (student_id, session, semester, status, total_credits, submitted_at)
                   VALUES (%s, %s, %s, %s, %s, NOW()) RETURNING id''',
                (student_id, current_session, registration_semester, status, total_credits),
                return_id=True
            )
            
        # Insert selected courses
        for cid in selected_valid:
             Database.execute_update(
                 'INSERT INTO registered_courses (registration_id, course_id) VALUES (%s, %s)',
                 (reg_id, cid)
             )
             
        return jsonify({'message': 'Courses registered successfully', 'total_credits': total_credits}), 200
        
    except Exception as e:
        print(f'Error in register_courses: {e}')
        return jsonify({'message': 'An unexpected error occurred while saving your registration. Please try again later.'}), 500


@student_bp.route('/registration-history', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.require_password_change
def get_registration_history(payload):
    """Return the student's course registration history grouped by session/semester."""
    user_id = payload['user_id']

    try:
        student_res = Database.execute_query(
            '''SELECT s."Id" AS id,
                      EXISTS (
                          SELECT 1
                          FROM pg_application pg
                          WHERE pg.user_id = s."UserId"
                            AND pg.applicant_stage IN ('accepted', 'enrolled')
                      ) AS is_pg_student
               FROM students s
               WHERE s."UserId" = %s
               LIMIT 1''',
            (user_id,)
        )
        if not student_res:
            return jsonify({'history': []}), 200

        student_id = student_res[0]['id']
        is_pg_student = bool(student_res[0].get('is_pg_student'))
        course_table = 'pg_courses' if is_pg_student else 'course'
        rows = Database.execute_query(
            f'''SELECT cr.id AS registration_id,
                      cr.session,
                      cr.semester,
                      cr.status,
                      cr.total_credits,
                      cr.submitted_at,
                      rc.course_id,
                      c.course_code,
                      c.course_title,
                      c.unit AS credit_units,
                      c.remark AS category
               FROM course_registrations cr
               LEFT JOIN registered_courses rc ON rc.registration_id = cr.id
               LEFT JOIN {course_table} c ON c.id = rc.course_id
               WHERE cr.student_id = %s
               ORDER BY cr.session DESC, cr.semester DESC, cr.submitted_at DESC NULLS LAST, cr.id DESC,
                        c.course_code ASC''',
            (student_id,)
        ) or []

        history_by_id = {}
        for row in rows:
            reg_id = row['registration_id']
            if reg_id not in history_by_id:
                submitted_at = row.get('submitted_at')
                history_by_id[reg_id] = {
                    'id': reg_id,
                    'session': row.get('session'),
                    'semester': row.get('semester'),
                    'status': row.get('status'),
                    'total_credits': row.get('total_credits') or 0,
                    'submitted_at': submitted_at.isoformat() if submitted_at else None,
                    'courses': [],
                }

            if row.get('course_id'):
                history_by_id[reg_id]['courses'].append({
                    'id': row.get('course_id'),
                    'course_code': row.get('course_code') or '',
                    'course_title': row.get('course_title') or '',
                    'credit_units': row.get('credit_units') or 0,
                    'category': row.get('category'),
                })

        return jsonify({'history': list(history_by_id.values())}), 200
    except Exception as e:
        print(f'Error in get_registration_history: {e}')
        return jsonify({'message': 'An unexpected error occurred while fetching registration history.'}), 500


@student_bp.route('/courses/search', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.require_password_change
def search_courses(payload):
    """Search for courses across the whole database"""
    user_id = payload['user_id']
    query = request.args.get('q', '').strip()
    if not query or len(query) < 2:
        return jsonify({'courses': []}), 200
        
    term = f"%{query}%"
    term_no_space = f"%{query.replace(' ', '')}%"
    try:
        # Check if they are a PG student to query pg_courses instead
        is_pg = False
        pg_check = Database.execute_query('SELECT uuid FROM pg_application WHERE user_id = %s LIMIT 1', (user_id,))
        if pg_check:
            is_pg = True

        course_table = 'pg_courses' if is_pg else 'course'
        courses = Database.execute_query(
            f'''SELECT c.id, c.course_code, c.course_title, c.unit as credit_units, c.remark as category 
               FROM {course_table} c
               WHERE REPLACE(c.course_code, ' ', '') ILIKE %s OR c.course_title ILIKE %s
               ORDER BY c.course_code
               LIMIT 20''',
            (term_no_space, term)
        )
        return jsonify({'courses': [dict(c) for c in (courses or [])]}), 200
    except Exception as e:
         print(f'Error in search_courses: {e}')
         return jsonify({'message': 'An unexpected error occurred while searching for courses.'}), 500
@student_bp.route('/admin/list', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.require_password_change
@AuthHandler.admin_required
def admin_get_students(payload):
    """List all students for ICT Director management"""
    search = request.args.get('q', '')
    
    query = '''SELECT * FROM (
                   SELECT DISTINCT ON (s."Id") 
                          s."Id" as id, 
                          s."MatricNo" as matric_number, 
                          l.name as current_level, 
                          acs.name as session,
                          u.firstname || ' ' || COALESCE(u.middlename || ' ', '') || u.surname as name,
                          s."Email" as email, 
                          s."MobileNumber" as phone_number,
                          ps.name as program_name, 
                          s.department as department
                   FROM students s
                   JOIN users u ON s."UserId" = u.id
                   LEFT JOIN applications a ON a.user_id = u.id
                   LEFT JOIN level l ON s.current_level_id = l.id
                   LEFT JOIN academic_sessions acs ON a.academic_session_id = acs.id
                   LEFT JOIN program_setup ps ON COALESCE(a.program_setup_id, 0) = ps.id OR (a.program_setup_id IS NULL AND a.degree_id = ps.degree_id)
                   WHERE u.firstname ILIKE %s OR u.surname ILIKE %s OR s."MatricNo" ILIKE %s
                   ORDER BY s."Id", a.updated_at DESC
               ) subquery
               ORDER BY matric_number DESC'''
    
    term = f"%{search}%"
    students = Database.execute_query(query, (term, term, term))
    
    return jsonify({'students': students or []}), 200

@student_bp.route('/admin/update', methods=['PUT'])
@AuthHandler.token_required
@AuthHandler.require_password_change
@AuthHandler.admin_required
def admin_update_student(payload):
    """Update student profile details as admin"""
    data = request.get_json()
    if not data or 'id' not in data:
        return jsonify({'message': 'Student ID required'}), 400
        
    student_id = data['id']
    matric_no = data.get('matric_number')
    level_str = data.get('current_level')
    session_str = data.get('session')
    
    try:
        # Resolve level_id
        level_id = None
        if level_str:
            level_digits = ''.join(c for c in level_str if c.isdigit())
            if level_digits:
                level_res = Database.execute_query(
                    'SELECT id FROM level WHERE name = %s',
                    (level_digits,)
                )
                if level_res:
                    level_id = level_res[0]['id']

        # Resolve session_id
        session_id = None
        if session_str:
            session_res = Database.execute_query(
                'SELECT id FROM academic_sessions WHERE name = %s',
                (session_str,)
            )
            if session_res:
                session_id = session_res[0]['id']

        # ── Get user_id for this student ──
        student_res = Database.execute_query(
            'SELECT "UserId", current_level_id FROM students WHERE "Id" = %s',
            (student_id,)
        )
        if not student_res:
            return jsonify({'message': 'Student not found'}), 404
        
        user_id = student_res[0]['UserId']
        old_level_id = student_res[0]['current_level_id']

        # Update students table
        Database.execute_update(
            '''UPDATE students 
               SET "MatricNo" = COALESCE(%s, "MatricNo"),
                   current_level_id = COALESCE(%s, current_level_id),
                   "UpdatedDate" = NOW()
               WHERE "Id" = %s''',
            (matric_no, level_id, student_id)
        )

        # ── If level was changed, reset fully_paid_for_session flag for current session ──
        if level_id and level_id != old_level_id:
            print(f"[admin_update_student] Level changed from {old_level_id} to {level_id}")
            
            # Get current session_id from applications
            current_session_res = Database.execute_query(
                '''SELECT acs.id FROM academic_sessions acs
                   WHERE acs.is_active = TRUE
                   ORDER BY acs.id DESC LIMIT 1''',
            )
            
            if current_session_res:
                current_session_id = current_session_res[0]['id']
                # Reset fully_paid_for_session to FALSE since student moved to new level
                # They now need to pay fees for the new level
                Database.execute_update(
                    '''UPDATE payment_transactions
                       SET fully_paid_for_session = FALSE
                       WHERE user_id = %s 
                         AND academic_session_id = %s 
                         AND tran_type = 'tuition' ''',
                    (user_id, current_session_id)
                )
                print(f"[admin_update_student] Reset fully_paid_for_session for session {current_session_id}")

        # Update applications table academic_session_id
        if session_id:
            Database.execute_update(
                '''UPDATE applications 
                   SET academic_session_id = %s 
                   WHERE id = (
                       SELECT id FROM applications 
                       WHERE user_id = (SELECT "UserId" FROM students WHERE "Id" = %s)
                       ORDER BY updated_at DESC LIMIT 1
                   )''',
                (session_id, student_id)
            )

        return jsonify({'message': 'Student updated successfully'}), 200
    except Exception as e:
         print(f"Error updating student: {e}")
         return jsonify({'message': f'Error updating student: {e}'}), 500
