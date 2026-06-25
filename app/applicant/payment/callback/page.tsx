"use client";


import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient } from "@/lib/api";
import { Loader2 } from "lucide-react";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshStatus } = useAuth();

  const txnrefRef = React.useRef(
    searchParams.get("txnref") || searchParams.get("txnRef") || ""
  );
  const txnref = txnrefRef.current;

  const [pollCount, setPollCount] = useState(0);
  const MAX_POLLS = 45;        // 45 × 4s = 3 minutes max
  const POLL_INTERVAL_MS = 4000;


  useEffect(() => {
    router.replace("/applicant/payment/callback", { scroll: false });

  }, []);

  useEffect(() => {
    if (!txnref) {
      router.replace("/applicant/dashboard");
      return;
    }

    let cancelled = false;
    let attempt = 0;

    const verify = async () => {
      try {
        const res = await ApiClient.verifyPayment(txnref);
        if (cancelled) return;

        if (res.is_successful) {
          ApiClient.clearCache();
          try { await refreshStatus?.(); } catch (_) { }
          router.replace("/applicant/dashboard");
          return; // done
        }
        if (res.tran_status === "cancelled") {
          router.replace("/applicant/payment");
          return;
        }

        if (res.tran_status === "failed") {
          router.replace("/applicant/dashboard");
          return;
        }

        attempt += 1;
        setPollCount(attempt);
        if (attempt < MAX_POLLS && !cancelled) {
          setTimeout(verify, POLL_INTERVAL_MS);
        } else if (!cancelled) {

          router.replace("/applicant/dashboard");
        }
      } catch (err: any) {
        if (cancelled) return;
        attempt += 1;

        if (attempt < 5 && !cancelled) {
          setTimeout(verify, POLL_INTERVAL_MS);
        } else {
          router.replace("/applicant/dashboard");
        }
      }
    };

    const timer = setTimeout(verify, 1500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [txnref]);

  return <DashboardSkeleton />;
}

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-[#f8fafc] w-full">
      {/* Header skeleton */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-200 animate-pulse" />
          <div className="h-6 w-32 bg-slate-200 rounded-md animate-pulse" />
        </div>
        <div className="flex items-center gap-4">
          <div className="h-8 w-24 bg-slate-200 rounded-md animate-pulse" />
          <div className="h-8 w-8 rounded-full bg-slate-200 animate-pulse" />
        </div>
      </header>

      {/* Content skeleton matching the image layout */}
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Large Top Card (Banner) */}
        <div className="w-full h-48 bg-white rounded-3xl border border-slate-100 p-6 shadow-sm flex flex-col justify-between animate-pulse">
          <div className="space-y-3">
            <div className="h-8 w-1/3 bg-slate-200 rounded-lg" />
            <div className="h-4 w-1/2 bg-slate-200 rounded-lg" />
          </div>
          <div className="h-10 w-28 bg-slate-200 rounded-lg" />
        </div>

        {/* Mid section: Row blocks */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-4 bg-[#6b357d]/20 rounded-full" />
            <div className="h-6 w-48 bg-slate-200 rounded-md animate-pulse" />
          </div>

          {/* List of 4 table/row elements as seen in the user's uploaded image */}
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-full h-16 bg-white rounded-2xl border border-slate-100 px-6 flex items-center justify-between animate-pulse"
              >
                <div className="flex items-center gap-4 w-2/3">
                  <div className="w-8 h-8 rounded-full bg-slate-200" />
                  <div className="h-4 w-1/4 bg-slate-200 rounded-md" />
                  <div className="h-4 w-1/3 bg-slate-200 rounded-md" />
                </div>
                <div className="h-8 w-24 bg-slate-200 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </main>
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
