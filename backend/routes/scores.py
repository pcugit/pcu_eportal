"""routes/scores.py — Shared score CRUD with grading + full audit trail."""
from flask import Blueprint, request, jsonify
from database import Database
from utils.auth import AuthHandler
from datetime import datetime

scores_bp = Blueprint('scores', __name__)

STAFF_ROLES = ('lecturer', 'deo', 'hod', 'admin')
WRITE_ROLES = ('lecturer', 'deo', 'admin')

# ── Grading helper ─────────────────────────────────────────────────────────────
def compute_grade(total: float):
    if total >= 70: return 'A', 5.0
    if total >= 60: return 'B', 4.0
    if total >= 50: return 'C', 3.0
    if total >= 45: return 'D', 2.0
    if total >= 40: return 'E', 1.0
    return 'F', 0.0


# ── POST /api/scores/enter ─────────────────────────────────────────────────────
@scores_bp.route('/enter', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.roles_required(*WRITE_ROLES)
def enter_scores(payload):
    """Enter or update CA + exam scores for a list of students in a course."""
    user_id = payload['user_id']
    data = request.get_json()

    course_id = data.get('course_id')
    session   = data.get('session')
    semester  = data.get('semester')
    entries   = data.get('scores', [])   # [{student_id, ca_score, exam_score}]

    if not course_id or not session or not semester or not entries:
        return jsonify({'message': 'course_id, session, semester, and scores are required'}), 400

    # For lecturer role: verify they're assigned to this course this session
    role = payload.get('role')
    if role == 'lecturer':
        staff = Database.execute_query(
            'SELECT id FROM staff WHERE user_id = %s', (user_id,))
        if not staff:
            return jsonify({'message': 'Staff profile not found'}), 403
        staff_id = staff[0]['id']
        assigned = Database.execute_query(
            '''SELECT id FROM lecturer_courses
               WHERE lecturer_id = %s AND course_id = %s
                 AND session = %s AND semester = %s''',
            (staff_id, course_id, session, semester))
        if not assigned:
            return jsonify({'message': 'You are not assigned to this course'}), 403

    conn = Database.get_connection()
    if not conn:
        return jsonify({'message': 'DB connection failed'}), 500

    results = {'saved': [], 'errors': []}
    try:
        with conn.cursor() as cur:
            for entry in entries:
                student_id = entry.get('student_id')
                ca    = float(entry.get('ca_score') or 0)
                exam  = float(entry.get('exam_score') or 0)
                total = round(ca + exam, 2)
                grade, gp = compute_grade(total)

                # Check if score row already exists
                cur.execute(
                    '''SELECT id, ca_score, exam_score FROM student_scores
                       WHERE student_id = %s AND course_id = %s
                         AND session = %s AND semester = %s''',
                    (student_id, course_id, session, semester))
                existing = cur.fetchone()

                if existing:
                    score_id = existing['id']
                    old_ca   = existing['ca_score']
                    old_exam = existing['exam_score']
                    cur.execute(
                        '''UPDATE student_scores
                           SET ca_score=%s, exam_score=%s, total_score=%s,
                               grade=%s, grade_point=%s, entered_by=%s,
                               updated_at=NOW()
                           WHERE id=%s''',
                        (ca, exam, total, grade, gp, user_id, score_id))
                    # Audit log
                    cur.execute(
                        '''INSERT INTO score_audit_log
                           (score_id, changed_by, change_type,
                            old_ca_score, new_ca_score, old_exam_score, new_exam_score)
                           VALUES (%s,%s,'update',%s,%s,%s,%s)''',
                        (score_id, user_id, old_ca, ca, old_exam, exam))
                else:
                    cur.execute(
                        '''INSERT INTO student_scores
                           (student_id, course_id, session, semester,
                            ca_score, exam_score, total_score,
                            grade, grade_point, entered_by, status)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'draft')
                           RETURNING id''',
                        (student_id, course_id, session, semester,
                         ca, exam, total, grade, gp, user_id))
                    score_id = cur.fetchone()['id']
                    cur.execute(
                        '''INSERT INTO score_audit_log
                           (score_id, changed_by, change_type, new_ca_score, new_exam_score)
                           VALUES (%s,%s,'create',%s,%s)''',
                        (score_id, user_id, ca, exam))

                results['saved'].append({'student_id': student_id, 'score_id': score_id})

        conn.commit()
        return jsonify({'message': f'{len(results["saved"])} score(s) saved', **results}), 200

    except Exception as e:
        conn.rollback()
        return jsonify({'message': f'Error saving scores: {e}'}), 500
    finally:
        Database.release_connection(conn)


# ── POST /api/scores/submit ────────────────────────────────────────────────────
@scores_bp.route('/submit', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.roles_required(*WRITE_ROLES)
def submit_scores(payload):
    """Mark all draft scores for a course+session+semester as 'submitted' for HOD approval."""
    user_id = payload['user_id']
    data    = request.get_json()
    course_id = data.get('course_id')
    session   = data.get('session')
    semester  = data.get('semester')

    if not all([course_id, session, semester]):
        return jsonify({'message': 'course_id, session and semester required'}), 400

    updated = Database.execute_update(
        '''UPDATE student_scores
           SET status='submitted', submitted_at=NOW()
           WHERE course_id=%s AND session=%s AND semester=%s AND status='draft'
             AND entered_by=%s''',
        (course_id, session, semester, user_id))

    return jsonify({'message': 'Scores submitted for HOD approval'}), 200


# ── GET /api/scores/course/<id> ────────────────────────────────────────────────
@scores_bp.route('/course/<int:course_id>', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required(*STAFF_ROLES)
def get_course_scores(payload, course_id):
    """Get all scores for a given course (optionally filtered by session/semester)."""
    session  = request.args.get('session')
    semester = request.args.get('semester')

    query = '''
        SELECT ss.id, ss.student_id, st."MatricNo" as matric_number,
               u.firstname || ' ' || u.surname AS student_name,
               ss.ca_score, ss.exam_score, ss.total_score,
               ss.grade, ss.grade_point, ss.status,
               ss.session, ss.semester,
               entered.firstname || ' ' || entered.surname AS entered_by_name,
               approved.firstname || ' ' || approved.surname AS approved_by_name
        FROM student_scores ss
        JOIN students st ON ss.student_id = st."Id"
        JOIN users u ON st."UserId" = u.id
        LEFT JOIN users entered ON ss.entered_by = entered.id
        LEFT JOIN users approved ON ss.approved_by = approved.id
        WHERE ss.course_id = %s
    '''
    params = [course_id]
    if session:
        query += ' AND ss.session = %s'; params.append(session)
    if semester:
        query += ' AND ss.semester = %s'; params.append(semester)
    query += ' ORDER BY st."MatricNo"'

    scores = Database.execute_query(query, tuple(params))
    return jsonify({'scores': [dict(s) for s in (scores or [])]}), 200


# ── GET /api/scores/student/<id> ───────────────────────────────────────────────
@scores_bp.route('/student/<int:student_id>', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('student', *STAFF_ROLES, 'registrar')
def get_student_scores(payload, student_id):
    """Get all approved scores for a student (transcript view)."""
    role    = payload['role']
    user_id = payload['user_id']

    # Students may only view their own results
    if role == 'student':
        me = Database.execute_query(
            'SELECT "Id" as id FROM students WHERE "UserId" = %s', (user_id,))
        if not me or me[0]['id'] != student_id:
            return jsonify({'message': 'Access denied'}), 403

    scores = Database.execute_query(
        '''SELECT ss.id, c.course_code, c.course_title, c.unit AS credit_units,
                  ss.ca_score, ss.exam_score, ss.total_score,
                  ss.grade, ss.grade_point, ss.status,
                  ss.session, ss.semester
           FROM student_scores ss
           JOIN course c ON ss.course_id = c.id
           WHERE ss.student_id = %s
           ORDER BY ss.session, ss.semester, c.course_code''',
        (student_id,))

    return jsonify({'scores': [dict(s) for s in (scores or [])]}), 200


# ── GET /api/scores/audit/<score_id> ──────────────────────────────────────────
@scores_bp.route('/audit/<int:score_id>', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('hod', 'dean', 'registrar', 'admin')
def get_score_audit(payload, score_id):
    """Return full audit trail for a score record."""
    logs = Database.execute_query(
        '''SELECT sal.id, sal.change_type, sal.old_ca_score, sal.new_ca_score,
                  sal.old_exam_score, sal.new_exam_score, sal.reason,
                  sal.changed_at, u.name AS changed_by_name, u.role AS changed_by_role
           FROM score_audit_log sal
           JOIN users u ON sal.changed_by = u.id
           WHERE sal.score_id = %s
           ORDER BY sal.changed_at''',
        (score_id,))
    return jsonify({'audit_log': [dict(l) for l in (logs or [])]}), 200
