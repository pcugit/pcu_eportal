"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Download,
  User,
  FileText,
  CheckCircle,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Star,
  ClipboardList,
  Printer,
  GraduationCap,
  BookOpen,
  Clock,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApplicationDetail {
  applicant: any;
  form: any;
  olevel_results?: OLevelSitting[];
  documents: any[];
}

interface OLevelSitting {
  exam_type: string | null;
  exam_no: string | null;
  exam_year: string | null;
  exam_period: string | null;
  subjects: { subject: string; grade: string }[];
}

// prog_type ids
const PROG_PART_TIME = 7;
const PROG_HND_CONV  = 4;

// ─── Status helpers ───────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  pending:     "bg-amber-50 text-amber-700 border border-amber-200",
  submitted:   "bg-blue-50 text-blue-700 border border-blue-200",
  screening:   "bg-violet-50 text-violet-700 border border-violet-200",
  shortlisted: "bg-cyan-50 text-cyan-700 border border-cyan-200",
  recommended: "bg-cyan-50 text-cyan-700 border border-cyan-200",
  accepted_recommendation: "bg-cyan-50 text-cyan-700 border border-cyan-200",
  applicant_recommended: "bg-cyan-50 text-cyan-700 border border-cyan-200",
  admitted:    "bg-emerald-50 text-emerald-700 border border-emerald-200",
  accepted:    "bg-emerald-50 text-emerald-700 border border-emerald-200",
  rejected:    "bg-rose-50 text-rose-700 border border-rose-200",
  incomplete:  "bg-slate-100 text-slate-600 border border-slate-200",
  payment_pending: "bg-amber-50 text-amber-700 border border-amber-200",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatDocumentCategory = (category?: string | null) =>
  (category || "Document")
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

const formatDegreeProgramme = (
  programme?: string | null,
  degreeCode?: string | null,
) => {
  const cleanProgramme = (programme || "").trim();
  const cleanDegree = (degreeCode || "").trim();

  if (!cleanProgramme) return "N/A";
  if (!cleanDegree) return cleanProgramme;

  const escapedDegree = cleanDegree.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alreadyPrefixed = new RegExp(`^${escapedDegree}\\.?\\s+`, "i").test(
    cleanProgramme,
  );

  return alreadyPrefixed ? cleanProgramme : `${cleanDegree} ${cleanProgramme}`;
};

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between items-start py-2.5 border-b border-[#f0e8dc] last:border-0">
      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-4">
        {label}
      </span>
      <span className="font-semibold text-slate-700 text-sm text-right break-words max-w-[60%]">
        {value || "N/A"}
      </span>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
        {icon}
        {title}
      </p>
      <div className="bg-white border border-[#e8dfd2] rounded-xl overflow-hidden px-4">
        {children}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PtApplicationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { user, isAuthenticated } = useAuth();

  const id = params?.id as string;
  const backStatus = searchParams.get("status") || "submitted";

  const [application, setApplication] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [programmes, setProgrammes] = useState<any[]>([]);

  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [recommendedProg, setRecommendedProg] = useState("");
  const [isRecommendModalOpen, setIsRecommendModalOpen] = useState(false);
  const [isRequestDocModalOpen, setIsRequestDocModalOpen] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [customDocType, setCustomDocType] = useState("");

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "ptadmin") {
      router.replace("/staff/login");
      return;
    }
    loadApplication();
    loadProgrammes();
  }, [isAuthenticated, user, router, id]);

  const loadApplication = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ApiClient.getPtApplicationDetails(id);
      setApplication(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load application");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadProgrammes = async () => {
    try {
      // Pass application id so backend excludes the applicant's own first/second choices
      const data = await ApiClient.getPtPrograms(id);
      setProgrammes(data || []);
    } catch (e) {
      console.error("Failed to load programmes", e);
    }
  };

  const handleAction = async (decision: "accept" | "reject" | "recommend" | "incomplete" | "request_documents", extraData?: any) => {
    setActionLoading(true);
    setActionSuccess(null);
    setActionError(null);
    try {
      await ApiClient.ptReviewApplication(id, decision, { notes: notes || undefined, ...extraData });
      const labels: Record<string, string> = {
        accept: "Application accepted successfully.",
        reject: "Application rejected.",
        recommend: "Applicant recommended for admission.",
        incomplete: "Document request sent to applicant.",
        request_documents: "Document request sent to applicant.",
      };
      setActionSuccess(labels[decision]);
      await loadApplication();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownload = async (doc: any) => {
    try {
      const token = localStorage.getItem("auth_token");
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/e-portal/api";
      const documentId = doc.document_id || doc.id;
      const res = await fetch(
        `${baseUrl}/ptadmin/download-document/${documentId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.original_filename || "document";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Download failed", e);
    }
  };

  const handlePrint = () => {
    const printUrl = ApiClient.getPtApplicationPrintUrl(id);
    window.open(printUrl, "_blank");
  };

  // ─── Loading / error states ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f3eee6] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#e8dfd2] border-t-[#c99b45] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-sm font-medium">Loading application...</p>
        </div>
      </div>
    );
  }

  if (error || !application) {
    return (
      <div className="min-h-screen bg-[#f3eee6] flex items-center justify-center">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
          <p className="text-slate-700 font-bold text-base mb-1">Failed to load application</p>
          <p className="text-slate-500 text-sm">{error}</p>
          <Link href="/ptadmin/applications" className="mt-4 inline-block text-[#c99b45] font-bold text-sm">
            ← Back to Applications
          </Link>
        </div>
      </div>
    );
  }

  const { applicant, form, olevel_results = [], documents } = application;
  const status = applicant?.application_status || "";
  const progType: number = applicant?.program_id ?? 0;
  const isHndConversion = progType === PROG_HND_CONV;
  const isPartTime      = progType === PROG_PART_TIME;

  const passportDoc = documents?.find((d) => {
    const label = `${d.document_type || ""} ${d.display_name || ""}`.toLowerCase();
    return label.includes("passport");
  });
  const passportUrl = passportDoc
    ? `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/e-portal/api"}/ptadmin/download-document/${passportDoc.document_id || passportDoc.id}?token=${typeof window !== "undefined" ? encodeURIComponent(localStorage.getItem("auth_token") || "") : ""}`
    : null;

  const isDecided = ["admitted", "accepted", "rejected", "enrolled"].includes(status);

  const programLabel = isHndConversion
    ? "HND Conversion"
    : isPartTime
    ? "Part-Time"
    : "Part-Time / HND";
  const firstChoiceDisplay = formatDegreeProgramme(
    form?.first_choice_program_name ||
      form?.proposed_course_name ||
      applicant?.program_name,
    applicant?.degree_code || form?.degree_code,
  );
  const secondChoiceDisplay = form?.second_choice_program_name
    ? formatDegreeProgramme(
        form.second_choice_program_name,
        applicant?.degree_code || form?.degree_code,
      )
    : "N/A";
  const finalisedCourseDisplay =
    applicant?.finalised_course || applicant?.approved_course
      ? formatDegreeProgramme(
          applicant?.finalised_course || applicant?.approved_course,
          applicant?.degree_code || form?.degree_code,
        )
      : "Awaiting decision / Not finalized";

  return (
    <div className="min-h-screen bg-[#f3eee6]">
      {/* Breadcrumb + Print */}
      <div className="sticky top-0 z-50 border-b border-[#e8dfd2] bg-[#f3eee6]/95 backdrop-blur">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link
            href={`/ptadmin/applications?status=${backStatus}`}
            className="text-slate-500 hover:text-slate-800 text-sm font-bold"
          >
            ← Back to Applications
          </Link>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e8dfd2] rounded-xl text-sm font-bold text-slate-600 hover:bg-[#f7f1e8] hover:border-[#c99b45] transition-all shadow-sm"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 pt-6">

        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-black text-slate-900 capitalize">
                  {form?.full_name || applicant?.name || "Applicant"}
                </h1>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${isHndConversion ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                  {programLabel}
                </span>
              </div>
              <p className="text-slate-500 text-sm mt-0.5">
                {applicant?.form_no || `Application #${id}`}
                {(form?.proposed_course_name || applicant?.program_name) && (
                  <> · {firstChoiceDisplay}</>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                className={`${statusColors[status] || "bg-slate-100 text-slate-600 border border-slate-200"} font-bold text-xs py-1.5 px-4 rounded-full`}
              >
                {status.replace(/_/g, " ")}
              </Badge>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_340px] gap-6">

          {/* ── Left: applicant info ─────────────────────────────────────── */}
          <div className="space-y-6">

            {/* Passport + quick summary */}
            <Card className="border-[#e8dfd2] shadow-sm bg-white rounded-2xl overflow-hidden">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row gap-6">
                  {/* Passport photo */}
                  <div className="w-28 h-28 rounded-2xl overflow-hidden border border-[#e8dfd2] bg-[#f3eee6] shrink-0 flex items-center justify-center">
                    {passportUrl ? (
                      <img
                        src={passportUrl}
                        alt="Passport"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center text-slate-300">
                        <User className="w-8 h-8 mb-1" />
                        <span className="text-[9px] font-bold uppercase tracking-wider">No photo</span>
                      </div>
                    )}
                  </div>
                  {/* Quick details */}
                  <div className="flex-1 space-y-2">
                    <h2 className="text-xl font-black text-slate-900 uppercase">
                      {form?.full_name || applicant?.name}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Email</span>
                        <p className="font-semibold text-slate-700">{form?.email || applicant?.email || "N/A"}</p>
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Phone</span>
                        <p className="font-semibold text-slate-700">{form?.phone_number || applicant?.phone_number || "N/A"}</p>
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">First Choice (Proposed)</span>
                        <p className="font-semibold text-slate-700">{firstChoiceDisplay}</p>
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Second Choice (Proposed)</span>
                        <p className="font-semibold text-slate-700">{secondChoiceDisplay}</p>
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Admitted/Finalised Course</span>
                        <p className="font-bold text-emerald-700">
                          {finalisedCourseDisplay}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Session</span>
                        <p className="font-semibold text-slate-700">{applicant?.session || "N/A"}</p>
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Form No.</span>
                        <p className="font-semibold text-slate-700 font-mono">{applicant?.form_no || "N/A"}</p>
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Faculty</span>
                        <p className="font-semibold text-slate-700">{form?.proposed_faculty_name || "N/A"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Personal Information (shared by both templates) ────────── */}
            <Section title="Personal Information" icon={<User className="w-3 h-3" />}>
              <InfoRow label="First Name"    value={form?.first_name} />
              <InfoRow label="Middle Name"   value={form?.middle_name} />
              <InfoRow label="Last Name"     value={form?.last_name || form?.surname} />
              <InfoRow label="Gender"        value={form?.gender} />
              <InfoRow label="Date of Birth" value={form?.date_of_birth} />
              <InfoRow label="Place of Birth" value={form?.place_of_birth} />
              <InfoRow label="Marital Status" value={form?.marital_status} />
              <InfoRow label="Religion"      value={form?.religion} />
              <InfoRow label="Blood Group"   value={form?.blood_group} />
              <InfoRow label="Genotype"      value={form?.genotype} />
              <InfoRow label="Nationality"   value={form?.nationality} />
              <InfoRow label="State of Origin" value={form?.state} />
              <InfoRow label="LGA"           value={form?.lga} />
              <InfoRow label="Contact Address" value={form?.contact_address || form?.address} />
              <InfoRow label="Secondary Phone" value={form?.secondary_phone_number} />
              {isPartTime && (
                <InfoRow label="Who Referred You?" value={form?.who_referred_you} />
              )}
            </Section>

            {/* ── HND Qualifications (HND Conversion only) ──────────────── */}
            {isHndConversion && (
              <Section
                title="HND Qualifications"
                icon={<GraduationCap className="w-3 h-3" />}
              >
                <InfoRow label="Qualification Type"        value={form?.qualification_type} />
                <InfoRow label="Institution Name"          value={form?.qualification_institution} />
                <InfoRow label="Year of Graduation"        value={form?.qualification_year?.toString()} />
              </Section>
            )}

            {/* ── Sponsor & Next of Kin ──────────────────────────────────── */}
            <Section title="Sponsor & Next of Kin">
              <InfoRow label="Sponsor Name"           value={form?.sponsor_name} />
              <InfoRow label="Sponsor Address"        value={form?.sponsor_address} />
              <InfoRow label="Sponsor Phone"          value={form?.sponsor_phone_number} />
              <InfoRow label="Sponsor Relationship"   value={form?.sponsor_relationship} />
              <InfoRow label="Sponsor Email"          value={form?.sponsor_email} />
              <InfoRow label="Next of Kin Name"       value={form?.next_of_kin_name} />
              <InfoRow label="Next of Kin Phone"      value={form?.next_of_kin_phone_number} />
              <InfoRow label="Next of Kin Address"    value={form?.next_of_kin_address} />
            </Section>

            {/* ── O'Level Results ────────────────────────────────────────── */}
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <BookOpen className="w-3 h-3" />
                O&apos;Level Results
              </p>
              {olevel_results.length === 0 ? (
                <div className="bg-white border border-[#e8dfd2] rounded-xl px-4 py-6 text-center text-sm text-slate-400 font-medium">
                  No O&apos;Level results submitted
                </div>
              ) : (
                <div className="space-y-4">
                  {olevel_results.map((sitting, idx) => (
                    <div key={idx} className="bg-white border border-[#e8dfd2] rounded-xl overflow-hidden">
                      {/* Sitting header */}
                      <div className="px-4 py-3 border-b border-[#f0e8dc] bg-[#fbfaf7]">
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                          <span>
                            <span className="font-bold text-slate-400 uppercase tracking-wider">Exam: </span>
                            <span className="font-semibold text-slate-700">{sitting.exam_type || "N/A"}</span>
                          </span>
                          <span>
                            <span className="font-bold text-slate-400 uppercase tracking-wider">Reg. No: </span>
                            <span className="font-semibold text-slate-700">{sitting.exam_no || "N/A"}</span>
                          </span>
                          <span>
                            <span className="font-bold text-slate-400 uppercase tracking-wider">Year: </span>
                            <span className="font-semibold text-slate-700">{sitting.exam_year || "N/A"}</span>
                          </span>
                          {sitting.exam_period && (
                            <span>
                              <span className="font-bold text-slate-400 uppercase tracking-wider">Period: </span>
                              <span className="font-semibold text-slate-700">{sitting.exam_period}</span>
                            </span>
                          )}
                          <span className="ml-auto">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#f3eee6] text-slate-500 border border-[#e8dfd2]">
                              {idx === 0 ? "1st Sitting" : "2nd Sitting"}
                            </span>
                          </span>
                        </div>
                      </div>
                      {/* Subjects table */}
                      {sitting.subjects.length > 0 ? (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-[#f0e8dc]">
                              <th className="text-left px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-8">#</th>
                              <th className="text-left px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Subject</th>
                              <th className="text-right px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Grade</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sitting.subjects.map((s, i) => (
                              <tr key={i} className="border-b border-[#f0e8dc] last:border-0">
                                <td className="px-4 py-2.5 text-slate-400 text-xs font-semibold">{i + 1}</td>
                                <td className="px-4 py-2.5 font-semibold text-slate-700">{s.subject}</td>
                                <td className="px-4 py-2.5 text-right">
                                  <span className={`font-bold text-sm px-2 py-0.5 rounded ${["A1","A2","B2","B3"].includes(s.grade) ? "text-emerald-700" : ["C4","C5","C6"].includes(s.grade) ? "text-blue-700" : "text-slate-600"}`}>
                                    {s.grade || "—"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="px-4 py-4 text-sm text-slate-400 text-center">No subjects recorded</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Documents ─────────────────────────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Uploaded Documents ({documents?.length || 0})
                </p>
                {documents?.length > 0 && (
                  <span className="text-xs font-bold text-[#c99b45]">
                    {documents.length} file(s)
                  </span>
                )}
              </div>
              <Card className="border-[#e8dfd2] shadow-sm bg-white rounded-2xl overflow-hidden">
                <CardContent className="p-4">
                  {documents?.length > 0 ? (
                    <div className="space-y-2">
                      {documents.map((doc) => (
                        <div
                          key={doc.id || doc.document_id}
                          className="flex items-center justify-between p-3 bg-[#fbfaf7] border border-[#eee5d8] rounded-xl"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <FileText className="w-4 h-4 text-[#c99b45] shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-700 truncate">
                                {formatDocumentCategory(doc.document_type)}
                              </p>
                              <p className="text-xs text-slate-400">
                                {doc.original_filename || "Unnamed file"}
                                {doc.file_size ? ` · ${(doc.file_size / 1024).toFixed(1)} KB` : ""}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDownload(doc)}
                            className="flex items-center gap-1.5 ml-3 px-3 py-1.5 rounded-lg bg-white border border-[#e8dfd2] text-slate-600 hover:border-[#c99b45] hover:bg-[#fdf8f0] text-xs font-bold transition-all shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 text-center py-6">No documents uploaded.</p>
                  )}
                </CardContent>
              </Card>
            </div>

          </div>

          {/* ── Right: actions panel ─────────────────────────────────────── */}
          <div className="space-y-4">
            <Card className="border-[#e8dfd2] shadow-sm bg-white rounded-2xl overflow-hidden sticky top-4">
              <CardHeader className="pb-4 border-b border-[#f0e8dc] px-5 pt-5">
                <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" />
                  Admission Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-4">

                {/* Feedback messages */}
                {actionSuccess && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <p className="text-emerald-700 font-semibold text-sm">{actionSuccess}</p>
                  </div>
                )}
                {actionError && (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    <p className="text-rose-600 font-semibold text-sm">{actionError}</p>
                  </div>
                )}

                {/* Application type pill */}
                <div className={`rounded-xl p-3 border ${isHndConversion ? "bg-purple-50 border-purple-100" : "bg-amber-50 border-amber-100"}`}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Application Type</p>
                  <p className={`font-bold text-sm ${isHndConversion ? "text-purple-700" : "text-amber-700"}`}>
                    {isHndConversion ? "HND Direct Entry Conversion" : "Part-Time Programme"}
                  </p>
                </div>

                {/* Current status */}
                <div className="bg-[#fbfaf7] border border-[#eee5d8] rounded-xl p-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Current Status
                  </p>
                  <Badge
                    className={`${statusColors[status] || "bg-slate-100 text-slate-600 border border-slate-200"} font-bold text-xs py-1 px-3 rounded-full`}
                  >
                    {status.replace(/_/g, " ")}
                  </Badge>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                    Review Notes (optional)
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add notes for this decision..."
                    disabled={isDecided}
                    className="w-full bg-white border border-[#e8dfd2] rounded-xl px-3.5 py-2.5 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#c99b45]/40 resize-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Action buttons */}
                {isDecided ? (
                  <div className="bg-[#fbfaf7] border border-[#eee5d8] rounded-xl p-4 text-center">
                    <CheckCircle className="w-6 h-6 text-[#c99b45] mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-600">Decision finalised</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      This application has already been processed.
                    </p>
                  </div>
                ) : status === "recommended" ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                    <Clock className="w-6 h-6 text-[#2d5f9a] mx-auto mb-2" />
                    <p className="text-sm font-bold text-[#2d5f9a]">Awaiting candidate response</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Recommended Course:{" "}
                      <span className="font-semibold">
                        {formatDegreeProgramme(
                          applicant?.approved_course,
                          applicant?.degree_code || form?.degree_code,
                        )}
                      </span>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {status === "screening" && applicant?.requested_documents && (
                      <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 mb-2 text-left">
                        <p className="text-xs font-bold text-violet-800">
                          Requested Documents:
                        </p>
                        <p className="text-sm font-semibold text-violet-950 mt-0.5">
                          {applicant?.requested_documents}
                        </p>
                      </div>
                    )}
                    {status === "accepted_recommendation" && (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 mb-2 text-left">
                        <p className="text-xs font-bold text-emerald-800">
                          Candidate accepted recommended course:
                        </p>
                        <p className="text-sm font-semibold text-emerald-950 mt-0.5">
                          {formatDegreeProgramme(
                            applicant?.approved_course,
                            applicant?.degree_code || form?.degree_code,
                          )}
                        </p>
                      </div>
                    )}
                    {status === "applicant_recommended" && (
                      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-2 text-left">
                        <p className="text-xs font-bold text-blue-800">
                          Candidate recommended alternative course:
                        </p>
                        <p className="text-sm font-semibold text-blue-950 mt-0.5">
                          {applicant?.applicant_recommended_course}
                        </p>
                      </div>
                    )}

                    <button
                      onClick={() => handleAction("accept")}
                      disabled={actionLoading}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#23704d] hover:bg-[#1d5c40] text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ThumbsUp className="w-4 h-4" />
                      Accept Applicant
                    </button>

                     {status !== "accepted_recommendation" && status !== "applicant_recommended" && (
                      <button
                        onClick={() => setIsRecommendModalOpen(true)}
                        disabled={actionLoading}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#2d5f9a] hover:bg-[#254d7e] text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Star className="w-4 h-4" />
                        Recommend Admission
                      </button>
                    )}

                    <button
                      onClick={() => setIsRequestDocModalOpen(true)}
                      disabled={actionLoading}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-[#e8dfd2] hover:bg-[#f7f1e8] hover:border-[#c99b45] text-slate-700 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                      Request Documents
                    </button>
                    <button
                      onClick={() => handleAction("reject")}
                      disabled={actionLoading}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ThumbsDown className="w-4 h-4" />
                      Reject Application
                    </button>
                  </div>
                )}

                {actionLoading && (
                  <div className="text-center py-2">
                    <div className="w-5 h-5 border-2 border-[#e8dfd2] border-t-[#c99b45] rounded-full animate-spin mx-auto" />
                    <p className="text-xs text-slate-400 mt-1 font-medium">Processing...</p>
                  </div>
                )}

              </CardContent>
            </Card>
          </div>

        </div>
      </div>

      <Dialog open={isRecommendModalOpen} onOpenChange={setIsRecommendModalOpen}>
        <DialogContent className="bg-white border-[#e8dfd2] rounded-2xl max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-800">Recommend Alternative Programme</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              Select an alternative programme to recommend to this applicant. The applicant will be prompted on their dashboard to accept, reject, or suggest another choice.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Select Course to Recommend
              </label>
              {programmes.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2">
                  Loading available courses...
                </p>
              ) : (
                <select
                  value={recommendedProg}
                  onChange={(e) => setRecommendedProg(e.target.value)}
                  className="w-full bg-white border border-[#e8dfd2] rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-[#c99b45]"
                >
                  <option value="">Select course...</option>
                  {programmes.map((p) => (
                    <option key={p.id} value={p.course}>
                      {p.course}{p.department ? ` — ${p.department}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setIsRecommendModalOpen(false)}
              disabled={actionLoading}
              className="border-[#e8dfd2] hover:bg-slate-50 rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await handleAction("recommend", { approved_course: recommendedProg });
                setIsRecommendModalOpen(false);
              }}
              disabled={actionLoading || !recommendedProg}
              className="bg-[#2d5f9a] hover:bg-[#254d7e] text-white rounded-xl"
            >
              Confirm Recommendation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRequestDocModalOpen} onOpenChange={setIsRequestDocModalOpen}>
        <DialogContent className="bg-white border-[#e8dfd2] rounded-2xl max-w-md p-6 font-sans">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-800">Request Documents</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              Select what documents are needed from this applicant or manually type them.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-2">
              {["O'Level Result", "Birth Certificate", "Passport"].map((doc) => {
                const checked = selectedDocs.includes(doc);
                return (
                  <label key={doc} className="flex items-center gap-3 px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-xl cursor-pointer border border-slate-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        if (checked) {
                          setSelectedDocs(selectedDocs.filter((d) => d !== doc));
                        } else {
                          setSelectedDocs([...selectedDocs, doc]);
                        }
                      }}
                      className="w-4 h-4 rounded text-[#c99b45] focus:ring-[#c99b45]"
                    />
                    <span className="text-sm font-semibold text-slate-700">{doc}</span>
                  </label>
                );
              })}
            </div>

            <div className="border-t border-[#f0e8dc] pt-3">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Manually Add Custom Document
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customDocType}
                  onChange={(e) => setCustomDocType(e.target.value)}
                  placeholder="e.g. LGA Certificate"
                  className="flex-1 bg-white border border-[#e8dfd2] rounded-xl px-3.5 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#c99b45]/40"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const trimmed = customDocType.trim();
                    if (trimmed && !selectedDocs.includes(trimmed)) {
                      setSelectedDocs([...selectedDocs, trimmed]);
                      setCustomDocType("");
                    }
                  }}
                  className="border-[#e8dfd2] hover:bg-slate-50 rounded-xl text-xs font-bold shrink-0 h-10 px-4"
                >
                  Add
                </Button>
              </div>
            </div>

            {selectedDocs.length > 0 && (
              <div className="bg-slate-50 rounded-xl p-3 border border-dashed border-slate-200">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Selected to Request
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedDocs.map((doc) => (
                    <span key={doc} className="inline-flex items-center gap-1.5 bg-[#fbfaf7] border border-[#eee5d8] text-slate-600 font-semibold text-xs px-2.5 py-1 rounded-full">
                      {doc}
                      <button
                        type="button"
                        onClick={() => setSelectedDocs(selectedDocs.filter((d) => d !== doc))}
                        className="text-[#c99b45] hover:text-[#b0873c] font-bold"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 sm:justify-end border-t border-[#f0e8dc] pt-3">
            <Button
              variant="outline"
              onClick={() => {
                setIsRequestDocModalOpen(false);
                setSelectedDocs([]);
              }}
              disabled={actionLoading}
              className="border-[#e8dfd2] hover:bg-slate-50 rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await handleAction("request_documents", { requested_documents: selectedDocs.join(", ") });
                setIsRequestDocModalOpen(false);
                setSelectedDocs([]);
              }}
              disabled={actionLoading || selectedDocs.length === 0}
              className="bg-[#c99b45] hover:bg-[#b0873c] text-white rounded-xl font-bold"
            >
              Send Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
