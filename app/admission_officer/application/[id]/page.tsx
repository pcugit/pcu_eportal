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
  Download,
  Check,
  X,
  AlertCircle,
  User,
  ArrowRight,
  FileText,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ─── Sub-components defined OUTSIDE the parent to prevent remounting ──────────

function ApplicantInfoTab({
  applicant,
  form,
  passportUrl,
}: {
  applicant: any;
  form: any;
  passportUrl: string | null;
}) {
  const olevelResults = form?.olevel_results || [];

  return (
    <div className="space-y-8 bg-white border border-slate-100 p-8 shadow-sm rounded-[24px]">
      {/* Header with passport */}
      <div className="flex flex-col md:flex-row items-start gap-8 border-b border-slate-100 pb-8">
        <div className="relative w-36 h-36 rounded-2xl overflow-hidden border-2 border-slate-100 shadow-lg bg-slate-50 shrink-0 group">
          {passportUrl ? (
            <img
              src={passportUrl}
              alt="Passport Photo"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
              <User className="w-8 h-8 mb-1" />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                No Photo
              </span>
            </div>
          )}
        </div>
        <div className="space-y-2 flex-1 pt-2">
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
            {form?.full_name || applicant?.name}
          </h2>
          <div className="flex flex-wrap items-center gap-6 text-sm text-slate-500 font-medium">
            <p>
              <strong>Email:</strong> {form?.email || applicant?.email}
            </p>
            <p>
              <strong>Phone:</strong>{" "}
              {form?.phone_number || applicant?.phone_number}
            </p>
            <p>
              <strong>Gender:</strong> {form?.gender || "N/A"}
            </p>
          </div>
          <div className="pt-2">
            <Badge className="bg-[#6b357d] hover:bg-[#6b357d] text-white font-bold rounded-lg px-3 py-1 text-xs">
              {form?.first_choice_program_name || applicant?.program_name}
            </Badge>
          </div>
        </div>
      </div>

      {/* Personal Details */}
      <div className="space-y-4 pt-4">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
          Personal Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { label: "Date of Birth", value: form?.date_of_birth },
            { label: "Place of Birth", value: form?.place_of_birth },
            { label: "Nationality", value: form?.nationality },
            { label: "State of Origin", value: form?.state },
            { label: "LGA", value: form?.lga },
            { label: "Religion", value: form?.religion },
            { label: "Blood Group", value: form?.blood_group },
            { label: "Genotype", value: form?.genotype },
            {
              label: "Contact Address",
              value: form?.address || form?.contact_address,
              colSpan: "md:col-span-2",
            },
          ].map((item, idx) => (
            <div
              key={idx}
              className={`p-4 bg-slate-50/50 border border-slate-100/40 rounded-xl ${item.colSpan || ""}`}
            >
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                {item.label}
              </span>
              <span className="font-bold text-slate-800 text-sm">
                {item.value || "N/A"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Sponsor & Kin info in a beautiful grid of cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
        <div className="space-y-4">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
            Sponsor Information
          </h3>
          <div className="bg-slate-50/30 border border-slate-100/80 rounded-2xl p-5 space-y-4">
            <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-3 last:border-0 last:pb-0">
              <span className="text-slate-400 font-semibold">Name</span>
              <span className="font-bold text-slate-800 capitalize">
                {form?.sponsor_name || "N/A"}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-3 last:border-0 last:pb-0">
              <span className="text-slate-400 font-semibold">Phone</span>
              <span className="font-bold text-slate-800">
                {form?.sponsor_phone_number || "N/A"}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-3 last:border-0 last:pb-0">
              <span className="text-slate-400 font-semibold">Relationship</span>
              <span className="font-bold text-slate-800 capitalize">
                {form?.sponsor_relationship || "N/A"}
              </span>
            </div>
            <div className="flex justify-between items-start text-sm last:border-0 last:pb-0">
              <span className="text-slate-400 font-semibold shrink-0">
                Address
              </span>
              <span className="font-bold text-slate-800 text-right max-w-[200px] leading-snug">
                {form?.sponsor_address || "N/A"}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
            Next of Kin Information
          </h3>
          <div className="bg-slate-50/30 border border-slate-100/80 rounded-2xl p-5 space-y-4">
            <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-3 last:border-0 last:pb-0">
              <span className="text-slate-400 font-semibold">Name</span>
              <span className="font-bold text-slate-800 capitalize">
                {form?.next_of_kin_name || "N/A"}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-3 last:border-0 last:pb-0">
              <span className="text-slate-400 font-semibold">Phone</span>
              <span className="font-bold text-slate-800">
                {form?.next_of_kin_phone_number || "N/A"}
              </span>
            </div>
            <div className="flex justify-between items-start text-sm last:border-0 last:pb-0">
              <span className="text-slate-400 font-semibold shrink-0">
                Address
              </span>
              <span className="font-bold text-slate-800 text-right max-w-[200px] leading-snug">
                {form?.next_of_kin_address || "N/A"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Programme Choices */}
      <div className="space-y-4 pt-4">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
          Programme Choices
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/30 border border-slate-100/80 rounded-2xl p-5">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              First Choice
            </span>
            <p className="font-black text-[#6b357d] text-sm uppercase">
              {form?.first_choice_program_name || "N/A"}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              Second Choice
            </span>
            <p className="font-bold text-slate-600 text-sm uppercase">
              {form?.second_choice_program_name || "N/A"}
            </p>
          </div>
        </div>
      </div>

      {/* O'Level Results */}
      <div className="space-y-4 pt-4">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
          O'Level Results
        </h3>
        {olevelResults.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {olevelResults.map((exam: any, idx: number) => (
              <div
                key={idx}
                className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-md hover:shadow-lg transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
                    <h4 className="font-black text-[#6b357d] uppercase text-sm tracking-tight">
                      {exam.name || "WAEC"} — Sitting {idx + 1}
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 p-3 bg-slate-50 rounded-xl">
                    <div>
                      <span className="block text-[9px] text-slate-400">
                        Reg Number
                      </span>
                      <span className="text-slate-700 font-mono">
                        {exam.number}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-slate-400">
                        Exam Year
                      </span>
                      <span className="text-slate-700">{exam.year}</span>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-50/75 border-b border-slate-100 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          <th className="p-3 font-bold">Subject</th>
                          <th className="p-3 text-right font-bold">Grade</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {exam.subjects
                          ?.filter((s: any) => s.subject)
                          .map((s: any, sIdx: number) => (
                            <tr
                              key={sIdx}
                              className="hover:bg-slate-50/50 transition-colors"
                            >
                              <td className="p-3 text-xs font-bold text-slate-600 uppercase">
                                {s.subject}
                              </td>
                              <td className="p-3 text-right font-black text-slate-800">
                                {s.grade || "-"}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 bg-slate-50 border border-dashed rounded-2xl text-center text-slate-400 font-medium">
            No O'Level results uploaded.
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentsTab({ documents }: { documents: any[] }) {
  const handleDownload = async (doc: any) => {
    try {
      const token = localStorage.getItem("auth_token");
      const baseUrl =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/e-portal/api";
      const res = await fetch(
        `${baseUrl}/applicant/download-document/${doc.document_id || doc.id}`,
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Uploaded Documents</CardTitle>
        <p className="text-sm text-muted-foreground">
          {documents?.length || 0} document(s) uploaded
        </p>
      </CardHeader>
      <CardContent>
        {documents && documents.length > 0 ? (
          <div className="space-y-3">
            {documents.map((doc) => (
              <div
                key={doc.document_id || doc.id}
                className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {doc.original_filename}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                    {(doc.document_type || "").replace(/_/g, " ")}
                    {doc.file_size
                      ? ` · ${(doc.file_size / 1024).toFixed(1)} KB`
                      : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-4 gap-1.5 shrink-0"
                  onClick={() => handleDownload(doc)}
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No documents uploaded
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewsTab({
  application,
  onReviewSuccess,
}: {
  application: ApplicationDetail;
  onReviewSuccess: () => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [decision, setDecision] = useState<"accept" | "reject" | "recommend">(
    "accept",
  );
  const [approvedCourse, setApprovedCourse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);
  const [programs, setPrograms] = useState<
    {
      program_id: number;
      program: string;
      department: string;
      degree: string;
    }[]
  >([]);

  const applicantId = application.applicant.id;
  // admin.py returns prog_type (the program_types.id FK)
  const programTypeId: number | null =
    application.applicant.prog_type ?? application.applicant.program_id ?? null;

  // Fetch all available programs for this applicant's program type
  useEffect(() => {
    if (!programTypeId) return;
    ApiClient.getPrograms(programTypeId)
      .then((res: any) => setPrograms(res.programs || []))
      .catch(() => setPrograms([]));
  }, [programTypeId]);

  // Existing decision already stored on the application row
  const currentDecision = application.applicant.decision as string | undefined;
  const currentApprovedCourse = application.applicant.approved_course as
    | string
    | undefined;
  const decisionDate = application.applicant.decision_date as
    | string
    | undefined;

  const needsCourse = decision === "accept" || decision === "recommend";

  const handleReview = async () => {
    if (needsCourse && !approvedCourse) {
      setError("Please select the approved course before submitting.");
      return;
    }
    setReviewing(true);
    setError(null);
    setReviewSuccess(null);
    try {
      await ApiClient.reviewApplication(
        applicantId,
        decision,
        needsCourse ? approvedCourse : undefined,
      );
      const labels: Record<string, string> = {
        accept: "Accepted",
        reject: "Rejected",
        recommend: "Recommended",
      };
      setReviewSuccess(
        `Application ${labels[decision] || "reviewed"} successfully.`,
      );
      setApprovedCourse("");
      setDecision("accept");
      window.dispatchEvent(new Event("application-reviewed"));
      onReviewSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setReviewing(false);
    }
  };

  const decisionColor = (d: string) =>
    d === "accept"
      ? "border-green-500 text-green-700 bg-green-50"
      : d === "reject"
        ? "border-red-500 text-red-700 bg-red-50"
        : "border-blue-500 text-blue-700 bg-blue-50";

  const decisionLabel = (d: string) =>
    d === "accept" ? "Accepted" : d === "reject" ? "Rejected" : "Recommended";

  const canReview =
    application.applicant.application_status === "submitted" ||
    application.applicant.application_status === "screening";

  return (
    <div className="space-y-6">
      {/* ── Current decision summary ────────────────────────────────────── */}
      {currentDecision && (
        <Card className="border-slate-100 shadow-md bg-white rounded-2xl overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-800">
              Current Decision
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className={decisionColor(currentDecision)}
              >
                {decisionLabel(currentDecision)}
              </Badge>
              {decisionDate && (
                <span className="text-xs text-slate-400 font-medium">
                  on {new Date(decisionDate).toLocaleString()}
                </span>
              )}
            </div>
            {currentApprovedCourse && (
              <div className="text-sm bg-slate-50 p-3 rounded-xl border border-slate-100/50">
                <span className="text-slate-400 font-semibold">
                  Approved Course:{" "}
                </span>
                <span className="font-extrabold text-slate-800">
                  {currentApprovedCourse}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Success banner ──────────────────────────────────────────────── */}
      {reviewSuccess && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="pt-4 flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-600" />
            <p className="text-sm text-emerald-700 font-bold">
              {reviewSuccess}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {error && (
        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="pt-4 flex gap-3">
            <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0" />
            <p className="text-sm text-rose-750 font-medium">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* ── Review form ─────────────────────────────────────────────────── */}
      {canReview && (
        <Card className="border-slate-100 shadow-xl bg-white rounded-3xl overflow-hidden">
          <CardHeader className="border-b border-slate-50 pb-4">
            <CardTitle className="text-lg font-bold text-slate-800">
              Add Review Decision
            </CardTitle>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              Current status:{" "}
              <span className="font-bold text-[#6b357d] uppercase">
                {application.applicant.application_status}
              </span>
            </p>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {/* Decision buttons */}
            <div className="grid grid-cols-3 gap-4">
              {(
                [
                  {
                    value: "accept",
                    label: "Accept",
                    icon: Check,
                    cls: "border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-700 border-emerald-300 ring-emerald-400",
                  },
                  {
                    value: "reject",
                    label: "Reject",
                    icon: X,
                    cls: "border-rose-200 bg-rose-50/50 hover:bg-rose-50 text-rose-700 border-rose-300 ring-rose-400",
                  },
                  {
                    value: "recommend",
                    label: "Recommend",
                    icon: ArrowRight,
                    cls: "border-blue-200 bg-blue-50/50 hover:bg-blue-50 text-blue-700 border-blue-300 ring-blue-400",
                  },
                ] as const
              ).map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={reviewing}
                    onClick={() => {
                      setDecision(opt.value);
                      setApprovedCourse("");
                    }}
                    className={`flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border-2 font-bold text-xs uppercase tracking-wider transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${
                      decision === opt.value
                        ? `${opt.cls} ring-2 ring-offset-2 shadow-md`
                        : "border-slate-100 bg-slate-50/40 text-slate-500 hover:border-slate-200 hover:text-slate-800"
                    }`}
                  >
                    <span className="p-2 rounded-xl bg-white border shadow-sm">
                      <Icon className="w-5 h-5" />
                    </span>
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Accept — choose from applicant's 1st / 2nd choice */}
            {decision === "accept" && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Accepted Course
                </label>
                <Select
                  value={approvedCourse}
                  onValueChange={setApprovedCourse}
                  disabled={reviewing}
                >
                  <SelectTrigger className="h-11 bg-white border-slate-200/80 shadow-sm rounded-xl font-bold">
                    <SelectValue placeholder="Select applicant's 1st or 2nd choice" />
                  </SelectTrigger>
                  <SelectContent className="bg-white/95 backdrop-blur-md rounded-xl border-slate-100 shadow-xl">
                    {application.form?.first_choice_program_name && (
                      <SelectItem
                        value={application.form.first_choice_program_name}
                        className="font-semibold text-slate-600 focus:text-purple-700 focus:bg-purple-50/55 cursor-pointer"
                      >
                        1st Choice —{" "}
                        {application.form.first_choice_program_name}
                      </SelectItem>
                    )}
                    {application.form?.second_choice_program_name && (
                      <SelectItem
                        value={application.form.second_choice_program_name}
                        className="font-semibold text-slate-600 focus:text-purple-700 focus:bg-purple-50/55 cursor-pointer"
                      >
                        2nd Choice —{" "}
                        {application.form.second_choice_program_name}
                      </SelectItem>
                    )}
                    {!application.form?.first_choice_program_name &&
                      !application.form?.second_choice_program_name && (
                        <SelectItem value="__none__" disabled>
                          No choices on record
                        </SelectItem>
                      )}
                  </SelectContent>
                </Select>
                {approvedCourse && (
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest pt-1 px-1">
                    Recorded as:{" "}
                    <span className="text-[#6b357d]">
                      approved &amp; finalised course
                    </span>
                  </p>
                )}
              </div>
            )}

            {/* Recommend — all courses available for this program type */}
            {decision === "recommend" && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Recommended Course
                </label>
                <Select
                  value={approvedCourse}
                  onValueChange={setApprovedCourse}
                  disabled={reviewing}
                >
                  <SelectTrigger className="h-11 bg-white border-slate-200/80 shadow-sm rounded-xl font-bold">
                    <SelectValue
                      placeholder={
                        programs.length ? "Select a course" : "Loading courses…"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 bg-white/95 backdrop-blur-md rounded-xl border-slate-100 shadow-xl">
                    {programs.map((p) => (
                      <SelectItem
                        key={p.program_id}
                        value={p.program}
                        className="font-semibold text-slate-600 focus:text-purple-700 focus:bg-purple-50/55 cursor-pointer"
                      >
                        {p.program}
                        {p.department ? (
                          <span className="text-[10px] text-slate-400 font-medium ml-1">
                            ({p.department})
                          </span>
                        ) : null}
                      </SelectItem>
                    ))}
                    {programs.length === 0 && (
                      <SelectItem value="__none__" disabled>
                        No courses found
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {approvedCourse && (
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest pt-1 px-1">
                    Recorded as:{" "}
                    <span className="text-blue-600">recommended course</span>
                  </p>
                )}
              </div>
            )}

            {/* Submit */}
            <div className="flex justify-end pt-2">
              <Button
                onClick={handleReview}
                disabled={reviewing || (needsCourse && !approvedCourse)}
                className={`gap-2 min-w-[200px] h-12 text-sm font-bold uppercase tracking-wider rounded-xl shadow-lg transition-all duration-300 ${
                  decision === "accept"
                    ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/10 hover:shadow-emerald-500/20"
                    : decision === "reject"
                      ? "bg-rose-600 hover:bg-rose-700 shadow-rose-500/10 hover:shadow-rose-500/20"
                      : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/10 hover:shadow-blue-500/20"
                }`}
              >
                {reviewing ? (
                  <>
                    <span className="animate-spin mr-1">⟳</span> Processing...
                  </>
                ) : decision === "accept" ? (
                  <>
                    <Check className="h-4 w-4" /> Accept Application
                  </>
                ) : decision === "reject" ? (
                  <>
                    <X className="h-4 w-4" /> Reject Application
                  </>
                ) : (
                  <>→ Submit Recommendation</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApplicationDetail {
  applicant: any;
  form: any;
  documents: any[];
  reviews: any[];
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  submitted: "bg-blue-100 text-blue-800",
  screening: "bg-purple-100 text-purple-800",
  admitted: "bg-green-100 text-green-800",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ApplicationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  // Keep applicantId as a string — it's a UUID, not an integer
  const applicantId = (params?.id as string) || "";
  const returnStatus = searchParams.get("status");
  const applicationsHref =
    returnStatus &&
    ["submitted", "screening", "admitted", "rejected"].includes(returnStatus)
      ? `/admission_officer/applications?status=${returnStatus}`
      : "/admission_officer/applications";

  const { user, isAuthenticated, logout } = useAuth();

  const [application, setApplication] = useState<ApplicationDetail | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingLetter, setSendingLetter] = useState(false);
  const [letterSent, setLetterSent] = useState(false);
  const [passportUrl, setPassportUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"info" | "documents" | "reviews">("info");

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "admissionofficer") {
      router.replace("/staff/login");
    }
  }, [isAuthenticated, user, router]);

  // ── Load application data ───────────────────────────────────────────────────
  const loadApplicationDetail = useCallback(async () => {
    if (!applicantId || applicantId === "NaN" || applicantId === "") {
      setError("Invalid application ID.");
      setLoading(false);
      return;
    }
    try {
      const response = await ApiClient.getApplicationDetails(applicantId);
      setApplication(response as ApplicationDetail);
    } catch (err) {
      setError("Failed to load application. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [applicantId]);

  useEffect(() => {
    loadApplicationDetail();
  }, [loadApplicationDetail]);

  useEffect(() => {
    if (!application) return;

    const passportDoc = application.documents?.find(
      (d) =>
        d.document_type?.toLowerCase().includes("passport") ||
        d.original_filename?.toLowerCase().includes("passport"),
    );

    const docId = passportDoc?.document_id || passportDoc?.id;
    if (!docId) return;

    let objectUrl: string | null = null;

    const fetchPassport = async () => {
      try {
        const token = localStorage.getItem("auth_token");
        const baseUrl =
          process.env.NEXT_PUBLIC_API_URL ||
          "http://localhost:5000/e-portal/api";
        const response = await fetch(
          `${baseUrl}/applicant/download-document/${docId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (response.ok) {
          const blob = await response.blob();
          objectUrl = URL.createObjectURL(blob);
          setPassportUrl(objectUrl);
        }
      } catch (e) {
        console.error("Failed to fetch passport", e);
      }
    };

    fetchPassport();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [application?.applicant?.id]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleSendLetter = async () => {
    setSendingLetter(true);
    setError(null);
    try {
      await ApiClient.sendAdmissionLetter(applicantId);
      setLetterSent(true);
      await loadApplicationDetail();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to send admission letter",
      );
    } finally {
      setSendingLetter(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading application...</p>
        </div>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <p className="text-foreground font-semibold mb-2">
              Application Not Found
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              {error ||
                "The application you're looking for could not be found."}
            </p>
            <Link href={applicationsHref}>
              <Button>Go Back</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back link */}
        <Link
          href={applicationsHref}
          className="text-primary hover:underline text-sm mb-4 block"
        >
          ← Back to Applications
        </Link>

        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                {application.applicant.name}
              </h1>
              <p className="text-muted-foreground">
                {application.applicant.email}
              </p>
            </div>
            <Badge
              data-status={application.applicant.application_status}
              className={
                `admission-status-badge ${
                  statusColors[application.applicant.application_status] ||
                  "bg-slate-100 text-slate-700"
                }`
              }
            >
              {application.applicant.application_status.replace(/_/g, " ")}
            </Badge>
          </div>

          {/* Global error */}
          {error && (
            <Card className="mb-6 border-destructive/50 bg-destructive/5">
              <CardContent className="pt-6 flex gap-3">
                <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </CardContent>
            </Card>
          )}

          {/* Tabs */}
          <Tabs
            value={activeTab}
            onValueChange={(value) =>
              setActiveTab(value as "info" | "documents" | "reviews")
            }
            className="mb-8"
          >
            <div className="mb-6 max-w-xl">
              <div className="relative overflow-hidden rounded-2xl border border-[#e5d8c6] bg-[#fffefa] p-1.5 shadow-sm">
                <div className="pointer-events-none absolute inset-y-1.5 left-1.5 w-6 bg-gradient-to-r from-[#fffefa] to-transparent sm:hidden" />
                <div className="pointer-events-none absolute inset-y-1.5 right-1.5 w-6 bg-gradient-to-l from-[#fffefa] to-transparent sm:hidden" />
                <div className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <TabsList className="h-auto min-w-max w-full justify-start gap-1 bg-transparent p-0 text-slate-700 sm:grid sm:grid-cols-3">
                    <TabsTrigger
                      value="info"
                      className="min-w-[124px] rounded-xl px-5 py-2.5 text-sm font-bold text-slate-700 data-[state=active]:bg-[#c99b45] data-[state=active]:text-[#15110a] data-[state=active]:shadow-sm"
                    >
                      Information
                    </TabsTrigger>
                    <TabsTrigger
                      value="documents"
                      className="min-w-[124px] rounded-xl px-5 py-2.5 text-sm font-bold text-slate-700 data-[state=active]:bg-[#c99b45] data-[state=active]:text-[#15110a] data-[state=active]:shadow-sm"
                    >
                      Documents
                    </TabsTrigger>
                    <TabsTrigger
                      value="reviews"
                      className="min-w-[112px] rounded-xl px-5 py-2.5 text-sm font-bold text-slate-700 data-[state=active]:bg-[#c99b45] data-[state=active]:text-[#15110a] data-[state=active]:shadow-sm"
                    >
                      Reviews
                    </TabsTrigger>
                  </TabsList>
                </div>
              </div>
              <div className="mt-2 flex justify-center gap-1.5 sm:hidden" aria-hidden="true">
                {(["info", "documents", "reviews"] as const).map((tab) => (
                  <span
                    key={tab}
                    className={`h-1.5 rounded-full transition-all ${
                      activeTab === tab ? "w-5 bg-[#c99b45]" : "w-1.5 bg-[#d8c9b6]"
                    }`}
                  />
                ))}
              </div>
            </div>

            <TabsContent value="info" className="space-y-6">
              {/* passportUrl lives in parent — never re-fetched on tab switch */}
              <ApplicantInfoTab
                applicant={application.applicant}
                form={application.form}
                passportUrl={passportUrl}
              />
            </TabsContent>

            <TabsContent value="documents">
              <DocumentsTab documents={application.documents} />
            </TabsContent>

            <TabsContent value="reviews">
              <ReviewsTab
                application={application}
                onReviewSuccess={loadApplicationDetail}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
