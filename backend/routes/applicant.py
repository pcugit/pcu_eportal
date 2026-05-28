from flask import Blueprint, request, jsonify, Response, send_file, redirect
from database import Database
from utils.auth import AuthHandler
from utils.document_handler import DocumentHandler
from utils.pdf_generator import PDFGenerator
from utils.payment_receipt_generator import PaymentReceiptGenerator
from utils.medical_form_generator import MedicalFormGenerator
from utils.interswitch import InterswitchClient
from utils.payment_status import (
    classify_response,
    apply_downstream_success,
    build_update_sql_params,
    generate_receipt_no,
)
from config import Config
from datetime import datetime, date
import os
import uuid
import secrets
import string
import json

applicant_bp = Blueprint('Applicant', __name__)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def generate_reference_no() -> str:
    """REF-{YYYYMMDD}-{16 hex chars uppercase}"""
    return f"REF-{date.today().strftime('%Y%m%d')}-{secrets.token_hex(8).upper()}"


def generate_receipt_no() -> str:
    """pcu-{YYYYMMDD}-{16 hex chars uppercase}"""
    return f"pcu-{date.today().strftime('%Y%m%d')}-{secrets.token_hex(8).upper()}"


def _prog_code(pt_id) -> str:
    """Return a short uppercase code for a program_type (e.g. UTME, PG, DE)."""
    res  = Database.execute_query('SELECT name FROM program_types WHERE id = %s', (pt_id,))
    name = (res[0]['name'] if res else '').upper()
    TYPE_MAP = {
        'UTME':         'UTME',
        'POSTGRADUATE': 'PG',
        'DIRECT':       'DE',
        'JUPEB':        'JUP',
        'PART':         'PT',
        'HND':          'HND',
    }
    for key, code in TYPE_MAP.items():
        if key in name:
            return code
    letters = ''.join(c for c in name if c.isalpha())
    return letters[:4] if letters else 'APP'


def _ensure_application_row(user_id, program_type_id, current_session_id, reference_no):
    """
    Create an application row if one doesn't already exist for this user +
    program_type + session.  Returns the application id.

    If a row already exists but its stored application_payment_reference has
    NOT been confirmed as successful, update it to point at the new reference.
    This handles the case where a first payment stayed pending/failed and the
    applicant initiates a fresh attempt.
    """
    existing = Database.execute_query(
        '''SELECT id, application_payment_reference
           FROM applications
           WHERE user_id = %s AND prog_type = %s AND academic_session_id = %s''',
        (user_id, program_type_id, current_session_id)
    )
    if existing:
        app_id       = existing[0]['id']
        stored_ref   = existing[0].get('application_payment_reference')

        # Check whether the stored reference already has a successful transaction
        if stored_ref:
            already_paid = Database.execute_query(
                """SELECT id FROM payment_transactions
                   WHERE reference_no = %s AND tran_status = 'successful'
                   LIMIT 1""",
                (stored_ref,)
            )
        else:
            already_paid = None

        # If not yet paid, update the reference to the new attempt
        if not already_paid:
            Database.execute_update(
                """UPDATE applications
                   SET application_payment_reference = %s, updated_at = NOW()
                   WHERE id = %s""",
                (reference_no, app_id)
            )

        return app_id

    year = datetime.now().year
    code = _prog_code(program_type_id)
    while True:
        suffix  = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))
        form_no = f"PCU/{year}/{code}{suffix}"
        if not Database.execute_query('SELECT id FROM applications WHERE form_no = %s', (form_no,)):
            break

    level_id = None
    pt_res = Database.execute_query(
        'SELECT level_id FROM program_types WHERE id = %s', (program_type_id,)
    )
    if pt_res:
        level_id = pt_res[0]['level_id']

    Database.execute_update(
        '''INSERT INTO applications
               (user_id, form_no, prog_type, academic_session_id,
                applicant_stage, application_payment_reference, level_id)
           VALUES (%s, %s, %s, %s, %s, %s, %s)''',
        (user_id, form_no, program_type_id, current_session_id, 'started', reference_no, level_id)
    )
    res = Database.execute_query(
        'SELECT id FROM applications WHERE form_no = %s', (form_no,)
    )
    return res[0]['id'] if res else None


def _get_applicant_fee_context(user_id):
    app_res = Database.execute_query(
        '''SELECT app.prog_type,
                  pt.level_id,
                  app.finalised_course,
                  app.approved_course,
                  app.program_setup_id
           FROM applications app
           JOIN program_types pt ON app.prog_type = pt.id
           WHERE app.user_id = %s AND app.applicant_stage IN ('admitted', 'accepted', 'enrolled')
           ORDER BY app.created_at DESC LIMIT 1''',
        (user_id,)
    )
    if not app_res:
        raise ValueError('No admitted or accepted application found for this user')

    app_row = app_res[0]
    finalised_course = (app_row.get('finalised_course') or '').strip()
    if not finalised_course:
        finalised_course = (app_row.get('approved_course') or '').strip()
    if not finalised_course and app_row.get('program_setup_id'):
        ps_res = Database.execute_query(
            'SELECT name FROM program_setup WHERE id = %s',
            (app_row['program_setup_id'],)
        )
        if ps_res:
            finalised_course = ps_res[0]['name']

    if not finalised_course:
        raise ValueError('finalised_course is required to resolve faculty and fees')

    faculty_res = Database.execute_query(
        '''SELECT faculty_id
           FROM program_setup
           WHERE LOWER(name) = LOWER(%s)
           LIMIT 1''',
        (finalised_course,)
    )
    if not faculty_res or faculty_res[0].get('faculty_id') is None:
        raise ValueError(f"No faculty found for finalised_course '{finalised_course}'")

    return {
        'program_type': app_row['prog_type'],
        'level': app_row['level_id'],
        'faculty_id': faculty_res[0]['faculty_id'],
        'finalised_course': finalised_course,
    }


def _resolve_fee_amount(payment_type: str, user_id, program_type_id=None, installment_plan_id=None) -> float:
    """
    Resolve the fee amount in Naira for a given payment_type.
    Raises ValueError if it cannot be determined.
    """
    if payment_type == 'application_fee':
        if not program_type_id:
            raise ValueError('program_type_id is required for application_fee')

        # Fixed mapping: program_type_id → program_fees.id
        fee_mapping = {1: 42, 6: 43, 4: 40, 2: 37, 7: 38, 3: 39, 5: 41}
        fee_id = fee_mapping.get(int(program_type_id))
        if not fee_id:
            raise ValueError(f'No fee mapping for program_type_id {program_type_id}')

        res = Database.execute_query('SELECT amount FROM program_fees WHERE id = %s', (fee_id,))
        if not res:
            raise ValueError(f'Fee record not found for program_fees.id={fee_id}')
        return float(res[0]['amount'])

    if payment_type == 'acceptance_fee':
        app_res = Database.execute_query(
            'SELECT prog_type FROM applications WHERE user_id = %s ORDER BY created_at DESC LIMIT 1',
            (user_id,)
        )
        if not app_res:
            raise ValueError('No application found for this user')
        prog_type = app_res[0]['prog_type']

        fee_res = Database.execute_query(
            '''SELECT pf.amount
               FROM program_fees pf
               JOIN fee_components fc ON fc.id = pf.fee_component_id
               WHERE LOWER(fc.name) LIKE %s
                 AND pf.program_type = %s
                 AND pf.academic_session_id = (
                     SELECT id FROM academic_sessions WHERE is_active = TRUE LIMIT 1
                 )
               LIMIT 1''',
            ('%acceptance%', str(prog_type))
        )
        # Fallback: any acceptance fee for the active session
        if not fee_res:
            fee_res = Database.execute_query(
                '''SELECT pf.amount
                   FROM program_fees pf
                   JOIN fee_components fc ON fc.id = pf.fee_component_id
                   WHERE LOWER(fc.name) LIKE %s
                     AND pf.academic_session_id = (
                         SELECT id FROM academic_sessions WHERE is_active = TRUE LIMIT 1
                     )
                   LIMIT 1''',
                ('%acceptance%',)
            )
        return float(fee_res[0]['amount']) if fee_res else 40000.0

    context = _get_applicant_fee_context(user_id)

    if payment_type == 'tuition':
        fee_rows = Database.execute_query(
            '''SELECT pf.amount
               FROM program_fees pf
               JOIN fee_components fc ON fc.id = pf.fee_component_id
               WHERE LOWER(fc.name) NOT LIKE '%%acceptance%%'
                 AND pf.program_type = %s
                 AND pf.level = %s
                 AND pf.faculty_id = %s
                 AND pf.academic_session_id = (
                     SELECT id FROM academic_sessions WHERE is_active = TRUE LIMIT 1
                 )''',
            (str(context['program_type']), str(context['level']), str(context['faculty_id']))
        )
        total = sum(float(fee.get('amount') or 0) for fee in (fee_rows or []))
        if total <= 0:
            raise ValueError('Tuition fee breakdown not configured for this program_type, level, and faculty')

        # If an installment_plan_id is supplied, compute the installment amount
        # as percentage of the total using the percentage stored in installment_plans
        if installment_plan_id:
            ip = Database.execute_query(
                'SELECT percentage FROM installment_plans WHERE id = %s LIMIT 1',
                (installment_plan_id,)
            )
            if not ip:
                raise ValueError(f'Installment plan id {installment_plan_id} not found')
            try:
                pct = float(ip[0].get('percentage') or 0)
            except Exception:
                pct = 0.0
            if pct <= 0:
                raise ValueError('Invalid installment percentage for selected plan')
            installment_amount = round((total * pct) / 100.0, 2)
            return installment_amount

        return total

    raise ValueError(f"Unknown payment_type: {payment_type}")


def _get_processing_fee() -> float:
    """Fetch the processing fee from system_settings (key='processing_fee').
    Falls back to 300.0 if the key is missing or cannot be parsed."""
    try:
        res = Database.execute_query(
            "SELECT value FROM system_settings WHERE key = 'processing_fee' LIMIT 1"
        )
        return float(res[0]['value']) if res else 300.0
    except Exception:
        return 300.0


# ─────────────────────────────────────────────────────────────────────────────
# Public / lookup endpoints
# ─────────────────────────────────────────────────────────────────────────────

@applicant_bp.route('/olevel-data', methods=['GET'])
def get_olevel_data():
    subjects = Database.execute_query('SELECT id, name FROM olevel_subjects ORDER BY name ASC')
    grades   = Database.execute_query('SELECT id, grade FROM olevel_grades ORDER BY id ASC')
    return jsonify({'status': 'success', 'subjects': subjects or [], 'grades': grades or []})


@applicant_bp.route('/programs', methods=['GET'])
def get_programs():
    program_type_id = request.args.get('program_type_id')
    programs = Database.execute_query(
        '''SELECT
               ps.id  AS program_id, ps.name AS program,
               d.id   AS department_id, d.name AS department,
               dg.id  AS degree_id, dg.name AS degree, dg.code AS degree_code,
               dy.years AS duration
           FROM degree_program dp
           JOIN degrees dg       ON dp.degree_id     = dg.id
           JOIN program_setup ps ON ps.degree_id     = dp.degree_id
           JOIN departments d    ON ps.department_id = d.id
           JOIN duration_years dy ON dp.duration_id  = dy.id
           WHERE dp.program_type_id = %s
           ORDER BY d.name, ps.name''',
        (program_type_id,)
    )

    global_lock = False
    pt_status   = {'undergraduate': True, 'postgraduate': False, 'part-time': False, 'jupeb': False}

    try:
        settings_res = Database.execute_query(
            "SELECT key, value FROM system_settings WHERE key IN "
            "('admission_registration_locked','undergraduate_admission_locked',"
            "'postgraduate_admission_locked','part_time_admission_locked','jupeb_admission_locked')"
        )
        for s in (settings_res or []):
            is_locked = (s['value'] == 'true')
            if   s['key'] == 'admission_registration_locked' and is_locked: global_lock = True
            elif s['key'] == 'undergraduate_admission_locked':  pt_status['undergraduate'] = not is_locked
            elif s['key'] == 'postgraduate_admission_locked':   pt_status['postgraduate']  = not is_locked
            elif s['key'] == 'part_time_admission_locked':      pt_status['part-time']     = not is_locked
            elif s['key'] == 'jupeb_admission_locked':          pt_status['jupeb']         = not is_locked
    except Exception:
        pass

    return jsonify({
        'programs': programs or [],
        'global_admission_locked': global_lock,
        'program_types_status': pt_status
    }), 200


@applicant_bp.route('/program-types', methods=['GET'])
def get_program_types():
    types = Database.execute_query(
        'SELECT id, name FROM program_types WHERE id BETWEEN 1 AND 7 ORDER BY id'
    )
    fee_mapping = {1: 42, 6: 43, 4: 40, 2: 37, 7: 38, 3: 39, 5: 41}
    fee_ids  = list(fee_mapping.values())
    fees_data = Database.execute_query(
        'SELECT id, amount FROM program_fees WHERE id IN %s', (tuple(fee_ids),)
    )
    fee_lookup = {f['id']: float(f['amount']) for f in (fees_data or [])}
    for t in (types or []):
        fee_id = fee_mapping.get(t['id'])
        if fee_id:
            t['fee'] = fee_lookup.get(fee_id, 0)
    return jsonify({'program_types': types or []}), 200


@applicant_bp.route('/installment-plans', methods=['GET'])
@AuthHandler.token_required
def get_installment_plans(payload):
    """Return available installment plans (id, label, name, percentage)."""
    try:
        plans = Database.execute_query(
            'SELECT id, label, name, percentage FROM installment_plans ORDER BY id'
        )
        formatted = [
            {
                'id': p['id'],
                'label': p.get('label'),
                'name': p.get('name'),
                'percentage': float(p.get('percentage') or 0),
            }
            for p in (plans or [])
        ]
        return jsonify({'installment_plans': formatted}), 200
    except Exception as e:
        print(f"[installment-plans] Error: {e}")
        return jsonify({'installment_plans': []}), 200


# ─────────────────────────────────────────────────────────────────────────────
# Application form
# ─────────────────────────────────────────────────────────────────────────────

@applicant_bp.route('/form/<int:program_type_id>', methods=['GET'])
@AuthHandler.token_required
def get_form_template(payload, program_type_id):
    role = str(payload.get('role', '')).lower()
    user_type_id = str(payload.get('user_type_id', ''))
    
    if role not in ('applicant', 'student', 'admitted') and user_type_id not in ('2', '7', '13', '15'):
        return jsonify({'message': 'Access denied. Valid applicant or student role required.'}), 403

    form_templates = {
        1: {
            'program': 'Undergraduate',
            'steps': [
                {
                    'title': 'Personal Information',
                    'type': 'fields',
                    'fields': [
                        {'name': 'email', 'type': 'email', 'label': 'Email', 'required': True, 'disabled': True},
                        {'name': 'first_name', 'type': 'text', 'label': 'First Name', 'required': True, 'disabled': True},
                        {'name': 'last_name', 'type': 'text', 'label': 'Last Name', 'required': True, 'disabled': True},
                        {'name': 'middle_name', 'type': 'text', 'label': 'Middle name', 'required': False},
                        {'name': 'gender', 'type': 'select', 'label': 'Gender', 'options': ['Male', 'Female'], 'required': True},
                        {'name': 'date_of_birth', 'type': 'date', 'label': 'Date of Birth', 'required': True},
                        {'name': 'place_of_birth', 'type': 'text', 'label': 'Place of birth', 'required': True},
                        {'name': 'marital_status', 'type': 'select', 'label': 'Marital Status', 'options': ['Single', 'Married', 'Divorced', 'Widowed'], 'required': True},
                        {'name': 'religion', 'type': 'select', 'label': 'Religion', 'options': ['Christianity', 'Islam', 'Traditional', 'Other'], 'required': True},
                        {'name': 'blood_group', 'type': 'text', 'label': 'Blood Group', 'required': False},
                        {'name': 'genotype', 'type': 'text', 'label': 'Genotype', 'required': False},
                        {'name': 'phone_number', 'type': 'text', 'label': 'Phone Number', 'required': True, 'disabled': True},
                        {'name': 'secondary_phone_number', 'type': 'text', 'label': 'Secondary Phone Number', 'required': False},
                        {'name': 'nationality', 'type': 'select', 'label': 'Nationality', 'options': ['Nigerian', 'Non-Nigerian'], 'required': True},
                        {'name': 'state', 'type': 'select', 'label': 'State', 'options': ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara','FCT'], 'required': True},
                        {'name': 'lga', 'type': 'text', 'label': 'Local Government Area', 'required': True},
                        {'name': 'address', 'type': 'textarea', 'label': 'Address', 'required': True},
                    ]
                },
                {'title': 'Sponsor and Next of Kin', 'type': 'fields', 'fields': [
                    {'name': 'sponsor_name', 'type': 'text', 'label': 'Sponsor Name', 'required': True},
                    {'name': 'sponsor_address', 'type': 'text', 'label': 'Sponsor Address', 'required': True},
                    {'name': 'sponsor_phone_number', 'type': 'text', 'label': 'Sponsor Phone Number', 'required': True},
                    {'name': 'sponsor_relationship', 'type': 'select', 'label': 'Sponsor Relationship', 'options': ['Father','Mother','Guardian','Uncle','Aunt','Self','Other'], 'required': True},
                    {'name': 'sponsor_email', 'type': 'email', 'label': 'Sponsor Email', 'required': False},
                    {'name': 'next_of_kin_name', 'type': 'text', 'label': "Next of Kin's Name", 'required': True},
                    {'name': 'next_of_kin_address', 'type': 'text', 'label': "Next of Kin's Address", 'required': True},
                    {'name': 'next_of_kin_phone_number', 'type': 'text', 'label': "Next of Kin's Phone Number", 'required': True},
                ]},
                {'title': "O'LEVEL", 'type': 'olevel'},
                {'title': 'Documents', 'type': 'documents', 'documents': [
                    {'type': 'passport', 'label': 'Passport Photograph', 'required': True},
                    {'type': 'birth_certificate', 'label': 'Birth Certificate', 'required': True},
                ]},
            ]
        },
        2: {
            'program': 'Postgraduate',
            'steps': [
                {'title': 'Personal Information', 'type': 'fields', 'fields': [
                    {'name': 'email', 'type': 'email', 'label': 'Email', 'required': True, 'disabled': True},
                    {'name': 'first_name', 'type': 'text', 'label': 'First Name', 'required': True, 'disabled': True},
                    {'name': 'last_name', 'type': 'text', 'label': 'Last Name', 'required': True, 'disabled': True},
                    {'name': 'date_of_birth', 'type': 'date', 'label': 'Date of Birth', 'required': True},
                    {'name': 'nationality', 'type': 'text', 'label': 'Nationality', 'required': True},
                    {'name': 'address', 'type': 'textarea', 'label': 'Address', 'required': True},
                    {'name': 'phone_number', 'type': 'text', 'label': 'Phone Number', 'required': True, 'disabled': True},
                    {'name': 'secondary_phone_number', 'type': 'text', 'label': 'Secondary Phone Number', 'required': False},
                ]},
                {'title': 'Academic Qualifications', 'type': 'fields', 'fields': [
                    {'name': 'qualification_type', 'type': 'select', 'label': 'First Degree Type', 'options': ['BSc','BA','BEng','Other'], 'required': True},
                    {'name': 'qualification_institution', 'type': 'text', 'label': 'University Name', 'required': True},
                    {'name': 'qualification_year', 'type': 'number', 'label': 'Year of Graduation', 'required': True},
                    {'name': 'work_experience', 'type': 'textarea', 'label': 'Work Experience', 'required': False},
                    {'name': 'additional_info', 'type': 'textarea', 'label': 'Research Interests', 'required': False},
                ]},
                {'title': 'Sponsor and Next of Kin', 'type': 'fields', 'fields': [
                    {'name': 'sponsor_name', 'type': 'text', 'label': 'Sponsor Name', 'required': True},
                    {'name': 'sponsor_phone_number', 'type': 'text', 'label': 'Sponsor Phone Number', 'required': True},
                    {'name': 'next_of_kin_name', 'type': 'text', 'label': "Next of Kin's Name", 'required': True},
                    {'name': 'next_of_kin_phone_number', 'type': 'text', 'label': "Next of Kin's Phone Number", 'required': True},
                ]},
                {'title': 'Documents', 'type': 'documents', 'documents': [
                    {'type': 'transcript', 'label': 'University Transcript', 'required': True},
                    {'type': 'certificate', 'label': 'Degree Certificate', 'required': True},
                    {'type': 'identification', 'label': 'Identification (Passport/Driver License)', 'required': True},
                    {'type': 'recommendation', 'label': 'Recommendation Letters (2)', 'required': True},
                ]},
            ]
        },
        14: {
            'program': 'Part-Time',
            'steps': [
                {'title': 'Personal Information', 'type': 'fields', 'fields': [
                    {'name': 'email', 'type': 'email', 'label': 'Email', 'required': True, 'disabled': True},
                    {'name': 'first_name', 'type': 'text', 'label': 'First name', 'required': True, 'disabled': True},
                    {'name': 'last_name', 'type': 'text', 'label': 'Last name', 'required': True, 'disabled': True},
                    {'name': 'middle_name', 'type': 'text', 'label': 'Middle name', 'required': False},
                    {'name': 'gender', 'type': 'select', 'label': 'Gender', 'options': ['Male','Female'], 'required': True},
                    {'name': 'date_of_birth', 'type': 'date', 'label': 'Date of Birth', 'required': True},
                    {'name': 'place_of_birth', 'type': 'text', 'label': 'Place of birth', 'required': True},
                    {'name': 'marital_status', 'type': 'select', 'label': 'Marital Status', 'options': ['Single','Married','Divorced','Widowed'], 'required': True},
                    {'name': 'religion', 'type': 'select', 'label': 'Religion', 'options': ['Christianity','Islam','Traditional','Other'], 'required': True},
                    {'name': 'blood_group', 'type': 'text', 'label': 'Blood Group', 'required': False},
                    {'name': 'phone_number', 'type': 'text', 'label': 'Phone Number', 'required': True, 'disabled': True},
                    {'name': 'secondary_phone_number', 'type': 'text', 'label': 'Secondary Phone Number', 'required': False},
                    {'name': 'genotype', 'type': 'text', 'label': 'Genotype', 'required': False},
                    {'name': 'state', 'type': 'select', 'label': 'State', 'options': ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara','FCT'], 'required': True},
                    {'name': 'who_referred_you', 'type': 'text', 'label': 'Who referred you?', 'required': False},
                    {'name': 'nationality', 'type': 'select', 'label': 'Nationality', 'options': ['Nigerian','Non-Nigerian'], 'required': True},
                    {'name': 'contact_address', 'type': 'textarea', 'label': 'Contact Address', 'required': True},
                    {'name': 'lga', 'type': 'text', 'label': 'Local Government Area', 'required': True},
                ]},
                {'title': 'Sponsor and Next of Kin', 'type': 'fields', 'fields': [
                    {'name': 'sponsor_name', 'type': 'text', 'label': 'Sponsor Name', 'required': True},
                    {'name': 'sponsor_address', 'type': 'text', 'label': 'Sponsor Address', 'required': True},
                    {'name': 'sponsor_phone_number', 'type': 'text', 'label': 'Sponsor Phone Number', 'required': True},
                    {'name': 'sponsor_relationship', 'type': 'select', 'label': 'Sponsor Relationship', 'options': ['Father','Mother','Guardian','Uncle','Aunt','Self','Other'], 'required': True},
                    {'name': 'sponsor_email', 'type': 'email', 'label': 'Sponsor Email', 'required': False},
                    {'name': 'next_of_kin_name', 'type': 'text', 'label': "Next of Kin's Name", 'required': True},
                    {'name': 'next_of_kin_address', 'type': 'text', 'label': "Next of Kin's Address", 'required': True},
                    {'name': 'next_of_kin_phone_number', 'type': 'text', 'label': "Next of Kin's Phone Number", 'required': True},
                ]},
                {'title': "O'LEVEL", 'type': 'olevel'},
                {'title': 'Documents', 'type': 'documents', 'documents': [
                    {'type': 'passport', 'label': 'Passport Photograph', 'required': True},
                    {'type': 'birth_certificate', 'label': 'Birth Certificate', 'required': True},
                ]},
            ]
        },
    }
    template = form_templates.get(program_type_id, form_templates[1])
    return jsonify(template), 200


@applicant_bp.route('/submit-form', methods=['POST'])
@AuthHandler.token_required
def submit_form(payload):
    role = payload.get('role', '')
    if role not in ('applicant', 'freshapplicant'):
        return jsonify({'message': 'Access denied. Please complete payment first.'}), 403

    user_id = payload['user_id']
    data    = request.form.to_dict()
    if request.is_json:
        data.update(request.get_json())

    application_id  = data.get('applicant_id')
    program_type_id = None

    if not application_id:
        app_res = Database.execute_query(
            'SELECT id, prog_type FROM applications WHERE user_id = %s ORDER BY created_at DESC',
            (user_id,)
        )
        if not app_res:
            return jsonify({'message': 'Application record not found'}), 404
        application_id  = app_res[0]['id']
        program_type_id = app_res[0]['prog_type']
    else:
        app_res = Database.execute_query(
            'SELECT id, prog_type FROM applications WHERE id = %s AND user_id = %s',
            (application_id, user_id)
        )
        if not app_res:
            app_res = Database.execute_query(
                'SELECT id, prog_type FROM applications WHERE user_id = %s ORDER BY created_at DESC',
                (user_id,)
            )
            if not app_res:
                return jsonify({'message': 'Application record not found or access denied'}), 404
        application_id  = app_res[0]['id']
        program_type_id = app_res[0]['prog_type']

    def clean_val(key):
        val = data.get(key)
        return None if val in ('', 'null', 'undefined', None) else val

    # ── Biodata ───────────────────────────────────────────────────────────────
    pi_fields = {
        'application_id': application_id,
        'surname': clean_val('last_name'),
        'first_name': clean_val('first_name'),
        'middle_name': clean_val('middle_name'),
        'date_of_birth': clean_val('date_of_birth'),
        'place_of_birth': clean_val('place_of_birth'),
        'gender': clean_val('gender'),
        'marital_status': clean_val('marital_status'),
        'religion': clean_val('religion'),
        'blood_group': clean_val('blood_group'),
        'genotype': clean_val('genotype'),
        'nationality': clean_val('nationality'),
        'state': clean_val('state'),
        'lga': clean_val('lga'),
        'address': clean_val('address'),
        'phone_number': clean_val('phone_number'),
        'secondary_phone_number': clean_val('secondary_phone_number'),
        'email': clean_val('email'),
        'photo_url': clean_val('photo_url'),
        'qualification_type': clean_val('qualification_type'),
        'qualification_institution': clean_val('qualification_institution'),
        'qualification_year': clean_val('qualification_year'),
        'additional_info': clean_val('additional_info'),
    }
    pi_cols = [k for k, v in pi_fields.items() if v is not None]
    pi_vals = [pi_fields[k] for k in pi_cols]
    if len(pi_cols) > 1:
        update_set = ', '.join(f"{c} = EXCLUDED.{c}" for c in pi_cols if c != 'application_id')
        bd_res = Database.execute_query(
            f'''INSERT INTO biodata ({', '.join(pi_cols)}, updated_at)
                VALUES ({', '.join(['%s']*len(pi_cols))}, NOW())
                ON CONFLICT (application_id) DO UPDATE SET {update_set}, updated_at = NOW()
                RETURNING id''',
            tuple(pi_vals)
        )
        # Write bio_data_id back onto the application row so lookups are fast and reliable
        if bd_res and bd_res[0].get('id'):
            Database.execute_update(
                'UPDATE applications SET bio_data_id = %s, updated_at = NOW() WHERE id = %s',
                (bd_res[0]['id'], application_id)
            )

    # ── Next of kin ───────────────────────────────────────────────────────────
    nok = {'application_id': application_id,
           'full_name': data.get('next_of_kin_name'),
           'phone_number': data.get('next_of_kin_phone_number'),
           'address': data.get('next_of_kin_address')}
    nok_cols = [k for k, v in nok.items() if v is not None]
    nok_vals = [nok[k] for k in nok_cols]
    if len(nok_cols) > 1:
        update_set = ', '.join(f"{c} = EXCLUDED.{c}" for c in nok_cols if c != 'application_id')
        Database.execute_update(
            f'''INSERT INTO next_of_kin ({', '.join(nok_cols)})
                VALUES ({', '.join(['%s']*len(nok_cols))})
                ON CONFLICT (application_id) DO UPDATE SET {update_set}''',
            tuple(nok_vals)
        )

    # ── Sponsor ───────────────────────────────────────────────────────────────
    sp = {'application_id': application_id,
          'full_name': data.get('sponsor_name'),
          'address': data.get('sponsor_address'),
          'phone_number': data.get('sponsor_phone_number'),
          'relationship': data.get('sponsor_relationship'),
          'email': data.get('sponsor_email')}
    sp_cols = [k for k, v in sp.items() if v is not None]
    sp_vals = [sp[k] for k in sp_cols]
    if len(sp_cols) > 1:
        update_set = ', '.join(f"{c} = EXCLUDED.{c}" for c in sp_cols if c != 'application_id')
        Database.execute_update(
            f'''INSERT INTO sponsor ({', '.join(sp_cols)})
                VALUES ({', '.join(['%s']*len(sp_cols))})
                ON CONFLICT (application_id) DO UPDATE SET {update_set}''',
            tuple(sp_vals)
        )

    # ── Academic qualification / O'Level ─────────────────────────────────────
    aq_fields = {'user_id': user_id}
    for choice_key, choice_col in [('first_choice_program_id', 'choice1'), ('second_choice_program_id', 'choice2')]:
        choice_id = data.get(choice_key)
        if choice_id:
            try:
                ps_res = Database.execute_query('SELECT name FROM program_setup WHERE id = %s', (int(choice_id),))
                if ps_res:
                    aq_fields[choice_col] = ps_res[0]['name']

                # For the first choice, also write degree_id to the applications row
                if choice_col == 'choice1':
                    deg_res = Database.execute_query(
                        '''SELECT dp.degree_id
                           FROM program_setup ps
                           JOIN degree_program dp ON dp.degree_id = ps.degree_id
                           WHERE ps.id = %s
                           LIMIT 1''',
                        (int(choice_id),)
                    )
                    if deg_res and deg_res[0].get('degree_id'):
                        Database.execute_update(
                            '''UPDATE applications
                               SET degree_id = %s, updated_at = NOW()
                               WHERE id = %s AND degree_id IS NULL''',
                            (deg_res[0]['degree_id'], application_id)
                        )
            except ValueError:
                pass

    olevel_raw = data.get('olevel_results')
    if olevel_raw:
        try:
            olevel_exams = json.loads(olevel_raw) if isinstance(olevel_raw, str) else olevel_raw
            subject_rows = Database.execute_query('SELECT id, name FROM olevel_subjects')
            grade_rows   = Database.execute_query('SELECT id, grade FROM olevel_grades')
            subj_map  = {str(r['id']): r['name'] for r in (subject_rows or [])}
            grade_map = {str(r['id']): r['grade'] for r in (grade_rows or [])}

            for idx, exam in enumerate(olevel_exams):
                subjects = exam.get('subjects', [])
                prefix   = '' if idx == 0 else 'second_'
                type_key = 'exam_type' if idx == 0 else 'exam_type1'
                no_key   = 'exam_no'   if idx == 0 else 'exam_no1'
                aq_fields[type_key] = exam.get('name') or exam.get('examType')
                aq_fields[no_key]   = exam.get('number') or exam.get('regNo')
                for i, s in enumerate(subjects[:5], start=1):
                    sv = str(s.get('subject_id') or s.get('subject', '')).strip()
                    gv = str(s.get('grade_id')   or s.get('grade', '')).strip()
                    aq_fields[f'{prefix}subject{i}'] = subj_map.get(sv, sv) or None
                    aq_fields[f'{prefix}grade{i}']   = grade_map.get(gv, gv) or None
        except Exception as e:
            print(f"O'Level parse error: {e}")

    if len(aq_fields) > 1:
        aq_cols = [k for k, v in aq_fields.items() if v is not None]
        aq_vals = [aq_fields[k] for k in aq_cols]
        update_cols = [c for c in aq_cols if c != 'user_id']
        if update_cols:
            update_set = ', '.join(f"{c} = EXCLUDED.{c}" for c in update_cols)
            Database.execute_update(
                f'''INSERT INTO academic_qualification ({', '.join(aq_cols)})
                    VALUES ({', '.join(['%s']*len(aq_cols))})
                    ON CONFLICT (user_id) DO UPDATE SET {update_set}''',
                tuple(aq_vals)
        )

    Database.execute_update(
        "UPDATE applications SET applicant_stage = 'in_progress', updated_at = NOW() "
        "WHERE id = %s AND applicant_stage = 'started'",
        (application_id,)
    )
    return jsonify({'message': 'Application form saved successfully', 'form_id': application_id}), 200


# ─────────────────────────────────────────────────────────────────────────────
# Documents
# ─────────────────────────────────────────────────────────────────────────────

@applicant_bp.route('/upload-document', methods=['POST'])
@AuthHandler.token_required
def upload_document(payload):
    user_id = payload['user_id']
    if 'file' not in request.files or 'form_id' not in request.form or 'document_type' not in request.form:
        return jsonify({'message': 'Missing file, form_id, or document_type'}), 400

    file          = request.files['file']
    form_id       = request.form.get('form_id')
    document_type = request.form.get('document_type')

    if file.filename == '':
        return jsonify({'message': 'No file selected'}), 400
    if not DocumentHandler.allowed_file(file.filename):
        return jsonify({'message': 'File type not allowed'}), 400
    if DocumentHandler.get_file_size(file) > Config.MAX_CONTENT_LENGTH:
        return jsonify({'message': f'File size exceeds {Config.MAX_CONTENT_LENGTH/(1024*1024):.0f}MB limit'}), 400

    upload_folder   = os.path.join(Config.UPLOAD_FOLDER, f'applicant_{user_id}')
    stored_filename, original_size, compressed_size, is_compressed = DocumentHandler.save_document(file, upload_folder)
    if not stored_filename:
        return jsonify({'message': 'Failed to save document'}), 500

    try:
        form_id_uuid       = (form_id)
        original_size_int  = int(original_size)
        compressed_size_int = int(compressed_size)
    except (TypeError, ValueError) as e:
        return jsonify({'message': f'Invalid file metadata: {e}'}), 400

    app_check = Database.execute_query(
        'SELECT id FROM applications WHERE id = %s AND user_id = %s', (form_id_uuid, user_id)
    )
    if not app_check:
        return jsonify({'message': 'Application not found or access denied'}), 404

    file_path = os.path.join(upload_folder, stored_filename)
    file_ext  = stored_filename.split('.')[-1] if '.' in stored_filename else ''

    doc_result = Database.execute_query(
        '''INSERT INTO documents
               (application_id, document_type, file_name, file_url, file_size, file_type, status)
           VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id''',
        (form_id_uuid, document_type, file.filename, file_path, original_size_int, file_ext, 'pending')
    )
    doc_id = doc_result[0]['id'] if doc_result else None
    if not doc_id:
        DocumentHandler.delete_document(file_path)
        return jsonify({'message': 'Failed to save document metadata'}), 500

    compression_ratio = (1 - compressed_size / original_size) * 100 if original_size > 0 else 0
    return jsonify({
        'message': 'Document uploaded successfully',
        'document_id': doc_id,
        'original_size': original_size,
        'compressed_size': compressed_size,
        'is_compressed': is_compressed,
        'compression_ratio': f'{compression_ratio:.1f}%',
    }), 201


@applicant_bp.route('/delete-document/<document_id>', methods=['DELETE'])
@AuthHandler.token_required
def delete_document(payload, document_id):
    user_id = payload['user_id']
    doc = Database.execute_query(
        '''SELECT d.id, d.file_url AS file_path FROM documents d
           JOIN applications a ON d.application_id = a.id
           WHERE d.id = %s AND a.user_id = %s''',
        (document_id, user_id)
    )
    if not doc:
        return jsonify({'message': 'Document not found'}), 404

    file_path = doc[0]['file_path']
    if not os.path.exists(file_path):
        parts = file_path.replace('\\', '/').split('/uploads/')
        if len(parts) > 1:
            local_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'uploads', parts[1].replace('/', os.sep))
            if os.path.exists(local_path):
                file_path = local_path

    if os.path.exists(file_path):
        os.remove(file_path)
    Database.execute_update('DELETE FROM documents WHERE id = %s', (document_id,))
    return jsonify({'message': 'Document deleted successfully'}), 200


@applicant_bp.route('/download-document/<document_id>', methods=['GET'])
@AuthHandler.token_required
def download_document(payload, document_id):
    user_id = payload['user_id']
    role    = payload.get('role')
    doc = Database.execute_query(
        '''SELECT d.file_url AS file_path, d.file_type AS mime_type, d.file_name AS original_filename
           FROM documents d
           JOIN applications a ON d.application_id = a.id
           WHERE d.id = %s AND (a.user_id = %s OR %s IN ('admin','ict_director','admissionofficer'))''',
        (document_id, user_id, role)
    )
    if not doc:
        return jsonify({'message': 'Document not found or access denied'}), 404
    file_path = doc[0]['file_path']
    if not os.path.exists(file_path):
        parts = file_path.replace('\\', '/').split('/uploads/')
        if len(parts) > 1:
            local_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'uploads', parts[1].replace('/', os.sep))
            if os.path.exists(local_path):
                file_path = local_path

    if not os.path.exists(file_path):
        return jsonify({'message': 'File not found on server'}), 404
    return send_file(file_path, mimetype=doc[0]['mime_type'])


# ─────────────────────────────────────────────────────────────────────────────
# Payment — initiate
# ─────────────────────────────────────────────────────────────────────────────

@applicant_bp.route('/initiate-payment', methods=['POST'])
@AuthHandler.token_required
def initiate_payment(payload):
    user_id = payload['user_id']
    data    = request.get_json() or {}

    payment_type        = data.get('payment_type')
    program_type_id     = data.get('program_type_id')
    fee_component_id    = data.get('fee_component_id')
    installment_plan_id = data.get('installment_plan_id')

    valid_types = ['application_fee', 'acceptance_fee', 'tuition']
    if payment_type not in valid_types:
        return jsonify({'message': f'payment_type must be one of: {valid_types}'}), 400
    
    payment_type = str(payment_type)

    if payment_type != 'tuition':
        installment_plan_id = None

    # ── Validate fee_component_id if supplied ─────────────────────────────────
    if fee_component_id is not None:
        fc_check = Database.execute_query(
            'SELECT id FROM fee_components WHERE id = %s', (fee_component_id,)
        )
        if not fc_check:
            return jsonify({'message': f'fee_component_id {fee_component_id} does not exist'}), 400

    # ── Active session ────────────────────────────────────────────────────────
    session_res = Database.execute_query(
        "SELECT id, name FROM academic_sessions WHERE is_active = TRUE LIMIT 1"
    )
    if not session_res:
        return jsonify({'message': 'No active academic session found'}), 500
    current_session_id = session_res[0]['id']

    # ── Active semester (used for tuition payment tracking) ───────────────────
    semester_res = Database.execute_query(
        "SELECT id FROM semesters WHERE is_active = TRUE LIMIT 1"
    )
    active_semester_id = semester_res[0]['id'] if semester_res else None

    # ── User info ─────────────────────────────────────────────────────────────
    user_res = Database.execute_query(
        'SELECT firstname, surname, middlename, email FROM users WHERE id = %s', (user_id,)
    )
    if not user_res:
        return jsonify({'message': 'User not found'}), 404
    u = user_res[0]
    customer_name  = ' '.join(filter(None, [u.get('firstname'), u.get('middlename'), u.get('surname')])) or 'Applicant'
    customer_email = u.get('email') or ''

    # ── Fee amount ────────────────────────────────────────────────────────────
    try:
        amount_naira = _resolve_fee_amount(payment_type, user_id, program_type_id, installment_plan_id)
    except ValueError as e:
        return jsonify({'message': str(e)}), 400

    # ── Processing fee (fetched from system_settings) ─────────────────────────
    processing_fee = _get_processing_fee()
    amount_naira_with_fee = amount_naira + processing_fee

    # ── References ────────────────────────────────────────────────────────────
    reference_no = generate_reference_no()
    receipt_no   = None
    amount_kobo  = round(amount_naira_with_fee * 100)

    # ── Validate Interswitch config ───────────────────────────────────────────
    missing = []
    if not Config.INTERSWITCH_MERCHANT_CODE: missing.append('INTERSWITCH_MERCHANT_CODE')
    if not Config.INTERSWITCH_CLIENT_ID:     missing.append('INTERSWITCH_CLIENT_ID')
    try:
        InterswitchClient._pay_item_id(payment_type)   # validates pay item exists
    except ValueError as e:
        missing.append(str(e))
    if missing:
        return jsonify({'message': f'Interswitch not fully configured. Missing: {", ".join(missing)}'}), 500

    # ── One-form-per-program guard ────────────────────────────────────────────
    # An applicant may only purchase one form per program type per session.
    # Exception: allow re-purchase if their previous application was rejected.
    if payment_type == 'application_fee':
        if not program_type_id:
            return jsonify({'message': 'program_type_id is required for application_fee'}), 400

        existing_app = Database.execute_query(
            """SELECT app.id, app.applicant_stage,
                      app.application_payment_reference
               FROM applications app
               WHERE app.user_id = %s
                 AND app.prog_type = %s
                 AND app.academic_session_id = %s
               ORDER BY app.created_at DESC
               LIMIT 1""",
            (user_id, program_type_id, current_session_id)
        )

        if existing_app:
            app_stage   = existing_app[0]['applicant_stage']
            stored_ref  = existing_app[0].get('application_payment_reference')

            # Determine whether this application already has a confirmed payment
            paid = False
            if stored_ref:
                paid_check = Database.execute_query(
                    """SELECT id FROM payment_transactions
                       WHERE reference_no = %s AND tran_status = 'successful' LIMIT 1""",
                    (stored_ref,)
                )
                paid = bool(paid_check)

            if not paid:
                # Also check any successful application_fee txn for this user+program (fallback)
                paid_check2 = Database.execute_query(
                    """SELECT pt.id FROM payment_transactions pt
                       JOIN applications app
                         ON app.application_payment_reference = pt.reference_no
                       WHERE app.user_id = %s
                         AND app.prog_type = %s
                         AND pt.tran_type = 'application_fee'
                         AND pt.tran_status = 'successful'
                       LIMIT 1""",
                    (user_id, program_type_id)
                )
                paid = bool(paid_check2)

            # Block re-purchase unless the application was rejected
            if paid and app_stage != 'rejected':
                return jsonify({
                    'message': (
                        f'You have already purchased a form for this programme. '
                        f'You may only purchase another if your application is rejected.'
                    ),
                    'blocked': True,
                    'application_status': app_stage,
                }), 409

    # ── Persist PENDING transaction ───────────────────────────────────────────
    try:
        Database.execute_update(
            '''INSERT INTO payment_transactions
                   (user_id, fee_component_id, academic_session_id, semester_id, installment_plan_id,
                    amount, amount_in_kobo, reference_no, receipt_no,
                    tran_status, tran_type, currency,
                    pay_item_id, product_id,
                    raw_request_payload, created_at, updated_at)
               VALUES (%s, %s, %s, %s, %s,
                       %s, %s, %s, %s,
                       %s, %s, %s,
                       %s, %s,
                       %s::jsonb, NOW(), NOW())''',
            (
                user_id, fee_component_id, current_session_id,
                active_semester_id if payment_type == 'tuition' else None,
                installment_plan_id,
                amount_naira_with_fee, amount_kobo, reference_no, receipt_no,
                'pending', payment_type, 'NGN',
                InterswitchClient._pay_item_id(payment_type),
                Config.INTERSWITCH_MERCHANT_CODE,
                json.dumps({'payment_type': payment_type, 'program_type_id': program_type_id}),
            )
        )
    except Exception as e:
        print(f"Failed to create pending transaction: {e}")
        return jsonify({'message': 'Failed to initialise transaction record'}), 500

    pay_item_id   = InterswitchClient._pay_item_id(payment_type)
    merchant_code = Config.INTERSWITCH_MERCHANT_CODE
    site_redirect_url = f"{request.host_url.rstrip('/')}/e-portal/api/applicant/payment/callback"
    redirect_url = InterswitchClient.build_redirect_url(
        pay_item_id,
        reference_no,
        amount_kobo,
        customer_name,
        customer_email,
        site_redirect_url,
        str(user_id),
    )

    return jsonify({
        'reference_no':   reference_no,
        'amount':         amount_naira,          # base fee (without processing fee)
        'amount_kobo':    amount_kobo,           # total including processing fee, in kobo
        'processing_fee': processing_fee,
        'pay_item_id':    pay_item_id,
        'merchant_code':  merchant_code,
        'customer_name':  customer_name,
        'customer_email': customer_email,
        'redirect_url':   redirect_url,
    }), 200


# ─────────────────────────────────────────────────────────────────────────────
# Payment — verify (callback)
# ─────────────────────────────────────────────────────────────────────────────

@applicant_bp.route('/payment/callback', methods=['GET', 'POST'])
def payment_callback():
    """
    Handles the redirect callback from Interswitch Webpay (usually a POST request
    with form fields) and redirects the user back to Next.js frontend with the
    txnref query parameter.
    """
    txnref = request.form.get('txnref') or request.args.get('txnref') or \
             request.form.get('txnRef') or request.args.get('txnRef') or ''
    
    frontend_url = f"{Config.FRONTEND_BASE_URL.rstrip('/')}/e-portal/applicant/payment/callback?txnref={txnref}"
    return redirect(frontend_url)

@applicant_bp.route('/verify-payment', methods=['POST'])
@AuthHandler.token_required
def verify_payment(payload):
    user_id = payload['user_id']
    data    = request.get_json() or {}

    reference_no = data.get('reference_no')
    if not reference_no:
        return jsonify({'message': 'reference_no is required'}), 400

    # ── Fetch transaction (include requery_count for threshold check) ─────────
    txn_res = Database.execute_query(
        '''SELECT id, amount_in_kobo, amount, tran_status, receipt_no,
                  tran_type, COALESCE(requery_count, 0) AS requery_count
           FROM payment_transactions
           WHERE reference_no = %s AND user_id = %s
           ORDER BY created_at DESC LIMIT 1''',
        (reference_no, user_id)
    )
    if not txn_res:
        return jsonify({'message': 'Transaction not found'}), 404

    txn           = txn_res[0]
    payment_type  = txn['tran_type']
    requery_count = int(txn['requery_count'])

    # Idempotency — already finalised
    if txn['tran_status'] in ('successful', 'failed'):
        return jsonify({
            'message':     'Transaction already verified',
            'tran_status': txn['tran_status'],
            'receipt_no':  txn['receipt_no'],
            'is_successful': txn['tran_status'] == 'successful',
        }), 200

    amount_kobo = txn['amount_in_kobo'] or (round(float(txn['amount'] or 0) * 100))

    # ── Requery Interswitch ───────────────────────────────────────────────────
    try:
        isw_resp = InterswitchClient.requery_transaction(reference_no, amount_kobo)
    except Exception as e:
        print(f"[verify-payment] Interswitch requery error for {reference_no}: {e}")
        Database.execute_update(
            '''UPDATE payment_transactions
               SET tran_status    = 'requery_error',
                   requery_count  = COALESCE(requery_count, 0) + 1,
                   updated_at     = NOW()
               WHERE reference_no = %s AND user_id = %s''',
            (reference_no, user_id)
        )
        return jsonify({
            'message':     'Could not reach Interswitch. Your payment is being verified — please check back shortly.',
            'tran_status': 'pending',
            'is_successful': False,
        }), 503

    response_code = str(isw_resp.get('ResponseCode', '')).strip()
    response_desc = isw_resp.get('ResponseDescription', '')

    # ── Classify using shared logic (Z0/T0 → pending, not failed) ────────────
    tran_status   = classify_response(response_code, requery_count)
    is_successful = (tran_status == 'successful')

    print(
        f"[verify-payment] {reference_no} | code={response_code!r} "
        f"requery_count={requery_count} → {tran_status}"
    )

    # ── Update transaction record ─────────────────────────────────────────────
    receipt_no: str = txn.get('receipt_no') or (generate_receipt_no() if is_successful else '') or ''
    sql, params = build_update_sql_params(
        tran_status, reference_no, response_code, response_desc,
        isw_resp, amount_kobo, receipt_no,
    )
    # build_update_sql_params uses WHERE reference_no = %s (no user_id)
    # add user_id guard for this user-facing endpoint
    sql = sql.replace('WHERE reference_no = %s',
                      'WHERE reference_no = %s AND user_id = %s')
    params = params + (user_id,)
    Database.execute_update(sql, params)

    # ── Downstream on success ─────────────────────────────────────────────────
    if is_successful:
        apply_downstream_success(user_id, payment_type, reference_no=reference_no)

    # ── Response ──────────────────────────────────────────────────────────────
    if tran_status == 'pending':
        return jsonify({
            'tran_status':   'pending',
            'response_code': response_code,
            'response_desc': response_desc or 'Payment is still being processed. Please wait a moment and refresh.',
            'is_successful': False,
            'amount':        float(txn['amount']),
            'reference_no':  reference_no,
            'receipt_no':    txn['receipt_no'],
            'payment_type':  payment_type,
            'message':       'Your payment is being processed. This can take a few minutes — we will update your status automatically.',
        }), 202

    return jsonify({
        'tran_status':   tran_status,
        'response_code': response_code,
        'response_desc': response_desc,
        'is_successful': is_successful,
        'amount':        float(txn['amount']),
        'reference_no':  reference_no,
        'receipt_no':    txn['receipt_no'],
        'payment_type':  payment_type,
    }), 200


# ─────────────────────────────────────────────────────────────────────────────
# Payment — cancel (user closed the Interswitch modal without completing)
# ─────────────────────────────────────────────────────────────────────────────

@applicant_bp.route('/cancel-payment', methods=['POST'])
@AuthHandler.token_required
def cancel_payment(payload):
    """
    Mark a pending transaction as 'cancelled'.

    Called by the frontend when the Interswitch onComplete callback fires
    with a non-'00' resp code AND the user clearly closed/dismissed the modal
    (e.g. resp='01' or similar). We do NOT requery Interswitch for these —
    they represent deliberate user cancellations, not network failures.

    Only updates rows that are still 'pending' to avoid overwriting a
    transaction that the background worker already resolved.
    """
    user_id = payload['user_id']
    data    = request.get_json() or {}
    reference_no = data.get('reference_no', '').strip()

    if not reference_no:
        return jsonify({'message': 'reference_no is required'}), 400

    # Confirm the transaction belongs to this user
    txn = Database.execute_query(
        "SELECT id, tran_status FROM payment_transactions WHERE reference_no = %s AND user_id = %s LIMIT 1",
        (reference_no, user_id)
    )
    if not txn:
        return jsonify({'message': 'Transaction not found'}), 404

    current_status = txn[0]['tran_status']
    if current_status != 'pending':
        # Already finalised (success, failed, or cancelled) — don't overwrite
        return jsonify({'message': f'Transaction already in status: {current_status}', 'tran_status': current_status}), 200

    Database.execute_update(
        """UPDATE payment_transactions
           SET tran_status          = 'cancelled',
               response_description = 'Cancelled by user',
               updated_at           = NOW()
           WHERE reference_no = %s AND tran_status = 'pending'""",
        (reference_no,)
    )
    print(f"[cancel_payment] {reference_no} marked cancelled (user={user_id})")
    return jsonify({'message': 'cancelled', 'tran_status': 'cancelled'}), 200


# ─────────────────────────────────────────────────────────────────────────────
# Payment — Interswitch webhook (bank-transfer / async confirmation)
# ─────────────────────────────────────────────────────────────────────────────

@applicant_bp.route('/payment-webhook', methods=['POST'])
def payment_webhook():
    """
    Interswitch server-to-server webhook (bank-transfer / async confirmation).

    Response-code handling (same rules as verify_payment):
      '00'         → successful
      Z0 / T0 / '' → pending  (keep in queue for background worker)
      other        → pending until requery_count >= FAIL_AFTER_REQUERIES

    No JWT required — called by Interswitch, not the browser.
    """
    data = request.get_json(silent=True) or {}

    reference_no = (
        data.get('transactionReference')
        or data.get('txnref')
        or data.get('TransactionReference')
        or data.get('TxnRef')
    )

    if not reference_no:
        print(f"[webhook] No reference in payload: {data}")
        return jsonify({'message': 'reference not found in payload'}), 400

    # ── Look up the transaction (include requery_count) ───────────────────────
    txn_res = Database.execute_query(
        '''SELECT id, user_id, amount_in_kobo, amount, tran_status, receipt_no,
                  tran_type, COALESCE(requery_count, 0) AS requery_count
           FROM payment_transactions
           WHERE reference_no = %s
           ORDER BY created_at DESC LIMIT 1''',
        (reference_no,)
    )
    if not txn_res:
        print(f"[webhook] Transaction not found: {reference_no}")
        return jsonify({'message': 'transaction not found'}), 404

    txn           = txn_res[0]
    user_id       = txn['user_id']
    payment_type  = txn['tran_type']
    requery_count = int(txn['requery_count'])

    # Idempotency — already finalised
    if txn['tran_status'] in ('successful', 'failed'):
        print(f"[webhook] Already finalised ({txn['tran_status']}): {reference_no}")
        return jsonify({'message': 'already processed'}), 200

    amount_kobo = txn['amount_in_kobo'] or (round(float(txn['amount'] or 0) * 100))

    # ── Re-query Interswitch (never trust the webhook payload alone) ──────────
    try:
        isw_resp = InterswitchClient.requery_transaction(reference_no, amount_kobo)
    except Exception as e:
        print(f"[webhook] Requery error for {reference_no}: {e}")
        Database.execute_update(
            '''UPDATE payment_transactions
               SET tran_status    = 'requery_error',
                   requery_count  = COALESCE(requery_count, 0) + 1,
                   updated_at     = NOW()
               WHERE reference_no = %s''',
            (reference_no,)
        )
        return jsonify({'message': 'requery failed, will retry'}), 503

    response_code = str(isw_resp.get('ResponseCode', '')).strip()
    response_desc = isw_resp.get('ResponseDescription', '')

    # ── Classify (Z0/T0/empty stay pending; fail only after N retries) ────────
    tran_status   = classify_response(response_code, requery_count)
    is_successful = (tran_status == 'successful')

    print(
        f"[webhook] {reference_no} | code={response_code!r} "
        f"requery_count={requery_count} → {tran_status} (type={payment_type})"
    )

    # ── Update transaction record ─────────────────────────────────────────────
    receipt_no: str = txn.get('receipt_no') or (generate_receipt_no() if is_successful else '') or ''
    sql, params = build_update_sql_params(
        tran_status, reference_no, response_code, response_desc,
        isw_resp, amount_kobo, receipt_no,
    )
    Database.execute_update(sql, params)

    # ── Downstream on success ─────────────────────────────────────────────────
    if is_successful:
        apply_downstream_success(user_id, payment_type, reference_no=reference_no)

    return jsonify({'message': 'ok', 'tran_status': tran_status}), 200


# ─────────────────────────────────────────────────────────────────────────────
# Applicant status & admission
# ─────────────────────────────────────────────────────────────────────────────

@applicant_bp.route('/get-applicant-status', methods=['GET'])
@AuthHandler.token_required
def get_applicant_status(payload):
    user_id = payload['user_id']
    applications = Database.execute_query(
        '''SELECT
               app.id,
               u.firstname || ' ' || COALESCE(u.middlename || ' ', '') || u.surname AS user_name,
               app.prog_type AS program_type_id,
               app.applicant_stage AS application_status,
               COALESCE(asess.name, CAST(app.academic_session_id AS TEXT)) AS program_session,
               app.created_at,
               app.form_no,
               ptype.name AS program_name,
               (
                   -- Primary: stored reference was confirmed successful
                   EXISTS (
                       SELECT 1 FROM payment_transactions txn
                       WHERE txn.reference_no = app.application_payment_reference
                         AND txn.tran_status = 'successful'
                   )
                   OR
                   -- Fallback: any successful application_fee txn linked to THIS same prog_type
                   -- (scoped by prog_type so a payment for UTME doesn't unlock a PG row)
                   EXISTS (
                       SELECT 1 FROM payment_transactions txn_fb
                       JOIN applications app2
                         ON app2.application_payment_reference = txn_fb.reference_no
                       WHERE txn_fb.user_id = app.user_id
                         AND txn_fb.tran_type  = 'application_fee'
                         AND txn_fb.tran_status = 'successful'
                         AND app2.prog_type = app.prog_type
                   )
               ) AS has_paid_application_fee,
               -- True when the stored reference is awaiting gateway confirmation
               -- (pending or requery_error). Used by the dashboard to distinguish
               -- "payment processing" from "payment failed".
               EXISTS (
                   SELECT 1 FROM payment_transactions txn_p
                   WHERE txn_p.reference_no = app.application_payment_reference
                     AND txn_p.tran_status IN ('pending', 'requery_error')
               ) AS has_pending_application_payment,
               (app.applicant_stage IN ('accepted','enrolled')) AS has_paid_acceptance_fee,
               COALESCE(app.admission_letter_sent, FALSE) AS admission_letter_sent,
               EXISTS (
                   SELECT 1 FROM payment_transactions txn2
                   WHERE txn2.user_id = app.user_id
                     AND txn2.tran_type = 'tuition'
                     AND txn2.tran_status = 'successful'
               ) AS has_paid_tuition,
               CASE WHEN app.applicant_stage != 'started' THEN app.updated_at ELSE NULL END AS submitted_at,
               CASE WHEN app.applicant_stage IN ('admitted','accepted','enrolled') THEN 'admitted' ELSE 'pending' END AS admission_status
           FROM applications app
           JOIN users u ON app.user_id = u.id
           LEFT JOIN program_types ptype ON app.prog_type = ptype.id
           LEFT JOIN academic_sessions asess ON app.academic_session_id = asess.id
           WHERE app.user_id = %s
           ORDER BY app.created_at DESC''',
        (user_id,)
    )
    if not applications:
        return jsonify({'applicants': [], 'applicant': None}), 200
    return jsonify({'applicants': applications, 'applicant': applications[0]}), 200


@applicant_bp.route('/acceptance-fee', methods=['GET'])
@AuthHandler.token_required
def get_acceptance_fee(payload):
    user_id = payload['user_id']
    processing_fee = _get_processing_fee()
    try:
        amount = _resolve_fee_amount('acceptance_fee', user_id)
        return jsonify({
            'acceptance_fee': amount,
            'processing_fee': processing_fee,
            'found': True,
        }), 200
    except ValueError:
        return jsonify({
            'acceptance_fee': 0,
            'processing_fee': processing_fee,
            'found': False,
        }), 200


@applicant_bp.route('/tuition-fee-breakdown', methods=['GET'])
@AuthHandler.token_required
def get_tuition_fee_breakdown(payload):
    """
    Returns an itemized breakdown of all fee components that make up the
    school fees (tuition) payment for the authenticated admitted student.
    Components include: Tuition & Accommodation, Sundry Fees, Digital Training, etc.
    """
    user_id = payload['user_id']
    try:
        context = _get_applicant_fee_context(user_id)

        fees = Database.execute_query(
            '''SELECT fc.name AS fee_name, pf.amount
            FROM program_fees pf
            JOIN fee_components fc ON fc.id = pf.fee_component_id
            WHERE pf.program_type = %s
                AND pf.level = %s
                AND pf.faculty_id = %s
                AND pf.academic_session_id = (
                    SELECT id FROM academic_sessions WHERE is_active = TRUE LIMIT 1
                )
                AND LOWER(fc.name) NOT LIKE '%%acceptance%%'
            ORDER BY fc.name ASC''',
            (str(context['program_type']), str(context['level']), str(context['faculty_id']))
        )

        components = []
        total = 0.0

        for fee in (fees or []):
            name   = fee['fee_name'] or 'Other Fee'
            amount = float(fee['amount'] or 0)
            total += amount
            components.append({'name': name, 'amount': amount})

        processing_fee = _get_processing_fee()
        return jsonify({
            'components':     components,
            'total':          total,
            'processing_fee': processing_fee,
            'found':          len(components) > 0,
        }), 200

    except Exception as e:
        print(f'[tuition-fee-breakdown] Error: {e}')
        return jsonify({'message': 'Failed to load fee breakdown', 'components': [], 'total': 0, 'processing_fee': 300.0}), 500


@applicant_bp.route('/admission-letter', methods=['GET'])
@AuthHandler.token_required
def get_admission_letter(payload):
    user_id = payload['user_id']
    applicant = Database.execute_query(
        '''SELECT app.id,
                  u.firstname || ' ' || COALESCE(u.middlename || ' ', '') || u.surname AS name,
                  app.prog_type AS program_id,
                  pt.name AS program_name,
                  app.form_no,
                  app.approved_course,
                  app.applicant_stage,
                  asess.name AS session_name
           FROM applications app
           JOIN users u ON app.user_id = u.id
           LEFT JOIN program_types pt ON app.prog_type = pt.id
           LEFT JOIN academic_sessions asess ON app.academic_session_id = asess.id
           WHERE app.user_id = %s AND app.applicant_stage IN ('admitted','accepted')
           ORDER BY app.updated_at DESC LIMIT 1''',
        (user_id,)
    )
    if not applicant:
        return jsonify({'message': 'Admission letter not available'}), 404
    if applicant[0]['applicant_stage'] != 'accepted':
        return jsonify({'message': 'Admission letter is only available after paying the acceptance fee'}), 403

    applicant_data = applicant[0]
    fees = Database.execute_query(
        '''SELECT fc.name AS fee_name, pf.amount
           FROM program_fees pf
           JOIN fee_components fc ON pf.fee_component_id = fc.id
           WHERE pf.program_type = %s''',
        (str(applicant_data['program_id']),)
    )
    acceptance_fee = tuition_fee = other_fees = 0
    for fee in (fees or []):
        fname  = (fee['fee_name'] or '').lower()
        amount = fee['amount'] or 0
        if 'acceptance' in fname:            acceptance_fee = amount
        elif 'tuition' in fname or 'accommodation' in fname: tuition_fee = amount
        elif any(k in fname for k in ('sundry', 'other', 'digital')): other_fees = amount

    session_res  = Database.execute_query("SELECT name FROM academic_sessions WHERE is_active = TRUE LIMIT 1")
    session      = session_res[0]['name'] if session_res else '2025/2026'
    semester_res = Database.execute_query("SELECT value FROM system_settings WHERE key = 'current_semester'")
    faculty = department = 'N/A'
    level   = '100 Level'
    mode    = 'Full-Time'
    resumption_date = ''

    pd_res = Database.execute_query(
        '''SELECT f.name AS faculty, d.name AS department
        FROM applications a
        JOIN program_setup ps ON LOWER(TRIM(ps.name)) = LOWER(TRIM(a.finalised_course))
        JOIN departments d ON d.id = ps.department_id
        JOIN faculties f ON f.id = ps.faculty_id
        WHERE a.user_id = %s
        ORDER BY a.updated_at DESC LIMIT 1''',
            (user_id,)
        )
    if pd_res:
        pd = pd_res[0]
        faculty    = pd['faculty']    or faculty
        department = pd['department'] or department

    session_name = applicant_data.get('session_name') or '2025/2026'
    session_year = session_name.split('/')[0] if '/' in session_name else datetime.now().strftime('%Y')
    ref_no = f"PCU/ADM/{session_year}"
    return jsonify({
        'candidateName':  applicant_data['name'],
        'programme':      applicant_data['approved_course'] or applicant_data['program_name'] or '',
        'level':          level,
        'department':     department,
        'faculty':        faculty,
        'session':        session,
        'mode':           mode,
        'date':           datetime.now().strftime('%d %B, %Y'),
        'resumptionDate': resumption_date,
        'acceptanceFee':  f"\u20a6{acceptance_fee:,.2f}",
        'tuition':        f"\u20a6{tuition_fee:,.2f}",
        'otherFees':      f"\u20a6{other_fees:,.2f}",
        'reference':      ref_no,
    }), 200


@applicant_bp.route('/get-form/<applicant_id>', methods=['GET'])
@AuthHandler.token_required
def get_form(payload, applicant_id):
    role = str(payload.get('role', '')).lower()
    user_type_id = str(payload.get('user_type_id', ''))
    
    if role not in ('applicant', 'student', 'admitted', 'freshapplicant') and user_type_id not in ('2', '7', '13', '1', '15'):
        return jsonify({'message': 'Access denied. Valid applicant or student role required.'}), 403
    user_id = payload['user_id']
    app_res = Database.execute_query(
        '''SELECT app.id, app.prog_type, app.application_payment_reference
           FROM applications app
           WHERE app.id = %s AND app.user_id = %s''',
        (applicant_id, user_id)
    )
    if not app_res:
        return jsonify({'message': 'Application not found'}), 404

    # ── Payment guard: application form requires a confirmed payment ──────────
    #
    # Primary check: the stored application_payment_reference must be successful.
    # Fallback  check: also accept any successful application_fee transaction for
    # this user — guards against edge cases where the reference was not updated
    # (e.g. legacy rows, manual admin ops, or a race on the first payment).
    app_payment_ref = app_res[0].get('application_payment_reference')

    payment_confirmed = False

    if app_payment_ref:
        primary_check = Database.execute_query(
            """SELECT id FROM payment_transactions
               WHERE reference_no = %s AND tran_status = 'successful'
               LIMIT 1""",
            (app_payment_ref,)
        )
        if primary_check:
            payment_confirmed = True

    if not payment_confirmed:
        # Fallback: any successful application_fee transaction for this user
        fallback_check = Database.execute_query(
            """SELECT id FROM payment_transactions
               WHERE user_id = %s AND tran_type = 'application_fee'
                 AND tran_status = 'successful'
               LIMIT 1""",
            (user_id,)
        )
        if fallback_check:
            payment_confirmed = True
            # Heal the stale reference in the application row
            healed_ref = Database.execute_query(
                """SELECT reference_no FROM payment_transactions
                   WHERE user_id = %s AND tran_type = 'application_fee'
                     AND tran_status = 'successful'
                   ORDER BY confirmed_at DESC LIMIT 1""",
                (user_id,)
            )
            if healed_ref:
                Database.execute_update(
                    """UPDATE applications
                       SET application_payment_reference = %s, updated_at = NOW()
                       WHERE id = %s""",
                    (healed_ref[0]['reference_no'], app_res[0]['id'])
                )

    if not payment_confirmed:
        return jsonify({
            'message': 'Application fee payment has not been confirmed. Please complete payment before accessing the form.',
            'tran_status': 'pending',
        }), 403

    application_id = app_res[0]['id']
    pi_res      = Database.execute_query('SELECT * FROM biodata WHERE application_id = %s', (application_id,))
    nok_res     = Database.execute_query('SELECT * FROM next_of_kin WHERE application_id = %s', (application_id,))
    sponsor_res = Database.execute_query('SELECT * FROM sponsor WHERE application_id = %s', (application_id,))

    form_data = {}
    if pi_res:
        form_data = dict(pi_res[0])
        if 'surname' in form_data:
            form_data['last_name'] = form_data['surname']
        dob = form_data.get('date_of_birth')
        if dob and hasattr(dob, 'strftime'):
            form_data['date_of_birth'] = dob.strftime('%Y-%m-%d')
        form_data['full_name'] = ' '.join(filter(None, [form_data.get('first_name'), form_data.get('middle_name'), form_data.get('surname')]))

    if nok_res:
        n = dict(nok_res[0])
        form_data.update({'next_of_kin_name': n.get('full_name'), 'next_of_kin_phone_number': n.get('phone_number'), 'next_of_kin_address': n.get('address')})

    if sponsor_res:
        s = dict(sponsor_res[0])
        form_data.update({'sponsor_name': s.get('full_name'), 'sponsor_address': s.get('address'), 'sponsor_phone_number': s.get('phone_number'), 'sponsor_relationship': s.get('relationship'), 'sponsor_email': s.get('email')})

    aq_res = Database.execute_query('SELECT * FROM academic_qualification WHERE user_id = %s', (user_id,))
    if aq_res:
        aq = aq_res[0]
        olevel_exams = []
        for sitting, prefix, type_key, no_key in [(0, '', 'exam_type', 'exam_no'), (1, 'second_', 'exam_type1', 'exam_no1')]:
            if aq.get(type_key):
                subjects = [
                    {'subject_id': aq.get(f'{prefix}subject{i}'), 'grade_id': aq.get(f'{prefix}grade{i}'), 'subject': aq.get(f'{prefix}subject{i}'), 'grade': aq.get(f'{prefix}grade{i}')}
                    for i in range(1, 6)
                    if aq.get(f'{prefix}subject{i}') and aq.get(f'{prefix}grade{i}')
                ]
                olevel_exams.append({'name': aq.get(type_key), 'number': aq.get(no_key), 'subjects': subjects})
        if olevel_exams:
            form_data['olevel_results'] = olevel_exams

        for choice_key, col in [('first_choice_program_name', 'choice1'), ('second_choice_program_name', 'choice2')]:
            if aq.get(col):
                form_data[choice_key] = aq.get(col)
                ps_res = Database.execute_query('SELECT id FROM program_setup WHERE name = %s LIMIT 1', (aq.get(col),))
                if ps_res:
                    form_data[choice_key.replace('name', 'id')] = ps_res[0]['id']

    prog_type = app_res[0].get('prog_type')
    if prog_type:
        pc_res = Database.execute_query(
            '''SELECT DISTINCT ps.id, ps.name AS course, d.id AS department_id, d.name AS department
               FROM degree_program dp
               JOIN program_setup ps ON ps.degree_id = dp.degree_id
               JOIN departments d ON d.id = ps.department_id
               WHERE dp.program_type_id = %s ORDER BY d.name, ps.name''',
            (int(prog_type),)
        )
        form_data['available_courses'] = [dict(r) for r in (pc_res or [])]

    if form_data.get('additional_info'):
        try:
            ai = json.loads(form_data['additional_info']) if isinstance(form_data['additional_info'], str) else form_data['additional_info']
            form_data = {**ai, **form_data}
        except (json.JSONDecodeError, TypeError):
            pass

    if form_data.get('olevel_results') and isinstance(form_data['olevel_results'], str):
        try:
            form_data['olevel_results'] = json.loads(form_data['olevel_results'])
        except json.JSONDecodeError:
            pass

    form_data['id'] = application_id
    documents = Database.execute_query(
        '''SELECT d.id AS document_id, d.document_type, d.document_type AS display_name,
                  d.file_name AS original_filename, d.file_size, d.status
           FROM documents d
           JOIN applications a ON d.application_id = a.id
           WHERE a.user_id = %s''',
        (user_id,)
    )
    return jsonify({'form': form_data, 'documents': documents or []}), 200


@applicant_bp.route('/submit-application', methods=['POST'])
@AuthHandler.token_required
def submit_application(payload):
    # TEMPORARILY DISABLED — uncomment to re-enable the portal lock check
    # res = Database.execute_query("SELECT value FROM system_settings WHERE key = 'admission_registration_locked'")
    # if res and res[0]['value'] == 'true':
    #     return jsonify({'message': 'Admission registration is currently closed.'}), 403

    user_id = payload['user_id']
    data    = request.get_json()
    applicant_id = data.get('applicant_id')
    if not applicant_id:
        return jsonify({'message': 'applicant_id is required'}), 400

    app_check = Database.execute_query(
        'SELECT id FROM applications WHERE id = %s AND user_id = %s', (applicant_id, user_id)
    )
    if not app_check:
        return jsonify({'message': 'Application not found or access denied'}), 404

    success = Database.execute_update(
        "UPDATE applications SET applicant_stage = 'submitted', updated_at = NOW() WHERE id = %s AND user_id = %s",
        (applicant_id, user_id)
    )
    if not success:
        return jsonify({'message': 'Failed to submit application'}), 500
    return jsonify({'message': 'Application submitted successfully'}), 200


# ─────────────────────────────────────────────────────────────────────────────
# Payment history & receipt
# ─────────────────────────────────────────────────────────────────────────────

@applicant_bp.route('/payment-history', methods=['GET'])
@AuthHandler.token_required
def get_payment_history(payload):
    user_id = payload['user_id']
    transactions = Database.execute_query(
        '''SELECT pt.id, pt.tran_type, pt.amount, pt.tran_status,
                  (pt.tran_status = 'successful') AS is_successful,
                  pt.reference_no, pt.receipt_no, pt.created_at, pt.client_name,
                  pt.installment_plan_id
           FROM payment_transactions pt
           WHERE pt.user_id = %s
           ORDER BY pt.created_at DESC''',
        (user_id,)
    )
    formatted = [
        {
            'transaction_id': t['id'],
            'payment_type':   t['tran_type'],
            'amount':         float(t['amount']),
            'is_successful':  t['is_successful'],
            'tran_status':    t['tran_status'],
            'reference_no':   t['reference_no'],
            'receipt_no':     t['receipt_no'] if t['tran_status'] == 'successful' else None,
            'created_at':     t['created_at'].isoformat() if t['created_at'] else None,
            'client_name':    t['client_name'] or 'N/A',
            'installment_plan_id': t.get('installment_plan_id') if 'installment_plan_id' in t else None,
        }
        for t in (transactions or [])
    ]
    return jsonify({'payment_history': formatted, 'total_payments': len(formatted)}), 200


@applicant_bp.route('/payment-receipt/<receipt_no>', methods=['GET'])
@AuthHandler.token_required
def get_payment_receipt(payload, receipt_no):
    user_id = payload['user_id']
    transaction = Database.execute_query(
        '''SELECT pt.id, pt.tran_type, pt.amount, pt.created_at,
                  pt.reference_no, pt.receipt_no, pt.client_name
           FROM payment_transactions pt
           WHERE pt.receipt_no = %s
             AND pt.user_id = %s
             AND pt.tran_status = 'successful' ''',
        (receipt_no, user_id)
    )
    if not transaction:
        return jsonify({'message': 'Payment receipt not found'}), 404

    trans_data = transaction[0]
    user = Database.execute_query(
        'SELECT firstname || \' \' || COALESCE(middlename || \' \', \'\') || surname AS name FROM users WHERE id = %s LIMIT 1',
        (user_id,)
    )
    if not user:
        return jsonify({'message': 'User not found'}), 404

    payment_date = trans_data['created_at'].strftime('%d %B %Y') if trans_data['created_at'] else datetime.now().strftime('%d %B %Y')
    pdf_bytes = PaymentReceiptGenerator.generate_payment_receipt_pdf(
        receipt_id=trans_data['receipt_no'],
        applicant_name=user[0]['name'],
        program_name=trans_data['client_name'] or 'N/A',
        payment_type=trans_data['tran_type'],
        amount=float(trans_data['amount']),
        payment_date=payment_date,
        reference_number=trans_data['reference_no'] or '',
        payment_method='Online',
        currency='NGN',
    )
    return Response(
        pdf_bytes,
        mimetype='application/pdf',
        headers={'Content-Disposition': f'attachment;filename=payment_receipt_{trans_data["receipt_no"]}.pdf'}
    )


# ─────────────────────────────────────────────────────────────────────────────
# Downloads
# ─────────────────────────────────────────────────────────────────────────────

@applicant_bp.route('/medical-form', methods=['GET'])
@AuthHandler.token_required
def get_medical_form(payload):
    user_id = payload['user_id']
    applicant = Database.execute_query(
        '''SELECT app.id, u.firstname || ' ' || u.surname AS name, pt.name AS program_name
           FROM applications app
           JOIN users u ON app.user_id = u.id
           LEFT JOIN program_types pt ON app.prog_type = pt.id
           WHERE app.user_id = %s ORDER BY app.updated_at DESC LIMIT 1''',
        (user_id,)
    )
    if not applicant:
        return jsonify({'message': 'Applicant record not found'}), 404

    base_dir          = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    medical_form_path = os.path.join(base_dir, 'data', "PCU STUDENTS' MEDICAL REPORT FORM_ (1) - Copy.pdf")

    if os.path.exists(medical_form_path):
        with open(medical_form_path, 'rb') as f:
            pdf_bytes = f.read()
        filename = "pcu_medical_report_form.pdf"
    else:
        app_data  = applicant[0]
        pdf_bytes = MedicalFormGenerator.generate_medical_form_pdf(
            applicant_name=app_data['name'],
            program_name=app_data['program_name'] or 'N/A',
            applicant_id=app_data['id'],
        )
        filename = f"medical_form_{app_data['id']}.pdf"

    return Response(pdf_bytes, mimetype='application/pdf',
                    headers={'Content-Disposition': f'attachment;filename={filename}'})


@applicant_bp.route('/admission-notice', methods=['GET'])
@AuthHandler.token_required
def get_admission_notice(payload):
    base_dir  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    file_path = os.path.join(base_dir, 'data', "PCU NOTICE TO CANDIDATES OFFERED PROVISIONAL ADMISSION 2025.pdf")
    if not os.path.exists(file_path):
        return jsonify({'message': 'Notice file not found'}), 404
    with open(file_path, 'rb') as f:
        pdf_bytes = f.read()
    return Response(pdf_bytes, mimetype='application/pdf',
                    headers={'Content-Disposition': 'attachment;filename=pcu_admission_notice_2025.pdf'})


@applicant_bp.route('/affidavit-form', methods=['GET'])
@AuthHandler.token_required
def get_affidavit_form(payload):
    base_dir  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    file_path = os.path.join(base_dir, 'data', "PCU AFFIDAVIT FOR GOOD CONDUCT - Copy.pdf")
    if not os.path.exists(file_path):
        return jsonify({'message': 'Affidavit file not found'}), 404
    with open(file_path, 'rb') as f:
        pdf_bytes = f.read()
    return Response(pdf_bytes, mimetype='application/pdf',
                    headers={'Content-Disposition': 'attachment;filename=pcu_affidavit_for_good_conduct.pdf'})


# ─────────────────────────────────────────────────────────────────────────────
# Recommendations
# ─────────────────────────────────────────────────────────────────────────────

@applicant_bp.route('/get-recommendations', methods=['GET'])
@AuthHandler.token_required
def get_recommendations(payload):
    user_id = payload['user_id']
    application = Database.execute_query(
        'SELECT id FROM applications WHERE user_id = %s ORDER BY created_at DESC LIMIT 1', (user_id,)
    )
    if not application:
        return jsonify({'message': 'Application record not found'}), 404

    recommendations = Database.execute_query(
        '''SELECT ar.id, ar.review_notes, ar.recommended_program_id, p.name AS program_name,
                  ar.reviewed_at, ar.reviewed_by, u.name AS reviewed_by_name,
                  ar.recommended_course_response, ar.accepted_recommended_program_id
           FROM application_reviews ar
           LEFT JOIN programs p ON ar.recommended_program_id = p.id
           LEFT JOIN users u ON ar.reviewed_by = u.id
           WHERE ar.application_id = %s AND ar.recommendation = %s''',
        (application[0]['id'], 'recommend_other_program')
    )
    formatted = [
        {
            'review_id':    r['id'],
            'program_id':   r['recommended_program_id'],
            'program_name': r['program_name'],
            'review_notes': r['review_notes'],
            'reviewed_by':  r['reviewed_by_name'],
            'reviewed_at':  r['reviewed_at'].isoformat() if r['reviewed_at'] else None,
            'response':     r['recommended_course_response'],
            'is_accepted':  r['accepted_recommended_program_id'] == r['recommended_program_id'] if r['accepted_recommended_program_id'] else None,
        }
        for r in (recommendations or [])
    ]
    return jsonify({'recommendations': formatted, 'total_recommendations': len(formatted)}), 200


@applicant_bp.route('/respond-to-recommendation', methods=['POST'])
@AuthHandler.token_required
def respond_to_recommendation(payload):
    user_id = payload['user_id']
    data    = request.get_json()
    if not data or 'review_id' not in data or 'response' not in data:
        return jsonify({'message': 'review_id and response are required'}), 400

    review_id = data['review_id']
    response  = data['response']
    if response not in ('accepted', 'declined'):
        return jsonify({'message': 'response must be "accepted" or "declined"'}), 400

    application = Database.execute_query(
        'SELECT id FROM applications WHERE user_id = %s ORDER BY created_at DESC LIMIT 1', (user_id,)
    )
    if not application:
        return jsonify({'message': 'Application record not found'}), 404

    applicant_id = application[0]['id']
    review = Database.execute_query(
        'SELECT ar.id, ar.application_id, ar.recommended_program_id FROM application_reviews ar WHERE ar.id = %s AND ar.application_id = %s',
        (review_id, applicant_id)
    )
    if not review:
        return jsonify({'message': 'Review not found'}), 404

    return jsonify({'message': f'Recommendation {response} successfully', 'applicant_id': applicant_id, 'response': response}), 200