"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

// ── Interswitch inline checkout types ────────────────────────────────────────
declare global {
  interface Window {
    // Interswitch inline checkout v2 SDK
    webpayCheckout: (config: {
      merchant_code: string;
      pay_item_id: string;
      txn_ref: string;
      amount: number;
      currency: string; // "566" = NGN
      site_redirect_url: string;
      mode: "TEST" | "LIVE";
      onComplete: (response: { resp: string; [key: string]: any }) => void;
    }) => void;
  }
}

// Interswitch inline checkout — use LIVE script URL with mode:"TEST" for sandbox
const ISW_SCRIPT_URL = "https://newwebpay.interswitchng.com/inline-checkout.js";
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
    color: "from-purple-500/10 to-purple-600/5",
    border: "border-purple-200",
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
  const [showStudentPortalModal, setShowStudentPortalModal] = useState(false);

  const [applicants, setApplicants] = useState<ApplicantStatus[]>([]);
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
  const [scriptReady, setScriptReady] = useState(false);
  const [payResult, setPayResult] = useState<"success" | "failed" | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [processingFee, setProcessingFee] = useState<number>(300);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const loadStatus = async () => {
    try {
      const response = await ApiClient.getApplicantStatus();
      setStatus(response.applicant);
      const apps = response.applicants || [];
      setApplicants(apps);

      if (response.applicant?.admission_status === "admitted") {
        if (!response.applicant.has_paid_acceptance_fee) {
          setShowAdmissionModal(true);
        } else {
          // Acceptance fee paid — prompt them to go to student portal (show once per mount)
          setShowStudentPortalModal(true);
        }
        try {
          const letterResponse = await ApiClient.getAdmissionLetter();
          setAdmissionLetter(letterResponse);
        } catch {
          setAdmissionLetter(null);
        }
      }

      // Auto-open profile when redirected from acceptance_fee payment success
      if (searchParams.get("view") === "profile") {
        // Find the admitted/accepted application
        const admittedApp = apps.find(
          (a: ApplicantStatus) =>
            a.has_paid_application_fee &&
            ["admitted", "accepted", "submitted", "screening"].includes(
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
                amount: feeData.acceptance_fee,
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

  // Load Interswitch inline checkout script once
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
      setPayError("Failed to load payment gateway. Please refresh.");
    document.head.appendChild(script);
  }, []);

  /**
   * Initiates an Interswitch inline checkout for the application fee.
   * Opens the payment modal in-page — no redirect.
   */
  const handlePayNow = async () => {
    if (!selectedForm || isProcessing || !scriptReady) return;
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
      const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/e-portal/applicant/payment/callback`;

      if (typeof window.webpayCheckout !== "function") {
        throw new Error("Payment gateway not ready. Please refresh the page.");
      }

      window.webpayCheckout({
        merchant_code: init.merchant_code,
        pay_item_id: init.pay_item_id,
        txn_ref: init.reference_no,
        amount: init.amount_kobo,
        currency: 566,
        site_redirect_url: callbackUrl,
        mode: "TEST",
        onComplete: async (response: any) => {
          // If the user cancelled or the widget returned a non-success/non-pending code
          if (
            response &&
            response.resp &&
            response.resp !== "00" &&
            response.resp !== "Z0" &&
            response.resp !== "T0"
          ) {
            try {
              await ApiClient.cancelPayment(init.reference_no);
            } catch (e) {}
            setPayResult(null);
            setPayError(
              "Payment was cancelled by user. Returning to dashboard...",
            );
            setIsProcessing(false);
            setTimeout(() => {
              setPayError(null);
              setPaymentStep("selection");
            }, 5000);
            return;
          }

          // Always verify server-side
          try {
            const verification = await ApiClient.verifyPayment(
              init.reference_no,
            );
            if (verification.is_successful) {
              ApiClient.clearCache();
              setPayResult("success");
              setPaymentStep("selection");
              await loadStatus();
            } else if (verification.tran_status === "pending") {
              // Gateway returned Z0/T0 — payment is still processing (network delay).
              // Don't show an error; inform the user and auto-refresh after 10s.
              setPayResult(null);
              setPayError(null);
              setPaymentStep("selection");
              setPayError(
                "Your payment is still being processed. We'll update your status automatically — please wait a moment.",
              );
              // Background worker will confirm within minutes; quietly reload status
              setTimeout(async () => {
                ApiClient.clearCache();
                await loadStatus();
                setPayError(null);
              }, 10_000);
            } else {
              setPayResult("failed");
              setPayError(
                verification.response_desc || "Payment was not completed.",
              );
            }
          } catch (err: any) {
            setPayResult("failed");
            setPayError(
              err.message ||
                "Verification failed. Contact support if funds were debited.",
            );
          } finally {
            setIsProcessing(false);
          }
        },
      });
    } catch (err: any) {
      console.error("Error initiating payment:", err);
      setPayError(err.message || "Failed to start payment. Please try again.");
      setIsProcessing(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/");
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
          <div className="h-8 w-2 bg-[#6b357d] rounded-full shadow-md shadow-purple-500/30"></div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
            My Active Applications
          </h2>
        </div>

        {apps.length === 0 ? (
          <div className="bg-white/70 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-12 text-center shadow-sm">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-bold">
              No active applications found.
            </p>
            <p className="text-slate-400 text-sm mt-1">
              Select a program below and pay the application fee to begin.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200/60 shadow-lg shadow-slate-100 bg-white/80 backdrop-blur-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200/60 text-slate-500 font-bold uppercase tracking-wider text-xs">
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
                        <td className="p-5 text-sm text-slate-400">-</td>
                        <td className="p-5 text-sm text-slate-800 uppercase font-black tracking-tight">
                          {app.program_name}
                        </td>
                        <td className="p-5 text-sm">
                          <span
                            className={cn(
                              "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm",
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
                              "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm",
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
                              className="bg-[#6b357d] hover:bg-[#5a2d69] text-white font-bold h-9 px-6 rounded-lg transition-all duration-300 shadow-md shadow-purple-500/10 hover:shadow-purple-500/20"
                              onClick={async () => {
                                setViewingFormId(app.id);

                                const cachedTemplate =
                                  preloadedTemplates[app.program_type_id];
                                const cachedForm = preloadedForms[app.id];

                                if (cachedTemplate)
                                  setFormTemplate(cachedTemplate);
                                if (cachedForm) {
                                  setSubmittedFormData(cachedForm.form);
                                  setSubmittedDocuments(cachedForm.documents);
                                }

                                const fullyReady =
                                  !!cachedTemplate && !!cachedForm;
                                if (!fullyReady) setProfileLoading(true);

                                try {
                                  const [templateResult, formResult] =
                                    await Promise.all([
                                      cachedTemplate
                                        ? Promise.resolve(cachedTemplate)
                                        : ApiClient.getFormTemplate(
                                            app.program_type_id,
                                          ),
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

                                  if (!cachedTemplate)
                                    setFormTemplate(templateResult);
                                  if (!cachedForm) {
                                    setSubmittedFormData(
                                      (formResult as any).form,
                                    );
                                    setSubmittedDocuments(
                                      (formResult as any).documents ?? [],
                                    );
                                  }

                                  if (
                                    ["admitted", "accepted"].includes(
                                      app.application_status,
                                    )
                                  ) {
                                    try {
                                      const feeData =
                                        await ApiClient.getAcceptanceFee();
                                      setAcceptanceFeeData({
                                        amount: feeData.acceptance_fee,
                                        feeName: feeData.fee_name,
                                        paid: app.has_paid_acceptance_fee,
                                      });
                                    } catch (e) {
                                      console.error(
                                        "Failed to load acceptance fee",
                                        e,
                                      );
                                    }
                                  } else {
                                    setAcceptanceFeeData(null);
                                  }
                                } catch (e) {
                                  console.error("Failed to load form data", e);
                                } finally {
                                  setProfileLoading(false);
                                }
                              }}
                            >
                              {["submitted", "admitted", "accepted"].includes(
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
        )}
      </div>
    );
  };

  // Form view
  if (viewingFormId && formTemplate) {
    const currentApp = applicants.find((a) => a.id === viewingFormId);

    return (
      <div className="min-h-screen bg-[#f8fafc] py-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
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
          ["submitted", "admitted", "accepted"].includes(
            currentApp.application_status,
          ) ? (
            <div className="space-y-10">
              <div>
                {currentApp.admission_status === "admitted" &&
                  (currentApp.admission_letter_sent ? (
                    <div className="mb-8 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-100 shadow-sm text-left">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-green-500 rounded-lg text-white shadow-lg shadow-green-500/30">
                          <FileText className="h-6 w-6" />
                        </div>
                        <div>
                          <h5 className="font-black text-green-800 text-lg">
                            Admission Letter Available
                          </h5>
                          <p className="text-green-600 font-medium text-sm">
                            Your official admission letter is ready to be
                            printed.
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={() => setShowLetter(true)}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold shadow-sm"
                      >
                        <Printer className="w-4 h-4 mr-2" /> View Admission
                        Letter
                      </Button>
                    </div>
                  ) : !currentApp.has_paid_acceptance_fee ? (
                    <div className="mb-8 bg-gradient-to-br from-amber-50 to-yellow-50 rounded-xl p-6 border border-amber-100 shadow-sm text-left">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-amber-500 rounded-lg text-white shadow-lg shadow-amber-500/30">
                          <AlertCircle className="h-6 w-6" />
                        </div>
                        <div>
                          <h5 className="font-black text-amber-800 text-lg">
                            Acceptance Fee Payment Required
                          </h5>
                          <p className="text-amber-600 font-medium text-sm">
                            Please pay your acceptance fee to secure your
                            admission. Your admission letter will be provided
                            after payment is confirmed.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-8 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100 shadow-sm text-left">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-500 rounded-lg text-white shadow-lg shadow-blue-500/30">
                          <CheckCircle2 className="h-6 w-6" />
                        </div>
                        <div>
                          <h5 className="font-black text-blue-800 text-lg">
                            Acceptance Fee Paid
                          </h5>
                          <p className="text-blue-600 font-medium text-sm">
                            Your payment is confirmed. Please wait while the
                            admission officer generates and sends your admission
                            letter.
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

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
                <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">
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
          <FsmsAdmissionLetter
            data={admissionLetter}
            onClose={() => setShowLetter(false)}
          />
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

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* ── Welcome Hero Banner ── */}
        {paymentStep === "selection" && (
          <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 rounded-2xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-purple-200 bg-clip-text text-transparent">
                  Welcome back,{" "}
                  <span className="capitalize font-black text-white">
                    {user?.username || "Applicant"}
                  </span>
                  ! 👋
                </h1>
                <p className="text-slate-300 text-xs md:text-sm font-medium mt-1">
                  Access your PCU e-portal account and manage your entry
                  registrations.
                </p>
              </div>
              <span className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-bold bg-white/10 text-purple-200 border border-white/10 uppercase tracking-widest self-start md:self-auto">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active Session
              </span>
            </div>
          </div>
        )}

        {/* ── Program selection ── */}
        {paymentStep === "selection" && (
          <>
            {/* Active Applications table on top */}
            <ApplicationsTable apps={applicants} />

            {/* Available Programs cards below */}
            <div className="mt-16 space-y-6">
              <div className="flex items-center gap-3">
                <div className="h-8 w-2 bg-[#6b357d] rounded-full shadow-md shadow-purple-500/30"></div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
                  Available Programs
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {programTypes.map((form) => (
                  <Card
                    key={form.typeId}
                    className="group relative overflow-hidden bg-white/85 backdrop-blur-md hover:shadow-2xl hover:shadow-purple-500/5 hover:-translate-y-1.5 transition-all duration-500 rounded-[24px] border border-slate-200/60 flex flex-col justify-between"
                  >
                    <div
                      className={`absolute inset-0 bg-gradient-to-br ${form.color} opacity-20 group-hover:opacity-35 transition-opacity duration-500`}
                    ></div>
                    <div className="absolute -right-16 -top-16 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500 pointer-events-none" />

                    <CardHeader className="relative z-10 p-8 pb-6">
                      <div className="flex justify-between items-start gap-4 mb-4">
                        <span className="p-3 bg-purple-50 rounded-xl text-[#6b357d] border border-purple-100 group-hover:bg-purple-100 transition-colors duration-300 shadow-sm">
                          <GraduationCap className="w-5 h-5" />
                        </span>
                        {form.fee !== undefined ? (
                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-100 uppercase tracking-wider">
                            Active
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-slate-50 text-slate-400 text-[10px] font-bold rounded-full border border-slate-100 uppercase tracking-wider">
                            Closed
                          </span>
                        )}
                      </div>
                      <CardTitle className="text-xl md:text-2xl font-black text-slate-800 tracking-tight leading-tight group-hover:text-[#6b357d] transition-colors duration-300 uppercase">
                        {form.name}
                      </CardTitle>
                      {form.fee !== undefined ? (
                        <div className="mt-3 flex items-baseline gap-1">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            Price:
                          </span>
                          <span className="text-xl font-black text-[#6b357d]">
                            ₦{form.fee.toLocaleString()}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium italic mt-3 block">
                          Temporarily unavailable
                        </span>
                      )}
                    </CardHeader>

                    <CardContent className="relative z-10 p-8 pt-0">
                      {blockedTypeIds.has(form.typeId) ? (
                        <div className="space-y-2">
                          <div className="w-full h-14 rounded-2xl bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center gap-2 text-emerald-700 font-black text-sm uppercase tracking-widest">
                            <CheckCircle2 className="h-5 w-5" />
                            Form Purchased
                          </div>
                          <p className="text-center text-[10px] text-slate-400 font-semibold uppercase tracking-widest">
                            Re-purchase only allowed if rejected
                          </p>
                        </div>
                      ) : pendingTypeIds.has(form.typeId) ? (
                        <div className="space-y-2">
                          <div className="w-full h-14 rounded-2xl bg-amber-50 border-2 border-amber-200 flex items-center justify-center gap-2 text-amber-700 font-black text-sm uppercase tracking-widest">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Payment Processing
                          </div>
                          <p className="text-center text-[10px] text-slate-400 font-semibold uppercase tracking-widest">
                            Your payment is being confirmed
                          </p>
                        </div>
                      ) : (
                        <Button
                          onClick={() => {
                            if (form.fee === undefined) return;
                            setSelectedForm(form);
                            setPaymentStep("confirmation");
                          }}
                          disabled={form.fee === undefined}
                          className="w-full h-14 text-lg font-black uppercase tracking-wider shadow-lg shadow-purple-500/10 hover:shadow-purple-500/20 flex items-center justify-center gap-2 group/btn transition-all duration-300"
                        >
                          {form.fee === undefined
                            ? "Coming Soon"
                            : "Get Started"}
                          {form.fee !== undefined && (
                            <ChevronRight className="h-5 w-5 group-hover/btn:translate-x-1 transition-transform" />
                          )}
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
            <Card className="border-0 shadow-2xl overflow-hidden bg-white rounded-[40px]">
              <CardHeader className="text-center space-y-2 pb-0 p-8">
                <div className="pt-6">
                  <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">
                    Programme:
                  </p>
                  <p className="text-2xl font-black text-[#433878] uppercase leading-tight italic">
                    {selectedForm.name}
                  </p>
                </div>
              </CardHeader>

              <CardContent className="p-10 pt-6 space-y-8 text-center">
                <div className="bg-slate-50 rounded-[32px] p-8 space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-bold italic">
                      Application Fee
                    </span>
                    <span className="font-black text-slate-700">
                      ₦{selectedForm.fee.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-bold italic">
                      Processing Fee
                    </span>
                    <span className="font-black text-slate-700">
                      ₦
                      {processingFee.toLocaleString("en-NG", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="h-px bg-slate-200 my-2"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-900 font-black uppercase text-xs tracking-widest">
                      Total Payable
                    </span>
                    <span className="text-3xl font-black text-[#433878]">
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
                  className="w-full h-14 bg-[#6b357d] hover:bg-[#5a2d69] text-white font-bold text-lg uppercase tracking-wider rounded-xl shadow-lg shadow-purple-500/10 hover:shadow-purple-500/20 transition-all duration-300 disabled:opacity-70 flex items-center justify-center gap-2"
                  onClick={handlePayNow}
                  disabled={isProcessing || !scriptReady}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Loading
                    </>
                  ) : scriptReady ? (
                    <>
                      Pay Now
                      <ChevronRight className="w-5 h-5" />
                    </>
                  ) : (
                    "Loading payment gateway..."
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Admission modal — offered but not yet paid acceptance fee ── */}
        {showAdmissionModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white/95 backdrop-blur-md rounded-[32px] p-8 max-w-md w-full mx-4 border border-slate-100 shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-200">
              <div className="w-24 h-24 bg-purple-50 border border-purple-100 text-[#6b357d] rounded-full flex items-center justify-center mx-auto mb-4 shadow-md shadow-purple-500/5 animate-bounce">
                <GraduationCap className="w-12 h-12" />
              </div>
              <div className="space-y-3">
                <span className="px-3 py-1 bg-purple-50 text-purple-700 text-xs font-bold rounded-full border border-purple-100 uppercase tracking-widest">
                  Offer Issued 🎉
                </span>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">
                  Congratulations!
                </h3>
                <p className="text-slate-500 font-medium text-base leading-relaxed px-2">
                  Precious Cornerstone University has offered you admission!
                  Please proceed to complete your registration and pay the
                  acceptance fee to secure your spot.
                </p>
              </div>
              <Button
                onClick={() => setShowAdmissionModal(false)}
                className="w-full h-14 bg-[#6b357d] hover:bg-[#5a2d69] text-white font-bold text-lg rounded-xl shadow-lg shadow-purple-500/10 hover:shadow-purple-500/20 transition-all duration-300"
              >
                View Details &amp; Secure Spot
              </Button>
            </div>
          </div>
        )}

        {/* ── Student portal modal — acceptance fee paid, prompt to access student portal ── */}
        {showStudentPortalModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-200">
              <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                <CheckCircle2 className="w-10 h-10 text-purple-600" />
              </div>
              <div className="space-y-3">
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">
                  Acceptance Fee Confirmed!
                </h3>
                <p className="text-slate-600 font-medium leading-snug px-2">
                  Your acceptance fee has been received. You can now access the{" "}
                  <span className="font-black text-purple-700">
                    Student Portal
                  </span>{" "}
                  to pay your school fees, upload required documents, and
                  download your admission letter & other forms.
                </p>
              </div>
              <div className="space-y-3">
                <Button
                  onClick={async () => {
                    // Refresh token so the role updates from 'applicant' → 'admitted'
                    // before navigating, preventing the student login from bouncing back.
                    try {
                      const response = (await ApiClient.verifyToken()) as any;
                      if (response.token) ApiClient.setToken(response.token);
                    } catch {}
                    window.location.href = window.location.pathname.startsWith(
                      "/e-portal",
                    )
                      ? "/e-portal/student/dashboard"
                      : "/student/dashboard";
                  }}
                  className="w-full h-14 bg-purple-700 hover:bg-purple-800 text-white font-bold text-lg rounded-xl shadow-lg shadow-purple-700/30"
                >
                  Go to Student Portal
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setShowStudentPortalModal(false)}
                  className="w-full text-slate-500 font-medium"
                >
                  Stay on this page
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
