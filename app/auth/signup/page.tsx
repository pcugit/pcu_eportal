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
import { AlertCircle, X } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const { signup, isLoading, error, isAuthenticated, portalStatus, isPortalLoading } = useAuth();
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone_number: "",
  });
  const [localError, setLocalError] = useState("");
  const [showError, setShowError] = useState(false);

  const isPortalLocked = portalStatus?.locked;
  const loadingConfig = isPortalLoading;

  // Valid email providers
  const validEmailProviders = [
    "gmail.com",
    "yahoo.com",
    "outlook.com",
    "hotmail.com",
    "icloud.com",
    "mail.com",
    "protonmail.com",
    "zoho.com",
    "aol.com",
    "pcu.edu.ng",
  ];

  useEffect(() => {
    if (error) {
      setLocalError(error);
      setShowError(true);
    }
  }, [error]);

  useEffect(() => {
    if (showError) {
      const timer = setTimeout(() => {
        setShowError(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showError]);

  // Redirect if already authenticated
  if (isAuthenticated) {
    router.replace("/applicant/dashboard");
  }


  useEffect(() => {
    setShowError(false);
    setLocalError("");
  }, []);


  useEffect(() => {
    if (showError) {
      const timer = setTimeout(() => {
        setShowError(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showError]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setShowError(false);
  };

  const isValidEmailProvider = (email: string): boolean => {
    const emailDomain = email.split("@")[1]?.toLowerCase();
    return validEmailProviders.includes(emailDomain);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    setShowError(false);

    // Validation
    if (!formData.first_name.trim()) {
      setLocalError("First name is required");
      setShowError(true);
      return;
    }
    if (!formData.last_name.trim()) {
      setLocalError("Surname is required");
      setShowError(true);
      return;
    }
    if (!formData.email.includes("@")) {
      setLocalError("Valid email is required");
      setShowError(true);
      return;
    }
    if (!isValidEmailProvider(formData.email)) {
      setLocalError(
        "Please use a valid email provider (Gmail, Yahoo, Outlook, Hotmail, iCloud, etc.)",
      );
      setShowError(true);
      return;
    }
    if (formData.password.length < 6) {
      setLocalError("Password must be at least 6 characters");
      setShowError(true);
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setLocalError("Passwords do not match");
      setShowError(true);
      return;
    }
    if (!formData.phone_number.trim()) {
      setLocalError("Phone number is required");
      setShowError(true);
      return;
    }

    try {
      await signup(
        formData.first_name,
        formData.last_name,
        formData.email,
        formData.password,
        formData.phone_number,
      );
      router.replace("/applicant/dashboard");
    } catch (err) {
      // Error is already set in the auth context
    }
  };

  const displayError = localError || error;

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

      <div className="w-full max-w-md">
        <Link href="/" className="inline-block mb-8">
          <Button variant="ghost">← Back</Button>
        </Link>
        <Card className="w-full relative overflow-hidden">
          {loadingConfig ? (
            <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
            </div>
          ) : isPortalLocked ? (
            <div className="absolute inset-0 z-50 bg-white flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-700">
              <div className="mb-6 relative">
                <div className="absolute inset-0 bg-red-100 rounded-full animate-ping opacity-75"></div>
                <div className="relative bg-red-50 text-red-500 rounded-full h-24 w-24 flex items-center justify-center shadow-lg">
                  <AlertCircle className="h-10 w-10" />
                </div>
              </div>
              <h2 className="text-3xl font-black text-slate-800 mb-4 tracking-tight">Portal Closed</h2>
              <p className="text-slate-500 max-w-sm mx-auto leading-relaxed">
                We are sorry, but the admissions portal is currently closed. We are not accepting new logins or applications at this time. Please check back later!
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
            <CardTitle className="text-2xl">Create Account</CardTitle>
            <CardDescription>
              Join the admission portal to start your application
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name</Label>
                  <Input
                    id="first_name"
                    name="first_name"
                    placeholder="John"
                    value={formData.first_name}
                    onChange={handleChange}
                    disabled={isLoading}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last name</Label>
                  <Input
                    id="last_name"
                    name="last_name"
                    placeholder="Doe"
                    value={formData.last_name}
                    onChange={handleChange}
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone_number">Phone Number</Label>
                <Input
                  id="phone_number"
                  name="phone_number"
                  placeholder="Enter your phone number"
                  value={formData.phone_number}
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
                  placeholder="Enter a password (min. 6 characters)"
                  value={formData.password}
                  onChange={handleChange}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  disabled={isLoading}
                />
              </div>

              <Button type="submit" className="w-full" disabled={isLoading} style={{
  background: "linear-gradient(90deg, #3d2b3d 0%, #5a3f5a 40%, #6b4f6b 70%, #4a3050 100%)"
}}>
                {isLoading ? "Creating Account..." : "Create Account"}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">
                Already have an account?{" "}
              </span>
              <Link
                href="/auth/login"
                className="text-primary font-medium hover:underline"
              >
                Log in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
