"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

type Result = {
  id: number; matric_number: string; student_name: string; current_level: string;
  course_code: string; course_title: string;
  ca_score: number; exam_score: number; total_score: number;
  grade: string; status: string; session: string; semester: string;
  entered_by: string; entered_role: string;
};

export default function HODDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [stats, setStats]     = useState<any>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [msg, setMsg]         = useState("");
  const [tab, setTab]         = useState("dashboard");
  
  const uploadInputRef            = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview]     = useState<any>(null);
  const [history, setHistory]     = useState<any[]>([]);
  const [isLocked, setIsLocked]   = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !["hod", "admin"].includes(user?.role)) {
      router.push("/staff/login");
      return;
    }
    loadDashboard();
    loadCourses();
    if (user?.id) loadHistory(user.id);
    checkPortalLock();
  }, [isAuthenticated, user, authLoading, router]);

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

  async function loadDashboard() {
    try {
      const r = await ApiClient.fetch<any>("/hod/dashboard");
      setStats(r.data);
    } catch {}
  }

  async function loadCourses() {
    try {
      const res = await ApiClient.fetch<any>("/staff/courses");
      setCourses(res.data?.courses ?? []);
    } catch {}
  }

  async function selectCourse(course: any) {
    setSelected(course);
    setTab("details");
    try {
      const res = await ApiClient.fetch<any>(
        `/staff/courses/${course.course_id}/students?session=${course.session}&semester=${course.semester}`);
      setStudents(res.data?.students ?? []);
    } catch (e: any) { setMsg(e.message); }
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

  async function submitToICT() {
    if (!preview || !user) return;
    setUploading(true); setMsg("");
    try {
      const resultsFormatted = preview.students.map((s: any) => ({
        studentInfo: {
          name: s.name,
          matricNumber: s.matricNumber,
          level: "100",
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

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", fontFamily: "Inter, sans-serif" }}>

      <div style={{ display: "flex", minHeight: "calc(100vh - 66px)" }}>
      <div className="flex flex-col">
        {/* Horizontal Tabs List */}
        <div className="bg-slate-900/50 border-b border-white/5 sticky top-0 z-30 px-8 py-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 min-w-max">
            {[
              { id: "dashboard", label: "📊 Overview" },
              { id: "courses", label: "📚 My Courses" },
              { id: "upload", label: "📤 Result Upload", locked: isLocked },
              { id: "submissions", label: "📜 History" },
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
          {msg && (
            <div style={{
              background: msg.startsWith("✅")?"rgba(34,197,94,0.1)":"rgba(239,68,68,0.1)",
              border:`1px solid ${msg.startsWith("✅")?"rgba(34,197,94,0.3)":"rgba(239,68,68,0.3)"}`,
              borderRadius:"0.5rem",color:msg.startsWith("✅")?"#86efac":"#fca5a5",
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
              </div>
            </div>
          )}

          {tab === "courses" && (
            <div>
              <h2 style={{ color: "#fff", marginTop: 0 }}>My Assigned Courses</h2>
              {courses.length === 0
                ? <p style={{ color: "rgba(255,255,255,0.4)" }}>No courses assigned to you specifically.</p>
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
                            {["Matric No","Name","Current Level"].map(h => (
                              <th key={h} style={{ color: "rgba(255,255,255,0.5)", textAlign: "left", padding: "0.6rem 0.75rem", fontWeight: 600 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {students.length === 0 ? (
                            <tr><td colSpan={3} style={{ padding: "2rem", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>No students enrolled.</td></tr>
                          ) : (
                            students.map(s => (
                              <tr key={s.student_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                <td style={{ padding: "0.6rem 0.75rem", color: "#60a5fa" }}>{s.matric_number}</td>
                                <td style={{ padding: "0.6rem 0.75rem", color: "#fff" }}>{s.student_name}</td>
                                <td style={{ padding: "0.6rem 0.75rem", color: "rgba(255,255,255,0.5)" }}>{s.current_level || "100"}L</td>
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
              <h2 style={{ color: "#fff", marginTop: 0 }}>Result Upload</h2>
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
    </div>
  );
}
