"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient, LetterStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  AlertTriangle,
  Send,
  Eye,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdmissionLetterPreviewModal from "@/components/AdmissionLetterPreviewModal";

interface FacultyData {
  [faculty: string]: Array<{
    name: string;
    pending_count: number;
  }>;
}

interface DepartmentApplicant {
  id: number | string;
  name: string;
  email: string;
  program_name: string;
}

export default function PtAdminSendLettersPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();

  const [faculties, setFaculties] = useState<FacultyData>({});
  const [expandedFaculty, setExpandedFaculty] = useState<string | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [departmentApplicants, setDepartmentApplicants] = useState<DepartmentApplicant[]>([]);
  const [selectedApplicants, setSelectedApplicants] = useState<Set<number | string>>(new Set());

  const [activeTab, setActiveTab] = useState<"pending" | "sent" | "failed">("pending");
  const [sentLetters, setSentLetters] = useState<LetterStatus[]>([]);
  const [failedLetters, setFailedLetters] = useState<LetterStatus[]>([]);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [admissionDate, setAdmissionDate] = useState<string>("");
  const [previewApplicantId, setPreviewApplicantId] = useState<number | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "ptadmin") {
      router.replace("/staff/login");
      return;
    }
    if (!admissionDate) {
      setAdmissionDate(new Date().toISOString().split("T")[0]);
    }
    loadData();
  }, [isAuthenticated, user, router]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [facultyData, statusData] = await Promise.all([
        ApiClient.getPtFacultyDepartments(),
        ApiClient.getPtLetterStatusSummary(),
      ]);
      setFaculties(facultyData.faculties || {});
      setSentLetters(statusData.sent || []);
      setFailedLetters(statusData.failed || []);
    } catch (err) {
      setError("Failed to load data. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadDepartmentApplicants = async (department: string) => {
    try {
      const response = await ApiClient.getPtDepartmentApplicants(department);
      setDepartmentApplicants(response.applicants || []);
      setSelectedApplicants(new Set());
    } catch (err) {
      console.error("Failed to load department applicants:", err);
    }
  };

  const handleSelectDepartment = async (department: string) => {
    setSelectedDepartment(department);
    await loadDepartmentApplicants(department);
  };

  const handleSelectApplicant = (id: number | string, checked: boolean) => {
    const newSelected = new Set(selectedApplicants);
    if (checked) newSelected.add(id);
    else newSelected.delete(id);
    setSelectedApplicants(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedApplicants(new Set(departmentApplicants.map((a) => a.id)));
    } else {
      setSelectedApplicants(new Set());
    }
  };

  const handleSendLetters = async () => {
    if (!selectedDepartment || selectedApplicants.size === 0) {
      setError("Please select a programme group and applicants");
      return;
    }
    setSending(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await ApiClient.sendPtDepartmentLetters(
        selectedDepartment,
        Array.from(selectedApplicants) as number[],
        admissionDate,
      );
      setSuccessMessage(
        `Successfully sent ${result.sent} letter${result.sent !== 1 ? "s" : ""} (${result.failed} failed)`,
      );
      setSelectedApplicants(new Set());
      await loadData();
      window.dispatchEvent(new Event("admission-letters-updated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send letters");
    } finally {
      setSending(false);
    }
  };

  const handleResend = async (applicantId: number | string) => {
    try {
      await ApiClient.resendPtLetter(applicantId as number, admissionDate);
      setSuccessMessage("Letter resent successfully");
      await loadData();
      window.dispatchEvent(new Event("admission-letters-updated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend letter");
    }
  };

  if (!isAuthenticated || user?.role !== "ptadmin") return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {previewApplicantId !== null && (
        <AdmissionLetterPreviewModal
          applicantId={previewApplicantId}
          admissionDate={admissionDate}
          portal="ptadmin"
          onClose={() => setPreviewApplicantId(null)}
        />
      )}

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
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800 mb-1">Send Admission Letters</h1>
          <p className="text-slate-500 text-sm">Manage and send part-time admission letters by programme</p>
        </div>

        {/* Feedback banners */}
        {error && (
          <div className="mb-6 bg-rose-50 border border-rose-200 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-rose-500 flex-shrink-0" />
            <p className="text-sm text-rose-700 font-medium">{error}</p>
          </div>
        )}
        {successMessage && (
          <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
            <p className="text-sm text-emerald-700 font-medium">{successMessage}</p>
          </div>
        )}

        <Tabs
          defaultValue="pending"
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "pending" | "sent" | "failed")}
        >
          {/* Tab List */}
          <div className="mb-6">
            <TabsList className="bg-white border border-gray-200 rounded-lg p-1 h-auto gap-1 w-full sm:w-auto sm:grid sm:grid-cols-3">
              {(["pending", "sent", "failed"] as const).map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="rounded-md px-5 py-2 text-sm font-medium capitalize text-slate-600 data-[state=active]:bg-slate-800 data-[state=active]:text-white"
                >
                  {tab === "sent" ? "Sent Successfully" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* ── Pending Tab ── */}
          <TabsContent value="pending" className="space-y-6">
            {loading ? (
              <div className="text-center py-20 bg-white border border-gray-200 rounded-xl">
                <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Loading...</p>
              </div>
            ) : Object.keys(faculties).length === 0 ? (
              <div className="text-center py-20 bg-white border border-gray-200 rounded-xl">
                <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
                <p className="text-slate-500 text-sm font-medium">All part-time applicants have received their letters!</p>
              </div>
            ) : (
              <div className="grid lg:grid-cols-3 gap-6">
                {/* Programme Selector */}
                <Card className="lg:row-span-2 bg-white border border-gray-200 shadow-none rounded-xl">
                  <CardHeader className="pb-3 border-b border-gray-100 px-5 pt-5">
                    <CardTitle className="text-sm font-semibold text-slate-700">Programmes</CardTitle>
                    <CardDescription className="text-xs text-slate-400 mt-0.5">
                      {selectedDepartment ? `Selected: ${selectedDepartment}` : "Choose a programme"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 space-y-1">
                    {Object.entries(faculties).map(([faculty, departments]) => (
                      <div key={faculty}>
                        <button
                          onClick={() => setExpandedFaculty(expandedFaculty === faculty ? null : faculty)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 text-slate-700 transition-colors"
                        >
                          {expandedFaculty === faculty ? (
                            <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                          )}
                          <span className="font-semibold text-sm text-left">{faculty}</span>
                        </button>

                        {expandedFaculty === faculty && (
                          <div className="ml-4 space-y-0.5 mt-0.5">
                            {departments.map((dept) => (
                              <button
                                key={dept.name}
                                onClick={() => handleSelectDepartment(dept.name)}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between gap-2 ${
                                  selectedDepartment === dept.name
                                    ? "bg-slate-800 text-white"
                                    : "hover:bg-gray-50 text-slate-600"
                                }`}
                              >
                                <span className="truncate">{dept.name}</span>
                                <Badge
                                  className={`shrink-0 font-semibold text-xs px-2 py-0.5 rounded-md border-none ${
                                    selectedDepartment === dept.name
                                      ? "bg-white/20 text-white"
                                      : "bg-slate-100 text-slate-600"
                                  }`}
                                >
                                  {dept.pending_count}
                                </Badge>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Applicant Checklist */}
                <Card className="lg:col-span-2 bg-white border border-gray-200 shadow-none rounded-xl">
                  <CardHeader className="pb-3 border-b border-gray-100 px-5 pt-5">
                    <CardTitle className="text-sm font-semibold text-slate-700">Applicants</CardTitle>
                    <CardDescription className="text-xs text-slate-400 mt-0.5">
                      {selectedDepartment
                        ? `Select applicants from ${selectedDepartment}`
                        : "Select a programme first"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    {selectedDepartment ? (
                      <>
                        <div className="space-y-2 max-h-72 overflow-y-auto">
                          {departmentApplicants.length > 0 && (
                            <div className="flex items-center gap-2 px-2 py-1 mb-1">
                              <Checkbox
                                id="select-all-pt"
                                checked={selectedApplicants.size === departmentApplicants.length && departmentApplicants.length > 0}
                                onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                                disabled={sending}
                              />
                              <label htmlFor="select-all-pt" className="text-sm font-medium text-slate-600 cursor-pointer">
                                Select All ({selectedApplicants.size}/{departmentApplicants.length})
                              </label>
                            </div>
                          )}
                          {departmentApplicants.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-8">No pending applicants</p>
                          ) : (
                            departmentApplicants.map((app) => (
                              <div
                                key={String(app.id)}
                                className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                              >
                                <Checkbox
                                  id={`pt-app-${app.id}`}
                                  checked={selectedApplicants.has(app.id)}
                                  onCheckedChange={(checked) => handleSelectApplicant(app.id, checked as boolean)}
                                  disabled={sending}
                                />
                                <label htmlFor={`pt-app-${app.id}`} className="flex-1 cursor-pointer min-w-0">
                                  <p className="font-semibold text-sm text-slate-700">{app.name}</p>
                                  <p className="text-xs text-slate-400 truncate">{app.email} · {app.program_name}</p>
                                </label>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setPreviewApplicantId(app.id)}
                                  disabled={sending}
                                  title="Preview admission letter"
                                  className="shrink-0 h-8 w-8 p-0 text-slate-400 hover:text-slate-700"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="border-t border-gray-100 pt-4 space-y-3">
                          <div>
                            <Label htmlFor="pt-admission-date" className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                              Admission Date
                            </Label>
                            <Input
                              id="pt-admission-date"
                              type="date"
                              value={admissionDate}
                              onChange={(e) => setAdmissionDate(e.target.value)}
                              disabled={sending}
                              className="mt-1.5 bg-white border-gray-200 text-slate-700 rounded-lg focus:ring-slate-300"
                            />
                          </div>
                          <Button
                            onClick={handleSendLetters}
                            disabled={sending || selectedApplicants.size === 0}
                            className="w-full gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg"
                          >
                            <Mail className="h-4 w-4" />
                            {sending
                              ? "Sending..."
                              : `Send to ${selectedApplicants.size} Applicant${selectedApplicants.size !== 1 ? "s" : ""}`}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-slate-400 text-center py-16">
                        Select a programme group to see applicants
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ── Sent Tab ── */}
          <TabsContent value="sent">
            <div className="mb-4">
              <p className="text-sm text-slate-500">
                {sentLetters.length} applicant{sentLetters.length !== 1 ? "s have" : " has"} received letters
              </p>
            </div>
            {sentLetters.length === 0 ? (
              <div className="text-center py-20 bg-white border border-dashed border-gray-200 rounded-xl">
                <Send className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No letters have been sent yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {sentLetters.map((letter) => (
                  <div
                    key={String(letter.applicant_id)}
                    className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                  >
                    <div className="mt-0.5 flex-shrink-0 h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono text-slate-400 leading-none mb-1">{letter.form_no || "—"}</p>
                      <p className="font-semibold text-sm text-slate-700 leading-snug truncate">{letter.name}</p>
                      <p className="text-xs text-slate-400 truncate mt-0.5">{letter.course || letter.program || "—"}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {letter.sent_at
                          ? new Date(letter.sent_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                          : "—"}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => setPreviewApplicantId(letter.applicant_id)}
                        title="Preview letter"
                        className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 text-slate-400 hover:text-slate-700 transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleResend(letter.applicant_id)}
                        disabled={sending}
                        title="Resend letter"
                        className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-40"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Failed Tab ── */}
          <TabsContent value="failed">
            <Card className="bg-white border border-gray-200 shadow-none rounded-xl">
              <CardHeader className="pb-3 border-b border-gray-100 px-5 pt-5">
                <CardTitle className="text-sm font-semibold text-slate-700">Failed Sends</CardTitle>
                <CardDescription className="text-xs text-slate-400 mt-0.5">
                  {failedLetters.length} applicant{failedLetters.length !== 1 ? "s" : ""} failed to receive letters
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5">
                {failedLetters.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
                    <p className="text-slate-400 text-sm font-medium">No failed letters</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {failedLetters.map((letter) => (
                      <div
                        key={String(letter.applicant_id)}
                        className="flex items-start justify-between gap-4 p-4 bg-rose-50 border border-rose-200 rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1.5">
                            <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
                            <h4 className="font-semibold text-sm text-slate-800">{letter.name}</h4>
                          </div>
                          <p className="text-xs text-slate-500 mb-1">{letter.email} · {letter.program}</p>
                          {letter.error_message && (
                            <p className="text-xs text-rose-600">Error: {letter.error_message}</p>
                          )}
                          <p className="text-xs text-slate-400 mt-1">Attempts: {letter.retry_count}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPreviewApplicantId(letter.applicant_id)}
                            title="Preview letter"
                            className="h-8 w-8 p-0 text-slate-500 hover:text-slate-800"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleResend(letter.applicant_id)}
                            disabled={sending}
                            className="gap-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-semibold"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Retry
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
