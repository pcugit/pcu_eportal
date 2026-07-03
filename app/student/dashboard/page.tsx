"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient, AdmissionLetterData, PaymentTransaction } from "@/lib/api";
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
  LogOut,
  BookOpen,
  User,
  GraduationCap,
  Calendar,
  Clock,
  FileText,
  CreditCard,
  Download,
  Loader2,
  AlertCircle,
  ChevronDown,
  Settings,
} from "lucide-react";

import FirstLoginPasswordChange from "@/components/FirstLoginPasswordChange";
import FsmsAdmissionLetter from "@/components/FsmsAdmissionLetter";
import {
  getSessionImageUrl,
  setSessionImageUrl,
} from "@/lib/sessionImageCache";

export default function StudentDashboard() {
  const router = useRouter();
  const { user, student, isAuthenticated, logout, isLoading } = useAuth();
  const isAdmitted = user?.role === "admitted";
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [regStatus, setRegStatus] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [firstSemUnits, setFirstSemUnits] = useState<number>(0);
  const [secondSemUnits, setSecondSemUnits] = useState<number>(0);
  const [totalUnits, setTotalUnits] = useState<number>(0);
  const [applicantStatus, setApplicantStatus] = useState<any>(null);
  const [admissionLetter, setAdmissionLetter] =
    useState<AdmissionLetterData | null>(null);
  const [showLetter, setShowLetter] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<PaymentTransaction[]>(
    [],
  );
  const [downloading, setDownloading] = useState<string | null>(null);
  const [isDocumentsOpen, setIsDocumentsOpen] = useState(false);
  const [isPaymentsOpen, setIsPaymentsOpen] = useState(false);
  const [passportUrl, setPassportUrl] = useState<string | null>(null);
  const [feeTotal, setFeeTotal] = useState<number>(0);
  const [feeLoadingDone, setFeeLoadingDone] = useState(false);

  const fetchStatus = async () => {
    if (
      isAuthenticated &&
      student &&
      !student.is_pg_student &&
      !student.is_pt_student &&
      !student.is_first_login
    ) {
      try {
        setLoadingStatus(true);
        const data = await ApiClient.getStudentCourses();
        setRegStatus(data.registration_status);

        const norm = (c: any) => ({
          ...c,
          category: c.category ?? c.remark ?? "elective",
        });

        const sems: Record<string, { compulsory: any[]; core: any[] }> =
          (data as any).semesters ?? {};

        const firstSem = sems["First semester"] ?? { compulsory: [], core: [] };
        const secondSem = sems["Second semester"] ?? { compulsory: [], core: [] };

        const newFirstCourses = [...firstSem.compulsory, ...firstSem.core].map(norm);
        const newSecondCourses = [...secondSem.compulsory, ...secondSem.core].map(norm);
        const parsedAvailable = ((data as any).available_courses ?? []).map(norm);

        const registeredIds: number[] = (data as any).registered_course_ids ?? [];

        const allFirstPossible = [
          ...newFirstCourses,
          ...parsedAvailable.filter((c: any) =>
            (c.semester ?? "").toLowerCase().startsWith("first")
          )
        ];
        const allSecondPossible = [
          ...newSecondCourses,
          ...parsedAvailable.filter((c: any) =>
            (c.semester ?? "").toLowerCase().startsWith("second")
          )
        ];

        const uniqueFirst = Array.from(new Map(allFirstPossible.map((c) => [c.id, c])).values());
        const uniqueSecond = Array.from(new Map(allSecondPossible.map((c) => [c.id, c])).values());

        const firstUnits = uniqueFirst
          .filter((c) => registeredIds.includes(c.id))
          .reduce((sum, c) => sum + Number(c.credit_units || 0), 0);

        const secondUnits = uniqueSecond
          .filter((c) => registeredIds.includes(c.id))
          .reduce((sum, c) => sum + Number(c.credit_units || 0), 0);

        setFirstSemUnits(firstUnits);
        setSecondSemUnits(secondUnits);
        setTotalUnits(firstUnits + secondUnits);
      } catch (err) {
        console.error("Error fetching reg status:", err);
      } finally {
        setLoadingStatus(false);
      }
    }
  };

  const fetchExtraData = async () => {
    if (!isAuthenticated || !student || student.is_pg_student || student.is_pt_student) return;
    try {
      const statusRes = await ApiClient.getApplicantStatus();
      setApplicantStatus(statusRes.applicant);

      try {
        const letterResponse = await ApiClient.getAdmissionLetter();
        setAdmissionLetter(letterResponse);
      } catch (e) { }

      try {
        const pHistory = await ApiClient.getPaymentHistory();
        setPaymentHistory(pHistory.payment_history);
      } catch (e) { }

      try {
        const breakdown = await ApiClient.getTuitionBreakdown();
        setFeeTotal(breakdown.total || 0);
      } catch (e) { }

      setFeeLoadingDone(true);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated && student?.is_first_login) {
      setShowPasswordChange(true);
    }
  }, [isLoading, isAuthenticated, student]);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated || user?.role !== "student" || !student) {
      router.replace("/student/login");
      return;
    }

    if (student.is_pg_student) {
      router.replace("/pgstudents/dashboard");
      return;
    }

    if (student.is_pt_student) {
      router.replace("/ptstudents/dashboard");
    }
  }, [isLoading, isAuthenticated, user?.role, student, router]);


  useEffect(() => {
    fetchStatus();
    fetchExtraData();
  }, [isAuthenticated, student]);

  useEffect(() => {
    let active = true;

    const fetchPassport = async () => {
      if (
        !isAuthenticated ||
        isLoading ||
        !student ||
        student.is_pg_student ||
        student.is_pt_student
      ) return;
      try {
        const profile = await ApiClient.getStudentProfile();
        const documents = profile?.documents || [];
        const passportDoc = documents.find(
          (d: any) =>
            d.document_type?.toLowerCase().includes("passport") ||
            d.display_name?.toLowerCase().includes("passport"),
        );

        if (passportDoc?.document_id && active) {
          const token = localStorage.getItem("auth_token") || "";
          const cacheKey = `student-passport:${user?.id ?? "current"}:${passportDoc.document_id}`;
          const cachedUrl = getSessionImageUrl(cacheKey);

          if (cachedUrl) {
            setPassportUrl(cachedUrl);
            return;
          }

          const baseUrl = ApiClient.getBaseUrl();
          const response = await fetch(
            `${baseUrl}/applicant/download-document/${passportDoc.document_id}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          );

          if (response.ok && active) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            setSessionImageUrl(cacheKey, url);
            setPassportUrl(url);
          }
        } else if (active) {
          setPassportUrl(null);
        }
      } catch (e) {
        console.error("Failed to fetch passport in dashboard", e);
      }
    };

    fetchPassport();

    return () => {
      active = false;
    };
  }, [isAuthenticated, isLoading, student, user?.id]);

  const handlePrintPDF = async () => {
    try {
      setPrintLoading(true);
      const pdfBlob = await ApiClient.printAdmissionLetterPDF();
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `admission_letter_${admissionLetter?.reference || "letter"}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error generating PDF:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setPrintLoading(false);
    }
  };

  const handleDownloadMedicalForm = async () => {
    try {
      setDownloading("medical_form");
      const blob = await ApiClient.downloadMedicalForm();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `medical_examination_form.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading medical form:", err);
      alert(
        err instanceof Error ? err.message : "Failed to download medical form",
      );
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadNotice = async () => {
    try {
      setDownloading("admission_notice");
      const blob = await ApiClient.downloadAdmissionNotice();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `pcu_admission_notice_2025.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading notice:", err);
      alert("Failed to download admission notice");
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadAffidavit = async () => {
    try {
      setDownloading("affidavit");
      const blob = await ApiClient.downloadAffidavitForm();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `pcu_affidavit_for_good_conduct.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading affidavit:", err);
      alert("Failed to download affidavit form");
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadReceipt = async (receipt_no: string, type: string) => {
    try {
      setDownloading(`receipt_${receipt_no}`);
      const blob = await ApiClient.downloadPaymentReceipt(receipt_no);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `receipt_${type}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading receipt:", err);
      alert("Failed to download receipt");
    } finally {
      setDownloading(null);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/student/login");
  };

  if (
    isLoading ||
    !isAuthenticated ||
    user?.role !== "student" ||
    !student ||
    student.is_pg_student ||
    student.is_pt_student
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (showPasswordChange) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 px-4">
        <FirstLoginPasswordChange
          onComplete={() => setShowPasswordChange(false)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3eee6]">
      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* Welcome & Info */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="col-span-full md:col-span-2 md:self-start overflow-hidden rounded-2xl border border-[#b98d3d] shadow-sm bg-[#c99b45] text-white relative group">
            {/* User photo on the right */}
            <div className="absolute top-1/2 right-5 -translate-y-1/2 z-10">
              <div className="w-20 h-20 md:w-24 md:h-24 rounded-xl overflow-hidden border-2 border-white/80 shadow-md bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0">
                {passportUrl ? (
                  <img
                    src={passportUrl}
                    alt="User Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-10 h-10 text-white/70" />
                )}
              </div>
            </div>
            <CardHeader className="relative z-10 p-5 pr-28 md:p-5 md:py-6 md:pr-32">
              <CardTitle className="text-2xl font-black tracking-tight !text-white">
                Welcome, {user?.name}
              </CardTitle>
              <CardDescription className="!text-white/85 font-bold text-sm mt-1">
                Matric Number: {student?.matric_number}
              </CardDescription>
            </CardHeader>
            <CardContent className="relative z-10 md:hidden">
              {/* Mobile String representation */}
              <div className="md:hidden mt-2.5 text-xs font-semibold text-white/90 bg-white/10 border border-white/15 backdrop-blur-md rounded-lg p-2.5 inline-flex items-center gap-1 shadow-inner">
                <span>
                  Level:{" "}
                  <span className="font-bold text-white">
                    {student?.current_level}
                  </span>
                </span>
                <span className="mx-1 text-white/30">&bull;</span>
                <span>
                  Session:{" "}
                  <span className="font-bold text-white">
                    {student?.session}
                  </span>
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="hidden md:flex rounded-2xl border-[#e8dfd2] bg-white shadow-sm flex-col justify-center items-center text-center p-4 space-y-1 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
            <div className="bg-[#f3eee6] text-slate-700 border border-[#e2d6c3] p-2 rounded-xl">
              <BookOpen className="w-5 h-5" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Current Level
            </p>
            <p className="text-xl font-black text-slate-900 leading-none">
              {student?.current_level}
            </p>
          </Card>

          <Card className="hidden md:flex rounded-2xl border-[#e8dfd2] bg-white shadow-sm flex-col justify-center items-center text-center p-4 space-y-1 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
            <div className="bg-[#fff7e8] text-[#9a6614] border border-[#efd9a8] p-2 rounded-xl">
              <Calendar className="w-5 h-5" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Session
            </p>
            <p className="text-xl font-black text-[#15110a] leading-none">
              {student?.session}
            </p>
          </Card>
        </div>

        {/* Action Widgets */}
        <div className="grid md:grid-cols-2 gap-5">
          {/* Course Registration Widget */}
          {!isAdmitted && (
            <Card className="rounded-2xl shadow-sm border border-[#e8dfd2] hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group overflow-hidden bg-white">
              <div className="h-1.5 bg-[#c99b45] w-full" />
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-[#f3eee6] text-slate-700 border border-[#e2d6c3] p-2 rounded-xl group-hover:scale-105 transition-transform duration-300">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold text-slate-800">
                      Registration
                    </CardTitle>
                  </div>
                  {regStatus && (
                    <Badge
                      className={`ml-auto text-xs font-bold px-2.5 py-0.5 rounded-full border shadow-none capitalize ${regStatus === "submitted"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                          : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50"
                        }`}
                    >
                      {regStatus}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                {loadingStatus ? (
                  <div className="space-y-3 animate-pulse py-2">
                    <div className="h-4 bg-slate-100 rounded w-full" />
                    <div className="h-4 bg-slate-100 rounded w-5/6" />
                    <div className="h-4 bg-slate-100 rounded w-2/3" />
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3">
                    <div className="flex justify-between items-center text-sm font-medium text-slate-600">
                      <span>1st Semester Units</span>
                      <span className="font-black text-slate-800 font-mono">
                        {firstSemUnits} Units
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm font-medium text-slate-600">
                      <span>2nd Semester Units</span>
                      <span className="font-black text-slate-800 font-mono">
                        {secondSemUnits} Units
                      </span>
                    </div>
                    <div className="h-px bg-slate-200/60 my-2"></div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-800 font-extrabold uppercase text-xs tracking-wider">
                        Total Registered Units
                      </span>
                      <span className="text-lg font-black text-[#c99b45] font-mono">
                        {totalUnits} Units
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Payment Summary Widget */}
          {(() => {
            const feePaid = (paymentHistory || []).reduce((sum, p) =>
              p.payment_type === "tuition" && p.is_successful ? sum + (p.amount || 0) : sum, 0
            );
            const remaining = Math.max(0, feeTotal - feePaid);
            const pct = feeTotal > 0 ? Math.min(100, Math.round((feePaid / feeTotal) * 100)) : 0;
            const isFullyPaid = feeTotal > 0 && remaining === 0;
            return (
              <Card className="rounded-2xl shadow-sm border border-[#e8dfd2] hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group overflow-hidden bg-white">
                <div className="h-1.5 bg-[#e39519] w-full" />
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-[#fff7e8] text-[#9a6614] border border-[#efd9a8] p-2 rounded-xl group-hover:scale-105 transition-transform duration-300">
                      <CreditCard className="w-6 h-6" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-bold text-slate-800">Payment</CardTitle>
                      <CardDescription className="text-slate-500 text-xs mt-0.5">
                        {student?.session || "Current Session"}
                      </CardDescription>
                    </div>
                    {feeLoadingDone && (
                      <span className={`ml-auto text-xs font-bold px-2.5 py-1 rounded-full border ${isFullyPaid
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : feePaid > 0
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        }`}>
                        {isFullyPaid ? "Fully Paid" : feePaid > 0 ? "Partial" : "Unpaid"}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!feeLoadingDone ? (
                    <div className="space-y-3 animate-pulse">
                      <div className="h-4 bg-slate-100 rounded w-3/4" />
                      <div className="h-2 bg-slate-100 rounded-full w-full" />
                      <div className="grid grid-cols-2 gap-3">
                        <div className="h-14 bg-slate-100 rounded-xl" />
                        <div className="h-14 bg-slate-100 rounded-xl" />
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Progress bar */}
                      {feeTotal > 0 && (
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs font-semibold text-slate-500">
                            <span>{pct}% paid</span>
                            <span>{100 - pct}% remaining</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${isFullyPaid ? "bg-emerald-500" : feePaid > 0 ? "bg-amber-400" : "bg-slate-300"
                                }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Amount tiles */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[#f8faf7] border border-emerald-100 rounded-xl p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Paid</p>
                          <p className="text-base font-black text-emerald-700 tabular-nums">
                            ₦{feePaid.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="bg-[#faf8f5] border border-amber-100 rounded-xl p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Remaining</p>
                          <p className={`text-base font-black tabular-nums ${isFullyPaid ? "text-emerald-600" : "text-amber-700"
                            }`}>
                            ₦{remaining.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>

                      {feeTotal > 0 && (
                        <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-2">
                          <span>Total Fee</span>
                          <span className="font-bold text-slate-700">
                            ₦{feeTotal.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </div>

        {/* Mobile-Only Collapsible Dropdowns */}
        <div className="block md:hidden space-y-4 mt-8">
          {/* 1. Official Admission Documents Collapsible */}
          <div className="border border-[#6b21a8]/10 rounded-2xl overflow-hidden bg-white shadow-md">
            <button
              onClick={() => setIsDocumentsOpen(!isDocumentsOpen)}
              className="w-full flex items-center justify-between p-5 bg-[#6b21a8]/5 text-left transition-colors hover:bg-[#6b21a8]/10 duration-200"
            >
              <div className="flex items-center gap-3">
                <div className="bg-[#6b21a8]/10 p-2 rounded-lg text-[#6b21a8]">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">
                    Official Admission Documents
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium">
                    Admission Letter, Medical Form, & Notices
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-slate-600 transition-transform duration-300 ${isDocumentsOpen ? "rotate-180" : ""}`}
              />
            </button>

            {isDocumentsOpen && (
              <div className="p-4 border-t border-slate-50 bg-slate-50/30 space-y-4">
                {/* Admission Letter */}
                <div className="bg-white border border-[#6b21a8]/10 rounded-xl p-4 shadow-sm">
                  <h4 className="font-bold text-sm text-slate-800 mb-1">
                    Provisional Admission Letter
                  </h4>
                  <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                    Your official letter of admission for your program.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setShowLetter(!showLetter)}
                      variant="outline"
                      size="sm"
                      className="flex-1 border-[#6b21a8]/25 text-[#6b21a8] hover:bg-[#6b21a8]/5 text-xs font-semibold py-3.5 h-auto"
                      disabled={!admissionLetter}
                    >
                      {showLetter ? "Hide Letter" : "Preview Letter"}
                    </Button>
                    <Button
                      onClick={handlePrintPDF}
                      size="sm"
                      className="flex-1 gap-1.5 bg-[#6b21a8] hover:bg-[#581c87] text-white text-xs font-semibold py-3.5 h-auto"
                      disabled={printLoading || !admissionLetter}
                    >
                      <Download className="h-3.5 w-3.5" />
                      {printLoading ? "..." : "Download PDF"}
                    </Button>
                  </div>
                </div>

                {/* Medical Form */}
                <div className="bg-white border border-[#881337]/10 rounded-xl p-4 shadow-sm">
                  <h4 className="font-bold text-sm text-slate-800 mb-1">
                    Medical Examination Form
                  </h4>
                  <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                    Print and take to a certified hospital for examination.
                  </p>
                  <Button
                    onClick={handleDownloadMedicalForm}
                    disabled={
                      downloading === "medical_form" ||
                      !applicantStatus?.has_paid_tuition
                    }
                    className="w-full gap-1.5 bg-[#881337] hover:bg-[#70112c] text-white text-xs font-semibold py-3.5 h-auto"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {downloading === "medical_form"
                      ? "Downloading..."
                      : "Download PDF"}
                  </Button>
                </div>

                {/* Additional Forms */}
                <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                  <h4 className="font-bold text-sm text-slate-800 mb-1">
                    Resumption Notice & Affidavit
                  </h4>
                  <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                    Official resumption notice and good conduct affidavit.
                  </p>
                  <div className="space-y-2">
                    <Button
                      onClick={handleDownloadNotice}
                      variant="outline"
                      size="sm"
                      disabled={downloading === "admission_notice"}
                      className="w-full gap-1.5 border-[#6b21a8]/25 text-[#6b21a8] hover:bg-[#6b21a8]/5 text-xs font-semibold py-3 h-auto justify-center"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {downloading === "admission_notice"
                        ? "..."
                        : "Admission Notice"}
                    </Button>
                    <Button
                      onClick={handleDownloadAffidavit}
                      variant="outline"
                      size="sm"
                      disabled={downloading === "affidavit"}
                      className="w-full gap-1.5 border-[#881337]/25 text-[#881337] hover:bg-[#881337]/5 text-xs font-semibold py-3 h-auto justify-center"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {downloading === "affidavit"
                        ? "..."
                        : "Conduct Affidavit"}
                    </Button>
                  </div>
                </div>

                {/* Admission Letter Live Preview container inside Mobile dropdown */}
                {showLetter && (
                  <div className="border border-slate-100 rounded-xl overflow-hidden shadow-inner bg-slate-50 p-3 mt-4">
                    <div className="bg-white p-4 shadow-lg mx-auto max-w-[850px] overflow-x-auto text-[10px]">
                      {admissionLetter ? (
                        <FsmsAdmissionLetter {...admissionLetter} />
                      ) : (
                        <div className="text-center py-6">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#6b21a8] mx-auto mb-2" />
                          <p className="text-slate-500 text-xs">
                            Loading letter details...
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. Payment Transactions Collapsible */}
          <div className="border border-[#881337]/10 rounded-2xl overflow-hidden bg-white shadow-md">
            <button
              onClick={() => setIsPaymentsOpen(!isPaymentsOpen)}
              className="w-full flex items-center justify-between p-5 bg-[#881337]/5 text-left transition-colors hover:bg-[#881337]/10 duration-200"
            >
              <div className="flex items-center gap-3">
                <div className="bg-[#881337]/10 p-2 rounded-lg text-[#881337]">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">
                    Payment Transactions
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium">
                    Download payment receipts
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-slate-600 transition-transform duration-300 ${isPaymentsOpen ? "rotate-180" : ""}`}
              />
            </button>

            {isPaymentsOpen && (
              <div className="p-4 border-t border-slate-50 bg-slate-50/30 space-y-2">
                {paymentHistory
                  .filter((pt) => pt.is_successful)
                  .map((pt) => (
                    <div
                      key={pt.transaction_id}
                      className="flex items-center justify-between p-3 bg-white hover:bg-slate-50 rounded-xl border border-slate-100 text-xs transition-colors duration-200"
                    >
                      <span className="capitalize font-bold text-slate-700">
                        {pt.payment_type.replace("_", " ")}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-[#6b21a8] hover:text-[#581c87] hover:bg-[#6b21a8]/5 font-bold"
                        onClick={() =>
                          handleDownloadReceipt(pt.receipt_no, pt.payment_type)
                        }
                        disabled={downloading === `receipt_${pt.receipt_no}`}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        PDF
                      </Button>
                    </div>
                  ))}
                {paymentHistory.filter((pt) => pt.is_successful).length ===
                  0 && (
                    <p className="text-xs text-center text-slate-400 py-4 italic bg-white rounded-xl border border-dashed">
                      No payment records found.
                    </p>
                  )}
              </div>
            )}
          </div>
        </div>

        {/* Admission Letter - From Applicant flow into Student dashboard */}
        <Card
          id="admission-documents"
          className="hidden md:block mb-8 overflow-hidden rounded-2xl border border-[#e8dfd2] shadow-sm mt-8 bg-white"
        >
          <div className="bg-[#fbfaf7] p-6 border-b border-[#f0e8dc]">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold text-slate-800">
                  Official Admission Documents
                </CardTitle>
                <CardDescription className="text-sm mt-1 text-slate-500">
                  Access and download your official enrollment documents
                  anytime.
                </CardDescription>
              </div>
            </div>
          </div>

          <CardContent className="p-6">
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6">
              {/* Admission Letter Download */}
              <div className="min-w-0 bg-white border border-[#e8dfd2] hover:border-[#d8bd82] transition-all duration-300 rounded-xl p-5 shadow-sm group flex flex-col justify-between">
                <div>
                  <div className="bg-[#f3eee6] text-slate-700 border border-[#e2d6c3] w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300">
                    <FileText className="h-6 w-6" />
                  </div>
                  <h4 className="font-bold text-base text-slate-800 mb-1">
                    Provisional Admission Letter
                  </h4>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    Your official letter of admission for your program.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => setShowLetter(!showLetter)}
                    variant="outline"
                    size="sm"
                    className="min-w-0 border-[#d8bd82] text-[#7a4f10] hover:bg-[#fff7e8] text-xs font-semibold py-4"
                    disabled={!admissionLetter}
                  >
                    {showLetter ? "Hide" : "Preview"}
                  </Button>
                  <Button
                    onClick={handlePrintPDF}
                    size="sm"
                    className="min-w-0 gap-1.5 bg-[#151515] hover:bg-[#2a2a2a] text-white shadow-sm text-xs font-semibold py-4"
                    disabled={printLoading || !admissionLetter}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {printLoading ? "..." : "PDF"}
                  </Button>
                </div>
              </div>

              {/* Medical Form Download */}
              <div className="min-w-0 bg-white border border-[#e8dfd2] hover:border-[#d8bd82] transition-all duration-300 rounded-xl p-5 shadow-sm group flex flex-col justify-between">
                <div>
                  <div className="bg-[#f8eef2] text-[#881337] border border-[#ead2db] w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300">
                    <FileText className="h-6 w-6" />
                  </div>
                  <h4 className="font-bold text-base text-slate-800 mb-1">
                    Medical Examination Form
                  </h4>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    Print and take to a certified hospital for examination.
                  </p>
                </div>
                <Button
                  onClick={handleDownloadMedicalForm}
                  disabled={
                    downloading === "medical_form" ||
                    !applicantStatus?.has_paid_tuition
                  }
                  className="w-full min-h-10 h-auto gap-1.5 bg-[#151515] hover:bg-[#2a2a2a] text-white shadow-sm text-xs font-semibold py-3.5 whitespace-normal leading-tight"
                >
                  <Download className="h-3.5 w-3.5" />
                  {downloading === "medical_form"
                    ? "Downloading..."
                    : "Download PDF"}
                </Button>
              </div>

              {/* Additional Forms Download */}
              <div className="min-w-0 bg-white border border-[#e8dfd2] hover:border-[#d8bd82] transition-all duration-300 rounded-xl p-5 shadow-sm group flex flex-col justify-between">
                <div>
                  <div className="bg-[#f3eee6] text-slate-700 border border-[#e2d6c3] w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300">
                    <Settings className="h-6 w-6" />
                  </div>
                  <h4 className="font-bold text-base text-slate-800 mb-1">
                    Notice & Affidavit
                  </h4>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    Official resumption notice and good conduct affidavit.
                  </p>
                </div>
                <div className="space-y-2">
                  <Button
                    onClick={handleDownloadNotice}
                    variant="outline"
                    size="sm"
                    disabled={downloading === "admission_notice"}
                    className="w-full min-h-10 h-auto gap-1.5 border-[#d8bd82] text-[#7a4f10] hover:bg-[#fff7e8] text-xs font-semibold py-3.5 justify-center whitespace-normal leading-tight"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {downloading === "admission_notice"
                      ? "..."
                      : "Admission Notice"}
                  </Button>
                  <Button
                    onClick={handleDownloadAffidavit}
                    variant="outline"
                    size="sm"
                    disabled={downloading === "affidavit"}
                    className="w-full min-h-10 h-auto gap-1.5 border-[#ead2db] text-[#881337] hover:bg-[#f8eef2] text-xs font-semibold py-3.5 justify-center whitespace-normal leading-tight"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {downloading === "affidavit" ? "..." : "Conduct Affidavit"}
                  </Button>
                </div>
              </div>

              {/* Receipts Section */}
              <div className="min-w-0 bg-white border border-[#e8dfd2] hover:border-[#d8bd82] transition-all duration-300 rounded-xl p-5 shadow-sm group flex flex-col justify-between">
                <div>
                  <div className="bg-[#fff7e8] text-[#9a6614] border border-[#efd9a8] w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover/doc:scale-105 transition-transform duration-300">
                    <CreditCard className="h-6 w-6" />
                  </div>
                  <h4 className="font-bold text-base text-slate-800 mb-1">
                    Payment Receipts
                  </h4>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    Download official receipts for your completed payments.
                  </p>
                </div>
                <div className="space-y-2">
                  {paymentHistory
                    .filter((pt) => pt.is_successful)
                    .map((pt) => (
                      <div
                        key={pt.transaction_id}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-2 bg-[#fbfaf7] hover:bg-[#f7f1e8] rounded-lg border border-[#eee5d8] text-xs transition-colors duration-200"
                      >
                        <span className="min-w-0 capitalize font-semibold text-slate-600 break-words">
                          {pt.payment_type.replace("_", " ")}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 px-2 text-[#6b21a8] hover:text-[#581c87] hover:bg-[#6b21a8]/5 font-bold"
                          onClick={() =>
                            handleDownloadReceipt(
                              pt.receipt_no,
                              pt.payment_type,
                            )
                          }
                          disabled={downloading === `receipt_${pt.receipt_no}`}
                        >
                          <Download className="h-3.5 w-3.5 mr-1" />
                          PDF
                        </Button>
                      </div>
                    ))}
                  {paymentHistory.filter((pt) => pt.is_successful).length ===
                    0 && (
                      <p className="text-xs text-center text-slate-400 py-2 italic bg-slate-50 rounded-lg border border-dashed">
                        No payment records found.
                      </p>
                    )}
                </div>
              </div>
            </div>

            {showLetter && (
              <div className="mt-8 border border-slate-100 rounded-xl overflow-hidden shadow-inner bg-slate-50 p-8">
                <div className="bg-white p-12 shadow-2xl mx-auto max-w-[850px]">
                  {admissionLetter ? (
                    <FsmsAdmissionLetter {...admissionLetter} />
                  ) : (
                    <div className="text-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6b21a8] mx-auto mb-4" />
                      <p className="text-slate-500 text-sm mt-4">
                        Loading admission letter details...
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
