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
  id: number;
  name: string;
  email: string;
  program_name: string;
}



export default function SendLettersPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();

  // Faculty/Department pending state
  const [faculties, setFaculties] = useState<FacultyData>({});
  const [expandedFaculty, setExpandedFaculty] = useState<string | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [departmentApplicants, setDepartmentApplicants] = useState<DepartmentApplicant[]>([]);
  const [selectedApplicants, setSelectedApplicants] = useState<Set<number>>(new Set());

  // Status tabs state
  const [activeTab, setActiveTab] = useState<"pending" | "sent" | "failed">("pending");
  const [sentLetters, setSentLetters] = useState<LetterStatus[]>([]);
  const [failedLetters, setFailedLetters] = useState<LetterStatus[]>([]);

  // Preview modal state
  const [previewApplicantId, setPreviewApplicantId] = useState<number | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [admissionDate, setAdmissionDate] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "admissionofficer") {
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
        ApiClient.getFacultyDepartments(),
        ApiClient.getLetterStatusSummary(),
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
      const response = await ApiClient.getDepartmentApplicants(department);
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

  const handleSelectApplicant = (id: number, checked: boolean) => {
    const newSelected = new Set(selectedApplicants);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedApplicants(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedApplicants(new Set(departmentApplicants.map((app) => app.id)));
    } else {
      setSelectedApplicants(new Set());
    }
  };

  const handleSendLetters = async () => {
    if (!selectedDepartment || selectedApplicants.size === 0) {
      setError("Please select a department and applicants");
      return;
    }

    setSending(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await ApiClient.sendDepartmentLetters(
        selectedDepartment,
        Array.from(selectedApplicants),
        admissionDate,
      );

      setSuccessMessage(
        `Successfully sent ${result.sent} letters (${result.failed} failed)`,
      );
      setSelectedApplicants(new Set());
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send letters";
      setError(message);
    } finally {
      setSending(false);
    }
  };

  const handleResend = async (applicantId: number) => {
    try {
      await ApiClient.resendLetter(applicantId, admissionDate);
      setSuccessMessage("Letter resent successfully");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend letter");
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/staff/login");
  };

  if (!isAuthenticated || user?.role !== "admissionofficer") {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">

      {/* Preview Modal */}
      {previewApplicantId !== null && (
        <AdmissionLetterPreviewModal
          applicantId={previewApplicantId}
          admissionDate={admissionDate}
          onClose={() => setPreviewApplicantId(null)}
        />
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/admission_officer/dashboard"
            className="text-primary hover:underline text-sm mb-2 block"
          >
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Send Admission Letters
          </h1>
          <p className="text-muted-foreground">
            Manage and send admission letters by faculty and department
          </p>
        </div>

        {error && (
          <Card className="mb-6 border-destructive/50 bg-destructive/5">
            <CardContent className="pt-6 flex gap-3">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {successMessage && (
          <Card className="mb-6 border-green-500/50 bg-green-50">
            <CardContent className="pt-6 flex gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-700">{successMessage}</p>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="pending" value={activeTab} onValueChange={(v) => setActiveTab(v as "pending" | "sent" | "failed")}>
          <div className="mb-6">
            <div className="relative overflow-hidden rounded-2xl border border-[#e5d8c6] bg-[#fffefa] p-1.5 shadow-sm">
              <div className="pointer-events-none absolute inset-y-1.5 left-1.5 w-6 bg-gradient-to-r from-[#fffefa] to-transparent sm:hidden" />
              <div className="pointer-events-none absolute inset-y-1.5 right-1.5 w-6 bg-gradient-to-l from-[#fffefa] to-transparent sm:hidden" />
              <div className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <TabsList className="h-auto min-w-max w-full justify-start gap-1 bg-transparent p-0 text-slate-700 sm:grid sm:grid-cols-3">
                  <TabsTrigger
                    value="pending"
                    className="min-w-[112px] rounded-xl px-5 py-2.5 text-sm font-bold text-slate-700 data-[state=active]:bg-[#c99b45] data-[state=active]:text-[#15110a] data-[state=active]:shadow-sm"
                  >
                    Pending
                  </TabsTrigger>
                  <TabsTrigger
                    value="sent"
                    className="min-w-[156px] rounded-xl px-5 py-2.5 text-sm font-bold text-slate-700 data-[state=active]:bg-[#c99b45] data-[state=active]:text-[#15110a] data-[state=active]:shadow-sm"
                  >
                    Sent Successfully
                  </TabsTrigger>
                  <TabsTrigger
                    value="failed"
                    className="min-w-[112px] rounded-xl px-5 py-2.5 text-sm font-bold text-slate-700 data-[state=active]:bg-[#c99b45] data-[state=active]:text-[#15110a] data-[state=active]:shadow-sm"
                  >
                    Failed
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>
            <div className="mt-2 flex justify-center gap-1.5 sm:hidden" aria-hidden="true">
              {(["pending", "sent", "failed"] as const).map((tab) => (
                <span
                  key={tab}
                  className={`h-1.5 rounded-full transition-all ${
                    activeTab === tab ? "w-5 bg-[#c99b45]" : "w-1.5 bg-[#d8c9b6]"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Pending Tab */}
          <TabsContent value="pending" className="space-y-6">
            {loading ? (
              <Card>
                <CardContent className="pt-12 text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading...</p>
                </CardContent>
              </Card>
            ) : Object.keys(faculties).length === 0 ? (
              <Card>
                <CardContent className="pt-12 text-center">
                  <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
                  <p className="text-muted-foreground">All applicants have received letters!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid lg:grid-cols-3 gap-6">
                {/* Faculty/Department Selector */}
                <Card className="lg:row-span-2">
                  <CardHeader>
                    <CardTitle>Faculties & Departments</CardTitle>
                    <CardDescription>
                      {selectedDepartment
                        ? `Selected: ${selectedDepartment}`
                        : "Choose a department"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {Object.entries(faculties).map(([faculty, departments]) => (
                      <div key={faculty}>
                        <button
                          onClick={() =>
                            setExpandedFaculty(
                              expandedFaculty === faculty ? null : faculty,
                            )
                          }
                          className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-accent"
                        >
                          {expandedFaculty === faculty ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <span className="font-medium">{faculty}</span>
                        </button>

                        {expandedFaculty === faculty && (
                          <div className="ml-4 space-y-1">
                            {departments.map((dept) => (
                              <button
                                key={dept.name}
                                onClick={() => handleSelectDepartment(dept.name)}
                                className={`w-full text-left p-2 rounded-lg text-sm transition-colors ${
                                  selectedDepartment === dept.name
                                    ? "!bg-[#c99b45] !text-[#15110a] shadow-sm"
                                    : "hover:bg-muted"
                                }`}
                              >
                                <div className="flex justify-between items-center">
                                  <span
                                    className={
                                      selectedDepartment === dept.name
                                        ? "!text-[#15110a] font-semibold"
                                        : undefined
                                    }
                                  >
                                    {dept.name}
                                  </span>
                                  <Badge
                                    variant="secondary"
                                    className={
                                      selectedDepartment === dept.name
                                        ? "!bg-white !text-[#15110a]"
                                        : undefined
                                    }
                                  >
                                    {dept.pending_count}
                                  </Badge>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Applicants List & Settings */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Applicants</CardTitle>
                    <CardDescription>
                      {selectedDepartment
                        ? `Select applicants from ${selectedDepartment}`
                        : "Select a department first"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedDepartment ? (
                      <>
                        <div className="space-y-3 max-h-64 overflow-y-auto">
                          {departmentApplicants.length > 0 && (
                            <div className="flex items-center gap-2 p-2 mb-2">
                              <Checkbox
                                id="select-all"
                                checked={
                                  selectedApplicants.size === departmentApplicants.length &&
                                  departmentApplicants.length > 0
                                }
                                onCheckedChange={(checked) =>
                                  handleSelectAll(checked as boolean)
                                }
                                disabled={sending}
                              />
                              <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                                Select All ({selectedApplicants.size}/
                                {departmentApplicants.length})
                              </label>
                            </div>
                          )}

                          {departmentApplicants.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              No pending applicants
                            </p>
                          ) : (
                            departmentApplicants.map((app) => (
                              <div
                                key={app.id}
                                className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-accent"
                              >
                                <Checkbox
                                  id={`app-${app.id}`}
                                  checked={selectedApplicants.has(app.id)}
                                  onCheckedChange={(checked) =>
                                    handleSelectApplicant(app.id, checked as boolean)
                                  }
                                  disabled={sending}
                                />
                                <label
                                  htmlFor={`app-${app.id}`}
                                  className="flex-1 cursor-pointer"
                                >
                                  <p className="font-medium text-sm">{app.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {app.email} • {app.program_name}
                                  </p>
                                </label>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setPreviewApplicantId(app.id)}
                                  disabled={sending}
                                  title="Preview admission letter"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="border-t border-border pt-4">
                          <div className="space-y-3">
                            <div>
                              <Label htmlFor="admission-date-pending">
                                Admission Date
                              </Label>
                              <Input
                                id="admission-date-pending"
                                type="date"
                                value={admissionDate}
                                onChange={(e) => setAdmissionDate(e.target.value)}
                                disabled={sending}
                              />
                            </div>

                            <Button
                              onClick={handleSendLetters}
                              disabled={sending || selectedApplicants.size === 0}
                              className="w-full gap-2"
                            >
                              <Mail className="h-4 w-4" />
                              {sending
                                ? "Sending..."
                                : `Send to ${selectedApplicants.size} Applicant${selectedApplicants.size !== 1 ? "s" : ""}`}
                            </Button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-12">
                        Select a department to see applicants
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Sent Successfully Tab */}
          <TabsContent value="sent">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {sentLetters.length} applicant{sentLetters.length !== 1 ? "s have" : " has"} received letters
              </p>
            </div>

            {sentLetters.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No letters have been sent yet</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {sentLetters.map((letter) => (
                  <div
                    key={letter.applicant_id}
                    className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors"
                  >
                    {/* Icon */}
                    <div className="mt-0.5 flex-shrink-0 h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono text-muted-foreground leading-none mb-1">
                        {letter.form_no || "—"}
                      </p>
                      <p className="font-medium text-sm leading-snug truncate">{letter.name}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {letter.course || letter.program || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {letter.sent_at
                          ? new Date(letter.sent_at).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </p>
                    </div>

                    {/* Resend action */}
                    <button
                      onClick={() => handleResend(letter.applicant_id)}
                      disabled={sending}
                      title="Resend letter"
                      className="flex-shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Failed Tab */}
          <TabsContent value="failed">
            <Card>
              <CardHeader>
                <CardTitle>Failed Sends</CardTitle>
                <CardDescription>
                  {failedLetters.length} applicants failed to receive letters
                </CardDescription>
              </CardHeader>
              <CardContent>
                {failedLetters.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
                    <p className="text-muted-foreground">No failed letters</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {failedLetters.map((letter) => (
                      <Card key={letter.applicant_id} className="border-destructive/50 bg-destructive/5">
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle className="h-4 w-4 text-destructive" />
                                <h4 className="font-medium">{letter.name}</h4>
                              </div>
                              <p className="text-sm text-muted-foreground mb-1">
                                {letter.email} • {letter.program}
                              </p>
                              {letter.error_message && (
                                <p className="text-xs text-destructive">
                                  Error: {letter.error_message}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                Attempts: {letter.retry_count}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setPreviewApplicantId(letter.applicant_id)}
                                title="Preview letter"
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleResend(letter.applicant_id)}
                                disabled={sending}
                                className="gap-2"
                              >
                                <RotateCcw className="h-3 w-3" />
                                Retry
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
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
