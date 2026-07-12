"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiClient } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import { LogOut, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type StaffMember = {
  id: number; name: string; email: string; role: string; status: string;
  staff_id: string; title: string; department: string; faculty: string;
  department_id: number; faculty_id: number;
};
type Department = { id: number; name: string; faculty_id?: number; faculty_name?: string };
type Faculty    = { id: number; name: string; code?: string };
type Course     = { id: number; course_code: string; course_title: string };

const ROLES = [
  "admissionofficer",
  "pgadmin",
  "pgdean",
  "ptadmin",
  "ictdirector",
  "registrar",
  "hod",
  "dean",
  "lecturer",
  "deo",
];

export default function ICTStaffPage() {
  const router  = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const [staff, setStaff]     = useState<StaffMember[]>([]);
  const [depts, setDepts]     = useState<Department[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [msg, setMsg]         = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [form, setForm] = useState({
    name:"", email:"", password:"", role:"lecturer", phone_number:"",
    staff_id:"", title:"", department_id:"", faculty_id:""
  });
  const [assign, setAssign] = useState({
    staff_id:"", course_id:"", session:"2024/2025", semester:"First semester"
  });

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "ictdirector") {
      router.replace("/staff/login");
      return;
    }
    loadStaff();
    loadMeta();
  }, [isAuthenticated, user, router]);

  async function loadStaff() {
    try {
      const p = roleFilter ? `?role=${roleFilter}` : "";
      const r = await ApiClient.fetch<any>(`/staff/list${p}`);
      setStaff(r.data?.staff ?? []);
    } catch {}
  }
  async function loadMeta() {
    try {
      const [dr, fr, cr] = await Promise.all([
        ApiClient.fetch<any>("/staff/departments"),
        ApiClient.fetch<any>("/staff/faculties"),
        ApiClient.fetch<any>("/staff/courses-list"),
      ]);
      setDepts(dr.data?.departments ?? []);
      setFaculties(fr.data?.faculties ?? []);
      setCourses(cr.data?.courses ?? []);
    } catch (e: any) {
      setMsg("Failed to load departments/faculties: " + e.message);
    }
  }

  function handleDepartmentChange(departmentId: string) {
    const department = depts.find(d => String(d.id) === departmentId);
    setForm(p => ({
      ...p,
      department_id: departmentId,
      faculty_id: department?.faculty_id ? String(department.faculty_id) : p.faculty_id,
    }));
  }

  async function createStaff(e: React.FormEvent) {
    e.preventDefault();
    try {
      await ApiClient.fetch<any>("/staff/create", {
        method:"POST", body:JSON.stringify({
          ...form,
          department_id: form.department_id ? Number(form.department_id) : undefined,
          faculty_id: form.faculty_id ? Number(form.faculty_id) : undefined,
        })
      });
      setMsg("✅ Staff account created.");
      setShowCreate(false);
      setForm({ name:"",email:"",password:"",role:"lecturer",phone_number:"",staff_id:"",title:"",department_id:"",faculty_id:"" });
      loadStaff();
    } catch (e: any) { setMsg("❌ " + e.message); }
  }

  async function assignCourse(e: React.FormEvent) {
    e.preventDefault();
    try {
      await ApiClient.fetch<any>("/staff/assign-course", {
        method:"POST", body:JSON.stringify({
          staff_id:  Number(assign.staff_id),
          course_id: Number(assign.course_id),
          session:   assign.session,
          semester:  assign.semester,
        })
      });
      setMsg("✅ Course assigned to lecturer.");
      setShowAssign(false);
    } catch (e: any) { setMsg("❌ " + e.message); }
  }

  async function toggleStatus(userId: number, current: string) {
    const next = current === "active" ? "inactive" : "active";
    try {
      await ApiClient.fetch<any>(`/staff/${userId}`, {
        method:"PUT", body:JSON.stringify({ status: next })
      });
      setStaff(prev => prev.map(s => s.id===userId ? { ...s, status:next } : s));
    } catch (e: any) { setMsg("❌ " + e.message); }
  }

  async function handleUpdateStaff(e: React.FormEvent) {
    e.preventDefault();
    if (!editingStaff) return;
    try {
      await ApiClient.fetch<any>(`/staff/${editingStaff.id}`, {
        method:"PUT", body:JSON.stringify({
          role: form.role,
          staff_id: form.staff_id,
          title: form.title,
          department_id: form.department_id ? Number(form.department_id) : null,
          faculty_id: form.faculty_id ? Number(form.faculty_id) : null,
        })
      });
      setMsg("✅ Staff profile updated.");
      setEditingStaff(null);
      loadStaff();
    } catch (e: any) { setMsg("❌ " + e.message); }
  }

  const startEdit = (s: StaffMember) => {
    setEditingStaff(s);
    setForm({
      name: s.name,
      email: s.email,
      password: "", // Not editing password here
      role: s.role,
      phone_number: "", // Backend doesn't support updating this in update_staff yet, or does it?
      staff_id: s.staff_id || "",
      title: s.title || "",
      department_id: s.department_id?.toString() || "",
      faculty_id: s.faculty_id?.toString() || ""
    });
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/staff/login");
  };

  const roleBadgeColor = (r: string) => ({
    admissionofficer: "#f97316",
    pgadmin:          "#818cf8",
    pgdean:           "#a78bfa",
    ptadmin:          "#fb923c",
    ictdirector:      "#ef4444",
    registrar:        "#f472b6",
    hod:              "#60a5fa",
    dean:             "#34d399",
    lecturer:         "#22d3ee",
    deo:              "#fbbf24",
  } as Record<string,string>)[r] || "#94a3b8";

  const fieldStyle = {
    background:"rgba(255,255,255,1)", border:"1px solid #e2e8f0",
    color:"#1e293b", borderRadius:"0.5rem", padding:"0.5rem 0.75rem",
    fontSize:"0.88rem", width:"100%", boxSizing:"border-box" as const
  };
  const labelStyle = { color:"#64748b", fontSize:"0.8rem", marginBottom:"0.3rem", display:"block" as const };

  return (
    <div className="min-h-screen bg-slate-50">

      <div style={{ maxWidth:1100, margin:"2rem auto", padding:"0 1rem" }}>
        <div style={{ marginBottom:"1rem" }}>
           <Button variant="link" onClick={() => router.push("/ict/dashboard")} className="p-0 h-auto gap-1 text-slate-500 hover:text-blue-600">
             <ArrowLeft className="h-4 w-4" /> Back to ICT Dashboard
           </Button>
        </div>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.5rem", flexWrap:"wrap", gap:"0.75rem" }}>
          <div>
            <h1 style={{ color:"#1e293b", margin:0, fontSize:"1.8rem", fontWeight:800 }}>Staff Management</h1>
          </div>
          <div style={{ display:"flex", gap:"0.6rem", marginLeft:"auto" }}>
            <button onClick={()=>setShowAssign(true)} style={{ background:"#fff",border:"1px solid #e2e8f0",color:"#64748b",borderRadius:"0.6rem",padding:"0.5rem 1rem",cursor:"pointer",fontWeight:600,fontSize:"0.88rem", boxShadow:"0 1px 2px rgba(0,0,0,0.05)" }}>
              📌 Assign Course
            </button>
            <button onClick={()=>setShowCreate(true)} style={{ background:"#1e293b",border:"none",color:"#fff",borderRadius:"0.6rem",padding:"0.5rem 1rem",cursor:"pointer",fontWeight:600,fontSize:"0.88rem", boxShadow:"0 4px 6px -1px rgba(0,0,0,0.1)" }}>
              + New Staff
            </button>
          </div>
        </div>

        {msg && (
          <div style={{
            background:msg.startsWith("✅")?"#f0fdf4":"#fef2f2",
            border:`1px solid ${msg.startsWith("✅")?"#bbf7d0":"#fecaca"}`,
            borderRadius:"0.5rem",color:msg.startsWith("✅")?"#166534":"#991b1b",
            padding:"0.65rem 1rem",marginBottom:"1rem",fontSize:"0.88rem",display:"flex",justifyContent:"space-between", alignItems:"center"
          }}>
            {msg} <span style={{ cursor:"pointer", fontSize:"1.2rem" }} onClick={()=>setMsg("")}>×</span>
          </div>
        )}

        {/* Filters */}
        <div style={{ display:"flex", gap:"0.6rem", marginBottom:"1rem", alignItems:"center" }}>
          <select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)} style={{ ...fieldStyle, width:"auto", padding:"0.4rem 0.75rem" }}>
            <option value="">All Roles</option>
            {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
          </select>
          <button onClick={loadStaff} style={{ background:"#fff",border:"1px solid #e2e8f0",color:"#1e293b",borderRadius:"0.5rem",padding:"0.45rem 1rem",cursor:"pointer",fontSize:"0.85rem", fontWeight:500 }}>Filter</button>
        </div>

        {/* Staff Table */}
        <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:"0.75rem", overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,0.1)" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"0.88rem" }}>
            <thead>
              <tr style={{ borderBottom:"1px solid #f1f5f9", background:"#f8fafc" }}>
                {["Name","Email","Role","Department","Status","Action"].map(h=>(
                  <th key={h} style={{ color:"#64748b",textAlign:"left",padding:"0.85rem 1rem",fontWeight:600, fontSize:"0.75rem", textTransform:"uppercase", letterSpacing:"0.025em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.length===0
                ? <tr><td colSpan={6} style={{ color:"#94a3b8",padding:"3rem",textAlign:"center" }}>No staff accounts matching your criteria.</td></tr>
                : staff.map(s=>(
                  <tr key={s.id} style={{ borderBottom:"1px solid #f1f5f9" }} className="hover:bg-slate-50 transition-colors">
                    <td style={{ padding:"0.85rem 1rem",color:"#1e293b",fontWeight:600 }}>
                      {s.title && <span style={{ color:"#94a3b8",marginRight:"0.25rem", fontWeight:400 }}>{s.title}</span>}
                      {s.name}
                    </td>
                    <td style={{ padding:"0.85rem 1rem",color:"#64748b",fontSize:"0.8rem" }}>{s.email}</td>
                    <td style={{ padding:"0.85rem 1rem" }}>
                      <span style={{ background:`${roleBadgeColor(s.role)}15`,color:roleBadgeColor(s.role),border:`1px solid ${roleBadgeColor(s.role)}30`, borderRadius:"6px",padding:"0.15rem 0.5rem",fontSize:"0.72rem",fontWeight:700, textTransform:"uppercase" }}>{s.role.replace(/_/g, " ")}</span>
                    </td>
                    <td style={{ padding:"0.85rem 1rem",color:"#64748b" }}>{s.department||"—"}</td>
                    <td style={{ padding:"0.85rem 1rem" }}>
                      <span style={{
                        background:s.status==="active"?"#f0fdf4":"#fff1f2",
                        color:s.status==="active"?"#16a34a":"#e11d48",
                        borderRadius:"999px",padding:"0.15rem 0.6rem",fontSize:"0.75rem", fontWeight:600
                      }}>{s.status}</span>
                    </td>
                    <td style={{ padding:"0.85rem 1rem", display:"flex", gap:"0.4rem" }}>
                      <button onClick={()=>startEdit(s)} style={{
                        background:"#fff",border:"1px solid #e2e8f0",
                        color:"#3b82f6",borderRadius:"0.35rem",padding:"0.25rem 0.6rem",cursor:"pointer",fontSize:"0.78rem", fontWeight:600
                      }}>Edit</button>
                      <button onClick={()=>toggleStatus(s.id,s.status)} style={{
                        background:"#fff",border:"1px solid #e2e8f0",
                        color:"#475569",borderRadius:"0.35rem",padding:"0.25rem 0.6rem",cursor:"pointer",fontSize:"0.78rem", fontWeight:500
                      }}>{s.status==="active"?"Deactivate":"Activate"}</button>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Staff Modal */}
      {showCreate && (
        <div style={{ position:"fixed",inset:0,background:"rgba(15,23,42,0.6)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:"1rem" }}>
          <div style={{ background:"#fff",border:"1px solid #e2e8f0",borderRadius:"1rem",padding:"2rem",width:"100%",maxWidth:520,maxHeight:"90vh",overflowY:"auto", boxShadow:"0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h2 style={{ color:"#1e293b",marginTop:0, fontWeight:800 }}>Create New Staff Account</h2>
            <form onSubmit={createStaff} style={{ display:"flex",flexDirection:"column",gap:"0.85rem" }}>
              {[
                { key:"name",label:"Full Name",type:"text",required:true },
                { key:"email",label:"Email Address",type:"email",required:true },
                { key:"password",label:"Initial Password",type:"password",required:true },
                { key:"phone_number",label:"Phone Number",type:"text" },
                { key:"staff_id",label:"Staff ID Number",type:"text" },
                { key:"title",label:"Professional Title",type:"text", placeholder:"e.g. Dr., Prof." },
              ].map(f=>(
                <div key={f.key}>
                  <label style={labelStyle}>{f.label}{f.required&&<span style={{color:"#ef4444"}}> *</span>}</label>
                  <input type={f.type} required={f.required} value={(form as any)[f.key]} placeholder={(f as any).placeholder}
                    onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} style={fieldStyle} />
                </div>
              ))}
              <div>
                <label style={labelStyle}>Assign Role <span style={{color:"#ef4444"}}>*</span></label>
                <select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))} style={fieldStyle}>
                  {ROLES.map(r=><option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem" }}>
                <div>
                  <label style={labelStyle}>Department</label>
                  <select value={form.department_id} onChange={e=>handleDepartmentChange(e.target.value)} style={fieldStyle}>
                    <option value="">— Choose —</option>
                    {depts.map(d=><option key={d.id} value={d.id}>{d.faculty_name ? `${d.name} (${d.faculty_name})` : d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Faculty</label>
                  <select value={form.faculty_id} onChange={e=>setForm(p=>({...p,faculty_id:e.target.value}))} style={fieldStyle}>
                    <option value="">— Choose —</option>
                    {faculties.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display:"flex",gap:"0.75rem",marginTop:"1rem" }}>
                <button type="submit" style={{ flex:1,background:"#1e293b",border:"none",color:"#fff",borderRadius:"0.6rem",padding:"0.75rem",cursor:"pointer",fontWeight:700 }}>
                  Initialize Account
                </button>
                <button type="button" onClick={()=>setShowCreate(false)} style={{ flex:1,background:"#fff",border:"1px solid #e2e8f0",color:"#64748b",borderRadius:"0.6rem",padding:"0.75rem",cursor:"pointer", fontWeight:600 }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Course Modal */}
      {showAssign && (
        <div style={{ position:"fixed",inset:0,background:"rgba(15,23,42,0.6)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:"1rem" }}>
          <div style={{ background:"#fff",border:"1px solid #e2e8f0",borderRadius:"1rem",padding:"2rem",width:"100%",maxWidth:420, boxShadow:"0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h2 style={{ color:"#1e293b",marginTop:0, fontWeight:800 }}>Course Affiliation</h2>
            <form onSubmit={assignCourse} style={{ display:"flex",flexDirection:"column",gap:"0.85rem" }}>
              <div>
                <label style={labelStyle}>Select Lecturer</label>
                <select value={assign.staff_id} onChange={e=>setAssign(p=>({...p,staff_id:e.target.value}))} style={fieldStyle} required>
                  <option value="">— Select —</option>
                  {staff.filter(s=>["lecturer","deo"].includes(s.role)).map(s=>(
                    <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Target Course</label>
                <select value={assign.course_id} onChange={e=>setAssign(p=>({...p,course_id:e.target.value}))} style={fieldStyle} required>
                  <option value="">— Select —</option>
                  {courses.map(c=><option key={c.id} value={c.id}>{c.course_code} — {c.course_title}</option>)}
                </select>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem" }}>
                <div>
                  <label style={labelStyle}>Academic Session</label>
                  <input value={assign.session} onChange={e=>setAssign(p=>({...p,session:e.target.value}))} style={fieldStyle} placeholder="2024/2025" required />
                </div>
                <div>
                  <label style={labelStyle}>Semester</label>
                  <select value={assign.semester} onChange={e=>setAssign(p=>({...p,semester:e.target.value}))} style={fieldStyle}>
                    <option value="First semester">First</option>
                    <option value="Second semester">Second</option>
                  </select>
                </div>
              </div>
              <div style={{ display:"flex",gap:"0.75rem",marginTop:"1rem" }}>
                <button type="submit" style={{ flex:1,background:"#1e293b",border:"none",color:"#fff",borderRadius:"0.6rem",padding:"0.75rem",cursor:"pointer",fontWeight:700 }}>
                  Assign Course
                </button>
                <button type="button" onClick={()=>setShowAssign(false)} style={{ flex:1,background:"#fff",border:"1px solid #e2e8f0",color:"#64748b",borderRadius:"0.6rem",padding:"0.75rem",cursor:"pointer", fontWeight:600 }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Staff Modal */}
      {editingStaff && (
        <div style={{ position:"fixed",inset:0,background:"rgba(15,23,42,0.6)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:"1rem" }}>
          <div style={{ background:"#fff",border:"1px solid #e2e8f0",borderRadius:"1rem",padding:"2rem",width:"100%",maxWidth:520,maxHeight:"90vh",overflowY:"auto", boxShadow:"0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h2 style={{ color:"#1e293b",marginTop:0, fontWeight:800 }}>Edit Staff Profile</h2>
            <p style={{ color: "#64748b", fontSize: "0.9rem", marginBottom: "1.5rem" }}>Update role and affiliations for <b>{editingStaff.name}</b></p>
            <form onSubmit={handleUpdateStaff} style={{ display:"flex",flexDirection:"column",gap:"0.85rem" }}>
              <div>
                <label style={labelStyle}>Staff ID Number</label>
                <input type="text" value={form.staff_id} onChange={e=>setForm(p=>({...p,staff_id:e.target.value}))} style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Professional Title</label>
                <input type="text" value={form.title} placeholder="e.g. Dr., Prof." onChange={e=>setForm(p=>({...p,title:e.target.value}))} style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Assign Role <span style={{color:"#ef4444"}}>*</span></label>
                <select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))} style={fieldStyle}>
                  {ROLES.map(r=><option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem" }}>
                <div>
                  <label style={labelStyle}>Department</label>
                  <select value={form.department_id} onChange={e=>handleDepartmentChange(e.target.value)} style={fieldStyle}>
                    <option value="">— Choose —</option>
                    {depts.map(d=><option key={d.id} value={d.id}>{d.faculty_name ? `${d.name} (${d.faculty_name})` : d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Faculty</label>
                  <select value={form.faculty_id} onChange={e=>setForm(p=>({...p,faculty_id:e.target.value}))} style={fieldStyle}>
                    <option value="">— Choose —</option>
                    {faculties.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display:"flex",gap:"0.75rem",marginTop:"1rem" }}>
                <button type="submit" style={{ flex:1,background:"#1e293b",border:"none",color:"#fff",borderRadius:"0.6rem",padding:"0.75rem",cursor:"pointer",fontWeight:700 }}>
                  Update Profile
                </button>
                <button type="button" onClick={()=>setEditingStaff(null)} style={{ flex:1,background:"#fff",border:"1px solid #e2e8f0",color:"#64748b",borderRadius:"0.6rem",padding:"0.75rem",cursor:"pointer", fontWeight:600 }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
