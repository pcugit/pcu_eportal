"""routes/settings.py — System wide settings management (Admin only)."""
from flask import Blueprint, request, jsonify
from database import Database
from utils.auth import AuthHandler

settings_bp = Blueprint('settings', __name__)

@settings_bp.route('/all', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admin_required
def get_all_settings(payload):
    settings = Database.execute_query('SELECT key, value, description, updated_at FROM system_settings')
    return jsonify({'settings': settings or []}), 200

@settings_bp.route('/<string:key>', methods=['GET'])
def get_setting(key):
    # Publicly accessible for some keys (like registration_locked)
    setting = Database.execute_query('SELECT value FROM system_settings WHERE key = %s', (key,))
    if not setting:
        return jsonify({'message': 'Setting not found'}), 404
    return jsonify({'key': key, 'value': setting[0]['value']}), 200

@settings_bp.route('/update', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.admin_required
def update_setting(payload):
    data = request.get_json()
    if not data or 'key' not in data or 'value' not in data:
        return jsonify({'message': 'key and value required'}), 400

    key = data['key']
    raw_value = str(data['value'])
    # Preserve case for session and semester names; lowercase everything else
    value = raw_value if key in ('current_academic_session', 'current_semester') else raw_value.lower()

    if key == 'current_academic_session':
        Database.execute_update("UPDATE academic_sessions SET is_active = FALSE")
        existing = Database.execute_query("SELECT id FROM academic_sessions WHERE name = %s", (value,))
        if existing:
            Database.execute_update("UPDATE academic_sessions SET is_active = TRUE, updated_at = NOW() WHERE name = %s", (value,))
        else:
            Database.execute_update("INSERT INTO academic_sessions (name, is_active, isapplicantactive, created_at, updated_at) VALUES (%s, TRUE, FALSE, NOW(), NOW())", (value,))

        # Re-link all semester rows to the new active session
        Database.execute_update(
            """UPDATE semesters
               SET session_id   = (SELECT id FROM academic_sessions WHERE is_active = TRUE LIMIT 1),
                   updated_at = NOW()"""
        )

        # Update all program fees to link to the new active session
        Database.execute_update(
            """UPDATE program_fees
               SET academic_session_id = (SELECT id FROM academic_sessions WHERE is_active = TRUE LIMIT 1)"""
        )

    if key == 'current_semester':
        # Extract the core semester name (e.g. "First Semester" → "First")
        semester_name = value.replace(' Semester', '').replace(' semester', '').strip()

        # Get the current active academic session
        session_res = Database.execute_query(
            "SELECT id FROM academic_sessions WHERE is_active = TRUE LIMIT 1"
        )
        active_session_id = session_res[0]['id'] if session_res else None

        # Deactivate all semesters
        Database.execute_update(
            "UPDATE semesters SET is_active = FALSE, updated_at = NOW()"
        )

        if active_session_id:
            # Activate the matching semester and link it to the active session
            Database.execute_update(
                """UPDATE semesters
                   SET is_active   = TRUE,
                       session_id  = %s,
                       updated_at  = NOW()
                   WHERE LOWER(name) = LOWER(%s)""",
                (active_session_id, semester_name)
            )

            # Also re-link all other semesters to the active session
            Database.execute_update(
                """UPDATE semesters
                   SET session_id = %s,
                       updated_at = NOW()
                   WHERE session_id IS NULL OR session_id != %s""",
                (active_session_id, active_session_id)
            )

    # Upsert: create the key if it doesn't exist yet (e.g. current_semester)
    success = Database.execute_update(
        '''INSERT INTO system_settings (key, value, updated_at)
           VALUES (%s, %s, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()''',
        (key, value)
    )
    if not success:
        return jsonify({'message': 'Failed to update setting'}), 500
    return jsonify({'message': f'Setting {key} updated successfully', 'value': value}), 200



# ── Semester management ───────────────────────────────────────────────────────

@settings_bp.route('/active-semester', methods=['GET'])
def get_active_semester():
    """Public: return the currently active semester."""
    sem = Database.execute_query(
        """SELECT s.id, s.name, s.is_late, acs.id AS session_id, acs.name AS session_name
           FROM semesters s
           JOIN academic_sessions acs ON acs.id = s.session_id
           WHERE s.is_active = TRUE
           LIMIT 1"""
    )
    if not sem:
        return jsonify({'active_semester': None, 'message': 'No active semester configured'}), 200
    return jsonify({'active_semester': sem[0]}), 200


@settings_bp.route('/activate-semester', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.admin_required
def activate_semester(payload):
    """
    Activate a semester for the current active academic session.

    Body: { "semester_id": <int> }

    Side-effects:
      1. Links ALL semester rows to the active academic_session.
      2. Sets is_active = TRUE only for the chosen semester.
    """
    data = request.get_json() or {}
    semester_id = data.get('semester_id')
    if not semester_id:
        return jsonify({'message': 'semester_id is required'}), 400

    session_res = Database.execute_query(
        "SELECT id, name FROM academic_sessions WHERE is_active = TRUE LIMIT 1"
    )
    if not session_res:
        return jsonify({'message': 'No active academic session. Set one first via /settings/update'}), 400
    active_session_id   = session_res[0]['id']
    active_session_name = session_res[0]['name']

    sem_check = Database.execute_query('SELECT id, name FROM semesters WHERE id = %s', (semester_id,))
    if not sem_check:
        return jsonify({'message': f'Semester id {semester_id} not found'}), 404
    sem_name = sem_check[0]['name']

    # Link all semesters to the active session, then activate only the chosen one
    Database.execute_update(
        "UPDATE semesters SET session_id = %s, is_active = FALSE, updated_at = NOW()",
        (active_session_id,)
    )
    Database.execute_update(
        "UPDATE semesters SET is_active = TRUE, updated_at = NOW() WHERE id = %s",
        (semester_id,)
    )

    return jsonify({
        'message':       f'{sem_name} semester activated for session {active_session_name}',
        'semester_id':   semester_id,
        'semester_name': sem_name,
        'session_id':    active_session_id,
        'session_name':  active_session_name,
    }), 200


@settings_bp.route('/semesters', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admin_required
def list_semesters(payload):
    """List all semesters with their active-session linkage."""
    rows = Database.execute_query(
        """SELECT s.id, s.name, s.is_active, s.is_late,
                  s.session_id, acs.name AS session_name
           FROM semesters s
           LEFT JOIN academic_sessions acs ON acs.id = s.session_id
           ORDER BY s.id"""
    )
    return jsonify({'semesters': rows or []}), 200


@settings_bp.route('/system-status', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admin_required
def get_system_status(payload):
    error_logs = Database.execute_query('SELECT error_type, message, path, created_at FROM error_logs ORDER BY id DESC LIMIT 50')
    errors_404 = [e for e in (error_logs or []) if e['error_type'] == '404']
    errors_500 = [e for e in (error_logs or []) if e['error_type'] == '500']

    try:
        Database.execute_query('SELECT 1')
        db_status = "Connected"
    except Exception:
        db_status = "Error"

    settings_keys = [
        'admission_registration_locked',
        'course_registration_locked',
        'result_upload_locked',
        'undergraduate_admission_locked',
        'postgraduate_admission_locked',
        'part_time_admission_locked',
        'jupeb_admission_locked'
    ]
    settings = Database.execute_query(
        f"SELECT key, value FROM system_settings WHERE key IN ({','.join(['%s']*len(settings_keys))})",
        tuple(settings_keys)
    )

    locks = {
        'admission': False, 'course': False, 'result': False,
        'undergraduate': False, 'postgraduate': False,
        'part_time': False, 'jupeb': False
    }
    for s in (settings or []):
        val = (s['value'] == 'true')
        if   s['key'] == 'admission_registration_locked': locks['admission']     = val
        elif s['key'] == 'course_registration_locked':    locks['course']        = val
        elif s['key'] == 'result_upload_locked':          locks['result']        = val
        elif s['key'] == 'undergraduate_admission_locked':locks['undergraduate'] = val
        elif s['key'] == 'postgraduate_admission_locked': locks['postgraduate']  = val
        elif s['key'] == 'part_time_admission_locked':    locks['part_time']     = val
        elif s['key'] == 'jupeb_admission_locked':        locks['jupeb']         = val

    programs_locked = Database.execute_query("SELECT COUNT(*) as count FROM programs WHERE is_locked = True")

    return jsonify({
        'db_status': db_status,
        'api_status': "Healthy",
        'mailing_status': "Active",
        'counts': {'errors_404': len(errors_404), 'errors_500': len(errors_500)},
        'locks': locks,
        'recent_errors': error_logs or []
    }), 200
