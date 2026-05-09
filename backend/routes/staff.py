"""routes/staff.py — Lecturer & DEO endpoints."""
from flask import Blueprint, request, jsonify
from database import Database
from utils.auth import AuthHandler

staff_bp = Blueprint('staff', __name__)

LECTURER_ROLES = ('lecturer', 'deo', 'admin')


def _get_staff(user_id):
    rows = Database.execute_query(
        '''SELECT s.id, s.staff_id, s.title, s.department_id, s.faculty_id,
                  d.name AS department, f.name AS faculty
           FROM staff s
           LEFT JOIN departments d ON s.department_id = d.id
           LEFT JOIN faculties f ON s.faculty_id = f.id
           WHERE s.user_id = %s''',
        (user_id,))
    return rows[0] if rows else None


# ── GET /api/staff/profile ─────────────────────────────────────────────────────
@staff_bp.route('/profile', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('lecturer', 'deo', 'hod', 'dean', 'registrar', 'admin')
def get_profile(payload):
    user_id = payload['user_id']
    user = Database.execute_query(
        'SELECT id, name, email, username, role FROM users WHERE id = %s', (user_id,))
    if not user:
        return jsonify({'message': 'User not found'}), 404
    staff = _get_staff(user_id)
    return jsonify({'user': dict(user[0]), 'staff': dict(staff) if staff else None}), 200


# ── GET /api/staff/courses ─────────────────────────────────────────────────────
@staff_bp.route('/courses', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required(*LECTURER_ROLES)
def get_assigned_courses(payload):
    """Return courses assigned to this lecturer for current session/semester."""
    user_id  = payload['user_id']
    session  = request.args.get('session')
    semester = request.args.get('semester')

    staff = _get_staff(user_id)
    if not staff and payload.get('role') != 'admin':
        return jsonify({'message': 'Staff profile not found'}), 403

    query = '''
        SELECT lc.id AS assignment_id, lc.session, lc.semester,
               c.id AS course_id, c.course_code, c.course_title, c.credit_units,
               d.name AS department,
               (SELECT COUNT(*) FROM registered_courses rc
                JOIN course_registrations cr ON rc.registration_id = cr.id
                WHERE rc.course_id = c.id
                  AND cr.semester = lc.semester) AS enrolled_count
        FROM lecturer_courses lc
        JOIN courses c ON lc.course_id = c.id
        LEFT JOIN departments d ON c.department_id = d.id
        WHERE lc.lecturer_id = %s
    '''
    params = [staff['id']]
    if session:
        query += ' AND lc.session = %s'; params.append(session)
    if semester:
        query += ' AND lc.semester = %s'; params.append(semester)
    query += ' ORDER BY lc.session DESC, c.course_code'

    courses = Database.execute_query(query, tuple(params))
    return jsonify({'courses': [dict(c) for c in (courses or [])]}), 200


# ── GET /api/staff/courses/<id>/students ──────────────────────────────────────
@staff_bp.route('/courses/<int:course_id>/students', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required(*LECTURER_ROLES)
def get_course_students(payload, course_id):
    """Return all students enrolled in a course, with existing scores if any."""
    session  = request.args.get('session', '')
    semester = request.args.get('semester', '')

    students = Database.execute_query(
        '''SELECT st.id AS student_id, st.matric_number, u.name AS student_name,
                  p.name AS program_name, st.current_level,
                  ss.id AS score_id, ss.ca_score, ss.exam_score,
                  ss.total_score, ss.grade, ss.status AS score_status
           FROM registered_courses rc
           JOIN course_registrations cr ON rc.registration_id = cr.id
           JOIN students st ON cr.student_id = st.id
           JOIN users u ON st.user_id = u.id
           JOIN programs p ON st.program_id = p.id
           LEFT JOIN student_scores ss
             ON ss.student_id = st.id AND ss.course_id = %s
            AND ss.session = cr.session AND ss.semester = cr.semester
           WHERE rc.course_id = %s
             AND (%s = '' OR cr.session = %s)
             AND (%s = '' OR cr.semester = %s)
           ORDER BY st.matric_number''',
        (course_id, course_id, session, session, semester, semester))

    return jsonify({'students': [dict(s) for s in (students or [])]}), 200


# ── GET /api/staff/list (admin only) ──────────────────────────────────────────
@staff_bp.route('/list', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('admin', 'hod', 'dean', 'registrar')
def list_staff(payload):
    role_filter = request.args.get('role')
    dept_filter = request.args.get('department_id')

    query = '''
        SELECT u.id, u.name, u.email, u.role, u.status,
               s.staff_id, s.title, s.department_id, s.faculty_id,
               d.name AS department, f.name AS faculty
        FROM users u
        LEFT JOIN staff s ON s.user_id = u.id
        LEFT JOIN departments d ON s.department_id = d.id
        LEFT JOIN faculties f ON s.faculty_id = f.id
        WHERE u.role NOT IN ('applicant','student')
    '''
    params = []
    if role_filter:
        query += ' AND u.role = %s'; params.append(role_filter)
    if dept_filter:
        query += ' AND s.department_id = %s'; params.append(dept_filter)
    query += ' ORDER BY u.role, u.name'

    staff_list = Database.execute_query(query, tuple(params) if params else None)
    return jsonify({'staff': [dict(s) for s in (staff_list or [])]}), 200


# ── POST /api/staff/create (admin only) ───────────────────────────────────────
@staff_bp.route('/create', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.roles_required('admin')
def create_staff(payload):
    """Create a new staff user account + staff profile."""
    data = request.get_json()
    required = ['name', 'email', 'password', 'role']
    if not all(k in data for k in required):
        return jsonify({'message': f'Required fields: {required}'}), 400

    allowed_roles = ('lecturer', 'deo', 'hod', 'dean', 'registrar', 'admin', 'admissionofficer')
    if data['role'] not in allowed_roles:
        return jsonify({'message': f'Role must be one of: {allowed_roles}'}), 400

    existing = Database.execute_query(
        'SELECT id FROM users WHERE email = %s', (data['email'],))
    if existing:
        return jsonify({'message': 'Email already registered'}), 409

    pw_hash = AuthHandler.hash_password(data['password'])
    user_id = Database.execute_update(
        '''INSERT INTO users (name, email, password_hash, phone_number, role, status)
           VALUES (%s,%s,%s,%s,%s,'active') RETURNING id''',
        (data['name'], data['email'], pw_hash,
         data.get('phone_number', ''), data['role']),
        return_id=True)

    if not user_id:
        return jsonify({'message': 'Failed to create user'}), 500

    # Create staff profile
    Database.execute_update(
        '''INSERT INTO staff (user_id, staff_id, department_id, faculty_id, title)
           VALUES (%s,%s,%s,%s,%s)''',
        (user_id, data.get('staff_id'),
         data.get('department_id'), data.get('faculty_id'),
         data.get('title', '')))

    return jsonify({'message': 'Staff account created', 'user_id': user_id}), 201


# ── PUT /api/staff/<id> (admin only) ──────────────────────────────────────────
@staff_bp.route('/<user_id>', methods=['PUT'])
@AuthHandler.token_required
@AuthHandler.roles_required('admin')
def update_staff(payload, user_id):
    data = request.get_json()

    if 'role' in data:
        Database.execute_update(
            'UPDATE users SET role = %s WHERE id = %s', (data['role'], user_id))
    if 'status' in data:
        Database.execute_update(
            'UPDATE users SET status = %s WHERE id = %s', (data['status'], user_id))
    if any(k in data for k in ['department_id', 'faculty_id', 'title', 'staff_id']):
        Database.execute_update(
            '''UPDATE staff SET
                 department_id = COALESCE(%s, department_id),
                 faculty_id    = COALESCE(%s, faculty_id),
                 title         = COALESCE(%s, title),
                 staff_id      = COALESCE(%s, staff_id)
               WHERE user_id = %s''',
            (data.get('department_id'), data.get('faculty_id'),
             data.get('title'), data.get('staff_id'), user_id))

    return jsonify({'message': 'Staff updated'}), 200


# ── POST /api/staff/assign-course ─────────────────────────────────────────────
@staff_bp.route('/assign-course', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.roles_required('admin', 'hod')
def assign_course(payload):
    """Assign a lecturer to a course for a session/semester."""
    data      = request.get_json()
    staff_id_ = data.get('staff_id')       # staff table id
    course_id = data.get('course_id')
    session   = data.get('session')
    semester  = data.get('semester')

    if not all([staff_id_, course_id, session, semester]):
        return jsonify({'message': 'staff_id, course_id, session, semester required'}), 400

    Database.execute_update(
        '''INSERT INTO lecturer_courses (lecturer_id, course_id, session, semester)
           VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING''',
        (staff_id_, course_id, session, semester))

    return jsonify({'message': 'Course assigned'}), 201


# ── DELETE /api/staff/assign-course ───────────────────────────────────────────
@staff_bp.route('/assign-course', methods=['DELETE'])
@AuthHandler.token_required
@AuthHandler.roles_required('admin', 'hod')
def unassign_course(payload):
    data      = request.get_json()
    staff_id_ = data.get('staff_id')
    course_id = data.get('course_id')
    session   = data.get('session')
    semester  = data.get('semester')

    Database.execute_update(
        '''DELETE FROM lecturer_courses
           WHERE lecturer_id=%s AND course_id=%s AND session=%s AND semester=%s''',
        (staff_id_, course_id, session, semester))
    return jsonify({'message': 'Assignment removed'}), 200
