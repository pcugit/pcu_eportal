from database import Database


SOURCE_CONFIG = {
    'ug': {'master': 'master_results', 'course': 'course'},
    'pg': {'master': 'pg_master_results', 'course': 'pg_courses'},
}


def ensure_outstanding_course_schema():
    Database.execute_update('''
        CREATE TABLE IF NOT EXISTS outstanding_courses (
            id SERIAL PRIMARY KEY,
            student_id INTEGER NOT NULL,
            matric_no VARCHAR(255) NOT NULL,
            course_source VARCHAR(10) NOT NULL CHECK (course_source IN ('ug', 'pg')),
            course_id INTEGER NOT NULL,
            course_code VARCHAR(255) NOT NULL,
            course_title VARCHAR(255),
            course_unit INTEGER,
            status VARCHAR(20) NOT NULL DEFAULT 'outstanding'
                CHECK (status IN ('outstanding', 'cleared')),
            latest_result_id INTEGER NOT NULL,
            failed_session VARCHAR(255),
            failed_semester VARCHAR(255),
            failed_score NUMERIC,
            cleared_result_id INTEGER,
            cleared_session VARCHAR(255),
            cleared_semester VARCHAR(255),
            cleared_score NUMERIC,
            first_failed_at TIMESTAMP DEFAULT NOW(),
            cleared_at TIMESTAMP,
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE (student_id, course_source, course_id)
        )
    ''')
    Database.execute_update('''
        CREATE INDEX IF NOT EXISTS outstanding_courses_student_status
        ON outstanding_courses (student_id, course_source, status)
    ''')
    Database.execute_update('''
        CREATE TABLE IF NOT EXISTS outstanding_course_history (
            id SERIAL PRIMARY KEY,
            outstanding_course_id INTEGER NOT NULL REFERENCES outstanding_courses(id) ON DELETE CASCADE,
            event_type VARCHAR(30) NOT NULL,
            result_id INTEGER NOT NULL,
            session VARCHAR(255),
            semester VARCHAR(255),
            score NUMERIC,
            grade VARCHAR(10),
            processed_by UUID,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE (outstanding_course_id, event_type, result_id)
        )
    ''')
    Database.execute_update('''
        CREATE OR REPLACE FUNCTION prevent_graduation_with_outstanding_courses()
        RETURNS TRIGGER AS $$
        BEGIN
            IF NEW."IsGraduate" IS TRUE
               AND COALESCE(OLD."IsGraduate", FALSE) IS FALSE
               AND EXISTS (
                   SELECT 1
                   FROM outstanding_courses oc
                   WHERE oc.student_id = NEW."Id"
                     AND oc.status = 'outstanding'
               ) THEN
                RAISE EXCEPTION 'Student has outstanding failed courses and is not eligible for graduation';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    ''')
    Database.execute_update('''
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_trigger
                WHERE tgname = 'students_prevent_graduation_with_outstanding_courses'
            ) THEN
                CREATE TRIGGER students_prevent_graduation_with_outstanding_courses
                BEFORE UPDATE OF "IsGraduate" ON students
                FOR EACH ROW
                EXECUTE FUNCTION prevent_graduation_with_outstanding_courses();
            END IF;
        END $$
    ''')


def backfill_outstanding_courses(is_pg=False):
    course_source = 'pg' if is_pg else 'ug'
    master_table = SOURCE_CONFIG[course_source]['master']
    course_table = SOURCE_CONFIG[course_source]['course']

    if is_pg:
        Database.execute_update(f'''
            WITH unique_courses AS (
                SELECT UPPER(REPLACE(course_code, ' ', '')) AS code_key,
                       MIN(id) AS course_id
                FROM {course_table}
                GROUP BY UPPER(REPLACE(course_code, ' ', ''))
                HAVING COUNT(*) = 1
            )
            UPDATE {master_table} mr
            SET course_id = uc.course_id
            FROM unique_courses uc
            WHERE mr.course_id IS NULL
              AND UPPER(REPLACE(mr.course_code, ' ', '')) = uc.code_key
        ''')
    else:
        Database.execute_update(f'''
            WITH exact_candidates AS (
                SELECT mr.id AS result_id, MIN(c.id) AS course_id
                FROM {master_table} mr
                JOIN students s
                  ON UPPER(TRIM(s."MatricNo")) = UPPER(TRIM(mr.matric_no))
                JOIN {course_table} c
                  ON UPPER(REPLACE(c.course_code, ' ', '')) = UPPER(REPLACE(mr.course_code, ' ', ''))
                 AND UPPER(TRIM(c.department)) = UPPER(TRIM(s.department))
                 AND c.level::text = mr.level::text
                WHERE mr.course_id IS NULL
                GROUP BY mr.id
                HAVING COUNT(*) = 1
            )
            UPDATE {master_table} mr
            SET course_id = ec.course_id
            FROM exact_candidates ec
            WHERE mr.id = ec.result_id
        ''')

    Database.execute_update(f'''
        WITH latest_attempts AS (
            SELECT mr.*,
                   ROW_NUMBER() OVER (
                       PARTITION BY UPPER(TRIM(mr.matric_no)), mr.course_id
                       ORDER BY mr.session DESC NULLS LAST,
                                CASE
                                    WHEN LOWER(TRIM(mr.semester)) LIKE 'third%%' THEN 3
                                    WHEN LOWER(TRIM(mr.semester)) LIKE 'second%%' THEN 2
                                    WHEN LOWER(TRIM(mr.semester)) LIKE 'first%%' THEN 1
                                    ELSE 0
                                END DESC,
                                mr.id DESC
                   ) AS attempt_rank
            FROM {master_table} mr
            WHERE mr.course_id IS NOT NULL
        )
        INSERT INTO outstanding_courses
             (student_id, matric_no, course_source, course_id, course_code,
              course_title, course_unit, status, latest_result_id,
              failed_session, failed_semester, failed_score, updated_at)
        SELECT s."Id", UPPER(TRIM(la.matric_no)), %s, la.course_id,
               UPPER(TRIM(la.course_code)), la.course_title, la.course_unit,
               'outstanding', la.id, la.session, la.semester, la.total, NOW()
        FROM latest_attempts la
        JOIN students s
          ON UPPER(TRIM(s."MatricNo")) = UPPER(TRIM(la.matric_no))
        WHERE la.attempt_rank = 1
          AND COALESCE(la.total, 0) < 40
        ON CONFLICT (student_id, course_source, course_id)
        DO UPDATE SET matric_no = EXCLUDED.matric_no,
                      course_code = EXCLUDED.course_code,
                      course_title = EXCLUDED.course_title,
                      course_unit = EXCLUDED.course_unit,
                      status = 'outstanding',
                      latest_result_id = EXCLUDED.latest_result_id,
                      failed_session = EXCLUDED.failed_session,
                      failed_semester = EXCLUDED.failed_semester,
                      failed_score = EXCLUDED.failed_score,
                      cleared_result_id = NULL,
                      cleared_session = NULL,
                      cleared_semester = NULL,
                      cleared_score = NULL,
                      cleared_at = NULL,
                      updated_at = NOW()
    ''', (course_source,))


def sync_outstanding_course(
    cursor,
    course_source,
    result_id,
    matric_no,
    course_id,
    course_code,
    course_title,
    course_unit,
    processed_by,
):
    config = SOURCE_CONFIG[course_source]
    cursor.execute(
        'SELECT "Id" FROM students WHERE UPPER(TRIM("MatricNo")) = UPPER(TRIM(%s)) LIMIT 1',
        (matric_no,),
    )
    student = cursor.fetchone()
    if not student:
        raise ValueError(f'Student record not found for matric number {matric_no}')

    cursor.execute(
        f'''SELECT id, session, semester, total, grade
            FROM {config["master"]}
            WHERE UPPER(TRIM(matric_no)) = UPPER(TRIM(%s))
              AND UPPER(REPLACE(course_code, ' ', '')) = UPPER(REPLACE(%s, ' ', ''))
            ORDER BY session DESC NULLS LAST,
                     CASE
                         WHEN LOWER(TRIM(semester)) LIKE 'third%%' THEN 3
                         WHEN LOWER(TRIM(semester)) LIKE 'second%%' THEN 2
                         WHEN LOWER(TRIM(semester)) LIKE 'first%%' THEN 1
                         ELSE 0
                     END DESC,
                     id DESC
            LIMIT 1''',
        (matric_no, course_code),
    )
    latest = cursor.fetchone()
    if not latest:
        return

    cursor.execute(
        '''SELECT id, status, latest_result_id
           FROM outstanding_courses
           WHERE student_id = %s AND course_source = %s AND course_id = %s
           LIMIT 1''',
        (student['Id'], course_source, course_id),
    )
    existing = cursor.fetchone()
    latest_score = float(latest.get('total') or 0)

    if latest_score < 40:
        event_type = 'failed' if not existing else (
            'reopened' if existing['status'] == 'cleared' else 'retake_failed'
        )
        cursor.execute(
            '''INSERT INTO outstanding_courses
                 (student_id, matric_no, course_source, course_id, course_code,
                  course_title, course_unit, status, latest_result_id,
                  failed_session, failed_semester, failed_score,
                  cleared_result_id, cleared_session, cleared_semester,
                  cleared_score, cleared_at, updated_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,'outstanding',%s,%s,%s,%s,
                       NULL,NULL,NULL,NULL,NULL,NOW())
               ON CONFLICT (student_id, course_source, course_id)
               DO UPDATE SET matric_no = EXCLUDED.matric_no,
                             course_code = EXCLUDED.course_code,
                             course_title = EXCLUDED.course_title,
                             course_unit = EXCLUDED.course_unit,
                             status = 'outstanding',
                             latest_result_id = EXCLUDED.latest_result_id,
                             failed_session = EXCLUDED.failed_session,
                             failed_semester = EXCLUDED.failed_semester,
                             failed_score = EXCLUDED.failed_score,
                             cleared_result_id = NULL,
                             cleared_session = NULL,
                             cleared_semester = NULL,
                             cleared_score = NULL,
                             cleared_at = NULL,
                             updated_at = NOW()
               RETURNING id''',
            (
                student['Id'], str(matric_no).strip().upper(), course_source,
                course_id, str(course_code).strip().upper(), course_title,
                course_unit, latest['id'], latest.get('session'),
                latest.get('semester'), latest_score,
            ),
        )
        outstanding_id = cursor.fetchone()['id']
        cursor.execute(
            '''INSERT INTO outstanding_course_history
                 (outstanding_course_id, event_type, result_id, session,
                  semester, score, grade, processed_by)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (outstanding_course_id, event_type, result_id) DO NOTHING''',
            (
                outstanding_id, event_type, latest['id'], latest.get('session'),
                latest.get('semester'), latest_score, latest.get('grade'), processed_by,
            ),
        )
        return

    if existing and existing['status'] == 'outstanding':
        cursor.execute(
            '''UPDATE outstanding_courses
               SET status = 'cleared', latest_result_id = %s,
                   cleared_result_id = %s, cleared_session = %s,
                   cleared_semester = %s, cleared_score = %s,
                   cleared_at = NOW(), updated_at = NOW()
               WHERE id = %s''',
            (
                latest['id'], latest['id'], latest.get('session'),
                latest.get('semester'), latest_score, existing['id'],
            ),
        )
        cursor.execute(
            '''INSERT INTO outstanding_course_history
                 (outstanding_course_id, event_type, result_id, session,
                  semester, score, grade, processed_by)
               VALUES (%s,'cleared',%s,%s,%s,%s,%s,%s)
               ON CONFLICT (outstanding_course_id, event_type, result_id) DO NOTHING''',
            (
                existing['id'], latest['id'], latest.get('session'),
                latest.get('semester'), latest_score, latest.get('grade'), processed_by,
            ),
        )


def outstanding_courses_for_student(cursor, student_id, course_source):
    config = SOURCE_CONFIG[course_source]
    cursor.execute(
        f'''SELECT oc.id AS outstanding_id, oc.course_id AS id,
                  oc.course_code, COALESCE(oc.course_title, c.course_title) AS course_title,
                  COALESCE(oc.course_unit, c.unit) AS credit_units,
                  c.semester, 'carryover' AS remark, 'carryover' AS category,
                  oc.failed_session, oc.failed_semester, oc.failed_score,
                  oc.first_failed_at, oc.status,
                  CASE WHEN c.status::text = 'active' THEN TRUE ELSE FALSE END AS course_active
           FROM outstanding_courses oc
           JOIN {config["course"]} c ON c.id = oc.course_id
           WHERE oc.student_id = %s
             AND oc.course_source = %s
             AND oc.status = 'outstanding'
           ORDER BY oc.failed_session, oc.failed_semester, oc.course_code''',
        (student_id, course_source),
    )
    return [dict(row) for row in (cursor.fetchall() or [])]


def semester_matches(course_semester, registration_semester):
    course_value = str(course_semester or '').strip().lower()
    registration_value = str(registration_semester or '').strip().lower()
    if not course_value or not registration_value or registration_value == 'current':
        return True
    return course_value.split()[0] == registration_value.split()[0]
