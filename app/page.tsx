"use client";

import { PortalNavbar } from "./components/PortalNavbar";
import AdmissionLoginPage from "./auth/login/page";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <PortalNavbar />
      <AdmissionLoginPage />
    </div>
  );
}
