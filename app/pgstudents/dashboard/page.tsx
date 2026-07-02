"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient, PaymentTransaction } from "@/lib/api";
import {
  AlertCircle,
  ChevronDown,
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  History,
  Lock,
  Mail,
  NotebookPen,
  Phone,
  Printer,
  ReceiptText,
  Settings,
  UserRound,
  WalletCards,
} from "lucide-react";

const menuGroups = [
  {
    title: "Academics",
    items: [
      { label: "Course Registration", icon: NotebookPen, color: "bg-[#2aadb9]" },
      { label: "Print Course Form", icon: Printer, color: "bg-[#2aadb9]" },
    
    ],
  },
  {
    title: "Payments",
    items: [
      { label: "Pay School Fees", icon: CreditCard, color: "bg-[#35ad39]" },
      { label: "Download Receipt", icon: ReceiptText, color: "bg-[#35ad39]" },
    
    
    ],
  },
  {
    title: "Documents",
    items: [
      { label: "Admission Letter", icon: FileText, color: "bg-[#93008c]" },
      { label: "Medical Examination Form", icon: FileText, color: "bg-[#93008c]" },
      { label: "Notice & Affidavit", icon: Settings, color: "bg-[#93008c]" },
    ],
  },
  {
    title: "Profile",
    items: [
      { label: "Profile Information", icon: UserRound, color: "bg-[#8a5309]" },
      { label: "Change Password", icon: Lock, color: "bg-[#8a5309]" },
    ],
  },
  {
    title: "Wallet",
    items: [
      { label: "Deposit", icon: WalletCards, color: "bg-[#93008c]" },
      { label: "Make Payment", icon: WalletCards, color: "bg-[#93008c]" },
      { label: "History", icon: History, color: "bg-[#93008c]" }
    ]
  },
];

export default function PgStudentsDashboardPage() {
  const router = useRouter();
  const { user, student, isAuthenticated, isLoading, logout, isLoggingOut } = useAuth();
  const [paymentHistory, setPaymentHistory] = useState<PaymentTransaction[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [passwordForm, setPasswordForm] = useState({
    new_password: "",
    confirm_password: "",
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const canAccess =
    isAuthenticated && user?.role === "student" && student?.is_pg_student === true;
  const downloadableReceipts = paymentHistory.filter(
    (payment) => payment.is_successful && payment.receipt_no,
  );
  const profileDetails = [
    { label: "Name", value: user?.name || "N/A" },
    { label: "Matric No", value: student?.matric_number || "N/A" },
    { label: "Course of Study", value: student?.program_name || "N/A" },
    { label: "Level", value: student?.current_level || "N/A" },
    { label: "Session", value: student?.session || "N/A" },
    { label: "Email", value: user?.email || "N/A" },
  ];

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated || user?.role !== "student" || !student) {
      router.replace("/pgstudents/login");
      return;
    }

    if (!student.is_pg_student) {
      router.replace("/student/dashboard");
    }
  }, [isLoading, isAuthenticated, user?.role, student, router]);

  useEffect(() => {
    if (!canAccess) return;

    let isMounted = true;

    const fetchPaymentHistory = async () => {
      try {
        setReceiptsLoading(true);
        const data = await ApiClient.getPaymentHistory();
        if (isMounted) {
          setPaymentHistory(data.payment_history || []);
        }
      } catch (error) {
        console.error("Failed to fetch PG payment receipts:", error);
        if (isMounted) {
          setPaymentHistory([]);
        }
      } finally {
        if (isMounted) {
          setReceiptsLoading(false);
        }
      }
    };

    fetchPaymentHistory();

    return () => {
      isMounted = false;
    };
  }, [canAccess]);

  const handleLogout = async () => {
    await logout("/pgstudents/login");
  };

  const formatPaymentType = (type: string) =>
    type
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));

  const handleDownloadReceipt = async (receiptNo: string, type: string) => {
    try {
      setDownloading(`receipt_${receiptNo}`);
      const blob = await ApiClient.downloadPaymentReceipt(receiptNo);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `receipt_${type}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading receipt:", error);
      alert("Failed to download receipt");
    } finally {
      setDownloading(null);
    }
  };

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordMessage(null);

    if (passwordForm.new_password.length < 6) {
      setPasswordMessage({
        type: "error",
        text: "New password must be at least 6 characters.",
      });
      return;
    }

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordMessage({ type: "error", text: "Passwords do not match." });
      return;
    }

    try {
      setPasswordLoading(true);
      await ApiClient.changePassword("", passwordForm.new_password);
      setPasswordMessage({
        type: "success",
        text: "Password successfully updated.",
      });
      setPasswordForm({ new_password: "", confirm_password: "" });
    } catch (error: any) {
      setPasswordMessage({
        type: "error",
        text: error?.message || "Failed to update password.",
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  if (isLoading || !canAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#102943] text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-white" />
          <p className="text-sm font-semibold">Loading postgraduate portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#102943] text-white">
      <header className="bg-[#202833]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:gap-6 md:px-6 md:py-5">
          <div className="flex items-center gap-3 md:gap-6">
            <Image
              src="/e-portal/images/logo new.png"
              alt="PCU Logo"
              width={86}
              height={86}
              className="h-14 w-14 shrink-0 rounded bg-white p-1 md:h-[86px] md:w-[86px]"
            />
            <div className="min-w-0">
              <h1 className="text-sm font-semibold leading-snug tracking-wide md:text-base md:leading-relaxed">
                The Postgraduate College
                <br />
                Precious Cornerstone University
              </h1>
              <p className="mt-1 text-xs italic leading-snug text-white/80 md:text-sm">
                ...raising excellent postgraduate scholars
              </p>
            </div>
          </div>

          <div className="grid gap-1 border-t border-white/10 pt-3 text-xs font-semibold text-white/90 md:border-t-0 md:pt-0 md:text-sm">
            <p className="flex min-w-0 items-center gap-2">
              <Mail className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" />
              <span className="min-w-0 truncate">pgschool@pcu.edu.ng</span>
            </p>
            <p className="flex min-w-0 items-center gap-2">
              <Phone className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" />
              <span className="min-w-0 truncate">09090561432 (9am - 4pm)</span>
            </p>
          </div>
        </div>
      </header>

      <div className="bg-white text-slate-900">
        <div className="mx-auto flex max-w-6xl flex-col gap-1.5 px-4 py-3 text-xs md:flex-row md:items-center md:justify-between md:px-6 md:text-sm">
          <p className="italic text-slate-700">
            Welcome {user?.name || "Postgraduate Student"}
          </p>
          <div className="font-semibold uppercase tracking-wide md:tracking-wider">
            <p className="text-red-500">
              {student?.session || "Current"} Academic Session
            </p>
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <main className="bg-gradient-to-b from-[#0b2942] via-[#205b8c] to-[#2f93df]">
        <div className="mx-auto grid min-h-[640px] max-w-6xl grid-cols-1 gap-x-24 gap-y-20 px-6 py-16 md:grid-cols-2 lg:grid-cols-3">
          {menuGroups.map((group) => (
            <section key={group.title}>
              <h2 className="mb-2 text-xl font-medium">{group.title}</h2>
              <div className="space-y-3">
                {group.items.map((item) => {
                  const Icon = item.icon;

                  if (item.label === "Download Receipt") {
                    return (
                      <details key={item.label} className="group/receipt">
                        <summary
                          className={`flex h-[50px] w-full cursor-pointer list-none items-center gap-4 px-3 text-left text-sm font-semibold text-white shadow-[7px_7px_6px_rgba(0,0,0,0.25)] transition-transform hover:-translate-y-0.5 ${item.color}`}
                        >
                          <Icon className="h-7 w-7 shrink-0 text-white/90" />
                          <span className="min-w-0 flex-1">
                            {item.label}
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open/receipt:rotate-180" />
                        </summary>
                        <div className="mt-2 space-y-2 rounded-sm bg-white/10 p-2 shadow-inner">
                          {receiptsLoading && (
                            <div className="rounded bg-white px-3 py-3 text-xs font-bold text-slate-500">
                              Loading receipts...
                            </div>
                          )}

                          {!receiptsLoading && downloadableReceipts.map((receipt) => (
                            <button
                              key={receipt.transaction_id}
                              type="button"
                              onClick={() =>
                                handleDownloadReceipt(
                                  receipt.receipt_no,
                                  receipt.payment_type,
                                )
                              }
                              disabled={downloading === `receipt_${receipt.receipt_no}`}
                              className="grid min-h-10 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded bg-white px-3 py-2 text-left text-xs font-bold text-slate-900 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              <span className="min-w-0">
                                <span className="block truncate">
                                  {formatPaymentType(receipt.payment_type)}
                                </span>
                                <span className="block truncate text-[10px] font-semibold text-slate-500">
                                  {formatAmount(receipt.amount)}
                                </span>
                              </span>
                              <span className="flex items-center gap-1 text-[#6b21a8]">
                                <Download className="h-4 w-4" />
                                {downloading === `receipt_${receipt.receipt_no}`
                                  ? "..."
                                  : "PDF"}
                              </span>
                            </button>
                          ))}

                          {!receiptsLoading && downloadableReceipts.length === 0 && (
                            <div className="rounded border border-dashed border-white/30 bg-white px-3 py-3 text-center text-xs font-bold text-slate-500">
                              No payment receipts found.
                            </div>
                          )}
                        </div>
                      </details>
                    );
                  }

                  if (item.label === "Profile Information") {
                    return (
                      <details key={item.label} className="group/profile">
                        <summary
                          className={`flex h-[50px] w-full cursor-pointer list-none items-center gap-4 px-3 text-left text-sm font-semibold text-white shadow-[7px_7px_6px_rgba(0,0,0,0.25)] transition-transform hover:-translate-y-0.5 ${item.color}`}
                        >
                          <Icon className="h-7 w-7 shrink-0 text-white/90" />
                          <span className="min-w-0 flex-1">
                            {item.label}
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open/profile:rotate-180" />
                        </summary>
                        <div className="mt-2 space-y-2 rounded-sm bg-white/10 p-2 shadow-inner">
                          {profileDetails.map((detail) => (
                            <div
                              key={detail.label}
                              className="rounded bg-white px-3 py-2 text-xs text-slate-900"
                            >
                              <p className="font-semibold text-slate-500">
                                {detail.label}
                              </p>
                              <p className="mt-0.5 break-words font-bold">
                                {detail.value}
                              </p>
                            </div>
                          ))}
                        </div>
                      </details>
                    );
                  }

                  if (item.label === "Change Password") {
                    return (
                      <details key={item.label} className="group/password">
                        <summary
                          className={`flex h-[50px] w-full cursor-pointer list-none items-center gap-4 px-3 text-left text-sm font-semibold text-white shadow-[7px_7px_6px_rgba(0,0,0,0.25)] transition-transform hover:-translate-y-0.5 ${item.color}`}
                        >
                          <Icon className="h-7 w-7 shrink-0 text-white/90" />
                          <span className="min-w-0 flex-1">
                            {item.label}
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open/password:rotate-180" />
                        </summary>
                        <form
                          noValidate
                          onSubmit={handleChangePassword}
                          className="mt-2 space-y-2 rounded-sm bg-white/10 p-2 shadow-inner"
                        >
                          {passwordMessage && (
                            <div
                              className={`flex items-center gap-2 rounded bg-white px-3 py-2 text-xs font-bold ${
                                passwordMessage.type === "success"
                                  ? "text-emerald-700"
                                  : "text-red-700"
                              }`}
                            >
                              {passwordMessage.type === "success" ? (
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                              ) : (
                                <AlertCircle className="h-4 w-4 shrink-0" />
                              )}
                              <span>{passwordMessage.text}</span>
                            </div>
                          )}

                          <label className="block rounded bg-white px-3 py-2 text-xs text-slate-900">
                            <span className="font-semibold text-slate-500">
                              New Password
                            </span>
                            <input
                              type="password"
                              value={passwordForm.new_password}
                              onChange={(event) =>
                                setPasswordForm((current) => ({
                                  ...current,
                                  new_password: event.target.value,
                                }))
                              }
                              disabled={passwordLoading}
                              className="mt-1 h-9 w-full rounded border border-slate-200 px-2 text-sm font-bold outline-none focus:border-[#8a5309]"
                              minLength={6}
                              required
                            />
                          </label>

                          <label className="block rounded bg-white px-3 py-2 text-xs text-slate-900">
                            <span className="font-semibold text-slate-500">
                              Confirm Password
                            </span>
                            <input
                              type="password"
                              value={passwordForm.confirm_password}
                              onChange={(event) =>
                                setPasswordForm((current) => ({
                                  ...current,
                                  confirm_password: event.target.value,
                                }))
                              }
                              disabled={passwordLoading}
                              className="mt-1 h-9 w-full rounded border border-slate-200 px-2 text-sm font-bold outline-none focus:border-[#8a5309]"
                              minLength={6}
                              required
                            />
                          </label>

                          <button
                            type="submit"
                            disabled={passwordLoading}
                            className="flex h-10 w-full items-center justify-center gap-2 rounded bg-white px-3 text-xs font-bold text-[#8a5309] transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            <Lock className="h-4 w-4" />
                            {passwordLoading ? "Updating..." : "Update Password"}
                          </button>
                        </form>
                      </details>
                    );
                  }

                  return (
                    <button
                      key={item.label}
                      type="button"
                      className={`flex h-[50px] w-full items-center gap-4 px-3 text-left text-sm font-semibold text-white shadow-[7px_7px_6px_rgba(0,0,0,0.25)] transition-transform hover:-translate-y-0.5 ${item.color}`}
                    >
                      <Icon className="h-7 w-7 shrink-0 text-white/90" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </main>

      <footer className="bg-[#202833]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4 text-sm md:flex-row md:items-center md:justify-between">
          <p>
            Â© 2026 The Postgraduate College, Precious Cornerstone University.
            All Rights Reserved
          </p>
          <p className="font-semibold">Follow us on: f Â· x Â· G+ Â· in</p>
        </div>
      </footer>
    </div>
  );
}
