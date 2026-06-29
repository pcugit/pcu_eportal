import smtplib
import ssl
import os
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication

logger = logging.getLogger(__name__)

SENDER_PROFILES = {
    "ug": {
        "username": "UG_MAIL_USERNAME",
        "password": "UG_MAIL_PASSWORD",
        "from_name": "UG_MAIL_FROM_NAME",
        "default_name": "PCU Admissions Office",
    },
    "pg": {
        "username": "PG_MAIL_USERNAME",
        "password": "PG_MAIL_PASSWORD",
        "from_name": "PG_MAIL_FROM_NAME",
        "default_name": "PCU Postgraduate School",
    },
    "pt": {
        "username": "PT_MAIL_USERNAME",
        "password": "PT_MAIL_PASSWORD",
        "from_name": "PT_MAIL_FROM_NAME",
        "default_name": "PCU Part-Time Admissions Office",
    },
    "general": {
        "username": "GENERAL_MAIL_USERNAME",
        "password": "GENERAL_MAIL_PASSWORD",
        "from_name": "GENERAL_MAIL_FROM_NAME",
        "default_name": "Precious Cornerstone University",
    },
}

def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}

def _clean_password(password: str = None):
    if password is None:
        return None
    return password.strip().replace(" ", "")

def _sender_config(sender_profile: str = None):
    profile = (sender_profile or os.getenv("DEFAULT_MAIL_PROFILE") or "general").strip().lower()
    profile_config = SENDER_PROFILES.get(profile)

    if profile_config:
        sender = (os.getenv(profile_config["username"]) or "").strip()
        password = _clean_password(os.getenv(profile_config["password"]))
        from_name = os.getenv(profile_config["from_name"]) or profile_config["default_name"]
        missing = [
            env_name for env_name, value in {
                profile_config["username"]: sender,
                profile_config["password"]: password,
            }.items()
            if not value
        ]
        if missing:
            raise RuntimeError(
                f"Missing email configuration for '{profile}' profile: {', '.join(missing)}"
            )
        return sender, password, from_name, profile

    sender = (os.getenv("MAIL_USERNAME") or "").strip()
    password = _clean_password(os.getenv("MAIL_PASSWORD"))
    missing = [
        name for name, value in {
            "MAIL_USERNAME": sender,
            "MAIL_PASSWORD": password,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError(f"Missing email configuration: {', '.join(missing)}")
    return sender, password, "Precious Cornerstone University", profile

def send_email(
    to: str,
    subject: str,
    html_body: str,
    plain_body: str = None,
    attachments=None,
    from_name: str = None,
    sender_profile: str = None,
):
    sender, password, profile_from_name, profile = _sender_config(sender_profile)
    host = os.getenv("MAIL_HOST")
    port = int(os.getenv("MAIL_PORT", 465))
    timeout = int(os.getenv("MAIL_TIMEOUT", 15))
    use_ssl = _env_flag("MAIL_USE_SSL", port == 465)
    use_tls = _env_flag("MAIL_USE_TLS", port == 587)

    missing = [
        name for name, value in {
            "MAIL_HOST": host,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError(f"Missing email configuration: {', '.join(missing)}")

    msg = MIMEMultipart("mixed")
    body = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{from_name or profile_from_name} <{sender}>"
    msg["To"] = to

    if plain_body:
        body.attach(MIMEText(plain_body, "plain"))
    body.attach(MIMEText(html_body, "html"))
    msg.attach(body)

    for filename, file_bytes in attachments or []:
        part = MIMEApplication(file_bytes, Name=filename)
        part["Content-Disposition"] = f'attachment; filename="{filename}"'
        msg.attach(part)

    try:
        context = ssl.create_default_context()
        if use_ssl:
            server = smtplib.SMTP_SSL(host, port, timeout=timeout, context=context)
        else:
            server = smtplib.SMTP(host, port, timeout=timeout)

        with server:
            if use_tls:
                server.starttls(context=context)
            server.login(sender, password)
            server.sendmail(sender, to, msg.as_string())
            logger.info(f"Email sent via {profile} profile to {to}: {subject}")
    except Exception as e:
        logger.error(f"Failed to send email to {to}: {e}")
        raise
