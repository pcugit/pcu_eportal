import ExcelJS from "exceljs"
import { saveAs } from "file-saver"
import type { DepartmentGroup, SavedResult } from "@/lib/storage"

export interface MasterListDownload {
  departments: DepartmentGroup[]
  session: string
  semester: string
  scope: "department" | "overall"
  programme: "UG" | "PG"
}

const thin = { style: "thin", color: { argb: "FF000000" } } as const
const borders = { top: thin, bottom: thin, left: thin, right: thin }
const headerStyle = {
  font: { name: "Arial", bold: true, size: 8 },
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } } as ExcelJS.Fill,
  alignment: { horizontal: "center", vertical: "middle", wrapText: true } as Partial<ExcelJS.Alignment>,
  border: borders,
}

function grade(score: number) {
  if (score >= 70) return "A"
  if (score >= 60) return "B"
  if (score >= 50) return "C"
  if (score >= 45) return "D"
  if (score >= 40) return "E"
  return "F"
}

function classification(gpa: number) {
  if (gpa >= 4.5) return "First Class"
  if (gpa >= 3.5) return "Second Class Upper"
  if (gpa >= 2.4) return "Second Class Lower"
  if (gpa >= 1.5) return "Third Class"
  return "Probation"
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_")
}

function sheetName(value: string, used: Set<string>) {
  const base = value.replace(/[\\/*?:[\]]/g, " ").trim().substring(0, 31) || "Master List"
  let candidate = base
  let suffix = 2
  while (used.has(candidate.toLowerCase())) {
    const end = ` ${suffix++}`
    candidate = `${base.substring(0, 31 - end.length)}${end}`
  }
  used.add(candidate.toLowerCase())
  return candidate
}

function styleCell(cell: ExcelJS.Cell, style: Partial<ExcelJS.Style>) {
  if (style.font) cell.font = style.font
  if (style.fill) cell.fill = style.fill
  if (style.alignment) cell.alignment = style.alignment
  if (style.border) cell.border = style.border
}

function mergeStyled(
  worksheet: ExcelJS.Worksheet,
  fromRow: number,
  fromColumn: number,
  toRow: number,
  toColumn: number,
  value: string,
  style: Partial<ExcelJS.Style>,
) {
  worksheet.mergeCells(fromRow, fromColumn, toRow, toColumn)
  const cell = worksheet.getCell(fromRow, fromColumn)
  cell.value = value
  styleCell(cell, style)
}

function addMasterSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  department: DepartmentGroup,
  students: SavedResult[],
  session: string,
  semester: string,
  logoImageId?: number,
) {
  const worksheet = workbook.addWorksheet(name, {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    views: [{ showGridLines: true }],
  })
  const courses = new Map<string, { code: string; unit: number }>()
  students.forEach(student => student.courses.forEach(course => {
    if (!courses.has(course.code)) courses.set(course.code, { code: course.code, unit: Number(course.unit || 0) })
  }))
  const courseList = [...courses.values()].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))

  const firstCourseColumn = 4
  const tcuColumn = firstCourseColumn + courseList.length
  const summaryLabels = ["TCU", "TCP", "GPA", "TUP", "TUF", "CTCU", "CTCP", "CGPA", "CTUP", "Status"]
  const lastColumn = tcuColumn + summaryLabels.length - 1
  worksheet.columns = Array.from({ length: lastColumn }, (_, index) => ({
    width: index === 0 ? 5 : index === 1 ? 14 : index === 2 ? 22 : index < tcuColumn - 1 ? 8 : 7,
  }))

  const titleStyle: Partial<ExcelJS.Style> = {
    font: { name: "Times New Roman", bold: true, size: 11 },
    alignment: { horizontal: "center", vertical: "middle", wrapText: true },
  }
  mergeStyled(worksheet, 1, 3, 1, lastColumn, "PRECIOUS CORNERSTONE UNIVERSITY", { ...titleStyle, font: { ...titleStyle.font, size: 13 } })
  mergeStyled(worksheet, 2, 3, 2, lastColumn, `Faculty of ${department.faculty || "-"}`, titleStyle)
  mergeStyled(worksheet, 3, 3, 3, lastColumn, `Department of ${department.name}`, titleStyle)
  mergeStyled(worksheet, 4, 3, 4, lastColumn, `${department.name} Result Summary`, titleStyle)
  const level = String(students[0]?.studentInfo.level || "-").replace(/\s*L$/i, "")
  mergeStyled(worksheet, 5, 3, 5, lastColumn, `Academic Session: ${session}     Semester: ${semester.toUpperCase()}     Level: ${level}`, titleStyle)
  worksheet.getRow(1).height = 24
  if (logoImageId !== undefined) {
    worksheet.addImage(logoImageId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 72, height: 72 } })
  }

  const headerRow = 7
  ;[[1, "S/N"], [2, "Matric No"], [3, "Name"]].forEach(([column, label]) => {
    worksheet.mergeCells(headerRow, Number(column), headerRow + 2, Number(column))
    const cell = worksheet.getCell(headerRow, Number(column))
    cell.value = String(label)
    styleCell(cell, headerStyle)
  })
  courseList.forEach((course, index) => {
    const column = firstCourseColumn + index
    ;[course.code, `(${course.unit})`, "C"].forEach((value, offset) => {
      const cell = worksheet.getCell(headerRow + offset, column)
      cell.value = value
      styleCell(cell, headerStyle)
    })
  })
  summaryLabels.forEach((label, index) => {
    const column = tcuColumn + index
    worksheet.mergeCells(headerRow, column, headerRow + 2, column)
    const cell = worksheet.getCell(headerRow, column)
    cell.value = label
    styleCell(cell, headerStyle)
  })

  const counts: Record<string, number> = {
    "First Class": 0,
    "Second Class Upper": 0,
    "Second Class Lower": 0,
    "Third Class": 0,
    Probation: 0,
  }
  let rowNumber = headerRow + 3
  students
    .slice()
    .sort((a, b) => a.studentInfo.matricNumber.localeCompare(b.studentInfo.matricNumber, undefined, { numeric: true }))
    .forEach((student, index) => {
      const courseMap = new Map(student.courses.map(course => [course.code, course]))
      const totalUnits = Number(student.calculations.totalUnits || 0)
      const totalPassed = Number(student.calculations.totalUnitsPassed || 0)
      const totalWgp = Number(student.calculations.totalWGP || 0)
      const gpa = Number(student.calculations.cgpa || 0)
      const cumulative = student.calculations as SavedResult["calculations"] & {
        cumulativeTotalUnits?: number
        cumulativeTotalWGP?: number
        cumulativeTotalUnitsPassed?: number
        cumulativeCGPA?: string
      }
      const cumulativeUnits = Number(cumulative.cumulativeTotalUnits ?? totalUnits)
      const cumulativeWgp = Number(cumulative.cumulativeTotalWGP ?? totalWgp)
      const cumulativePassed = Number(cumulative.cumulativeTotalUnitsPassed ?? totalPassed)
      const cumulativeGpa = Number(cumulative.cumulativeCGPA ?? gpa)
      counts[classification(cumulativeGpa)] += 1
      const values: Array<string | number> = [index + 1, student.studentInfo.matricNumber, student.studentInfo.name]
      courseList.forEach(course => {
        const result = courseMap.get(course.code)
        values.push(result ? `${result.score}\n(${result.remark || grade(result.score)})` : "-")
      })
      values.push(totalUnits, totalWgp, gpa, totalPassed, totalUnits - totalPassed, cumulativeUnits, cumulativeWgp, cumulativeGpa, cumulativePassed, "")
      const row = worksheet.getRow(rowNumber)
      values.forEach((value, index) => {
        const cell = row.getCell(index + 1)
        cell.value = value
        cell.font = { name: "Arial", size: 8, bold: index === 2 }
        cell.alignment = { horizontal: index === 2 ? "left" : "center", vertical: "middle", wrapText: true }
        cell.border = borders
      })
      row.height = 32
      rowNumber += 1
      const failed = student.courses.filter(course => course.score < 40).map(course => `${course.code} (${course.unit})`).join(", ")
      mergeStyled(worksheet, rowNumber, 1, rowNumber, lastColumn, `Failed Courses:${failed ? ` ${failed}` : ""}`, {
        font: { name: "Arial", size: 8, italic: true, color: { argb: "FF000000" } },
        alignment: { horizontal: "left", vertical: "middle" },
        border: { bottom: thin, left: thin, right: thin },
      })
      rowNumber += 1
    })

  rowNumber += 1
  const classLabels = Object.keys(counts)
  const span = Math.max(1, Math.floor(lastColumn / classLabels.length))
  classLabels.forEach((label, index) => {
    const start = index * span + 1
    const end = index === classLabels.length - 1 ? lastColumn : Math.min(lastColumn, start + span - 1)
    mergeStyled(worksheet, rowNumber, start, rowNumber, end, label, headerStyle)
    mergeStyled(worksheet, rowNumber + 1, start, rowNumber + 1, end, String(counts[label]), {
      font: { name: "Arial", bold: true, size: 10 },
      alignment: { horizontal: "center", vertical: "middle" },
      border: borders,
    })
  })
  rowNumber += 4
  const signatures = ["HOD's Signature and Date", "Dean's Signature and Date", "Chairman CODD's Signature and Date", "Senate's Approval and Date"]
  const signatureSpan = Math.max(1, Math.floor(lastColumn / signatures.length))
  signatures.forEach((label, index) => {
    const start = index * signatureSpan + 1
    const end = index === signatures.length - 1 ? lastColumn : Math.min(lastColumn, start + signatureSpan - 1)
    mergeStyled(worksheet, rowNumber, start, rowNumber, end, label, {
      font: { name: "Arial", size: 8 }, alignment: { horizontal: "center", vertical: "bottom" },
      border: { top: { style: "medium", color: { argb: "FF000000" } } },
    })
  })
  worksheet.pageSetup.printArea = `A1:${worksheet.getColumn(lastColumn).letter}${rowNumber}`
}

export async function downloadMasterList(options: MasterListDownload) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "PCU Result Portal"
  workbook.created = new Date()
  let logoImageId: number | undefined
  try {
    const response = await fetch("/e-portal/images/logo new.png")
    if (response.ok) {
      logoImageId = workbook.addImage({ buffer: await response.arrayBuffer(), extension: "png" })
    }
  } catch {}

  const usedNames = new Set<string>()
  options.departments.forEach(department => {
    const session = department.sessions.find(item => String(item.name) === options.session)
    const semester = session?.semesters.find(item => item.name === options.semester)
    if (!semester) return
    const levels = new Map<string, SavedResult[]>()
    semester.students.forEach(student => {
      const level = String(student.studentInfo.level || "Unknown")
      levels.set(level, [...(levels.get(level) || []), student])
    })
    levels.forEach((students, level) => {
      const name = sheetName(`${department.name} ${level}L`, usedNames)
      addMasterSheet(workbook, name, department, students, options.session, options.semester, logoImageId)
    })
  })
  if (!workbook.worksheets.length) throw new Error("No processed results were found for the selected period")

  const buffer = await workbook.xlsx.writeBuffer()
  const scopeName = options.scope === "overall" ? "Overall" : options.departments[0]?.name || "Department"
  saveAs(
    new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `MasterList_${options.programme}_${safeName(scopeName)}_${safeName(options.session)}_${safeName(options.semester)}.xlsx`,
  )
}
