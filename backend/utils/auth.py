import jwt
import bcrypt
import hashlib
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify
from config import Config


# ── Password hashing (bcrypt) ─────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hash a password with bcrypt. Returns a UTF-8 string suitable for DB storage."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode(), salt).decode("utf-8")


def _is_legacy_sha256(password_hash: str) -> bool:
    """Detect old SHA-256 hashes: exactly 64 lowercase hex characters."""
    return len(password_hash) == 64 and all(c in "0123456789abcdef" for c in password_hash)


def _sha256_hash(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(password: str, password_hash: str) -> bool:
    """
    Verify a password against either a bcrypt or legacy SHA-256 hash.
    Always returns True/False — never raises.
    """
    try:
        if _is_legacy_sha256(password_hash):
            # Legacy path — compare with SHA-256
            return _sha256_hash(password) == password_hash
        # Bcrypt path
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except Exception:
        return False


def maybe_upgrade_hash(user_id: int, password: str, stored_hash: str) -> None:
    """
    If the stored hash is still SHA-256, silently re-hash with bcrypt and update
    the DB. Called after a successful login so migration is seamless.
    """
    if not _is_legacy_sha256(stored_hash):
        return  # Already bcrypt — nothing to do

    try:
        from database import Database
        new_hash = hash_password(password)
        Database.execute_update(
            "UPDATE users SET password_hash = %s WHERE id = %s",
            (new_hash, user_id),
        )
    except Exception as e:
        # Non-fatal: user still logged in, hash upgrade retries on next login
        print(f"[auth] Hash upgrade failed for user {user_id}: {e}")


# ── JWT utilities ─────────────────────────────────────────────────────────────

def generate_token(user_id, role, expires_in=3600) -> str:
    """Generate a signed JWT token (1-hour expiry by default)."""
    payload = {
        "user_id": user_id,
        "role": role,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(seconds=expires_in),
    }
    return jwt.encode(payload, Config.JWT_SECRET, algorithm="HS256")


def verify_token(token):
    """Verify and decode a JWT token. Returns payload dict or {'error': ...}."""
    try:
        return jwt.decode(token, Config.JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return {"error": "session expired"}
    except jwt.InvalidTokenError:
        return {"error": "error"}


# ── Route decorators ──────────────────────────────────────────────────────────

def token_required(f):
    """Decorator: protect routes with a valid JWT Bearer token."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if "Authorization" in request.headers:
            try:
                token = request.headers["Authorization"].split(" ")[1]
            except IndexError:
                return jsonify({"message": "error"}), 401

        if not token:
            return jsonify({"message": "error"}), 401

        payload = verify_token(token)
        if "error" in payload:
            return jsonify({"message": payload["error"]}), 401

        return f(payload, *args, **kwargs)
    return decorated


def admin_required(f):
    """Decorator: restrict to admin / ICT Director."""
    @wraps(f)
    def decorated(payload, *args, **kwargs):
        if payload.get("role") not in ["admin", "ict_director"]:
            return jsonify({"message": "Access denied"}), 403
        return f(payload, *args, **kwargs)
    return decorated


def admissions_officer_required(f):
    """Decorator: restrict to Admissions Officer."""
    @wraps(f)
    def decorated(payload, *args, **kwargs):
        if payload.get("role") != "admissionofficer":
            return jsonify({"message": "Access denied"}), 403
        return f(payload, *args, **kwargs)
    return decorated


def pgdean_required(f):
    """Decorator: restrict to PG Dean/Admin and admin."""
    @wraps(f)
    def decorated(payload, *args, **kwargs):
        if payload.get("role") not in ("pgdean", "pgadmin", "admin"):
            return jsonify({"message": "Access denied"}), 403
        return f(payload, *args, **kwargs)
    return decorated


def pgadmin_required(f):
    """Decorator: restrict to PG Admin/Dean and admin."""
    @wraps(f)
    def decorated(payload, *args, **kwargs):
        if payload.get("role") not in ("pgadmin", "pgdean", "admin"):
            return jsonify({"message": "Access denied"}), 403
        return f(payload, *args, **kwargs)
    return decorated


def roles_required(*roles):
    """Decorator: restrict to a set of roles."""
    def decorator(f):
        @wraps(f)
        def decorated(payload, *args, **kwargs):
            if payload.get("role") not in roles:
                allowed = ", ".join(roles)
                return jsonify({"message": f"Access denied. Required role(s): {allowed}"}), 403
            return f(payload, *args, **kwargs)
        return decorated
    return decorator


def require_password_change(f):
    """Decorator: block students who haven't done their first-login password change."""
    @wraps(f)
    def decorated(payload, *args, **kwargs):
        if payload.get("role") == "student":
            from database import Database
            auth_row = Database.execute_query(
                "SELECT is_first_login FROM student_auth WHERE userid = %s",
                (payload["user_id"],),
            )
            if auth_row and auth_row[0].get("is_first_login"):
                return jsonify({
                    "message": "Password change required before accessing student resources.",
                    "require_password_change": True,
                }), 403
        return f(payload, *args, **kwargs)
    return decorated


# ── Convenience class (keeps existing call-sites working) ─────────────────────

class AuthHandler:
    hash_password               = staticmethod(hash_password)
    verify_password             = staticmethod(verify_password)
    maybe_upgrade_hash          = staticmethod(maybe_upgrade_hash)
    generate_token              = staticmethod(generate_token)
    token_required              = staticmethod(token_required)
    admin_required              = staticmethod(admin_required)
    admissions_officer_required = staticmethod(admissions_officer_required)
    pgdean_required             = staticmethod(pgdean_required)
    pgadmin_required            = staticmethod(pgadmin_required)
    roles_required              = staticmethod(roles_required)
    require_password_change     = staticmethod(require_password_change)
