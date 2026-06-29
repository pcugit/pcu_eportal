"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useSidebar } from "@/context/SidebarContext";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  GraduationCap,
  FileText,
  UserPlus,
  Bell,
  Users,
  BookOpen,
  LogOut,
  Menu,
  X,
  User,
  ShieldCheck,
  Briefcase,
  History,
  Lock,
  CreditCard,
  ChevronDown,
  Wallet,
  Mail,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ApiClient } from "@/lib/api";

const LANDING_NAV_ITEMS = [
  { label: "Undergraduate", href: "/student/login", icon: GraduationCap },
  { label: "Postgraduate", href: "/postgraduate", icon: BookOpen },
  { label: "Part Time", href: "/part-time", icon: Briefcase },
  { label: "Admissions", href: "/auth/signup", icon: UserPlus },
  { label: "News & Events", href: "/news", icon: Bell },
  { label: "Staff Portal", href: "/staff/login", icon: Users },
];

const APPLICANT_NAV_ITEMS = [
  { label: "Dashboard", href: "/applicant/dashboard", icon: LayoutDashboard },
  { label: "Transactions", href: "/applicant/transactions", icon: CreditCard },
  { label: "Change Password", href: "/applicant/change-password", icon: Lock },
];

const STUDENT_NAV_ITEMS = [
  { label: "Dashboard", href: "/student/dashboard", icon: LayoutDashboard },
  { label: "Profile", href: "/student/profile", icon: User },
  { label: "Transactions", href: "/student/transactions", icon: CreditCard },
  {
    label: "Course Registration",
    href: "/student/registration",
    icon: BookOpen,
  },
  { label: "Change Password", href: "/student/change-password", icon: Lock },
];

// Admitted role: paid acceptance fee, stays on applicant portal
// (tuition payment, documents, downloads — no course registration)
const ADMITTED_NAV_ITEMS = [
  { label: "Dashboard", href: "/applicant/dashboard", icon: LayoutDashboard },
  {
    label: "Pay Fees",
    href: "/applicant/payment?type=tuition",
    icon: Wallet,
  },
  { label: "Transactions", href: "/applicant/transactions", icon: CreditCard },
  { label: "Change Password", href: "/applicant/change-password", icon: Lock },
];

const ADMIN_NAV_ITEMS = [
  {
    label: "Dashboard",
    href: "/admission_officer/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Applications",
    href: "/admission_officer/applications",
    icon: FileText,
  },
  {
    label: "Send Letters",
    href: "/admission_officer/send-letters",
    icon: UserPlus,
  },
  { label: "Change Password", href: "/staff/change-password", icon: Lock },
];

const PGADMIN_NAV_ITEMS = [
  {
    label: "Dashboard",
    href: "/pgadmin/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Applications",
    href: "/pgadmin/applications",
    icon: FileText,
  },
  {
    label: "Send Letters",
    href: "/pgadmin/send-letters",
    icon: Mail,
  },
  { label: "Change Password", href: "/staff/change-password", icon: Lock },
];

const PTADMIN_NAV_ITEMS = [
  {
    label: "Dashboard",
    href: "/ptadmin/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Applications",
    href: "/ptadmin/applications",
    icon: FileText,
  },
  {
    label: "Send Letters",
    href: "/ptadmin/send-letters",
    icon: Mail,
  },
  { label: "Change Password", href: "/staff/change-password", icon: Lock },
];

const REGISTRAR_NAV_ITEMS = [
  { label: "Dashboard", href: "/registrar/dashboard", icon: LayoutDashboard },
  { label: "Change Password", href: "/staff/change-password", icon: Lock },
];

const LECTURER_NAV_ITEMS = [
  { label: "Dashboard", href: "/lecturer/dashboard", icon: LayoutDashboard },
  { label: "Change Password", href: "/staff/change-password", icon: Lock },
];

const ICT_NAV_ITEMS = [
  { label: "Dashboard", href: "/ict/dashboard", icon: LayoutDashboard },
  { label: "Students", href: "/ict/students", icon: GraduationCap },
  { label: "Staff", href: "/ict/staff", icon: Users },
  { label: "Settings", href: "/ict/settings", icon: ShieldCheck },
  { label: "Change Password", href: "/staff/change-password", icon: Lock },
];

type LetterClassificationMap = Record<string, Array<{ pending_count: number }>>;

function countPendingLetterRows(classifications: LetterClassificationMap = {}) {
  return Object.values(classifications).reduce(
    (total, groups) =>
      total + groups.filter((group) => group.pending_count > 0).length,
    0,
  );
}

function countPendingDegreeTypes(classifications: LetterClassificationMap = {}) {
  return Object.values(classifications).filter((groups) =>
    groups.some((group) => group.pending_count > 0),
  ).length;
}

export function GlobalNav() {
  const pathname = usePathname();
  const { isAuthenticated, user, logout, isLoading, isLoggingOut } = useAuth();
  const { isOpen, toggle } = useSidebar();
  const [pendingCount, setPendingCount] = React.useState(0);
  const [pendingLetterGroupCount, setPendingLetterGroupCount] = React.useState(0);

  const handleLogout = async () => {
    await logout();
  };

  const isApplicantPortal =
    isAuthenticated &&
    (user?.role === "applicant" ||
      user?.role === "freshapplicant" ||
      user?.role === "admitted");
  const isStudentPortal = isAuthenticated && user?.role === "student";
  const isAdmittedPortal = isAuthenticated && user?.role === "admitted";
  const isAdminPortal = isAuthenticated && user?.role === "admissionofficer";
  const isRegistrarPortal = isAuthenticated && user?.role === "registrar";
  const isLecturerPortal = isAuthenticated && user?.role === "lecturer";
  const isIctPortal = isAuthenticated && user?.role === "ictdirector";
  const isManagementPortal =
    isAuthenticated && ["hod", "dean"].includes(user?.role || "");
  const isAdmissionOfficerSection = pathname?.startsWith("/admission_officer");
  const isApplicantSection = pathname?.startsWith("/applicant");
  const isStudentSection = pathname?.startsWith("/student");
  const isPgAdminSection = pathname?.startsWith("/pgadmin");
  const isPgDeanSection = pathname?.startsWith("/pgdean");
  const isPtAdminSection = pathname?.startsWith("/ptadmin");
  const isRegistrarSection = pathname?.startsWith("/registrar");
  const isLecturerSection = pathname?.startsWith("/lecturer");
  const isIctSection = pathname?.startsWith("/ict");
  const isOfficialPortalSection =
    isAdmissionOfficerSection ||
    isApplicantSection ||
    isStudentSection ||
    isPgAdminSection ||
    isPgDeanSection ||
    isPtAdminSection ||
    isRegistrarSection ||
    isLecturerSection ||
    isIctSection;

  React.useEffect(() => {
    const fetchCount = async () => {
      if (!isAuthenticated) {
        setPendingCount(0);
        setPendingLetterGroupCount(0);
        return;
      }

      try {
        if (user?.role === "admissionofficer") {
          const [res, letterGroups] = await Promise.all([
            ApiClient.getDashboard(1),
            ApiClient.getFacultyDepartments(),
          ]);
          setPendingCount(res.statistics?.review_applications ?? 0);
          setPendingLetterGroupCount(
            countPendingLetterRows(letterGroups.faculties),
          );
          return;
        }

        if (user?.role === "pgadmin") {
          const [res, letterGroups] = await Promise.all([
            ApiClient.getPgAdminDashboard(1),
            ApiClient.getPgFacultyDepartments(),
          ]);
          setPendingCount(res.statistics?.new_applications ?? 0);
          setPendingLetterGroupCount(
            countPendingDegreeTypes(letterGroups.faculties),
          );
          return;
        }

        if (user?.role === "pgdean") {
          const res = await ApiClient.getPgDeanDashboard(1);
          setPendingCount(res.statistics?.new_applications ?? 0);
          setPendingLetterGroupCount(0);
          return;
        }

        if (user?.role === "ptadmin") {
          const [res, letterGroups] = await Promise.all([
            ApiClient.getPtAdminDashboard(1),
            ApiClient.getPtFacultyDepartments(),
          ]);
          setPendingCount(res.statistics?.new_applications ?? 0);
          setPendingLetterGroupCount(
            countPendingLetterRows(letterGroups.faculties),
          );
          return;
        }

        setPendingCount(0);
        setPendingLetterGroupCount(0);
      } catch (err) {
        console.error(err);
      }
    };

    fetchCount();

    window.addEventListener("application-reviewed", fetchCount);
    window.addEventListener("admission-letters-updated", fetchCount);
    return () => {
      window.removeEventListener("application-reviewed", fetchCount);
      window.removeEventListener("admission-letters-updated", fetchCount);
    };
  }, [isAuthenticated, user?.role, pathname]);

  // Close mobile sidebar drawer on path change
  React.useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024 && isOpen) {
      toggle();
    }
  }, [pathname]);

  // Determine nav items based on role
  const getNavItems = () => {
    if (isLoading) {
      if (isAdmissionOfficerSection) return ADMIN_NAV_ITEMS;
      if (isPgAdminSection || isPgDeanSection) return PGADMIN_NAV_ITEMS;
      if (isPtAdminSection) return PTADMIN_NAV_ITEMS;
      if (isRegistrarSection) return REGISTRAR_NAV_ITEMS;
      if (isLecturerSection) return LECTURER_NAV_ITEMS;
      if (isIctSection) return ICT_NAV_ITEMS;
      if (isStudentSection) return STUDENT_NAV_ITEMS;
      if (isApplicantSection) return APPLICANT_NAV_ITEMS;
      return LANDING_NAV_ITEMS;
    }
    if (!isAuthenticated) return LANDING_NAV_ITEMS;
    if (pathname?.startsWith("/applicant")) {
      if (user?.role === "admitted") return ADMITTED_NAV_ITEMS;
      return APPLICANT_NAV_ITEMS;
    }
    if (pathname?.startsWith("/student")) {
      if (user?.role === "student") return STUDENT_NAV_ITEMS;
    }

    if (isApplicantPortal) {
      if (user?.role === "admitted") return ADMITTED_NAV_ITEMS;
      return APPLICANT_NAV_ITEMS;
    }
    if (isStudentPortal) return STUDENT_NAV_ITEMS;
    if (isAdminPortal) return ADMIN_NAV_ITEMS;
    if (isRegistrarPortal) return REGISTRAR_NAV_ITEMS;
    if (isLecturerPortal) return LECTURER_NAV_ITEMS;
    if (isIctPortal) return ICT_NAV_ITEMS;
    if (user?.role === "pgadmin" || user?.role === "pgdean")
      return PGADMIN_NAV_ITEMS;
    if (user?.role === "ptadmin")
      return PTADMIN_NAV_ITEMS;
    if (isManagementPortal)
      return [
        {
          label: "Dashboard",
          href: `/${user?.role}/dashboard`,
          icon: LayoutDashboard,
        },
      ];

    return LANDING_NAV_ITEMS;
  };

  const getStaffDashboardRoute = () => {
    switch (user?.role) {
      case "admissionofficer":
        return "/admission_officer/dashboard";
      case "registrar":
        return "/registrar/dashboard";
      case "lecturer":
        return "/lecturer/dashboard";
      case "ictdirector":
        return "/ict/dashboard";
      case "pgadmin":
      case "pgdean":
        return "/pgadmin/dashboard";
      case "ptadmin":
        return "/ptadmin/dashboard";
      default:
        if (isAdmissionOfficerSection) return "/admission_officer/dashboard";
        if (isPgAdminSection || isPgDeanSection) return "/pgadmin/dashboard";
        if (isPtAdminSection) return "/ptadmin/dashboard";
        if (isRegistrarSection) return "/registrar/dashboard";
        if (isLecturerSection) return "/lecturer/dashboard";
        if (isIctSection) return "/ict/dashboard";
        return "/";
    }
  };

  const getChangePasswordHref = () => {
    const dashboardPath = getStaffDashboardRoute();
    return `/staff/change-password?returnTo=${encodeURIComponent(dashboardPath)}`;
  };

  const navItems = getNavItems().map((item) =>
    item.href === "/staff/change-password"
      ? { ...item, href: getChangePasswordHref() }
      : item,
  );

  return (
    <>
      {/* Top Header - Mobile Only (Hidden on Desktop) */}
      <header className={cn(
        "lg:hidden flex items-center justify-between h-16 px-4 border-b sticky top-0 z-[90] w-full",
        isOfficialPortalSection
          ? "bg-[#f8f3ea] border-[#e8dfd2] text-[#15110a]"
          : "bg-white border-slate-200 text-slate-800"
      )}>
        <div className="flex items-center gap-3">
          {/* Mobile Hamburger Toggle */}
          <button
            onClick={toggle}
            className={cn(
              "p-2 -ml-2 rounded-xl transition-colors shrink-0",
              isOfficialPortalSection
                ? "text-slate-700 hover:bg-[#ead6aa] hover:text-[#15110a]"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
            aria-label="Toggle Sidebar"
          >
            <Menu size={24} />
          </button>

          {/* Logo and Brand */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="bg-white p-0.5 rounded-lg shadow-sm border border-slate-200/50">
              <Image
                src="/e-portal/images/logo new.png"
                alt="University Logo"
                width={28}
                height={28}
                className="object-contain mix-blend-multiply"
              />
            </div>
            <span className={cn(
              "font-black text-sm uppercase tracking-tight leading-none",
              isOfficialPortalSection ? "text-slate-800" : "text-slate-900"
            )}>
              PCU Portal
            </span>
          </Link>
        </div>

        {/* Right side indicator for balance */}
        <div className="flex items-center gap-2">
          {user?.username && (
            <span className={cn(
              "text-xs font-bold font-mono px-2.5 py-1 rounded-lg border",
              isOfficialPortalSection
                ? "text-[#5c4520] bg-[#ead6aa] border-[#d5b875]"
                : "text-slate-600 bg-slate-100 border-slate-200"
            )}>
              {user.username}
            </span>
          )}
        </div>
      </header>

      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[95] lg:hidden animate-in fade-in duration-300"
          onClick={toggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 h-full border-r z-[100] transition-all duration-300 ease-in-out shadow-2xl flex flex-col justify-between",
          isOfficialPortalSection
            ? "bg-[#151515] border-[#26211a]"
            : "bg-slate-100 border-slate-200",
          "w-[280px] lg:w-auto",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          isOpen ? "lg:w-[280px]" : "lg:w-[80px]",
        )}
      >
        <div>
          {/* Logo Area */}
          <div
            className={cn(
              "flex items-center h-16 border-b relative",
              isOpen ? "px-4 pr-16" : "px-3",
              isOfficialPortalSection
                ? "bg-[#151515] border-white/10"
                : "bg-slate-100/50 border-slate-200/50",
            )}
          >
            <Link href="/" className="flex min-w-0 items-center gap-3 shrink-0">
              <div className=" bg-white  shadow-md">
                <Image
                  src="/e-portal/images/logo new.png"
                  alt="University Logo"
                  width={30}
                  height={30}
                  className="portal-login-logo"
                />
              </div>
              <span
                className={cn(
                  "font-black text-slate-800 uppercase transition-all duration-300 overflow-hidden whitespace-nowrap leading-none",
                  isOpen ? "text-base" : "text-sm",
                  isOfficialPortalSection && "text-white",
                  isOpen ? "opacity-100 max-w-[150px]" : "opacity-0 max-w-0",
                )}
              >
                PCU Portal
              </span>
            </Link>

            <button
              onClick={toggle}
              className={cn(
                "absolute top-1/2 -translate-y-1/2 border shadow-lg rounded-xl p-1.5 transition-all z-[110]",
                isOfficialPortalSection
                  ? "bg-[#f8f3ea] border-[#d5b875] text-[#15110a] hover:bg-[#ead6aa]"
                  : "bg-white border-slate-100 text-slate-500 hover:text-purple-600 hover:border-purple-100",
                isOpen ? "right-4" : "-right-4 hidden lg:block",
              )}
            >
              {isOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>

          {/* Navigation Items */}
          <nav className="px-3 space-y-3 py-6">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "flex items-center transition-all duration-200 group relative",
                    isOpen
                      ? "px-4 py-2 rounded-xl"
                      : "justify-center py-2 rounded-2xl mx-1",
                    !isActive && "text-slate-500 hover:text-slate-900",
                    isOfficialPortalSection &&
                      (isActive
                        ? "text-[#15110a]"
                        : "text-[#d8d1c6] hover:text-white hover:bg-white/5"),
                  )}
                >
                  <div className="relative shrink-0">
                    <div
                      className={cn(
                        "flex items-center justify-center transition-all duration-300",
                        "w-11 h-11 rounded-xl border shadow-sm",
                        isOfficialPortalSection && isActive
                          ? "bg-[#c99b45] border-[#c99b45] text-[#15110a] shadow-[#c99b45]/20"
                          : isActive
                            ? "bg-[#6b21a8] border-[#6b21a8] text-white shadow-[#6b21a8]/20"
                            : isOfficialPortalSection
                              ? "bg-[#202020] border-white/10 text-[#d8d1c6] group-hover:border-[#c99b45]/60 group-hover:text-white group-hover:scale-105"
                              : "bg-white border-slate-100 text-slate-500 group-hover:border-purple-200 group-hover:scale-105",
                      )}
                    >
                      <item.icon
                        size={20}
                        className={cn(isActive && "animate-pulse")}
                      />
                    </div>
                    {item.label === "Applications" && pendingCount > 0 && (
                      <div className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white leading-none shadow-sm z-50 border-2 border-white">
                        {pendingCount > 99 ? "99+" : pendingCount}
                      </div>
                    )}
                    {item.label === "Send Letters" &&
                      pendingLetterGroupCount > 0 && (
                        <div className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white leading-none shadow-sm z-50 border-2 border-white">
                          {pendingLetterGroupCount > 99
                            ? "99+"
                            : pendingLetterGroupCount}
                        </div>
                      )}
                  </div>

                  <span
                    className={cn(
                      "font-bold text-[12px] tracking-tight whitespace-nowrap transition-all duration-300 overflow-hidden",
                      isOpen ? "opacity-100 w-auto ml-4" : "opacity-0 w-0",
                      isOfficialPortalSection
                        ? isActive
                          ? "text-[#f4e9d0]"
                          : "text-[#d8d1c6] group-hover:text-white"
                        : isActive
                          ? "text-[#6b21a8]"
                          : "text-slate-500 group-hover:text-slate-900",
                    )}
                  >
                    {item.label}
                  </span>

                  {!isOpen && (
                    <div className="absolute left-full ml-6 px-3 py-1 bg-slate-800 text-white text-xs rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
                      {item.label}
                    </div>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Actions (Logout for Admissions) */}
        <div className="px-3 pb-8 space-y-3">
          {isAuthenticated && (
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className={cn(
                "w-full flex items-center transition-all duration-200 rounded-xl group relative",
                isLoggingOut && "pointer-events-none opacity-70",
                isOfficialPortalSection
                  ? "text-[#d8d1c6] hover:text-white hover:bg-white/5"
                  : "text-slate-500 hover:text-red-600",
                isOpen ? "px-4 py-2" : "justify-center py-2",
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-center transition-all duration-300 shrink-0",
                  "w-11 h-11 rounded-xl border shadow-sm",
                  isOfficialPortalSection
                    ? "border-white/10 bg-[#202020] group-hover:border-[#c99b45]/60 group-hover:bg-[#2a2a2a] group-hover:scale-105 group-hover:text-white"
                    : "border-slate-100 bg-white group-hover:border-red-200 group-hover:bg-red-50 group-hover:scale-105 group-hover:text-red-600",
                )}
              >
                {isLoggingOut ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <LogOut size={20} />
                )}
              </div>
              <span
                className={cn(
                  "font-bold text-[12px] tracking-tight ml-4 transition-all duration-300 overflow-hidden",
                  isOpen ? "opacity-100 w-auto" : "opacity-0 w-0",
                )}
              >
                {isLoggingOut ? "Logging out" : "Sign Out"}
              </span>
              {!isOpen && (
                <div className="absolute left-full ml-6 px-3 py-1 bg-slate-800 text-white text-xs rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
                  Sign Out
                </div>
              )}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
