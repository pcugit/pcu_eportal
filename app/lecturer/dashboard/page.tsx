"use client";
import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";
import { MasterListDownload } from "@/components/master-list-download";
import * as XLSX from "xlsx";

type Course = {
  assignment_id: number; course_id: number; course_code: string;
  course_title: string; credit_units: number; department: string;
  session: string; semester: string; enrolled_count: number;
  course_source?: "ug" | "pg"; programme_level?: string;
};
type Student = {
  student_id: number; matric_number: string; student_name: string;
  program_name: string; current_level: string;
  score_id?: number; ca_score?: number; exam_score?: number;
  total_score?: number; grade?: string; score_status?: string;
  amendment_pending?: boolean;
};
type StaffProfile = {
  department?: string;
};

function LecturerDashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading: authLoading, logout: authLogout } = useAuth();
  const [courses, setCourses]     = useState<Course[]>([]);
  const [selected, setSelected]   = useState<Course | null>(null);
  const [students, setStudents]   = useState<Student[]>([]);
  const [scoreDrafts, setScoreDrafts] = useState<Record<number, { ca_score: string; exam_score: string }>>({});
  const [savingScores, setSavingScores] = useState(false);
  const [submittingScores, setSubmittingScores] = useState(false);
  const [dirtyScoreIds, setDirtyScoreIds] = useState<Set<number>>(new Set());
  const [amendmentTarget, setAmendmentTarget] = useState<Student | null>(null);
  const [amendmentScores, setAmendmentScores] = useState({ ca: "", exam: "" });
  const [amendmentReason, setAmendmentReason] = useState("");
  const [amendmentError, setAmendmentError] = useState("");
  const [requestingAmendment, setRequestingAmendment] = useState(false);
  const [msg, setMsg]             = useState("");
  const [tab, setTab]             = useState<"courses" | "details" | "upload" | "submissions" | "master-list">("courses");
  const uploadInputRef            = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview]     = useState<any>(null);
  const [history, setHistory]     = useState<any[]>([]);
  const [isLocked, setIsLocked]   = useState(false);
  const [sysSettings, setSysSettings] = useState<any>(null);
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const requestedTab = searchParams.get("tab");

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !["lecturer","deo","hod","admin"].includes(user?.role ?? "")) {
      router.push("/staff/login");
      return;
    }
    loadCourses();
    loadStaffProfile();
    if (user?.id) loadHistory(user.id);
    checkPortalLock();
    loadSysSettings();
  }, [isAuthenticated, user, authLoading, router]);

  useEffect(() => {
    if (requestedTab === "courses" || requestedTab === "upload" || requestedTab === "submissions" || (requestedTab === "master-list" && user?.role === "deo")) {
      setTab(requestedTab);
      return;
    }

    if (!requestedTab && (tab === "upload" || tab === "submissions" || tab === "master-list")) {
      setTab("courses");
    }
  }, [requestedTab, user?.role]);

  useEffect(() => {
    setMsg("");
  }, [tab]);

  useEffect(() => {
    if (!msg) return;
    const timer = window.setTimeout(() => setMsg(""), 5000);
    return () => window.clearTimeout(timer);
  }, [msg]);

  async function loadSysSettings() {
    try {
      const settings = await ApiClient.getGlobalSettings();
      setSysSettings(settings);
    } catch {}
  }

  async function checkPortalLock() {
    try {
      const { data } = await ApiClient.fetch("/settings/result_upload_locked");
      setIsLocked(data.value === "true");
    } catch {}
  }

  async function loadHistory(staffId: number) {
    try {
      const [{ data: ug }, { data: pg }] = await Promise.all([
        ApiClient.fetch(`/results/pending?staffId=${staffId}`),
        ApiClient.fetch(`/pg-results/pending?staffId=${staffId}`),
      ]);
      setHistory([...(ug || []), ...(pg || []).map((item: any) => ({ ...item, programme_level: "Postgraduate" }))]);
    } catch {}
  }

  async function loadCourses() {
    try {
      const res = await ApiClient.fetch<any>("/staff/courses");
      setCourses(res.data?.courses ?? []);
    } catch { /* handled */ }
  }

  async function selectCourse(course: Course) {
    setSelected(course);
    setTab("details");
    try {
      const [res, amendmentRes] = await Promise.all([
        ApiClient.fetch<any>(
          `/staff/courses/${course.course_id}/students?session=${course.session}&semester=${course.semester}&course_source=${course.course_source || "ug"}`),
        ApiClient.fetch<any>("/scores/amendments?status=pending"),
      ]);
      const pendingScoreIds = new Set<number>(
        (amendmentRes.data?.amendments || [])
          .filter((item: any) => item.course_source === (course.course_source || "ug"))
          .map((item: any) => Number(item.score_id))
      );
      const rows = (res.data?.students ?? []).map((student: Student) => ({
        ...student,
        amendment_pending: student.score_id ? pendingScoreIds.has(Number(student.score_id)) : false,
      }));
      setStudents(rows);
      setScoreDrafts(Object.fromEntries(rows.map((s: Student) => [
        s.student_id,
        {
          ca_score: scoreDraftValue(s.ca_score),
          exam_score: scoreDraftValue(s.exam_score),
        },
      ])));
      setDirtyScoreIds(new Set());
    } catch (e: any) { setMsg(e.message); }
  }

  async function loadStaffProfile() {
    try {
      const { data } = await ApiClient.fetch<any>("/staff/profile");
      setStaffProfile(data?.staff ?? null);
    } catch { /* handled when the template is downloaded */ }
  }

  function updateScoreDraft(studentId: number, field: "ca_score" | "exam_score", value: string) {
    if (value !== "" && !/^\d{0,3}(\.\d{0,2})?$/.test(value)) return;
    setScoreDrafts(prev => ({
      ...prev,
      [studentId]: {
        ca_score: prev[studentId]?.ca_score ?? "",
        exam_score: prev[studentId]?.exam_score ?? "",
        [field]: value,
      },
    }));
    setDirtyScoreIds(prev => new Set(prev).add(studentId));
  }

  function scoreDraftValue(value: number | undefined) {
    return value == null ? "" : String(value);
  }

  function scoreNumber(value: string | undefined) {
    if (!value) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function scoreRequestValue(value: string | undefined) {
    if (value == null || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function scoreFieldError(field: "ca_score" | "exam_score", value: string) {
    if (value === "") return "";
    const score = Number(value);
    const maximum = field === "ca_score" ? 30 : 70;
    if (!Number.isFinite(score) || score < 0 || score > maximum) {
      return `${field === "ca_score" ? "CA" : "Exam"} must be 0-${maximum}`;
    }
    return "";
  }

  function gradeForTotal(total: number) {
    if (total >= 70) return "A";
    if (total >= 60) return "B";
    if (total >= 50) return "C";
    if (total >= 45) return "D";
    if (total >= 40) return "E";
    return "F";
  }

  function buildCourseScores() {
    return students.map(s => {
      const draft = scoreDrafts[s.student_id] || { ca_score: "", exam_score: "" };
      return {
        student_id: s.student_id,
        matric_number: s.matric_number,
        ca_score: scoreRequestValue(draft.ca_score),
        exam_score: scoreRequestValue(draft.exam_score),
        ca_error: scoreFieldError("ca_score", draft.ca_score),
        exam_error: scoreFieldError("exam_score", draft.exam_score),
      };
    });
  }

  function scoreValidationMessage(scores: ReturnType<typeof buildCourseScores>, requireComplete = false) {
    const invalid = scores.find(score => score.ca_error || score.exam_error);
    if (invalid) return `${invalid.matric_number}: ${invalid.ca_error || invalid.exam_error}`;
    if (requireComplete) {
      const incomplete = scores.find(score => score.ca_score == null || score.exam_score == null);
      if (incomplete) return `${incomplete.matric_number}: CA and exam scores are required before submission`;
    }
    return "";
  }

  async function persistCourseScores(scores: ReturnType<typeof buildCourseScores>) {
    if (!selected) return;
    const { data } = await ApiClient.fetch("/scores/enter", {
      method: "POST",
      body: JSON.stringify({
        course_id: selected.course_id,
        course_source: selected.course_source || "ug",
        session: selected.session,
        semester: selected.semester,
        scores: scores.map(({ student_id, ca_score, exam_score }) => ({ student_id, ca_score, exam_score })),
      }),
    });
    if (data?.errors?.length) {
      throw new Error(data.errors.map((item: any) => item.message).join("; "));
    }
  }

  async function saveCourseScores() {
    if (!selected) return;
    const scores = buildCourseScores();
    const validationMessage = scoreValidationMessage(scores);
    if (validationMessage) {
      setMsg(validationMessage);
      return;
    }
    setSavingScores(true);
    setMsg("");
    try {
      await persistCourseScores(scores);
      setMsg("Scores saved as draft.");
      await selectCourse(selected);
    } catch (err: any) {
      setMsg(err.message || "Failed to save score drafts.");
    } finally {
      setSavingScores(false);
    }
  }

  async function submitCourseScores() {
    if (!selected) return;
    const scores = buildCourseScores();
    const validationMessage = scoreValidationMessage(scores, true);
    if (validationMessage) {
      setMsg(validationMessage);
      return;
    }

    setSubmittingScores(true);
    setMsg("");
    try {
      await persistCourseScores(scores);

      const courseSource = selected.course_source || "ug";
      const scoreByStudent = new Map(scores.map(score => [score.student_id, score]));
      const processorPayload = students.map(student => {
        const score = scoreByStudent.get(student.student_id)!;
        return {
          studentInfo: {
            name: student.student_name,
            matricNumber: student.matric_number,
            level: student.current_level,
            faculty: courseSource === "pg" ? "The Postgraduate School" : "",
            department: selected.department,
            academicSession: selected.session,
            semester: selected.semester,
          },
          courses: [{
            code: selected.course_code,
            title: selected.course_title,
            unit: selected.credit_units,
            ca: Number(score.ca_score),
            exam: Number(score.exam_score),
            score: Number(score.ca_score) + Number(score.exam_score),
          }],
        };
      });
      const submissionName = `${selected.course_code} - ${selected.session} - ${selected.semester} - Manual Scores`;
      const { data: submissionData } = await ApiClient.fetch("/scores/submit", {
        method: "POST",
        body: JSON.stringify({
          course_id: selected.course_id,
          course_source: courseSource,
          session: selected.session,
          semester: selected.semester,
          submission: {
            fileName: submissionName,
            sheetName: submissionName,
            courseCode: selected.course_code,
            payload: processorPayload,
          },
        }),
      });
      setMsg(submissionData?.message || "Scores submitted for processing.");
      await selectCourse(selected);
      if (user) await loadHistory(user.id);
    } catch (err: any) {
      setMsg(err.message || "Failed to submit scores.");
    } finally {
      setSubmittingScores(false);
    }
  }

  function openAmendmentRequest(student: Student) {
    setAmendmentTarget(student);
    setAmendmentScores({
      ca: student.ca_score == null ? "" : String(student.ca_score),
      exam: student.exam_score == null ? "" : String(student.exam_score),
    });
    setAmendmentReason("");
    setAmendmentError("");
  }

  async function requestScoreAmendment() {
    if (!selected || !amendmentTarget?.score_id) return;
    const caError = scoreFieldError("ca_score", amendmentScores.ca);
    const examError = scoreFieldError("exam_score", amendmentScores.exam);
    if (caError || examError || amendmentScores.ca === "" || amendmentScores.exam === "") {
      setAmendmentError(caError || examError || "Proposed CA and exam scores are required.");
      return;
    }
    if (amendmentReason.trim().length < 5) {
      setAmendmentError("Enter a correction reason of at least 5 characters.");
      return;
    }
    setAmendmentError("");
    setRequestingAmendment(true);
    try {
      const { data } = await ApiClient.fetch("/scores/amendments", {
        method: "POST",
        body: JSON.stringify({
          score_id: amendmentTarget.score_id,
          course_source: selected.course_source || "ug",
          proposed_ca_score: Number(amendmentScores.ca),
          proposed_exam_score: Number(amendmentScores.exam),
          reason: amendmentReason.trim(),
        }),
      });
      setMsg(data?.message || "Correction request submitted.");
      setAmendmentTarget(null);
      await selectCourse(selected);
    } catch (err: any) {
      setAmendmentError(err.message || "Failed to submit correction request.");
    } finally {
      setRequestingAmendment(false);
    }
  }

  async function logout() {
    await authLogout("/staff/login");
  }

  function downloadResultTemplate() {
    const department = staffProfile?.department?.trim();
    if (!department) {
      setMsg("Unable to download template: lecturer department was not found.");
      return;
    }

    const templateRows: (string | number)[][] = [
      ["", `DEPARTMENT OF ${department.toUpperCase()}`, "", "", ""],
      ["", "LEVEL:", "", "", ""],
      ["", "COURSE CODE:", "", "", ""],
      ["", "", "", "", ""],
      ["S/N", "MATRIC NUMBER", "EXAM SCORE 70%", "C.A. SCORE 30%", "TOTAL"],
      ...Array.from({ length: 50 }, (_, index) => {
        const spreadsheetRow = index + 6;
        return [index + 1, "", "", "", `=C${spreadsheetRow}+D${spreadsheetRow}`];
      }),
    ];
    const escapeCsv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = templateRows
      .map(row => row.map(escapeCsv).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${department.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_result_upload_template.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg("");
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const parsed = parseExcelForUpload(sheet, sysSettings);
        
        const b64Reader = new FileReader();
        b64Reader.onload = (b64evt) => {
          setPreview({
            fileName: file.name,
            sheetName: wb.SheetNames[0],
            fileContent: b64evt.target?.result as string,
            ...parsed
          });
        };
        b64Reader.readAsDataURL(file);
      } catch (err: any) {
        setMsg("❌ Failed to parse result file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function parseExcelForUpload(sheet: XLSX.WorkSheet, currentSettings?: any) {
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    const normalizeHeader = (value: unknown) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const templateHeaders = [
      "academicsession", "semester", "department", "coursecode",
      "matricno", "studentname", "level", "cascore", "examscore"
    ];
    const templateHeaderIdx = data.findIndex(row => {
      const headers = new Set((row || []).map(normalizeHeader));
      return templateHeaders.every(header => headers.has(header));
    });

    if (templateHeaderIdx !== -1) {
      const headerMap = new Map<string, number>();
      data[templateHeaderIdx].forEach((header, index) => headerMap.set(normalizeHeader(header), index));
      const valueAt = (row: any[], header: string) => String(row[headerMap.get(header)!] ?? "").trim();
      const studentsByKey = new Map<string, any>();
      const uploadedCourses = new Set<string>();

      for (let rowIndex = templateHeaderIdx + 1; rowIndex < data.length; rowIndex++) {
        const row = data[rowIndex] || [];
        const matricNumber = valueAt(row, "matricno");
        const studentName = valueAt(row, "studentname");
        const level = valueAt(row, "level");
        const caRaw = valueAt(row, "cascore");
        const examRaw = valueAt(row, "examscore");

        // Starter rows identify assigned courses and remain ignored until student details are entered.
        if (!matricNumber && !studentName && !level && !caRaw && !examRaw) continue;

        const academicSession = valueAt(row, "academicsession");
        const semester = valueAt(row, "semester");
        const department = valueAt(row, "department");
        const courseCode = valueAt(row, "coursecode").toUpperCase();
        const required = {
          "Academic Session": academicSession,
          Semester: semester,
          Department: department,
          "Course Code": courseCode,
          "Matric No": matricNumber,
          "Student Name": studentName,
          Level: level,
          "CA Score": caRaw,
          "Exam Score": examRaw,
        };
        const missing = Object.entries(required).filter(([, value]) => !value).map(([field]) => field);
        if (missing.length) throw new Error(`Row ${rowIndex + 1}: ${missing.join(", ")} required`);

        const ca = Number(caRaw);
        const exam = Number(examRaw);
        if (!Number.isFinite(ca) || ca < 0 || ca > 30 || !Number.isFinite(exam) || exam < 0 || exam > 70) {
          throw new Error(`Row ${rowIndex + 1}: CA must be 0-30 and Exam must be 0-70`);
        }

        const studentKey = [academicSession, semester, department, matricNumber].map(value => value.toLowerCase()).join("|");
        const student = studentsByKey.get(studentKey) || {
          matricNumber,
          name: studentName,
          level,
          department,
          academicSession,
          semester,
          courses: [],
        };
        student.courses.push({ code: courseCode, ca, exam, score: ca + exam });
        studentsByKey.set(studentKey, student);
        uploadedCourses.add(courseCode);
      }

      const templateStudents = [...studentsByKey.values()];
      if (!templateStudents.length) throw new Error("No completed student result rows found in template");
      const first = templateStudents[0];
      return {
        metadata: {
          academicSession: first.academicSession,
          semester: first.semester,
          department: first.department,
          level: first.level,
        },
        students: templateStudents,
        courses: [...uploadedCourses],
      };
    }

    const metadata: any = {
      academicSession: currentSettings?.current_academic_session || "",
      semester: currentSettings?.current_semester || "",
    };
    const students: any[] = [];
    
    // 1. Better Metadata Extraction
    let courseCodeFromMeta = "";
    for (let i = 0; i < Math.min(20, data.length); i++) {
      if (!data[i]) continue;
      const rowStr = (data[i] || []).join(" ").toUpperCase();
      // Try to find Course Code pattern e.g. CSC 101, GST 101
      const courseMatch = rowStr.match(/([A-Z]{3,4}\s*\d{3})/);
      if (courseMatch && !courseCodeFromMeta) courseCodeFromMeta = courseMatch[1];
      
      if (rowStr.includes("SESSION")) {
        const m = rowStr.match(/(\d{4}\/\d{4})/);
        if (m) metadata.academicSession = m[1];
      }
      if (rowStr.includes("SEMESTER")) {
        if (rowStr.includes("FIRST")) metadata.semester = "First Semester";
        else if (rowStr.includes("SECOND")) metadata.semester = "Second Semester";
      }
      if (rowStr.includes("DEPARTMENT")) {
          const m = rowStr.match(/DEPARTMENT OF\s+(.+)/);
          if (m) metadata.department = m[1].trim();
      }
      if (rowStr.includes("LEVEL")) {
          const m = rowStr.match(/LEVEL\s*:\s*(.+)/);
          if (m) metadata.level = m[1].trim();
      }
    }

    // 2. Find Student Headers
    let headerIdx = -1;
    let matricIdx = -1, nameIdx = -1, scoreStartIdx = -1;
    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      if (!r) continue;
      for (let j = 0; j < r.length; j++) {
        const c = String(r[j] || "").toLowerCase();
        if (c.includes("matric")) { matricIdx = j; headerIdx = i; scoreStartIdx = j + 1; }
        else if (c.includes("name") && headerIdx === i) { nameIdx = j; scoreStartIdx = j + 1; }
      }
      if (headerIdx !== -1) break;
    }

    if (headerIdx === -1 || matricIdx === -1) throw new Error("Could not find the Matric Number header");

    const hRow = data[headerIdx];
    const normalizedHeaders = hRow.map(normalizeHeader);
    const isDepartmentTemplate = nameIdx === -1
      && normalizedHeaders.some(header => header.includes("examscore70"))
      && normalizedHeaders.some(header => header.includes("cascore30"));
    if (isDepartmentTemplate) {
      metadata.academicSession = currentSettings?.current_academic_session || "";
      metadata.semester = currentSettings?.current_semester || "";
      const missingMetadata = [
        !metadata.level && "Level",
        !courseCodeFromMeta && "Course Code",
        !metadata.academicSession && "Active Academic Session (system setting)",
        !metadata.semester && "Active Semester (system setting)",
      ].filter(Boolean);
      if (missingMetadata.length) {
        throw new Error(`Complete the following template fields: ${missingMetadata.join(", ")}`);
      }
    }
    const courseMap: Record<string, { caIdx: number, examIdx: number, totalIdx: number }> = {};
    let caCol = -1, examCol = -1;

    // Identify CA and Exam columns or specific course columns
    for (let j = scoreStartIdx; j < hRow.length; j++) {
      const rawCell = String(hRow[j] || "").toUpperCase().trim();
      if (!rawCell || ["S/N", "SN", "NAME", "MATRIC", "TOTAL", "GRADE", "REMARK"].includes(rawCell)) continue;
      
      // Pattern 1: Column name is exactly a course code (e.g. CSC 101)
      const courseMatch = rawCell.match(/^([A-Z]{3,4}\s*\d{3})$/);
      if (courseMatch) {
          const code = courseMatch[1];
          if (!courseMap[code]) courseMap[code] = { caIdx: -1, examIdx: -1, totalIdx: j };
          else courseMap[code].totalIdx = j;
          continue;
      }
      
      // Pattern 2: Column name contains course code and CA/Exam (e.g. CSC 101 CA)
      const partMatch = rawCell.match(/^([A-Z]{3,4}\s*\d{3})\s*(CA|EXAM|TEST|TOTAL|EXAMINATION)/);
      if (partMatch) {
          const code = partMatch[1];
          const type = partMatch[2];
          if (!courseMap[code]) courseMap[code] = { caIdx: -1, examIdx: -1, totalIdx: -1 };
          
          if (type === "CA" || type === "TEST") courseMap[code].caIdx = j;
          else if (type === "EXAM" || type === "EXAMINATION") courseMap[code].examIdx = j;
          else if (type === "TOTAL") courseMap[code].totalIdx = j;
          continue;
      }
      
      // Pattern 3: Lone CA/Exam (associated with single course in metadata)
      const cleanCell = rawCell.replace(/[().[\]%]/g, " ").trim();
      const normalized = rawCell.replace(/[^A-Z0-9]/g, " ").replace(/\s+/g, " ").trim();
      
      const isCA = normalized.includes("C A") || normalized.startsWith("CA ") || normalized === "CA" || normalized.includes("ASSESSMENT") || normalized.includes("TEST");
      const isExam = normalized.includes("EXAM") || normalized.includes("EXAMINATION");

      if (isCA && !normalized.includes("TOTAL")) caCol = j;
      if (isExam && !normalized.includes("TOTAL")) examCol = j;
    }
    
    let courses: string[] = Object.keys(courseMap);
    if (courses.length === 0) {
        if (courseCodeFromMeta) {
            courses = [courseCodeFromMeta];
            courseMap[courseCodeFromMeta] = { caIdx: caCol, examIdx: examCol, totalIdx: -1 };
        } else {
            // Fallback: use any remaining column as course if no others found
            for (let j = scoreStartIdx; j < hRow.length; j++) {
                 const code = String(hRow[j] || "").trim().toUpperCase();
                 if (code && !["TOTAL","GRADE","REMARK"].includes(code)) {
                     courses.push(code);
                     courseMap[code] = { caIdx: -1, examIdx: -1, totalIdx: j };
                 }
            }
        }
    } else if (caCol !== -1 || examCol !== -1) {
        // If we found courses but also general CA/Exam cols, pair them if only one course
        if (courses.length === 1) {
            if (courseMap[courses[0]].caIdx === -1) courseMap[courses[0]].caIdx = caCol;
            if (courseMap[courses[0]].examIdx === -1) courseMap[courses[0]].examIdx = examCol;
        }
    }

    // 3. Extract Student Rows
    for (let i = headerIdx + 1; i < data.length; i++) {
        const r = data[i];
        if (!r || !String(r[matricIdx] || "").trim()) continue;
        
        const studCourses: any[] = [];
        courses.forEach(code => {
            const m = courseMap[code];
            const caRaw = m.caIdx !== -1 ? String(r[m.caIdx] ?? "").trim() : "";
            const examRaw = m.examIdx !== -1 ? String(r[m.examIdx] ?? "").trim() : "";
            if (isDepartmentTemplate && (!caRaw || !examRaw)) {
              throw new Error(`Row ${i + 1}: both Exam Score and C.A. Score are required`);
            }
            const ca = m.caIdx !== -1 ? parseFloat(caRaw || "0") : 0;
            const exam = m.examIdx !== -1 ? parseFloat(examRaw || "0") : 0;
            if (isDepartmentTemplate && (isNaN(ca) || isNaN(exam) || ca < 0 || ca > 30 || exam < 0 || exam > 70)) {
              throw new Error(`Row ${i + 1}: C.A. Score must be 0-30 and Exam Score must be 0-70`);
            }
            let total = m.totalIdx !== -1 ? parseFloat(String(r[m.totalIdx] || "0")) : (ca + exam);
            
            if (!isNaN(total)) {
                studCourses.push({
                    code,
                    score: total,
                    ca: isNaN(ca) ? 0 : ca,
                    exam: isNaN(exam) ? 0 : exam
                });
            }
        });

        if (studCourses.length > 0) {
            students.push({
              matricNumber: String(r[matricIdx]).trim(),
              name: nameIdx !== -1 ? String(r[nameIdx] || "").trim() : "",
              level: metadata.level || "",
              department: metadata.department || "",
              academicSession: metadata.academicSession,
              semester: metadata.semester,
              courses: studCourses
            });
        }
    }

    return { metadata, students, courses };
  }


  function resolveSubmissionTarget() {
    const normalizeCode = (code: string) => code.replace(/\s+/g, "").toUpperCase();
    const previewCodes: string[] = Array.from(
      new Set<string>((preview?.courses || []).map((code: string) => normalizeCode(code)))
    );
    const assignedByCode = new Map<string, Course[]>();

    courses.forEach(course => {
      const code = normalizeCode(course.course_code);
      assignedByCode.set(code, [...(assignedByCode.get(code) || []), course]);
    });

    if (!previewCodes.length || previewCodes.some(code => !assignedByCode.has(code))) {
      throw new Error("upload denied. Course not assigned to user");
    }

    const matched = previewCodes.flatMap(code => assignedByCode.get(code) || []);
    const sources = new Set(matched.map(course => course.course_source || "ug"));
    if (sources.size > 1) throw new Error("This file contains both UG and PG assigned courses. Submit them separately.");
    if (sources.has("pg")) return { endpoint: "/pg-results/pending", label: "PG Admin" };
    return { endpoint: "/results/pending", label: "ICT" };
  }

  async function submitToProcessor() {
    if (!preview || !user) return;
    setUploading(true); setMsg("");
    try {
      const target = resolveSubmissionTarget();
      const resultsFormatted = preview.students.map((s: any) => ({
        studentInfo: {
          name: s.name,
          matricNumber: s.matricNumber,
          level: s.level || preview.metadata.level || "",
          faculty: s.faculty || preview.metadata.faculty || "Unknown",
          department: s.department || preview.metadata.department || "Unknown",
          academicSession: s.academicSession || preview.metadata.academicSession,
          semester: s.semester || preview.metadata.semester
        },
        courses: s.courses
      }));

      const { data } = await ApiClient.fetch(target.endpoint, {
        method: "POST",
        body: JSON.stringify({
          staffId: user.id,
          fileName: preview.fileName,
          sheetName: preview.sheetName,
          courseCode: preview.courses.join(","),
          payload: resultsFormatted,
          fileContent: preview.fileContent
        })
      });
      
      setMsg(`✅ Successfully submitted to ${target.label} for processing.`);
      setPreview(null);
      if (user) loadHistory(user.id);
    } catch (err: any) {
      setMsg("❌ Error submitting: " + err.message);
    } finally {
      setUploading(false);
    }
  }

  const activeSection =
    tab === "upload"
      ? { id: "upload", label: "📤 Result Upload" }
      : tab === "submissions"
        ? { id: "submissions", label: "📜 Upload History" }
        : tab === "master-list"
          ? { id: "master-list", label: "Master List" }
          : { id: "courses", label: "📚 My Courses" };
  const messageIsError = /failed|error|cannot|must|required|invalid|denied/i.test(msg);
  const courseSubmissionLocked = students.length > 0
    && students.every(student => student.score_status === "submitted" || student.score_status === "approved");

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", fontFamily: "Inter, sans-serif" }}>

      <div className="flex flex-col">
        {/* Horizontal Tabs List */}
        <div className="bg-slate-900/50 border-b border-white/5 sticky top-0 z-30 px-8 py-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 min-w-max">
            {[
              { id: "courses", label: "📚 My Courses" },
            ].map((item) => {
              const isActive = true;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2",
                    isActive 
                      ? "bg-blue-600/20 text-blue-400 border border-blue-500/30" 
                      : "text-slate-400 hover:text-slate-100 hover:bg-white/5 border border-transparent"
                  )}
                >
                  {activeSection.label}
                </button>
              );
            })}
          </div>
        </div>

        <main className="flex-1 p-8 overflow-y-auto">
          {msg && (
            <div style={{
              marginBottom: "1.5rem",
              background: messageIsError ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
              border: `1px solid ${messageIsError ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
              borderRadius: "0.5rem",
              color: messageIsError ? "#fca5a5" : "#86efac",
              padding: "0.75rem 1rem",
              fontSize: "0.9rem"
            }}>{msg}</div>
          )}
          {tab === "courses" && (
            <div>
              <h2 style={{ color: "#fff", marginTop: 0 }}>Assigned Courses</h2>
              {courses.length === 0
                ? <p style={{ color: "rgba(255,255,255,0.4)" }}>No courses assigned yet.</p>
                : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: "1rem" }}>
                    {courses.map(c => (
                      <div key={c.assignment_id} style={{
                        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "0.75rem", padding: "1.25rem"
                      }}>
                        <div style={{ color: "#60a5fa", fontSize: "0.8rem", fontWeight: 600 }}>{c.course_code}</div>
                        <div style={{ color: "#fff", fontWeight: 700, margin: "0.25rem 0 0.5rem" }}>{c.course_title}</div>
                        <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.8rem" }}>
                          {(c.programme_level || (c.course_source === "pg" ? "Postgraduate" : "Undergraduate"))} · {c.semester} · {c.session}<br />
                          {c.credit_units} Units · {c.enrolled_count} Students
                        </div>
                        <button onClick={() => selectCourse(c)} style={{
                          marginTop: "0.75rem", background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.15)", borderRadius: "0.5rem", color: "#fff",
                          padding: "0.4rem 0.9rem", cursor: "pointer", fontSize: "0.82rem"
                        }}>View Students →</button>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          )}

          {tab === "details" && (
            <div>
              {!selected
                ? <p style={{ color: "rgba(255,255,255,0.4)" }}>← Select a course first.</p>
                : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
                      <button onClick={() => setTab("courses")} style={{
                        background: "transparent", border: "1px solid rgba(255,255,255,0.2)",
                        color: "rgba(255,255,255,0.6)", borderRadius: "0.5rem",
                        padding: "0.35rem 0.75rem", cursor: "pointer", fontSize: "0.82rem"
                      }}>← Back</button>
                      <div>
                        <h2 style={{ color: "#fff", margin: 0 }}>{selected.course_code} — {selected.course_title}</h2>
                        <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.8rem" }}>{selected.semester} · {selected.session} · {selected.credit_units} Units</div>
                      </div>
                      <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
                        <button
                          onClick={saveCourseScores}
                          disabled={savingScores || submittingScores || students.length === 0 || courseSubmissionLocked}
                          style={{
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(148,163,184,0.35)",
                            color: savingScores || submittingScores || students.length === 0 || courseSubmissionLocked ? "rgba(255,255,255,0.35)" : "#e2e8f0",
                            borderRadius: "0.5rem", padding: "0.55rem 1rem",
                            cursor: savingScores || submittingScores || students.length === 0 || courseSubmissionLocked ? "not-allowed" : "pointer",
                            fontWeight: 700, fontSize: "0.85rem"
                          }}
                        >
                          {savingScores ? "Saving..." : "Save Draft"}
                        </button>
                        <button
                          onClick={submitCourseScores}
                          disabled={savingScores || submittingScores || students.length === 0 || courseSubmissionLocked}
                          style={{
                            background: savingScores || submittingScores || students.length === 0 || courseSubmissionLocked ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#2563eb,#38bdf8)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            color: savingScores || submittingScores || students.length === 0 || courseSubmissionLocked ? "rgba(255,255,255,0.35)" : "#fff",
                            borderRadius: "0.5rem", padding: "0.55rem 1rem",
                            cursor: savingScores || submittingScores || students.length === 0 || courseSubmissionLocked ? "not-allowed" : "pointer",
                            fontWeight: 700, fontSize: "0.85rem"
                          }}
                        >
                          {submittingScores ? "Submitting..." : `Submit to ${selected.course_source === "pg" ? "PG Admin" : "ICT"}`}
                        </button>
                      </div>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                            {["Matric No","Name","Current Level","CA","Exam","Total","Grade","Status"].map(h => (
                              <th key={h} style={{ color: "rgba(255,255,255,0.5)", textAlign: "left", padding: "0.6rem 0.75rem", fontWeight: 600 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {students.length === 0 ? (
                            <tr><td colSpan={8} style={{ padding: "2rem", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>No students registered for this course yet.</td></tr>
                          ) : (
                            students.map(s => {
                              const draft = scoreDrafts[s.student_id] || { ca_score: "", exam_score: "" };
                              const total = scoreNumber(draft.ca_score) + scoreNumber(draft.exam_score);
                              const caError = scoreFieldError("ca_score", draft.ca_score);
                              const examError = scoreFieldError("exam_score", draft.exam_score);
                              const hasScores = draft.ca_score !== "" && draft.exam_score !== "";
                              const grade = gradeForTotal(total);
                              const status = s.amendment_pending
                                ? "Correction pending"
                                : dirtyScoreIds.has(s.student_id)
                                ? "Unsaved changes"
                                : s.score_status === "submitted"
                                  ? "Submitted"
                                  : s.score_status === "approved"
                                    ? "Approved"
                                    : s.score_status === "draft"
                                      ? "Draft"
                                      : "Not saved";
                              const statusColor = status === "Correction pending"
                                ? "#fbbf24"
                                : status === "Submitted" || status === "Approved"
                                ? "#86efac"
                                : status === "Unsaved changes"
                                  ? "#fcd34d"
                                  : "#cbd5e1";
                              const rowLocked = s.score_status === "submitted" || s.score_status === "approved";
                              return (
                                <tr key={s.student_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                  <td style={{ padding: "0.6rem 0.75rem", color: "#60a5fa" }}>{s.matric_number}</td>
                                  <td style={{ padding: "0.6rem 0.75rem", color: "#fff" }}>{s.student_name}</td>
                                  <td style={{ padding: "0.6rem 0.75rem", color: "rgba(255,255,255,0.5)" }}>{s.current_level || "100"}L</td>
                                  <td style={{ padding: "0.6rem 0.75rem" }}>
                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      min={0}
                                      max={30}
                                      step="0.01"
                                      placeholder="0.0"
                                      value={draft.ca_score}
                                      disabled={rowLocked}
                                      onChange={e => updateScoreDraft(s.student_id, "ca_score", e.target.value)}
                                      aria-invalid={Boolean(caError)}
                                      style={{
                                        width: "5.5rem",
                                        background: "rgba(15,23,42,0.9)",
                                        border: `1px solid ${caError ? "#f87171" : "rgba(148,163,184,0.28)"}`,
                                        borderRadius: "0.45rem",
                                        color: "#fff",
                                        padding: "0.45rem 0.55rem",
                                        outline: "none",
                                        opacity: rowLocked ? 0.6 : 1
                                      }}
                                    />
                                    {caError && <div style={{ color: "#fca5a5", fontSize: "0.68rem", marginTop: "0.3rem", whiteSpace: "nowrap" }}>{caError}</div>}
                                  </td>
                                  <td style={{ padding: "0.6rem 0.75rem" }}>
                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      min={0}
                                      max={70}
                                      step="0.01"
                                      placeholder="0.0"
                                      value={draft.exam_score}
                                      disabled={rowLocked}
                                      onChange={e => updateScoreDraft(s.student_id, "exam_score", e.target.value)}
                                      aria-invalid={Boolean(examError)}
                                      style={{
                                        width: "5.5rem",
                                        background: "rgba(15,23,42,0.9)",
                                        border: `1px solid ${examError ? "#f87171" : "rgba(148,163,184,0.28)"}`,
                                        borderRadius: "0.45rem",
                                        color: "#fff",
                                        padding: "0.45rem 0.55rem",
                                        outline: "none",
                                        opacity: rowLocked ? 0.6 : 1
                                      }}
                                    />
                                    {examError && <div style={{ color: "#fca5a5", fontSize: "0.68rem", marginTop: "0.3rem", whiteSpace: "nowrap" }}>{examError}</div>}
                                  </td>
                                  <td style={{ padding: "0.6rem 0.75rem", color: caError || examError ? "#fca5a5" : "#e2e8f0", fontWeight: 700 }}>
                                    {hasScores ? (Number.isInteger(total) ? total : total.toFixed(2)) : "-"}
                                  </td>
                                  <td style={{ padding: "0.6rem 0.75rem", color: "#e2e8f0", fontWeight: 700, whiteSpace: "nowrap" }}>
                                    {hasScores ? grade : "-"}
                                  </td>
                                  <td style={{ padding: "0.6rem 0.75rem" }}>
                                    <span style={{
                                      display: "inline-block", color: statusColor,
                                      border: `1px solid ${statusColor}55`, borderRadius: "999px",
                                      padding: "0.18rem 0.55rem", fontSize: "0.72rem", whiteSpace: "nowrap"
                                    }}>{status}</span>
                                    {rowLocked && !s.amendment_pending && (
                                      <button
                                        type="button"
                                        onClick={() => openAmendmentRequest(s)}
                                        style={{
                                          display: "block", marginTop: "0.4rem", padding: 0,
                                          border: 0, background: "transparent", color: "#93c5fd",
                                          fontSize: "0.7rem", cursor: "pointer", whiteSpace: "nowrap"
                                        }}
                                      >Request correction</button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
              }
            </div>
          )}

          {tab === "upload" && (
            <div style={{ maxWidth: 800 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ color: "#fff", margin: 0 }}>Bulk Result Upload</h2>
                  <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.85rem", margin: "0.4rem 0 0" }}>
                    Download and complete the CSV template before uploading your results.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={downloadResultTemplate}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "0.5rem",
                    border: "1px solid rgba(96,165,250,0.4)", borderRadius: "0.5rem",
                    background: "rgba(37,99,235,0.12)", color: "#93c5fd",
                    padding: "0.65rem 1rem", fontWeight: 700, cursor: "pointer"
                  }}
                >
                  <Download size={17} /> Download CSV Template
                </button>
              </div>
              <div style={{
                background: "rgba(255,255,255,0.03)", border: "2px dashed rgba(255,255,255,0.1)",
                borderRadius: "1rem", padding: "3rem", textAlign: "center", marginTop: "1.5rem",
                cursor: isLocked ? "not-allowed" : "pointer",
                opacity: isLocked ? 0.6 : 1
              }} onClick={() => !isLocked && uploadInputRef.current?.click()}>
                <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>📄</div>
                <div style={{ color: "#fff", fontWeight: 700 }}>Click to select result file</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.8rem", marginTop: "0.5rem" }}>Supports .csv, .xlsx, .xls</div>
                <input 
                   type="file" ref={uploadInputRef} hidden accept=".csv,.xlsx,.xls"
                   onChange={e => handleFileChange(e)}
                   disabled={isLocked}
                />
              </div>

              {isLocked && (
                <div style={{
                  marginTop: "1.5rem", padding: "1rem", borderRadius: "0.75rem",
                  background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
                  color: "#fca5a5", display: "flex", alignItems: "center", gap: "0.75rem"
                }}>
                  <div style={{ fontSize: "1.2rem" }}>🔒</div>
                  <div>
                    <div style={{ fontWeight: 700 }}>Portal Locked</div>
                    <div style={{ fontSize: "0.8rem", opacity: 0.8 }}>The ICT Director has temporarily disabled result uploads. Please contact the ICT department for more information.</div>
                  </div>
                </div>
              )}

              {preview && (
                <div style={{ marginTop: "2rem" }}>
                  <div style={{ 
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    marginBottom: "1rem" 
                  }}>
                    <h3 style={{ color: "#fff", margin: 0 }}>File Preview: {preview.fileName}</h3>
                    <button 
                      onClick={submitToProcessor}
                      disabled={uploading || isLocked}
                      style={{
                        background: isLocked ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg,#10b981,#34d399)", 
                        border: "none",
                        color: isLocked ? "rgba(255,255,255,0.3)" : "#fff", 
                        borderRadius: "0.5rem", padding: "0.6rem 1.5rem",
                        cursor: isLocked ? "not-allowed" : "pointer", 
                        fontWeight: 700, 
                        boxShadow: isLocked ? "none" : "0 4px 12px rgba(16,185,129,0.2)"
                      }}
                    >
                      {uploading ? "Uploading..." : isLocked ? "Portal Locked" : "Submit for Processing →"}
                    </button>
                  </div>

                  <div style={{ 
                    background: "rgba(255,255,255,0.05)", borderRadius: "0.75rem", 
                    overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" 
                  }}>
                    <div style={{ padding: "1rem", borderBottom: "1px solid rgba(255,255,255,0.1)", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
                       <div>
                         <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.7rem", textTransform: "uppercase" }}>Session</div>
                         <div style={{ color: "#fff", fontWeight: 600 }}>{preview.metadata.academicSession || "N/A"}</div>
                       </div>
                       <div>
                         <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.7rem", textTransform: "uppercase" }}>Semester</div>
                         <div style={{ color: "#fff", fontWeight: 600 }}>{preview.metadata.semester || "N/A"}</div>
                       </div>
                       <div>
                         <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.7rem", textTransform: "uppercase" }}>Found</div>
                         <div style={{ color: "#fff", fontWeight: 600 }}>{preview.students.length} Students</div>
                       </div>
                    </div>

                    {/* Result Breakdown List as requested */}
                    <div style={{ padding: "1.5rem", maxHeight: "500px", overflowY: "auto" }}>
                       <div style={{ marginBottom: "1.25rem", color: "rgba(255,255,255,0.6)", fontSize: "0.85rem", fontStyle: "italic" }}>
                         Previewing converted results. Please verify CA and Exam scores:
                       </div>
                       {preview.courses.map((courseCode: string) => (
                         <div key={courseCode} style={{ marginBottom: "2.5rem" }}>
                            <div style={{ 
                              color: "#60a5fa", fontWeight: 800, fontSize: "1.1rem", 
                              borderBottom: "1px solid rgba(96,165,250,0.2)", paddingBottom: "0.5rem",
                              marginBottom: "0.75rem"
                            }}>{courseCode}</div>

                            {/* Column Headers for alignment */}
                            <div style={{ 
                              display: "grid", gridTemplateColumns: "180px 60px 60px", gap: "1rem",
                              color: "rgba(255,255,255,0.4)", fontSize: "0.7rem", fontWeight: 700, 
                              textTransform: "uppercase", padding: "0 0.5rem 0.5rem", borderBottom: "1px solid rgba(255,255,255,0.05)"
                            }}>
                              <span>Matric Number</span>
                              <span style={{ textAlign: "center" }}>CA</span>
                              <span style={{ textAlign: "center" }}>Exam</span>
                            </div>

                            <div style={{ fontFamily: "monospace", fontSize: "0.95rem" }}>
                              {preview.students
                                .filter((s: any) => s.courses.some((c: any) => c.code === courseCode))
                                .map((student: any) => {
                                  const cData = student.courses.find((c: any) => c.code === courseCode);
                                  return (
                                    <div key={student.matricNumber} style={{ 
                                      display: "grid", gridTemplateColumns: "180px 60px 60px", gap: "1rem",
                                      color: "rgba(255,255,255,0.85)", padding: "0.4rem 0.5rem",
                                      borderBottom: "1px solid rgba(255,255,255,0.03)"
                                    }}>
                                      <span style={{ color: "rgba(255,255,255,0.95)" }}>{student.matricNumber}</span>
                                      <span style={{ color: "#fbbf24", textAlign: "center", fontWeight: 600 }}>{cData.ca ?? '0'}</span>
                                      <span style={{ color: "#10b981", textAlign: "center", fontWeight: 600 }}>{cData.exam ?? '0'}</span>
                                    </div>
                                  );
                                })}
                            </div>
                         </div>
                       ))}
                    </div>

                  </div>
                </div>
              )}
              
            </div>
          )}
          {tab === "submissions" && (
            <div>
              {history.length === 0 ? (
                <div style={{ 
                  textAlign: "center", padding: "4rem", 
                  background: "rgba(255,255,255,0.02)", borderRadius: "1rem",
                  border: "1px dashed rgba(255,255,255,0.1)"
                }}>
                  <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>📭</div>
                  <div style={{ color: "rgba(255,255,255,0.4)" }}>No submissions found.</div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: "1rem" }}>
                  {history.map((h: any) => (
                    <div key={h.id} style={{
                      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "0.75rem", padding: "1.25rem", display: "flex", justifyContent: "space-between",
                      alignItems: "center"
                    }}>
                      <div>
                        <div style={{ color: "#fff", fontWeight: 700 }}>{h.file_name}</div>
                        <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.8rem", marginTop: "0.25rem" }}>
                          {new Date(h.created_at).toLocaleString()} · {h.course_code || "Multiple Courses"}
                        </div>
                      </div>
                      <div style={{
                        background: h.status === "pending" ? "rgba(251,191,36,0.1)" : "rgba(34,197,94,0.1)",
                        color: h.status === "pending" ? "#fcd34d" : "#86efac",
                        padding: "0.25rem 0.75rem", borderRadius: "999px", fontSize: "0.75rem",
                        fontWeight: 600, textTransform: "uppercase"
                      }}>
                        {h.status}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {tab === "master-list" && user?.role === "deo" && (
            <MasterListDownload
              dark
              sources={[
                { label: "Undergraduate", programme: "UG", apiBase: "/results" },
                { label: "Postgraduate", programme: "PG", apiBase: "/pg-results" },
              ]}
              title="Department Master List"
              description="Download your department's processed master list for a selected academic session and semester."
            />
          )}
          {amendmentTarget && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="correction-title"
              style={{
                position: "fixed", inset: 0, zIndex: 100,
                background: "rgba(2,6,23,0.78)", display: "grid", placeItems: "center",
                padding: "1rem"
              }}
              onMouseDown={event => {
                if (event.target === event.currentTarget && !requestingAmendment) setAmendmentTarget(null);
              }}
            >
              <div style={{
                width: "min(100%, 32rem)", background: "#111827",
                border: "1px solid rgba(148,163,184,0.25)", borderRadius: "0.5rem",
                padding: "1.5rem", boxShadow: "0 24px 60px rgba(0,0,0,0.45)"
              }}>
                <h3 id="correction-title" style={{ color: "#fff", margin: 0 }}>Request Score Correction</h3>
                <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.85rem", margin: "0.4rem 0 1.25rem" }}>
                  {amendmentTarget.matric_number} - {amendmentTarget.student_name}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <label style={{ color: "#cbd5e1", fontSize: "0.8rem" }}>
                    Proposed CA
                    <input
                      type="number" min={0} max={30} step="0.01"
                      value={amendmentScores.ca}
                      onChange={event => setAmendmentScores(current => ({ ...current, ca: event.target.value }))}
                      style={{ width: "100%", marginTop: "0.35rem", padding: "0.65rem", borderRadius: "0.4rem", border: "1px solid #475569", background: "#0f172a", color: "#fff" }}
                    />
                  </label>
                  <label style={{ color: "#cbd5e1", fontSize: "0.8rem" }}>
                    Proposed Exam
                    <input
                      type="number" min={0} max={70} step="0.01"
                      value={amendmentScores.exam}
                      onChange={event => setAmendmentScores(current => ({ ...current, exam: event.target.value }))}
                      style={{ width: "100%", marginTop: "0.35rem", padding: "0.65rem", borderRadius: "0.4rem", border: "1px solid #475569", background: "#0f172a", color: "#fff" }}
                    />
                  </label>
                </div>
                <label style={{ display: "block", color: "#cbd5e1", fontSize: "0.8rem", marginTop: "1rem" }}>
                  Reason for correction
                  <textarea
                    rows={4}
                    value={amendmentReason}
                    onChange={event => setAmendmentReason(event.target.value)}
                    placeholder="Explain why these scores must be amended"
                    style={{ width: "100%", resize: "vertical", marginTop: "0.35rem", padding: "0.65rem", borderRadius: "0.4rem", border: "1px solid #475569", background: "#0f172a", color: "#fff" }}
                  />
                </label>
                {amendmentError && (
                  <div style={{ marginTop: "0.85rem", color: "#fca5a5", fontSize: "0.8rem" }}>{amendmentError}</div>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.25rem" }}>
                  <button
                    type="button" disabled={requestingAmendment}
                    onClick={() => setAmendmentTarget(null)}
                    style={{ border: "1px solid #475569", background: "transparent", color: "#cbd5e1", borderRadius: "0.4rem", padding: "0.6rem 1rem", cursor: "pointer" }}
                  >Cancel</button>
                  <button
                    type="button" disabled={requestingAmendment}
                    onClick={requestScoreAmendment}
                    style={{ border: 0, background: "#2563eb", color: "#fff", borderRadius: "0.4rem", padding: "0.6rem 1rem", fontWeight: 700, cursor: requestingAmendment ? "not-allowed" : "pointer" }}
                  >{requestingAmendment ? "Submitting..." : "Submit Request"}</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function LecturerDashboard() {
  return (
    <Suspense fallback={<LecturerDashboardSkeleton />}>
      <LecturerDashboardInner />
    </Suspense>
  );
}

function LecturerDashboardSkeleton() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0f0f0f" }}>
      {/* Sidebar placeholder */}
      <div style={{ width: 80, background: "#151515", borderRight: "1px solid #222", flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ height: 64, background: "#1a1a1a", borderBottom: "1px solid #222", display: "flex", alignItems: "center", padding: "0 1.5rem", gap: "1rem" }}>
          <div style={{ width: 140, height: 20, borderRadius: 6, background: "#2a2a2a" }} className="animate-pulse" />
          <div style={{ flex: 1 }} />
          <div style={{ width: 90, height: 32, borderRadius: 8, background: "#2a2a2a" }} className="animate-pulse" />
        </div>
        {/* Tab bar */}
        <div style={{ display: "flex", gap: "0.5rem", padding: "1rem 1.5rem 0", background: "#0f0f0f" }}>
          {[110, 100, 120, 130].map((w, i) => (
            <div key={i} style={{ width: w, height: 36, borderRadius: 8, background: "#1e1e1e" }} className="animate-pulse" />
          ))}
        </div>
        {/* Course card grid */}
        <div style={{ padding: "1.5rem", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: "1rem" }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} style={{ height: 120, borderRadius: 12, background: "#1a1a1a", border: "1px solid #252525" }} className="animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
