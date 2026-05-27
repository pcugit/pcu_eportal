"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
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

export default function ApplicationsPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("submitted");

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

  return (
    <div className="min-h-screen bg-slate-50/50">

      {/* Main Content */}
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
          <Select value={status} onValueChange={setStatus}>
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
                  No applications found matching the <span className="font-bold text-slate-500 capitalize">{status.replace("_", " ")}</span> status filter.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {applications.map((app) => (
              <Link key={app.id} href={`/admission_officer/application/${app.id}`} className="block">
                <Card className="hover:shadow-xl hover:border-purple-200/60 border-slate-100/80 transition-all duration-300 bg-white hover:-translate-y-0.5 rounded-2xl group relative overflow-hidden">
                  {/* Subtle left gradient strip */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#6b357d] to-[#881337] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center gap-3">
                          <h3 className="font-black text-slate-800 text-lg group-hover:text-[#6b357d] transition-colors leading-none capitalize">{app.name}</h3>
                          <Badge
                            className={`${statusColors[app.application_status] || 'bg-slate-50 text-slate-700 border border-slate-200'} font-bold text-[10px] uppercase tracking-wider py-1 px-3.5 rounded-full`}
                          >
                            {app.application_status === 'accepted' ? 'Admitted' : app.application_status.replace('_', ' ')}
                          </Badge>
                          {/* Fee status pill — only shown on admitted tab */}
                          {status === 'admitted' && (
                            <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border shadow-sm ${
                              app.application_status === 'accepted'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                : 'bg-amber-50 text-amber-700 border-amber-100'
                            }`}>
                              {app.application_status === 'accepted' ? '✓ Fee Paid' : '⏳ Awaiting Fee'}
                            </span>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Form No.</span>
                            <p className="font-bold text-slate-700 font-mono text-xs">{app.form_no || "N/A"}</p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Email Address</span>
                            <p className="font-bold text-slate-700 truncate max-w-[180px]">{app.email}</p>
                          </div>
                          <div className="space-y-1 col-span-2 md:col-span-1">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Programme Offered</span>
                            <p className="font-black text-slate-800 text-xs uppercase tracking-tight truncate max-w-[200px]">{app.program_name}</p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Session</span>
                            <p className="font-bold text-slate-700">{app.session || "N/A"}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-2 bg-slate-50 border border-slate-100 text-slate-400 rounded-xl group-hover:bg-purple-50 group-hover:text-[#6b357d] group-hover:border-purple-100 transition-all duration-300 ml-4">
                        <ChevronRight className="h-5 w-5 transform group-hover:translate-x-0.5 transition-transform" />
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
