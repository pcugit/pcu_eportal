"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  ChevronRight,
  ChevronLeft,
  FileText,
  Download,
  CheckCircle2,
  Clock,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PgApplication {
  id: string;
  user_id: number;
  name: string;
  email: string;
  phone_number: string;
  program_id: number;
  program_name: string;
  application_status: string;
  submitted_at: string;
  form_no?: string;
  session?: string;
  has_evaluation?: boolean;
}

const statusColors: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border border-amber-200",
  submitted: "bg-blue-50 text-blue-700 border border-blue-200",
  in_progress: "bg-slate-100 text-slate-600 border border-slate-200",
  screening: "bg-violet-50 text-violet-700 border border-violet-200",
  admitted: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  accepted: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  enrolled: "bg-teal-50 text-teal-700 border border-teal-200",
  rejected: "bg-rose-50 text-rose-700 border border-rose-200",
};

const PER_PAGE = 10;

export default function PgApplicationsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin mx-auto" />
      </div>
    }>
      <PgApplicationsPageInner />
    </Suspense>
  );
}

function PgApplicationsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated } = useAuth();

  const [applications, setApplications] = useState<PgApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>(
    searchParams?.get("status") || "submitted"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => { setCurrentPage(1); }, [status, debouncedSearch]);

  useEffect(() => {
    if (!isAuthenticated || (user?.role !== "pgadmin" && user?.role !== "pgdean")) {
      router.replace("/staff/login");
      return;
    }
    loadApplications();
  }, [isAuthenticated, user, router, status, currentPage, debouncedSearch]);

  const loadApplications = async () => {
    setLoading(true);
    try {
      const res = await ApiClient.getPgApplications(
        status, currentPage, PER_PAGE, debouncedSearch || undefined
      );
      setApplications((res.applications as any) || []);
      setTotalPages(res.total_pages || 1);
      setTotalCount(res.count || 0);
    } catch (err) {
      console.error("Error loading PG applications:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (app: PgApplication, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDownloading(app.id);
    try {
      const token = localStorage.getItem("auth_token");
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/e-portal/api";
      const res = await fetch(`${baseUrl}/pgadmin/print-application/${app.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Download failed");
      const contentType = res.headers.get("content-type") || "";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (contentType.includes("text/html")) {
        window.open(url, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `pg_application_${app.form_no || app.id}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download error:", err);
    } finally {
      setDownloading(null);
    }
  };

  const getPageNumbers = () => {
    const pages: number[] = [];
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  return (
    <div className="min-h-screen bg-gray-50">

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <Link
              href="/pgadmin/dashboard"
              className="text-slate-500 hover:text-slate-700 text-sm mb-1.5 block transition-colors"
            >
              ← Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-slate-800">Applications</h1>
            <p className="text-slate-500 text-sm mt-0.5">Review applications, complete evaluations and finalize admissions</p>
          </div>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-56 h-10 bg-white border-gray-200 text-slate-700 font-medium rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-gray-200 rounded-lg shadow-lg">
              <SelectItem value="submitted" className="text-slate-700 font-medium cursor-pointer">New Submissions</SelectItem>
              <SelectItem value="screening" className="text-slate-700 font-medium cursor-pointer">Awaiting Decision</SelectItem>
              <SelectItem value="admitted" className="text-slate-700 font-medium cursor-pointer">Admitted</SelectItem>
              <SelectItem value="rejected" className="text-slate-700 font-medium cursor-pointer">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Search */}
        <form
          onSubmit={(e) => { e.preventDefault(); setDebouncedSearch(searchQuery); }}
          className="mb-5 flex flex-col sm:flex-row sm:items-center gap-2"
        >
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or form number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all"
            />
          </div>
          <Button
            type="submit"
            className="h-10 px-5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg text-sm transition-colors"
          >
            Search
          </Button>
          <span className="text-sm text-slate-400 font-medium sm:ml-1">
            {totalCount} result{totalCount !== 1 ? "s" : ""}
          </span>
        </form>

        {/* List */}
        {loading ? (
          <div className="text-center py-20 bg-white border border-gray-200 rounded-xl">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Loading applications...</p>
          </div>
        ) : applications.length === 0 ? (
          <div className="text-center py-20 bg-white border border-dashed border-gray-300 rounded-xl">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-semibold text-base">No Applications Found</p>
            <p className="text-slate-400 text-sm mt-1">
              {debouncedSearch
                ? `No results for "${debouncedSearch}" in this filter`
                : `No PG applications with status "${status}"`}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {applications.map((app) => (
              <Link
                key={app.id}
                href={`/pgadmin/application/${app.id}`}
                className="block"
              >
                <Card className="bg-white border border-gray-200 hover:border-slate-400 hover:shadow-sm transition-all duration-150 rounded-xl group">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-slate-800 text-sm capitalize">
                            {app.name}
                          </h3>
                          <Badge
                            className={`${statusColors[app.application_status] || "bg-gray-100 text-gray-600"} font-medium text-[10px] uppercase tracking-wide py-0.5 px-2 rounded-md`}
                          >
                          </Badge>
                          
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <div>
                            <span className="text-slate-400 block">Form No.</span>
                            <p className="font-mono font-semibold text-slate-700">{app.form_no || "N/A"}</p>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Email</span>
                            <p className="text-slate-600 truncate max-w-[160px]">{app.email}</p>
                          </div>
                          <div className="col-span-2 md:col-span-1">
                            <span className="text-slate-400 block">Programme</span>
                            <p className="font-semibold text-slate-700 truncate max-w-[200px]">{app.program_name}</p>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Session</span>
                            <p className="text-slate-600">{app.session || "N/A"}</p>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={(e) => handleDownload(app, e)}
                          disabled={downloading === app.id}
                          title="Download Application"
                          className="flex items-center gap-1 p-2 bg-gray-100 hover:bg-gray-200 text-slate-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {downloading === app.id ? (
                            <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </button>
                        <div className="p-2 text-slate-400 group-hover:text-slate-700 transition-colors">
                          <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-slate-400">
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-gray-200 bg-white text-slate-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {getPageNumbers().map((p) => (
                    <button
                       key={p}
                       onClick={() => setCurrentPage(p)}
                       className={`min-w-[36px] h-9 rounded-lg text-sm font-semibold transition-all ${p === currentPage
                         ? "bg-slate-800 text-white"
                         : "bg-white text-slate-500 border border-gray-200 hover:bg-gray-50"
                         }`}
                     >
                       {p}
                     </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg border border-gray-200 bg-white text-slate-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
