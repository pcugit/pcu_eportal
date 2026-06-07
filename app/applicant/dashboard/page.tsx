"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  ApiClient,
  ApplicantStatus,
  AdmissionLetterData,
  PaymentTransaction,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LogOut,
  FileText,
  DollarSign,
  Download,
  Settings,
  Printer,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  ChevronRight,
  Loader2,
  GraduationCap,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import RecommendationCard from "@/components/RecommendationCard";
import { Recommendation } from "@/lib/api";
import ApplicationFormComponent from "@/components/ApplicationForm";
import FsmsAdmissionLetter from "@/components/FsmsAdmissionLetter";
import ApplicantProfile from "@/components/ApplicantProfile";

const TYPE_STYLES: Record<number, { color: string; border: string }> = {
  1: { color: "from-blue-500/10 to-blue-600/5", border: "border-blue-200" },
  2: {
    color: "from-amber-500/10 to-amber-600/5",
    border: "border-amber-200",
  },
  3: { color: "from-amber-500/10 to-amber-600/5", border: "border-amber-200" },
  4: { color: "from-pink-500/10 to-pink-600/5", border: "border-pink-200" },
  5: {
    color: "from-emerald-500/10 to-emerald-600/5",
    border: "border-emerald-200",
  },
  6: {
    color: "from-indigo-500/10 to-indigo-600/5",
    border: "border-indigo-200",
  },
  7: { color: "from-rose-500/10 to-rose-600/5", border: "border-rose-200" },
};

interface DynamicProgramForm {
  id: number;
  typeId: number;
  name: string;
  fee: number;
  color: string;
  border: string;
}

export default function ApplicantDashboard() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      }
    >
      <ApplicantDashboardInner />
    </Suspense>
  );
}

function ApplicantDashboardInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isAuthenticated, logout, refreshStatus } = useAuth();
  const [status, setStatus] = useState<ApplicantStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [admissionLetter, setAdmissionLetter] =
    useState<AdmissionLetterData | null>(null);
  const [showLetter, setShowLetter] = useState(false);
  const [showAdmissionModal, setShowAdmissionModal] = useState(false);

  // Admitted student states — tuition payment & document downloads
  const isAdmitted = user?.role === "admitted" || user?.role === "student";
  const [copiedMatric, setCopiedMatric] = useState(false);
  const [isPayingTuition, setIsPayingTuition] = useState(false);
  const [tuitionPayError, setTuitionPayError] = useState<string | null>(null);
  const [tuitionPaySuccess, setTuitionPaySuccess] = useState(false);
  const [showBreakdownModal, setShowBreakdownModal] = useState(false);
  type FeeComponent = { name: string; amount: number };
  const [feeComponents, setFeeComponents] = useState<FeeComponent[]>([]);
  const [feeTotal, setFeeTotal] = useState(0);
  const [tuitionProcessingFee, setTuitionProcessingFee] = useState(300);
  const [paymentMode, setPaymentMode] = useState<"full" | "installment">("full");
  const [installmentPlans, setInstallmentPlans] = useState<any[]>([]);
  const [selectedInstallmentPlanId, setSelectedInstallmentPlanId] = useState<number | null>(null);
  const [installmentAmount, setInstallmentAmount] = useState<number | null>(null);
  const [remainingPercentage, setRemainingPercentage] = useState<number>(100);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);
  const [printLoading, setPrintLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentTransaction[]>([]);

  const [applicants, setApplicants] = useState<ApplicantStatus[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [programTypes, setProgramTypes] = useState<DynamicProgramForm[]>([]);
  const [formTemplate, setFormTemplate] = useState<any>(null);
  const [viewingFormId, setViewingFormId] = useState<number | null>(null);
  const [submittedFormData, setSubmittedFormData] = useState<any>(null);
  const [submittedDocuments, setSubmittedDocuments] = useState<any[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [acceptanceFeeData, setAcceptanceFeeData] = useState<{
    amount: number;
    feeName: string;
    paid: boolean;
  } | null>(null);
  const [preloadedForms, setPreloadedForms] = useState<
    Record<number, { form: any; documents: any[] }>
  >({});
  const [preloadedTemplates, setPreloadedTemplates] = useState<
    Record<number, any>
  >({}); // keyed by program_type_id

  // Payment states
  const [selectedForm, setSelectedForm] = useState<DynamicProgramForm | null>(
    null,
  );
  const [paymentStep, setPaymentStep] = useState<
    "selection" | "confirmation" | "processing"
  >("selection");
  const [isProcessing, setIsProcessing] = useState(false);
  const [payResult, setPayResult] = useState<"success" | "failed" | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [processingFee, setProcessingFee] = useState<number>(0);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const getAdmissionModalSessionKey = (applicant?: any) =>
    `pcu-admission-offer-modal:${applicant?.id ?? user?.username ?? "applicant"}`;

  const openApplicantProfile = async (app: ApplicantStatus) => {
    setViewingFormId(app.id);

    const cachedTemplate = preloadedTemplates[app.program_type_id];
    const cachedForm = preloadedForms[app.id];

    if (cachedTemplate) setFormTemplate(cachedTemplate);
    if (cachedForm) {
      setSubmittedFormData(cachedForm.form);
      setSubmittedDocuments(cachedForm.documents);
    }

    const fullyReady = !!cachedTemplate && !!cachedForm;
    if (!fullyReady) setProfileLoading(true);

    try {
      const [templateResult, formResult] = await Promise.all([
        cachedTemplate
          ? Promise.resolve(cachedTemplate)
          : ApiClient.getFormTemplate(app.program_type_id),
        cachedForm
          ? Promise.resolve(cachedForm)
          : ApiClient.getForm(app.id)
              .then((r) => ({
                form: r.form ?? r,
                documents: r.documents ?? [],
              }))
              .catch(() => ({
                form: null,
                documents: [],
              })),
      ]);

      if (!cachedTemplate) {
        setFormTemplate(templateResult);
        setPreloadedTemplates((prev) => ({
          ...prev,
          [app.program_type_id]: templateResult,
        }));
      }

      if (!cachedForm) {
        const resolvedForm = formResult as any;
        setSubmittedFormData(resolvedForm.form);
        setSubmittedDocuments(resolvedForm.documents ?? []);
        setPreloadedForms((prev) => ({
          ...prev,
          [app.id]: {
            form: resolvedForm.form,
            documents: resolvedForm.documents ?? [],
          },
        }));
      }

      if (["admitted", "accepted"].includes(app.application_status)) {
        try {
          const feeData = await ApiClient.getAcceptanceFee();
          setAcceptanceFeeData({
            amount: feeData.acceptance_fee + feeData.processing_fee,
            feeName: feeData.fee_name,
            paid: app.has_paid_acceptance_fee,
          });
        } catch (e) {
          console.error("Failed to load acceptance fee", e);
        }
      } else {
        setAcceptanceFeeData(null);
      }
    } catch (e) {
      console.error("Failed to load form data", e);
    } finally {
      setProfileLoading(false);
    }
  };

  const openAdmissionOfferProfile = async () => {
    const admittedApp = applicants.find(
      (app) =>
        app.has_paid_application_fee &&
        ["admitted", "accepted"].includes(app.application_status),
    );

    if (!admittedApp) {
      setShowAdmissionModal(false);
      return;
    }

    if (typeof window !== "undefined") {
      sessionStorage.setItem(getAdmissionModalSessionKey(status), "seen");
    }

    setShowAdmissionModal(false);
    await openApplicantProfile(admittedApp);
  };

  const loadStatus = async () => {
    try {
      const response = await ApiClient.getApplicantStatus();
      setStatus(response.applicant);
      const apps = response.applicants || [];
      setApplicants(apps);

      if (response.applicant?.admission_status === "admitted") {
        if (!response.applicant.has_paid_acceptance_fee) {
          const modalSeen =
            typeof window !== "undefined" &&
            sessionStorage.getItem(
              getAdmissionModalSessionKey(response.applicant),
            ) === "seen";
          setShowAdmissionModal(!modalSeen);
        } else {
          setShowAdmissionModal(false);
        }
        try {
          const letterResponse = await ApiClient.getAdmissionLetter();
          setAdmissionLetter(letterResponse);
        } catch {
          setAdmissionLetter(null);
        }
      }

      // For admitted users, also fetch payment history
      if (isAdmitted) {
        try {
          const pHistory = await ApiClient.getPaymentHistory();
          setPaymentHistory(pHistory.payment_history || []);
        } catch {}
        try {
          const plansRes = await ApiClient.getInstallmentPlans();
          setInstallmentPlans(plansRes.installment_plans || []);
        } catch {}
      }

      // Auto-open profile when redirected from acceptance_fee payment success
      if (searchParams.get("view") === "profile") {
        // Find the admitted/accepted application
        const admittedApp = apps.find(
          (a: ApplicantStatus) =>
            a.has_paid_application_fee &&
            ["admitted", "accepted", "submitted", "screening", "enrolled"].includes(
              a.application_status,
            ),
        );
        if (admittedApp) {
          setViewingFormId(admittedApp.id);
          setProfileLoading(true);
          try {
            const [template, formResult] = await Promise.all([
              ApiClient.getFormTemplate(admittedApp.program_type_id),
              ApiClient.getForm(admittedApp.id)
                .then((r) => ({
                  form: r.form ?? r,
                  documents: r.documents ?? [],
                }))
                .catch(() => ({ form: null, documents: [] })),
            ]);
            setFormTemplate(template);
            setSubmittedFormData((formResult as any).form);
            setSubmittedDocuments((formResult as any).documents ?? []);
            // Cache so re-opening this row skips the network round-trip
            setPreloadedTemplates((prev) => ({
              ...prev,
              [admittedApp.program_type_id]: template,
            }));
            setPreloadedForms((prev) => ({
              ...prev,
              [admittedApp.id]: {
                form: (formResult as any).form,
                documents: (formResult as any).documents ?? [],
              },
            }));
            // Load acceptance fee info for the banner
            try {
              const feeData = await ApiClient.getAcceptanceFee();
              setAcceptanceFeeData({
                amount: feeData.acceptance_fee + feeData.processing_fee,
                feeName: feeData.fee_name,
                paid: admittedApp.has_paid_acceptance_fee,
              });
            } catch {}
          } catch (e) {
            console.error(
              "Failed to load profile after acceptance fee payment",
              e,
            );
          } finally {
            setProfileLoading(false);
          }
        }
        // Clean the query param without a full page reload
        router.replace("/applicant/dashboard", { scroll: false });
      }

      try {
        const ptData = await ApiClient.getProgramTypes();
        const forms: DynamicProgramForm[] = ptData.program_types.map(
          (type: any) => {
            const style = TYPE_STYLES[type.id] || {
              color: "from-slate-500/10 to-slate-600/5",
              border: "border-slate-200",
            };
            return {
              id: type.id,
              typeId: type.id,
              name: type.name,
              fee: type.fee,
              ...style,
            };
          },
        );
        setProgramTypes(forms);
      } catch (err) {
        console.error("Error loading program types:", err);
      }

      // Form data is loaded lazily when the user opens a specific application
      // (see the "Apply / Profile" onClick handler in ApplicationsTable).
      // We do NOT preload all N forms upfront to avoid N parallel API requests
      // on every loadStatus call, especially for users with multiple paid forms.
    } catch (err) {
      console.error("Error loading status:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    loadStatus();
  }, [isAuthenticated]);

  /**
   * Initiates a redirect-based payment for the application fee.
   * The user is sent to Quickteller Webpay and returns to the callback page.
   */
  const handlePayNow = async () => {
    if (!selectedForm || isProcessing) return;
    setIsProcessing(true);
    setPayError(null);
    try {
      const init = await ApiClient.initiatePayment(
        "application_fee",
        selectedForm.typeId,
      );
      if (typeof init.processing_fee === "number") {
        setProcessingFee(init.processing_fee);
      }
      
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

      document.body.appendChild(form);
      form.submit();
    } catch (err: any) {
      console.error("Error initiating payment:", err);
      setPayError(err.message || "Failed to start payment. Please try again.");
      setIsProcessing(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/auth/login");
  };

  // ── Admitted student handlers ──────────────────────────────────────────────
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
      alert(err instanceof Error ? err.message : "Failed to download medical form");
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

  const handlePayTuition = async () => {
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
      setTuitionProcessingFee(
        typeof breakdown.processing_fee === "number" ? breakdown.processing_fee : 300,
      );
      const plans = plansRes.installment_plans || [];
      setInstallmentPlans(plans);

      const paidPlanIds = new Set<number>();
      (paymentHistory || []).forEach((p: any) => {
        if (p.payment_type === "tuition" && p.is_successful && p.installment_plan_id) {
          paidPlanIds.add(p.installment_plan_id);
        }
      });
      const unpaidPlans = plans.filter((pl: any) => !paidPlanIds.has(pl.id));
      const remPct = unpaidPlans.length > 0 ? unpaidPlans.reduce((sum: number, pl: any) => sum + parseFloat(pl.percentage || 0), 0) : 100;
      setRemainingPercentage(remPct);

      if (plans.length > 0) {
        const next = plans.find((pl: any) => !paidPlanIds.has(pl.id)) || plans[0];
        if (next) {
          setSelectedInstallmentPlanId(next.id);
          setInstallmentAmount(
            parseFloat((breakdown.total * (next.percentage / 100) || 0).toFixed(2)),
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

  const confirmAndPayTuition = async () => {
    if (isPayingTuition) return;
    setIsPayingTuition(true);
    setTuitionPayError(null);
    try {
      const init = await ApiClient.initiatePayment(
        "tuition",
        undefined,
        undefined,
        paymentMode === "installment" ? (selectedInstallmentPlanId ?? undefined) : undefined,
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
      setTuitionPayError(err.message || "Failed to start payment. Please try again.");
      setIsPayingTuition(false);
    }
  };

  // Admitted student documents section rendered both on dashboard and profile page
  const renderOfficialDocuments = () => {
    return (
      <Card className="overflow-hidden border border-[#e8dfd2] shadow-sm bg-[#fffefa] animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-[#fbfaf7] p-5 sm:p-6 border-b border-[#eee5d8]">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg sm:text-xl font-semibold text-slate-900">
                Official Admission Documents
              </CardTitle>
              <CardDescription className="text-sm mt-1 text-slate-500">
                Access and download your official enrollment documents anytime.
              </CardDescription>
            </div>
          </div>
        </div>

        <CardContent className="p-5 sm:p-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Admission Letter */}
            <div className="bg-white border border-[#e8dfd2] hover:border-[#d8bd82] transition-all duration-300 rounded-xl p-5 shadow-sm group/doc flex flex-col justify-between">
              <div>
                <div className="bg-[#f3eee6] w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover/doc:scale-110 transition-transform duration-300 text-[#9a6614] border border-[#e2d6c3]">
                  <FileText className="h-6 w-6" />
                </div>
                <h4 className="font-bold text-base text-slate-800 mb-1">Provisional Admission Letter</h4>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">Your official letter of admission for your program.</p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowLetter(!showLetter)}
                  variant="outline"
                  size="sm"
                  className="flex-1 border-[#d8bd82] text-[#7a4f10] hover:bg-[#fff7e8] text-xs font-semibold py-4"
                  disabled={!admissionLetter}
                >
                  {showLetter ? "Hide" : "Preview"}
                </Button>
                <Button
                  onClick={handlePrintPDF}
                  size="sm"
                  className="flex-1 gap-2 bg-[#151515] hover:bg-[#2a2a2a] text-white shadow-sm text-xs font-semibold py-4"
                  disabled={printLoading || !admissionLetter}
                >
                  <Download className="h-3.5 w-3.5" />
                  {printLoading ? "..." : "PDF"}
                </Button>
              </div>
            </div>

            {/* Medical Form */}
            <div className="bg-white border border-[#e8dfd2] hover:border-[#d8bd82] transition-all duration-300 rounded-xl p-5 shadow-sm group/doc flex flex-col justify-between">
              <div>
                <div className="bg-[#f3eee6] w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover/doc:scale-110 transition-transform duration-300 text-[#9a6614] border border-[#e2d6c3]">
                  <FileText className="h-6 w-6" />
                </div>
                <h4 className="font-bold text-base text-slate-800 mb-1">Medical Examination Form</h4>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">Print and take to a certified hospital for examination.</p>
              </div>
              <Button
                onClick={handleDownloadMedicalForm}
                disabled={downloading === "medical_form"}
                className="w-full gap-2 bg-[#151515] hover:bg-[#2a2a2a] text-white shadow-sm text-xs font-semibold py-4"
              >
                <Download className="h-3.5 w-3.5" />
                {downloading === "medical_form" ? "Downloading..." : "Download PDF"}
              </Button>
            </div>

            {/* Notice & Affidavit */}
            <div className="bg-white border border-[#e8dfd2] hover:border-[#d8bd82] transition-all duration-300 rounded-xl p-5 shadow-sm group/doc flex flex-col justify-between">
              <div>
                <div className="bg-[#f3eee6] w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover/doc:scale-110 transition-transform duration-300 text-[#9a6614] border border-[#e2d6c3]">
                  <Settings className="h-6 w-6" />
                </div>
                <h4 className="font-bold text-base text-slate-800 mb-1">Notice & Affidavit</h4>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">Official resumption notice and good conduct affidavit.</p>
              </div>
              <div className="space-y-2">
                <Button
                  onClick={handleDownloadNotice}
                  variant="outline"
                  size="sm"
                  disabled={downloading === "admission_notice"}
                  className="w-full gap-2 border-[#d8bd82] text-[#7a4f10] hover:bg-[#fff7e8] text-xs font-semibold py-4 justify-center"
                >
                  <Download className="h-3.5 w-3.5" />
                  {downloading === "admission_notice" ? "..." : "Admission Notice"}
                </Button>
                <Button
                  onClick={handleDownloadAffidavit}
                  variant="outline"
                  size="sm"
                  disabled={downloading === "affidavit"}
                  className="w-full gap-2 border-[#d8bd82] text-[#7a4f10] hover:bg-[#fff7e8] text-xs font-semibold py-4 justify-center"
                >
                  <Download className="h-3.5 w-3.5" />
                  {downloading === "affidavit" ? "..." : "Conduct Affidavit"}
                </Button>
              </div>
            </div>

            {/* Payment Receipts */}
            <div className="bg-gradient-to-br from-slate-50/50 to-transparent border border-slate-100 hover:border-slate-200 transition-all duration-300 rounded-xl p-5 shadow-sm group/doc flex flex-col justify-between">
              <div>
                <div className="bg-[#f3eee6] w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover/doc:scale-110 transition-transform duration-300 text-[#9a6614] border border-[#e2d6c3]">
                  <DollarSign className="h-6 w-6" />
                </div>
                <h4 className="font-bold text-base text-slate-800 mb-1">Payment Receipts</h4>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">Download official receipts for your completed payments.</p>
              </div>
              <div className="space-y-2">
                {paymentHistory
                  .filter((pt) => pt.is_successful)
                  .map((pt) => (
                    <div
                      key={pt.transaction_id}
                      className="flex items-center justify-between p-2 bg-white hover:bg-slate-50 rounded-lg border border-slate-100 text-xs transition-colors duration-200"
                    >
                      <span className="capitalize font-semibold text-slate-600">
                        {pt.payment_type.replace("_", " ")}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-[#7a4f10] hover:text-[#5c3908] hover:bg-[#fff7e8] font-bold"
                        onClick={() => handleDownloadReceipt(pt.receipt_no, pt.payment_type)}
                        disabled={downloading === `receipt_${pt.receipt_no}`}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        PDF
                      </Button>
                    </div>
                  ))}
                {paymentHistory.filter((pt) => pt.is_successful).length === 0 && (
                  <p className="text-xs text-center text-slate-400 py-2 italic bg-slate-50 rounded-lg border border-dashed">
                    No payment records found.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Admission Letter Preview */}
          {showLetter && (
            <div className="mt-8 border border-slate-100 rounded-xl overflow-hidden shadow-inner bg-slate-50 p-8">
              <div className="bg-white p-12 shadow-2xl mx-auto max-w-[850px]">
                {admissionLetter ? (
                  <FsmsAdmissionLetter {...admissionLetter} />
                ) : (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#9a6614] mx-auto mb-4" />
                    <p className="text-slate-500 text-sm mt-4">Loading admission letter details...</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground font-medium">Authenticating</p>
        </div>
      </div>
    );
  }

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground font-medium">
            Loading application...
          </p>
        </div>
      </div>
    );
  }

  // Table for paid applications
  const ApplicationsTable = ({ apps }: { apps: ApplicantStatus[] }) => {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-2 bg-[#c99b45] rounded-full shadow-sm"></div>
          <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
            My Active Applications
          </h2>
        </div>

        {apps.length === 0 ? (
          <div className="bg-[#fffefa] border border-[#e8dfd2] rounded-2xl p-8 sm:p-12 text-center shadow-sm">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-bold">
              No active applications found.
            </p>
            <p className="text-slate-400 text-sm mt-1">
              Select a program below and pay the application fee to begin.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3 xl:hidden">
              {apps.map((app) => {
                const isComplete = [
                  "submitted",
                  "screening",
                  "admitted",
                  "accepted",
                  "rejected",
                  "enrolled",
                ].includes(app.application_status);
                const actionLabel = [
                  "submitted",
                  "admitted",
                  "accepted",
                  "enrolled",
                ].includes(app.application_status)
                  ? "Profile"
                  : "Apply";

                return (
                  <div
                    key={app.id}
                    className="rounded-2xl border border-[#e8dfd2] bg-[#fffefa] p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold capitalize text-slate-900">
                          {app.user_name}
                        </p>
                        <p className="mt-1 truncate font-mono text-xs text-slate-500">
                          {app.form_no || "-"}
                        </p>
                      </div>

                      {app.has_paid_application_fee ? (
                        <Button
                          size="sm"
                          className="h-9 shrink-0 rounded-lg bg-[#151515] px-4 font-semibold text-white shadow-sm hover:bg-[#2a2a2a]"
                          onClick={() => openApplicantProfile(app)}
                        >
                          {actionLabel}
                        </Button>
                      ) : app.has_pending_application_payment ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Processing
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600">
                          Failed
                        </span>
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs font-semibold text-slate-500">Programme</p>
                        <p className="mt-1 font-semibold text-slate-800">{app.program_name}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500">Session</p>
                        <p className="mt-1 text-slate-700">{app.program_session}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs font-semibold text-slate-500">Matric. No</p>
                        {app.matric_no ? (
                          <div className="mt-1 flex items-center gap-2">
                            <span className="font-mono text-sm text-slate-700">{app.matric_no}</span>
                            <button
                              className="rounded-lg p-1.5 text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-600"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(app.matric_no!);
                                  setCopiedId(app.id);
                                  setTimeout(() => setCopiedId(null), 1800);
                                } catch (e) {
                                  console.error("Copy failed", e);
                                }
                              }}
                              title="Copy Matric Number"
                            >
                              {copiedId === app.id ? (
                                <Check className="h-4 w-4 text-emerald-600 animate-in fade-in zoom-in duration-200" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <p className="mt-1 text-slate-400">-</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm",
                          isComplete
                            ? "border-emerald-100 bg-emerald-50 text-emerald-700 shadow-emerald-500/5"
                            : "border-amber-100 bg-amber-50 text-amber-700 shadow-amber-500/5",
                        )}
                      >
                        {isComplete ? "complete" : "pending"}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm",
                          app.admission_status === "admitted" ||
                            app.admission_status === "accepted"
                            ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                            : app.admission_status === "rejected"
                              ? "border-red-100 bg-red-50 text-red-700"
                              : "border-slate-100 bg-slate-50 text-slate-600",
                        )}
                      >
                        {app.admission_status.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden overflow-hidden rounded-2xl border border-[#e8dfd2] bg-[#fffefa] shadow-sm xl:block">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-[#fbfaf7] border-b border-[#eee5d8] text-slate-500 font-bold text-xs">
                    <th className="p-5 font-bold">Name</th>
                    <th className="p-5 font-bold">Form No.</th>
                    <th className="p-5 font-bold">Matric. No</th>
                    <th className="p-5 font-bold">Programme</th>
                    <th className="p-5 font-bold">Reg. Status</th>
                    <th className="p-5 font-bold">Session</th>
                    <th className="p-5 font-bold">Admission Status</th>
                    <th className="p-5 font-bold text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {apps.map((app) => {
                    const isComplete = [
                      "submitted",
                      "screening",
                      "admitted",
                      "accepted",
                      "rejected",
                      "enrolled",
                    ].includes(app.application_status);
                    return (
                      <tr
                        key={app.id}
                        className="hover:bg-slate-50/50 transition-colors duration-200"
                      >
                        <td className="p-5 text-sm text-slate-700 capitalize font-medium">
                          {app.user_name}
                        </td>
                        <td className="p-5 text-sm text-slate-500 font-mono font-medium">
                          {app.form_no || "-"}
                        </td>
                        <td className="p-5 text-sm text-slate-400">
                          {app.matric_no ? (
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-sm text-slate-700">{app.matric_no}</span>
                              <button
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors duration-200"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(app.matric_no!);
                                    setCopiedId(app.id);
                                    setTimeout(() => setCopiedId(null), 1800);
                                  } catch (e) {
                                    console.error("Copy failed", e);
                                  }
                                }}
                                title="Copy Matric Number"
                              >
                                {copiedId === app.id ? (
                                  <Check className="h-4 w-4 text-emerald-600 animate-in fade-in zoom-in duration-200" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="p-5 text-sm text-slate-800 font-semibold">
                          {app.program_name}
                        </td>
                        <td className="p-5 text-sm">
                          <span
                            className={cn(
                              "px-2.5 py-1 rounded-full text-[11px] font-semibold border shadow-sm",
                              isComplete
                                ? "bg-emerald-50 text-emerald-700 border-emerald-100 shadow-emerald-500/5"
                                : "bg-amber-50 text-amber-700 border-amber-100 shadow-amber-500/5",
                            )}
                          >
                            {isComplete ? "complete" : "pending"}
                          </span>
                        </td>
                        <td className="p-5 text-sm text-slate-600">
                          {app.program_session}
                        </td>
                        <td className="p-5 text-sm">
                          <span
                            className={cn(
                              "px-2.5 py-1 rounded-full text-[11px] font-semibold border shadow-sm",
                              app.admission_status === "admitted" ||
                                app.admission_status === "accepted"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                : app.admission_status === "rejected"
                                  ? "bg-red-50 text-red-700 border-red-100"
                                  : "bg-slate-50 text-slate-600 border-slate-100",
                            )}
                          >
                            {app.admission_status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="p-5 text-center">
                          {app.has_paid_application_fee ? (
                            // ── Paid — show Apply / Profile button
                            <Button
                              size="sm"
                              className="bg-[#151515] hover:bg-[#2a2a2a] text-white font-bold h-9 px-6 rounded-lg transition-all duration-300 shadow-sm"
                              onClick={() => openApplicantProfile(app)}
                            >
                              {["submitted", "admitted", "accepted", "enrolled"].includes(
                                app.application_status,
                              )
                                ? "Profile"
                                : "Apply"}
                            </Button>
                          ) : app.has_pending_application_payment ? (
                            // ── Payment gateway is still processing — amber notice
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Processing…
                            </span>
                          ) : (
                            // ── Transaction failed or never completed — red notice
                            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-200">
                              Payment Failed
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  // Form view
  if (viewingFormId && formTemplate) {
    const currentApp = applicants.find((a) => a.id === viewingFormId);

    return (
      <div className="min-h-screen bg-[#f8fafc] py-6 sm:py-8">
        <div className="mx-auto w-full max-w-[1180px] px-3 sm:px-5 lg:px-8 space-y-5">
          <Button
            variant="ghost"
            className="text-slate-500 hover:text-slate-800"
            onClick={() => {
              setViewingFormId(null);
              setFormTemplate(null);
              loadStatus();
            }}
          >
            ← Back to Dashboard
          </Button>

          {currentApp &&
          ["submitted", "admitted", "accepted", "enrolled"].includes(
            currentApp.application_status,
          ) ? (
            <div className="space-y-10">
              <div>
                {acceptanceFeeData && !acceptanceFeeData.paid && (
                  <div className="mb-8 rounded-xl border-2 p-6 space-y-4 bg-amber-50 border-amber-300 text-left">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl bg-amber-400 text-white font-bold">
                          ₦
                        </div>
                        <div>
                          <h3 className="font-bold text-lg text-amber-900">
                            Acceptance Fee Payment Required
                          </h3>
                          <p className="text-sm text-amber-700">
                            You must pay the acceptance fee to confirm your admission offer.
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-2xl font-semibold text-amber-800">
                          ₦{acceptanceFeeData.amount.toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-500">
                          {acceptanceFeeData.feeName || "Acceptance Fee"} (incl. processing fee)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <Button
                        className="bg-[#151515] hover:bg-[#2a2a2a] text-white font-bold px-8"
                        onClick={() => router.push('/applicant/payment?type=acceptance_fee')}
                      >
                        Pay Acceptance Fee →
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {isAdmitted && (
                <div className="mb-8">
                  {renderOfficialDocuments()}
                </div>
              )}

              {submittedFormData && (
                <ApplicantProfile
                  applicant={currentApp}
                  form={submittedFormData}
                  documents={submittedDocuments}
                  acceptanceFeeData={acceptanceFeeData}
                />
              )}
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-8 text-center space-y-2">
                <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">
                  Application Portal - {formTemplate.program}
                </h2>
                <p className="text-slate-500 font-medium">
                  Please complete all required sections carefully.
                </p>
              </div>

              <ApplicationFormComponent
                template={formTemplate}
                applicantId={viewingFormId}
                programId={currentApp?.program_id || 0}
                programTypeId={currentApp?.program_type_id}
                user={user}
                initialFormData={submittedFormData ?? undefined}
                initialDocuments={submittedDocuments ?? undefined}
                onSuccess={() => {
                  setViewingFormId(null);
                  setFormTemplate(null);
                  loadStatus();
                }}
              />
            </>
          )}
        </div>

        {showLetter && admissionLetter && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/40 backdrop-blur-md overflow-y-auto p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[32px] p-8 max-w-4xl w-full relative shadow-2xl animate-in zoom-in-95 duration-200 my-8">
              <Button
                onClick={() => setShowLetter(false)}
                variant="ghost"
                className="absolute top-4 right-4 text-slate-500 hover:text-slate-800 font-bold"
              >
                ✕ Close
              </Button>
              <div className="max-h-[80vh] overflow-y-auto pr-2 mt-4">
                <FsmsAdmissionLetter {...admissionLetter} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const paidApplicants = applicants.filter((a) => a.has_paid_application_fee);

  // Program types the applicant has already paid for (and not been rejected).
  // These cards show a locked state — no second purchase allowed.
  const blockedTypeIds = new Set(
    applicants
      .filter(
        (a) =>
          a.has_paid_application_fee && a.application_status !== "rejected",
      )
      .map((a) => a.program_type_id),
  );

  // Program types where a payment is currently processing (pending gateway confirmation).
  // Show a disabled "Processing" state on the card so the user doesn't try to pay again.
  const pendingTypeIds = new Set(
    applicants
      .filter(
        (a) => !a.has_paid_application_fee && a.has_pending_application_payment,
      )
      .map((a) => a.program_type_id),
  );

  const hasApplicationInProgress = applicants.some(
    (a) =>
      a.application_status !== "rejected" &&
      (a.has_paid_application_fee || a.has_pending_application_payment),
  );


  return (
    <div className="min-h-screen bg-[#f3eee6]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* ── Welcome Hero Banner ── */}
        {paymentStep === "selection" && (
          <div className="rounded-2xl bg-[#c99b45] border border-[#b98d3d] p-5 sm:p-6 md:p-7 shadow-sm relative overflow-hidden mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-semibold text-white leading-tight">
                  Welcome back,{" "}
                  <span className="capitalize font-semibold text-white">
                    {user?.username || "Applicant"}
                  </span>
                  ! 👋
                </h1>
                <p className="text-white/85 text-sm font-medium mt-2 max-w-2xl">
                  Access your PCU e-portal account and manage your entry
                  registrations.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Program selection ── */}
        {paymentStep === "selection" && (
          <>
            {/* Important Student Portal Access Instructions Alert */}
            {status?.matric_no && (
              <div className="flex items-start gap-3 p-4 bg-[#fffefa] rounded-2xl border border-[#e8dfd2] mb-6 shadow-sm">
                <AlertCircle className="w-5 h-5 text-[#9a6614] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    Important Student Portal Access Instructions
                  </p>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                    Please <span className="font-bold">copy your matric number from the active applications table below and keep it safe</span>. You will need this matric number to access your new student portal. 
                    Your default password is your <span className="font-bold">surname in lowercase</span>. You will be prompted to change it upon your first login.
                  </p>
                </div>
              </div>
            )}

            {/* Active Applications table on top */}
            <ApplicationsTable apps={applicants} />

            {/* Available Programs cards below */}
            <div className="mt-10 sm:mt-14 space-y-5">
              <div className="flex items-center gap-3">
                <div className="h-8 w-2 bg-[#c99b45] rounded-full shadow-sm"></div>
                <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
                  Available Programs
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
                {programTypes.map((form) => (
                  <Card
                    key={form.typeId}
                    className="group relative overflow-hidden bg-[#fffefa] hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 rounded-xl border border-[#e8dfd2] flex flex-col justify-between shadow-sm"
                  >
                    <CardHeader className="relative z-10 p-4 sm:p-5 pb-3">
                      <CardTitle className="text-base sm:text-lg font-semibold text-slate-900 leading-snug transition-colors duration-300">
                        {form.name}
                      </CardTitle>
                      {form.fee !== undefined ? (
                        <div className="mt-2 flex items-baseline gap-1">
                          <span className="text-xs text-slate-500 font-semibold">
                            Price:
                          </span>
                          <span className="text-lg font-semibold text-[#7a4f10]">
                            ₦{form.fee.toLocaleString()}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium italic mt-3 block">
                          Temporarily unavailable
                        </span>
                      )}
                    </CardHeader>

                    <CardContent className="relative z-10 p-4 sm:p-5 pt-0">
                      {blockedTypeIds.has(form.typeId) ? (
                        <div className="space-y-2">
                          <div className="w-full min-h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center gap-2 text-emerald-700 font-semibold text-sm">
                            <CheckCircle2 className="h-4 w-4" />
                            Form Purchased
                          </div>
                          <p className="text-center text-xs text-slate-500 font-semibold">
                            Re-purchase only allowed if rejected
                          </p>
                        </div>
                      ) : pendingTypeIds.has(form.typeId) ? (
                        <div className="space-y-2">
                          <div className="w-full min-h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center gap-2 text-amber-700 font-semibold text-sm">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Payment Processing
                          </div>
                          <p className="text-center text-xs text-slate-500 font-semibold">
                            Your payment is being confirmed
                          </p>
                        </div>
                      ) : form.fee === undefined ? (
                        <Button
                          disabled
                          className="w-full h-10 rounded-lg bg-slate-100 text-slate-400 text-sm font-semibold shadow-none flex items-center justify-center gap-2"
                        >
                          Coming Soon
                        </Button>
                      ) : hasApplicationInProgress ? (
                        <div className="space-y-2">
                          <div className="w-full min-h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center gap-2 text-slate-500 font-semibold text-sm">
                            Application in Progress
                          </div>
                          <p className="text-center text-xs text-slate-500 font-semibold">
                            Complete or wait for the current application first
                          </p>
                        </div>
                      ) : (
                        <Button
                          onClick={() => {
                            setSelectedForm(form);
                            setPaymentStep("confirmation");
                          }}
                          className="w-full h-10 rounded-lg bg-[#151515] hover:bg-[#2a2a2a] text-white text-sm font-semibold shadow-sm flex items-center justify-center gap-2 group/btn transition-all duration-300"
                        >
                          Get Started
                          <ChevronRight className="h-4 w-4 group-hover/btn:translate-x-1 transition-transform" />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Payment confirmation ── */}
        {paymentStep === "confirmation" && selectedForm && (
          <div className="max-w-md mx-auto animate-in fade-in zoom-in duration-300">
            <Button
              variant="ghost"
              onClick={() => {
                setPaymentStep("selection");
                setIsRedirecting(false);
              }}
              className="mb-4 text-slate-500 font-bold italic"
            >
              ← Back to selection
            </Button>
            <Card className="border border-[#e8dfd2] shadow-lg overflow-hidden bg-[#fffefa] rounded-2xl">
              <CardHeader className="text-center space-y-2 pb-0 p-6 sm:p-8">
                <div className="pt-6">
                  <p className="text-slate-500 font-semibold text-xs">
                    Programme:
                  </p>
                  <p className="text-xl sm:text-2xl font-semibold text-slate-900 leading-tight">
                    {selectedForm.name}
                  </p>
                </div>
              </CardHeader>

              <CardContent className="p-6 sm:p-8 pt-6 space-y-6 text-center">
                <div className="bg-[#fbfaf7] rounded-2xl p-5 sm:p-6 space-y-4 border border-[#eee5d8]">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-bold italic">
                      Application Fee
                    </span>
                    <span className="font-semibold text-slate-700">
                      ₦{selectedForm.fee.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-bold italic">
                      Processing Fee
                    </span>
                    <span className="font-semibold text-slate-700">
                      ₦
                      {processingFee.toLocaleString("en-NG", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="h-px bg-slate-200 my-2"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-900 font-semibold text-xs">
                      Total Payable
                    </span>
                    <span className="text-2xl sm:text-3xl font-semibold text-[#7a4f10]">
                      ₦
                      {(selectedForm.fee + processingFee).toLocaleString(
                        "en-NG",
                      )}
                    </span>
                  </div>
                </div>

                {payError && (
                  <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-red-700 text-sm font-medium text-left">
                    {payError}
                  </div>
                )}

                {payResult === "success" && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-emerald-700 text-sm font-bold text-center flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>
                      Payment confirmed! Your application has been started.
                    </span>
                  </div>
                )}

                <Button
                  className="w-full h-12 bg-[#151515] hover:bg-[#2a2a2a] text-white font-bold text-base rounded-xl shadow-sm transition-all duration-300 disabled:opacity-70 flex items-center justify-center gap-2"
                  onClick={handlePayNow}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Opening Payment...
                    </>
                  ) : (
                    <>
                      Pay Now
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Admission modal — offered but not yet paid acceptance fee ── */}
        {showAdmissionModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-[#fffefa] backdrop-blur-md rounded-2xl p-6 sm:p-8 max-w-md w-full mx-4 border border-[#e8dfd2] shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-200">
              <div className="w-20 h-20 bg-[#f3eee6] border border-[#e2d6c3] text-[#9a6614] rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm animate-bounce">
                <GraduationCap className="w-12 h-12" />
              </div>
              <div className="space-y-3">
                <span className="px-3 py-1 bg-[#fff7e8] text-[#7a4f10] text-xs font-semibold rounded-full border border-[#efd9a8]">
                  Offer Issued 🎉
                </span>
                <h3 className="text-2xl sm:text-3xl font-semibold text-slate-900">
                  Congratulations!
                </h3>
                <p className="text-slate-500 font-medium text-base leading-relaxed px-2">
                  Precious Cornerstone University has offered you admission!
                  Please proceed to complete your registration and pay the
                  acceptance fee to secure your spot.
                </p>
              </div>
              <Button
                onClick={openAdmissionOfferProfile}
                disabled={profileLoading}
                className="w-full h-12 bg-[#151515] hover:bg-[#2a2a2a] text-white font-bold text-base rounded-xl shadow-sm transition-all duration-300"
              >
                {profileLoading ? "Opening Profile..." : "View Details & Secure Spot"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Admitted dashboard — Documents & Tuition (replaces old student portal modal) ── */}
        {isAdmitted && status?.has_paid_acceptance_fee && !(status?.has_paid_tuition || user?.role === "student") && paymentStep === "selection" && !viewingFormId && (
          <div className="mt-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Section header */}
            <div className="flex items-center gap-3">
              <div className="h-8 w-2 bg-emerald-500 rounded-full shadow-md shadow-emerald-500/30"></div>
              <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">
                Admitted Student Portal
              </h2>
            </div>

            {/* Pay School Fees Card */}
            <Card className="shadow-lg border border-amber-500/10 hover:border-amber-500/25 transition-all duration-300 group overflow-hidden bg-amber-500/[0.01]">
              <div className="h-2 bg-gradient-to-r from-amber-500 to-amber-500/80 w-full shadow-sm" />
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-amber-500/10 p-2 rounded-xl group-hover:bg-amber-500/20 transition-colors duration-300 text-amber-600">
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <CardTitle className="text-lg font-bold text-slate-800">
                    Pay School Fees
                  </CardTitle>
                </div>
                <CardDescription className="text-slate-500 mt-1">
                  Complete your school fees payment to unlock full student portal access, including course registration.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100 bg-white">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                  <p className="text-sm text-amber-700 font-medium">
                    Your admission is confirmed. Pay school fees to complete enrolment and receive your matric number.
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
                      Payment confirmed! Your account is being upgraded to full student...
                    </p>
                  </div>
                ) : (
                  <Button
                    className="w-full h-12 text-base font-semibold bg-[#151515] hover:bg-[#2a2a2a] text-white shadow-sm hover:scale-[1.01] transition-all duration-200 flex items-center justify-center gap-2"
                    onClick={handlePayTuition}
                    disabled={isPayingTuition}
                  >
                    {isPayingTuition ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Opening Payment...
                      </>
                    ) : (
                      <>Proceed to Pay School Fees</>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Document Downloads Section */}
            {renderOfficialDocuments()}
          </div>
        )}

        {/* ── Fee Breakdown Modal ── */}
        {showBreakdownModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-6 text-white">
                <div className="flex items-center gap-3 mb-1">
                  <CreditCard className="w-6 h-6" />
                  <h3 className="text-lg sm:text-xl font-semibold">School Fees Breakdown</h3>
                </div>
                <p className="text-amber-100 text-sm font-medium">Review your fee components before proceeding to payment.</p>
              </div>

              <div className="p-6 space-y-5">
                {loadingBreakdown && (
                  <div className="space-y-3 animate-pulse">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex justify-between items-center py-3 border-b border-slate-100">
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

                {breakdownError && !loadingBreakdown && (
                  <div className="flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-200">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-red-800">Could not load fee breakdown</p>
                      <p className="text-sm text-red-600 mt-0.5">{breakdownError}</p>
                    </div>
                  </div>
                )}

                {!loadingBreakdown && !breakdownError && feeComponents.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 mb-3">
                      <button
                        className={`px-3 py-2 rounded-lg font-semibold ${paymentMode === "full" ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-700"}`}
                        onClick={() => { setPaymentMode("full"); setInstallmentAmount(null); }}
                      >Full Payment</button>
                      <button
                        className={`px-3 py-2 rounded-lg font-semibold ${paymentMode === "installment" ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-700"}`}
                        onClick={() => {
                          setPaymentMode("installment");
                          const plan = installmentPlans.find((p) => p.id === selectedInstallmentPlanId) || installmentPlans[0];
                          if (plan) {
                            setSelectedInstallmentPlanId(plan.id);
                            setInstallmentAmount(parseFloat((feeTotal * (plan.percentage / 100) || 0).toFixed(2)));
                          }
                        }}
                      >Installments</button>
                    </div>

                    {paymentMode === "installment" && installmentPlans.length > 0 && (
                      <div className="space-y-2 pt-2 pb-4 animate-in fade-in duration-200">
                        <span className="text-xs text-slate-500 font-semibold block">
                          Tuition Installments (Read-Only)
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          {installmentPlans.map((plan) => (
                            <div
                              key={plan.id}
                              className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all opacity-80 ${
                                selectedInstallmentPlanId === plan.id
                                  ? "border-[#d8bd82] bg-[#fff7e8] text-[#7a4f10] font-bold shadow-sm"
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
                      <div key={idx} className="flex justify-between items-center py-3 border-b border-slate-100 last:border-0">
                        <span className="text-sm font-semibold text-slate-700">{fc.name}</span>
                        <span className="text-sm font-bold text-slate-900 tabular-nums">
                          ₦{fc.amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}

                    <div className="flex justify-between items-center py-3 border-b border-slate-100">
                      <span className="text-sm font-semibold text-slate-500">Processing Fee</span>
                      <span className="text-sm font-bold text-slate-700 tabular-nums">
                        ₦{tuitionProcessingFee.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-4 mt-2 border-t-2 border-amber-300">
                      <span className="text-sm font-semibold text-slate-800">Total Payable</span>
                      <span className="text-xl font-semibold text-amber-700 tabular-nums">
                        ₦{((paymentMode === "installment" ? (installmentAmount || 0) : (feeTotal * (remainingPercentage / 100))) + tuitionProcessingFee).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}

                {!loadingBreakdown && !breakdownError && feeComponents.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-4 italic">
                    No fee components found. Please contact the accounts office.
                  </p>
                )}

                {tuitionPayError && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl border border-red-200">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{tuitionPayError}</p>
                  </div>
                )}

                <div className="flex flex-col gap-3 pt-2">
                  {!tuitionPaySuccess && (
                    <Button
                      className="w-full h-12 font-semibold text-base bg-[#151515] hover:bg-[#2a2a2a] text-white rounded-xl shadow-sm disabled:opacity-70"
                      onClick={confirmAndPayTuition}
                      disabled={
                        isPayingTuition || loadingBreakdown || !!breakdownError || feeComponents.length === 0 ||
                        (paymentMode === "installment" && !selectedInstallmentPlanId)
                      }
                    >
                      {isPayingTuition ? (
                        <><Loader2 className="w-5 h-5 animate-spin mr-2" />Opening Payment...</>
                      ) : (
                        <>Confirm & Pay</>
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="w-full text-slate-500 font-medium"
                    onClick={() => { setShowBreakdownModal(false); setTuitionPayError(null); }}
                    disabled={isPayingTuition}
                  >Cancel</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
