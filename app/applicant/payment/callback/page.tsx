"use client";

/**
 * /applicant/payment/callback
 *
 * Fallback page for mobile browsers where Interswitch may redirect instead of
 * calling onComplete in the inline modal. Reads the txnref from the URL,
 * verifies server-side, then shows the result.
 *
 * In the normal inline checkout flow this page is NOT visited — result is
 * handled entirely in-page via onComplete on payment/page.tsx.
 */

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient } from "@/lib/api";
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardFooter,
  CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";

type VerifyState = "verifying" | "success" | "failed" | "error";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshStatus } = useAuth();

  const txnref =
    searchParams.get("txnref") || searchParams.get("txnRef") || "";

  const [state, setState] = useState<VerifyState>("verifying");
  const [result, setResult] = useState<{
    receipt_no?: string;
    amount?: number;
    payment_type?: string;
    response_desc?: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!txnref) {
      setState("error");
      setErrorMsg("No transaction reference found in the URL.");
      return;
    }

    let cancelled = false;

    const verify = async () => {
      try {
        const res = await ApiClient.verifyPayment(txnref);

        if (cancelled) return;

        if (res.is_successful) {
          setState("success");
          setResult({
            receipt_no:   res.receipt_no,
            amount:       res.amount,
            payment_type: res.payment_type,
          });
          ApiClient.clearCache();
          try { await refreshStatus?.(); } catch (_) {}
        } else {
          setState("failed");
          setResult({ response_desc: res.response_desc });
        }
      } catch (err: any) {
        if (cancelled) return;
        setState("error");
        setErrorMsg(err.message || "Verification failed. Please contact support.");
      }
    };

    const timer = setTimeout(verify, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txnref]);

  const paymentLabel =
    result?.payment_type === "acceptance_fee" ? "Acceptance Fee" :
    result?.payment_type === "tuition"        ? "Tuition Fee"    :
    "Payment";

  const accentBar =
    state === "success"               ? "bg-gradient-to-r from-green-400 to-emerald-500" :
    state === "failed" || state === "error" ? "bg-gradient-to-r from-red-400 to-rose-500" :
    "bg-gradient-to-r from-[#433878] to-[#6b357d]";

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-0 shadow-2xl rounded-[40px] overflow-hidden">
        <div className={`h-2 ${accentBar}`} />

        <CardHeader className="text-center pt-10 pb-2">
          <div className="flex justify-center mb-4">
            {state === "verifying" && (
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 rounded-full border-8 border-slate-100" />
                <div className="absolute inset-0 rounded-full border-8 border-t-[#433878] animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <ShieldCheck className="h-8 w-8 text-[#433878]" />
                </div>
              </div>
            )}
            {state === "success" && (
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 bg-green-100 rounded-full animate-ping opacity-25" />
                <div className="relative w-full h-full bg-green-500 rounded-full flex items-center justify-center shadow-xl shadow-green-500/30">
                  <CheckCircle2 className="h-10 w-10 text-white" />
                </div>
              </div>
            )}
            {(state === "failed" || state === "error") && (
              <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center shadow-xl shadow-red-500/30">
                <XCircle className="h-10 w-10 text-white" />
              </div>
            )}
          </div>

          <CardTitle className="text-2xl font-black tracking-tight">
            {state === "verifying" && "Verifying Payment…"}
            {state === "success"   && "Payment Confirmed!"}
            {state === "failed"    && "Payment Not Successful"}
            {state === "error"     && "Verification Error"}
          </CardTitle>
          <CardDescription className="font-medium mt-1">
            {state === "verifying" && "Please wait while we confirm your transaction."}
            {state === "success"   && `Your ${paymentLabel} has been confirmed and recorded.`}
            {state === "failed"    && (result?.response_desc || "The payment was not completed.")}
            {state === "error"     && errorMsg}
          </CardDescription>
        </CardHeader>

        <CardContent className="px-8 pb-2">
          {state === "success" && result && (
            <div className="bg-slate-50 rounded-2xl p-5 space-y-3 text-sm">
              {result.receipt_no && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Receipt No.</span>
                  <span className="font-mono font-bold text-slate-800">{result.receipt_no}</span>
                </div>
              )}
              {result.amount !== undefined && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Amount Paid</span>
                  <span className="font-bold text-slate-800">
                    ₦{Number(result.amount).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
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
          )}
          {state === "failed" && (
            <div className="bg-red-50 rounded-2xl p-5 text-sm text-red-700 font-medium border border-red-100">
              Your transaction reference:{" "}
              <span className="font-mono font-bold break-all">{txnref}</span>
              <span className="text-xs mt-2 block text-red-500">
                If you believe this is an error, contact support with the above reference.
              </span>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex-col gap-3 px-8 pb-10 pt-4">
          {state === "verifying" && (
            <Button disabled className="w-full h-12 font-bold opacity-60">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Confirming…
            </Button>
          )}
          {state === "success" && (
            <>
              {result?.receipt_no && (
                <Button
                  variant="outline"
                  className="w-full h-12 font-bold"
                  onClick={async () => {
                    try {
                      const blob = await ApiClient.downloadPaymentReceipt(result.receipt_no!);
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `receipt_${result.receipt_no}.pdf`;
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
                onClick={() => router.push("/applicant/dashboard")}
              >
                Go to Dashboard
              </Button>
            </>
          )}
          {(state === "failed" || state === "error") && (
            <>
              <Button
                className="w-full h-12 font-bold"
                onClick={() => router.push("/applicant/payment")}
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
            </>
          )}
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-300 text-center mt-2">
            Powered by <span className="text-slate-400 italic">Interswitch</span>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
          <div className="text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-[#433878] mx-auto" />
            <p className="text-slate-500 font-medium">Loading payment status…</p>
          </div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
