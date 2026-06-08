# NEW ENDPOINTS FOR PG COURSE RECOMMENDATION
# These should be added to backend/routes/applicant.py

@applicant_bp.route('/accept-recommended-course', methods=['POST'])
@AuthHandler.token_required
def accept_recommended_course(payload):
    """
    Applicant accepts the admin's recommended course.
    
    Only valid for PG applicants in 'recommended' status.
    Updates applicant_stage to 'accepted_recommendation'.
    """
    user_id = payload['user_id']
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
    Notifies admin officer of the alternative recommendation.
    """
    user_id = payload['user_id']
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
