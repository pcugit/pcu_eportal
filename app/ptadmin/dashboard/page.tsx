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
  AlertCircle,
  XCircle,
  ClipboardList,
  ChevronRight,
  LogOut,
} from "lucide-react";

interface PtStats {
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
    accept: "bg-green-500",
    fee_paid: "bg-green-500",
    submitted: "bg-blue-500",
    recommend: "bg-blue-500",
    pt_evaluated: "bg-slate-500",
    reject: "bg-red-500",
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

export default function PtAdminDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const [stats, setStats] = useState<PtStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || user?.role !== "ptadmin") {
      router.replace("/staff/login");
      return;
    }
    (async () => {
      try {
        const res = await ApiClient.getPtAdminDashboard(10);
        setStats(res.statistics);
        setActivity(res.recent_activity || []);
      } catch (err) {
        console.error("PT Admin dashboard error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated, user, router, authLoading]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f3eee6]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#e8dfd2] border-t-[#c99b45] rounded-full animate-spin mx-auto mb-4" />
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
      accent: "text-slate-700",
      iconBg: "bg-[#f3eee6]",
      iconBorder: "border-[#e2d6c3]",
      href: "/ptadmin/applications?status=all",
    },
    {
      label: "Admitted Candidates",
      value: stats?.total_admitted ?? 0,
      icon: UserCheck,
      accent: "text-[#23704d]",
      iconBg: "bg-[#eef7f1]",
      iconBorder: "border-[#cfe6d8]",
      href: "/ptadmin/applications?status=admitted",
    },
    {
      label: "Under Review",
      value: stats?.under_review ?? 0,
      icon: Eye,
      accent: "text-[#2d5f9a]",
      iconBg: "bg-[#eef4fb]",
      iconBorder: "border-[#ccdded]",
      href: "/ptadmin/applications?status=screening",
    },
    {
      label: "Started Applications",
      value: stats?.pending_submission ?? 0,
      icon: AlertCircle,
      accent: "text-[#9a6614]",
      iconBg: "bg-[#fff7e8]",
      iconBorder: "border-[#efd9a8]",
      href: "/ptadmin/applications?status=started",
    },
    {
      label: "Rejected",
      value: stats?.total_rejected ?? 0,
      icon: XCircle,
      accent: "text-[#9a2d2d]",
      iconBg: "bg-[#fdf2f2]",
      iconBorder: "border-[#f0cece]",
      href: "/ptadmin/applications?status=rejected",
    },
  ];

  return (
    <div className="min-h-screen bg-[#f3eee6]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">

        {/* Header */}
        <div className="pt-6 mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-900 mb-1">
              Part-time Admissions
            </h1>
            <p className="text-slate-600 font-medium">
              Manage part-time programme applications
            </p>
          </div>
          <button
            onClick={() => logout()}
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors mt-1"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>

        {/* Welcome banner */}
        <section className="mb-6 overflow-hidden rounded-2xl bg-[#c99b45] border border-[#b98d3d] shadow-sm">
          <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-white">
              <p className="text-sm font-bold !text-white/85 mb-1">
                Welcome back
              </p>
              <h2 className="text-2xl font-black !text-white">
                {user?.name || user?.username || "PT Admin"}
              </h2>
              <p className="text-xs !text-white/70 mt-1 font-medium">
                Part-time Admissions Officer · PCU Portal
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/80 border border-white/70 px-4 py-3 text-center shadow-sm">
                <p className="text-xs font-bold text-[#5c4520]">New</p>
                <p className="text-2xl font-black text-[#15110a]">
                  {stats?.new_applications ?? 0}
                </p>
              </div>
              <div className="rounded-2xl bg-white/80 border border-white/70 px-4 py-3 text-center shadow-sm">
                <p className="text-xs font-bold text-[#5c4520]">Admitted</p>
                <p className="text-2xl font-black text-[#15110a]">
                  {stats?.total_admitted ?? 0}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <Link
            href="/ptadmin/applications?status=submitted"
            className="group flex items-center gap-4 bg-white hover:bg-slate-50 border border-[#e8dfd2] rounded-xl p-4 transition-colors shadow-sm"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-slate-800 font-semibold text-sm">
                Review New Applications
              </p>
              <p className="text-slate-400 text-xs mt-0.5">
                {stats?.new_applications ?? 0} awaiting review
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
          </Link>

          <Link
            href="/ptadmin/applications?status=screening"
            className="group flex items-center gap-4 bg-white hover:bg-slate-50 border border-[#e8dfd2] rounded-xl p-4 transition-colors shadow-sm"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Eye className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-slate-800 font-semibold text-sm">
                Awaiting Admission Decision
              </p>
              <p className="text-slate-400 text-xs mt-0.5">
                {stats?.under_review ?? 0} awaiting final review
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
          </Link>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {statCards.map(({ label, value, icon: Icon, accent, iconBg, iconBorder, href }) => {
            const cardContent = (
              <CardContent className="min-h-[104px] p-5 flex items-center justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-bold text-slate-500 leading-snug">{label}</p>
                  <p className={`text-3xl font-black ${accent}`}>{value}</p>
                </div>
                <div className={`shrink-0 p-3 rounded-2xl ${iconBg} ${accent} border ${iconBorder} group-hover:scale-105 transition-transform duration-300`}>
                  <Icon className="w-6 h-6 shrink-0" />
                </div>
              </CardContent>
            );

            if (href) {
              return (
                <Link key={label} href={href} className="block group">
                  <Card className={`hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 border-[#e8dfd2] bg-white rounded-2xl overflow-hidden shadow-sm cursor-pointer`}>
                    {cardContent}
                  </Card>
                </Link>
              );
            }

            return (
              <Card key={label} className="border-[#e8dfd2] bg-white rounded-2xl overflow-hidden shadow-sm">
                {cardContent}
              </Card>
            );
          })}
        </div>

        {/* Main grid: Recent Activity + Breakdowns */}
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6">

          {/* Recent Activity */}
          <Card className="border-[#e8dfd2] shadow-sm bg-white rounded-2xl overflow-hidden">
            <CardHeader className="pb-4 border-b border-[#f0e8dc]">
              <CardTitle className="text-lg font-bold text-slate-900">
                Recent Activity Log
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {activity.length === 0 ? (
                <div className="text-center py-12 text-slate-500 font-medium">
                  <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">No recent activity to display.</p>
                </div>
              ) : (
                <div className="relative border-l border-[#eadfce] ml-3 space-y-4 py-2">
                  {activity.map((item, i) => (
                    <div key={i} className="relative pl-6 group">
                      <span
                        className={`absolute left-0 top-1.5 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-md ${activityDot(item.type)}`}
                      />
                      <div className="p-4 bg-[#fbfaf7] hover:bg-[#f7f1e8] border border-[#eee5d8] rounded-2xl transition-all duration-200">
                        <p className="font-bold text-sm text-slate-800 leading-snug">
                          {item.label}
                        </p>
                        <p className="text-[10px] font-bold text-slate-500 mt-1.5 flex items-center gap-1.5">
                          <span>•</span>
                          <span>{friendlyTime(item.event_time)}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Status + Programme breakdowns */}
          <div className="flex flex-col gap-6">
            <Card className="border-[#e8dfd2] shadow-sm bg-white rounded-2xl overflow-hidden">
              <CardHeader className="pb-4 border-b border-[#f0e8dc]">
                <CardTitle className="text-base font-bold text-slate-900">
                  Applications by Status
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {[...(stats?.by_status ?? [])]
                  .sort((a, b) => {
                    const ORDER = [
                      "enrolled",
                      "admitted",
                      "accepted",
                      "screening",
                      "in progress",
                      "started",
                    ];
                    const normA = a.application_status.toLowerCase().replace("_", " ");
                    const normB = b.application_status.toLowerCase().replace("_", " ");
                    const idxA = ORDER.indexOf(normA);
                    const idxB = ORDER.indexOf(normB);
                    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                    if (idxA !== -1) return -1;
                    if (idxB !== -1) return 1;
                    return 0;
                  })
                  .map((s) => (
                    <div
                      key={s.application_status}
                      className="flex items-center justify-between p-3 bg-[#fbfaf7] border border-[#eee5d8] rounded-xl"
                    >
                      <span className="text-sm font-bold text-slate-600 capitalize">
                        {s.application_status.replace(/_/g, " ")}
                      </span>
                      <Badge className="bg-[#ead6aa] text-[#4b3411] hover:bg-[#ead6aa] border-none font-bold px-3 py-1 text-xs rounded-lg">
                        {s.count}
                      </Badge>
                    </div>
                  ))}
                {(!stats?.by_status || stats.by_status.length === 0) && (
                  <p className="text-sm text-muted-foreground italic text-center py-4">
                    No data yet.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-[#e8dfd2] shadow-sm bg-white rounded-2xl overflow-hidden">
              <CardHeader className="pb-4 border-b border-[#f0e8dc]">
                <CardTitle className="text-base font-bold text-slate-900">
                  Applications by Programme
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {stats?.by_program?.map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center justify-between p-3 bg-[#fbfaf7] border border-[#eee5d8] rounded-xl"
                  >
                    <span className="text-sm font-bold text-slate-600 truncate max-w-[200px]">
                      {p.name || "Unknown"}
                    </span>
                    <Badge className="bg-[#dce7f1] text-[#234766] hover:bg-[#dce7f1] border-none font-bold px-3 py-1 text-xs rounded-lg ml-2 shrink-0">
                      {p.count}
                    </Badge>
                  </div>
                ))}
                {(!stats?.by_program || stats.by_program.length === 0) && (
                  <p className="text-sm text-muted-foreground italic text-center py-4">
                    No data yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

      </div>
    </div>
  );
}
