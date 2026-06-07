"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient } from "@/lib/api";
import { cn } from "@/lib/utils";

type Student = {
  id: number; matric_number: string; name: string; email: string;
  program: string; current_level: string; session: string;
};
type TranscriptLog = {
  id: number; student_id: number; matric_number: string; student_name: string;
  status: string; created_at: string; signed_at: string | null; signed_by: string | null;
};

export default function RegistrarDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [stats, setStats]       = useState<any>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [logs, setLogs]         = useState<TranscriptLog[]>([]);
  const [search, setSearch]     = useState("");
  const [transcript, setTranscript] = useState<any>(null);
  const [tab, setTab]           = useState("dashboard");
  const [busy, setBusy]         = useState<number|null>(null);
  const [msg, setMsg]           = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !["registrar", "admin"].includes(user?.role ?? "")) {
      router.push("/staff/login");
      return;
    }
    loadDashboard();
    loadLogs();
  }, [isAuthenticated, user, authLoading, router]);

  async function loadDashboard() {
    try { const r = await ApiClient.fetch<any>("/registrar/dashboard"); setStats(r.data); } catch {}
  }
  async function loadStudents() {
    try {
      const r = await ApiClient.fetch<any>(`/registrar/students?search=${encodeURIComponent(search)}`);
      setStudents(r.data?.students ?? []);
    } catch {}
  }
  async function loadLogs() {
    try { const r = await ApiClient.fetch<any>("/registrar/transcripts"); setLogs(r.data?.transcripts ?? []); } catch {}
  }
  async function viewTranscript(studentId: number) {
    try {
      const r = await ApiClient.fetch<any>(`/registrar/student/${studentId}/transcript`);
      setTranscript(r.data); setTab("transcript");
    } catch (e: any) { setMsg("❌ " + e.message); }
  }
  async function requestTranscript(studentId: number) {
    try {
      await ApiClient.fetch<any>("/registrar/transcripts/request", {
        method: "POST", body: JSON.stringify({ student_id: studentId })
      });
      setMsg("✅ Transcript request submitted.");
      loadLogs();
    } catch (e: any) { setMsg("❌ " + e.message); }
  }
  async function signTranscript(logId: number) {
    setBusy(logId);
    try {
      await ApiClient.fetch<any>(`/registrar/transcripts/${logId}/sign`, { method: "POST" });
      setMsg("✅ Transcript signed.");
      loadLogs();
    } catch (e: any) { setMsg("❌ " + e.message); }
    finally { setBusy(null); }
  }
  async function issueTranscript(logId: number) {
    setBusy(logId);
    try {
      await ApiClient.fetch<any>(`/registrar/transcripts/${logId}/issue`, { method: "POST" });
      setMsg("✅ Transcript issued.");
      loadLogs();
    } catch (e: any) { setMsg("❌ " + e.message); }
    finally { setBusy(null); }
  }

  const statCard = (label: string, value: any, color: string) => (
    <div style={{ background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"0.75rem",padding:"1.25rem 1.5rem" }}>
      <div style={{ color:"rgba(255,255,255,0.5)",fontSize:"0.8rem",marginBottom:"0.4rem" }}>{label}</div>
      <div style={{ color,fontSize:"2rem",fontWeight:800 }}>{value??0}</div>
    </div>
  );

  const statusBadge = (s: string) => {
    const map: Record<string,[string,string]> = {
      pending: ["rgba(251,191,36,0.15)","#fcd34d"],
      signed:  ["rgba(34,197,94,0.15)","#86efac"],
      issued:  ["rgba(59,130,246,0.15)","#93c5fd"],
    };
    const [bg,color] = map[s] ?? ["rgba(255,255,255,0.08)","rgba(255,255,255,0.5)"];
    return <span style={{ background:bg,color,borderRadius:"999px",padding:"0.15rem 0.65rem",fontSize:"0.75rem" }}>{s}</span>;
  };

  return (
    <div style={{ minHeight:"100vh",background:"#0f172a",fontFamily:"Inter, sans-serif" }}>

      <div className="flex flex-col">
        {/* Horizontal Tabs List */}
        <div className="bg-slate-900/50 border-b border-white/5 sticky top-0 z-30 px-8 py-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 min-w-max">
            {[
              { id:"dashboard",   label:"📊 Overview" },
              { id:"students",    label:"🎓 Students" },
              { id:"transcripts", label:"📄 Transcripts" },
            ].map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} className={cn(
                "px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200",
                tab === t.id
                  ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                  : "text-slate-400 hover:text-slate-100 hover:bg-white/5 border border-transparent"
              )}>{t.label}</button>
            ))}
          </div>
        </div>

        <main className="flex-1 p-8 overflow-y-auto">
          {msg && (
            <div style={{
              background:msg.startsWith("✅")?"rgba(34,197,94,0.1)":"rgba(239,68,68,0.1)",
              border:`1px solid ${msg.startsWith("✅")?"rgba(34,197,94,0.3)":"rgba(239,68,68,0.3)"}`,
              borderRadius:"0.5rem",color:msg.startsWith("✅")?"#86efac":"#fca5a5",
              padding:"0.6rem 1rem",marginBottom:"1rem",fontSize:"0.88rem",display:"flex",justifyContent:"space-between"
            }}>
              {msg} <span style={{ cursor:"pointer" }} onClick={()=>setMsg("")}>✕</span>
            </div>
          )}

          {tab === "dashboard" && (
            <div>
              <h2 style={{ color:"#fff",marginTop:0 }}>Registrar Overview</h2>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:"1rem" }}>
                {statCard("Total Students", stats?.total_students, "#60a5fa")}
                {statCard("Pending Transcripts", stats?.pending_transcripts, "#fbbf24")}
                {statCard("Signed Transcripts", stats?.signed_transcripts, "#86efac")}
                {statCard("Approved Scores", stats?.total_approved_scores, "#a78bfa")}
              </div>
            </div>
          )}

          {tab === "students" && (
            <div>
              <div style={{ display:"flex",gap:"0.75rem",marginBottom:"1.5rem",alignItems:"center" }}>
                <h2 style={{ color:"#fff",margin:0 }}>All Students</h2>
                <input
                  placeholder="Search by name or matric…"
                  value={search}
                  onChange={e=>setSearch(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&loadStudents()}
                  style={{ flex:1,maxWidth:280,background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",color:"#fff",borderRadius:"0.5rem",padding:"0.4rem 0.75rem",fontSize:"0.85rem" }}
                />
                <button onClick={loadStudents} style={{ background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",border:"none",color:"#fff",borderRadius:"0.5rem",padding:"0.4rem 0.9rem",cursor:"pointer",fontSize:"0.85rem" }}>Search</button>
              </div>
              <table style={{ width:"100%",borderCollapse:"collapse",fontSize:"0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom:"1px solid rgba(255,255,255,0.1)" }}>
                    {["Matric","Name","Email","Program","Level","Actions"].map(h=>(
                      <th key={h} style={{ color:"rgba(255,255,255,0.5)",textAlign:"left",padding:"0.55rem 0.5rem",whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.length===0
                    ? <tr><td colSpan={6} style={{ color:"rgba(255,255,255,0.3)",padding:"2rem",textAlign:"center" }}>Search for a student above.</td></tr>
                    : students.map(s=>(
                      <tr key={s.id} style={{ borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding:"0.5rem",color:"#60a5fa" }}>{s.matric_number}</td>
                        <td style={{ padding:"0.5rem",color:"#fff" }}>{s.name}</td>
                        <td style={{ padding:"0.5rem",color:"rgba(255,255,255,0.5)",fontSize:"0.78rem" }}>{s.email}</td>
                        <td style={{ padding:"0.5rem",color:"rgba(255,255,255,0.7)" }}>{s.program}</td>
                        <td style={{ padding:"0.5rem",color:"rgba(255,255,255,0.5)" }}>{s.current_level}</td>
                        <td style={{ padding:"0.5rem",display:"flex",gap:"0.4rem" }}>
                          <button onClick={()=>viewTranscript(s.id)} style={{ background:"rgba(59,130,246,0.15)",border:"1px solid rgba(59,130,246,0.3)",color:"#93c5fd",borderRadius:"0.35rem",padding:"0.2rem 0.6rem",cursor:"pointer",fontSize:"0.78rem" }}>View</button>
                          <button onClick={()=>requestTranscript(s.id)} style={{ background:"rgba(34,197,94,0.15)",border:"1px solid rgba(34,197,94,0.3)",color:"#86efac",borderRadius:"0.35rem",padding:"0.2rem 0.6rem",cursor:"pointer",fontSize:"0.78rem" }}>Request</button>
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          )}

          {tab === "transcripts" && (
            <div>
              <h2 style={{ color:"#fff",marginTop:0 }}>Transcript Requests</h2>
              <table style={{ width:"100%",borderCollapse:"collapse",fontSize:"0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom:"1px solid rgba(255,255,255,0.1)" }}>
                    {["#","Student","Matric","Requested","Status","Signed By","Actions"].map(h=>(
                      <th key={h} style={{ color:"rgba(255,255,255,0.5)",textAlign:"left",padding:"0.55rem 0.5rem",whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.length===0
                    ? <tr><td colSpan={7} style={{ color:"rgba(255,255,255,0.3)",padding:"2rem",textAlign:"center" }}>No transcript requests yet.</td></tr>
                    : logs.map(l=>(
                      <tr key={l.id} style={{ borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding:"0.5rem",color:"rgba(255,255,255,0.4)" }}>{l.id}</td>
                        <td style={{ padding:"0.5rem",color:"#fff" }}>{l.student_name}</td>
                        <td style={{ padding:"0.5rem",color:"#60a5fa" }}>{l.matric_number}</td>
                        <td style={{ padding:"0.5rem",color:"rgba(255,255,255,0.5)",fontSize:"0.78rem" }}>{l.created_at ? new Date(l.created_at).toLocaleDateString() : "—"}</td>
                        <td style={{ padding:"0.5rem" }}>{statusBadge(l.status)}</td>
                        <td style={{ padding:"0.5rem",color:"rgba(255,255,255,0.5)" }}>{l.signed_by || "—"}</td>
                        <td style={{ padding:"0.5rem",display:"flex",gap:"0.4rem" }}>
                          {l.status === "pending" && (
                            <button onClick={()=>signTranscript(l.id)} disabled={busy===l.id} style={{ background:"rgba(34,197,94,0.15)",border:"1px solid rgba(34,197,94,0.3)",color:"#86efac",borderRadius:"0.35rem",padding:"0.2rem 0.6rem",cursor:"pointer",fontSize:"0.78rem" }}>
                              ✍ Sign
                            </button>
                          )}
                          {l.status === "signed" && (
                            <button onClick={()=>issueTranscript(l.id)} disabled={busy===l.id} style={{ background:"rgba(59,130,246,0.15)",border:"1px solid rgba(59,130,246,0.3)",color:"#93c5fd",borderRadius:"0.35rem",padding:"0.2rem 0.6rem",cursor:"pointer",fontSize:"0.78rem" }}>
                              📤 Issue
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          )}

          {tab === "transcript" && transcript && (
            <div>
              <button onClick={()=>setTab("students")} style={{ background:"transparent",border:"1px solid rgba(255,255,255,0.2)",color:"rgba(255,255,255,0.6)",borderRadius:"0.5rem",padding:"0.35rem 0.75rem",cursor:"pointer",fontSize:"0.82rem",marginBottom:"1.25rem" }}>
                ← Back
              </button>
              <div style={{ background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"0.75rem",padding:"1.5rem",marginBottom:"1.5rem" }}>
                <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:"0.75rem" }}>
                  {[
                    ["Matric", transcript.student.matric_number],
                    ["Name", transcript.student.name],
                    ["Program", transcript.student.program],
                    ["Department", transcript.student.department],
                    ["Faculty", transcript.student.faculty],
                    ["Level", transcript.student.current_level],
                    ["GPA", transcript.gpa],
                    ["Total Credit Units", transcript.total_credit_units],
                  ].map(([k,v]) => (
                    <div key={String(k)}>
                      <div style={{ color:"rgba(255,255,255,0.45)",fontSize:"0.75rem" }}>{k}</div>
                      <div style={{ color:"#fff",fontWeight:600 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
              <table style={{ width:"100%",borderCollapse:"collapse",fontSize:"0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom:"1px solid rgba(255,255,255,0.1)" }}>
                    {["Session","Sem","Code","Title","Units","CA","Exam","Total","Grade","GP"].map(h=>(
                      <th key={h} style={{ color:"rgba(255,255,255,0.5)",textAlign:"left",padding:"0.5rem" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(transcript.scores||[]).map((s:any,i:number)=>(
                    <tr key={i} style={{ borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
                      <td style={{ padding:"0.5rem",color:"rgba(255,255,255,0.5)",fontSize:"0.78rem" }}>{s.session}</td>
                      <td style={{ padding:"0.5rem",color:"rgba(255,255,255,0.5)",fontSize:"0.78rem" }}>{s.semester?.split(" ")[0]}</td>
                      <td style={{ padding:"0.5rem",color:"#60a5fa" }}>{s.course_code}</td>
                      <td style={{ padding:"0.5rem",color:"#fff" }}>{s.course_title}</td>
                      <td style={{ padding:"0.5rem",color:"rgba(255,255,255,0.6)" }}>{s.credit_units}</td>
                      <td style={{ padding:"0.5rem",color:"#fff" }}>{s.ca_score}</td>
                      <td style={{ padding:"0.5rem",color:"#fff" }}>{s.exam_score}</td>
                      <td style={{ padding:"0.5rem",color:"#fff",fontWeight:700 }}>{s.total_score}</td>
                      <td style={{ padding:"0.5rem",fontWeight:700,color:s.grade==="A"?"#86efac":s.grade==="F"?"#fca5a5":"#fcd34d" }}>{s.grade}</td>
                      <td style={{ padding:"0.5rem",color:"rgba(255,255,255,0.6)" }}>{s.grade_point}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
