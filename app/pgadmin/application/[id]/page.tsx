"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  User,
  FileText,
  CheckCircle,
  AlertCircle,
  Save,
  ClipboardCheck,
  Printer,
  Check,
  X,
  ArrowRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApplicationDetail {
  applicant: any;
  form: any;
  documents: any[];
  evaluation: any | null;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border border-amber-200",
  submitted: "bg-blue-50 text-blue-700 border border-blue-200",
  in_progress: "bg-slate-100 text-slate-600 border border-slate-200",
  screening: "bg-violet-50 text-violet-700 border border-violet-200",
  admitted: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  accepted: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border border-rose-200",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoCard({
  label,
  value,
  colSpan = "",
}: {
  label: string;
  value?: string | null;
  colSpan?: string;
}) {
  return (
    <div
      className={`p-3.5 bg-gray-50 border border-gray-200 rounded-lg ${colSpan}`}
    >
      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block mb-1">
        {label}
      </span>
      <span className="font-semibold text-slate-700 text-sm">
        {value || "N/A"}
      </span>
    </div>
  );
}

function ApplicantInfoTab({
  form,
  passportUrl,
  applicant,
}: {
  form: any;
  passportUrl: string | null;
  applicant: any;
}) {
  return (
    <div className="space-y-6 bg-white border border-gray-200 p-6 rounded-xl">
      {/* Header with passport */}
      <div className="flex flex-col md:flex-row items-start gap-6 border-b border-gray-100 pb-6">
        <div className="relative w-28 h-28 rounded-xl overflow-hidden border border-gray-200 bg-gray-100 shrink-0">
          {passportUrl ? (
            <img
              src={passportUrl}
              alt="Passport"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
              <User className="w-7 h-7 mb-1" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">
                No Photo
              </span>
            </div>
          )}
        </div>
        <div className="space-y-1.5 flex-1 pt-1">
          <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight">
            {form?.full_name || applicant?.name}
          </h2>
          <div className="flex flex-wrap gap-4 text-sm text-slate-500">
            <p>
              <strong className="text-slate-700">Email:</strong>{" "}
              {form?.email || applicant?.email}
            </p>
            <p>
              <strong className="text-slate-700">Phone:</strong>{" "}
              {form?.phone_number || applicant?.phone_number}
            </p>
            {form?.secondary_phone_number && (
              <p>
                <strong className="text-slate-700">Alt Phone:</strong>{" "}
                {form.secondary_phone_number}
              </p>
            )}
          </div>
          <div className="pt-1">
            <Badge className="bg-slate-100 text-slate-600 border-slate-200 font-medium rounded-md px-2.5 py-1 text-xs">
              {form?.degree_name && form?.proposed_course_name
                ? `${form.degree_code || form.degree_name} — ${form.proposed_course_name}`
                : form?.proposed_course_name ||
                  applicant?.program_name ||
                  "N/A"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Personal Details */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-gray-100 pb-2">
          Personal Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <InfoCard label="Date of Birth" value={form?.date_of_birth} />
          <InfoCard
            label="Contact Address"
            value={form?.address}
            colSpan="md:col-span-2"
          />
          <InfoCard
            label="Physically Challenged"
            value={
              !form?.physically_challenged ||
              form.physically_challenged === "No"
                ? "No"
                : form.physical_challenge_reason || "Yes"
            }
            colSpan="md:col-span-3"
          />
        </div>
      </div>

      {/* Academic History */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-gray-100 pb-2">
          Academic History
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <InfoCard
            label="Previous Institution"
            value={form?.previous_institution}
            colSpan="md:col-span-2"
          />
          <InfoCard label="Department" value={form?.department} />
          <InfoCard
            label="Course of Study"
            value={form?.previous_course}
            colSpan="md:col-span-2"
          />
          <InfoCard label="Class of Degree" value={form?.class_of_degree} />
        </div>
      </div>

      {/* Proposed Study */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-gray-100 pb-2">
          Proposed Study
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <InfoCard
            label="Degree in View"
            value={
              form?.degree_name
                ? `${form.degree_name}${form.degree_code ? ` (${form.degree_code})` : ""}`
                : undefined
            }
          />
          <InfoCard
            label="Proposed Course"
            value={form?.proposed_course_name}
            colSpan="md:col-span-2"
          />
          <InfoCard
            label="Faculty / Institute"
            value={form?.proposed_faculty_name}
            colSpan="md:col-span-2"
          />
          <InfoCard label="Mode of Study" value={form?.mode_of_study} />
          {form?.area_of_specialisation && (
            <InfoCard
              label="Area of Specialisation"
              value={form.area_of_specialisation}
              colSpan="md:col-span-3"
            />
          )}
          {form?.proposed_research_title && (
            <InfoCard
              label="Research Title"
              value={form.proposed_research_title}
              colSpan="md:col-span-3"
            />
          )}
        </div>
      </div>

      {/* Referees */}
      {(form?.referee_name1 || form?.referee_name2 || form?.referee_name3) && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-gray-100 pb-2">
            Referees
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                label: "Referee 1",
                name: form?.referee_name1,
                address: form?.referee_address1,
              },
              {
                label: "Referee 2",
                name: form?.referee_name2,
                address: form?.referee_address2,
              },
              {
                label: "Referee 3",
                name: form?.referee_name3,
                address: form?.referee_address3,
              },
            ]
              .filter((r) => r.name)
              .map((ref, idx) => (
                <div
                  key={idx}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2"
                >
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {ref.label}
                  </p>
                  <div className="flex justify-between text-sm border-b border-gray-100 pb-2">
                    <span className="text-slate-400 font-medium shrink-0">
                      Name
                    </span>
                    <span className="font-semibold text-slate-700 text-right max-w-[180px] leading-snug">
                      {ref.name}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400 font-medium shrink-0">
                      Address
                    </span>
                    <span className="font-medium text-slate-600 text-right max-w-[180px] leading-snug">
                      {ref.address || "N/A"}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Sponsor & Next of Kin */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-gray-100 pb-2">
            Sponsor
          </h3>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
            {[
              { label: "Name", value: form?.sponsor_name },
              { label: "Address", value: form?.sponsor_address },
            ].map((item, idx) => (
              <div
                key={idx}
                className="flex justify-between text-sm border-b border-gray-100 pb-2 last:border-0 last:pb-0"
              >
                <span className="text-slate-400 font-medium">{item.label}</span>
                <span className="font-semibold text-slate-700 text-right max-w-[180px]">
                  {item.value || "N/A"}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-gray-100 pb-2">
            Next of Kin
          </h3>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
            {[
              { label: "Name", value: form?.next_of_kin_name },
              { label: "Phone", value: form?.next_of_kin_phone_number },
              { label: "Address", value: form?.next_of_kin_address },
            ].map((item, idx) => (
              <div
                key={idx}
                className="flex justify-between text-sm border-b border-gray-100 pb-2 last:border-0 last:pb-0"
              >
                <span className="text-slate-400 font-medium shrink-0">
                  {item.label}
                </span>
                <span className="font-semibold text-slate-700 text-right max-w-[180px]">
                  {item.value || "N/A"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Applicant Signature */}
      {form?.document_signature && (
        <div className="space-y-2 border-t border-gray-100 pt-5">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Applicant's Signature
          </h3>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 inline-block">
            <img
              src={
                form.document_signature.startsWith("data:")
                  ? form.document_signature
                  : `data:image/png;base64,${form.document_signature}`
              }
              alt="Applicant Signature"
              className="h-14 max-w-[220px] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentsTab({
  documents,
  applicationId,
  applicantName,
}: {
  documents: any[];
  applicationId: string;
  applicantName: string;
}) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async (doc: any) => {
    try {
      const token = localStorage.getItem("auth_token");
      const baseUrl =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/e-portal/api";
      const res = await fetch(
        `${baseUrl}/applicant/download-document/${doc.id || doc.document_id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
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

  const handleDownloadAll = async () => {
    if (documents.length === 0) return;
    setDownloading(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const sanitizedName = applicantName.replace(/[^a-z0-9_\-]/gi, "_");
      const folder = zip.folder(sanitizedName);

      if (!folder) throw new Error("Failed to create zip folder");

      for (const doc of documents) {
        try {
          const token = localStorage.getItem("auth_token");
          const baseUrl =
            process.env.NEXT_PUBLIC_API_URL ||
            "http://localhost:5000/e-portal/api";
          const res = await fetch(
            `${baseUrl}/applicant/download-document/${doc.id || doc.document_id}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (res.ok) {
            const blob = await res.blob();
            folder.file(
              doc.original_filename || `document_${doc.id || doc.document_id}`,
              blob,
            );
          }
        } catch (err) {
          console.error(
            `Failed to download document ${doc.original_filename}:`,
            err,
          );
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

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <p className="font-semibold text-slate-700 text-sm">
            Uploaded Documents
          </p>
          <p className="text-slate-400 text-xs mt-0.5">
            {documents.length} document(s)
          </p>
        </div>
        {documents.length > 0 && (
          <Button
            onClick={handleDownloadAll}
            disabled={downloading}
            size="sm"
            className="gap-2"
          >
            {downloading ? (
              <>
                <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                Download All
              </>
            )}
          </Button>
        )}
      </div>
      <div className="p-4">
        {documents.length > 0 ? (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id || doc.document_id}
                className="flex items-center justify-between p-3.5 bg-gray-50 border border-gray-200 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-700 text-sm truncate">
                    {doc.original_filename}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 capitalize">
                    {(doc.document_type || "").replace(/_/g, " ")}
                    {doc.file_size
                      ? ` · ${(doc.file_size / 1024).toFixed(1)} KB`
                      : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleDownload(doc)}
                  className="ml-3 gap-1.5 shrink-0 bg-slate-100 hover:bg-slate-200 text-slate-700 border-0 shadow-none"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 text-center py-8">
            No documents uploaded.
          </p>
        )}
      </div>
    </div>
  );
}

function SectionBTab({
  application,
  onSaveSuccess,
}: {
  application: ApplicationDetail;
  onSaveSuccess: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [transcriptReceived, setTranscriptReceived] = useState("No");
  const [transcriptComment, setTranscriptComment] = useState("");
  const [refLettersCount, setRefLettersCount] = useState(0);
  const [recommendation, setRecommendation] = useState("");
  const [supervisorName, setSupervisorName] = useState("");

  const evaluation = application.evaluation;

  useEffect(() => {
    if (evaluation) {
      setTranscriptReceived(evaluation.transcript_received || "No");
      setTranscriptComment(evaluation.transcript_comment || "");
      setRefLettersCount(evaluation.ref_letters_count || 0);
      setRecommendation(evaluation.recommendation || "");
      setSupervisorName(evaluation.supervisor_name || "");
    }
  }, [evaluation]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await ApiClient.savePgEvaluation(application.applicant.id, {
        transcript_received: transcriptReceived,
        transcript_comment: transcriptComment,
        ref_letters_count: refLettersCount,
        recommendation,
        supervisor_name: supervisorName,
      });
      setSaveSuccess(true);
      onSaveSuccess();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save evaluation",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Existing evaluation summary */}
      {evaluation && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-emerald-700 font-semibold text-sm">
              Evaluation previously completed
            </p>
            <p className="text-emerald-600/70 text-xs mt-0.5">
              By {evaluation.dean_name || "Dean"} on{" "}
              {evaluation.updated_at
                ? new Date(evaluation.updated_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "—"}
            </p>
          </div>
        </div>
      )}

      {saveSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-emerald-600" />
          <p className="text-emerald-700 font-semibold text-sm">
            Evaluation saved.
          </p>
        </div>
      )}

      {saveError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex gap-3">
          <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
          <p className="text-rose-600 text-sm font-medium">{saveError}</p>
        </div>
      )}

      {/* Section B Form */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-slate-800">
            SECTION B: EVALUATION AND RECOMMENDATION
          </h3>
          <p className="text-slate-400 text-xs mt-0.5 italic">
            (To be completed by the Dean)
          </p>
        </div>
        <div className="p-5 space-y-6">
          {/* 1. Transcript Received */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold shrink-0">
                1
              </span>
              Transcript Received
            </label>
            <div className="flex gap-2 flex-wrap">
              {["Yes", "No"].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setTranscriptReceived(opt)}
                  className={`px-5 py-2 rounded-lg font-semibold text-sm border transition-all ${
                    transcriptReceived === opt
                      ? opt === "Yes"
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-rose-600 text-white border-rose-600"
                      : "bg-white text-slate-500 border-gray-200 hover:border-slate-300"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Comment
              </label>
              <input
                type="text"
                value={transcriptComment}
                onChange={(e) => setTranscriptComment(e.target.value)}
                placeholder="Add comment about transcript..."
                className="w-full bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all"
              />
            </div>
          </div>

          {/* 2. Reference Letters */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold shrink-0">
                2
              </span>
              Number of Reference Letters Received
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setRefLettersCount(Math.max(0, refLettersCount - 1))
                }
                className="w-9 h-9 rounded-lg bg-gray-100 border border-gray-200 text-slate-600 hover:bg-gray-200 font-bold text-base transition-all"
              >
                −
              </button>
              <input
                type="number"
                min={0}
                max={10}
                value={refLettersCount}
                onChange={(e) =>
                  setRefLettersCount(parseInt(e.target.value) || 0)
                }
                className="w-16 text-center bg-white border border-gray-200 rounded-lg px-2 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
              <button
                type="button"
                onClick={() =>
                  setRefLettersCount(Math.min(10, refLettersCount + 1))
                }
                className="w-9 h-9 rounded-lg bg-gray-100 border border-gray-200 text-slate-600 hover:bg-gray-200 font-bold text-base transition-all"
              >
                +
              </button>
              <span className="text-slate-400 text-sm">letter(s)</span>
            </div>
          </div>

          {/* 3. Recommendation */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold shrink-0">
                3
              </span>
              Recommendation
            </label>
            <textarea
              rows={4}
              value={recommendation}
              onChange={(e) => setRecommendation(e.target.value)}
              placeholder="Enter your recommendation for this applicant..."
              className="w-full bg-white border border-gray-200 rounded-lg px-3.5 py-3 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none transition-all"
            />
          </div>

          {/* 4. Supervisor */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold shrink-0">
                4
              </span>
              Name of Supervisor
            </label>
            <input
              type="text"
              value={supervisorName}
              onChange={(e) => setSupervisorName(e.target.value)}
              placeholder="Enter proposed supervisor's full name..."
              className="w-full bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all"
            />
          </div>

          {/* 5. Dean's Signature */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold shrink-0">
                5
              </span>
              Dean's Signature and Date
            </label>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-4">
              {evaluation?.dean_name ? (
                <div className="space-y-0.5">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                    Signed by
                  </p>
                  <p className="font-semibold text-slate-700 text-sm">
                    {evaluation.dean_name}
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                    Will be signed as
                  </p>
                  <p className="font-semibold text-slate-700 text-sm">
                    Dean of Postgraduate School
                  </p>
                </div>
              )}
              <div className="sm:ml-auto space-y-0.5">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                  Date
                </p>
                <p className="font-semibold text-slate-700 text-sm">
                  {evaluation?.updated_at
                    ? new Date(evaluation.updated_at).toLocaleDateString(
                        "en-GB",
                        { day: "numeric", month: "long", year: "numeric" },
                      )
                    : new Date().toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                </p>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end pt-1">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-2 min-w-[180px] h-10 text-sm font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              {saving ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {evaluation ? "Update" : "Submit Evaluation"}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewTab({
  application,
  onReviewSuccess,
}: {
  application: ApplicationDetail;
  onReviewSuccess: () => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [decision, setDecision] = useState<
    "accept" | "reject" | "recommend" | ""
  >("");
  const [approvedCourse, setApprovedCourse] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState(false);
  const [pgPrograms, setPgPrograms] = useState<any[]>([]);

  const currentDecision = application?.applicant?.decision;
  const proposedCourse = application?.form?.proposed_course_name;
  const applicationStatus = application?.applicant?.application_status;
  const applicantRecommendedCourse =
    application?.applicant?.applicant_recommended_course;
  const isRecommendationFollowUp =
    applicationStatus === "accepted_recommendation" ||
    applicationStatus === "applicant_recommended";
  const acceptedRecommendedCourse =
    applicationStatus === "accepted_recommendation"
      ? application?.applicant?.approved_course
      : null;
  const finalAcceptCourse =
    applicantRecommendedCourse || acceptedRecommendedCourse || proposedCourse;
  const reviewedCourse =
    currentDecision === "accept"
      ? application?.applicant?.finalised_course ||
        application?.applicant?.approved_course ||
        application?.applicant?.program_name
      : application?.applicant?.approved_course ||
        application?.applicant?.program_name;
  const getProgramLabel = (program: any) =>
    program.full_name ||
    program.program_name ||
    program.program ||
    program.name ||
    program.title ||
    "";

  // Fetch PG programs for recommendation
  useEffect(() => {
    const fetchPgPrograms = async () => {
      try {
        const programs = await ApiClient.getPgPrograms();
        setPgPrograms(programs || []);
      } catch (err) {
        console.error("Failed to fetch PG programs:", err);
      }
    };
    fetchPgPrograms();
  }, []);

  const handleReview = async () => {
    if (!decision) {
      setError("Please select a decision");
      return;
    }

    const selectedCourse =
      decision === "accept" ? finalAcceptCourse : approvedCourse;
    const needsCourse = decision === "accept" || decision === "recommend";
    if (needsCourse && !selectedCourse) {
      setError("Please select a course for this decision");
      return;
    }

    setReviewing(true);
    setError(null);
    setReviewSuccess(false);

    try {
      await ApiClient.pgReviewApplication(
        application.applicant.id,
        decision,
        selectedCourse || undefined,
      );
      setReviewSuccess(true);
      setTimeout(() => onReviewSuccess(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setReviewing(false);
    }
  };

  const canReview =
    (applicationStatus === "screening" && !currentDecision) ||
    isRecommendationFollowUp;

  const getDecisionBadge = (decisionValue: string) => {
    const badges: {
      [key: string]: { color: string; icon: any; label: string };
    } = {
      accept: {
        color: "bg-emerald-50 text-emerald-700",
        icon: Check,
        label: "Accepted",
      },
      reject: { color: "bg-red-50 text-red-700", icon: X, label: "Rejected" },
      recommend: {
        color: "bg-blue-50 text-blue-700",
        icon: ArrowRight,
        label: "Recommended",
      },
    };
    const badge = badges[decisionValue];
    const Icon = badge?.icon;
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${badge?.color}`}
      >
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {badge?.label}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Current decision summary */}
      {currentDecision && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
          <p className="text-sm font-semibold text-slate-600 uppercase tracking-wider">
            Current Decision
          </p>
          <div className="flex items-center justify-between">
            <div>
              {getDecisionBadge(currentDecision)}
              {(currentDecision === "accept" ||
                currentDecision === "recommend") && (
                <p className="text-sm text-slate-600 mt-2.5">
                  {currentDecision === "accept" ? "Approved Course" : "Course"}:{" "}
                  <span className="font-semibold">
                    {reviewedCourse || "—"}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {reviewSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-emerald-700 font-semibold text-sm">
              Decision submitted successfully!
            </p>
            <p className="text-emerald-600/70 text-xs mt-0.5">
              The applicant has been notified of the review decision.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-700 font-semibold text-sm">Error</p>
            <p className="text-red-600/70 text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Review form */}
      {canReview && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-700">
            Decision on {application.form?.full_name}
          </p>

          {/* Decision buttons */}
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                value: "accept",
                label: "Accept",
                icon: Check,
                color:
                  decision === "accept"
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-100 text-slate-600 hover:bg-gray-200",
              },
              {
                value: "recommend",
                label: "Recommend",
                icon: ArrowRight,
                color:
                  decision === "recommend"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-slate-600 hover:bg-gray-200",
              },
              {
                value: "reject",
                label: "Reject",
                icon: X,
                color:
                  decision === "reject"
                    ? "bg-red-600 text-white"
                    : "bg-gray-100 text-slate-600 hover:bg-gray-200",
              },
            ]
              .filter(({ value }) => !isRecommendationFollowUp || value !== "recommend")
              .map(({ value, label, icon: Icon, color }) => (
              <Button
                key={value}
                onClick={() => {
                  setDecision(value as "accept" | "reject" | "recommend");
                  setApprovedCourse("");
                }}
                className={`gap-1.5 h-10 font-semibold text-sm rounded-lg transition-colors ${color}`}
                variant="ghost"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Button>
            ))}
          </div>

          {/* Course selection */}
          {(decision === "accept" || decision === "recommend") && (
            <div className="space-y-2.5">
              <label className="text-sm font-semibold text-slate-700">
                {decision === "accept"
                  ? "Approved Course"
                  : "Recommended Course"}
              </label>
              {decision === "accept" ? (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
                  <p className="text-slate-600 font-semibold">
                    {finalAcceptCourse}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {applicantRecommendedCourse
                      ? "Applicant's recommended course"
                      : acceptedRecommendedCourse
                        ? "Applicant accepted the recommended course"
                        : "Applicant's proposed course"}
                  </p>
                </div>
              ) : (
                <Select
                  value={approvedCourse}
                  onValueChange={setApprovedCourse}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a program to recommend" />
                  </SelectTrigger>
                  <SelectContent>
                    {pgPrograms
                      .map((prog) => ({
                        id: prog.id,
                        label: getProgramLabel(prog),
                      }))
                      .filter((prog) => prog.label)
                      .map((prog) => (
                        <SelectItem key={prog.id} value={prog.label}>
                          {prog.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Submit button */}
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleReview}
              disabled={reviewing || !decision}
              className="gap-2 min-w-[140px] h-10 text-sm font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              {reviewing ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Submit Review
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {!canReview && !currentDecision && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-yellow-700 font-semibold text-sm">
              Review not available
            </p>
            <p className="text-yellow-600/70 text-xs mt-0.5">
              This application is not in "Screening" status.
            </p>
          </div>
        </div>
      )}

      {currentDecision && !canReview && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-blue-700 font-semibold text-sm">
              Decision already made
            </p>
            <p className="text-blue-600/70 text-xs mt-0.5">
              This application has already been reviewed.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PgApplicationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const applicationId = (params?.id as string) || "";

  const { user, isAuthenticated } = useAuth();
  const [application, setApplication] = useState<ApplicationDetail | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [passportUrl, setPassportUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "pgadmin") {
      router.replace("/staff/login");
    }
  }, [isAuthenticated, user, router]);

  const loadDetail = useCallback(async () => {
    if (!applicationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await ApiClient.getPgApplicationDetails(applicationId);
      setApplication(res);

      const passportDoc = res.documents?.find(
        (d: any) =>
          d.document_type?.toLowerCase().includes("passport") ||
          d.original_filename?.toLowerCase().includes("passport"),
      );
      const docId = passportDoc?.document_id || passportDoc?.id;
      if (docId) {
        try {
          const token = localStorage.getItem("auth_token");
          const baseUrl =
            process.env.NEXT_PUBLIC_API_URL ||
            "http://localhost:5000/e-portal/api";
          const photoRes = await fetch(
            `${baseUrl}/applicant/download-document/${docId}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (photoRes.ok) {
            const blob = await photoRes.blob();
            setPassportUrl(URL.createObjectURL(blob));
          }
        } catch {
          /* no passport */
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load application",
      );
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handlePrint = async () => {
    setDownloading(true);
    try {
      const token = localStorage.getItem("auth_token");
      const baseUrl =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/e-portal/api";
      const res = await fetch(
        `${baseUrl}/pgadmin/print-application/${applicationId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) throw new Error("Failed to generate printout");
      const contentType = res.headers.get("content-type") || "";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (contentType.includes("text/html")) {
        window.open(url, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `pg_application_${application?.applicant?.form_no || applicationId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Print error:", err);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Loading application...</p>
        </div>
      </div>
    );
  }

  if (error || !application) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
          <p className="text-slate-700 font-bold text-base mb-1">
            Application Not Found
          </p>
          <p className="text-slate-400 text-sm mb-4">{error}</p>
          <Link
            href="/pgadmin/applications"
            className="text-slate-500 hover:text-slate-700 font-semibold transition-colors text-sm"
          >
            ← Back to Applications
          </Link>
        </div>
      </div>
    );
  }

  const { applicant, form, documents, evaluation } = application;
  const appStatus = applicant?.application_status || "submitted";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-8">
        {/* Breadcrumb + Print */}
        <div className="flex items-center justify-between mb-5">
          <Link
            href="/pgadmin/applications"
            className="text-slate-400 hover:text-slate-600 text-sm transition-colors"
          >
            ← Back to Applications
          </Link>
          <Button
            onClick={handlePrint}
            disabled={downloading}
            className="flex items-center gap-2 bg-white hover:bg-gray-50 text-slate-700 border border-gray-200 rounded-lg font-medium text-sm h-9 px-4 shadow-none transition-colors"
          >
            {downloading ? (
              <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            Print / Download
          </Button>
        </div>

        {/* Application header card */}
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-slate-800 uppercase tracking-tight">
                {form?.full_name || applicant?.name}
              </h1>
              <Badge
                className={`${statusColors[appStatus] || "bg-gray-100 text-gray-600"} font-medium text-[10px] uppercase tracking-wide py-0.5 px-2 rounded-md`}
              >
                {appStatus.replace("_", " ")}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-slate-500">
              <span>
                Form No:{" "}
                <strong className="text-slate-700 font-mono">
                  {applicant?.form_no || "N/A"}
                </strong>
              </span>
              <span>
                Session:{" "}
                <strong className="text-slate-700">
                  {applicant?.session || "N/A"}
                </strong>
              </span>
              <span>
                Programme:{" "}
                <strong className="text-slate-700">
                  {form?.proposed_course_name ||
                    applicant?.program_name ||
                    "N/A"}
                </strong>
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="info">
          <TabsList className="bg-white border border-gray-200 rounded-lg p-1 mb-5 gap-1">
            {[
              { value: "info", label: "Applicant Info", icon: User },
              { value: "documents", label: "Documents", icon: FileText },
              {
                value: "evaluation",
                label: "Evaluation",
                icon: ClipboardCheck,
              },
              { value: "review", label: "Review", icon: CheckCircle },
            ].map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex items-center gap-1.5 rounded-md font-medium text-sm text-slate-500 data-[state=active]:bg-slate-800 data-[state=active]:text-white px-4 py-2 transition-all"
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="info">
            <ApplicantInfoTab
              form={form}
              passportUrl={passportUrl}
              applicant={applicant}
            />
          </TabsContent>

          <TabsContent value="documents">
            <DocumentsTab
              documents={documents}
              applicationId={applicationId}
              applicantName={form?.full_name || applicant?.name || "Applicant"}
            />
          </TabsContent>

          <TabsContent value="evaluation">
            <SectionBTab application={application} onSaveSuccess={loadDetail} />
          </TabsContent>

          <TabsContent value="review">
            <ReviewTab application={application} onReviewSuccess={loadDetail} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
