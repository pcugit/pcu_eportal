export interface AccordionSection {
  title: string;
  /** string = single paragraph | string[] = bullet list */
  content: string | string[];
}

export interface UndergraduateCourse {
  slug: string;
  degree: string;          // label on listing cards
  shortDescription: string; // shown on listing card
  heroImage: string;
  heroTitle: string;
  applyLink: string;
  shortSummary: string;    // shown above accordions on detail page
  accordions: AccordionSection[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED REQUIREMENTS TEXT (general section appears on every course)
// ─────────────────────────────────────────────────────────────────────────────
const generalRequirements = `GENERAL REQUIREMENTS: Admission shall be open to all, irrespective of gender, race, religion or political leanings. Applicants must satisfy all faculty and departmental requirements. A prospective candidate must not be less than 15 years of age.

Admission into the undergraduate programmes of the University would be either through the Universal Tertiary Matriculation Examination (UTME) or by Direct Entry (DE) as organised by the Joint Admissions and Matriculation Board (JAMB). However, 90% of applicants will be admitted through the UTME, while the remaining 10% will be by Direct Entry.

UTME (JAMB): Candidates applying for admission into the University through JAMB UTME must have a minimum score of 160, with subjects English, Mathematics, and other relevant subjects. Post-UTME screening will be conducted for all interested candidates to ensure that only the best students are admitted and to maintain high educational standards.

O'Levels: The candidate must have not less than five credit passes (at one sitting) or six credit passes (at two sittings) in SSCE or GCE O/L organised by WAEC or NECO, including English Language and Mathematics. Five Credit passes in English Language, Mathematics, and two other relevant courses are mandatory for all categories of students.

Direct Entry: GCE A' Level holders with a minimum of 9 points plus O' Level English and Mathematics, OND with a minimum of credit pass; or graduates of recognised related programmes may be considered for direct entry. Candidates need Two 'A' Level passes in relevant subjects.`;

const applyNowContent = `Visit our admissions portal to apply online: https://portal.pcu.edu.ng or call our admissions office on +234 908 485 94 96. Applications are reviewed on a rolling basis; early submission is strongly advised.`;

const documentsContent = [
  "Completed online application form",
  "O'Level result(s) – WAEC/NECO/NABTEB (original and photocopy)",
  "JAMB UTME result slip / Direct Entry form",
  "Birth certificate or Statutory Declaration of Age",
  "Local Government Identification letter",
  "Two (2) recent passport photographs",
  "Evidence of payment of application fee",
];

// ─────────────────────────────────────────────────────────────────────────────
export const undergraduateCourses: UndergraduateCourse[] = [
  {
    slug: "accounting",
    degree: "B.Sc in Accounting",
    shortDescription:
      "The general philosophy of the programme is to develop the mind, impart both theoretical and practical knowledge on individuals to develop self-confidence, be innovative and self-reliant in the fields of Accounting and Management.",
    heroImage: "/e-portal/images/students.jpg",
    heroTitle: "B.Sc Accounting",
    applyLink: "/auth/signup",
    shortSummary:
      "The general philosophy of the programme is to develop the mind, impart both theoretical and practical knowledge on individuals to develop self-confidence, be innovative and self-reliant in the fields of Accounting and Management.",
    accordions: [
      {
        title: "Overview",
        content: [
          "The general philosophy of the programme is to develop the mind, impart both theoretical and practical knowledge on individuals to develop self-confidence, be innovative and self-reliant in the fields of Accounting and Management.",
          "The objectives of the programme are to:",
          "– Provide the basic knowledge needed for preparing students for careers in industrial, commercial, public and other human organizations.",
          "– Equip the students with necessary skills and competence for recognizing, defining and taking appropriate decisions to solve management and accounting problems of an organisation.",
          "– Prepare students for the acquisition of professional competence required by national and international accounting bodies and provide a strong academic background for research and postgraduate studies.",
          "An accounting degree will provide students with foundation for a compelling and challenging future in business, commerce, industry and governance. It equips students with the ability to assess an organisation's financial health and make accurate recommendations for increasing its value.",
        ],
      },
      {
        title: "Requirements",
        content: generalRequirements +
          "\n\nSubject-Specific: Five credit passes including English Language, Mathematics, Economics, and any two of: Financial Accounting, Commerce, Government, Geography.",
      },
      {
        title: "Apply Now",
        content: applyNowContent,
      },
      {
        title: "Documents",
        content: documentsContent,
      },
    ],
  },
  {
    slug: "actuarial-science",
    degree: "B.Sc in Actuarial Science",
    shortDescription:
      "The Actuarial Science programme is to equip the students with theoretical knowledge and practical skills in order for them to work in Life and Non-life insurance companies, Consultancy; Government service and in the Stock exchange, Industry, Commerce and Academia.",
    heroImage: "/e-portal/images/students.jpg",
    heroTitle: "B.Sc Actuarial Science",
    applyLink: "/auth/signup",
    shortSummary:
      "The Actuarial Science programme is to equip the students with theoretical knowledge and practical skills in order for them to work in Life and Non-life insurance companies, Consultancy; Government service and in the Stock exchange, Industry, Commerce and Academia.",
    accordions: [
      {
        title: "Overview",
        content: [
          "The Actuarial Science programme is designed to equip students with theoretical knowledge and practical skills to work in Life and Non-life insurance companies, Consultancy, Government service, the Stock Exchange, Industry, Commerce and Academia.",
          "The objectives of the programme are to:",
          "– Train students in the mathematical and statistical techniques used in risk assessment and financial modelling.",
          "– Prepare graduates for professional actuarial examinations and careers in insurance, pensions, banking and investment.",
          "– Develop analytical and problem-solving skills applicable across a wide range of financial sectors.",
          "Graduates of the programme are well positioned to pursue professional qualifications with bodies such as the Institute and Faculty of Actuaries (IFoA) and the Casualty Actuarial Society (CAS).",
        ],
      },
      {
        title: "Requirements",
        content: generalRequirements +
          "\n\nSubject-Specific: Five credit passes including English Language, Mathematics, and at least one Science subject. A credit pass in Further Mathematics is an advantage.",
      },
      {
        title: "Apply Now",
        content: applyNowContent,
      },
      {
        title: "Documents",
        content: documentsContent,
      },
    ],
  },
  {
    slug: "banking-and-finance",
    degree: "B.Sc In Banking and Finance",
    shortDescription:
      "The programme is aimed at producing high calibre graduates of Banking and Finance who are appropriately trained and infused with all the qualities needed to provide professional leadership and contribute to the society.",
    heroImage: "/e-portal/images/students.jpg",
    heroTitle: "B.Sc Banking and Finance",
    applyLink: "/auth/signup",
    shortSummary:
      "The programme is aimed at producing high calibre graduates of Banking and Finance who are appropriately trained and infused with all the qualities needed to provide professional leadership and contribute to the society.",
    accordions: [
      {
        title: "Overview",
        content: [
          "The Banking and Finance programme is aimed at producing high-calibre graduates who are appropriately trained and infused with all the qualities needed to provide professional leadership and contribute to society.",
          "The objectives of the programme are to:",
          "– Produce graduates with a thorough knowledge of the principles and practices of banking and finance.",
          "– Equip students with the analytical tools and quantitative skills necessary for decision-making in financial institutions.",
          "– Prepare graduates for careers in commercial and investment banking, capital markets, the central bank, insurance, and financial consulting.",
          "The programme integrates theory with practice through case studies, industry placements, and interaction with professionals from Nigeria's financial sector.",
        ],
      },
      {
        title: "Requirements",
        content: generalRequirements +
          "\n\nSubject-Specific: Five credit passes including English Language, Mathematics, Economics, and any two of: Commerce, Financial Accounting, Government, Geography.",
      },
      {
        title: "Apply Now",
        content: applyNowContent,
      },
      {
        title: "Documents",
        content: documentsContent,
      },
    ],
  },
  {
    slug: "biochemistry",
    degree: "B.Sc in Biochemistry",
    shortDescription:
      "Biochemistry is the branch of science concerned with the chemical and physico-chemical processes and substances which occur within living organisms. The objective of the programme is to develop in students the ability to apply knowledge and skills to solve theoretical and practical problems.",
    heroImage: "/e-portal/images/students.jpg",
    heroTitle: "B.Sc Biochemistry",
    applyLink: "/auth/signup",
    shortSummary:
      "Biochemistry is the branch of science concerned with the chemical and physico-chemical processes and substances which occur within living organisms. The objective of the programme is to develop in students the ability to apply knowledge and skills to solve theoretical and practical problems.",
    accordions: [
      {
        title: "Overview",
        content: [
          "Biochemistry is the branch of science concerned with the chemical and physico-chemical processes and substances which occur within living organisms.",
          "The objectives of the programme are to:",
          "– Develop in students the ability to apply knowledge and skills to solve theoretical and practical biochemical problems.",
          "– Provide students with a solid grounding in chemistry, biology, and molecular sciences as applied to living systems.",
          "– Prepare graduates for careers in medicine, pharmaceuticals, agriculture, food science, and environmental management.",
          "Graduates of the programme may pursue further studies in medicine, pharmacy, molecular biology, and related postgraduate programmes.",
        ],
      },
      {
        title: "Requirements",
        content: generalRequirements +
          "\n\nSubject-Specific: Five credit passes including English Language, Mathematics, Chemistry, Biology, and Physics or Agricultural Science.",
      },
      {
        title: "Apply Now",
        content: applyNowContent,
      },
      {
        title: "Documents",
        content: documentsContent,
      },
    ],
  },
  {
    slug: "business-administration",
    degree: "B.Sc in Business Administration",
    shortDescription:
      "The curriculum of Business Administration is aimed at developing the mind and imparting theoretical and practical knowledge that will encourage self reliance in the individual and of the nation.",
    heroImage: "/e-portal/images/students.jpg",
    heroTitle: "B.Sc Business Administration",
    applyLink: "/auth/signup",
    shortSummary:
      "The curriculum of Business Administration is aimed at developing the mind and imparting theoretical and practical knowledge that will encourage self reliance in the individual and of the nation.",
    accordions: [
      {
        title: "Overview",
        content: [
          "The curriculum of Business Administration is aimed at developing the mind and imparting theoretical and practical knowledge that will encourage self-reliance in the individual and of the nation.",
          "The objectives of the programme are to:",
          "– Develop students' knowledge of management principles, organisational behaviour, and business strategy.",
          "– Train graduates to manage resources effectively and make sound business decisions in competitive environments.",
          "– Equip students with entrepreneurial skills needed to establish and grow their own enterprises.",
          "The programme offers exposure to real-world business challenges through case analyses, group projects, and industry interactions.",
        ],
      },
      {
        title: "Requirements",
        content: generalRequirements +
          "\n\nSubject-Specific: Five credit passes including English Language, Mathematics, Economics, and any two of: Commerce, Financial Accounting, Government, or a Social Science subject.",
      },
      {
        title: "Apply Now",
        content: applyNowContent,
      },
      {
        title: "Documents",
        content: documentsContent,
      },
    ],
  },
  {
    slug: "computer-science",
    degree: "B.Sc in Computer Science",
    shortDescription:
      "This programme has been designed to equip students with both theoretical and practical knowledge in the various field of computing including but not limited to programming and application development, computer hardware and architecture, networking, artificial intelligence, e.t.c",
    heroImage: "/e-portal/images/students.jpg",
    heroTitle: "B.Sc Computer Science",
    applyLink: "/auth/signup",
    shortSummary:
      "This programme has been designed to equip students with both theoretical and practical knowledge in the various field of computing including but not limited to programming and application development, computer hardware and architecture, networking, artificial intelligence, e.t.c",
    accordions: [
      {
        title: "Overview",
        content: [
          "The Computer Science programme is designed to equip students with both theoretical and practical knowledge across the various fields of computing.",
          "The objectives of the programme are to:",
          "– Train students in programming, algorithms, data structures, and software development methodologies.",
          "– Provide exposure to computer hardware and architecture, operating systems, networking, and cybersecurity.",
          "– Prepare graduates to apply artificial intelligence, machine learning, and data science techniques to solve real-world problems.",
          "Graduates of the programme are well positioned for careers in software engineering, data science, cybersecurity, and technology entrepreneurship.",
        ],
      },
      {
        title: "Requirements",
        content: generalRequirements +
          "\n\nSubject-Specific: Five credit passes including English Language, Mathematics, Physics, and any two of: Chemistry, Biology, Further Mathematics, Economics.",
      },
      {
        title: "Apply Now",
        content: applyNowContent,
      },
      {
        title: "Documents",
        content: documentsContent,
      },
    ],
  },
  {
    slug: "economics",
    degree: "B.Sc in Economics",
    shortDescription:
      "The programme will equip the students with a broad foundation in the field of social sciences, and ground them in the application of economic theory and the tools of economic analysis in solving human behavioural problems.",
    heroImage: "/e-portal/images/students.jpg",
    heroTitle: "B.Sc Economics",
    applyLink: "/auth/signup",
    shortSummary:
      "The programme will equip the students with a broad foundation in the field of social sciences, and ground them in the application of economic theory and the tools of economic analysis in solving human behavioural problems.",
    accordions: [
      {
        title: "Overview",
        content: [
          "The Economics programme will equip students with a broad foundation in the field of social sciences, grounding them in the application of economic theory and the tools of economic analysis.",
          "The objectives of the programme are to:",
          "– Provide students with a thorough understanding of microeconomic and macroeconomic theory.",
          "– Train students in quantitative methods and econometrics for empirical economic analysis.",
          "– Prepare graduates to apply economic reasoning to solving human behavioural and public policy problems.",
          "Graduates may pursue careers in government agencies, international organisations, financial institutions, research bodies, and academia.",
        ],
      },
      {
        title: "Requirements",
        content: generalRequirements +
          "\n\nSubject-Specific: Five credit passes including English Language, Mathematics, Economics, and any two of: Commerce, Financial Accounting, Government, Geography.",
      },
      {
        title: "Apply Now",
        content: applyNowContent,
      },
      {
        title: "Documents",
        content: documentsContent,
      },
    ],
  },
];
