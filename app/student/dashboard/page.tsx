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
  CheckCircle2,
  Clock,
  FileText,
  CreditCard,
  Download,
  Settings,
  Loader2,
  AlertCircle,
  ChevronDown,
  DollarSign,
} from "lucide-react";

import FirstLoginPasswordChange from "@/components/FirstLoginPasswordChange";
import FsmsAdmissionLetter from "@/components/FsmsAdmissionLetter";

export default function StudentDashboard() {
  const router = useRouter();
  const { user, student, isAuthenticated, logout, isLoading } = useAuth();
  const isAdmitted = user?.role === "admitted"; // paid acceptance fee, not yet school fees
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [regStatus, setRegStatus] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
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

  // ── Tuition payment states (Interswitch) ────────────────────────────────────
  const [isPayingTuition, setIsPayingTuition] = useState(false);
  const [tuitionPayError, setTuitionPayError] = useState<string | null>(null);
  const [tuitionPaySuccess, setTuitionPaySuccess] = useState(false);

  // ── Fee breakdown modal ────────────────────────────────────────────────
  type FeeComponent = { name: string; amount: number };
  const [showBreakdownModal, setShowBreakdownModal] = useState(false);
  const [feeComponents, setFeeComponents] = useState<FeeComponent[]>([]);
  const [feeTotal, setFeeTotal] = useState(0);
  const [processingFee, setProcessingFee] = useState(300);
  const [paymentMode, setPaymentMode] = useState<"full" | "installment">(
    "full",
  );
  const [installmentPlans, setInstallmentPlans] = useState<any[]>([]);
  const [selectedInstallmentPlanId, setSelectedInstallmentPlanId] = useState<
    number | null
  >(null);
  const [installmentAmount, setInstallmentAmount] = useState<number | null>(
    null,
  );
  const [remainingPercentage, setRemainingPercentage] = useState<number>(100);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);

  // Check if fully paid
  const isFullyPaid = (() => {
    // 1. Did they make a successful full tuition payment (installment_plan_id is null/undefined)?
    const hasFullPayment = (paymentHistory || []).some(
      (p) =>
        p.payment_type === "tuition" &&
        p.is_successful &&
        !p.installment_plan_id,
    );
    if (hasFullPayment) return true;

    // 2. If installment plans exist, have they paid ALL of them successfully?
    if (installmentPlans && installmentPlans.length > 0) {
      const paidPlanIds = new Set(
        (paymentHistory || [])
          .filter(
            (p) =>
              p.payment_type === "tuition" &&
              p.is_successful &&
              p.installment_plan_id,
          )
          .map((p) => p.installment_plan_id),
      );
      const allPaid = installmentPlans.every((plan) =>
        paidPlanIds.has(plan.id),
      );
      return allPaid;
    }

    return false;
  })();

  const fetchStatus = async () => {
    if (isAuthenticated && !student?.is_first_login) {
      try {
        setLoadingStatus(true);
        const data = await ApiClient.getStudentCourses("First"); // Check first semester by default
        setRegStatus(data.registration_status);
      } catch (err) {
        console.error("Error fetching reg status:", err);
      } finally {
        setLoadingStatus(false);
      }
    }
  };

  const fetchExtraData = async () => {
    if (!isAuthenticated) return;
    try {
      const statusRes = await ApiClient.getApplicantStatus();
      setApplicantStatus(statusRes.applicant);

      try {
        const letterResponse = await ApiClient.getAdmissionLetter();
        setAdmissionLetter(letterResponse);
      } catch (e) {}

      try {
        const pHistory = await ApiClient.getPaymentHistory();
        setPaymentHistory(pHistory.payment_history);
      } catch (e) {}

      try {
        const plansRes = await ApiClient.getInstallmentPlans();
        setInstallmentPlans(plansRes.installment_plans || []);
      } catch (e) {}
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated && student?.is_first_login) {
      setShowPasswordChange(true);
    }
  }, [isLoading, isAuthenticated, student]);

  const handlePayTuition = async () => {
    // Step 1 — open the fee breakdown modal before touching Interswitch
    setTuitionPayError(null);
    setBreakdownError(null);
    setShowBreakdownModal(true);
    setLoadingBreakdown(true);
    try {
      const [breakdown, plansRes] = await Promise.all([
        ApiClient.getTuitionBreakdown(),
        ApiClient.getInstallmentPlans(),
      ]);
      setFeeComponents(breakdown.components);
      setFeeTotal(breakdown.total);
      setProcessingFee(
        typeof breakdown.processing_fee === "number"
          ? breakdown.processing_fee
          : 300,
      );
      const plans = plansRes.installment_plans || [];
      setInstallmentPlans(plans);

      const paidPlanIds = new Set<number>();
      (paymentHistory || []).forEach((p: any) => {
        if (
          p.payment_type === "tuition" &&
          p.is_successful &&
          p.installment_plan_id
        ) {
          paidPlanIds.add(p.installment_plan_id);
        }
      });

      const unpaidPlans = plans.filter((pl: any) => !paidPlanIds.has(pl.id));
      const remPct = unpaidPlans.length > 0 ? unpaidPlans.reduce((sum: number, pl: any) => sum + parseFloat(pl.percentage || 0), 0) : 100;
      setRemainingPercentage(remPct);

      if (plans.length > 0) {
        const next =
          plans.find((pl: any) => !paidPlanIds.has(pl.id)) || plans[0];
        if (next) {
          setSelectedInstallmentPlanId(next.id);
          setInstallmentAmount(
            parseFloat(
              (breakdown.total * (next.percentage / 100) || 0).toFixed(2),
            ),
          );
        } else {
          setSelectedInstallmentPlanId(null);
          setInstallmentAmount(null);
        }
      } else {
        setSelectedInstallmentPlanId(null);
        setInstallmentAmount(null);
      }
    } catch (err: any) {
      setBreakdownError(err.message || "Failed to load fee breakdown.");
    } finally {
      setLoadingBreakdown(false);
    }
  };

  const confirmAndPay = async () => {
    if (isPayingTuition) return;
    setIsPayingTuition(true);
    setTuitionPayError(null);
    try {
      const init = await ApiClient.initiatePayment(
        "tuition",
        undefined,
        undefined,
        paymentMode === "installment"
          ? (selectedInstallmentPlanId ?? undefined)
          : undefined,
      );

      setShowBreakdownModal(false);

      const url = new URL(init.redirect_url);
      const params = Object.fromEntries(url.searchParams.entries());

      const form = document.createElement("form");
      form.method = "POST";
      form.action = `${url.origin}/collections/w/pay`;

      Object.entries(params).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value;
        form.appendChild(input);
      });

      // Maintain legacy pay_item_name parameter just in case
      if (!params["pay_item_name"]) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "pay_item_name";
        input.value = "School Fees";
        form.appendChild(input);
      }

      document.body.appendChild(form);
      form.submit();
    } catch (err: any) {
      setTuitionPayError(
        err.message || "Failed to start payment. Please try again.",
      );
      setIsPayingTuition(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchExtraData();
  }, [isAuthenticated, student]);

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

  if (isLoading) {
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
            <div className="absolute top-0 right-0 p-8 opacity-15 group-hover:scale-110 transition-transform duration-300">
              <GraduationCap className="w-24 h-24" />
            </div>
            <CardHeader className="relative z-10 p-5 md:p-5 md:py-6">
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

          <Card className="hidden md:flex rounded-2xl border-[#e8dfd2] bg-white shadow-sm flex-col justify-center items-center text-center p-5 space-y-2 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
            <div className="bg-[#f3eee6] text-slate-700 border border-[#e2d6c3] p-3 rounded-2xl mb-1">
              <BookOpen className="w-6 h-6" />
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Current Level
            </p>
            <p className="text-2xl font-black text-slate-900">
              {student?.current_level}
            </p>
          </Card>

          <Card className="hidden md:flex rounded-2xl border-[#e8dfd2] bg-white shadow-sm flex-col justify-center items-center text-center p-5 space-y-2 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
            <div className="bg-[#fff7e8] text-[#9a6614] border border-[#efd9a8] p-3 rounded-2xl mb-1">
              <Calendar className="w-6 h-6" />
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Session
            </p>
            <p className="text-2xl font-black text-[#15110a]">
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
                  <CardTitle className="text-lg font-bold text-slate-800">
                    Course Registration
                  </CardTitle>
                </div>
                <CardDescription className="text-slate-500 mt-1">
                  Register your courses for the current semester. Ensure you
                  select all compulsory and core courses.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {regStatus === "submitted" ? (
                  <Button
                    variant="outline"
                    className="w-full gap-2 font-bold py-6 text-base border-[#cfe6d8] text-[#23704d] bg-[#eef7f1] hover:bg-[#e3f1e8] transition-all duration-200 shadow-sm"
                    onClick={() => router.push("/student/registration")}
                  >
                    View Registration
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  </Button>
                ) : (
                  <Button
                    className="w-full gap-2 font-bold py-6 text-base bg-[#151515] hover:bg-[#2a2a2a] text-white shadow-sm transition-all duration-200"
                    onClick={() => router.push("/student/registration")}
                  >
                    Go to Registration
                    <BookOpen className="w-5 h-5" />
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Pay School Fees Widget */}
          <Card
            id="school-fees"
            className="rounded-2xl shadow-sm border border-[#e8dfd2] hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group overflow-hidden bg-white"
          >
            <div className="h-1.5 bg-[#e39519] w-full" />
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="bg-[#fff7e8] text-[#9a6614] border border-[#efd9a8] p-2 rounded-xl group-hover:scale-105 transition-transform duration-300">
                  <CreditCard className="w-6 h-6" />
                </div>
                <CardTitle className="text-lg font-bold text-slate-800">
                  Pay School Fees
                </CardTitle>
              </div>
              <CardDescription className="text-slate-500 mt-1">
                {isAdmitted
                  ? "Complete your school fees payment to unlock full student portal access, including course registration."
                  : "Pay your school fees for the current session or complete installment payments."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-[#fffefa] rounded-xl border border-[#efd9a8]">
                <Clock className="w-5 h-5 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-700 font-medium">
                  {isAdmitted
                    ? "Your admission is confirmed. Pay school fees to complete enrolment."
                    : "Ensure your school fees are up to date."}
                </p>
              </div>

              {tuitionPayError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl border border-red-100">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{tuitionPayError}</p>
                </div>
              )}

              {tuitionPaySuccess ? (
                <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <p className="text-sm text-emerald-700 font-bold">
                    Payment confirmed!{" "}
                    {isAdmitted ? "Upgrading your account..." : ""}
                  </p>
                </div>
              ) : (
                <Button
                  className={`w-full gap-2 font-bold py-6 text-base shadow-lg transition-all duration-200 ${
                    isFullyPaid
                      ? "bg-[#eef7f1] text-[#23704d] hover:bg-[#eef7f1] shadow-none border border-[#cfe6d8]"
                      : "bg-[#151515] hover:bg-[#2a2a2a] text-white shadow-sm"
                  }`}
                  onClick={handlePayTuition}
                  disabled={isPayingTuition || isFullyPaid}
                >
                  {isPayingTuition ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Opening Payment...
                    </>
                  ) : isFullyPaid ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      Fees Fully Paid
                    </>
                  ) : (
                    <>Proceed to Pay Fees</>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Profile & Settings Widget */}
          <Card className="rounded-2xl shadow-sm border border-[#e8dfd2] hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group overflow-hidden bg-white">
            <div className="h-1.5 bg-[#b85d75] w-full" />
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="bg-[#f8eef2] text-[#881337] border border-[#ead2db] p-2 rounded-xl group-hover:scale-105 transition-transform duration-300">
                  <User className="w-6 h-6" />
                </div>
                <CardTitle className="text-lg font-bold text-slate-800">
                  Profile Information
                </CardTitle>
              </div>
              <CardDescription className="text-slate-500 mt-1">
                View your student profile details and account status.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl hover:bg-[#f7f1e8] transition-colors border border-[#eee5d8] bg-[#fbfaf7]">
                  <span className="text-sm font-semibold text-slate-500">
                    Full Name
                  </span>
                  <span className="text-sm font-bold text-slate-800">
                    {user?.name}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl hover:bg-[#f7f1e8] transition-colors border border-[#eee5d8] bg-[#fbfaf7]">
                  <span className="text-sm font-semibold text-slate-500">
                    Portal Username
                  </span>
                  <span className="text-sm font-bold font-mono text-[#5c4520] bg-[#ead6aa] p-1 px-3 rounded-lg border border-[#d5b875]">
                    {user?.username || "N/A"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl hover:bg-[#f7f1e8] transition-colors border border-[#eee5d8] bg-[#fbfaf7]">
                  <span className="text-sm font-semibold text-slate-500">
                    Email Address
                  </span>
                  <span className="text-sm font-bold text-slate-800">
                    {user?.email}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
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
                  <DollarSign className="w-5 h-5" />
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
                  <div className="bg-[#fff7e8] text-[#9a6614] border border-[#efd9a8] w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300">
                    <DollarSign className="h-6 w-6" />
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

      {/* ── Fee Breakdown Modal ────────────────────────────────────────────── */}
      {showBreakdownModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-6 text-white">
              <div className="flex items-center gap-3 mb-1">
                <CreditCard className="w-6 h-6" />
                <h3 className="text-xl font-black tracking-tight">
                  School Fees Breakdown
                </h3>
              </div>
              <p className="text-amber-100 text-sm font-medium">
                Review your fee components before proceeding to payment.
              </p>
            </div>

            <div className="p-6 space-y-5">
              {/* Loading skeleton */}
              {loadingBreakdown && (
                <div className="space-y-3 animate-pulse">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center py-3 border-b border-slate-100"
                    >
                      <div className="h-4 bg-slate-200 rounded w-2/3" />
                      <div className="h-4 bg-slate-200 rounded w-1/4" />
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2">
                    <div className="h-5 bg-slate-200 rounded w-1/3" />
                    <div className="h-5 bg-amber-200 rounded w-1/4" />
                  </div>
                </div>
              )}

              {/* Error state */}
              {breakdownError && !loadingBreakdown && (
                <div className="flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-200">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-red-800">
                      Could not load fee breakdown
                    </p>
                    <p className="text-sm text-red-600 mt-0.5">
                      {breakdownError}
                    </p>
                  </div>
                </div>
              )}

              {/* Fee component rows */}
              {!loadingBreakdown &&
                !breakdownError &&
                feeComponents.length > 0 && (
                  <div className="space-y-1">
                    {/* Payment mode toggle */}
                    <div className="flex items-center gap-2 mb-3">
                      <button
                        className={`px-3 py-2 rounded-lg font-semibold ${paymentMode === "full" ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-700"}`}
                        onClick={() => {
                          setPaymentMode("full");
                          setInstallmentAmount(null);
                        }}
                      >
                        Full Payment
                      </button>
                      <button
                        className={`px-3 py-2 rounded-lg font-semibold ${paymentMode === "installment" ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-700"}`}
                        onClick={() => {
                          setPaymentMode("installment");
                          // compute amount for currently selected plan
                          const plan =
                            installmentPlans.find(
                              (p) => p.id === selectedInstallmentPlanId,
                            ) || installmentPlans[0];
                          if (plan) {
                            setSelectedInstallmentPlanId(plan.id);
                            setInstallmentAmount(
                              parseFloat(
                                (
                                  feeTotal * (plan.percentage / 100) || 0
                                ).toFixed(2),
                              ),
                            );
                          }
                        }}
                      >
                        Installments
                      </button>
                    </div>

                    {paymentMode === "installment" && installmentPlans.length > 0 && (
                      <div className="space-y-2 pt-2 pb-4 animate-in fade-in duration-200">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                          Tuition Installments (Read-Only)
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          {installmentPlans.map((plan) => (
                            <div
                              key={plan.id}
                              className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all opacity-80 ${
                                selectedInstallmentPlanId === plan.id
                                  ? "border-[#6b357d] bg-[#6b357d]/5 text-[#6b357d] font-bold shadow-sm"
                                  : "border-slate-200 text-slate-500 bg-slate-50/50"
                              }`}
                            >
                              <span className="text-xs font-bold truncate">{plan.name} ({plan.percentage}%)</span>
                              <span className="text-xs font-black font-mono mt-1">
                                ₦{(feeTotal * (plan.percentage / 100)).toLocaleString("en-NG", {
                                  minimumFractionDigits: 2,
                                })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {feeComponents.map((fc, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between items-center py-3 border-b border-slate-100 last:border-0"
                      >
                        <span className="text-sm font-semibold text-slate-700">
                          {fc.name}
                        </span>
                        <span className="text-sm font-bold text-slate-900 tabular-nums">
                          ₦
                          {fc.amount.toLocaleString("en-NG", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    ))}

                    {/* Processing fee row */}
                    <div className="flex justify-between items-center py-3 border-b border-slate-100">
                      <span className="text-sm font-semibold text-slate-500">
                        Processing Fee
                      </span>
                      <span className="text-sm font-bold text-slate-700 tabular-nums">
                        ₦
                        {processingFee.toLocaleString("en-NG", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>

                    {/* Total row */}
                    <div className="flex justify-between items-center pt-4 mt-2 border-t-2 border-amber-300">
                      <span className="text-base font-black text-slate-800 uppercase tracking-tight">
                        Total Payable
                      </span>
                      <span className="text-xl font-black text-amber-600 tabular-nums">
                        ₦
                        {((paymentMode === "installment" ? (installmentAmount || 0) : (feeTotal * (remainingPercentage / 100))) + processingFee).toLocaleString("en-NG", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>
                )}

              {/* Empty state */}
              {!loadingBreakdown &&
                !breakdownError &&
                feeComponents.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-4 italic">
                    No fee components found. Please contact the accounts office.
                  </p>
                )}

              {/* Payment error (from previous attempt) */}
              {tuitionPayError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl border border-red-200">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{tuitionPayError}</p>
                </div>
              )}

              {/* Success state */}
              {tuitionPaySuccess && (
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-200">
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                  <p className="text-sm text-green-700 font-bold">
                    Payment confirmed! Upgrading your account...
                  </p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col gap-3 pt-2">
                {!tuitionPaySuccess && (
                  <Button
                    className="w-full h-14 font-black text-lg bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-lg shadow-amber-500/30 disabled:opacity-70"
                    onClick={confirmAndPay}
                    disabled={
                      isPayingTuition ||
                      loadingBreakdown ||
                      !!breakdownError ||
                      feeComponents.length === 0 ||
                      (paymentMode === "installment" &&
                        !selectedInstallmentPlanId)
                    }
                  >
                    {isPayingTuition ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        Opening Payment...
                      </>
                    ) : (
                      <>Confirm & Pay</>
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="w-full text-slate-500 font-medium"
                  onClick={() => {
                    setShowBreakdownModal(false);
                    setTuitionPayError(null);
                  }}
                  disabled={isPayingTuition}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
