"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient, ApplicantStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Building,
  DollarSign,
  Loader2,
  XCircle,
  ArrowLeft,
} from "lucide-react";

// ── Main component ────────────────────────────────────────────────────────────
function PaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type") as
    | "acceptance_fee"
    | "tuition"
    | null;
  const { user, isAuthenticated } = useAuth();

  const [status, setStatus] = useState<ApplicantStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedType, setSelectedType] = useState<
    "acceptance_fee" | "tuition" | null
  >(typeParam);

  // Result state
  const [payState, setPayState] = useState<"idle" | "success" | "failed">(
    "idle",
  );
  const [receiptNo, setReceiptNo] = useState<string | null>(null);
  const [paidAmount, setPaidAmount] = useState<number | null>(null);
  const [paidType, setPaidType] = useState<string | null>(null);
  const [acceptanceFeeAmount, setAcceptanceFeeAmount] = useState<number | null>(
    null,
  );
  const [processingFee, setProcessingFee] = useState<number>(300);

  // Tuition breakdown & installment plan states
  const [feeComponents, setFeeComponents] = useState<any[]>([]);
  const [feeTotal, setFeeTotal] = useState<number | null>(null);
  const [installmentPlans, setInstallmentPlans] = useState<any[]>([]);
  const [selectedInstallmentPlanId, setSelectedInstallmentPlanId] = useState<number | null>(null);
  const [installmentAmount, setInstallmentAmount] = useState<number | null>(null);
  const [remainingPercentage, setRemainingPercentage] = useState<number>(100);
  const [paymentMode, setPaymentMode] = useState<"full" | "installment">("full");
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);

  const formatProgramName = () => {
    const degreeCode = (status?.degree_code || "").trim();
    const course = (status?.approved_course || status?.program_name || "").trim();
    if (!course) return "N/A";
    if (!degreeCode) return course;
    return course.toLowerCase().startsWith(degreeCode.toLowerCase())
      ? course
      : `${degreeCode} ${course}`;
  };

  // ── Load applicant status ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/auth/login");
      return;
    }
    const load = async () => {
      try {
        const res = await ApiClient.getApplicantStatus();
        if (!res.applicant) {
          throw new Error("No admitted or accepted application found for this user");
        }
        setStatus(res.applicant);
        if (!selectedType) {
          if (!res.applicant.has_paid_acceptance_fee)
            setSelectedType("acceptance_fee");
          else if (!res.applicant.has_paid_tuition) setSelectedType("tuition");
        }
        try {
          const feeData = await ApiClient.getAcceptanceFee();
          if (!feeData || !feeData.found || !feeData.acceptance_fee || feeData.acceptance_fee <= 0) {
            throw new Error(feeData.message || "Acceptance fee not configured.");
          }
          setAcceptanceFeeAmount(feeData.acceptance_fee);
          if (typeof feeData.processing_fee === "number") {
            setProcessingFee(feeData.processing_fee);
          }
        } catch (e: any) {
          console.error("Could not load acceptance fee amount", e);
          setError(e.message || "Failed to load acceptance fee.");
        }
      } catch (e: any) {
        setError(e.message || "Failed to load application status.");
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, router]);

  // ── Load tuition breakdown and installment plans ──────────────────────────
  useEffect(() => {
    if (selectedType !== "tuition" || !status) return;

    const loadTuition = async () => {
      setLoadingBreakdown(true);
      setBreakdownError(null);
      try {
        const [breakdown, plansRes, historyRes] = await Promise.all([
          ApiClient.getTuitionBreakdown(),
          ApiClient.getInstallmentPlans(),
          ApiClient.getPaymentHistory(),
        ]);
        if (!breakdown || !breakdown.found || !breakdown.total || breakdown.total <= 0) {
          throw new Error(breakdown.message || "Tuition fee breakdown not configured.");
        }
        setFeeComponents(breakdown.components || []);
        setFeeTotal(breakdown.total);
        if (typeof breakdown.processing_fee === "number") {
          setProcessingFee(breakdown.processing_fee);
        }
        const plans = plansRes.installment_plans || [];
        setInstallmentPlans(plans);

        const history = historyRes.payment_history || [];
        const paidPlanIds = new Set<number>();
        history.forEach((p: any) => {
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
              parseFloat((breakdown.total * (next.percentage / 100) || 0).toFixed(2))
            );
          } else {
            setSelectedInstallmentPlanId(null);
            setInstallmentAmount(null);
          }
        }
      } catch (err: any) {
        console.error("Error loading tuition breakdown:", err);
        setBreakdownError(err.message || "Failed to compile school fees.");
        setFeeComponents([]);
        setFeeTotal(null);
      } finally {
        setLoadingBreakdown(false);
      }
    };
    loadTuition();
  }, [selectedType, status]);

  // ── Trigger inline checkout ───────────────────────────────────────────────
  const handlePayment = async () => {
    if (!selectedType || !status) return;

    setProcessing(true);
    setError(null);

    try {
      const init = await ApiClient.initiatePayment(
        selectedType,
        undefined,
        undefined,
        selectedType === "tuition" && paymentMode === "installment"
          ? (selectedInstallmentPlanId ?? undefined)
          : undefined
      );
      
      const url = new URL(init.redirect_url);
      const params = Object.fromEntries(url.searchParams.entries());

      const form = document.createElement("form");
      form.method = "POST";
      // Use the full path the backend constructed — do NOT hardcode /collections/w/pay,
      // which is the old card-only endpoint. The backend returns /pay (the unified
      // newwebpay endpoint that supports all channels including bank transfer & USSD).
      form.action = `${url.origin}${url.pathname}`;

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
        input.value = selectedType === "tuition" ? "School Fees" : "Acceptance Fee";
        form.appendChild(input);
      }

      document.body.appendChild(form);
      form.submit();
      return;
    } catch (err: any) {
      setError(err.message || "Failed to start payment. Please try again.");
      setProcessing(false);
    }
  };

  const paymentLabel =
    (paidType ?? selectedType) === "acceptance_fee"
      ? "Acceptance Fee"
      : (paidType ?? selectedType) === "tuition"
        ? `School Fees (${paymentMode === "installment" ? "Installment Plan" : "Full Payment"})`
        : "Payment";

  // ── Loading screen ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
        </div>
      </div>
    );
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (payState === "success") {
    // Where to go after acceptance_fee: profile view (shows the paid banner).
    // Tuition and others go to the main dashboard.
    const postPayUrl =
      paidType === "acceptance_fee"
        ? "/applicant/dashboard?view=profile"
        : "/applicant/dashboard";

    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-0 shadow-2xl rounded-[40px] overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-green-400 to-emerald-500" />
          <CardHeader className="text-center pt-10 pb-2">
            <div className="flex justify-center mb-4">
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 bg-green-100 rounded-full animate-ping opacity-25" />
                <div className="relative w-full h-full bg-green-500 rounded-full flex items-center justify-center shadow-xl shadow-green-500/30">
                  <CheckCircle2 className="h-10 w-10 text-white" />
                </div>
              </div>
            </div>
            <CardTitle className="text-2xl font-black tracking-tight">
              Payment Confirmed!
            </CardTitle>
            <CardDescription className="font-medium mt-1">
              Your {paymentLabel} has been confirmed and recorded.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-2">
            <div className="bg-slate-50 rounded-2xl p-5 space-y-3 text-sm">
              {receiptNo && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">
                    Receipt No.
                  </span>
                  <span className="font-mono font-bold text-slate-800">
                    {receiptNo}
                  </span>
                </div>
              )}
              {paidAmount !== null && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">
                    Amount Paid
                  </span>
                  <span className="font-bold text-slate-800">
                    ₦
                    {Number(paidAmount).toLocaleString("en-NG", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Payment Type</span>
                <span className="font-bold text-slate-800">{paymentLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Status</span>
                <span className="font-bold text-green-600">Successful</span>
              </div>
            </div>
            {paidType === "acceptance_fee" && (
              <p className="text-xs text-slate-500 text-center mt-3 font-medium">
                You will be redirected to your profile where you can view your
                admission status.
              </p>
            )}
          </CardContent>
          <CardFooter className="flex-col gap-3 px-8 pb-10 pt-4">
            {receiptNo && (
              <Button
                variant="outline"
                className="w-full h-12 font-bold"
                onClick={async () => {
                  try {
                    const blob = await ApiClient.downloadPaymentReceipt(
                      receiptNo!,
                    );
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `receipt_${receiptNo}.pdf`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch (e) {
                    console.error("Receipt download failed", e);
                  }
                }}
              >
                Download Receipt
              </Button>
            )}
            <Button
              className="w-full h-12 font-bold bg-green-600 hover:bg-green-700"
              onClick={() => router.push(postPayUrl)}
            >
              {paidType === "acceptance_fee"
                ? "View My Profile"
                : "Go to Dashboard"}
            </Button>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-300 text-center mt-2">
              Powered by{" "}
              <span className="text-slate-400 italic">Interswitch</span>
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // ── Pending screen (Z0 / network delay) ──────────────────────────────────
  if ((payState as any) === "pending") {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-0 shadow-2xl rounded-[40px] overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-amber-400 to-yellow-400" />
          <CardHeader className="text-center pt-10 pb-2">
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center">
                <Loader2 className="h-10 w-10 text-amber-600 animate-spin" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black tracking-tight">
              Payment Processing
            </CardTitle>
            <CardDescription className="font-medium mt-1">
              {error || "Your payment is being confirmed by the gateway."}
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex-col gap-3 px-8 pb-10 pt-4">
            <Button
              className="w-full h-12 font-bold"
              onClick={() => router.push("/applicant/dashboard")}
            >
              Go to Dashboard
            </Button>
            <p className="text-xs text-slate-400 text-center">
              Your transaction status updates automatically. Check your
              transaction history.
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // ── Failed screen ─────────────────────────────────────────────────────────
  if (payState === "failed") {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-0 shadow-2xl rounded-[40px] overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-red-400 to-rose-500" />
          <CardHeader className="text-center pt-10 pb-2">
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center shadow-xl shadow-red-500/30">
                <XCircle className="h-10 w-10 text-white" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black tracking-tight">
              Payment Not Successful
            </CardTitle>
            <CardDescription className="font-medium mt-1">
              {error || "The payment was not completed. No funds were debited."}
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex-col gap-3 px-8 pb-10 pt-4">
            <Button
              className="w-full h-12 font-bold"
              onClick={() => {
                setPayState("idle");
                setError(null);
              }}
            >
              Try Again
            </Button>
            <Button
              variant="outline"
              className="w-full h-12 font-bold"
              onClick={() => router.push("/applicant/dashboard")}
            >
              Return to Dashboard
            </Button>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-300 text-center mt-2">
              Powered by{" "}
              <span className="text-slate-400 italic">Interswitch</span>
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const isFeeLoading = loading || (selectedType === "tuition" && loadingBreakdown);
  const isFeeError = selectedType === "tuition"
    ? (!!breakdownError || feeTotal === null || feeTotal <= 0 || (paymentMode === "installment" && (installmentAmount === null || installmentAmount <= 0)))
    : selectedType === "acceptance_fee"
      ? (!!error || acceptanceFeeAmount === null || acceptanceFeeAmount <= 0)
      : true;

  const feeSubtotal = selectedType === "acceptance_fee"
    ? (acceptanceFeeAmount || 0)
    : selectedType === "tuition"
      ? (paymentMode === "installment" ? (installmentAmount || 0) : ((feeTotal || 0) * (remainingPercentage / 100)))
      : 0;

  // ── Main checkout UI ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex justify-between items-center">
          <Button
            variant="ghost"
            className="text-slate-500 hover:text-slate-800 gap-2 px-0"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>

        {/* Side-by-side Layout for Review Details and Fee Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          {/* Card 1: Review applicant and payment details */}
          <Card className="border-slate-100 shadow-xl bg-white rounded-3xl overflow-hidden flex flex-col justify-between">
            <CardHeader className="pb-4 border-b border-slate-50">
              <CardTitle className="text-xl font-bold text-slate-800">
                Review Applicant Details
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6 flex-grow">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Applicant Name
                  </span>
                  <p className="text-base font-bold text-slate-800 capitalize leading-snug">
                    {user?.name}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Application Program
                  </span>
                  <p className="text-base font-bold text-slate-800 uppercase leading-snug">
                    {formatProgramName()}
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Payment Description
                </span>
                <div className="p-4 bg-purple-50/50 border border-purple-100/50 rounded-2xl">
                  <p className="text-sm font-bold text-slate-800 capitalize">
                    {selectedType ? selectedType.replace("_", " ") : "No Selection"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    This fee is required to proceed with your enrollment.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Fee Breakdown */}
          <Card className="border-slate-100 shadow-xl bg-white rounded-3xl overflow-hidden flex flex-col justify-between">
            <CardHeader className="pb-4 border-b border-slate-50">
              <CardTitle className="text-xl font-bold text-slate-800">
                Fee Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4 flex-grow">
              {selectedType === "acceptance_fee" ? (
                // Acceptance Fee Breakdown
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-slate-100">
                    <span className="text-sm font-semibold text-slate-700">Acceptance Fee</span>
                    <span className="text-sm font-bold text-slate-900 font-mono font-medium">
                      {loading ? (
                        "Loading..."
                      ) : error || acceptanceFeeAmount === null ? (
                        <span className="text-red-500 font-bold">Failed to load</span>
                      ) : (
                        `₦${acceptanceFeeAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-slate-100">
                    <span className="text-sm font-semibold text-slate-700">Processing Fee</span>
                    <span className="text-sm font-bold text-slate-900 font-mono font-medium">
                      ₦{processingFee.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-t border-slate-200 font-bold text-[#6b357d] mt-2">
                    <span className="text-sm">Total</span>
                    <span className="text-sm font-mono">
                      {acceptanceFeeAmount !== null && (
                        `₦${(acceptanceFeeAmount + processingFee).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
                      )}
                    </span>
                  </div>
                </div>
              ) : selectedType === "tuition" ? (
                // Tuition Breakdown
                <div className="space-y-4">
                  {loadingBreakdown ? (
                    <div className="space-y-3 animate-pulse">
                      <div className="h-8 bg-slate-100 rounded-lg w-1/2"></div>
                      <div className="h-4 bg-slate-100 rounded w-full"></div>
                      <div className="h-4 bg-slate-100 rounded w-5/6"></div>
                    </div>
                  ) : breakdownError || feeTotal === null ? (
                    <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
                      <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-red-800">Failed to load fees</p>
                        <p className="text-xs text-red-600 mt-0.5">{breakdownError || "Could not retrieve tuition breakdown."}</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Tabs */}
                      {installmentPlans.length > 0 && (
                        <div className="flex items-center gap-2 mb-4 bg-slate-100 p-1.5 rounded-xl w-fit">
                          <button
                            type="button"
                            className={`px-4 py-2 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                              paymentMode === "full"
                                ? "bg-white text-slate-800 shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                            onClick={() => {
                              setPaymentMode("full");
                              setInstallmentAmount(null);
                            }}
                          >
                            Full Payment
                          </button>
                          <button
                            type="button"
                            className={`px-4 py-2 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                              paymentMode === "installment"
                                ? "bg-white text-slate-800 shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                            onClick={() => {
                              setPaymentMode("installment");
                              const plan = installmentPlans.find((p) => p.id === selectedInstallmentPlanId) || installmentPlans[0];
                              if (plan) {
                                setSelectedInstallmentPlanId(plan.id);
                                setInstallmentAmount(parseFloat((feeTotal * (plan.percentage / 100)).toFixed(2)));
                              }
                            }}
                          >
                            Installments
                          </button>
                        </div>
                      )}

                      {/* Fee Components List */}
                      <div className="max-h-[160px] overflow-y-auto pr-1 space-y-2 border-b border-slate-100 pb-3">
                        {feeComponents.map((fc, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs">
                            <span className="font-semibold text-slate-600 capitalize">{fc.name}</span>
                            <span className="font-bold text-slate-800 font-mono">
                              ₦{fc.amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Installment selection buttons */}
                      {paymentMode === "installment" && installmentPlans.length > 0 && (
                        <div className="space-y-2 pt-2 animate-in fade-in duration-200">
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
                                <span className="text-[11px] font-bold truncate">{plan.name} ({plan.percentage}%)</span>
                                <span className="text-xs font-black font-mono mt-1">
                                  ₦{((feeTotal || 0) * (plan.percentage / 100)).toLocaleString("en-NG", {
                                    minimumFractionDigits: 2,
                                  })}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">No details available.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Checkout Summary Card (rendered below) */}
        <div className="max-w-xl mx-auto pt-4">
          <Card className="border-slate-100 shadow-2xl bg-white rounded-[32px] overflow-hidden">
            <div className="h-2 bg-gradient-to-r from-[#6b357d] to-[#6b357d]/80" />
            <CardHeader className="p-8 pb-4">
              <CardTitle className="text-xl font-bold text-slate-800">
                Checkout Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 pt-0 space-y-6">
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-3.5">
                <div className="flex justify-between items-center text-sm font-semibold text-slate-500">
                  <span>Fee Subtotal</span>
                  <span className="font-bold text-slate-800 font-mono">
                    {isFeeLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    ) : isFeeError ? (
                      <span className="text-red-500 font-bold">Failed to load</span>
                    ) : (
                      `₦${feeSubtotal.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs font-semibold text-slate-400">
                  <span className="flex items-center gap-1.5 font-bold">
                    Processing Fee
                  </span>
                  <span>
                    {isFeeLoading ? (
                      "..."
                    ) : isFeeError ? (
                      "—"
                    ) : (
                      `₦${processingFee.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
                    )}
                  </span>
                </div>
                <div className="h-px bg-slate-200/60 my-2"></div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-800 font-extrabold uppercase text-xs tracking-wider">
                    Total Amount
                  </span>
                  <span className="text-2xl font-black text-[#6b357d] font-mono">
                    {isFeeLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    ) : isFeeError ? (
                      <span className="text-red-500 font-black">Failed to load</span>
                    ) : (
                      `₦${(feeSubtotal + processingFee).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
                    )}
                  </span>
                </div>
              </div>

              {/* Display errors */}
              {breakdownError && (
                <div className="p-4 rounded-2xl bg-rose-50 text-rose-800 text-xs flex gap-3 border border-rose-100 animate-in fade-in slide-in-from-top-2">
                  <AlertCircle className="h-5 w-5 shrink-0 text-rose-500 mt-0.5" />
                  <span className="leading-relaxed font-semibold">
                    {breakdownError}
                  </span>
                </div>
              )}
              {error && (
                <div className="p-4 rounded-2xl bg-rose-50 text-rose-800 text-xs flex gap-3 border border-rose-100 animate-in fade-in slide-in-from-top-2">
                  <AlertCircle className="h-5 w-5 shrink-0 text-rose-500 mt-0.5" />
                  <span className="leading-relaxed font-semibold">
                    {error}
                  </span>
                </div>
              )}

              <Button
                className="w-full h-14 bg-[#6b357d] hover:bg-[#5a2d69] text-white font-bold text-base uppercase tracking-wider rounded-2xl shadow-lg shadow-purple-500/10 hover:shadow-purple-500/20 transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
                disabled={isFeeLoading || isFeeError || processing}
                onClick={handlePayment}
              >
                {processing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Opening Checkout...
                  </>
                ) : (
                  <>PAY NOW</>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading payment portal...</p>
          </div>
        </div>
      }
    >
      <PaymentContent />
    </Suspense>
  );
}
