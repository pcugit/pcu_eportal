import Image from "next/image";
import Link from "next/link";
import { Lock, UserRound } from "lucide-react";

export default function PtStudentsLoginPage() {
  return (
    <div className="portal-login-root">
      <div className="portal-login-card">
        <div className="portal-login-header">
          <div className="flex justify-center bg-white rounded-2xl p-1.5 shadow-md">
            <Image
              src="/e-portal/images/logo new.png"
              alt="PCU Logo"
              width={120}
              height={120}
              className="portal-login-logo"
            />
          </div>
          <div>
            <h1 className="portal-login-title">Part-Time Student Portal</h1>
            <p className="portal-login-subtitle">
              Precious Cornerstone University
            </p>
          </div>
        </div>

        <form className="portal-login-form">
          <div className="portal-login-field">
            <label className="portal-login-label">
                Matric Number
            </label>
            <div className="relative">
              <UserRound className="portal-login-input-icon absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Enter matric number"
                className="portal-login-input portal-login-icon-input w-full"
              />
            </div>
          </div>

          <div className="portal-login-field">
            <label className="portal-login-label">
                Password
            </label>
            <div className="relative">
              <Lock className="portal-login-input-icon absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <input
                type="password"
                placeholder="Enter password"
                className="portal-login-input portal-login-icon-input w-full"
              />
            </div>
          </div>

          <Link href="/ptstudents/dashboard" className="portal-login-btn text-center">
            Sign In
          </Link>
        </form>
      </div>
    </div>
  );
}
