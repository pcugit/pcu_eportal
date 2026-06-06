from flask import Blueprint, request, jsonify
from database import Database
from utils.auth import AuthHandler
from datetime import datetime, timedelta
import re

auth_bp = Blueprint('auth', __name__)

def get_student_auth(user_id):
    auth_rows = Database.execute_query(
        'SELECT id, userid, studentid, is_first_login, failed_attempts, locked_until '
        'FROM student_auth WHERE userid = %s',
        (user_id,)
    )
    return auth_rows[0] if auth_rows else None

def create_student_auth(user_id, is_first_login=False):
    student_row = Database.execute_query(
        'SELECT "Id" as id FROM students WHERE "UserId" = %s LIMIT 1',
        (user_id,)
    )
    student_id = student_row[0]['id'] if student_row else None
    Database.execute_update(
        'INSERT INTO student_auth (userid, studentid, is_first_login, last_login, failed_attempts, locked_until, createddate, updateddate) '
        'VALUES (%s, %s, %s, NULL, 0, NULL, NOW(), NOW()) '
        'ON CONFLICT (userid) DO NOTHING',
        (user_id, student_id, is_first_login)
    )
    return get_student_auth(user_id)

def update_student_auth_on_success(user_id):
    if not get_student_auth(user_id):
        create_student_auth(user_id)
    Database.execute_update(
        'UPDATE student_auth '
        'SET last_login = NOW(), failed_attempts = 0, locked_until = NULL, updateddate = NOW() '
        'WHERE userid = %s',
        (user_id,)
    )

def is_student_locked(student_auth):
    return bool(
        student_auth
        and student_auth.get('locked_until')
        and student_auth['locked_until'] > datetime.utcnow()
    )

def is_student_password_change_required(user_id):
    auth = get_student_auth(user_id)
    return bool(auth and auth.get('is_first_login'))

def require_password_change(f):
    @wraps(f)
    def decorated(payload, *args, **kwargs):
        if payload.get('role') == 'student' and is_student_password_change_required(payload['user_id']):
            return jsonify({
                'message': 'Password change required before accessing course reg.',
                'require_password_change': True,
            }), 403
        return f(payload, *args, **kwargs)
    return decorated

@auth_bp.route('/signup', methods=['POST'])
def signup():
    """Create new user account"""
    # TEMPORARILY DISABLED — uncomment to re-enable the portal lock check
    # res = Database.execute_query("SELECT value FROM system_settings WHERE key = 'admission_registration_locked'")
    # if res and res[0]['value'] == 'true':
    #     return jsonify({'message': 'Admission registration is currently closed.'}), 403
        
    data = request.get_json()
    
    # Accept both (first_name + last_name) OR a single (name) field
    if not data:
        return jsonify({'message': 'Missing request body'}), 400

    first_name = data.get('first_name', '').strip()
    last_name  = data.get('last_name', '').strip()

    # Allow full_name or name as an alternative
    if not first_name and not last_name:
        full_name = data.get('name', data.get('full_name', '')).strip()
        if not full_name:
            return jsonify({'message': 'Missing required fields'}), 400
        parts = full_name.split(' ', 1)
        first_name = parts[0]
        last_name  = parts[1] if len(parts) > 1 else ''
    
    middle_name = data.get('middle_name', '').strip()
    full_name = f"{first_name} {last_name}".strip()

    if not all(k in data for k in ['email', 'password', 'phone_number']):
        return jsonify({'message': 'Missing required fields'}), 400

    # Validate email format
    email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(email_regex, data['email']):
        return jsonify({'message': 'Invalid email format'}), 400
    
    if len(data['password']) < 6:
        return jsonify({'message': 'Password must be at least 6 characters'}), 400
    
    # Check if email already exists
    existing_user = Database.execute_query(
        'SELECT id FROM users WHERE email = %s',
        (data['email'],)
    )
    if existing_user:
        return jsonify({'message': 'Email already registered'}), 409
    
    password_hash = AuthHandler.hash_password(data['password'])
    
    import random
    base_username = data['email'].split('@')[0][:40]
    generated_username = f"{base_username}{random.randint(1000, 9999)}"

    # Insert into new schema
    # Use user_type_id 1 (freshapplicant) until a form is purchased
    user_id = Database.execute_update(
        'INSERT INTO users (firstname, surname, middlename, email, password_hash, phone_number, user_type_id, username) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id',
        (first_name, last_name, middle_name, data['email'], password_hash, data['phone_number'], 1, generated_username),
        return_id=True
    )
    
    if not user_id:
        return jsonify({'message': 'Failed to create account'}), 500
 
    token = AuthHandler.generate_token(user_id, 'freshapplicant')
    
    return jsonify({
        'message': 'Account created successfully',
        'token': token,
        'user': {
            'id': user_id,
            'first_name': first_name,
            'last_name': last_name,
            'name': full_name,
            'email': data['email'],
            'phone_number': data['phone_number'],
            'username': generated_username,
            'role': 'applicant'
        }
    }), 201

@auth_bp.route('/login', methods=['POST'])
def login():
    """User login"""
    data = request.get_json()
    
    if not data or not all(k in data for k in ['email', 'password']):
        return jsonify({'message': 'Missing email or password'}), 400

    identifier = data['email'].strip()
    if not identifier:
        return jsonify({'message': 'Missing email or password'}), 400

    # Query user by email or matric number, joining user_types and roles to get the role string
    users = Database.execute_query(
        '''SELECT u.id, u.firstname, u.surname, u.middlename, u.email, u.username, 
                  u.password_hash, u.user_type_id, u.phone_number, r.name AS role 
           FROM users u
           LEFT JOIN user_types ut ON ut.id = u.user_type_id
           LEFT JOIN roles r ON r.id = ut.role_id
           WHERE u.email = %s OR u.matric_no = %s''',
        (identifier, identifier)
    )
    
    if not users:
        return jsonify({'message': 'Invalid credentials'}), 401
    
    user = users[0]
    
    raw_role = user.get('role')
    if raw_role:
        role = raw_role.lower()  # Normalize to lower case for token and logic ('freshapplicant', 'applicant', 'student')
    else:
        user_type_id = user.get('user_type_id', 1)
        if user_type_id == 1:
            role = 'freshapplicant'
        elif user_type_id == 2:
            role = 'applicant'
        else:
            role = 'applicant' # fallback

    portal = data.get('portal', '')
    if role == 'student' and portal == 'student' and '@' in identifier:
        return jsonify({
            'message': 'sign in with matric number.'
        }), 401

    student_auth: dict | None = None
    if role == 'student':
        student_auth = get_student_auth(user['id'])
        if is_student_locked(student_auth):
            return jsonify({
                'message': 'Account temporarily locked due to too many failed login attempts. Please try again later.',
                'locked_until': student_auth['locked_until'].isoformat() if student_auth and student_auth.get('locked_until') else None,
            }), 403

    if not AuthHandler.verify_password(data['password'], user['password_hash']):
        if role == 'student':
            student_auth = student_auth or create_student_auth(user['id'])
            failed_attempts = ((student_auth['failed_attempts'] if student_auth and 'failed_attempts' in student_auth else 0) or 0) + 1
            locked_until = None
            if failed_attempts >= 5:
                locked_until = datetime.utcnow() + timedelta(minutes=5)

            Database.execute_update(
                'UPDATE student_auth '
                'SET failed_attempts = %s, locked_until = %s, updateddate = NOW() '
                'WHERE userid = %s',
                (failed_attempts, locked_until, user['id'])
            )

            if locked_until:
                return jsonify({
                    'message': 'Account temporarily locked due to too many failed login attempts. Please try again later.',
                    'locked_until': locked_until.isoformat(),
                }), 403

        return jsonify({'message': 'Invalid credentials'}), 401

    token = AuthHandler.generate_token(user['id'], role)

    if role == 'student':
        update_student_auth_on_success(user['id'])
    
    first_name = user.get('firstname', '')
    last_name = user.get('surname', '')
    middle_name = user.get('middlename', '')
    full_name = f"{first_name} {middle_name} {last_name}".replace("  ", " ").strip()

    # Get applicant or student status
    extra_data = {}
    if role in ('applicant', 'admitted'):
        # Both applicants and admitted users (user_type_id=13) carry applicant data
        pg_app = Database.execute_query(
            'SELECT uuid AS id, applicant_stage FROM pg_application WHERE user_id = %s ORDER BY created_date DESC LIMIT 1',
            (user['id'],)
        )
        if pg_app:
            extra_data['applicant'] = pg_app[0]
            session_res = Database.execute_query("SELECT name as value FROM academic_sessions WHERE is_active = TRUE LIMIT 1")
            if session_res:
                extra_data['applicant']['session'] = session_res[0]['value']
        else:
            applications = Database.execute_query(
                'SELECT id, applicant_stage FROM applications WHERE user_id = %s ORDER BY created_at DESC LIMIT 1',
                (user['id'],)
            )
            if applications:
                extra_data['applicant'] = applications[0]
                session_res = Database.execute_query("SELECT name as value FROM academic_sessions WHERE is_active = TRUE LIMIT 1")
                if session_res:
                    extra_data['applicant']['session'] = session_res[0]['value']
            
    elif role == 'student':
        is_pg = bool(Database.execute_query('SELECT uuid FROM pg_application WHERE user_id = %s LIMIT 1', (user['id'],)))
        if is_pg:
            students = Database.execute_query(
                '''SELECT s."Id" as id, s."MatricNo" as matric_number, 
                          COALESCE(pg.proposed_course, 0) as program_id,
                          l.name as current_level, acs.name as session, 
                          COALESCE(sa.is_first_login, FALSE) as is_first_login,
                          ps.name as program_name 
                   FROM students s 
                   JOIN users u ON s."UserId" = u.id
                   LEFT JOIN student_auth sa ON sa.userid = u.id
                   LEFT JOIN pg_application pg ON pg.user_id = u.id
                   LEFT JOIN level l ON s.current_level_id = l.id
                   LEFT JOIN academic_sessions acs ON pg.academic_session_id = acs.id
                   LEFT JOIN pg_program_setup ps ON pg.proposed_course = ps.id
                   WHERE s."UserId" = %s
                   ORDER BY pg.updated_date DESC LIMIT 1''',
                (user['id'],)
            )
        else:
            students = Database.execute_query(
                '''SELECT s."Id" as id, s."MatricNo" as matric_number, 
                          COALESCE(a.program_setup_id, 0) as program_id,
                          l.name as current_level, acs.name as session, 
                          COALESCE(sa.is_first_login, FALSE) as is_first_login,
                          ps.name as program_name 
                   FROM students s 
                   JOIN users u ON s."UserId" = u.id
                   LEFT JOIN student_auth sa ON sa.userid = u.id
                   LEFT JOIN applications a ON a.user_id = u.id
                   LEFT JOIN level l ON s.current_level_id = l.id
                   LEFT JOIN academic_sessions acs ON a.academic_session_id = acs.id
                   LEFT JOIN program_setup ps ON COALESCE(a.program_setup_id, 0) = ps.id OR (a.program_setup_id IS NULL AND a.degree_id = ps.degree_id)
                   WHERE s."UserId" = %s
                   ORDER BY a.updated_at DESC LIMIT 1''',
                (user['id'],)
            )
        if students:
            extra_data['student'] = students[0]
    
    return jsonify({
        'message': 'Login successful',
        'token': token,
        'user': {
            'id': user['id'],
            'name': full_name,
            'first_name': first_name,
            'last_name': last_name,
            'email': user['email'],
            'phone_number': user.get('phone_number'),
            'username': user.get('username'),
            'role': role
        },
        **extra_data
    }), 200

@auth_bp.route('/verify-token', methods=['GET'])
@AuthHandler.token_required
def verify_token(payload):
    """Verify JWT token validity and return user info"""
    user_id = payload['user_id']
    
    user = Database.execute_query(
        '''SELECT u.id, u.firstname, u.surname, u.middlename, u.email, u.username, 
                  u.user_type_id, u.phone_number, r.name AS role 
           FROM users u
           LEFT JOIN user_types ut ON ut.id = u.user_type_id
           LEFT JOIN roles r ON r.id = ut.role_id
           WHERE u.id = %s''',
        (user_id,)
    )
    
    if not user:
        return jsonify({'message': 'User not found'}), 404
        
    user_data = user[0]
    
    current_token_role = payload.get('role')
    raw_role = user_data.get('role')
    if raw_role:
        role = raw_role.lower()
    else:
        user_type_id = user_data.get('user_type_id', 1)
        if user_type_id == 1:
            role = 'freshapplicant'
        elif user_type_id == 2:
            role = 'applicant'
        else:
            role = 'applicant'

    # Preserve access for an already authenticated admitted student session until logout.
    if current_token_role == 'admitted' and role == 'student':
        role = 'admitted'

    first_name = user_data.get('firstname', '')
    last_name = user_data.get('surname', '')
    middle_name = user_data.get('middlename', '')
    full_name = f"{first_name} {middle_name} {last_name}".replace("  ", " ").strip()
    
    extra_data = {}
    if role in ('applicant', 'admitted'):
        # Both applicants and admitted users (user_type_id=13) carry applicant data
        pg_app = Database.execute_query(
            'SELECT uuid AS id, applicant_stage FROM pg_application WHERE user_id = %s ORDER BY created_date DESC LIMIT 1',
            (user_id,)
        )
        if pg_app:
            extra_data['applicant'] = pg_app[0]
            session_res = Database.execute_query("SELECT name as value FROM academic_sessions WHERE is_active = TRUE LIMIT 1")
            if session_res:
                extra_data['applicant']['session'] = session_res[0]['value']
        else:
            applications = Database.execute_query(
                'SELECT id, applicant_stage FROM applications WHERE user_id = %s ORDER BY created_at DESC LIMIT 1',
                (user_id,)
            )
            if applications:
                extra_data['applicant'] = applications[0]
                session_res = Database.execute_query("SELECT name as value FROM academic_sessions WHERE is_active = TRUE LIMIT 1")
                if session_res:
                    extra_data['applicant']['session'] = session_res[0]['value']
            
    elif role == 'student':
        is_pg = bool(Database.execute_query('SELECT uuid FROM pg_application WHERE user_id = %s LIMIT 1', (user_id,)))
        if is_pg:
            students = Database.execute_query(
                '''SELECT s."Id" as id, s."MatricNo" as matric_number, 
                          COALESCE(pg.proposed_course, 0) as program_id,
                          l.name as current_level, acs.name as session, 
                          COALESCE(sa.is_first_login, FALSE) as is_first_login,
                          ps.name as program_name 
                   FROM students s 
                   JOIN users u ON s."UserId" = u.id
                   LEFT JOIN student_auth sa ON sa.userid = u.id
                   LEFT JOIN pg_application pg ON pg.user_id = u.id
                   LEFT JOIN level l ON s.current_level_id = l.id
                   LEFT JOIN academic_sessions acs ON pg.academic_session_id = acs.id
                   LEFT JOIN pg_program_setup ps ON pg.proposed_course = ps.id
                   WHERE s."UserId" = %s
                   ORDER BY pg.updated_date DESC LIMIT 1''',
                (user_id,)
            )
        else:
            students = Database.execute_query(
                '''SELECT s."Id" as id, s."MatricNo" as matric_number, 
                          COALESCE(a.program_setup_id, 0) as program_id,
                          l.name as current_level, acs.name as session, 
                          COALESCE(sa.is_first_login, FALSE) as is_first_login,
                          ps.name as program_name 
                   FROM students s 
                   JOIN users u ON s."UserId" = u.id
                   LEFT JOIN student_auth sa ON sa.userid = u.id
                   LEFT JOIN applications a ON a.user_id = u.id
                   LEFT JOIN level l ON s.current_level_id = l.id
                   LEFT JOIN academic_sessions acs ON a.academic_session_id = acs.id
                   LEFT JOIN program_setup ps ON COALESCE(a.program_setup_id, 0) = ps.id OR (a.program_setup_id IS NULL AND a.degree_id = ps.degree_id)
                   WHERE s."UserId" = %s
                   ORDER BY a.updated_at DESC LIMIT 1''',
                (user_id,)
            )
        if students:
            extra_data['student'] = students[0]
            
    return jsonify({
        'message': 'Token is valid',
        'token': AuthHandler.generate_token(user_data['id'], role),
        'user': {
            'id': user_data['id'],
            'name': full_name,
            'first_name': first_name,
            'last_name': last_name,
            'email': user_data['email'],
            'phone_number': user_data.get('phone_number'),
            'username': user_data.get('username'),
            'role': role
        },
        **extra_data
    }), 200

@auth_bp.route('/change-password', methods=['POST'])
@AuthHandler.token_required
def change_password(payload):
    """Update user password"""
    user_id = payload['user_id']
    data = request.get_json()
    
    if not data or not data.get('new_password'):
        return jsonify({'message': 'Missing new password'}), 400
        
    if len(data['new_password']) < 6:
        return jsonify({'message': 'New password must be at least 6 characters'}), 400
        
    # Optional: Verify current password if provided
    current_password = data.get('current_password')
    if current_password:
        user = Database.execute_query(
            'SELECT password_hash FROM users WHERE id = %s',
            (user_id,)
        )
        if user and not AuthHandler.verify_password(current_password, user[0]['password_hash']):
            return jsonify({'message': 'Current password is incorrect'}), 401
        
    # Hash and update
    new_hash = AuthHandler.hash_password(data['new_password'])
    success = Database.execute_update(
        'UPDATE users SET password_hash = %s WHERE id = %s',
        (new_hash, user_id)
    )
    
    if not success:
        return jsonify({'message': 'Failed to update password'}), 500

    if payload.get('role') == 'student':
        student_row = Database.execute_query(
            'SELECT "Id" as id FROM students WHERE "UserId" = %s LIMIT 1',
            (user_id,)
        )
        student_id = student_row[0]['id'] if student_row else None
        Database.execute_update(
            '''INSERT INTO student_auth (userid, studentid, is_first_login, password_changed_at, updateddate)
               VALUES (%s, %s, FALSE, NOW(), NOW())
               ON CONFLICT (userid) DO UPDATE SET
                   is_first_login = FALSE,
                   password_changed_at = NOW(),
                   updateddate = NOW()''',
            (user_id, student_id)
        )
        
    return jsonify({'message': 'Password changed successfully'}), 200

@auth_bp.route('/logout', methods=['POST'])
def logout():
    return jsonify({'message': 'Logged out successfully'}), 200
