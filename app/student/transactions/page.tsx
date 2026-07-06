"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient, PaymentTransaction } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CreditCard,
  History,
  Search,
  Download,
  CheckCircle2,
  X,
  AlertCircle,
  Loader2,
  Clock,
  Receipt,
  BadgeCheck,
  ArrowLeft,
} from "lucide-react";
import { format } from "date-fns";

// ─── Types ───────────────────────────────────────────────────────────────────
const formatFeeComponentName = (name: string) =>
  name.toLowerCase().includes("tuition") ? "Tuition" : name;

type FeeComponent = { name: string; amount: number };
type SessionPayment = {
  total_expected?: number;
  total_paid?: number;
  recurring_expected?: number;
  recurring_paid?: number;
  development_fee_due?: number;
  is_fully_paid?: boolean;
  remaining?: number;
  payment_percentage?: number;
};
type Tab = "pay" | "history";

function StudentTransactionsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isPgPortal = pathname.startsWith("/pgstudents");
  const dashboardPath = isPgPortal ? "/pgstudents/dashboard" : "/student/dashboard";
  const { user, student, isAuthenticated, isLoading } = useAuth();

  // Active tab (URL-driven: ?tab=history or ?tab=pay)
  const [activeTab, setActiveTab] = useState<Tab>(
    (searchParams.get("tab") as Tab) || "pay",
  );

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    router.replace(`${pathname}?tab=${tab}`, { scroll: false });
  };

  // ── Pay Fees state ────────────────────────────────────────────────────────
  const isAdmitted = user?.role === "admitted";
  const [paymentHistory, setPaymentHistory] = useState<PaymentTransaction[]>([]);
  const [installmentPlans, setInstallmentPlans] = useState<any[]>([]);
  const [isPayingTuition, setIsPayingTuition] = useState(false);
  const [tuitionPayError, setTuitionPayError] = useState<string | null>(null);
  const [tuitionPaySuccess, setTuitionPaySuccess] = useState(false);
  const [feeComponents, setFeeComponents] = useState<FeeComponent[]>([]);
  const [feeTotal, setFeeTotal] = useState(0);
  const [recurringFeeTotal, setRecurringFeeTotal] = useState(0);
  const [developmentFeeDue, setDevelopmentFeeDue] = useState(0);
  const [sessionPayment, setSessionPayment] = useState<SessionPayment | null>(null);
  const [processingFee, setProcessingFee] = useState(300);
  const [paymentMode, setPaymentMode] = useState<"full" | "installment">("full");
  const [selectedInstallmentPlanId, setSelectedInstallmentPlanId] = useState<number | null>(null);
  const [installmentAmount, setInstallmentAmount] = useState<number | null>(null);
  const [remainingPercentage, setRemainingPercentage] = useState<number>(100);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);
  const [breakdownLoaded, setBreakdownLoaded] = useState(false);

  // ── Transaction History state ─────────────────────────────────────────────
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // ── isFullyPaid ───────────────────────────────────────────────────────────
  const totalPaid = Number(sessionPayment?.total_paid || 0);
  const totalExpected = Number(sessionPayment?.total_expected || feeTotal || 0);
  const recurringPaid = Number(sessionPayment?.recurring_paid ?? totalPaid);
  const remainingBalance = Math.max(
    0,
    Number(sessionPayment?.remaining ?? Math.max(0, totalExpected - totalPaid)),
  );
  const isFullyPaid =
    Boolean(sessionPayment?.is_fully_paid) ||
    (totalExpected > 0 && totalPaid >= totalExpected);
  const getInstallmentDue = (
    plans: any[],
    planIndex: number,
    total: number = recurringFeeTotal || feeTotal,
    paid: number = recurringPaid,
    oneTimeFee: number = developmentFeeDue,
  ) => {
    const cumulativePercentage = plans
      .slice(0, planIndex + 1)
      .reduce((sum: number, plan: any) => sum + Number(plan.percentage || 0), 0);
    const milestoneAmount = total * (cumulativePercentage / 100);
    const due = Math.max(0, milestoneAmount - paid);
    return parseFloat((due + (planIndex === 0 && paid <= 0 ? oneTimeFee : 0)).toFixed(2));
  };
  const getNextDueInstallmentIndex = (plans: any[]) =>
    plans.findIndex((plan: any, index: number) => getInstallmentDue(plans, index) > 0);

  // ── Fetch payment history & installment plans ─────────────────────────────
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const [histRes, plansRes] = await Promise.all([
        ApiClient.getPaymentHistory(),
        ApiClient.getInstallmentPlans(),
      ]);
      const all: PaymentTransaction[] = histRes.payment_history || [];
      setPaymentHistory(all);
      setTransactions(all.filter((tx) => tx.payment_type === "tuition"));
      setInstallmentPlans(plansRes.installment_plans || []);
    } catch (err: any) {
      setHistoryError(err.message || "Unable to load transactions");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && !isLoading) fetchHistory();
  }, [isAuthenticated, isLoading, fetchHistory]);

  // ── Load fee breakdown (lazy, triggered on first visit to Pay tab) ─────────
  const loadBreakdown = useCallback(async () => {
    if (breakdownLoaded) return;
    setLoadingBreakdown(true);
    setBreakdownError(null);
    try {
      const [breakdown, plansRes] = await Promise.all([
        ApiClient.getTuitionBreakdown(),
        ApiClient.getInstallmentPlans(),
      ]);
      setFeeComponents(breakdown.components);
      setFeeTotal(breakdown.total);
      setRecurringFeeTotal(
        typeof breakdown.recurring_total === "number" ? breakdown.recurring_total : breakdown.total,
      );
      setDevelopmentFeeDue(
        typeof breakdown.development_fee_due === "number" ? breakdown.development_fee_due : 0,
      );
      setSessionPayment(breakdown.session_payment || null);
      setProcessingFee(
        typeof breakdown.processing_fee === "number" ? breakdown.processing_fee : 300,
      );
      const plans = plansRes.installment_plans || [];
      setInstallmentPlans(plans);
      const paidSoFar = Number(
        breakdown.session_payment?.recurring_paid ?? breakdown.session_payment?.total_paid ?? 0,
      );
      const baseTotal =
        typeof breakdown.recurring_total === "number" ? breakdown.recurring_total : breakdown.total;
      const oneTimeFee =
        typeof breakdown.development_fee_due === "number" ? breakdown.development_fee_due : 0;

      const unpaidPlans = plans.filter(
        (_plan: any, index: number) =>
          getInstallmentDue(plans, index, baseTotal, paidSoFar, oneTimeFee) > 0,
      );
      setRemainingPercentage(
        unpaidPlans.length > 0
          ? unpaidPlans.reduce((s: number, pl: any) => s + parseFloat(pl.percentage || 0), 0)
          : 100,
      );
      if (plans.length > 0) {
        const nextIndex = plans.findIndex((plan: any) => unpaidPlans.some((due: any) => due.id === plan.id));
        if (nextIndex >= 0) {
          setSelectedInstallmentPlanId(plans[nextIndex].id);
          setInstallmentAmount(getInstallmentDue(plans, nextIndex, baseTotal, paidSoFar, oneTimeFee));
        } else {
          setSelectedInstallmentPlanId(null);
          setInstallmentAmount(null);
        }
      }
      setBreakdownLoaded(true);
    } catch (err: any) {
      setBreakdownError(err.message || "Failed to load fee breakdown.");
    } finally {
      setLoadingBreakdown(false);
    }
  }, [breakdownLoaded, paymentHistory]);

  useEffect(() => {
    if (activeTab === "pay" && isAuthenticated && !isLoading) loadBreakdown();
  }, [activeTab, isAuthenticated, isLoading]);

  // ── Confirm & Pay ─────────────────────────────────────────────────────────
  const confirmAndPay = async () => {
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
        const inp = document.createElement("input");
        inp.type = "hidden";
        inp.name = "pay_item_name";
        inp.value = "School Fees";
        form.appendChild(inp);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (err: any) {
      setTuitionPayError(err.message || "Failed to start payment. Please try again.");
      setIsPayingTuition(false);
    }
  };

  // ── Transaction History helpers ───────────────────────────────────────────
  const handleDownload = async (receipt_no: string) => {
    setDownloading(receipt_no);
    try {
      const blob = await ApiClient.downloadPaymentReceipt(receipt_no);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${receipt_no}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download receipt");
    } finally {
      setDownloading(null);
    }
  };

  const filteredTransactions = transactions.filter(
    (tx) =>
      (tx.payment_type?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (tx.reference_no?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (tx.receipt_no?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (tx.client_name?.toLowerCase() || "").includes(search.toLowerCase()),
  );
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const currentItems = filteredTransactions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  // ── Render ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f3eee6] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#c99b45]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3eee6]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Transactions</h1>
            <p className="text-slate-500 text-sm mt-1">Manage your fees and view payment history</p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(dashboardPath)}
            className="h-10 w-fit gap-2 rounded-xl border-[#e8dfd2] bg-white px-4 text-sm font-bold text-slate-700 hover:bg-[#f8f5f0]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-white border border-[#e8dfd2] rounded-2xl p-1.5 w-fit shadow-sm">
          {(
            [
              { key: "pay", label: "Pay Fees", icon: CreditCard },
              { key: "history", label: "Transaction History", icon: History },
            ] as { key: Tab; label: string; icon: React.ElementType }[]
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => switchTab(key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
                activeTab === key
                  ? "bg-[#151515] text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800 hover:bg-[#f3eee6]"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ── TAB: PAY FEES ────────────────────────────────────────────────── */}
        {activeTab === "pay" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Left: Status card */}
            <div className="bg-white rounded-2xl border border-[#e8dfd2] shadow-sm overflow-hidden">
              <div className="h-1.5 bg-[#e39519] w-full" />
              <div className="p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="bg-[#fff7e8] text-[#9a6614] border border-[#efd9a8] p-2.5 rounded-xl">
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">School Fees Payment</h2>
                    <p className="text-slate-500 text-sm">
                      {isAdmitted
                        ? "Complete payment to unlock full student portal access."
                        : "Pay your school fees for the current session."}
                    </p>
                  </div>
                </div>

                {/* Status banner */}
                {isFullyPaid ? (
                  <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                    <BadgeCheck className="w-6 h-6 text-emerald-600 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-emerald-800">Fees Fully Paid</p>
                      <p className="text-xs text-emerald-600 mt-0.5">
                        Your school fees for this session are complete.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
                    <Clock className="w-5 h-5 text-amber-600 shrink-0" />
                    <p className="text-sm text-amber-700 font-medium">
                      {isAdmitted
                        ? "Your admission is confirmed. Pay school fees to complete enrolment."
                        : "Ensure your school fees are up to date for this session."}
                    </p>
                  </div>
                )}

                {!loadingBreakdown && totalExpected > 0 && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Expected
                      </p>
                      <p className="mt-1 text-sm font-black text-slate-800">
                        ₦ {totalExpected.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">
                        Paid
                      </p>
                      <p className="mt-1 text-sm font-black text-emerald-800">
                        ₦ {totalPaid.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
                        Balance
                      </p>
                      <p className="mt-1 text-sm font-black text-amber-800">
                        ₦ {remainingBalance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                )}

                {/* Error from payment attempt */}
                {tuitionPayError && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl border border-red-200">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{tuitionPayError}</p>
                  </div>
                )}

                {/* Success */}
                {tuitionPaySuccess && (
                  <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-200">
                    <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                    <p className="text-sm text-green-700 font-bold">
                      Payment confirmed! {isAdmitted ? "Upgrading your account..." : ""}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Fee Breakdown */}
            <div className="bg-white rounded-2xl border border-[#e8dfd2] shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-5 text-white">
                <h3 className="text-base font-black tracking-tight">Fee Breakdown</h3>
                <p className="text-amber-100 text-xs mt-0.5">
                  Review your fee components before proceeding.
                </p>
              </div>

              <div className="p-6 space-y-4">
                {/* Loading skeleton */}
                {loadingBreakdown && (
                  <div className="space-y-3 animate-pulse">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex justify-between items-center py-3 border-b border-slate-100">
                        <div className="h-4 bg-slate-200 rounded w-2/3" />
                        <div className="h-4 bg-slate-200 rounded w-1/4" />
                      </div>
                    ))}
                    <div className="flex justify-between pt-2">
                      <div className="h-5 bg-slate-200 rounded w-1/3" />
                      <div className="h-5 bg-amber-200 rounded w-1/4" />
                    </div>
                  </div>
                )}

                {/* Error */}
                {breakdownError && !loadingBreakdown && (
                  <div className="flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-200">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-red-800">Could not load fee breakdown</p>
                      <p className="text-sm text-red-600 mt-0.5">{breakdownError}</p>
                    </div>
                  </div>
                )}

                {/* Fee rows */}
                {!loadingBreakdown && !breakdownError && feeComponents.length > 0 && (
                  <div className="space-y-1">
                    {/* Payment mode toggle */}
                    <div className="flex items-center gap-2 mb-4">
                      <button
                        className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                          paymentMode === "full"
                            ? "bg-amber-500 text-white"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                        onClick={() => { setPaymentMode("full"); setInstallmentAmount(null); }}
                      >
                        Full Payment
                      </button>
                      {installmentPlans.length > 0 && (
                        <button
                          className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            paymentMode === "installment"
                              ? "bg-amber-500 text-white"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                          onClick={() => {
                            setPaymentMode("installment");
                            const nextIndex = getNextDueInstallmentIndex(installmentPlans);
                            if (nextIndex >= 0) {
                              setSelectedInstallmentPlanId(installmentPlans[nextIndex].id);
                              setInstallmentAmount(getInstallmentDue(installmentPlans, nextIndex));
                            }
                          }}
                        >
                          Installments
                        </button>
                      )}
                    </div>

                    {/* Installment plan cards */}
                    {paymentMode === "installment" && installmentPlans.length > 0 && (
                      <div className="space-y-2 pb-4 animate-in fade-in duration-200">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                          Installment Plans
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          {installmentPlans.map((plan, index) => {
                            const dueAmount = getInstallmentDue(installmentPlans, index);
                            const nextDueIndex = getNextDueInstallmentIndex(installmentPlans);
                            const isNextDue = index === nextDueIndex;
                            const isCovered = dueAmount <= 0;
                            const scheduledAmount =
                              (recurringFeeTotal || feeTotal) * (Number(plan.percentage || 0) / 100);
                            const displayAmount = isNextDue ? dueAmount : scheduledAmount;

                            return (
                            <div
                              key={plan.id}
                              className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                                isNextDue
                                  ? "border-[#c99b45] bg-[#c99b45]/5 text-[#7a5a1a] font-bold shadow-sm"
                                  : "border-slate-200 text-slate-500 bg-slate-50/50"
                              } ${isCovered ? "opacity-45" : ""}`}
                            >
                              <span className="text-xs font-bold truncate">
                                {plan.name} ({plan.percentage}%)
                              </span>
                              <span className="text-xs font-black font-mono mt-1">
                                ₦ {displayAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                              </span>
                              <span className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                {isCovered ? "Covered" : isNextDue ? "Due now" : "Pending"}
                              </span>
                            </div>
                          )})}
                        </div>
                      </div>
                    )}

                    {/* Fee component rows */}
                    {feeComponents.map((fc, idx) => (
                      <div key={idx} className="flex justify-between items-center py-3 border-b border-slate-100 last:border-0">
                        <span className="text-sm font-semibold text-slate-700">
                          {formatFeeComponentName(fc.name)}
                        </span>
                        <span className="text-sm font-bold text-slate-900 tabular-nums">
                          ₦ {fc.amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}

                    {/* Processing fee */}
                    <div className="flex justify-between items-center py-3 border-b border-slate-100">
                      <span className="text-sm font-semibold text-slate-500">Processing Fee</span>
                      <span className="text-sm font-bold text-slate-700 tabular-nums">
                        ₦ {processingFee.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {/* Total */}
                    <div className="flex justify-between items-center pt-4 mt-2 border-t-2 border-amber-300">
                      <span className="text-base font-black text-slate-800 uppercase tracking-tight">
                        Total Payable
                      </span>
                      <span className="text-xl font-black text-amber-600 tabular-nums">
                        ₦{" "}
                        {(
                          (paymentMode === "installment"
                            ? installmentAmount || 0
                            : remainingBalance || feeTotal * (remainingPercentage / 100)) + processingFee
                        ).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {!loadingBreakdown && !breakdownError && feeComponents.length === 0 && (
                  <p className="text-center text-sm text-slate-500 py-6 italic">
                    No fee components found. Please contact the accounts office.
                  </p>
                )}

                {/* Pay button */}
                {!tuitionPaySuccess && (
                  <Button
                    className="w-full h-14 font-black text-base bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-lg shadow-amber-500/25 disabled:opacity-60 mt-4"
                    onClick={confirmAndPay}
                    disabled={
                      isFullyPaid ||
                      isPayingTuition ||
                      loadingBreakdown ||
                      !!breakdownError ||
                      feeComponents.length === 0 ||
                      (paymentMode === "installment" && !selectedInstallmentPlanId)
                    }
                  >
                    {isPayingTuition ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        Opening Payment...
                      </>
                    ) : isFullyPaid ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 mr-2 text-emerald-300" />
                        Fees Fully Paid
                      </>
                    ) : (
                      "Confirm & Pay"
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: TRANSACTION HISTORY ──────────────────────────────────────── */}
        {activeTab === "history" && (
          <div className="bg-white rounded-2xl border border-[#e8dfd2] shadow-sm overflow-hidden">
            <div className="h-1.5 bg-[#151515] w-full" />
            <div className="p-6 space-y-4">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Tuition Payments</h2>
                  <p className="text-slate-500 text-sm">All tuition fee transactions on this portal</p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <Input
                    placeholder="Search by reference, receipt..."
                    className="pl-9 h-10 bg-[#f8f5f0] border-[#e8dfd2] rounded-xl text-sm focus:ring-0 focus:border-[#c99b45]"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                  />
                </div>
              </div>

              {/* Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-10 text-center">#</th>
                        <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Receipt No</th>
                        <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Reference No</th>
                        <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-center">Amount (₦)</th>
                        <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {historyLoading ? (
                        <tr>
                          <td colSpan={7} className="text-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" />
                          </td>
                        </tr>
                      ) : historyError ? (
                        <tr>
                          <td colSpan={7} className="text-center py-12">
                            <div className="space-y-3">
                              <p className="text-red-500 text-sm">{historyError}</p>
                              <Button variant="outline" size="sm" onClick={fetchHistory} className="text-xs h-8">
                                Retry
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ) : currentItems.length > 0 ? (
                        currentItems.map((tx, index) => (
                          <tr key={tx.transaction_id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-4 text-sm text-slate-400 text-center">
                              {(currentPage - 1) * itemsPerPage + index + 1}
                            </td>
                            <td className="px-4 py-4">
                              <span className="text-sm font-mono text-slate-700">{tx.receipt_no || "—"}</span>
                            </td>
                            <td className="px-4 py-4">
                              <span className="text-xs font-mono text-slate-500">{tx.reference_no || "—"}</span>
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span className="text-sm font-semibold text-slate-700">
                                {tx.amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              {tx.is_successful ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                                  <CheckCircle2 size={12} /> Successful
                                </span>
                              ) : tx.tran_status === "cancelled" ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                                  <X size={12} /> Cancelled
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 px-2.5 py-1 rounded-full border border-red-200">
                                  <X size={12} /> Failed
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <span className="text-sm text-slate-600">
                                {tx.created_at
                                  ? format(new Date(tx.created_at), "dd/MM/yyyy, h:mm a")
                                  : "—"}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right">
                              {tx.is_successful && (
                                <Button
                                  onClick={() => handleDownload(tx.receipt_no)}
                                  disabled={downloading === tx.receipt_no}
                                  variant="outline"
                                  className="h-8 px-3 text-xs border-[#e8dfd2] hover:bg-[#f3eee6] rounded-lg gap-1.5"
                                >
                                  {downloading === tx.receipt_no ? (
                                    <div className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <>
                                      <Receipt size={12} /> Print
                                    </>
                                  )}
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="text-center py-12">
                            <p className="text-slate-400 text-sm">
                              {search ? "No matches found for your search" : "No tuition payments found"}
                            </p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-slate-500">
                    Page {currentPage} of {totalPages}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      onClick={() => setCurrentPage((p) => p - 1)}
                      disabled={currentPage === 1}
                      variant="outline"
                      className="h-8 px-3 text-xs rounded-lg border-[#e8dfd2]"
                    >
                      Previous
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                      <Button
                        key={n}
                        onClick={() => setCurrentPage(n)}
                        variant={currentPage === n ? "secondary" : "outline"}
                        className={`h-8 w-8 text-xs p-0 rounded-lg border-[#e8dfd2] ${currentPage === n ? "bg-slate-100" : ""}`}
                      >
                        {n}
                      </Button>
                    ))}
                    <Button
                      onClick={() => setCurrentPage((p) => p + 1)}
                      disabled={currentPage === totalPages}
                      variant="outline"
                      className="h-8 px-3 text-xs rounded-lg border-[#e8dfd2]"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StudentTransactionsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f3eee6] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#c99b45]" />
        </div>
      }
    >
      <StudentTransactionsContent />
    </Suspense>
  );
}
