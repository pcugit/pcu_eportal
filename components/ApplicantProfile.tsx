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
  Loader2,
  AlertCircle,
  CheckCircle2,
  GraduationCap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiClient } from "@/lib/api";
import {
  getProfileTemplate,
  ProfileSection,
  ProfileField,
} from "@/lib/profileTemplates";
import CourseRecommendationSection from "@/components/CourseRecommendationSection";
import {
  getSessionImageUrl,
  setSessionImageUrl,
} from "@/lib/sessionImageCache";

interface ApplicantProfileProps {
  applicant: any;
  form: any;
  documents: any[];
  acceptanceFeeData?: { amount: number; feeName: string; paid: boolean } | null;
  program_type_id?: number;
  template?: FormTemplate | null;
}

interface FormTemplateField {
  name: string;
  label: string;
  type: string;
}

interface FormTemplateStep {
  title: string;
  type?: string;
  fields?: FormTemplateField[];
}

interface FormTemplate {
  program?: string;
  steps?: FormTemplateStep[];
}

export default function ApplicantProfile({
  applicant,
  form,
  documents,
  acceptanceFeeData,
  program_type_id,
  template,
}: ApplicantProfileProps) {
  const router = useRouter();
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:5000/e-portal/api";
  const [passportUrl, setPassportUrl] = React.useState<string | null>(null);
  const [isProcessingRecommendation, setIsProcessingRecommendation] =
    React.useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = React.useState(false);
  const [uploadDocType, setUploadDocType] = React.useState("");
  const [customUploadDocType, setCustomUploadDocType] = React.useState("");
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  const requestedDocsList = React.useMemo(() => {
    if (!applicant?.requested_documents) return [];
    return applicant.requested_documents
      .split(",")
      .map((d: string) => d.trim())
      .filter(Boolean);
  }, [applicant?.requested_documents]);

  const missingRequestedDocs = React.useMemo(() => {
    const uploadedTypes = new Set(
      documents.map((d) => (d.document_type || "").toLowerCase().replace(/_/g, " "))
    );
    return requestedDocsList.filter(
      (doc: string) => !uploadedTypes.has(doc.toLowerCase())
    );
  }, [requestedDocsList, documents]);

  React.useEffect(() => {
    if (isUploadModalOpen) {
      if (missingRequestedDocs.length > 0) {
        setUploadDocType(missingRequestedDocs[0]);
      } else {
        setUploadDocType("Others");
      }
      setCustomUploadDocType("");
      setSelectedFile(null);
      setUploadError(null);
    }
  }, [isUploadModalOpen, missingRequestedDocs]);
  // PT programmes for course recommendation alternative picker
  const [ptProgrammes, setPtProgrammes] = React.useState<Array<{ id: number; name: string; course: string; department: string }>>([]);

  const profileTemplate = React.useMemo(
    () => getProfileTemplate(program_type_id),
    [program_type_id],
  );

  // Fetch PT programmes when applicable (prog_type 4=HND Conversion, 7=Part Time)
  const isPtApplicant = program_type_id === 4 || program_type_id === 7;
  React.useEffect(() => {
    if (!isPtApplicant) return;
    const recStatus = applicant?.admission_status === "recommend"
      ? "recommend"
      : applicant?.application_status || applicant?.admission_status || "";
    if (!["recommended", "recommend"].includes(recStatus)) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    if (!token) return;
    // Pass application id so backend excludes the applicant's own first/second choices
    const appId = applicant?.id || applicant?.uuid || "";
    const qs = appId ? `?application_id=${appId}` : "";
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/e-portal/api"}/ptadmin/programs${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const list = (data?.programs || data || []).map((p: any, idx: number) => ({
          id: p.id || idx,
          // backend now returns ps.name AS course (same as applicant form)
          name: p.course || p.name || "",
          course: p.course || p.name || "",
          department: p.department || "",
        }));
        setPtProgrammes(list);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPtApplicant, applicant?.id]);

  const templateDrivenSections = React.useMemo<ProfileSection[]>(() => {
    if (program_type_id === 2 || !template?.steps?.length) return [];

    const sections = template.steps
      .filter((step) => step.type === "fields" && step.fields?.length)
      .map((step) => ({
        title: step.title,
        fields: step.fields!.map((field) => ({
          key: field.name,
          label: field.label,
        })),
        alwaysShow: true,
      }));

    const hasProgramChoices =
      form?.first_choice_program_name ||
      form?.second_choice_program_name ||
      form?.first_choice_program_id ||
      form?.second_choice_program_id;

    const programChoiceSection = {
      title: "Proposed Course Choices",
      fields: [
        { key: "first_choice_program_name", label: "First Choice" },
        { key: "second_choice_program_name", label: "Second Choice" },
      ],
      alwaysShow: true,
    };

    if (hasProgramChoices) {
      const jambSectionIndex = sections.findIndex((section) =>
        section.title.toLowerCase().includes("jamb"),
      );

      if (jambSectionIndex === -1) {
        sections.push(programChoiceSection);
      } else {
        sections.splice(jambSectionIndex + 1, 0, programChoiceSection);
      }
    }

    return sections;
  }, [form, program_type_id, template]);

  const profileSections =
    program_type_id === 2 ? profileTemplate?.sections ?? [] : templateDrivenSections;
  const showOLevel =
    program_type_id === 2
      ? profileTemplate?.showOLevel || false
      : template?.steps?.some((step) => step.type === "olevel") || false;
  const recommendationStatus =
    applicant?.admission_status === "recommend"
      ? "recommend"
      : applicant?.application_status || applicant?.admission_status || "";

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError("Please select a file to upload.");
      return;
    }
    const finalDocType = uploadDocType === "Others" ? customUploadDocType.trim() : uploadDocType;
    if (!finalDocType) {
      setUploadError("Please specify the document type.");
      return;
    }

    setUploadLoading(true);
    setUploadError(null);
    try {
      const appId = applicant?.id || applicant?.uuid;
      if (!appId) throw new Error("Application ID not found");

      await ApiClient.uploadDocument(selectedFile, appId, finalDocType, finalDocType);
      setIsUploadModalOpen(false);
      alert("Document uploaded successfully.");
      window.location.reload();
    } catch (err) {
      console.error("Upload failed", err);
      setUploadError(err instanceof Error ? err.message : "Failed to upload document");
    } finally {
      setUploadLoading(false);
    }
  };

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

  /**
   * Upload an additional document
   */
  const handleUploadDocument = async () => {
    const docType = uploadDocType === "Others" ? customUploadDocType.trim() : uploadDocType;
    if (!docType) {
      setUploadError("Please specify a document type.");
      return;
    }
    if (!selectedFile) {
      setUploadError("Please select a file to upload.");
      return;
    }
    setUploadLoading(true);
    setUploadError(null);
    try {
      const { ApiClient } = await import("@/lib/api");
      const formId = applicant?.id || applicant?.uuid;
      await ApiClient.uploadDocument(selectedFile, formId, docType.toLowerCase().replace(/\s+/g, "_"), docType);
      setIsUploadModalOpen(false);
      window.location.reload();
    } catch (err: any) {
      setUploadError(err?.message || "Upload failed. Please try again.");
    } finally {
      setUploadLoading(false);
    }
  };

  const passportDoc = documents.find(
    (d) =>
      d.document_type?.toLowerCase().includes("passport") ||
      d.display_name?.toLowerCase().includes("passport"),
  );
  const passportDocId = passportDoc?.document_id || passportDoc?.id;

  // Fetch passport image with auth
  React.useEffect(() => {
    if (!passportDocId) {
      setPassportUrl(null);
      return;
    }

    let active = true;
    const fetchPassport = async () => {
      try {
        const token = localStorage.getItem("auth_token") || "";
        const cacheKey = `applicant-passport:${token}:${passportDocId}`;
        const cachedUrl = getSessionImageUrl(cacheKey);

        if (cachedUrl) {
          setPassportUrl(cachedUrl);
          return;
        }

        const baseUrl =
          process.env.NEXT_PUBLIC_API_URL ||
          "http://localhost:5000/e-portal/api";
        const response = await fetch(
          `${baseUrl}/applicant/download-document/${passportDocId}`,
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
  }, [passportDocId]);

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
    const keys = [field.key, ...(field.aliases || [])];
    const value = keys
      .map((key) => form?.[key])
      .find((candidate) => candidate !== undefined && candidate !== null && candidate !== "");

    // Special handling for specific field keys
    if (field.key === "degree_name" && form?.degree_name && form?.degree_code) {
      return `${form.degree_name} (${form.degree_code})`;
    }

    if (field.format) {
      const formatted = field.format(value, form);
      if (formatted) return formatted;
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
    <>
      <div className="w-full space-y-5 bg-slate-50/50 p-3 sm:p-4 md:p-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Application Form</h1>
      </div>

      <div className="grid grid-cols-1 gap-5 items-start lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
        {/* Left Column: Actions Sidebar */}
          <div className="lg:sticky lg:top-4 lg:self-start">
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
              {/* Admitted/Finalised Course info, if available */}
              {(applicant?.finalised_course || applicant?.approved_course) && (
                <div className="mt-4 pt-4 border-t border-slate-100 w-full text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Admitted Course
                  </span>
                  <p className="text-sm font-bold text-[#6b357d] break-words [overflow-wrap:anywhere]">
                    {applicant?.finalised_course || applicant?.approved_course}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Main Form Data */}
        <div className="min-w-0 space-y-5">
          {/* Admission & Course Choice Status Card */}
          <div className="bg-white border border-slate-200 p-4 sm:p-5 lg:p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-[#6b357d]" />
              Admission & Course Choice Status
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  First Choice (Proposed)
                </span>
                <p className="font-semibold text-slate-700">
                  {form?.first_choice_program_name || form?.proposed_course_name || applicant?.program_name || "N/A"}
                </p>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Second Choice (Proposed)
                </span>
                <p className="font-semibold text-slate-700">
                  {form?.second_choice_program_name || "N/A"}
                </p>
              </div>
              <div className="md:col-span-2 pt-2 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Admitted / Finalised Course
                </span>
                {applicant?.finalised_course || applicant?.approved_course ? (
                  <p className="font-bold text-emerald-700 text-base">
                    {applicant?.finalised_course || applicant?.approved_course}
                  </p>
                ) : (
                  <p className="font-medium text-slate-500 italic">
                    Awaiting decision / Not yet finalized
                  </p>
                )}
              </div>
            </div>
          </div>
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
              {profileSections.length > 0 ? (
                profileSections.map((section) => renderTemplateSection(section))
              ) : (
                <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  No profile template is configured for this applicant's
                  program.
                </div>
              )}

              {/* COURSE RECOMMENDATION SECTION */}
              {([
                "recommended",
                "recommend",
                "accepted_recommendation",
                "applicant_recommended",
              ].includes(recommendationStatus) ||
                applicant?.approved_course ||
                applicant?.applicant_recommended_course) && (
                <CourseRecommendationSection
                  applicantId={applicant?.id || applicant?.uuid || ""}
                  applicationStatus={recommendationStatus}
                  approvedCourse={applicant?.approved_course}
                  applicantRecommendedCourse={
                    applicant?.applicant_recommended_course
                  }
                  availableCourses={
                    isPtApplicant
                      ? ptProgrammes
                      : form?.available_courses || []
                  }
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
            {/* O'Level Column - Only show if the applicant's program template requires it */}
            {showOLevel && (
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
              {requestedDocsList.length > 0 && (
                <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-4 space-y-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="text-base font-bold text-amber-900 mb-1">
                        Additional Documents Requested
                      </h3>
                      <p className="text-sm text-amber-800 mb-3">
                        The admissions office has requested that you upload the following additional documents to complete your screening process:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {requestedDocsList.map((doc: string) => {
                          const isUploaded = !missingRequestedDocs.includes(doc);
                          return (
                            <div
                              key={doc}
                              className={`flex items-center gap-2 rounded px-3 py-2 border text-xs font-semibold ${
                                isUploaded
                                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                  : "bg-amber-100 border-amber-200 text-amber-800"
                              }`}
                            >
                              <span
                                className={`h-2.5 w-2.5 rounded-full ${
                                  isUploaded ? "bg-emerald-500" : "bg-amber-500"
                                }`}
                              />
                              <span className="capitalize">{doc.replace(/_/g, " ")}</span>
                              <span className="ml-auto text-[10px] uppercase font-bold text-slate-500">
                                {isUploaded ? "Uploaded" : "Pending"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      {missingRequestedDocs.length > 0 ? (
                        <p className="text-xs text-amber-700 mt-4">
                          Click the <span className="font-semibold text-amber-900">&quot;Upload Additional Documents&quot;</span> button below to upload the pending documents.
                        </p>
                      ) : (
                        <p className="text-xs text-emerald-700 mt-4 flex items-center gap-1.5 font-semibold">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          All requested documents have been uploaded successfully.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 pb-4 gap-3">
                <span className="text-slate-600 font-medium">Documents</span>
                <Button
                  className="w-full sm:w-auto bg-[#6b357d] hover:bg-[#5a2d69] text-white rounded px-4 min-h-10 h-auto text-sm font-medium whitespace-normal text-center leading-snug"
                  onClick={() => setIsUploadModalOpen(true)}
                >
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

    {/* ── Upload Additional Documents Dialog ── */}
    <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Additional Document</DialogTitle>
          <DialogDescription>
            Select the document type and upload the file requested by the
            admissions office.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Requested but not yet uploaded — alert */}
          {missingRequestedDocs.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="font-semibold mb-1">Still required:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {missingRequestedDocs.map((d: string) => (
                  <li key={d} className="capitalize">{d}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Document type dropdown */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Document Type
            </label>
            <select
              className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#6b357d]/40"
              value={uploadDocType}
              onChange={(e) => setUploadDocType(e.target.value)}
            >
              {missingRequestedDocs.map((d: string) => (
                <option key={d} value={d}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </option>
              ))}
              {["O'Level Result", "Birth Certificate", "Passport", "Others"].filter(
                (opt: string) => !missingRequestedDocs.map((d: string) => d.toLowerCase()).includes(opt.toLowerCase())
              ).map((opt: string) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Custom type input when "Others" selected */}
          {uploadDocType === "Others" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Specify Document Name
              </label>
              <input
                type="text"
                className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#6b357d]/40"
                placeholder="e.g. Medical Certificate"
                value={customUploadDocType}
                onChange={(e) => setCustomUploadDocType(e.target.value)}
              />
            </div>
          )}

          {/* File picker */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">File</label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="w-full text-sm text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-[#6b357d] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-[#5a2d69]"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-slate-400">PDF, JPG or PNG — max 10 MB</p>
          </div>

          {uploadError && (
            <p className="text-sm text-red-600 font-medium">{uploadError}</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => setIsUploadModalOpen(false)}
            disabled={uploadLoading}
          >
            Cancel
          </Button>
          <Button
            className="bg-[#6b357d] hover:bg-[#5a2d69] text-white"
            onClick={handleUploadDocument}
            disabled={uploadLoading || !selectedFile}
          >
            {uploadLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading...
              </span>
            ) : (
              "Upload"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
