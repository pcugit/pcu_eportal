"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { AlertCircle, X, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const {
    login,
    logout,
    isLoading,
    error,
    isAuthenticated,
    user,
    applicant,
    student,
    portalStatus,
    isPortalLoading,
  } = useAuth();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [localError, setLocalError] = useState("");
  const [showError, setShowError] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  // TEMPORARILY DISABLED — set back to `portalStatus?.locked` to re-enable
  const isPortalLocked = false; // portalStatus?.locked;
  const loadingConfig = isPortalLoading && false; // disabled alongside lock check

  // Show error from auth context (e.g., invalid credentials)
  useEffect(() => {
    if (error) {
      setLocalError(error);
      setShowError(true);
    }
  }, [error]);

  // clear any lingering errors on mount
  useEffect(() => {
    setShowError(false);
    setLocalError("");
  }, []);

  // Auto-hide error after 5 seconds
  useEffect(() => {
    if (showError) {
      const timer = setTimeout(() => {
        setShowError(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showError]);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const role = user.role;

    // Staff roles that don't belong here — deny access with a clear error
    const staffRoles = [
      "admissionofficer",
      "admin",
      "ictdirector",
      "lecturer",
      "deo",
      "hod",
      "dean",
      "registrar",
      "pgdean",
      "pgadmin",
    ];
    if (staffRoles.includes(role)) {
      setAccessDenied(true);
      setLocalError("Access denied.");
      setShowError(true);
      // Sign the user out so they are not stuck in a broken state
      logout();
      return;
    }

    // Full student — stay on this page to show the upgrade message
    if (role === "student") {
      return;
    }

    // Applicant or admitted → applicant dashboard
    router.replace("/applicant/dashboard");
  }, [isAuthenticated, user, applicant, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setShowError(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    setShowError(false);

    // Basic validation: allow username (no @) or email
    if (!formData.email) {
      setLocalError("Email or Username is required");
      setShowError(true);
      return;
    }
    if (!formData.password) {
      setLocalError("Password is required");
      setShowError(true);
      return;
    }

    try {
      await login(formData.email, formData.password, "applicant");
    } catch (err) {
      // Error is handled in the auth context
    }
  };

  const displayError = localError || error;

  if (isAuthenticated && user?.role === "student") {
    return (
      <div className="portal-login-root">
        <Card className="portal-login-card text-center">
          <CardHeader>
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-primary">
              Congratulations!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-lg">
              You have been admitted to{" "}
              <strong>{student?.program_name || "your program"}</strong>.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Your account has been upgraded to a Student profile. Please, sign
              in to your student portal to continue.
            </p>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button
              className="w-full bg-slate-900 text-white hover:bg-slate-800"
              onClick={async () => {
                await logout();
                router.push("/student/login");
              }}
            >
              Sign In to Student Portal
            </Button>
            <Button
              variant="outline"
              className="w-full border-[#6b357d] text-[#6b357d] hover:bg-[#6b357d]/5"
              onClick={() => {
                router.push("/applicant/dashboard");
              }}
            >
              Stay in Admission Portal
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="portal-login-root">
      {/* Toast Error Notification */}
      <div
        className={`fixed top-6 right-6 max-w-sm z-50 transition-all duration-500 ease-in-out transform ${
          showError && displayError
            ? "translate-y-0 opacity-100 scale-100"
            : "-translate-y-12 opacity-0 scale-95 pointer-events-none"
        }`}
      >
        <div className="bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-start gap-3 p-4">
            <div className="flex-shrink-0 mt-0.5">
              <div className="flex items-center justify-center h-6 w-6 rounded-full bg-red-400">
                <AlertCircle className="h-4 w-4" />
              </div>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">Error</p>
              <p className="text-sm mt-1 opacity-95">{displayError}</p>
            </div>
            <button
              onClick={() => setShowError(false)}
              className="flex-shrink-0 text-red-200 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* Animated progress bar */}
          {showError && (
            <div
              className="h-1 bg-red-400 opacity-50"
              style={{
                animation: "shrink 5s linear forwards",
                transformOrigin: "left",
              }}
            />
          )}
        </div>
        <style>{`
          @keyframes shrink {
            from {
              transform: scaleX(1);
            }
            to {
              transform: scaleX(0);
            }
          }
        `}</style>
      </div>

      <Card className="portal-login-card relative">
        {loadingConfig ? (
          <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          </div>
        ) : isPortalLocked ? (
          <div className="absolute inset-0 z-50 bg-card flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-700">
            <div className="mb-6 relative">
              <div className="absolute inset-0 bg-red-100 rounded-full animate-ping opacity-75"></div>
              <div className="relative bg-red-50 text-red-500 rounded-full h-24 w-24 flex items-center justify-center shadow-lg">
                <AlertCircle className="h-10 w-10" />
              </div>
            </div>
            <h2 className="text-3xl font-black text-foreground mb-4 tracking-tight">
              Portal Closed
            </h2>
            <p className="text-muted-foreground max-w-sm mx-auto leading-relaxed">
              We are sorry, but the admissions portal is currently closed. We
              are not accepting new logins or applications at this time. Please
              check back later!
            </p>
            <Button
              variant="outline"
              className="mt-8 shadow-sm rounded-xl font-semibold border-slate-200"
              onClick={() => router.push("/")}
            >
              Return to Home
            </Button>
          </div>
        ) : null}

        <CardHeader className="portal-login-header p-0">
          <div className="flex justify-center bg-white rounded-2xl p-1.5 shadow-md">
            <Image
              src="/e-portal/images/logo new.png"
              alt="University Logo"
              width={120}
              height={120}
              className="portal-login-logo"
            />
          </div>
          <CardTitle className="portal-login-title">Admissions Portal</CardTitle>
          <CardDescription className="portal-login-subtitle">
            Log in to your admission portal account
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <form noValidate onSubmit={handleSubmit} className="portal-login-form">
            <div className="portal-login-field">
              <Label htmlFor="email" className="portal-login-label">Email or Username</Label>
              <Input
                id="email"
                name="email"
                type="text"
                placeholder="Enter your email or surname"
                value={formData.email}
                onChange={handleChange}
                disabled={isLoading}
                className="portal-login-input"
              />
            </div>

            <div className="portal-login-field">
              <Label htmlFor="password" className="portal-login-label">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
                disabled={isLoading}
                className="portal-login-input"
              />
            </div>

            <Button
              type="submit"
              className="portal-login-btn"
              disabled={isLoading}
            >
              {isLoading ? "Logging in..." : "Log In"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm space-y-4">
            <div className="portal-login-subtitle">
              Don't have an account?{" "}
              <Link
                href="/auth/signup"
                className="portal-login-link font-medium hover:underline"
              >
                Create one
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
