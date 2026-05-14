export interface CourseData {
  slug: string;
  heroTitle: string;
  heroImage: string;
  description: string;
  applyLink: string;
  admissionRequirements: {
    intro?: string;
    sections: {
      title: string;
      points: string[];
    }[];
  };
  areaOfSpecialization: {
    intro: string;
    areas: string[];
  };
  programmesDuration: {
    intro?: string;
    sections: {
      title: string;
      points: string[];
    }[];
  };
}

export const coursesData: CourseData[] = [
  {
    slug: "business-admin-parttime",
    heroTitle: "PART TIME - BUSINESS ADMINISTRATION",
    heroImage: "/e-portal/images/students.jpg",
    description:
      "Develop essential management and business skills through our flexible Part Time Business Administration programme. Designed for working professionals, this course covers strategic management, organizational behavior, finance, marketing, and operations management. Equip yourself with practical knowledge to advance your career in any organizational setting.",
    applyLink: "/auth/signup",
    admissionRequirements: {
      sections: [
        {
          title: "General Entry Qualifications for Part Time Programmes",
          points: [
            "To be considered for admission into any of the Part Time Programmes, candidates must satisfy the general University requirements as well as any special requirements for admission into the Programme of interest.",
          ],
        },
        {
          title: "Part Time Diploma Programme",
          points: [
            "Graduates of Precious Cornerstone University or other recognized Universities.",
            "Candidates with HND, First Degree, or equivalent qualifications from any recognized Tertiary Institution.",
            "Working professionals with at least 2 years of professional experience.",
            "Candidates must have obtained 5 credits in WASC or GCE O/L including English and Mathematics.",
          ],
        },
        {
          title: "Part Time Degree Programme",
          points: [
            "Holders of NCE, OND, HND, or First Degree from recognized institutions.",
            "Candidates with relevant professional experience and certifications.",
            "Admission is subject to the candidate's academic and professional background.",
          ],
        },
      ],
    },
    areaOfSpecialization: {
      intro:
        "Our Part Time Business Administration programme offers flexibility across multiple areas:",
      areas: [
        "General Management",
        "Financial Management",
        "Marketing Management",
        "Human Resource Management",
        "Operations Management",
        "Entrepreneurship",
      ],
    },
    programmesDuration: {
      intro: "Flexible scheduling to accommodate working professionals:",
      sections: [
        {
          title: "Diploma in Business Administration",
          points: [
            "Duration: 2 - 3 years part-time",
            "Classes: Evening (5:00 PM - 8:00 PM) and/or Weekend",
            "Mode: In-person with online support materials",
          ],
        },
        {
          title: "Bachelor Degree in Business Administration",
          points: [
            "Duration: 3 - 4 years part-time",
            "Classes: Evening and Weekend schedules",
            "Mode: Blended learning (in-person and online)",
          ],
        },
      ],
    },
  },
  {
    slug: "accounting-parttime",
    heroTitle: "PART TIME - ACCOUNTING",
    heroImage: "/e-portal/images/students.jpg",
    description:
      "Master accounting principles and practices through our Part Time Accounting programme. Ideal for finance professionals and career changers, this programme covers financial accounting, management accounting, taxation, auditing, and accounting information systems. Gain professional qualifications while maintaining your current employment.",
    applyLink: "/auth/signup",
    admissionRequirements: {
      sections: [
        {
          title: "General Entry Qualifications for Part Time Programmes",
          points: [
            "To be considered for admission into any of the Part Time Programmes, candidates must satisfy the general University requirements as well as any special requirements for admission into the Programme of interest.",
          ],
        },
        {
          title: "Part Time Accounting Diploma",
          points: [
            "Graduates from recognized tertiary institutions.",
            "HND holders in accounting or business-related disciplines.",
            "Working professionals with accounting experience.",
            "Candidates must have 5 credits in WASC/GCE O/L including English and Mathematics.",
          ],
        },
        {
          title: "Part Time Accounting Degree",
          points: [
            "HND or First Degree holders in accounting or related fields.",
            "Professionals with accounting certifications (ICAN, ACCA in progress).",
            "Admission is competitive and based on qualifications and experience.",
          ],
        },
      ],
    },
    areaOfSpecialization: {
      intro: "Specialize in key areas of accounting:",
      areas: [
        "Financial Accounting",
        "Management Accounting",
        "Taxation",
        "Auditing",
        "Accounting Information Systems",
        "Corporate Accounting",
      ],
    },
    programmesDuration: {
      intro: "Structured to fit your professional schedule:",
      sections: [
        {
          title: "Diploma in Accounting",
          points: [
            "Duration: 2 - 3 years part-time",
            "Classes: Evenings and weekends",
            "Format: Blended learning approach",
          ],
        },
        {
          title: "Bachelor in Accounting",
          points: [
            "Duration: 3 - 4 years part-time",
            "Classes: Evening and weekend intensive sessions",
            "Format: Online lectures with practical sessions",
          ],
        },
      ],
    },
  },
  {
    slug: "it-management-parttime",
    heroTitle: "PART TIME - IT MANAGEMENT & CYBERSECURITY",
    heroImage: "/e-portal/images/students.jpg",
    description:
      "Stay current with the latest in information technology management and cybersecurity through our flexible Part Time programme. Learn IT strategy, systems management, network security, and data protection. Perfect for IT professionals seeking to advance their careers or transition into IT management roles.",
    applyLink: "/auth/signup",
    admissionRequirements: {
      sections: [
        {
          title: "General Entry Qualifications for Part Time Programmes",
          points: [
            "To be considered for admission into any of the Part Time Programmes, candidates must satisfy the general University requirements.",
          ],
        },
        {
          title: "Part Time IT Diploma",
          points: [
            "Graduates from recognized institutions.",
            "IT professionals with at least 2 years of experience.",
            "HND holders in Computer Science or related fields.",
            "Candidates with 5 credits in WASC/GCE O/L including English and Mathematics.",
          ],
        },
        {
          title: "Part Time IT Degree",
          points: [
            "First degree holders in computer science or IT-related disciplines.",
            "IT professionals with significant industry experience.",
            "Admission based on academic and professional credentials.",
          ],
        },
      ],
    },
    areaOfSpecialization: {
      intro: "Develop expertise in critical IT areas:",
      areas: [
        "IT Strategy & Governance",
        "Network Management",
        "Cybersecurity Fundamentals",
        "Data Protection & Privacy",
        "Cloud Computing",
        "IT Project Management",
      ],
    },
    programmesDuration: {
      intro: "Convenient scheduling for working IT professionals:",
      sections: [
        {
          title: "Diploma in IT Management",
          points: [
            "Duration: 2 - 3 years part-time",
            "Classes: Weekend and evening sessions",
            "Format: Online with practical labs",
          ],
        },
        {
          title: "Bachelor in IT Management & Cybersecurity",
          points: [
            "Duration: 3 - 4 years part-time",
            "Classes: Flexible evening and weekend schedule",
            "Format: Blended - online theory with in-person practicals",
          ],
        },
      ],
    },
  },
];
