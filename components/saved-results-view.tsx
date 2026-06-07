"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Trash2, Download, Search, X, FileText, Eye,
  ChevronRight, Loader2, ArrowLeft, Home, Database,
  Building2, CalendarDays, BookOpen, Users, GraduationCap, ScrollText, RefreshCw, Layers
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import {
  getSavedResults, getSessionResults,
  deleteResult, deleteMultipleResults,
  deleteDepartmentResults, deleteMultipleDepartmentResults,
  DepartmentGroup, SavedResult, StudentSessionTranscript,
} from "@/lib/storage"
import { generatePDF } from "@/lib/pdf-generator"
import { generateTranscriptPDF } from "@/lib/transcript-pdf-generator"
import { ResultDisplay } from "@/components/result-display"
import { TranscriptDisplay } from "@/components/transcript-display"
import JSZip from "jszip"
import { saveAs } from "file-saver"

interface SavedResultsViewProps {
  onBack: () => void
}

const LEVELS = ["100", "200", "300", "400"] as const
type Level = typeof LEVELS[number]

// Mode at sessions level: browse by individual semester OR full session transcript
type SessionMode = "semester" | "session"

type DrillLevel = "departments" | "sessions" | "semesters" | "levels" | "students" | "session-students"

interface DrillState {
  level: DrillLevel
  departmentId?: number
  departmentName?: string
  sessionId?: string | number
  sessionName?: string
  semesterName?: string
  selectedLevel?: Level
  sessionMode?: SessionMode
}

export function SavedResultsView({ onBack }: SavedResultsViewProps) {
  const [departments, setDepartments]       = useState<DepartmentGroup[]>([])
  const [sessionTranscripts, setSessionTranscripts] = useState<StudentSessionTranscript[]>([])
  const [loading, setLoading]               = useState(true)
  const [sessionLoading, setSessionLoading] = useState(false)
  const [error, setError]                   = useState<string | null>(null)
  const [searchQuery, setSearchQuery]       = useState("")
  const [selectedIds, setSelectedIds]       = useState<Set<string>>(new Set())
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<Set<number>>(new Set())
  const [isEditingDepartments, setIsEditingDepartments] = useState(false)
  const [drill, setDrill]                   = useState<DrillState>({ level: "departments" })
  const [previewResult, setPreviewResult]   = useState<SavedResult | null>(null)
  const [previewTranscript, setPreviewTranscript] = useState<StudentSessionTranscript | null>(null)
  const [isZipping, setIsZipping]           = useState(false)
  const [zipProgress, setZipProgress]       = useState(0)

  useEffect(() => { loadResults() }, [])

  async function loadResults() {
    try {
      setLoading(true)
      setError(null)
      setDepartments(await getSavedResults())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function loadSessionTranscripts(sessionId: string | number) {
    try {
      setSessionLoading(true)
      setError(null)
      setSessionTranscripts(await getSessionResults(sessionId))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSessionLoading(false)
    }
  }

  // ── Derived objects ───────────────────────────────────────────────────────
  const currentDept = useMemo(
    () => departments.find((d) => d.id === drill.departmentId),
    [departments, drill.departmentId]
  )
  const currentSession = useMemo(
    () => currentDept?.sessions.find((s) => s.id === drill.sessionId),
    [currentDept, drill.sessionId]
  )
  const currentSemester = useMemo(
    () => currentSession?.semesters.find((s) => s.name === drill.semesterName),
    [currentSession, drill.semesterName]
  )

  // Students in the chosen level (semester mode)
  const studentsInLevel = useMemo(() => {
    if (!currentSemester || !drill.selectedLevel) return []
    return currentSemester.students.filter(
      (r) => String(r.studentInfo.level) === drill.selectedLevel
    )
  }, [currentSemester, drill.selectedLevel])

  const filteredStudents = useMemo(() => {
    if (!searchQuery) return studentsInLevel
    const q = searchQuery.toLowerCase()
    return studentsInLevel.filter(
      (r) => r.studentInfo.name.toLowerCase().includes(q) ||
             r.studentInfo.matricNumber.toLowerCase().includes(q)
    )
  }, [studentsInLevel, searchQuery])

  // Session-mode transcripts filtered by dept + search
  const filteredTranscripts = useMemo(() => {
    let list = sessionTranscripts.filter((t) => t.departmentId === drill.departmentId)
    if (!searchQuery) return list
    const q = searchQuery.toLowerCase()
    return list.filter(
      (t) => t.studentInfo.name.toLowerCase().includes(q) ||
             t.studentInfo.matricNumber.toLowerCase().includes(q)
    )
  }, [sessionTranscripts, drill.departmentId, searchQuery])

  function studentsPerLevel(semester: { students: SavedResult[] }, lvl: Level) {
    return semester.students.filter((r) => String(r.studentInfo.level) === lvl).length
  }
  const availableLevels = useMemo(() => {
    if (!currentSemester) return []
    return LEVELS.filter((lvl) => studentsPerLevel(currentSemester, lvl) > 0)
  }, [currentSemester])

  // ── Navigation ────────────────────────────────────────────────────────────
  function goBack() {
    if (previewResult || previewTranscript) {
      setPreviewResult(null)
      setPreviewTranscript(null)
      return
    }
    setSearchQuery("")
    setSelectedIds(new Set())
    setSelectedDepartmentIds(new Set())
    setIsEditingDepartments(false)
    switch (drill.level) {
      case "sessions":
        return setDrill({ level: "departments" })
      case "semesters":
        return setDrill({ level: "sessions", departmentId: drill.departmentId, departmentName: drill.departmentName })
      case "levels":
        return setDrill({ level: "semesters", departmentId: drill.departmentId, departmentName: drill.departmentName, sessionId: drill.sessionId, sessionName: drill.sessionName })
      case "students":
        return setDrill({ level: "levels", departmentId: drill.departmentId, departmentName: drill.departmentName, sessionId: drill.sessionId, sessionName: drill.sessionName, semesterName: drill.semesterName })
      case "session-students":
        return setDrill({ level: "sessions", departmentId: drill.departmentId, departmentName: drill.departmentName })
      default:
        onBack()
    }
  }

  const backLabel: Record<DrillLevel, string> = {
    departments:      "Close",
    sessions:         "All Departments",
    semesters:        drill.departmentName ?? "Department",
    levels:           drill.sessionName ?? "Session",
    students:         `${drill.semesterName} — Levels`,
    "session-students": drill.departmentName ?? "Department",
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function totalInDept(dept: DepartmentGroup) {
    return dept.sessions.reduce((a, s) => a + s.semesters.reduce((b, sem) => b + sem.students.length, 0), 0)
  }
  function totalInSession(dept: DepartmentGroup, sessionId: string | number) {
    return dept.sessions.find((s) => s.id === sessionId)?.semesters.reduce((a, sem) => a + sem.students.length, 0) ?? 0
  }

  const SEMESTER_COLORS: Record<string, string> = {
    "first semester":  "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200",
    "second semester": "bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700 text-purple-800 dark:text-purple-200",
    "third semester":  "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200",
  }
  const LEVEL_COLORS: Record<Level, { card: string; badge: string; icon: string }> = {
    "100": { card: "hover:border-sky-400",    badge: "bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800",          icon: "bg-sky-100 text-sky-600" },
    "200": { card: "hover:border-violet-400", badge: "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800", icon: "bg-violet-100 text-violet-600" },
    "300": { card: "hover:border-amber-400",  badge: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",    icon: "bg-amber-100 text-amber-600" },
    "400": { card: "hover:border-rose-400",   badge: "bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",       icon: "bg-rose-100 text-rose-600" },
  }
  function semColor(name: string) {
    return SEMESTER_COLORS[name.toLowerCase()] ?? "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
  }

  // ── Downloads ─────────────────────────────────────────────────────────────
  function handleDownload(result: SavedResult) {
    generatePDF({
      studentInfo: result.studentInfo,
      courses: result.courses,
      totalUnits: result.calculations.totalUnits,
      totalUnitsPassed: result.calculations.totalUnitsPassed,
      totalWGP: result.calculations.totalWGP,
      cgpa: result.calculations.cgpa,
    })
  }

  async function handleBatchDownload(results: SavedResult[]) {
    if (results.length === 0) return
    setIsZipping(true)
    setZipProgress(0)
    const zip = new JSZip()
    const folderName = drill.departmentName ? `${drill.departmentName}_Results`.replace(/[^a-zA-Z0-9_ \-]/g, "") : "Student_Results"
    const folder = zip.folder(folderName)

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const pdfBlob = await generatePDF({
        studentInfo: result.studentInfo,
        courses: result.courses,
        totalUnits: result.calculations.totalUnits,
        totalUnitsPassed: result.calculations.totalUnitsPassed,
        totalWGP: result.calculations.totalWGP,
        cgpa: result.calculations.cgpa,
      }, { returnBlob: true }) as Blob

      const safeName = `${result.studentInfo.name}_${result.studentInfo.matricNumber}`
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9_]/g, "")
      folder?.file(`${safeName}.pdf`, pdfBlob)
      
      setZipProgress(Math.round(((i + 1) / results.length) * 100))
      await new Promise((res) => setTimeout(res, 20))
    }

    const zipBlob = await zip.generateAsync({ type: "blob" })
    saveAs(zipBlob, `${folderName}.zip`)
    setIsZipping(false)
  }

  function handleTranscriptDownload(transcript: StudentSessionTranscript) {
    generateTranscriptPDF(transcript)
  }

  async function handleBatchTranscriptDownload(transcripts: StudentSessionTranscript[]) {
    if (transcripts.length === 0) return
    setIsZipping(true)
    setZipProgress(0)
    const zip = new JSZip()
    const folderName = drill.departmentName ? `${drill.departmentName}_Transcripts`.replace(/[^a-zA-Z0-9_ \-]/g, "") : "Student_Transcripts"
    const folder = zip.folder(folderName)

    for (let i = 0; i < transcripts.length; i++) {
      const transcript = transcripts[i]
      const pdfBlob = await generateTranscriptPDF(transcript, { returnBlob: true }) as Blob

      const safeName = `${transcript.studentInfo.name}_${transcript.studentInfo.matricNumber}`
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9_]/g, "")
      folder?.file(`${safeName}_Transcript.pdf`, pdfBlob)
      
      setZipProgress(Math.round(((i + 1) / transcripts.length) * 100))
      await new Promise((res) => setTimeout(res, 20))
    }

    const zipBlob = await zip.generateAsync({ type: "blob" })
    saveAs(zipBlob, `${folderName}.zip`)
    setIsZipping(false)
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm("Delete this result?")) return
    try {
      await deleteResult(id)
      await loadResults()
      setSelectedIds((p) => { const n = new Set(p); n.delete(id); return n })
    } catch (err) { alert(`Delete failed: ${(err as Error).message}`) }
  }
  async function handleBulkDelete() {
    if (!selectedIds.size || !confirm(`Delete ${selectedIds.size} result(s)?`)) return
    try {
      await deleteMultipleResults(Array.from(selectedIds))
      await loadResults()
      setSelectedIds(new Set())
    } catch (err) { alert(`Delete failed: ${(err as Error).message}`) }
  }

  async function handleBulkDeleteDepartments() {
    if (!selectedDepartmentIds.size || !confirm(`Delete results for ${selectedDepartmentIds.size} department(s)? This action cannot be undone.`)) return
    try {
      await deleteMultipleDepartmentResults(Array.from(selectedDepartmentIds))
      await loadResults()
      setSelectedDepartmentIds(new Set())
      setIsEditingDepartments(false)
    } catch (err) { alert(`Delete failed: ${(err as Error).message}`) }
  }

  function toggleDepartmentSelect(id: number) {
    setSelectedDepartmentIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleSelect(id: string) {
    setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleSelectAll(ids: string[]) {
    setSelectedIds(selectedIds.size === ids.length ? new Set() : new Set(ids))
  }

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })

  // ── Breadcrumb ────────────────────────────────────────────────────────────
  function Breadcrumb() {
    const crumbs: { label: string; onClick: () => void }[] = [
      { label: "All Departments", onClick: () => { setDrill({ level: "departments" }); setSearchQuery(""); setSelectedIds(new Set()) } },
    ]
    if (drill.departmentName) crumbs.push({
      label: drill.departmentName,
      onClick: () => { setDrill({ level: "sessions", departmentId: drill.departmentId, departmentName: drill.departmentName }); setSearchQuery(""); setSelectedIds(new Set()) },
    })
    if (drill.level === "session-students" && drill.sessionName) crumbs.push({ label: `${drill.sessionName} — Session Transcripts`, onClick: () => {} })
    if (drill.sessionName && drill.level !== "session-students") crumbs.push({
      label: drill.sessionName,
      onClick: () => { setDrill({ level: "semesters", departmentId: drill.departmentId, departmentName: drill.departmentName, sessionId: drill.sessionId, sessionName: drill.sessionName }); setSearchQuery(""); setSelectedIds(new Set()) },
    })
    if (drill.semesterName) crumbs.push({
      label: drill.semesterName,
      onClick: () => { setDrill({ level: "levels", departmentId: drill.departmentId, departmentName: drill.departmentName, sessionId: drill.sessionId, sessionName: drill.sessionName, semesterName: drill.semesterName }); setSearchQuery(""); setSelectedIds(new Set()) },
    })
    if (drill.selectedLevel) crumbs.push({ label: `Level ${drill.selectedLevel}`, onClick: () => {} })

    return (
      <div className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 flex-wrap mt-1">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />}
            {i === crumbs.length - 1
              ? <span className="text-slate-800 dark:text-slate-200 font-semibold">{crumb.label}</span>
              : <button onClick={crumb.onClick} className="hover:text-blue-600 dark:text-blue-400 transition-colors">{crumb.label}</button>
            }
          </span>
        ))}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >

      {/* Modern Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-700">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <Database className="h-5 w-5 text-white" />
            </div>
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">Academic Records</h2>
          </div>
          <Breadcrumb />
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            onClick={onBack} 
            variant="ghost" 
            className="text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 font-medium"
          >
            <Home className="h-4 w-4 mr-2" />
            Dashboard
          </Button>
          
          <Button 
            onClick={() => {
              setDrill({ level: "departments" });
              setPreviewResult(null);
              setPreviewTranscript(null);
              setSearchQuery("");
            }} 
            variant="outline" 
            className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/70 text-slate-600 dark:text-slate-400 dark:text-slate-500"
          >
            <Layers className="h-4 w-4 mr-2" />
            All Results
          </Button>

          {drill.level !== "departments" && !previewResult && !previewTranscript && (
            <Button 
              onClick={goBack} 
              className="bg-slate-900 text-white hover:bg-slate-800 shadow-sm px-6"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}

          {(previewResult || previewTranscript) && (
            <Button 
              onClick={() => { setPreviewResult(null); setPreviewTranscript(null); }} 
              className="bg-slate-900 text-white hover:bg-slate-800 shadow-sm px-6"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to List
            </Button>
          )}
        </div>
      </div>

      {/* Loading */}
      {(loading || sessionLoading) && (
        <Card><CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 text-slate-400 dark:text-slate-500 mx-auto mb-3 animate-spin" />
          <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Loading results...</p>
        </CardContent></Card>
      )}

      {/* Error */}
      {!loading && !sessionLoading && error && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-900/20"><CardContent className="py-6 text-center">
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <Button onClick={loadResults} variant="outline" className="mt-3">Retry</Button>
        </CardContent></Card>
      )}

      {!loading && !sessionLoading && !error && (
        <>
          {previewResult && (
            <ResultDisplay
              studentInfo={previewResult.studentInfo}
              courses={previewResult.courses}
              totalUnits={previewResult.calculations.totalUnits}
              totalUnitsPassed={previewResult.calculations.totalUnitsPassed}
              totalWGP={previewResult.calculations.totalWGP}
              cgpa={previewResult.calculations.cgpa}
              onReset={() => setPreviewResult(null)}
              hideActions={true}
            />
          )}

          {previewTranscript && (
            <TranscriptDisplay
              transcript={previewTranscript}
              onReset={() => setPreviewTranscript(null)}
            />
          )}

          {!previewResult && !previewTranscript && drill.level === "departments" && (
            departments.length === 0 ? (
              <Card><CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600 dark:text-slate-400 dark:text-slate-500 text-lg">No saved results yet</p>
              </CardContent></Card>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-end gap-2">
                  {isEditingDepartments ? (
                    <>
                      <Button onClick={() => { setIsEditingDepartments(false); setSelectedDepartmentIds(new Set()); }} variant="outline" className="border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950">
                        Cancel
                      </Button>
                      <Button onClick={handleBulkDeleteDepartments} disabled={selectedDepartmentIds.size === 0} variant="outline" className="border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:bg-red-900/20 bg-white dark:bg-slate-950 shadow-sm">
                        <Trash2 className="h-4 w-4 mr-2" /> Delete Selected ({selectedDepartmentIds.size})
                      </Button>
                    </>
                  ) : (
                    <Button onClick={() => setIsEditingDepartments(true)} variant="outline" className="border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:bg-blue-900/20 bg-white dark:bg-slate-950 shadow-sm">
                      Edit Departments
                    </Button>
                  )}
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {departments.map((dept) => (
                    <div key={dept.id} className="relative">
                      {isEditingDepartments && (
                        <div className="absolute top-4 right-4 z-10">
                          <input
                            type="checkbox"
                            checked={selectedDepartmentIds.has(dept.id)}
                            onChange={() => toggleDepartmentSelect(dept.id)}
                            className="h-5 w-5 rounded border-slate-300 dark:border-slate-600 text-red-600 dark:text-red-400 cursor-pointer shadow-sm focus:ring-red-500"
                          />
                        </div>
                      )}
                      <button 
                        onClick={() => !isEditingDepartments && setDrill({ level: "sessions", departmentId: dept.id, departmentName: dept.name })} 
                        className={`text-left w-full h-full ${isEditingDepartments ? 'cursor-default' : 'cursor-pointer'}`}
                      >
                        <Card className={`border hover:shadow-md transition-all h-full ${isEditingDepartments && selectedDepartmentIds.has(dept.id) ? 'border-red-400 bg-red-50 dark:bg-red-900/20/30' : !isEditingDepartments ? 'border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:border-blue-600' : 'border-slate-200 dark:border-slate-700 opacity-90'}`}>
                          <CardContent className="pt-6 pb-5">
                            <div className="flex items-start gap-3">
                              <div className="p-2 bg-blue-100 rounded-lg shrink-0"><Building2 className="h-6 w-6 text-blue-600 dark:text-blue-400" /></div>
                              <div className="flex-1 min-w-0 pr-6">
                                <p className="font-bold text-slate-900 dark:text-slate-100 leading-tight">{dept.name}</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5 truncate">{dept.faculty}</p>
                                <div className="flex gap-2 mt-3 flex-wrap">
                                  <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">{dept.sessions.length} session{dept.sessions.length !== 1 ? "s" : ""}</Badge>
                                  <Badge variant="outline" className="text-xs bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 dark:text-slate-500">{totalInDept(dept)} student{totalInDept(dept) !== 1 ? "s" : ""}</Badge>
                                </div>
                              </div>
                              {!isEditingDepartments && (
                                <ChevronRight className="h-5 w-5 text-slate-400 dark:text-slate-500 shrink-0 mt-1" />
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}

          {/* ── LEVEL 2: SESSIONS — with Semester / Session toggle ────────── */}
          {!previewResult && !previewTranscript && drill.level === "sessions" && currentDept && (
            <div className="space-y-4">
              {currentDept.sessions.map((session) => (
                <Card key={session.id} className="border-slate-200 dark:border-slate-700">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      {/* Session info */}
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 rounded-lg shrink-0">
                          <CalendarDays className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-slate-100">{session.name}</p>
                          <div className="flex gap-2 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800">
                              {session.semesters.length} semester{session.semesters.length !== 1 ? "s" : ""}
                            </Badge>
                            <Badge variant="outline" className="text-xs bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 dark:text-slate-500">
                              {totalInSession(currentDept, session.id)} student{totalInSession(currentDept, session.id) !== 1 ? "s" : ""}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {session.semesters.map((sem) => (
                              <span key={sem.name} className={`text-xs px-2 py-0.5 rounded-full border font-medium ${semColor(sem.name)}`}>
                                {sem.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* ── Two action buttons ── */}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 bg-transparent gap-1.5"
                          onClick={() => setDrill({
                            level: "semesters",
                            departmentId: drill.departmentId,
                            departmentName: drill.departmentName,
                            sessionId: session.id,
                            sessionName: session.name,
                            sessionMode: "semester",
                          })}
                        >
                          <BookOpen className="h-4 w-4" />
                          Semester Results
                        </Button>
                        <Button
                          size="sm"
                          className="bg-indigo-600 hover:bg-indigo-700 gap-1.5"
                          onClick={async () => {
                            setDrill({
                              level: "session-students",
                              departmentId: drill.departmentId,
                              departmentName: drill.departmentName,
                              sessionId: session.id,
                              sessionName: session.name,
                              sessionMode: "session",
                            })
                            await loadSessionTranscripts(session.id)
                          }}
                        >
                          <ScrollText className="h-4 w-4" />
                          Session Transcripts
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* ── LEVEL 3: SEMESTERS ────────────────────────────────────────── */}
          {!previewResult && !previewTranscript && drill.level === "semesters" && currentSession && (
            <div className="grid md:grid-cols-3 gap-4">
              {currentSession.semesters.map((sem) => (
                <button key={sem.name} onClick={() => setDrill({ level: "levels", departmentId: drill.departmentId, departmentName: drill.departmentName, sessionId: drill.sessionId, sessionName: drill.sessionName, semesterName: sem.name })} className="text-left">
                  <Card className={`border hover:shadow-md transition-all cursor-pointer ${semColor(sem.name)}`}>
                    <CardContent className="pt-6 pb-5">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-white dark:bg-slate-950/60 rounded-lg shrink-0"><BookOpen className="h-6 w-6" /></div>
                        <div className="flex-1">
                          <p className="font-bold text-base">{sem.name}</p>
                          <div className="flex items-center gap-1 mt-2">
                            <Users className="h-4 w-4 opacity-70" />
                            <span className="text-sm font-medium">{sem.students.length} student{sem.students.length !== 1 ? "s" : ""}</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {LEVELS.filter((lvl) => studentsPerLevel(sem, lvl) > 0).map((lvl) => (
                              <span key={lvl} className={`text-xs px-2 py-0.5 rounded-full border font-medium ${LEVEL_COLORS[lvl].badge}`}>
                                L{lvl}: {studentsPerLevel(sem, lvl)}
                              </span>
                            ))}
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 shrink-0 mt-1 opacity-50" />
                      </div>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          )}

          {/* ── LEVEL 4: LEVELS ───────────────────────────────────────────── */}
          {!previewResult && !previewTranscript && drill.level === "levels" && currentSemester && (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {availableLevels.length === 0 ? (
                <Card className="col-span-full"><CardContent className="py-12 text-center">
                  <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">No students in this semester</p>
                </CardContent></Card>
              ) : availableLevels.map((lvl) => {
                const colors = LEVEL_COLORS[lvl]
                const count  = studentsPerLevel(currentSemester, lvl)
                return (
                  <button key={lvl} onClick={() => setDrill({ ...drill, level: "students", selectedLevel: lvl })} className="text-left">
                    <Card className={`border-slate-200 dark:border-slate-700 ${colors.card} hover:shadow-md transition-all h-full cursor-pointer`}>
                      <CardContent className="pt-6 pb-5">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg shrink-0 ${colors.icon}`}><GraduationCap className="h-6 w-6" /></div>
                          <div className="flex-1">
                            <p className="font-bold text-slate-900 dark:text-slate-100 text-lg">{lvl} Level</p>
                            <div className="flex items-center gap-1 mt-2">
                              <Users className="h-4 w-4 text-slate-500 dark:text-slate-400 dark:text-slate-500" />
                              <span className="text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500 font-medium">{count} student{count !== 1 ? "s" : ""}</span>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-slate-400 dark:text-slate-500 shrink-0 mt-1" />
                        </div>
                      </CardContent>
                    </Card>
                  </button>
                )
              })}
            </div>
          )}

          {/* ── LEVEL 5a: SEMESTER STUDENTS ───────────────────────────────── */}
          {!previewResult && !previewTranscript && drill.level === "students" && (
            <div className="space-y-4">
              <Card className="border-slate-200 dark:border-slate-700">
                <CardContent className="pt-5 pb-4">
                  <div className="flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                      <Input placeholder="Search by name or matric number..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 border-slate-300 dark:border-slate-600" />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => handleBatchDownload(filteredStudents.filter((r) => selectedIds.has(r.id)))} disabled={selectedIds.size === 0 || isZipping} variant="outline" className="border-green-300 hover:bg-green-50 bg-transparent text-sm">
                        <Download className="h-4 w-4 mr-1" />{isZipping ? `Zipping... ${zipProgress}%` : `Export (${selectedIds.size})`}
                      </Button>
                      <Button onClick={handleBulkDelete} disabled={selectedIds.size === 0 || isZipping} variant="outline" className="border-red-300 dark:border-red-700 hover:bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 bg-transparent text-sm">
                        <Trash2 className="h-4 w-4 mr-1" />Delete ({selectedIds.size})
                      </Button>
                    </div>
                  </div>
                  {filteredStudents.length > 0 && (
                    <button onClick={() => toggleSelectAll(filteredStudents.map((r) => r.id))} className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                      {selectedIds.size === filteredStudents.length ? "Deselect all" : `Select all ${filteredStudents.length}`}
                    </button>
                  )}
                </CardContent>
              </Card>

              {filteredStudents.length === 0 ? (
                <Card><CardContent className="py-12 text-center">
                  <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">{searchQuery ? "No students match your search" : "No students at this level"}</p>
                </CardContent></Card>
              ) : filteredStudents.map((result) => (
                <Card key={result.id} className={`border transition-colors ${selectedIds.has(result.id) ? "border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20/30" : "border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:border-blue-700"}`}>
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={selectedIds.has(result.id)} onChange={() => toggleSelect(result.id)} className="mt-1.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 dark:text-blue-400 cursor-pointer" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 dark:text-slate-100">{result.studentInfo.name}</span>
                          <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 text-xs">{result.studentInfo.matricNumber}</Badge>
                          <Badge variant="outline" className={`text-xs ${LEVEL_COLORS[drill.selectedLevel as Level]?.badge ?? ""}`}>Level {result.studentInfo.level}</Badge>
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Saved {formatDate(result.timestamp)}</p>
                        <div className="flex gap-4 mt-3 flex-wrap">
                          <div><p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Units</p><p className="font-bold text-blue-700 dark:text-blue-300">{result.calculations.totalUnits}</p></div>
                          <div><p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Passed</p><p className="font-bold text-purple-700 dark:text-purple-300">{result.calculations.totalUnitsPassed}</p></div>
                          <div><p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">WGP</p><p className="font-bold text-green-700">{result.calculations.totalWGP}</p></div>
                          <div><p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">CGPA</p><p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{result.calculations.cgpa}</p></div>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" onClick={() => setPreviewResult(result)} className="bg-blue-600 hover:bg-blue-700 text-xs"><Eye className="h-3.5 w-3.5 mr-1" />Preview</Button>
                        <Button size="sm" onClick={() => handleDownload(result)} className="bg-green-600 hover:bg-green-700 text-xs"><Download className="h-3.5 w-3.5 mr-1" />PDF</Button>
                        <Button size="sm" variant="outline" onClick={() => handleDelete(result.id)} className="border-red-300 dark:border-red-700 hover:bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 bg-transparent"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* ── LEVEL 5b: SESSION TRANSCRIPTS ─────────────────────────────── */}
          {!previewResult && !previewTranscript && drill.level === "session-students" && (
            <div className="space-y-4">
              {/* Info banner */}
              <div className="flex items-center gap-2 px-1">
                <ScrollText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <p className="text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500">
                  Showing combined sessional transcripts for <span className="font-semibold">{drill.departmentName}</span> — <span className="font-semibold">{drill.sessionName}</span>
                </p>
              </div>

              <Card className="border-slate-200 dark:border-slate-700">
                <CardContent className="pt-5 pb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                    <Input placeholder="Search by name or matric number..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 border-slate-300 dark:border-slate-600" />
                  </div>
                  {filteredTranscripts.length > 0 && (
                    <button onClick={() => toggleSelectAll(filteredTranscripts.map((t) => t.studentInfo.matricNumber))} className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                      {selectedIds.size === filteredTranscripts.length ? "Deselect all" : `Select all ${filteredTranscripts.length}`}
                    </button>
                  )}
                  {selectedIds.size > 0 && (
                    <div className="mt-3">
                      <Button
                        size="sm"
                        onClick={() => handleBatchTranscriptDownload(filteredTranscripts.filter((t) => selectedIds.has(t.studentInfo.matricNumber)))}
                        disabled={isZipping}
                        className="bg-indigo-600 hover:bg-indigo-700 gap-1.5"
                      >
                        <Download className="h-4 w-4" />
                        {isZipping ? `Zipping... ${zipProgress}%` : `Download ${selectedIds.size} Transcript${selectedIds.size !== 1 ? "s" : ""}`}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {filteredTranscripts.length === 0 ? (
                <Card><CardContent className="py-12 text-center">
                  <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">{searchQuery ? "No students match your search" : "No session transcripts found"}</p>
                </CardContent></Card>
              ) : filteredTranscripts.map((transcript) => {
                const mid = transcript.studentInfo.matricNumber
                const isSelected = selectedIds.has(mid)
                return (
                  <Card key={mid} className={`border transition-colors ${isSelected ? "border-indigo-400 bg-indigo-50/20" : "border-slate-200 dark:border-slate-700 hover:border-indigo-300"}`}>
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-start gap-3">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(mid)} className="mt-1.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 dark:text-indigo-400 cursor-pointer" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 dark:text-slate-100">{transcript.studentInfo.name}</span>
                            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 dark:text-indigo-300 border-indigo-200 text-xs">{mid}</Badge>
                            <Badge variant="outline" className={`text-xs ${LEVEL_COLORS[transcript.studentInfo.level as Level]?.badge ?? "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 dark:text-slate-500"}`}>
                              Level {transcript.studentInfo.level}
                            </Badge>
                          </div>

                          {/* Semester summary pills */}
                          <div className="flex flex-wrap gap-2 mt-3">
                            {transcript.semesters.map((sem) => (
                              <div key={sem.name} className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${semColor(sem.name)}`}>
                                <span className="font-bold">{sem.name}</span>
                                <span className="mx-1.5 opacity-50">·</span>
                                <span>{sem.totalUnits} units</span>
                                <span className="mx-1.5 opacity-50">·</span>
                                <span>GPA {sem.semesterGPA}</span>
                                <span className="mx-1.5 opacity-50">·</span>
                                <span>CGPA {sem.cumulativeCGPA}</span>
                              </div>
                            ))}
                          </div>

                          {/* Session totals */}
                          <div className="flex gap-4 mt-3 flex-wrap">
                            <div><p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Total Units</p><p className="font-bold text-blue-700 dark:text-blue-300">{transcript.sessionTotalUnits}</p></div>
                            <div><p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Passed</p><p className="font-bold text-purple-700 dark:text-purple-300">{transcript.sessionTotalUnitsPassed}</p></div>
                            <div><p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Session GPA</p><p className="font-bold text-green-700">{transcript.sessionGPA}</p></div>
                            <div><p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Overall CGPA</p><p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{transcript.overallCGPA}</p></div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 shrink-0">
                          <Button size="sm" onClick={() => setPreviewTranscript(transcript)} className="bg-blue-600 hover:bg-blue-700 text-xs shrink-0">
                            <Eye className="h-3.5 w-3.5 mr-1" />Preview
                          </Button>
                          <Button size="sm" onClick={() => handleTranscriptDownload(transcript)} className="bg-indigo-600 hover:bg-indigo-700 text-xs shrink-0">
                            <Download className="h-3.5 w-3.5 mr-1" />Transcript
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}
    </motion.div>
  )
}
