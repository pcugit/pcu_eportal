"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { GlobalNav } from "@/components/GlobalNav";
import { Footer } from "@/components/Footer";
import NavBar from "./HomePage/NavBar";
import PcuFooter from "./HomePage/PcuFooter";
import { PortalNavbar } from "./components/PortalNavbar";

const PUBLIC_PATHS = [
  "/",
  "/auth/login",
  "/auth/signup",
  "/student/login",
  "/staff/login",
  "/about",
  "/academics",
  "/admissions",
  "/research",
  "/library",
  "/contact",
  "/postgraduate",
  "/part-time",
  "/news",
];

export function NavWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();

  const isPortalAuthPage =
    pathname === "/auth/login" ||
    pathname === "/auth/signup" ||
    pathname === "/staff/login" ||
    pathname === "/student/login" ||
    pathname === "/pgstudents/login" ||
    pathname === "/ptstudents/login";

  if (pathname === "/") {
    return <main className="min-h-screen">{children}</main>;
  }

  if (isPortalAuthPage) {
    return (
      <>
        <PortalNavbar />
        <main className="min-h-screen">{children}</main>
      </>
    );
  }

  if (pathname?.startsWith("/pgstudents") || pathname?.startsWith("/ptstudents")) {
    return <main className="min-h-screen">{children}</main>;
  }

  const isPublicPage =
    pathname &&
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // Always render the public layout for public pages
  if (isPublicPage) {
    return (
      <>
        <NavBar />
        <main className="min-h-screen flex flex-col">
          <div className="flex-grow">{children}</div>
        </main>
        <PcuFooter />
      </>
    );
  }

  // Don't render either sidebar until auth state is known
  if (isLoading) {
    return (
      <main className="min-h-screen flex flex-col">
        <div className="flex-grow">{children}</div>
      </main>
    );
  }

  // Unauthenticated on a protected page
  if (!isAuthenticated) {
    return (
      <>
        <NavBar />
        <main className="min-h-screen flex flex-col">
          <div className="flex-grow">{children}</div>
        </main>
        <PcuFooter />
      </>
    );
  }

  // Authenticated
  return (
    <>
      <GlobalNav />
      <main className="transition-all duration-300 ease-in-out pl-[var(--sidebar-width)] min-h-screen flex flex-col">
        <div className="flex-grow">{children}</div>
        <Footer />
      </main>
    </>
  );
}
