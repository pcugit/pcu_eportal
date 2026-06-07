"use client";

import React, { useState, useEffect } from "react";
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
import { AlertCircle, X } from "lucide-react";

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

  // Clear any lingering errors on mount
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
      router.replace("/applicant/dashboard");
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
      setLocalError("Matric number is required");
      setShowError(true);
      return;
    }
    if (!formData.password) {
      setLocalError("Password is required");
      setShowError(true);
      return;
    }

    try {
      await login(formData.email, formData.password, "student");
    } catch (err: any) {
      const msg =
        err instanceof Error ? err.message : "Login failed. Please try again.";
      const responseData = err?.response;
      if (responseData?.locked_until) {
        const unlockTime = new Date(responseData.locked_until).toLocaleString();
        setLocalError(
          `Account locked due to too many failed attempts. Try again after ${unlockTime}.`,
        );
      } else {
        setLocalError(msg);
      }
      setShowError(true);
    }
  };

  const displayError = localError || error;

  return (
    <div className="portal-login-root">
      {/* Toast Error Notification */}
      {showError && displayError && (
        <div
          className="fixed top-6 right-6 max-w-sm animate-in slide-in-from-top-2 fade-in duration-300 z-50"
          style={{
            animation: "slideInDown 0.4s ease-out forwards",
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
            <div
              className="h-1 bg-red-400 opacity-50"
              style={{
                animation: "shrinkBar 5s linear forwards",
                transformOrigin: "left",
              }}
            />
          </div>
          <style>{`
            @keyframes shrinkBar {
              from {
                transform: scaleX(1);
              }
              to {
                transform: scaleX(0);
              }
            }
          `}</style>
        </div>
      )}

      <Card className="portal-login-card relative">
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
          <div>
            <CardTitle className="portal-login-title">
              Undergraduate Student Portal
            </CardTitle>
            <CardDescription className="portal-login-subtitle">
              Log in to your student portal account using your matric number.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <form
            noValidate
            onSubmit={handleSubmit}
            className="portal-login-form"
          >
            <div className="portal-login-field">
              <Label htmlFor="email" className="portal-login-label">
                Matric Number
              </Label>
              <Input
                id="email"
                name="email"
                type="text"
                placeholder="Enter your matric number"
                value={formData.email}
                onChange={handleChange}
                disabled={isLoading}
                className="portal-login-input"
              />
            </div>

            <div className="portal-login-field">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="portal-login-label">
                  Password
                </Label>
                {/*
                <Link
                  href="/auth/forgot-password"
                  className="text-xs text-foreground hover:underline font-medium"
                >
                  Forgot password?
                </Link>
                */}
              </div>
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
        </CardContent>
      </Card>
    </div>
  );
}
