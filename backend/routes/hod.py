"""routes/hod.py — HOD: department results view + score approval workflow."""
from flask import Blueprint, request, jsonify
from database import Database
from utils.auth import AuthHandler

hod_bp = Blueprint('hod', __name__)


def _hod_dept(user_id):
    """Return the department_id for the HOD's staff record."""
    rows = Database.execute_query(
        'SELECT department_id FROM staff WHERE user_id = %s', (user_id,))
    return rows[0]['department_id'] if rows else None


def _active_period():
    rows = Database.execute_query(
        '''SELECT s.name AS semester, acs.name AS session
           FROM semesters s
           JOIN academic_sessions acs ON acs.id = s.session_id
           WHERE s.is_active = TRUE
           LIMIT 1''')
    return dict(rows[0]) if rows else None


# ── GET /api/hod/dashboard ────────────────────────────────────────────────────
@hod_bp.route('/dashboard', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('hod', 'admin')
def dashboard(payload):
    dept_id = _hod_dept(payload['user_id'])
    if not dept_id:
        return jsonify({'message': 'HOD department not configured'}), 403

    students = Database.execute_query(
        '''SELECT COUNT(*) AS total FROM students s
           WHERE LOWER(s.department) = (SELECT LOWER(name) FROM departments WHERE id = %s)''', (dept_id,))

    # Pending score submissions
    pending = Database.execute_query(
        '''SELECT COUNT(*) AS total FROM student_scores ss
           JOIN course c ON ss.course_id = c.id
           JOIN departments cd ON UPPER(TRIM(cd.name)) = UPPER(TRIM(c.department))
           WHERE cd.id = %s AND ss.status = 'submitted' ''', (dept_id,))

    # Courses in dept
    courses = Database.execute_query(
        '''SELECT COUNT(*) AS total FROM course c
           JOIN departments d ON UPPER(TRIM(d.name)) = UPPER(TRIM(c.department))
           WHERE d.id = %s AND c.status = 'active' ''', (dept_id,))

    staff = Database.execute_query(
        'SELECT COUNT(*) AS total FROM staff WHERE department_id = %s', (dept_id,))

    dept_info = Database.execute_query(
        'SELECT name FROM departments WHERE id = %s', (dept_id,))

    return jsonify({
        'department': dict(dept_info[0]) if dept_info else {},
        'total_students': students[0]['total'] if students else 0,
        'pending_approvals': pending[0]['total'] if pending else 0,
        'total_courses': courses[0]['total'] if courses else 0,
        'total_staff': staff[0]['total'] if staff else 0,
    }), 200


# ── GET /api/hod/results ──────────────────────────────────────────────────────
@hod_bp.route('/results', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('hod', 'admin')
def get_dept_results(payload):
    """Return all results for the HOD's department with filtering."""
    dept_id  = _hod_dept(payload['user_id'])
    if not dept_id:
        return jsonify({'message': 'HOD department not configured'}), 403

    session  = request.args.get('session', '')
    semester = request.args.get('semester', '')
    status   = request.args.get('status', '')     # draft | submitted | approved
    level    = request.args.get('level', '')

    query = '''
        SELECT ss.id, ss.student_id, st."MatricNo" as matric_number,
               u.firstname || ' ' || u.surname AS student_name, l.name as current_level,
               c.course_code, c.course_title,
               ss.ca_score, ss.exam_score, ss.total_score,
               ss.grade, ss.grade_point, ss.status,
               ss.session, ss.semester,
               entered.firstname || ' ' || entered.surname AS entered_by,
               r.name as entered_role,
               ss.submitted_at, ss.approved_at
        FROM student_scores ss
        JOIN students st ON ss.student_id = st."Id"
        JOIN users u ON st."UserId" = u.id
        LEFT JOIN level l ON st.current_level_id = l.id
        JOIN course c ON ss.course_id = c.id
        JOIN departments cd ON UPPER(TRIM(cd.name)) = UPPER(TRIM(c.department))
        LEFT JOIN users entered ON ss.entered_by = entered.id
        LEFT JOIN user_types ut ON entered.user_type_id = ut.id
        LEFT JOIN roles r ON ut.role_id = r.id
        WHERE cd.id = %s
    '''
    params = [dept_id]
    if session:
        query += ' AND ss.session = %s'; params.append(session)
    if semester:
        query += ' AND ss.semester = %s'; params.append(semester)
    if status:
        query += ' AND ss.status = %s'; params.append(status)
    if level:
        level_digits = ''.join(c for c in level if c.isdigit())
        if level_digits:
            query += ' AND l.name = %s'; params.append(level_digits)
    query += ' ORDER BY st."MatricNo", c.course_code'

    results = Database.execute_query(query, tuple(params))
    return jsonify({'results': [dict(r) for r in (results or [])]}), 200


# ── GET /api/hod/courses ──────────────────────────────────────────────────────
@hod_bp.route('/courses', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('hod', 'admin')
def get_dept_courses(payload):
    """All courses offered in the HOD's department."""
    dept_id = _hod_dept(payload['user_id'])
    if not dept_id:
        return jsonify({'message': 'HOD department not configured'}), 403

    courses = Database.execute_query(
        '''SELECT c.id, c.course_code, c.course_title, c.unit AS credit_units,
                  c.remark, c.semester, c.level, LOWER(TRIM(c.status::text)) AS status
           FROM course c
           JOIN departments d ON UPPER(TRIM(d.name)) = UPPER(TRIM(c.department))
           WHERE d.id = %s
           ORDER BY c.course_code''',
        (dept_id,))

    if courses is None:
        return jsonify({'message': 'Failed to load department courses'}), 500

    return jsonify({'courses': [dict(c) for c in courses]}), 200


@hod_bp.route('/courses', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.roles_required('hod')
def create_department_course(payload):
    """Create a course in the logged-in HOD's department."""
    dept_id = _hod_dept(payload['user_id'])
    if not dept_id:
        return jsonify({'message': 'HOD department not configured'}), 403

    department = Database.execute_query(
        'SELECT name FROM departments WHERE id = %s',
        (dept_id,))
    if not department:
        return jsonify({'message': 'Department not found'}), 404

    data = request.get_json() or {}
    required = ('course_code', 'course_title', 'unit', 'semester', 'level', 'status', 'remark')
    missing = [field for field in required if str(data.get(field, '')).strip() == '']
    if missing:
        return jsonify({'message': f'Required fields: {", ".join(missing)}'}), 400

    course_code = str(data['course_code']).strip().upper()
    course_title = str(data['course_title']).strip()
    semester = str(data['semester']).strip()
    status = str(data['status']).strip().lower()
    remark = str(data['remark']).strip().lower()
    department_name = department[0]['name']

    try:
        unit = int(data['unit'])
        level = int(data['level'])
    except (TypeError, ValueError):
        return jsonify({'message': 'Units and level must be whole numbers'}), 400

    if unit < 1 or unit > 10:
        return jsonify({'message': 'Units must be between 1 and 10'}), 400
    if level < 100 or level > 1000 or level % 100 != 0:
        return jsonify({'message': 'Level must be a valid 100-level increment'}), 400
    if semester not in ('First semester', 'Second semester'):
        return jsonify({'message': 'Semester must be First semester or Second semester'}), 400
    if status not in ('active', 'inactive'):
        return jsonify({'message': 'Status must be active or inactive'}), 400
    if remark not in ('compulsory', 'core', 'elective', 'required'):
        return jsonify({'message': 'Category must be compulsory, core, elective or required'}), 400

    duplicate = Database.execute_query(
        '''SELECT id FROM course
           WHERE UPPER(TRIM(course_code)) = UPPER(TRIM(%s))
             AND UPPER(TRIM(department)) = UPPER(TRIM(%s))
             AND level::text = %s
             AND UPPER(TRIM(semester)) = UPPER(TRIM(%s))
           LIMIT 1''',
        (course_code, department_name, str(level), semester))
    if duplicate:
        return jsonify({'message': 'This course already exists for the selected level and semester'}), 409

    course_id = Database.execute_update(
        '''INSERT INTO course
             (course_code, course_title, unit, semester, department, level, status, remark)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
           RETURNING id''',
        (course_code, course_title, unit, semester, department_name, str(level), status, remark),
        return_id=True)
    if not course_id:
        return jsonify({'message': 'Failed to add course'}), 500

    return jsonify({
        'message': 'Course added successfully',
        'course': {
            'id': course_id,
            'course_code': course_code,
            'course_title': course_title,
            'credit_units': unit,
            'semester': semester,
            'level': level,
            'status': status,
            'remark': remark,
        },
    }), 201


@hod_bp.route('/staff', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('hod')
def get_department_staff(payload):
    """Return departmental staff and their course assignments for one period."""
    dept_id = _hod_dept(payload['user_id'])
    if not dept_id:
        return jsonify({'message': 'HOD department not configured'}), 403

    active_period = _active_period()
    if not active_period:
        return jsonify({'message': 'No active academic session and semester configured'}), 409
    session = active_period['session']
    semester = active_period['semester']

    staff_rows = Database.execute_query(
        '''SELECT s.id AS staff_record_id, u.id AS user_id,
                  u.firstname || ' ' || u.surname AS name,
                  u.email, u.status, s.staff_id, s.title,
                  LOWER(r.name) AS role
           FROM staff s
           JOIN users u ON u.id = s.user_id
           LEFT JOIN user_types ut ON ut.id = u.user_type_id
           LEFT JOIN roles r ON r.id = ut.role_id
           WHERE s.department_id = %s
           ORDER BY u.surname, u.firstname''',
        (dept_id,)) or []

    assignments = Database.execute_query(
        '''SELECT lc.id AS assignment_id, lc.lecturer_id AS staff_record_id,
                  c.id AS course_id, c.course_code, c.course_title,
                  c.unit AS credit_units, lc.session, lc.semester
           FROM lecturer_courses lc
           JOIN staff s ON s.id = lc.lecturer_id
           JOIN course c ON c.id = lc.course_id
           JOIN departments cd ON UPPER(TRIM(cd.name)) = UPPER(TRIM(c.department))
           WHERE s.department_id = %s
             AND cd.id = %s
             AND lc.session = %s
             AND lc.semester = %s
           ORDER BY c.course_code''',
        (dept_id, dept_id, session, semester)) or []

    by_staff = {}
    for assignment in assignments:
        item = dict(assignment)
        by_staff.setdefault(item['staff_record_id'], []).append(item)

    result = []
    for row in staff_rows:
        item = dict(row)
        item['assignments'] = by_staff.get(item['staff_record_id'], [])
        item['assignment_count'] = len(item['assignments'])
        result.append(item)

    return jsonify({'staff': result, 'active_period': active_period}), 200


@hod_bp.route('/assign-course', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.roles_required('hod')
def assign_course(payload):
    """Assign a departmental course to a lecturer, up to six per period."""
    dept_id = _hod_dept(payload['user_id'])
    if not dept_id:
        return jsonify({'message': 'HOD department not configured'}), 403

    data = request.get_json() or {}
    staff_id = data.get('staff_id')
    course_id = data.get('course_id')
    if not all([staff_id, course_id]):
        return jsonify({'message': 'staff_id and course_id are required'}), 400

    active_period = _active_period()
    if not active_period:
        return jsonify({'message': 'No active academic session and semester configured'}), 409
    session = active_period['session']
    semester = active_period['semester']

    conn = Database.get_connection()
    if not conn:
        return jsonify({'message': 'Database connection failed'}), 500

    try:
        with conn.cursor() as cur:
            cur.execute(
                '''SELECT s.id, s.department_id, s.user_id, LOWER(r.name) AS role
                   FROM staff s
                   JOIN users u ON u.id = s.user_id
                   LEFT JOIN user_types ut ON ut.id = u.user_type_id
                   LEFT JOIN roles r ON r.id = ut.role_id
                   WHERE s.id = %s
                   FOR UPDATE OF s''',
                (staff_id,))
            lecturer = cur.fetchone()
            if not lecturer:
                conn.rollback()
                return jsonify({'message': 'Staff member not found'}), 404
            if lecturer['department_id'] != dept_id:
                conn.rollback()
                return jsonify({'message': 'You can only assign staff in your department'}), 403
            if lecturer['role'] not in ('lecturer', 'hod'):
                conn.rollback()
                return jsonify({'message': 'Courses can only be assigned to lecturers or the HOD'}), 400
            if lecturer['role'] == 'hod' and str(lecturer['user_id']) != str(payload['user_id']):
                conn.rollback()
                return jsonify({'message': 'An HOD can only assign courses to themselves'}), 403

            cur.execute(
                '''SELECT c.id, d.id AS department_id
                   FROM course c
                   LEFT JOIN departments d
                     ON UPPER(TRIM(d.name)) = UPPER(TRIM(c.department))
                   WHERE c.id = %s AND c.status = 'active' ''',
                (course_id,))
            course = cur.fetchone()
            if not course:
                conn.rollback()
                return jsonify({'message': 'Course not found'}), 404
            if course['department_id'] != dept_id:
                conn.rollback()
                return jsonify({'message': 'You can only assign courses in your department'}), 403

            cur.execute(
                '''SELECT id FROM lecturer_courses
                   WHERE lecturer_id = %s AND course_id = %s
                     AND session = %s AND semester = %s''',
                (staff_id, course_id, session, semester))
            if cur.fetchone():
                conn.rollback()
                return jsonify({'message': 'This course is already assigned to the lecturer'}), 409

            cur.execute(
                '''SELECT COUNT(*) AS total FROM lecturer_courses
                   WHERE lecturer_id = %s AND session = %s AND semester = %s''',
                (staff_id, session, semester))
            assigned_count = cur.fetchone()['total']
            if assigned_count >= 6:
                conn.rollback()
                return jsonify({'message': 'A lecturer cannot be assigned more than 6 courses per semester'}), 400

            cur.execute(
                '''INSERT INTO lecturer_courses (lecturer_id, course_id, session, semester)
                   VALUES (%s, %s, %s, %s)''',
                (staff_id, course_id, session, semester))
        conn.commit()
        return jsonify({
            'message': 'Course assigned',
            'assignment_count': assigned_count + 1,
        }), 201
    except Exception as exc:
        conn.rollback()
        return jsonify({'message': str(exc)}), 500
    finally:
        Database.release_connection(conn)


@hod_bp.route('/assign-course', methods=['DELETE'])
@AuthHandler.token_required
@AuthHandler.roles_required('hod')
def unassign_course(payload):
    dept_id = _hod_dept(payload['user_id'])
    if not dept_id:
        return jsonify({'message': 'HOD department not configured'}), 403

    data = request.get_json() or {}
    assignment_id = data.get('assignment_id')
    if not assignment_id:
        return jsonify({'message': 'assignment_id is required'}), 400

    assignment = Database.execute_query(
        '''SELECT lc.id
           FROM lecturer_courses lc
           JOIN staff s ON s.id = lc.lecturer_id
           JOIN course c ON c.id = lc.course_id
           JOIN departments cd ON UPPER(TRIM(cd.name)) = UPPER(TRIM(c.department))
           WHERE lc.id = %s AND s.department_id = %s AND cd.id = %s''',
        (assignment_id, dept_id, dept_id))
    if not assignment:
        return jsonify({'message': 'Assignment not found in your department'}), 404

    Database.execute_update(
        'DELETE FROM lecturer_courses WHERE id = %s',
        (assignment_id,))
    return jsonify({'message': 'Assignment removed'}), 200


# ── POST /api/hod/scores/<id>/approve ────────────────────────────────────────
@hod_bp.route('/scores/<int:score_id>/approve', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.roles_required('hod', 'admin')
def approve_score(payload, score_id):
    user_id = payload['user_id']
    dept_id = _hod_dept(user_id)

    # Verify score belongs to this HOD's department
    score = Database.execute_query(
        '''SELECT ss.id, ss.status, d.id AS department_id FROM student_scores ss
           JOIN course c ON ss.course_id = c.id
           LEFT JOIN departments d ON UPPER(TRIM(d.name)) = UPPER(TRIM(c.department))
           WHERE ss.id = %s''',
        (score_id,))

    if not score:
        return jsonify({'message': 'Score not found'}), 404
    if score[0]['department_id'] != dept_id and payload.get('role') != 'admin':
        return jsonify({'message': 'Not in your department'}), 403
    if score[0]['status'] not in ('submitted', 'draft'):
        return jsonify({'message': 'Score already processed'}), 400

    Database.execute_update(
        '''UPDATE student_scores
           SET status='approved', approved_by=%s, approved_at=NOW()
           WHERE id=%s''',
        (user_id, score_id))

    Database.execute_update(
        '''INSERT INTO score_audit_log (score_id, changed_by, change_type)
           VALUES (%s,%s,'approve')''',
        (score_id, user_id))

    return jsonify({'message': 'Score approved'}), 200


# ── POST /api/hod/scores/<id>/reject ─────────────────────────────────────────
@hod_bp.route('/scores/<int:score_id>/reject', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.roles_required('hod', 'admin')
def reject_score(payload, score_id):
    user_id = payload['user_id']
    data    = request.get_json() or {}
    reason  = data.get('reason', '')

    Database.execute_update(
        "UPDATE student_scores SET status='draft' WHERE id=%s",
        (score_id,))

    Database.execute_update(
        '''INSERT INTO score_audit_log (score_id, changed_by, change_type, reason)
           VALUES (%s,%s,'reject',%s)''',
        (score_id, user_id, reason))

    return jsonify({'message': 'Score rejected and returned to draft'}), 200


# ── POST /api/hod/scores/bulk-approve ────────────────────────────────────────
@hod_bp.route('/scores/bulk-approve', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.roles_required('hod', 'admin')
def bulk_approve(payload):
    """Approve all submitted scores for a course+session+semester."""
    user_id  = payload['user_id']
    dept_id  = _hod_dept(user_id)
    data     = request.get_json()
    course_id = data.get('course_id')
    session   = data.get('session')
    semester  = data.get('semester')

    if not all([course_id, session, semester]):
        return jsonify({'message': 'course_id, session, semester required'}), 400

    # Get matching score IDs first for audit logging
    scores = Database.execute_query(
        '''SELECT ss.id FROM student_scores ss
           JOIN course c ON ss.course_id = c.id
           JOIN departments cd ON UPPER(TRIM(cd.name)) = UPPER(TRIM(c.department))
           WHERE ss.course_id=%s AND ss.session=%s AND ss.semester=%s
             AND ss.status='submitted'
             AND (cd.id=%s OR %s IS NULL)''',
        (course_id, session, semester, dept_id, dept_id))

    conn = Database.get_connection()
    if not conn:
        return jsonify({'message': 'DB error'}), 500
    try:
        with conn.cursor() as cur:
            for row in (scores or []):
                sid = row['id']
                cur.execute(
                    "UPDATE student_scores SET status='approved', approved_by=%s, approved_at=NOW() WHERE id=%s",
                    (user_id, sid))
                cur.execute(
                    "INSERT INTO score_audit_log (score_id, changed_by, change_type) VALUES (%s,%s,'approve')",
                    (sid, user_id))
        conn.commit()
        return jsonify({'message': f'{len(scores or [])} score(s) approved'}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({'message': str(e)}), 500
    finally:
        Database.release_connection(conn)
