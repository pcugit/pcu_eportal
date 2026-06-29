"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { User, Mail, Phone, Loader2, Calendar } from "lucide-react";
import FirstLoginPasswordChange from "@/components/FirstLoginPasswordChange";
import {
  getSessionImageUrl,
  setSessionImageUrl,
} from "@/lib/sessionImageCache";

export default function StudentProfilePage() {
  const router = useRouter();
  const { user, student, isAuthenticated, isLoading } = useAuth();
  const [profileData, setProfileData] = useState<any>(null);
  const [passportUrl, setPassportUrl] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [showPasswordChange, setShowPasswordChange] = useState(false);

  // Guard for first login password change
  useEffect(() => {
    if (!isLoading && isAuthenticated && student?.is_first_login) {
      setShowPasswordChange(true);
    }
  }, [isLoading, isAuthenticated, student]);

  // Fetch student profile data
  useEffect(() => {
    const fetchProfile = async () => {
      if (!isAuthenticated || isLoading) return;
      try {
        setPageLoading(true);
        const data = await ApiClient.getStudentProfile();
        setProfileData(data);
      } catch (err) {
        console.error("Failed to load student profile:", err);
      } finally {
        setPageLoading(false);
      }
    };
    fetchProfile();
  }, [isAuthenticated, isLoading]);

  // Find passport document and fetch the image url
  const documents = profileData?.documents || [];
  const passportDoc = documents.find(
    (d: any) =>
      d.document_type?.toLowerCase().includes("passport") ||
      d.display_name?.toLowerCase().includes("passport"),
  );

  useEffect(() => {
    if (!passportDoc?.document_id) {
      setPassportUrl(null);
      return;
    }

    let active = true;
    const fetchPassport = async () => {
      try {
        const token = localStorage.getItem("auth_token") || "";
        const cacheKey = `student-passport:${user?.id ?? "current"}:${passportDoc.document_id}`;
        const cachedUrl = getSessionImageUrl(cacheKey);

        if (cachedUrl) {
          setPassportUrl(cachedUrl);
          return;
        }

        const baseUrl = ApiClient.getBaseUrl();
        const response = await fetch(
          `${baseUrl}/applicant/download-document/${passportDoc.document_id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setSessionImageUrl(cacheKey, url);
          if (active) setPassportUrl(url);
        }
      } catch (e) {
        console.error("Failed to fetch passport", e);
      }
    };
    fetchPassport();

    return () => {
      active = false;
    };
  }, [passportDoc?.document_id, user?.id]);

  if (isLoading || pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f3eee6]">
        <div className="text-center">
          <Loader2 className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#6b357d] mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f3eee6]">
        <div className="text-center bg-white p-8 rounded-2xl border border-[#e8dfd2] shadow-sm max-w-md">
          <p className="text-red-500 font-bold mb-4">Access Denied</p>
          <p className="text-slate-600 mb-6">Please log in to access your student profile page.</p>
          <button
            onClick={() => router.push("/student/login")}
            className="w-full bg-[#151515] hover:bg-[#2a2a2a] text-white py-3 rounded-xl font-bold transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (showPasswordChange) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#6b357d]/5 via-background to-amber-500/5 px-4">
        <FirstLoginPasswordChange
          onComplete={() => setShowPasswordChange(false)}
        />
      </div>
    );
  }

  const profile = profileData?.profile || {};
  const personalInfo = profileData?.personal_info || {};

  // Construct uppercase formatted name: SURNAME, FIRSTNAME MIDDLENAME
  const surname = personalInfo.last_name || personalInfo.surname || "";
  const firstName = personalInfo.first_name || "";
  const middleName = personalInfo.middle_name || "";
  const displayName = [surname, [firstName, middleName].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ")
    .toUpperCase();

  const infoFields = [
    { label: "Email", value: personalInfo.email || profile.email || "N/A" },
    { label: "First Name", value: personalInfo.first_name || "N/A" },
    { label: "Last Name", value: personalInfo.last_name || "N/A" },
    { label: "Middle Name", value: personalInfo.middle_name || "N/A" },
    { label: "Gender", value: personalInfo.gender || "N/A" },
    { label: "Date of Birth", value: personalInfo.date_of_birth || "N/A" },
    { label: "Place of Birth", value: personalInfo.place_of_birth || "N/A" },
    { label: "Marital Status", value: personalInfo.marital_status || "N/A" },
    { label: "Religion", value: personalInfo.religion || "N/A" },
    { label: "Blood Group", value: personalInfo.blood_group || "N/A" },
    { label: "Genotype", value: personalInfo.genotype || "N/A" },
    { label: "Phone Number", value: personalInfo.phone_number || profile.phone_number || "N/A" },
    { label: "Secondary Phone Number", value: personalInfo.secondary_phone_number || "N/A" },
    { label: "Nationality", value: personalInfo.nationality || "N/A" },
    { label: "State", value: personalInfo.state || "N/A" },
    { label: "Local Government Area", value: personalInfo.lga || "N/A" },
  ];

  return (
    <div className="min-h-screen bg-[#f3eee6] py-6">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Student Profile</h1>
        </div>

        <div className="grid grid-cols-1 gap-6 items-start lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* Left Column: Actions Sidebar */}
          <div className="space-y-4">
            <div className="bg-white border border-[#e8dfd2] rounded-2xl overflow-hidden shadow-sm">
              {/* Header Banner */}
              <div className="h-32 w-full relative">
                <img
                  src="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=800"
                  alt="Background"
                  className="w-full h-full object-cover grayscale opacity-60"
                />
                <div className="absolute inset-0 bg-[#6b357d]/10"></div>
              </div>

              <div className="px-5 pb-6 flex flex-col items-center">
                {/* Profile Image */}
                <div className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-sm -mt-14 z-10 bg-slate-100">
                  {passportUrl ? (
                    <img
                      src={passportUrl}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="h-14 w-14 text-slate-400" />
                    </div>
                  )}
                </div>

                {/* Name & ID */}
                <div className="mt-4 min-w-0 text-center space-y-1">
                  <h3 className="text-lg font-bold leading-snug text-slate-800 uppercase break-words">
                    {displayName || "N/A"}
                  </h3>
                  <p className="text-slate-500 text-xs tracking-wide font-mono font-medium break-words">
                    {profile.matric_number || "N/A"}
                  </p>
                  <div className="pt-2">
                    <Badge className="max-w-full whitespace-normal bg-[#c99b45] hover:bg-[#b58a3a] text-white border-0 px-3 py-1 rounded-full text-[10px] font-bold uppercase break-words">
                      {profile.program_name || "N/A"}
                    </Badge>
                  </div>
                </div>

                {/* Contact Info */}
                <div className="mt-5 w-full min-w-0 space-y-2 text-center text-slate-600 border-t border-slate-100 pt-4">
                  <p className="text-sm font-medium break-words flex items-center justify-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    {profile.email || "N/A"}
                  </p>
                  <p className="text-sm font-medium break-words flex items-center justify-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    {profile.phone_number || "N/A"}
                  </p>
                </div>

                {/* Portal Username */}
                <div className="mt-5 w-full pt-4 border-t border-slate-100 flex flex-col items-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Portal Username</span>
                  <span className="mt-1.5 text-sm font-bold font-mono text-[#5c4520] bg-[#ead6aa] px-3 py-1 rounded-lg border border-[#d5b875]">
                    {profile.username || user?.username || "N/A"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Main Form Data */}
          <div className="min-w-0 bg-white border border-[#e8dfd2] p-5 sm:p-6 shadow-sm rounded-2xl space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-3">
                Personal Information
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2 lg:grid-cols-3">
              {infoFields.map((field) => (
                <div key={field.label} className="space-y-1">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{field.label}</p>
                  <p className="text-sm font-medium text-slate-700 break-words">{field.value}</p>
                </div>
              ))}
            </div>

            {/* Full Address Row */}
            <div className="border-t border-slate-100 pt-4 space-y-1">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Address</p>
              <p className="text-sm font-medium text-slate-700 break-words leading-relaxed">
                {personalInfo.address || "N/A"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
