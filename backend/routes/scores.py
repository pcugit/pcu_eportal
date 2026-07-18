"""routes/scores.py — Shared score CRUD with grading + full audit trail."""
from flask import Blueprint, request, jsonify
from database import Database
from utils.auth import AuthHandler
from datetime import datetime
import json
from routes.results import _ensure_result_schema, _tables

scores_bp = Blueprint('scores', __name__)

STAFF_ROLES = ('lecturer', 'deo', 'hod', 'admin')
WRITE_ROLES = ('lecturer', 'deo', 'hod', 'admin')

# ── Grading helper ─────────────────────────────────────────────────────────────
def compute_grade(total: float):
    if total >= 70: return 'A', 5.0
    if total >= 60: return 'B', 4.0
    if total >= 50: return 'C', 3.0
    if total >= 45: return 'D', 2.0
    if total >= 40: return 'E', 1.0
    return 'F', 0.0


def _ensure_score_schema():
    Database.execute_update("ALTER TABLE student_scores ADD COLUMN IF NOT EXISTS entered_by UUID")
    Database.execute_update("ALTER TABLE student_scores ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP")
    Database.execute_update("ALTER TABLE student_scores ADD COLUMN IF NOT EXISTS grade_point NUMERIC")
    Database.execute_update('''
        CREATE TABLE IF NOT EXISTS score_audit_log (
            id SERIAL PRIMARY KEY,
            score_id INTEGER NOT NULL,
            changed_by UUID,
            change_type VARCHAR(50),
            old_ca_score NUMERIC,
            new_ca_score NUMERIC,
            old_exam_score NUMERIC,
            new_exam_score NUMERIC,
            reason TEXT,
            changed_at TIMESTAMP DEFAULT NOW()
        )
    ''')
    Database.execute_update("ALTER TABLE score_audit_log ADD COLUMN IF NOT EXISTS course_source VARCHAR(10) NOT NULL DEFAULT 'ug'")
    Database.execute_update("ALTER TABLE score_audit_log ADD COLUMN IF NOT EXISTS amendment_request_id INTEGER")
    Database.execute_update('''
        CREATE TABLE IF NOT EXISTS score_amendment_requests (
            id SERIAL PRIMARY KEY,
            course_source VARCHAR(10) NOT NULL,
            score_id INTEGER NOT NULL,
            student_id INTEGER NOT NULL,
            course_id INTEGER NOT NULL,
            session VARCHAR(50) NOT NULL,
            semester VARCHAR(50) NOT NULL,
            old_ca_score NUMERIC,
            old_exam_score NUMERIC,
            proposed_ca_score NUMERIC NOT NULL,
            proposed_exam_score NUMERIC NOT NULL,
            reason TEXT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            requested_by UUID NOT NULL,
            requested_at TIMESTAMP DEFAULT NOW(),
            reviewed_by UUID,
            reviewed_at TIMESTAMP,
            review_note TEXT
        )
    ''')
    Database.execute_update('''
        CREATE UNIQUE INDEX IF NOT EXISTS score_amendment_one_pending
        ON score_amendment_requests (course_source, score_id)
        WHERE status = 'pending'
    ''')
    Database.execute_update('''
        CREATE TABLE IF NOT EXISTS pg_student_scores (
            id SERIAL PRIMARY KEY,
            student_id INTEGER NOT NULL,
            course_id INTEGER NOT NULL,
            session VARCHAR(50) NOT NULL,
            semester VARCHAR(50) NOT NULL,
            ca_score NUMERIC,
            exam_score NUMERIC,
            total_score NUMERIC,
            grade VARCHAR(10),
            grade_point NUMERIC,
            status VARCHAR(50) DEFAULT 'draft',
            entered_by UUID,
            submitted_at TIMESTAMP,
            approved_by UUID,
            approved_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    ''')
    Database.execute_update('''
        CREATE UNIQUE INDEX IF NOT EXISTS pg_student_scores_unique
        ON pg_student_scores (student_id, course_id, session, semester)
    ''')


def _staff_id_for_user(user_id):
    staff = Database.execute_query('SELECT id FROM staff WHERE user_id = %s', (user_id,))
    return staff[0]['id'] if staff else None


def _score_table(course_source):
    return 'pg_student_scores' if course_source == 'pg' else 'student_scores'


def _processor_source(role):
    if role in ('pgadmin', 'pgdean'):
        return 'pg'
    if role in ('admin', 'ictdirector'):
        return 'ug'
    return None


# ── POST /api/scores/enter ─────────────────────────────────────────────────────
@scores_bp.route('/enter', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.roles_required(*WRITE_ROLES)
def enter_scores(payload):
    """Enter or update CA + exam scores for a list of students in a course."""
    _ensure_score_schema()
    user_id = payload['user_id']
    data = request.get_json()

    course_id = data.get('course_id')
    session   = data.get('session')
    semester  = data.get('semester')
    course_source = data.get('course_source', 'ug')
    entries   = data.get('scores', [])   # [{student_id, ca_score, exam_score}]

    if course_source not in ('ug', 'pg'):
        return jsonify({'message': 'course_source must be ug or pg'}), 400
    if not course_id or not session or not semester or not entries:
        return jsonify({'message': 'course_id, session, semester, and scores are required'}), 400

    staff_id = _staff_id_for_user(user_id)
    role = payload.get('role')
    if role in ('lecturer', 'hod', 'deo'):
        if not staff_id:
            return jsonify({'message': 'Staff profile not found'}), 403
        assigned = Database.execute_query(
            '''SELECT id FROM lecturer_courses
               WHERE lecturer_id = %s AND course_id = %s
                 AND session = %s AND semester = %s
                 AND COALESCE(course_source, 'ug') = %s''',
            (staff_id, course_id, session, semester, course_source))
        if not assigned:
            return jsonify({'message': 'You are not assigned to this course'}), 403

    conn = Database.get_connection()
    if not conn:
        return jsonify({'message': 'DB connection failed'}), 500

    results = {'saved': [], 'errors': []}
    table = _score_table(course_source)
    try:
        with conn.cursor() as cur:
            for entry in entries:
                student_id = entry.get('student_id')
                registered_params = (student_id, course_id, course_source, session, semester)
                cur.execute(
                    '''SELECT rc.id
                       FROM registered_courses rc
                       JOIN course_registrations cr ON cr.id = rc.registration_id
                       WHERE cr.student_id = %s
                         AND rc.course_id = %s
                         AND COALESCE(rc.course_source, 'ug') = %s
                         AND cr.session = %s
                         AND cr.semester = %s
                       LIMIT 1''',
                    registered_params)
                if not cur.fetchone():
                    results['errors'].append({'student_id': student_id, 'message': 'Student is not registered for this course'})
                    continue

                ca_raw = entry.get('ca_score')
                exam_raw = entry.get('exam_score')
                try:
                    ca = None if ca_raw in (None, '') else float(ca_raw)
                    exam = None if exam_raw in (None, '') else float(exam_raw)
                except (TypeError, ValueError):
                    results['errors'].append({'student_id': student_id, 'message': 'CA and exam must be numeric values'})
                    continue
                if ca is not None and (ca < 0 or ca > 30):
                    results['errors'].append({'student_id': student_id, 'message': 'CA score must be between 0 and 30'})
                    continue
                if exam is not None and (exam < 0 or exam > 70):
                    results['errors'].append({'student_id': student_id, 'message': 'Exam score must be between 0 and 70'})
                    continue
                total = round(ca + exam, 2) if ca is not None and exam is not None else None
                grade, gp = compute_grade(total) if total is not None else (None, None)

                # Check if score row already exists
                cur.execute(
                    f'''SELECT id, ca_score, exam_score, status FROM {table}
                       WHERE student_id = %s AND course_id = %s
                         AND session = %s AND semester = %s''',
                    (student_id, course_id, session, semester))
                existing = cur.fetchone()

                if existing:
                    score_id = existing['id']
                    old_ca   = existing['ca_score']
                    old_exam = existing['exam_score']
                    if existing['status'] in ('submitted', 'approved'):
                        old_ca_value = None if old_ca is None else float(old_ca)
                        old_exam_value = None if old_exam is None else float(old_exam)
                        scores_unchanged = old_ca_value == ca and old_exam_value == exam
                        if scores_unchanged:
                            results['saved'].append({'student_id': student_id, 'score_id': score_id})
                        else:
                            results['errors'].append({
                                'student_id': student_id,
                                'message': f'{existing["status"].title()} scores cannot be edited',
                            })
                        continue
                    cur.execute(
                        f'''UPDATE {table}
                           SET ca_score=%s, exam_score=%s, total_score=%s,
                               grade=%s, grade_point=%s, entered_by=%s,
                               updated_at=NOW()
                           WHERE id=%s''',
                        (ca, exam, total, grade, gp, user_id, score_id))
                    # Audit log
                    cur.execute(
                        '''INSERT INTO score_audit_log
                           (score_id, course_source, changed_by, change_type,
                            old_ca_score, new_ca_score, old_exam_score, new_exam_score)
                           VALUES (%s,%s,%s,'update',%s,%s,%s,%s)''',
                        (score_id, course_source, user_id, old_ca, ca, old_exam, exam))
                else:
                    cur.execute(
                        f'''INSERT INTO {table}
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
                           (score_id, course_source, changed_by, change_type, new_ca_score, new_exam_score)
                           VALUES (%s,%s,%s,'create',%s,%s)''',
                        (score_id, course_source, user_id, ca, exam))

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
    """Submit manually entered scores to the correct result processor queue."""
    _ensure_score_schema()
    user_id = payload['user_id']
    data    = request.get_json() or {}
    course_id = data.get('course_id')
    session   = data.get('session')
    semester  = data.get('semester')
    course_source = data.get('course_source', 'ug')
    submission = data.get('submission') or {}
    submission_payload = submission.get('payload')

    if course_source not in ('ug', 'pg'):
        return jsonify({'message': 'course_source must be ug or pg'}), 400
    if not all([course_id, session, semester]):
        return jsonify({'message': 'course_id, session and semester required'}), 400
    if not isinstance(submission_payload, list) or not submission_payload:
        return jsonify({'message': 'A processor-ready result payload is required'}), 400

    for student_result in submission_payload:
        for course_result in student_result.get('courses') or []:
            try:
                ca = float(course_result.get('ca'))
                exam = float(course_result.get('exam'))
            except (TypeError, ValueError):
                return jsonify({'message': 'Every submitted result requires numeric CA and exam scores'}), 400
            if ca < 0 or ca > 30:
                return jsonify({'message': 'CA score must be between 0 and 30'}), 400
            if exam < 0 or exam > 70:
                return jsonify({'message': 'Exam score must be between 0 and 70'}), 400

    table = _score_table(course_source)
    staff_id = _staff_id_for_user(user_id)
    if not staff_id:
        return jsonify({'message': 'Staff profile not found'}), 403

    _ensure_result_schema(course_source == 'pg')
    pending_table = _tables(course_source == 'pg')['pending']
    file_name = submission.get('fileName') or 'Manual score entry'
    sheet_name = submission.get('sheetName') or f'{course_id}-{session}-{semester}-manual'
    course_code = submission.get('courseCode')

    conn = Database.get_connection()
    if not conn:
        return jsonify({'message': 'DB connection failed'}), 500
    try:
        with conn.cursor() as cur:
            cur.execute(
                f'''SELECT id, student_id, ca_score, exam_score, status
                    FROM {table}
                    WHERE course_id=%s AND session=%s AND semester=%s
                      AND entered_by=%s''',
                (course_id, session, semester, user_id))
            saved_scores = cur.fetchall()
            if not saved_scores:
                raise ValueError('No saved scores were found for this course submission')
            already_locked = next((row for row in saved_scores if row['status'] != 'draft'), None)
            if already_locked:
                raise ValueError(f'Score for student ID {already_locked["student_id"]} has already been submitted')
            incomplete = next((row for row in saved_scores if row['ca_score'] is None or row['exam_score'] is None), None)
            if incomplete:
                raise ValueError(f'CA and exam scores are required for student ID {incomplete["student_id"]}')
            invalid = next((
                row for row in saved_scores
                if float(row['ca_score']) < 0 or float(row['ca_score']) > 30
                or float(row['exam_score']) < 0 or float(row['exam_score']) > 70
            ), None)
            if invalid:
                raise ValueError(f'Invalid CA or exam score found for student ID {invalid["student_id"]}')

            cur.execute(
                f'''UPDATE {table}
                    SET status='submitted', submitted_at=NOW()
                    WHERE course_id=%s AND session=%s AND semester=%s
                      AND entered_by=%s AND status='draft' ''',
                (course_id, session, semester, user_id))
            for saved_score in saved_scores:
                cur.execute(
                    '''INSERT INTO score_audit_log
                         (score_id, course_source, changed_by, change_type,
                          old_ca_score, new_ca_score, old_exam_score, new_exam_score)
                       VALUES (%s,%s,%s,'submit',%s,%s,%s,%s)''',
                    (saved_score['id'], course_source, user_id,
                     saved_score['ca_score'], saved_score['ca_score'],
                     saved_score['exam_score'], saved_score['exam_score']))
            cur.execute(
                f'''SELECT id FROM {pending_table}
                    WHERE staff_id=%s AND course_code=%s AND sheet_name=%s
                      AND status='pending'
                    ORDER BY id DESC LIMIT 1''',
                (staff_id, course_code, sheet_name))
            existing = cur.fetchone()
            payload_json = __import__('json').dumps(submission_payload)
            if existing:
                cur.execute(
                    f'''UPDATE {pending_table}
                        SET file_name=%s, payload=%s::jsonb, file_content=NULL,
                            created_at=NOW()
                        WHERE id=%s''',
                    (file_name, payload_json, existing['id']))
                pending_id = existing['id']
            else:
                cur.execute(
                    f'''INSERT INTO {pending_table}
                          (staff_id, file_name, sheet_name, course_code, payload, status, file_content)
                        VALUES (%s, %s, %s, %s, %s::jsonb, 'pending', NULL)
                        RETURNING id''',
                    (staff_id, file_name, sheet_name, course_code, payload_json))
                pending_id = cur.fetchone()['id']

        conn.commit()
        processor = 'PG Admin' if course_source == 'pg' else 'ICT'
        return jsonify({
            'message': f'Scores submitted to {processor} for processing',
            'pending_id': pending_id,
        }), 200
    except Exception as exc:
        conn.rollback()
        return jsonify({'message': str(exc)}), 400
    finally:
        Database.release_connection(conn)


@scores_bp.route('/amendments', methods=['GET', 'POST'])
@AuthHandler.token_required
@AuthHandler.roles_required('lecturer', 'deo', 'hod', 'admin', 'ictdirector', 'pgadmin', 'pgdean')
def score_amendments(payload):
    """Create correction requests or list requests visible to the current role."""
    _ensure_score_schema()
    user_id = payload['user_id']
    role = payload.get('role')

    if request.method == 'GET':
        query = '''
            SELECT ar.*,
                   st."MatricNo" AS matric_number,
                   COALESCE(NULLIF(TRIM(COALESCE(su.firstname, '') || ' ' || COALESCE(su.surname, '')), ''), st."MatricNo") AS student_name,
                   NULLIF(TRIM(COALESCE(ru.firstname, '') || ' ' || COALESCE(ru.surname, '')), '') AS requested_by_name,
                   NULLIF(TRIM(COALESCE(vu.firstname, '') || ' ' || COALESCE(vu.surname, '')), '') AS reviewed_by_name,
                   COALESCE(c.course_code, pc.course_code) AS course_code,
                   COALESCE(c.course_title, pc.course_title) AS course_title
            FROM score_amendment_requests ar
            JOIN students st ON st."Id" = ar.student_id
            LEFT JOIN users su ON su.id = st."UserId"
            LEFT JOIN users ru ON ru.id = ar.requested_by
            LEFT JOIN users vu ON vu.id = ar.reviewed_by
            LEFT JOIN course c ON ar.course_source = 'ug' AND c.id = ar.course_id
            LEFT JOIN pg_courses pc ON ar.course_source = 'pg' AND pc.id = ar.course_id
            WHERE 1=1
        '''
        params = []
        processor_source = _processor_source(role)
        if processor_source:
            query += ' AND ar.course_source = %s'
            params.append(processor_source)
        else:
            query += ' AND ar.requested_by = %s'
            params.append(user_id)
        status = request.args.get('status')
        if status:
            query += ' AND ar.status = %s'
            params.append(status)
        query += ' ORDER BY ar.requested_at DESC, ar.id DESC'
        rows = Database.execute_query(query, tuple(params))
        return jsonify({'amendments': [dict(row) for row in (rows or [])]}), 200

    if role not in ('lecturer', 'deo', 'hod'):
        return jsonify({'message': 'Only teaching staff can request score corrections'}), 403

    data = request.get_json() or {}
    course_source = data.get('course_source', 'ug')
    score_id = data.get('score_id')
    reason = str(data.get('reason') or '').strip()
    if course_source not in ('ug', 'pg') or not score_id:
        return jsonify({'message': 'score_id and a valid course_source are required'}), 400
    if len(reason) < 5:
        return jsonify({'message': 'A correction reason of at least 5 characters is required'}), 400
    try:
        proposed_ca = float(data.get('proposed_ca_score'))
        proposed_exam = float(data.get('proposed_exam_score'))
    except (TypeError, ValueError):
        return jsonify({'message': 'Proposed CA and exam scores must be numeric'}), 400
    if proposed_ca < 0 or proposed_ca > 30:
        return jsonify({'message': 'CA score must be between 0 and 30'}), 400
    if proposed_exam < 0 or proposed_exam > 70:
        return jsonify({'message': 'Exam score must be between 0 and 70'}), 400

    table = _score_table(course_source)
    rows = Database.execute_query(
        f'''SELECT id, student_id, course_id, session, semester,
                   ca_score, exam_score, status, entered_by
            FROM {table}
            WHERE id = %s''',
        (score_id,))
    if not rows:
        return jsonify({'message': 'Score record not found'}), 404
    score = rows[0]
    if str(score['entered_by']) != str(user_id):
        return jsonify({'message': 'You can only request corrections for scores you submitted'}), 403
    if score['status'] not in ('submitted', 'approved'):
        return jsonify({'message': 'Only submitted or approved scores require a correction request'}), 400
    old_ca = float(score['ca_score'])
    old_exam = float(score['exam_score'])
    if old_ca == proposed_ca and old_exam == proposed_exam:
        return jsonify({'message': 'The proposed scores are unchanged'}), 400

    conn = Database.get_connection()
    if not conn:
        return jsonify({'message': 'Database connection failed'}), 500
    try:
        with conn.cursor() as cur:
            cur.execute(
                '''INSERT INTO score_amendment_requests
                     (course_source, score_id, student_id, course_id, session, semester,
                      old_ca_score, old_exam_score, proposed_ca_score, proposed_exam_score,
                      reason, requested_by)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   RETURNING id''',
                (course_source, score_id, score['student_id'], score['course_id'],
                 score['session'], score['semester'], old_ca, old_exam,
                 proposed_ca, proposed_exam, reason, user_id))
            amendment_id = cur.fetchone()['id']
            cur.execute(
                '''INSERT INTO score_audit_log
                     (score_id, course_source, amendment_request_id, changed_by, change_type,
                      old_ca_score, new_ca_score, old_exam_score, new_exam_score, reason)
                   VALUES (%s,%s,%s,%s,'amendment_requested',%s,%s,%s,%s,%s)''',
                (score_id, course_source, amendment_id, user_id, old_ca, proposed_ca,
                 old_exam, proposed_exam, reason))
        conn.commit()
        processor = 'PG Admin' if course_source == 'pg' else 'ICT'
        return jsonify({'message': f'Correction request sent to {processor}', 'amendment_id': amendment_id}), 201
    except Exception as exc:
        conn.rollback()
        if 'score_amendment_one_pending' in str(exc):
            return jsonify({'message': 'A correction request is already pending for this score'}), 409
        return jsonify({'message': str(exc)}), 400
    finally:
        Database.release_connection(conn)


@scores_bp.route('/amendments/<int:amendment_id>/review', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.roles_required('admin', 'ictdirector', 'pgadmin', 'pgdean')
def review_score_amendment(payload, amendment_id):
    """Approve or reject a correction request and synchronize official result stores."""
    _ensure_score_schema()
    user_id = payload['user_id']
    allowed_source = _processor_source(payload.get('role'))
    data = request.get_json() or {}
    decision = str(data.get('decision') or '').lower()
    review_note = str(data.get('review_note') or '').strip()
    if decision not in ('approved', 'rejected'):
        return jsonify({'message': 'decision must be approved or rejected'}), 400
    if decision == 'rejected' and len(review_note) < 3:
        return jsonify({'message': 'A rejection note is required'}), 400
    _ensure_result_schema(allowed_source == 'pg')

    conn = Database.get_connection()
    if not conn:
        return jsonify({'message': 'Database connection failed'}), 500
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT * FROM score_amendment_requests WHERE id=%s FOR UPDATE', (amendment_id,))
            amendment = cur.fetchone()
            if not amendment:
                raise LookupError('Correction request not found')
            if amendment['course_source'] != allowed_source:
                raise PermissionError('This correction request belongs to another result processor')
            if amendment['status'] != 'pending':
                raise ValueError('This correction request has already been reviewed')

            source = amendment['course_source']
            table = _score_table(source)
            if decision == 'approved':
                new_ca = float(amendment['proposed_ca_score'])
                new_exam = float(amendment['proposed_exam_score'])
                total = round(new_ca + new_exam, 2)
                grade, grade_point = compute_grade(total)
                cur.execute(
                    f'''UPDATE {table}
                        SET ca_score=%s, exam_score=%s, total_score=%s,
                            grade=%s, grade_point=%s, updated_at=NOW()
                        WHERE id=%s''',
                    (new_ca, new_exam, total, grade, grade_point, amendment['score_id']))
                if cur.rowcount != 1:
                    raise LookupError('Original score record not found')

                cur.execute('SELECT "MatricNo" FROM students WHERE "Id"=%s', (amendment['student_id'],))
                student = cur.fetchone()
                course_table = 'pg_courses' if source == 'pg' else 'course'
                cur.execute(f'SELECT course_code FROM {course_table} WHERE id=%s', (amendment['course_id'],))
                course = cur.fetchone()
                if not student or not course:
                    raise LookupError('Student or course metadata not found')
                matric = student['MatricNo']
                course_code = course['course_code']

                result_tables = _tables(source == 'pg')
                cur.execute(
                    f'''UPDATE {result_tables['master']}
                        SET ca=%s, exam=%s, total=%s, grade=%s, grade_point=%s,
                            status=%s
                        WHERE UPPER(TRIM(matric_no))=UPPER(TRIM(%s))
                          AND UPPER(REPLACE(course_code, ' ', ''))=UPPER(REPLACE(%s, ' ', ''))
                          AND session=%s AND semester=%s''',
                    (new_ca, new_exam, total, grade, grade_point,
                     'P' if total >= 40 else 'F', matric, course_code,
                     amendment['session'], amendment['semester']))

                cur.execute(
                    f'''SELECT id, payload FROM {result_tables['pending']}
                        WHERE status IN ('pending', 'processed')''')
                for submission in cur.fetchall() or []:
                    submission_payload = submission['payload']
                    if isinstance(submission_payload, str):
                        submission_payload = json.loads(submission_payload)
                    changed = False
                    for item in submission_payload or []:
                        info = item.get('studentInfo') or {}
                        if str(info.get('matricNumber') or '').strip().upper() != str(matric).strip().upper():
                            continue
                        if info.get('academicSession') != amendment['session'] or info.get('semester') != amendment['semester']:
                            continue
                        for result in item.get('courses') or []:
                            normalized = lambda value: ''.join(str(value or '').upper().split())
                            if normalized(result.get('code')) == normalized(course_code):
                                result['ca'] = new_ca
                                result['exam'] = new_exam
                                result['score'] = total
                                changed = True
                    if changed:
                        cur.execute(
                            f'''UPDATE {result_tables['pending']} SET payload=%s::jsonb WHERE id=%s''',
                            (json.dumps(submission_payload), submission['id']))

                cur.execute(
                    '''INSERT INTO score_audit_log
                         (score_id, course_source, amendment_request_id, changed_by, change_type,
                          old_ca_score, new_ca_score, old_exam_score, new_exam_score, reason)
                       VALUES (%s,%s,%s,%s,'amendment_approved',%s,%s,%s,%s,%s)''',
                    (amendment['score_id'], source, amendment_id, user_id,
                     amendment['old_ca_score'], new_ca, amendment['old_exam_score'], new_exam,
                     amendment['reason']))
            else:
                cur.execute(
                    '''INSERT INTO score_audit_log
                         (score_id, course_source, amendment_request_id, changed_by, change_type, reason)
                       VALUES (%s,%s,%s,%s,'amendment_rejected',%s)''',
                    (amendment['score_id'], amendment['course_source'], amendment_id,
                     user_id, review_note))

            cur.execute(
                '''UPDATE score_amendment_requests
                   SET status=%s, reviewed_by=%s, reviewed_at=NOW(), review_note=%s
                   WHERE id=%s''',
                (decision, user_id, review_note or None, amendment_id))
        conn.commit()
        return jsonify({'message': f'Correction request {decision}'}), 200
    except LookupError as exc:
        conn.rollback()
        return jsonify({'message': str(exc)}), 404
    except PermissionError as exc:
        conn.rollback()
        return jsonify({'message': str(exc)}), 403
    except Exception as exc:
        conn.rollback()
        return jsonify({'message': str(exc)}), 400
    finally:
        Database.release_connection(conn)


# ── GET /api/scores/course/<id> ────────────────────────────────────────────────
@scores_bp.route('/course/<int:course_id>', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required(*STAFF_ROLES)
def get_course_scores(payload, course_id):
    """Get all scores for a given course (optionally filtered by session/semester)."""
    _ensure_score_schema()
    session  = request.args.get('session')
    semester = request.args.get('semester')
    course_source = request.args.get('course_source', 'ug')

    if course_source not in ('ug', 'pg'):
        return jsonify({'message': 'course_source must be ug or pg'}), 400

    table = _score_table(course_source)

    query = f'''
        SELECT ss.id, ss.student_id, st."MatricNo" as matric_number,
               u.firstname || ' ' || u.surname AS student_name,
               ss.ca_score, ss.exam_score, ss.total_score,
               ss.grade, ss.grade_point, ss.status,
               ss.session, ss.semester,
               entered.firstname || ' ' || entered.surname AS entered_by_name,
               approved.firstname || ' ' || approved.surname AS approved_by_name
        FROM {table} ss
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
    _ensure_score_schema()
    role    = payload['role']
    user_id = payload['user_id']

    # Students may only view their own results
    if role == 'student':
        me = Database.execute_query(
            'SELECT "Id" as id FROM students WHERE "UserId" = %s', (user_id,))
        if not me or me[0]['id'] != student_id:
            return jsonify({'message': 'Access denied'}), 403

    ug_scores = Database.execute_query(
        '''SELECT ss.id, c.course_code, c.course_title, c.unit AS credit_units,
                  ss.ca_score, ss.exam_score, ss.total_score,
                  ss.grade, ss.grade_point, ss.status,
                  ss.session, ss.semester, 'ug' AS course_source
           FROM student_scores ss
           JOIN course c ON ss.course_id = c.id
           WHERE ss.student_id = %s
           ORDER BY ss.session, ss.semester, c.course_code''',
        (student_id,))
    pg_scores = Database.execute_query(
        '''SELECT ss.id, c.course_code, c.course_title, c.unit AS credit_units,
                  ss.ca_score, ss.exam_score, ss.total_score,
                  ss.grade, ss.grade_point, ss.status,
                  ss.session, ss.semester, 'pg' AS course_source
           FROM pg_student_scores ss
           JOIN pg_courses c ON ss.course_id = c.id
           WHERE ss.student_id = %s
           ORDER BY ss.session, ss.semester, c.course_code''',
        (student_id,))

    return jsonify({'scores': [dict(s) for s in ((ug_scores or []) + (pg_scores or []))]}), 200


# ── GET /api/scores/audit/<score_id> ──────────────────────────────────────────
@scores_bp.route('/audit/<int:score_id>', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('hod', 'dean', 'registrar', 'admin', 'ictdirector', 'pgadmin', 'pgdean')
def get_score_audit(payload, score_id):
    """Return full audit trail for a score record."""
    _ensure_score_schema()
    course_source = request.args.get('course_source', 'ug')
    if course_source not in ('ug', 'pg'):
        return jsonify({'message': 'course_source must be ug or pg'}), 400
    processor_source = _processor_source(payload.get('role'))
    if processor_source and processor_source != course_source:
        return jsonify({'message': 'This audit trail belongs to another result processor'}), 403
    logs = Database.execute_query(
        '''SELECT sal.id, sal.change_type, sal.old_ca_score, sal.new_ca_score,
                  sal.old_exam_score, sal.new_exam_score, sal.reason,
                  sal.changed_at, sal.course_source, sal.amendment_request_id,
                  NULLIF(TRIM(COALESCE(u.firstname, '') || ' ' || COALESCE(u.surname, '')), '') AS changed_by_name,
                  r.name AS changed_by_role,
                  ar.status AS amendment_status, ar.review_note
           FROM score_audit_log sal
           JOIN users u ON sal.changed_by = u.id
           LEFT JOIN user_types ut ON ut.id = u.user_type_id
           LEFT JOIN roles r ON r.id = ut.role_id
           LEFT JOIN score_amendment_requests ar ON ar.id = sal.amendment_request_id
           WHERE sal.score_id = %s AND sal.course_source = %s
           ORDER BY sal.changed_at''',
        (score_id, course_source))
    return jsonify({'audit_log': [dict(l) for l in (logs or [])]}), 200
