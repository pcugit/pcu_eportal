#!/usr/bin/env python
"""
Import filled postgraduate admission forms into the portal.

Default mode is a dry run. Add --commit to write:
  - users row with default password "password"
  - pg_reference row
  - nextofkin_sponsor row
  - pg_application row
  - successful application_fee payment_transactions row with receipt_no

Examples:
  python backend/scripts/import_pg_forms.py "forms/Wojuade.pdf"
  python backend/scripts/import_pg_forms.py "forms/*.pdf" --commit
  python backend/scripts/import_pg_forms.py --data-json applicants.json --commit
"""

from __future__ import annotations

import argparse
import csv
import glob
import json
import os
import re
import secrets
import shutil
import sys
import uuid
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from database import Database
from utils.auth import AuthHandler
from utils.payment_status import generate_receipt_no


PROGRAM_TYPE_ID_PG = 2
DEFAULT_PASSWORD = "password"
DEFAULT_STAGE = "submitted"
APPLICATION_FEE_MAPPING = {1: 42, 6: 43, 4: 40, 2: 37, 7: 38, 3: 39, 5: 41}
OCR_UNAVAILABLE_MESSAGE = (
    "No selectable PDF text found. This looks like a scanned PDF. "
    "Install Tesseract OCR and pytesseract, then rerun the importer."
)


@dataclass
class ImportResult:
    email: str
    user_id: str | None
    application_id: str | None
    form_no: str | None
    receipt_no: str | None
    reference_no: str | None
    action: str


def clean(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).replace("\u00a0", " ")
    text = re.sub(r"[\u2026.]{3,}", " ", text)
    text = re.sub(r"[.]{3,}", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" :;\t\r\n")
    text = re.sub(r"^\(?\s*\d+\s*\)?[.)]?\s*$", "", text)
    return text


def norm_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def extract_pdf_text(path: Path) -> str:
    text = ""
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception:
        text = ""

    if clean(text):
        return text

    try:
        import fitz

        doc = fitz.open(str(path))
        text = "\n".join(page.get_text("text") for page in doc)
        if clean(text):
            return text
    except Exception:
        pass

    return extract_scanned_pdf_text(path)


def extract_scanned_pdf_text(path: Path) -> str:
    if not shutil.which("tesseract"):
        return ""

    try:
        import fitz
        import pytesseract
        from PIL import Image
    except Exception:
        return ""

    chunks: list[str] = []
    try:
        doc = fitz.open(str(path))
        for page in doc:
            pix = page.get_pixmap(dpi=250, alpha=False)
            image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            chunks.append(pytesseract.image_to_string(image))
    except Exception as exc:
        print(f"[OCR] Failed to read scanned PDF {path}: {exc}")
    return "\n".join(chunks)


def between(text: str, start: str, end: str | None = None) -> str:
    pattern = re.escape(start)
    if end:
        match = re.search(pattern + r"\s*(.*?)\s*" + re.escape(end), text, re.I | re.S)
    else:
        match = re.search(pattern + r"\s*(.*)", text, re.I | re.S)
    return clean(match.group(1)) if match else ""


def line_value(text: str, label: str) -> str:
    escaped = re.escape(label)
    match = re.search(rf"{escaped}\s*[:.]?\s*(.+)", text, re.I)
    return clean(match.group(1)) if match else ""


def parse_date(value: str) -> str:
    value = clean(value)
    if not value:
        return ""
    value = re.sub(r"(\d+)(st|nd|rd|th)", r"\1", value, flags=re.I)
    value = value.replace(",", " ")
    formats = [
        "%d %b %Y",
        "%d %B %Y",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%Y-%m-%d",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(value.title(), fmt).date().isoformat()
        except ValueError:
            pass
    return value


def split_name(full_name: str, surname_position: str) -> dict[str, str]:
    parts = clean(full_name).split()
    if not parts:
        return {"surname": "", "first_name": "", "middle_name": ""}
    if surname_position == "last" and len(parts) > 1:
        surname = parts[-1]
        first = parts[0]
        middle = " ".join(parts[1:-1])
    else:
        surname = parts[0]
        first = parts[1] if len(parts) > 1 else ""
        middle = " ".join(parts[2:])
    return {"surname": surname.title(), "first_name": first.title(), "middle_name": middle.title()}


def parse_referee(value: str) -> tuple[str, str]:
    value = clean(value)
    if "," not in value:
        return value, ""
    name, address = value.split(",", 1)
    return clean(name), clean(address)


def parse_phone_pair(value: str) -> tuple[str, str]:
    nums = re.findall(r"\+?\d[\d\s-]{6,}\d", value or "")
    cleaned = [re.sub(r"\D", "", n) for n in nums]
    return (cleaned[0] if cleaned else "", cleaned[1] if len(cleaned) > 1 else "")


def normalized_pdf_lines(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.splitlines():
        stripped = re.sub(r"\s+", " ", raw.replace("\u00a0", " ")).strip()
        if re.fullmatch(r"\(\s*\d+\s*\)", stripped):
            continue
        if re.fullmatch(r"\d{1,2}\.", stripped):
            lines.append(stripped)
            continue
        marker_label = re.match(r"^(\d{1,2}\.)\s+(.+)$", stripped)
        if marker_label:
            lines.append(marker_label.group(1))
            cleaned_label = clean(marker_label.group(2))
            if cleaned_label:
                lines.append(cleaned_label)
            continue
        cleaned = clean(stripped)
        if cleaned:
            lines.append(cleaned)
    return lines


def is_question_number(line: str) -> bool:
    return bool(re.fullmatch(r"\d{1,2}\.", re.sub(r"\s+", " ", str(line)).strip()))


def numbered_block(lines: list[str], number: int) -> list[str]:
    marker = f"{number}."
    try:
        start = next(i for i, line in enumerate(lines) if line == marker)
    except StopIteration:
        return []

    out: list[str] = []
    for line in lines[start + 1 :]:
        if is_question_number(line):
            break
        if line.startswith("SECTION B:"):
            break
        out.append(line)
    return out


def block_answer(lines: list[str], number: int, label: str | None = None) -> str:
    block = numbered_block(lines, number)
    if label:
        block = [line for line in block if not line.lower().startswith(label.lower())]
    return clean(" ".join(block))


def answer_after_label(lines: list[str], number: int, label: str) -> str:
    block = numbered_block(lines, number)
    for idx, line in enumerate(block):
        if line.lower().startswith(label.lower()):
            return clean(" ".join(block[idx + 1 :]))
    return clean(" ".join(block))


def parse_registration_date(lines: list[str]) -> str:
    block = numbered_block(lines, 22)
    for line in block:
        parsed = parse_date(line)
        if re.search(r"\d{1,2}[-/]\d{1,2}[-/]\d{2,4}", line) and parsed:
            return parsed
    return ""


def parse_numbered_pg_pdf(text: str, path: Path, surname_position: str) -> dict[str, Any]:
    lines = normalized_pdf_lines(text)
    data: dict[str, Any] = {"source_file": str(path)}

    data["full_name"] = answer_after_label(lines, 1, "Full Name")
    data["previous_institution"] = answer_after_label(lines, 2, "Previous Institution")

    dob_sex = answer_after_label(lines, 3, "Date of Birth")
    sex_match = re.search(r"Sex[:\s]*([A-Za-z]+|M|F)", dob_sex, re.I)
    data["gender"] = {"m": "Male", "f": "Female"}.get((sex_match.group(1) if sex_match else "").lower(), clean(sex_match.group(1)).title() if sex_match else "")
    data["date_of_birth"] = parse_date(re.sub(r"Sex[:\s]*(Male|Female|M|F).*", "", dob_sex, flags=re.I))

    data["department"] = answer_after_label(lines, 4, "Department")
    data["previous_course"] = answer_after_label(lines, 5, "Previous Course of Study")
    data["class_of_degree"] = answer_after_label(lines, 6, "Class of First Degree")

    second_six = []
    seen_first_six = False
    for idx, line in enumerate(lines):
        if line == "6.":
            if seen_first_six:
                block = []
                for item in lines[idx + 1 :]:
                    if is_question_number(item):
                        break
                    block.append(item)
                second_six = block
                break
            seen_first_six = True
    data["proposed_course_name"] = clean(" ".join(line for line in second_six if not line.lower().startswith("proposed course of study")))

    data["proposed_faculty_name"] = answer_after_label(lines, 7, "Proposed Faculty")
    data["degree_name"] = answer_after_label(lines, 8, "Degree in View")
    data["area_of_specialisation"] = answer_after_label(lines, 9, "Area of Specialization")
    data["proposed_research_title"] = answer_after_label(lines, 10, "Proposed Title of Research")

    mode_lines = numbered_block(lines, 11)
    mode_block = " ".join(mode_lines)
    if re.search(r"Part[- ]Time\s*\(\s*X\s*\)", mode_block, re.I):
        data["mode_of_study"] = "Part-Time"
    elif re.search(r"Full[- ]Time\s*\(\s*X\s*\)", mode_block, re.I):
        data["mode_of_study"] = "Full-Time"
    else:
        data["mode_of_study"] = clean(mode_block)

    data["transcript_uploaded"] = answer_after_label(lines, 12, "Indicate if you uploaded")
    refs_block = numbered_block(lines, 13)
    refs_text = " ".join(refs_block)
    refs = re.findall(r"\([abc]\)\s*(.*?)(?=\s*\([abc]\)|$)", refs_text, re.I)
    for idx in range(3):
        name, address = parse_referee(refs[idx] if idx < len(refs) else "")
        data[f"referee{idx + 1}_name"] = name
        data[f"referee{idx + 1}_address"] = address

    data["sponsor_name"] = answer_after_label(lines, 14, "Name of Sponsor")
    data["sponsor_address"] = answer_after_label(lines, 15, "Address of Sponsor")
    data["next_of_kin_name"] = answer_after_label(lines, 16, "Name of Next of Kin")
    data["next_of_kin_address"] = answer_after_label(lines, 17, "Address of Next of Kin")
    phone_block = answer_after_label(lines, 18, "Phone Number of Next of Kin")
    p1, p2 = parse_phone_pair(phone_block)
    data["phone_number"] = p1
    data["secondary_phone_number"] = p2
    data["physically_challenged"] = answer_after_label(lines, 19, "Are you Physically Challenged") or "No"
    data["address"] = answer_after_label(lines, 20, "Address of Candidate")
    email_text = answer_after_label(lines, 21, "Email of Candidate")
    email_match = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", email_text, re.I)
    data["email"] = email_match.group(0).lower() if email_match else email_text
    data["registration_date"] = parse_registration_date(lines)
    data.update(split_name(data.get("full_name", ""), surname_position))
    return data


def parse_filled_pg_pdf(path: Path, surname_position: str) -> dict[str, Any]:
    raw = extract_pdf_text(path)
    if not clean(raw):
        return {"source_file": str(path), "_error": OCR_UNAVAILABLE_MESSAGE}

    numbered = parse_numbered_pg_pdf(raw, path, surname_position)
    if numbered.get("email") or numbered.get("full_name"):
        return numbered

    compact = re.sub(r"\s+", " ", raw)

    data: dict[str, Any] = {"source_file": str(path)}
    data["full_name"] = between(compact, "Full Name (Surname last, in CAPITALS)", "Previous Institution")
    data["previous_institution"] = between(compact, "Previous Institution(s) Attended", "Date of Birth")

    dob_sex = between(compact, "Date of Birth:", "Department:")
    sex_match = re.search(r"Sex[:\s]*([A-Za-z]+|M|F)", dob_sex, re.I)
    data["gender"] = {"m": "Male", "f": "Female"}.get((sex_match.group(1) if sex_match else "").lower(), clean(sex_match.group(1)).title() if sex_match else "")
    data["date_of_birth"] = parse_date(re.sub(r"Sex[:\s]*(Male|Female|M|F).*", "", dob_sex, flags=re.I))

    data["department"] = between(compact, "Department:", "Previous Course of Study")
    data["previous_course"] = between(compact, "Previous Course of Study", "Class of First Degree")
    data["class_of_degree"] = between(compact, "Class of First Degree:", "Proposed Course of Study")
    data["proposed_course_name"] = between(compact, "Proposed Course of Study:", "Proposed Faculty")
    data["proposed_faculty_name"] = between(compact, "Proposed Faculty/Institute/Centre:", "Degree in View")
    data["degree_name"] = between(compact, "Degree in View:", "Area of Specialization")
    data["area_of_specialisation"] = between(compact, "Area of Specialization:", "Proposed Title of Research")
    data["proposed_research_title"] = between(compact, "Proposed Title of Research (In the case of MPhil/PhD/Ph.D):", "Mode of Study")

    mode_block = between(compact, "Mode of Study:", "Indicate if you uploaded")
    if re.search(r"Part[- ]Time\s*\(\s*x\s*\)", mode_block, re.I):
        data["mode_of_study"] = "Part-Time"
    elif re.search(r"Full[- ]Time\s*\(\s*x\s*\)", mode_block, re.I):
        data["mode_of_study"] = "Full-Time"
    else:
        data["mode_of_study"] = clean(mode_block)

    data["transcript_uploaded"] = between(compact, "academic transcript:", "Name and Addresses")
    refs_block = between(compact, "Name and Addresses of your 3 referees:", "Name of Sponsor")
    refs = re.findall(r"\([abc]\)\s*(.*?)(?=\s*\([abc]\)|$)", refs_block, re.I)
    for idx in range(3):
        name, address = parse_referee(refs[idx] if idx < len(refs) else "")
        data[f"referee{idx + 1}_name"] = name
        data[f"referee{idx + 1}_address"] = address

    data["sponsor_name"] = between(compact, "Name of Sponsor:", "Address of Sponsor")
    data["sponsor_address"] = between(compact, "Address of Sponsor:", "Name of Next of Kin")
    data["next_of_kin_name"] = between(compact, "Name of Next of Kin:", "Address of Next of Kin")
    data["next_of_kin_address"] = between(compact, "Address of Next of Kin:", "Phone Number of Next of Kin")
    phones = between(compact, "Necessary:", "Are you Physically Challenged")
    p1, p2 = parse_phone_pair(phones)
    data["phone_number"] = p1
    data["secondary_phone_number"] = p2
    data["physically_challenged"] = between(compact, "If yes, State:", "Address of Candidate") or "No"
    data["address"] = between(compact, "Address of Candidate:", "Email of Candidate")
    data["email"] = between(compact, "Email of Candidate:", "Student's Signature")
    signature_block = between(compact, "Student's Signature and Date:", "SECTION B")
    date_match = re.search(r"\d{1,2}[-/]\d{1,2}[-/]\d{2,4}", signature_block)
    data["registration_date"] = parse_date(date_match.group(0)) if date_match else ""
    data.update(split_name(data.get("full_name", ""), surname_position))
    return data


def load_json_records(path: Path, surname_position: str) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    records = payload if isinstance(payload, list) else [payload]
    out = []
    for record in records:
        item = {norm_key(k): v for k, v in dict(record).items()}
        if item.get("full_name") and not item.get("surname"):
            item.update(split_name(str(item["full_name"]), surname_position))
        out.append(item)
    return out


def load_csv_records(path: Path, surname_position: str) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = [{norm_key(k): v for k, v in row.items()} for row in csv.DictReader(handle)]
    for row in rows:
        if row.get("full_name") and not row.get("surname"):
            row.update(split_name(str(row["full_name"]), surname_position))
    return rows


def expand_pdf_args(values: list[str]) -> list[Path]:
    paths: list[Path] = []
    for value in values:
        matches = glob.glob(value)
        if matches:
            paths.extend(Path(m) for m in matches)
        else:
            paths.append(Path(value))
    return paths


def db_one(query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    rows = Database.execute_query(query, params)
    return rows[0] if rows else None


def db_insert_id(query: str, params: tuple[Any, ...], key: str = "id") -> Any:
    rows = Database.execute_query(query, params)
    if not rows:
        raise RuntimeError("Insert did not return an id")
    return rows[0][key]


def active_session_id() -> int:
    row = db_one("SELECT id FROM academic_sessions WHERE is_active = TRUE LIMIT 1")
    if not row:
        raise RuntimeError("No active academic session found")
    return int(row["id"])


def resolve_application_fee_amount() -> tuple[Decimal, str | None]:
    fee_id = APPLICATION_FEE_MAPPING[PROGRAM_TYPE_ID_PG]
    row = db_one("SELECT amount, fee_component_id FROM program_fees WHERE id = %s LIMIT 1", (fee_id,))
    if not row:
        raise RuntimeError(f"PG application fee not found at program_fees.id={fee_id}")
    return Decimal(str(row["amount"])), str(row.get("fee_component_id")) if row.get("fee_component_id") else None


def normalize_degree_code(value: str) -> str:
    token = clean(value).split(" ", 1)[0] if clean(value) else ""
    token = re.sub(r"[^A-Za-z]", "", token).upper()
    aliases = {
        "PHD": "PHD",
        "MSC": "MSC",
        "MSc".upper(): "MSC",
        "MA": "MA",
        "MBA": "MBA",
        "PGD": "PGD",
        "PGDE": "PGD",
        "DBA": "DBA",
    }
    return aliases.get(token, token)


def strip_degree_prefix(value: str) -> str:
    text = clean(value)
    return clean(re.sub(r"^(ph\.?d|msc|m\.?sc|ma|m\.?a|mba|pgd|pgde|dba)\.?\s+", "", text, flags=re.I))


def resolve_degree_id(data: dict[str, Any]) -> int | None:
    if data.get("degree_id"):
        return int(data["degree_id"])
    explicit_degree = clean(data.get("degree_name"))
    proposed_degree_code = normalize_degree_code(clean(data.get("proposed_course_name")))
    candidates = [explicit_degree, proposed_degree_code]
    for candidate in candidates:
        if not candidate:
            continue
        code = normalize_degree_code(candidate)
        row = db_one(
            """
            SELECT id
            FROM degrees
            WHERE LOWER(code) = LOWER(%s)
               OR LOWER(REPLACE(code, '.', '')) = LOWER(%s)
               OR LOWER(name) = LOWER(%s)
               OR LOWER(name) LIKE LOWER(%s)
               OR LOWER(%s) LIKE LOWER(CONCAT('%%', name, '%%'))
            LIMIT 1
            """,
            (candidate, code, candidate, f"%{candidate}%", candidate),
        )
        if row:
            return int(row["id"])
    return None


def resolve_faculty_id(data: dict[str, Any]) -> int | None:
    if data.get("proposed_faculty_id"):
        return int(data["proposed_faculty_id"])
    name = clean(data.get("proposed_faculty_name"))
    if not name:
        return None
    row = db_one(
        """
        SELECT id
        FROM faculties
        WHERE LOWER(name) = LOWER(%s) OR LOWER(name) LIKE LOWER(%s)
        LIMIT 1
        """,
        (name, f"%{name}%"),
    )
    return int(row["id"]) if row else None


def resolve_program(data: dict[str, Any]) -> tuple[int | None, int | None, int | None]:
    degree_id = resolve_degree_id(data)
    if data.get("proposed_course"):
        course_id = int(data["proposed_course"])
        row = db_one("SELECT name, faculty_id, degree_id FROM pg_program_setup WHERE id = %s LIMIT 1", (course_id,))
        if row and degree_id and row.get("degree_id") and int(row["degree_id"]) != int(degree_id):
            corrected = db_one(
                """
                SELECT id, faculty_id, degree_id
                FROM pg_program_setup
                WHERE is_active = TRUE
                  AND degree_id = %s
                  AND LOWER(name) = LOWER(%s)
                LIMIT 1
                """,
                (degree_id, row["name"]),
            )
            if corrected:
                return corrected["id"], corrected.get("faculty_id") or resolve_faculty_id(data), corrected.get("degree_id")
        return course_id, row.get("faculty_id") if row else resolve_faculty_id(data), degree_id or (row.get("degree_id") if row else None)

    name = clean(data.get("proposed_course_name"))
    if not name:
        return None, resolve_faculty_id(data), degree_id

    alternatives = [name]
    stripped = strip_degree_prefix(name)
    if stripped and stripped.lower() != name.lower():
        alternatives.insert(0, stripped)

    for candidate in alternatives:
        if degree_id:
            row = db_one(
                """
                SELECT id, faculty_id, degree_id
                FROM pg_program_setup
                WHERE is_active = TRUE
                  AND degree_id = %s
                  AND (LOWER(name) = LOWER(%s) OR LOWER(name) LIKE LOWER(%s) OR LOWER(%s) LIKE LOWER(CONCAT('%%', name, '%%')))
                ORDER BY CASE WHEN LOWER(name) = LOWER(%s) THEN 0 ELSE 1 END
                LIMIT 1
                """,
                (degree_id, candidate, f"%{candidate}%", candidate, candidate),
            )
        else:
            row = db_one(
                """
                SELECT id, faculty_id, degree_id
                FROM pg_program_setup
                WHERE is_active = TRUE
                  AND (LOWER(name) = LOWER(%s) OR LOWER(name) LIKE LOWER(%s) OR LOWER(%s) LIKE LOWER(CONCAT('%%', name, '%%')))
                ORDER BY CASE WHEN LOWER(name) = LOWER(%s) THEN 0 ELSE 1 END
                LIMIT 1
                """,
                (candidate, f"%{candidate}%", candidate, candidate),
            )
        if row:
            return row["id"], row.get("faculty_id") or resolve_faculty_id(data), degree_id or row.get("degree_id")

    return None, resolve_faculty_id(data), degree_id


def generate_reference_no() -> str:
    return f"REF-{date.today().strftime('%Y%m%d')}-{secrets.token_hex(8).upper()}"


def generate_form_no() -> str:
    year = datetime.now().year
    while True:
        form_no = f"PCU/{year}/PG{''.join(secrets.choice('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') for _ in range(4))}"
        if not db_one("SELECT uuid FROM pg_application WHERE form_no = %s LIMIT 1", (form_no,)):
            return form_no


def make_username(email: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9_.-]", "", email.split("@")[0])[:40] or "pgapplicant"
    return f"{base}{secrets.randbelow(9000) + 1000}"


def registration_timestamp(data: dict[str, Any]) -> str | None:
    raw = clean(data.get("registration_date") or data.get("form_date") or data.get("date"))
    parsed = parse_date(raw)
    return parsed or None


def create_or_update_user(data: dict[str, Any], commit: bool) -> tuple[str | None, str]:
    email = clean(data.get("email")).lower()
    if not email:
        raise ValueError("email is required")

    existing = db_one("SELECT id FROM users WHERE LOWER(email) = LOWER(%s) LIMIT 1", (email,))
    password_hash = AuthHandler.hash_password(DEFAULT_PASSWORD)
    phone = clean(data.get("phone_number"))
    registered_at = registration_timestamp(data)
    if existing:
        user_id = str(existing["id"])
        if commit:
            Database.execute_update(
                """
                UPDATE users
                   SET firstname = COALESCE(NULLIF(%s, ''), firstname),
                       surname = COALESCE(NULLIF(%s, ''), surname),
                       middlename = COALESCE(NULLIF(%s, ''), middlename),
                       phone_number = COALESCE(NULLIF(%s, ''), phone_number),
                       password_hash = %s,
                       user_type_id = 2,
                       updated_at = NOW()
                 WHERE id = %s
                """,
                (
                    clean(data.get("first_name")).title(),
                    clean(data.get("surname")).title(),
                    clean(data.get("middle_name")).title(),
                    phone,
                    password_hash,
                    user_id,
                ),
            )
        return user_id, "updated_user"

    user_id = str(uuid.uuid4())
    if commit:
        Database.execute_update(
            """
            INSERT INTO users
                (id, firstname, surname, middlename, email, password_hash,
                 phone_number, user_type_id, username, email_confirmed, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 2, %s, TRUE, COALESCE(%s::timestamp, NOW()), NOW())
            """,
            (
                user_id,
                clean(data.get("first_name")).title(),
                clean(data.get("surname")).title(),
                clean(data.get("middle_name")).title(),
                email,
                password_hash,
                phone,
                make_username(email),
                registered_at,
            ),
        )
    return user_id, "created_user"


def insert_references(data: dict[str, Any], commit: bool) -> int | None:
    if not commit:
        return None
    return db_insert_id(
        """
        INSERT INTO pg_reference (name1, address1, name2, address2, name3, address3)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            clean(data.get("referee1_name")),
            clean(data.get("referee1_address")),
            clean(data.get("referee2_name")),
            clean(data.get("referee2_address")),
            clean(data.get("referee3_name")),
            clean(data.get("referee3_address")),
        ),
    )


def insert_next_of_kin(data: dict[str, Any], commit: bool) -> int | None:
    if not commit:
        return None
    return db_insert_id(
        """
        INSERT INTO nextofkin_sponsor
            (name, address, sponsor_name, sponsor_address, phone_number, secondary_number, created_date, updated_date)
        VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW())
        RETURNING id
        """,
        (
            clean(data.get("next_of_kin_name")),
            clean(data.get("next_of_kin_address")),
            clean(data.get("sponsor_name")),
            clean(data.get("sponsor_address")),
            clean(data.get("phone_number")),
            clean(data.get("secondary_phone_number")),
        ),
    )


def create_application_and_receipt(data: dict[str, Any], commit: bool, stage: str) -> ImportResult:
    user_id, action = create_or_update_user(data, commit)
    registered_at = registration_timestamp(data)
    session_id = active_session_id()
    amount, fee_component_id = resolve_application_fee_amount()
    amount_kobo = int(amount * 100)
    proposed_course, proposed_faculty_id, degree_id = resolve_program(data)
    form_no = clean(data.get("form_no")) or generate_form_no()
    app_id = str(uuid.uuid4())
    reference_no = generate_reference_no()
    receipt_no = generate_receipt_no("application_fee", session_id)
    pg_reference_id = insert_references(data, commit)
    nok_id = insert_next_of_kin(data, commit)

    if commit:
        existing_app = db_one(
            """
            SELECT uuid, form_no
            FROM pg_application
            WHERE user_id = %s AND academic_session_id = %s
            ORDER BY created_date DESC
            LIMIT 1
            """,
            (user_id, session_id),
        )
        if existing_app:
            app_id = str(existing_app["uuid"])
            form_no = existing_app.get("form_no") or form_no

        Database.execute_update(
            """
            INSERT INTO payment_transactions
                (id, user_id, fee_component_id, academic_session_id,
                 amount, amount_in_kobo, amount_paid, amount_paid_in_kobo,
                 reference_no, receipt_no, tran_status, tran_type, currency,
                 client_name, response_code, response_description, payment_method,
                 raw_request_payload, raw_response_payload, payment_at, confirmed_at,
                 created_at, updated_at, is_successful)
            VALUES
                (%s, %s, %s, %s,
                 %s, %s, %s, %s,
                 %s, %s, 'successful', 'application_fee', 'NGN',
                 %s, 'MANUAL', 'Paid in person; imported by script', 'Manual',
                 %s::jsonb, %s::jsonb, COALESCE(%s::timestamp, NOW()), COALESCE(%s::timestamp, NOW()),
                 COALESCE(%s::timestamp, NOW()), NOW(), TRUE)
            """,
            (
                str(uuid.uuid4()),
                user_id,
                fee_component_id,
                session_id,
                amount,
                amount_kobo,
                amount,
                amount_kobo,
                reference_no,
                receipt_no,
                " ".join(filter(None, [clean(data.get("first_name")).title(), clean(data.get("middle_name")).title(), clean(data.get("surname")).title()])),
                json.dumps({"payment_type": "application_fee", "program_type_id": PROGRAM_TYPE_ID_PG, "source": "manual_pg_form_import"}),
                json.dumps({"manual_import": True, "source_file": data.get("source_file")}),
                registered_at,
                registered_at,
                registered_at,
            ),
        )

        Database.execute_update(
            """
            INSERT INTO pg_application
                (uuid, user_id, surname, first_name, middle_name, email,
                 date_of_birth, address, gender, previous_institution, department,
                 previous_course, class_of_degree, proposed_course, proposed_faculty_id,
                 degree_id, area_of_specialisation, proposed_research_title,
                 mode_of_study, physically_challenged, pg_reference_id,
                 nextofkin_sponsor_id, phone_number, secondary_phone_number,
                 form_no, applicant_stage, academic_session_id,
                 application_payment_reference, created_date, updated_date)
            VALUES
                (%s, %s, %s, %s, %s, %s,
                 %s, %s, %s, %s, %s,
                 %s, %s, %s, %s,
                 %s, %s, %s,
                 %s, %s, %s,
                 %s, %s, %s,
                 %s, %s, %s,
                 %s, COALESCE(%s::timestamp, NOW()), NOW())
            ON CONFLICT (uuid) DO UPDATE SET
                 surname = EXCLUDED.surname,
                 first_name = EXCLUDED.first_name,
                 middle_name = EXCLUDED.middle_name,
                 email = EXCLUDED.email,
                 date_of_birth = EXCLUDED.date_of_birth,
                 address = EXCLUDED.address,
                 gender = EXCLUDED.gender,
                 previous_institution = EXCLUDED.previous_institution,
                 department = EXCLUDED.department,
                 previous_course = EXCLUDED.previous_course,
                 class_of_degree = EXCLUDED.class_of_degree,
                 proposed_course = EXCLUDED.proposed_course,
                 proposed_faculty_id = EXCLUDED.proposed_faculty_id,
                 degree_id = EXCLUDED.degree_id,
                 area_of_specialisation = EXCLUDED.area_of_specialisation,
                 proposed_research_title = EXCLUDED.proposed_research_title,
                 mode_of_study = EXCLUDED.mode_of_study,
                 physically_challenged = EXCLUDED.physically_challenged,
                 pg_reference_id = EXCLUDED.pg_reference_id,
                 nextofkin_sponsor_id = EXCLUDED.nextofkin_sponsor_id,
                 phone_number = EXCLUDED.phone_number,
                 secondary_phone_number = EXCLUDED.secondary_phone_number,
                 applicant_stage = EXCLUDED.applicant_stage,
                 application_payment_reference = EXCLUDED.application_payment_reference,
                 created_date = COALESCE(EXCLUDED.created_date, pg_application.created_date),
                 updated_date = NOW()
            """,
            (
                app_id,
                user_id,
                clean(data.get("surname")).title(),
                clean(data.get("first_name")).title(),
                clean(data.get("middle_name")).title(),
                clean(data.get("email")).lower(),
                parse_date(clean(data.get("date_of_birth"))) or None,
                clean(data.get("address")),
                clean(data.get("gender")).title(),
                clean(data.get("previous_institution")),
                clean(data.get("department")),
                clean(data.get("previous_course")),
                clean(data.get("class_of_degree")),
                proposed_course,
                proposed_faculty_id,
                degree_id,
                clean(data.get("area_of_specialisation")),
                clean(data.get("proposed_research_title")),
                clean(data.get("mode_of_study")),
                clean(data.get("physically_challenged")) or "No",
                pg_reference_id,
                nok_id,
                clean(data.get("phone_number")),
                clean(data.get("secondary_phone_number")),
                form_no,
                stage,
                session_id,
                reference_no,
                registered_at,
            ),
        )

    return ImportResult(
        email=clean(data.get("email")).lower(),
        user_id=user_id,
        application_id=app_id,
        form_no=form_no,
        receipt_no=receipt_no,
        reference_no=reference_no,
        action=action,
    )


def validate_record(data: dict[str, Any]) -> list[str]:
    errors = []
    if data.get("_error"):
        errors.append(str(data["_error"]))
        return errors
    for field in ("email", "surname", "first_name"):
        if not clean(data.get(field)):
            errors.append(f"missing {field}")
    if clean(data.get("email")) and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", clean(data.get("email"))):
        errors.append("invalid email")
    return errors


def collect_records(args: argparse.Namespace) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    if args.data_json:
        records.extend(load_json_records(Path(args.data_json), args.surname_position))
    if args.data_csv:
        records.extend(load_csv_records(Path(args.data_csv), args.surname_position))
    for pdf in expand_pdf_args(args.pdfs or []):
        records.append(parse_filled_pg_pdf(pdf, args.surname_position))
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description="Import filled PG PDF forms into users, pg_application, and payment_transactions.")
    parser.add_argument("pdfs", nargs="*", help="Filled PG PDF path(s). Globs are supported.")
    parser.add_argument("--data-json", help="JSON record or list of records to import. Useful for scanned PDFs.")
    parser.add_argument("--data-csv", help="CSV records to import. Headers should match PG field names.")
    parser.add_argument("--commit", action="store_true", help="Write to the database. Without this, only previews parsed data.")
    parser.add_argument("--stage", default=DEFAULT_STAGE, help=f"Applicant stage to set. Default: {DEFAULT_STAGE}")
    parser.add_argument("--surname-position", choices=("first", "last"), default="first", help="How to split full_name when surname is not supplied.")
    args = parser.parse_args()

    records = collect_records(args)
    if not records:
        parser.error("Provide at least one PDF, --data-json, or --data-csv")

    results: list[ImportResult] = []
    had_errors = False
    for idx, record in enumerate(records, 1):
        errors = validate_record(record)
        if errors:
            had_errors = True
            print(f"\n[{idx}] SKIP: {', '.join(errors)}")
            print(json.dumps(record, indent=2, default=str))
            continue

        if not args.commit:
            print(f"\n[{idx}] DRY RUN parsed record")
            print(json.dumps(record, indent=2, default=str))
            continue

        result = create_application_and_receipt(record, commit=True, stage=args.stage)
        results.append(result)
        print(
            f"[{idx}] {result.action}: {result.email} | "
            f"form_no={result.form_no} | receipt_no={result.receipt_no}"
        )

    if args.commit and results:
        print(f"\nImported {len(results)} record(s). Default password is {DEFAULT_PASSWORD!r}.")
    elif not args.commit:
        print("\nDry run only. Re-run with --commit to write to the database.")

    return 1 if had_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
