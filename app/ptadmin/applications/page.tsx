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
} from "lucide-react";
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

const PROG_HND_CONV = 4;

function ProgTypePill({ programId }: { programId: number }) {
  if (programId === PROG_HND_CONV) {
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap">
        HND Conv.
      </span>
    );
  }
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
      Part Time
    </span>
  );
}

const statusColors: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border border-amber-200",
  submitted: "bg-blue-50 text-blue-700 border border-blue-200",
  screening: "bg-violet-50 text-violet-700 border border-violet-200",
  recommended: "bg-cyan-50 text-cyan-700 border border-cyan-200",
  accepted_recommendation: "bg-teal-50 text-teal-700 border border-teal-200",
  applicant_recommended: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  admitted: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  accepted: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border border-rose-200",
  incomplete: "bg-slate-100 text-slate-600 border border-slate-200",
};

const PER_PAGE = 10;

function ApplicationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated } = useAuth();

  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>(
    () => {
      const s = searchParams.get("status") || "submitted";
      return ["all","submitted","screening","recommended","accepted_recommendation",
              "applicant_recommended","admitted","rejected","started"].includes(s) ? s : "submitted";
    }
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState<number>(() => {
    const p = parseInt(searchParams.get("page") || "1", 10);
    return isNaN(p) || p < 1 ? 1 : p;
  });
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => { setPage(1); }, [status, debouncedSearch]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "ptadmin") {
      router.replace("/staff/login");
      return;
    }
    loadApplications();
  }, [isAuthenticated, user, router, status, page, debouncedSearch]);

  const loadApplications = async () => {
    setLoading(true);
    try {
      const response = await ApiClient.getPtApplications(status, page, PER_PAGE);
      setApplications((response.applications as any as Application[]) || []);
      setTotalPages(response.total_pages ?? 1);
      setTotalCount(response.count ?? 0);
    } catch (err) {
      console.error("Error loading PT applications:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (nextStatus: string) => {
    setStatus(nextStatus);
    setPage(1);
    router.replace(`/ptadmin/applications?status=${nextStatus}&page=1`, { scroll: false });
  };

  const getPageNumbers = () => {
    const pages: number[] = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-50 border-b border-gray-200 bg-gray-50/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/ptadmin/dashboard" className="text-slate-500 hover:text-slate-700 text-sm transition-colors">
            ← Back to Dashboard
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Applications</h1>
            <p className="text-slate-500 text-sm mt-0.5">Review and manage part-time applicant submissions</p>
          </div>

          <Select value={status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-56 h-10 bg-white border-gray-200 text-slate-700 font-medium rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-gray-200 rounded-lg shadow-lg">
              <SelectItem value="all" className="text-slate-700 font-medium cursor-pointer">All Applications</SelectItem>
              <SelectItem value="started" className="text-slate-700 font-medium cursor-pointer">Started Applications</SelectItem>
              <SelectItem value="submitted" className="text-slate-700 font-medium cursor-pointer">New Submissions</SelectItem>
              <SelectItem value="screening" className="text-slate-700 font-medium cursor-pointer">Awaiting Decision</SelectItem>
              <SelectItem value="recommended" className="text-slate-700 font-medium cursor-pointer">Recommended</SelectItem>
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
          <Button type="submit" className="h-10 px-5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg text-sm transition-colors">
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
              No part-time applications with status &ldquo;{status.replace(/_/g, " ")}&rdquo;
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {applications.map((app) => {
              const isStarted = app.application_status === "started" || status === "started";
              const cardContent = (
                <Card className={`bg-white border border-gray-200 transition-all duration-150 rounded-xl group ${!isStarted ? "hover:border-slate-400 hover:shadow-sm" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-slate-800 text-sm capitalize">{app.name}</h3>
                          <ProgTypePill programId={app.program_id} />
                          <Badge className={`${statusColors[app.application_status] || "bg-gray-100 text-gray-600"} font-medium text-[10px] uppercase tracking-wide py-0.5 px-2 rounded-md`}>
                            {app.application_status === "accepted_recommendation"
                              ? "Accepted Rec."
                              : app.application_status === "applicant_recommended"
                              ? "Counter-Rec."
                              : app.application_status.replace(/_/g, " ")}
                          </Badge>
                        </div>

                        {isStarted ? (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                            <div>
                              <span className="text-slate-400 block">Email</span>
                              <p className="text-slate-600 truncate max-w-[160px]">{app.email}</p>
                            </div>
                            <div>
                              <span className="text-slate-400 block">Phone Number</span>
                              <p className="font-semibold text-slate-700">{app.phone_number || "N/A"}</p>
                            </div>
                            <div>
                              <span className="text-slate-400 block">Programme Choice</span>
                              <p className="font-semibold text-slate-700 truncate max-w-[200px]">{app.program_name || "N/A"}</p>
                            </div>
                          </div>
                        ) : (
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
                        )}
                      </div>

                      {!isStarted && (
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="p-2 text-slate-400 group-hover:text-slate-700 transition-colors">
                            <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );

              if (isStarted) {
                return <div key={app.id} className="block">{cardContent}</div>;
              }
              return (
                <Link key={app.id} href={`/ptadmin/application/${app.id}?status=${status}`} className="block">
                  {cardContent}
                </Link>
              );
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-slate-400">
                  Page {page} of {totalPages}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 rounded-lg border border-gray-200 bg-white text-slate-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {getPageNumbers().map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`min-w-[36px] h-9 rounded-lg text-sm font-semibold transition-all ${
                        p === page ? "bg-slate-800 text-white" : "bg-white text-slate-500 border border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
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

export default function PtApplicationsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin mx-auto" />
      </div>
    }>
      <ApplicationsContent />
    </Suspense>
  );
}
