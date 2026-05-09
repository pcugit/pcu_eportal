import jwt
import hashlib
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify
from config import Config


def hash_password(password: str) -> str:
    """Hash password using SHA256 (in production, use bcrypt)"""
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, password_hash: str) -> bool:
    """Verify password against hash"""
    return hash_password(password) == password_hash

# -----------------------------
# JWT utilities
# -----------------------------
def generate_token(user_id, role, expires_in=86400) -> str:
    """Generate JWT token (default: 24 hours)"""
    payload = {
        'user_id': user_id,
        'role': role,
        'iat': datetime.utcnow(),
        'exp': datetime.utcnow() + timedelta(seconds=expires_in)
    }
    token = jwt.encode(payload, Config.JWT_SECRET, algorithm='HS256')
    return token

def verify_token(token):
    """Verify and decode JWT token"""
    try:
        payload = jwt.decode(token, Config.JWT_SECRET, algorithms=['HS256'])
        return payload
    except jwt.ExpiredSignatureError:
        return {'error': 'Token expired'}
    except jwt.InvalidTokenError:
        return {'error': 'Invalid token'}

def token_required(f):
    """Decorator to protect routes with JWT token"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None

        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]
            except IndexError:
                return jsonify({'message': 'Invalid token format'}), 401

        if not token:
            return jsonify({'message': 'Token is missing'}), 401

        payload = verify_token(token)
        if 'error' in payload:
            return jsonify({'message': payload['error']}), 401

        return f(payload, *args, **kwargs)

    return decorated

def admin_required(f):
    """Decorator to protect admin-only routes (ICT Director)"""
    @wraps(f)
    def decorated(payload, *args, **kwargs):
        if payload.get('role') not in ['admin', 'ict_director']:
            return jsonify({'message': 'Admin access required'}), 403
        return f(payload, *args, **kwargs)
    return decorated

def admissions_officer_required(f):
    """Decorator to protect admissions officer routes (Strictly Admissions Officer)"""
    @wraps(f)
    def decorated(payload, *args, **kwargs):
        if payload.get('role') != 'admissionofficer':
            return jsonify({'message': 'Admissions Officer access required'}), 403
        return f(payload, *args, **kwargs)
    return decorated

def roles_required(*roles):
    """Restrict access to one or more roles. Must be stacked AFTER @token_required.

    Usage:
        @token_required
        @roles_required('lecturer', 'deo', 'admin')
        def my_view(payload): ...
    """
    def decorator(f):
        @wraps(f)
        def decorated(payload, *args, **kwargs):
            if payload.get('role') not in roles:
                allowed = ', '.join(roles)
                return jsonify({'message': f'Access denied. Required role(s): {allowed}'}), 403
            return f(payload, *args, **kwargs)
        return decorated
    return decorator


class AuthHandler:
    hash_password   = staticmethod(hash_password)
    verify_password = staticmethod(verify_password)
    generate_token  = staticmethod(generate_token)
    token_required  = staticmethod(token_required)
    admin_required  = staticmethod(admin_required)
    admissions_officer_required = staticmethod(admissions_officer_required)
    roles_required  = staticmethod(roles_required)
