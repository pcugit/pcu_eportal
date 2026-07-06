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
from difflib import SequenceMatcher
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
    if text in {"-", "—", "–"}:
        return ""
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


def flexible_between(text: str, starts: tuple[str, ...], ends: tuple[str, ...] = ()) -> str:
    start_matches = []
    for label in starts:
        match = re.search(re.escape(label) + r"\s*[:.]?\s*", text, re.I)
        if match:
            start_matches.append(match)
    if not start_matches:
        return ""

    start_match = min(start_matches, key=lambda item: item.start())
    value_start = start_match.end()
    value_end = len(text)
    for label in ends:
        match = re.search(re.escape(label), text[value_start:], re.I)
        if match:
            value_end = min(value_end, value_start + match.start())
    return clean(text[value_start:value_end])


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


def detect_surname_position(text: str, fallback: str) -> str:
    if re.search(r"surname\s+last", text, re.I):
        return "last"
    if re.search(r"surname\s+first", text, re.I):
        return "first"
    return fallback


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


def answer_until_label(lines: list[str], number: int, label: str, stop_labels: tuple[str, ...]) -> str:
    block = numbered_block(lines, number)
    for idx, line in enumerate(block):
        if line.lower().startswith(label.lower()):
            values = []
            for item in block[idx + 1 :]:
                if any(item.lower().startswith(stop.lower()) for stop in stop_labels):
                    break
                values.append(item)
            return clean(" ".join(values))
    return ""


def parse_table_referees(block: list[str]) -> list[tuple[str, str]]:
    referees: list[tuple[str, str]] = []
    in_referees = False
    after_header = False
    idx = 0
    while idx < len(block):
        line = clean(block[idx])
        if line.lower() == "referees":
            in_referees = True
            idx += 1
            continue
        if not in_referees:
            idx += 1
            continue
        if line.lower().startswith("sponsor"):
            break
        if line.lower() in {"referee", "name & address", "name and address"}:
            after_header = True
            idx += 1
            continue
        if line in {"1", "2", "3"}:
            value = clean(block[idx + 1]) if idx + 1 < len(block) else ""
            referees.append(parse_referee(value.replace(" — ", ", ")))
            idx += 2
            continue
        if after_header and line and line not in {"#", "Field", "Details"}:
            referees.append(parse_referee(line.replace(" — ", ", ")))
        idx += 1
    return referees


def parse_registration_date(lines: list[str]) -> str:
    block = numbered_block(lines, 22)
    for line in block:
        parsed = parse_date(line)
        if re.search(r"\d{1,2}[-/]\d{1,2}[-/]\d{2,4}", line) and parsed:
            return parsed
    return ""


def parse_numbered_pg_pdf(text: str, path: Path, surname_position: str) -> dict[str, Any]:
    lines = normalized_pdf_lines(text)
    effective_surname_position = detect_surname_position(text, surname_position)
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
    legacy_proposed_course = clean(" ".join(line for line in second_six if not line.lower().startswith("proposed course of study")))
    data["proposed_course_name"] = answer_after_label(lines, 7, "Proposed Course of Study") or legacy_proposed_course

    data["proposed_faculty_name"] = answer_after_label(lines, 8, "Proposed Faculty")
    data["degree_name"] = answer_after_label(lines, 9, "Degree in View")
    data["area_of_specialisation"] = answer_after_label(lines, 10, "Area of Specialization")
    data["proposed_research_title"] = answer_after_label(lines, 11, "Proposed Title of Research")

    mode_lines = numbered_block(lines, 12)
    if not re.search(r"Mode of Study|Full[- ]Time|Part[- ]Time", " ".join(mode_lines), re.I):
        mode_lines = numbered_block(lines, 11)
    mode_block = " ".join(mode_lines)
    if re.search(r"Part[- ]Time\s*\(\s*X\s*\)", mode_block, re.I):
        data["mode_of_study"] = "Part-Time"
    elif re.search(r"Full[- ]Time\s*\(\s*X\s*\)", mode_block, re.I):
        data["mode_of_study"] = "Full-Time"
    elif re.search(r"Full[- ]Time", mode_block, re.I):
        data["mode_of_study"] = "Full-Time"
    elif re.search(r"Part[- ]Time", mode_block, re.I):
        data["mode_of_study"] = "Part-Time"
    else:
        data["mode_of_study"] = answer_after_label(lines, 12, "Mode of Study") or clean(mode_block)

    data["transcript_uploaded"] = answer_until_label(lines, 13, "Uploaded Academic Transcript", ("Referees",))
    if not data["transcript_uploaded"] and any("Indicate if you uploaded".lower() in item.lower() for item in numbered_block(lines, 12)):
        data["transcript_uploaded"] = answer_after_label(lines, 12, "Indicate if you uploaded")
    refs_block = numbered_block(lines, 13)
    refs_text = " ".join(refs_block)
    refs = re.findall(r"\([abc]\)\s*(.*?)(?=\s*\([abc]\)|$)", refs_text, re.I)
    table_refs = parse_table_referees(refs_block)
    for idx in range(3):
        if idx < len(table_refs):
            name, address = table_refs[idx]
        else:
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
    if any("Physically Challenged".lower() in item.lower() for item in numbered_block(lines, 19)):
        data["physically_challenged"] = answer_after_label(lines, 19, "Physically Challenged") or "No"
    else:
        data["physically_challenged"] = answer_after_label(lines, 19, "Are you Physically Challenged") or "No"
    data["address"] = answer_after_label(lines, 20, "Address of Candidate")
    if "signature" in data["address"].lower():
        data["address"] = ""
    email_text = answer_after_label(lines, 21, "Email of Candidate")
    email_match = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", email_text, re.I)
    data["email"] = email_match.group(0).lower() if email_match else email_text
    data["registration_date"] = parse_registration_date(lines)
    data.update(split_name(data.get("full_name", ""), effective_surname_position))
    return data


def parse_filled_pg_pdf(path: Path, surname_position: str) -> dict[str, Any]:
    raw = extract_pdf_text(path)
    if not clean(raw):
        return {"source_file": str(path), "_error": OCR_UNAVAILABLE_MESSAGE}
    effective_surname_position = detect_surname_position(raw, surname_position)

    numbered = parse_numbered_pg_pdf(raw, path, effective_surname_position)
    if numbered.get("email") or numbered.get("full_name"):
        return numbered

    compact = re.sub(r"\s+", " ", raw)

    data: dict[str, Any] = {"source_file": str(path)}
    data["full_name"] = flexible_between(
        compact,
        ("Full Name (Surname last, in CAPITALS)", "Full Name (Surname last)", "Full Name"),
        ("Previous Institution",),
    )
    data["previous_institution"] = flexible_between(
        compact,
        ("Previous Institution(s) Attended", "Previous Institution"),
        ("Date of Birth",),
    )

    dob_sex = flexible_between(compact, ("Date of Birth",), ("Department",))
    sex_match = re.search(r"Sex[:\s]*([A-Za-z]+|M|F)", dob_sex, re.I)
    data["gender"] = {"m": "Male", "f": "Female"}.get((sex_match.group(1) if sex_match else "").lower(), clean(sex_match.group(1)).title() if sex_match else "")
    data["date_of_birth"] = parse_date(re.sub(r"Sex[:\s]*(Male|Female|M|F).*", "", dob_sex, flags=re.I))

    if not data["gender"]:
        data["gender"] = flexible_between(compact, ("Sex",), ("Department",))
    data["department"] = flexible_between(compact, ("Department",), ("Previous Course of Study",))
    data["previous_course"] = flexible_between(compact, ("Previous Course of Study",), ("Class of First Degree",))
    data["class_of_degree"] = flexible_between(compact, ("Class of First Degree",), ("Proposed Course of Study",))
    data["proposed_course_name"] = flexible_between(compact, ("Proposed Course of Study",), ("Proposed Faculty",))
    data["proposed_faculty_name"] = flexible_between(compact, ("Proposed Faculty/Institute/Centre", "Proposed Faculty"), ("Degree in View",))
    data["degree_name"] = flexible_between(compact, ("Degree in View",), ("Area of Specialization", "Area of Specialisation"))
    data["area_of_specialisation"] = flexible_between(compact, ("Area of Specialization", "Area of Specialisation"), ("Proposed Title of Research",))
    data["proposed_research_title"] = flexible_between(compact, ("Proposed Title of Research (In the case of MPhil/PhD/Ph.D)", "Proposed Title of Research (MPhil/PhD)", "Proposed Title of Research"), ("Mode of Study",))

    mode_block = flexible_between(compact, ("Mode of Study",), ("Indicate if you uploaded", "Academic Transcript Uploaded", "Uploaded Academic Transcript", "Name and Addresses"))
    if re.search(r"Part[- ]Time\s*\(\s*x\s*\)", mode_block, re.I):
        data["mode_of_study"] = "Part-Time"
    elif re.search(r"Full[- ]Time\s*\(\s*x\s*\)", mode_block, re.I):
        data["mode_of_study"] = "Full-Time"
    elif re.search(r"Full[- ]Time", mode_block, re.I):
        data["mode_of_study"] = "Full-Time"
    elif re.search(r"Part[- ]Time", mode_block, re.I):
        data["mode_of_study"] = "Part-Time"
    else:
        data["mode_of_study"] = clean(mode_block)

    data["transcript_uploaded"] = flexible_between(
        compact,
        ("Academic Transcript Uploaded", "Uploaded Academic Transcript", "academic transcript"),
        ("Name and Addresses", "Name of Sponsor"),
    )
    refs_block = flexible_between(compact, ("Name and Addresses of your 3 referees", "Name and Addresses of 3 Referees"), ("Name of Sponsor",))
    refs = re.findall(r"\([abc]\)\s*(.*?)(?=\s*\([abc]\)|$)", refs_block, re.I)
    for idx in range(3):
        name, address = parse_referee(refs[idx] if idx < len(refs) else "")
        data[f"referee{idx + 1}_name"] = name
        data[f"referee{idx + 1}_address"] = address

    data["sponsor_name"] = flexible_between(compact, ("Name of Sponsor",), ("Address of Sponsor",))
    data["sponsor_address"] = flexible_between(compact, ("Address of Sponsor",), ("Name of Next of Kin",))
    data["next_of_kin_name"] = flexible_between(compact, ("Name of Next of Kin",), ("Address of Next of Kin",))
    data["next_of_kin_address"] = flexible_between(compact, ("Address of Next of Kin",), ("Phone Number of Next of Kin",))
    phones = flexible_between(compact, ("Necessary", "Phone Number of Next of Kin / Alternate", "Phone Number of Next of Kin"), ("Are you Physically Challenged", "Physically Challenged"))
    p1, p2 = parse_phone_pair(phones)
    data["phone_number"] = p1
    data["secondary_phone_number"] = p2
    data["physically_challenged"] = flexible_between(compact, ("If yes, State", "Physically Challenged", "Are you Physically Challenged"), ("Address of Candidate", "Student's Signature")) or "No"
    data["address"] = flexible_between(compact, ("Address of Candidate",), ("Email of Candidate", "Student's Signature"))
    data["email"] = flexible_between(compact, ("Email of Candidate",), ("Student's Signature", "SECTION B"))
    signature_block = flexible_between(compact, ("Student's Signature and Date",), ("SECTION B",))
    date_match = re.search(r"\d{1,2}[-/]\d{1,2}[-/]\d{2,4}", signature_block)
    data["registration_date"] = parse_date(date_match.group(0)) if date_match else ""
    data.update(split_name(data.get("full_name", ""), effective_surname_position))
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


def name_tokens(*values: Any) -> list[str]:
    tokens: list[str] = []
    for value in values:
        for token in re.findall(r"[a-z0-9]+", clean(value).lower()):
            if token and token not in tokens:
                tokens.append(token)
    return tokens


def tokens_match(left: str, right: str) -> bool:
    return left == right or SequenceMatcher(None, left, right).ratio() >= 0.82


def user_name_match_score(record_tokens: list[str], user: dict[str, Any]) -> int:
    user_tokens = name_tokens(user.get("firstname"), user.get("middlename"), user.get("surname"))
    score = 0
    for record_token in record_tokens:
        if any(tokens_match(record_token, user_token) for user_token in user_tokens):
            score += 1
    return score


def lookup_similar_users_by_name(data: dict[str, Any], fields: list[str]) -> list[dict[str, Any]]:
    record_tokens = name_tokens(*(data.get(field) for field in fields))
    if not record_tokens:
        return []

    clauses = []
    params: list[Any] = []
    for token in record_tokens:
        clauses.append(
            "(LOWER(firstname) = %s OR LOWER(middlename) = %s OR LOWER(surname) = %s "
            "OR LOWER(firstname) LIKE %s OR LOWER(middlename) LIKE %s OR LOWER(surname) LIKE %s)"
        )
        params.extend([token, token, token, f"%{token}%", f"%{token}%", f"%{token}%"])

    candidates = Database.execute_query(
        f"""
        SELECT id, firstname, surname, middlename, email, user_type_id
        FROM users
        WHERE NULLIF(TRIM(email), '') IS NOT NULL
          AND ({' OR '.join(clauses)})
        ORDER BY created_at DESC NULLS LAST, updated_at DESC NULLS LAST
        LIMIT 50
        """,
        tuple(params),
    ) or []

    scored = [
        (user_name_match_score(record_tokens, candidate), candidate)
        for candidate in candidates
    ]
    scored = [(score, candidate) for score, candidate in scored if score >= max(1, len(record_tokens) - 1)]
    if not scored:
        return []

    best_score = max(score for score, _candidate in scored)
    return [candidate for score, candidate in scored if score == best_score]


def lookup_existing_user_by_name(data: dict[str, Any], fields: list[str]) -> list[dict[str, Any]]:
    clauses = ["NULLIF(TRIM(email), '') IS NOT NULL"]
    params: list[Any] = []

    for field in fields:
        value = clean(data.get(field))
        if not value:
            continue
        column = {"first_name": "firstname", "middle_name": "middlename", "surname": "surname"}[field]
        clauses.append(f"LOWER(TRIM({column})) = LOWER(%s)")
        params.append(value)

    if len(clauses) == 1:
        return []

    return Database.execute_query(
        f"""
        SELECT id, firstname, surname, middlename, email, user_type_id
        FROM users
        WHERE {' AND '.join(clauses)}
        ORDER BY created_at DESC NULLS LAST, updated_at DESC NULLS LAST
        """,
        tuple(params),
    ) or []


def resolve_missing_email_from_db(data: dict[str, Any], fields: list[str]) -> str | None:
    if clean(data.get("email")):
        return None

    matches = lookup_existing_user_by_name(data, fields)
    if not matches:
        matches = lookup_similar_users_by_name(data, fields)
        if not matches:
            return "missing email; no existing user matched selected name fields"

        emails = sorted({clean(row.get("email")).lower() for row in matches if clean(row.get("email"))})
        if len(emails) != 1 or len(matches) != 1:
            candidates = "; ".join(
                f"{row.get('firstname') or ''} {row.get('middlename') or ''} {row.get('surname') or ''} <{row.get('email') or ''}>".strip()
                for row in matches
            )
            return f"ambiguous similar users for missing email: {candidates}"

        candidate = matches[0]
        parsed_name = " ".join(
            filter(None, [clean(data.get("first_name")), clean(data.get("middle_name")), clean(data.get("surname"))])
        )
        candidate_name = " ".join(
            filter(None, [clean(candidate.get("firstname")), clean(candidate.get("middlename")), clean(candidate.get("surname"))])
        )
        if not prompt_yes_no(f"Did you mean {candidate_name} <{emails[0]}> for {parsed_name}?", default=False):
            return f"missing email; similar user was not confirmed: {candidate_name} <{emails[0]}>"
    if not matches:
        return "missing email; no existing user matched selected name fields"

    emails = sorted({clean(row.get("email")).lower() for row in matches if clean(row.get("email"))})
    if len(emails) != 1:
        candidates = "; ".join(
            f"{row.get('firstname') or ''} {row.get('middlename') or ''} {row.get('surname') or ''} <{row.get('email') or ''}>".strip()
            for row in matches
        )
        return f"ambiguous existing users for missing email: {candidates}"

    data["email"] = emails[0]
    data["_matched_existing_user_id"] = str(matches[0]["id"])
    data["_matched_existing_user_email"] = emails[0]
    return None


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


def course_name_alternatives(value: str) -> list[str]:
    text = clean(value)
    candidates: list[str] = []
    for candidate in (
        text,
        strip_degree_prefix(text),
        re.sub(r"\(\s*(ph\.?d|msc|m\.?sc|ma|m\.?a|mba|pgd|pgde|dba)\.?\s*\)", "", text, flags=re.I),
        re.sub(r"\b(ph\.?d|msc|m\.?sc|ma|m\.?a|mba|pgd|pgde|dba)\.?\b", "", text, flags=re.I),
    ):
        cleaned = clean(candidate)
        if cleaned and cleaned.lower() not in {item.lower() for item in candidates}:
            candidates.append(cleaned)
    return candidates


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

    alternatives = course_name_alternatives(name)

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
    preserve_existing_password = bool(data.get("_matched_existing_user_id"))
    password_hash = None if preserve_existing_password else AuthHandler.hash_password(DEFAULT_PASSWORD)
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
                       password_hash = COALESCE(%s, password_hash),
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
    password_hash = password_hash or AuthHandler.hash_password(DEFAULT_PASSWORD)
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


def normalize_name_match_fields(values: list[str]) -> list[str]:
    fields = []
    for value in values:
        normalized = norm_key(value)
        if normalized in {"first", "firstname"}:
            normalized = "first_name"
        elif normalized in {"middle", "middlename"}:
            normalized = "middle_name"
        elif normalized in {"last", "last_name"}:
            normalized = "surname"
        if normalized not in {"surname", "first_name", "middle_name"}:
            raise ValueError(f"Unsupported name field: {value}")
        if normalized not in fields:
            fields.append(normalized)
    return fields


def prompt_yes_no(question: str, default: bool = False) -> bool:
    if not sys.stdin.isatty():
        return default

    suffix = "[Y/n]" if default else "[y/N]"
    while True:
        answer = input(f"{question} {suffix} ").strip().lower()
        if not answer:
            return default
        if answer in {"y", "yes"}:
            return True
        if answer in {"n", "no"}:
            return False
        print("Please enter y or n.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Import filled PG PDF forms into users, pg_application, and payment_transactions.")
    parser.add_argument("pdfs", nargs="*", help="Filled PG PDF path(s). Globs are supported.")
    parser.add_argument("--data-json", help="JSON record or list of records to import. Useful for scanned PDFs.")
    parser.add_argument("--data-csv", help="CSV records to import. Headers should match PG field names.")
    parser.add_argument("--commit", action="store_true", help="Write to the database. Without this, only previews parsed data.")
    parser.add_argument("--stage", default=DEFAULT_STAGE, help=f"Applicant stage to set. Default: {DEFAULT_STAGE}")
    parser.add_argument("--surname-position", choices=("first", "last"), default="first", help="How to split full_name when surname is not supplied.")
    parser.add_argument(
        "--resolve-missing-email-from-db",
        action="store_true",
        help=(
            "For records without email, find an existing users.email by matching name fields. "
            "If exactly one email matches, account creation is skipped and that user is upgraded/backfilled."
        ),
    )
    parser.add_argument(
        "--name-match-fields",
        nargs="+",
        default=["surname", "first_name"],
        help=(
            "Fields used with --resolve-missing-email-from-db. "
            "Choices: surname, first_name, middle_name. Default: surname first_name."
        ),
    )
    args = parser.parse_args()
    try:
        name_match_fields = normalize_name_match_fields(args.name_match_fields)
    except ValueError as exc:
        parser.error(str(exc))

    records = collect_records(args)
    if not records:
        parser.error("Provide at least one PDF, --data-json, or --data-csv")

    resolve_missing_email = args.resolve_missing_email_from_db
    missing_email_count = sum(
        1 for record in records
        if not record.get("_error") and not clean(record.get("email"))
    )
    if missing_email_count and not resolve_missing_email:
        fields_label = ", ".join(name_match_fields)
        resolve_missing_email = prompt_yes_no(
            f"{missing_email_count} record(s) have no email. Search users by {fields_label} to resolve?",
            default=False,
        )

    valid_records: list[tuple[int, dict[str, Any]]] = []
    had_errors = False
    for idx, record in enumerate(records, 1):
        if resolve_missing_email:
            error = resolve_missing_email_from_db(record, name_match_fields)
            if error:
                record["_error"] = error

        errors = validate_record(record)
        if errors:
            had_errors = True
            print(f"\n[{idx}] SKIP: {', '.join(errors)}")
            print(json.dumps(record, indent=2, default=str))
            continue

        valid_records.append((idx, record))
        if not args.commit:
            print(f"\n[{idx}] DRY RUN parsed record")
            print(json.dumps(record, indent=2, default=str))

    commit_now = args.commit
    if not commit_now and valid_records:
        commit_now = prompt_yes_no(
            f"Commit {len(valid_records)} valid record(s) now?",
            default=False,
        )

    results: list[ImportResult] = []
    if commit_now:
        for idx, record in valid_records:
            result = create_application_and_receipt(record, commit=True, stage=args.stage)
            results.append(result)
            matched_existing = ""
            if record.get("_matched_existing_user_email"):
                matched_existing = f" | matched_existing_email={record['_matched_existing_user_email']}"
            print(
                f"[{idx}] {result.action}: {result.email} | "
                f"form_no={result.form_no} | receipt_no={result.receipt_no}{matched_existing}"
            )

    if commit_now and results:
        print(f"\nImported {len(results)} record(s). Default password is {DEFAULT_PASSWORD!r}.")
    elif not commit_now:
        print("\nDry run only. No database changes were made.")

    return 1 if had_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
