"""routes/staff.py — Staff management endpoints (schema-aware rewrite).

Role resolution: users.user_type_id → user_types.role_id → roles.name
JWT role string  = roles.name.lower()  (e.g. 'ICTDirector' → 'ictdirector')
"""
from flask import Blueprint, request, jsonify
from database import Database
from utils.auth import AuthHandler

staff_bp = Blueprint('staff', __name__)

# ── Role name → DB role name mapping ─────────────────────────────────────────
# JWT role string (lowercase)  →  roles.name (as stored in DB)
ROLE_NAME_DB = {
    'admissionofficer': 'AdmissionOfficer',
    'pgadmin':          'PgAdmin',
    'pgdean':           'PgDean',
    'ptadmin':          'PtAdmin',
    'ictdirector':      'ICTDirector',
    'registrar':        'Registrar',
    'hod':              'HOD',
    'dean':             'Dean',
    'lecturer':         'Lecturer',
    'deo':              'DEO',
}

# All roles that can be created via the staff management UI
ALLOWED_STAFF_ROLES = tuple(ROLE_NAME_DB.keys())

# Roles that can query course/score-related staff endpoints
LECTURER_ROLES = ('lecturer', 'deo', 'hod', 'dean', 'registrar', 'ictdirector')


def _lookup_user_type_id(role_key: str):
    """Return the user_types.id integer for the given JWT role string, or None."""
    db_name = ROLE_NAME_DB.get(role_key)
    if not db_name:
        return None
    rows = Database.execute_query(
        '''SELECT ut.id FROM user_types ut
           JOIN roles r ON r.id = ut.role_id
           WHERE r.name = %s LIMIT 1''',
        (db_name,)
    )
    return rows[0]['id'] if rows else None


def _get_staff_profile(user_id):
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
@AuthHandler.roles_required('lecturer', 'deo', 'hod', 'dean', 'registrar', 'ictdirector')
def get_profile(payload):
    user_id = payload['user_id']
    user = Database.execute_query(
        '''SELECT u.id, u.firstname || ' ' || u.surname AS name,
                  u.email, u.username, r.name AS role
           FROM users u
           LEFT JOIN user_types ut ON ut.id = u.user_type_id
           LEFT JOIN roles r ON r.id = ut.role_id
           WHERE u.id = %s''',
        (user_id,))
    if not user:
        return jsonify({'message': 'User not found'}), 404
    staff = _get_staff_profile(user_id)
    return jsonify({'user': dict(user[0]), 'staff': dict(staff) if staff else None}), 200


# ── GET /api/staff/courses ─────────────────────────────────────────────────────
# Staff-owned lookup data for ICT staff management.
@staff_bp.route('/faculties', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('ictdirector')
def get_faculties(payload):
    faculties = Database.execute_query(
        'SELECT id, name FROM faculties ORDER BY name'
    )
    return jsonify({'faculties': [dict(f) for f in (faculties or [])]}), 200


@staff_bp.route('/departments', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('ictdirector')
def get_departments(payload):
    faculty_id = request.args.get('faculty_id')
    params = None
    query = '''
        SELECT d.id, d.name, d.faculty_id, f.name AS faculty_name
        FROM departments d
        LEFT JOIN faculties f ON f.id = d.faculty_id
    '''
    if faculty_id:
        query += ' WHERE d.faculty_id = %s'
        params = (faculty_id,)
    query += ' ORDER BY f.name, d.name'

    departments = Database.execute_query(query, params)
    return jsonify({'departments': [dict(d) for d in (departments or [])]}), 200


@staff_bp.route('/courses-list', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('ictdirector', 'hod')
def get_courses_list(payload):
    dept_id = request.args.get('department_id')
    params = None
    query = 'SELECT id, course_code, course_title FROM courses'
    if dept_id:
        query += ' WHERE department_id = %s'
        params = (dept_id,)
    query += ' ORDER BY course_code'

    courses = Database.execute_query(query, params)
    return jsonify({'courses': [dict(c) for c in (courses or [])]}), 200


@staff_bp.route('/courses', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required(*LECTURER_ROLES)
def get_assigned_courses(payload):
    """Return courses assigned to this lecturer for current session/semester."""
    user_id  = payload['user_id']
    session  = request.args.get('session')
    semester = request.args.get('semester')

    staff = _get_staff_profile(user_id)
    if not staff and payload.get('role') != 'ictdirector':
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
        '''SELECT st."Id" AS student_id, st."MatricNo" as matric_number,
                  u.firstname || ' ' || u.surname AS student_name,
                  ps.name AS program_name, l.name as current_level,
                  ss.id AS score_id, ss.ca_score, ss.exam_score,
                  ss.total_score, ss.grade, ss.status AS score_status
           FROM registered_courses rc
           JOIN course_registrations cr ON rc.registration_id = cr.id
           JOIN students st ON cr.student_id = st."Id"
           JOIN users u ON st."UserId" = u.id
           LEFT JOIN applications a ON a.user_id = u.id
           LEFT JOIN program_setup ps ON COALESCE(a.program_setup_id, 0) = ps.id OR (a.program_setup_id IS NULL AND a.degree_id = ps.degree_id)
           LEFT JOIN level l ON st.current_level_id = l.id
           LEFT JOIN student_scores ss
             ON ss.student_id = st."Id" AND ss.course_id = %s
            AND ss.session = cr.session AND ss.semester = cr.semester
           WHERE rc.course_id = %s
             AND (%s = '' OR cr.session = %s)
             AND (%s = '' OR cr.semester = %s)
           ORDER BY st."MatricNo"''',
        (course_id, course_id, session, session, semester, semester))

    return jsonify({'students': [dict(s) for s in (students or [])]}), 200


# ── GET /api/staff/list ────────────────────────────────────────────────────────
@staff_bp.route('/list', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('ictdirector', 'hod', 'dean', 'registrar')
def list_staff(payload):
    role_filter = request.args.get('role')      # JWT role string e.g. 'lecturer'
    dept_filter = request.args.get('department_id')

    query = '''
        SELECT u.id, u.firstname || ' ' || u.surname AS name,
               u.email, u.status, u.username,
               r.name AS role,
               s.id AS staff_record_id, s.staff_id, s.title,
               s.department_id, s.faculty_id,
               d.name AS department, f.name AS faculty
        FROM users u
        LEFT JOIN user_types ut ON ut.id = u.user_type_id
        LEFT JOIN roles r ON r.id = ut.role_id
        LEFT JOIN staff s ON s.user_id = u.id
        LEFT JOIN departments d ON s.department_id = d.id
        LEFT JOIN faculties f ON s.faculty_id = f.id
        WHERE r.name NOT IN (
          'FreshApplicant','Applicant','Student','Admitted',
          'UploadDocuments','Bursary','BursaryAdminDashboard','Health','Hostel'
        )
    '''
    params = []
    if role_filter:
        db_role_name = ROLE_NAME_DB.get(role_filter)
        if db_role_name:
            query += ' AND r.name = %s'; params.append(db_role_name)
    if dept_filter:
        query += ' AND s.department_id = %s'; params.append(dept_filter)
    query += ' ORDER BY r.name, u.surname, u.firstname'

    staff_list = Database.execute_query(query, tuple(params) if params else None)
    # Normalize role to lowercase JWT-style for frontend
    result = []
    for row in (staff_list or []):
        d = dict(row)
        if d.get('role'):
            d['role'] = d['role'].lower()
        result.append(d)
    return jsonify({'staff': result}), 200


# ── POST /api/staff/create (ICT Director only) ────────────────────────────────
@staff_bp.route('/create', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.roles_required('ictdirector')
def create_staff(payload):
    """Create a new staff user account + staff profile row."""
    data = request.get_json()
    required = ['name', 'email', 'password', 'role']
    if not all(k in data for k in required):
        return jsonify({'message': f'Required fields: {required}'}), 400

    role_key = data['role'].lower()
    if role_key not in ALLOWED_STAFF_ROLES:
        return jsonify({'message': f'Role must be one of: {list(ALLOWED_STAFF_ROLES)}'}), 400

    user_type_id = _lookup_user_type_id(role_key)
    if not user_type_id:
        return jsonify({'message': f'Role "{role_key}" not found in database'}), 500

    existing = Database.execute_query(
        'SELECT id FROM users WHERE email = %s', (data['email'],))
    if existing:
        return jsonify({'message': 'Email already registered'}), 409

    # Split name into firstname / surname (everything after first space = surname)
    full_name = data['name'].strip()
    parts = full_name.split(' ', 1)
    firstname = parts[0]
    surname   = parts[1] if len(parts) > 1 else ''

    pw_hash = AuthHandler.hash_password(data['password'])

    # Generate a simple username from email prefix
    import random
    base_username = data['email'].split('@')[0][:40]
    username = f"{base_username}{random.randint(1000, 9999)}"

    user_id = Database.execute_update(
        '''INSERT INTO users
             (firstname, surname, email, password_hash, phone_number,
              user_type_id, username, status)
           VALUES (%s, %s, %s, %s, %s, %s, %s, 'active')
           RETURNING id''',
        (firstname, surname, data['email'], pw_hash,
         data.get('phone_number', ''), user_type_id, username),
        return_id=True)

    if not user_id:
        return jsonify({'message': 'Failed to create user'}), 500

    # Create staff profile (department/faculty optional)
    Database.execute_update(
        '''INSERT INTO staff (user_id, staff_id, department_id, faculty_id, title)
           VALUES (%s, %s, %s, %s, %s)''',
        (user_id, data.get('staff_id'),
         data.get('department_id'), data.get('faculty_id'),
         data.get('title', '')))

    return jsonify({'message': 'Staff account created', 'user_id': str(user_id)}), 201


# ── PUT /api/staff/<id> (ICT Director only) ───────────────────────────────────
@staff_bp.route('/<user_id>', methods=['PUT'])
@AuthHandler.token_required
@AuthHandler.roles_required('ictdirector')
def update_staff(payload, user_id):
    data = request.get_json()

    if 'role' in data:
        new_role_key = data['role'].lower()
        new_user_type_id = _lookup_user_type_id(new_role_key)
        if not new_user_type_id:
            return jsonify({'message': f'Unknown role: {data["role"]}'}), 400
        Database.execute_update(
            'UPDATE users SET user_type_id = %s WHERE id = %s',
            (new_user_type_id, user_id))

    if 'status' in data:
        Database.execute_update(
            'UPDATE users SET status = %s WHERE id = %s',
            (data['status'], user_id))

    if any(k in data for k in ['department_id', 'faculty_id', 'title', 'staff_id']):
        # Upsert staff row — create if not exists, update if exists
        existing = Database.execute_query(
            'SELECT id FROM staff WHERE user_id = %s', (user_id,))
        if existing:
            Database.execute_update(
                '''UPDATE staff SET
                     department_id = COALESCE(%s, department_id),
                     faculty_id    = COALESCE(%s, faculty_id),
                     title         = COALESCE(%s, title),
                     staff_id      = COALESCE(%s, staff_id)
                   WHERE user_id = %s''',
                (data.get('department_id'), data.get('faculty_id'),
                 data.get('title'), data.get('staff_id'), user_id))
        else:
            Database.execute_update(
                '''INSERT INTO staff (user_id, staff_id, department_id, faculty_id, title)
                   VALUES (%s, %s, %s, %s, %s)''',
                (user_id, data.get('staff_id'), data.get('department_id'),
                 data.get('faculty_id'), data.get('title', '')))

    return jsonify({'message': 'Staff updated'}), 200


# ── POST /api/staff/assign-course ─────────────────────────────────────────────
@staff_bp.route('/assign-course', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.roles_required('ictdirector', 'hod')
def assign_course(payload):
    """Assign a lecturer to a course for a session/semester."""
    data      = request.get_json()
    staff_id_ = data.get('staff_id')       # staff table id (integer)
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
@AuthHandler.roles_required('ictdirector', 'hod')
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
