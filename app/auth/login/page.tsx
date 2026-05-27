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
    ];
    if (staffRoles.includes(role)) {
      setAccessDenied(true);
      setLocalError("Access denied.");
      setShowError(true);
      // Sign the user out so they are not stuck in a broken state
      logout();
      return;
    }

    // Admitted student — stay on this page to show the upgrade message
    if (role === "student") {
      return;
    }

    // Applicant → dashboard
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
      await login(formData.email, formData.password);
    } catch (err) {
      // Error is handled in the auth context
    }
  };

  const displayError = localError || error;

  if (isAuthenticated && user?.role === "student") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-primary/20 shadow-xl text-center">
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
          <CardFooter>
            <Button
              className="w-full"
              onClick={async () => {
                await logout();
                router.push("/student/login");
              }}
            >
              Sign In to Student Portal
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {/* Toast Error Notification */}
      {showError && displayError && (
        <div
          className="fixed top-6 right-6 max-w-sm animate-in slide-in-from-top-2 fade-in duration-300 z-50"
          style={{
            animation: showError
              ? "slideInDown 0.4s ease-out forwards"
              : "slideOutUp 0.4s ease-out forwards",
          }}
        >
          <style>{`
            @keyframes slideInDown {
              from {
                opacity: 0;
                transform: translateY(-20px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            @keyframes slideOutUp {
              from {
                opacity: 1;
                transform: translateY(0);
              }
              to {
                opacity: 0;
                transform: translateY(-20px);
              }
            }
          `}</style>
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
            <div
              className="h-1 bg-red-400 opacity-50"
              style={{
                animation: "slideOutLeft 5s linear forwards",
                transformOrigin: "left",
              }}
            />
          </div>
        </div>
      )}

      <Card className="w-full max-w-md relative overflow-hidden">
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

        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <Image
              src="/e-portal/images/logo new.png"
              alt="University Logo"
              width={120}
              height={120}
              className="object-contain"
            />
          </div>
          <CardTitle className="text-2xl">Welcome Back</CardTitle>
          <CardDescription>
            Log in to your admission portal account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email or Username</Label>
              <Input
                id="email"
                name="email"
                type="text"
                placeholder="Enter your email or surname"
                value={formData.email}
                onChange={handleChange}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
                disabled={isLoading}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              style={{
                background:
                  "linear-gradient(90deg, #3d2b3d 0%, #5a3f5a 40%, #6b4f6b 70%, #4a3050 100%)",
              }}
            >
              {isLoading ? "Logging in..." : "Log In"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm space-y-4">
            <div className="text-muted-foreground">
              Don't have an account?{" "}
              <Link
                href="/auth/signup"
                className="text-primary font-medium hover:underline"
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
