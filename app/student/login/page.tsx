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
} from "@/components/ui/card";
import { AlertCircle, X, GraduationCap, ArrowLeft } from "lucide-react";

export default function StudentLoginPage() {
  const router = useRouter();
  const { login, isLoading, error, isAuthenticated, user } = useAuth();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [localError, setLocalError] = useState("");
  const [showError, setShowError] = useState(false);

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

    if (user.role === "student") {
      router.replace("/student/dashboard");
    } else if (user.role === "admitted") {
      // Admitted users (paid acceptance fee) access the limited student portal
      router.replace("/student/dashboard");
    } else if (user.role === "admin") {
      router.replace("/ict/dashboard");
    } else if (user.role === "applicant") {
      router.replace("/applicant/dashboard");
    }
  }, [isAuthenticated, user, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setShowError(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    setShowError(false);

    if (!formData.email) {
      setLocalError("Email is required");
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8fafc] p-4">
      {/* Toast Error Notification */}
      {showError && displayError && (
        <div
          className="fixed top-6 right-6 max-w-sm animate-in slide-in-from-top-2 fade-in duration-300 z-50"
        >
          <div className="bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg shadow-lg overflow-hidden border border-red-400/20">
            <div className="flex items-start gap-3 p-4">
              <div className="flex-shrink-0 mt-0.5">
                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-white/20">
                  <AlertCircle className="h-4 w-4" />
                </div>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">Authentication Error</p>
                <p className="text-sm mt-1 opacity-95">{displayError}</p>
              </div>
              <button
                onClick={() => setShowError(false)}
                className="flex-shrink-0 text-white/70 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div
              className="h-1 bg-white/30"
              style={{
                animation: "shrink 5s linear forwards",
                transformOrigin: "left",
              }}
            />
            <style jsx>{`
              @keyframes shrink {
                from { transform: scaleX(1); }
                to { transform: scaleX(0); }
              }
            `}</style>
          </div>
        </div>
      )}

      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center">
            <Link href="/" className="mb-8 hover:opacity-80 transition-opacity">
                <Image
                src="/e-portal/images/logo new.png"
                alt="University Logo"
                width={100}
                height={100}
                className="object-contain"
                />
            </Link>
          
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-[#3d2b3d]">Student Portal</h1>
            <p className="text-muted-foreground italic">Precious Cornerstone University</p>
          </div>
        </div>

        <Card className="border-none shadow-2xl bg-white/80 backdrop-blur-sm overflow-hidden">
          <div className="h-2 w-full bg-gradient-to-r from-[#3d2b3d] via-[#6b4f6b] to-[#4a3050]" />
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
            </div>
            <CardTitle className="text-xl">Welcome back</CardTitle>
            <CardDescription>
              Enter your email and password to access your dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold">Email Address</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Your registered email address"
                  className="h-11 border-slate-200 focus:border-[#3d2b3d] focus:ring-[#3d2b3d]/20 transition-all font-medium"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={isLoading}
                  required
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-semibold">Password</Label>
                  <Link 
                    href="/auth/forgot-password" 
                    className="text-xs text-[#3d2b3d] hover:underline font-medium"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="First time? Try your Surname (in lowercase)"
                  className="h-11 border-slate-200 focus:border-[#3d2b3d] focus:ring-[#3d2b3d]/20 transition-all font-medium"
                  value={formData.password}
                  onChange={handleChange}
                  disabled={isLoading}
                  required
                />
              </div>

              <Button 
                type="submit" 
                className="w-full h-11 text-base font-semibold shadow-lg shadow-[#3d2b3d]/20 hover:shadow-xl transition-all active:scale-[0.98]" 
                disabled={isLoading}
                style={{
                  background: "linear-gradient(90deg, #3d2b3d 0%, #5a3f5a 100%)"
                }}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Signing in...</span>
                  </div>
                ) : (
                  "Sign In to Portal"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
