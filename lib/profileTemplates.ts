/**
 * Profile Template System - Defines which fields display for each program type
 * This drives dynamic rendering of applicant profiles without hardcoding
 *
 * Add new program types by creating a template below and extending ProfileTemplate type
 */

export interface ProfileField {
  /** Key to access in form data */
  key: string;
  /** Display label */
  label: string;
  /** Optional formatter function */
  format?: (value: any) => string;
  /** Whether to show if value is empty */
  showIfEmpty?: boolean;
}

export interface ProfileSection {
  title: string;
  fields: ProfileField[];
  /** Show section even if all fields are empty */
  alwaysShow?: boolean;
}

export interface ProfileTemplate {
  name: string;
  programTypeId: number;
  sections: ProfileSection[];
  /** Whether to show O'Level results section */
  showOLevel: boolean;
  /** Custom notes for this program type */
  notes?: string;
}

/**
 * POSTGRADUATE (program_type_id = 2)
 * Based on backend/routes/form_templates/postgraduate.py
 *
 * Sections (in order):
 * 1. Personal Information
 * 2. Academic History
 * 3. Proposed Study
 * 4. Sponsor & Next of Kin
 * 5. Referees
 * 6. Documents (handled separately)
 */
export const pgTemplate: ProfileTemplate = {
  name: "Postgraduate",
  programTypeId: 2,
  showOLevel: false,
  sections: [
    {
      title: "Personal Information",
      fields: [
        { key: "email", label: "Email" },
        { key: "first_name", label: "First Name" },
        { key: "last_name", label: "Surname" },
        { key: "middle_name", label: "Middle Name" },
        { key: "gender", label: "Gender" },
        { key: "date_of_birth", label: "Date of Birth" },
        { key: "phone_number", label: "Phone Number" },
        { key: "secondary_phone_number", label: "Secondary Phone Number" },
        { key: "address", label: "Address" },
        { key: "physically_challenged", label: "Physically Challenged?" },
        {
          key: "physical_challenge_reason",
          label: "Physical Challenge Reason",
        },
      ],
    },
    {
      title: "Academic History",
      fields: [
        { key: "previous_institution", label: "Previous Institution Attended" },
        { key: "previous_course", label: "Previous Course of Study" },
        { key: "department", label: "Department" },
        { key: "class_of_degree", label: "Class of First Degree" },
      ],
    },
    {
      title: "Proposed Study",
      fields: [
        {
          key: "degree_name",
          label: "Degree in View",
          format: (val, form) => {
            if (!val && form?.degree_code) return form.degree_code;
            return val
              ? `${val}${form?.degree_code ? ` (${form.degree_code})` : ""}`
              : "";
          },
        },
        { key: "proposed_course_name", label: "Proposed Course/Program" },
        { key: "proposed_faculty_name", label: "Faculty/Institute" },
        { key: "area_of_specialisation", label: "Area of Specialisation" },
        { key: "proposed_research_title", label: "Proposed Research Title" },
        { key: "mode_of_study", label: "Mode of Study" },
      ],
      alwaysShow: true,
    },
    {
      title: "Sponsor & Next of Kin",
      fields: [
        { key: "sponsor_name", label: "Name of Sponsor" },
        { key: "sponsor_address", label: "Address of Sponsor" },
        { key: "next_of_kin_name", label: "Name of Next of Kin" },
        { key: "next_of_kin_address", label: "Address of Next of Kin" },
        {
          key: "next_of_kin_phone_number",
          label: "Phone Number of Next of Kin",
        },
        {
          key: "next_of_kin_secondary_phone_number",
          label: "Secondary Phone Number of Next of Kin",
        },
      ],
    },
    {
      title: "Referees",
      fields: [
        // Referees are rendered specially in component
      ],
      alwaysShow: true,
    },
  ],
};

/**
 * UNDERGRADUATE (program_type_id = 1)
 * Displays program choices, sponsor, and O'Level results
 */
export const ugTemplate: ProfileTemplate = {
  name: "Undergraduate",
  programTypeId: 1,
  showOLevel: true,
  sections: [
    {
      title: "Programme Choice",
      fields: [
        { key: "first_choice_program_name", label: "First Choice Program" },
        { key: "second_choice_program_name", label: "Second Choice Program" },
      ],
    },
    {
      title: "Sponsor Information",
      fields: [
        { key: "sponsor_name", label: "Name" },
        { key: "sponsor_phone_number", label: "Phone Number" },
        { key: "sponsor_email", label: "Email" },
        { key: "sponsor_relationship", label: "Relationship" },
        { key: "sponsor_address", label: "Address" },
      ],
    },
    {
      title: "Next of Kin Information",
      fields: [
        { key: "next_of_kin_name", label: "Name" },
        { key: "next_of_kin_phone_number", label: "Phone Number" },
        { key: "next_of_kin_address", label: "Address" },
      ],
    },
  ],
};

/**
 * PART-TIME (program_type_id = 3)
 * Similar to UG but with different focus
 */
export const partTimeTemplate: ProfileTemplate = {
  name: "Part-Time",
  programTypeId: 3,
  showOLevel: true,
  sections: [
    {
      title: "Programme Choice",
      fields: [
        { key: "first_choice_program_name", label: "First Choice Program" },
        { key: "second_choice_program_name", label: "Second Choice Program" },
      ],
    },
    {
      title: "Sponsor Information",
      fields: [
        { key: "sponsor_name", label: "Name" },
        { key: "sponsor_phone_number", label: "Phone Number" },
        { key: "sponsor_email", label: "Email" },
        { key: "sponsor_relationship", label: "Relationship" },
        { key: "sponsor_address", label: "Address" },
      ],
    },
  ],
};

/**
 * HND CONVERSION (program_type_id = 4)
 * Displays academic background and program choice
 */
export const hndConversionTemplate: ProfileTemplate = {
  name: "HND Conversion",
  programTypeId: 4,
  showOLevel: false,
  sections: [
    {
      title: "Academic Background",
      fields: [
        { key: "previous_institution", label: "Previous Institution" },
        { key: "previous_course", label: "Previous Course Studied" },
        { key: "department", label: "Department/Field" },
        { key: "class_of_degree", label: "Class of Degree" },
      ],
    },
    {
      title: "Programme Choice",
      fields: [
        { key: "first_choice_program_name", label: "First Choice Program" },
        { key: "second_choice_program_name", label: "Second Choice Program" },
      ],
    },
  ],
};

/**
 * IJMB (program_type_id = 5)
 * Displays program choice and basic info
 */
export const ijmbTemplate: ProfileTemplate = {
  name: "IJMB",
  programTypeId: 5,
  showOLevel: false,
  sections: [
    {
      title: "Programme Choice",
      fields: [
        { key: "first_choice_program_name", label: "First Choice Program" },
        { key: "second_choice_program_name", label: "Second Choice Program" },
      ],
    },
  ],
};

/**
 * DIRECT ENTRY (program_type_id = 6)
 * Displays academic background and program choice
 */
export const directEntryTemplate: ProfileTemplate = {
  name: "Direct Entry",
  programTypeId: 6,
  showOLevel: false,
  sections: [
    {
      title: "Academic Background",
      fields: [
        { key: "previous_institution", label: "Previous Institution" },
        { key: "previous_course", label: "Previous Course Studied" },
        { key: "department", label: "Department/Field" },
        { key: "class_of_degree", label: "Class of Degree" },
      ],
    },
    {
      title: "Programme Choice",
      fields: [
        { key: "first_choice_program_name", label: "First Choice Program" },
        { key: "second_choice_program_name", label: "Second Choice Program" },
      ],
    },
  ],
};

/**
 * JUPEB (program_type_id = 7)
 * Similar to IJMB
 */
export const jupebTemplate: ProfileTemplate = {
  name: "JUPEB",
  programTypeId: 7,
  showOLevel: false,
  sections: [
    {
      title: "Programme Choice",
      fields: [
        { key: "first_choice_program_name", label: "First Choice Program" },
        { key: "second_choice_program_name", label: "Second Choice Program" },
      ],
    },
  ],
};

// Registry of all templates
const templateRegistry: Record<number, ProfileTemplate> = {
  1: ugTemplate,
  2: pgTemplate,
  3: partTimeTemplate,
  4: hndConversionTemplate,
  5: ijmbTemplate,
  6: directEntryTemplate,
  7: jupebTemplate,
};

/**
 * Get profile template for a program type
 * Falls back to UG template if program type not found
 */
export function getProfileTemplate(programTypeId: number): ProfileTemplate {
  return templateRegistry[programTypeId] || ugTemplate;
}

/**
 * Get all available templates
 */
export function getAllProfileTemplates(): ProfileTemplate[] {
  return Object.values(templateRegistry);
}
