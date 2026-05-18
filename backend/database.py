import os
import psycopg2
import psycopg2.pool
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
from dotenv import load_dotenv

load_dotenv()

class Database:
    _pool = None

    @classmethod
    def _get_pool(cls):
        if cls._pool is None:
            # Allow overriding SSL mode via env var DATABASE_SSL_MODE (e.g. 'disable' for local dev)
            ssl_mode = os.getenv("DATABASE_SSL_MODE", "require")
            conn_params = dict(
                minconn=2,
                maxconn=10,
                dsn=os.getenv("DATABASE_URL"),
                cursor_factory=RealDictCursor,
                keepalives=1,
                keepalives_idle=60,
                keepalives_interval=10,
                keepalives_count=5,
            )
            # Only include sslmode if provided
            if ssl_mode:
                conn_params["sslmode"] = ssl_mode

            cls._pool = psycopg2.pool.ThreadedConnectionPool(**conn_params)
        return cls._pool

    @classmethod
    def get_connection(cls):
        """Get a connection from the pool."""
        try:
            return cls._get_pool().getconn()
        except psycopg2.Error as e:
            print(f"Database connection error: {e}")
            return None

    @classmethod
    def release_connection(cls, conn):
        """Return a connection to the pool."""
        try:
            cls._get_pool().putconn(conn)
        except Exception:
            pass

    @staticmethod
    @contextmanager
    def get_cursor():
        """Context manager: yields a cursor; commits or rolls back; returns conn to pool."""
        conn = Database.get_connection()
        if not conn:
            raise Exception("Failed to connect to database")
        cursor = conn.cursor()
        try:
            yield cursor
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            cursor.close()
            Database.release_connection(conn)

    @staticmethod
    def execute_query(query, params=None):
        """Execute a SELECT query and return all rows."""
        try:
            with Database.get_cursor() as cursor:
                cursor.execute(query, params or ())
                return cursor.fetchall()
        except psycopg2.Error as e:
            print(f"Query execution error: {e}")
            return None

    @staticmethod
    def execute_update(query, params=None, return_id=False):
        """Execute INSERT / UPDATE / DELETE."""
        try:
            with Database.get_cursor() as cursor:
                cursor.execute(query, params or ())
                if return_id:
                    result = cursor.fetchone()
                    if result:
                        return result.get("id") or result[0]
                    return None
                return True
        except psycopg2.Error as e:
            print(f"Update execution error: {e}")
            return False
