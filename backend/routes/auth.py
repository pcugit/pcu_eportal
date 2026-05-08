from flask import Blueprint, request, jsonify
from database import Database
from utils.auth import AuthHandler
import re

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/signup', methods=['POST'])
def signup():
    """Create new user account"""
    # Check if admission registration is locked
    res = Database.execute_query("SELECT value FROM system_settings WHERE key = 'admission_registration_locked'")
    if res and res[0]['value'] == 'true':
        return jsonify({'message': 'Admission registration is currently closed.'}), 403
        
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
    
    # Query user by email or username, joining user_types and roles to get the role string
    users = Database.execute_query(
        '''SELECT u.id, u.firstname, u.surname, u.middlename, u.email, u.username, 
                  u.password_hash, u.user_type_id, u.phone_number, r.name AS role 
           FROM users u
           LEFT JOIN user_types ut ON ut.id = u.user_type_id
           LEFT JOIN roles r ON r.id = ut.role_id
           WHERE u.email = %s OR u.username = %s''',
        (data['email'], data['email'])
    )
    
    if not users:
        return jsonify({'message': 'Invalid credentials'}), 401
    
    user = users[0]
    
    if not AuthHandler.verify_password(data['password'], user['password_hash']):
        return jsonify({'message': 'Invalid credentials'}), 401
    
    # Extract role directly from the query result
    # Fallback to 'freshapplicant' if role is not set or the join failed
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

    token = AuthHandler.generate_token(user['id'], role)
    
    first_name = user.get('firstname', '')
    last_name = user.get('surname', '')
    middle_name = user.get('middlename', '')
    full_name = f"{first_name} {middle_name} {last_name}".replace("  ", " ").strip()

    # Get applicant or student status
    extra_data = {}
    if role == 'applicant':
        applications = Database.execute_query(
            'SELECT id, applicant_stage FROM applications WHERE user_id = %s',
            (user['id'],)
        )
        if applications:
            extra_data['applicant'] = applications[0]
            
            # Pull academic session from academic_sessions table
            session_res = Database.execute_query("SELECT name as value FROM academic_sessions WHERE is_active = TRUE LIMIT 1")
            if session_res:
                extra_data['applicant']['session'] = session_res[0]['value']
            
    elif role == 'student':
        students = Database.execute_query(
            '''SELECT s.id, s.matric_number, s.program_id, s.current_level, s.session, s.is_first_login, p.name as program_name 
               FROM students s 
               LEFT JOIN programs p ON s.program_id = p.id 
               WHERE s.user_id = %s''',
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

    first_name = user_data.get('firstname', '')
    last_name = user_data.get('surname', '')
    middle_name = user_data.get('middlename', '')
    full_name = f"{first_name} {middle_name} {last_name}".replace("  ", " ").strip()
    
    extra_data = {}
    if role == 'applicant':
        applications = Database.execute_query(
            'SELECT id, applicant_stage FROM applications WHERE user_id = %s',
            (user_id,)
        )
        if applications:
            extra_data['applicant'] = applications[0]
            
            # Pull academic session from academic_sessions table
            session_res = Database.execute_query("SELECT name as value FROM academic_sessions WHERE is_active = TRUE LIMIT 1")
            if session_res:
                extra_data['applicant']['session'] = session_res[0]['value']
            
    elif role == 'student':
        students = Database.execute_query(
            '''SELECT s.id, s.matric_number, s.program_id, s.current_level, s.session, s.is_first_login, p.name as program_name 
               FROM students s 
               LEFT JOIN programs p ON s.program_id = p.id 
               WHERE s.user_id = %s''',
            (user_id,)
        )
        if students:
            extra_data['student'] = students[0]
            
    return jsonify({
        'message': 'Token is valid',
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
        
    return jsonify({'message': 'Password changed successfully'}), 200

@auth_bp.route('/logout', methods=['POST'])
def logout():
    """Logout endpoint (token is invalidated on client side)"""
    return jsonify({'message': 'Logged out successfully'}), 200
