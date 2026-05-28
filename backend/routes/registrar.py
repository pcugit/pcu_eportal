"""routes/registrar.py — Registrar: full read access + transcript signing."""
from flask import Blueprint, request, jsonify
from database import Database
from utils.auth import AuthHandler

registrar_bp = Blueprint('registrar', __name__)


@registrar_bp.route('/dashboard', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('registrar', 'admin')
def dashboard(payload):
    total_students = Database.execute_query('SELECT COUNT(*) AS n FROM students')
    pending_transcripts = Database.execute_query(
        "SELECT COUNT(*) AS n FROM transcript_logs WHERE status='pending'")
    signed_transcripts = Database.execute_query(
        "SELECT COUNT(*) AS n FROM transcript_logs WHERE status='signed'")
    total_scores = Database.execute_query("SELECT COUNT(*) AS n FROM student_scores WHERE status='approved'")

    return jsonify({
        'total_students': total_students[0]['n'] if total_students else 0,
        'pending_transcripts': pending_transcripts[0]['n'] if pending_transcripts else 0,
        'signed_transcripts': signed_transcripts[0]['n'] if signed_transcripts else 0,
        'total_approved_scores': total_scores[0]['n'] if total_scores else 0,
    }), 200


@registrar_bp.route('/students', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('registrar', 'admin')
def get_all_students(payload):
    search      = request.args.get('search', '')
    program_id  = request.args.get('program_id', '')
    level       = request.args.get('level', '')

    query = '''
        SELECT DISTINCT ON (st."Id") 
               st."Id" as id, 
               st."MatricNo" as matric_number, 
               u.firstname || ' ' || COALESCE(u.middlename || ' ', '') || u.surname as name, 
               st."Email" as email,
               ps.name AS program, 
               l.name as current_level, 
               acs.name as session
        FROM students st
        JOIN users u ON st."UserId" = u.id
        LEFT JOIN applications a ON a.user_id = u.id
        LEFT JOIN program_setup ps ON COALESCE(a.program_setup_id, 0) = ps.id OR (a.program_setup_id IS NULL AND a.degree_id = ps.degree_id)
        LEFT JOIN level l ON st.current_level_id = l.id
        LEFT JOIN academic_sessions acs ON a.academic_session_id = acs.id
        WHERE 1=1
    '''
    params = []
    if search:
        query += ' AND (u.firstname ILIKE %s OR u.surname ILIKE %s OR st."MatricNo" ILIKE %s)'
        params += [f'%{search}%', f'%{search}%', f'%{search}%']
    if program_id:
        query += ' AND a.program_setup_id = %s'; params.append(program_id)
    if level:
        level_digits = ''.join(c for c in level if c.isdigit())
        if level_digits:
            query += ' AND l.name = %s'; params.append(level_digits)
            
    final_query = f'''SELECT * FROM ({query}) subq ORDER BY matric_number'''

    students = Database.execute_query(final_query, tuple(params) if params else None)
    return jsonify({'students': [dict(s) for s in (students or [])]}), 200


@registrar_bp.route('/student/<int:student_id>/transcript', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('registrar', 'admin', 'student')
def get_transcript(payload, student_id):
    """Full approved transcript for a student."""
    role    = payload['role']
    user_id = payload['user_id']

    if role == 'student':
        me = Database.execute_query(
            'SELECT "Id" as id FROM students WHERE "UserId" = %s', (user_id,))
        if not me or me[0]['id'] != student_id:
            return jsonify({'message': 'Access denied'}), 403

    student = Database.execute_query(
        '''SELECT st."MatricNo" as matric_number, 
                  u.firstname || ' ' || COALESCE(u.middlename || ' ', '') || u.surname as name, 
                  u.email,
                  ps.name AS program, 
                  l.name as current_level, 
                  acs.name as session,
                  st.department, 
                  f.name AS faculty
           FROM students st
           JOIN users u ON st."UserId" = u.id
           LEFT JOIN applications a ON a.user_id = u.id
           LEFT JOIN program_setup ps ON COALESCE(a.program_setup_id, 0) = ps.id OR (a.program_setup_id IS NULL AND a.degree_id = ps.degree_id)
           LEFT JOIN level l ON st.current_level_id = l.id
           LEFT JOIN academic_sessions acs ON a.academic_session_id = acs.id
           LEFT JOIN departments d ON LOWER(st.department) = LOWER(d.name)
           LEFT JOIN faculties f ON d.faculty_id = f.id
           WHERE st."Id" = %s
           ORDER BY a.updated_at DESC LIMIT 1''',
        (student_id,))

    if not student:
        return jsonify({'message': 'Student not found'}), 404

    scores = Database.execute_query(
        '''SELECT c.course_code, c.course_title, c.credit_units,
                  ss.ca_score, ss.exam_score, ss.total_score,
                  ss.grade, ss.grade_point, ss.session, ss.semester
           FROM student_scores ss
           JOIN courses c ON ss.course_id = c.id
           WHERE ss.student_id = %s AND ss.status = 'approved'
           ORDER BY ss.session, ss.semester, c.course_code''',
        (student_id,))

    # GPA calculation
    total_units = total_points = 0
    for s in (scores or []):
        units = s['credit_units'] or 0
        gp    = float(s['grade_point'] or 0)
        total_units  += units
        total_points += units * gp
    gpa = round(total_points / total_units, 2) if total_units else 0.0

    # Transcript signing status
    sign_log = Database.execute_query(
        '''SELECT tl.status, tl.signed_at, u.name AS signed_by
           FROM transcript_logs tl
           LEFT JOIN users u ON tl.signed_by = u.id
           WHERE tl.student_id = %s ORDER BY tl.created_at DESC LIMIT 1''',
        (student_id,))

    return jsonify({
        'student': dict(student[0]),
        'scores': [dict(s) for s in (scores or [])],
        'gpa': gpa,
        'total_credit_units': total_units,
        'signing_status': dict(sign_log[0]) if sign_log else None,
    }), 200


@registrar_bp.route('/transcripts', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.roles_required('registrar', 'admin')
def list_transcripts(payload):
    status = request.args.get('status', '')
    query = '''
        SELECT tl.id, tl.student_id, st."MatricNo" as matric_number, 
               u.firstname || ' ' || u.surname AS student_name,
               tl.status, tl.created_at, tl.signed_at,
               signer.firstname || ' ' || signer.surname AS signed_by
        FROM transcript_logs tl
        JOIN students st ON tl.student_id = st."Id"
        JOIN users u ON st."UserId" = u.id
        LEFT JOIN users signer ON tl.signed_by = signer.id
        WHERE 1=1
    '''
    params = []
    if status:
        query += ' AND tl.status = %s'; params.append(status)
    query += ' ORDER BY tl.created_at DESC'

    logs = Database.execute_query(query, tuple(params) if params else None)
    return jsonify({'transcripts': [dict(l) for l in (logs or [])]}), 200


@registrar_bp.route('/transcripts/request', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.roles_required('registrar', 'admin', 'student')
def request_transcript(payload):
    """Student or registrar can request a transcript."""
    data       = request.get_json()
    student_id = data.get('student_id')
    user_id    = payload['user_id']

    if not student_id:
        return jsonify({'message': 'student_id required'}), 400

    log_id = Database.execute_update(
        '''INSERT INTO transcript_logs (student_id, requested_by, status)
           VALUES (%s,%s,'pending') RETURNING id''',
        (student_id, user_id), return_id=True)

    return jsonify({'message': 'Transcript request submitted', 'log_id': log_id}), 201


@registrar_bp.route('/transcripts/<int:log_id>/sign', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.roles_required('registrar', 'admin')
def sign_transcript(payload, log_id):
    """Registrar signs a pending transcript."""
    user_id = payload['user_id']

    log = Database.execute_query(
        'SELECT id, status FROM transcript_logs WHERE id = %s', (log_id,))
    if not log:
        return jsonify({'message': 'Transcript log not found'}), 404
    if log[0]['status'] == 'signed':
        return jsonify({'message': 'Already signed'}), 400

    Database.execute_update(
        '''UPDATE transcript_logs
           SET status='signed', signed_by=%s, signed_at=NOW()
           WHERE id=%s''',
        (user_id, log_id))

    return jsonify({'message': 'Transcript signed successfully'}), 200


@registrar_bp.route('/transcripts/<int:log_id>/issue', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.roles_required('registrar', 'admin')
def issue_transcript(payload, log_id):
    Database.execute_update(
        "UPDATE transcript_logs SET status='issued', issued_at=NOW() WHERE id=%s",
        (log_id,))
    return jsonify({'message': 'Transcript issued'}), 200
