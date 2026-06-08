"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Download,
  Upload,
  Phone,
  Mail,
  MapPin,
  User,
  ShieldCheck,
  Calendar,
  Briefcase,
  Heart,
  Fingerprint,
  Globe,
  Map,
} from "lucide-react";
import {
  getProfileTemplate,
  ProfileSection,
  ProfileField,
} from "@/lib/profileTemplates";
import CourseRecommendationSection from "@/components/CourseRecommendationSection";

interface ApplicantProfileProps {
  applicant: any;
  form: any;
  documents: any[];
  acceptanceFeeData?: { amount: number; feeName: string; paid: boolean } | null;
  program_type_id?: number; // NEW: Determines which profile template to use
}

export default function ApplicantProfile({
  applicant,
  form,
  documents,
  acceptanceFeeData,
  program_type_id = 1,
}: ApplicantProfileProps) {
  const router = useRouter();
  const [passportUrl, setPassportUrl] = React.useState<string | null>(null);
  const [isProcessingRecommendation, setIsProcessingRecommendation] =
    React.useState(false);

  // Get the profile template for this program type
  const profileTemplate = React.useMemo(
    () => getProfileTemplate(program_type_id),
    [program_type_id],
  );

  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/e-portal/api";

  /**
   * Handle accepting the recommended course
   */
  const handleAcceptRecommendation = async () => {
    setIsProcessingRecommendation(true);
    try {
      const token = localStorage.getItem("auth_token");

      const response = await fetch(
        `${apiBaseUrl}/applicant/accept-recommended-course`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            applicant_id: applicant?.id || applicant?.uuid,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to accept recommendation");
      }

      // Show success message and reload
      alert(data.message || "Course recommendation accepted successfully");
      window.location.reload();
    } catch (error) {
      console.error("Error accepting recommendation:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to accept recommendation",
      );
    } finally {
      setIsProcessingRecommendation(false);
    }
  };

  /**
   * Handle recommending an alternative course
   */
  const handleRecommendAlternativeCourse = async (
    courseId: number,
    courseName: string,
  ) => {
    setIsProcessingRecommendation(true);
    try {
      const token = localStorage.getItem("auth_token");

      const response = await fetch(
        `${apiBaseUrl}/applicant/recommend-alternative-course`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            applicant_id: applicant?.id || applicant?.uuid,
            alternative_course: courseName,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to submit alternative recommendation",
        );
      }

      // Show success message and reload
      alert(data.message || "Alternative course recommended successfully");
      window.location.reload();
    } catch (error) {
      console.error("Error recommending alternative:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to recommend alternative course",
      );
    } finally {
      setIsProcessingRecommendation(false);
    }
  };

  /**
   * Handle rejecting the recommended course
   */
  const handleRejectRecommendation = async () => {
    const confirmed = window.confirm(
      "Rejecting this course recommendation will end your application. Continue?",
    );
    if (!confirmed) return;

    setIsProcessingRecommendation(true);
    try {
      const token = localStorage.getItem("auth_token");

      const response = await fetch(
        `${apiBaseUrl}/applicant/reject-recommended-course`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            applicant_id: applicant?.id || applicant?.uuid,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to reject recommendation");
      }

      alert(data.message || "Course recommendation rejected");
      window.location.reload();
    } catch (error) {
      console.error("Error rejecting recommendation:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to reject recommendation",
      );
    } finally {
      setIsProcessingRecommendation(false);
    }
  };

  // Find passport document
  const passportDoc = documents.find(
    (d) =>
      d.document_type?.toLowerCase().includes("passport") ||
      d.display_name?.toLowerCase().includes("passport"),
  );

  // Fetch passport image with auth
  React.useEffect(() => {
    if (passportDoc?.document_id) {
      const fetchPassport = async () => {
        try {
          const token = localStorage.getItem("auth_token");
          const baseUrl =
            process.env.NEXT_PUBLIC_API_URL ||
            "http://localhost:5000/e-portal/api";
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
            setPassportUrl(url);
          }
        } catch (e) {
          console.error("Failed to fetch passport", e);
        }
      };
      fetchPassport();
    }

    return () => {
      if (passportUrl) URL.revokeObjectURL(passportUrl);
    };
  }, [passportDoc?.document_id]);

  // Build formatted name: SURNAME, FIRSTNAME MIDDLENAME
  const formatName = () => {
    const surname = form?.surname || form?.last_name;
    const firstName = form?.first_name;
    const middleName = form?.middle_name;
    if (surname && firstName) {
      const rest = [firstName, middleName].filter(Boolean).join(" ");
      return `${surname}, ${rest}`;
    }
    // fallback: use full_name or applicant user_name
    return form?.full_name || applicant?.user_name || "";
  };
  const displayName = formatName().toUpperCase();
  const detailTextClass =
    "min-w-0 break-words [overflow-wrap:anywhere] text-sm leading-relaxed text-slate-600";
  const detailGridClass =
    "grid grid-cols-1 gap-x-8 gap-y-4 border-b border-slate-100 pb-5 md:grid-cols-2 xl:grid-cols-3";
  const sectionGridClass =
    "grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3";

  // Parse O'Level if it's a string
  let olevelResults = [];
  if (form?.olevel_results) {
    try {
      olevelResults =
        typeof form.olevel_results === "string"
          ? JSON.parse(form.olevel_results)
          : form.olevel_results;
    } catch (e) {
      console.error("Failed to parse O'Level results", e);
    }
  }

  const renderOlevelCard = (exam: any, index: number) => (
    <div
      key={index}
      className="bg-white border border-slate-200 p-4 sm:p-5 space-y-4 shadow-sm"
    >
      <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-2">
        <h4 className="font-bold text-[#6b357d]">Sitting {index + 1}</h4>
        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold uppercase tracking-widest">
          {exam.name || "WAEC"}
        </span>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-600 break-words [overflow-wrap:anywhere]">
          Name: {exam.name || "WAEC"}
        </p>
        <p className="text-sm font-medium text-slate-600 break-words [overflow-wrap:anywhere]">
          Number: {exam.number}
        </p>
        <p className="text-sm font-medium text-slate-600 break-words [overflow-wrap:anywhere]">
          Period: {exam.period}
        </p>
        <p className="text-sm font-medium text-slate-600 break-words [overflow-wrap:anywhere]">
          Year: {exam.year}
        </p>
      </div>

      <table className="w-full table-fixed text-left border-collapse border border-slate-200">
        <tbody>
          {exam.subjects
            ?.filter((s: any) => s.subject)
            .map((s: any, idx: number) => (
              <tr key={idx} className="border-t border-slate-200">
                <td className="py-3 px-3 sm:px-4 text-sm text-slate-600 uppercase font-medium break-words [overflow-wrap:anywhere]">
                  {s.subject}
                </td>
                <td className="py-3 px-4 text-sm font-bold text-slate-700 w-20 text-center border-l border-slate-200">
                  {s.grade || "-"}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );

  /**
   * Get field value from form, with support for aliases and formatters
   */
  const getFieldValue = (field: ProfileField): string => {
    const value = form?.[field.key];

    // Special handling for specific field keys
    if (field.key === "degree_name" && form?.degree_name && form?.degree_code) {
      return `${form.degree_name} (${form.degree_code})`;
    }

    if (!value && field.showIfEmpty === false) return "";
    return value || (field.showIfEmpty !== false ? "N/A" : "");
  };

  /**
   * Render a single field in the profile
   */
  const renderField = (field: ProfileField, textClass: string) => {
    const value = getFieldValue(field);
    if (!value && value !== "N/A" && field.showIfEmpty === false) return null;

    return (
      <p key={field.key} className={textClass}>
        <span className="text-slate-500">{field.label}:</span> {value}
      </p>
    );
  };

  /**
   * Render referees section (special handling for PG)
   */
  const renderRefereesSection = () => {
    const referees = [
      { name: form?.referee_name1, address: form?.referee_address1 },
      { name: form?.referee_name2, address: form?.referee_address2 },
      { name: form?.referee_name3, address: form?.referee_address3 },
    ].filter((r) => r.name);

    if (referees.length === 0) return null;

    return (
      <div key="referees" className="pt-6">
        <h3 className="text-lg font-medium text-slate-700 border-b border-slate-100 pb-3 mb-5">
          Referees
        </h3>
        <div className="space-y-4">
          {referees.map((ref, idx) => (
            <div
              key={idx}
              className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3"
            >
              <div className="flex justify-between items-start">
                <span className="font-semibold text-slate-700">
                  Referee {idx + 1}
                </span>
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded font-medium">
                  {ref.name ? "Provided" : "Not Provided"}
                </span>
              </div>
              {ref.name && (
                <>
                  <p className="text-sm text-slate-600">
                    <span className="font-medium">Name:</span> {ref.name}
                  </p>
                  <p className="text-sm text-slate-600">
                    <span className="font-medium">Address:</span>{" "}
                    {ref.address || "N/A"}
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  /**
   * Render a template section dynamically
   */
  const renderTemplateSection = (section: ProfileSection) => {
    if (section.title === "Referees") {
      return renderRefereesSection();
    }

    const detailGridClass =
      "grid grid-cols-1 gap-x-8 gap-y-4 border-b border-slate-100 pb-5 md:grid-cols-2 xl:grid-cols-3";
    const detailTextClass =
      "min-w-0 break-words [overflow-wrap:anywhere] text-sm leading-relaxed text-slate-600";

    const hasContent = section.fields.some(
      (f) => getFieldValue(f) && getFieldValue(f) !== "N/A",
    );
    if (!hasContent && !section.alwaysShow) return null;

    const renderedFields = section.fields
      .map((f) => renderField(f, detailTextClass))
      .filter(Boolean);
    if (renderedFields.length === 0 && !section.alwaysShow) return null;

    return (
      <div key={section.title} className="pt-6">
        <h3 className="text-lg font-medium text-slate-700 border-b border-slate-100 pb-3 mb-5">
          {section.title}
        </h3>
        <div className={detailGridClass}>{renderedFields}</div>
      </div>
    );
  };

  return (
    <div className="w-full space-y-5 bg-slate-50/50 p-3 sm:p-4 md:p-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Application Form</h1>
      </div>

      <div className="grid grid-cols-1 gap-5 items-start lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
        {/* Left Column: Actions Sidebar */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-slate-700 px-1">Actions</h2>

          <div className="bg-white border border-slate-200 overflow-hidden">
            {/* Header with Mountain/Banner */}
            <div className="h-32 w-full relative">
              <img
                src="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=800"
                alt="Background"
                className="w-full h-full object-cover grayscale opacity-60"
              />
              <div className="absolute inset-0 bg-slate-800/20"></div>
            </div>

            <div className="px-4 sm:px-5 pb-6 flex flex-col items-center">
              {/* Profile Image */}
              <div className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-sm -mt-14 z-10 bg-slate-200">
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

              {/* Name and ID */}
              <div className="mt-4 min-w-0 text-center space-y-1">
                <h3 className="text-lg font-semibold leading-snug text-slate-800 uppercase break-words [overflow-wrap:anywhere]">
                  {displayName}
                </h3>
                <p className="text-slate-500 text-xs tracking-wide font-mono font-medium break-words [overflow-wrap:anywhere]">
                  {applicant?.form_no || "N/A"}
                </p>
                <div className="pt-2">
                  <Badge className="max-w-full whitespace-normal bg-orange-400 hover:bg-orange-500 text-white border-0 px-3 py-1 rounded-full text-[10px] font-bold uppercase break-words [overflow-wrap:anywhere]">
                    {applicant?.program_name}
                  </Badge>
                </div>
              </div>

              {/* Contact Info */}
              <div className="mt-5 w-full min-w-0 space-y-2 text-center text-slate-600">
                <p className="text-sm font-medium break-words [overflow-wrap:anywhere]">
                  {applicant?.email || form?.email}
                </p>
                <p className="text-sm font-medium break-words [overflow-wrap:anywhere]">
                  {form?.phone_number || applicant?.phone_number}
                </p>
                <p className="text-sm font-medium break-words [overflow-wrap:anywhere]">
                  {form?.secondary_phone_number || "N/A"}
                </p>
              </div>

              {/* Admission Status */}
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-center">
                <span className="text-sm text-slate-500 font-medium">
                  Admission Status:
                </span>
                <Badge className="bg-[#6b357d] hover:bg-[#5a2d69] text-white border-0 px-3 py-1 rounded text-xs font-bold capitalize">
                  {applicant?.admission_status?.replace("_", " ") || "Pending"}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Main Form Data */}
        <div className="min-w-0 space-y-5">
          <div className="bg-white border border-slate-100 p-4 sm:p-5 lg:p-6 shadow-sm">
            {/* Registration Date Header */}
            <div className="mb-6">
              <p className="text-slate-600 text-base sm:text-lg break-words [overflow-wrap:anywhere]">
                Registration Date{" "}
                {new Date(applicant?.created_at || Date.now())
                  .toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })
                  .replace(/\//g, "-")}{" "}
                {new Date(
                  applicant?.created_at || Date.now(),
                ).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </p>
            </div>

            <div className="space-y-5">
              {/* TEMPLATE-DRIVEN SECTIONS - Renders based on program type */}
              {profileTemplate.sections.map((section) =>
                renderTemplateSection(section),
              )}

              {/* COURSE RECOMMENDATION SECTION - Only for PG applicants in recommendation status */}
              {program_type_id === 2 && (
                <CourseRecommendationSection
                  applicantId={applicant?.id || applicant?.uuid || ""}
                  applicationStatus={
                    applicant?.admission_status === "recommend"
                      ? applicant.admission_status
                      : applicant?.application_status ||
                    applicant?.admission_status ||
                    ""
                  }
                  approvedCourse={applicant?.approved_course}
                  applicantRecommendedCourse={
                    applicant?.applicant_recommended_course
                  }
                  availableCourses={form?.available_courses || []}
                  onAcceptRecommendation={handleAcceptRecommendation}
                  onRejectRecommendation={handleRejectRecommendation}
                  onRecommendAlternative={handleRecommendAlternativeCourse}
                  isLoading={isProcessingRecommendation}
                />
              )}
            </div>
          </div>

          {/* Bottom Grid: O'Level and Documents */}
          <div className="grid grid-cols-1 gap-5 items-start xl:grid-cols-[minmax(260px,0.9fr)_minmax(320px,1fr)]">
            {/* O'Level Column - Only show if profile template requires it */}
            {profileTemplate.showOLevel && (
              <div className="min-w-0 space-y-4">
                {olevelResults.length > 0 ? (
                  olevelResults.map((exam: any, idx: number) =>
                    renderOlevelCard(exam, idx),
                  )
                ) : (
                  <div className="bg-white border border-slate-100 p-8 text-center text-slate-400 font-medium italic">
                    No O'Level results found
                  </div>
                )}
              </div>
            )}

            {/* Documents Column */}
            <div className="min-w-0 bg-white border border-slate-100 p-4 sm:p-5 lg:p-6 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 pb-4 gap-3">
                <span className="text-slate-600 font-medium">Documents</span>
                <Button className="w-full sm:w-auto bg-[#6b357d] hover:bg-[#5a2d69] text-white rounded px-4 min-h-10 h-auto text-sm font-medium whitespace-normal text-center leading-snug">
                  Upload Additional Documents
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[280px] table-fixed text-left">
                  <thead>
                    <tr className="text-slate-500 font-medium text-sm">
                      <th className="pb-4 pr-4">Name</th>
                      <th className="w-24 pb-4 text-center">Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.length > 0 ? (
                      documents.map((doc, idx) => (
                        <tr key={idx} className="border-t border-slate-50">
                          <td className="py-4 pr-4 text-sm text-slate-600 font-medium capitalize break-words [overflow-wrap:anywhere]">
                            {doc.display_name ||
                              doc.document_type?.replace("_", " ")}
                          </td>
                          <td className="py-4 text-center">
                            <Button
                              size="icon"
                              className="bg-[#6b357d] hover:bg-[#5a2d69] rounded h-9 w-9"
                              onClick={async () => {
                                try {
                                  const token =
                                    localStorage.getItem("auth_token");
                                  const baseUrl =
                                    process.env.NEXT_PUBLIC_API_URL ||
                                    "http://localhost:5000/api";
                                  const response = await fetch(
                                    `${baseUrl}/applicant/download-document/${doc.document_id}`,
                                    {
                                      headers: {
                                        Authorization: `Bearer ${token}`,
                                      },
                                    },
                                  );

                                  if (response.ok) {
                                    const blob = await response.blob();
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download =
                                      doc.original_filename || "document";
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    URL.revokeObjectURL(url);
                                  }
                                } catch (e) {
                                  console.error("Download failed", e);
                                }
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={2}
                          className="py-8 text-center text-slate-400 font-medium italic"
                        >
                          No documents uploaded
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
