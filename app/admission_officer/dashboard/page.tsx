"use client";

import React, { useState, useEffect } from "react";
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
import { FileText, UserCheck, Eye, AlertCircle } from "lucide-react";

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
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
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
        const res = await ApiClient.getDashboard(10);
        setStats(res.statistics);
        setActivity(res.recent_activity || []);
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
    <div className="min-h-screen bg-[#f3eee6]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-black text-slate-900 mb-1">Admission Officer Dashboard</h1>
          <p className="text-slate-600 font-medium">Manage applications and admissions</p>
        </div>

        <section className="mb-6 overflow-hidden rounded-2xl bg-[#c99b45] border border-[#b98d3d] shadow-sm">
          <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-white">
              <p className="text-sm font-bold !text-white/85 mb-1">
                Welcome back
              </p>
              <h2 className="text-2xl font-black !text-white">
                {user?.username || "Admission Officer"}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/80 border border-white/70 px-4 py-3 text-center shadow-sm">
                <p className="text-xs font-bold text-[#5c4520]">Review</p>
                <p className="text-2xl font-black text-[#15110a]">{stats?.review_applications ?? 0}</p>
              </div>
              <div className="rounded-2xl bg-white/80 border border-white/70 px-4 py-3 text-center shadow-sm">
                <p className="text-xs font-bold text-[#5c4520]">Admitted</p>
                <p className="text-2xl font-black text-[#15110a]">{stats?.total_admitted ?? 0}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4 mb-6">
          {[
            { label: "Total Applications", value: stats?.total_applications ?? 0, colour: "text-slate-900", bgIcon: "bg-[#f3eee6] text-slate-700 border border-[#e2d6c3]", icon: FileText },
            { label: "Admitted Candidates", value: stats?.total_admitted ?? 0,       colour: "text-[#23704d]", bgIcon: "bg-[#eef7f1] text-[#23704d] border border-[#cfe6d8]", icon: UserCheck },
            { label: "Under Review",        value: stats?.under_review ?? 0,         colour: "text-[#2d5f9a]", bgIcon: "bg-[#eef4fb] text-[#2d5f9a] border border-[#ccdded]", icon: Eye },
            { label: "Pending Submission",  value: stats?.pending_submission ?? 0,   colour: "text-[#9a6614]", bgIcon: "bg-[#fff7e8] text-[#9a6614] border border-[#efd9a8]", icon: AlertCircle },
          ].map(({ label, value, colour, bgIcon, icon: Icon }) => (
            <Card key={label} className="hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 border-[#e8dfd2] bg-white rounded-2xl overflow-hidden group shadow-sm">
              <CardContent className="min-h-[104px] p-5 flex items-center justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-bold text-slate-500 leading-snug">{label}</p>
                  <p className={`text-3xl font-black ${colour}`}>{value}</p>
                </div>
                <div className={`shrink-0 p-3 rounded-2xl ${bgIcon} group-hover:scale-105 transition-transform duration-300`}>
                  <Icon className="w-6 h-6 shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main grid: Recent Activity + Breakdown */}
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6">

          {/* Recent Activity */}
          <Card className="border-[#e8dfd2] shadow-sm bg-white rounded-2xl overflow-hidden">
            <CardHeader className="pb-4 border-b border-[#f0e8dc]">
              <CardTitle className="text-lg font-bold text-slate-900">Recent Activity Log</CardTitle>
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
                      {/* Accent indicator line/dot */}
                      <span className={`absolute left-0 top-1.5 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-md ${activityDot(item.type)}`} />
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

          {/* Status + Program breakdown */}
          <div className="flex flex-col gap-6">
            <Card className="border-[#e8dfd2] shadow-sm bg-white rounded-2xl overflow-hidden">
              <CardHeader className="pb-4 border-b border-[#f0e8dc]">
                <CardTitle className="text-base font-bold text-slate-900">Applications by Status</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {stats?.by_status?.map((s) => (
                  <div key={s.application_status} className="flex items-center justify-between p-3 bg-[#fbfaf7] border border-[#eee5d8] rounded-xl">
                    <span className="text-sm font-bold text-slate-600 capitalize">
                      {s.application_status.replace("_", " ")}
                    </span>
                    <Badge className="bg-[#ead6aa] text-[#4b3411] hover:bg-[#ead6aa] border-none font-bold px-3 py-1 text-xs rounded-lg">{s.count}</Badge>
                  </div>
                ))}
                {(!stats?.by_status || stats.by_status.length === 0) && (
                  <p className="text-sm text-muted-foreground italic text-center py-4">No data yet.</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-[#e8dfd2] shadow-sm bg-white rounded-2xl overflow-hidden">
              <CardHeader className="pb-4 border-b border-[#f0e8dc]">
                <CardTitle className="text-base font-bold text-slate-900">Applications by Program</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {stats?.by_program?.map((p) => (
                  <div key={p.name} className="flex items-center justify-between p-3 bg-[#fbfaf7] border border-[#eee5d8] rounded-xl">
                    <span className="text-sm font-bold text-slate-600">{p.name}</span>
                    <Badge className="bg-[#dce7f1] text-[#234766] hover:bg-[#dce7f1] border-none font-bold px-3 py-1 text-xs rounded-lg">{p.count}</Badge>
                  </div>
                ))}
                {(!stats?.by_program || stats.by_program.length === 0) && (
                  <p className="text-sm text-muted-foreground italic text-center py-4">No data yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

      </div>
    </div>
  );
}
