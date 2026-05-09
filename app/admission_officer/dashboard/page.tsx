"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Settings } from "lucide-react";

interface Statistics {
  total_applications: number;
  total_admitted: number;
  pending_submission: number;
  under_review: number;
  review_applications: number;
  by_status: Array<{ application_status: string; count: number }>;
  by_program: Array<{ name: string; count: number }>;
}

interface ActivityItem {
  type: string;
  label: string;
  event_time: string | null;
}

/* ── Dot colour by activity type ───────────────────────────── */
function activityDot(type: string) {
  const map: Record<string, string> = {
    accept:    "bg-green-500",
    fee_paid:  "bg-green-500",
    submitted: "bg-blue-500",
    recommend: "bg-blue-500",
    reject:    "bg-red-500",
  };
  return map[type] ?? "bg-amber-500";
}


function friendlyTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const now  = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (+d === +today)     return `Today, ${time}`;
  if (+d === +yesterday) return `Yesterday, ${time}`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, logout, isLoading: authLoading } = useAuth();
  const [stats, setStats]       = useState<Statistics | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || user?.role !== "admissionofficer") {
      router.replace("/staff/login");
      return;
    }

    const load = async () => {
      try {
        const [statsRes, activityRes] = await Promise.all([
          ApiClient.getStatistics(),
          ApiClient.getRecentActivity(10),
        ]);
        setStats(statsRes);
        setActivity(activityRes.activities || []);
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [isAuthenticated, user, router, authLoading]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-1">Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage applications and admissions</p>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Applications", value: stats?.total_applications ?? 0, colour: "" },
            { label: "Admitted Candidates", value: stats?.total_admitted ?? 0, colour: "text-green-600" },
            { label: "Under Review",        value: stats?.under_review ?? 0,        colour: "text-blue-600" },
            { label: "Pending Submission",  value: stats?.pending_submission ?? 0,  colour: "text-yellow-600" },
          ].map(({ label, value, colour }) => (
            <Card key={label}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-3xl font-bold ${colour}`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main grid: Recent Activity + Breakdown */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">

          {/* ── Recent Activity (dark card) ─────────────────── */}
          <div className="rounded-2xl p-6 flex flex-col gap-4" style={{ backgroundColor: "#1c1c1e" }}>
            <p className="text-xs font-bold tracking-widest uppercase" style={{ color: "#9ca3af" }}>
              Recent Activity
            </p>

            {activity.length === 0 ? (
              <p className="text-sm mt-4" style={{ color: "#6b7280" }}>No recent activity to display.</p>
            ) : (
              <ul style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                {activity.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 py-3"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    {/* coloured dot */}
                    <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${activityDot(item.type)}`} />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm leading-snug" style={{ color: "#f1f1f1" }}>
                        {item.label}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>
                        {friendlyTime(item.event_time)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Right column: Status + Program breakdown ─────── */}
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Applications by Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {stats?.by_status?.map((s) => (
                  <div key={s.application_status} className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">
                      {s.application_status.replace("_", " ")}
                    </span>
                    <Badge variant="secondary">{s.count}</Badge>
                  </div>
                ))}
                {(!stats?.by_status || stats.by_status.length === 0) && (
                  <p className="text-sm text-muted-foreground">No data yet.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Applications by Program</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {stats?.by_program?.map((p) => (
                  <div key={p.name} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{p.name}</span>
                    <Badge variant="secondary">{p.count}</Badge>
                  </div>
                ))}
                {(!stats?.by_program || stats.by_program.length === 0) && (
                  <p className="text-sm text-muted-foreground">No data yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Academic Session Manager */}
        <AcademicSessionManager />
      </div>
    </div>
  );
}

function AcademicSessionManager() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try {
      const data = await ApiClient.getGlobalSettings();
      setSettings(data);
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await ApiClient.updateGlobalSettings({
        current_academic_session: settings.current_academic_session,
        current_semester: settings.current_semester,
      });
      alert("Academic settings updated successfully!");
    } catch (err) {
      console.error("Update failed:", err);
      alert("Failed to update settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          Academic Session Manager
        </CardTitle>
        <CardDescription>
          Set the global active session and semester for all portal activities.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleUpdate} className="grid md:grid-cols-3 gap-6 items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium">Active Academic Session</label>
            <input
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              value={settings.current_academic_session || ""}
              onChange={e => setSettings({ ...settings, current_academic_session: e.target.value })}
              placeholder="e.g. 2025/2026"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Active Semester</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              value={settings.current_semester || "First Semester"}
              onChange={e => setSettings({ ...settings, current_semester: e.target.value })}
            >
              <option value="First Semester">First Semester</option>
              <option value="Second Semester">Second Semester</option>
            </select>
          </div>
          <Button type="submit" disabled={saving} className="w-full md:w-auto">
            {saving ? "Updating..." : "Activate Now"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
