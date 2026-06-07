"use client";
import Image from "next/image";
import { useState } from "react";
import { ApiClient } from "@/lib/api";

const ROLE_REDIRECTS: Record<string, string> = {
  admin: "/e-portal/ict/dashboard",
  ictdirector: "/e-portal/ict/dashboard",
  admissionofficer: "/e-portal/admission_officer/dashboard",
  lecturer: "/e-portal/lecturer/dashboard",
  deo: "/e-portal/deo/dashboard",
  hod: "/e-portal/hod/dashboard",
  dean: "/e-portal/dean/dashboard",
  registrar: "/e-portal/registrar/dashboard",
  pgdean: "/e-portal/pgadmin/dashboard",
  pgadmin: "/e-portal/pgadmin/dashboard",
};

// Roles that must NOT use this portal
const APPLICANT_ROLES = ["applicant", "freshapplicant"];

export default function StaffLogin() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await ApiClient.login(form.email, form.password);
      const role: string = data?.user?.role ?? "";

      if (APPLICANT_ROLES.includes(role)) {
        // Do NOT store the token — deny access immediately
        setError("Access denied.");
        return;
      }
      if (role === "student") {
        setError("Access denied.");
        return;
      }
      if (!ROLE_REDIRECTS[role]) {
        setError("Access denied.");
        return;
      }

      ApiClient.setToken(data.token);
      localStorage.setItem("auth_user", JSON.stringify(data.user));
      // Use window.location.href so Next.js basePath is bypassed and we use absolute paths.
      window.location.href = ROLE_REDIRECTS[role];
    } catch (err: any) {
      setError(err.message || "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="staff-login-root">
      <div className="staff-login-card">
        <div className="portal-login-header">
          <div className="flex justify-center bg-white rounded-2xl p-1.5 shadow-md">
            <Image
              src="/e-portal/images/logo new.png"
              alt="University Logo"
              width={120}
              height={120}
              className="portal-login-logo"
            />
          </div>
          <div>
            <h1 className="portal-login-title">Staff Portal</h1>
            <p className="portal-login-subtitle">
              Precious Cornerstone University
            </p>
          </div>
        </div>

        <form noValidate onSubmit={handleSubmit} className="staff-login-form">
          <div className="sfield">
            <label htmlFor="staff-email">Email / Username</label>
            <input
              id="staff-email"
              type="text"
              autoComplete="username"
              placeholder="your@pcu.edu.ng"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div className="sfield">
            <label htmlFor="staff-password">Password</label>
            <input
              id="staff-password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>

          {error && <p className="staff-login-error">{error}</p>}

          <button type="submit" disabled={loading} className="staff-login-btn">
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>

      <style jsx>{`
        .staff-login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(
            135deg,
            #0f172a 0%,
            #1e3a5f 50%,
            #0f172a 100%
          );
          font-family: "Inter", sans-serif;
          padding: 1rem;
        }
        .staff-login-card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 1.25rem;
          padding: 2.5rem 2rem;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
        }
        .staff-login-header {
          text-align: center;
          margin-bottom: 2rem;
        }
        .staff-login-logo {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          color: #fff;
          font-size: 1.4rem;
          font-weight: 800;
          margin-bottom: 0.75rem;
          box-shadow: 0 0 30px rgba(139, 92, 246, 0.4);
        }
        .staff-login-title {
          color: #fff;
          font-size: 1.6rem;
          font-weight: 700;
          margin: 0 0 0.25rem;
        }
        .staff-login-subtitle {
          color: rgba(255, 255, 255, 0.45);
          font-size: 0.78rem;
          margin: 0;
        }
        .staff-login-form {
          display: flex;
          flex-direction: column;
          gap: 1.1rem;
        }
        .sfield {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .sfield label {
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.82rem;
          font-weight: 500;
        }
        .sfield input {
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 0.6rem;
          color: #fff;
          padding: 0.7rem 0.9rem;
          font-size: 0.95rem;
          outline: none;
          transition: border-color 0.2s;
        }
        .sfield input:focus {
          border-color: #3b82f6;
        }
        .sfield input::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }
        .staff-login-error {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 0.5rem;
          color: #fca5a5;
          font-size: 0.85rem;
          padding: 0.6rem 0.75rem;
          margin: 0;
        }
        .staff-login-btn {
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          border: none;
          border-radius: 0.7rem;
          color: #fff;
          cursor: pointer;
          font-size: 1rem;
          font-weight: 600;
          padding: 0.75rem;
          margin-top: 0.25rem;
          transition:
            opacity 0.2s,
            transform 0.15s;
        }
        .staff-login-btn:hover {
          opacity: 0.9;
          transform: translateY(-1px);
        }
        .staff-login-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }
        .staff-login-footer {
          text-align: center;
          margin-top: 1.5rem;
        }
        .staff-login-footer a {
          color: rgba(255, 255, 255, 0.4);
          font-size: 0.8rem;
          text-decoration: none;
        }
        .staff-login-footer a:hover {
          color: rgba(255, 255, 255, 0.7);
        }
      `}</style>
    </div>
  );
}
