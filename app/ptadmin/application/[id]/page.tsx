"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Users,
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

const PROG_HND_CONV = 4;
const PROG_PART_TIME = 7;

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
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDocumentCategory = (category?: string | null) =>
  (category || "Document")
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

const formatDegreeProgramme = (programme?: string | null, degreeCode?: string | null) => {
  const p = (programme || "").trim();
  const d = (degreeCode || "").trim();
  if (!p) return "N/A";
  if (!d) return p;
  const escaped = d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}\\.?\\s+`, "i").test(p) ? p : `${d} ${p}`;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoCard({ label, value, colSpan = "" }: { label: string; value?: string | null; colSpan?: string }) {
  return (
    <div className={`p-3.5 bg-gray-50 border border-gray-200 rounded-lg ${colSpan}`}>
      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block mb-1">{label}</span>
      <span className="font-semibold text-slate-700 text-sm">{value || "N/A"}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-gray-100 pb-2 mb-3">
      {children}
    </h3>
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
  const [downloading, setDownloading] = useState(false);

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
      const data = await ApiClient.getPtPrograms(id);
      setProgrammes(data || []);
    } catch (e) {
      console.error("Failed to load programmes", e);
    }
  };

  const handleAction = async (
    decision: "accept" | "reject" | "recommend" | "incomplete" | "request_documents",
    extraData?: any
  ) => {
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
      const res = await fetch(`${baseUrl}/ptadmin/download-document/${documentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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

  const handlePrint = () => window.open(ApiClient.getPtApplicationPrintUrl(id), "_blank");

  const handleDownloadAll = async () => {
    if (!documents || documents.length === 0) return;
    setDownloading(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      // Build candidate folder name: SURNAME_Initials (e.g. SMITH_JO)
      const lastName = (form?.last_name || form?.surname || "").trim().toUpperCase();
      const firstInitial = (form?.first_name || "").trim().charAt(0).toUpperCase();
      const middleInitial = (form?.middle_name || "").trim().charAt(0).toUpperCase();
      const initials = (firstInitial + middleInitial) || "XX";
      const rawFolderName = lastName ? `${lastName}_${initials}` : (form?.full_name || applicant?.name || "applicant");
      const sanitizedName = rawFolderName.replace(/[^a-z0-9_\-]/gi, "_");

      const folder = zip.folder(sanitizedName);
      if (!folder) throw new Error("Failed to create zip folder");

      const token = localStorage.getItem("auth_token");
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/e-portal/api";
      const usedNames = new Set<string>();

      for (const [index, doc] of documents.entries()) {
        try {
          const documentId = doc.document_id || doc.id;
          const res = await fetch(
            `${baseUrl}/ptadmin/download-document/${documentId}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (res.ok) {
            const blob = await res.blob();
            // Build a unique filename inside the zip
            const originalName = doc.original_filename || `document_${documentId || index}`;
            const extension = originalName.includes(".")
              ? originalName.slice(originalName.lastIndexOf("."))
              : "";
            const typeName = (doc.document_type || "document")
              .replace(/[^a-z0-9_\-]+/gi, "_")
              .replace(/^_+|_+$/g, "");
            const docId = String(documentId || index).slice(0, 8);
            let fileName = `${String(index + 1).padStart(2, "0")}_${typeName}_${docId}${extension}`;
            let suffix = 2;
            while (usedNames.has(fileName)) {
              fileName = `${String(index + 1).padStart(2, "0")}_${typeName}_${docId}_${suffix}${extension}`;
              suffix += 1;
            }
            usedNames.add(fileName);
            folder.file(fileName, blob);
          }
        } catch (err) {
          console.error(`Failed to download document ${doc.original_filename}:`, err);
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sanitizedName}_documents.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Download all failed", e);
      alert("Failed to download all documents. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  // ─── Loading / error states ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Loading application...</p>
        </div>
      </div>
    );
  }

  if (error || !application) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
          <p className="text-slate-700 font-bold text-base mb-1">Failed to load application</p>
          <p className="text-slate-500 text-sm">{error}</p>
          <Link href="/ptadmin/applications" className="mt-4 inline-block text-slate-600 font-semibold text-sm hover:text-slate-800">
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
  const isPartTime = progType === PROG_PART_TIME;

  const passportDoc = documents?.find((d) => {
    const label = `${d.document_type || ""} ${d.display_name || ""}`.toLowerCase();
    return label.includes("passport");
  });
  const passportUrl = passportDoc
    ? `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/e-portal/api"}/ptadmin/download-document/${passportDoc.document_id || passportDoc.id}?token=${typeof window !== "undefined" ? encodeURIComponent(localStorage.getItem("auth_token") || "") : ""}`
    : null;

  const isDecided = ["admitted", "accepted", "rejected", "enrolled"].includes(status);

  const programLabel = isHndConversion ? "HND Conversion" : isPartTime ? "Part-Time" : "Part-Time / HND";

  const firstChoiceDisplay = formatDegreeProgramme(
    form?.first_choice_program_name || form?.proposed_course_name || applicant?.program_name,
    applicant?.degree_code || form?.degree_code,
  );
  const secondChoiceDisplay = form?.second_choice_program_name
    ? formatDegreeProgramme(form.second_choice_program_name, applicant?.degree_code || form?.degree_code)
    : "N/A";
  const finalisedCourseDisplay =
    applicant?.finalised_course || applicant?.approved_course
      ? formatDegreeProgramme(
          applicant?.finalised_course || applicant?.approved_course,
          applicant?.degree_code || form?.degree_code,
        )
      : "Awaiting decision";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky breadcrumb */}
      <div className="sticky top-0 z-50 border-b border-gray-200 bg-gray-50/95 backdrop-blur">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link
            href={`/ptadmin/applications?status=${backStatus}`}
            className="text-slate-500 hover:text-slate-700 text-sm transition-colors"
          >
            ← Back to Applications
          </Link>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-gray-50 hover:border-slate-400 transition-all"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-10 pt-6">

        {/* Page header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-slate-800 capitalize">
                  {form?.full_name || applicant?.name || "Applicant"}
                </h1>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${isHndConversion ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                  {programLabel}
                </span>
              </div>
              <p className="text-slate-500 text-sm">
                {applicant?.form_no || `Application #${id}`}
                {firstChoiceDisplay !== "N/A" && <> · {firstChoiceDisplay}</>}
              </p>
            </div>
            <Badge className={`${statusColors[status] || "bg-slate-100 text-slate-600 border border-slate-200"} font-medium text-xs py-1.5 px-4 rounded-full self-start sm:self-center`}>
              {status.replace(/_/g, " ")}
            </Badge>
          </div>
        </div>

        {/* Main layout: tabs + sidebar */}
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">

          {/* ── Tabs ────────────────────────────────────────────────────────── */}
          <div>
            <Tabs defaultValue="biodata" className="w-full">
              <TabsList className="mb-4 bg-white border border-gray-200 rounded-lg p-1 w-full sm:w-auto">
                <TabsTrigger
                  value="biodata"
                  className="flex items-center gap-1.5 data-[state=active]:bg-slate-800 data-[state=active]:text-white rounded-md text-sm font-medium px-4 py-2"
                >
                  <User className="w-3.5 h-3.5" />
                  Biodata
                </TabsTrigger>
                <TabsTrigger
                  value="documents"
                  className="flex items-center gap-1.5 data-[state=active]:bg-slate-800 data-[state=active]:text-white rounded-md text-sm font-medium px-4 py-2"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Documents
                  {documents?.length > 0 && (
                    <span className="ml-1 text-[10px] bg-slate-200 text-slate-600 data-[state=active]:bg-white/20 data-[state=active]:text-white rounded-full px-1.5 py-0.5 font-bold">
                      {documents.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="review"
                  className="flex items-center gap-1.5 data-[state=active]:bg-slate-800 data-[state=active]:text-white rounded-md text-sm font-medium px-4 py-2"
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  Review
                </TabsTrigger>
              </TabsList>

              {/* ── BIODATA TAB ─────────────────────────────────────────────── */}
              <TabsContent value="biodata" className="space-y-6 mt-0">

                <div className="space-y-6 bg-white border border-gray-200 p-6 rounded-xl">
                  {/* Personal Details */}
                  <div className="space-y-3">
                    <SectionLabel>Personal Details</SectionLabel>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <InfoCard label="First Name" value={form?.first_name} />
                      <InfoCard label="Surname" value={form?.last_name || form?.surname} />
                      <InfoCard label="Middle Name" value={form?.middle_name} />
                      <InfoCard label="Gender" value={form?.gender} />
                      <InfoCard label="Date of Birth" value={form?.date_of_birth} />
                      <InfoCard label="Place of Birth" value={form?.place_of_birth} />
                      <InfoCard label="Marital Status" value={form?.marital_status} />
                      <InfoCard label="Religion" value={form?.religion} />
                      <InfoCard label="Nationality" value={form?.nationality} />
                      <InfoCard label="State of Origin" value={form?.state} />
                      <InfoCard label="LGA" value={form?.lga} />
                      <InfoCard label="Blood Group" value={form?.blood_group} />
                      <InfoCard label="Genotype" value={form?.genotype} />
                      <InfoCard label="Phone Number" value={form?.phone_number || applicant?.phone_number} />
                      <InfoCard label="Secondary Phone" value={form?.secondary_phone_number} />
                      <InfoCard label="Contact Address" value={form?.contact_address || form?.address} colSpan="md:col-span-3" />
                      {isPartTime && (
                        <InfoCard label="Who Referred You?" value={form?.who_referred_you} colSpan="md:col-span-3" />
                      )}
                    </div>
                  </div>

                  {/* Programme Choices */}
                  <div className="space-y-3">
                    <SectionLabel>Programme Choices</SectionLabel>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <InfoCard label="First Choice (Proposed)" value={firstChoiceDisplay} />
                      <InfoCard label="Second Choice (Proposed)" value={secondChoiceDisplay} />
                      <InfoCard label="Admitted / Finalised Course" value={finalisedCourseDisplay} />
                      <InfoCard label="Faculty" value={form?.proposed_faculty_name} />
                      <InfoCard label="Session" value={applicant?.session} />
                      <InfoCard label="Form No." value={applicant?.form_no} />
                    </div>
                  </div>

                  {/* HND Qualifications */}
                  {isHndConversion && (
                    <div className="space-y-3">
                      <SectionLabel>
                        <span className="flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5" /> HND Qualifications</span>
                      </SectionLabel>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <InfoCard label="Qualification Type" value={form?.qualification_type} />
                        <InfoCard label="Institution Name" value={form?.qualification_institution} />
                        <InfoCard label="Year of Graduation" value={form?.qualification_year?.toString()} />
                      </div>
                    </div>
                  )}

                  {/* Sponsor & Next of Kin */}
                  <div className="space-y-3">
                    <SectionLabel>
                      <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Sponsor &amp; Next of Kin</span>
                    </SectionLabel>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <InfoCard label="Sponsor Name" value={form?.sponsor_name} />
                      <InfoCard label="Sponsor Phone" value={form?.sponsor_phone_number} />
                      <InfoCard label="Sponsor Relationship" value={form?.sponsor_relationship} />
                      <InfoCard label="Sponsor Address" value={form?.sponsor_address} colSpan="md:col-span-2" />
                      <InfoCard label="Sponsor Email" value={form?.sponsor_email} />
                      <InfoCard label="Next of Kin Name" value={form?.next_of_kin_name} />
                      <InfoCard label="Next of Kin Phone" value={form?.next_of_kin_phone_number} />
                      <InfoCard label="Next of Kin Address" value={form?.next_of_kin_address} />
                    </div>
                  </div>

                  {/* O'Level Results */}
                  <div className="space-y-3">
                    <SectionLabel>
                      <span className="flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" /> O&apos;Level Results</span>
                    </SectionLabel>
                    {olevel_results.length === 0 ? (
                      <div className="text-center py-8 bg-gray-50 border border-dashed border-gray-200 rounded-lg">
                        <p className="text-sm text-slate-400">No O&apos;Level results submitted</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {olevel_results.map((sitting, idx) => (
                          <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
                            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                              <span><span className="font-bold text-slate-400 uppercase tracking-wider">Exam: </span><span className="font-semibold text-slate-700">{sitting.exam_type || "N/A"}</span></span>
                              <span><span className="font-bold text-slate-400 uppercase tracking-wider">Reg. No: </span><span className="font-semibold text-slate-700">{sitting.exam_no || "N/A"}</span></span>
                              <span><span className="font-bold text-slate-400 uppercase tracking-wider">Year: </span><span className="font-semibold text-slate-700">{sitting.exam_year || "N/A"}</span></span>
                              {sitting.exam_period && <span><span className="font-bold text-slate-400 uppercase tracking-wider">Period: </span><span className="font-semibold text-slate-700">{sitting.exam_period}</span></span>}
                              <span className="ml-auto">
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                  {idx === 0 ? "1st Sitting" : "2nd Sitting"}
                                </span>
                              </span>
                            </div>
                            {sitting.subjects.length > 0 ? (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-gray-100">
                                    <th className="text-left px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-8">#</th>
                                    <th className="text-left px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Subject</th>
                                    <th className="text-right px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Grade</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sitting.subjects.map((s, i) => (
                                    <tr key={i} className="border-b border-gray-50 last:border-0">
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
                </div>
              </TabsContent>

              {/* ── DOCUMENTS TAB ───────────────────────────────────────────── */}
              <TabsContent value="documents" className="mt-0">
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-700 text-sm">Uploaded Documents</p>
                      <p className="text-slate-400 text-xs mt-0.5">{documents?.length || 0} document(s)</p>
                    </div>
                    {documents?.length > 0 && (
                      <button
                        onClick={handleDownloadAll}
                        disabled={downloading}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {downloading ? (
                          <>
                            <span className="h-3.5 w-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            Downloading...
                          </>
                        ) : (
                          <>
                            <Download className="h-3.5 w-3.5" />
                            Download All
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  {documents?.length > 0 ? (
                    <div className="p-4 space-y-2">
                      {documents.map((doc) => (
                        <div
                          key={doc.id || doc.document_id}
                          className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-lg"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4 text-slate-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-700 truncate">
                                {formatDocumentCategory(doc.document_type)}
                              </p>
                              <p className="text-xs text-slate-400 truncate">
                                {doc.original_filename || "Unnamed file"}
                                {doc.file_size ? ` · ${(doc.file_size / 1024).toFixed(1)} KB` : ""}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDownload(doc)}
                            className="flex items-center gap-1.5 ml-3 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-slate-600 hover:bg-gray-50 hover:border-slate-400 text-xs font-medium transition-all shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-16 border border-dashed border-gray-200 rounded-lg m-4">
                      <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 font-semibold text-sm">No documents uploaded.</p>
                      <p className="text-slate-400 text-xs mt-1">The applicant has not uploaded any files yet.</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* ── REVIEW TAB ──────────────────────────────────────────────── */}
              <TabsContent value="review" className="mt-0">
                <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
                  <h3 className="text-sm font-semibold text-slate-700">Admission Review</h3>

                  {/* Feedback */}
                  {actionSuccess && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      <p className="text-emerald-700 font-semibold text-sm">{actionSuccess}</p>
                    </div>
                  )}
                  {actionError && (
                    <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      <p className="text-rose-600 font-semibold text-sm">{actionError}</p>
                    </div>
                  )}

                  {/* Application type + current status */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Application Type</p>
                      <p className={`font-semibold text-sm ${isHndConversion ? "text-purple-700" : "text-amber-700"}`}>
                        {isHndConversion ? "HND Direct Entry Conversion" : "Part-Time Programme"}
                      </p>
                    </div>
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Current Status</p>
                      <Badge className={`${statusColors[status] || "bg-slate-100 text-slate-600 border border-slate-200"} font-medium text-xs py-1 px-3 rounded-full`}>
                        {status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  </div>

                  {/* Contextual notes */}
                  {status === "screening" && applicant?.requested_documents && (
                    <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
                      <p className="text-xs font-bold text-violet-800 mb-1">Requested Documents:</p>
                      <p className="text-sm font-semibold text-violet-900">{applicant?.requested_documents}</p>
                    </div>
                  )}
                  {status === "accepted_recommendation" && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                      <p className="text-xs font-bold text-emerald-800 mb-1">Candidate accepted recommended course:</p>
                      <p className="text-sm font-semibold text-emerald-900">
                        {formatDegreeProgramme(applicant?.approved_course, applicant?.degree_code || form?.degree_code)}
                      </p>
                    </div>
                  )}
                  {status === "applicant_recommended" && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-xs font-bold text-blue-800 mb-1">Candidate recommended alternative course:</p>
                      <p className="text-sm font-semibold text-blue-900">{applicant?.applicant_recommended_course}</p>
                    </div>
                  )}
                  {status === "recommended" && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
                      <Clock className="w-5 h-5 text-blue-600 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-blue-800">Awaiting candidate response</p>
                        <p className="text-xs text-blue-600 mt-0.5">
                          Recommended Course:{" "}
                          <span className="font-semibold">
                            {formatDegreeProgramme(applicant?.approved_course, applicant?.degree_code || form?.degree_code)}
                          </span>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Notes textarea */}
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                      Review Notes <span className="text-slate-400 font-normal normal-case">(optional)</span>
                    </label>
                    <textarea
                      rows={4}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add notes for this decision..."
                      disabled={isDecided}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  {/* Action buttons */}
                  {isDecided ? (
                    <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-6 text-center">
                      <CheckCircle className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-slate-600">Decision finalised</p>
                      <p className="text-xs text-slate-400 mt-0.5">This application has already been processed.</p>
                    </div>
                  ) : status !== "recommended" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        onClick={() => handleAction("accept")}
                        disabled={actionLoading}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ThumbsUp className="w-4 h-4" />
                        Accept Applicant
                      </button>

                      {status !== "accepted_recommendation" && status !== "applicant_recommended" && (
                        <button
                          onClick={() => setIsRecommendModalOpen(true)}
                          disabled={actionLoading}
                          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Star className="w-4 h-4" />
                          Recommend Admission
                        </button>
                      )}

                      <button
                        onClick={() => setIsRequestDocModalOpen(true)}
                        disabled={actionLoading}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 hover:border-slate-400 text-slate-700 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        Request Documents
                      </button>

                      <button
                        onClick={() => handleAction("reject")}
                        disabled={actionLoading}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ThumbsDown className="w-4 h-4" />
                        Reject Application
                      </button>
                    </div>
                  ) : null}

                  {actionLoading && (
                    <div className="text-center py-2">
                      <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin mx-auto" />
                      <p className="text-xs text-slate-400 mt-1">Processing...</p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* ── Sidebar: applicant summary ───────────────────────────────────── */}
          <div className="sticky top-20 self-start">
            <Card className="bg-white border border-gray-200 shadow-none rounded-xl">
              <CardHeader className="pb-3 border-b border-gray-100 px-5 pt-5">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Applicant Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-3 text-xs">
                {/* Passport */}
                {passportUrl && (
                  <div className="flex justify-center mb-2">
                    <div className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
                      <img src={passportUrl} alt="Passport" className="w-full h-full object-cover" />
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Full Name</p>
                  <p className="font-semibold text-slate-700 mt-0.5 capitalize">{form?.full_name || applicant?.name}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Email</p>
                  <p className="font-semibold text-slate-700 mt-0.5 break-all">{form?.email || applicant?.email}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Phone</p>
                  <p className="font-semibold text-slate-700 mt-0.5">{form?.phone_number || applicant?.phone_number || "N/A"}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Form No.</p>
                  <p className="font-mono font-semibold text-slate-700 mt-0.5">{applicant?.form_no || "N/A"}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Programme</p>
                  <p className="font-semibold text-slate-700 mt-0.5">{firstChoiceDisplay}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Session</p>
                  <p className="font-semibold text-slate-700 mt-0.5">{applicant?.session || "N/A"}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Documents</p>
                  <p className="font-semibold text-slate-700 mt-0.5">{documents?.length || 0} file(s)</p>
                </div>
                <div className="pt-1">
                  <Badge className={`${statusColors[status] || "bg-slate-100 text-slate-600 border border-slate-200"} font-medium text-xs py-1 px-3 rounded-full`}>
                    {status.replace(/_/g, " ")}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* ── Recommend Modal ───────────────────────────────────────────────────── */}
      <Dialog open={isRecommendModalOpen} onOpenChange={setIsRecommendModalOpen}>
        <DialogContent className="bg-white border-gray-200 rounded-xl max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-800">Recommend Alternative Programme</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              Select an alternative programme to recommend to this applicant.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Select Course to Recommend
              </label>
              {programmes.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2">Loading available courses...</p>
              ) : (
                <select
                  value={recommendedProg}
                  onChange={(e) => setRecommendedProg(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
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
            <Button variant="outline" onClick={() => setIsRecommendModalOpen(false)} disabled={actionLoading} className="border-gray-200 hover:bg-gray-50 rounded-lg">
              Cancel
            </Button>
            <Button
              onClick={async () => { await handleAction("recommend", { approved_course: recommendedProg }); setIsRecommendModalOpen(false); }}
              disabled={actionLoading || !recommendedProg}
              className="bg-blue-700 hover:bg-blue-800 text-white rounded-lg"
            >
              Confirm Recommendation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Request Docs Modal ────────────────────────────────────────────────── */}
      <Dialog open={isRequestDocModalOpen} onOpenChange={setIsRequestDocModalOpen}>
        <DialogContent className="bg-white border-gray-200 rounded-xl max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-800">Request Documents</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              Select what documents are needed from this applicant.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              {["O'Level Result", "Birth Certificate", "Passport"].map((doc) => {
                const checked = selectedDocs.includes(doc);
                return (
                  <label key={doc} className="flex items-center gap-3 px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer border border-gray-200 transition-colors">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        if (checked) setSelectedDocs(selectedDocs.filter((d) => d !== doc));
                        else setSelectedDocs([...selectedDocs, doc]);
                      }}
                      className="w-4 h-4 rounded text-slate-700 focus:ring-slate-300"
                    />
                    <span className="text-sm font-semibold text-slate-700">{doc}</span>
                  </label>
                );
              })}
            </div>
            <div className="border-t border-gray-100 pt-3">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Add Custom Document</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customDocType}
                  onChange={(e) => setCustomDocType(e.target.value)}
                  placeholder="e.g. LGA Certificate"
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-3.5 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
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
                  className="border-gray-200 hover:bg-gray-50 rounded-lg text-xs font-bold shrink-0 h-10 px-4"
                >
                  Add
                </Button>
              </div>
            </div>
            {selectedDocs.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3 border border-dashed border-gray-200">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Selected to Request</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedDocs.map((doc) => (
                    <span key={doc} className="inline-flex items-center gap-1.5 bg-white border border-gray-200 text-slate-600 font-semibold text-xs px-2.5 py-1 rounded-full">
                      {doc}
                      <button type="button" onClick={() => setSelectedDocs(selectedDocs.filter((d) => d !== doc))} className="text-slate-400 hover:text-slate-700 font-bold">×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2 sm:justify-end border-t border-gray-100 pt-3">
            <Button variant="outline" onClick={() => { setIsRequestDocModalOpen(false); setSelectedDocs([]); }} disabled={actionLoading} className="border-gray-200 hover:bg-gray-50 rounded-lg">
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await handleAction("request_documents", { requested_documents: selectedDocs.join(", ") });
                setIsRequestDocModalOpen(false);
                setSelectedDocs([]);
              }}
              disabled={actionLoading || selectedDocs.length === 0}
              className="bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold"
            >
              Send Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
