from flask import Blueprint, request, jsonify, Response, send_file, redirect
from database import Database
from utils.auth import AuthHandler
from datetime import datetime, timedelta, timezone
from utils.document_handler import DocumentHandler
from utils.scanner import scan_document, ScannerError
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
import copy

from routes.form_templates.utme import template as utme_template
from routes.form_templates.postgraduate import template as postgraduate_template
from routes.form_templates.jupeb import template as jupeb_template
from routes.form_templates.hnd_conversion import template as hnd_conversion_template
from routes.form_templates.ijmb import template as ijmb_template
from routes.form_templates.direct_entry import template as direct_entry_template
from routes.form_templates.part_time import template as part_time_template

applicant_bp = Blueprint('Applicant', __name__)


def _ensure_pg_recommendation_columns():
    Database.execute_update(
        '''ALTER TABLE pg_application
           ADD COLUMN IF NOT EXISTS approved_course TEXT,
           ADD COLUMN IF NOT EXISTS finalised_course TEXT,
           ADD COLUMN IF NOT EXISTS applicant_recommended_course TEXT'''
    )


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
    if program_type_id == 2:
        existing = Database.execute_query(
            '''SELECT uuid, application_payment_reference
               FROM pg_application
               WHERE user_id = %s AND academic_session_id = %s''',
            (user_id, current_session_id)
        )
        if existing:
            app_id       = existing[0]['uuid']
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
                    """UPDATE pg_application
                       SET application_payment_reference = %s, updated_date = NOW()
                       WHERE uuid = %s""",
                    (reference_no, app_id)
                )

            return app_id

        year = datetime.now().year
        code = _prog_code(program_type_id)
        while True:
            suffix  = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))
            form_no = f"PCU/{year}/{code}{suffix}"
            if not Database.execute_query('SELECT uuid FROM pg_application WHERE form_no = %s', (form_no,)):
                break

        Database.execute_update(
            '''INSERT INTO pg_application
                   (user_id, form_no, academic_session_id,
                    applicant_stage, application_payment_reference)
               VALUES (%s, %s, %s, %s, %s)''',
            (user_id, form_no, current_session_id, 'started', reference_no)
        )
        res = Database.execute_query(
            'SELECT uuid FROM pg_application WHERE form_no = %s', (form_no,)
        )
        return res[0]['uuid'] if res else None

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
    # Try pg_application first
    pg_res = Database.execute_query(
        '''SELECT pg.uuid,
                  pg.finalised_course,
                  pg.approved_course,
                  pg.proposed_course AS program_setup_id
           FROM pg_application pg
           WHERE pg.user_id = %s AND pg.applicant_stage IN ('admitted', 'accepted', 'enrolled')
           ORDER BY pg.created_date DESC LIMIT 1''',
        (user_id,)
    )
    if pg_res:
        pg_row = pg_res[0]
        finalised_course = (pg_row.get('finalised_course') or '').strip()
        if not finalised_course:
            finalised_course = (pg_row.get('approved_course') or '').strip()
        if not finalised_course and pg_row.get('program_setup_id'):
            ps_res = Database.execute_query(
                'SELECT name FROM pg_program_setup WHERE id = %s',
                (pg_row['program_setup_id'],)
            )
            if ps_res:
                finalised_course = ps_res[0]['name']

        if not finalised_course:
            raise ValueError('finalised_course is required to resolve faculty and fees')

        faculty_res = Database.execute_query(
            '''SELECT faculty_id
               FROM pg_program_setup
               WHERE LOWER(name) = LOWER(%s)
               LIMIT 1''',
            (finalised_course,)
        )
        if not faculty_res or faculty_res[0].get('faculty_id') is None:
            raise ValueError(f"No faculty found for finalised_course '{finalised_course}'")

        pt_res = Database.execute_query('SELECT level_id FROM program_types WHERE id = 2')
        level_id = pt_res[0]['level_id'] if pt_res else None

        return {
            'program_type': 2,
            'level': level_id,
            'faculty_id': faculty_res[0]['faculty_id'],
            'finalised_course': finalised_course,
        }

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
        pg_res = Database.execute_query(
            'SELECT uuid FROM pg_application WHERE user_id = %s ORDER BY created_date DESC LIMIT 1',
            (user_id,)
        )
        if pg_res:
            prog_type = 2
        else:
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
        if not fee_res:
            raise ValueError('Acceptance fee not configured for this program')
        return float(fee_res[0]['amount'])

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

        # Full Payment: compute as the total of what is left
        plans = Database.execute_query('SELECT id, percentage FROM installment_plans')
        if plans:
            paid = Database.execute_query(
                '''SELECT installment_plan_id 
                   FROM payment_transactions 
                   WHERE user_id = %s 
                     AND tran_type = 'tuition' 
                     AND tran_status = 'successful' 
                     AND installment_plan_id IS NOT NULL''',
                (user_id,)
            )
            paid_ids = {p['installment_plan_id'] for p in (paid or [])}
            remaining_pct = sum(float(pl['percentage'] or 0) for pl in plans if pl['id'] not in paid_ids)
            if len(paid_ids) > 0:
                return round((total * remaining_pct) / 100.0, 2)

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


@applicant_bp.route('/processing-fee', methods=['GET'])
def get_processing_fee_endpoint():
    try:
        processing_fee = _get_processing_fee()
        return jsonify({'processing_fee': processing_fee}), 200
    except Exception as e:
        return jsonify({'message': str(e)}), 500


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
    
    try:
        is_pg = program_type_id and int(program_type_id) == 2
    except ValueError:
        is_pg = False

    if is_pg:
        programs = Database.execute_query(
            '''SELECT
                   pgps.id AS program_id,
                   COALESCE(dg.code || ' ', '') || pgps.name AS program,
                   d.id AS department_id,
                   d.name AS department,
                   dg.id AS degree_id,
                   dg.name AS degree,
                   dg.code AS degree_code,
                   3 AS duration
               FROM pg_program_setup pgps
               LEFT JOIN departments d ON pgps.department_id = d.id
               LEFT JOIN degrees dg ON pgps.degree_id = dg.id
               WHERE pgps.is_active = TRUE
               ORDER BY d.name, pgps.name'''
        )
    else:
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
# Form Templates & Dynamic Options
# ─────────────────────────────────────────────────────────────────────────────

def _populate_dynamic_options(template, program_type_id):
    """Populate dynamic options in template based on program type"""
    try:
        # Create a deep copy to avoid modifying the original template
        template = copy.deepcopy(template)
        
        # Fetch all countries from database, ordered by ID
        countries = Database.execute_query(
            'SELECT id, name FROM country ORDER BY id ASC'
        )
        # Do NOT include placeholder - frontend handles it with SelectValue placeholder prop
        country_options = [c['name'] for c in (countries or [])]
        
        # Fetch all UTME subjects from database
        subjects = Database.execute_query(
            'SELECT name FROM utme_subjects ORDER BY name ASC'
        )
        subject_options = [s['name'] for s in (subjects or [])]
        
        # Populate fields across all steps
        for step in template.get('steps', []):
            for field in step.get('fields', []):
                field_name = field.get('name', '')
                
                # Populate nationality from countries table
                if field_name == 'nationality':
                    field['options'] = country_options
                
                # Populate UTME subjects
                elif field_name.startswith('utme_subject'):
                    field['options'] = subject_options
        
        return template
    except Exception as e:
        print(f"Error populating dynamic options: {e}")
        import traceback
        traceback.print_exc()
        return template


@applicant_bp.route('/get-utme-subjects', methods=['GET'])
@AuthHandler.token_required
def get_utme_subjects(payload):
    """Fetch all UTME subjects from database"""
    try:
        subjects = Database.execute_query(
            'SELECT id, name FROM utme_subjects ORDER BY name ASC'
        )
        return jsonify({
            'subjects': [{'id': s['id'], 'name': s['name']} for s in (subjects or [])]
        }), 200
    except Exception as e:
        print(f"Error fetching UTME subjects: {e}")
        return jsonify({'message': 'Failed to fetch subjects', 'subjects': []}), 500


@applicant_bp.route('/get-countries', methods=['GET'])
@AuthHandler.token_required
def get_countries(payload):
    """Fetch all countries from database, ordered by ID with placeholder"""
    try:
        countries = Database.execute_query(
            'SELECT id, name FROM country ORDER BY id ASC'
        )
        # Add placeholder option at the beginning
        countries_list = [{'id': '', 'name': '-select nationality-'}]
        countries_list.extend([{'id': c['id'], 'name': c['name']} for c in (countries or [])])
        return jsonify({'countries': countries_list}), 200
    except Exception as e:
        print(f"Error fetching countries: {e}")
        return jsonify({'message': 'Failed to fetch countries', 'countries': []}), 500


# ─────────────────────────────────────────────────────────────────────────────

@applicant_bp.route('/form/<int:program_type_id>', methods=['GET'])
@AuthHandler.token_required
def get_form_template(payload, program_type_id):
    role = str(payload.get('role', '')).lower()
    user_type_id = str(payload.get('user_type_id', ''))
    
    if role not in ('applicant', 'student', 'admitted') and user_type_id not in ('2', '7', '13', '15'):
        return jsonify({'message': 'Access denied. Valid applicant or student role required.'}), 403

    form_templates = {
        1: utme_template,
        2: postgraduate_template,
        3: jupeb_template,
        4: hnd_conversion_template,
        5: ijmb_template,
        6: direct_entry_template,
        7: part_time_template,
    }
    template = form_templates.get(program_type_id)
    if template is None:
        return jsonify({'message': f'No form template found for program_type_id {program_type_id}'}), 404
    
    # Populate dynamic options (e.g., UTME subjects from database)
    template = _populate_dynamic_options(template, program_type_id)
    
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
        pg_res = Database.execute_query(
            'SELECT uuid FROM pg_application WHERE user_id = %s ORDER BY created_date DESC LIMIT 1',
            (user_id,)
        )
        if pg_res:
            application_id = pg_res[0]['uuid']
            program_type_id = 2
        else:
            app_res = Database.execute_query(
                'SELECT id, prog_type FROM applications WHERE user_id = %s ORDER BY created_at DESC',
                (user_id,)
            )
            if not app_res:
                return jsonify({'message': 'Application record not found'}), 404
            application_id  = app_res[0]['id']
            program_type_id = app_res[0]['prog_type']
    else:
        pg_res = Database.execute_query(
            'SELECT uuid FROM pg_application WHERE uuid = %s AND user_id = %s',
            (application_id, user_id)
        )
        if pg_res:
            application_id = pg_res[0]['uuid']
            program_type_id = 2
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

    if program_type_id == 2:
        # 1. Save pg_reference
        ref_fields = {
            'name1': clean_val('referee_name1'),
            'address1': clean_val('referee_address1'),
            'name2': clean_val('referee_name2'),
            'address2': clean_val('referee_address2'),
            'name3': clean_val('referee_name3'),
            'address3': clean_val('referee_address3'),
        }
        ref_cols = [k for k, v in ref_fields.items() if v is not None]
        ref_vals = [ref_fields[k] for k in ref_cols]
        
        pg_app_check = Database.execute_query(
            'SELECT pg_reference_id, nextofkin_sponsor_id FROM pg_application WHERE uuid = %s',
            (application_id,)
        )
        
        ref_id = None
        if pg_app_check and pg_app_check[0]['pg_reference_id']:
            ref_id = pg_app_check[0]['pg_reference_id']
            if ref_cols:
                set_clause = ', '.join(f"{c} = %s" for c in ref_cols)
                Database.execute_update(
                    f'UPDATE pg_reference SET {set_clause} WHERE id = %s',
                    tuple(ref_vals + [ref_id])
                )
        else:
            if ref_cols:
                ref_res = Database.execute_query(
                    f'''INSERT INTO pg_reference ({', '.join(ref_cols)}) 
                        VALUES ({', '.join(['%s']*len(ref_cols))}) RETURNING id''',
                    tuple(ref_vals)
                )
                if ref_res:
                    ref_id = ref_res[0]['id']

        # 2. Save nextofkin_sponsor
        nok_sp_fields = {
            'name': clean_val('next_of_kin_name'),
            'address': clean_val('next_of_kin_address'),
            'phone_number': clean_val('next_of_kin_phone_number'),
            'secondary_number': clean_val('next_of_kin_secondary_phone_number'),
            'sponsor_name': clean_val('sponsor_name'),
            'sponsor_address': clean_val('sponsor_address'),
        }
        nok_sp_cols = [k for k, v in nok_sp_fields.items() if v is not None]
        nok_sp_vals = [nok_sp_fields[k] for k in nok_sp_cols]
        
        nok_sp_id = None
        if pg_app_check and pg_app_check[0]['nextofkin_sponsor_id']:
            nok_sp_id = pg_app_check[0]['nextofkin_sponsor_id']
            if nok_sp_cols:
                set_clause = ', '.join(f"{c} = %s" for c in nok_sp_cols)
                Database.execute_update(
                    f'UPDATE nextofkin_sponsor SET {set_clause}, updated_date = NOW() WHERE id = %s',
                    tuple(nok_sp_vals + [nok_sp_id])
                )
        else:
            if nok_sp_cols:
                nok_sp_res = Database.execute_query(
                    f'''INSERT INTO nextofkin_sponsor ({', '.join(nok_sp_cols)}) 
                        VALUES ({', '.join(['%s']*len(nok_sp_cols))}) RETURNING id''',
                    tuple(nok_sp_vals)
                )
                if nok_sp_res:
                    nok_sp_id = nok_sp_res[0]['id']

        # 3. Save pg_application
        phys_challenged = clean_val('physically_challenged')
        challenge_reason = clean_val('physical_challenge_reason')
        if phys_challenged == 'Yes':
            phys_val = challenge_reason or 'Yes'
        else:
            phys_val = 'No'

        proposed_course_id = None
        if clean_val('proposed_course'):
            try:
                proposed_course_id = int(clean_val('proposed_course'))
            except ValueError:
                pass

        # Derive proposed_faculty_id from the selected course in pg_program_setup
        proposed_faculty_id = None
        if proposed_course_id:
            fac_res = Database.execute_query(
                'SELECT faculty_id FROM pg_program_setup WHERE id = %s', (proposed_course_id,)
            )
            if fac_res and fac_res[0].get('faculty_id'):
                proposed_faculty_id = fac_res[0]['faculty_id']

        deg_id_val = None
        if clean_val('degree_id'):
            try:
                deg_id_val = int(clean_val('degree_id'))
            except ValueError:
                pass

        pg_app_fields = {
            'uuid': application_id,
            'user_id': user_id,
            'surname': clean_val('last_name'),
            'first_name': clean_val('first_name'),
            'middle_name': clean_val('middle_name'),
            'email': clean_val('email'),
            'gender': clean_val('gender'),
            'date_of_birth': clean_val('date_of_birth'),
            'address': clean_val('address'),
            'previous_institution': clean_val('previous_institution'),
            'previous_course': clean_val('previous_course'),
            'department': clean_val('department'),
            'class_of_degree': clean_val('class_of_degree'),
            'proposed_course': proposed_course_id,
            'proposed_faculty_id': proposed_faculty_id,
            'degree_id': deg_id_val,
            'area_of_specialisation': clean_val('area_of_specialisation'),
            'proposed_research_title': clean_val('proposed_research_title'),
            'mode_of_study': clean_val('mode_of_study'),
            'physically_challenged': phys_val,
            'pg_reference_id': ref_id,
            'nextofkin_sponsor_id': nok_sp_id,
            'phone_number': clean_val('phone_number'),
            'secondary_phone_number': clean_val('secondary_phone_number'),
        }
        
        pg_app_cols = [k for k, v in pg_app_fields.items() if v is not None]
        pg_app_vals = [pg_app_fields[k] for k in pg_app_cols]
        
        update_set = ', '.join(f"{c} = EXCLUDED.{c}" for c in pg_app_cols if c not in ('uuid', 'user_id'))
        
        Database.execute_update(
            f'''INSERT INTO pg_application ({', '.join(pg_app_cols)}, updated_date)
                VALUES ({', '.join(['%s']*len(pg_app_cols))}, NOW())
                ON CONFLICT (uuid) DO UPDATE SET {update_set}, updated_date = NOW()''',
            tuple(pg_app_vals)
        )

        course_name = None
        if proposed_course_id:
            course_res = Database.execute_query('SELECT name FROM pg_program_setup WHERE id = %s', (proposed_course_id,))
            if course_res:
                course_name = course_res[0]['name']

        # Update pg_application table
        Database.execute_update(
            '''UPDATE pg_application 
               SET degree_id = %s, finalised_course = %s, applicant_stage = 'in_progress', updated_date = NOW()
               WHERE uuid = %s''',
            (deg_id_val, course_name, application_id)
        )

        return jsonify({'message': 'Postgraduate form saved successfully', 'form_id': application_id}), 200

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
        # work_experience (PG template field) has no dedicated column — fall back to
        # additional_info only when additional_info is not explicitly provided.
        'additional_info': clean_val('additional_info') or clean_val('work_experience'),
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

    # ── Program Choice (University course choices) ──────────────────────────
    first_choice_id = data.get('first_choice_program_id')
    second_choice_id = data.get('second_choice_program_id')
    
    fc_val = None
    if first_choice_id not in ('', 'null', 'undefined', None):
        try:
            fc_val = int(first_choice_id)
        except ValueError:
            pass
            
    sc_val = None
    if second_choice_id not in ('', 'null', 'undefined', None):
        try:
            sc_val = int(second_choice_id)
        except ValueError:
            pass

    if fc_val is not None or sc_val is not None:
        pc_exists = Database.execute_query('SELECT id FROM program_choice WHERE application_id = %s', (application_id,))
        if pc_exists:
            Database.execute_update(
                'UPDATE program_choice SET first_choice = %s, second_choice = %s WHERE application_id = %s',
                (fc_val, sc_val, application_id)
            )
        else:
            Database.execute_update(
                'INSERT INTO program_choice (application_id, first_choice, second_choice) VALUES (%s, %s, %s)',
                (application_id, fc_val, sc_val)
            )

        # For the first choice, also write degree_id to the applications row
        if fc_val is not None:
            deg_res = Database.execute_query(
                '''SELECT dp.degree_id
                   FROM program_setup ps
                   JOIN degree_program dp ON dp.degree_id = ps.degree_id
                   WHERE ps.id = %s
                   LIMIT 1''',
                (fc_val,)
            )
            if deg_res and deg_res[0].get('degree_id'):
                Database.execute_update(
                    '''UPDATE applications
                       SET degree_id = %s, updated_at = NOW()
                       WHERE id = %s AND degree_id IS NULL''',
                    (deg_res[0]['degree_id'], application_id)
                )

    # ── Academic qualification / O'Level ─────────────────────────────────────
    aq_fields = {'user_id': user_id}
    
    # Extract original JAMB choices (manually typed) and other UTME details into aq_fields
    # Build subject ID to name mapping for subject field conversion
    subject_rows = Database.execute_query('SELECT id, name FROM utme_subjects')
    subject_map = {str(r['id']): r['name'] for r in (subject_rows or [])}
    
    utme_cols = [
        'utme_reg_no', 'utme_score', 'mode_of_entry', 'choice1', 'choice2',
        'utme_subject1', 'utme_score1',
        'utme_subject2', 'utme_score2',
        'utme_subject3', 'utme_score3',
        'utme_subject4', 'utme_score4'
    ]
    for col in utme_cols:
        val = data.get(col)
        if val not in ('', 'null', 'undefined', None):
            if 'score' in col:
                try:
                    aq_fields[col] = int(val)
                except ValueError:
                    pass
            elif 'subject' in col:
                subject_val = str(val).strip()
                if subject_val.isdigit():
                    aq_fields[col] = subject_map.get(subject_val, subject_val)
                else:
                    aq_fields[col] = subject_val
            else:
                aq_fields[col] = val

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

@applicant_bp.route('/scan-document', methods=['POST'])
@AuthHandler.token_required
def scan_document_endpoint(payload):
    """
    Step 1 of the document upload flow (PG applicants).

    Accepts a raw image, runs the scanner, and returns:
      - quality assessment (score, issues)
      - original image as base64
      - enhanced (scanned) image as base64

    Nothing is written to the database. The user previews both images
    and chooses to confirm (which calls /upload-document) or cancel.
    """
    if 'file' not in request.files:
        return jsonify({'message': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'message': 'No file selected'}), 400

    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in ('jpg', 'jpeg', 'png'):
        return jsonify({'message': 'Only JPG/PNG images can be scanned. For PDFs or Word docs, upload directly.', 'skip_scan': True}), 200

    image_bytes = file.read()
    if len(image_bytes) > 15 * 1024 * 1024:
        return jsonify({'message': 'File exceeds 15 MB limit'}), 400

    try:
        result = scan_document(image_bytes)
    except ScannerError as e:
        return jsonify({'message': str(e)}), 422
    except Exception as e:
        return jsonify({'message': f'Scanner error: {e}'}), 500

    quality = result['quality']
    return jsonify({
        'quality_score':   quality['score'],
        'is_acceptable':   quality['is_acceptable'],
        'issues':          quality['issues'],
        'sharpness':       quality['sharpness'],
        'brightness':      quality['brightness'],
        'original_b64':    result['original_b64'],
        'preview_b64':     result['preview_b64'],
    }), 200


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

    pg_check = Database.execute_query(
        'SELECT uuid FROM pg_application WHERE uuid = %s AND user_id = %s', (form_id_uuid, user_id)
    )
    is_pg = bool(pg_check)
    if not is_pg:
        app_check = Database.execute_query(
            'SELECT id FROM applications WHERE id = %s AND user_id = %s', (form_id_uuid, user_id)
        )
        if not app_check:
            return jsonify({'message': 'Application not found or access denied'}), 404

    file_path = os.path.join(upload_folder, stored_filename)
    file_ext  = stored_filename.split('.')[-1] if '.' in stored_filename else ''

    if is_pg:
        doc_result = Database.execute_query(
            '''INSERT INTO pg_document
                   (pg_application_id, document_type, file_name, file_url, file_size, file_type, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id''',
            (form_id_uuid, document_type, file.filename, file_path, original_size_int, file_ext, 'pending')
        )
    else:
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
    is_pg_doc = False
    doc = Database.execute_query(
        '''SELECT d.id, d.file_url AS file_path 
           FROM documents d
           LEFT JOIN applications a ON d.application_id = a.id
           WHERE d.id = %s AND a.user_id = %s''',
        (document_id, user_id)
    )
    if not doc:
        doc = Database.execute_query(
            '''SELECT d.id, d.file_url AS file_path 
               FROM pg_document d
               LEFT JOIN pg_application pg ON d.pg_application_id = pg.uuid
               WHERE d.id = %s AND pg.user_id = %s''',
        (document_id, user_id)
        )
        if doc:
            is_pg_doc = True

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

    if is_pg_doc:
        Database.execute_update('DELETE FROM pg_document WHERE id = %s', (document_id,))
    else:
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
           LEFT JOIN applications a ON d.application_id = a.id
           WHERE d.id = %s AND (a.user_id = %s OR %s IN ('admin','ict_director','admissionofficer'))''',
        (document_id, user_id, role)
    )
    if not doc:
        doc = Database.execute_query(
            '''SELECT d.file_url AS file_path, d.file_type AS mime_type, d.file_name AS original_filename
               FROM pg_document d
               LEFT JOIN pg_application pg ON d.pg_application_id = pg.uuid
               WHERE d.id = %s AND (pg.user_id = %s OR pg.user_id = %s OR %s IN ('admin','ict_director','admissionofficer','pgadmin','pgdean'))''',
            (document_id, user_id, user_id, role)
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

        if int(program_type_id) == 2:
            existing_app = Database.execute_query(
                """SELECT pg.uuid AS id, pg.applicant_stage,
                          pg.application_payment_reference
                   FROM pg_application pg
                   WHERE pg.user_id = %s
                     AND pg.academic_session_id = %s
                   ORDER BY pg.created_date DESC
                   LIMIT 1""",
                (user_id, current_session_id)
            )
        else:
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
                if int(program_type_id) == 2:
                    paid_check2 = Database.execute_query(
                        """SELECT pt.id FROM payment_transactions pt
                           JOIN pg_application pg
                             ON pg.application_payment_reference = pt.reference_no
                           WHERE pg.user_id = %s
                             AND pt.tran_type = 'application_fee'
                             AND pt.tran_status = 'successful'
                           LIMIT 1""",
                        (user_id,)
                    )
                else:
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


def make_frontend_url(path):
    base = Config.FRONTEND_BASE_URL.rstrip('/')
    if '/e-portal' not in base.lower() and not path.startswith('/e-portal'):
        path = '/e-portal' + path
    return f"{base}{path}"


def make_html_redirect(redirect_url):
    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <title>Payment Callback Processing</title>
    <script type="text/javascript">
        window.location.href = "{redirect_url}";
    </script>
</head>
<body>
    <p>Redirecting you back to the application portal...</p>
</body>
</html>"""
    return Response(html_content, mimetype='text/html')


# ─────────────────────────────────────────────────────────────────────────────
# ✅ NEW ARCHITECTURE: Payment callback (server-side requery)
# ─────────────────────────────────────────────────────────────────────────────
# This is the entry point when Interswitch redirects after payment.
# CRITICAL: This runs SERVER-SIDE immediately, not client-polling.
# This fixes the bug where client timeout caused FAILED status.

@applicant_bp.route('/payment/callback', methods=['GET', 'POST'])
def payment_callback():
    """
    ✅ NEW: Immediate server-side requery (replaces client-side polling strategy)
    
    Flow:
    1. User completes payment on Interswitch
    2. Interswitch redirects here with txnref parameter
    3. We IMMEDIATELY requery Interswitch (server-to-server, ~600ms)
    4. Classify response:
       - '00' → settle immediately, redirect /dashboard
       - PENDING codes → redirect /verifying (client polls /payment/status)
       - Definitive FAIL → redirect /payment?failed=true
    
    This prevents the bug: "ISW settles after 4 min, but client timeout at 3 min marked FAILED"
    """
    from utils.payment_status import classify_response, build_update_sql_params, generate_receipt_no, atomic_settle_payment
    from utils.interswitch import InterswitchClient
    
    # Get transaction reference from Interswitch redirect
    # Interswitch sends txnref as FORM DATA (POST body), not query parameter
    txnref = (
        request.form.get('txnref') or 
        request.form.get('txnRef') or 
        request.args.get('txnref') or 
        request.args.get('txnRef') or
        ''
    ).strip()
    
    if not txnref:
        redirect_url = make_frontend_url("/applicant/payment?failed=true&message=No+transaction+reference+found")
        return make_html_redirect(redirect_url)
    
    # Find transaction in DB
    txn = Database.execute_query(
        '''SELECT id, user_id, amount_in_kobo, amount, tran_type, tran_status, 
                  COALESCE(requery_count, 0) AS requery_count
           FROM payment_transactions
           WHERE reference_no = %s
           ORDER BY created_at DESC LIMIT 1''',
        (txnref,)
    )
    
    if not txn:
        print(f"[callback] Transaction not found: {txnref}")
        redirect_url = make_frontend_url(f"/applicant/payment?failed=true&ref={txnref}&message=Transaction+not+found")
        return make_html_redirect(redirect_url)
    
    txn = txn[0]
    user_id = txn['user_id']
    payment_type = txn['tran_type']
    amount_kobo = txn['amount_in_kobo'] or round(float(txn['amount'] or 0) * 100)
    requery_count = txn['requery_count']
    
    # If already finalised, redirect to frontend callback to show the finalised status page
    if txn['tran_status'] not in ('pending', 'requery_error'):
        redirect_url = make_frontend_url(f"/applicant/payment/callback?txnref={txnref}")
        return make_html_redirect(redirect_url)
    
    # ✅ IMMEDIATE SERVER-SIDE REQUERY (this is the fix!)
    try:
        isw_resp = InterswitchClient.requery_transaction(txnref, amount_kobo)
    except Exception as e:
        print(f"[callback] Requery error for {txnref}: {e}")
        # Leave as pending, client will retry via /payment/status polling
        Database.execute_update(
            '''UPDATE payment_transactions 
               SET tran_status = 'requery_error', requery_count = COALESCE(requery_count, 0) + 1
               WHERE reference_no = %s''',
            (txnref,)
        )
        redirect_url = make_frontend_url(f"/applicant/payment/callback?txnref={txnref}")
        return make_html_redirect(redirect_url)
    
    response_code = str(isw_resp.get('ResponseCode', '')).strip()
    response_desc = isw_resp.get('ResponseDescription', '')
    
    # Classify response using the fixed logic
    tran_status = classify_response(response_code, requery_count)
    is_successful = (tran_status == 'successful')
    
    if is_successful:
        lock_acquired = atomic_settle_payment(txnref, user_id, payment_type)
        
        if lock_acquired:
            receipt_no = generate_receipt_no()
            sql, params = build_update_sql_params(
                'successful', txnref, response_code, response_desc,
                isw_resp, amount_kobo, receipt_no
            )
            Database.execute_update(sql, params)
            redirect_url = make_frontend_url(f"/applicant/payment/callback?txnref={txnref}")
            return make_html_redirect(redirect_url)
        else:
            print(f"[callback] Already settled by another handler: {txnref}")
            redirect_url = make_frontend_url(f"/applicant/payment/callback?txnref={txnref}")
            return make_html_redirect(redirect_url)
    
    # For non-successful payments, update status directly
    receipt_no = None
    sql, params = build_update_sql_params(
        tran_status, txnref, response_code, response_desc,
        isw_resp, amount_kobo, receipt_no
    )
    Database.execute_update(sql, params)
    redirect_url = make_frontend_url(f"/applicant/payment/callback?txnref={txnref}")
    return make_html_redirect(redirect_url)


# ─────────────────────────────────────────────────────────────────────────────
# Payment — verify (callback)
# ─────────────────────────────────────────────────────────────────────────────

def verify_transaction_by_reference(reference_no: str):
    if not reference_no:
        return None

    txn_res = Database.execute_query(
        '''SELECT id, amount_in_kobo, amount, tran_status, receipt_no,
                  tran_type, COALESCE(requery_count, 0) AS requery_count, user_id
           FROM payment_transactions
           WHERE reference_no = %s
           ORDER BY created_at DESC LIMIT 1''',
        (reference_no,)
    )
    if not txn_res:
        print(f"[callback verify] Transaction {reference_no} not found in database.")
        return None

    txn = txn_res[0]
    user_id = txn['user_id']
    payment_type = txn['tran_type']
    requery_count = int(txn['requery_count'])

    if txn['tran_status'] in ('successful', 'failed', 'cancelled'):
        return txn['tran_status']

    amount_kobo = txn['amount_in_kobo'] or (round(float(txn['amount'] or 0) * 100))

    latest_check = Database.execute_query(
        '''SELECT tran_status FROM payment_transactions
           WHERE reference_no = %s
           ORDER BY created_at DESC LIMIT 1''',
        (reference_no,)
    )
    if latest_check and latest_check[0].get('tran_status') != 'pending':
        return latest_check[0].get('tran_status')


    try:
        isw_resp = InterswitchClient.requery_transaction(reference_no, amount_kobo)
    except Exception as e:
        print(f"[callback verify] Interswitch requery error for {reference_no}: {e}")
        Database.execute_update(
            '''UPDATE payment_transactions
               SET tran_status = 'requery_error',
                   requery_count = COALESCE(requery_count, 0) + 1,
                   updated_at = NOW()
               WHERE reference_no = %s''',
            (reference_no,)
        )
        return 'pending'

    response_code = str(isw_resp.get('ResponseCode', '')).strip()
    response_desc = isw_resp.get('ResponseDescription', '')

    tran_status = classify_response(response_code, requery_count)
    is_successful = (tran_status == 'successful')

    latest_after = Database.execute_query(
        '''SELECT tran_status FROM payment_transactions
           WHERE reference_no = %s
           ORDER BY created_at DESC LIMIT 1''',
        (reference_no,)
    )
    if latest_after and latest_after[0].get('tran_status') != 'pending':
        return latest_after[0].get('tran_status')

    # Update transaction record
    receipt_no_val = txn.get('receipt_no') or (generate_receipt_no() if is_successful else '') or ''
    sql, params = build_update_sql_params(
        tran_status, reference_no, response_code, response_desc,
        isw_resp, amount_kobo, receipt_no_val,
    )
    Database.execute_update(sql, params)

    # Downstream actions on success
    if is_successful:
        apply_downstream_success(user_id, payment_type, reference_no=reference_no)

    print(f"[callback verify] Transaction {reference_no} verified and updated to: {tran_status}")
    return tran_status


@applicant_bp.route('/verify-payment', methods=['POST'])
@AuthHandler.token_required
def verify_payment(payload):
    
    from utils.payment_status import classify_response, build_update_sql_params, generate_receipt_no, atomic_settle_payment, get_session_payment_summary
    from utils.interswitch import InterswitchClient
    from datetime import datetime, timedelta
    
    user_id = payload['user_id']
    data = request.get_json() or {}
    reference_no = data.get('reference_no')
    
    if not reference_no:
        return jsonify({'message': 'reference_no is required'}), 400
    
    # Fetch transaction
    txn = Database.execute_query(
        '''SELECT id, amount_in_kobo, amount, tran_status, receipt_no, tran_type,
                  academic_session_id,
                  COALESCE(requery_count, 0) AS requery_count,
                  last_queried_at, fully_paid_for_session
           FROM payment_transactions
           WHERE reference_no = %s AND user_id = %s
           ORDER BY created_at DESC LIMIT 1''',
        (reference_no, user_id)
    )
    
    if not txn:
        return jsonify({'message': 'Transaction not found'}), 404
    
    txn = txn[0]
    payment_type = txn['tran_type']
    current_status = txn['tran_status']
    session_id = txn.get('academic_session_id')
    
    # Build response with session payment status if this is tuition
    def build_response(status, is_successful, receipt_no=None, message=None):
        response = {
            'tran_status': status,
            'is_successful': is_successful,
            'receipt_no': receipt_no,
        }
        
        # Add session payment summary for tuition payments
        if payment_type == 'tuition' and session_id:
            session_summary = get_session_payment_summary(user_id, session_id)
            response['session_payment'] = session_summary
            response['fully_paid_for_session'] = session_summary['is_fully_paid']
        
        if message:
            response['message'] = message
        
        return response
    
    # If already finalised (success/failed/cancelled), just return status
    if current_status in ('successful', 'failed', 'cancelled'):
        return jsonify(build_response(
            current_status, 
            current_status == 'successful',
            txn['receipt_no'],
            'Transaction already finalised'
        )), 200
    

    amount_kobo = txn['amount_in_kobo'] or round(float(txn['amount'] or 0) * 100)
    last_queried = txn.get('last_queried_at')
    should_requery = (
        current_status == 'pending' and
        (last_queried is None or 
         (datetime.now(timezone.utc).replace(tzinfo=None) - last_queried).total_seconds() > 5)
    )
    
    if should_requery:
        Database.execute_update(
            '''UPDATE payment_transactions 
               SET last_queried_at = NOW()
               WHERE reference_no = %s''',
            (reference_no,)
        )
        
        # Requery ISW
        try:
            isw_resp = InterswitchClient.requery_transaction(reference_no, amount_kobo)
            response_code = str(isw_resp.get('ResponseCode', '')).strip()
            response_desc = isw_resp.get('ResponseDescription', '')
            
            # Classify using fixed logic
            tran_status = classify_response(response_code, txn['requery_count'])
            is_successful = (tran_status == 'successful')
            
            print(f"[verify-payment] {reference_no} | requery code={response_code!r} → {tran_status}")
            
            # Update transaction
            receipt_no = generate_receipt_no() if is_successful else None
            sql, params = build_update_sql_params(
                tran_status, reference_no, response_code, response_desc,
                isw_resp, amount_kobo, receipt_no
            )
            Database.execute_update(sql, params)
            
            if is_successful:
                atomic_settle_payment(reference_no, user_id, payment_type)
                return jsonify(build_response(
                    'successful',
                    True,
                    receipt_no
                )), 200
            
            # Return updated status
            return jsonify(build_response(
                tran_status,
                False,
                message=response_desc
            )), 200
            
        except Exception as e:
            print(f"[verify-payment] Requery error for {reference_no}: {e}")
            return jsonify(build_response(
                'pending',
                False,
                message='Could not reach ISW, retrying...'
            )), 503
    
    return jsonify(build_response(
        current_status,
        False,
        message='Still verifying, check again soon'
    )), 200
    
# ─────────────────────────────────────────────────────────────────────────────
# Payment — cancel (user closed the Interswitch modal without completing)
# ─────────────────────────────────────────────────────────────────────────────

@applicant_bp.route('/cancel-payment', methods=['POST'])
@AuthHandler.token_required
def cancel_payment(payload):
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

    # Idempotency 
    if txn['tran_status'] in ('successful', 'failed', 'cancelled'):
        print(f"[webhook] Already finalised ({txn['tran_status']}): {reference_no}")
        return jsonify({'message': 'already processed'}), 200

    amount_kobo = txn['amount_in_kobo'] or (round(float(txn['amount'] or 0) * 100))

    # Re-query Interswitch 
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

    tran_status   = classify_response(response_code, requery_count)
    is_successful = (tran_status == 'successful')
    is_cancelled  = (tran_status == 'cancelled')

    log_msg = f"[webhook] {reference_no} | code={response_code!r} requery_count={requery_count} → {tran_status} (type={payment_type})"
    if is_cancelled:
        log_msg += f" (cancelled by user, response_desc='{response_desc}')"
    print(log_msg)

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

    # Check if a postgraduate application exists for this user
    pg_app_check = Database.execute_query(
        'SELECT uuid FROM pg_application WHERE user_id = %s LIMIT 1', (user_id,)
    )
    if pg_app_check:
        _ensure_pg_recommendation_columns()
        applications = Database.execute_query(
            '''SELECT
                   pg.uuid AS id,
                   u.firstname || ' ' || COALESCE(u.middlename || ' ', '') || u.surname AS user_name,
                   2 AS program_type_id,
                   pg.applicant_stage AS application_status,
                   pg.decision,
                   COALESCE(asess.name, CAST(pg.academic_session_id AS TEXT)) AS program_session,
                   pg.created_date AS created_at,
                   pg.form_no,
                   u.matric_no,
                   ptype.name AS program_name,
                   dg.code AS degree_code,
                   pg.approved_course,
                   pg.finalised_course,
                   pg.applicant_recommended_course,
                   (
                       EXISTS (
                           SELECT 1 FROM payment_transactions txn
                           WHERE txn.reference_no = pg.application_payment_reference
                             AND txn.tran_status = 'successful'
                       )
                       OR
                       EXISTS (
                           SELECT 1 FROM payment_transactions txn_fb
                           WHERE txn_fb.user_id = pg.user_id
                             AND txn_fb.tran_type  = 'application_fee'
                             AND txn_fb.tran_status = 'successful'
                             AND (txn_fb.raw_request_payload->>'program_type_id')::int = 2
                       )
                   ) AS has_paid_application_fee,
                   EXISTS (
                       SELECT 1 FROM payment_transactions txn_p
                       WHERE txn_p.reference_no = pg.application_payment_reference
                         AND txn_p.tran_status IN ('pending', 'requery_error')
                   ) AS has_pending_application_payment,
                   (pg.applicant_stage IN ('accepted','enrolled')) AS has_paid_acceptance_fee,
                   COALESCE(pg.admission_letter_sent, FALSE) AS admission_letter_sent,
                   EXISTS (
                       SELECT 1 FROM payment_transactions txn2
                       WHERE txn2.user_id = pg.user_id
                         AND txn2.tran_type = 'tuition'
                         AND txn2.tran_status = 'successful'
                   ) AS has_paid_tuition,
                   CASE WHEN pg.applicant_stage != 'started' THEN pg.updated_date ELSE NULL END AS submitted_at,
                   CASE 
                       WHEN pg.applicant_stage IN ('admitted','accepted','enrolled') THEN 'admitted' 
                       WHEN pg.applicant_stage = 'recommended' OR pg.decision = 'recommend' THEN 'recommend'
                       WHEN pg.applicant_stage IN ('accepted_recommendation','applicant_recommended') THEN pg.applicant_stage
                       WHEN pg.applicant_stage = 'screening' THEN 'screening'
                       WHEN pg.applicant_stage = 'rejected' THEN 'rejected'
                       ELSE 'pending' 
                   END AS admission_status
               FROM pg_application pg
               JOIN users u ON pg.user_id = u.id
               LEFT JOIN program_types ptype ON ptype.id = 2
               LEFT JOIN academic_sessions asess ON pg.academic_session_id = asess.id
               LEFT JOIN degrees dg ON pg.degree_id = dg.id
               WHERE pg.user_id = %s
               ORDER BY pg.created_date DESC''',
            (user_id,)
        )
        if not applications:
            return jsonify({'applicants': [], 'applicant': None}), 200
        formatted = []
        for app in applications:
            d = dict(app)
            if d.get('created_at') and not isinstance(d['created_at'], str):
                d['created_at'] = d['created_at'].isoformat()
            if d.get('submitted_at') and not isinstance(d['submitted_at'], str):
                d['submitted_at'] = d['submitted_at'].isoformat()
            formatted.append(d)
        return jsonify({'applicants': formatted, 'applicant': formatted[0]}), 200

    applications = Database.execute_query(
        '''SELECT
               app.id,
               u.firstname || ' ' || COALESCE(u.middlename || ' ', '') || u.surname AS user_name,
               app.prog_type AS program_type_id,
               app.applicant_stage AS application_status,
               COALESCE(asess.name, CAST(app.academic_session_id AS TEXT)) AS program_session,
               app.created_at,
               app.form_no,
               u.matric_no,
               ptype.name AS program_name,
               dg.code AS degree_code,
               COALESCE(app.approved_course, app.finalised_course) AS approved_course,
               (
                   EXISTS (
                       SELECT 1 FROM payment_transactions txn
                       WHERE txn.reference_no = app.application_payment_reference
                         AND txn.tran_status = 'successful'
                   )
                   OR
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
           LEFT JOIN degrees dg ON app.degree_id = dg.id
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
    except ValueError as e:
        return jsonify({
            'message': str(e),
            'acceptance_fee': None,
            'processing_fee': processing_fee,
            'found': False,
        }), 400


@applicant_bp.route('/tuition-fee-breakdown', methods=['GET'])
@AuthHandler.token_required
def get_tuition_fee_breakdown(payload):
    """
    returns the payment status for the current session:
    - total_expected: Total fees for this session
    - total_paid: Amount already paid
    - is_fully_paid: Whether all fees are paid
    - remaining: Amount still owed
    - payment_percentage: Percentage of fees paid (0-100)
    """
    from utils.payment_status import get_session_payment_summary
    
    user_id = payload['user_id']
    try:
        context = _get_applicant_fee_context(user_id)

        # Get active session
        session_res = Database.execute_query(
            'SELECT id FROM academic_sessions WHERE is_active = TRUE ORDER BY id DESC LIMIT 1'
        )
        current_session_id = session_res[0]['id'] if session_res else None

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
        
        # Get session payment summary
        session_payment = {}
        if current_session_id:
            session_payment = get_session_payment_summary(user_id, current_session_id)
        
        return jsonify({
            'components':         components,
            'total':              total,
            'processing_fee':     processing_fee,
            'found':              len(components) > 0,
            'session_payment':    session_payment,
            'fully_paid_for_session': session_payment.get('is_fully_paid', False),
        }), 200

    except Exception as e:
        print(f'[tuition-fee-breakdown] Error: {e}')
        return jsonify({
            'message': str(e),
            'components': [],
            'total': 0,
            'processing_fee': 300.0,
            'session_payment': {},
            'fully_paid_for_session': False,
        }), 500


@applicant_bp.route('/admission-letter', methods=['GET'])
@AuthHandler.token_required
def get_admission_letter(payload):
    user_id = payload['user_id']
    is_pg = bool(Database.execute_query('SELECT uuid FROM pg_application WHERE user_id = %s LIMIT 1', (user_id,)))
    if is_pg:
        applicant = Database.execute_query(
            '''SELECT pg.uuid AS id,
                      u.firstname || ' ' || COALESCE(u.middlename || ' ', '') || u.surname AS name,
                      2 AS program_id,
                      'Postgraduate' AS program_name,
                      pg.form_no,
                      pg.approved_course,
                      pg.applicant_stage,
                      asess.name AS session_name
               FROM pg_application pg
               JOIN users u ON pg.user_id = u.id
               LEFT JOIN academic_sessions asess ON pg.academic_session_id = asess.id
               WHERE pg.user_id = %s AND pg.applicant_stage IN ('admitted','accepted')
               ORDER BY pg.updated_date DESC LIMIT 1''',
            (user_id,)
        )
    else:
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

    if is_pg:
        pd_res = Database.execute_query(
            '''SELECT f.name AS faculty, d.name AS department
            FROM pg_application pg
            JOIN pg_program_setup ps ON (
                LOWER(TRIM(ps.name)) = LOWER(TRIM(pg.finalised_course))
                OR EXISTS (
                    SELECT 1 FROM degrees dg
                    WHERE dg.id = ps.degree_id
                      AND LOWER(TRIM(COALESCE(dg.code || ' ', '') || ps.name)) = LOWER(TRIM(pg.finalised_course))
                )
            )
            JOIN departments d ON d.id = ps.department_id
            JOIN faculties f ON f.id = ps.faculty_id
            WHERE pg.user_id = %s
            ORDER BY pg.updated_date DESC LIMIT 1''',
                (user_id,)
            )
    else:
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
    pg_res = Database.execute_query(
        '''SELECT pg.uuid AS id, 2 AS prog_type, pg.application_payment_reference
           FROM pg_application pg
           WHERE pg.uuid = %s AND pg.user_id = %s''',
        (applicant_id, user_id)
    )
    if pg_res:
        app_res = pg_res
    else:
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
        if app_res[0].get('prog_type') == 2:
            fallback_check = Database.execute_query(
                """SELECT id FROM payment_transactions
                   WHERE user_id = %s AND tran_type = 'application_fee'
                     AND tran_status = 'successful'
                     AND (raw_request_payload->>'program_type_id')::int = 2
                   LIMIT 1""",
                (user_id,)
            )
        else:
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
            if app_res[0].get('prog_type') == 2:
                healed_ref = Database.execute_query(
                    """SELECT reference_no FROM payment_transactions
                       WHERE user_id = %s AND tran_type = 'application_fee'
                         AND tran_status = 'successful'
                         AND (raw_request_payload->>'program_type_id')::int = 2
                       ORDER BY confirmed_at DESC LIMIT 1""",
                    (user_id,)
                )
                if healed_ref:
                    Database.execute_update(
                        """UPDATE pg_application
                           SET application_payment_reference = %s, updated_date = NOW()
                           WHERE uuid = %s""",
                        (healed_ref[0]['reference_no'], app_res[0]['id'])
                    )
            else:
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
    prog_type = app_res[0].get('prog_type')

    form_data = {}

    if prog_type == 2:
        # Load Postgraduate form details
        pg_app = Database.execute_query(
            '''SELECT pg.*, 
                      ns.name AS next_of_kin_name, ns.address AS next_of_kin_address, 
                      ns.phone_number AS next_of_kin_phone_number, ns.secondary_number AS next_of_kin_secondary_phone_number,
                      ns.sponsor_name, ns.sponsor_address,
                      ref.name1 AS referee_name1, ref.address1 AS referee_address1,
                      ref.name2 AS referee_name2, ref.address2 AS referee_address2,
                      ref.name3 AS referee_name3, ref.address3 AS referee_address3
               FROM pg_application pg
               LEFT JOIN nextofkin_sponsor ns ON ns.id = pg.nextofkin_sponsor_id
               LEFT JOIN pg_reference ref ON ref.id = pg.pg_reference_id
               WHERE pg.uuid = %s''',
            (application_id,)
        )
        if pg_app:
            row = pg_app[0]
            form_data = {
                'first_name': row['first_name'],
                'last_name': row['surname'],
                'middle_name': row['middle_name'],
                'email': row['email'],
                'gender': row['gender'],
                'date_of_birth': row['date_of_birth'].strftime('%Y-%m-%d') if row['date_of_birth'] else None,
                'phone_number': row['phone_number'],
                'secondary_phone_number': row['secondary_phone_number'],
                'address': row['address'],
                'physically_challenged': row['physically_challenged'],
                'physical_challenge_reason': row['physically_challenged'] if row['physically_challenged'] != 'No' else '',
                'previous_institution': row['previous_institution'],
                'previous_course': row['previous_course'],
                'department': row['department'],
                'class_of_degree': row['class_of_degree'],
                'proposed_course': row['proposed_course'],
                'proposed_faculty': row['proposed_faculty_id'],
                'degree_id': row['degree_id'],
                'area_of_specialisation': row['area_of_specialisation'],
                'proposed_research_title': row['proposed_research_title'],
                'mode_of_study': row['mode_of_study'],
                'sponsor_name': row['sponsor_name'],
                'sponsor_address': row['sponsor_address'],
                'next_of_kin_name': row['next_of_kin_name'],
                'next_of_kin_address': row['next_of_kin_address'],
                'next_of_kin_phone_number': row['next_of_kin_phone_number'],
                'next_of_kin_secondary_phone_number': row['next_of_kin_secondary_phone_number'],
                'referee_name1': row['referee_name1'],
                'referee_address1': row['referee_address1'],
                'referee_name2': row['referee_name2'],
                'referee_address2': row['referee_address2'],
                'referee_name3': row['referee_name3'],
                'referee_address3': row['referee_address3'],
            }
            if row['proposed_course']:
                c_res = Database.execute_query('SELECT name FROM pg_program_setup WHERE id = %s', (row['proposed_course'],))
                if c_res:
                    form_data['proposed_course_name'] = c_res[0]['name']
            if row['proposed_faculty_id']:
                f_res = Database.execute_query('SELECT name FROM faculties WHERE id = %s', (row['proposed_faculty_id'],))
                if f_res:
                    form_data['proposed_faculty_name'] = f_res[0]['name']
            if row['degree_id']:
                d_res = Database.execute_query('SELECT name, code FROM degrees WHERE id = %s', (row['degree_id'],))
                if d_res:
                    form_data['degree_name'] = d_res[0]['name']
                    form_data['degree_code'] = d_res[0]['code']

            if form_data['physically_challenged'] and form_data['physically_challenged'] != 'No':
                form_data['physical_challenge_reason'] = form_data['physically_challenged']
                form_data['physically_challenged'] = 'Yes'
            else:
                form_data['physically_challenged'] = 'No'
                form_data['physical_challenge_reason'] = ''
        else:
            user_info = Database.execute_query(
                'SELECT firstname, surname, middlename, email, phone_number FROM users WHERE id = %s',
                (user_id,)
            )
            if user_info:
                u = user_info[0]
                form_data = {
                    'first_name': u.get('firstname'),
                    'last_name': u.get('surname'),
                    'middle_name': u.get('middlename'),
                    'email': u.get('email'),
                    'phone_number': u.get('phone_number'),
                    'physically_challenged': 'No',
                }

        # Available courses
        pg_courses = Database.execute_query(
            '''SELECT ps.id, ps.name AS course, d.id AS department_id, d.name AS department,
                      ps.faculty_id, ps.degree_id, deg.name AS degree_name, deg.code AS degree_code
               FROM pg_program_setup ps
               LEFT JOIN departments d ON d.id = ps.department_id
               LEFT JOIN degrees deg ON deg.id = ps.degree_id
               WHERE ps.is_active = TRUE ORDER BY ps.id'''
        )
        form_data['available_courses'] = [dict(r) for r in (pg_courses or [])]

        # Available faculties
        faculties = Database.execute_query('SELECT id, name FROM faculties ORDER BY name')
        form_data['available_faculties'] = [dict(f) for f in (faculties or [])]

        # Available degrees (only PG program type degrees)
        pg_degrees = Database.execute_query(
            '''SELECT d.id, d.name, d.code
               FROM degrees d
               JOIN degree_program dp ON dp.degree_id = d.id
               WHERE dp.program_type_id = 2 ORDER BY d.name'''
        )
        form_data['available_degrees'] = [dict(d) for d in (pg_degrees or [])]

    else:
        # Load UTME/other form details
        pi_res      = Database.execute_query('SELECT * FROM biodata WHERE application_id = %s', (application_id,))
        nok_res     = Database.execute_query('SELECT * FROM next_of_kin WHERE application_id = %s', (application_id,))
        sponsor_res = Database.execute_query('SELECT * FROM sponsor WHERE application_id = %s', (application_id,))

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

            # Load university choices from program_choice table
            pc_res = Database.execute_query(
                '''SELECT pc.first_choice, pc.second_choice, ps1.name AS first_choice_name, ps2.name AS second_choice_name
                   FROM program_choice pc
                   LEFT JOIN program_setup ps1 ON pc.first_choice = ps1.id
                   LEFT JOIN program_setup ps2 ON pc.second_choice = ps2.id
                   WHERE pc.application_id = %s''',
                (application_id,)
            )
            if pc_res:
                pc_row = pc_res[0]
                if pc_row.get('first_choice'):
                    form_data['first_choice_program_id'] = pc_row['first_choice']
                    form_data['first_choice_program_name'] = pc_row['first_choice_name']
                if pc_row.get('second_choice'):
                    form_data['second_choice_program_id'] = pc_row['second_choice']
                    form_data['second_choice_program_name'] = pc_row['second_choice_name']

            # Load original JAMB choices (manually typed) & other UTME details
            utme_fields = [
                'utme_reg_no', 'utme_score', 'mode_of_entry', 'choice1', 'choice2',
                'utme_subject1', 'utme_score1',
                'utme_subject2', 'utme_score2',
                'utme_subject3', 'utme_score3',
                'utme_subject4', 'utme_score4'
            ]
            for f in utme_fields:
                if aq.get(f) is not None:
                    form_data[f] = aq.get(f)

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
    if prog_type == 2:
        documents = Database.execute_query(
            '''SELECT d.id AS document_id, d.document_type, d.document_type AS display_name,
                      d.file_name AS original_filename, d.file_size, d.status
               FROM pg_document d
               WHERE d.pg_application_id = %s''',
            (application_id,)
        )
    else:
        documents = Database.execute_query(
            '''SELECT d.id AS document_id, d.document_type, d.document_type AS display_name,
                      d.file_name AS original_filename, d.file_size, d.status
               FROM documents d
               WHERE d.application_id = %s''',
            (application_id,)
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

    pg_check = Database.execute_query(
        'SELECT uuid FROM pg_application WHERE uuid = %s AND user_id = %s', (applicant_id, user_id)
    )
    if pg_check:
        success = Database.execute_update(
            "UPDATE pg_application SET applicant_stage = 'submitted', updated_date = NOW() WHERE uuid = %s AND user_id = %s",
            (applicant_id, user_id)
        )
    else:
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
    is_pg = bool(Database.execute_query('SELECT uuid FROM pg_application WHERE user_id = %s LIMIT 1', (user_id,)))
    if is_pg:
        applicant = Database.execute_query(
            '''SELECT pg.uuid AS id, u.firstname || ' ' || u.surname AS name, 'Postgraduate' AS program_name
               FROM pg_application pg
               JOIN users u ON pg.user_id = u.id
               WHERE pg.user_id = %s ORDER BY pg.updated_date DESC LIMIT 1''',
            (user_id,)
        )
    else:
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
    return jsonify({'message': f'Recommendation {response} successfully', 'applicant_id': applicant_id, 'response': response}), 200


# ─────────────────────────────────────────────────────────────────────────────
# PG COURSE RECOMMENDATION ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@applicant_bp.route('/accept-recommended-course', methods=['POST'])
@AuthHandler.token_required
def accept_recommended_course(payload):
    """
    Applicant accepts the admin's recommended course.
    
    Only valid for PG applicants in 'recommended' status.
    Updates applicant_stage to 'accepted_recommendation'.
    
    Request JSON:
        - applicant_id: UUID of the PG application
    
    Response:
        {
            'message': 'Recommended course accepted successfully',
            'new_status': 'accepted_recommendation',
            'approved_course': course_name
        }
    """
    user_id = payload['user_id']
    _ensure_pg_recommendation_columns()
    data = request.get_json() or {}
    applicant_id = data.get('applicant_id')
    
    if not applicant_id:
        return jsonify({'message': 'applicant_id is required'}), 400
    
    # Verify applicant exists and belongs to this user
    pg_app = Database.execute_query(
        '''SELECT uuid, applicant_stage, approved_course
           FROM pg_application
           WHERE uuid = %s AND user_id = %s''',
        (applicant_id, user_id)
    )
    
    if not pg_app:
        return jsonify({'message': 'Application not found or access denied'}), 404
    
    current_stage = pg_app[0]['applicant_stage']
    approved_course = pg_app[0]['approved_course']
    
    # Must be in 'recommended' status
    if current_stage != 'recommended':
        return jsonify({
            'message': f'Can only accept recommendation when status is "recommended", current status is "{current_stage}"'
        }), 400
    
    if not approved_course:
        return jsonify({'message': 'No recommended course found'}), 400
    
    # Update to accepted_recommendation status
    success = Database.execute_update(
        '''UPDATE pg_application
           SET applicant_stage = 'accepted_recommendation', updated_date = NOW()
           WHERE uuid = %s''',
        (applicant_id,)
    )
    
    if not success:
        return jsonify({'message': 'Failed to update application status'}), 500
    
    return jsonify({
        'message': 'Recommended course accepted successfully',
        'new_status': 'accepted_recommendation',
        'approved_course': approved_course
    }), 200


@applicant_bp.route('/recommend-alternative-course', methods=['POST'])
@AuthHandler.token_required
def recommend_alternative_course(payload):
    """
    Applicant recommends an alternative course.
    
    Only valid for PG applicants in 'recommended' status.
    Stores the applicant's alternative recommendation and updates status to 'applicant_recommended'.
    
    Request JSON:
        - applicant_id: UUID of the PG application
        - alternative_course: Course name string (must match a course in pg_program_setup)
    
    Response:
        {
            'message': 'Alternative course recommendation submitted successfully',
            'new_status': 'applicant_recommended',
            'original_recommended_course': admin's course,
            'applicant_recommended_course': applicant's course
        }
    """
    user_id = payload['user_id']
    _ensure_pg_recommendation_columns()
    data = request.get_json() or {}
    applicant_id = data.get('applicant_id')
    alternative_course = data.get('alternative_course')  # course name string
    
    if not applicant_id or not alternative_course:
        return jsonify({'message': 'applicant_id and alternative_course are required'}), 400
    
    # Verify applicant exists and belongs to this user
    pg_app = Database.execute_query(
        '''SELECT uuid, applicant_stage, approved_course, user_id
           FROM pg_application
           WHERE uuid = %s AND user_id = %s''',
        (applicant_id, user_id)
    )
    
    if not pg_app:
        return jsonify({'message': 'Application not found or access denied'}), 404
    
    current_stage = pg_app[0]['applicant_stage']
    approved_course = pg_app[0]['approved_course']
    
    # Must be in 'recommended' status
    if current_stage != 'recommended':
        return jsonify({
            'message': f'Can only recommend alternative when status is "recommended", current status is "{current_stage}"'
        }), 400
    
    # Verify the alternative course exists
    course_check = Database.execute_query(
        '''SELECT ps.id, ps.name
           FROM pg_program_setup ps
           LEFT JOIN degrees dg ON ps.degree_id = dg.id
           WHERE LOWER(ps.name) = LOWER(%s)
              OR LOWER(COALESCE(dg.code || ' ', '') || ps.name) = LOWER(%s)
           LIMIT 1''',
        (alternative_course, alternative_course)
    )
    
    if not course_check:
        return jsonify({'message': f'Alternative course "{alternative_course}" not found'}), 404
    
    # Update: store applicant's recommended course and change status
    success = Database.execute_update(
        '''UPDATE pg_application
           SET applicant_stage = 'applicant_recommended',
               applicant_recommended_course = %s,
               updated_date = NOW()
           WHERE uuid = %s''',
        (alternative_course, applicant_id)
    )
    
    if not success:
        return jsonify({'message': 'Failed to update application status'}), 500
    
    return jsonify({
        'message': 'Alternative course recommendation submitted successfully',
        'new_status': 'applicant_recommended',
        'original_recommended_course': approved_course,
        'applicant_recommended_course': alternative_course
    }), 200


@applicant_bp.route('/reject-recommended-course', methods=['POST'])
@AuthHandler.token_required
def reject_recommended_course(payload):
    """Applicant rejects the admin recommended course, ending the application."""
    user_id = payload['user_id']
    _ensure_pg_recommendation_columns()
    data = request.get_json() or {}
    applicant_id = data.get('applicant_id')

    if not applicant_id:
        return jsonify({'message': 'applicant_id is required'}), 400

    pg_app = Database.execute_query(
        '''SELECT uuid, applicant_stage, decision, approved_course
           FROM pg_application
           WHERE uuid = %s AND user_id = %s''',
        (applicant_id, user_id)
    )

    if not pg_app:
        return jsonify({'message': 'Application not found or access denied'}), 404

    current_stage = pg_app[0]['applicant_stage']
    if current_stage != 'recommended':
        return jsonify({
            'message': f'Can only reject recommendation when status is "recommended", current status is "{current_stage}"'
        }), 400

    success = Database.execute_update(
        '''UPDATE pg_application
           SET applicant_stage = 'rejected',
               finalised_course = NULL,
               updated_date = NOW()
           WHERE uuid = %s''',
        (applicant_id,)
    )

    if not success:
        return jsonify({'message': 'Failed to reject recommendation'}), 500

    return jsonify({
        'message': 'Course recommendation rejected. Your application has ended.',
        'new_status': 'rejected',
        'approved_course': pg_app[0].get('approved_course')
    }), 200
