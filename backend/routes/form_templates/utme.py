template = {
    'program': 'UTME',
    'steps': [
        {
            'title': 'Personal Information',
            'type': 'fields',
            'fields': [
                {'name': 'email', 'type': 'email', 'label': 'Email', 'required': True, 'disabled': True},
                {'name': 'first_name', 'type': 'text', 'label': 'First Name', 'required': True, 'disabled': True},
                {'name': 'last_name', 'type': 'text', 'label': 'Last Name', 'required': True, 'disabled': True},
                {'name': 'middle_name', 'type': 'text', 'label': 'Middle name', 'required': False},
                {'name': 'gender', 'type': 'select', 'label': 'Gender', 'placeholder': '— SELECT GENDER —', 'options': ['Male', 'Female'], 'required': True},
                {'name': 'date_of_birth', 'type': 'date', 'label': 'Date of Birth', 'required': True},
                {'name': 'place_of_birth', 'type': 'text', 'label': 'Place of birth', 'required': True},
                {'name': 'marital_status', 'type': 'select', 'label': 'Marital Status', 'placeholder': '— SELECT MARITAL STATUS —', 'options': ['Single', 'Married', 'Divorced', 'Widowed'], 'required': True},
                {'name': 'religion', 'type': 'select', 'label': 'Religion', 'placeholder': '— SELECT RELIGION —', 'options': ['Christianity', 'Islam', 'Traditional', 'Other'], 'required': True},
                {'name': 'blood_group', 'type': 'text', 'label': 'Blood Group', 'required': False},
                {'name': 'genotype', 'type': 'text', 'label': 'Genotype', 'required': False},
                {'name': 'phone_number', 'type': 'text', 'label': 'Phone Number', 'required': True, 'disabled': True},
                {'name': 'secondary_phone_number', 'type': 'text', 'label': 'Secondary Phone Number', 'required': False},
                {'name': 'nationality', 'type': 'select', 'label': 'Nationality', 'required': True, 'dynamic_options': 'countries', 'placeholder': '— SELECT NATIONALITY —'},
                {'name': 'state', 'type': 'select', 'label': 'State', 'placeholder': '— SELECT STATE —', 'options': ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara','FCT'], 'required': True},
                {'name': 'lga', 'type': 'text', 'label': 'Local Government Area', 'required': True},
                {'name': 'address', 'type': 'textarea', 'label': 'Address', 'required': True},
            ]
        },
        {'title': 'Sponsor and Next of Kin', 'type': 'fields', 'fields': [
            {'name': 'sponsor_name', 'type': 'text', 'label': 'Sponsor Name', 'required': True},
            {'name': 'sponsor_address', 'type': 'text', 'label': 'Sponsor Address', 'required': True},
            {'name': 'sponsor_phone_number', 'type': 'text', 'label': 'Sponsor Phone Number', 'required': True},
            {'name': 'sponsor_relationship', 'type': 'select', 'label': 'Sponsor Relationship', 'placeholder': '— SELECT RELATIONSHIP —', 'options': ['Father','Mother','Guardian','Uncle','Aunt','Self','Other'], 'required': True},
            {'name': 'sponsor_email', 'type': 'email', 'label': 'Sponsor Email', 'required': False},
            {'name': 'next_of_kin_name', 'type': 'text', 'label': "Next of Kin's Name", 'required': True},
            {'name': 'next_of_kin_address', 'type': 'text', 'label': "Next of Kin's Address", 'required': True},
            {'name': 'next_of_kin_phone_number', 'type': 'text', 'label': "Next of Kin's Phone Number", 'required': True},
        ]},
        {
            'title': 'JAMB / UTME Details',
            'type': 'fields',
            'fields': [
                {'name': 'utme_reg_no', 'type': 'text', 'label': 'JAMB Registration Number', 'required': True},
                {'name': 'utme_score', 'type': 'number', 'label': 'JAMB Score', 'required': True},
                {'name': 'mode_of_entry', 'type': 'select', 'label': 'Mode of Entry', 'placeholder': '— SELECT MODE —', 'options': ['UTME', 'Direct Entry', 'Transfer', 'Others'], 'required': True},
                {'name': 'choice1', 'type': 'text', 'label': 'First Choice', 'required': True},
                {'name': 'choice2', 'type': 'text', 'label': 'Second Choice', 'required': True},
                {'name': 'utme_subject1', 'type': 'select', 'label': 'JAMB Subject 1', 'placeholder': '— SELECT SUBJECT —', 'required': True, 'dynamic_options': 'utme_subjects'},
                {'name': 'utme_score1', 'type': 'number', 'label': 'JAMB Score 1', 'required': True},
                {'name': 'utme_subject2', 'type': 'select', 'label': 'JAMB Subject 2', 'placeholder': '— SELECT SUBJECT —', 'required': True, 'dynamic_options': 'utme_subjects'},
                {'name': 'utme_score2', 'type': 'number', 'label': 'JAMB Score 2', 'required': True},
                {'name': 'utme_subject3', 'type': 'select', 'label': 'JAMB Subject 3', 'placeholder': '— SELECT SUBJECT —', 'required': True, 'dynamic_options': 'utme_subjects'},
                {'name': 'utme_score3', 'type': 'number', 'label': 'JAMB Score 3', 'required': True},
                {'name': 'utme_subject4', 'type': 'select', 'label': 'JAMB Subject 4', 'placeholder': '— SELECT SUBJECT —', 'required': True, 'dynamic_options': 'utme_subjects'},
                {'name': 'utme_score4', 'type': 'number', 'label': 'JAMB Score 4', 'required': True},
            ]
        },
        {'title': "O'LEVEL", 'type': 'olevel'},
        {'title': 'Documents', 'type': 'documents', 'documents': [
            {'type': 'passport', 'label': 'Passport Photograph', 'required': False},
            {'type': 'birth_certificate', 'label': 'Birth Certificate', 'required': False},
            {'type': 'jamb_result', 'label': 'JAMB Result Slip', 'required': False},
        ]},
    ]
}
