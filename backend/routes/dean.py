"""routes/dean.py — Dean: faculty-wide read-only results overview."""
from flask import Blueprint, request, jsonify
from database import Database
from utils.auth import AuthHandler

dean_bp = Blueprint('dean', __name__)


def _dean_faculty(user_id):
    rows = Database.execute_query(
        'SELECT faculty_id FROM staff WHERE user_id = %s', (user_id,))
    return rows[0]['faculty_id'] if rows else None


@dean_bp.route('/dashboard', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('dean', 'admin')
def dashboard(payload):
    faculty_id = _dean_faculty(payload['user_id'])
    if not faculty_id:
        return jsonify({'message': 'Dean faculty not configured'}), 403

    # Departments in faculty
    depts = Database.execute_query(
        'SELECT id, name FROM departments WHERE faculty_id = %s', (faculty_id,))

    # Students per dept
    stats = []
    for dept in (depts or []):
        s = Database.execute_query(
            '''SELECT COUNT(*) AS students FROM students st
               WHERE LOWER(st.department) = (SELECT LOWER(name) FROM departments WHERE id = %s)''', (dept['id'],))
        pending = Database.execute_query(
            '''SELECT COUNT(*) AS cnt FROM student_scores ss
               JOIN course c ON ss.course_id = c.id
               JOIN departments cd ON UPPER(TRIM(cd.name)) = UPPER(TRIM(c.department))
               WHERE cd.id = %s AND ss.status='submitted' ''', (dept['id'],))
        stats.append({
            'department_id': dept['id'],
            'department': dept['name'],
            'students': s[0]['students'] if s else 0,
            'pending_approvals': pending[0]['cnt'] if pending else 0,
        })

    faculty_info = Database.execute_query(
        'SELECT name FROM faculties WHERE id = %s', (faculty_id,))

    return jsonify({
        'faculty': dict(faculty_info[0]) if faculty_info else {},
        'departments': stats,
    }), 200


@dean_bp.route('/results', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('dean', 'admin')
def get_faculty_results(payload):
    """Read-only view of all results across all departments in the faculty."""
    faculty_id = _dean_faculty(payload['user_id'])
    if not faculty_id:
        return jsonify({'message': 'Dean faculty not configured'}), 403

    session     = request.args.get('session', '')
    semester    = request.args.get('semester', '')
    dept_filter = request.args.get('department_id', '')
    status      = request.args.get('status', 'approved')

    query = '''
        SELECT ss.id, st."MatricNo" as matric_number, u.firstname || ' ' || u.surname AS student_name,
               l.name as current_level, d.name AS department,
               c.course_code, c.course_title,
               ss.ca_score, ss.exam_score, ss.total_score,
               ss.grade, ss.grade_point, ss.status,
               ss.session, ss.semester
        FROM student_scores ss
        JOIN students st ON ss.student_id = st."Id"
        JOIN users u ON st."UserId" = u.id
        LEFT JOIN level l ON st.current_level_id = l.id
        JOIN course c ON ss.course_id = c.id
        JOIN departments d ON UPPER(TRIM(d.name)) = UPPER(TRIM(c.department))
        WHERE d.faculty_id = %s
    '''
    params = [faculty_id]
    if session:
        query += ' AND ss.session = %s'; params.append(session)
    if semester:
        query += ' AND ss.semester = %s'; params.append(semester)
    if dept_filter:
        query += ' AND d.id = %s'; params.append(dept_filter)
    if status:
        query += ' AND ss.status = %s'; params.append(status)
    query += ' ORDER BY d.name, st."MatricNo", c.course_code'

    results = Database.execute_query(query, tuple(params))
    return jsonify({'results': [dict(r) for r in (results or [])]}), 200


@dean_bp.route('/gpa-summary', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('dean', 'admin')
def gpa_summary(payload):
    """GPA distribution per department for a given session."""
    faculty_id = _dean_faculty(payload['user_id'])
    if not faculty_id:
        return jsonify({'message': 'Dean faculty not configured'}), 403

    session  = request.args.get('session', '')
    semester = request.args.get('semester', '')

    query = '''
        SELECT d.name AS department,
               ss.grade,
               COUNT(*) AS count
        FROM student_scores ss
        JOIN course c ON ss.course_id = c.id
        JOIN departments d ON UPPER(TRIM(d.name)) = UPPER(TRIM(c.department))
        WHERE d.faculty_id = %s AND ss.status = 'approved'
    '''
    params = [faculty_id]
    if session:
        query += ' AND ss.session = %s'; params.append(session)
    if semester:
        query += ' AND ss.semester = %s'; params.append(semester)
    query += ' GROUP BY d.name, ss.grade ORDER BY d.name, ss.grade'

    summary = Database.execute_query(query, tuple(params))
    return jsonify({'gpa_summary': [dict(r) for r in (summary or [])]}), 200
