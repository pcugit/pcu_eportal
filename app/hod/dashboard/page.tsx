"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient } from "@/lib/api";
import * as XLSX from "xlsx";
import { AlertTriangle, BookPlus, ChevronLeft, ChevronRight, Download, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { MasterListDownload } from "@/components/master-list-download";

const COURSES_PER_PAGE = 15;

type Result = {
  id: number; matric_number: string; student_name: string; current_level: string;
  course_code: string; course_title: string;
  ca_score: number; exam_score: number; total_score: number;
  grade: string; status: string; session: string; semester: string;
  entered_by: string; entered_role: string;
};

type CourseAssignment = {
  assignment_id: number; course_id: number; course_code: string;
  course_title: string; credit_units: number; session: string; semester: string;
  course_source?: "ug" | "pg"; programme_level?: string;
};

type DepartmentStaff = {
  staff_record_id: number; user_id: number; name: string; email: string;
  status: string; staff_id: string | null; title: string | null; role: string;
  assignment_count: number; assignments: CourseAssignment[];
};

type DepartmentCourse = {
  id: number; course_code: string; course_title: string;
  credit_units: number; semester?: string; level?: string | number;
  remark?: string | null; status?: string;
  course_source?: "ug" | "pg"; programme_level?: string;
};

const EMPTY_COURSE_FORM = {
  course_code: "",
  course_title: "",
  unit: "",
  level: "100",
  semester: "First semester",
  status: "active",
  remark: "compulsory",
};

function HODDashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [stats, setStats]     = useState<any>(null);
  const [msg, setMsg]         = useState("");
  const [tab, setTab]         = useState("dashboard");
  const [departmentStaff, setDepartmentStaff] = useState<DepartmentStaff[]>([]);
  const [departmentCourses, setDepartmentCourses] = useState<DepartmentCourse[]>([]);
  const [coursePage, setCoursePage] = useState(1);
  const [courseSearch, setCourseSearch] = useState("");
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [confirmCourse, setConfirmCourse] = useState(false);
  const [addingCourse, setAddingCourse] = useState(false);
  const [courseForm, setCourseForm] = useState(EMPTY_COURSE_FORM);
  const [assignmentSession, setAssignmentSession] = useState("");
  const [assignmentSemester, setAssignmentSemester] = useState("");
  const [assignmentStaffId, setAssignmentStaffId] = useState("");
  const [assignmentCourseId, setAssignmentCourseId] = useState("");
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [removingAssignmentId, setRemovingAssignmentId] = useState<number | null>(null);
  const [courseModalStaffId, setCourseModalStaffId] = useState<number | null>(null);
  
  const uploadInputRef            = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview]     = useState<any>(null);
  const [history, setHistory]     = useState<any[]>([]);
  const [isLocked, setIsLocked]   = useState(false);
  const [sysSettings, setSysSettings] = useState<any>(null);
  const requestedTab = searchParams.get("tab");

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !["hod", "admin"].includes(user?.role ?? "")) {
      router.push("/staff/login");
      return;
    }
    loadDashboard();
    loadDepartmentCourses();
    if (user?.id) loadHistory(user.id);
    checkPortalLock();
    loadSystemSettings();
  }, [isAuthenticated, user, authLoading, router]);

  useEffect(() => {
    if (["dashboard", "staff", "courses", "upload", "submissions", "master-list"].includes(requestedTab ?? "")) {
      setTab(requestedTab as string);
      return;
    }
    setTab("dashboard");
  }, [requestedTab]);

  useEffect(() => {
    setMsg("");
  }, [tab]);

  useEffect(() => {
    if (!msg) return;
    const timer = window.setTimeout(() => setMsg(""), 5000);
    return () => window.clearTimeout(timer);
  }, [msg]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "hod") return;
    loadDepartmentStaff();
  }, [isAuthenticated, user?.role]);

  async function loadDepartmentCourses() {
    try {
      const response = await ApiClient.fetch<any>(`/hod/courses?refresh=${Date.now()}`);
      setDepartmentCourses(response.data?.courses ?? []);
      setCoursePage(1);
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  function openAddCourseModal() {
    setCourseForm(EMPTY_COURSE_FORM);
    setConfirmCourse(false);
    setShowAddCourse(true);
  }

  function closeAddCourseModal() {
    if (addingCourse) return;
    setShowAddCourse(false);
    setConfirmCourse(false);
  }

  function reviewNewCourse(e: React.FormEvent) {
    e.preventDefault();
    setConfirmCourse(true);
  }

  async function addDepartmentCourse() {
    setAddingCourse(true);
    setMsg("");
    try {
      await ApiClient.fetch<any>("/hod/courses", {
        method: "POST",
        body: JSON.stringify({
          ...courseForm,
          unit: Number(courseForm.unit),
          level: Number(courseForm.level),
        }),
      });
      setMsg(`✅ ${courseForm.course_code.toUpperCase()} added successfully.`);
      setShowAddCourse(false);
      setConfirmCourse(false);
      await loadDepartmentCourses();
    } catch (e: any) {
      setMsg("❌ " + e.message);
      setConfirmCourse(false);
    } finally {
      setAddingCourse(false);
    }
  }

  async function loadDepartmentStaff() {
    try {
      const response = await ApiClient.fetch<any>("/hod/staff");
      setDepartmentStaff(response.data?.staff ?? []);
      setAssignmentSession(response.data?.active_period?.session ?? "");
      setAssignmentSemester(response.data?.active_period?.semester ?? "");
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  async function assignDepartmentCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!assignmentStaffId || !assignmentCourseId) return;
    const [selectedSource, selectedId] = assignmentCourseId.includes(":")
      ? assignmentCourseId.split(":")
      : ["ug", assignmentCourseId];
    const staffMember = departmentStaff.find(
      member => String(member.staff_record_id) === assignmentStaffId);
    const course = departmentCourses.find(
      departmentCourse => String(departmentCourse.id) === selectedId && (departmentCourse.course_source || "ug") === selectedSource);
    const confirmed = window.confirm(
      `Are you sure you want to assign ${course?.course_code || "this course"} to ${staffMember?.name || "this staff member"}?`,
    );
    if (!confirmed) return;
    setAssignmentBusy(true);
    setMsg("");
    try {
      await ApiClient.fetch<any>("/hod/assign-course", {
        method: "POST",
        body: JSON.stringify({
          staff_id: Number(assignmentStaffId),
          course_id: Number(selectedId),
          course_source: selectedSource,
        }),
      });
      setMsg("✅ Course assigned.");
      setAssignmentCourseId("");
      await loadDepartmentStaff();
    } catch (e: any) {
      setMsg("❌ " + e.message);
    } finally {
      setAssignmentBusy(false);
    }
  }

  async function removeDepartmentCourse(assignmentId: number) {
    const assignment = courseModalStaff?.assignments.find(
      item => item.assignment_id === assignmentId);
    const confirmed = window.confirm(
      `Are you sure you want to remove ${assignment?.course_code || "this course"} from ${courseModalStaff?.name || "this staff member"}?`,
    );
    if (!confirmed) return;
    setRemovingAssignmentId(assignmentId);
    setMsg("");
    try {
      await ApiClient.fetch<any>("/hod/assign-course", {
        method: "DELETE",
        body: JSON.stringify({ assignment_id: assignmentId }),
      });
      setMsg("✅ Assignment removed.");
      await loadDepartmentStaff();
    } catch (e: any) {
      setMsg("❌ " + e.message);
    } finally {
      setRemovingAssignmentId(null);
    }
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

  async function loadDashboard() {
    try {
      const r = await ApiClient.fetch<any>("/hod/dashboard");
      setStats(r.data);
    } catch {}
  }

  async function loadSystemSettings() {
    try {
      setSysSettings(await ApiClient.getCurrentAcademicSettings());
    } catch {}
  }

  function downloadResultTemplate() {
    const department = String(stats?.department?.name || "").trim();
    if (!department) {
      setMsg("Unable to download template: HOD department was not found.");
      return;
    }
    const rows: (string | number)[][] = [
      ["", `DEPARTMENT OF ${department.toUpperCase()}`, "", "", ""],
      ["", "LEVEL:", "", "", ""],
      ["", "COURSE CODE:", "", "", ""],
      ["", "", "", "", ""],
      ["S/N", "MATRIC NUMBER", "EXAM SCORE 70%", "C.A. SCORE 30%", "TOTAL"],
      ...Array.from({ length: 50 }, (_, index) => [index + 1, "", "", "", `=C${index + 6}+D${index + 6}`]),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
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
        const parsed = parseExcelForUpload(sheet);
        
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
        setMsg("❌ Failed to parse Excel: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function parseExcelForUpload(sheet: XLSX.WorkSheet) {
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    const normalize = (value: unknown) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const departmentHeader = data.findIndex(row => {
      const headers = (row || []).map(normalize);
      return headers.some(value => value.includes("matricnumber"))
        && headers.some(value => value.includes("examscore70"))
        && headers.some(value => value.includes("cascore30"));
    });
    if (departmentHeader !== -1) {
      const metadata: any = {
        academicSession: sysSettings?.current_academic_session || "",
        semester: sysSettings?.current_semester || "",
      };
      let courseCode = "";
      for (let index = 0; index < departmentHeader; index++) {
        const rowText = (data[index] || []).join(" ").toUpperCase();
        const courseMatch = rowText.match(/([A-Z]{3,4}\s*\d{3})/);
        if (courseMatch) courseCode = courseMatch[1];
        const levelMatch = rowText.match(/LEVEL\s*:\s*(.+)/);
        if (levelMatch) metadata.level = levelMatch[1].trim();
        const departmentMatch = rowText.match(/DEPARTMENT OF\s+(.+)/);
        if (departmentMatch) metadata.department = departmentMatch[1].trim();
      }
      const missing = [
        !metadata.level && "Level",
        !courseCode && "Course Code",
        !metadata.academicSession && "Active Academic Session (system setting)",
        !metadata.semester && "Active Semester (system setting)",
      ].filter(Boolean);
      if (missing.length) throw new Error(`Complete the following template fields: ${missing.join(", ")}`);
      const header = data[departmentHeader].map(normalize);
      const matricIndex = header.findIndex(value => value.includes("matricnumber"));
      const examIndex = header.findIndex(value => value.includes("examscore70"));
      const caIndex = header.findIndex(value => value.includes("cascore30"));
      const students: any[] = [];
      for (let index = departmentHeader + 1; index < data.length; index++) {
        const row = data[index] || [];
        const matricNumber = String(row[matricIndex] || "").trim();
        if (!matricNumber) continue;
        const examRaw = String(row[examIndex] ?? "").trim();
        const caRaw = String(row[caIndex] ?? "").trim();
        if (!examRaw || !caRaw) throw new Error(`Row ${index + 1}: both Exam Score and C.A. Score are required`);
        const exam = Number(examRaw);
        const ca = Number(caRaw);
        if (!Number.isFinite(ca) || ca < 0 || ca > 30 || !Number.isFinite(exam) || exam < 0 || exam > 70) {
          throw new Error(`Row ${index + 1}: C.A. Score must be 0-30 and Exam Score must be 0-70`);
        }
        students.push({
          matricNumber, name: "", level: metadata.level,
          courses: [{ code: courseCode, ca, exam, score: ca + exam }],
        });
      }
      if (!students.length) throw new Error("No completed student result rows found in template");
      return { metadata, students, courses: [courseCode] };
    }
    const metadata: any = {};
    const students: any[] = [];
    
    // Simple metadata extraction (similar to ICT logic but simplified)
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const rowStr = (data[i] || []).join(" ").toUpperCase();
      if (rowStr.includes("SESSION")) {
        const m = rowStr.match(/(\d{4}\/\d{4})/);
        if (m) metadata.academicSession = m[1];
      }
      if (rowStr.includes("SEMESTER")) {
        if (rowStr.includes("FIRST")) metadata.semester = "First Semester";
        else if (rowStr.includes("SECOND")) metadata.semester = "Second Semester";
      }
    }

    // Find student header
    let headerIdx = -1;
    let matricIdx = -1, nameIdx = -1, scoreStartIdx = -1;
    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      if (!r) continue;
      for (let j = 0; j < r.length; j++) {
        const c = String(r[j] || "").toLowerCase();
        if (c.includes("matric")) { matricIdx = j; headerIdx = i; }
        if (c.includes("name") && headerIdx === i) { nameIdx = j; scoreStartIdx = j + 1; }
      }
      if (headerIdx !== -1) break;
    }

    if (headerIdx === -1) throw new Error("Could not find student headers (Matric No/Name)");

    const courses: string[] = [];
    const hRow = data[headerIdx];
    for (let j = scoreStartIdx; j < hRow.length; j++) {
      const code = String(hRow[j] || "").trim().toUpperCase();
      if (code && !["TOTAL","GRADE"].includes(code)) courses.push(code);
    }

    for (let i = headerIdx + 1; i < data.length; i++) {
      const r = data[i];
      if (!r || !r[matricIdx]) continue;
      
      const studCourses: any[] = [];
      courses.forEach((code, idx) => {
        const score = parseFloat(String(r[scoreStartIdx + idx] || "0"));
        if (!isNaN(score)) studCourses.push({ code, score });
      });

      students.push({
        matricNumber: String(r[matricIdx]).trim(),
        name: String(r[nameIdx]).trim(),
        courses: studCourses
      });
    }

    return { metadata, students, courses };
  }

  function resolveSubmissionTarget() {
    const previewCodes = new Set((preview?.courses || []).map((code: string) => code.replace(/\s+/g, "").toUpperCase()));
    const matched = departmentCourses.filter(course => previewCodes.has(course.course_code.replace(/\s+/g, "").toUpperCase()));
    const sources = new Set(matched.map(course => course.course_source || "ug"));
    if (sources.size > 1) throw new Error("This file contains both UG and PG courses. Submit them separately.");
    if (sources.has("pg")) return { endpoint: "/pg-results/pending", label: "PG Admin" };
    return { endpoint: "/results/pending", label: "ICT" };
  }

  async function submitToProcessor() {
    if (!preview || !user) return;
    const target = resolveSubmissionTarget();
    const confirmed = window.confirm(
      `Are you sure you want to submit ${preview.fileName} with ${preview.students.length} student result(s) to ${target.label}?`,
    );
    if (!confirmed) return;
    setUploading(true); setMsg("");
    try {
      const resultsFormatted = preview.students.map((s: any) => ({
        studentInfo: {
          name: s.name,
          matricNumber: s.matricNumber,
          level: s.level || preview.metadata.level || "",
          faculty: preview.metadata.faculty || "Unknown",
          department: preview.metadata.department || "Unknown",
          academicSession: preview.metadata.academicSession || sysSettings?.current_academic_session || "",
          semester: preview.metadata.semester || sysSettings?.current_semester || ""
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

  const statCard = (label: string, value: any, color: string) => (
    <div style={{
      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "0.75rem", padding: "1.25rem 1.5rem"
    }}>
      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8rem", marginBottom: "0.4rem" }}>{label}</div>
      <div style={{ color, fontSize: "2rem", fontWeight: 800 }}>{value ?? "—"}</div>
    </div>
  );

  const statusColor = (s: string) =>
    s === "approved" ? "#86efac" : s === "submitted" ? "#fcd34d" : "rgba(255,255,255,0.4)";

  const selectedAssignmentStaff = departmentStaff.find(
    staffMember => String(staffMember.staff_record_id) === assignmentStaffId);
  const courseModalStaff = departmentStaff.find(
    staffMember => staffMember.staff_record_id === courseModalStaffId);
  const assignedCourseIds = new Set(
    selectedAssignmentStaff?.assignments.map(assignment => `${assignment.course_source || "ug"}:${assignment.course_id}`) ?? []);
  const availableDepartmentCourses = departmentCourses.filter(
    course => course.status === "active" && !assignedCourseIds.has(`${course.course_source || "ug"}:${course.id}`));
  const normalizedCourseSearch = courseSearch.trim().toLowerCase();
  const filteredDepartmentCourses = departmentCourses.filter(course =>
    !normalizedCourseSearch ||
    course.course_code.toLowerCase().includes(normalizedCourseSearch) ||
    course.course_title.toLowerCase().includes(normalizedCourseSearch));
  const totalCoursePages = Math.max(1, Math.ceil(filteredDepartmentCourses.length / COURSES_PER_PAGE));
  const paginatedDepartmentCourses = filteredDepartmentCourses.slice(
    (coursePage - 1) * COURSES_PER_PAGE,
    coursePage * COURSES_PER_PAGE,
  );
  const courseFieldStyle = {
    width: "100%",
    background: "#172033",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "0.4rem",
    color: "#fff",
    padding: "0.6rem 0.7rem",
  };
  const courseLabelStyle = {
    display: "block" as const,
    color: "rgba(255,255,255,0.6)",
    fontSize: "0.76rem",
    marginBottom: "0.35rem",
  };
  const isSuccessMessage = msg.startsWith("✅") || msg.startsWith("âœ…");

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", fontFamily: "Inter, sans-serif" }}>

      <div style={{ display: "flex", minHeight: "calc(100vh - 66px)" }}>
      <div className="flex w-full flex-col">
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          {msg && (
            <div style={{
              background: isSuccessMessage?"rgba(34,197,94,0.1)":"rgba(239,68,68,0.1)",
              border:`1px solid ${isSuccessMessage?"rgba(34,197,94,0.3)":"rgba(239,68,68,0.3)"}`,
              borderRadius:"0.5rem",color:isSuccessMessage?"#86efac":"#fca5a5",
              padding:"0.6rem 1rem",marginBottom:"1rem",fontSize:"0.88rem",display:"flex",justifyContent:"space-between"
            }}>
              {msg} <span style={{ cursor:"pointer" }} onClick={() => setMsg("")}>✕</span>
            </div>
          )}

          {tab === "dashboard" && (
            <div>
              <h2 style={{ color: "#fff", marginTop: 0 }}>Department Overview</h2>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:"1rem",marginBottom:"2rem" }}>
                {statCard("Total Students", stats?.total_students, "#60a5fa")}
                {statCard("Total Courses", stats?.total_courses, "#a78bfa")}
                {statCard("Department Staff", stats?.total_staff, "#34d399")}
              </div>
            </div>
          )}

          {tab === "master-list" && (
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

          {tab === "staff" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "1rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
                <h2 style={{ color: "#fff", margin: 0 }}>Department Staff</h2>
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 130 }}>
                    <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.75rem" }}>Academic Session</div>
                    <div style={{ color: "#fff", fontWeight: 700, marginTop: "0.3rem" }}>{assignmentSession || "Not configured"}</div>
                  </div>
                  <div style={{ minWidth: 150 }}>
                    <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.75rem" }}>Semester</div>
                    <div style={{ color: "#fff", fontWeight: 700, marginTop: "0.3rem" }}>{assignmentSemester || "Not configured"}</div>
                  </div>
                </div>
              </div>

              <form
                onSubmit={assignDepartmentCourse}
                className="grid grid-cols-1 lg:grid-cols-[minmax(190px,1fr)_minmax(240px,2fr)_auto]"
                style={{ gap: "0.75rem", alignItems: "end", padding: "1rem 0", marginBottom: "1rem", borderTop: "1px solid rgba(255,255,255,0.08)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
              >
                <label style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.75rem" }}>
                  Lecturer / HOD
                  <select
                    value={assignmentStaffId}
                    onChange={e => { setAssignmentStaffId(e.target.value); setAssignmentCourseId(""); }}
                    style={{ display: "block", marginTop: "0.3rem", width: "100%", background: "#172033", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", borderRadius: "0.4rem", padding: "0.55rem 0.65rem" }}
                    required
                  >
                    <option value="">Select staff member</option>
                    {departmentStaff
                      .filter(staffMember =>
                        staffMember.status === "active" &&
                        (staffMember.role === "lecturer" ||
                          (staffMember.role === "hod" && String(staffMember.user_id) === String(user?.id))))
                      .map(staffMember => (
                        <option key={staffMember.staff_record_id} value={staffMember.staff_record_id}>
                          {staffMember.name} ({staffMember.assignment_count}/6)
                        </option>
                      ))}
                  </select>
                </label>
                <label style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.75rem" }}>
                  Department Course
                  <select
                    value={assignmentCourseId}
                    onChange={e => setAssignmentCourseId(e.target.value)}
                    disabled={!assignmentStaffId || (selectedAssignmentStaff?.assignment_count ?? 0) >= 6}
                    style={{ display: "block", marginTop: "0.3rem", width: "100%", background: "#172033", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", borderRadius: "0.4rem", padding: "0.55rem 0.65rem", opacity: !assignmentStaffId ? 0.55 : 1 }}
                    required
                  >
                    <option value="">Select course</option>
                    {availableDepartmentCourses.map(course => (
                      <option key={`${course.course_source || "ug"}:${course.id}`} value={`${course.course_source || "ug"}:${course.id}`}>
                        [{course.course_source === "pg" ? "PG" : "UG"}] {course.course_code} - {course.course_title}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  title="Assign course"
                  disabled={assignmentBusy || !assignmentStaffId || !assignmentCourseId || (selectedAssignmentStaff?.assignment_count ?? 0) >= 6}
                  style={{ height: 39, display: "inline-flex", alignItems: "center", gap: "0.45rem", background: "#2563eb", border: "none", color: "#fff", borderRadius: "0.45rem", padding: "0 1rem", cursor: assignmentBusy ? "not-allowed" : "pointer", fontWeight: 700, opacity: assignmentBusy ? 0.6 : 1 }}
                >
                  {assignmentBusy ? <Loader2 size={17} className="animate-spin" /> : <BookPlus size={17} />} {assignmentBusy ? "Assigning" : "Assign"}
                </button>
              </form>

              <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "0.5rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760, fontSize: "0.86rem" }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                      {["Staff Member", "Role", "Status", "Assigned Courses"].map(heading => (
                        <th key={heading} style={{ color: "rgba(255,255,255,0.55)", textAlign: heading === "Assigned Courses" ? "center" : "left", padding: "0.75rem", fontWeight: 600 }}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {departmentStaff.length === 0 ? (
                      <tr><td colSpan={4} style={{ padding: "2.5rem", textAlign: "center", color: "rgba(255,255,255,0.4)" }}>No staff found in this department.</td></tr>
                    ) : departmentStaff.map(staffMember => (
                      <tr key={staffMember.staff_record_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding: "0.85rem 0.75rem" }}>
                          <div style={{ color: "#fff", fontWeight: 650 }}>{staffMember.title ? `${staffMember.title} ` : ""}{staffMember.name}</div>
                          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.76rem", marginTop: "0.2rem" }}>{staffMember.email}</div>
                        </td>
                        <td style={{ padding: "0.85rem 0.75rem", color: "#93c5fd", textTransform: "capitalize" }}>{staffMember.role}</td>
                        <td style={{ padding: "0.85rem 0.75rem" }}>
                          <span style={{ color: staffMember.status === "active" ? "#86efac" : "#fca5a5", textTransform: "capitalize" }}>{staffMember.status}</span>
                        </td>
                        <td style={{ padding: "0.85rem 0.75rem", textAlign: "center" }}>
                          {!['lecturer', 'hod'].includes(staffMember.role) ? (
                            <span style={{ color: "rgba(255,255,255,0.3)" }}>-</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setCourseModalStaffId(staffMember.staff_record_id)}
                              style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "0.15rem", width: "100%", minWidth: 92, background: "transparent", border: 0, padding: 0, cursor: "pointer", color: "#93c5fd", textAlign: "center" }}
                            >
                              <span style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.42)" }}>click to view courses</span>
                              <span style={{ fontSize: "1.35rem", lineHeight: 1.1, fontWeight: 800 }}>{staffMember.assignment_count}</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "courses" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                <h2 style={{ color: "#fff", margin: 0 }}>Department Courses</h2>
                <button
                  type="button"
                  onClick={openAddCourseModal}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", background: "#2563eb", border: 0, color: "#fff", borderRadius: "0.45rem", padding: "0.6rem 0.9rem", cursor: "pointer", fontWeight: 700 }}
                >
                  <Plus size={17} /> Add Course
                </button>
              </div>
              <div style={{ position: "relative", maxWidth: 430, marginBottom: "1rem" }}>
                <Search size={17} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.4)" }} />
                <input
                  type="search"
                  value={courseSearch}
                  onChange={e => { setCourseSearch(e.target.value); setCoursePage(1); }}
                  placeholder="Search by course code or course name"
                  aria-label="Search courses"
                  style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "0.45rem", color: "#fff", padding: "0.65rem 0.8rem 0.65rem 2.4rem", outline: "none" }}
                />
              </div>
              <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "0.5rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760, fontSize: "0.86rem" }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                      {["Type", "Course Code", "Course Title", "Level", "Semester", "Units", "Category", "Status"].map(heading => (
                        <th key={heading} style={{ color: "rgba(255,255,255,0.55)", textAlign: "left", padding: "0.75rem", fontWeight: 600 }}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDepartmentCourses.length === 0 ? (
                      <tr><td colSpan={8} style={{ padding: "2.5rem", textAlign: "center", color: "rgba(255,255,255,0.4)" }}>{courseSearch ? "No courses match your search." : "No courses found in this department."}</td></tr>
                    ) : paginatedDepartmentCourses.map(course => (
                      <tr key={`${course.course_source || "ug"}:${course.id}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding: "0.8rem 0.75rem", color: course.course_source === "pg" ? "#fbbf24" : "#93c5fd", fontWeight: 700 }}>{course.course_source === "pg" ? "PG" : "UG"}</td>
                        <td style={{ padding: "0.8rem 0.75rem", color: "#93c5fd", fontWeight: 700 }}>{course.course_code}</td>
                        <td style={{ padding: "0.8rem 0.75rem", color: "#fff" }}>{course.course_title}</td>
                        <td style={{ padding: "0.8rem 0.75rem", color: "rgba(255,255,255,0.6)" }}>{course.level ? `${course.level}L` : "-"}</td>
                        <td style={{ padding: "0.8rem 0.75rem", color: "rgba(255,255,255,0.6)" }}>{course.semester || "-"}</td>
                        <td style={{ padding: "0.8rem 0.75rem", color: "rgba(255,255,255,0.6)" }}>{course.credit_units ?? "-"}</td>
                        <td style={{ padding: "0.8rem 0.75rem", color: "rgba(255,255,255,0.6)", textTransform: "capitalize" }}>{course.remark || "-"}</td>
                        <td style={{ padding: "0.8rem 0.75rem" }}>
                          <span style={{ color: course.status === "active" ? "#86efac" : "#fca5a5", textTransform: "capitalize" }}>{course.status || "-"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredDepartmentCourses.length > COURSES_PER_PAGE && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", marginTop: "1rem", color: "rgba(255,255,255,0.55)", fontSize: "0.8rem" }}>
                  <span>
                    Showing {(coursePage - 1) * COURSES_PER_PAGE + 1}-{Math.min(coursePage * COURSES_PER_PAGE, filteredDepartmentCourses.length)} of {filteredDepartmentCourses.length}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                    <button
                      type="button"
                      title="Previous page"
                      aria-label="Previous page"
                      disabled={coursePage === 1}
                      onClick={() => setCoursePage(page => Math.max(1, page - 1))}
                      style={{ width: 36, height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "0.4rem", color: "#fff", cursor: coursePage === 1 ? "not-allowed" : "pointer", opacity: coursePage === 1 ? 0.4 : 1 }}
                    >
                      <ChevronLeft size={17} />
                    </button>
                    <span style={{ minWidth: 78, textAlign: "center" }}>Page {coursePage} of {totalCoursePages}</span>
                    <button
                      type="button"
                      title="Next page"
                      aria-label="Next page"
                      disabled={coursePage === totalCoursePages}
                      onClick={() => setCoursePage(page => Math.min(totalCoursePages, page + 1))}
                      style={{ width: 36, height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "0.4rem", color: "#fff", cursor: coursePage === totalCoursePages ? "not-allowed" : "pointer", opacity: coursePage === totalCoursePages ? 0.4 : 1 }}
                    >
                      <ChevronRight size={17} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {tab === "upload" && (
            <div style={{ maxWidth: 800 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ color: "#fff", margin: 0 }}>Result Upload</h2>
                  <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.85rem", margin: "0.4rem 0 0" }}>Download and complete the CSV template before uploading results.</p>
                </div>
                <button type="button" onClick={downloadResultTemplate} style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", border: "1px solid rgba(96,165,250,0.4)", borderRadius: "0.5rem", background: "rgba(37,99,235,0.12)", color: "#93c5fd", padding: "0.65rem 1rem", fontWeight: 700, cursor: "pointer" }}>
                  <Download size={17} /> Download CSV Template
                </button>
              </div>
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.9rem", maxWidth: 600 }}>
                Upload completed result files for processing by ICT or PG Admin.
              </p>

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
                        cursor: uploading || isLocked ? "not-allowed" : "pointer",
                        fontWeight: 700, 
                        boxShadow: isLocked ? "none" : "0 4px 12px rgba(16,185,129,0.2)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.45rem",
                        opacity: uploading ? 0.7 : 1,
                      }}
                    >
                      {uploading && <Loader2 size={17} className="animate-spin" />}
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

                    <div style={{ padding: "1.5rem", maxHeight: "500px", overflowY: "auto" }}>
                      <div style={{ marginBottom: "1.25rem", color: "rgba(255,255,255,0.6)", fontSize: "0.85rem", fontStyle: "italic" }}>
                        Previewing converted results. Please verify CA and exam scores before submitting.
                      </div>
                      {preview.courses.map((courseCode: string) => (
                        <div key={courseCode} style={{ marginBottom: "2.5rem" }}>
                          <div style={{
                            color: "#60a5fa", fontWeight: 800, fontSize: "1.1rem",
                            borderBottom: "1px solid rgba(96,165,250,0.2)", paddingBottom: "0.5rem",
                            marginBottom: "0.75rem"
                          }}>
                            {courseCode}
                          </div>
                          <div style={{
                            display: "grid", gridTemplateColumns: "160px minmax(180px,1fr) 70px 70px 70px", gap: "1rem",
                            color: "rgba(255,255,255,0.4)", fontSize: "0.7rem", fontWeight: 700,
                            textTransform: "uppercase", padding: "0 0.5rem 0.5rem", borderBottom: "1px solid rgba(255,255,255,0.05)",
                            minWidth: 620
                          }}>
                            <span>Matric Number</span>
                            <span>Student Name</span>
                            <span style={{ textAlign: "center" }}>CA</span>
                            <span style={{ textAlign: "center" }}>Exam</span>
                            <span style={{ textAlign: "center" }}>Total</span>
                          </div>
                          <div style={{ fontFamily: "monospace", fontSize: "0.95rem", overflowX: "auto" }}>
                            {preview.students
                              .filter((student: any) => student.courses.some((course: any) => course.code === courseCode))
                              .map((student: any) => {
                                const courseData = student.courses.find((course: any) => course.code === courseCode);
                                return (
                                  <div key={`${student.matricNumber}-${courseCode}`} style={{
                                    display: "grid", gridTemplateColumns: "160px minmax(180px,1fr) 70px 70px 70px", gap: "1rem",
                                    color: "rgba(255,255,255,0.85)", padding: "0.45rem 0.5rem",
                                    borderBottom: "1px solid rgba(255,255,255,0.03)", minWidth: 620
                                  }}>
                                    <span style={{ color: "rgba(255,255,255,0.95)" }}>{student.matricNumber}</span>
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{student.name || "-"}</span>
                                    <span style={{ color: "#fbbf24", textAlign: "center", fontWeight: 600 }}>{courseData?.ca ?? 0}</span>
                                    <span style={{ color: "#10b981", textAlign: "center", fontWeight: 600 }}>{courseData?.exam ?? 0}</span>
                                    <span style={{ color: "#93c5fd", textAlign: "center", fontWeight: 700 }}>{courseData?.score ?? 0}</span>
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
              <h2 style={{ color: "#fff", marginTop: 0 }}>My Recent Submissions</h2>
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.9rem", marginBottom: "2rem" }}>
                Track the status of result uploads here.
              </p>

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
         </main>
       </div>
     </div>

     {courseModalStaff && (
       <div style={{ position: "fixed", inset: 0, zIndex: 145, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(2,6,23,0.75)", backdropFilter: "blur(5px)", padding: "1rem" }}>
         <div style={{ width: "100%", maxWidth: 720, maxHeight: "85vh", overflowY: "auto", background: "#111827", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "0.6rem", boxShadow: "0 24px 60px rgba(0,0,0,0.45)" }}>
           <div style={{ minHeight: 64, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", padding: "0 1.25rem", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
             <div>
               <h3 style={{ color: "#fff", margin: 0, fontSize: "1.05rem" }}>Approved Courses</h3>
               <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.76rem", marginTop: "0.2rem" }}>{courseModalStaff.title ? `${courseModalStaff.title} ` : ""}{courseModalStaff.name} · {assignmentSession} · {assignmentSemester}</div>
             </div>
             <button type="button" title="Close" aria-label="Close" onClick={() => setCourseModalStaffId(null)} style={{ width: 34, height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "transparent", border: 0, color: "rgba(255,255,255,0.55)", cursor: "pointer" }}>
               <X size={18} />
             </button>
           </div>
           <div style={{ padding: "1.25rem" }}>
             {courseModalStaff.assignments.length === 0 ? (
               <div style={{ padding: "2.5rem", textAlign: "center", color: "rgba(255,255,255,0.4)" }}>No approved courses.</div>
             ) : (
               <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "0.45rem" }}>
                 <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560, fontSize: "0.84rem" }}>
                   <thead>
                     <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                       {["Course Code", "Course Title", "Units", "Action"].map(heading => (
                         <th key={heading} style={{ color: "rgba(255,255,255,0.5)", textAlign: "left", padding: "0.7rem", fontWeight: 600 }}>{heading}</th>
                       ))}
                     </tr>
                   </thead>
                   <tbody>
                     {courseModalStaff.assignments.map(assignment => (
                       <tr key={assignment.assignment_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                         <td style={{ padding: "0.75rem 0.7rem", color: "#93c5fd", fontWeight: 700 }}>{assignment.course_code}</td>
                         <td style={{ padding: "0.75rem 0.7rem", color: "#fff" }}>{assignment.course_title}</td>
                         <td style={{ padding: "0.75rem 0.7rem", color: "rgba(255,255,255,0.55)" }}>{assignment.credit_units ?? "-"}</td>
                         <td style={{ padding: "0.75rem 0.7rem" }}>
                           <button type="button" title={`Remove ${assignment.course_code}`} aria-label={`Remove ${assignment.course_code}`} disabled={removingAssignmentId === assignment.assignment_id} onClick={() => removeDepartmentCourse(assignment.assignment_id)} style={{ width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "0.35rem", color: "#fca5a5", cursor: removingAssignmentId === assignment.assignment_id ? "not-allowed" : "pointer", opacity: removingAssignmentId === assignment.assignment_id ? 0.65 : 1 }}>
                             {removingAssignmentId === assignment.assignment_id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                           </button>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             )}
           </div>
         </div>
       </div>
     )}

     {showAddCourse && (
       <div style={{ position: "fixed", inset: 0, zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(2,6,23,0.75)", backdropFilter: "blur(5px)", padding: "1rem" }}>
         <div style={{ width: "100%", maxWidth: 620, maxHeight: "90vh", overflowY: "auto", background: "#111827", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "0.6rem", boxShadow: "0 24px 60px rgba(0,0,0,0.45)" }}>
           <div style={{ minHeight: 58, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", padding: "0 1.25rem", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
             <h3 style={{ color: "#fff", margin: 0, fontSize: "1.05rem" }}>{confirmCourse ? "Confirm New Course" : "Add Course"}</h3>
             <button type="button" title="Close" aria-label="Close" onClick={closeAddCourseModal} disabled={addingCourse} style={{ width: 34, height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "transparent", border: 0, color: "rgba(255,255,255,0.55)", cursor: addingCourse ? "not-allowed" : "pointer" }}>
               <X size={18} />
             </button>
           </div>

           {!confirmCourse ? (
             <form onSubmit={reviewNewCourse} style={{ padding: "1.25rem" }}>
               <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: "1rem" }}>
                 <div className="md:col-span-2">
                   <label style={courseLabelStyle}>Department</label>
                   <input disabled value={stats?.department?.name || "Current department"} style={{ ...courseFieldStyle, opacity: 0.65, cursor: "not-allowed" }} />
                 </div>
                 <div>
                   <label style={courseLabelStyle}>Course Code</label>
                   <input required value={courseForm.course_code} onChange={e => setCourseForm(form => ({ ...form, course_code: e.target.value.toUpperCase() }))} placeholder="e.g. CSC 301" style={courseFieldStyle} />
                 </div>
                 <div>
                   <label style={courseLabelStyle}>Course Name</label>
                   <input required value={courseForm.course_title} onChange={e => setCourseForm(form => ({ ...form, course_title: e.target.value }))} placeholder="Course title" style={courseFieldStyle} />
                 </div>
                 <div>
                   <label style={courseLabelStyle}>Units</label>
                   <input required type="number" min="1" max="10" value={courseForm.unit} onChange={e => setCourseForm(form => ({ ...form, unit: e.target.value }))} style={courseFieldStyle} />
                 </div>
                 <div>
                   <label style={courseLabelStyle}>Level</label>
                   <select required value={courseForm.level} onChange={e => setCourseForm(form => ({ ...form, level: e.target.value }))} style={courseFieldStyle}>
                     {[100,200,300,400,500,600,700,800].map(level => <option key={level} value={level}>{level} Level</option>)}
                   </select>
                 </div>
                 <div>
                   <label style={courseLabelStyle}>Semester</label>
                   <select required value={courseForm.semester} onChange={e => setCourseForm(form => ({ ...form, semester: e.target.value }))} style={courseFieldStyle}>
                     <option value="First semester">First semester</option>
                     <option value="Second semester">Second semester</option>
                   </select>
                 </div>
                 <div>
                   <label style={courseLabelStyle}>Status</label>
                   <select required value={courseForm.status} onChange={e => setCourseForm(form => ({ ...form, status: e.target.value }))} style={courseFieldStyle}>
                     <option value="active">Active</option>
                     <option value="inactive">Inactive</option>
                   </select>
                 </div>
                 <div>
                   <label style={courseLabelStyle}>Category</label>
                   <select required value={courseForm.remark} onChange={e => setCourseForm(form => ({ ...form, remark: e.target.value }))} style={courseFieldStyle}>
                     <option value="compulsory">Compulsory</option>
                     <option value="core">Core</option>
                     <option value="elective">Elective</option>
                     <option value="required">Required</option>
                   </select>
                 </div>
               </div>
               <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.4rem" }}>
                 <button type="button" disabled={addingCourse} onClick={closeAddCourseModal} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", borderRadius: "0.4rem", padding: "0.6rem 1rem", cursor: addingCourse ? "not-allowed" : "pointer", opacity: addingCourse ? 0.6 : 1 }}>Cancel</button>
                 <button type="submit" style={{ background: "#2563eb", border: 0, color: "#fff", borderRadius: "0.4rem", padding: "0.6rem 1rem", cursor: "pointer", fontWeight: 700 }}>Review Course</button>
               </div>
             </form>
           ) : (
             <div style={{ padding: "1.25rem" }}>
               <div style={{ display: "flex", alignItems: "flex-start", gap: "0.8rem", color: "#fcd34d", marginBottom: "1.2rem" }}>
                 <AlertTriangle size={21} style={{ flexShrink: 0, marginTop: 1 }} />
                 <div>
                   <div style={{ color: "#fff", fontWeight: 750 }}>Are you sure you want to add {courseForm.course_code.toUpperCase()} - {courseForm.course_title}?</div>
                 </div>
               </div>
               <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "0.75rem", padding: "1rem 0", borderTop: "1px solid rgba(255,255,255,0.08)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                 {[
                   ["Department", stats?.department?.name || "Current department"],
                   ["Units", courseForm.unit],
                   ["Level", `${courseForm.level} Level`],
                   ["Semester", courseForm.semester],
                   ["Status", courseForm.status],
                   ["Category", courseForm.remark],
                 ].map(([label, value]) => (
                   <div key={label}>
                     <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.7rem", marginBottom: "0.2rem" }}>{label}</div>
                     <div style={{ color: "#fff", fontSize: "0.86rem", textTransform: label === "Status" || label === "Category" ? "capitalize" : "none" }}>{value}</div>
                   </div>
                 ))}
               </div>
               <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.25rem" }}>
                 <button type="button" disabled={addingCourse} onClick={() => setConfirmCourse(false)} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", borderRadius: "0.4rem", padding: "0.6rem 1rem", cursor: addingCourse ? "not-allowed" : "pointer" }}>Back</button>
                 <button type="button" disabled={addingCourse} onClick={addDepartmentCourse} style={{ background: "#2563eb", border: 0, color: "#fff", borderRadius: "0.4rem", padding: "0.6rem 1rem", cursor: addingCourse ? "not-allowed" : "pointer", fontWeight: 700, opacity: addingCourse ? 0.65 : 1, display: "inline-flex", alignItems: "center", gap: "0.45rem" }}>{addingCourse && <Loader2 size={16} className="animate-spin" />}{addingCourse ? "Adding..." : "Yes, Add Course"}</button>
               </div>
             </div>
           )}
         </div>
       </div>
     )}
    </div>
  );
}

export default function HODDashboard() {
  return (
    <Suspense fallback={<HODDashboardSkeleton />}>
      <HODDashboardInner />
    </Suspense>
  );
}

function HODDashboardSkeleton() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0f172a" }}>
      {/* Sidebar placeholder */}
      <div style={{ width: 80, background: "#0d1526", borderRight: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Header bar */}
        <div style={{ height: 64, background: "#172033", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", padding: "0 1.5rem", gap: "1rem" }}>
          <div style={{ width: 120, height: 20, borderRadius: 6, background: "rgba(255,255,255,0.08)" }} className="animate-pulse" />
          <div style={{ flex: 1 }} />
          <div style={{ width: 80, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.08)" }} className="animate-pulse" />
        </div>
        {/* Tab bar */}
        <div style={{ display: "flex", gap: "0.5rem", padding: "1rem 1.5rem 0", background: "#0f172a" }}>
          {[100, 80, 90, 70].map((w, i) => (
            <div key={i} style={{ width: w, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.05)" }} className="animate-pulse" />
          ))}
        </div>
        {/* Content cards */}
        <div style={{ padding: "1.5rem", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: "1rem" }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ height: 100, borderRadius: 12, background: "#172033", border: "1px solid rgba(255,255,255,0.08)" }} className="animate-pulse" />
          ))}
        </div>
        {/* Table skeleton */}
        <div style={{ margin: "0 1.5rem", borderRadius: 12, background: "#172033", border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ display: "flex", gap: "1rem", padding: "0.85rem 1rem", borderBottom: "1px solid #222" }}>
              <div style={{ width: "30%", height: 14, borderRadius: 4, background: "rgba(255,255,255,0.07)" }} className="animate-pulse" />
              <div style={{ width: "20%", height: 14, borderRadius: 4, background: "rgba(255,255,255,0.07)" }} className="animate-pulse" />
              <div style={{ width: "15%", height: 14, borderRadius: 4, background: "rgba(255,255,255,0.07)" }} className="animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
