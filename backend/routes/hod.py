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
           JOIN courses c ON ss.course_id = c.id
           WHERE c.department_id = %s AND ss.status = 'submitted' ''', (dept_id,))

    # Courses in dept
    courses = Database.execute_query(
        'SELECT COUNT(*) AS total FROM courses WHERE department_id = %s', (dept_id,))

    dept_info = Database.execute_query(
        'SELECT name FROM departments WHERE id = %s', (dept_id,))

    return jsonify({
        'department': dict(dept_info[0]) if dept_info else {},
        'total_students': students[0]['total'] if students else 0,
        'pending_approvals': pending[0]['total'] if pending else 0,
        'total_courses': courses[0]['total'] if courses else 0,
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
        JOIN courses c ON ss.course_id = c.id
        LEFT JOIN users entered ON ss.entered_by = entered.id
        LEFT JOIN user_types ut ON entered.user_type_id = ut.id
        LEFT JOIN roles r ON ut.role_id = r.id
        WHERE c.department_id = %s
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
        '''SELECT c.id, c.course_code, c.course_title, c.credit_units,
                  c.remark, l.name as lecturer,
                  COALESCE(lc_staff.name,'Unassigned') AS assigned_lecturer
           FROM courses c
           LEFT JOIN staff st ON c.lecturer_id = st.id
           LEFT JOIN users l ON st.user_id = l.id
           LEFT JOIN (
               SELECT lc.course_id, u.name
               FROM lecturer_courses lc
               JOIN staff s ON lc.lecturer_id = s.id
               JOIN users u ON s.user_id = u.id
               ORDER BY lc.id DESC
           ) lc_staff ON lc_staff.course_id = c.id
           WHERE c.department_id = %s
           ORDER BY c.course_code''',
        (dept_id,))

    return jsonify({'courses': [dict(c) for c in (courses or [])]}), 200


# ── POST /api/hod/scores/<id>/approve ────────────────────────────────────────
@hod_bp.route('/scores/<int:score_id>/approve', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.roles_required('hod', 'admin')
def approve_score(payload, score_id):
    user_id = payload['user_id']
    dept_id = _hod_dept(user_id)

    # Verify score belongs to this HOD's department
    score = Database.execute_query(
        '''SELECT ss.id, ss.status, c.department_id FROM student_scores ss
           JOIN courses c ON ss.course_id = c.id WHERE ss.id = %s''',
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
           JOIN courses c ON ss.course_id = c.id
           WHERE ss.course_id=%s AND ss.session=%s AND ss.semester=%s
             AND ss.status='submitted'
             AND (c.department_id=%s OR %s IS NULL)''',
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
