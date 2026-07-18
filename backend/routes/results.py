"""Result processing queues and master-list storage.

UG results use pending_results/master_results and are processed by ICT.
PG results use pg_pending_results/pg_master_results and are processed by PG Admin.
"""
from flask import Blueprint, request, jsonify
from database import Database
from utils.auth import AuthHandler

results_bp = Blueprint('results', __name__)
pg_results_bp = Blueprint('pg_results', __name__)


def _grade_point(score):
    score = float(score or 0)
    if score >= 70:
        return 5, 'A'
    if score >= 60:
        return 4, 'B'
    if score >= 50:
        return 3, 'C'
    if score >= 45:
        return 2, 'D'
    if score >= 40:
        return 1, 'E'
    return 0, 'F'


def _tables(is_pg=False):
    return {
        'pending': 'pg_pending_results' if is_pg else 'pending_results',
        'master': 'pg_master_results' if is_pg else 'master_results',
        'course': 'pg_courses' if is_pg else 'course',
    }


def _ensure_result_schema(is_pg=False):
    t = _tables(is_pg)
    if is_pg:
        Database.execute_update('''
            CREATE TABLE IF NOT EXISTS pg_pending_results (
                id SERIAL PRIMARY KEY,
                staff_id INTEGER NOT NULL,
                file_name VARCHAR(255),
                sheet_name VARCHAR(255),
                course_code VARCHAR(255),
                payload JSONB,
                status VARCHAR(50) DEFAULT 'pending',
                file_content TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        ''')
        Database.execute_update('''
            CREATE TABLE IF NOT EXISTS pg_master_results (
                id SERIAL PRIMARY KEY,
                matric_no VARCHAR(255),
                course_code VARCHAR(255),
                course_title VARCHAR(255),
                course_unit INTEGER,
                session VARCHAR(255),
                semester VARCHAR(255),
                level VARCHAR(50),
                ca NUMERIC,
                exam NUMERIC,
                total NUMERIC,
                grade VARCHAR(10),
                grade_point NUMERIC,
                status VARCHAR(50),
                program_id INTEGER,
                lecturer_id INTEGER,
                created_at TIMESTAMP DEFAULT NOW()
            )
        ''')
        Database.execute_update('''
            CREATE UNIQUE INDEX IF NOT EXISTS uni_pg_master_result
            ON pg_master_results (matric_no, course_code, session, semester)
        ''')
    else:
        Database.execute_update("ALTER TABLE master_results ADD COLUMN IF NOT EXISTS course_title VARCHAR(255)")
    Database.execute_update(f'ALTER TABLE {t["master"]} ADD COLUMN IF NOT EXISTS ca NUMERIC')
    Database.execute_update(f'ALTER TABLE {t["master"]} ADD COLUMN IF NOT EXISTS exam NUMERIC')


def _staff_record_id(user_id, raw_staff_id=None):
    staff = Database.execute_query('SELECT id FROM staff WHERE user_id = %s LIMIT 1', (user_id,))
    if staff:
        return staff[0]['id']
    try:
        return int(raw_staff_id)
    except (TypeError, ValueError):
        return None


def _course_meta(code, department=None, is_pg=False):
    t = _tables(is_pg)
    if is_pg:
        rows = Database.execute_query(
            '''SELECT c.id, c.course_code, c.course_title, c.unit AS units,
                      c.remark, ps.name AS department_name
               FROM pg_courses c
               LEFT JOIN program_setup ps ON ps.id = c.program_setup_id
               WHERE UPPER(REPLACE(c.course_code, ' ', '')) = UPPER(REPLACE(%s, ' ', ''))
               ORDER BY CASE WHEN %s IS NOT NULL AND UPPER(TRIM(ps.name)) = UPPER(TRIM(%s)) THEN 0 ELSE 1 END,
                        c.id
               LIMIT 1''',
            (code, department, department))
    else:
        rows = Database.execute_query(
            '''SELECT c.id, c.course_code, c.course_title, c.unit AS units,
                      c.remark, c.department AS department_name
               FROM course c
               WHERE UPPER(REPLACE(c.course_code, ' ', '')) = UPPER(REPLACE(%s, ' ', ''))
               ORDER BY CASE WHEN %s IS NOT NULL AND UPPER(TRIM(c.department)) = UPPER(TRIM(%s)) THEN 0 ELSE 1 END,
                        c.id
               LIMIT 1''',
            (code, department, department))
    return dict(rows[0]) if rows else None


def _pending_handler(is_pg=False):
    _ensure_result_schema(is_pg)
    t = _tables(is_pg)

    if request.method == 'GET':
        status = request.args.get('status')
        staff_id = request.args.get('staffId')
        query = f'''SELECT pr.*,
                           NULLIF(TRIM(COALESCE(u.firstname, '') || ' ' || COALESCE(u.surname, '')), '') AS staff_name
                    FROM {t["pending"]} pr
                    LEFT JOIN staff st ON st.id = pr.staff_id
                    LEFT JOIN users u ON u.id = st.user_id
                    WHERE 1=1'''
        params = []
        if status:
            query += ' AND pr.status = %s'
            params.append(status)
        if staff_id:
            resolved = _staff_record_id(getattr(request, 'user_id', None), staff_id)
            if resolved:
                query += ' AND pr.staff_id = %s'
                params.append(resolved)
        query += ' ORDER BY pr.created_at DESC, pr.id DESC'
        rows = Database.execute_query(query, tuple(params))
        return jsonify([dict(r) for r in (rows or [])]), 200

    if request.method == 'DELETE':
        allowed_roles = ('pgadmin', 'pgdean') if is_pg else ('admin', 'ictdirector')
        if getattr(request, 'user_role', None) not in allowed_roles:
            return jsonify({'message': 'Only the authorised result processor can delete this submission'}), 403

        item_id = request.args.get('id')
        if not item_id:
            return jsonify({'message': 'id is required'}), 400

        data = request.get_json(silent=True) or {}
        password = str(data.get('password') or '')
        if not password:
            return jsonify({'message': 'Password is required to delete a result submission'}), 400

        users = Database.execute_query(
            'SELECT password_hash FROM users WHERE id = %s LIMIT 1',
            (getattr(request, 'user_id', None),)
        )
        if not users or not AuthHandler.verify_password(password, users[0].get('password_hash')):
            return jsonify({'message': 'Incorrect password'}), 403

        Database.execute_update(f'DELETE FROM {t["pending"]} WHERE id = %s', (item_id,))
        return jsonify({'message': 'Submission deleted'}), 200

    data = request.get_json() or {}
    staff_id = _staff_record_id(getattr(request, 'user_id', None), data.get('staffId'))
    if not staff_id:
        return jsonify({'message': 'Staff profile not found'}), 403
    submission_payload = data.get('payload') or []
    if not isinstance(submission_payload, list) or not submission_payload:
        return jsonify({'message': 'No student results were supplied'}), 400

    for student_result in submission_payload:
        courses = student_result.get('courses') or []
        if not courses:
            return jsonify({'message': 'Every student result must include at least one course'}), 400
        for course_result in courses:
            try:
                ca = float(course_result.get('ca'))
                exam = float(course_result.get('exam'))
            except (TypeError, ValueError):
                return jsonify({'message': 'Every result requires numeric CA and exam scores'}), 400
            if ca < 0 or ca > 30:
                return jsonify({'message': 'CA score must be between 0 and 30'}), 400
            if exam < 0 or exam > 70:
                return jsonify({'message': 'Exam score must be between 0 and 70'}), 400
            course_result['ca'] = ca
            course_result['exam'] = exam
            course_result['score'] = round(ca + exam, 2)

    matric_numbers = []
    for item in submission_payload:
        matric = str((item.get('studentInfo') or {}).get('matricNumber') or '').strip()
        if matric and matric.upper() not in matric_numbers:
            matric_numbers.append(matric.upper())
    if not matric_numbers:
        return jsonify({'message': 'No matric numbers were supplied'}), 400

    placeholders = ', '.join(['%s'] * len(matric_numbers))
    student_rows = Database.execute_query(
        f'''SELECT UPPER(TRIM(s."MatricNo")) AS matric_key,
                   COALESCE(
                     NULLIF(TRIM(COALESCE(u.firstname, '') || ' ' || COALESCE(u.surname, '')), ''),
                     NULLIF(TRIM(COALESCE(s."FirstName", '') || ' ' || COALESCE(s."LastName", '')), ''),
                     s."MatricNo"
                   ) AS student_name
            FROM students s
            LEFT JOIN users u ON u.id = s."UserId"
            WHERE UPPER(TRIM(s."MatricNo")) IN ({placeholders})''',
        tuple(matric_numbers))
    names_by_matric = {row['matric_key']: row['student_name'] for row in (student_rows or [])}
    missing_matrics = [matric for matric in matric_numbers if matric not in names_by_matric]
    if missing_matrics:
        return jsonify({'message': f'Student not found for matric number: {missing_matrics[0]}'}), 400

    for item in submission_payload:
        student_info = item.setdefault('studentInfo', {})
        matric_key = str(student_info.get('matricNumber') or '').strip().upper()
        student_info['name'] = names_by_matric[matric_key]

    Database.execute_update(
        f'''INSERT INTO {t["pending"]}
              (staff_id, file_name, sheet_name, course_code, payload, status, file_content)
           VALUES (%s, %s, %s, %s, %s::jsonb, 'pending', %s)''',
        (
            staff_id,
            data.get('fileName'),
            data.get('sheetName'),
            data.get('courseCode'),
            __import__('json').dumps(submission_payload),
            data.get('fileContent'),
        ))
    return jsonify({'message': 'Submission queued'}), 201


def _save_results_handler(is_pg=False):
    _ensure_result_schema(is_pg)
    t = _tables(is_pg)
    body = request.get_json() or {}
    raw_items = body.get('results', body)
    items = raw_items if isinstance(raw_items, list) else [raw_items]
    if not items:
        return jsonify({'message': 'No results to save'}), 200

    saved = 0
    conn = Database.get_connection()
    if not conn:
        return jsonify({'message': 'Database connection failed'}), 500
    try:
        with conn.cursor() as cur:
            for item in items:
                info = item.get('studentInfo') or {}
                matric = info.get('matricNumber')
                session = info.get('academicSession')
                semester = info.get('semester')
                if not matric or not session or not semester:
                    raise ValueError('Each result needs matricNumber, academicSession and semester')

                for course in item.get('courses') or []:
                    code = course.get('code')
                    if not code:
                        continue
                    score = float(course.get('score') or course.get('total') or 0)
                    ca = course.get('ca')
                    exam = course.get('exam')
                    gp, grade = _grade_point(score)
                    meta = _course_meta(code, info.get('department'), is_pg) or {}
                    unit = course.get('unit') or meta.get('units')
                    if not unit:
                        raise ValueError(f'Unit count missing for course: {code}')
                    title = course.get('title') or meta.get('course_title') or code
                    cur.execute(
                        f'''INSERT INTO {t["master"]}
                              (matric_no, course_code, course_title, course_unit, session, semester,
                               level, ca, exam, total, grade, grade_point, status, lecturer_id)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                           ON CONFLICT (matric_no, course_code, session, semester)
                           DO UPDATE SET course_title = EXCLUDED.course_title,
                                         course_unit = EXCLUDED.course_unit,
                                         level = EXCLUDED.level,
                                         ca = EXCLUDED.ca,
                                         exam = EXCLUDED.exam,
                                         total = EXCLUDED.total,
                                         grade = EXCLUDED.grade,
                                         grade_point = EXCLUDED.grade_point,
                                         status = EXCLUDED.status,
                                         lecturer_id = EXCLUDED.lecturer_id''',
                        (matric, code, title, int(unit), session, semester, str(info.get('level') or ''),
                         ca, exam, score, grade, gp, 'P' if score >= 40 else 'F',
                         _staff_record_id(getattr(request, 'user_id', None))))
                    saved += 1

            pending_id = body.get('pendingId')
            if pending_id:
                cur.execute(f"UPDATE {t['pending']} SET status = 'processed' WHERE id = %s", (pending_id,))
        conn.commit()
        return jsonify({'message': f'{saved} result row(s) saved'}), 201
    except Exception as exc:
        conn.rollback()
        return jsonify({'message': str(exc), 'error': str(exc)}), 500
    finally:
        Database.release_connection(conn)


def _result_rows(is_pg=False, session=None, semester=None, department_id=None):
    _ensure_result_schema(is_pg)
    t = _tables(is_pg)
    query = f'''SELECT mr.id, mr.matric_no, mr.level, mr.session, mr.semester,
                  mr.course_code, mr.course_title, mr.course_unit, mr.total,
                  mr.grade_point, mr.grade, mr.created_at,
                  COALESCE(u.firstname || ' ' || u.surname,
                           s."FirstName" || ' ' || s."LastName",
                           mr.matric_no) AS student_name,
                  COALESCE(d.name, pgd.name, s.department, ps.name, 'Postgraduate Studies') AS department_name,
                  COALESCE(d.id, pgd.id) AS department_id,
                  COALESCE(f.name, pgf.name) AS faculty
           FROM {t["master"]} mr
           LEFT JOIN students s ON s."MatricNo" = mr.matric_no
           LEFT JOIN users u ON u.id = s."UserId"
           LEFT JOIN departments d ON UPPER(TRIM(d.name)) = UPPER(TRIM(s.department))
           LEFT JOIN faculties f ON f.id = d.faculty_id
           LEFT JOIN pg_application pg ON pg.user_id = s."UserId"
           LEFT JOIN pg_program_setup pgps ON pgps.id = pg.proposed_course
           LEFT JOIN departments pgd ON pgd.id = pgps.department_id
           LEFT JOIN faculties pgf ON pgf.id = pgd.faculty_id
           LEFT JOIN program_setup ps
             ON UPPER(TRIM(ps.name)) = UPPER(TRIM(pgps.name))
            AND ps.department_id = pgps.department_id'''
    params = []
    clauses = []
    if session:
        clauses.append('mr.session = %s')
        params.append(session)
    if semester:
        clauses.append('mr.semester = %s')
        params.append(semester)
    if department_id:
        clauses.append('COALESCE(d.id, pgd.id) = %s')
        params.append(department_id)
    if clauses:
        query += ' WHERE ' + ' AND '.join(clauses)
    query += ' ORDER BY department_name, mr.session, mr.semester, student_name, mr.course_code'
    return Database.execute_query(query, tuple(params))


def _group_result_rows(rows, is_pg=False):
    dept_map = {}
    for row in rows or []:
        dept_id = row.get('department_id') or 0
        dept = dept_map.setdefault(dept_id, {
            'id': dept_id,
            'name': row.get('department_name') or 'Unknown',
            'faculty': row.get('faculty') or ('The Postgraduate School' if is_pg else ''),
            'sessions': {},
        })
        sess = dept['sessions'].setdefault(row['session'], {'id': row['session'], 'name': row['session'], 'semesters': {}})
        sem = sess['semesters'].setdefault(row['semester'], {'name': row['semester'], 'students': {}})
        sid = f"{row['matric_no']}_{row['session']}_{row['semester']}"
        student = sem['students'].setdefault(sid, {
            'id': sid,
            'timestamp': int(row['created_at'].timestamp() * 1000) if row.get('created_at') else 0,
            'studentInfo': {
                'name': row.get('student_name') or row['matric_no'],
                'matricNumber': row['matric_no'],
                'level': str(row.get('level') or ''),
                'faculty': dept['faculty'],
                'department': dept['name'],
                'academicSession': row['session'],
                'semester': row['semester'],
            },
            'courses': [],
            'calculations': {'totalUnits': 0, 'totalUnitsPassed': 0, 'totalWGP': 0, 'cgpa': '0.00'},
        })
        unit = row.get('course_unit') or 0
        gp = float(row.get('grade_point') or 0)
        score = float(row.get('total') or 0)
        student['courses'].append({
            'id': str(row['id']),
            'code': row['course_code'],
            'title': row.get('course_title') or row['course_code'],
            'unit': unit,
            'score': score,
            'gradePoint': gp,
            'remark': row.get('grade') or '',
        })
        student['calculations']['totalUnits'] += unit
        student['calculations']['totalWGP'] += unit * gp
        if score >= 40:
            student['calculations']['totalUnitsPassed'] += unit

    departments = []
    for dept in dept_map.values():
        sessions = []
        for sess in dept['sessions'].values():
            semesters = []
            for sem in sess['semesters'].values():
                students = []
                for student in sem['students'].values():
                    total_units = student['calculations']['totalUnits']
                    student['calculations']['cgpa'] = f"{student['calculations']['totalWGP'] / total_units:.2f}" if total_units else '0.00'
                    students.append(student)
                semesters.append({'name': sem['name'], 'students': students})
            sessions.append({'id': sess['id'], 'name': sess['name'], 'semesters': semesters})
        departments.append({'id': dept['id'], 'name': dept['name'], 'faculty': dept['faculty'], 'sessions': sessions})
    return departments


def _list_results_handler(is_pg=False):
    return jsonify(_group_result_rows(_result_rows(is_pg), is_pg)), 200


def _master_list_handler(payload, is_pg=False, options=False):
    role = payload.get('role')
    department_id = None
    if role in ('deo', 'hod'):
        staff = Database.execute_query(
            'SELECT department_id FROM staff WHERE user_id = %s LIMIT 1',
            (payload['user_id'],))
        department_id = staff[0]['department_id'] if staff else None
        if not department_id:
            return jsonify({'message': 'Staff department is not configured'}), 403

    if options:
        rows = _result_rows(is_pg, department_id=department_id)
        periods = sorted({
            (str(row.get('session') or ''), str(row.get('semester') or ''))
            for row in (rows or []) if row.get('session') and row.get('semester')
        }, reverse=True)
        return jsonify({'periods': [
            {'session': session, 'semester': semester}
            for session, semester in periods
        ]}), 200

    session = str(request.args.get('session') or '').strip()
    semester = str(request.args.get('semester') or '').strip()
    if not session or not semester:
        return jsonify({'message': 'session and semester are required'}), 400
    rows = _result_rows(is_pg, session=session, semester=semester, department_id=department_id)
    history_rows = _result_rows(is_pg, department_id=department_id)
    semester_order = {'first': 1, 'first semester': 1, 'second': 2, 'second semester': 2, 'third': 3, 'third semester': 3}
    selected_semester_order = semester_order.get(semester.strip().lower(), 99)
    cumulative = {}
    for row in history_rows or []:
        row_session = str(row.get('session') or '')
        row_semester_order = semester_order.get(str(row.get('semester') or '').strip().lower(), 99)
        if row_session > session or (row_session == session and row_semester_order > selected_semester_order):
            continue
        matric = str(row.get('matric_no') or '').strip().upper()
        summary = cumulative.setdefault(matric, {'units': 0, 'wgp': 0.0, 'passed': 0})
        units = int(row.get('course_unit') or 0)
        score = float(row.get('total') or 0)
        summary['units'] += units
        summary['wgp'] += units * float(row.get('grade_point') or 0)
        if score >= 40:
            summary['passed'] += units

    departments = _group_result_rows(rows, is_pg)
    for department in departments:
        for session_group in department.get('sessions') or []:
            for semester_group in session_group.get('semesters') or []:
                for student in semester_group.get('students') or []:
                    matric = str(student['studentInfo'].get('matricNumber') or '').strip().upper()
                    summary = cumulative.get(matric, {'units': 0, 'wgp': 0.0, 'passed': 0})
                    calculations = student['calculations']
                    calculations['cumulativeTotalUnits'] = summary['units']
                    calculations['cumulativeTotalWGP'] = summary['wgp']
                    calculations['cumulativeTotalUnitsPassed'] = summary['passed']
                    calculations['cumulativeCGPA'] = f"{summary['wgp'] / summary['units']:.2f}" if summary['units'] else '0.00'
    return jsonify({
        'session': session,
        'semester': semester,
        'scope': 'department' if department_id else 'overall',
        'departments': departments,
    }), 200


@results_bp.route('/pending', methods=['GET', 'POST', 'DELETE'])
@AuthHandler.token_required
@AuthHandler.roles_required('lecturer', 'deo', 'hod', 'admin', 'ictdirector')
def ug_pending(payload):
    request.user_id = payload['user_id']
    request.user_role = payload.get('role')
    return _pending_handler(False)


@results_bp.route('', methods=['GET', 'POST', 'DELETE'])
@AuthHandler.token_required
@AuthHandler.roles_required('admin', 'ictdirector')
def ug_results(payload):
    request.user_id = payload['user_id']
    if request.method == 'GET':
        return _list_results_handler(False)
    if request.method == 'DELETE':
        _ensure_result_schema(False)
        Database.execute_update('DELETE FROM master_results')
        return jsonify({'message': 'All UG results cleared'}), 200
    return _save_results_handler(False)


@results_bp.route('/courses', methods=['GET'])
@AuthHandler.token_required
def ug_course_lookup(payload):
    meta = _course_meta(request.args.get('code'), request.args.get('department'), False)
    if not meta:
        return jsonify({'message': 'Course not found'}), 404
    return jsonify(meta), 200


@results_bp.route('/master-list', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('deo', 'hod', 'admin', 'ictdirector')
def ug_master_list(payload):
    return _master_list_handler(payload, False)


@results_bp.route('/master-list/options', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('deo', 'hod', 'admin', 'ictdirector')
def ug_master_list_options(payload):
    return _master_list_handler(payload, False, True)


@pg_results_bp.route('/pending', methods=['GET', 'POST', 'DELETE'])
@AuthHandler.token_required
@AuthHandler.roles_required('lecturer', 'deo', 'hod', 'pgadmin', 'pgdean')
def pg_pending(payload):
    request.user_id = payload['user_id']
    request.user_role = payload.get('role')
    return _pending_handler(True)


@pg_results_bp.route('', methods=['GET', 'POST', 'DELETE'])
@AuthHandler.token_required
@AuthHandler.roles_required('pgadmin', 'pgdean')
def pg_results(payload):
    request.user_id = payload['user_id']
    if request.method == 'GET':
        return _list_results_handler(True)
    if request.method == 'DELETE':
        _ensure_result_schema(True)
        Database.execute_update('DELETE FROM pg_master_results')
        return jsonify({'message': 'All PG results cleared'}), 200
    return _save_results_handler(True)


@pg_results_bp.route('/courses', methods=['GET'])
@AuthHandler.token_required
def pg_course_lookup(payload):
    meta = _course_meta(request.args.get('code'), request.args.get('department'), True)
    if not meta:
        return jsonify({'message': 'Course not found'}), 404
    return jsonify(meta), 200


@pg_results_bp.route('/master-list', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('deo', 'hod', 'pgadmin', 'pgdean')
def pg_master_list(payload):
    return _master_list_handler(payload, True)


@pg_results_bp.route('/master-list/options', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('deo', 'hod', 'pgadmin', 'pgdean')
def pg_master_list_options(payload):
    return _master_list_handler(payload, True, True)
