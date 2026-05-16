"use client";

import React, { useEffect, useState } from "react";
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
      currency: string;   // "566" = NGN
      site_redirect_url: string;
      mode: "TEST" | "LIVE";
      onComplete: (response: { resp: string; [key: string]: any }) => void;
    }) => void;
  }
}

// Interswitch inline checkout — use LIVE script URL with mode:"TEST" for sandbox
const ISW_SCRIPT_URL =
  "https://newwebpay.interswitchng.com/inline-checkout.js";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient, ApplicantStatus, AdmissionLetterData, PaymentTransaction } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
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
} from "lucide-react";
import RecommendationCard from "@/components/RecommendationCard";
import { Recommendation } from "@/lib/api";
import ApplicationFormComponent from "@/components/ApplicationForm";
import FsmsAdmissionLetter from "@/components/FsmsAdmissionLetter";
import ApplicantProfile from "@/components/ApplicantProfile";

const TYPE_STYLES: Record<number, { color: string; border: string }> = {
  1: { color: 'from-blue-500/10 to-blue-600/5', border: 'border-blue-200' },
  2: { color: 'from-purple-500/10 to-purple-600/5', border: 'border-purple-200' },
  3: { color: 'from-amber-500/10 to-amber-600/5', border: 'border-amber-200' },
  4: { color: 'from-pink-500/10 to-pink-600/5', border: 'border-pink-200' },
  5: { color: 'from-emerald-500/10 to-emerald-600/5', border: 'border-emerald-200' },
  6: { color: 'from-indigo-500/10 to-indigo-600/5', border: 'border-indigo-200' },
  7: { color: 'from-rose-500/10 to-rose-600/5', border: 'border-rose-200' },
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
  const router = useRouter();
  const { user, isAuthenticated, logout, refreshStatus } = useAuth();
  const [status, setStatus] = useState<ApplicantStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [admissionLetter, setAdmissionLetter] = useState<AdmissionLetterData | null>(null);
  const [showLetter, setShowLetter] = useState(false);
  const [showAdmissionModal, setShowAdmissionModal] = useState(false);

  const [applicants, setApplicants] = useState<ApplicantStatus[]>([]);
  const [programTypes, setProgramTypes] = useState<DynamicProgramForm[]>([]);
  const [formTemplate, setFormTemplate] = useState<any>(null);
  const [viewingFormId, setViewingFormId] = useState<number | null>(null);
  const [submittedFormData, setSubmittedFormData] = useState<any>(null);
  const [submittedDocuments, setSubmittedDocuments] = useState<any[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [acceptanceFeeData, setAcceptanceFeeData] = useState<{ amount: number; feeName: string; paid: boolean } | null>(null);
  const [preloadedForms, setPreloadedForms] = useState<Record<number, { form: any; documents: any[] }>>({});
  const [preloadedTemplates, setPreloadedTemplates] = useState<Record<number, any>>({}); // keyed by program_type_id

  // Payment states
  const [selectedForm, setSelectedForm] = useState<DynamicProgramForm | null>(null);
  const [paymentStep, setPaymentStep] = useState<'selection' | 'confirmation' | 'processing'>('selection');
  const [isProcessing, setIsProcessing] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);
  const [payResult, setPayResult] = useState<'success' | 'failed' | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const response = await ApiClient.getApplicantStatus();
      setStatus(response.applicant);
      const apps = response.applicants || [];
      setApplicants(apps);

      if (response.applicant?.admission_status === "admitted") {
        if (!response.applicant.has_paid_acceptance_fee) {
          setShowAdmissionModal(true);
        }
        try {
          const letterResponse = await ApiClient.getAdmissionLetter();
          setAdmissionLetter(letterResponse);
        } catch (err) {
          console.error("Error loading admission letter:", err);
        }
      }

      try {
        const ptData = await ApiClient.getProgramTypes();
        const forms: DynamicProgramForm[] = ptData.program_types.map((type: any) => {
          const style = TYPE_STYLES[type.id] || { color: 'from-slate-500/10 to-slate-600/5', border: 'border-slate-200' };
          return { id: type.id, typeId: type.id, name: type.name, fee: type.fee, ...style };
        });
        setProgramTypes(forms);
      } catch (err) {
        console.error("Error loading program types:", err);
      }

      // Background pre-fetch: form data + form templates for every applicant
      if (apps.length > 0) {
        Promise.all(
          apps.map(async (app: ApplicantStatus) => {
            try {
              const [formData, templateData] = await Promise.all([
                ApiClient.getForm(app.id),
                ApiClient.getFormTemplate(app.program_type_id),
              ]);
              return {
                appId: app.id,
                typeId: app.program_type_id,
                form: formData.form,
                documents: formData.documents || [],
                template: templateData,
              };
            } catch {
              return null;
            }
          })
        ).then(results => {
          const formsMap: Record<number, { form: any; documents: any[] }> = {};
          const templatesMap: Record<number, any> = {};
          results.forEach(r => {
            if (!r) return;
            formsMap[r.appId] = { form: r.form, documents: r.documents };
            templatesMap[r.typeId] = r.template;
          });
          setPreloadedForms(formsMap);
          setPreloadedTemplates(templatesMap);
        });
      }

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
    script.onerror = () => setPayError("Failed to load payment gateway. Please refresh.");
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
        'application_fee',
        selectedForm.typeId,
      );
      const callbackUrl =
        `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/e-portal/applicant/payment/callback`;

      if (typeof window.webpayCheckout !== "function") {
        throw new Error("Payment gateway not ready. Please refresh the page.");
      }

      window.webpayCheckout({
        merchant_code:     init.merchant_code,
        pay_item_id:       init.pay_item_id,
        txn_ref:           init.reference_no,
        amount:            init.amount_kobo,
        currency:          566,
        site_redirect_url: callbackUrl,
        mode:              "TEST",
        onComplete: async (response) => {
          // Always verify server-side
          try {
            const verification = await ApiClient.verifyPayment(init.reference_no);
            if (verification.is_successful) {
              ApiClient.clearCache();
              setPayResult('success');
              setPaymentStep('selection');
              await loadStatus();
            } else {
              setPayResult('failed');
              setPayError(verification.response_desc || "Payment was not completed.");
            }
          } catch (err: any) {
            setPayResult('failed');
            setPayError(err.message || "Verification failed. Contact support if funds were debited.");
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
          <p className="text-muted-foreground font-medium">Authenticating e-portal session...</p>
        </div>
      </div>
    );
  }

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground font-medium">Loading application...</p>
        </div>
      </div>
    );
  }

  // Table for paid applications
  const ApplicationsTable = ({ apps }: { apps: ApplicantStatus[] }) => {
    return (
      <div className="mt-20 space-y-6">
        <div className="flex items-center gap-3">
           <div className="h-8 w-2 bg-[#6b357d] rounded-full"></div>
           <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">My Applications</h2>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-[#6b357d] text-white">
                <th className="p-4 font-bold text-sm">Name</th>
                <th className="p-4 font-bold text-sm">Form No.</th>
                <th className="p-4 font-bold text-sm">Matric. No</th>
                <th className="p-4 font-bold text-sm">Programme</th>
                <th className="p-4 font-bold text-sm">Registration Status</th>
                <th className="p-4 font-bold text-sm">Admission Year</th>
                <th className="p-4 font-bold text-sm">Admission Status</th>
                <th className="p-4 font-bold text-sm text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="p-4 text-sm text-slate-600 capitalize">{app.user_name}</td>
                  <td className="p-4 text-sm text-slate-600 font-mono">{app.form_no || '-'}</td>
                  <td className="p-4 text-sm text-slate-600">-</td>
                  <td className="p-4 text-sm text-slate-600 uppercase font-bold">{app.program_name}</td>
                  <td className="p-4 text-sm">
                     <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${['submitted', 'screening', 'admitted', 'accepted', 'rejected'].includes(app.application_status) ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {['submitted', 'screening', 'admitted', 'accepted', 'rejected'].includes(app.application_status) ? 'complete' : 'pending'}
                     </span>
                  </td>
                  <td className="p-4 text-sm text-slate-600">{app.program_session}</td>
                  <td className="p-4 text-sm text-slate-600 capitalize font-medium">{app.admission_status.replace('_', ' ')}</td>
                  <td className="p-4 text-center">
                    <Button
                      size="sm"
                      className="bg-[#6b357d] hover:bg-[#5a2d69] text-white font-bold h-8 px-6"
                      onClick={async () => {
                         setViewingFormId(app.id);

                         const cachedTemplate = preloadedTemplates[app.program_type_id];
                         const cachedForm     = preloadedForms[app.id];

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
                                   .then(r => ({ form: r.form ?? r, documents: r.documents ?? [] }))
                                   .catch(() => ({ form: null, documents: [] })),
                           ]);

                           if (!cachedTemplate) setFormTemplate(templateResult);
                           if (!cachedForm) {
                             setSubmittedFormData((formResult as any).form);
                             setSubmittedDocuments((formResult as any).documents ?? []);
                           }

                           if (['admitted', 'accepted'].includes(app.application_status)) {
                             try {
                               const feeData = await ApiClient.getAcceptanceFee();
                               setAcceptanceFeeData({
                                 amount: feeData.acceptance_fee,
                                 feeName: feeData.fee_name,
                                 paid: app.has_paid_acceptance_fee,
                               });
                             } catch (e) {
                               console.error('Failed to load acceptance fee', e);
                             }
                           } else {
                             setAcceptanceFeeData(null);
                           }
                         } catch (e) {
                           console.error('Failed to load form data', e);
                         } finally {
                           setProfileLoading(false);
                         }
                       }}
                    >
                      {['submitted', 'admitted', 'accepted'].includes(app.application_status) ? 'Profile' : 'Apply'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Form view
  if (viewingFormId && formTemplate) {
     const currentApp = applicants.find(a => a.id === viewingFormId);

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

            {currentApp && ['submitted', 'admitted', 'accepted'].includes(currentApp.application_status) ? (
                <div className="space-y-10">
                   <div>
                      {currentApp.admission_status === 'admitted' && (
                        currentApp.admission_letter_sent ? (
                          <div className="mb-8 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-100 shadow-sm text-left">
                            <div className="flex items-center gap-4 mb-4">
                               <div className="p-3 bg-green-500 rounded-lg text-white shadow-lg shadow-green-500/30">
                                 <FileText className="h-6 w-6" />
                               </div>
                               <div>
                                 <h5 className="font-black text-green-800 text-lg">Admission Letter Available</h5>
                                 <p className="text-green-600 font-medium text-sm">Your official admission letter is ready to be printed.</p>
                               </div>
                            </div>
                            <Button onClick={() => setShowLetter(true)} className="bg-green-600 hover:bg-green-700 text-white font-bold shadow-sm">
                              <Printer className="w-4 h-4 mr-2" /> View Admission Letter
                            </Button>
                          </div>
                        ) : !currentApp.has_paid_acceptance_fee ? (
                          <div className="mb-8 bg-gradient-to-br from-amber-50 to-yellow-50 rounded-xl p-6 border border-amber-100 shadow-sm text-left">
                            <div className="flex items-center gap-4">
                               <div className="p-3 bg-amber-500 rounded-lg text-white shadow-lg shadow-amber-500/30">
                                 <AlertCircle className="h-6 w-6" />
                               </div>
                               <div>
                                 <h5 className="font-black text-amber-800 text-lg">Acceptance Fee Payment Required</h5>
                                 <p className="text-amber-600 font-medium text-sm">Please pay your acceptance fee to secure your admission. Your admission letter will be provided after payment is confirmed.</p>
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
                                 <h5 className="font-black text-blue-800 text-lg">Acceptance Fee Paid</h5>
                                 <p className="text-blue-600 font-medium text-sm">Your payment is confirmed. Please wait while the admission officer generates and sends your admission letter.</p>
                               </div>
                            </div>
                          </div>
                        )
                      )}
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
                     <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Application Portal - {formTemplate.program}</h2>
                     <p className="text-slate-500 font-medium">Please complete all required sections carefully.</p>
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

  const paidApplicants = applicants.filter(a => a.has_paid_application_fee);

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="max-w-6xl mx-auto px-4 py-12">

        {/* ── Program selection ── */}
        {paymentStep === 'selection' && (
          <>
            <div className="text-center mb-16 space-y-4">
              <h1 className="text-4xl font-black tracking-tight text-slate-900 sm:text-6xl uppercase italic">
                Admission Gateway
              </h1>
              <p className="text-slate-500 text-xl font-medium max-w-2xl mx-auto italic">
                Select your preferred entry program and begin your academic journey with us.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
              {programTypes.map((form) => (
                <Card
                  key={form.typeId}
                  className={`group relative overflow-hidden bg-white hover:shadow-2xl transition-all duration-500 rounded-[32px] border-2 ${form.border} flex flex-col`}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${form.color} opacity-50 group-hover:opacity-100 transition-opacity`}></div>
                  <CardHeader className="relative z-10 p-8">
                    <CardTitle className="text-3xl font-black text-slate-800 uppercase tracking-tight italic">
                      {form.name}
                    </CardTitle>
                    {form.fee !== undefined && (
                      <CardDescription className="text-slate-500 font-bold uppercase tracking-widest text-xs pt-1">
                        ₦{form.fee.toLocaleString()}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="relative z-10 flex-1 p-8 pt-0" />
                  <CardContent className="relative z-10 p-8 pt-0">
                    <Button
                      onClick={() => {
                        if (form.fee === undefined) return;
                        setSelectedForm(form);
                        setPaymentStep('confirmation');
                      }}
                      disabled={form.fee === undefined}
                      className="w-full h-14 text-lg font-black uppercase tracking-wider shadow-lg shadow-black/5 flex items-center justify-center gap-2 group/btn"
                    >
                      {form.fee === undefined ? 'Coming Soon' : 'Get Started'}
                      {form.fee !== undefined && <ChevronRight className="h-5 w-5 group-hover/btn:translate-x-1 transition-transform" />}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            <ApplicationsTable apps={applicants} />
          </>
        )}

        {/* ── Payment confirmation ── */}
        {paymentStep === 'confirmation' && selectedForm && (
          <div className="max-w-md mx-auto animate-in fade-in zoom-in duration-300">
             <Button variant="ghost" onClick={() => { setPaymentStep('selection'); setIsRedirecting(false); }} className="mb-4 text-slate-500 font-bold italic">← Back to selection</Button>
             <Card className="border-0 shadow-2xl overflow-hidden bg-white rounded-[40px]">
                <CardHeader className="text-center space-y-2 pb-0 p-8">
                  <div className="pt-6">
                    <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">Programme:</p>
                    <p className="text-2xl font-black text-[#433878] uppercase leading-tight italic">
                      {selectedForm.name}
                    </p>
                  </div>
                </CardHeader>

                <CardContent className="p-10 pt-6 space-y-8 text-center">
                  <div className="bg-slate-50 rounded-[32px] p-8 space-y-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500 font-bold italic">Application Fee</span>
                      <span className="font-black text-slate-700">₦{selectedForm.fee.toLocaleString()}</span>
                    </div>
                    <div className="h-px bg-slate-200 my-2"></div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-900 font-black uppercase text-xs tracking-widest">Total Payable</span>
                      <span className="text-3xl font-black text-[#433878]">₦{selectedForm.fee.toLocaleString()}</span>
                    </div>
                  </div>

                  {payError && (
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-red-700 text-sm font-medium text-left">
                      {payError}
                    </div>
                  )}

                  {payResult === 'success' && (
                    <div className="bg-green-50 border border-green-100 rounded-2xl p-4 text-green-700 text-sm font-bold text-center">
                      ✓ Payment confirmed! Your application has been started.
                    </div>
                  )}

                  <Button
                    className="w-full h-20 bg-[#433878] hover:bg-[#2E236C] text-white font-black text-2xl uppercase tracking-widest rounded-[24px] shadow-2xl shadow-[#433878]/30 disabled:opacity-70"
                    onClick={handlePayNow}
                    disabled={isProcessing || !scriptReady}
                  >
                    {isProcessing ? (
                      <span className="flex items-center gap-3">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        Opening payment...
                      </span>
                    ) : (
                      scriptReady ? 'Pay Now' : 'Loading...'
                    )}
                  </Button>

                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">
                    Secured by <span className="text-slate-500 italic">Interswitch</span>
                  </p>
                </CardContent>
             </Card>
          </div>
        )}

        {/* ── Admission modal ── */}
        {showAdmissionModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
             <div className="bg-white rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-200">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                  <CheckCircle2 className="w-10 h-10 text-green-600" />
                </div>
                <div className="space-y-3">
                  <h3 className="text-3xl font-black text-slate-900 tracking-tight">Congratulations!</h3>
                  <p className="text-slate-600 font-medium text-lg leading-snug px-2">
                    You have been offered admission. Please proceed to pay your acceptance fee to secure your spot.
                  </p>
                </div>
                <Button
                  onClick={() => setShowAdmissionModal(false)}
                  className="w-full h-14 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-xl shadow-lg shadow-green-600/30"
                >
                  View Details & Pay
                </Button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
