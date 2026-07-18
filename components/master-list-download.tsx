"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, FileSpreadsheet, Loader2 } from "lucide-react"
import { ApiClient } from "@/lib/api"
import { downloadMasterList } from "@/lib/master-list-generator"

type Source = { label: string; programme: "UG" | "PG"; apiBase: "/results" | "/pg-results" }
type Period = { session: string; semester: string }

export function MasterListDownload({
  sources,
  title,
  description,
  downloadLabel = "Download Master List",
  dark = false,
}: {
  sources: Source[]
  title: string
  description: string
  downloadLabel?: string
  dark?: boolean
}) {
  const [sourceIndex, setSourceIndex] = useState(0)
  const [periods, setPeriods] = useState<Period[]>([])
  const [session, setSession] = useState("")
  const [semester, setSemester] = useState("")
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [message, setMessage] = useState("")
  const source = sources[sourceIndex]

  useEffect(() => {
    let active = true
    async function loadOptions() {
      setLoadingOptions(true)
      setMessage("")
      try {
        const { data } = await ApiClient.fetch<{ periods: Period[] }>(`${source.apiBase}/master-list/options`)
        if (!active) return
        const nextPeriods = data?.periods || []
        setPeriods(nextPeriods)
        setSession(nextPeriods[0]?.session || "")
        setSemester(nextPeriods[0]?.semester || "")
      } catch (error: any) {
        if (active) setMessage(error.message || "Failed to load available result periods.")
      } finally {
        if (active) setLoadingOptions(false)
      }
    }
    void loadOptions()
    return () => { active = false }
  }, [source.apiBase])

  const sessions = useMemo(
    () => [...new Set(periods.map(period => period.session))],
    [periods],
  )
  const semesters = useMemo(
    () => periods.filter(period => period.session === session).map(period => period.semester),
    [periods, session],
  )

  function changeSession(value: string) {
    setSession(value)
    setSemester(periods.find(period => period.session === value)?.semester || "")
  }

  async function download() {
    if (!session || !semester) return
    setDownloading(true)
    setMessage("")
    try {
      const params = new URLSearchParams({ session, semester })
      const { data } = await ApiClient.fetch<any>(`${source.apiBase}/master-list?${params.toString()}`)
      await downloadMasterList({
        departments: data?.departments || [],
        session,
        semester,
        scope: data?.scope === "department" ? "department" : "overall",
        programme: source.programme,
      })
      setMessage("Master list downloaded successfully.")
    } catch (error: any) {
      setMessage(error.message || "Failed to download master list.")
    } finally {
      setDownloading(false)
    }
  }

  const foreground = dark ? "#f8fafc" : "#0f172a"
  const muted = dark ? "rgba(255,255,255,0.55)" : "#64748b"
  const surface = dark ? "rgba(255,255,255,0.04)" : "#fff"
  const border = dark ? "rgba(255,255,255,0.12)" : "#e2e8f0"
  const inputSurface = dark ? "#0f172a" : "#fff"
  const isError = /failed|not found|unavailable|denied/i.test(message)

  return (
    <section style={{ maxWidth: "52rem" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.85rem", marginBottom: "1.5rem" }}>
        <div style={{ width: "2.5rem", height: "2.5rem", display: "grid", placeItems: "center", background: dark ? "rgba(37,99,235,0.18)" : "#eff6ff", color: "#2563eb", borderRadius: "0.5rem" }}>
          <FileSpreadsheet size={20} />
        </div>
        <div>
          <h2 style={{ margin: 0, color: foreground, fontSize: "1.35rem" }}>{title}</h2>
          <p style={{ margin: "0.35rem 0 0", color: muted, fontSize: "0.88rem" }}>{description}</p>
        </div>
      </div>

      <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: "0.5rem", padding: "1.25rem" }}>
        {sources.length > 1 && (
          <div style={{ display: "inline-flex", padding: "0.25rem", background: dark ? "rgba(255,255,255,0.06)" : "#f1f5f9", borderRadius: "0.5rem", marginBottom: "1.25rem" }}>
            {sources.map((item, index) => (
              <button
                key={item.programme}
                type="button"
                onClick={() => setSourceIndex(index)}
                style={{
                  border: 0, borderRadius: "0.35rem", padding: "0.5rem 0.85rem", fontWeight: 700,
                  background: index === sourceIndex ? (dark ? "#334155" : "#fff") : "transparent",
                  color: index === sourceIndex ? foreground : muted, cursor: "pointer",
                }}
              >{item.label}</button>
            ))}
          </div>
        )}

        {loadingOptions ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: muted, padding: "1rem 0" }}>
            <Loader2 size={18} className="animate-spin" /> Loading result periods...
          </div>
        ) : periods.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(12rem,1fr))", gap: "1rem", alignItems: "end" }}>
            <label style={{ color: muted, fontSize: "0.78rem", fontWeight: 700 }}>
              ACADEMIC SESSION
              <select value={session} onChange={event => changeSession(event.target.value)} style={{ width: "100%", marginTop: "0.4rem", padding: "0.7rem", borderRadius: "0.4rem", border: `1px solid ${border}`, background: inputSurface, color: foreground }}>
                {sessions.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label style={{ color: muted, fontSize: "0.78rem", fontWeight: 700 }}>
              SEMESTER
              <select value={semester} onChange={event => setSemester(event.target.value)} style={{ width: "100%", marginTop: "0.4rem", padding: "0.7rem", borderRadius: "0.4rem", border: `1px solid ${border}`, background: inputSurface, color: foreground }}>
                {semesters.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={download}
              disabled={downloading}
              style={{
                height: "2.75rem", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                border: 0, borderRadius: "0.4rem", background: downloading ? "#64748b" : "#0f172a", color: "#fff",
                padding: "0 1rem", fontWeight: 700, cursor: downloading ? "not-allowed" : "pointer",
              }}
            >
              {downloading ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
              {downloading ? "Preparing..." : downloadLabel}
            </button>
          </div>
        ) : (
          <p style={{ color: muted, margin: 0 }}>No processed result periods are available.</p>
        )}
        {message && <p style={{ margin: "1rem 0 0", color: isError ? "#ef4444" : "#16a34a", fontSize: "0.82rem", fontWeight: 600 }}>{message}</p>}
      </div>
    </section>
  )
}
