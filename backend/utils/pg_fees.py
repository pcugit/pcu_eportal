from database import Database


PG_PROG_TYPE = 2

PG_DEGREE_LEVEL_BY_CODE = {
    "MSC": 7,
    "M.SC": 7,
    "M.SC.": 7,
    "PHD": 8,
    "PH.D": 8,
    "PH.D.": 8,
    "MBA": 9,
}


def _normalize_degree(value):
    return (value or "").strip().upper().replace(" ", "")


def resolve_pg_level_id(degree_code=None, degree_name=None):
    code = _normalize_degree(degree_code)
    if code in PG_DEGREE_LEVEL_BY_CODE:
        return PG_DEGREE_LEVEL_BY_CODE[code]

    name = _normalize_degree(degree_name)
    if "MBA" in name:
        return 9
    if "PHD" in name or "PH.D" in name or "DOCTOR" in name:
        return 8
    if "MSC" in name or "M.SC" in name or "MASTER" in name:
        return 7

    return None


def _pg_context_from_row(row):
    if not row:
        return None

    level_id = resolve_pg_level_id(row.get("degree_code"), row.get("degree_name"))
    faculty_id = row.get("faculty_id")

    finalised_course = (row.get("finalised_course") or "").strip()
    if not finalised_course:
        finalised_course = (row.get("approved_course") or "").strip()
    if not finalised_course:
        finalised_course = (row.get("proposed_course_name") or "").strip()

    if not faculty_id and finalised_course:
        faculty_res = Database.execute_query(
            """SELECT faculty_id
               FROM pg_program_setup
               WHERE LOWER(name) = LOWER(%s)
               LIMIT 1""",
            (finalised_course,),
        )
        if faculty_res:
            faculty_id = faculty_res[0].get("faculty_id")

    if not level_id:
        raise ValueError("PG degree level is required to resolve fees")
    if not faculty_id:
        raise ValueError("PG faculty is required to resolve fees")

    return {
        "program_type": PG_PROG_TYPE,
        "level": level_id,
        "faculty_id": faculty_id,
        "finalised_course": finalised_course,
        "degree_code": row.get("degree_code"),
        "degree_name": row.get("degree_name"),
        "academic_session_id": row.get("academic_session_id"),
    }


def get_pg_fee_context_by_user(user_id, admitted_only=True):
    stage_filter = ""
    if admitted_only:
        stage_filter = "AND pg.applicant_stage IN ('admitted', 'accepted', 'enrolled')"

    rows = Database.execute_query(
        f"""SELECT pg.uuid,
                  pg.finalised_course,
                  pg.approved_course,
                  pg.proposed_course,
                  pg.proposed_faculty_id,
                  pg.degree_id,
                  pg.academic_session_id,
                  pgps.name AS proposed_course_name,
                  COALESCE(pg.proposed_faculty_id, pgps.faculty_id) AS faculty_id,
                  dg.code AS degree_code,
                  dg.name AS degree_name
           FROM pg_application pg
           LEFT JOIN pg_program_setup pgps ON pgps.id = pg.proposed_course
           LEFT JOIN degrees dg ON dg.id = pg.degree_id
           WHERE pg.user_id = %s
             {stage_filter}
           ORDER BY pg.updated_date DESC, pg.created_date DESC
           LIMIT 1""",
        (user_id,),
    )
    if not rows:
        raise ValueError("No eligible PG application found for this user")
    return _pg_context_from_row(rows[0])


def get_pg_fee_context_by_application(applicant_id):
    rows = Database.execute_query(
        """SELECT pg.uuid,
                  pg.finalised_course,
                  pg.approved_course,
                  pg.proposed_course,
                  pg.proposed_faculty_id,
                  pg.degree_id,
                  pg.academic_session_id,
                  pgps.name AS proposed_course_name,
                  COALESCE(pg.proposed_faculty_id, pgps.faculty_id) AS faculty_id,
                  dg.code AS degree_code,
                  dg.name AS degree_name
           FROM pg_application pg
           LEFT JOIN pg_program_setup pgps ON pgps.id = pg.proposed_course
           LEFT JOIN degrees dg ON dg.id = pg.degree_id
           WHERE pg.uuid = %s
           LIMIT 1""",
        (applicant_id,),
    )
    if not rows:
        raise ValueError("PG applicant not found")
    return _pg_context_from_row(rows[0])


def get_pg_program_fee_rows(context, include_acceptance=None, session_id=None):
    resolved_session_id = session_id or context.get("academic_session_id")
    session_clause = "pf.academic_session_id = %s"
    params = [str(context["program_type"])]

    if resolved_session_id:
        params.append(resolved_session_id)
    else:
        session_clause = """pf.academic_session_id = (
            SELECT id FROM academic_sessions WHERE is_active = TRUE LIMIT 1
        )"""

    if include_acceptance is True:
        # PG acceptance fee is program/session based, like application fee.
        # Do not require level/faculty here; those only apply to tuition/other fees.
        fee_filter = "AND LOWER(fc.name) LIKE '%%acceptance%%'"
    elif include_acceptance is False:
        params.extend([str(context["level"]), str(context["faculty_id"])])
        fee_filter = "AND LOWER(fc.name) NOT LIKE '%%acceptance%%'"
        fee_filter += "\n              AND pf.level = %s\n              AND pf.faculty_id = %s"
    else:
        params.extend([str(context["level"]), str(context["faculty_id"])])
        fee_filter = """AND (
                  LOWER(fc.name) LIKE '%%acceptance%%'
                  OR (
                      LOWER(fc.name) NOT LIKE '%%acceptance%%'
                      AND pf.level = %s
                      AND pf.faculty_id = %s
                  )
              )"""

    return Database.execute_query(
        f"""SELECT fc.name AS fee_name, fc.name, pf.amount
            FROM program_fees pf
            JOIN fee_components fc ON fc.id = pf.fee_component_id
            WHERE pf.program_type = %s
              AND {session_clause}
              {fee_filter}
            ORDER BY fc.name ASC""",
        tuple(params),
    )


def build_admission_letter_fee_strings(fees):
    acceptance_fee = tuition_fee = other_fees = 0.0

    for fee in fees or []:
        name = (fee.get("name") or fee.get("fee_name") or "").lower()
        amount = float(fee.get("amount") or 0)
        if "acceptance" in name:
            acceptance_fee += amount
        elif "tuition" in name or "accommodation" in name:
            tuition_fee += amount
        elif "sundry" in name or "other" in name or "digital" in name:
            other_fees += amount

    def fmt(amount):
        return f"NGN {amount:,.2f}" if amount else ""

    return fmt(acceptance_fee), fmt(tuition_fee), fmt(other_fees)
