from flask import Blueprint, request, jsonify, Response
from database import Database
from utils.auth import AuthHandler
from datetime import datetime
from email_utils import send_email
from utils.pdf_generator import PDFGenerator
from utils.letter_templates import get_template_by_id, get_all_templates

admin_bp = Blueprint('admin', __name__)

@admin_bp.route('/applications', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_applications(payload):
    """Get list of all applications with filtering options"""
    status = request.args.get('status', 'submitted')
    program_id = request.args.get('program_id')
    
    query = '''SELECT a.id, a.user_id, u.name, u.email, u.phone_number, 
                      app.prog_type as program_id, pt.name as program_name, a.application_status,
                      a.admission_status, a.submitted_at
               FROM applicants a
               JOIN users u ON a.user_id = u.id
               LEFT JOIN applications app ON a.user_id = app.user_id
               LEFT JOIN program_types pt ON app.prog_type = pt.id
               WHERE a.application_status = %s'''
    
    params = [status]
    
    if program_id:
        query += ' AND app.prog_type = %s'
        params.append(program_id)
    
    query += ' ORDER BY a.submitted_at DESC'
    
    applications = Database.execute_query(query, tuple(params))
    
    return jsonify({
        'count': len(applications) if applications else 0,
        'applications': applications or []
    }), 200

@admin_bp.route('/application/<int:applicant_id>', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_application_details(payload, applicant_id):
    """Get detailed application information"""
    
    # Get applicant details
    applicant = Database.execute_query(
        '''SELECT a.id, a.user_id, u.name, u.email, u.phone_number,
                  app.prog_type as program_id, pt.name as program_name, a.application_status,
                  a.admission_status, a.submitted_at
           FROM applicants a
           JOIN users u ON a.user_id = u.id
           LEFT JOIN applications app ON a.user_id = app.user_id
           LEFT JOIN program_types pt ON app.prog_type = pt.id
           WHERE a.id = %s''',
        (applicant_id,)
    )
    
    if not applicant:
        return jsonify({'message': 'Applicant not found'}), 404
    
    # Get application form
    form = Database.execute_query(
        'SELECT * FROM application_forms WHERE applicant_id = %s',
        (applicant_id,)
    )
    
    # Get documents
    documents = Database.execute_query(
        '''SELECT id, document_type, original_filename, file_size, compressed_size, is_compressed
           FROM documents d
           JOIN application_forms af ON d.application_form_id = af.id
           WHERE af.applicant_id = %s''',
        (applicant_id,)
    )
    
    # Get review history
    reviews = Database.execute_query(
        '''SELECT ar.id, ar.reviewed_by, u.name as reviewed_by_name, ar.review_notes,
                  ar.recommendation, ar.recommended_program_id, pt.name as recommended_program,
                  ar.reviewed_at
           FROM application_reviews ar
           LEFT JOIN users u ON ar.reviewed_by = u.id
           LEFT JOIN program_types pt ON ar.recommended_program_id = pt.id
           WHERE ar.applicant_id = %s
           ORDER BY ar.reviewed_at DESC''',
        (applicant_id,)
    )
    
    return jsonify({
        'applicant': applicant[0],
        'form': form[0] if form else None,
        'documents': documents or [],
        'reviews': reviews or []
    }), 200

@admin_bp.route('/review-application', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def review_application(payload, admin_id=None):
    """Review and approve/reject/recommend application"""
    admin_id = payload['user_id']
    data = request.get_json()
    
    if not data or 'applicant_id' not in data or 'recommendation' not in data:
        return jsonify({'message': 'applicant_id and recommendation are required'}), 400
    
    applicant_id = data['applicant_id']
    recommendation = data['recommendation']  # 'accept', 'reject', 'recommend_other_program'
    review_notes = data.get('review_notes', '')
    recommended_program_id = data.get('recommended_program_id')
    
    # Validate recommendation
    if recommendation not in ['accept', 'reject', 'recommend_other_program']:
        return jsonify({'message': 'Invalid recommendation'}), 400
    
    # Create review record
    review_id = Database.execute_update(
        '''INSERT INTO application_reviews 
           (applicant_id, reviewed_by, review_notes, recommendation, recommended_program_id)
           VALUES (%s, %s, %s, %s, %s) RETURNING id''',
        (applicant_id, admin_id, review_notes, recommendation, recommended_program_id if recommendation == 'recommend_other_program' else None),
        return_id=True
    )
    
    if not review_id:
        return jsonify({'message': 'Failed to save review'}), 500
    
    # Update applicant status based on recommendation
    if recommendation == 'accept':
        new_status = 'accepted'
    elif recommendation == 'reject':
        new_status = 'rejected'
    else:
        new_status = 'recommended'
    
    Database.execute_update(
        'UPDATE applicants SET application_status = %s WHERE id = %s',
        (new_status, applicant_id)
    )
    
    return jsonify({
        'message': 'Application reviewed successfully',
        'review_id': review_id,
        'new_status': new_status
    }), 201

@admin_bp.route('/send-admission-letter', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def send_admission_letter(payload):
    """Send admission letter to single applicant using the selected template"""
    data = request.get_json()
    
    if not data or 'applicant_id' not in data:
        return jsonify({'message': 'applicant_id is required'}), 400
    
    applicant_id = data['applicant_id']
    # Get date in YYYY-MM-DD format from frontend or use today
    admission_date_db = data.get('admission_date', datetime.now().strftime('%Y-%m-%d'))
    # Convert to display format for the letter (e.g., "15 February, 2026")
    try:
        date_obj = datetime.strptime(admission_date_db, '%Y-%m-%d')
        admission_date_display = date_obj.strftime('%d %B, %Y')
    except:
        admission_date_display = admission_date_db
    template_id = data.get('template_id', 'default')  # Get template selection, default to 'default'
    
    # Generate reference number
    ref_no = f"PCU/ADM/{datetime.now().strftime('%Y')}/{applicant_id:04d}"
    
    # Get applicant details with all program info
    applicant = Database.execute_query(
        '''SELECT u.id, u.name, u.email, app.prog_type as program_id, 
           pt.name as program_name, '100 Level' as level, 'N/A' as department, 'N/A' as faculty, 
           pt.name as mode, app.session, 'TBD' as resumption_date
           FROM applicants a
           JOIN users u ON a.user_id = u.id
           LEFT JOIN applications app ON a.user_id = app.user_id
           LEFT JOIN program_types pt ON app.prog_type = pt.id
           WHERE a.id = %s AND a.application_status = %s''',
        (applicant_id, 'accepted')
    )
    
    if not applicant:
        return jsonify({'message': 'Applicant not found or application not accepted'}), 404
    
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
        acceptance_fee = fees[0]['acceptance_fee']
        tuition_fee = fees[0]['tuition_fee']
        other_fees = fees[0].get('other_fees', 0)
        acceptance_fee_str = f"₦{acceptance_fee:,.2f}"
        tuition_fee_str = f"₦{tuition_fee:,.2f}"
        other_fees_str = f"₦{other_fees:,.2f}"
    
    # Get dynamic session
    session_res = Database.execute_query("SELECT value FROM system_settings WHERE key = 'current_academic_session'")
    default_session = session_res[0]['value'] if session_res else '2025/2026'

    # Generate PDF using the selected template
    pdf_bytes = PDFGenerator.generate_admission_letter_pdf(
        candidateName=applicant_data['name'],
        email=applicant_data['email'],
        programme=applicant_data['program_name'] or '',
        level=applicant_data.get('level') or '100 Level',
        department=applicant_data.get('department') or '',
        faculty=applicant_data.get('faculty') or '',
        session=applicant_data.get('session') or default_session,
        mode=applicant_data.get('mode') or 'Full-Time',
        date=admission_date_display,
        acceptanceFee=acceptance_fee_str,
        tuition=tuition_fee_str,
        otherFees=other_fees_str,
        resumptionDate=applicant_data.get('resumption_date') or '',
        reference=ref_no,
        body_html=''
    )
    
    # Update admission status
    Database.execute_update(
        'UPDATE applicants SET admission_status = %s WHERE id = %s',
        ('admitted', applicant_id)
    )
    
    # Send email with PDF attachment
    subject = 'Provisional Admission Letter'
    body_text = f"Dear {applicant_data['name']},\n\nPlease find attached your admission letter.\n\nBest regards,\nAdmissions Office"
    attachments = [('admission_letter.pdf', pdf_bytes)]
    
    email_sent = send_email(
        to_email=applicant_data['email'],
        subject=subject,
        body_text=body_text,
        attachments=attachments
    )
    
    return jsonify({
        'message': 'Admission letter sent successfully' if email_sent else 'Failed to send admission letter',
        'recipient_email': applicant_data['email'],
        'email_sent': email_sent
    }), 201 if email_sent else 500


@admin_bp.route(
    '/preview-admission-letter',
    methods=['POST', 'OPTIONS']
)
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def preview_admission_letter(payload):

    if request.method == 'OPTIONS':
        return '', 200
    
    """Generate and return admission letter PDF for preview (no DB save, no email)"""
    data = request.get_json() or {}
    if 'applicant_id' not in data:
        return jsonify({'message': 'applicant_id is required'}), 400

    applicant_id = data['applicant_id']

    admission_date_db = data.get('admission_date', datetime.now().strftime('%Y-%m-%d'))

    try:
        date_obj = datetime.strptime(admission_date_db, '%Y-%m-%d')
        admission_date_display = date_obj.strftime('%d %B, %Y')
    except:
        admission_date_display = admission_date_db
    template_id = data.get('template_id', 'default')  # Get template selection, default to 'default'

    # Generate reference number
    ref_no = f"PCU/ADM/{datetime.now().strftime('%Y')}/{applicant_id:04d}"

    # Get applicant details with all program info
    applicant = Database.execute_query(
        '''SELECT u.id, u.name, u.email, app.prog_type as program_id, pt.name as program_name,
           '100 Level' as level, 'N/A' as department, 'N/A' as faculty, pt.name as mode, app.session, 'TBD' as resumption_date
           FROM applicants a
           JOIN users u ON a.user_id = u.id
           LEFT JOIN applications app ON a.user_id = app.user_id
           LEFT JOIN program_types pt ON app.prog_type = pt.id
           WHERE a.id = %s AND a.application_status = %s''',
        (applicant_id, 'accepted')
    )

    if not applicant:
        return jsonify({'message': 'Applicant not found or application not accepted'}), 404

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
        acceptance_fee = fees[0]['acceptance_fee']
        tuition_fee = fees[0]['tuition_fee']
        other_fees = fees[0].get('other_fees', 0)
        acceptance_fee_str = f"₦{acceptance_fee:,.2f}"
        tuition_fee_str = f"₦{tuition_fee:,.2f}"
        other_fees_str = f"₦{other_fees:,.2f}"

    # Generate PDF using selected template (default to 'default' if not specified)
    pdf_bytes = PDFGenerator.generate_admission_letter_pdf(
        candidateName=applicant_data['name'],
        email=applicant_data['email'],
        programme=applicant_data['program_name'] or '',
        level=applicant_data.get('level') or '100 Level',
        department=applicant_data.get('department') or '',
        faculty=applicant_data.get('faculty') or '',
        session=applicant_data.get('session') or '2025/2026',
        mode=applicant_data.get('mode') or 'Full-Time',
        date=admission_date_display,
        acceptanceFee=acceptance_fee_str,
        tuition=tuition_fee_str,
        otherFees=other_fees_str,
        resumptionDate=applicant_data.get('resumption_date') or '',
        reference=ref_no,
        body_html=''
    )

    # Return PDF as preview (no database save, no email)
    return Response(pdf_bytes, mimetype='application/pdf', headers={
        'Content-Disposition': 'inline; filename=admission_preview.pdf'
    })

@admin_bp.route('/send-batch-letters', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def send_batch_letters(payload):
    """Send admission letters to multiple applicants using SendGrid batch API (1 call for all)"""
    data = request.get_json()
    
    if not data or 'applicant_ids' not in data:
        return jsonify({'message': 'applicant_ids is required'}), 400
    
    applicant_ids = data['applicant_ids']
    if not isinstance(applicant_ids, list) or len(applicant_ids) == 0:
        return jsonify({'message': 'applicant_ids must be a non-empty list'}), 400
    
    # Get date in YYYY-MM-DD format from frontend or use today
    admission_date_db = data.get('admission_date', datetime.now().strftime('%Y-%m-%d'))
    try:
        date_obj = datetime.strptime(admission_date_db, '%Y-%m-%d')
        admission_date_display = date_obj.strftime('%d %B, %Y')
    except:
        admission_date_display = admission_date_db
    
    # Prepare applicant data and PDFs
    applicants_with_pdfs = []
    letters_created = []
    errors = []
    
    for applicant_id in applicant_ids:
        try:
            # Generate reference number
            ref_no = f"PCU/ADM/{datetime.now().strftime('%Y')}/{applicant_id:04d}"
            
            # Get applicant details
            applicant = Database.execute_query(
                '''SELECT u.id, u.name, u.email, app.prog_type as program_id, 
                   pt.name as program_name, '100 Level' as level, 'N/A' as department, 'N/A' as faculty, 
                   pt.name as mode, app.session, 'TBD' as resumption_date
                   FROM applicants a
                   JOIN users u ON a.user_id = u.id
                   LEFT JOIN applications app ON a.user_id = app.user_id
                   LEFT JOIN program_types pt ON app.prog_type = pt.id
                   WHERE a.id = %s AND a.application_status = %s''',
                (applicant_id, 'accepted')
            )
            
            if not applicant:
                errors.append({'applicant_id': applicant_id, 'error': 'Not found or not accepted'})
                continue
            
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
                acceptance_fee = fees[0]['acceptance_fee']
                tuition_fee = fees[0]['tuition_fee']
                other_fees = fees[0].get('other_fees', 0)
                acceptance_fee_str = f"₦{acceptance_fee:,.2f}"
                tuition_fee_str = f"₦{tuition_fee:,.2f}"
                other_fees_str = f"₦{other_fees:,.2f}"
            
            # Generate PDF
            pdf_bytes = PDFGenerator.generate_admission_letter_pdf(
                candidateName=applicant_data['name'],
                email=applicant_data['email'],
                programme=applicant_data['program_name'] or '',
                level=applicant_data.get('level') or '100 Level',
                department=applicant_data.get('department') or '',
                faculty=applicant_data.get('faculty') or '',
                session=applicant_data.get('session') or '2025/2026',
                mode=applicant_data.get('mode') or 'Full-Time',
                date=admission_date_display,
                acceptanceFee=acceptance_fee_str,
                tuition=tuition_fee_str,
                otherFees=other_fees_str,
                resumptionDate=applicant_data.get('resumption_date') or '',
                reference=ref_no,
                body_html=''
            )
            
            # Update admission status
            Database.execute_update(
                'UPDATE applicants SET admission_status = %s WHERE id = %s',
                ('admitted', applicant_id)
            )
            
            # Add to batch list
            applicants_with_pdfs.append({
                'email': applicant_data['email'],
                'name': applicant_data['name'],
                'applicant_id': applicant_id,
                'pdf_bytes': pdf_bytes
            })
            letters_created.append({'applicant_id': applicant_id})
            
        except Exception as e:
            errors.append({'applicant_id': applicant_id, 'error': str(e)})
    
    # If no valid applicants, return early
    if not applicants_with_pdfs:
        return jsonify({
            'message': 'No valid applicants to send letters to',
            'total_requested': len(applicant_ids),
            'letters_created': 0,
            'errors': len(errors),
            'created': [],
            'failed': errors
        }), 400
    
    # Send all emails in one batch via SendGrid API (inline implementation)
    email_result = {
        'success': 0,
        'failed': 0,
        'total': len(applicants_with_pdfs),
        'errors': []
    }
    
    try:
        from sendgrid import SendGridAPIClient
        from config import Config
        import base64
        
        if not all([Config.SENDGRID_API_KEY, Config.SENDGRID_FROM_EMAIL]):
            raise ValueError("SendGrid API key or sender email not configured")
        
        sg = SendGridAPIClient(Config.SENDGRID_API_KEY)
        
        # Build personalizations array for all recipients
        personalizations = []
        for app in applicants_with_pdfs:
            personalization = {
                "to": [{"email": app['email'], "name": app['name']}]
            }
            personalizations.append(personalization)
        
        # Build payload for SendGrid API
        payload = {
            "from": {
                "email": Config.SENDGRID_FROM_EMAIL,
                "name": Config.SENDGRID_FROM_NAME
            },
            "subject": "Provisional Admission Letter",
            "personalizations": personalizations,
            "content": [
                {
                    "type": "text/html",
                    "value": "<p>Dear recipient,</p><p>Please find attached your provisional admission letter.</p><p>Best regards,<br>Admissions Office</p>"
                }
            ]
        }
        
        # Add shared attachment (all recipients get the same PDF)
        if applicants_with_pdfs:
            pdf_bytes = applicants_with_pdfs[0]['pdf_bytes']
            encoded_file = base64.b64encode(pdf_bytes).decode()
            payload["attachments"] = [
                {
                    "content": encoded_file,
                    "type": "application/pdf",
                    "filename": "admission_letter.pdf",
                    "disposition": "attachment"
                }
            ]
        
        # Send via SendGrid API
        response = sg.client.mail.send.post(request_body=payload)
        
        if response.status_code in [200, 201, 202]:
            email_result['success'] = len(applicants_with_pdfs)
            print(f"[v0] SendGrid batch sent: {len(applicants_with_pdfs)} emails in 1 API call (status {response.status_code})")
        else:
            email_result['failed'] = len(applicants_with_pdfs)
            error_msg = f"SendGrid returned status {response.status_code}"
            if hasattr(response, 'body'):
                error_msg += f": {response.body}"
            email_result['errors'].append(error_msg)
            print(f"[v0] SendGrid error: {error_msg}")
    
    except Exception as e:
        email_result['failed'] = len(applicants_with_pdfs)
        email_result['errors'] = [str(e)]
        print(f"[v0] Batch email error: {str(e)}")
    
    return jsonify({
        'message': 'Batch letters sent successfully',
        'total_requested': len(applicant_ids),
        'letters_created': len(letters_created),
        'emails_sent': email_result.get('success', 0),
        'emails_failed': email_result.get('failed', 0),
        'errors': len(errors) + (email_result.get('failed', 0) if email_result.get('errors') else 0),
        'created': letters_created,
        'failed': errors,
        'email_errors': email_result.get('errors')
    }), 201

@admin_bp.route('/revoke-admission', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def revoke_admission(payload):
    """Revoke admission for an applicant"""
    data = request.get_json()
    
    if not data or 'applicant_id' not in data:
        return jsonify({'message': 'applicant_id is required'}), 400
    
    applicant_id = data['applicant_id']
    
    # Update admission status
    success = Database.execute_update(
        'UPDATE applicants SET admission_status = %s WHERE id = %s',
        ('admission_revoked', applicant_id)
    )
    
    if not success:
        return jsonify({'message': 'Failed to revoke admission'}), 500
    
    return jsonify({
        'message': 'Admission revoked successfully'
    }), 200

@admin_bp.route('/statistics', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_statistics(payload):
    """Get application statistics"""
    
    stats = {}
    
    total = Database.execute_query(
        "SELECT COUNT(*) as count FROM applicants WHERE application_status IN ('submitted', 'under_review', 'accepted', 'rejected')"
    )
    stats['total_applications'] = total[0]['count'] if total else 0
    

    by_status = Database.execute_query(
        '''SELECT application_status, COUNT(*) as count
           FROM applicants
           GROUP BY application_status'''
    )
    stats['by_status'] = by_status or []
    

    by_program = Database.execute_query(
        '''SELECT pt.name, COUNT(*) as count
           FROM applicants a
           LEFT JOIN applications app ON a.user_id = app.user_id
           LEFT JOIN program_types pt ON app.prog_type = pt.id
           GROUP BY app.prog_type, pt.name'''
    )
    stats['by_program'] = by_program or []
    
    admitted = Database.execute_query(
        "SELECT COUNT(*) as count FROM applicants WHERE admission_status = 'admitted'"
    )
    stats['total_admitted'] = admitted[0]['count'] if admitted else 0
    
    return jsonify(stats), 200

@admin_bp.route('/letter-templates', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_letter_templates(payload):
    """Get all available admission letter templates"""
    templates = get_all_templates()
    return jsonify({'templates': templates}), 200

@admin_bp.route('/faculty-departments', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_faculty_departments(payload):
    """Get faculties and departments with pending applicants awaiting admission letters"""
    query = '''SELECT 
                'N/A' as faculty,
                'N/A' as department,
                COUNT(a.id) as pending_count
            FROM applicants a
            WHERE a.application_status = 'accepted'
            GROUP BY faculty, department
            ORDER BY faculty, department'''
    
    results = Database.execute_query(query)
    
    # Organize by faculty
    faculties = {}
    if results:
        for row in results:
            faculty = row['faculty'] or 'Other'
            if faculty not in faculties:
                faculties[faculty] = []
            faculties[faculty].append({
                'name': row['department'],
                'pending_count': row['pending_count']
            })
    
    return jsonify({'faculties': faculties}), 200

@admin_bp.route('/department-applicants/<department_name>', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_department_applicants(payload, department_name):
    """Get pending applicants for a department awaiting admission letters"""
    query = '''SELECT a.id, u.name, u.email, pt.name as program_name, 'N/A' as faculty, 'N/A' as department
            FROM applicants a
            JOIN users u ON a.user_id = u.id
            LEFT JOIN applications app ON a.user_id = app.user_id
            LEFT JOIN program_types pt ON app.prog_type = pt.id
            WHERE a.application_status = 'accepted'
            ORDER BY u.name ASC'''
    
    applicants = Database.execute_query(query, (department_name,))
    
    return jsonify({
        'department': department_name,
        'applicants': applicants or []
    }), 200

@admin_bp.route('/send-department-letters', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def send_department_letters(payload):
    """Send admission letters to all pending applicants in a department"""
    from sendgrid import SendGridAPIClient
    from config import Config
    import base64
    
    data = request.get_json()
    department_name = data.get('department_name')
    applicant_ids = data.get('applicant_ids', [])
    admission_date_str = data.get('admission_date', datetime.now().strftime('%Y-%m-%d'))
    
    if not department_name or not applicant_ids:
        return jsonify({'message': 'department_name and applicant_ids required'}), 400
    
    # Convert date to display format
    try:
        date_obj = datetime.strptime(admission_date_str, '%Y-%m-%d')
        admission_date_display = date_obj.strftime('%d %B, %Y')
    except:
        admission_date_display = admission_date_str
    
    sent_list = []
    failed_list = []
    
    try:
        # Fetch all applicants' data and generate PDFs
        applicants_with_pdfs = []
        
        for applicant_id in applicant_ids:
            try:
                ref_no = f"PCU/ADM/{datetime.now().strftime('%Y')}/{applicant_id:04d}"
                
                applicant = Database.execute_query(
                    '''SELECT u.id, u.name, u.email, app.prog_type as program_id, 
                       pt.name as program_name, '100 Level' as level, 'N/A' as department, 'N/A' as faculty, 
                       pt.name as mode, app.session, 'TBD' as resumption_date
                       FROM applicants a
                       JOIN users u ON a.user_id = u.id
                       LEFT JOIN applications app ON a.user_id = app.user_id
                       LEFT JOIN program_types pt ON app.prog_type = pt.id
                       WHERE a.id = %s AND a.application_status = %s''',
                    (applicant_id, 'accepted')
                )
                
                if not applicant:
                    failed_list.append({
                        'applicant_id': applicant_id,
                        'error': 'Applicant not found or not accepted'
                    })
                    continue
                
                applicant_data = applicant[0]
                
                # Get fees
                fees = Database.execute_query(
                    'SELECT acceptance_fee, tuition_fee, other_fees FROM program_fees WHERE program_id = %s',
                    (applicant_data['program_id'],)
                )
                acceptance_fee_str = ''
                tuition_fee_str = ''
                other_fees_str = ''
                if fees:
                    acceptance_fee = fees[0]['acceptance_fee']
                    tuition_fee = fees[0]['tuition_fee']
                    other_fees = fees[0].get('other_fees', 0)
                    acceptance_fee_str = f"₦{acceptance_fee:,.2f}"
                    tuition_fee_str = f"₦{tuition_fee:,.2f}"
                    other_fees_str = f"₦{other_fees:,.2f}"
                
                # Get dynamic session
                session_res = Database.execute_query("SELECT value FROM system_settings WHERE key = 'current_academic_session'")
                default_session = session_res[0]['value'] if session_res else '2025/2026'

                # Generate PDF
                pdf_bytes = PDFGenerator.generate_admission_letter_pdf(
                    candidateName=applicant_data['name'],
                    email=applicant_data['email'],
                    programme=applicant_data['program_name'] or '',
                    level=applicant_data.get('level') or '100 Level',
                    department=applicant_data.get('department') or '',
                    faculty=applicant_data.get('faculty') or '',
                    session=applicant_data.get('session') or default_session,
                    mode=applicant_data.get('mode') or 'Full-Time',
                    date=admission_date_display,
                    acceptanceFee=acceptance_fee_str,
                    tuition=tuition_fee_str,
                    otherFees=other_fees_str,
                    resumptionDate=applicant_data.get('resumption_date') or '',
                    reference=ref_no,
                    body_html=''
                )
                
                applicants_with_pdfs.append({
                    'applicant_id': applicant_id,
                    'email': applicant_data['email'],
                    'name': applicant_data['name'],
                    'pdf_bytes': pdf_bytes
                })
                
            except Exception as e:
                failed_list.append({
                    'applicant_id': applicant_id,
                    'error': str(e)
                })
        
        if not applicants_with_pdfs:
            return jsonify({
                'message': 'No valid applicants to send letters',
                'sent': sent_list,
                'failed': failed_list
            }), 400
        
        # Send via SendGrid batch API
        if not all([Config.SENDGRID_API_KEY, Config.SENDGRID_FROM_EMAIL]):
            raise ValueError("SendGrid not configured")
        
        sg = SendGridAPIClient(Config.SENDGRID_API_KEY)
        
        # Build personalizations
        personalizations = []
        for app in applicants_with_pdfs:
            personalizations.append({
                "to": [{"email": app['email'], "name": app['name']}]
            })
        
        # Build payload
        payload_sg = {
            "from": {
                "email": Config.SENDGRID_FROM_EMAIL,
                "name": Config.SENDGRID_FROM_NAME
            },
            "subject": "Provisional Admission Letter",
            "personalizations": personalizations,
            "content": [{
                "type": "text/html",
                "value": "<p>Dear recipient,</p><p>Please find attached your provisional admission letter.</p><p>Best regards,<br>Admissions Office</p>"
            }]
        }
        
        # Add shared attachment
        if applicants_with_pdfs:
            pdf_bytes = applicants_with_pdfs[0]['pdf_bytes']
            encoded_file = base64.b64encode(pdf_bytes).decode()
            payload_sg["attachments"] = [{
                "content": encoded_file,
                "type": "application/pdf",
                "filename": "admission_letter.pdf",
                "disposition": "attachment"
            }]
        
        # Send batch
        response = sg.client.mail.send.post(request_body=payload_sg)
        
        if response.status_code in [200, 201, 202]:
            # Update tracking for all sent
            for app in applicants_with_pdfs:
                Database.execute_update(
                    '''INSERT INTO admission_letter_tracking (applicant_id, recipient_email, status, sent_at)
                       VALUES (%s, %s, 'sent', NOW())
                       ON CONFLICT (applicant_id) DO UPDATE SET status = 'sent', sent_at = NOW()''',
                    (app['applicant_id'], app['email'])
                )
                # Update admission status
                Database.execute_update(
                    'UPDATE applicants SET admission_status = %s WHERE id = %s',
                    ('admitted', app['applicant_id'])
                )
                sent_list.append({
                    'applicant_id': app['applicant_id'],
                    'name': app['name'],
                    'email': app['email']
                })
            
            print(f"[v0] Batch letters sent: {len(sent_list)} emails")
        else:
            error_msg = f"SendGrid error: {response.status_code}"
            for app in applicants_with_pdfs:
                failed_list.append({
                    'applicant_id': app['applicant_id'],
                    'error': error_msg
                })
    
    except Exception as e:
        for app in applicants_with_pdfs:
            failed_list.append({
                'applicant_id': app['applicant_id'],
                'error': str(e)
            })
        print(f"[v0] Batch send error: {str(e)}")
    
    return jsonify({
        'message': 'Batch send completed',
        'sent': len(sent_list),
        'failed': len(failed_list),
        'sent_list': sent_list,
        'failed_list': failed_list
    }), 201

@admin_bp.route('/letter-status-summary', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_letter_status_summary(payload):
    """Get summary of all letter statuses: sent, failed, pending"""
    query = '''SELECT a.id, u.name, u.email, p.name as program_name, 
                alt.status, alt.sent_at, alt.error_message, alt.retry_count
            FROM applicants a
            JOIN users u ON a.user_id = u.id
            LEFT JOIN programs p ON a.program_id = p.id
            LEFT JOIN admission_letter_tracking alt ON a.id = alt.applicant_id
            WHERE a.application_status = 'accepted'
            ORDER BY alt.status, alt.sent_at DESC'''
    
    results = Database.execute_query(query)
    
    sent = []
    failed = []
    pending = []
    
    if results:
        for row in results:
            item = {
                'applicant_id': row['id'],
                'name': row['name'],
                'email': row['email'],
                'program': row['program_name'],
                'status': row['status'] or 'pending',
                'sent_at': row['sent_at'],
                'error_message': row['error_message'],
                'retry_count': row['retry_count'] or 0
            }
            
            if row['status'] == 'sent':
                sent.append(item)
            elif row['status'] in ['failed', 'sent_with_errors']:
                failed.append(item)
            else:
                pending.append(item)
    
    return jsonify({
        'sent': sent,
        'failed': failed,
        'pending': pending,
        'summary': {
            'total_sent': len(sent),
            'total_failed': len(failed),
            'total_pending': len(pending)
        }
    }), 200

@admin_bp.route('/resend-letter/<int:applicant_id>', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def resend_letter(payload, applicant_id):
    """Resend admission letter to an applicant"""
    from sendgrid import SendGridAPIClient
    from config import Config
    import base64
    
    data = request.get_json()
    admission_date_str = data.get('admission_date', datetime.now().strftime('%Y-%m-%d'))
    
    try:
        # Convert date
        try:
            date_obj = datetime.strptime(admission_date_str, '%Y-%m-%d')
            admission_date_display = date_obj.strftime('%d %B, %Y')
        except:
            admission_date_display = admission_date_str
        
        ref_no = f"PCU/ADM/{datetime.now().strftime('%Y')}/{applicant_id:04d}"
        
        # Get applicant
        applicant = Database.execute_query(
            '''SELECT u.id, u.name, u.email, a.program_id, 
               p.name as program_name, p.level, d.name as department, f.name as faculty, 
               pt.name as mode, p.session, p.resumption_date
               FROM applicants a
               JOIN users u ON a.user_id = u.id
               LEFT JOIN programs p ON a.program_id = p.id
               LEFT JOIN departments d ON p.department_id = d.id
               LEFT JOIN faculties f ON d.faculty_id = f.id
               LEFT JOIN program_types pt ON p.program_type_id = pt.id
               WHERE a.id = %s AND a.application_status = %s''',
            (applicant_id, 'accepted')
        )
        
        if not applicant:
            return jsonify({'message': 'Applicant not found or not accepted'}), 404
        
        applicant_data = applicant[0]
        
        # Get fees
        fees = Database.execute_query(
            'SELECT acceptance_fee, tuition_fee, other_fees FROM program_fees WHERE program_id = %s',
            (applicant_data['program_id'],)
        )
        acceptance_fee_str = ''
        tuition_fee_str = ''
        other_fees_str = ''
        if fees:
            acceptance_fee = fees[0]['acceptance_fee']
            tuition_fee = fees[0]['tuition_fee']
            other_fees = fees[0].get('other_fees', 0)
            acceptance_fee_str = f"₦{acceptance_fee:,.2f}"
            tuition_fee_str = f"₦{tuition_fee:,.2f}"
            other_fees_str = f"₦{other_fees:,.2f}"
        
        # Generate PDF
        pdf_bytes = PDFGenerator.generate_admission_letter_pdf(
            candidateName=applicant_data['name'],
            email=applicant_data['email'],
            programme=applicant_data['program_name'] or '',
            level=applicant_data.get('level') or '100 Level',
            department=applicant_data.get('department') or '',
            faculty=applicant_data.get('faculty') or '',
            session=applicant_data.get('session') or '2025/2026',
            mode=applicant_data.get('mode') or 'Full-Time',
            date=admission_date_display,
            acceptanceFee=acceptance_fee_str,
            tuition=tuition_fee_str,
            otherFees=other_fees_str,
            resumptionDate=applicant_data.get('resumption_date') or '',
            reference=ref_no,
            body_html=''
        )
        
        # Send via SendGrid
        if not all([Config.SENDGRID_API_KEY, Config.SENDGRID_FROM_EMAIL]):
            raise ValueError("SendGrid not configured")
        
        sg = SendGridAPIClient(Config.SENDGRID_API_KEY)
        
        payload_sg = {
            "from": {
                "email": Config.SENDGRID_FROM_EMAIL,
                "name": Config.SENDGRID_FROM_NAME
            },
            "personalizations": [{
                "to": [{"email": applicant_data['email'], "name": applicant_data['name']}]
            }],
            "subject": "Provisional Admission Letter - Resend",
            "content": [{
                "type": "text/html",
                "value": "<p>Dear " + applicant_data['name'] + ",</p><p>Please find attached your provisional admission letter.</p><p>Best regards,<br>Admissions Office</p>"
            }]
        }
        
        # Add attachment
        encoded_file = base64.b64encode(pdf_bytes).decode()
        payload_sg["attachments"] = [{
            "content": encoded_file,
            "type": "application/pdf",
            "filename": "admission_letter.pdf",
            "disposition": "attachment"
        }]
        
        # Send
        response = sg.client.mail.send.post(request_body=payload_sg)
        
        if response.status_code in [200, 201, 202]:
            # Update tracking
            Database.execute_update(
                '''UPDATE admission_letter_tracking 
                   SET status = 'sent', sent_at = NOW(), retry_count = retry_count + 1
                   WHERE applicant_id = %s''',
                (applicant_id,)
            )
            
            return jsonify({
                'message': 'Letter resent successfully',
                'applicant_id': applicant_id,
                'status': 'sent'
            }), 200
        else:
            # Update as failed
            error_msg = f"SendGrid error: {response.status_code}"
            Database.execute_update(
                '''UPDATE admission_letter_tracking 
                   SET status = 'failed', error_message = %s, retry_count = retry_count + 1
                   WHERE applicant_id = %s''',
                (error_msg, applicant_id)
            )
            
            return jsonify({
                'message': 'Failed to resend letter',
                'error': error_msg
            }), 500
    
    except Exception as e:
        # Update as failed
        Database.execute_update(
            '''UPDATE admission_letter_tracking 
               SET status = 'failed', error_message = %s, retry_count = retry_count + 1
               WHERE applicant_id = %s''',
            (str(e), applicant_id)
        )
        
        return jsonify({
            'message': 'Error resending letter',
            'error': str(e)
        }), 500

@admin_bp.route('/preview-letter/<int:applicant_id>', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def preview_letter(payload, applicant_id):
    """Generate and return a preview PDF of the admission letter"""
    admission_date_str = request.args.get('admission_date', datetime.now().strftime('%Y-%m-%d'))
    
    try:
        # Convert date
        try:
            date_obj = datetime.strptime(admission_date_str, '%Y-%m-%d')
            admission_date_display = date_obj.strftime('%d %B, %Y')
        except:
            admission_date_display = admission_date_str
        
        ref_no = f"PCU/ADM/{datetime.now().strftime('%Y')}/{applicant_id:04d}"
        
        # Get applicant
        applicant = Database.execute_query(
            '''SELECT u.id, u.name, u.email, a.program_id, 
               p.name as program_name, p.level, d.name as department, f.name as faculty, 
               pt.name as mode, p.session, p.resumption_date
               FROM applicants a
               JOIN users u ON a.user_id = u.id
               LEFT JOIN programs p ON a.program_id = p.id
               LEFT JOIN departments d ON p.department_id = d.id
               LEFT JOIN faculties f ON d.faculty_id = f.id
               LEFT JOIN program_types pt ON p.program_type_id = pt.id
               WHERE a.id = %s AND a.application_status = %s''',
            (applicant_id, 'accepted')
        )
        
        if not applicant:
            return jsonify({'message': 'Applicant not found or not accepted'}), 404
        
        applicant_data = applicant[0]
        
        # Get fees
        fees = Database.execute_query(
            'SELECT acceptance_fee, tuition_fee, other_fees FROM program_fees WHERE program_id = %s',
            (applicant_data['program_id'],)
        )
        acceptance_fee_str = ''
        tuition_fee_str = ''
        other_fees_str = ''
        if fees:
            acceptance_fee = fees[0]['acceptance_fee']
            tuition_fee = fees[0]['tuition_fee']
            other_fees = fees[0].get('other_fees', 0)
            acceptance_fee_str = f"₦{acceptance_fee:,.2f}"
            tuition_fee_str = f"₦{tuition_fee:,.2f}"
            other_fees_str = f"₦{other_fees:,.2f}"
        
        # Generate PDF
        pdf_bytes = PDFGenerator.generate_admission_letter_pdf(
            candidateName=applicant_data['name'],
            email=applicant_data['email'],
            programme=applicant_data['program_name'] or '',
            level=applicant_data.get('level') or '100 Level',
            department=applicant_data.get('department') or '',
            faculty=applicant_data.get('faculty') or '',
            session=applicant_data.get('session') or '2025/2026',
            mode=applicant_data.get('mode') or 'Full-Time',
            date=admission_date_display,
            acceptanceFee=acceptance_fee_str,
            tuition=tuition_fee_str,
            otherFees=other_fees_str,
            resumptionDate=applicant_data.get('resumption_date') or '',
            reference=ref_no,
            body_html=''
        )
        
        # Return PDF as response
        return Response(
            pdf_bytes,
            mimetype='application/pdf',
            headers={'Content-Disposition': f'inline; filename=admission_letter_{applicant_id}.pdf'}
        )
    
    except Exception as e:
        return jsonify({
            'message': 'Error generating preview',
            'error': str(e)
        }), 500

# ==========================================
# STAGE 2: PORTAL MANAGEMENT ROUTES
# ==========================================

@admin_bp.route('/programs', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_programs(payload):
    """Retrieve all academic programs for management"""
    programs = Database.execute_query(
        '''SELECT p.*, pf.acceptance_fee, pf.tuition_fee, pf.other_fees, 
           d.name as department, f.name as faculty, pt.name as mode
           FROM programs p
           LEFT JOIN departments d ON p.department_id = d.id
           LEFT JOIN faculties f ON d.faculty_id = f.id
           LEFT JOIN program_types pt ON p.program_type_id = pt.id
           LEFT JOIN program_fees pf ON p.id = pf.program_id
           ORDER BY p.name'''
    )
    return jsonify({'programs': programs or []}), 200

@admin_bp.route('/faculties', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_faculties(payload):
    """Get all faculties"""
    faculties = Database.execute_query('SELECT * FROM faculties ORDER BY name')
    return jsonify({'faculties': faculties or []}), 200

@admin_bp.route('/departments', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_departments(payload):
    """Get all departments, optionally filtered by faculty_id"""
    faculty_id = request.args.get('faculty_id')
    if faculty_id:
        departments = Database.execute_query(
            '''SELECT d.*, f.name as faculty_name FROM departments d
               JOIN faculties f ON d.faculty_id = f.id
               WHERE d.faculty_id = %s ORDER BY d.name''',
            (faculty_id,)
        )
    else:
        departments = Database.execute_query(
            '''SELECT d.*, f.name as faculty_name FROM departments d
               JOIN faculties f ON d.faculty_id = f.id ORDER BY f.name, d.name'''
        )
    return jsonify({'departments': departments or []}), 200



@admin_bp.route('/program/<int:program_id>', methods=['PUT'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def update_program(payload, program_id):
    """Update program details (including registration deadline)"""
    data = request.get_json()
    if not data:
        return jsonify({'message': 'No data provided'}), 400

    updates = []
    params = []

    # Direct columns on programs table
    direct_fields = ['name', 'description', 'level', 'session', 'resumption_date', 'registration_deadline']
    for field in direct_fields:
        if field in data:
            updates.append(f"{field} = %s")
            params.append(data[field])

    # department_id: resolve by name
    if 'department' in data:
        dept = Database.execute_query(
            'SELECT id FROM departments WHERE name = %s', (data['department'],)
        )
        if dept:
            updates.append("department_id = %s")
            params.append(dept[0]['id'])

    # program_type_id: resolve mode/type by name
    if 'mode' in data:
        pt = Database.execute_query(
            'SELECT id FROM program_types WHERE name = %s', (data['mode'],)
        )
        if pt:
            updates.append("program_type_id = %s")
            params.append(pt[0]['id'])

    if not updates:
        return jsonify({'message': 'No valid fields provided for update'}), 400

    params.append(program_id)

    try:
        Database.execute_update(
            f"UPDATE programs SET {', '.join(updates)}, updated_at = NOW() WHERE id = %s",
            tuple(params)
        )
        return jsonify({'message': 'Program updated successfully'}), 200
    except Exception as e:
        return jsonify({'message': f'Error updating program: {e}'}), 500

@admin_bp.route('/students', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_students(payload):
    """Retrieve all students (Stage 2 focus)"""
    program_id = request.args.get('program_id')
    level = request.args.get('level')
    
    query = '''SELECT s.id, u.name, u.email, s.matric_number, p.name as program_name, 
                      s.current_level, s.session, s.is_first_login
               FROM students s 
               JOIN users u ON s.user_id = u.id 
               LEFT JOIN programs p ON s.program_id = p.id
               WHERE 1=1'''
    params = []
    
    if program_id:
        query += ' AND s.program_id = %s'
        params.append(program_id)
    if level:
        query += ' AND s.current_level = %s'
        params.append(level)
        
    students = Database.execute_query(query, tuple(params))
    return jsonify({'students': students or []}), 200

@admin_bp.route('/student/<int:student_id>/registration', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_student_registration(payload, student_id):
    """View a student's course registration details"""
    # Get dynamic session
    session_res = Database.execute_query("SELECT value FROM system_settings WHERE key = 'current_academic_session'")
    default_session = session_res[0]['value'] if session_res else '2025/2026'

    semester = request.args.get('semester', 'First')
    session = request.args.get('session', default_session)
    
    registration = Database.execute_query(
        'SELECT * FROM course_registrations WHERE student_id = %s AND semester = %s AND session = %s',
        (student_id, semester, session)
    )
    
    if not registration:
        return jsonify({'message': 'No registration found for this student/semester'}), 404
        
    courses = Database.execute_query(
        '''SELECT c.course_code, c.course_title, c.credit_units, c.category 
           FROM registered_courses rc 
           JOIN courses c ON rc.course_id = c.id 
           WHERE rc.registration_id = %s''',
        (registration[0]['id'],)
    )
    
    return jsonify({
        'registration': registration[0],
        'courses': courses or []
    }), 200


@admin_bp.route('/courses-list', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admissions_officer_required
def get_courses_list(payload):
    """Lightweight course list for dropdowns (admin/staff management)."""
    dept_id = request.args.get('department_id')
    query = 'SELECT id, course_code, course_title FROM courses'
    params = None
    if dept_id:
        query += ' WHERE department_id = %s'
        params = (dept_id,)
    query += ' ORDER BY course_code'
    courses = Database.execute_query(query, params)
    return jsonify({'courses': courses or []}), 200


@admin_bp.route('/settings', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admin_required
def get_global_settings(payload):
    """Get global settings (e.g. locks for portals)"""
    settings = Database.execute_query('SELECT key, value, description FROM system_settings')
    return jsonify({s['key']: s['value'] for s in (settings or [])}), 200

@admin_bp.route('/settings', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.admin_required
def bulk_update_settings(payload):
    """Update global settings via dictionary payload"""
    data = request.get_json()
    for key, value in data.items():
        if isinstance(value, bool):
            value = str(value).lower()
        Database.execute_update(
            'UPDATE system_settings SET value = %s WHERE key = %s',
            (value, key)
        )
    return jsonify({'message': 'Settings updated successfully'}), 200

@admin_bp.route('/staff/lecturer', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.roles_required('admin')
def create_lecturer(payload):
    """Create a new user+staff record with lecturer role."""
    data = request.get_json()
    required = ['name', 'email', 'password', 'department_id']
    if not all(k in data for k in required):
        return jsonify({'message': 'Missing required fields'}), 400
        
    import bcrypt
    from database import Database
    
    # Check if email exists
    existing = Database.execute_query("SELECT id FROM users WHERE email = %s", (data['email'],))
    if existing:
        return jsonify({'message': 'Email already exists'}), 400
        
    hashed = bcrypt.hashpw(data['password'].encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    conn = Database.get_connection()
    if not conn:
        return jsonify({'message': 'DB Error'}), 500
        
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (name, email, password_hash, role, status) VALUES (%s, %s, %s, 'lecturer', 'active') RETURNING id",
                (data['name'], data['email'], hashed)
            )
            user_id = cur.fetchone()['id']
            
            cur.execute(
                "INSERT INTO staff (user_id, department_id, title) VALUES (%s, %s, %s) RETURNING id",
                (user_id, data['department_id'], data.get('title', 'Lecturer'))
            )
        conn.commit()
        return jsonify({'message': 'Lecturer created successfully', 'user_id': user_id}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'message': str(e)}), 500
    finally:
        Database.release_connection(conn)
