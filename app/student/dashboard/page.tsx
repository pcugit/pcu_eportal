"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient, AdmissionLetterData, PaymentTransaction } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LogOut,
  BookOpen,
  User,
  GraduationCap,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  DollarSign,
  Download,
  Settings,
} from "lucide-react";

import FirstLoginPasswordChange from "@/components/FirstLoginPasswordChange";
import FsmsAdmissionLetter from "@/components/FsmsAdmissionLetter";

export default function StudentDashboard() {
  const router = useRouter();
  const { user, student, isAuthenticated, logout, isLoading } = useAuth();
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [regStatus, setRegStatus] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [applicantStatus, setApplicantStatus] = useState<any>(null);
  const [admissionLetter, setAdmissionLetter] =
    useState<AdmissionLetterData | null>(null);
  const [showLetter, setShowLetter] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<PaymentTransaction[]>(
    [],
  );
  const [downloading, setDownloading] = useState<string | null>(null);

  const fetchStatus = async () => {
    if (isAuthenticated && !student?.is_first_login) {
      try {
        setLoadingStatus(true);
        const data = await ApiClient.getStudentCourses("First"); // Check first semester by default
        setRegStatus(data.registration_status);
      } catch (err) {
        console.error("Error fetching reg status:", err);
      } finally {
        setLoadingStatus(false);
      }
    }
  };

  const fetchExtraData = async () => {
    if (!isAuthenticated) return;
    try {
      const statusRes = await ApiClient.getApplicantStatus();
      setApplicantStatus(statusRes.applicant);

      try {
        const letterResponse = await ApiClient.getAdmissionLetter();
        setAdmissionLetter(letterResponse);
      } catch (e) {}

      try {
        const pHistory = await ApiClient.getPaymentHistory();
        setPaymentHistory(pHistory.payment_history);
      } catch (e) {}
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated && student?.is_first_login) {
      setShowPasswordChange(true);
    }
  }, [isLoading, isAuthenticated, student]);

  useEffect(() => {
    fetchStatus();
    fetchExtraData();
  }, [isAuthenticated, student]);

  const handlePrintPDF = async () => {
    try {
      setPrintLoading(true);
      const pdfBlob = await ApiClient.printAdmissionLetterPDF();
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `admission_letter_${admissionLetter?.reference || "letter"}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error generating PDF:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setPrintLoading(false);
    }
  };

  const handleDownloadMedicalForm = async () => {
    try {
      setDownloading("medical_form");
      const blob = await ApiClient.downloadMedicalForm();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `medical_examination_form.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading medical form:", err);
      alert(
        err instanceof Error ? err.message : "Failed to download medical form",
      );
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadNotice = async () => {
    try {
      setDownloading("admission_notice");
      const blob = await ApiClient.downloadAdmissionNotice();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `pcu_admission_notice_2025.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading notice:", err);
      alert("Failed to download admission notice");
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadAffidavit = async () => {
    try {
      setDownloading("affidavit");
      const blob = await ApiClient.downloadAffidavitForm();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `pcu_affidavit_for_good_conduct.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading affidavit:", err);
      alert("Failed to download affidavit form");
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadReceipt = async (receipt_no: string, type: string) => {
    try {
      setDownloading(`receipt_${receipt_no}`);
      const blob = await ApiClient.downloadPaymentReceipt(receipt_no);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `receipt_${type}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading receipt:", err);
      alert("Failed to download receipt");
    } finally {
      setDownloading(null);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (showPasswordChange) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 px-4">
        <FirstLoginPasswordChange
          onComplete={() => setShowPasswordChange(false)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Welcome & Info */}
        <div className="grid md:grid-cols-4 gap-6">
          <Card className="md:col-span-2 overflow-hidden border-none shadow-lg bg-primary text-primary-foreground relative group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
              <GraduationCap className="w-24 h-24" />
            </div>
            <CardHeader className="relative z-10">
              <CardTitle className="text-2xl font-bold">
                Welcome, {user?.name}
              </CardTitle>
              <CardDescription className="text-primary-foreground/80 font-medium">
                Matric Number: {student?.matric_number}
              </CardDescription>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge
                  variant="secondary"
                  className="bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30 border-none px-3 py-1"
                >
                  {student?.current_level}
                </Badge>
                <Badge
                  variant="secondary"
                  className="bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30 border-none px-3 py-1"
                >
                  {student?.session}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-md border-primary/10 flex flex-col justify-center items-center text-center p-6 space-y-2">
            <div className="bg-blue-100 p-3 rounded-full mb-2">
              <BookOpen className="w-6 h-6 text-blue-600" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Current Level
            </p>
            <p className="text-xl font-bold">{student?.current_level}</p>
          </Card>

          <Card className="shadow-md border-primary/10 flex flex-col justify-center items-center text-center p-6 space-y-2">
            <div className="bg-green-100 p-3 rounded-full mb-2">
              <Calendar className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Session</p>
            <p className="text-xl font-bold">{student?.session}</p>
          </Card>
        </div>

        {/* Action Widgets */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Course Registration Widget */}
          <Card className="shadow-lg border-2 border-primary/5 hover:border-primary/20 transition-all group overflow-hidden">
            <div className="h-2 bg-primary w-full shadow-sm" />
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2 rounded-lg group-hover:bg-primary/20 transition-colors">
                  <BookOpen className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-lg">Course Registration</CardTitle>
              </div>
              <CardDescription>
                Register your courses for the current semester. Ensure you
                select all compulsory and core courses.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                variant={regStatus === "submitted" ? "outline" : "default"}
                className="w-full gap-2 font-bold py-6 text-lg hover:scale-[1.02] transition-transform shadow-lg"
                onClick={() => router.push("/student/registration")}
              >
                {regStatus === "submitted"
                  ? "View Registration"
                  : "Go to Registration"}
                {regStatus === "submitted" ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <BookOpen className="w-5 h-5" />
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Profile & Settings Widget */}
          <Card className="shadow-lg border-2 border-primary/5 hover:border-primary/20 transition-all group overflow-hidden">
            <div className="h-2 bg-secondary w-full shadow-sm" />
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="bg-secondary/10 p-2 rounded-lg group-hover:bg-secondary/20 transition-colors">
                  <User className="w-6 h-6 text-secondary-foreground" />
                </div>
                <CardTitle className="text-lg">Profile Information</CardTitle>
              </div>
              <CardDescription>
                View and update your student profile details and account
                settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors border-b">
                  <span className="text-sm font-medium text-muted-foreground">
                    Full Name
                  </span>
                  <span className="text-sm font-bold">{user?.name}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors border-b">
                  <span className="text-sm font-medium text-muted-foreground">
                    Portal Username
                  </span>
                  <span className="text-sm font-bold font-mono bg-muted p-1 px-2 rounded">
                    {user?.username || "N/A"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <span className="text-sm font-medium text-muted-foreground">
                    Email Address
                  </span>
                  <span className="text-sm font-bold">{user?.email}</span>
                </div>
                <Button variant="outline" className="w-full mt-4" disabled>
                  Edit Profile (Disabled)
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Admission Letter - From Applicant flow into Student dashboard */}
        <Card
          id="admission-documents"
          className="mb-8 overflow-hidden border-2 border-primary/20 shadow-xl mt-8"
        >
          <div className="bg-primary/5 p-6 border-b border-primary/10">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl text-primary">
                  Official Admission Documents
                </CardTitle>
                <CardDescription className="text-base mt-2">
                  Access and download your official enrollment documents
                  anytime.
                </CardDescription>
              </div>
            </div>
          </div>

          <CardContent className="p-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Admission Letter Download */}
              <div className="bg-background border rounded-xl p-5 hover:border-primary/50 transition-all group shadow-sm">
                <div className="bg-blue-50 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <FileText className="text-blue-600 h-6 w-6" />
                </div>
                <h4 className="font-bold text-lg mb-2">
                  Provisional Admission Letter
                </h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Your official letter of admission for your program.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setShowLetter(!showLetter)}
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    disabled={!admissionLetter}
                  >
                    {showLetter ? "Close Preview" : "Preview"}
                  </Button>
                  <Button
                    onClick={handlePrintPDF}
                    size="sm"
                    className="flex-1 gap-2"
                    disabled={printLoading || !admissionLetter}
                  >
                    <Download className="h-4 w-4" />
                    {printLoading ? "..." : "PDF"}
                  </Button>
                </div>
              </div>

              {/* Medical Form Download */}
              <div className="bg-background border rounded-xl p-5 hover:border-primary/50 transition-all group shadow-sm">
                <div className="bg-green-50 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <FileText className="text-green-600 h-6 w-6" />
                </div>
                <h4 className="font-bold text-lg mb-2">
                  Medical Examination Form
                </h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Print and take to a certified hospital for examination.
                </p>
                <Button
                  onClick={handleDownloadMedicalForm}
                  disabled={
                    downloading === "medical_form" ||
                    !applicantStatus?.has_paid_tuition
                  }
                  className="w-full gap-2"
                >
                  <Download className="h-4 w-4" />
                  {downloading === "medical_form"
                    ? "Downloading..."
                    : "Download PDF"}
                </Button>
              </div>

              {/* Additional Forms Download */}
              <div className="bg-background border rounded-xl p-5 hover:border-primary/50 transition-all group shadow-sm">
                <div className="bg-orange-50 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Settings className="text-orange-600 h-6 w-6" />
                </div>
                <h4 className="font-bold text-lg mb-2">Notice & Affidavit</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Official resumption notice and good conduct affidavit.
                </p>
                <div className="space-y-2">
                  <Button
                    onClick={handleDownloadNotice}
                    variant="outline"
                    size="sm"
                    disabled={downloading === "admission_notice"}
                    className="w-full gap-2 justify-start"
                  >
                    <Download className="h-4 w-4 text-orange-600" />
                    {downloading === "admission_notice"
                      ? "..."
                      : "Admission Notice"}
                  </Button>
                  <Button
                    onClick={handleDownloadAffidavit}
                    variant="outline"
                    size="sm"
                    disabled={downloading === "affidavit"}
                    className="w-full gap-2 justify-start"
                  >
                    <Download className="h-4 w-4 text-orange-600" />
                    {downloading === "affidavit" ? "..." : "Conduct Affidavit"}
                  </Button>
                </div>
              </div>

              {/* Receipts Section */}
              <div className="bg-background border rounded-xl p-5 hover:border-primary/50 transition-all group shadow-sm">
                <div className="bg-purple-50 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <DollarSign className="text-purple-600 h-6 w-6" />
                </div>
                <h4 className="font-bold text-lg mb-2">Payment Receipts</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Download official receipts for your completed payments.
                </p>
                <div className="space-y-2">
                  {paymentHistory.map((pt) => (
                    <div
                      key={pt.transaction_id}
                      className="flex items-center justify-between p-2 bg-muted/30 rounded-lg border text-sm"
                    >
                      <span className="capitalize">
                        {pt.payment_type.replace("_", " ")}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-primary hover:text-primary hover:bg-primary/10"
                        onClick={() =>
                          handleDownloadReceipt(pt.receipt_no, pt.payment_type)
                        }
                        disabled={downloading === `receipt_${pt.receipt_no}`}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Receipt
                      </Button>
                    </div>
                  ))}
                  {paymentHistory.length === 0 && (
                    <p className="text-xs text-center text-muted-foreground py-2 italic">
                      No payment records found.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {showLetter && (
              <div className="mt-8 border rounded-xl overflow-hidden shadow-inner bg-slate-50 p-8">
                <div className="bg-white p-12 shadow-2xl mx-auto max-w-[850px]">
                  {admissionLetter ? (
                    <FsmsAdmissionLetter {...admissionLetter} />
                  ) : (
                    <div className="text-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
                      <p className="text-muted-foreground mt-4">
                        Loading admission letter details...
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
