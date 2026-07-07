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
  const [showRecommendationModal, setShowRecommendationModal] = useState(false);
  const [showScreeningModal, setShowScreeningModal] = useState(false);
  const [screeningModalApp, setScreeningModalApp] =
    useState<ApplicantStatus | null>(null);
  const [recommendationModalApp, setRecommendationModalApp] =
    useState<ApplicantStatus | null>(null);

  // Admitted student states — tuition payment & document downloads
  const isAdmitted = user?.role === "admitted" || user?.role === "student";
  const [copiedMatric, setCopiedMatric] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentTransaction[]>(
    [],
  );

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
  const getApplicantLoginSessionKey = () =>
    `pcu-applicant-login:${user?.id ?? user?.username ?? user?.email ?? "applicant"}`;
  const getRecommendationModalSessionKey = (applicant?: any) =>
    `pcu-course-recommendation-modal:${
      applicant?.id ?? "application"
    }:${user?.id ?? user?.username ?? user?.email ?? "applicant"}`;
  const getScreeningModalSessionKey = (applicant?: any) =>
    `pcu-screening-docs-modal:${
      applicant?.id ?? "application"
    }:${user?.id ?? user?.username ?? user?.email ?? "applicant"}`;
  const markRecommendationModalHandled = (applicant?: ApplicantStatus | null) => {
    if (typeof window === "undefined" || !applicant) return;

    const loginMarker = sessionStorage.getItem(getApplicantLoginSessionKey());
    if (!loginMarker) return;

    sessionStorage.setItem(
      getRecommendationModalSessionKey(applicant),
      loginMarker,
    );
  };
  const getRecommendationStatus = (applicant?: ApplicantStatus | null) =>
    applicant?.admission_status === "recommend"
      ? "recommend"
      : applicant?.application_status || applicant?.admission_status || "";
  const profileStatuses = [
    "submitted",
    "screening",
    "recommended",
    "recommend",
    "accepted_recommendation",
    "applicant_recommended",
    "admitted",
    "accepted",
    "enrolled",
  ];

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

  const openRecommendationDecisionProfile = async () => {
    const app = recommendationModalApp;
    if (!app) {
      setShowRecommendationModal(false);
      return;
    }

    markRecommendationModalHandled(app);
    setShowRecommendationModal(false);
    await openApplicantProfile(app);

    setTimeout(() => {
      document
        .getElementById("course-recommendation-decision")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);
  };

  const openScreeningProfile = async () => {
    const app = screeningModalApp;
    if (!app) {
      setShowScreeningModal(false);
      return;
    }
    // Mark as handled for this login session
    if (typeof window !== "undefined") {
      const loginMarker = sessionStorage.getItem(getApplicantLoginSessionKey());
      if (loginMarker) {
        sessionStorage.setItem(getScreeningModalSessionKey(app), loginMarker);
      }
    }
    setShowScreeningModal(false);
    await openApplicantProfile(app);
  };

  const loadStatus = async () => {
    try {
      const response = await ApiClient.getApplicantStatus();
      setStatus(response.applicant);
      const apps = response.applicants || [];
      setApplicants(apps);

      if (
        response.applicant?.application_status === "accepted" &&
        !response.applicant.has_paid_acceptance_fee
      ) {
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
      } else if (response.applicant?.has_paid_acceptance_fee) {
        setShowAdmissionModal(false);
        try {
          const letterResponse = await ApiClient.getAdmissionLetter();
          setAdmissionLetter(letterResponse);
        } catch {
          setAdmissionLetter(null);
        }
      } else {
        setShowAdmissionModal(false);
        setAdmissionLetter(null);
      }

      const recommendationApp = apps.find(
        (app: ApplicantStatus) =>
          app.has_paid_application_fee &&
          ["recommended", "recommend"].includes(getRecommendationStatus(app)),
      );
      if (recommendationApp) {
        setRecommendationModalApp(recommendationApp);
        const shouldShowRecommendationModal =
          typeof window !== "undefined" &&
          !!sessionStorage.getItem(getApplicantLoginSessionKey()) &&
          sessionStorage.getItem(
            getRecommendationModalSessionKey(recommendationApp),
          ) !== sessionStorage.getItem(getApplicantLoginSessionKey());
        setShowRecommendationModal(shouldShowRecommendationModal);
      } else {
        setShowRecommendationModal(false);
        setRecommendationModalApp(null);
      }

      // Screening modal — show once per login if application is in screening with requested docs
      const screeningApp = apps.find(
        (app: ApplicantStatus) =>
          app.has_paid_application_fee &&
          app.application_status === "screening" &&
          !!app.requested_documents,
      );
      if (screeningApp) {
        setScreeningModalApp(screeningApp);
        const shouldShowScreeningModal =
          typeof window !== "undefined" &&
          !!sessionStorage.getItem(getApplicantLoginSessionKey()) &&
          sessionStorage.getItem(
            getScreeningModalSessionKey(screeningApp),
          ) !== sessionStorage.getItem(getApplicantLoginSessionKey());
        setShowScreeningModal(shouldShowScreeningModal);
      } else {
        setShowScreeningModal(false);
        setScreeningModalApp(null);
      }

      // For admitted users, also fetch payment history
      if (isAdmitted) {
        try {
          const pHistory = await ApiClient.getPaymentHistory();
          setPaymentHistory(pHistory.payment_history || []);
        } catch {}
      }

      // Auto-open profile when redirected from acceptance_fee payment success
      if (searchParams.get("view") === "profile") {
        // Find the admitted/accepted application
        const admittedApp = apps.find(
          (a: ApplicantStatus) =>
            a.has_paid_application_fee &&
            profileStatuses.includes(a.application_status),
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
                <h4 className="font-bold text-base text-slate-800 mb-1">
                  Provisional Admission Letter
                </h4>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  Your official letter of admission for your program.
                </p>
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
                <h4 className="font-bold text-base text-slate-800 mb-1">
                  Medical Examination Form
                </h4>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  Print and take to a certified hospital for examination.
                </p>
              </div>
              <Button
                onClick={handleDownloadMedicalForm}
                disabled={downloading === "medical_form"}
                className="w-full gap-2 bg-[#151515] hover:bg-[#2a2a2a] text-white shadow-sm text-xs font-semibold py-4"
              >
                <Download className="h-3.5 w-3.5" />
                {downloading === "medical_form"
                  ? "Downloading..."
                  : "Download PDF"}
              </Button>
            </div>

            {/* Notice & Affidavit */}
            <div className="bg-white border border-[#e8dfd2] hover:border-[#d8bd82] transition-all duration-300 rounded-xl p-5 shadow-sm group/doc flex flex-col justify-between">
              <div>
                <div className="bg-[#f3eee6] w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover/doc:scale-110 transition-transform duration-300 text-[#9a6614] border border-[#e2d6c3]">
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
                  className="w-full gap-2 border-[#d8bd82] text-[#7a4f10] hover:bg-[#fff7e8] text-xs font-semibold py-4 justify-center"
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
                      className="flex items-center justify-between p-2 bg-white hover:bg-slate-50 rounded-lg border border-slate-100 text-xs transition-colors duration-200"
                    >
                      <span className="capitalize font-semibold text-slate-600">
                        {pt.payment_type.replace("_", " ")}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-[#7a4f10] hover:text-[#5c3908] hover:bg-[#fff7e8] font-bold"
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
                  "recommended",
                  "recommend",
                  "accepted_recommendation",
                  "applicant_recommended",
                  "admitted",
                  "accepted",
                  "rejected",
                  "enrolled",
                ].includes(app.application_status);
                const actionLabel = profileStatuses.includes(
                  app.application_status,
                )
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
                        <p className="text-xs font-semibold text-slate-500">
                          Programme
                        </p>
                        <p className="mt-1 font-semibold text-slate-800">
                          {app.program_name}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500">
                          Session
                        </p>
                        <p className="mt-1 text-slate-700">
                          {app.program_session}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs font-semibold text-slate-500">
                          Matric. No
                        </p>
                        {app.matric_no ? (
                          <div className="mt-1 flex items-center gap-2">
                            <span className="font-mono text-sm text-slate-700">
                              {app.matric_no}
                            </span>
                            <button
                              className="rounded-lg p-1.5 text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-600"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(
                                    app.matric_no!,
                                  );
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
                        "recommended",
                        "recommend",
                        "accepted_recommendation",
                        "applicant_recommended",
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
                                <span className="font-mono text-sm text-slate-700">
                                  {app.matric_no}
                                </span>
                                <button
                                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors duration-200"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(
                                        app.matric_no!,
                                      );
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
                                {[
                                  ...profileStatuses,
                                ].includes(app.application_status)
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
      <div className="min-h-screen bg-[#f8fafc] pb-6 sm:pb-8">
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
          profileStatuses.includes(currentApp.application_status) ? (
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
                            You must pay the acceptance fee to confirm your
                            admission offer.
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-2xl font-semibold text-amber-800">
                          ₦{acceptanceFeeData.amount.toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-500">
                          {acceptanceFeeData.feeName || "Acceptance Fee"} (incl.
                          processing fee)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <Button
                        className="bg-[#151515] hover:bg-[#2a2a2a] text-white font-bold px-8"
                        onClick={() =>
                          router.push("/applicant/payment?type=acceptance_fee")
                        }
                      >
                        Pay Acceptance Fee →
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {isAdmitted && (
                <div className="mb-8">{renderOfficialDocuments()}</div>
              )}

              {submittedFormData && (
                <ApplicantProfile
                  applicant={currentApp}
                  form={submittedFormData}
                  documents={submittedDocuments}
                  acceptanceFeeData={acceptanceFeeData}
                  program_type_id={currentApp?.program_type_id}
                  template={formTemplate}
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
                  // Evict the stale preloaded form for this applicant so that
                  // opening "Profile" right after submission always fetches fresh
                  // data from the server instead of the cached pre-login warm-up.
                  if (viewingFormId !== null) {
                    setPreloadedForms((prev) => {
                      const next = { ...prev };
                      delete next[viewingFormId];
                      return next;
                    });
                  }
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

  const paidApplicants = applicants.filter(
    (a) => a.has_paid_application_fee && a.application_status !== "rejected",
  );

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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-3 sm:pt-4 pb-6 sm:pb-10">
        {/* ── Welcome Hero Banner ── */}
        {paymentStep === "selection" && (
          <div className="rounded-2xl bg-[#c99b45] border border-[#b98d3d] p-5 sm:p-6 md:p-7 shadow-sm relative overflow-hidden mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-semibold text-white leading-tight">
                  Welcome back,{" "}
                  <span className="capitalize font-semibold text-white">
                    {user?.first_name && user?.last_name
                      ? `${user.first_name} ${user.last_name}`
                      : user?.username || "Applicant"}
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
                    Please{" "}
                    <span className="font-bold">
                      copy your matric number from the active applications table
                      below and keep it safe
                    </span>
                    . You will need this matric number to access your new
                    student portal. Your default password is your{" "}
                    <span className="font-bold">surname in lowercase</span>. You
                    will be prompted to change it upon your first login.
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
                {profileLoading
                  ? "Opening Profile..."
                  : "View Details & Secure Spot"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Admitted dashboard — Documents & Tuition (replaces old student portal modal) ── */}
        {showRecommendationModal && recommendationModalApp && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/40 p-3 backdrop-blur-md animate-in fade-in duration-300 sm:p-4">
            <div className="my-auto w-full max-w-[20rem] rounded-xl border border-[#e8dfd2] bg-[#fffefa] p-4 text-center shadow-2xl animate-in zoom-in-95 duration-200 sm:max-w-md sm:rounded-2xl sm:p-8">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[#e2d6c3] bg-[#f3eee6] text-[#9a6614] shadow-sm sm:mb-4 sm:h-20 sm:w-20">
                <GraduationCap className="h-7 w-7 sm:h-11 sm:w-11" />
              </div>
              <div className="space-y-2 sm:space-y-3">
                <span className="px-3 py-1 bg-[#fff7e8] text-[#7a4f10] text-xs font-semibold rounded-full border border-[#efd9a8]">
                  Course Recommendation
                </span>
                <h3 className="text-lg font-semibold leading-tight text-slate-900 sm:text-3xl">
                  Review Your Recommended Course
                </h3>
                <p className="hidden px-2 text-base font-medium leading-relaxed text-slate-500 sm:block">
                  The admission office has recommended another course for your
                  application. Open your profile to accept it, reject it, or
                  recommend a different course.
                </p>
              </div>
              {recommendationModalApp.approved_course && (
                <div className="mt-4 rounded-lg border border-[#efd9a8] bg-white p-3 text-left sm:mt-6 sm:rounded-xl sm:p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[#9a6614]">
                    Recommended Course
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-snug text-slate-900 sm:text-base">
                    {recommendationModalApp.approved_course}
                  </p>
                </div>
              )}
              <div className="mt-4 space-y-2 sm:mt-6 sm:space-y-3">
                <Button
                  onClick={openRecommendationDecisionProfile}
                  disabled={profileLoading}
                  className="h-10 w-full rounded-lg bg-[#151515] text-sm font-bold text-white shadow-sm transition-all duration-300 hover:bg-[#2a2a2a] sm:h-12 sm:rounded-xl sm:text-base"
                >
                  {profileLoading
                    ? "Opening Profile..."
                    : "Make Course Decision"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    markRecommendationModalHandled(recommendationModalApp);
                    setShowRecommendationModal(false);
                  }}
                  className="h-9 w-full text-sm text-slate-500 hover:text-slate-800 sm:h-10"
                >
                  Later
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Screening modal — additional documents requested ── */}
        {showScreeningModal && screeningModalApp && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/40 p-3 backdrop-blur-md animate-in fade-in duration-300 sm:p-4">
            <div className="my-auto w-full max-w-[20rem] rounded-xl border border-[#e8dfd2] bg-[#fffefa] p-4 text-center shadow-2xl animate-in zoom-in-95 duration-200 sm:max-w-md sm:rounded-2xl sm:p-8">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-600 shadow-sm sm:mb-4 sm:h-20 sm:w-20">
                <FileText className="h-7 w-7 sm:h-11 sm:w-11" />
              </div>
              <div className="space-y-2 sm:space-y-3">
                <span className="px-3 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-full border border-amber-200">
                  Action Required
                </span>
                <h3 className="text-lg font-semibold leading-tight text-slate-900 sm:text-2xl">
                  Additional Documents Needed
                </h3>
                <p className="px-2 text-sm font-medium leading-relaxed text-slate-500 sm:text-base">
                  The admissions office has requested additional documents for
                  your application. Please upload them via your profile to
                  continue your screening.
                </p>
                {screeningModalApp.requested_documents && (
                  <div className="mx-auto my-3 max-w-xs rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-left">
                    <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-1">
                      Requested Documents:
                    </p>
                    <ul className="list-disc list-inside space-y-0.5 text-xs font-semibold text-slate-700">
                      {screeningModalApp.requested_documents
                        .split(",")
                        .map((d: string) => d.trim())
                        .filter(Boolean)
                        .map((doc: string) => (
                          <li key={doc} className="capitalize">
                            {doc.replace(/_/g, " ")}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-slate-400">
                  Open your profile and click{" "}
                  <span className="font-semibold text-slate-600">
                    &quot;Upload Additional Documents&quot;
                  </span>{" "}
                  to get started.
                </p>
              </div>
              <div className="mt-4 space-y-2 sm:mt-6 sm:space-y-3">
                <Button
                  onClick={openScreeningProfile}
                  disabled={profileLoading}
                  className="h-10 w-full rounded-lg bg-[#151515] text-sm font-bold text-white shadow-sm transition-all duration-300 hover:bg-[#2a2a2a] sm:h-12 sm:rounded-xl sm:text-base"
                >
                  {profileLoading ? "Opening Profile..." : "Go to My Profile"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      const loginMarker = sessionStorage.getItem(
                        getApplicantLoginSessionKey(),
                      );
                      if (loginMarker && screeningModalApp) {
                        sessionStorage.setItem(
                          getScreeningModalSessionKey(screeningModalApp),
                          loginMarker,
                        );
                      }
                    }
                    setShowScreeningModal(false);
                  }}
                  className="h-9 w-full text-sm text-slate-500 hover:text-slate-800 sm:h-10"
                >
                  Later
                </Button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
