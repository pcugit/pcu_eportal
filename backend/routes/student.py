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
        Database.execute_update(
            'UPDATE students SET is_first_login = FALSE WHERE user_id = %s',
            (user_id,)
        )
        return jsonify({'message': 'Password updated successfully'}), 200
    except Exception as e:
        return jsonify({'message': f'Error updating password: {e}'}), 500

@student_bp.route('/profile', methods=['GET'])
@AuthHandler.token_required
def get_profile(payload):
    """Get student profile with faculty/department info"""
    user_id = payload['user_id']

    student = Database.execute_query(
        '''SELECT s."Id" as id, s."MatricNo" as matric_number, 
                  l.name as current_level, acs.name as session, 
                  FALSE as is_first_login,
                  u.firstname || ' ' || COALESCE(u.middlename || ' ', '') || u.surname as name,
                  s."Email" as email, s."MobileNumber" as phone_number,
                  ps.name as program_name, pt.name as program_type,
                  s.department as department, f.name as faculty
           FROM students s
           JOIN users u ON s."UserId" = u.id
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

    return jsonify({'profile': student[0]}), 200


@student_bp.route('/courses', methods=['GET'])
@AuthHandler.token_required
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
            # Use LEFT JOINs on level and program_setup so NULL level_id or an
            # unmatched finalised_course does not silently drop the entire row.
            cur.execute(
                '''SELECT a.degree_id,
                          COALESCE(l.name, '100') AS current_level,
                          acs.name AS session,
                          s.department AS department_name,
                          COALESCE(s."Id", 0) AS student_id
                   FROM applications a
                   JOIN academic_sessions acs ON acs.id = a.academic_session_id
                   LEFT JOIN students s ON s."UserId" = a.user_id
                   LEFT JOIN level l ON l.id = s.current_level_id
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
            if active_sem:
                paid = (
                    _verify_tuition_paid(user_id, active_sem['session_id'], active_sem['id'])
                    or _has_any_tuition_paid(user_id)
                )
                if not paid:
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
            department_name = student['department_name']

            sem_filter = ''
            sem_params = [department_name, current_level]
            if semester:
                sem_filter = "AND c.semester ILIKE %s"
                sem_params.append(f'{semester} semester')

            cur.execute(
                f'''SELECT c.id, c.course_code, c.course_title,
                          c.unit AS credit_units, c.semester,
                          LOWER(TRIM(c.remark)) AS remark
                   FROM course c
                   WHERE UPPER(c.department) = UPPER(%s)
                     AND c.level::text = %s
                     AND c.status = \'active\'
                     {sem_filter}
                   ORDER BY c.semester, c.remark, c.course_code''',
                sem_params
            )
            all_courses = cur.fetchall()

            # 3) Registered course ids for this student + session
            #    Fetch across ALL semesters so the UI knows what's already saved.
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
            'available_courses':     available,
            'registered_course_ids': registered_ids,
            'reg_status_by_semester': reg_status_by_sem,
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
    
    if not isinstance(course_ids, list):
         return jsonify({'message': 'course_ids must be a list'}), 400

    student = Database.execute_query(
        '''SELECT a.degree_id,
                  COALESCE(l.name, '100') AS current_level,
                  acs.name as session,
                  s.department AS department_name,
                  COALESCE(s."Id", 0) AS student_id
           FROM applications a
           JOIN academic_sessions acs ON acs.id = a.academic_session_id
           LEFT JOIN students s ON s."UserId" = a.user_id
           LEFT JOIN level l ON l.id = s.current_level_id
           WHERE a.user_id = %s
           AND a.applicant_stage IN ('accepted', 'enrolled')
           ORDER BY a.updated_at DESC LIMIT 1''',
        (user_id,)
    )

    if not student:
        return jsonify({'message': 'Student record not found. Please contact the admissions office.', 'payment_required': False}), 404

    # ── Independent tuition payment check per session + semester ─────────────
    active_sem = _get_active_semester()
    if active_sem:
        paid = (
            _verify_tuition_paid(user_id, active_sem['session_id'], active_sem['id'])
            or _has_any_tuition_paid(user_id)   # grandfather: pre-tracking payments
        )
        if not paid:
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

    s_data = student[0]
    student_id = s_data['student_id']
    current_session = s_data['session']
    department_name = s_data['department_name']
    current_level = s_data['current_level']
    
    # Check for existing registration record (no longer locks if submitted)
    reg = Database.execute_query(
        'SELECT id, status FROM course_registrations WHERE student_id = %s AND session = %s AND semester = %s',
        (student_id, current_session, semester)
    )
    
    db_semester = f"{semester} semester"

    # Validate courses against program curriculum
    valid_courses = Database.execute_query(
         '''SELECT c.id, c.unit as credit_units, c.remark as category 
            FROM course c
            WHERE c.department = %s AND c.level = %s AND c.semester ILIKE %s''',
         (department_name, current_level, db_semester)
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
             ext_course = Database.execute_query('SELECT id, unit as credit_units FROM course WHERE id = %s', (cid,))
             if ext_course:
                  selected_valid.append(cid)
                  total_credits += ext_course[0]['credit_units']
             
    # Compulsory courses are pre-selected in the UI but students can remove them if needed
    # so we no longer enforce that all compulsory courses must be selected.
        
    try:
        if reg:
            reg_id = reg[0]['id']
            Database.execute_update(
                'UPDATE course_registrations SET total_credits = %s, status = %s, submitted_at = NOW() WHERE id = %s',
                (total_credits, 'submitted', reg_id)
            )
            Database.execute_update('DELETE FROM registered_courses WHERE registration_id = %s', (reg_id,))
        else:
            reg_id = Database.execute_update(
                '''INSERT INTO course_registrations (student_id, session, semester, status, total_credits, submitted_at)
                   VALUES (%s, %s, %s, %s, %s, NOW()) RETURNING id''',
                (student_id, current_session, semester, 'submitted', total_credits),
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

@student_bp.route('/courses/search', methods=['GET'])
@AuthHandler.token_required
def search_courses(payload):
    """Search for courses across the whole database"""
    query = request.args.get('q', '').strip()
    if not query or len(query) < 2:
        return jsonify({'courses': []}), 200
        
    term = f"%{query}%"
    term_no_space = f"%{query.replace(' ', '')}%"
    try:
        courses = Database.execute_query(
            '''SELECT c.id, c.course_code, c.course_title, c.unit as credit_units, c.remark as category 
               FROM course c
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
@AuthHandler.admin_required
def admin_get_students(payload):
    """List all students for ICT Director management"""
    search = request.args.get('q', '')
    
    query = '''SELECT s.id, s.matric_number, s.current_level, s.session,
                      u.name, u.email, u.phone_number,
                      p.name as program_name, d.name as department
               FROM students s
               JOIN users u ON s.user_id = u.id
               JOIN programs p ON s.program_id = p.id
               JOIN departments d ON p.department_id = d.id
               WHERE u.name ILIKE %s OR u.email ILIKE %s OR s.matric_number ILIKE %s
               ORDER BY s.matric_number DESC'''
    
    term = f"%{search}%"
    students = Database.execute_query(query, (term, term, term))
    
    return jsonify({'students': students or []}), 200

@student_bp.route('/admin/update', methods=['PUT'])
@AuthHandler.token_required
@AuthHandler.admin_required
def admin_update_student(payload):
    """Update student profile details as admin"""
    data = request.get_json()
    if not data or 'id' not in data:
        return jsonify({'message': 'Student ID required'}), 400
        
    student_id = data['id']
    
    try:
        Database.execute_update(
            'UPDATE students SET matric_number = %s, current_level = %s, session = %s WHERE id = %s',
            (data.get('matric_number'), data.get('current_level'), data.get('session'), student_id)
        )
        return jsonify({'message': 'Student updated successfully'}), 200
    except Exception as e:
        return jsonify({'message': f'Error updating student: {e}'}), 500
