"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient, ApplicantStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription,
  CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard, CheckCircle2, AlertCircle,
  ShieldCheck, Building, DollarSign, Loader2, XCircle, ArrowLeft,
} from "lucide-react";

// ── Interswitch inline checkout types ────────────────────────────────────────
interface InterswitchPayConfig {
  merchant_code: string;
  pay_item_id: string;
  txn_ref: string;
  amount: number;        // in kobo
  currency: string;      // "566" = NGN
  site_redirect_url: string;
  mode: "TEST" | "LIVE";
  onComplete: (response: InterswitchPayResponse) => void;
}

interface InterswitchPayResponse {
  resp: string;   // "00" = customer completed the flow
  [key: string]: any;
}

declare global {
  interface Window {
    // Interswitch inline checkout v2 SDK
    webpayCheckout: (config: InterswitchPayConfig) => void;
  }
}

// Interswitch inline checkout — use LIVE script URL with mode:"TEST" for sandbox
const ISW_SCRIPT_URL =
  "https://newwebpay.interswitchng.com/inline-checkout.js";

// ── Main component ────────────────────────────────────────────────────────────
function PaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type") as "acceptance_fee" | "tuition" | null;
  const { user, isAuthenticated } = useAuth();

  const [status, setStatus] = useState<ApplicantStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  const [selectedType, setSelectedType] = useState<"acceptance_fee" | "tuition" | null>(typeParam);

  // Result state
  const [payState, setPayState] = useState<"idle" | "success" | "failed">("idle");
  const [receiptNo, setReceiptNo] = useState<string | null>(null);
  const [paidAmount, setPaidAmount] = useState<number | null>(null);
  const [paidType, setPaidType] = useState<string | null>(null);
  const [acceptanceFeeAmount, setAcceptanceFeeAmount] = useState<number | null>(null);

  // Timeout guard — fires if ThreatMetrix (h.online-metrix.net) is blocked by an
  // ad blocker and the Interswitch modal never fires onComplete.
  const modalTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
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
          if (!res.applicant.has_paid_acceptance_fee) setSelectedType("acceptance_fee");
          else if (!res.applicant.has_paid_tuition)  setSelectedType("tuition");
        }
        try {
          const feeData = await ApiClient.getAcceptanceFee();
          if (feeData && feeData.acceptance_fee) {
             setAcceptanceFeeAmount(feeData.acceptance_fee);
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

      const callbackUrl =
        `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/e-portal/applicant/payment/callback`;

      if (typeof window.webpayCheckout !== "function") {
        throw new Error("Payment gateway not ready. Please refresh the page.");
      }

      // ── ThreatMetrix / ad-blocker guard ──────────────────────────────────
      // If h.online-metrix.net is blocked (ERR_BLOCKED_BY_CLIENT), the
      // Interswitch modal can get stuck and onComplete never fires.
      // After 90 s we stop spinning and tell the user what happened.
      modalTimeoutRef.current = setTimeout(() => {
        if (!onCompleteCalledRef.current) {
          setProcessing(false);
          setError(
            "The payment window appears to be stuck. This is usually caused by a browser " +
            "ad blocker blocking a fraud-detection script (h.online-metrix.net). " +
            "Please disable your ad blocker for this page and try again, or use a " +
            "browser with no extensions. If you were already debited, your payment " +
            "will be confirmed automatically — check your transaction history."
          );
        }
      }, 90_000);

      window.webpayCheckout({
        merchant_code:     init.merchant_code,
        pay_item_id:       init.pay_item_id,
        txn_ref:           init.reference_no,
        amount:            init.amount_kobo,
        currency:          566,
        site_redirect_url: callbackUrl,
        mode:              (process.env.NEXT_PUBLIC_ISW_MODE as "TEST" | "LIVE") ?? "LIVE",
        onComplete: async (response: InterswitchPayResponse) => {
          onCompleteCalledRef.current = true;
          if (modalTimeoutRef.current) clearTimeout(modalTimeoutRef.current);

          // If the user cancelled or the widget returned a non-success/non-pending code
          if (response && response.resp && response.resp !== "00" && response.resp !== "Z0" && response.resp !== "T0") {
             try {
               await ApiClient.cancelPayment(init.reference_no);
             } catch (e) {}
             setPayState("idle");
             setError("Payment was cancelled by user. Redirecting to dashboard in 5 seconds...");
             setProcessing(false);
             setTimeout(() => {
               router.push("/applicant/dashboard");
             }, 5000);
             return;
          }

          // Always verify server-side — never trust client resp alone
          try {
            const verification = await ApiClient.verifyPayment(init.reference_no);
            if (verification.is_successful) {
              setReceiptNo(verification.receipt_no);
              setPaidAmount(verification.amount);
              setPaidType(verification.payment_type);
              ApiClient.clearCache();
              setPayState("success");
            } else if (verification.tran_status === 'pending') {
              // Gateway returned Z0/T0 — still processing, do not mark failed
              setPayState("pending" as any);
              setError(
                "Your payment is being processed. This can take a few minutes — " +
                "we will update your status automatically. You can safely close this page."
              );
            } else {
              setPayState("failed");
              setError(verification.response_desc || "Payment was not completed.");
            }
          } catch (err: any) {
            setPayState("failed");
            setError(
              err.message ||
              "Verification failed. Contact support if funds were debited."
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
    (paidType ?? selectedType) === "acceptance_fee" ? "Acceptance Fee" :
    (paidType ?? selectedType) === "tuition"        ? "Tuition Fee"    :
    "Payment";

  // ── Loading screen ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Initializing secure payment...</p>
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
            <CardTitle className="text-2xl font-black tracking-tight">Payment Confirmed!</CardTitle>
            <CardDescription className="font-medium mt-1">
              Your {paymentLabel} has been confirmed and recorded.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-2">
            <div className="bg-slate-50 rounded-2xl p-5 space-y-3 text-sm">
              {receiptNo && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Receipt No.</span>
                  <span className="font-mono font-bold text-slate-800">{receiptNo}</span>
                </div>
              )}
              {paidAmount !== null && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Amount Paid</span>
                  <span className="font-bold text-slate-800">
                    ₦{Number(paidAmount).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
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
                You will be redirected to your profile where you can view your admission status.
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
                    const blob = await ApiClient.downloadPaymentReceipt(receiptNo!);
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
              {paidType === "acceptance_fee" ? "View My Profile" : "Go to Dashboard"}
            </Button>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-300 text-center mt-2">
              Powered by <span className="text-slate-400 italic">Interswitch</span>
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
            <CardTitle className="text-2xl font-black tracking-tight">Payment Processing</CardTitle>
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
              Your transaction status updates automatically. Check your transaction history.
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
            <CardTitle className="text-2xl font-black tracking-tight">Payment Not Successful</CardTitle>
            <CardDescription className="font-medium mt-1">
              {error || "The payment was not completed. No funds were debited."}
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex-col gap-3 px-8 pb-10 pt-4">
            <Button
              className="w-full h-12 font-bold"
              onClick={() => { setPayState("idle"); setError(null); }}
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
              Powered by <span className="text-slate-400 italic">Interswitch</span>
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // ── Main checkout UI ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md mb-4 flex">
        <Button 
          variant="ghost" 
          className="text-muted-foreground hover:text-foreground gap-2 px-0" 
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>
      <Card className="max-w-md w-full shadow-2xl border-primary/10 overflow-hidden bg-card">
        <div className="h-2 bg-gradient-to-r from-primary to-primary/40" />
        <CardHeader className="bg-muted/30">
          <CardTitle className="text-xl">Checkout Summary</CardTitle>
          <CardDescription>Verify your details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">Applicant</p>
              <p className="text-sm font-bold truncate">{user?.name}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">Program</p>
              <p className="text-sm font-bold truncate">{status?.program_name}</p>
            </div>
          </div>

          <div className="pt-6 border-t border-border space-y-4">
            <div className="flex justify-between items-center bg-muted/20 p-3 rounded-lg border border-border/50">
              <span className="text-sm font-medium">
                {selectedType ? selectedType.replace("_", " ").toUpperCase() : "NO SELECTION"}
              </span>
              <span className="font-black text-lg">
                {selectedType === "acceptance_fee"
                  ? (acceptanceFeeAmount ? `₦${acceptanceFeeAmount.toLocaleString()}` : (status?.program_id === 4 ? "₦30,000" : status?.program_id === 2 ? "₦25,000" : "₦20,000"))
                  : selectedType === "tuition"
                    ? status?.program_id === 2 ? "₦250,000" : "₦177,000"
                    : "₦0.00"}
              </span>
            </div>
            <div className="flex justify-between text-xs px-1">
              <div className="flex items-center gap-1 text-muted-foreground">
                <span>Processing Fee</span>
                <div className="bg-green-100 text-green-700 text-[8px] font-bold px-1 rounded">FREE</div>
              </div>
              <span className="font-bold">₦0.00</span>
            </div>
            <div className="flex justify-between items-center text-2xl font-black pt-4 border-t-2 border-dashed border-border px-1">
              <span>Total</span>
              <span className="text-primary">
                {selectedType === "acceptance_fee"
                  ? (acceptanceFeeAmount ? `₦${acceptanceFeeAmount.toLocaleString()}` : (status?.program_id === 4 ? "₦30,000" : status?.program_id === 2 ? "₦25,000" : "₦20,000"))
                  : selectedType === "tuition"
                    ? status?.program_id === 2 ? "₦250,000" : "₦177,000"
                    : "₦0.00"}
              </span>
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-50 text-red-800 text-xs flex gap-3 border border-red-100 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
              <span className="leading-relaxed font-semibold">{error}</span>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex-col gap-4 pb-8">
          <Button
            className="w-full h-14 text-lg font-black gap-3 shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100"
            disabled={!selectedType || processing || !scriptReady}
            onClick={handlePayment}
          >
            {processing ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                PROCESSING...
              </>
            ) : (
              "PAY NOW"
            )}
          </Button>
        </CardFooter>
      </Card>
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
