#!/usr/bin/env python
"""
Record manual postgraduate payments and optionally upgrade applicants into student accounts.

This is for PG students who submitted physical forms before the portal was ready.
Default mode is a dry run. Add --commit to write:
  - --paid-for acceptance: successful acceptance_fee payment + receipt only.
    Application remains admitted. No student row, matric number, or student role.
  - --paid-for tuition: creates successful tuition payment + receipt, then normal
    tuition downstream logic runs. Application becomes enrolled, student role is
    assigned, student row is created, and PG matric number is generated. If no
    acceptance record exists, the script warns and asks for confirmation.
  - --paid-for both: acceptance is recorded first, then tuition upgrade runs.

Examples:
  python backend/scripts/upgrade_pg_students.py --email student@example.com --paid-for acceptance
  python backend/scripts/upgrade_pg_students.py --form-no PCU/2026/PGAB12 --paid-for tuition --commit
  python backend/scripts/upgrade_pg_students.py --all --paid-for both --commit
  python backend/scripts/upgrade_pg_students.py --all --paid-for tuition --tuition-amount 250000 --commit
  python backend/scripts/upgrade_pg_students.py --email student@example.com --tuition-amount 250000
"""

from __future__ import annotations

import argparse
import json
import secrets
import sys
import uuid
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from database import Database
from utils.payment_status import (
    apply_downstream_success,
    generate_receipt_no,
    update_session_payment_status,
)


PROGRAM_TYPE_ID_PG = 2
DEFAULT_ELIGIBLE_STAGES = ("admitted", "accepted")


@dataclass
class UpgradeResult:
    user_id: Any
    email: str
    name: str
    form_no: str | None
    old_stage: str
    matric_no: str | None
    acceptance_receipt: str | None
    tuition_receipt: str | None
    action: str


def db_one(query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    rows = Database.execute_query(query, params)
    return rows[0] if rows else None


def money(value: str | Decimal | int | float) -> Decimal:
    try:
        amount = Decimal(str(value).replace(",", "").strip())
    except (InvalidOperation, AttributeError):
        raise ValueError(f"Invalid amount: {value!r}")
    if amount < 0:
        raise ValueError("Amount cannot be negative")
    return amount.quantize(Decimal("0.01"))


def amount_to_kobo(amount: Decimal) -> int:
    return int((amount * Decimal("100")).to_integral_value())


def generate_reference_no() -> str:
    return f"REF-{date.today().strftime('%Y%m%d')}-{secrets.token_hex(8).upper()}"


def active_session_id() -> int:
    row = db_one("SELECT id FROM academic_sessions WHERE is_active = TRUE LIMIT 1")
    if not row:
        raise RuntimeError("No active academic session found")
    return int(row["id"])


def active_semester_id() -> int | None:
    row = db_one("SELECT id FROM semesters WHERE is_active = TRUE LIMIT 1")
    return int(row["id"]) if row else None


def resolve_acceptance_fee(session_id: int) -> tuple[Decimal, int | None]:
    row = db_one(
        """
        SELECT pf.amount, pf.fee_component_id
        FROM program_fees pf
        JOIN fee_components fc ON fc.id = pf.fee_component_id
        WHERE LOWER(fc.name) LIKE %s
          AND pf.program_type = %s
          AND pf.academic_session_id = %s
        LIMIT 1
        """,
        ("%acceptance%", str(PROGRAM_TYPE_ID_PG), session_id),
    )
    if not row:
        row = db_one(
            """
            SELECT pf.amount, pf.fee_component_id
            FROM program_fees pf
            JOIN fee_components fc ON fc.id = pf.fee_component_id
            WHERE LOWER(fc.name) LIKE %s
              AND pf.program_type = %s
            ORDER BY pf.id DESC
            LIMIT 1
            """,
            ("%acceptance%", str(PROGRAM_TYPE_ID_PG)),
        )
    if not row:
        raise RuntimeError("No PG acceptance fee configured in program_fees")
    return money(row["amount"]), row.get("fee_component_id")


def resolve_tuition_expected(user_id: Any, session_id: int) -> Decimal | None:
    row = db_one(
        """
        SELECT pg.proposed_faculty_id AS faculty_id,
               COALESCE(pt.level_id, 5) AS level_id
        FROM pg_application pg
        LEFT JOIN program_types pt ON pt.id = %s
        WHERE pg.user_id = %s
        ORDER BY pg.updated_date DESC NULLS LAST, pg.created_date DESC
        LIMIT 1
        """,
        (PROGRAM_TYPE_ID_PG, user_id),
    )
    if not row or not row.get("faculty_id"):
        return None

    total = db_one(
        """
        SELECT COALESCE(SUM(pf.amount), 0) AS amount
        FROM program_fees pf
        JOIN fee_components fc ON fc.id = pf.fee_component_id
        WHERE pf.program_type = %s
          AND pf.level = %s
          AND pf.faculty_id = %s
          AND pf.academic_session_id = %s
          AND LOWER(fc.name) NOT LIKE %s
        """,
        (
            str(PROGRAM_TYPE_ID_PG),
            str(row["level_id"]),
            str(row["faculty_id"]),
            session_id,
            "%acceptance%",
        ),
    )
    if not total or Decimal(str(total.get("amount") or 0)) <= 0:
        return None
    return money(total["amount"])


def find_applicants(args: argparse.Namespace) -> list[dict[str, Any]]:
    filters = []
    params: list[Any] = []

    if args.email:
        filters.append("LOWER(u.email) = LOWER(%s)")
        params.append(args.email)
    if args.form_no:
        filters.append("pg.form_no = %s")
        params.append(args.form_no)
    if args.application_id:
        filters.append("pg.uuid = %s")
        params.append(args.application_id)
    if not filters and not args.all:
        raise ValueError("Pass --all, --email, --form-no, or --application-id")

    stages = list(DEFAULT_ELIGIBLE_STAGES)
    if args.include_submitted:
        stages.append("submitted")
    if args.include_enrolled:
        stages.append("enrolled")

    where = " AND ".join(filters) if filters else "TRUE"
    params.append(stages)

    rows = Database.execute_query(
        f"""
        SELECT pg.uuid AS application_id,
               pg.user_id,
               pg.form_no,
               pg.applicant_stage,
               pg.academic_session_id,
               pg.acceptance_payment_reference,
               pg.pg_reference_id,
               u.email,
               u.firstname,
               u.middlename,
               u.surname,
               u.matric_no,
               s."Id" AS student_id,
               s."MatricNo" AS student_matric_no,
               s."RefNo" AS student_ref_no
        FROM pg_application pg
        JOIN users u ON u.id = pg.user_id
        LEFT JOIN students s ON s."UserId" = u.id
        WHERE {where}
          AND pg.applicant_stage = ANY(%s)
        ORDER BY pg.created_date ASC
        """,
        tuple(params),
    )
    return rows or []


def existing_successful_payment(user_id: Any, tran_type: str, session_id: int) -> dict[str, Any] | None:
    return db_one(
        """
        SELECT reference_no, receipt_no, amount_paid
        FROM payment_transactions
        WHERE user_id = %s
          AND tran_type = %s
          AND tran_status = 'successful'
          AND academic_session_id = %s
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (user_id, tran_type, session_id),
    )


def backfill_student_ref_no(user_id: Any, pg_reference_id: Any, commit: bool) -> bool:
    if not pg_reference_id:
        return False
    ref_no = str(pg_reference_id)
    if not commit:
        return True
    return bool(Database.execute_update(
        """
        UPDATE students
        SET "RefNo" = COALESCE("RefNo", %s::text),
            "UpdatedDate" = NOW()
        WHERE "UserId" = %s
        """,
        (ref_no, user_id),
    ))


def insert_manual_payment(
    *,
    user_id: Any,
    tran_type: str,
    amount: Decimal,
    session_id: int,
    semester_id: int | None,
    fee_component_id: int | None,
    client_name: str,
    source_note: str,
    paid_at: str | None,
) -> tuple[str, str]:
    reference_no = generate_reference_no()
    receipt_no = generate_receipt_no(tran_type, session_id)
    amount_kobo = amount_to_kobo(amount)

    Database.execute_update(
        """
        INSERT INTO payment_transactions
            (id, user_id, fee_component_id, academic_session_id, semester_id,
             amount, amount_in_kobo, amount_paid, amount_paid_in_kobo,
             reference_no, receipt_no, tran_status, tran_type, currency,
             client_name, response_code, response_description, payment_method,
             raw_request_payload, raw_response_payload, payment_at, confirmed_at,
             created_at, updated_at, is_successful)
        VALUES
            (%s, %s, %s, %s, %s,
             %s, %s, %s, %s,
             %s, %s, 'successful', %s, 'NGN',
             %s, 'MANUAL', %s, 'Manual',
             %s::jsonb, %s::jsonb, COALESCE(%s::timestamp, NOW()), COALESCE(%s::timestamp, NOW()),
             COALESCE(%s::timestamp, NOW()), NOW(), TRUE)
        """,
        (
            str(uuid.uuid4()),
            user_id,
            fee_component_id,
            session_id,
            semester_id if tran_type == "tuition" else None,
            amount,
            amount_kobo,
            amount,
            amount_kobo,
            reference_no,
            receipt_no,
            tran_type,
            client_name,
            source_note,
            json.dumps({"payment_type": tran_type, "program_type_id": PROGRAM_TYPE_ID_PG, "source": "manual_pg_student_upgrade"}),
            json.dumps({"manual_import": True, "source": "upgrade_pg_students.py"}),
            paid_at,
            paid_at,
            paid_at,
        ),
    )
    return reference_no, receipt_no


def prompt_tuition_amount(applicant: dict[str, Any], expected: Decimal | None) -> Decimal:
    name = " ".join(
        filter(None, [applicant.get("firstname"), applicant.get("middlename"), applicant.get("surname")])
    )
    hint = f" expected total is NGN {expected:,.2f}" if expected is not None else ""
    while True:
        raw = input(f"Tuition paid for {name} <{applicant.get('email')}> ({applicant.get('form_no')}){hint}: NGN ").strip()
        try:
            return money(raw)
        except ValueError as exc:
            print(exc)


def prompt_paid_for() -> str:
    choices = {"1": "acceptance", "2": "tuition", "3": "both"}
    print("What has the applicant paid for?")
    print("  1. acceptance")
    print("  2. tuition")
    print("  3. both")
    while True:
        raw = input("Select 1, 2, or 3: ").strip().lower()
        if raw in choices:
            return choices[raw]
        if raw in choices.values():
            return raw
        print("Please enter 1, 2, 3, acceptance, tuition, or both.")


def confirm_tuition_without_acceptance(applicant: dict[str, Any]) -> bool:
    name = " ".join(
        filter(None, [applicant.get("firstname"), applicant.get("middlename"), applicant.get("surname")])
    )
    print()
    print("WARNING: This applicant has no successful acceptance fee payment record and is not currently accepted/enrolled.")
    print(f"Applicant: {name} <{applicant.get('email')}> ({applicant.get('form_no')})")
    print("If they also paid acceptance, use --paid-for both so the acceptance receipt is created too.")
    print("If you continue with tuition only, the script will create only the tuition record and then run the student upgrade.")
    while True:
        raw = input("Continue with tuition only? [y/N]: ").strip().lower()
        if raw in ("y", "yes"):
            return True
        if raw in ("", "n", "no"):
            return False
        print("Please enter y or n.")


def upgrade_applicant(
    applicant: dict[str, Any],
    *,
    commit: bool,
    paid_for: str,
    tuition_amount: Decimal | None,
    acceptance_amount: Decimal | None,
    paid_at: str | None,
    force_tuition: bool,
    yes: bool,
) -> UpgradeResult:
    user_id = applicant["user_id"]
    session_id = int(applicant.get("academic_session_id") or active_session_id())
    semester_id = active_semester_id()
    old_stage = applicant.get("applicant_stage") or ""
    name = " ".join(
        filter(None, [applicant.get("firstname"), applicant.get("middlename"), applicant.get("surname")])
    )

    resolved_acceptance, acceptance_fee_component_id = resolve_acceptance_fee(session_id)
    acceptance_amount = acceptance_amount if acceptance_amount is not None else resolved_acceptance

    should_record_acceptance = paid_for in ("acceptance", "both")
    should_record_tuition = paid_for in ("tuition", "both")

    existing_acceptance = existing_successful_payment(user_id, "acceptance_fee", session_id)
    existing_tuition = existing_successful_payment(user_id, "tuition", session_id)
    existing_student = applicant.get("student_id")
    has_pg_reference = bool(applicant.get("pg_reference_id"))
    has_acceptance_record = bool(
        existing_acceptance
        or old_stage in ("accepted", "enrolled")
    )
    tuition_without_acceptance = paid_for == "tuition" and not has_acceptance_record

    if tuition_without_acceptance and not yes:
        if not confirm_tuition_without_acceptance(applicant):
            return UpgradeResult(
                user_id=user_id,
                email=applicant["email"],
                name=name,
                form_no=applicant.get("form_no"),
                old_stage=old_stage,
                matric_no=applicant.get("student_matric_no") or applicant.get("matric_no"),
                acceptance_receipt=None,
                tuition_receipt=None,
                action="skipped_missing_acceptance_fee_confirmation",
            )

    if tuition_without_acceptance:
        print("Proceeding with tuition only; no acceptance fee receipt will be created.")

    if should_record_tuition:
        expected_tuition = resolve_tuition_expected(user_id, session_id)
        if tuition_amount is None:
            tuition_amount = prompt_tuition_amount(applicant, expected_tuition)

    if should_record_tuition and existing_student and existing_tuition and not force_tuition:
        ref_action = ""
        if not applicant.get("student_ref_no") and has_pg_reference:
            did_backfill = backfill_student_ref_no(user_id, applicant.get("pg_reference_id"), commit)
            ref_action = (
                "_refno_backfilled"
                if commit and did_backfill
                else "_refno_backfill_failed"
                if commit
                else "_refno_would_backfill"
            )
        return UpgradeResult(
            user_id=user_id,
            email=applicant["email"],
            name=name,
            form_no=applicant.get("form_no"),
            old_stage=old_stage,
            matric_no=applicant.get("student_matric_no") or applicant.get("matric_no"),
            acceptance_receipt=existing_acceptance.get("receipt_no") if existing_acceptance else None,
            tuition_receipt=existing_tuition.get("receipt_no"),
            action=f"skipped_existing_student_and_tuition{ref_action}",
        )

    if not commit:
        tuition_display = (
            f"NGN {tuition_amount:,.2f}" if should_record_tuition and tuition_amount is not None else "not recorded"
        )
        acceptance_display = f"NGN {acceptance_amount:,.2f}" if should_record_acceptance else "not recorded"
        return UpgradeResult(
            user_id=user_id,
            email=applicant["email"],
            name=name,
            form_no=applicant.get("form_no"),
            old_stage=old_stage,
            matric_no=applicant.get("student_matric_no") or ("(would generate)" if should_record_tuition else None),
            acceptance_receipt=(
                existing_acceptance.get("receipt_no")
                if existing_acceptance
                else ("(would create)" if should_record_acceptance else None)
            ),
            tuition_receipt=(
                existing_tuition.get("receipt_no")
                if existing_tuition and not force_tuition
                else ("(would create)" if should_record_tuition else None)
            ),
            action=(
                f"dry_run paid_for={paid_for}, target_stage="
                f"{'enrolled' if should_record_tuition else 'admitted'}, "
                f"acceptance={acceptance_display}, tuition={tuition_display}"
            ),
        )

    acceptance_receipt = existing_acceptance.get("receipt_no") if existing_acceptance else None
    acceptance_ref = existing_acceptance.get("reference_no") if existing_acceptance else None
    if should_record_acceptance and existing_acceptance:
        acceptance_ref = existing_acceptance["reference_no"]
        acceptance_receipt = existing_acceptance.get("receipt_no")
    elif should_record_acceptance:
        acceptance_ref, acceptance_receipt = insert_manual_payment(
            user_id=user_id,
            tran_type="acceptance_fee",
            amount=acceptance_amount,
            session_id=session_id,
            semester_id=None,
            fee_component_id=acceptance_fee_component_id,
            client_name=name,
            source_note="Paid in person; PG student upgraded by script",
            paid_at=paid_at,
        )

    if should_record_acceptance and acceptance_ref:
        Database.execute_update(
            """
            UPDATE pg_application
            SET applicant_stage = CASE
                    WHEN applicant_stage = 'enrolled' THEN 'enrolled'
                    ELSE 'admitted'
                END,
                acceptance_payment_reference = COALESCE(acceptance_payment_reference, %s),
                updated_date = NOW()
            WHERE uuid = %s
            """,
            (acceptance_ref, applicant["application_id"]),
        )
        Database.execute_update(
            "UPDATE users SET user_type_id = 13, updated_at = NOW() WHERE id = %s",
            (user_id,),
        )

        if should_record_tuition:
            apply_downstream_success(user_id, "acceptance_fee", reference_no=acceptance_ref)

    if not should_record_tuition:
        return UpgradeResult(
            user_id=user_id,
            email=applicant["email"],
            name=name,
            form_no=applicant.get("form_no"),
            old_stage=old_stage,
            matric_no=applicant.get("student_matric_no") or applicant.get("matric_no"),
            acceptance_receipt=acceptance_receipt,
            tuition_receipt=None,
            action="recorded_acceptance_only",
        )

    if existing_acceptance and old_stage not in ("accepted", "enrolled"):
        apply_downstream_success(user_id, "acceptance_fee", reference_no=existing_acceptance["reference_no"])

    if tuition_without_acceptance and old_stage not in ("accepted", "enrolled"):
        Database.execute_update(
            """
            UPDATE pg_application
            SET applicant_stage = 'accepted',
                updated_date = NOW()
            WHERE uuid = %s
            """,
            (applicant["application_id"],),
        )

    tuition_receipt = existing_tuition.get("receipt_no") if existing_tuition and not force_tuition else None
    tuition_ref = existing_tuition.get("reference_no") if existing_tuition and not force_tuition else None
    if not tuition_ref:
        tuition_ref, tuition_receipt = insert_manual_payment(
            user_id=user_id,
            tran_type="tuition",
            amount=tuition_amount,
            session_id=session_id,
            semester_id=semester_id,
            fee_component_id=None,
            client_name=name,
            source_note="Tuition paid in person; PG student upgraded by script",
            paid_at=paid_at,
        )

    Database.execute_update(
        """
        UPDATE pg_application
        SET applicant_stage = 'enrolled',
            acceptance_payment_reference = COALESCE(acceptance_payment_reference, %s),
            updated_date = NOW()
        WHERE uuid = %s
          AND applicant_stage IN ('accepted', 'admitted', 'enrolled')
        """,
        (acceptance_ref, applicant["application_id"]),
    )
    apply_downstream_success(user_id, "tuition", reference_no=tuition_ref)
    update_session_payment_status(tuition_ref, user_id)

    student = db_one(
        """
        SELECT s."MatricNo" AS matric_no
        FROM students s
        WHERE s."UserId" = %s
        ORDER BY s."CreatedDate" DESC
        LIMIT 1
        """,
        (user_id,),
    )
    backfill_student_ref_no(user_id, applicant.get("pg_reference_id"), commit)

    return UpgradeResult(
        user_id=user_id,
        email=applicant["email"],
        name=name,
        form_no=applicant.get("form_no"),
        old_stage=old_stage,
        matric_no=student.get("matric_no") if student else None,
        acceptance_receipt=acceptance_receipt,
        tuition_receipt=tuition_receipt,
        action="upgraded",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Upgrade accepted/admitted PG applicants into students with manual payment receipts."
    )
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--all", action="store_true", help="Process every eligible PG application")
    target.add_argument("--email", help="Process one applicant by user email")
    target.add_argument("--form-no", help="Process one applicant by PG form number")
    target.add_argument("--application-id", help="Process one applicant by pg_application uuid")

    parser.add_argument("--commit", action="store_true", help="Write changes. Omit for dry run.")
    parser.add_argument("--include-submitted", action="store_true", help="Also process submitted PG applications")
    parser.add_argument("--include-enrolled", action="store_true", help="Also process already enrolled PG applications")
    parser.add_argument(
        "--paid-for",
        choices=("acceptance", "tuition", "both"),
        help=(
            "What to record. 'acceptance' records acceptance fee only and leaves stage admitted; "
            "'tuition' records tuition and performs student upgrade; "
            "'both' records both."
        ),
    )
    parser.add_argument("--yes", action="store_true", help="Answer yes to tuition-only warning prompts")
    parser.add_argument("--force-tuition", action="store_true", help="Create a new tuition transaction even if one already exists")
    parser.add_argument("--tuition-amount", help="Use the same tuition amount for all selected applicants")
    parser.add_argument("--acceptance-amount", help="Override configured PG acceptance fee amount")
    parser.add_argument("--paid-at", help="Payment timestamp, e.g. 2026-07-02 or 2026-07-02 14:30:00")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.paid_for:
        args.paid_for = prompt_paid_for()

    tuition_amount = money(args.tuition_amount) if args.tuition_amount else None
    acceptance_amount = money(args.acceptance_amount) if args.acceptance_amount else None

    applicants = find_applicants(args)
    if not applicants:
        print("No matching PG applications found.")
        return 1

    mode = "COMMIT" if args.commit else "DRY RUN"
    print(f"{mode}: {len(applicants)} PG application(s) selected.")
    print(f"Recording: {args.paid_for}")
    if args.paid_for in ("tuition", "both"):
        print("Tuition amount will be prompted per applicant after acceptance checks, unless --tuition-amount was supplied.\n")
    else:
        print("Acceptance only: no matric number or student record will be created.\n")

    results: list[UpgradeResult] = []
    for applicant in applicants:
        result = upgrade_applicant(
            applicant,
            commit=args.commit,
            paid_for=args.paid_for,
            tuition_amount=tuition_amount,
            acceptance_amount=acceptance_amount,
            paid_at=args.paid_at,
            force_tuition=args.force_tuition,
            yes=args.yes,
        )
        results.append(result)
        print(
            f"{result.action}: {result.name} <{result.email}> | "
            f"stage={result.old_stage} | form_no={result.form_no} | "
            f"matric={result.matric_no} | acceptance={result.acceptance_receipt} | "
            f"tuition={result.tuition_receipt}"
        )

    if not args.commit:
        print("\nDry run only. Re-run with --commit to write these changes.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
