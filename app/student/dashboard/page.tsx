"use client";

// ── Interswitch inline checkout types ────────────────────────────────────────
declare global {
  interface Window {
    webpayCheckout: (config: {
      merchant_code: string;
      pay_item_id: string;
      txn_ref: string;
      amount: number;
      currency: number;
      site_redirect_url: string;
      mode: "TEST" | "LIVE";
      onComplete: (response: { resp: string; [key: string]: any }) => void;
    }) => void;
  }
}
const ISW_SCRIPT_URL = "https://newwebpay.interswitchng.com/inline-checkout.js";

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

  // ── Tuition payment states (Interswitch) ────────────────────────────────────
  const [scriptReady, setScriptReady] = useState(false);
  const [isPayingTuition, setIsPayingTuition] = useState(false);
  const [tuitionPayError, setTuitionPayError] = useState<string | null>(null);
  const [tuitionPaySuccess, setTuitionPaySuccess] = useState(false);

  // ── Fee breakdown modal ────────────────────────────────────────────────
  type FeeComponent = { name: string; amount: number };
  const [showBreakdownModal, setShowBreakdownModal] = useState(false);
  const [feeComponents, setFeeComponents] = useState<FeeComponent[]>([]);
  const [feeTotal, setFeeTotal] = useState(0);
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
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);

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
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated && student?.is_first_login) {
      setShowPasswordChange(true);
    }
  }, [isLoading, isAuthenticated, student]);

  // Load Interswitch inline checkout script once (needed for admitted users paying tuition)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (document.getElementById("isw-inline-checkout")) {
      setScriptReady(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "isw-inline-checkout";
    script.src = ISW_SCRIPT_URL;
    script.onload = () => setScriptReady(true);
    script.onerror = () =>
      setTuitionPayError("Failed to load payment gateway. Please refresh.");
    document.head.appendChild(script);
  }, []);

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
      setInstallmentPlans(plansRes.installment_plans || []);
      // Determine next unpaid installment based on paymentHistory
      const plans = plansRes.installment_plans || [];
      if (plans.length > 0) {
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
    // Step 2 — user confirmed the breakdown, now launch Interswitch
    if (isPayingTuition || !scriptReady) return;
    setIsPayingTuition(true);
    setTuitionPayError(null);
    try {
      const init = await ApiClient.initiatePayment(
        "tuition",
        undefined,
        undefined,
        paymentMode === "installment" ? selectedInstallmentPlanId : undefined,
      );
      const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/e-portal/applicant/payment/callback`;

      if (typeof window.webpayCheckout !== "function") {
        throw new Error("Payment gateway not ready. Please refresh the page.");
      }

      // Close the breakdown modal before the ISW overlay opens
      setShowBreakdownModal(false);

      window.webpayCheckout({
        merchant_code: init.merchant_code,
        pay_item_id: init.pay_item_id,
        txn_ref: init.reference_no,
        amount: init.amount_kobo,
        currency: 566,
        site_redirect_url: callbackUrl,
        mode: "LIVE",
        onComplete: async (response: any) => {
          if (
            response?.resp &&
            response.resp !== "00" &&
            response.resp !== "Z0" &&
            response.resp !== "T0"
          ) {
            try {
              await ApiClient.cancelPayment(init.reference_no);
            } catch {}
            setTuitionPayError("Payment was cancelled. Please try again.");
            setIsPayingTuition(false);
            return;
          }
          try {
            const verification = await ApiClient.verifyPayment(
              init.reference_no,
            );
            if (verification.is_successful) {
              ApiClient.clearCache();
              setTuitionPaySuccess(true);
              // Role upgrade happens server-side — reload so the new 'student' token takes effect
              setTimeout(() => window.location.reload(), 2000);
            } else if (verification.tran_status === "pending") {
              setTuitionPayError(
                "Payment is still processing. Your status will update automatically — please wait a moment.",
              );
            } else {
              setTuitionPayError(
                verification.response_desc || "Payment was not completed.",
              );
            }
          } catch (err: any) {
            setTuitionPayError(
              err.message ||
                "Verification failed. Contact support if funds were debited.",
            );
          } finally {
            setIsPayingTuition(false);
          }
        },
      });
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
  router.replace("/"); 
  await logout();       
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
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Welcome & Info */}
        <div className="grid md:grid-cols-4 gap-6">
          <Card className="md:col-span-2 overflow-hidden border-none shadow-lg bg-primary text-primary-foreground relative group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
              <GraduationCap className="w-24 h-24" />
            </div>
            <CardHeader className="relative z-10">
              <CardTitle className="text-2xl font-bold">
                Welcome, {user?.name}
              </CardTitle>
              <CardDescription className="text-primary-foreground/80 font-medium">
                Matric Number: {student?.matric_number}
              </CardDescription>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge
                  variant="secondary"
                  className="bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30 border-none px-3 py-1"
                >
                  {student?.current_level}
                </Badge>
                <Badge
                  variant="secondary"
                  className="bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30 border-none px-3 py-1"
                >
                  {student?.session}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-md border-primary/10 flex flex-col justify-center items-center text-center p-6 space-y-2">
            <div className="bg-blue-100 p-3 rounded-full mb-2">
              <BookOpen className="w-6 h-6 text-blue-600" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Current Level
            </p>
            <p className="text-xl font-bold">{student?.current_level}</p>
          </Card>

          <Card className="shadow-md border-primary/10 flex flex-col justify-center items-center text-center p-6 space-y-2">
            <div className="bg-green-100 p-3 rounded-full mb-2">
              <Calendar className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Session</p>
            <p className="text-xl font-bold">{student?.session}</p>
          </Card>
        </div>

        {/* Action Widgets */}
        <div className={`grid md:grid-cols-2 ${!isAdmitted ? "lg:grid-cols-3" : ""} gap-8`}>
          {/* Course Registration Widget — full students only */}
          {!isAdmitted && (
            <Card className="shadow-lg border-2 border-primary/5 hover:border-primary/20 transition-all group overflow-hidden">
              <div className="h-2 bg-primary w-full shadow-sm" />
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-lg group-hover:bg-primary/20 transition-colors">
                    <BookOpen className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">Course Registration</CardTitle>
                </div>
                <CardDescription>
                  Register your courses for the current semester. Ensure you
                  select all compulsory and core courses.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  variant={regStatus === "submitted" ? "outline" : "default"}
                  className="w-full gap-2 font-bold py-6 text-lg hover:scale-[1.02] transition-transform shadow-lg"
                  onClick={() => router.push("/student/registration")}
                >
                  {regStatus === "submitted"
                    ? "View Registration"
                    : "Go to Registration"}
                  {regStatus === "submitted" ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <BookOpen className="w-5 h-5" />
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Pay School Fees Widget */}
          <Card
            id="school-fees"
            className="shadow-lg border-2 border-amber-400/30 hover:border-amber-400/60 transition-all group overflow-hidden"
          >
            <div className="h-2 bg-amber-400 w-full shadow-sm" />
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="bg-amber-50 p-2 rounded-lg group-hover:bg-amber-100 transition-colors"></div>
                <CardTitle className="text-lg">Pay School Fees</CardTitle>
              </div>
              <CardDescription>
                {isAdmitted
                  ? "Complete your school fees payment to unlock full student portal access, including course registration."
                  : "Pay your school fees for the current session or complete installment payments."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <Clock className="w-5 h-5 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-700 font-medium">
                  {isAdmitted
                    ? "Your admission is confirmed. Pay school fees to complete enrolment."
                    : "Ensure your school fees are up to date."}
                </p>
              </div>

              {tuitionPayError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{tuitionPayError}</p>
                </div>
              )}

              {tuitionPaySuccess ? (
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                  <p className="text-sm text-green-700 font-bold">
                    Payment confirmed! {isAdmitted ? "Upgrading your account..." : ""}
                  </p>
                </div>
              ) : (
                <Button
                  className="w-full gap-2 font-bold py-6 text-lg bg-amber-500 hover:bg-amber-600 text-white hover:scale-[1.02] transition-transform shadow-lg disabled:opacity-70 disabled:scale-100"
                  onClick={handlePayTuition}
                  disabled={isPayingTuition || !scriptReady}
                >
                  {isPayingTuition ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Opening Payment...
                    </>
                  ) : (
                    <>{scriptReady ? "Proceed to Pay Fees" : "Loading..."}</>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Profile & Settings Widget */}
          <Card className="shadow-lg border-2 border-primary/5 hover:border-primary/20 transition-all group overflow-hidden">
            <div className="h-2 bg-secondary w-full shadow-sm" />
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="bg-secondary/10 p-2 rounded-lg group-hover:bg-secondary/20 transition-colors">
                  <User className="w-6 h-6 text-secondary-foreground" />
                </div>
                <CardTitle className="text-lg">Profile Information</CardTitle>
              </div>
              <CardDescription>
                View and update your student profile details and account
                settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors border-b">
                  <span className="text-sm font-medium text-muted-foreground">
                    Full Name
                  </span>
                  <span className="text-sm font-bold">{user?.name}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors border-b">
                  <span className="text-sm font-medium text-muted-foreground">
                    Portal Username
                  </span>
                  <span className="text-sm font-bold font-mono bg-muted p-1 px-2 rounded">
                    {user?.username || "N/A"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <span className="text-sm font-medium text-muted-foreground">
                    Email Address
                  </span>
                  <span className="text-sm font-bold">{user?.email}</span>
                </div>
                <Button variant="outline" className="w-full mt-4" disabled>
                  Edit Profile (Disabled)
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Admission Letter - From Applicant flow into Student dashboard */}
        <Card
          id="admission-documents"
          className="mb-8 overflow-hidden border-2 border-primary/20 shadow-xl mt-8"
        >
          <div className="bg-primary/5 p-6 border-b border-primary/10">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl text-primary">
                  Official Admission Documents
                </CardTitle>
                <CardDescription className="text-base mt-2">
                  Access and download your official enrollment documents
                  anytime.
                </CardDescription>
              </div>
            </div>
          </div>

          <CardContent className="p-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Admission Letter Download */}
              <div className="bg-background border rounded-xl p-5 hover:border-primary/50 transition-all group shadow-sm">
                <div className="bg-blue-50 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <FileText className="text-blue-600 h-6 w-6" />
                </div>
                <h4 className="font-bold text-lg mb-2">
                  Provisional Admission Letter
                </h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Your official letter of admission for your program.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setShowLetter(!showLetter)}
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    disabled={!admissionLetter}
                  >
                    {showLetter ? "Close Preview" : "Preview"}
                  </Button>
                  <Button
                    onClick={handlePrintPDF}
                    size="sm"
                    className="flex-1 gap-2"
                    disabled={printLoading || !admissionLetter}
                  >
                    <Download className="h-4 w-4" />
                    {printLoading ? "..." : "PDF"}
                  </Button>
                </div>
              </div>

              {/* Medical Form Download */}
              <div className="bg-background border rounded-xl p-5 hover:border-primary/50 transition-all group shadow-sm">
                <div className="bg-green-50 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <FileText className="text-green-600 h-6 w-6" />
                </div>
                <h4 className="font-bold text-lg mb-2">
                  Medical Examination Form
                </h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Print and take to a certified hospital for examination.
                </p>
                <Button
                  onClick={handleDownloadMedicalForm}
                  disabled={
                    downloading === "medical_form" ||
                    !applicantStatus?.has_paid_tuition
                  }
                  className="w-full gap-2"
                >
                  <Download className="h-4 w-4" />
                  {downloading === "medical_form"
                    ? "Downloading..."
                    : "Download PDF"}
                </Button>
              </div>

              {/* Additional Forms Download */}
              <div className="bg-background border rounded-xl p-5 hover:border-primary/50 transition-all group shadow-sm">
                <div className="bg-orange-50 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Settings className="text-orange-600 h-6 w-6" />
                </div>
                <h4 className="font-bold text-lg mb-2">Notice & Affidavit</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Official resumption notice and good conduct affidavit.
                </p>
                <div className="space-y-2">
                  <Button
                    onClick={handleDownloadNotice}
                    variant="outline"
                    size="sm"
                    disabled={downloading === "admission_notice"}
                    className="w-full gap-2 justify-start"
                  >
                    <Download className="h-4 w-4 text-orange-600" />
                    {downloading === "admission_notice"
                      ? "..."
                      : "Admission Notice"}
                  </Button>
                  <Button
                    onClick={handleDownloadAffidavit}
                    variant="outline"
                    size="sm"
                    disabled={downloading === "affidavit"}
                    className="w-full gap-2 justify-start"
                  >
                    <Download className="h-4 w-4 text-orange-600" />
                    {downloading === "affidavit" ? "..." : "Conduct Affidavit"}
                  </Button>
                </div>
              </div>

              {/* Receipts Section */}
              <div className="bg-background border rounded-xl p-5 hover:border-primary/50 transition-all group shadow-sm">
                <div className="bg-purple-50 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"></div>
                <h4 className="font-bold text-lg mb-2">Payment Receipts</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Download official receipts for your completed payments.
                </p>
                <div className="space-y-2">
                  {paymentHistory.map((pt) => (
                    <div
                      key={pt.transaction_id}
                      className="flex items-center justify-between p-2 bg-muted/30 rounded-lg border text-sm"
                    >
                      <span className="capitalize">
                        {pt.payment_type.replace("_", " ")}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-primary hover:text-primary hover:bg-primary/10"
                        onClick={() =>
                          handleDownloadReceipt(pt.receipt_no, pt.payment_type)
                        }
                        disabled={downloading === `receipt_${pt.receipt_no}`}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Receipt
                      </Button>
                    </div>
                  ))}
                  {paymentHistory.length === 0 && (
                    <p className="text-xs text-center text-muted-foreground py-2 italic">
                      No payment records found.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {showLetter && (
              <div className="mt-8 border rounded-xl overflow-hidden shadow-inner bg-slate-50 p-8">
                <div className="bg-white p-12 shadow-2xl mx-auto max-w-[850px]">
                  {admissionLetter ? (
                    <FsmsAdmissionLetter {...admissionLetter} />
                  ) : (
                    <div className="text-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
                      <p className="text-muted-foreground mt-4">
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

                    {/* Total row */}
                    <div className="flex justify-between items-center pt-4 mt-2 border-t-2 border-amber-300">
                      <span className="text-base font-black text-slate-800 uppercase tracking-tight">
                        Total Payable
                      </span>
                      <span className="text-xl font-black text-amber-600 tabular-nums">
                        ₦
                        {feeTotal.toLocaleString("en-NG", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>

                    {/* Installment amount (if selected) */}
                    {paymentMode === "installment" &&
                      installmentAmount !== null && (
                        <div className="flex justify-between items-center pt-3">
                          <span className="text-sm font-semibold text-slate-700">
                            Amount to pay now
                          </span>
                          <span className="text-lg font-black text-amber-600 tabular-nums">
                            ₦
                            {installmentAmount.toLocaleString("en-NG", {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      )}
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
                      !scriptReady ||
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
                      <>
                        {scriptReady ? "Confirm & Pay" : "Loading gateway..."}
                      </>
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
