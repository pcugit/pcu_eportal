template = {
    'program': 'Postgraduate',
    'steps': [
        {
            'title': 'Background Information',
            'type': 'fields',
            'fields': [
                {'name': 'email', 'type': 'email', 'label': 'Email', 'required': True, 'disabled': True},
                {'name': 'first_name', 'type': 'text', 'label': 'First Name', 'required': True, 'disabled': True},
                {'name': 'last_name', 'type': 'text', 'label': 'Surname', 'required': True, 'disabled': True},
                {'name': 'middle_name', 'type': 'text', 'label': 'Middle Name', 'required': False},
                {'name': 'gender', 'type': 'select', 'label': 'Gender', 'options': ['Male', 'Female'], 'required': True},
                {'name': 'date_of_birth', 'type': 'date', 'label': 'Date of Birth', 'required': True},
                {'name': 'phone_number', 'type': 'text', 'label': 'Phone Number', 'required': True, 'disabled': False},
                {'name': 'secondary_phone_number', 'type': 'text', 'label': 'Secondary Phone Number', 'required': False},
                {'name': 'address', 'type': 'textarea', 'label': 'Address', 'required': True},
                {'name': 'physically_challenged', 'type': 'select', 'label': 'Are you physically challenged?', 'options': ['No', 'Yes'], 'required': True},
                {'name': 'physical_challenge_reason', 'type': 'text', 'label': 'If yes, specify challenge', 'required': False},
            ]
        },
        {
            'title': 'Academic History',
            'type': 'fields',
            'fields': [
                {'name': 'previous_institution', 'type': 'text', 'label': 'Previous Institution Attended', 'required': True},
                {'name': 'previous_course', 'type': 'text', 'label': 'Previous Course of Study', 'required': True},
                {'name': 'department', 'type': 'text', 'label': 'Department', 'required': True},
                {'name': 'class_of_degree', 'type': 'select', 'label': 'Class of First Degree', 'options': ['First Class', 'Second Class Upper', 'Second Class Lower', 'Third Class', 'Pass', 'Distinction', 'Upper Credit', 'Lower Credit'], 'required': True},
            ]
        },
        {
            'title': 'Proposed Study',
            'type': 'pg_study'
        },
        {
            'title': 'Sponsor & Next of Kin',
            'type': 'fields',
            'fields': [
                {'name': 'sponsor_name', 'type': 'text', 'label': 'Name of Sponsor', 'required': True},
                {'name': 'sponsor_address', 'type': 'textarea', 'label': 'Address of Sponsor', 'required': True},
                {'name': 'next_of_kin_name', 'type': 'text', 'label': 'Name of Next of Kin', 'required': True},
                {'name': 'next_of_kin_address', 'type': 'textarea', 'label': 'Address of Next of Kin', 'required': True},
                {'name': 'next_of_kin_phone_number', 'type': 'text', 'label': 'Phone Number of Next of Kin', 'required': True},
                {'name': 'next_of_kin_secondary_phone_number', 'type': 'text', 'label': 'Secondary Phone Number of Next of Kin', 'required': False},
            ]
        },
        {
            'title': 'Referees',
            'type': 'pg_referees'
        },
        {
            'title': 'Documents',
            'type': 'documents',
            'documents': [
                # ── Required documents ────────────────────────────────────────
                {'type': 'transcript',          'label': 'Student Copy Transcript',  'required': True},
                {'type': 'birth_certificate',   'label': 'Birth Certificate',        'required': True},
                {'type': 'nysc_certificate',    'label': 'NYSC Certificate',         'required': True},
                {'type': 'olevel_result',       'label': "O'Level Result",           'required': True},
                # ── Referee letters (3 required; at least 1 must be academic) ─
                {'type': 'referee_letter_1',    'label': 'Referee Letter 1',         'required': True},
                {'type': 'referee_letter_2',    'label': 'Referee Letter 2',         'required': True},
                {'type': 'referee_letter_3',    'label': 'Referee Letter 3',         'required': True},
                # ── Other ─────────────────────────────────────────────────────
                {'type': 'signature',           'label': 'Scanned Student Signature', 'required': True},
            ]
        }
    ]
}
