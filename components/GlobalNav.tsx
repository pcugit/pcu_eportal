"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
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
  ChevronDown
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const LANDING_NAV_ITEMS = [
  { label: 'Undergraduate', href: '/student/login', icon: GraduationCap },
  { label: 'Postgraduate', href: '/postgraduate', icon: BookOpen },
  { label: 'Part Time', href: '/part-time', icon: Briefcase },
  { label: 'Admissions', href: '/auth/signup', icon: UserPlus },
  { label: 'News & Events', href: '/news', icon: Bell },
  { label: 'Staff Portal', href: '/staff/login', icon: Users },
];

const APPLICANT_NAV_ITEMS = [
  { label: 'Dashboard', href: '/applicant/dashboard', icon: LayoutDashboard },
  { label: 'Transactions', href: '/applicant/transactions', icon: CreditCard },
  { label: 'Change Password', href: '/applicant/change-password', icon: Lock },
];

const STUDENT_NAV_ITEMS = [
  { label: 'Dashboard', href: '/student/dashboard', icon: LayoutDashboard },
  { label: 'Course Registration', href: '/student/registration', icon: BookOpen },
  { label: 'Change Password', href: '/student/change-password', icon: Lock },
];

const ADMIN_NAV_ITEMS = [
  { label: 'Dashboard', href: '/admission_officer/dashboard', icon: LayoutDashboard },
  { label: 'Applications', href: '/admission_officer/applications', icon: FileText },
  { label: 'Send Letters', href: '/admission_officer/send-letters', icon: UserPlus },
  { label: 'Change Password', href: '/applicant/change-password', icon: Lock },
];

const REGISTRAR_NAV_ITEMS = [
  { label: 'Dashboard', href: '/registrar/dashboard', icon: LayoutDashboard },
  { label: 'Change Password', href: '/applicant/change-password', icon: Lock },
];

const LECTURER_NAV_ITEMS = [
  { label: 'Dashboard', href: '/lecturer/dashboard', icon: LayoutDashboard },
  { label: 'Change Password', href: '/applicant/change-password', icon: Lock },
];

const ICT_NAV_ITEMS = [
  { label: 'Dashboard', href: '/ict/dashboard', icon: LayoutDashboard },
  { label: 'Students', href: '/ict/students', icon: GraduationCap },
  { label: 'Staff', href: '/ict/staff', icon: Users },
  { label: 'Settings', href: '/ict/settings', icon: ShieldCheck },
  { label: 'Change Password', href: '/applicant/change-password', icon: Lock },
];

const MAIN_NAV_DROPDOWNS = [
  { 
    label: 'About us', 
    items: [
      { label: 'Overview', href: '/about' },
      { label: 'Mission & Vision', href: '/about/mission' },
      { label: 'Leadership', href: '/about/leadership' },
      { label: 'History', href: '/about/history' }
    ]
  },
  { 
    label: 'Academics', 
    items: [
      { label: 'Undergraduate', href: '/academics/undergraduate' },
      { label: 'Postgraduate', href: '/academics/postgraduate' },
      { label: 'Research Programs', href: '/academics/research' },
      { label: 'Faculties', href: '/academics/faculties' }
    ]
  },
  { 
    label: 'Admissions', 
    items: [
      { label: 'Apply Now', href: '/auth/signup' },
      { label: 'Requirements', href: '/admissions/requirements' },
      { label: 'Tuition & Fees', href: '/admissions/fees' },
      { label: 'FAQ', href: '/admissions/faq' }
    ]
  },
  { 
    label: 'Research and Collections', 
    items: [
      { label: 'Research Hub', href: '/research' },
      { label: 'Special Collections', href: '/research/collections' },
      { label: 'Open Access', href: '/research/open-access' }
    ]
  },
  { 
    label: 'Library', 
    items: [
      { label: 'Digital Library', href: '/library/digital' },
      { label: 'Physical Resources', href: '/library/physical' },
      { label: 'Study Spaces', href: '/library/spaces' }
    ]
  },
  { 
    label: 'Contact', 
    items: [
      { label: 'Support Center', href: '/contact/support' },
      { label: 'Department Directory', href: '/contact/directory' },
      { label: 'Visit Us', href: '/contact/visit' }
    ]
  },
];

export function GlobalNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, logout, isLoading } = useAuth();
  const { isOpen, toggle } = useSidebar();

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  const isApplicantPortal = isAuthenticated && (user?.role === 'applicant' || user?.role === 'freshapplicant');
  const isStudentPortal = isAuthenticated && user?.role === 'student';
  const isAdminPortal = isAuthenticated && user?.role === 'admissionofficer';
  const isRegistrarPortal = isAuthenticated && user?.role === 'registrar';
  const isLecturerPortal = isAuthenticated && user?.role === 'lecturer';
  const isIctPortal = isAuthenticated && user?.role === 'ictdirector';
  const isManagementPortal = isAuthenticated && ['hod', 'dean'].includes(user?.role || '');

  // Determine nav items based on role
  const getNavItems = () => {
    if (isLoading && !user) return [];
    if (!isAuthenticated) return LANDING_NAV_ITEMS;
    
    if (isApplicantPortal) return APPLICANT_NAV_ITEMS;
    if (isStudentPortal) return STUDENT_NAV_ITEMS;
    if (isAdminPortal) return ADMIN_NAV_ITEMS;
    if (isRegistrarPortal) return REGISTRAR_NAV_ITEMS;
    if (isLecturerPortal) return LECTURER_NAV_ITEMS;
    if (isIctPortal) return ICT_NAV_ITEMS;
    if (isManagementPortal) return [{ label: 'Dashboard', href: `/${user?.role}/dashboard`, icon: LayoutDashboard }];
    
    return LANDING_NAV_ITEMS;
  };

  const navItems = getNavItems();

  return (
    <>
      {/* Top Header - "Only the name of the authenticated user" */}
      <header 
        className="fixed top-0 right-0 h-16 bg-slate-50/90 backdrop-blur-md border-b border-slate-200 z-[90] transition-all duration-300 ease-in-out flex items-center px-8"
        style={{ left: "var(--sidebar-width)" }}
      >
        {/* Left Spacer - keeps balance */}
        <div className="flex-1" />

        {/* Center Navigation - New Items with Dropdowns */}
        <div className={cn(
          "hidden lg:flex items-center shrink-0 transition-all duration-300 ease-in-out",
          isOpen ? "gap-4 xl:gap-6" : "gap-6 xl:gap-8"
        )}>
          {MAIN_NAV_DROPDOWNS.map((item) => (
            <DropdownMenu key={item.label}>
              <DropdownMenuTrigger className={cn(
                "font-black uppercase transition-all duration-200 flex items-center gap-1.5 focus:outline-none group whitespace-nowrap",
                "text-slate-500 hover:text-slate-900",
                isOpen 
                  ? "text-[9px] tracking-[0.1em]" 
                  : "text-[10px] tracking-[0.2em]"
              )}>
                {item.label}
                <ChevronDown size={isOpen ? 8 : 10} className="text-slate-400 group-hover:text-slate-600 transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="min-w-[200px] p-2 bg-white/80 backdrop-blur-xl border-slate-200 rounded-2xl shadow-2xl shadow-slate-200/50">
                {item.items.map((subItem) => (
                  <DropdownMenuItem key={subItem.label} asChild>
                    <Link 
                      href={subItem.href}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-purple-600 hover:bg-purple-50/50 transition-colors cursor-pointer"
                    >
                      {subItem.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
        </div>

        {/* Right Side - Apply Button or User Profile */}
        <div className="flex-1 flex justify-end items-center gap-4 shrink-0">
          {isLoading ? null : (isAuthenticated ? (
            <div className="flex items-center gap-4 animate-in fade-in slide-in-from-right-4 duration-500">
               <div className="flex flex-col items-end">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-700">{user?.username}</span>
                  <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center border border-purple-100">
                    <User size={14} className="text-[#6b21a8]" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <Link href="/auth/signup">
              <Button className="bg-[#d9251b] hover:bg-red-800 text-white rounded-full px-6 h-9 font-black text-[11px] uppercase tracking-widest shadow-lg shadow-red-500/10">
                Apply Now
              </Button>
            </Link>
          ))}
        </div>
      </header>

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed left-0 top-0 h-full bg-slate-100 border-r border-slate-200 z-[100] transition-all duration-300 ease-in-out shadow-2xl flex flex-col justify-between",
          isOpen ? "w-[280px]" : "w-[80px]"
        )}
      >
        <div>
          {/* Logo Area */}
          <div className="flex items-center h-16 px-4 border-b border-slate-200/50 relative bg-slate-100/50">
            <Link href="/" className="flex items-center gap-3 shrink-0">
              <Image
                src="/e-portal/images/logo new.png"
                alt="PCU Logo"
                width={35}
                height={35}
                className="object-contain"
              />
              <span className={cn(
                "font-black text-sm text-slate-800 tracking-tighter uppercase transition-all duration-300 overflow-hidden",
                isOpen ? "opacity-100 w-auto ml-2" : "opacity-0 w-0"
              )}>
                PCU Portal
              </span>
            </Link>
            
            <button 
              onClick={toggle}
              className={cn(
                "absolute top-1/2 -translate-y-1/2 bg-white border border-slate-100 shadow-lg rounded-xl p-1.5 text-slate-500 hover:text-purple-600 hover:border-purple-100 transition-all z-[110]",
                isOpen ? "right-4" : "-right-4"
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
                    isOpen ? "px-4 py-2 rounded-xl" : "justify-center py-2 rounded-2xl mx-1",
                    !isActive && "text-slate-500 hover:text-slate-900"
                  )}
                >
                  <div className={cn(
                    "flex items-center justify-center transition-all duration-300 shrink-0",
                    "w-11 h-11 rounded-xl border shadow-sm",
                    isActive 
                      ? "bg-[#6b21a8] border-[#6b21a8] text-white shadow-[#6b21a8]/20" 
                      : "bg-white border-slate-100 text-slate-500 group-hover:border-purple-200 group-hover:scale-105"
                  )}>
                    <item.icon size={20} className={cn(isActive && "animate-pulse")} />
                  </div>
                  
                  <span className={cn(
                    "font-bold text-[12px] tracking-tight whitespace-nowrap transition-all duration-300 overflow-hidden",
                    isOpen ? "opacity-100 w-auto ml-4" : "opacity-0 w-0",
                    isActive ? "text-[#6b21a8]" : "text-slate-500 group-hover:text-slate-900"
                  )}>
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
              className={cn(
                "w-full flex items-center transition-all duration-200 text-slate-500 hover:text-red-600 rounded-xl group relative",
                isOpen ? "px-4 py-2" : "justify-center py-2"
              )}
            >
              <div className={cn(
                "flex items-center justify-center transition-all duration-300 shrink-0",
                "w-11 h-11 rounded-xl border border-slate-100 bg-white shadow-sm",
                "group-hover:border-red-200 group-hover:bg-red-50 group-hover:scale-105 group-hover:text-red-600"
              )}>
                <LogOut size={20} />
              </div>
              <span className={cn(
                "font-bold text-[12px] tracking-tight ml-4 transition-all duration-300 overflow-hidden",
                isOpen ? "opacity-100 w-auto" : "opacity-0 w-0"
              )}>
                Sign Out
              </span>
              {!isOpen && (
                <div className="absolute left-full ml-6 px-3 py-1 bg-slate-800 text-white text-xs rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
                  Sign Out
                </div>
              )}
            </button>
          )}

          <div className="px-1">
            <div className={cn(
               "bg-slate-200/50 rounded-2xl p-4 transition-all duration-300 border border-slate-200",
               isOpen ? "opacity-100" : "sr-only opacity-0 pointer-events-none"
            )}>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
