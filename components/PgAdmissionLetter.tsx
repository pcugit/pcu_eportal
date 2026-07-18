import React from "react";

interface PgAdmissionLetterProps {
  candidateName: string;
  candidateAddress?: string;
  programme?: string;
  department?: string;
  faculty?: string;
  session?: string;
  degree?: string;
  mode?: string;
  supervisor?: string;
  date?: string;
  reference?: string;
  logoSrc?: string;
  signatureSrc?: string;
}

/**
 * PgAdmissionLetter
 *
 * A separate postgraduate admission letter template. This component does not
 * affect the existing FSMS, undergraduate, part-time, or PDF generator logic.
 */
export default function PgAdmissionLetter({
  candidateName,
  candidateAddress = "24 Adebyi Street, Yaba Lagos.",
  programme = "Microbiology",
  department = "Microbiology",
  faculty = "Faculty of Social and Management Sciences",
  session = "2025/2026",
  degree = "MBA",
  mode = "Full Time",
  supervisor = "Dr. G.M. Sodeyide",
  date = "3rd December, 2025",
  reference = "2025/26 Admission",
  logoSrc = "/images/logo%20new.png",
  signatureSrc = "/e-portal/images/registrar-signature.png",
}: PgAdmissionLetterProps) {
  const pageStyle: React.CSSProperties = {
    width: "794px",
    minHeight: "1123px",
    boxSizing: "border-box",
    margin: "0 auto",
    padding: "68px 48px 24px",
    background: "#fff",
    color: "#000",
    fontFamily: "Times New Roman, Times, serif",
    fontSize: "10px",
    lineHeight: 1.32,
  };

  const bold: React.CSSProperties = { fontWeight: "bold" };

  const headerTitle: React.CSSProperties = {
    ...bold,
    textAlign: "center",
    fontSize: "14px",
    lineHeight: 1.12,
    textTransform: "uppercase",
  };

  const twoColumns: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    alignItems: "start",
    gap: "24px",
  };

  const tightParagraph: React.CSSProperties = {
    margin: "0 0 3px",
  };

  const numberedRow: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "18px 1fr",
    gap: "5px",
    marginBottom: "8px",
    textAlign: "justify",
  };

  const conditions = [
    {
      label: "1.",
      content: (
        <>
          With reference to your application for admission to a higher degree of
          this University in the Department of {department}, it is my pleasure
          to inform you that the application is successful. Your registration
          will be on {mode} Basis for the degree of {degree} in the {session}{" "}
          academic session. Your supervisor shall be {supervisor}.
        </>
      ),
    },
    {
      label: "2.",
      content: (
        <>
          Please take note of the following conditions relating to your
          admission/registration:
          <ol
            type="a"
            style={{
              margin: "3px 0 0 18px",
              paddingLeft: "10px",
              lineHeight: 1.28,
            }}
          >
            <li>
              Higher Degree Students are expected to commence their courses at
              the beginning of the {session} session.
            </li>
            <li>
              You will be required to present the originals of your credentials
              before your academic registration can be completed.
            </li>
            <li>You will therefore be required to make appropriate payment.</li>
            <li>
              This offer is provisional and may be revoked if you fail to
              produce the documents above within a period of six weeks.
            </li>
          </ol>
        </>
      ),
    },
    {
      label: "3.",
      content:
        "Information on the Financial Regulations of the University for Higher Degree programmes is provided in the fee schedule attached to this email.",
    },
    {
      label: "4.",
      content: (
        <>
          For international students, when applying for entry permit or visa,
          you may be requested to furnish the Director-General, Federal Ministry
          of Internal Affairs, Abuja with the following items of information to
          accelerate the processing of your application:
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0 24px",
              marginTop: "3px",
              paddingLeft: "18px",
            }}
          >
            <div>
              <div>(a) Your nationality</div>
              <div>(b) Date and place of birth</div>
              <div>(c) Passport number, date and place of issue</div>
            </div>
            <div>
              <div>(d) Validity of passport</div>
              <div>
                (e) Anticipated length of stay at Precious Cornerstone
                University
              </div>
              <div>(f) Sponsorship</div>
            </div>
          </div>
        </>
      ),
    },
    {
      label: "5.",
      content:
        "It is important to note that a residence permit is necessary for the confirmation of an offer of admission.",
    },
    {
      label: "6.",
      content:
        "Very limited hall accommodation is available for full-time Higher Degree students and will be allocated on the basis of first-come first-served. Students are advised to get in touch with the Student Affairs Officer.",
    },
    {
      label: "7.",
      content:
        "You are required to register for your programme of study within six weeks of the beginning of the academic year and renew your registration annually until you finally complete the programme. Late Registration after six weeks will automatically attract penalty.",
    },
    {
      label: "8.",
      content:
        "If you accept the offer, the acceptance form will be sent to you via email. Kindly print and complete two copies of the form as provided.",
    },
    {
      label: "9.",
      content:
        "It is mandatory that you appear in person for clearance at the Admissions Office of the Postgraduate School. Please note that this offer will be revoked and your slot given to someone else if, within six weeks from the date of this letter, you have neither completed and returned the printed acceptance form nor submitted the originals of your credentials for clearance.",
    },
  ];

  return (
    <div style={pageStyle}>
      <header>
        <div style={headerTitle}>
          <div>Precious Cornerstone University, Ibadan</div>
          <div>The Postgraduate School</div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            width: "100%",
            margin: "7px 0 16px",
          }}
        >
          <img
            src={logoSrc}
            alt="Precious Cornerstone University logo"
            style={{
              display: "block",
              width: "36px",
              height: "36px",
              objectFit: "contain",
              margin: "0 auto",
            }}
          />
        </div>

        <div style={twoColumns}>
          <div style={bold}>
            <div>Precious Cornerstone University</div>
            <div>DEAN: Prof. J.A. Adegoke</div>
            <div>PhD (Ibadan),</div>
            <div>Mobile: +2348074767098</div>
            <div>E-mail: adegokeja@yahoo.com</div>
            <div>ja.adegoke@pcu.edu.ng</div>
          </div>

          <div style={{ ...bold, textAlign: "right" }}>
            <div>Registrar</div>
            <div>Mrs Morenike F. Afolabi</div>
            <div>Mobile: +2348033931410</div>
            <div>Email: registrar@pcu.edu.ng</div>
          </div>
        </div>
      </header>

      <main>
        <div style={{ ...twoColumns, marginTop: "20px" }}>
          <div style={bold}>
            <p style={tightParagraph}>{reference}</p>
            <p style={tightParagraph}>{candidateName}</p>
            <p style={tightParagraph}>{candidateAddress}</p>
          </div>

          <div style={{ ...bold, textAlign: "right", paddingTop: "8px" }}>
            <p style={tightParagraph}>Tel: 09122444300</p>
            <p style={{ ...tightParagraph, marginTop: "14px" }}>{date}</p>
          </div>
        </div>

        <p style={{ ...tightParagraph, marginTop: "8px" }}>
          Dear {candidateName},
        </p>

        <h1
          style={{
            margin: "12px 0 10px",
            textAlign: "center",
            fontSize: "10px",
            lineHeight: 1.25,
            fontWeight: "bold",
            textTransform: "uppercase",
          }}
        >
          Offer of Provisional Admission and Registration for Higher Degree
          Course
        </h1>

        <div>
          {conditions.map((item) => (
            <div key={item.label} style={numberedRow}>
              <div style={bold}>{item.label}</div>
              <div>{item.content}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.15fr 0.85fr",
            gap: "40px",
            marginTop: "18px",
            alignItems: "start",
          }}
        >
          <div>
            <p style={tightParagraph}>Cc: Dean, {faculty}</p>
            <p style={{ ...tightParagraph, marginLeft: "18px" }}>
              Head, Department of {programme || department}
            </p>
          </div>

          <div style={{ textAlign: "center" }}>
            <p style={tightParagraph}>Yours Sincerely</p>
            {signatureSrc ? (
              <img
                src={signatureSrc}
                alt="Registrar signature"
                style={{
                  width: "92px",
                  height: "34px",
                  objectFit: "contain",
                  display: "block",
                  margin: "0 auto",
                }}
              />
            ) : (
              <div style={{ height: "26px" }} />
            )}
            <p style={{ ...tightParagraph, ...bold }}>
              Mrs Morenike F. Afolabi
            </p>
            <p style={{ ...tightParagraph, ...bold }}>Registrar</p>
          </div>
        </div>

        <p style={{ ...tightParagraph, marginTop: "20px", ...bold }}>
          NB: This Offer of Admission is also subject to the receipt and
          authentication of your documents and certificates.
        </p>
      </main>
    </div>
  );
}
