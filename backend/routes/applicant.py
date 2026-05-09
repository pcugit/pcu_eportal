from flask import Blueprint, request, jsonify, Response, send_file
from database import Database
from utils.auth import AuthHandler
from utils.document_handler import DocumentHandler
from utils.pdf_generator import PDFGenerator
from utils.payment_receipt_generator import PaymentReceiptGenerator
from utils.medical_form_generator import MedicalFormGenerator
from config import Config
from datetime import datetime
import os
import uuid
import secrets
import string
from datetime import date

applicant_bp = Blueprint('Applicant', __name__)

@applicant_bp.route('/olevel-data', methods=['GET'])
def get_olevel_data():
    """Get O'Level subjects and grades for dropdowns"""
    subjects = Database.execute_query('SELECT id, name FROM olevel_subjects ORDER BY name ASC')
    grades = Database.execute_query('SELECT id, grade FROM olevel_grades ORDER BY id ASC')
    
    return jsonify({
        'status': 'success',
        'subjects': subjects or [],
        'grades': grades or []
    })


@applicant_bp.route('/programs', methods=['GET'])
def get_programs():
    """Get list of available programs based on applicant's selected program type"""
    program_type_id = request.args.get('program_type_id')

    programs = Database.execute_query(
        '''SELECT 
            ps.id               AS program_id,
            ps.name             AS program,
            d.id                AS department_id,
            d.name              AS department,
            dg.id               AS degree_id,
            dg.name             AS degree,
            dg.code             AS degree_code,
            dy.years            AS duration
        FROM degree_program dp
        JOIN degrees dg         ON dp.degree_id      = dg.id
        JOIN program_setup ps   ON ps.degree_id      = dp.degree_id
        JOIN departments d      ON ps.department_id  = d.id
        JOIN duration_years dy  ON dp.duration_id    = dy.id
        WHERE dp.program_type_id = %s
        ORDER BY d.name, ps.name;''',
        (program_type_id,)
    )
    
    global_lock = False
    pt_status = {
        'undergraduate': True,
        'postgraduate': False,
        'part-time': False,
        'jupeb': False
    }
    
    try:
        settings_res = Database.execute_query("SELECT key, value FROM system_settings WHERE key IN ('admission_registration_locked', 'undergraduate_admission_locked', 'postgraduate_admission_locked', 'part_time_admission_locked', 'jupeb_admission_locked')")
        for s in (settings_res or []):
            is_locked = (s['value'] == 'true')
            if s['key'] == 'admission_registration_locked' and is_locked:
                global_lock = True
            elif s['key'] == 'undergraduate_admission_locked':
                pt_status['undergraduate'] = not is_locked
            elif s['key'] == 'postgraduate_admission_locked':
                pt_status['postgraduate'] = not is_locked
            elif s['key'] == 'part_time_admission_locked':
                pt_status['part-time'] = not is_locked
            elif s['key'] == 'jupeb_admission_locked':
                pt_status['jupeb'] = not is_locked
    except:
        pass
        
    return jsonify({
        'programs': programs or [],
        'global_admission_locked': global_lock,
        'program_types_status': pt_status
    }), 200

@applicant_bp.route('/program-types', methods=['GET'])
def get_program_types():
    """Get program types with specific fees"""
    types = Database.execute_query(
        'SELECT id, name FROM program_types WHERE id BETWEEN 1 AND 7 ORDER BY id'
    )
    
    fee_mapping = {
        1: 42,
        6: 43,
        4: 40,
        2: 37,
        7: 38,
        3: 39,
        5: 41
    }
    
    # Fetch all relevant fees
    fee_ids = list(fee_mapping.values())
    fees_data = Database.execute_query(
        'SELECT id, amount FROM program_fees WHERE id IN %s',
        (tuple(fee_ids),)
    )
    
    # Create a lookup for fees by ID
    fee_lookup = {f['id']: float(f['amount']) for f in (fees_data or [])}
    
    # Attach fees to types
    for t in types:
        fee_id = fee_mapping.get(t['id'])
        if fee_id:
            t['fee'] = fee_lookup.get(fee_id, 0)
        
    return jsonify({
        'program_types': types or []
    }), 200



@applicant_bp.route('/form/<int:program_type_id>', methods=['GET'])
@AuthHandler.token_required
def get_form_template(payload, program_type_id):
    """Get application form template for a program"""
    
    # Guard route so only 'applicant' can access
    role = payload.get('role', '')
    if role != 'applicant':
        return jsonify({'message': 'Access denied. Please complete payment first.'}), 403
    
    # Mock form template based on program
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
                        {'name': 'state', 'type': 'select', 'label': 'State', 'options': ['Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara', 'FCT'], 'required': True},
                        {'name': 'lga', 'type': 'text', 'label': 'Local Government Area', 'required': True},
                        {'name': 'address', 'type': 'textarea', 'label': 'Address', 'required': True}
                    ]
                },
                {
                    'title': 'Sponsor and Next of Kin',
                    'type': 'fields',
                    'fields': [
                        {'name': 'sponsor_name', 'type': 'text', 'label': 'Sponsor Name', 'required': True},
                        {'name': 'sponsor_address', 'type': 'text', 'label': 'Sponsor Address', 'required': True},
                        {'name': 'sponsor_phone_number', 'type': 'text', 'label': 'Sponsor Phone Number', 'required': True},
                        {'name': 'sponsor_relationship', 'type': 'select', 'label': 'Sponsor Relationship', 'options': ['Father', 'Mother', 'Guardian', 'Uncle', 'Aunt', 'Self', 'Other'], 'required': True},
                        {'name': 'sponsor_email', 'type': 'email', 'label': 'Sponsor Email', 'required': False},
                        {'name': 'next_of_kin_name', 'type': 'text', 'label': "Next of Kin's Name", 'required': True},
                        {'name': 'next_of_kin_address', 'type': 'text', 'label': "Next of Kin's Address", 'required': True},
                        {'name': 'next_of_kin_phone_number', 'type': 'text', 'label': "Next of Kin's Phone Number", 'required': True}
                    ]
                },
                {
                    'title': "O'LEVEL",
                    'type': 'olevel'
                },
                {
                    'title': 'Documents',
                    'type': 'documents',
                    'documents': [
                        {'type': 'passport', 'label': 'Passport Photograph', 'required': True},
                        {'type': 'birth_certificate', 'label': 'Birth Certificate', 'required': True}
                    ]
                }
            ]
        },

        2: {
            'program': 'Postgraduate',
            'steps': [
                {
                    'title': 'Personal Information',
                    'type': 'fields',
                    'fields': [
                        {'name': 'email', 'type': 'email', 'label': 'Email', 'required': True, 'disabled': True},
                        {'name': 'first_name', 'type': 'text', 'label': 'First Name', 'required': True, 'disabled': True},
                        {'name': 'last_name', 'type': 'text', 'label': 'Last Name', 'required': True, 'disabled': True},
                        {'name': 'date_of_birth', 'type': 'date', 'label': 'Date of Birth', 'required': True},
                        {'name': 'nationality', 'type': 'text', 'label': 'Nationality', 'required': True},
                        {'name': 'address', 'type': 'textarea', 'label': 'Address', 'required': True},
                        {'name': 'phone_number', 'type': 'text', 'label': 'Phone Number', 'required': True, 'disabled': True},
                        {'name': 'secondary_phone_number', 'type': 'text', 'label': 'Secondary Phone Number', 'required': False}
                    ]
                },
                {
                    'title': 'Academic Qualifications',
                    'type': 'fields',
                    'fields': [
                        {'name': 'qualification_type', 'type': 'select', 'label': 'First Degree Type', 'options': ['BSc', 'BA', 'BEng', 'Other'], 'required': True},
                        {'name': 'qualification_institution', 'type': 'text', 'label': 'University Name', 'required': True},
                        {'name': 'qualification_year', 'type': 'number', 'label': 'Year of Graduation', 'required': True},
                        {'name': 'work_experience', 'type': 'textarea', 'label': 'Work Experience', 'required': False},
                        {'name': 'additional_info', 'type': 'textarea', 'label': 'Research Interests', 'required': False}
                    ]
                },
                {
                    'title': 'Sponsor and Next of Kin',
                    'type': 'fields',
                    'fields': [
                        {'name': 'sponsor_name', 'type': 'text', 'label': 'Sponsor Name', 'required': True},
                        {'name': 'sponsor_phone_number', 'type': 'text', 'label': 'Sponsor Phone Number', 'required': True},
                        {'name': 'next_of_kin_name', 'type': 'text', 'label': "Next of Kin's Name", 'required': True},
                        {'name': 'next_of_kin_phone_number', 'type': 'text', 'label': "Next of Kin's Phone Number", 'required': True}
                    ]
                },
                {
                    'title': 'Documents',
                    'type': 'documents',
                    'documents': [
                        {'type': 'transcript', 'label': 'University Transcript', 'required': True},
                        {'type': 'certificate', 'label': 'Degree Certificate', 'required': True},
                        {'type': 'identification', 'label': 'Identification (Passport/Driver License)', 'required': True},
                        {'type': 'recommendation', 'label': 'Recommendation Letters (2)', 'required': True}
                    ]
                }
            ]
        },

        14: {
            'program': 'Part-Time',
            'steps': [
                {
                    'title': 'Personal Information',
                    'type': 'fields',
                    'fields': [
                        {'name': 'email', 'type': 'email', 'label': 'Email', 'required': True, 'disabled': True},
                        {'name': 'first_name', 'type': 'text', 'label': 'First name', 'required': True, 'disabled': True},
                        {'name': 'last_name', 'type': 'text', 'label': 'Last name', 'required': True, 'disabled': True},
                        {'name': 'middle_name', 'type': 'text', 'label': 'Middle name', 'required': False},
                        {'name': 'gender', 'type': 'select', 'label': 'Gender', 'options': ['Male', 'Female'], 'required': True},
                        {'name': 'date_of_birth', 'type': 'date', 'label': 'Date of Birth', 'required': True},
                        {'name': 'place_of_birth', 'type': 'text', 'label': 'Place of birth', 'required': True},
                        {'name': 'marital_status', 'type': 'select', 'label': 'Marital Status', 'options': ['Single', 'Married', 'Divorced', 'Widowed'], 'required': True},
                        {'name': 'religion', 'type': 'select', 'label': 'Religion', 'options': ['Christianity', 'Islam', 'Traditional', 'Other'], 'required': True},
                        {'name': 'blood_group', 'type': 'text', 'label': 'Blood Group', 'required': False},
                        {'name': 'phone_number', 'type': 'text', 'label': 'Phone Number', 'required': True, 'disabled': True},
                        {'name': 'secondary_phone_number', 'type': 'text', 'label': 'Secondary Phone Number', 'required': False},
                        {'name': 'genotype', 'type': 'text', 'label': 'Genotype', 'required': False},
                        {'name': 'state', 'type': 'select', 'label': 'State', 'options': ['Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara', 'FCT'], 'required': True},
                        {'name': 'who_referred_you', 'type': 'text', 'label': 'Who referred you?', 'required': False},
                        {'name': 'nationality', 'type': 'select', 'label': 'Nationality', 'options': ['Nigerian', 'Non-Nigerian'], 'required': True},
                        {'name': 'contact_address', 'type': 'textarea', 'label': 'Contact Address', 'required': True},
                        {'name': 'lga', 'type': 'text', 'label': 'Local Government Area', 'required': True}
                    ]
                },
                {
                    'title': 'Sponsor and Next of Kin',
                    'type': 'fields',
                    'fields': [
                        {'name': 'sponsor_name', 'type': 'text', 'label': 'Sponsor Name', 'required': True},
                        {'name': 'sponsor_address', 'type': 'text', 'label': 'Sponsor Address', 'required': True},
                        {'name': 'sponsor_phone_number', 'type': 'text', 'label': 'Sponsor Phone Number', 'required': True},
                        {'name': 'sponsor_relationship', 'type': 'select', 'label': 'Sponsor Relationship', 'options': ['Father', 'Mother', 'Guardian', 'Uncle', 'Aunt', 'Self', 'Other'], 'required': True},
                        {'name': 'sponsor_email', 'type': 'email', 'label': 'Sponsor Email', 'required': False},
                        {'name': 'next_of_kin_name', 'type': 'text', 'label': "Next of Kin's Name", 'required': True},
                        {'name': 'next_of_kin_address', 'type': 'text', 'label': "Next of Kin's Address", 'required': True},
                        {'name': 'next_of_kin_phone_number', 'type': 'text', 'label': "Next of Kin's Phone Number", 'required': True}
                    ]
                },
                {
                    'title': "O'LEVEL",
                    'type': 'olevel'
                },
                {
                    'title': 'Documents',
                    'type': 'documents',
                    'documents': [
                        {'type': 'passport', 'label': 'Passport Photograph', 'required': True},
                        {'type': 'birth_certificate', 'label': 'Birth Certificate', 'required': True}
                    ]
                }
            ]
        }
    }
    
    # Default template for other programs
    default_template = form_templates[1]
    template = form_templates.get(program_type_id, default_template)
    
    return jsonify(template), 200

@applicant_bp.route('/submit-form', methods=['POST'])
@AuthHandler.token_required
def submit_form(payload):
    role = payload.get('role', '')
    if role != 'applicant':
        return jsonify({'message': 'Access denied. Please complete payment first.'}), 403
        
    user_id = payload['user_id']
    data = request.form.to_dict()
    
    # Also parse JSON payload if sent as json
    if request.is_json:
        data.update(request.get_json())
        
    import json
    # Extract application_id from data (passed as applicant_id from frontend)
    application_id = data.get('applicant_id')
    
    if not application_id:
        # Fallback to finding the first application for the user if not provided
        app_res = Database.execute_query(
            'SELECT id, prog_type FROM applications WHERE user_id = %s ORDER BY created_at DESC',
            (user_id,)
        )
        if not app_res:
            return jsonify({'message': 'Application record not found'}), 404
        application_id = app_res[0]['id']
        program_type_id = app_res[0]['prog_type']
    else:
        # Check if it's a valid application ID
        app_res = Database.execute_query(
            'SELECT id, prog_type FROM applications WHERE id = %s AND user_id = %s',
            (application_id, user_id)
        )
        if not app_res:
            # Fallback: maybe it's an applicant_id? Find their latest application.
            app_res = Database.execute_query(
                'SELECT id, prog_type FROM applications WHERE user_id = %s ORDER BY created_at DESC',
                (user_id,)
            )
            if not app_res:
                return jsonify({'message': 'Application record not found or access denied'}), 404
        
        application_id = app_res[0]['id']
        program_type_id = app_res[0]['prog_type']
    applicant_id = None
    program_id = program_type_id

    # Map data to specific columns for legacy and internal use
    fields_mapping = {
        'first_name': data.get('first_name'),
        'last_name': data.get('last_name'),
        'middle_name': data.get('middle_name'),
        'full_name': f"{data.get('first_name', '')} {data.get('last_name', '')}".strip() or data.get('full_name'),
        'date_of_birth': data.get('date_of_birth'),
        'gender': data.get('gender'),
        'nationality': data.get('nationality'),
        'place_of_birth': data.get('place_of_birth'),
        'marital_status': data.get('marital_status'),
        'religion': data.get('religion'),
        'blood_group': data.get('blood_group'),
        'phone_number': data.get('phone_number'),
        'secondary_phone_number': data.get('secondary_phone_number'),
        'genotype': data.get('genotype'),
        'state': data.get('state'),
        'who_referred_you': data.get('who_referred_you'),
        'lga': data.get('lga'),
        'address': data.get('address'),
        'sponsor_name': data.get('sponsor_name'),
        'sponsor_address': data.get('sponsor_address'),
        'sponsor_phone_number': data.get('sponsor_phone_number'),
        'sponsor_relationship': data.get('sponsor_relationship'),
        'sponsor_email': data.get('sponsor_email'),
        'next_of_kin_name': data.get('next_of_kin_name'),
        'next_of_kin_address': data.get('next_of_kin_address'),
        'next_of_kin_phone_number': data.get('next_of_kin_phone_number'),
        'qualification_type': data.get('qualification_type'),
        'qualification_institution': data.get('qualification_institution'),
        'qualification_year': data.get('qualification_year'),
        'work_experience': data.get('work_experience'),
        'first_choice_program_id': data.get('first_choice_program_id'),
        'second_choice_program_id': data.get('second_choice_program_id'),
        'olevel_results': data.get('olevel_results') if isinstance(data.get('olevel_results'), str) else json.dumps(data.get('olevel_results')) if data.get('olevel_results') else None,
        'additional_info': json.dumps(data)
    }

    # Helper to clean data: convert empty strings to None
    def clean_val(key):
        val = data.get(key)
        if val == "" or val == "null" or val == "undefined":
            return None
        return val

    # --- Save to biodata ---

    personal_info_fields = {
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
        'additional_info': clean_val('additional_info')
    }
    
    # Filter out None values for columns
    pi_columns = []
    pi_values = []

    for col, val in personal_info_fields.items():
        if val is not None:
            pi_columns.append(col)
            pi_values.append(val)
            
    if len(pi_columns) > 1:
        cols_str = ", ".join(pi_columns)
        placeholders = ", ".join(["%s"] * len(pi_columns))
        update_set = ", ".join([f"{col} = EXCLUDED.{col}" for col in pi_columns if col != 'application_id'])
        
        query = f'''
            INSERT INTO biodata ({cols_str}, updated_at)
            VALUES ({placeholders}, NOW())
            ON CONFLICT (application_id) 
            DO UPDATE SET 
                {update_set},
                updated_at = NOW()
        '''
        Database.execute_update(query, tuple(pi_values))



    nok_fields = {
        'application_id': application_id,
        'full_name': data.get('next_of_kin_name'),
        'phone_number': data.get('next_of_kin_phone_number'),
        'address': data.get('next_of_kin_address')
    }
    
    nok_columns = []
    nok_values = []
    for col, val in nok_fields.items():
        if val is not None:
            nok_columns.append(col)
            nok_values.append(val)
            
    if len(nok_columns) > 1:
        cols_str = ", ".join(nok_columns)
        placeholders = ", ".join(["%s"] * len(nok_columns))
        update_set = ", ".join([f"{col} = EXCLUDED.{col}" for col in nok_columns if col != 'application_id'])
        
        query = f'''
            INSERT INTO next_of_kin ({cols_str})
            VALUES ({placeholders})
            ON CONFLICT (application_id) 
            DO UPDATE SET {update_set}
        '''
        Database.execute_update(query, tuple(nok_values))


    sponsor_fields = {
        'application_id': application_id,
        'full_name': data.get('sponsor_name'),
        'address': data.get('sponsor_address'),
        'phone_number': data.get('sponsor_phone_number'),
        'relationship': data.get('sponsor_relationship'),
        'email': data.get('sponsor_email')
    }
    
    sponsor_columns = []
    sponsor_values = []
    for col, val in sponsor_fields.items():
        if val is not None:
            sponsor_columns.append(col)
            sponsor_values.append(val)
            
    if len(sponsor_columns) > 1:
        cols_str = ", ".join(sponsor_columns)
        placeholders = ", ".join(["%s"] * len(sponsor_columns))
        update_set = ", ".join([f"{col} = EXCLUDED.{col}" for col in sponsor_columns if col != 'application_id'])
        
        query = f'''
            INSERT INTO sponsor ({cols_str})
            VALUES ({placeholders})
            ON CONFLICT (application_id) 
            DO UPDATE SET {update_set}
        '''
        Database.execute_update(query, tuple(sponsor_values))



    olevel_results_raw = data.get('olevel_results')
    if olevel_results_raw:
        try:
            if isinstance(olevel_results_raw, str):
                olevel_exams = json.loads(olevel_results_raw)
            else:
                olevel_exams = olevel_results_raw
                
            if isinstance(olevel_exams, list):
                # Fetch maps to resolve IDs to names just in case frontend sends IDs
                subject_rows = Database.execute_query('SELECT id, name FROM olevel_subjects')
                grade_rows = Database.execute_query('SELECT id, grade FROM olevel_grades')
                subj_map = {str(r['id']): r['name'] for r in (subject_rows or [])}
                grade_map = {str(r['id']): r['grade'] for r in (grade_rows or [])}

                aq_fields = {'user_id': user_id}

                for idx, exam in enumerate(olevel_exams):
                    subjects = exam.get('subjects', [])
                    
                    if idx == 0:
                        # First sitting
                        aq_fields['exam_type'] = exam.get('name') or exam.get('examType')
                        aq_fields['exam_no']   = exam.get('number') or exam.get('regNo')
                        for i, s in enumerate(subjects[:5], start=1):
                            s_val = s.get('subject_id')
                            if not s_val: s_val = s.get('subject')
                            s_val = str(s_val).strip() if s_val else ''
                            
                            g_val = s.get('grade_id')
                            if not g_val: g_val = s.get('grade')
                            g_val = str(g_val).strip() if g_val else ''
                            
                            aq_fields[f'subject{i}'] = subj_map.get(s_val, s_val) if s_val else None
                            aq_fields[f'grade{i}']   = grade_map.get(g_val, g_val) if g_val else None

                    elif idx == 1:
                        # Second sitting
                        aq_fields['exam_type1'] = exam.get('name') or exam.get('examType')
                        aq_fields['exam_no1']   = exam.get('number') or exam.get('regNo')
                        for i, s in enumerate(subjects[:5], start=1):
                            s_val = s.get('subject_id')
                            if not s_val: s_val = s.get('subject')
                            s_val = str(s_val).strip() if s_val else ''
                            
                            g_val = s.get('grade_id')
                            if not g_val: g_val = s.get('grade')
                            g_val = str(g_val).strip() if g_val else ''
                            
                            aq_fields[f'second_subject{i}'] = subj_map.get(s_val, s_val) if s_val else None
                            aq_fields[f'second_grade{i}']   = grade_map.get(g_val, g_val) if g_val else None

                # Filter out None values
                aq_columns = [col for col, val in aq_fields.items() if val is not None]
                aq_values  = [val for val in aq_fields.values() if val is not None]

                if aq_columns:
                    cols_str     = ", ".join(aq_columns)
                    placeholders = ", ".join(["%s"] * len(aq_columns))
                    update_set   = ", ".join(
                        [f"{col} = EXCLUDED.{col}" for col in aq_columns if col != 'user_id']
                    )
                    
                    query = f'''
                        INSERT INTO academic_qualification ({cols_str})
                        VALUES ({placeholders})
                        ON CONFLICT (user_id)
                        DO UPDATE SET {update_set}
                    '''
                    Database.execute_update(query, tuple(aq_values))

        except Exception as e:
            print(f"Error saving O'Level results: {e}")


    Database.execute_update(
        "UPDATE applications SET applicant_stage = 'in_progress', updated_at = NOW() WHERE id = %s AND applicant_stage = 'started'",
        (application_id,)
    )

    first_choice = data.get('first_choice_program_id')

    return jsonify({
        'message': 'Application form saved successfully',
        'form_id': application_id
    }), 200


@applicant_bp.route('/upload-document', methods=['POST'])
@AuthHandler.token_required
def upload_document(payload):
    """Upload application document"""
    user_id = payload['user_id']
    
    if 'file' not in request.files or 'form_id' not in request.form or 'document_type' not in request.form:
        return jsonify({'message': 'Missing file, form_id, or document_type'}), 400
    
    file = request.files['file']
    form_id = request.form.get('form_id')
    document_type = request.form.get('document_type')
    
    if file.filename == '':
        return jsonify({'message': 'No file selected'}), 400
    
    if not DocumentHandler.allowed_file(file.filename):
        return jsonify({'message': 'File type not allowed'}), 400
    
    # Check file size
    file_size = DocumentHandler.get_file_size(file)
    if file_size > Config.MAX_CONTENT_LENGTH:
        return jsonify({'message': f'File size exceeds {Config.MAX_CONTENT_LENGTH / (1024*1024):.0f}MB limit'}), 400
    
    # Create upload folder for this applicant
    upload_folder = os.path.join(Config.UPLOAD_FOLDER, f'applicant_{user_id}')
    
    # Save document with compression
    stored_filename, original_size, compressed_size, is_compressed = DocumentHandler.save_document(file, upload_folder)
    
    if not stored_filename:
        return jsonify({'message': 'Failed to save document'}), 500
    
    if not form_id:
        return jsonify({'message': 'form_id is required'}), 400
        
    try:
        form_id_int = int(form_id)                 
        is_compressed_bool = bool(is_compressed)  
        original_size_int = int(original_size)    
        compressed_size_int = int(compressed_size)
    except (TypeError, ValueError) as e:
        print(f"Metadata conversion error: {e}, form_id={form_id}")
        return jsonify({'message': f'Invalid file metadata: {str(e)}'}), 400
    
    display_name = request.form.get('display_name', document_type)
    
    # Verify application belongs to user
    app_check = Database.execute_query(
        'SELECT id FROM applications WHERE id = %s AND user_id = %s',
        (form_id_int, user_id)
    )
    if not app_check:
        return jsonify({'message': 'Application not found or access denied'}), 404
    
    # Store document metadata in database
    file_path = os.path.join(upload_folder, stored_filename)
    file_ext = stored_filename.split('.')[-1] if '.' in stored_filename else ''
    
    doc_id = Database.execute_update(
    '''INSERT INTO documents 
       (application_id, document_type, file_name, file_url, file_size, file_type, status)
       VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id''',
    (form_id_int, document_type, file.filename, file_path, original_size_int, file_ext, 'pending'),
    return_id=True
)

    
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
        'compression_ratio': f'{compression_ratio:.1f}%'
    }), 201

@applicant_bp.route('/delete-document/<int:document_id>', methods=['DELETE'])
@AuthHandler.token_required
def delete_document(payload, document_id):
    """Delete a document"""
    user_id = payload['user_id']
    
    # Verify ownership
    doc = Database.execute_query(
        '''SELECT d.id, d.file_url as file_path FROM documents d
           JOIN applications a ON d.application_id = a.id
           WHERE d.id = %s AND a.user_id = %s''',
        (document_id, user_id)
    )


    
    if not doc:
        return jsonify({'message': 'Document not found'}), 404
    
    # Delete from file system
    file_path = doc[0]['file_path']
    if os.path.exists(file_path):
        os.remove(file_path)
    
    # Delete from database
    Database.execute_update('DELETE FROM documents WHERE id = %s', (document_id,))

    
    return jsonify({'message': 'Document deleted successfully'}), 200
    
@applicant_bp.route('/download-document/<int:document_id>', methods=['GET'])


@AuthHandler.token_required
def download_document(payload, document_id):
    """Download/Stream a document"""
    user_id = payload['user_id']
    role = payload.get('role')
    
    # Verify ownership or admin access
    doc = Database.execute_query(
        '''SELECT d.file_url as file_path, d.file_type as mime_type, d.file_name as original_filename FROM documents d
           JOIN applications a ON d.application_id = a.id
           WHERE d.id = %s AND (a.user_id = %s OR %s IN ('admin', 'ict_director', 'admissionofficer'))''',
        (document_id, user_id, role)
    )


    
    if not doc:
        return jsonify({'message': 'Document not found or access denied'}), 404
    
    file_path = doc[0]['file_path']
    if not os.path.exists(file_path):
        return jsonify({'message': 'File not found on server'}), 404
        
    return send_file(file_path, mimetype=doc[0]['mime_type'])


@applicant_bp.route('/get-form/<applicant_id>', methods=['GET'])
@AuthHandler.token_required
def get_form(payload, applicant_id):
    """Get saved application form"""
    role = payload.get('role', '')
    if role != 'applicant':
        return jsonify({'message': 'Access denied. Please complete payment first.'}), 403
        
    user_id = payload['user_id']
    
    # Try to find the application first (new schema)
    app_res = Database.execute_query(
        'SELECT id, prog_type FROM applications WHERE id = %s AND user_id = %s',
        (applicant_id, user_id)
    )
    
    application_id = None
    if app_res:
        application_id = app_res[0]['id']
    else:
        return jsonify({'message': 'Application not found'}), 404

    # Fetch from new schema
    pi_res = []
    nok_res = []
    sponsor_res = []
    if application_id:
        pi_res = Database.execute_query(
            'SELECT * FROM biodata WHERE application_id = %s',
            (application_id,)
        )
        nok_res = Database.execute_query(
            'SELECT * FROM next_of_kin WHERE application_id = %s',
            (application_id,)
        )
        sponsor_res = Database.execute_query(
            'SELECT * FROM sponsor WHERE application_id = %s',
            (application_id,)
        )
    
    form = []
    
    form_data = {}
    if pi_res:
        form_data = dict(pi_res[0])
        # Map fields for frontend compatibility
        if 'surname' in form_data:
            form_data['last_name'] = form_data['surname']
            
        # Format date_of_birth for HTML date input (YYYY-MM-DD)
        if form_data.get('date_of_birth'):
            try:
                from datetime import date, datetime
                dob = form_data['date_of_birth']
                if isinstance(dob, (date, datetime)):
                    form_data['date_of_birth'] = dob.strftime('%Y-%m-%d')
            except:
                pass

        # Construct full_name
        names = [form_data.get('first_name'), form_data.get('middle_name'), form_data.get('surname')]
        form_data['full_name'] = ' '.join(filter(None, names))

            
    if nok_res:
        nok_data = dict(nok_res[0])
        form_data['next_of_kin_name'] = nok_data.get('full_name')
        form_data['next_of_kin_phone_number'] = nok_data.get('phone_number')
        form_data['next_of_kin_address'] = nok_data.get('address')
        
    if sponsor_res:
        sponsor_data = dict(sponsor_res[0])
        form_data['sponsor_name'] = sponsor_data.get('full_name')
        form_data['sponsor_address'] = sponsor_data.get('address')
        form_data['sponsor_phone_number'] = sponsor_data.get('phone_number')
        form_data['sponsor_relationship'] = sponsor_data.get('relationship')
        form_data['sponsor_email'] = sponsor_data.get('email')
        
    if application_id:
        # --- NEW SCHEMA: Fetch O'Level results from academic_qualification ---
        aq_res = Database.execute_query(
            'SELECT * FROM academic_qualification WHERE user_id = %s',
            (user_id,)
        )

        if aq_res:
            aq = aq_res[0]
            olevel_exams = []

            # First sitting
            if aq.get('exam_type'):
                subjects = []
                for i in range(1, 6):
                    subj  = aq.get(f'subject{i}')
                    grade = aq.get(f'grade{i}')
                    if subj and grade:
                        subjects.append({
                            'subject_id': subj,
                            'grade_id': grade,
                            'subject': subj,
                            'grade': grade
                        })

                olevel_exams.append({
                    'name':     aq.get('exam_type'),
                    'number':   aq.get('exam_no'),
                    'subjects': subjects
                })

            # Second sitting
            if aq.get('exam_type1'):
                subjects = []
                for i in range(1, 6):
                    subj  = aq.get(f'second_subject{i}')
                    grade = aq.get(f'second_grade{i}')
                    if subj and grade:
                        subjects.append({
                            'subject_id': subj,
                            'grade_id': grade,
                            'subject': subj,
                            'grade': grade
                        })

                olevel_exams.append({
                    'name':     aq.get('exam_type1'),
                    'number':   aq.get('exam_no1'),
                    'subjects': subjects
                })

            if olevel_exams:
                form_data['olevel_results'] = olevel_exams

            
    if application_id:
        # Fetch courses based on program type
        prog_type = app_res[0].get('prog_type') if app_res else None
        if prog_type:
            pc_res = Database.execute_query(
                '''SELECT DISTINCT
                        ps.id,
                        ps.name     AS course,
                        d.id        AS department_id,
                        d.name      AS department
                FROM degree_program dp
                JOIN program_setup ps   ON ps.degree_id     = dp.degree_id
                JOIN departments d      ON d.id              = ps.department_id
                WHERE dp.program_type_id = %s
                ORDER BY d.name, ps.name''',
                (int(prog_type),)
            )
            if pc_res:
                form_data['available_courses'] = [dict(r) for r in pc_res]
            else:
                print(f"DEBUG: No courses found for prog_type={prog_type}")
                form_data['available_courses'] = []

            print(f"DEBUG prog_type: {repr(prog_type)}")
            # Clear legacy choice fields
            form_data['first_choice_program_id'] = None
            form_data['second_choice_program_id'] = None
        form_data['first_choice_program_name'] = None
        form_data['second_choice_program_name'] = None

    
    if form:
        legacy_data = dict(form[0])
        # Merge legacy data if not already present in form_data
        form_data = {**legacy_data, **form_data}




    
    if form_data:
        # Final override: ensure 'id' is the application_id for frontend consistency
        if application_id:
            form_data['id'] = application_id
            
        import json
        # Parse additional_info if exists
        if form_data.get('additional_info'):
            try:
                # Handle cases where additional_info is a string or already a dict
                if isinstance(form_data['additional_info'], str):
                    additional_info_data = json.loads(form_data['additional_info'])
                    # Merge: explicit columns overwrite additional_info catch-all
                    form_data = {**additional_info_data, **form_data}
            except json.JSONDecodeError:
                pass
        
        # Parse olevel_results specifically if it's a string
        if form_data.get('olevel_results') and isinstance(form_data['olevel_results'], str):
            try:
                form_data['olevel_results'] = json.loads(form_data['olevel_results'])
            except json.JSONDecodeError:
                pass
        
        # Return as a list with one item for compatibility with frontend expectation
        form = [form_data]
    else:
        form = []

    
    documents = Database.execute_query(
       '''SELECT 
              d.id AS document_id,
              d.document_type,
              d.file_name as original_filename,
              d.file_size,
              d.status
          FROM app_documents d
          JOIN applications a ON d.application_id = a.id
          WHERE a.user_id = %s''',
       (user_id,)
    )

    
    return jsonify({
        'form': form[0] if form else None,
        'documents': documents or []
    }), 200

@applicant_bp.route('/submit-application', methods=['POST'])
@AuthHandler.token_required
def submit_application(payload):
    """Submit completed application for review"""
    # Check if admission registration is locked
    res = Database.execute_query("SELECT value FROM system_settings WHERE key = 'admission_registration_locked'")
    if res and res[0]['value'] == 'true':
        return jsonify({'message': 'Admission registration is currently closed.'}), 403

    user_id = payload['user_id']
    data = request.get_json()
    applicant_id = data.get('applicant_id')
    
    if not applicant_id:
        return jsonify({'message': 'applicant_id is required'}), 400
    
    # Verify ownership and existence
    app_check = Database.execute_query(
        'SELECT id FROM applications WHERE id = %s AND user_id = %s',
        (applicant_id, user_id)
    )
    
    if not app_check:
        return jsonify({'message': 'Application not found or access denied'}), 404
    
    # Update application stage to 'submitted'
    success = Database.execute_update(
        "UPDATE applications SET applicant_stage = 'submitted', updated_at = NOW() WHERE id = %s AND user_id = %s",
        (applicant_id, user_id)
    )

    
    if not success:
        return jsonify({'message': 'Failed to submit application'}), 500
    
    return jsonify({
        'message': 'Application submitted successfully'
    }), 200

@applicant_bp.route('/get-applicant-status', methods=['GET'])
@AuthHandler.token_required
def get_applicant_status(payload):
    user_id = payload['user_id']

    applications = Database.execute_query(
        '''SELECT 
                app.id, 
                u.firstname || ' ' || COALESCE(u.middlename || ' ', '') || u.surname as user_name,
                app.prog_type as program_type_id,
                app.applicant_stage as application_status,
                COALESCE(asess.name, CAST(app.academic_session_id AS TEXT)) as program_session,
                app.created_at,
                app.form_no,
                pt.name as program_name,
                -- Application fee: always TRUE if record exists (paid at creation)
                TRUE as has_paid_application_fee,
                -- Acceptance fee: TRUE only if applicant_stage is 'accepted'
                (app.applicant_stage = 'accepted') as has_paid_acceptance_fee,
                COALESCE(app.admission_letter_sent, FALSE) as admission_letter_sent,
                FALSE as has_paid_tuition,
                CASE WHEN app.applicant_stage != 'started' THEN app.updated_at ELSE NULL END as submitted_at,
                CASE WHEN app.applicant_stage IN ('admitted', 'accepted') THEN 'admitted' ELSE 'pending' END as admission_status
           FROM applications app
           JOIN users u ON app.user_id = u.id
           LEFT JOIN program_types pt ON app.prog_type = pt.id
           LEFT JOIN academic_sessions asess ON app.academic_session_id = asess.id
           WHERE app.user_id = %s
           ORDER BY app.created_at DESC''',
        (user_id,)
    )

    if not applications:
        return jsonify({
            'applicants': [], 
            'applicant': None
        }), 200

    return jsonify({
        'applicants': applications,
        'applicant': applications[0]
    }), 200

@applicant_bp.route('/admission-letter', methods=['GET'])
@AuthHandler.token_required
def get_admission_letter(payload):
    """Get admission letter data for the authenticated applicant"""
    user_id = payload['user_id']

    # Get applicant details — only allow if acceptance fee has been paid (applicant_stage = 'accepted')
    applicant = Database.execute_query(
        '''SELECT app.id, u.name, app.academic_sessions, app.prog_type as program_id,
                  pt.name as program_name, pt.name as program_type_name,
                  app.applicant_stage
           FROM applications app
           JOIN users u ON app.user_id = u.id
           LEFT JOIN program_types pt ON app.prog_type = pt.id
           WHERE app.user_id = %s AND app.applicant_stage IN ('admitted', 'accepted')
           ORDER BY app.updated_at DESC
           LIMIT 1''',
        (user_id,)
    )

    if not applicant:
        return jsonify({'message': 'Admission letter not available'}), 404

    if applicant[0]['applicant_stage'] != 'accepted':
        return jsonify({'message': 'Admission letter is only available after paying the acceptance fee'}), 403

    applicant_data = applicant[0]

    # Look up program fees
    fees = Database.execute_query(
        'SELECT acceptance_fee, tuition_fee, other_fees FROM program_fees WHERE program_id = %s',
        (applicant_data['program_id'],)
    )

    acceptance_fee = 0
    tuition_fee = 0
    other_fees = 0
    if fees:
        acceptance_fee = fees[0]['acceptance_fee'] or 0
        tuition_fee = fees[0]['tuition_fee'] or 0
        other_fees = fees[0]['other_fees'] or 0

    # Get program details for letter
    program_details = Database.execute_query(
        '''SELECT f.name as faculty, d.name as department, p.level, pt.name as mode, p.session, p.resumption_date
           FROM programs p 
           LEFT JOIN departments d ON p.department_id = d.id
           LEFT JOIN faculties f ON d.faculty_id = f.id
           LEFT JOIN program_types pt ON p.program_type_id = pt.id
           WHERE p.id = %s''',
        (applicant_data['program_id'],)
    )

    # Get current academic session from academic_sessions table
    session_res = Database.execute_query("SELECT name FROM academic_sessions WHERE is_active = TRUE LIMIT 1")
    session = session_res[0]['name'] if session_res else '2025/2026'
    
    # Get semester from system settings
    semester_res = Database.execute_query("SELECT value FROM system_settings WHERE key = 'current_semester'")
    active_semester = semester_res[0]['value'] if semester_res else 'First Semester'

    if program_details:
        pd = program_details[0]
        faculty = pd['faculty'] or 'N/A'
        department = pd['department'] or 'N/A'
        level = pd['level'] or '100 Level'
        mode = pd['mode'] or 'Full-Time'
        session = pd['session'] or session
        resumption_date = pd['resumption_date'] or ''

    # Generate reference number
    ref_no = f"PCU/ADM/{datetime.now().strftime('%Y')}/{applicant_data['id']:04d}"

    return jsonify({
        'candidateName': applicant_data['name'],
        'programme': applicant_data['program_name'] or '',
        'level': level,
        'department': department,
        'faculty': faculty,
        'session': session,
        'mode': mode,
        'date': datetime.now().strftime('%d %B, %Y'),
        'resumptionDate': resumption_date,
        'acceptanceFee': f"₦{acceptance_fee:,.2f}",
        'tuition': f"₦{tuition_fee:,.2f}",
        'otherFees': f"₦{other_fees:,.2f}",
        'reference': ref_no
    }), 200
@applicant_bp.route('/print-admission-letter', methods=['POST'])
@AuthHandler.token_required
def print_admission_letter(payload):
    """Generate and download admission letter as PDF"""
    user_id = payload['user_id']

    # Get applicant details
    applicant = Database.execute_query(
        '''SELECT app.id, u.name, app.prog_type as program_id, pt.name as program_name
           FROM applications app
           JOIN users u ON app.user_id = u.id
           LEFT JOIN program_types pt ON app.prog_type = pt.id
           WHERE app.user_id = %s AND app.applicant_stage = 'admitted'
           ORDER BY app.updated_at DESC
           LIMIT 1''',
        (user_id,)
    )

    if not applicant:
        return jsonify({'message': 'Admission letter not available'}), 404

    applicant_data = applicant[0]

    # Look up program fees
    fees = Database.execute_query(
        'SELECT acceptance_fee, tuition_fee, other_fees FROM program_fees WHERE program_id = %s',
        (applicant_data['program_id'],)
    )

    acceptance_fee_str = ''
    tuition_fee_str = ''
    other_fees_str = ''
    if fees:
        acceptance_fee = fees[0]['acceptance_fee'] or 0
        tuition_fee = fees[0]['tuition_fee'] or 0
        other_fees = fees[0]['other_fees'] or 0
        acceptance_fee_str = f"₦{acceptance_fee:,.2f}"
        tuition_fee_str = f"₦{tuition_fee:,.2f}"
        other_fees_str = f"₦{other_fees:,.2f}"

    # Get program details for letter
    program_details = Database.execute_query(
        '''SELECT f.name as faculty, d.name as department, p.level, pt.name as mode, p.session, p.resumption_date
           FROM programs p 
           LEFT JOIN departments d ON p.department_id = d.id
           LEFT JOIN faculties f ON d.faculty_id = f.id
           LEFT JOIN program_types pt ON p.program_type_id = pt.id
           WHERE p.id = %s''',
        (applicant_data['program_id'],)
    )

    # Get current academic session from academic_sessions table
    session_res = Database.execute_query("SELECT name FROM academic_sessions WHERE is_active = TRUE LIMIT 1")
    session = session_res[0]['name'] if session_res else '2025/2026'

    if program_details:
        pd = program_details[0]
        faculty = pd['faculty'] or 'N/A'
        department = pd['department'] or 'N/A'
        level = pd['level'] or '100 Level'
        mode = pd['mode'] or 'Full-Time'
        session = pd['session'] or session
        resumption_date = pd['resumption_date'] or ''

    # Generate reference number
    ref_no = f"PCU/ADM/{datetime.now().strftime('%Y')}/{applicant_data['id']:04d}"

    # Generate PDF
    pdf_bytes = PDFGenerator.generate_admission_letter_pdf(
        candidateName=applicant_data['name'],
        programme=applicant_data['program_name'] or '',
        level=level,
        department=department,
        faculty=faculty,
        session=session,
        mode=mode,
        date=datetime.now().strftime('%d %B, %Y'),
        acceptanceFee=acceptance_fee_str,
        tuition=tuition_fee_str,
        otherFees=other_fees_str,
        resumptionDate=resumption_date,
        reference=ref_no,
        body_html=''
    )

    # Return PDF as downloadable file
    return Response(
        pdf_bytes,
        mimetype='application/pdf',
        headers={'Content-Disposition': f'attachment;filename=admission_letter_{applicant_data["id"]}.pdf'}
    )

@applicant_bp.route('/acceptance-fee', methods=['GET'])
@AuthHandler.token_required
def get_acceptance_fee(payload):
    """Get acceptance fee amount for the admitted applicant's program type"""
    user_id = payload['user_id']

    # Get applicant's program type from their admitted application
    app_res = Database.execute_query(
        """SELECT prog_type FROM applications 
           WHERE user_id = %s AND applicant_stage IN ('admitted', 'accepted') 
           ORDER BY updated_at DESC LIMIT 1""",
        (user_id,)
    )

    if not app_res:
        return jsonify({'acceptance_fee': 0, 'found': False}), 200

    prog_type = str(app_res[0]['prog_type'])

    # Look up acceptance fee: fee_component_id=7 (Acceptance Fee) + program_type match
    fee_res = Database.execute_query(
        """SELECT pf.amount, fc.name as fee_name
           FROM program_fees pf
           JOIN fee_components fc ON fc.id = pf.fee_component_id
           WHERE pf.fee_component_id = 7
             AND pf.program_type = %s
             AND pf.academic_sessions_id = (SELECT id FROM academic_sessions WHERE is_active = TRUE LIMIT 1)
           LIMIT 1""",
        (prog_type,)
    )

    # Fallback: any acceptance fee row if no program-type-specific match
    if not fee_res:
        fee_res = Database.execute_query(
            """SELECT pf.amount, fc.name as fee_name
               FROM program_fees pf
               JOIN fee_components fc ON fc.id = pf.fee_component_id
               WHERE pf.fee_component_id = 7
                 AND pf.academic_session_id = (SELECT id FROM academic_sessions WHERE is_active = TRUE LIMIT 1)
               LIMIT 1""",
            ()
        )

    amount = float(fee_res[0]['amount']) if fee_res else 40000.0  # sensible default
    fee_name = fee_res[0]['fee_name'] if fee_res else 'Acceptance Fee'

    return jsonify({
        'acceptance_fee': amount,
        'fee_name': fee_name,
        'program_type_id': prog_type,
        'found': bool(fee_res)
    }), 200


def generate_reference_no():
    """Generate a hard-to-guess reference number: REF-{DATE}-{RANDOM_HEX}"""
    date_str = date.today().strftime('%Y%m%d')
    random_hex = secrets.token_hex(8)  # 16 hex characters
    return f"REF-{date_str}-{random_hex.upper()}"


def generate_receipt_no():
    """Generate a hard-to-guess receipt number: pcu-{DATE}-{RANDOM_HEX}"""
    date_str = date.today().strftime('%Y%m%d')
    random_hex = secrets.token_hex(8)  # 16 hex characters
    return f"pcu-{date_str}-{random_hex.upper()}"


@applicant_bp.route('/process-payment', methods=['POST'])
@AuthHandler.token_required
def process_payment(payload):
    """Process and save payment transaction"""
    user_id = payload['user_id']
    data = request.get_json()
    
    # Validate required fields
    required_fields = ['payment_type', 'amount']
    if not all(field in data for field in required_fields):
        return jsonify({'message': 'Missing required fields: payment_type, amount'}), 400
    
    payment_type = data.get('payment_type')
    amount = float(data.get('amount', 0))
    payment_method = data.get('payment_method', 'online')
    status = data.get('status', 'completed')
    app_type_req = data.get('app_type')
    program_type_id = data.get('program_type_id')
    fee_component_id = data.get('fee_component_id')
    installment_plan_id = data.get('installment_plan_id')
    
    # Validate payment type
    if payment_type not in ['application_fee', 'acceptance_fee', 'tuition']:
        return jsonify({'message': 'Invalid payment_type. Must be application_fee, acceptance_fee or tuition'}), 400
    
    # Ensure installment_plan_id is only used for tuition
    if payment_type != 'tuition':
        installment_plan_id = None
    
    if amount < 0:
        return jsonify({'message': 'Amount cannot be negative'}), 400
    
    # Fetch active academic session ID and name
    session_res = Database.execute_query("SELECT id, name FROM academic_sessions WHERE is_active = TRUE LIMIT 1")
    if not session_res:
        return jsonify({'message': 'No active academic session found in system.'}), 500
    
    current_session_id = session_res[0]['id']
    current_session_name = session_res[0]['name']
    
    # Check if this is a new application payment
    if status == 'completed' and payment_type == 'application_fee' and program_type_id:
        # Check if application already exists for this user and program type in current session
        existing_app = Database.execute_query(
            'SELECT id FROM applications WHERE user_id = %s AND prog_type = %s AND academic_session_id = %s',
            (user_id, program_type_id, current_session_id)
        )
        
        if not existing_app:
            # Generate a unique form number: PCU/YEAR/RANDOM
            year = datetime.now().year
            random_suffix = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))
            form_no = f"PCU/{year}/{random_suffix}"
            
            Database.execute_update(
                '''INSERT INTO applications (user_id, form_no, prog_type, academic_session_id, applicant_stage)
                   VALUES (%s, %s, %s, %s, %s)''',
                (user_id, form_no, program_type_id, current_session_id, 'started')
            )

    # Determine transaction success
    is_successful = status == 'completed'

    # Create or Update payment transaction record
    try:
        # Generate unique reference and receipt numbers
        reference_no = generate_reference_no()
        receipt_no = generate_receipt_no()
        
        # Insert payment transaction with new schema
        success = Database.execute_update(
            '''INSERT INTO payment_transactions 
               (user_id, fee_component_id, academic_session_id, installment_plan_id, 
                amount, pay_details, reference_no, receipt_no, tran_status, tran_type, 
                client_name, is_successful, created_at, updated_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())''',
            (user_id, fee_component_id, 
             current_session_id,
             installment_plan_id,
             amount, app_type_req or 'N/A', reference_no, receipt_no, 
             status, payment_type, data.get('client_name') or 'N/A', is_successful)
        )
        
        if not success:
            return jsonify({'message': 'Failed to save payment transaction'}), 500
            
        if is_successful and payment_type == 'application_fee':
            Database.execute_update(
                "UPDATE users SET user_type_id = 2, updated_at = NOW() WHERE id = %s",
                (user_id,)
            )

        # If acceptance fee paid, advance applicant_stage from 'admitted' → 'accepted'
        if is_successful and payment_type == 'acceptance_fee':
            Database.execute_update(
                """UPDATE applications
                   SET applicant_stage = 'accepted', updated_at = NOW()
                   WHERE user_id = %s AND applicant_stage = 'admitted'""",
                (user_id,)
            )
        
        return jsonify({
            'message': 'Payment processed successfully',
            'reference_no': reference_no,
            'receipt_no': receipt_no,
            'payment_type': payment_type,
            'amount': amount,
            'is_successful': is_successful,
            'created_at': datetime.now().isoformat(),
            'upgraded_to_student': False,
            'initial_password': None
        }), 200
    
    except Exception as e:
        print(f"Payment processing error: {e}")
        return jsonify({'message': 'Error processing payment'}), 500

@applicant_bp.route('/payment-receipt/<receipt_no>', methods=['GET'])
@AuthHandler.token_required
def get_payment_receipt(payload, receipt_no):
    """Download payment receipt as PDF"""
    user_id = payload['user_id']
    
    # Get transaction and verify ownership
    transaction = Database.execute_query(
        '''SELECT pt.id, pt.user_id, pt.tran_type, pt.amount, pt.created_at, 
                  pt.reference_no, pt.receipt_no, pt.client_name
           FROM payment_transactions pt
           WHERE pt.receipt_no = %s AND pt.user_id = %s''',
        (receipt_no, user_id)
    )
    
    if not transaction:
        return jsonify({'message': 'Payment receipt not found'}), 404
    
    trans_data = transaction[0]
    
    # Get user and program info
    user = Database.execute_query(
        '''SELECT u.name
           FROM users u
           WHERE u.id = %s
           LIMIT 1''',
        (user_id,)
    )
    
    if not user:
        return jsonify({'message': 'User not found'}), 404
    
    user_data = user[0]
    
    # Generate PDF receipt
    receipt_id = trans_data['receipt_no']
    payment_date = trans_data['created_at'].strftime('%d %B %Y') if trans_data['created_at'] else datetime.now().strftime('%d %B %Y')
    
    pdf_bytes = PaymentReceiptGenerator.generate_payment_receipt_pdf(
        receipt_id=receipt_id,
        applicant_name=user_data['name'],
        program_name=trans_data['client_name'] or 'N/A',
        payment_type=trans_data['tran_type'],
        amount=float(trans_data['amount']),
        payment_date=payment_date,
        reference_number=trans_data['reference_no'] or '',
        payment_method='Online',
        currency='NGN'
    )
    
    return Response(
        pdf_bytes,
        mimetype='application/pdf',
        headers={'Content-Disposition': f'attachment;filename=payment_receipt_{receipt_id}.pdf'}
    )

@applicant_bp.route('/medical-form', methods=['GET'])
@AuthHandler.token_required
def get_medical_form(payload):
    """Download medical examination form as PDF"""
    user_id = payload['user_id']
    
    # Get applicant and verify document download eligibility
    applicant = Database.execute_query(
        '''SELECT app.id, u.name, pt.name as program_name,
                  TRUE as has_paid_acceptance_fee, TRUE as has_paid_tuition
           FROM applications app
           JOIN users u ON app.user_id = u.id
           LEFT JOIN program_types pt ON app.prog_type = pt.id
           WHERE app.user_id = %s
           ORDER BY app.updated_at DESC
           LIMIT 1''',
        (user_id,)
    )
    
    if not applicant:
        return jsonify({'message': 'Applicant record not found'}), 404
        
    app_data = applicant[0]
    
    if not app_data['has_paid_acceptance_fee'] or not app_data['has_paid_tuition']:
        return jsonify({'message': 'Please complete acceptance and tuition payments to download this form'}), 403
    
    # Try to serve the official PDF file from data folder
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    medical_form_path = os.path.join(base_dir, 'data', "PCU STUDENTS' MEDICAL REPORT FORM_ (1) - Copy.pdf")
    
    if os.path.exists(medical_form_path):
        with open(medical_form_path, 'rb') as f:
            pdf_bytes = f.read()
        filename = "pcu_medical_report_form.pdf"
    else:
        # Fallback to generated one if file is missing
        pdf_bytes = MedicalFormGenerator.generate_medical_form_pdf(
            applicant_name=app_data['name'],
            program_name=app_data['program_name'] or 'N/A',
            applicant_id=app_data['id']
        )
        filename = f"medical_form_{app_data['id']}.pdf"
    
    return Response(
        pdf_bytes,
        mimetype='application/pdf',
        headers={'Content-Disposition': f'attachment;filename={filename}'}
    )

@applicant_bp.route('/admission-notice', methods=['GET'])
@AuthHandler.token_required
def get_admission_notice(payload):
    """Download official admission notice as PDF"""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    file_path = os.path.join(base_dir, 'data', "PCU NOTICE TO CANDIDATES OFFERED PROVISIONAL ADMISSION 2025.pdf")
    
    if os.path.exists(file_path):
        with open(file_path, 'rb') as f:
            pdf_bytes = f.read()
        return Response(
            pdf_bytes,
            mimetype='application/pdf',
            headers={'Content-Disposition': 'attachment;filename=pcu_admission_notice_2025.pdf'}
        )
    return jsonify({'message': 'Notice file not found'}), 404

@applicant_bp.route('/affidavit-form', methods=['GET'])
@AuthHandler.token_required
def get_affidavit_form(payload):
    """Download official affidavit form as PDF"""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    file_path = os.path.join(base_dir, 'data', "PCU AFFIDAVIT FOR GOOD CONDUCT - Copy.pdf")
    
    if os.path.exists(file_path):
        with open(file_path, 'rb') as f:
            pdf_bytes = f.read()
        return Response(
            pdf_bytes,
            mimetype='application/pdf',
            headers={'Content-Disposition': 'attachment;filename=pcu_affidavit_for_good_conduct.pdf'}
        )
    return jsonify({'message': 'Affidavit file not found'}), 404

@applicant_bp.route('/payment-history', methods=['GET'])
@AuthHandler.token_required
def get_payment_history(payload):
    """Get payment history for the user"""
    user_id = payload['user_id']

    # Get payment history using new schema
    transactions = Database.execute_query(
        '''SELECT pt.id, pt.tran_type, pt.amount, pt.is_successful, pt.reference_no, pt.receipt_no, 
                  pt.created_at, pt.client_name
           FROM payment_transactions pt
           WHERE pt.user_id = %s
           ORDER BY pt.created_at DESC''',
        (user_id,)
    )
    
    # Format transactions
    formatted_transactions = []
    for trans in (transactions or []):
        formatted_transactions.append({
            'transaction_id': trans['id'],
            'payment_type': trans['tran_type'],
            'amount': float(trans['amount']),
            'is_successful': trans['is_successful'],
            'reference_no': trans['reference_no'],
            'receipt_no': trans['receipt_no'],
            'created_at': trans['created_at'].isoformat() if trans['created_at'] else None,
            'client_name': trans['client_name'] or 'N/A'
        })
    
    return jsonify({
        'payment_history': formatted_transactions,
        'total_payments': len(formatted_transactions)
    }), 200

@applicant_bp.route('/get-recommendations', methods=['GET'])
@AuthHandler.token_required
def get_recommendations(payload):
    """Get recommended courses for the applicant"""
    user_id = payload['user_id']
    
    application = Database.execute_query(
        'SELECT id FROM applications WHERE user_id = %s ORDER BY created_at DESC LIMIT 1',
        (user_id,)
    )
    
    if not application:
        return jsonify({'message': 'Application record not found'}), 404
    
    application_id = application[0]['id']
    
    # Get all reviews with recommendations for this application
    recommendations = Database.execute_query(
        '''SELECT ar.id, ar.review_notes, ar.recommended_program_id, p.name as program_name,
                  ar.reviewed_at, ar.reviewed_by, u.name as reviewed_by_name,
                  ar.recommended_course_response, ar.accepted_recommended_program_id
           FROM application_reviews ar
           LEFT JOIN programs p ON ar.recommended_program_id = p.id
           LEFT JOIN users u ON ar.reviewed_by = u.id
           WHERE ar.application_id = %s AND ar.recommendation = %s''',
        (application_id, 'recommend_other_program')
    )
    
    # Format recommendations
    formatted_recommendations = []
    for rec in (recommendations or []):
        formatted_recommendations.append({
            'review_id': rec['id'],
            'program_id': rec['recommended_program_id'],
            'program_name': rec['program_name'],
            'review_notes': rec['review_notes'],
            'reviewed_by': rec['reviewed_by_name'],
            'reviewed_at': rec['reviewed_at'].isoformat() if rec['reviewed_at'] else None,
            'response': rec['recommended_course_response'],
            'is_accepted': rec['accepted_recommended_program_id'] == rec['recommended_program_id'] if rec['accepted_recommended_program_id'] else None
        })
    
    return jsonify({
        'recommendations': formatted_recommendations,
        'total_recommendations': len(formatted_recommendations)
    }), 200

@applicant_bp.route('/respond-to-recommendation', methods=['POST'])
@AuthHandler.token_required
def respond_to_recommendation(payload):
    """Accept or decline a recommended course"""
    user_id = payload['user_id']
    data = request.get_json()
    
    if not data or 'review_id' not in data or 'response' not in data:
        return jsonify({'message': 'review_id and response are required'}), 400
    
    review_id = data['review_id']
    response = data['response']  # 'accepted' or 'declined'
    
    if response not in ['accepted', 'declined']:
        return jsonify({'message': 'response must be either "accepted" or "declined"'}), 400
    
    # Verify ownership and get review details
    application = Database.execute_query(
        'SELECT id FROM applications WHERE user_id = %s ORDER BY created_at DESC LIMIT 1',
        (user_id,)
    )
    
    if not application:
        return jsonify({'message': 'Application record not found'}), 404
    
    applicant_id = application[0]['id']
    
    # Get the review to verify it exists and get program details
    review = Database.execute_query(
        '''SELECT ar.id, ar.application_id, ar.recommended_program_id
           FROM application_reviews ar
           WHERE ar.id = %s AND ar.application_id = %s''',
        (review_id, applicant_id)
    )
    
    if not review:
        return jsonify({'message': 'Review not found'}), 404
    
    recommended_program_id = review[0]['recommended_program_id']
    
    try:
        # Mock success for now, will be migrated to applications table
        success = True
        
        if not success:
            return jsonify({'message': 'Failed to save response'}), 500
        
        return jsonify({
            'message': f'Recommendation {response} successfully',
            'applicant_id': applicant_id,
            'response': response
        }), 200
    
    except Exception as e:
        print(f"Error processing recommendation response: {e}")
        return jsonify({'message': 'Error processing response'}), 500
