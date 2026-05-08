"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
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
  ShieldCheck,
  Lock,
  X,
  Smartphone,
  Wallet
} from "lucide-react";
import RecommendationCard from "@/components/RecommendationCard";
import { Recommendation } from "@/lib/api";
import ApplicationFormComponent from "@/components/ApplicationForm";
import FsmsAdmissionLetter from "@/components/FsmsAdmissionLetter";
import ApplicantProfile from "@/components/ApplicantProfile";

// Hardcoded defaults for styling
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

  // Payment states
  const [selectedForm, setSelectedForm] = useState<DynamicProgramForm | null>(null);
  const [paymentStep, setPaymentStep] = useState<'selection' | 'confirmation' | 'gateway' | 'processing' | 'success' | 'cancelled'>('selection');
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [referenceId, setReferenceId] = useState<string>('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const TRANSACTION_FEE = (selectedForm?.fee || 0) === 0 ? 0 : 300;

  const PAYMENT_METHODS = [
    { id: 'transfer', title: 'Pay with Transfer', desc: 'Make a transfer directly from your bank account to complete a transaction', icon: Smartphone },
    { id: 'opay', title: 'Pay With Opay', desc: 'Complete transaction with OPay', icon: CheckCircle2 },
    { id: 'quickteller', title: 'Pay with Quickteller', desc: 'Login to your quickteller wallet to get access to your saved cards.', icon: CreditCard },
    { id: 'ussd', title: 'Pay with USSD', desc: 'Dial a USSD string from any of 17+ banks to complete a transaction', icon: Smartphone },
    { id: 'wallet', title: 'Pay with Wallet', desc: 'Make secure payments using third-party payment solutions.', icon: Wallet },
    { id: 'googlepay', title: 'Google Pay', desc: 'Make secure payments using your instruments saved with Google.', icon: 'googlepay' },
  ];

  const generateReferenceId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'ADM';
    for (let i = 0; i < 16; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const loadStatus = async () => {
    try {
      const response = await ApiClient.getApplicantStatus();
      setStatus(response.applicant);
      setApplicants(response.applicants || []);

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

      // Load program types
      try {
        const ptData = await ApiClient.getProgramTypes();
        // Map program types to forms
        const forms: DynamicProgramForm[] = ptData.program_types.map((type: any) => {
          const style = TYPE_STYLES[type.id] || { color: 'from-slate-500/10 to-slate-600/5', border: 'border-slate-200' };
          
          return {
            id: type.id,
            typeId: type.id,
            name: type.name,
            fee: type.fee,
            ...style
          };
        });
        setProgramTypes(forms);
      } catch (err) {
        console.error("Error loading program types:", err);
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

  const handleFinalizePayment = async () => {
    if (!selectedForm) return;
    try {
      setPaymentStep('processing');
      
      // 1. Simulate Payment (Delay for effect)
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      // 2. Process payment on backend
      await ApiClient.processPayment('application_fee', selectedForm.fee, 'online', 'completed', selectedForm.name, selectedForm.typeId);
      
      // 3. Refresh the JWT so role upgrades from freshapplicant → applicant immediately
      await ApiClient.verifyToken().then((res: any) => {
        if (res.token) ApiClient.setToken(res.token);
        if (res.user) {
          // Update localStorage so next page load has the right role
          localStorage.setItem('auth_user', JSON.stringify(res.user));
        }
      }).catch(() => {});

      // 4. Reload dashboard data with fresh role
      ApiClient.clearCache();
      await loadStatus();

      setPaymentStep('success');
      
      // 4. Redirect back to selection after short delay
      setTimeout(() => {
        setPaymentStep('selection');
        setSelectedForm(null);
        setReferenceId('');
        setPaymentMethod(null);
      }, 2000);

    } catch (err) {
      console.error("Error starting application:", err);
      alert("Payment failed. Please try again.");
      setPaymentStep('gateway');
    }
  };

  const handleCancelPayment = async () => {
    try {
      setPaymentStep('cancelled');
      setShowCancelModal(false);
      
      if (selectedForm && referenceId) {
        ApiClient.processPayment('application_fee', selectedForm.fee, 'online', 'cancelled', selectedForm.name, selectedForm.typeId)
          .catch(e => console.error("Error recording cancellation:", e));
      }
      
      setTimeout(() => {
        setPaymentStep('selection');
        setSelectedForm(null);
        setReferenceId('');
        setPaymentMethod(null);
      }, 4000);
    } catch (err) {
      console.error("Error in cancellation flow:", err);
      setShowCancelModal(false);
      setPaymentStep('selection');
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
          <p className="text-muted-foreground font-medium">Loading profile...</p>
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
                  <td className="p-4 text-sm text-slate-600">PT{new Date(app.created_at).getFullYear()}{app.id.toString().padStart(4, '0')}</td>
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
                         setProfileLoading(true);
                         setViewingFormId(app.id);
                         try {
                            const template = await ApiClient.getFormTemplate(app.program_type_id);
                            setFormTemplate(template);

                            const isProfileStage = ['submitted', 'admitted', 'accepted'].includes(app.application_status);
                            if (isProfileStage) {
                               const formData = await ApiClient.getForm(app.id);
                               setSubmittedFormData(formData.form);
                               setSubmittedDocuments(formData.documents || []);

                               // Fetch acceptance fee for admitted applicants
                               if (['admitted', 'accepted'].includes(app.application_status)) {
                                 try {
                                   const feeData = await ApiClient.getAcceptanceFee();
                                   setAcceptanceFeeData({
                                     amount: feeData.acceptance_fee,
                                     feeName: feeData.fee_name,
                                     paid: app.has_paid_acceptance_fee
                                   });
                                 } catch (e) {
                                   console.error('Failed to load acceptance fee', e);
                                 }
                               } else {
                                 setAcceptanceFeeData(null);
                               }
                            }
                         } catch (e) {
                            console.error("Failed to load data", e);
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

  // 1. Form View Logic
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

  // 2. Main Dashboard (Selection + Table)
  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="max-w-6xl mx-auto px-4 py-12">
        
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
                  <CardContent className="relative z-10 flex-1 p-8 pt-0">
                    {/* Extra space removed */}
                  </CardContent>
                  <CardContent className="relative z-10 p-8 pt-0">
                    <Button 
                      onClick={() => {
                        if (form.fee === undefined) return;
                        setSelectedForm(form);
                        setReferenceId(generateReferenceId());
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

        {paymentStep === 'confirmation' && selectedForm && (
          <div className="max-w-md mx-auto animate-in fade-in zoom-in duration-300">
             <Button variant="ghost" onClick={() => setPaymentStep('selection')} className="mb-4 text-slate-500 font-bold italic">← Back to selection</Button>
             <Card className="border-0 shadow-2xl overflow-hidden bg-white rounded-[40px]">
                <CardHeader className="text-center space-y-2 pb-0 p-8">
                  <div className="space-y-1">
                    <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">Reference ID:</p>
                    <p className="text-xl font-black text-slate-800 break-all px-4">{referenceId}</p>
                  </div>
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
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500 font-bold italic">Processing Fee</span>
                      <span className="font-black text-slate-700">₦{TRANSACTION_FEE.toLocaleString()}</span>
                    </div>
                    <div className="h-px bg-slate-200 my-2"></div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-900 font-black uppercase text-xs tracking-widest">Total Payable</span>
                      <span className="text-3xl font-black text-[#433878]">₦{(selectedForm.fee + TRANSACTION_FEE).toLocaleString()}</span>
                    </div>
                  </div>

                  <Button 
                    className="w-full h-20 bg-[#433878] hover:bg-[#2E236C] text-white font-black text-2xl uppercase tracking-widest rounded-[24px] shadow-2xl shadow-[#433878]/30"
                    onClick={() => setPaymentStep('gateway')}
                  >
                    Pay Now
                  </Button>
                </CardContent>
              </Card>
          </div>
        )}

        {paymentStep === 'gateway' && selectedForm && (
           <div className="max-w-4xl mx-auto min-h-[600px] flex animate-in fade-in duration-700 bg-white shadow-2xl rounded-[40px] overflow-hidden border border-slate-100">
              <div className="hidden lg:flex w-80 bg-[#00425F] p-10 flex-col justify-between text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                <div className="relative z-10 space-y-12">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                       <Lock className="w-4 h-4 text-[#00425F]" />
                    </div>
                    <span className="font-black tracking-tighter text-lg italic">Interswitch.</span>
                  </div>
                  
                  <div className="space-y-6">
                    <div className="space-y-1">
                      <p className="text-white/40 text-[10px] font-black uppercase tracking-widest">Transaction Ref</p>
                      <p className="font-mono text-sm break-all">{referenceId}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-white/40 text-[10px] font-black uppercase tracking-widest">Merchant</p>
                      <p className="font-bold text-sm uppercase">Precious Cornerstone University</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-white/40 text-[10px] font-black uppercase tracking-widest">Payment Amount</p>
                      <p className="text-3xl font-black">₦{(selectedForm.fee + TRANSACTION_FEE).toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 space-y-4">
                  <div className="flex items-center gap-2 text-white/60">
                    <ShieldCheck className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">PCI-DSS Compliant</span>
                  </div>
                </div>
              </div>

              <div className="flex-1 p-10 flex flex-col relative bg-white">
                <div className="flex justify-between items-center mb-10">
                   <button 
                     onClick={() => setShowCancelModal(true)}
                     className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                   >
                     <X className="w-5 h-5" />
                   </button>
                </div>

                <div className="flex-1 flex flex-col max-w-lg mx-auto w-full">
                   <div className="space-y-2 mb-10">
                      <h3 className="text-3xl font-black text-slate-900 tracking-tight italic">Choose Payment Method</h3>
                      <p className="text-slate-500 font-medium italic">Select how you want to pay for your application.</p>
                   </div>

                   <div className="space-y-4">
                      {PAYMENT_METHODS.map((method) => {
                        const isComingSoon = method.id !== 'googlepay';
                        
                        return (
                          <div 
                            key={method.id}
                            className={`group relative p-6 border-2 rounded-2xl transition-all duration-300 flex items-center gap-6 ${isComingSoon ? 'border-slate-50 opacity-60' : 'border-slate-100 hover:border-[#00425F] hover:bg-slate-50 cursor-pointer'}`}
                            onClick={() => {
                               if (!isComingSoon) {
                                  setPaymentMethod(method.id);
                                  handleFinalizePayment();
                               }
                            }}
                          >
                             <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 group-hover:bg-white transition-colors">
                                {method.icon === 'googlepay' ? (
                                   <span className="text-xs font-black text-slate-600">G Pay</span>
                                ) : (
                                   <method.icon className="w-6 h-6 text-slate-400 group-hover:text-[#00425F]" />
                                )}
                             </div>
                             
                             <div className="flex-1 space-y-1">
                                <div className="flex items-center gap-2">
                                   <h4 className="text-lg font-black text-slate-800">{method.title}</h4>
                                   {isComingSoon && (
                                      <Badge variant="secondary" className="bg-slate-100 text-[8px] font-black uppercase tracking-tighter py-0 px-2 h-4">Coming Soon</Badge>
                                   )}
                                </div>
                                <p className="text-xs text-slate-500 font-medium leading-relaxed italic">{method.desc}</p>
                             </div>
                             
                             {!isComingSoon && (
                                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-[#00425F] transition-colors" />
                             )}
                          </div>
                        );
                      })}
                   </div>

                   <div className="mt-auto pt-10 text-center">
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">
                         powered by <span className="text-slate-500 italic">Interswitch</span>
                      </p>
                   </div>
                </div>
              </div>
           </div>
        )}

        {(paymentStep === 'processing' || paymentStep === 'success') && (
          <Card className="max-w-md mx-auto py-16 text-center border-none shadow-2xl bg-white animate-in zoom-in-95 duration-500 rounded-[40px]">
            <CardContent className="space-y-8">
              {paymentStep === 'processing' ? (
                <>
                  <div className="relative w-32 h-32 mx-auto">
                    <div className="absolute inset-0 rounded-full border-8 border-slate-100"></div>
                    <div className="absolute inset-0 rounded-full border-8 border-t-primary animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                       <DollarSign className="h-12 w-12 text-primary animate-pulse" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Authorizing</h3>
                    <p className="text-slate-500 font-medium">Verifying transaction with your bank...</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="relative w-32 h-32 mx-auto">
                    <div className="absolute inset-0 bg-green-100 rounded-full scale-100 animate-ping opacity-25"></div>
                    <div className="relative w-full h-full bg-green-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/40">
                      <CheckCircle2 className="h-16 w-16 text-white" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Payment Secured</h3>
                    <p className="text-slate-500 font-medium text-lg">Transaction completed successfully.</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {paymentStep === 'cancelled' && (
          <div className="max-w-xl mx-auto min-h-[600px] flex flex-col items-center justify-center text-center bg-white animate-in zoom-in-95 duration-500">
             <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-8">
                <div className="w-16 h-16 bg-[#FFD700] rounded-xl rotate-45 flex items-center justify-center shadow-lg shadow-yellow-200">
                  <span className="text-white text-4xl font-black -rotate-45 mb-1">!</span>
                </div>
                <div className="space-y-4">
                  <h3 className="text-4xl font-black text-slate-900 tracking-tight">Payment Cancelled</h3>
                  <p className="text-slate-600 font-medium text-xl max-w-sm mx-auto leading-normal px-4">
                    The payment could not be completed.
                  </p>
                </div>
              </div>
          </div>
        )}

        {showCancelModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
             <div className="bg-white rounded-3xl p-8 max-w-sm w-full mx-4 shadow-2xl text-center space-y-8 animate-in zoom-in-95 duration-200">
                <div className="space-y-3">
                  <h3 className="text-3xl font-black text-slate-900 tracking-tight">Cancel Payment?</h3>
                  <p className="text-slate-500 font-medium text-lg leading-tight px-4">Are you sure you want to cancel this payment?</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Button 
                    variant="destructive"
                    onClick={handleCancelPayment}
                    className="w-full h-12 font-bold"
                  >
                    Cancel Payment
                  </Button>
                  <Button 
                    variant="ghost"
                    onClick={() => setShowCancelModal(false)}
                    className="w-full h-12 text-slate-900 font-bold"
                  >
                    Close
                  </Button>
                </div>
              </div>
          </div>
        )}

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
