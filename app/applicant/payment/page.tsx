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

// ── Interswitch inline checkout types ────────────────────────────────────────
interface InterswitchPayConfig {
  merchant_code: string;
  pay_item_id: string;
  txn_ref: string;
  amount: number; // in kobo
  currency: string; // "566" = NGN
  site_redirect_url: string;
  mode: "TEST" | "LIVE";
  onComplete: (response: InterswitchPayResponse) => void;
}

interface InterswitchPayResponse {
  resp: string; // "00" = customer completed the flow
  [key: string]: any;
}

declare global {
  interface Window {
    // Interswitch inline checkout v2 SDK
    webpayCheckout: (config: InterswitchPayConfig) => void;
  }
}

// Interswitch inline checkout — use LIVE script URL with mode:"TEST" for sandbox
const ISW_SCRIPT_URL = "https://newwebpay.interswitchng.com/inline-checkout.js";

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
  const [scriptReady, setScriptReady] = useState(false);

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

  // Timeout guard — fires if ThreatMetrix (h.online-metrix.net) is blocked by an
  // ad blocker and the Interswitch modal never fires onComplete.
  const modalTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const onCompleteCalledRef = React.useRef(false);

  // ── Load Interswitch inline checkout script once ──────────────────────────
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
      setError("Failed to load payment gateway. Please refresh the page.");
    document.head.appendChild(script);
  }, []);

  // ── Load applicant status ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/auth/login");
      return;
    }
    const load = async () => {
      try {
        const res = await ApiClient.getApplicantStatus();
        setStatus(res.applicant);
        if (!selectedType) {
          if (!res.applicant.has_paid_acceptance_fee)
            setSelectedType("acceptance_fee");
          else if (!res.applicant.has_paid_tuition) setSelectedType("tuition");
        }
        try {
          const feeData = await ApiClient.getAcceptanceFee();
          if (feeData && feeData.acceptance_fee) {
            setAcceptanceFeeAmount(feeData.acceptance_fee);
          }
          if (feeData && typeof feeData.processing_fee === "number") {
            setProcessingFee(feeData.processing_fee);
          }
        } catch (e) {
          console.error("Could not load acceptance fee amount", e);
        }
      } catch {
        setError("Failed to load application status.");
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, router]);

  // ── Trigger inline checkout ───────────────────────────────────────────────
  const handlePayment = async () => {
    if (!selectedType || !status || !scriptReady) return;

    setProcessing(true);
    setError(null);
    onCompleteCalledRef.current = false;

    // Clear any previous timeout
    if (modalTimeoutRef.current) clearTimeout(modalTimeoutRef.current);

    try {
      const init = await ApiClient.initiatePayment(selectedType);

      const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/e-portal/applicant/payment/callback`;

      if (typeof window.webpayCheckout !== "function") {
        throw new Error("Please refresh the page.");
      }

      modalTimeoutRef.current = setTimeout(() => {
        if (!onCompleteCalledRef.current) {
          setProcessing(false);
          setError("Payment request timed out. Please try again.");
        }
      }, 90_000);

      window.webpayCheckout({
        merchant_code: init.merchant_code,
        pay_item_id: init.pay_item_id,
        txn_ref: init.reference_no,
        amount: init.amount_kobo,
        currency: 566,
        site_redirect_url: callbackUrl,
        mode: (process.env.NEXT_PUBLIC_ISW_MODE as "TEST" | "LIVE") ?? "LIVE",
        onComplete: async (response: InterswitchPayResponse) => {
          onCompleteCalledRef.current = true;
          if (modalTimeoutRef.current) clearTimeout(modalTimeoutRef.current);

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
            setPayState("idle");
            setError(
              "Payment was cancelled. Redirecting to dashboard",
            );
            setProcessing(false);
            setTimeout(() => {
              router.push("/applicant/dashboard");
            }, 5000);
            return;
          }

          // Always verify server-side — never trust client resp alone
          try {
            const verification = await ApiClient.verifyPayment(
              init.reference_no,
            );
            if (verification.is_successful) {
              setReceiptNo(verification.receipt_no);
              setPaidAmount(verification.amount);
              setPaidType(verification.payment_type);
              ApiClient.clearCache();
              setPayState("success");
            } else if (verification.tran_status === "pending") {
              // Gateway returned Z0/T0 — still processing, do not mark failed
              setPayState("pending" as any);
              setError(
                "Your payment is being processed. This can take a few minutes — " +
                  "we will update your status automatically. You can safely close this page.",
              );
            } else {
              setPayState("failed");
              setError(
                verification.response_desc || "Payment was not completed.",
              );
            }
          } catch (err: any) {
            setPayState("failed");
            setError(
              err.message ||
                "Verification failed. Contact support if funds were debited.",
            );
          } finally {
            setProcessing(false);
          }
        },
      });
    } catch (err: any) {
      if (modalTimeoutRef.current) clearTimeout(modalTimeoutRef.current);
      setError(err.message || "Failed to start payment. Please try again.");
      setProcessing(false);
    }
  };

  const paymentLabel =
    (paidType ?? selectedType) === "acceptance_fee"
      ? "Acceptance Fee"
      : (paidType ?? selectedType) === "tuition"
        ? "Tuition Fee"
        : "Payment";

  // ── Loading screen ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">
            Initializing secure payment...
          </p>
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

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Details & Payment Methods (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            <Card className="border-slate-100 shadow-xl bg-white rounded-3xl overflow-hidden">
              <CardHeader className="pb-4 border-b border-slate-50">
                <CardTitle className="text-xl font-bold text-slate-800">
                  Review applicant and payment details
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
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
                      {status?.program_name}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Payment Description
                  </span>
                  <div className="p-4 bg-purple-50/50 border border-purple-100/50 rounded-2xl">
                    <p className="text-sm font-bold text-slate-800 capitalize">
                      {selectedType
                        ? selectedType.replace("_", " ")
                        : "No Selection"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      This fee is required to proceed with your enrollment.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Right Column: Checkout Summary (5 cols) */}
            <div className="lg:col-span-5 lg:sticky lg:top-8">
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
                        {selectedType === "acceptance_fee"
                          ? acceptanceFeeAmount
                            ? `₦${acceptanceFeeAmount.toLocaleString()}`
                            : status?.program_id === 4
                              ? "₦30,000"
                              : status?.program_id === 2
                                ? "₦25,000"
                                : "₦20,000"
                          : selectedType === "tuition"
                            ? status?.program_id === 2
                              ? "₦250,000"
                              : "₦177,000"
                            : "₦0.00"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-semibold text-slate-400">
                      <span className="flex items-center gap-1.5">
                        Processing Fee
                      </span>
                      <span>
                        ₦{processingFee.toLocaleString("en-NG", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="h-px bg-slate-200/60 my-2"></div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-800 font-extrabold uppercase text-xs tracking-wider">
                        Total Amount
                      </span>
                      <span className="text-2xl font-black text-[#6b357d] font-mono">
                        {selectedType === "acceptance_fee" &&
                        acceptanceFeeAmount
                          ? `₦${(acceptanceFeeAmount + processingFee).toLocaleString("en-NG")}`
                          : null}
                      </span>
                    </div>
                  </div>

                  {error && (
                    <div className="p-4 rounded-2xl bg-rose-50 text-rose-800 text-xs flex gap-3 border border-rose-100 animate-in fade-in slide-in-from-top-2">
                      <AlertCircle className="h-5 w-5 shrink-0 text-rose-500 mt-0.5" />
                      <span className="leading-relaxed font-semibold">
                        {error}
                      </span>
                    </div>
                  )}

                  <Button
                    className="w-full h-14 bg-[#6b357d] hover:bg-[#5a2d69] text-white font-bold text-base uppercase tracking-wider rounded-2xl shadow-lg shadow-purple-500/10 hover:shadow-purple-500/20 transition-all duration-300 disabled:opacity-70 flex items-center justify-center gap-2"
                    disabled={!selectedType || processing || !scriptReady}
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
