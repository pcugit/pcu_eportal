import os
from typing import Any

from database import Database
from email_utils import send_email


USER_NAME_EXPR = "u.firstname || ' ' || COALESCE(u.middlename || ' ', '') || u.surname"


ADMIN_RECIPIENTS = {
    "ug": ("UG_ADMIN_NOTIFICATION_EMAIL", "UG_MAIL_USERNAME"),
    "pt": ("PT_ADMIN_NOTIFICATION_EMAIL", "PT_MAIL_USERNAME"),
    "pg": ("PG_ADMIN_NOTIFICATION_EMAIL", "PG_MAIL_USERNAME"),
}


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _recipient_for(area: str) -> str:
    override_env, fallback_env = ADMIN_RECIPIENTS[area]
    return _clean(os.getenv(override_env) or os.getenv(fallback_env))


def _program_area(program_type_id: Any) -> str:
    try:
        prog_type = int(program_type_id) if program_type_id is not None else None
    except (TypeError, ValueError):
        prog_type = None
    if prog_type == 2:
        return "pg"
    if prog_type in (4, 7):
        return "pt"
    return "ug"


def _application_url(area: str, application_id: Any) -> str:
    base_url = _clean(os.getenv("FRONTEND_BASE_URL")).rstrip("/")
    if not base_url:
        return ""
    paths = {
        "ug": f"/admission_officer/application/{application_id}",
        "pt": f"/ptadmin/application/{application_id}",
        "pg": f"/pgadmin/application/{application_id}",
    }
    return f"{base_url}{paths[area]}"


def _pg_application_details(application_id: Any) -> dict[str, Any] | None:
    rows = Database.execute_query(
        f"""
        SELECT pg.uuid AS id,
               pg.form_no,
               {USER_NAME_EXPR} AS applicant_name,
               u.email AS applicant_email,
               COALESCE(dg.code || ' ', '') || COALESCE(pgps.name, pg.approved_course, pg.finalised_course, 'Postgraduate') AS program_name,
               COALESCE(asess.name, CAST(pg.academic_session_id AS TEXT)) AS session
          FROM pg_application pg
          JOIN users u ON u.id = pg.user_id
          LEFT JOIN degrees dg ON dg.id = pg.degree_id
          LEFT JOIN pg_program_setup pgps ON pgps.id = pg.proposed_course
          LEFT JOIN academic_sessions asess ON asess.id = pg.academic_session_id
         WHERE pg.uuid = %s
        """,
        (application_id,),
    )
    if not rows:
        return None
    details = dict(rows[0])
    details["area"] = "pg"
    details["area_label"] = "Postgraduate"
    return details


def _regular_application_details(application_id: Any) -> dict[str, Any] | None:
    rows = Database.execute_query(
        f"""
        SELECT app.id,
               app.form_no,
               app.prog_type,
               {USER_NAME_EXPR} AS applicant_name,
               u.email AS applicant_email,
               COALESCE(dg.code || ' ', '') || COALESCE(ps.name, app.approved_course, app.finalised_course, pt.name, 'Application') AS program_name,
               COALESCE(asess.name, CAST(app.academic_session_id AS TEXT)) AS session
          FROM applications app
          JOIN users u ON u.id = app.user_id
          LEFT JOIN program_types pt ON pt.id = app.prog_type
          LEFT JOIN degrees dg ON dg.id = app.degree_id
          LEFT JOIN program_choice pc ON pc.application_id = app.id
          LEFT JOIN program_setup ps ON ps.id = pc.first_choice
          LEFT JOIN academic_sessions asess ON asess.id = app.academic_session_id
         WHERE app.id = %s
        """,
        (application_id,),
    )
    if not rows:
        return None
    details = dict(rows[0])
    area = _program_area(details.get("prog_type"))
    details["area"] = area
    details["area_label"] = "Part-Time" if area == "pt" else "Undergraduate"
    return details


def notify_admin_new_application(application_id: Any, is_pg: bool = False) -> bool:
    details = _pg_application_details(application_id) if is_pg else _regular_application_details(application_id)
    if not details:
        print(f"[application-notification] Application not found: {application_id}")
        return False

    area = details["area"]
    recipient = _recipient_for(area)
    if not recipient:
        print(f"[application-notification] No recipient configured for {area} applications")
        return False

    subject = f"New {details['area_label']} Application Received"
    application_url = _application_url(area, details["id"])
    body_lines = [
        "A new application has been submitted.",
        "",
        f"Applicant: {_clean(details.get('applicant_name')) or 'Unknown'}",
        f"Applicant email: {_clean(details.get('applicant_email')) or 'N/A'}",
        f"Form number: {_clean(details.get('form_no')) or 'N/A'}",
        f"Programme: {_clean(details.get('program_name')) or 'N/A'}",
        f"Session: {_clean(details.get('session')) or 'N/A'}",
    ]
    if application_url:
        body_lines.extend(["", f"Review application: {application_url}"])

    sent = send_email(
        recipient,
        subject,
        "\n".join(body_lines),
        from_name="Precious Cornerstone University",
        sender_profile="general",
    )
    if not sent:
        print(f"[application-notification] Failed to notify {recipient} for application {application_id}")
    return sent
