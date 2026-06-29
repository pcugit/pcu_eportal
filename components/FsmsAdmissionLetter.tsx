import React from "react";

interface FsmsAdmissionLetterProps {
  candidateName: string;
  programme?: string;
  level?: string;
  department?: string;
  faculty?: string;
  session?: string;
  mode?: string;
  date?: string;
  resumptionDate?: string;
  acceptanceFee?: string;
  tuition?: string;
  otherFees?: string;
  reference?: string;
}

export default function FsmsAdmissionLetter({
  candidateName,
  programme = "Mass Communication",
  session = "2025/2026",
  date = "10 October, 2025",
  resumptionDate = "Sunday, 19 October, 2025",
  acceptanceFee = "NGN 20,000.00",
  tuition = "NGN 177,000.00",
  reference = "PCU/ADM/2025",
}: FsmsAdmissionLetterProps) {
  const programmeUpper = programme.toUpperCase();

  const containerStyle: React.CSSProperties = {
    fontFamily: "Calibri, Arial, sans-serif",
    fontSize: "14px",
    lineHeight: 1.5,
    padding: "30px 56px",
    maxWidth: "794px",
    margin: "0 auto",
    color: "#000",
    backgroundColor: "#fff",
    textAlign: "justify",
  };

  const rowNumberStyle: React.CSSProperties = {
    width: "45px",
    textAlign: "center",
    verticalAlign: "top",
    fontWeight: "bold",
  };

  const rowTextStyle: React.CSSProperties = {
    verticalAlign: "top",
    paddingBottom: "0px",
  };

  const subListNumberStyle: React.CSSProperties = {
    width: "40px",
    verticalAlign: "top",
  };

  return (
    <div style={containerStyle}>
      <table style={{ width: "100%", marginBottom: "10px" }}>
        <tbody>
          <tr>
            <td style={{ width: "15%", verticalAlign: "middle", textAlign: "left" }}>
              <img
                src="/e-portal/images/logo new.png"
                alt="Logo"
                style={{ width: "80px", height: "80px", objectFit: "contain" }}
              />
            </td>
            <td style={{ width: "85%", verticalAlign: "middle", textAlign: "center" }}>
              <div style={{ fontSize: "17px", fontWeight: "bold", marginBottom: "2px" }}>
                PRECIOUS CORNERSTONE UNIVERSITY
              </div>
              <div style={{ fontSize: "11px", lineHeight: 1.2 }}>
                Garden of Victory, Olaogun Street, Old Ife Road,
                <br />
                P.M.B. 60, Agodi Post Office, Ibadan, Oyo State.
                <br />A Tertiary Institution of The Sword of The Spirit Ministries
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div
        style={{
          textAlign: "center",
          fontWeight: "bold",
          fontSize: "15px",
          marginTop: "5px",
          marginBottom: "7px",
        }}
      >
        OFFICE OF THE REGISTRAR
      </div>

      <table style={{ width: "100%", marginBottom: "7px", fontSize: "11px", lineHeight: 1.5 }}>
        <tbody>
          <tr>
            <td style={{ verticalAlign: "top", width: "60%" }}>
              <b>Registrar</b>
              <br />
              <b>Mrs. Morenike F. Afolabi</b>{" "}
              <span style={{ fontSize: "11px" }}>
                B.A, MPA (Ife), M.ED (IB), MNIM, MANUPA, IPMA (UK)
              </span>
            </td>
            <td style={{ verticalAlign: "top", width: "40%", textAlign: "right" }}>
              <b>Phone:</b> +2348033931410
              <br />
              <b>Email:</b>{" "}
              <span style={{ color: "blue", textDecoration: "underline" }}>
                registrar@pcu.edu.ng
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", marginTop: "7px", marginBottom: "7px" }}>
        <tbody>
          <tr>
            <td style={{ textAlign: "left", fontSize: "12px" }}>
              <b>Ref:</b> {reference}
            </td>
            <td style={{ textAlign: "right", fontSize: "12px" }}>
              <b>Date:</b> {date}
            </td>
          </tr>
        </tbody>
      </table>

      <div
        style={{
          fontWeight: "bold",
          marginTop: "7px",
          marginBottom: "10px",
          fontSize: "13px",
        }}
      >
        Dear {candidateName},
      </div>

      <div
        style={{
          textAlign: "center",
          fontWeight: "bold",
          marginBottom: "15px",
          fontSize: "15px",
        }}
      >
        OFFER OF PROVISIONAL ADMISSION INTO THE {programmeUpper} PROGRAMME OF THE
        PRECIOUS CORNERSTONE UNIVERSITY FOR THE {session} SESSION
      </div>

      <table style={{ width: "100%" }}>
        <tbody>
          <tr>
            <td style={rowNumberStyle}>1.</td>
            <td style={rowTextStyle}>
              I write to inform you that you have been offered a provisional admission into{" "}
              {programme} programme for the {session} academic session at the Precious
              Cornerstone University (PCU), Ibadan.
            </td>
          </tr>
          <tr>
            <td style={rowNumberStyle}>2.</td>
            <td style={rowTextStyle}>
              Please note that this offer is on the condition that you possess the minimum
              qualification of admission into the programme and if it is discovered at any
              time, that you do not possess the qualification which you claim to have
              obtained, you will be required to withdraw from the University.
            </td>
          </tr>
          <tr>
            <td style={rowNumberStyle}>3.</td>
            <td style={rowTextStyle}>
              At the time of registration, you will be required to present the original and
              four (4) photocopies of each of the following:
              <table style={{ marginTop: "0px", marginLeft: "20px" }}>
                <tbody>
                  <tr>
                    <td style={subListNumberStyle}>(i.)</td>
                    <td>
                      Letter of Admission into the University issued by Precious
                      Cornerstone University, Ibadan.
                    </td>
                  </tr>
                  <tr>
                    <td style={subListNumberStyle}>(ii.)</td>
                    <td>O&apos;Level Result (WAEC/NECO SSCE) Results.</td>
                  </tr>
                  <tr>
                    <td style={subListNumberStyle}>(iii.)</td>
                    <td>Birth Certificate or sworn declaration of age.</td>
                  </tr>
                  <tr>
                    <td style={subListNumberStyle}>(iv.)</td>
                    <td>
                      Letter of Attestation from three (3) reputable personalities vouching
                      for your good behaviour and conduct throughout your stay of {programme}.
                    </td>
                  </tr>
                  <tr>
                    <td style={subListNumberStyle}>(v.)</td>
                    <td>
                      Conduct a medical examination from any reputable Government Hospital
                      using the prescribed form attached. Present the report to the University
                      Health Centre and obtain Certificate of medical fitness from the
                      University Medical Centre.
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
          <tr>
            <td style={rowNumberStyle}>4.</td>
            <td style={rowTextStyle}>
              The scheduled School fee is detailed below:
              <table style={{ marginLeft: "45px", marginTop: "0px", fontWeight: "bold" }}>
                <tbody>
                  <tr>
                    <td style={{ width: "260px", fontWeight: "bold" }}>Tuition</td>
                    <td style={{ fontWeight: "bold" }}>{tuition}</td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
          <tr>
            <td style={rowNumberStyle}>5.</td>
            <td style={rowTextStyle}>
              Please ensure the payment of the Acceptance fee of{" "}
              <b>{acceptanceFee}</b>, at least two (2) weeks upon the receipt of
              the admission letter.
            </td>
          </tr>
          <tr>
            <td style={rowNumberStyle}>6.</td>
            <td style={rowTextStyle}>All payments should be made through the authorized portal.</td>
          </tr>
          <tr>
            <td style={rowNumberStyle}>7.</td>
            <td style={rowTextStyle}>
              The date of resumption for the {session} academic session is slated
              for <b>{resumptionDate}</b>.
            </td>
          </tr>
          <tr>
            <td style={rowNumberStyle}>8.</td>
            <td style={rowTextStyle}>
              <b>Feeding is on Pay as you eat Basis</b>
              <br />
              Accept my congratulations on your admission.
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: "5px" }}>
        <img
          src="/e-portal/images/registrar-signature.png"
          alt="Signature"
          style={{ display: "block", height: "35px", marginBottom: "2px" }}
        />
        <b>Mrs. Morenike F. Afolabi</b>
      </div>
    </div>
  );
}
