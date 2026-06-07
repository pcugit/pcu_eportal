"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
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
import { LogOut, ChevronRight, FileText } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Application {
  id: number;
  user_id: number;
  name: string;
  email: string;
  phone_number: string;
  program_id: number;
  program_name: string;
  application_status: string;
  admission_status: string;
  submitted_at: string;
  form_no?: string;
  session?: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border border-amber-200/60 shadow-sm shadow-amber-500/5",
  submitted: "bg-blue-50 text-blue-700 border border-blue-200/60 shadow-sm shadow-blue-500/5",
  screening: "bg-purple-50 text-purple-700 border border-purple-200/60 shadow-sm shadow-purple-500/5",
  admitted: "bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-sm shadow-emerald-500/5",
  accepted: "bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-sm shadow-emerald-500/5",
  rejected: "bg-rose-50 text-rose-700 border border-rose-200/60 shadow-sm shadow-rose-500/5",
};

// ─── Inner component: safe to use useSearchParams() here ─────────────────────
function ApplicationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, logout } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>(() => {
    const urlStatus = searchParams.get("status");
    return ["submitted", "screening", "admitted", "rejected"].includes(urlStatus || "")
      ? (urlStatus as string)
      : "submitted";
  });

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "admissionofficer") {
      router.replace("/staff/login");
      return;
    }
    loadApplications();
  }, [isAuthenticated, user, router, status]);

  const loadApplications = async () => {
    setLoading(true);
    try {
      const response = await ApiClient.getApplications(status);
      setApplications((response.applications as any as Application[]) || []);
    } catch (err) {
      console.error("Error loading applications:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/staff/login");
  };

  const handleStatusChange = (nextStatus: string) => {
    setStatus(nextStatus);
    router.replace(`/admission_officer/applications?status=${nextStatus}`, {
      scroll: false,
    });
  };

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <Link
              href="/admission_officer/dashboard"
              className="text-slate-500 hover:text-slate-800 text-sm mb-2 block font-bold"
            >
              ← Back to Dashboard
            </Link>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight mb-1">
              Applications
            </h1>
            <p className="text-slate-500 font-medium">
              Review and manage applicant submissions
            </p>
          </div>
          <Select value={status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-52 h-11 bg-white border-slate-200/80 shadow-sm rounded-xl font-bold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white/95 backdrop-blur-md rounded-xl border-slate-100 shadow-xl">
              <SelectItem value="submitted" className="font-semibold text-slate-600 focus:text-purple-700 focus:bg-purple-50/55 cursor-pointer">Submitted</SelectItem>
              <SelectItem value="screening" className="font-semibold text-slate-600 focus:text-purple-700 focus:bg-purple-50/55 cursor-pointer">Under Review</SelectItem>
              <SelectItem value="admitted" className="font-semibold text-slate-600 focus:text-purple-700 focus:bg-purple-50/55 cursor-pointer">Admitted</SelectItem>
              <SelectItem value="rejected" className="font-semibold text-slate-600 focus:text-purple-700 focus:bg-purple-50/55 cursor-pointer">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Applications List */}
        {loading ? (
          <div className="text-center py-20 bg-white border border-slate-100 rounded-3xl shadow-sm">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#6b357d] mx-auto mb-4" />
            <p className="text-slate-500 font-semibold text-sm">Loading applications list...</p>
          </div>
        ) : applications.length === 0 ? (
          <Card className="border-dashed border-2 border-slate-200 shadow-inner bg-slate-50/50 rounded-3xl overflow-hidden">
            <CardContent className="py-20 text-center max-w-sm mx-auto space-y-4">
              <div className="w-16 h-16 bg-white border border-slate-100 shadow-md rounded-2xl flex items-center justify-center mx-auto text-slate-300">
                <FileText className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <p className="text-slate-800 font-bold text-lg">Inbox is Empty</p>
                <p className="text-slate-400 text-sm leading-relaxed font-medium">
                  No applications found matching the{" "}
                  <span className="font-bold text-slate-500 capitalize">
                    {status.replace("_", " ")}
                  </span>{" "}
                  status filter.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {applications.map((app) => (
              <Link key={app.id} href={`/admission_officer/application/${app.id}?status=${status}`} className="block">
                <Card className="hover:shadow-lg hover:border-[#d8c29a] border-[#e8dfd2] transition-all duration-300 bg-white hover:-translate-y-0.5 rounded-2xl group relative overflow-hidden shadow-sm">
                  {/* Subtle left gradient strip */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#c99b45] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <CardContent className="p-5 sm:p-6">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1 space-y-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <h3 className="font-black text-slate-900 text-lg sm:text-xl leading-snug capitalize">{app.name}</h3>
                          </div>
                          <div className="flex flex-wrap gap-2 sm:justify-end lg:min-w-[250px]">
                            <Badge
                              data-status={app.application_status}
                              className={`admission-status-badge ${statusColors[app.application_status] || 'bg-slate-50 text-slate-700 border border-slate-200'} font-bold text-xs py-1.5 px-3.5 rounded-full`}
                            >
                              {app.application_status === 'accepted' ? 'Admitted' : app.application_status.replace('_', ' ')}
                            </Badge>
                            {/* Fee status pill — only shown on admitted tab */}
                            {status === 'admitted' && (
                              <span className={`text-xs font-black px-3.5 py-1.5 rounded-full border shadow-sm ${
                                app.application_status === 'accepted'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                  : 'bg-amber-50 text-amber-700 border-amber-100'
                              }`}>
                                {app.application_status === 'accepted' ? '✓ Fee Paid' : '⏳ Awaiting Fee'}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-xl border border-[#eee5d8] bg-[#fbfaf7] p-3">
                            <span className="text-xs text-slate-500 font-bold">Form No.</span>
                            <p className="mt-1 font-bold text-slate-800 font-mono text-sm break-words">{app.form_no || "N/A"}</p>
                          </div>
                          <div className="rounded-xl border border-[#eee5d8] bg-[#fbfaf7] p-3">
                            <span className="text-xs text-slate-500 font-bold">Email Address</span>
                            <p className="mt-1 font-bold text-slate-800 text-sm break-words">{app.email}</p>
                          </div>
                          <div className="rounded-xl border border-[#eee5d8] bg-[#fbfaf7] p-3 sm:col-span-2 xl:col-span-1">
                            <span className="text-xs text-slate-500 font-bold">Programme Offered</span>
                            <p className="mt-1 font-black text-slate-900 text-sm break-words">{app.program_name}</p>
                          </div>
                          <div className="rounded-xl border border-[#eee5d8] bg-[#fbfaf7] p-3">
                            <span className="text-xs text-slate-500 font-bold">Session</span>
                            <p className="mt-1 font-bold text-slate-800 text-sm">{app.session || "N/A"}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-end lg:justify-center">
                        <div className="p-2.5 bg-[#fbfaf7] border border-[#e8dfd2] text-slate-500 rounded-xl group-hover:bg-[#ead6aa] group-hover:text-[#15110a] group-hover:border-[#d8c29a] transition-all duration-300">
                          <ChevronRight className="h-5 w-5 transform group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Default export: Suspense boundary satisfies Next.js prerender ────────────
export default function ApplicationsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50/50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#6b357d] mx-auto mb-4" />
            <p className="text-slate-500 font-semibold text-sm">Loading...</p>
          </div>
        </div>
      }
    >
      <ApplicationsContent />
    </Suspense>
  );
}
