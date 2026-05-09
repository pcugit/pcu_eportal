"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, Check, X, AlertCircle } from "lucide-react";
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
    <div className="space-y-8 bg-white border border-slate-100 p-8 shadow-sm rounded-lg">
      {/* Header with passport */}
      <div className="flex flex-col md:flex-row items-start gap-8 border-b border-slate-100 pb-8">
        <div className="relative w-32 h-32 rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50 shrink-0">
          {passportUrl ? (
            <img
              src={passportUrl}
              alt="Passport"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-slate-400 text-sm">No Photo</span>
            </div>
          )}
        </div>
        <div className="space-y-2 flex-1">
          <h2 className="text-2xl font-bold text-slate-800 uppercase">
            {form?.full_name || applicant?.name}
          </h2>
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
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
            <Badge className="bg-[#6b357d] text-white">
              {form?.first_choice_program_name || applicant?.program_name}
            </Badge>
          </div>
        </div>
      </div>

      {/* Personal Details */}
      <div className="space-y-6">
        <h3 className="text-lg font-medium text-slate-700 border-b border-slate-100 pb-2">
          Personal Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <p className="text-sm">
            <span className="text-slate-500 block">Date of Birth</span>
            {form?.date_of_birth || "N/A"}
          </p>
          <p className="text-sm">
            <span className="text-slate-500 block">Place of Birth</span>
            {form?.place_of_birth || "N/A"}
          </p>
          <p className="text-sm">
            <span className="text-slate-500 block">Nationality</span>
            {form?.nationality || "N/A"}
          </p>
          <p className="text-sm">
            <span className="text-slate-500 block">State of Origin</span>
            {form?.state || "N/A"}
          </p>
          <p className="text-sm">
            <span className="text-slate-500 block">LGA</span>
            {form?.lga || "N/A"}
          </p>
          <p className="text-sm">
            <span className="text-slate-500 block">Religion</span>
            {form?.religion || "N/A"}
          </p>
          <p className="text-sm">
            <span className="text-slate-500 block">Blood Group</span>
            {form?.blood_group || "N/A"}
          </p>
          <p className="text-sm">
            <span className="text-slate-500 block">Genotype</span>
            {form?.genotype || "N/A"}
          </p>
          <p className="text-sm md:col-span-2">
            <span className="text-slate-500 block">Address</span>
            {form?.address || form?.contact_address || "N/A"}
          </p>
        </div>
      </div>

      {/* Sponsor */}
      <div className="space-y-6">
        <h3 className="text-lg font-medium text-slate-700 border-b border-slate-100 pb-2">
          Sponsor Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <p className="text-sm">
            <span className="text-slate-500 block">Name</span>
            {form?.sponsor_name || "N/A"}
          </p>
          <p className="text-sm">
            <span className="text-slate-500 block">Phone</span>
            {form?.sponsor_phone_number || "N/A"}
          </p>
          <p className="text-sm">
            <span className="text-slate-500 block">Relationship</span>
            {form?.sponsor_relationship || "N/A"}
          </p>
          <p className="text-sm md:col-span-2">
            <span className="text-slate-500 block">Address</span>
            {form?.sponsor_address || "N/A"}
          </p>
        </div>
      </div>

      {/* Next of Kin */}
      <div className="space-y-6">
        <h3 className="text-lg font-medium text-slate-700 border-b border-slate-100 pb-2">
          Next of Kin Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <p className="text-sm">
            <span className="text-slate-500 block">Name</span>
            {form?.next_of_kin_name || "N/A"}
          </p>
          <p className="text-sm">
            <span className="text-slate-500 block">Phone</span>
            {form?.next_of_kin_phone_number || "N/A"}
          </p>
          <p className="text-sm">
            <span className="text-slate-500 block">Address</span>
            {form?.next_of_kin_address || "N/A"}
          </p>
        </div>
      </div>

      {/* Programme Choices */}
      <div className="space-y-6">
        <h3 className="text-lg font-medium text-slate-700 border-b border-slate-100 pb-2">
          Programme Choices
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <p className="text-sm">
            <span className="text-slate-500 block">First Choice</span>
            {form?.first_choice_program_name || "N/A"}
          </p>
          <p className="text-sm">
            <span className="text-slate-500 block">Second Choice</span>
            {form?.second_choice_program_name || "N/A"}
          </p>
        </div>
      </div>

      {/* O'Level Results */}
      <div className="space-y-6">
        <h3 className="text-lg font-medium text-slate-700 border-b border-slate-100 pb-2">
          O'Level Results
        </h3>
        {olevelResults.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {olevelResults.map((exam: any, idx: number) => (
              <div
                key={idx}
                className="bg-slate-50 border border-slate-200 p-4 rounded-lg"
              >
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-bold text-[#6b357d]">
                    {exam.name || "WAEC"} — Sitting {idx + 1}
                  </h4>
                </div>
                <div className="text-xs text-slate-600 mb-3 space-y-1">
                  <p>
                    <strong>Reg Number:</strong> {exam.number}
                  </p>
                  <p>
                    <strong>Exam Year:</strong> {exam.year}
                  </p>
                </div>
                <table className="w-full text-left text-sm border-collapse">
                  <tbody>
                    {exam.subjects
                      ?.filter((s: any) => s.subject)
                      .map((s: any, sIdx: number) => (
                        <tr
                          key={sIdx}
                          className="border-b border-slate-200 last:border-0"
                        >
                          <td className="py-2 text-slate-700 uppercase">
                            {s.subject}
                          </td>
                          <td className="py-2 text-right font-bold">
                            {s.grade || "-"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 italic">
            No O'Level results uploaded.
          </p>
        )}
      </div>
    </div>
  );
}

function DocumentsTab({
  documents,
}: {
  documents: any[];
}) {
  const handleDownload = async (doc: any) => {
    try {
      const token = localStorage.getItem("auth_token");
      const baseUrl =
        process.env.NEXT_PUBLIC_API_URL ||
        "http://localhost:5000/e-portal/api";
      const res = await fetch(
        `${baseUrl}/applicant/download-document/${doc.document_id || doc.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
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
                  <p className="font-medium truncate">{doc.original_filename}</p>
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
  const [decision, setDecision] = useState<"accept" | "reject" | "recommend">("accept");
  const [approvedCourse, setApprovedCourse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);

  const applicantId = application.applicant.id;
  const firstChoice  = application.form?.first_choice_program_name  as string | undefined;
  const secondChoice = application.form?.second_choice_program_name as string | undefined;

  // Existing decision already stored on the application row
  const currentDecision     = application.applicant.decision      as string | undefined;
  const currentApprovedCourse = application.applicant.approved_course as string | undefined;
  const decisionDate        = application.applicant.decision_date  as string | undefined;

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
        needsCourse ? approvedCourse : undefined
      );
      const labels: Record<string, string> = {
        accept:    "Accepted",
        reject:    "Rejected",
        recommend: "Recommended",
      };
      setReviewSuccess(`Application ${labels[decision] || "reviewed"} successfully.`);
      setApprovedCourse("");
      setDecision("accept");
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
        <Card>
          <CardHeader>
            <CardTitle>Current Decision</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className={decisionColor(currentDecision)}>
                {decisionLabel(currentDecision)}
              </Badge>
              {decisionDate && (
                <span className="text-xs text-muted-foreground">
                  on {new Date(decisionDate).toLocaleString()}
                </span>
              )}
            </div>
            {currentApprovedCourse && (
              <div className="text-sm">
                <span className="text-slate-500">Approved Course: </span>
                <span className="font-semibold text-slate-800">{currentApprovedCourse}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Success banner ──────────────────────────────────────────────── */}
      {reviewSuccess && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4 flex items-center gap-2">
            <Check className="h-4 w-4 text-green-600" />
            <p className="text-sm text-green-700 font-medium">{reviewSuccess}</p>
          </CardContent>
        </Card>
      )}

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4 flex gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* ── Review form ─────────────────────────────────────────────────── */}
      {canReview && (
        <Card>
          <CardHeader>
            <CardTitle>Add Review Decision</CardTitle>
            <p className="text-sm text-muted-foreground">
              Current status:{" "}
              <span className="font-medium capitalize">
                {application.applicant.application_status}
              </span>
            </p>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Decision buttons */}
            <div className="grid grid-cols-3 gap-3">
              {([
                { value: "accept",    label: "Accept",    icon: "✓", cls: "border-green-300 bg-green-50 text-green-800 ring-green-400" },
                { value: "reject",    label: "Reject",    icon: "✗", cls: "border-red-300 bg-red-50 text-red-800 ring-red-400" },
                { value: "recommend", label: "Recommend", icon: "→", cls: "border-blue-300 bg-blue-50 text-blue-800 ring-blue-400" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={reviewing}
                  onClick={() => { setDecision(opt.value); setApprovedCourse(""); }}
                  className={`flex flex-col items-center gap-1 p-4 rounded-lg border-2 font-semibold text-sm transition-all ${
                    decision === opt.value
                      ? `${opt.cls} ring-2 ring-offset-1 shadow-sm`
                      : "border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
                >
                  <span className="text-xl">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Approved course selector (accept / recommend) */}
            {needsCourse && (
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  {decision === "accept" ? "Accepted Course" : "Recommended Course"}
                </label>
                <Select
                  value={approvedCourse}
                  onValueChange={setApprovedCourse}
                  disabled={reviewing}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select first or second choice course" />
                  </SelectTrigger>
                  <SelectContent>
                    {firstChoice && (
                      <SelectItem value={firstChoice}>
                        1st Choice — {firstChoice}
                      </SelectItem>
                    )}
                    {secondChoice && (
                      <SelectItem value={secondChoice}>
                        2nd Choice — {secondChoice}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {approvedCourse && (
                  <p className="text-xs text-slate-500 pt-0.5">
                    This will be recorded as the <strong>approved_course</strong> and <strong>finalised_course</strong>.
                  </p>
                )}
              </div>
            )}

            {/* Submit */}
            <div className="flex justify-end">
              <Button
                onClick={handleReview}
                disabled={reviewing || (needsCourse && !approvedCourse)}
                className={`gap-2 min-w-[180px] ${
                  decision === "accept"
                    ? "bg-green-600 hover:bg-green-700"
                    : decision === "reject"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {reviewing ? (
                  <><span className="animate-spin mr-1">⟳</span> Processing...</>
                ) : decision === "accept" ? (
                  <><Check className="h-4 w-4" /> Accept Application</>
                ) : decision === "reject" ? (
                  <><X className="h-4 w-4" /> Reject Application</>
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

  // Keep applicantId as a string — it's a UUID, not an integer
  const applicantId = (params?.id as string) || "";

  const { user, isAuthenticated, logout } = useAuth();

  const [application, setApplication] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingLetter, setSendingLetter] = useState(false);
  const [letterSent, setLetterSent] = useState(false);
  const [passportUrl, setPassportUrl] = useState<string | null>(null);

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
        d.original_filename?.toLowerCase().includes("passport")
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
          { headers: { Authorization: `Bearer ${token}` } }
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
        err instanceof Error ? err.message : "Failed to send admission letter"
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
              {error || "The application you're looking for could not be found."}
            </p>
            <Link href="/admission_officer/applications">
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
          href="/admission_officer/applications"
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
              className={
                statusColors[application.applicant.application_status] ||
                "bg-slate-100 text-slate-700"
              }
            >
              {application.applicant.application_status.replace(/_/g, " ")}
            </Badge>
          </div>

          {/* Acceptance fee banner */}
          {(application.applicant.application_status === "admitted" ||
            application.applicant.application_status === "accepted") && (
            <div
              className={`flex items-center justify-between p-4 rounded-xl border ${
                application.applicant.has_paid_acceptance_fee
                  ? "bg-green-50 border-green-200"
                  : "bg-amber-50 border-amber-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full ${
                    application.applicant.has_paid_acceptance_fee
                      ? "bg-green-500"
                      : "bg-amber-500"
                  }`}
                />
                <div>
                  <p
                    className={`font-semibold text-sm ${
                      application.applicant.has_paid_acceptance_fee
                        ? "text-green-800"
                        : "text-amber-800"
                    }`}
                  >
                    {application.applicant.has_paid_acceptance_fee
                      ? "Acceptance Fee Paid"
                      : "Awaiting Acceptance Fee Payment"}
                  </p>
                  <p
                    className={`text-xs ${
                      application.applicant.has_paid_acceptance_fee
                        ? "text-green-600"
                        : "text-amber-600"
                    }`}
                  >
                    {application.applicant.has_paid_acceptance_fee
                      ? "Admission letter can now be sent to this applicant."
                      : "The admission letter will be available once the applicant pays the acceptance fee."}
                  </p>
                </div>
              </div>
              {application.applicant.has_paid_acceptance_fee && (
                <Button
                  onClick={handleSendLetter}
                  disabled={sendingLetter || letterSent}
                  className="bg-green-600 hover:bg-green-700 text-white gap-2"
                >
                  {sendingLetter ? (
                    <>
                      <span className="animate-spin">⟳</span> Sending...
                    </>
                  ) : letterSent ? (
                    <>✓ Letter Sent</>
                  ) : (
                    <>📧 Send Admission Letter</>
                  )}
                </Button>
              )}
            </div>
          )}
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
        <Tabs defaultValue="info" className="mb-8">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="info">Information</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
          </TabsList>

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
  );
}