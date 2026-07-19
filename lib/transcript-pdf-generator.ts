// lib/transcript-pdf-generator.ts
// Generates a sessional transcript PDF matching the PCU sample layout

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { StudentSessionTranscript } from './storage'

function loadImageAsBase64(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx?.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = src
  })
}

function scoreToGrade(score: number): string {
  if (score >= 70) return 'A'
  if (score >= 60) return 'B'
  if (score >= 50) return 'C'
  if (score >= 45) return 'D'
  if (score >= 40) return 'E'
  return 'F'
}


export async function generateTranscriptPDF(
  data: StudentSessionTranscript,
  options?: { returnBlob?: boolean; titleOverrides?: Record<string, string> }
): Promise<Blob | void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }) as any

  const primaryBlue  = [37, 99, 235]   as [number, number, number]
  const darkText     = [15, 23, 42]    as [number, number, number]
  const headerGray   = [51, 65, 85]    as [number, number, number]
  const lightBlue    = [239, 246, 255] as [number, number, number]

  const pageW    = 210
  const pageH    = 297
  const marginL  = 15
  const marginR  = 15
  const contentW = pageW - marginL - marginR

  let y = 15

  // ── Header ───────────────────────────────────────────────────────────────
  try {
    const logoBase64 = await loadImageAsBase64('/e-portal/images/logo new.png')
    doc.addImage(logoBase64, 'PNG', marginL, y, 22, 22)
  } catch { /* logo optional */ }

  doc.setFont('times', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...primaryBlue)
  doc.text('PRECIOUS CORNERSTONE UNIVERSITY', pageW / 2, y + 6, { align: 'center' })

  doc.setFontSize(10)
  doc.setFont('times', 'normal')
  doc.setTextColor(...darkText)
  doc.text('IBADAN, NIGERIA', pageW / 2, y + 12, { align: 'center' })
  doc.text('OFFICE OF THE REGISTRAR', pageW / 2, y + 17, { align: 'center' })

  doc.setFont('times', 'bold')
  doc.setFontSize(11)
  doc.text("STUDENT PERSONAL ACADEMIC TRANSCRIPT", pageW / 2, y + 24, { align: 'center' })

  doc.setDrawColor(...primaryBlue)
  doc.setLineWidth(0.8)
  doc.line(marginL, y + 27, pageW - marginR, y + 27)
  doc.setLineWidth(0.3)
  doc.line(marginL, y + 29, pageW - marginR, y + 29)

  y += 35

  // ── Candidate details ────────────────────────────────────────────────────
  doc.setFillColor(...lightBlue)
  doc.roundedRect(marginL, y, contentW, 40, 2, 2, 'F')

  doc.setFont('times', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...darkText)

  const col1X = marginL + 1
  const col1V = col1X + 28
  const col2X = marginL + contentW / 2 + 11
  const col2V = col2X + 35
  const rowH  = 6.5

  const leftDetails = [
    ['Name',            data.studentInfo.name],
    ['Matric Number',   data.studentInfo.matricNumber],
    ['Department',      data.studentInfo.department],
    ['Faculty',         data.studentInfo.faculty],
  ]
  const rightDetails = [
    ['Level',            data.studentInfo.level],
    ['Academic Session', data.studentInfo.academicSession],
    ['Degree Programme', 'B.Sc (Honours)'],
  ]

  leftDetails.forEach(([label, value], i) => {
    doc.setFont('times', 'bold')
    doc.text(`${label}:`, col1X, y + 7 + i * rowH)
    doc.setFont('times', 'normal')
    doc.text(value ?? '-', col1V, y + 7 + i * rowH)
  })
  rightDetails.forEach(([label, value], i) => {
    doc.setFont('times', 'bold')
    doc.text(`${label}:`, col2X, y + 7 + i * rowH)
    doc.setFont('times', 'normal')
    doc.text(value ?? '-', col2V, y + 7 + i * rowH)
  })

  y += 46

  // ── Semester blocks ──────────────────────────────────────────────────────
  for (const semester of data.semesters) {
    if (y > pageH - 70) { doc.addPage(); y = 15 }

    // Semester header bar
    doc.setFillColor(...primaryBlue)
    doc.roundedRect(marginL, y, contentW, 7, 1, 1, 'F')
    doc.setFont('times', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(255, 255, 255)
    doc.text(
      `${semester.sessionName || ''} — ${semester.name}`.toUpperCase(),
      marginL + 4, y + 5
    )
    doc.setTextColor(...darkText)
    y += 10

    // Course table — uses manually overridden title if available, otherwise DB title
    const tableBody = semester.courses.map((c) => [
      c.code,
      options?.titleOverrides?.[c.id] ?? c.title ?? c.code,
      c.unit.toString(),
      c.score.toString(),
      `${scoreToGrade(c.score)}`,
      c.gradePoint.toFixed(1),
      (c.unit * c.gradePoint).toFixed(1),
      (c.remark ?? '').toUpperCase(),
    ])

    autoTable(doc, {
      startY: y,
      head: [['Code', 'Course Title', 'Units', 'Score', 'Grade', 'GP', 'WGP', 'Remark']],
      body: tableBody,
      theme: 'grid',
      headStyles: {
        fillColor: headerGray,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
        halign: 'center',
        cellPadding: 2,
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: darkText,
        halign: 'center',
        cellPadding: 2,
      },
      columnStyles: {
        0: { cellWidth: 22, halign: 'left' },   // Code
        1: { cellWidth: 62, halign: 'left' },   // Course Title
        2: { cellWidth: 12 },                   // Units
        3: { cellWidth: 13 },                   // Score
        4: { cellWidth: 12 },                   // Grade
        5: { cellWidth: 11 },                   // GP
        6: { cellWidth: 12 },                   // WGP
        7: { cellWidth: 26, halign: 'center' }, // Remark
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: marginL, right: marginR },
    })

    y = doc.lastAutoTable.finalY + 3

    // Summary row
    doc.setFillColor(248, 250, 252)
    doc.rect(marginL, y, contentW, 14, 'F')
    doc.setDrawColor(203, 213, 225)
    doc.setLineWidth(0.3)
    doc.rect(marginL, y, contentW, 14)

    doc.setFont('times', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...darkText)

    doc.text(`Total Units Offered: ${semester.totalUnits}`,       marginL + 4,   y + 4.5)
    doc.text(`Total Units Passed: ${semester.totalUnitsPassed}`,  marginL + 55,  y + 4.5)
    doc.setFont('times', 'bold')
    doc.text(`Semester GPA: ${semester.semesterGPA}`,              marginL + 110, y + 4.5)

    doc.setFont('times', 'normal')
    doc.text(`Total WGP: ${semester.totalWGP.toFixed(1)}`,         marginL + 4,   y + 10)
    doc.setFont('times', 'bold')
    doc.setTextColor(...primaryBlue)
    doc.text(`Cumulative CGPA: ${semester.cumulativeCGPA}`,        marginL + 110, y + 10)
    doc.setTextColor(...darkText)

    y += 18
  }

  // ── Session overall summary ──────────────────────────────────────────────
  if (y > pageH - 45) { doc.addPage(); y = 15 }

  doc.setFillColor(...primaryBlue)
  doc.roundedRect(marginL, y, contentW, 7, 1, 1, 'F')
  doc.setFont('times', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text(`SESSION SUMMARY  ·  ${data.studentInfo.academicSession}`, marginL + 4, y + 5)
  doc.setTextColor(...darkText)
  y += 10

  doc.setFillColor(240, 249, 255)
  doc.roundedRect(marginL, y, contentW, 20, 2, 2, 'F')
  doc.setDrawColor(...primaryBlue)
  doc.setLineWidth(0.4)
  doc.roundedRect(marginL, y, contentW, 20, 2, 2)

  doc.setFont('times', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...darkText)

  doc.text(`Total Units Offered: ${data.sessionTotalUnits}`,       marginL + 4,   y + 7)
  doc.text(`Total Units Passed: ${data.sessionTotalUnitsPassed}`,  marginL + 60,  y + 7)
  doc.text(`Total WGP: ${data.sessionTotalWGP.toFixed(1)}`,         marginL + 115, y + 7)

  doc.setFont('times', 'bold')                        
  doc.setFontSize(10)
  doc.setTextColor(...primaryBlue)
  doc.text(`Overall CGPA: ${data.overallCGPA}`,                      marginL + 60,  y + 15)
  doc.setTextColor(...darkText)

  y += 26

  // ── Grade key ────────────────────────────────────────────────────────────
  if (y > pageH - 30) { doc.addPage(); y = 15 }

  doc.setFont('times', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(headerGray[0], headerGray[1], headerGray[2])
  doc.text('Key:', marginL, y + 4)
  doc.setFont('times', 'normal')
  const keys = [
    'A = 70–100 (5 pts)',
    'B = 60–69 (4 pts)',
    'C = 50–59 (3 pts)',
    'D = 45–49 (2 pts)',
    'E = 40–44 (1 pt)',
    'F = 0–39 (0 pts)',
  ]
  keys.forEach((k, i) => {
    doc.text(k, marginL + 12 + i * 30, y + 4)
  })

  y += 10

  // ── Footer ───────────────────────────────────────────────────────────────
  if (y > pageH - 20) { doc.addPage(); y = pageH - 20 }
  doc.setDrawColor(...primaryBlue)
  doc.setLineWidth(0.5)
  doc.line(marginL, y, pageW - marginR, y)
  doc.setFont('times', 'italic')
  doc.setFontSize(7.5)
  doc.setTextColor(100, 116, 139)
  doc.text(
    'This transcript is issued by the Office of the Registrar, Precious Cornerstone University, Ibadan.',
    pageW / 2, y + 4, { align: 'center' }
  )

  if (options?.returnBlob) return doc.output('blob')

  const safeName = `${data.studentInfo.name.replace(/\s+/g, '_')}_${data.studentInfo.academicSession.replace(/\//g, '-')}_Transcript.pdf`
  doc.save(safeName)
}
