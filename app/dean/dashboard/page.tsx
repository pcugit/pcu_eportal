"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function DeanDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [data, setData]   = useState<any>(null);
  const [results, setResults] = useState<any[]>([]);
  const [gpa, setGpa]     = useState<any[]>([]);
  const [tab, setTab]     = useState("dashboard");
  const [filter, setFilter] = useState({ session: "", semester: "", status: "approved" });

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !["dean", "admin"].includes(user?.role ?? "")) {
      router.push("/staff/login");
      return;
    }
    loadDashboard();
  }, [isAuthenticated, user, authLoading, router]);

  async function loadDashboard() {
    try {
      const r = await ApiClient.fetch<any>("/dean/dashboard");
      setData(r.data);
    } catch {}
  }

  async function loadResults() {
    try {
      const p = new URLSearchParams(filter as any).toString();
      const r = await ApiClient.fetch<any>(`/dean/results?${p}`);
      setResults(r.data?.results ?? []);
    } catch {}
  }

  async function loadGpa() {
    try {
      const r = await ApiClient.fetch<any>("/dean/gpa-summary");
      setGpa(r.data?.gpa_summary ?? []);
    } catch {}
  }

  useEffect(() => { if (tab === "results") loadResults(); }, [tab, filter]);
  useEffect(() => { if (tab === "gpa") loadGpa(); }, [tab]);

  return (
    <div style={{ minHeight:"100vh",background:"#0f172a",fontFamily:"Inter, sans-serif" }}>

      <div className="flex flex-col">
        {/* Horizontal Tabs List */}
        <div className="bg-slate-900/50 border-b border-white/5 sticky top-0 z-30 px-8 py-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 min-w-max">
            {[
              { id:"dashboard", label:"📊 Overview" },
              { id:"results",   label:"📋 Results" },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} className={cn(
                "px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200",
                tab === t.id
                  ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                  : "text-slate-400 hover:text-slate-100 hover:bg-white/5 border border-transparent"
              )}>{t.label}</button>
            ))}
          </div>
        </div>

        <main className="flex-1 p-8 overflow-y-auto">
          {tab === "dashboard" && (
            <div>
              <h2 style={{ color:"#fff",marginTop:0 }}>Faculty Overview — {data?.faculty?.name}</h2>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:"1rem" }}>
                {(data?.departments ?? []).map((d: any) => (
                  <div key={d.department_id} style={{
                    background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",
                    borderRadius:"0.75rem",padding:"1.25rem"
                  }}>
                    <div style={{ color:"#a78bfa",fontSize:"0.78rem",fontWeight:600,marginBottom:"0.3rem" }}>DEPARTMENT</div>
                    <div style={{ color:"#fff",fontWeight:700,marginBottom:"0.75rem" }}>{d.department}</div>
                    <div style={{ display:"flex",gap:"1rem" }}>
                      <div>
                        <div style={{ color:"rgba(255,255,255,0.4)",fontSize:"0.75rem" }}>Students</div>
                        <div style={{ color:"#60a5fa",fontWeight:700,fontSize:"1.25rem" }}>{d.students}</div>
                      </div>
                      <div>
                        <div style={{ color:"rgba(255,255,255,0.4)",fontSize:"0.75rem" }}>Pending</div>
                        <div style={{ color:d.pending_approvals>0?"#fbbf24":"#86efac",fontWeight:700,fontSize:"1.25rem" }}>{d.pending_approvals}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "results" && (
            <div>
              <div style={{ display:"flex",gap:"0.75rem",marginBottom:"1.5rem",flexWrap:"wrap",alignItems:"center" }}>
                <h2 style={{ color:"#fff",margin:0 }}>Faculty Results</h2>
                <select value={filter.status} onChange={e => setFilter(f=>({...f,status:e.target.value}))}
                  style={{ background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",color:"#fff",borderRadius:"0.4rem",padding:"0.35rem 0.5rem",fontSize:"0.82rem" }}>
                  <option value="approved">Approved</option>
                  <option value="submitted">Submitted</option>
                  <option value="">All</option>
                </select>
                <input placeholder="Session e.g. 2024/2025" value={filter.session}
                  onChange={e=>setFilter(f=>({...f,session:e.target.value}))}
                  style={{ background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",color:"#fff",borderRadius:"0.4rem",padding:"0.35rem 0.5rem",fontSize:"0.82rem",width:160 }} />
              </div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%",borderCollapse:"collapse",fontSize:"0.85rem" }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid rgba(255,255,255,0.1)" }}>
                      {["Department","Matric","Student","Course","Level","CA","Exam","Total","Grade"].map(h=>(
                        <th key={h} style={{ color:"rgba(255,255,255,0.5)",textAlign:"left",padding:"0.55rem 0.5rem",whiteSpace:"nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.length===0
                      ? <tr><td colSpan={9} style={{ color:"rgba(255,255,255,0.3)",padding:"2rem",textAlign:"center" }}>No results found.</td></tr>
                      : results.map(r=>(
                        <tr key={r.id} style={{ borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
                          <td style={{ padding:"0.5rem",color:"#a78bfa",fontSize:"0.78rem" }}>{r.department}</td>
                          <td style={{ padding:"0.5rem",color:"#60a5fa" }}>{r.matric_number}</td>
                          <td style={{ padding:"0.5rem",color:"#fff" }}>{r.student_name}</td>
                          <td style={{ padding:"0.5rem",color:"rgba(255,255,255,0.7)" }}>{r.course_code}</td>
                          <td style={{ padding:"0.5rem",color:"rgba(255,255,255,0.5)" }}>{r.current_level}</td>
                          <td style={{ padding:"0.5rem",color:"#fff" }}>{r.ca_score}</td>
                          <td style={{ padding:"0.5rem",color:"#fff" }}>{r.exam_score}</td>
                          <td style={{ padding:"0.5rem",color:"#fff",fontWeight:700 }}>{r.total_score}</td>
                          <td style={{ padding:"0.5rem",fontWeight:700,color:r.grade==="A"?"#86efac":r.grade==="F"?"#fca5a5":"#fcd34d" }}>{r.grade}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "gpa" && (
            <div>
              <h2 style={{ color:"#fff",marginTop:0 }}>Grade Distribution by Department</h2>
              {/* Group by department */}
              {Object.entries(
                (gpa || []).reduce((acc: Record<string, any[]>, item: any) => {
                  acc[item.department] = acc[item.department] || [];
                  acc[item.department].push(item);
                  return acc;
                }, {})
              ).map(([dept, grades]: [string, any[]]) => (
                <div key={dept} style={{ marginBottom:"1.5rem" }}>
                  <h3 style={{ color:"#a78bfa",fontSize:"0.88rem",marginBottom:"0.75rem" }}>{dept}</h3>
                  <div style={{ display:"flex",gap:"0.5rem",flexWrap:"wrap" }}>
                    {grades.map(g => {
                      const colors: Record<string,string> = { A:"#86efac",B:"#60a5fa",C:"#fcd34d",D:"#fb923c",E:"#f87171",F:"#fca5a5" };
                      return (
                        <div key={g.grade} style={{
                          background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",
                          borderRadius:"0.6rem",padding:"0.75rem 1rem",minWidth:80,textAlign:"center"
                        }}>
                          <div style={{ color:colors[g.grade]||"#fff",fontSize:"1.5rem",fontWeight:800 }}>{g.grade}</div>
                          <div style={{ color:"rgba(255,255,255,0.5)",fontSize:"0.78rem" }}>{g.count} students</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {gpa.length === 0 && <p style={{ color:"rgba(255,255,255,0.4)" }}>No data yet.</p>}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
