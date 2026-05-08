"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient, ApplicantStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Building,
  DollarSign,
  Loader2,
} from "lucide-react";

function PaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type") as
    | "acceptance_fee"
    | "tuition"
    | null;
  const { user, isAuthenticated, logout } = useAuth();
  const [status, setStatus] = useState<ApplicantStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [isUpgraded, setIsUpgraded] = useState(false);
  const [initialPassword, setInitialPassword] = useState("");

  // Payment selection
  const [selectedType, setSelectedType] = useState<
    "acceptance_fee" | "tuition" | null
  >(typeParam);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/auth/login");
      return;
    }

    const loadStatus = async () => {
      try {
        const response = await ApiClient.getApplicantStatus();
        setStatus(response.applicant);

        // Auto-select type based on status icon if not already set from query
        if (!selectedType) {
          if (!response.applicant.has_paid_acceptance_fee) {
            setSelectedType("acceptance_fee");
          } else if (!response.applicant.has_paid_tuition) {
            setSelectedType("tuition");
          }
        }
      } catch (err) {
        console.error("Error loading status:", err);
        setError("Failed to load application status");
      } finally {
        setLoading(false);
      }
    };

    loadStatus();
  }, [isAuthenticated, router, selectedType]);

  const handlePayment = async () => {
    if (!selectedType || !status) return;

    setProcessing(true);
    setError(null);

    try {
      let amount = 0;
      if (selectedType === "acceptance_fee") {
        amount = 50000;
      } else {
        amount = 150000;
      }

      const programFees: Record<
        number,
        { acceptance: number; tuition: number }
      > = {
        1: { acceptance: 20000, tuition: 177000 },
        2: { acceptance: 25000, tuition: 250000 },
        3: { acceptance: 20000, tuition: 180000 },
        4: { acceptance: 30000, tuition: 350000 },
        5: { acceptance: 25000, tuition: 220000 },
      };

      const fees = programFees[status.program_id] || {
        acceptance: 50000,
        tuition: 150000,
      };
      const paymentAmount =
        selectedType === "acceptance_fee" ? fees.acceptance : fees.tuition;

      // Simulate network delay for "processing payment"
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const response = await ApiClient.processPayment(
        selectedType,
        paymentAmount,
        "online",
        "completed",
        status.program_name,
        status.program_id,
      );

      setTransactionId(response.receipt_no);
      if (response.upgraded_to_student) {
        setIsUpgraded(true);
        if (response.initial_password) {
          setInitialPassword(response.initial_password);
        }
      }
      setSuccess(true);
    } catch (err: any) {
      console.error("Payment error:", err);
      setError(err.message || "Payment failed. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">
            Initializing secure payment...
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Payment Successful!</CardTitle>
            <CardDescription>
              Your {selectedType?.replace("_", " ")} has been processed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-lg text-left">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Transaction ID:</span>
                <span className="font-mono font-medium">{transactionId}</span>
              </div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Status:</span>
                <span className="text-green-600 font-medium">Completed</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Date:</span>
                <span className="font-medium">
                  {new Date().toLocaleDateString()}
                </span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              A copy of your receipt has been sent to your email. You can also
              download it from your dashboard.
            </p>
            {isUpgraded && (
              <div className="mt-6 bg-primary/10 border-l-4 border-primary p-4 rounded-r-lg">
                <h4 className="font-bold text-primary mb-1 text-lg">
                  Congratulations!
                </h4>
                <p className="text-sm">
                  You have been fully enrolled and upgraded to a{" "}
                  <strong>Student Account</strong>!
                </p>
                <p className="text-sm mt-2">
                  Please sign in to the Student Portal.
                  <br />
                  <strong>Username:</strong> Your registered email
                  <br />
                  <strong>Password:</strong>{" "}
                  <span className="font-mono bg-muted px-1 py-0.5 rounded">
                    {initialPassword}
                  </span>
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              onClick={async () => {
                if (isUpgraded) {
                  await logout();
                  router.push("/student/login");
                } else {
                  router.push("/applicant/dashboard");
                }
              }}
            >
              {isUpgraded ? "Sign In to Student Portal" : "Return to Dashboard"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="max-w-5xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-5 gap-8">
          {/* Left Side: Detail & Selection */}
          <div className="md:col-span-3 space-y-8">
            <div className="space-y-2">
              <h1 className="text-4xl font-extrabold tracking-tight">
                Secure Checkout
              </h1>
              <p className="text-lg text-muted-foreground">
                Finalize your admission by completing the required payments.
              </p>
            </div>

            <div className="space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-2 border-b-2 border-primary/20 pb-2">
                <DollarSign className="h-6 w-6 text-primary" />
                Select Payment Item
              </h3>

              <div className="grid gap-4">
                <button
                  onClick={() => setSelectedType("acceptance_fee")}
                  disabled={status?.has_paid_acceptance_fee}
                  className={`group relative flex items-center justify-between p-6 rounded-2xl border-2 transition-all duration-300 ${
                    selectedType === "acceptance_fee"
                      ? "border-primary bg-primary/[0.03] ring-2 ring-primary/20 shadow-lg translate-x-1"
                      : "border-border hover:border-primary/40 hover:bg-primary/[0.01]"
                  } ${status?.has_paid_acceptance_fee ? "opacity-60 cursor-not-allowed bg-muted/30" : ""}`}
                >
                  <div className="flex items-center gap-5 text-left">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${selectedType === "acceptance_fee" ? "bg-primary text-white" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"}`}
                    >
                      <Building className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-bold text-lg">Acceptance Fee</p>
                      <p className="text-sm text-muted-foreground">
                        Secure your spot in the university
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {status?.has_paid_acceptance_fee ? (
                      <Badge
                        variant="secondary"
                        className="bg-green-100 text-green-800 border-green-200"
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Paid
                      </Badge>
                    ) : (
                      <p className="font-black text-xl text-primary">
                        {status?.program_id === 4
                          ? "₦30,000"
                          : status?.program_id === 2
                            ? "₦25,000"
                            : "₦20,000"}
                      </p>
                    )}
                  </div>
                </button>

                <button
                  onClick={() => setSelectedType("tuition")}
                  disabled={
                    status?.has_paid_tuition || !status?.has_paid_acceptance_fee
                  }
                  className={`group relative flex items-center justify-between p-6 rounded-2xl border-2 transition-all duration-300 ${
                    selectedType === "tuition"
                      ? "border-primary bg-primary/[0.03] ring-2 ring-primary/20 shadow-lg translate-x-1"
                      : "border-border hover:border-primary/40 hover:bg-primary/[0.01]"
                  } ${status?.has_paid_tuition || !status?.has_paid_acceptance_fee ? "opacity-60 cursor-not-allowed bg-muted/30" : ""}`}
                >
                  <div className="flex items-center gap-5 text-left">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${selectedType === "tuition" ? "bg-primary text-white" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"}`}
                    >
                      <CreditCard className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-bold text-lg">Tuition Fee</p>
                      <p className="text-sm text-muted-foreground">
                        Academic session tuition payment
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {status?.has_paid_tuition ? (
                      <Badge
                        variant="secondary"
                        className="bg-green-100 text-green-800 border-green-200"
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Paid
                      </Badge>
                    ) : !status?.has_paid_acceptance_fee ? (
                      <p className="text-sm text-muted-foreground italic flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded text-yellow-700">
                        <AlertCircle className="h-3 w-3" />
                        Pay acceptance first
                      </p>
                    ) : (
                      <p className="font-black text-xl text-primary">
                        {status?.program_id === 2 ? "₦250,000" : "₦177,000"}
                      </p>
                    )}
                  </div>
                </button>
              </div>
            </div>

            <div className="pt-8 border-t border-border">
              <h3 className="text-xl font-bold flex items-center gap-2 mb-6">
                <CreditCard className="h-6 w-6 text-primary" />
                Payment Method
              </h3>

              <div className="p-6 rounded-2xl border-2 border-primary bg-primary/5 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-5">
                  <div className="bg-white p-3 rounded-xl shadow-md border border-border">
                    <Image
                      src="https://checkout.paystack.com/assets/img/paystack_logo.png"
                      alt="Paystack"
                      width={100}
                      height={24}
                      className="h-5 object-contain"
                    />
                  </div>
                  <div>
                    <p className="font-bold text-lg">Paystack Secure Payment</p>
                    <p className="text-sm text-muted-foreground font-medium">
                      Cards, Bank Transfer, USSD, Apple Pay
                    </p>
                  </div>
                </div>
                <div className="bg-primary text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-lg shadow-primary/30">
                  Recommended
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Order Summary */}
          <div className="md:col-span-2">
            <Card className="sticky top-24 shadow-2xl border-primary/10 overflow-hidden bg-card">
              <div className="h-2 bg-gradient-to-r from-primary to-primary/40" />
              <CardHeader className="bg-muted/30">
                <CardTitle className="text-xl">Checkout Summary</CardTitle>
                <CardDescription>Verify your details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">
                      Applicant
                    </p>
                    <p className="text-sm font-bold truncate">{user?.name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">
                      Program
                    </p>
                    <p className="text-sm font-bold truncate">
                      {status?.program_name}
                    </p>
                  </div>
                </div>

                <div className="pt-6 border-t border-border space-y-4">
                  <div className="flex justify-between items-center bg-muted/20 p-3 rounded-lg border border-border/50">
                    <span className="text-sm font-medium">
                      {selectedType
                        ? selectedType.replace("_", " ").toUpperCase()
                        : "NO SELECTION"}
                    </span>
                    <span className="font-black text-lg">
                      {selectedType === "acceptance_fee"
                        ? status?.program_id === 4
                          ? "₦30,000"
                          : status?.program_id === 2
                            ? "₦25,000"
                            : "₦20,000"
                        : selectedType === "tuition"
                          ? status?.program_id === 2
                            ? "₦250,000"
                            : "₦177,000"
                          : "₦0.00"}
                    </span>
                  </div>

                  <div className="flex justify-between text-xs px-1">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <span>Processing Fee</span>
                      <div className="bg-green-100 text-green-700 text-[8px] font-bold px-1 rounded">
                        FREE
                      </div>
                    </div>
                    <span className="font-bold">₦0.00</span>
                  </div>

                  <div className="flex justify-between items-center text-2xl font-black pt-4 border-t-2 border-dashed border-border px-1">
                    <span>Total</span>
                    <span className="text-primary">
                      {selectedType === "acceptance_fee"
                        ? status?.program_id === 4
                          ? "₦30,000"
                          : status?.program_id === 2
                            ? "₦25,000"
                            : "₦20,000"
                        : selectedType === "tuition"
                          ? status?.program_id === 2
                            ? "₦250,000"
                            : "₦177,000"
                          : "₦0.00"}
                    </span>
                  </div>
                </div>

                {error && (
                  <div className="p-4 rounded-xl bg-red-50 text-red-800 text-xs flex gap-3 border border-red-100 animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
                    <span className="leading-relaxed font-semibold">
                      {error}
                    </span>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex-col gap-4 pb-8">
                <Button
                  className="w-full h-14 text-lg font-black gap-3 shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100"
                  disabled={!selectedType || processing}
                  onClick={handlePayment}
                >
                  {processing ? (
                    <>
                      <Loader2 className="h-6 w-6 animate-spin" />
                      SECURELY PROCESSING...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-6 w-6" />
                      COMPLETE PAYMENT
                    </>
                  )}
                </Button>
                <div className="flex items-center justify-center gap-4 opacity-40">
                  <ShieldCheck className="h-6 w-6" />
                  <div className="h-4 w-[1px] bg-foreground" />
                  <p className="text-[8px] max-w-[120px] leading-tight font-medium uppercase tracking-tighter">
                    256-bit SSL encrypted & PCI DSS compliant
                  </p>
                </div>
              </CardFooter>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading payment portal...</p>
          </div>
        </div>
      }
    >
      <PaymentContent />
    </Suspense>
  );
}
