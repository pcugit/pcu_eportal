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
    slug: "accounting-postgraduate",
    heroTitle: "PGD - ACCOUNTING",
    heroImage: "/e-portal/images/Certified-Public-Accountant-_-How-CPAs-Simplify-Tax-Financial-Management-for-Businesses.jpg",
    description:
      "The aim is to develop and strengthen the intellectual capacity of students in the accounting discipline so as to equip them with adequate business knowledge needed for understanding and analysis of the basic, current, complex financial transactions and issues in the private and public sectors of the Nigerian economy; honing critical thinking. To allow graduates to be the bridge that connects accounting and information technology and the go-to resource every company needs to operate at a higher level.",
    applyLink: "/auth/signup",
    admissionRequirements: {
      sections: [
        {
          title: "General Entry Qualifications for Postgraduate Programmes",
          points: [
            "To be considered for admission into any of the Postgraduate Programmes, the candidate shall satisfy the general University requirements as well as any special requirements for admission into the Programme of interest as contained in the admission guidelines.",
          ],
        },
        {
          title: "Postgraduate Diploma Programme",
          points: [
            "Graduates of Precious Cornerstone University or other recognized Universities.",
            "Admission is open to candidates having HND or First Degree in a relevant discipline from any recognized Tertiary Institution",
            "Candidates with professional qualifications including HND must have obtained 5 credits in WASC or GCE O/L including English and Mathematics for admission for degree courses.",
          ],
        },
        {
          title: "Master's Degree Programmes",
          points: [
            "The following shall qualify for master's degree admission: Graduates of the Precious Cornerstone University or any other University recognized by the Senate and shall normally have obtained a minimum of Second-Class Lower Division degree in a relevant field.",
          ],
        },
        {
          title: "Doctorate (Ph.D.) Degree Programmes",
          points: [
            "Candidates seeking admission to the Doctor of Philosophy (Ph.D.) degree Programme must (in their relevant discipline) have obtained the Bachelor and master's Degrees of Precious Cornerstone University or its equivalent from any other University recognized by the Senate. To qualify for direct admission into the Ph.D., the candidate must have a minimum CGPA of 4.00 on a 5.00-point scale or equivalent (60%) in the master's degree result. Candidates who graduated with a CGPA of 3.50-3.99 on a 5.00-point scale or equivalent (55-59%) in the master's degree may be considered for M.Phil. /Ph.D. programme. Precious Cornerstone University shall award M.Phil. Degree to M.Phil./Ph.D. Candidate who fails to meet up with a minimum CGPA of 4.00 upon the completion of the Coursework examination. Such candidate shall proceed to write a long essay/dissertation and upon successful defense of the dissertation would be awarded an M.Phil. Degree in the respective discipline. The M.Phil. /Ph.D. programme is intended to prepare candidates for the Ph.D. degree. Candidates with Professional Master's degrees are not eligible for the Ph.D. programme except if they obtained M.Sc. degrees in the relevant fields.",
          ],
        },
      ],
    },
    areaOfSpecialization: {
      intro:
        "Candidate shall choose from the following areas of research in the department for specialization:",
      areas: [
        "Environmental Accounting – Auditing Assurance",
        "Forensic Accounting",
        "Management Information System",
        "Public Sector Finance",
        "Public Accounting",
        "Financial Accounting",
        "Cost and Management Accounting",
        "Taxation",
        "Performance Management",
      ],
    },
    programmesDuration: {
      intro:
        "Durations for postgraduate programmes at Precious Cornerstone Universities will be as follows:",
      sections: [
        {
          title: "Postgraduate Diploma Programmes (PGD)",
          points: [
            "Full-time Diploma: Minimum of two (2) semesters and a maximum of four (4) semesters.",
            "Part-time Diploma: Minimum of four (4) semesters and a maximum of six (6) semesters",
          ],
        },
        {
          title: "Master's Degree Programmes",
          points: [
            "Full-time: A Minimum of four (4) semesters and a maximum of six (6) semesters",
            "Part-time: A minimum of six (6) semesters and a maximum of eight (8) semesters.",
          ],
        },
        {
          title: "Ph.D. Programme",
          points: [
            "Full-time: A Minimum of six (6) semesters, a maximum of ten (10) semesters.",
            "Part-time: A minimum of Ten (10) semesters and a maximum of twelve (12) semesters.",
            "For extension beyond the specified maximum period, a special permission of the Postgraduate Board shall be required",
          ],
        },
      ],
    },
  },
  {
    slug: "business-administration-postgraduate",
    heroTitle: "PGD - BUSINESS ADMINISTRATION",
    heroImage: "/e-portal/images/The-Ultimate-Guide-to-Business-Administration-College-Handbook.jpg",
    description:
      "The Master of Business Administration is rooted in the pursuit of unbiased and The Master of Business Administration (MBA) programme is founded on the application of sound business principles, critical thinking, and strategic decision-making, with the aim of developing competent leaders and professionals who can navigate the complexities of today's dynamic business environment. The programme emphasizes the integration of theory with practical experience, preparing graduates to address real-world challenges and make impactful contributions across a wide range of industries.",
    applyLink: "/auth/signup",
    admissionRequirements: {
      sections: [
        {
          title: "Master's Degree Admission Requirements",
          points: [
            "The following shall qualify for Master of Business Administration degree admission: Graduates of the Precious Cornerstone University or any other University recognized by the Senate and shall normally have obtained a minimum of Third-Class degree in a relevant field",
            "(i) All candidates must have five credit passes including English and Mathematics at the 'O' Level, as basic requirement.",
            "An applicant for admission to the Master's degree programme in Business Administration shall be:",
            "(a) a graduate of Precious cornerstone State University; or any other recognized University approved who obtains not less than a second class lower and posses minimum admission requirement for the first degree.",
            "(ii) Holders of HND of Upper Credit Level from a recognised tertiary institution plus a professional qualification (ACA, ACIB) provided the university matriculation requirements are satisfied.",
            "(iii) As a condition for admission, an applicant may be required to write and pass qualifying examination.",
            "(iv) The result of such test(s) and examination(s) taken under Regulation",
            "(vi) above shall be approved by the Board.",
          ],
        },
      ],
    },
    areaOfSpecialization: {
      intro:
        "Candidate shall choose from the following areas of research in the department for specialization:",
      areas: [
        "General Management",
        "Human Resource – Management",
        "Entrepreneurship/Small -Business Management",
        "Production/Operation Management",
        "Banking and Finance",
        "Public Management",
      ],
    },
    programmesDuration: {
      sections: [
        {
          title: "Master's Degree Programmes",
          points: [
            "Full-time: A Minimum of three (3) semesters and a maximum of six (6) semesters",
            "Part-time: A minimum of four (4) semesters and a maximum of eight (8) semesters.",
            "For extension beyond the specified maximum period, a special permission of the Postgraduate Board shall be required",
          ],
        },
      ],
    },
  },
  {
    slug: "microbiology-postgraduate",
    heroTitle: "PGD - MICROBIOLOGY",
    heroImage: "/e-portal/images/Biomed-Aesthetic.jpg",
    description:
      "The Postgraduate Programme in Microbiology is designed to equip students with advanced knowledge and research skills in microbial sciences, preparing them for careers in academia, industry, and public health.",
    applyLink: "/auth/signup",
    admissionRequirements: {
      sections: [
        {
          title: "General Entry Qualifications",
          points: [
            "Graduates of Precious Cornerstone University or other recognized Universities with a degree in Microbiology or related biological sciences.",
            "Candidates must have obtained a minimum of Second-Class Lower Division in their first degree.",
            "HND holders with Upper Credit from recognized tertiary institutions may also apply.",
          ],
        },
      ],
    },
    areaOfSpecialization: {
      intro:
        "Candidate shall choose from the following areas of research in the department for specialization:",
      areas: [
        "Medical Microbiology",
        "Industrial Microbiology",
        "Environmental Microbiology",
        "Food Microbiology",
        "Virology",
        "Parasitology",
      ],
    },
    programmesDuration: {
      sections: [
        {
          title: "Master's Degree Programmes",
          points: [
            "Full-time: A Minimum of four (4) semesters and a maximum of six (6) semesters",
            "Part-time: A minimum of six (6) semesters and a maximum of eight (8) semesters.",
            "For extension beyond the specified maximum period, a special permission of the Postgraduate Board shall be required",
          ],
        },
        {
          title: "Ph.D. Programme",
          points: [
            "Full-time: A Minimum of six (6) semesters, a maximum of ten (10) semesters.",
            "Part-time: A minimum of Ten (10) semesters and a maximum of twelve (12) semesters.",
          ],
        },
      ],
    },
  },
  {
    slug: "computer-science-postgraduate",
    heroTitle: "PGD - COMPUTER SCIENCE",
    heroImage: "/e-portal/images/🔹-Core-Concepts-of-Programming_-A-Beginners-Guide-🚀.jpg",
    description:
      "The Postgraduate Programme in Computer Science is designed to develop advanced competencies in computing, software engineering, and information technology. The programme prepares graduates for careers in technology, research, and academia.",
    applyLink: "/auth/signup",
    admissionRequirements: {
      sections: [
        {
          title: "General Entry Qualifications",
          points: [
            "Graduates of Precious Cornerstone University or other recognized Universities with a degree in Computer Science, Information Technology, or related discipline.",
            "Candidates must have obtained a minimum of Second-Class Lower Division in their first degree.",
            "HND holders with Upper Credit from recognized tertiary institutions may also apply.",
          ],
        },
      ],
    },
    areaOfSpecialization: {
      intro:
        "Candidate shall choose from the following areas of research in the department for specialization:",
      areas: [
        "Artificial Intelligence & Machine Learning",
        "Software Engineering",
        "Cybersecurity",
        "Data Science & Analytics",
        "Computer Networks",
        "Human-Computer Interaction",
      ],
    },
    programmesDuration: {
      sections: [
        {
          title: "Master's Degree Programmes",
          points: [
            "Full-time: A Minimum of four (4) semesters and a maximum of six (6) semesters",
            "Part-time: A minimum of six (6) semesters and a maximum of eight (8) semesters.",
            "For extension beyond the specified maximum period, a special permission of the Postgraduate Board shall be required",
          ],
        },
        {
          title: "Ph.D. Programme",
          points: [
            "Full-time: A Minimum of six (6) semesters, a maximum of ten (10) semesters.",
            "Part-time: A minimum of Ten (10) semesters and a maximum of twelve (12) semesters.",
          ],
        },
      ],
    },
  },
];
