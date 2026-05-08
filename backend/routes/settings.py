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
    value = raw_value.lower() if key != 'current_academic_session' else raw_value # Don't lower session names like 2025/2026
    
    if key == 'current_academic_session':
        # 1. Set all sessions to inactive
        Database.execute_update("UPDATE academic_sessions SET is_active = FALSE")
        
        # 2. Check if this session exists
        existing = Database.execute_query("SELECT id FROM academic_sessions WHERE name = %s", (value,))
        
        if existing:
            # 3. Update existing session to active
            Database.execute_update("UPDATE academic_sessions SET is_active = TRUE, updated_at = NOW() WHERE name = %s", (value,))
        else:
            # 4. Insert new active session
            Database.execute_update("INSERT INTO academic_sessions (name, is_active, created_at, updated_at) VALUES (%s, TRUE, NOW(), NOW())", (value,))

    success = Database.execute_update(
        'UPDATE system_settings SET value = %s, updated_at = NOW() WHERE key = %s',
        (value, key)
    )
    
    if not success:
        return jsonify({'message': 'Failed to update setting'}), 500
        
    return jsonify({'message': f'Setting {key} updated successfully', 'value': value}), 200

@settings_bp.route('/system-status', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admin_required
def get_system_status(payload):
    # Fetch errors
    error_logs = Database.execute_query('SELECT error_type, message, path, created_at FROM error_logs ORDER BY id DESC LIMIT 50')
    errors_404 = [e for e in (error_logs or []) if e['error_type'] == '404']
    errors_500 = [e for e in (error_logs or []) if e['error_type'] == '500']
    
    # Check DB
    try:
        Database.execute_query('SELECT 1')
        db_status = "Connected"
    except Exception as e:
        db_status = "Error"
        
    # Check locks
    settings_keys = [
        'admission_registration_locked', 
        'course_registration_locked', 
        'result_upload_locked',
        'undergraduate_admission_locked',
        'postgraduate_admission_locked',
        'part_time_admission_locked',
        'jupeb_admission_locked'
    ]
    settings = Database.execute_query(f"SELECT key, value FROM system_settings WHERE key IN ({','.join(['%s']*len(settings_keys))})", tuple(settings_keys))
    
    locks = {
        'admission': False,
        'course': False,
        'result': False,
        'undergraduate': False,
        'postgraduate': False,
        'part_time': False,
        'jupeb': False
    }
    
    for s in (settings or []):
        val = (s['value'] == 'true')
        if s['key'] == 'admission_registration_locked': locks['admission'] = val
        elif s['key'] == 'course_registration_locked': locks['course'] = val
        elif s['key'] == 'result_upload_locked': locks['result'] = val
        elif s['key'] == 'undergraduate_admission_locked': locks['undergraduate'] = val
        elif s['key'] == 'postgraduate_admission_locked': locks['postgraduate'] = val
        elif s['key'] == 'part_time_admission_locked': locks['part_time'] = val
        elif s['key'] == 'jupeb_admission_locked': locks['jupeb'] = val
            
    programs_locked = Database.execute_query("SELECT COUNT(*) as count FROM programs WHERE is_locked = True")
    prog_locked_count = programs_locked[0]['count'] if programs_locked else 0
    
    return jsonify({
        'db_status': db_status,
        'api_status': "Healthy",
        'mailing_status': "Active",
        'counts': {
            'errors_404': len(errors_404),
            'errors_500': len(errors_500)
        },
        'locks': locks,
        'recent_errors': error_logs or []
    }), 200
