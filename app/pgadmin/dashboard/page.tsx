"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  UserCheck,
  Eye,
  XCircle,
  ChevronRight,
  ClipboardList,
} from "lucide-react";

interface PgStats {
  total_applications: number;
  total_admitted: number;
  pending_submission: number;
  new_applications: number;
  under_review: number;
  total_rejected: number;
  by_status: Array<{ application_status: string; count: number }>;
  by_program: Array<{ name: string; count: number }>;
}

interface ActivityItem {
  type: string;
  label: string;
  event_time: string | null;
}

function activityDot(type: string) {
  const map: Record<string, string> = {
    accept: "bg-emerald-500",
    submitted: "bg-blue-500",
    recommend: "bg-blue-500",
    pg_evaluated: "bg-slate-500",
    reject: "bg-rose-500",
  };
  return map[type] ?? "bg-amber-500";
}

function friendlyTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (+d === +today) return `Today, ${time}`;
  if (+d === +yesterday) return `Yesterday, ${time}`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function PgAdminDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [stats, setStats] = useState<PgStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || (user?.role !== "pgadmin" && user?.role !== "pgdean")) {
      router.replace("/staff/login");
      return;
    }
    (async () => {
      try {
        const res = await ApiClient.getPgAdminDashboard(10);
        setStats(res.statistics);
        setActivity(res.recent_activity || []);
      } catch (err) {
        console.error("PG Admin dashboard error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated, user, router, authLoading]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-sm font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Applications",
      value: stats?.total_applications ?? 0,
      icon: FileText,
      accent: "text-slate-600",
      iconBg: "bg-slate-100",
    },
    {
      label: "New Submissions",
      value: stats?.new_applications ?? 0,
      icon: ClipboardList,
      accent: "text-blue-600",
      iconBg: "bg-blue-50",
    },
    {
      label: "Under Review",
      value: stats?.under_review ?? 0,
      icon: Eye,
      accent: "text-amber-600",
      iconBg: "bg-amber-50",
    },
    {
      label: "Admitted",
      value: stats?.total_admitted ?? 0,
      icon: UserCheck,
      accent: "text-emerald-600",
      iconBg: "bg-emerald-50",
    },
    {
      label: "Rejected",
      value: stats?.total_rejected ?? 0,
      icon: XCircle,
      accent: "text-rose-600",
      iconBg: "bg-rose-50",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800">Good day, PG Admin</h1>
          <p className="text-slate-500 text-sm mt-0.5">Postgraduate School Portal</p>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          <Link
            href="/pgadmin/applications?status=submitted"
            className="group flex items-center gap-4 bg-white hover:bg-slate-50 border border-gray-200 rounded-xl p-4 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-slate-800 font-semibold text-sm">Review New Applications</p>
              <p className="text-slate-400 text-xs mt-0.5">
                {stats?.new_applications ?? 0} awaiting Section B evaluation
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
          </Link>

          <Link
            href="/pgadmin/applications?status=screening"
            className="group flex items-center gap-4 bg-white hover:bg-slate-50 border border-gray-200 rounded-xl p-4 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Eye className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-slate-800 font-semibold text-sm">Awaiting Admission Decision</p>
              <p className="text-slate-400 text-xs mt-0.5">
                {stats?.under_review ?? 0} awaiting final review
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
          </Link>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          {statCards.map(({ label, value, icon: Icon, accent, iconBg }) => (
            <Card
              key={label}
              className="bg-white border border-gray-200 shadow-none rounded-xl"
            >
              <CardContent className="p-4">
                <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center mb-3`}>
                  <Icon className={`w-4 h-4 ${accent}`} />
                </div>
                <p className={`text-2xl font-bold ${accent}`}>{value}</p>
                <p className="text-xs text-slate-500 font-medium mt-0.5 leading-tight">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main grid */}
        <div className="grid md:grid-cols-2 gap-6">

          {/* Recent Activity */}
          <Card className="bg-white border border-gray-200 shadow-none rounded-xl">
            <CardHeader className="pb-3 border-b border-gray-100 px-5 pt-5">
              <CardTitle className="text-sm font-semibold text-slate-700">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              {activity.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No recent activity.</p>
                </div>
              ) : (
                <div className="relative border-l border-gray-200 ml-3 space-y-4 py-1">
                  {activity.map((item, i) => (
                    <div key={i} className="relative pl-5">
                      <span className={`absolute left-0 top-2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-gray-50 ${activityDot(item.type)}`} />
                      <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                        <p className="font-semibold text-sm text-slate-700 leading-snug">{item.label}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{friendlyTime(item.event_time)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Breakdowns */}
          <div className="flex flex-col gap-4">
            <Card className="bg-white border border-gray-200 shadow-none rounded-xl">
              <CardHeader className="pb-3 border-b border-gray-100 px-5 pt-5">
                <CardTitle className="text-sm font-semibold text-slate-700">By Status</CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-2">
                {stats?.by_status?.map((s) => (
                  <div key={s.application_status} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-slate-600 capitalize">
                      {s.application_status.replace("_", " ")}
                    </span>
                    <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 border-none font-semibold text-xs px-2.5 py-0.5 rounded-md">
                      {s.count}
                    </Badge>
                  </div>
                ))}
                {(!stats?.by_status || stats.by_status.length === 0) && (
                  <p className="text-sm text-slate-400 italic text-center py-4">No data yet.</p>
                )}
              </CardContent>
            </Card>

            <Card className="bg-white border border-gray-200 shadow-none rounded-xl">
              <CardHeader className="pb-3 border-b border-gray-100 px-5 pt-5">
                <CardTitle className="text-sm font-semibold text-slate-700">By Programme</CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-2">
                {stats?.by_program?.slice(0, 6).map((p) => (
                  <div key={p.name} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <span className="text-xs text-slate-600 truncate max-w-[200px]">{p.name || "Unknown"}</span>
                    <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 border-none font-semibold text-xs px-2.5 py-0.5 rounded-md ml-2 shrink-0">
                      {p.count}
                    </Badge>
                  </div>
                ))}
                {(!stats?.by_program || stats.by_program.length === 0) && (
                  <p className="text-sm text-slate-400 italic text-center py-4">No data yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
