import os
import psycopg2
import psycopg2.pool
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
from dotenv import load_dotenv

load_dotenv()

# Errors that indicate a stale/dropped connection (not a query logic error)
_CONNECTION_ERRORS = (psycopg2.OperationalError, psycopg2.InterfaceError)


class Database:
    _pool = None

    @classmethod
    def _get_pool(cls):
        if cls._pool is None:
            ssl_mode = os.getenv("DATABASE_SSL_MODE", "require")
            dsn = os.getenv("DATABASE_URL")
            cls._pool = psycopg2.pool.ThreadedConnectionPool(
                minconn=2,
                maxconn=10,
                dsn=dsn,
                cursor_factory=RealDictCursor,
                keepalives=1,
                keepalives_idle=30,      # reduced from 60 — ping sooner
                keepalives_interval=10,
                keepalives_count=5,
                sslmode=ssl_mode,
            )
        return cls._pool

    @classmethod
    def _reset_pool(cls):
        """Destroy the pool so the next call to _get_pool() builds a fresh one."""
        try:
            if cls._pool:
                cls._pool.closeall()
        except Exception:
            pass
        cls._pool = None

    @classmethod
    def get_connection(cls):
        """Get a validated connection from the pool."""
        try:
            conn = cls._get_pool().getconn()
            if conn is None:
                return None

            # Discard connections that Neon has already closed on its side
            if conn.closed != 0:
                try:
                    cls._get_pool().putconn(conn, close=True)
                except Exception:
                    pass
                cls._reset_pool()
                conn = cls._get_pool().getconn()

            return conn
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

        cursor = None
        returned = False     # track whether we already put the conn back
        try:
            cursor = conn.cursor()
            yield cursor
            conn.commit()
        except _CONNECTION_ERRORS as e:
            # Stale connection — discard it and reset pool so next request
            # gets a fresh one instead of another broken conn from the pool
            try:
                conn.rollback()
            except Exception:
                pass
            try:
                Database._get_pool().putconn(conn, close=True)
                returned = True
            except Exception:
                pass
            Database._reset_pool()
            raise e
        except Exception as e:
            try:
                conn.rollback()
            except Exception:
                pass
            raise e
        finally:
            if cursor:
                try:
                    cursor.close()
                except Exception:
                    pass
            if not returned:
                Database.release_connection(conn)

    @staticmethod
    def execute_query(query, params=None):
        """Execute a SELECT query and return all rows. Retries once on connection error."""
        for attempt in range(2):
            try:
                with Database.get_cursor() as cursor:
                    cursor.execute(query, params or ())
                    return cursor.fetchall()
            except _CONNECTION_ERRORS as e:
                if attempt == 0:
                    print(f"[DB] Stale connection, retrying query... ({e})")
                    continue
                print(f"Query execution error: {e}")
                return None
            except psycopg2.Error as e:
                print(f"Query execution error: {e}")
                return None

    @staticmethod
    def execute_update(query, params=None, return_id=False):
        """Execute INSERT / UPDATE / DELETE. Retries once on connection error."""
        for attempt in range(2):
            try:
                with Database.get_cursor() as cursor:
                    cursor.execute(query, params or ())
                    if return_id:
                        result = cursor.fetchone()
                        if result:
                            return result.get("id") or result[0]
                        return None
                    return True
            except _CONNECTION_ERRORS as e:
                if attempt == 0:
                    print(f"[DB] Stale connection, retrying update... ({e})")
                    continue
                print(f"Update execution error: {e}")
                return False
            except psycopg2.Error as e:
                print(f"Update execution error: {e}")
                return False