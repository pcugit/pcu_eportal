from typing import Optional, List, Tuple, Dict, Any

from utils.mailer import send_email as send_smtp_email


def _html_from_text(body_text: str) -> str:
    escaped = (
        (body_text or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    return "<p>" + escaped.replace("\n\n", "</p><p>").replace("\n", "<br>") + "</p>"


def send_email(
    to_email: str,
    subject: str,
    body_text: str,
    from_name: Optional[str] = None,
    attachments: Optional[List[Tuple[str, bytes]]] = None,
    sender_profile: Optional[str] = None,
) -> bool:
    """
    Send an email with optional attachments using the configured SMTP provider.
    Kept compatible with existing route call sites.
    """
    try:
        send_smtp_email(
            to=to_email,
            subject=subject,
            html_body=_html_from_text(body_text),
            plain_body=body_text,
            attachments=attachments,
            from_name=from_name,
            sender_profile=sender_profile,
        )
        return True
    except Exception as e:
        print(f"Error sending email to {to_email}: {str(e)}")
        return False


def send_batch_emails(
    recipients: List[Dict[str, Any]],
    subject: str,
    body_text_template: str,
    from_name: Optional[str] = None,
    attachment_generator: Optional[callable] = None,
    batch_size: int = 100,
    sender_profile: Optional[str] = None,
) -> Dict[str, Any]:
    success_count = 0
    failed_count = 0
    errors = []

    for i in range(0, len(recipients), batch_size):
        batch = recipients[i:i + batch_size]

        for recipient in batch:
            to_email = recipient.get('email')
            to_name = recipient.get('name', '')

            if not to_email:
                failed_count += 1
                errors.append(f"Missing email for recipient {to_name}")
                continue

            try:
                body = body_text_template.format(name=to_name, **recipient.get('data', {}))
                attachments = None
                if attachment_generator:
                    attachment_data = attachment_generator(recipient)
                    if attachment_data:
                        attachments = [attachment_data]

                if send_email(to_email, subject, body, from_name, attachments, sender_profile):
                    success_count += 1
                else:
                    failed_count += 1
                    errors.append(f"Email to {to_email} failed")
            except Exception as e:
                failed_count += 1
                errors.append(f"Error sending to {to_email}: {str(e)}")

    return {
        'success': success_count,
        'failed': failed_count,
        'errors': errors
    }
