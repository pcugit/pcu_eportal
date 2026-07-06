"use client";

import Image from "next/image";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import CourseRegistration from "@/app/student/registration/page";
import { StudentTransactionsContent } from "@/app/student/transactions/page";
import { ApiClient } from "@/lib/api";
import {
  AlertCircle,
  ArrowLeft,
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
  Settings,
  UserRound,
  WalletCards,
} from "lucide-react";

const navSections = [
  { id: "academics", label: "Academics" },
  { id: "payments", label: "Payments" },
  { id: "documents", label: "Documents" },
  { id: "wallet", label: "Wallet" },
];

const menuGroups = [
  {
    id: "academics",
    title: "Academics",
    items: [
      { label: "Course Registration", icon: NotebookPen },
      { label: "Print Course Form", icon: Printer },
    ],
  },
  {
    id: "payments",
    title: "Payments",
    items: [{ label: "Pay School Fees", icon: CreditCard }],
  },
  {
    id: "documents",
    title: "Documents",
    items: [
      { label: "Admission Letter", icon: FileText },
      { label: "Medical Examination Form", icon: FileText },
      { label: "Notice & Affidavit", icon: Settings },
    ],
  },
  {
    id: "wallet",
    title: "Wallet",
    items: [
      { label: "Deposit", icon: WalletCards },
      { label: "Make Payment", icon: WalletCards },
      { label: "History", icon: History },
    ],
  },
];

export default function PtStudentsDashboardPage() {
  const router = useRouter();
  const { user, student, isAuthenticated, isLoading, logout, isLoggingOut } = useAuth();
  const [activeView, setActiveView] = useState<"dashboard" | "course-registration" | "payments">("dashboard");
  const [firstLoginResolved, setFirstLoginResolved] = useState(false);
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
    isAuthenticated && user?.role === "student" && student?.is_pt_student === true;
  const mustChangePassword = Boolean(student?.is_first_login) && !firstLoginResolved;
  const availableReceipts = [
    "Tuition",
    "Acceptance Fee",
    "Application Fee",
    "Departmental Fee",
  ];
  const formatDegreeCourse = (course?: string | null, degreeCode?: string | null) => {
    const cleanCourse = (course || "").trim();
    const cleanDegree = (degreeCode || "").trim();

    if (!cleanCourse) return "N/A";
    if (!cleanDegree) return cleanCourse;

    const degreeWithPeriod = cleanDegree.endsWith(".")
      ? cleanDegree
      : `${cleanDegree}.`;
    const escapedDegree = cleanDegree.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const alreadyPrefixed = new RegExp(`^${escapedDegree}\\.?\\s+`, "i").test(
      cleanCourse,
    );

    return alreadyPrefixed ? cleanCourse : `${degreeWithPeriod} ${cleanCourse}`;
  };
  const courseOfStudy = formatDegreeCourse(
    student?.program_name,
    student?.degree_code,
  );
  const profileDetails = [
    { label: "Name", value: user?.name || "N/A" },
    { label: "Matric No", value: student?.matric_number || "N/A" },
    { label: "Course of Study", value: courseOfStudy },
    { label: "Level", value: student?.current_level || "N/A" },
    { label: "Session", value: student?.session || "N/A" },
    { label: "Email", value: user?.email || "N/A" },
  ];

  const handleLogout = async () => {
    await logout("/ptstudents/login");
  };

  const handleMenuItemClick = (label: string) => {
    if (mustChangePassword) return;

    if (label === "Course Registration") {
      setActiveView("course-registration");
      return;
    }

    if (label === "Pay School Fees") {
      setActiveView("payments");
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
      setPasswordForm({ new_password: "", confirm_password: "" });
      setFirstLoginResolved(true);
      setPasswordMessage({
        type: "success",
        text: "Password successfully updated. You can now continue.",
      });
    } catch (error: any) {
      setPasswordMessage({
        type: "error",
        text: error?.message || "Failed to update password.",
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated || user?.role !== "student" || !student) {
      router.replace("/ptstudents/login");
      return;
    }

    if (student.is_pg_student) {
      router.replace("/pgstudents/dashboard");
      return;
    }

    if (!student.is_pt_student) {
      router.replace("/student/dashboard");
    }
  }, [isLoading, isAuthenticated, user?.role, student, router]);

  if (isLoading || !canAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#102943] text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-white" />
          <p className="text-sm font-semibold">Loading part-time portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f5f2] text-[#1c2b3a]">
      <header className="sticky top-0 z-40 border-b border-[#e4e0d8] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Image
              src="/e-portal/images/logo new.png"
              alt="PCU Logo"
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 rounded object-contain"
            />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold tracking-tight text-[#0f2c4c]">
                Part-Time Studies
              </p>
              <p className="truncate text-xs text-[#6b7686]">
                Precious Cornerstone University
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-6 text-xs text-[#6b7686] sm:flex">
            <span className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> parttime@pcu.edu.ng
            </span>
            <span className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" /> 09130035412
            </span>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="shrink-0 text-xs font-medium text-[#0f2c4c] underline decoration-[#b8863d] decoration-2 underline-offset-4 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Log out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-5 md:px-8 md:py-8">
        <section className="mb-5 flex flex-col justify-between gap-3 rounded-xl border border-[#e4e0d8] bg-[#0f2c4c] px-4 py-4 text-white sm:mb-8 sm:px-6 sm:py-6 lg:flex-row lg:items-center lg:gap-8">
          <div className="min-w-0 lg:shrink-0">
            <h1 className="mt-0.5 font-serif text-lg leading-tight sm:mt-1 sm:text-2xl lg:whitespace-nowrap">
              Welcome, {user?.name || "Part-Time Student"}
            </h1>
          </div>
          <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4 sm:gap-x-5 sm:gap-y-3 sm:text-sm lg:flex lg:flex-1 lg:items-start lg:justify-end lg:gap-x-6">
            {profileDetails
              .filter((detail) =>
                ["Matric No", "Course of Study", "Session", "Email"].includes(
                  detail.label,
                ),
              )
              .map((detail) => (
                <div
                  key={detail.label}
                  className={
                    detail.label === "Course of Study" || detail.label === "Email"
                      ? "min-w-0 lg:max-w-[11rem] xl:max-w-none"
                      : "min-w-0 lg:shrink-0"
                  }
                >
                  <dt className="text-[9px] uppercase tracking-wide text-white/50 sm:text-[11px]">
                    {detail.label}
                  </dt>
                  <dd className="mt-0.5 break-words font-medium leading-tight text-white sm:leading-normal lg:truncate">
                    {detail.value}
                  </dd>
                </div>
              ))}
          </dl>
        </section>

        {mustChangePassword ? (
          <section className="mx-auto max-w-2xl rounded-xl border border-[#e4e0d8] bg-white">
            <div className="border-b border-[#e4e0d8] px-5 py-4">
              <h2 className="font-serif text-xl text-[#0f2c4c]">
                Change Password
              </h2>
              <p className="mt-1 text-sm text-[#6b7686]">
                Update your default password before using the part-time portal.
              </p>
            </div>
            <form noValidate onSubmit={handleChangePassword} className="space-y-4 px-5 py-5">
              {passwordMessage && (
                <div
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
                    passwordMessage.type === "success"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-red-50 text-red-700"
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

              <label className="block text-sm text-[#1c2b3a]">
                <span className="font-semibold text-[#6b7686]">New Password</span>
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
                  className="mt-1 h-11 w-full rounded-md border border-[#e4e0d8] px-3 text-sm outline-none focus:border-[#b8863d]"
                  minLength={6}
                  required
                />
              </label>

              <label className="block text-sm text-[#1c2b3a]">
                <span className="font-semibold text-[#6b7686]">Confirm Password</span>
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
                  className="mt-1 h-11 w-full rounded-md border border-[#e4e0d8] px-3 text-sm outline-none focus:border-[#b8863d]"
                  minLength={6}
                  required
                />
              </label>

              <button
                type="submit"
                disabled={passwordLoading}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#0f2c4c] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#153d67] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
              >
                <Lock className="h-4 w-4" />
                {passwordLoading ? "Updating..." : "Update Password"}
              </button>
            </form>
          </section>
        ) : activeView === "course-registration" ? (
          <section className="space-y-4">
            <button
              type="button"
              onClick={() => setActiveView("dashboard")}
              className="inline-flex items-center gap-2 rounded-md border border-[#e4e0d8] bg-white px-3 py-2 text-sm font-medium text-[#0f2c4c] transition-colors hover:bg-[#f6f5f2]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </button>
            <div className="overflow-hidden rounded-xl border border-[#e4e0d8] bg-white">
              <CourseRegistration />
            </div>
          </section>
        ) : activeView === "payments" ? (
          <section className="space-y-4">
            <Suspense
              fallback={
                <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-[#e4e0d8] bg-white">
                  <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#0f2c4c]" />
                </div>
              }
            >
              <StudentTransactionsContent
                embedded
                onBack={() => setActiveView("dashboard")}
              />
            </Suspense>
          </section>
        ) : (

        <div className="flex flex-col gap-8 md:flex-row">
          <nav className="flex shrink-0 gap-2 overflow-x-auto pb-2 md:sticky md:top-24 md:w-44 md:flex-col md:self-start md:overflow-visible md:pb-0">
            {navSections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-[#3d4a59] transition-colors hover:bg-white hover:text-[#0f2c4c] md:whitespace-normal"
              >
                {section.label}
              </a>
            ))}
            <a
              href="#profile"
              className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-[#3d4a59] transition-colors hover:bg-white hover:text-[#0f2c4c] md:whitespace-normal"
            >
              Profile
            </a>
          </nav>

          <div className="flex-1 space-y-8">
            {menuGroups.map((group) => (
              <section
                key={group.id}
                id={group.id}
                className="rounded-xl border border-[#e4e0d8] bg-white"
              >
                <h2 className="border-b border-[#e4e0d8] px-5 py-3 font-serif text-lg text-[#0f2c4c]">
                  {group.title}
                </h2>

                <div className="divide-y divide-[#eeece6]">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => handleMenuItemClick(item.label)}
                        className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm text-[#1c2b3a] transition-colors hover:bg-[#f6f5f2]"
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0 text-[#b8863d]" />
                        <span className="flex-1">{item.label}</span>
                        <span className="text-xs text-[#9aa3ad]">-&gt;</span>
                      </button>
                    );
                  })}

                  {group.id === "payments" && (
                    <details className="group/receipt">
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 text-sm text-[#1c2b3a] transition-colors hover:bg-[#f6f5f2]">
                        <Download className="h-[18px] w-[18px] shrink-0 text-[#b8863d]" />
                        <span className="flex-1">Download Receipt</span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-[#9aa3ad] transition-transform group-open/receipt:rotate-180" />
                      </summary>
                      <div className="space-y-1.5 bg-[#f6f5f2] px-5 py-3">
                        {availableReceipts.map((receipt) => (
                          <button
                            key={receipt}
                            type="button"
                            className="flex w-full items-center justify-between rounded-md bg-white px-3 py-2 text-xs font-medium text-[#1c2b3a] shadow-sm transition-colors hover:bg-[#0f2c4c] hover:text-white"
                          >
                            {receipt}
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </section>
            ))}

            <section
              id="profile"
              className="rounded-xl border border-[#e4e0d8] bg-white"
            >
              <h2 className="border-b border-[#e4e0d8] px-5 py-3 font-serif text-lg text-[#0f2c4c]">
                Profile
              </h2>
              <div className="divide-y divide-[#eeece6]">
                <details className="group/profile">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 text-sm text-[#1c2b3a] transition-colors hover:bg-[#f6f5f2]">
                    <UserRound className="h-[18px] w-[18px] shrink-0 text-[#b8863d]" />
                    <span className="flex-1">Profile Information</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-[#9aa3ad] transition-transform group-open/profile:rotate-180" />
                  </summary>
                  <div className="grid gap-2 bg-[#f6f5f2] px-5 py-3 sm:grid-cols-2">
                    {profileDetails.map((detail) => (
                      <div
                        key={detail.label}
                        className="rounded-md bg-white px-3 py-2 text-xs text-[#1c2b3a] shadow-sm"
                      >
                        <p className="font-semibold text-[#6b7686]">
                          {detail.label}
                        </p>
                        <p className="mt-0.5 break-words font-medium">
                          {detail.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>

                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm text-[#1c2b3a] transition-colors hover:bg-[#f6f5f2]"
                >
                  <Lock className="h-[18px] w-[18px] shrink-0 text-[#b8863d]" />
                  <span className="flex-1">Change Password</span>
                  <span className="text-xs text-[#9aa3ad]">-&gt;</span>
                </button>
              </div>
            </section>
          </div>
        </div>
        )}
      </div>

      <footer className="mt-12 border-t border-[#e4e0d8] bg-white px-4 py-4 text-center text-xs text-[#6b7686] md:px-8">
        &copy; Precious Cornerstone University ICT. All rights reserved.
      </footer>
    </div>
  );
}
