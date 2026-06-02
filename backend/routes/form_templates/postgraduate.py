template = {
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
}
