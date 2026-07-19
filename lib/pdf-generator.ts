import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Course {
  id: string;
  code: string;
  title?: string;   // from DB
  unit: number;
  score: number;
  gradePoint: number;
  remark?: string;  // from DB
}

interface StudentInfo {
  name: string;
  matricNumber: string;
  level: string;
  faculty: string;
  department: string;
  academicSession: string;
  semester: string;
}

interface PDFData {
  studentInfo: StudentInfo;
  courses: Course[];
  totalUnits: number;
  totalUnitsPassed: number;
  totalWGP: number;
  cgpa: string;
}

function loadImageAsBase64(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = src;
  });
}

function scoreToGrade(score: number): string {
  if (score >= 70) return "A";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  if (score >= 45) return "D";
  if (score >= 40) return "E";
  return "F";
}

export async function generatePDF(
  data: PDFData,
  options?: { returnBlob?: boolean; programmeLabel?: string }
): Promise<Blob | void> {
  const doc = new jsPDF() as jsPDF & {
    autoTable: (options: any) => void;
    lastAutoTable: { finalY: number };
  };

  const primaryBlue: [number, number, number] = [37, 99, 235];
  const darkText: [number, number, number] = [15, 23, 42];

  try {
    const logoBase64 = await loadImageAsBase64("/e-portal/images/logo new.png");
    doc.addImage(logoBase64, "PNG", 20, 15, 25, 25);
  } catch (err) {
    console.warn("Logo failed to load:", err);
  }

  doc.setFont("times", "bold");
  doc.setFontSize(16);
  doc.text("PRECIOUS CORNERSTONE UNIVERSITY", 105, 22, { align: "center" });
  doc.setFontSize(11);
  doc.setFont("times", "normal");
  doc.text(options?.programmeLabel || "UNDERGRADUATE PROGRAMME", 105, 30, { align: "center" });
  doc.setFontSize(12);
  doc.setFont("times", "bold");
  doc.text("STUDENT PERSONAL ACADEMIC RECORD", 105, 38, { align: "center" });
  doc.setLineWidth(0.5);
  doc.line(20, 42, 190, 42);
  doc.setTextColor(...darkText);

  let infoY = 52;
  const labelX = 25;
  const valueX = 80;
  const lineGap = 7;

  doc.setFont("times", "normal");
  doc.setFontSize(11);

  const infoRows = [
    ["Matriculation Number", data.studentInfo.matricNumber],
    ["Name",                 data.studentInfo.name],
    ["Faculty",              data.studentInfo.faculty || "-"],
    ["Department",           data.studentInfo.department || "-"],
    ["Level",                data.studentInfo.level],
    ["Session",              data.studentInfo.academicSession],
    ["Semester",             data.studentInfo.semester],
  ];

  infoRows.forEach(([label, value]) => {
    doc.setFont("times", "bold");
    doc.text(`${label}:`, labelX, infoY);
    doc.setFont("times", "normal");
    doc.text(value, valueX, infoY);
    infoY += lineGap;
  });

  // ── Course table — now includes Course Title and Remark ──────────────────
  const tableData = data.courses.map((course) => [
    course.code,
    course.title ?? course.code,
    course.unit.toString(),
    course.score.toString(),
    scoreToGrade(course.score),
    course.gradePoint.toString(),
    (course.unit * course.gradePoint).toString(),
    course.remark ?? "",
  ]);

  autoTable(doc, {
    startY: infoY + 8,
    head: [["Code", "Course Title", "Units", "Score", "Grade", "GP", "WGP", "Remark"]],
    body: tableData,
    theme: "striped",
    headStyles: {
      fillColor: primaryBlue,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
      fontSize: 8,
    },
    bodyStyles: {
      textColor: darkText,
      halign: "center",
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: "left",  cellWidth: 22 },  // Code
      1: { halign: "left",  cellWidth: 60 },  // Course Title
      2: { cellWidth: 12 },                   // Units
      3: { cellWidth: 14 },                   // Score
      4: { cellWidth: 12 },                   // Grade
      5: { cellWidth: 10 },                   // GP
      6: { cellWidth: 13 },                   // WGP
      7: { halign: "left",  cellWidth: 22 },  // Remark
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 15;

  // ── Summary ──────────────────────────────────────────────────────────────
  doc.setFontSize(11);
  doc.setFont("times", "bold");

  doc.text("Total Units Registered:",          20, finalY);
  doc.setFont("times", "normal");
  doc.text(data.totalUnits.toString(),         80, finalY);

  doc.setFont("times", "bold");
  doc.text("Total Units Passed:",              20, finalY + 8);
  doc.setFont("times", "normal");
  doc.text(data.totalUnitsPassed.toString(),   80, finalY + 8);

  doc.setFont("times", "bold");
  doc.text("Total Weighted Grade Points:",     20, finalY + 16);
  doc.setFont("times", "normal");
  doc.text(data.totalWGP.toString(),           80, finalY + 16);

  doc.setFontSize(13);
  doc.setFont("times", "bold");
  doc.text("Cumulative Grade Point Average (CGPA):", 20, finalY + 28);
  doc.setFontSize(18);
  doc.setTextColor(...darkText);
  doc.text(data.cgpa, 130, finalY + 28);

  // ── Grade key ────────────────────────────────────────────────────────────
  doc.setTextColor(...darkText);
  doc.setFontSize(9);
  doc.setFont("times", "bold");
  doc.text("Grade Point Scale:", 20, finalY + 43);
  doc.setFont("times", "normal");

  const scales = [
    "A: 70–100 = 5 pts",
    "B: 60–69 = 4 pts",
    "C: 50–59 = 3 pts",
    "D: 45–49 = 2 pts",
    "E: 40–44 = 1 pt",
    "F: 0–39  = 0 pts",
  ];

  const scaleY = finalY + 50;
  scales.forEach((scale, index) => {
    const x = 20 + (index % 3) * 60;
    const y = scaleY + Math.floor(index / 3) * 7;
    doc.text(scale, x, y);
  });

  if (options?.returnBlob) return doc.output("blob");

  doc.save(`${data.studentInfo.name.replace(/\s+/g, "_")}_Result.pdf`);
}
