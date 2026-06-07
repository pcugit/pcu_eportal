"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

type Course = {
  assignment_id: number; course_id: number; course_code: string;
  course_title: string; credit_units: number; department: string;
  session: string; semester: string; enrolled_count: number;
};
type Student = {
  student_id: number; matric_number: string; student_name: string;
  program_name: string; current_level: string;
  score_id?: number; ca_score?: number; exam_score?: number;
  total_score?: number; grade?: string; score_status?: string;
};

export default function LecturerDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [courses, setCourses]     = useState<Course[]>([]);
  const [selected, setSelected]   = useState<Course | null>(null);
  const [students, setStudents]   = useState<Student[]>([]);
  const [msg, setMsg]             = useState("");
  const [tab, setTab]             = useState<"courses" | "details" | "upload" | "submissions">("courses");
  const uploadInputRef            = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview]     = useState<any>(null);
  const [history, setHistory]     = useState<any[]>([]);
  const [isLocked, setIsLocked]   = useState(false);
  const [sysSettings, setSysSettings] = useState<any>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !["lecturer","deo","hod","admin"].includes(user?.role ?? "")) {
      router.push("/staff/login");
      return;
    }
    loadCourses();
    if (user?.id) loadHistory(user.id);
    checkPortalLock();
    loadSysSettings();
  }, [isAuthenticated, user, authLoading, router]);

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
      const { data } = await ApiClient.fetch(`/results/pending?staffId=${staffId}`);
      setHistory(data);
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
      const res = await ApiClient.fetch<any>(
        `/staff/courses/${course.course_id}/students?session=${course.session}&semester=${course.semester}`);
      setStudents(res.data?.students ?? []);
    } catch (e: any) { setMsg(e.message); }
  }

  function logout() {
    ApiClient.setToken(null);
    localStorage.removeItem("staff_user");
    router.push("/staff/login");
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
        setMsg("❌ Failed to parse Excel: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function parseExcelForUpload(sheet: XLSX.WorkSheet, currentSettings?: any) {
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    const metadata: any = { 
      academicSession: currentSettings?.current_academic_session || "2024/2025", 
      semester: currentSettings?.current_semester || "First Semester" 
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
    }

    // 2. Find Student Headers
    let headerIdx = -1;
    let matricIdx = -1, nameIdx = -1, scoreStartIdx = -1;
    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      if (!r) continue;
      for (let j = 0; j < r.length; j++) {
        const c = String(r[j] || "").toLowerCase();
        if (c.includes("matric")) { matricIdx = j; headerIdx = i; }
        else if (c.includes("name") && headerIdx === i) { nameIdx = j; scoreStartIdx = j + 1; }
      }
      if (headerIdx !== -1) break;
    }

    if (headerIdx === -1) throw new Error("Could not find student headers (Matric No/Name)");

    const hRow = data[headerIdx];
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
            const ca = m.caIdx !== -1 ? parseFloat(String(r[m.caIdx] || "0")) : 0;
            const exam = m.examIdx !== -1 ? parseFloat(String(r[m.examIdx] || "0")) : 0;
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
              name: String(r[nameIdx]).trim(),
              courses: studCourses
            });
        }
    }

    return { metadata, students, courses };
  }


  async function submitToICT() {
    if (!preview || !user) return;
    setUploading(true); setMsg("");
    try {
      const resultsFormatted = preview.students.map((s: any) => ({
        studentInfo: {
          name: s.name,
          matricNumber: s.matricNumber,
          level: "100", // Default or extract
          faculty: preview.metadata.faculty || "Unknown",
          department: preview.metadata.department || "Unknown",
          academicSession: preview.metadata.academicSession || "2024/2025",
          semester: preview.metadata.semester || "First Semester"
        },
        courses: s.courses
      }));

      const { data } = await ApiClient.fetch("/results/pending", {
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
      
      setMsg("✅ Successfully submitted to ICT for processing.");
      setPreview(null);
      if (user) loadHistory(user.id);
    } catch (err: any) {
      setMsg("❌ Error submitting: " + err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", fontFamily: "Inter, sans-serif" }}>

      <div className="flex flex-col">
        {/* Horizontal Tabs List */}
        <div className="bg-slate-900/50 border-b border-white/5 sticky top-0 z-30 px-8 py-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 min-w-max">
            {[
              { id: "courses", label: "📚 My Courses" },
              { id: "upload", label: "📤 Upload Results", locked: isLocked },
              { id: "submissions", label: "📜 Upload History" },
            ].map((item) => {
              const isActive = tab === item.id || (item.id === "courses" && tab === "details");
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.locked) return;
                    setTab(item.id as any);
                  }}
                  disabled={item.locked}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2",
                    isActive 
                      ? "bg-blue-600/20 text-blue-400 border border-blue-500/30" 
                      : "text-slate-400 hover:text-slate-100 hover:bg-white/5 border border-transparent",
                    item.locked && "opacity-50 cursor-not-allowed grayscale"
                  )}
                >
                  {item.label}
                  {item.locked && <span className="text-[10px]">🔒</span>}
                </button>
              );
            })}
          </div>
        </div>

        <main className="flex-1 p-8 overflow-y-auto">
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
                          {c.semester} · {c.session}<br />
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
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
                      <button onClick={() => setTab("courses")} style={{
                        background: "transparent", border: "1px solid rgba(255,255,255,0.2)",
                        color: "rgba(255,255,255,0.6)", borderRadius: "0.5rem",
                        padding: "0.35rem 0.75rem", cursor: "pointer", fontSize: "0.82rem"
                      }}>← Back</button>
                      <div>
                        <h2 style={{ color: "#fff", margin: 0 }}>{selected.course_code} — {selected.course_title}</h2>
                        <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.8rem" }}>{selected.semester} · {selected.session} · {selected.credit_units} Units</div>
                      </div>
                    </div>

                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                            {["Matric No","Name","Current Level","Course Status"].map(h => (
                              <th key={h} style={{ color: "rgba(255,255,255,0.5)", textAlign: "left", padding: "0.6rem 0.75rem", fontWeight: 600 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {students.length === 0 ? (
                            <tr><td colSpan={4} style={{ padding: "2rem", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>No students enrolled in this course yet.</td></tr>
                          ) : (
                            students.map(s => (
                              <tr key={s.student_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                <td style={{ padding: "0.6rem 0.75rem", color: "#60a5fa" }}>{s.matric_number}</td>
                                <td style={{ padding: "0.6rem 0.75rem", color: "#fff" }}>{s.student_name}</td>
                                <td style={{ padding: "0.6rem 0.75rem", color: "rgba(255,255,255,0.5)" }}>{s.current_level || "100"}L</td>
                                <td style={{ padding: "0.6rem 0.75rem" }}>
                                  <span style={{
                                    background: "rgba(34,197,94,0.1)",
                                    color: "#86efac",
                                    borderRadius: "999px", padding: "0.15rem 0.6rem", fontSize: "0.75rem"
                                  }}>Enrolled</span>
                                </td>
                              </tr>
                            ))
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
              <h2 style={{ color: "#fff", marginTop: 0 }}>Bulk Result Upload</h2>
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.9rem", maxWidth: 600 }}>
                Upload an Excel file containing results. The ICT Director will review and process these results into the official records.
              </p>

              <div style={{
                background: "rgba(255,255,255,0.03)", border: "2px dashed rgba(255,255,255,0.1)",
                borderRadius: "1rem", padding: "3rem", textAlign: "center", marginTop: "1.5rem",
                cursor: isLocked ? "not-allowed" : "pointer",
                opacity: isLocked ? 0.6 : 1
              }} onClick={() => !isLocked && uploadInputRef.current?.click()}>
                <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>📄</div>
                <div style={{ color: "#fff", fontWeight: 700 }}>Click to select Excel file</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.8rem", marginTop: "0.5rem" }}>Supports .xlsx, .xls</div>
                <input 
                   type="file" ref={uploadInputRef} hidden accept=".xlsx,.xls"
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
                      onClick={submitToICT}
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
                      {uploading ? "Uploading..." : isLocked ? "Portal Locked" : "Submit to ICT →"}
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
              
              {msg && (
                <div style={{
                  marginTop: "1.5rem",
                  background: msg.startsWith("✅") ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                  border: `1px solid ${msg.startsWith("✅") ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                  borderRadius: "0.5rem", color: msg.startsWith("✅") ? "#86efac" : "#fca5a5",
                  padding: "0.6rem 1rem", fontSize: "0.88rem"
                }}>{msg}</div>
              )}
            </div>
          )}
          {tab === "submissions" && (
            <div>
              <h2 style={{ color: "#fff", marginTop: 0 }}>My Recent Submissions</h2>
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.9rem", marginBottom: "2rem" }}>
                Track the status of your bulk result uploads here.
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
  );
}
