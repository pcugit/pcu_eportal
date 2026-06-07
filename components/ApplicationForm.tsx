"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { ApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  Save,
  Send,
  AlertCircle,
  CheckCircle2,
  Plus,
  X,
  User,
  FileText,
  Info,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";


// --- Memoized year options (static, never changes) ---
const YEAR_OPTIONS = Array.from({ length: 30 }, (_, i) => 2026 - i);
const yearItems = YEAR_OPTIONS.map((y) => (
  <SelectItem key={y} value={y.toString()}>
    {y}
  </SelectItem>
));

// --- Memoized exam block: each sitting is isolated, only re-renders on its own data change ---
interface ExamBlockProps {
  exam: any;
  examIdx: number;
  subjectItems: React.ReactNode[];
  gradeItems: React.ReactNode[];
  setOlevelExams: React.Dispatch<React.SetStateAction<any[]>>;
  setIsDirty: (v: boolean) => void;
}

const OlevelExamBlock = memo(function OlevelExamBlock({
  exam,
  examIdx,
  subjectItems,
  gradeItems,
  setOlevelExams,
  setIsDirty,
}: ExamBlockProps) {
  const sittingLabel =
    examIdx === 0
      ? "First Sitting"
      : examIdx === 1
        ? "Second Sitting"
        : "Third Sitting";

  const handleFieldChange = useCallback(
    (field: string, val: string) => {
      setOlevelExams((prev) => {
        const next = [...prev];
        next[examIdx] = { ...next[examIdx], [field]: val };
        return next;
      });
      setIsDirty(true);
    },
    [examIdx, setOlevelExams, setIsDirty],
  );

  const handleRemove = useCallback(() => {
    setOlevelExams((prev) => prev.filter((_, i) => i !== examIdx));
    setIsDirty(true);
  }, [examIdx, setOlevelExams, setIsDirty]);

  const onSubjectChange = useCallback(
    (idx: number, val: string) => {
      setOlevelExams((prev) => {
        const next = [...prev];
        const subjects = [...next[examIdx].subjects];
        subjects[idx] = { ...subjects[idx], subject_id: val };
        next[examIdx] = { ...next[examIdx], subjects };
        return next;
      });
      setIsDirty(true);
    },
    [examIdx, setOlevelExams, setIsDirty],
  );

  const onGradeChange = useCallback(
    (idx: number, val: string) => {
      setOlevelExams((prev) => {
        const next = [...prev];
        const subjects = [...next[examIdx].subjects];
        subjects[idx] = { ...subjects[idx], grade_id: val };
        next[examIdx] = { ...next[examIdx], subjects };
        return next;
      });
      setIsDirty(true);
    },
    [examIdx, setOlevelExams, setIsDirty],
  );

  return (
    <div className="bg-slate-50/50 rounded-xl p-6 border border-slate-100 space-y-6 relative">
      {examIdx > 0 && (
        <button
          onClick={handleRemove}
          className="absolute top-4 right-4 p-1 text-slate-400 hover:text-red-500 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      )}
      <h3 className="font-medium text-slate-800 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-blue-500" />
        {sittingLabel}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2">
          <Label>Name of Exam*</Label>
          <Select
            value={exam.name}
            onValueChange={(val) => handleFieldChange("name", val)}
          >
            <SelectTrigger>
              <SelectValue placeholder="--select--" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="WAEC">WAEC</SelectItem>
              <SelectItem value="NECO">NECO</SelectItem>
              <SelectItem value="NABTEB">NABTEB</SelectItem>
              <SelectItem value="GCE">GCE</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Exam Number*</Label>
          <Input
            value={exam.number}
            onChange={(e) => handleFieldChange("number", e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <OlevelSubjectRow
            key={i}
            index={i}
            subject_id={exam.subjects[i]?.subject_id?.toString() || ""}
            grade_id={exam.subjects[i]?.grade_id?.toString() || ""}
            subjectItems={subjectItems}
            gradeItems={gradeItems}
            onSubjectChange={onSubjectChange}
            onGradeChange={onGradeChange}
          />
        ))}
      </div>
    </div>
  );
});

// --- Memoized subject row: only re-renders if its own values change ---
interface SubjectRowProps {
  index: number;
  subject_id: string;
  grade_id: string;
  subjectItems: React.ReactNode[];
  gradeItems: React.ReactNode[];
  onSubjectChange: (index: number, val: string) => void;
  onGradeChange: (index: number, val: string) => void;
}

const OlevelSubjectRow = memo(function OlevelSubjectRow({
  index,
  subject_id,
  grade_id,
  subjectItems,
  gradeItems,
  onSubjectChange,
  onGradeChange,
}: SubjectRowProps) {
  return (
    <div className="flex gap-4">
      <div className="flex-1 space-y-2">
        <Label>Subject {index + 1}</Label>
        <Select
          value={subject_id}
          onValueChange={(val) => onSubjectChange(index, val)}
        >
          <SelectTrigger>
            <SelectValue placeholder="--SELECT--" />
          </SelectTrigger>
          <SelectContent position="popper">{subjectItems}</SelectContent>
        </Select>
      </div>
      <div className="w-32 space-y-2">
        <Label>Grade</Label>
        <Select
          value={grade_id}
          onValueChange={(val) => onGradeChange(index, val)}
        >
          <SelectTrigger>
            <SelectValue placeholder="--" />
          </SelectTrigger>
          <SelectContent position="popper">{gradeItems}</SelectContent>
        </Select>
      </div>
    </div>
  );
});

// O'Level data will be fetched from API

interface FormField {
  name: string;
  type: string;
  label: string;
  required?: boolean;
  options?: string[];
  disabled?: boolean;
  placeholder?: string;
}

interface Document {
  type: string;
  label: string;
  required?: boolean;
}

interface FormStep {
  title: string;
  type?: "fields" | "olevel" | "documents" | "course" | "passport_upload" | "pg_study" | "pg_referees";
  fields?: FormField[];
  documents?: Document[];
}

interface FormTemplate {
  program: string;
  fields?: FormField[];
  documents?: Document[];
  steps?: FormStep[];
}

// Helper: parse olevel_results into padded exam objects
function parseOlevelForState(raw: any) {
  const blank = [
    {
      name: "",
      number: "",
      period: "",
      year: "",
      subjects: Array.from({ length: 5 }, () => ({
        subject_id: "",
        grade_id: "",
      })),
    },
  ];
  if (!raw) return blank;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((exam: any) => ({
        ...exam,
        subjects: [
          ...(exam.subjects || []),
          ...Array.from(
            { length: Math.max(0, 5 - (exam.subjects?.length || 0)) },
            () => ({ subject_id: "", grade_id: "" }),
          ),
        ].slice(0, 5),
      }));
    }
  } catch { }
  return blank;
}

const compressPassportImage = (
  file: File,
  maxWidth = 250,
  maxHeight = 250,
  maxSizeBytes = 50 * 1024,
): Promise<File> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = maxWidth;
        canvas.height = maxHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Draw image stretched/fitted to 250x250
        ctx.drawImage(img, 0, 0, maxWidth, maxHeight);

        let quality = 0.95;
        const compressNext = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Failed to generate image blob"));
                return;
              }
              if (blob.size <= maxSizeBytes || quality <= 0.1) {
                const compressedFile = new File(
                  [blob],
                  file.name.substring(0, file.name.lastIndexOf(".")) + ".jpg",
                  {
                    type: "image/jpeg",
                    lastModified: Date.now(),
                  },
                );
                resolve(compressedFile);
              } else {
                quality -= 0.08;
                compressNext();
              }
            },
            "image/jpeg",
            quality,
          );
        };
        compressNext();
      };
      img.onerror = () =>
        reject(new Error("Failed to load image for compression"));
    };
    reader.onerror = () => reject(new Error("Failed to read image file"));
  });
};

interface ApplicationFormProps {
  template: FormTemplate;
  applicantId?: number;
  programId: number;
  programTypeId?: number;
  user?: any;
  onSuccess?: () => void;
  initialFormData?: Record<string, any>;
  initialDocuments?: any[];
  initialPassportUrl?: string;
}

export default function ApplicationForm({
  template,
  applicantId,
  programId,
  programTypeId,
  user,
  onSuccess,
  initialFormData,
  initialDocuments,
  initialPassportUrl,
}: ApplicationFormProps) {
  const [formData, setFormData] = useState<Record<string, any>>(
    initialFormData ?? {},
  );
  const [documents, setDocuments] = useState<Record<string, File | null>>({});
  const [uploadedDocuments, setUploadedDocuments] = useState<
    Record<string, any>
  >(() => {
    if (!initialDocuments?.length) return {};
    const docs: Record<string, any> = {};
    initialDocuments.forEach((doc: any) => {
      docs[doc.document_type] = doc;
    });
    return docs;
  });
  const [formId, setFormId] = useState<number | null>(
    initialFormData?.id ?? null,
  );
  const [availablePrograms, setAvailablePrograms] = useState<any[]>([]);
  const [availableCourses, setAvailableCourses] = useState<any[]>(
    initialFormData?.available_courses ?? [],
  );
  const [availableFaculties, setAvailableFaculties] = useState<any[]>(
    initialFormData?.available_faculties ?? [],
  );
  const [availableDegrees, setAvailableDegrees] = useState<any[]>(
    initialFormData?.available_degrees ?? [],
  );
  const [olevelSubjects, setOlevelSubjects] = useState<any[]>([]);
  const [olevelGrades, setOlevelGrades] = useState<any[]>([]);

  // Memoize dropdown options — only re-created when source data changes
  const subjectItems = useMemo(
    () =>
      olevelSubjects.map((s) => (
        <SelectItem key={s.id} value={s.name}>
          {s.name}
        </SelectItem>
      )),
    [olevelSubjects],
  );

  const gradeItems = useMemo(
    () =>
      olevelGrades.map((g) => (
        <SelectItem key={g.id} value={g.grade}>
          {g.grade}
        </SelectItem>
      )),
    [olevelGrades],
  );

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>(
    {},
  );
  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [maxStepReached, setMaxStepReached] = useState(0);

  const [currentStep, setCurrentStep] = useState(0);

  const [olevelExams, setOlevelExams] = useState<any[]>(() =>
    parseOlevelForState(initialFormData?.olevel_results),
  );

  const [selectedPassportFile, setSelectedPassportFile] = useState<File | null>(
    null,
  );
  const [passportPreviewUrl, setPassportPreviewUrl] = useState<string | null>(
    initialPassportUrl ?? null,
  );
  const initialPassportUrlRef = useRef(initialPassportUrl);
  useEffect(() => {
    initialPassportUrlRef.current = initialPassportUrl;
  }, [initialPassportUrl]);

  const hasSteps = !!template.steps && template.steps.length > 0;
  const steps: FormStep[] = [];

  // Inject Passport step at the very beginning
  steps.push({ title: "Passport Photograph", type: "passport_upload" });

  if (hasSteps) {
    // Filter out 'passport' type document from the documents step if it exists to prevent duplicates
    const filteredSteps = template.steps!.map((s) => {
      if (s.type === "documents" && s.documents) {
        return {
          ...s,
          documents: s.documents.filter((d) => d.type !== "passport"),
        };
      }
      return s;
    });
    steps.push(...filteredSteps);
  } else {
    steps.push({
      title: "Personal Information",
      type: "fields",
      fields: template.fields,
    });
    const filteredDocs =
      template.documents?.filter((d) => d.type !== "passport") || [];
    steps.push({
      title: "Documents",
      type: "documents",
      documents: filteredDocs,
    });
  }

  // Inject COURSE step after O'Level or Personal Info if not already present
  // Skip for PG: check both programId and whether the template has a pg_study step
  const hasPgStudy = steps.some((s) => s.type === "pg_study");
  if (!hasPgStudy && !steps.find((s) => s.type === "course")) {
    const olevelIdx = steps.findIndex((s) => s.type === "olevel");
    if (olevelIdx !== -1) {
      steps.splice(olevelIdx + 1, 0, { title: "COURSE", type: "course" });
    } else {
      const personalIdx = steps.findIndex(
        (s) => s.title === "Personal Information",
      );
      if (personalIdx !== -1) {
        steps.splice(personalIdx + 1, 0, { title: "COURSE", type: "course" });
      }
    }
  }

  const step = steps[currentStep];

  // Fetch programs for course selection + O'Level lookup data.
  // Results are cached in sessionStorage so re-opening the form is instant.
  useEffect(() => {
    const fetchData = async () => {
      try {
        const CACHE_KEY_PROGRAMS = "cache_programs";
        const CACHE_KEY_OLEVEL = "cache_olevel";

        const readCache = (key: string) => {
          try {
            const raw = sessionStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
          } catch {
            return null;
          }
        };
        const writeCache = (key: string, data: any) => {
          try {
            sessionStorage.setItem(key, JSON.stringify(data));
          } catch { }
        };

        let programs = readCache(CACHE_KEY_PROGRAMS);
        let olevel = readCache(CACHE_KEY_OLEVEL);

        if (!programs || !olevel) {
          const fetches = await Promise.all([
            programs ? null : ApiClient.getPrograms(),
            olevel ? null : ApiClient.getOlevelData(),
          ]);
          if (fetches[0]) {
            programs = fetches[0];
            writeCache(CACHE_KEY_PROGRAMS, programs);
          }
          if (fetches[1]) {
            olevel = fetches[1];
            writeCache(CACHE_KEY_OLEVEL, olevel);
          }
        }

        setAvailablePrograms(programs?.programs || []);
        setOlevelSubjects(olevel?.subjects || []);
        setOlevelGrades(olevel?.grades || []);
      } catch (e) {
        console.error("Failed to fetch form lookup data", e);
      }
    };
    fetchData();
  }, []);

  // Load existing form data
  useEffect(() => {
    const loadExistingForm = async () => {
      // Always apply user-derived defaults (email, phone)
      const userDefaults: Record<string, string> = {};
      if (user) {
        userDefaults["email"] = user.email || "";
        userDefaults["phone_number"] = user.phone_number || "";
        if (user.name) {
          const parts = user.name.split(" ");
          userDefaults["first_name"] = parts[0] || "";
          userDefaults["last_name"] = parts.slice(1).join(" ") || "";
        }
      }
      // Merge user defaults without overwriting already-set form values
      setFormData((prev) => ({ ...userDefaults, ...prev }));

      // If initialFormData was passed as a prop, state is already populated — skip fetch
      if (initialFormData) {
        setMaxStepReached(steps.length - 1);
        return;
      }

      if (!applicantId) return;
      if (!ApiClient.getToken()) return;

      try {
        const response: any = await ApiClient.getForm(applicantId);
        if (response.form) {
          setFormId(response.form.id);
          setFormData((prev) => ({ ...prev, ...response.form }));
          if (response.form.available_courses) {
            setAvailableCourses(response.form.available_courses);
          }
          if (response.form.available_faculties) {
            setAvailableFaculties(response.form.available_faculties);
          }
          if (response.form.available_degrees) {
            setAvailableDegrees(response.form.available_degrees);
          }
          if (response.form.olevel_results) {
            const padded = parseOlevelForState(response.form.olevel_results);
            setOlevelExams(padded);
          }
        }
        if (response.documents && response.documents.length > 0) {
          const docs: Record<string, any> = {};
          response.documents.forEach((doc: any) => {
            docs[doc.document_type] = doc;
          });
          setUploadedDocuments(docs);
        }
        if (response.form) {
          setMaxStepReached(steps.length - 1);
        }
      } catch (err) {
        console.error("Error loading form:", err);
      }
    };
    loadExistingForm();
  }, [applicantId, user, steps.length]);

  // Auto-save on data change
  useEffect(() => {
    if (!formId && !formData.first_name) return; // Don't auto-save if empty

    const timer = setTimeout(() => {
      // Create a background save that doesn't show loading or block UI
      const autoSave = async () => {
        try {
          const payload = {
            applicant_id: applicantId,
            program_id: programId,
            ...formData,
            olevel_results: JSON.stringify(olevelExams),
          };
          const response = await ApiClient.submitForm(payload);
          if (!formId) setFormId(response.form_id);
        } catch (e) {
          console.error("Auto-save failed", e);
        }
      };
      autoSave();
    }, 5000); // 5 second debounce

    return () => clearTimeout(timer);
  }, [formData, olevelExams, applicantId, programId, formId]);

  // Fetch existing passport preview URL when loaded
  useEffect(() => {
    if (passportPreviewUrl) return;
    const passportDoc = uploadedDocuments["passport"];
    if (passportDoc?.document_id) {
      const fetchPassport = async () => {
        try {
          const baseUrl = ApiClient.getBaseUrl();
          const response = await fetch(
            `${baseUrl}/applicant/download-document/${passportDoc.document_id}`,
            {
              headers: {
                Authorization: `Bearer ${ApiClient.getToken()}`,
              },
            },
          );
          if (!response.ok) throw new Error("Failed to fetch image");
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setPassportPreviewUrl(url);
        } catch (e) {
          console.error("Failed to fetch passport preview", e);
        }
      };
      fetchPassport();
    }
  }, [uploadedDocuments["passport"]?.document_id, passportPreviewUrl]);

  // Clean up object URLs on change or unmount
  useEffect(() => {
    return () => {
      if (
        passportPreviewUrl &&
        passportPreviewUrl.startsWith("blob:") &&
        passportPreviewUrl !== initialPassportUrlRef.current
      ) {
        URL.revokeObjectURL(passportPreviewUrl);
      }
    };
  }, [passportPreviewUrl]);

  const handlePassportFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    let file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
    const fileExtension = file.name.split(".").pop()?.toLowerCase();
    const isAllowedExt = ["jpg", "jpeg", "png", "gif"].includes(
      fileExtension || "",
    );
    if (!allowedTypes.includes(file.type) && !isAllowedExt) {
      setError("Invalid file format. Allowed formats: gif, png, jpg");
      return;
    }

    setError(null);

    // If file size exceeds 50KB, compress it
    if (file.size > 50 * 1024) {
      try {
        file = await compressPassportImage(file);
      } catch (err) {
        setError("Failed to compress the image. Please select a smaller file.");
        return;
      }
    }

    // Validate dimensions (exactly 250px by 250px)
    try {
      const dimensions = await new Promise<{ width: number; height: number }>(
        (resolve, reject) => {
          const img = new window.Image();
          img.src = URL.createObjectURL(file!);
          img.onload = () => {
            resolve({ width: img.width, height: img.height });
          };
          img.onerror = () => reject(new Error("Failed to load image"));
        },
      );

      if (dimensions.width !== 250 || dimensions.height !== 250) {
        setError(
          `Image dimensions must be exactly 250px by 250px. Current dimensions: ${dimensions.width}px by ${dimensions.height}px.`,
        );
        return;
      }
    } catch (err) {
      setError("Failed to verify image dimensions.");
      return;
    }

    setError(null);
    setSelectedPassportFile(file);
    setIsDirty(true);

    // Set local preview
    const previewUrl = URL.createObjectURL(file);
    setPassportPreviewUrl(previewUrl);
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setIsDirty(true);
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setIsDirty(true);
  };

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    documentType: string,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      setError(`File size exceeds 15MB limit for ${documentType}`);
      return;
    }

    setDocuments((prev) => ({ ...prev, [documentType]: file }));
    setError(null);

    if (!formId) {
      setError(
        "Please click 'Save Form' at the bottom to save your details before uploading documents.",
      );
      return;
    }

    try {
      await uploadDocument(documentType, file, formId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const uploadDocument = async (
    documentType: string,
    file: File,
    currentFormId?: number,
  ) => {
    const effectiveFormId = currentFormId || formId;
    if (!effectiveFormId) {
      throw new Error("Form not saved. Please save form first.");
    }

    try {
      setUploadProgress((prev) => ({ ...prev, [documentType]: 0 }));
      const response = await ApiClient.uploadDocument(
        file,
        effectiveFormId,
        documentType,
      );
      setUploadProgress((prev) => ({ ...prev, [documentType]: 100 }));
      setUploadedDocuments((prev) => ({
        ...prev,
        [documentType]: response,
      }));
      return response;
    } catch (err) {
      throw err;
    }
  };

  const saveForm = async () => {
    setSaving(true);
    setError(null);

    try {
      // 1. Validate passport step
      if (step.type === "passport_upload") {
        if (!selectedPassportFile && !uploadedDocuments["passport"]) {
          setError("Please upload a passport photograph before proceeding.");
          setSaving(false);
          return false;
        }
      }

      // 2. Validate standard fields step
      if (step.type === "fields" && step.fields) {
        const missingFields = step.fields
          .filter((field) => {
            if (field.name === "physical_challenge_reason") {
              return formData.physically_challenged === "Yes" && !formData[field.name];
            }
            return field.required && !formData[field.name];
          })
          .map((field) => field.label);

        if (missingFields.length > 0) {
          setError(`Please fill in: ${missingFields.join(", ")}`);
          setSaving(false);
          return false;
        }
      }

      // Validate PG Study step
      if (step.type === "pg_study") {
        const missing = [];
        if (!formData.degree_id) missing.push("Degree in View");
        if (!formData.proposed_course) missing.push("Proposed Course of Study");
        if (!formData.mode_of_study) missing.push("Mode of Study");

        const selectedDegreeId = parseInt(formData.degree_id || "0");
        const selectedDegree = availableDegrees.find((d) => d.id === selectedDegreeId);
        const isResearchDegree =
          selectedDegree?.code?.toUpperCase()?.includes("PHD") ||
          selectedDegree?.code?.toUpperCase()?.includes("M.PHIL") ||
          selectedDegree?.code?.toUpperCase()?.includes("MPHIL") ||
          selectedDegree?.name?.toUpperCase()?.includes("DOCTOR OF PHILOSOPHY") ||
          selectedDegree?.name?.toUpperCase()?.includes("PHILOSOPHY");

        if (isResearchDegree && !formData.proposed_research_title) {
          missing.push("Proposed Title of Research");
        }

        if (missing.length > 0) {
          setError(`Please fill in: ${missing.join(", ")}`);
          setSaving(false);
          return false;
        }
      }

      // Validate PG Referees step
      if (step.type === "pg_referees") {
        const missing = [];
        if (!formData.referee_name1) missing.push("Referee 1 Name");
        if (!formData.referee_address1) missing.push("Referee 1 Address");
        if (!formData.referee_name2) missing.push("Referee 2 Name");
        if (!formData.referee_address2) missing.push("Referee 2 Address");
        if (!formData.referee_name3) missing.push("Referee 3 Name");
        if (!formData.referee_address3) missing.push("Referee 3 Address");

        if (missing.length > 0) {
          setError(`Please fill in: ${missing.join(", ")}`);
          setSaving(false);
          return false;
        }
      }

      // 3. Validate O'level step
      if (step.type === "olevel") {
        for (let i = 0; i < olevelExams.length; i++) {
          const exam = olevelExams[i];
          const prefix = olevelExams.length > 1 ? `Sitting ${i + 1}: ` : "";

          // Only validate if it's the first sitting OR if any field is filled in this sitting
          const isFirstSitting = i === 0;
          const hasAnyField =
            exam.name ||
            exam.number ||
            exam.period ||
            exam.year ||
            exam.subjects.some((s: any) => s.subject_id || s.grade_id);

          if (isFirstSitting || hasAnyField) {
            if (!exam.name || !exam.number || !exam.period || !exam.year) {
              const missing = [];
              if (!exam.name) missing.push("Name");
              if (!exam.number) missing.push("Number");
              if (!exam.period) missing.push("Period");
              if (!exam.year) missing.push("Year");

              setError(`${prefix}Please fill in: ${missing.join(", ")}`);
              setSaving(false);
              return false;
            }
          }

          const filledSubjects = exam.subjects.filter(
            (s: any) => (s.subject_id || s.subject) && (s.grade_id || s.grade),
          );
          if (filledSubjects.length < 5) {
            setError(`${prefix}Please provide at least 5 subjects and grades`);
            setSaving(false);
            return false;
          }
        }
      }

      const payload = {
        applicant_id: applicantId,
        program_id: programId,
        ...formData,
        olevel_results: JSON.stringify(olevelExams),
      };

      const response = await ApiClient.submitForm(payload);
      const actualFormId = response.form_id;
      setFormId(actualFormId);

      // Upload passport photograph if we are on passport_upload step and a new file is chosen
      if (step.type === "passport_upload" && selectedPassportFile) {
        await uploadDocument("passport", selectedPassportFile, actualFormId);
        setSelectedPassportFile(null);
      }

      // Upload any new documents if we are on documents step
      if (step.type === "documents") {
        const documentsToUpload = Object.entries(documents).filter(
          ([docType, file]) => file && !uploadedDocuments[docType],
        );

        for (const [docType, file] of documentsToUpload) {
          if (file) {
            await uploadDocument(docType, file, actualFormId);
          }
        }
        setDocuments({});
      }
      setIsDirty(false);
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save form";
      setError(message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const advanceStep = () => {
    const nextStep = currentStep + 1;
    setCurrentStep(nextStep);
    if (nextStep > maxStepReached) setMaxStepReached(nextStep);
    window.scrollTo(0, 0);
  };

  const handleNextStep = async () => {
    // Only save if there are changes OR if we are on the first step to ensure passport upload completes
    if (isDirty || currentStep === 0) {
      const success = await saveForm();
      if (!success) return;
    }

    advanceStep();
  };

  const handlePrevStep = async () => {
    if (isDirty) {
      await saveForm();
    }
    setCurrentStep((c) => Math.max(c - 1, 0));
    window.scrollTo(0, 0);
  };

  const submitApplication = async () => {
    setError(null);

    // Ensure everything is saved first
    const saved = await saveForm();
    if (!saved) return;

    if (!formId) {
      setError("Please save your form first");
      return;
    }

    // ── PG document validation ────────────────────────────────────────────
    if (hasPgStudy) {
      const PG_REQUIRED = [
        { type: 'transcript',        label: 'Student Copy Transcript' },
        { type: 'birth_certificate', label: 'Birth Certificate' },
        { type: 'nysc_certificate',  label: 'NYSC Certificate' },
        { type: 'olevel_result',     label: "O'Level Result" },
        { type: 'referee_letter_1',  label: 'Referee Letter 1' },
        { type: 'referee_letter_2',  label: 'Referee Letter 2' },
        { type: 'referee_letter_3',  label: 'Referee Letter 3' },
      ];
      const missing = PG_REQUIRED
        .filter(d => !uploadedDocuments[d.type])
        .map(d => d.label);
      if (missing.length > 0) {
        setError(`Please upload the following required documents before submitting: ${missing.join(', ')}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      await ApiClient.submitApplication(applicantId || 0);
      onSuccess?.();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to submit application";
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 flex gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Progress Indicator */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {steps.map((s, i) => {
          const isCompleted =
            i < currentStep || (formId && i <= maxStepReached);
          const isClickable =
            i <= maxStepReached || (formId && i < steps.length);

          return (
            <div
              key={i}
              className={`px-4 py-2 text-sm font-bold whitespace-nowrap border-b-2 transition-all ${i === currentStep
                  ? "border-primary text-primary"
                  : isClickable
                    ? "border-primary/30 text-slate-500 cursor-pointer hover:border-primary/60"
                    : "border-transparent text-slate-300"
                }`}
              onClick={async () => {
                if (isClickable && i !== currentStep) {
                  if (isDirty) {
                    const success = await saveForm();
                    if (!success) return;
                  }
                  setCurrentStep(i);
                  window.scrollTo(0, 0);
                }
              }}
            >
              STEP {i + 1} - {s.title.toUpperCase()}
            </div>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>STEP - {step.title}</CardTitle>
          <CardDescription>Fill out all required fields</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 overflow-visible">
          {step.type === "passport_upload" && (
            <div className="flex flex-col items-center justify-center py-6 space-y-6">
              <div className="text-center max-w-md space-y-2">
                <p className="text-sm text-slate-500 font-medium">
                  Upload a passport photograph (Allowed: gif, png, jpg) 250px by
                  250px Max. 50KB
                </p>
              </div>

              {/* Passport Preview Container */}
              <div className="relative group w-48 h-48 rounded-xl border-2 border-dashed border-slate-300 hover:border-[#6b21a8] bg-slate-50/50 flex flex-col items-center justify-center overflow-hidden transition-all duration-300 shadow-sm">
                {passportPreviewUrl ? (
                  <img
                    src={passportPreviewUrl}
                    alt="Passport Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center space-y-2 text-slate-400">
                    <User className="w-16 h-16 stroke-1" />
                    <span className="text-xs font-medium">
                      No Image Selected
                    </span>
                  </div>
                )}
              </div>

              {/* Choose File Button */}
              <div className="flex flex-col items-center space-y-2">
                <label className="relative cursor-pointer bg-white rounded-lg border border-slate-200 shadow-sm px-4 py-2.5 hover:bg-slate-50 transition-colors flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Upload className="w-4 h-4 text-slate-500" />
                  <span>Choose File</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif"
                    className="hidden"
                    onChange={handlePassportFileChange}
                  />
                </label>
                {selectedPassportFile && (
                  <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Selected: {selectedPassportFile.name}
                  </span>
                )}
              </div>
            </div>
          )}

          {step.type === "fields" && step.fields && (
            <div className="grid md:grid-cols-2 gap-4">
              {step.fields.map((field) => {
                if (field.name === "physical_challenge_reason" && formData.physically_challenged !== "Yes") {
                  return null;
                }
                return (
                  <div key={field.name} className="space-y-2">
                    <Label htmlFor={field.name}>
                      {field.label}
                      {field.required && (
                        <span className="text-destructive">*</span>
                      )}
                    </Label>
                    {field.type === "text" ||
                      field.type === "email" ||
                      field.type === "number" ? (
                      <Input
                        id={field.name}
                        name={field.name}
                        type={field.type}
                        placeholder={field.label}
                        value={formData[field.name] || ""}
                        onChange={handleInputChange}
                        disabled={saving || submitting || field.disabled}
                      />
                    ) : field.type === "date" ? (
                      <Input
                        id={field.name}
                        name={field.name}
                        type="date"
                        value={formData[field.name] || ""}
                        onChange={handleInputChange}
                        disabled={saving || submitting || field.disabled}
                      />
                    ) : field.type === "select" ? (
                      <Select
                        value={formData[field.name] || undefined}
                        onValueChange={(value) =>
                          handleSelectChange(field.name, value)
                        }
                        disabled={saving || submitting || field.disabled}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={field.placeholder || "--Select--"}
                          />
                        </SelectTrigger>
                        <SelectContent position="popper" className="z-[9999]">
                          {field.options?.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : field.type === "textarea" ? (
                      <textarea
                        id={field.name}
                        name={field.name}
                        placeholder={field.label}
                        value={formData[field.name] || ""}
                        onChange={handleInputChange}
                        disabled={saving || submitting || field.disabled}
                        rows={4}
                        className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {step.type === "pg_study" && (() => {
            const selectedDegreeIdForFilter = parseInt(formData.degree_id || "0");
            const filteredCourses = selectedDegreeIdForFilter
              ? availableCourses.filter((c) => c.degree_id === selectedDegreeIdForFilter)
              : [];
            return (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="degree_id">Degree in View*</Label>
                  <Select
                    value={formData.degree_id?.toString() || ""}
                    onValueChange={(val) => {
                      setFormData((prev) => ({
                        ...prev,
                        degree_id: val,
                        proposed_course: "",
                        proposed_faculty: "",
                      }));
                      setIsDirty(true);
                    }}
                  >
                    <SelectTrigger className="h-12 border-slate-200">
                      <SelectValue placeholder="--Select Degree--" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="z-[9999]">
                      {availableDegrees.map((d) => (
                        <SelectItem key={d.id} value={d.id.toString()}>
                          {d.name} ({d.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="proposed_course">Proposed Course of Study*</Label>
                  <Select
                    value={formData.proposed_course?.toString() || ""}
                    onValueChange={(val) => {
                      const courseId = parseInt(val);
                      const course = availableCourses.find((c) => c.id === courseId);
                      setFormData((prev) => ({
                        ...prev,
                        proposed_course: val,
                        proposed_faculty: course?.faculty_id?.toString() || "",
                      }));
                      setIsDirty(true);
                    }}
                    disabled={!selectedDegreeIdForFilter}
                  >
                    <SelectTrigger className="h-12 border-slate-200">
                      <SelectValue placeholder={selectedDegreeIdForFilter ? "--Select Proposed Course--" : "--Select Degree First--"} />
                    </SelectTrigger>
                    <SelectContent position="popper" className="z-[9999]">
                      {filteredCourses.map((c) => (
                        <SelectItem key={c.id} value={c.id.toString()}>
                          {c.course}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mode_of_study">Mode of Study*</Label>
                  <Select
                    value={formData.mode_of_study || ""}
                    onValueChange={(val) => {
                      setFormData((prev) => ({ ...prev, mode_of_study: val }));
                      setIsDirty(true);
                    }}
                  >
                    <SelectTrigger className="h-12 border-slate-200">
                      <SelectValue placeholder="--Select Mode of Study--" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="z-[9999]">
                      <SelectItem value="Full-Time">Full-Time</SelectItem>
                      <SelectItem value="Part-Time">Part-Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="area_of_specialisation">Area of Specialisation</Label>
                  <Input
                    id="area_of_specialisation"
                    name="area_of_specialisation"
                    placeholder="Area of Specialisation"
                    value={formData.area_of_specialisation || ""}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              {(() => {
                const selectedDegreeId = parseInt(formData.degree_id || "0");
                const selectedDegree = availableDegrees.find((d) => d.id === selectedDegreeId);
                const isResearchDegree =
                  selectedDegree?.code?.toUpperCase()?.includes("PHD") ||
                  selectedDegree?.code?.toUpperCase()?.includes("M.PHIL") ||
                  selectedDegree?.code?.toUpperCase()?.includes("MPHIL") ||
                  selectedDegree?.name?.toUpperCase()?.includes("DOCTOR OF PHILOSOPHY") ||
                  selectedDegree?.name?.toUpperCase()?.includes("PHILOSOPHY");

                if (isResearchDegree) {
                  return (
                    <div className="space-y-2">
                      <Label htmlFor="proposed_research_title">Proposed Title of Research*</Label>
                      <textarea
                        id="proposed_research_title"
                        name="proposed_research_title"
                        placeholder="Proposed Title of Research (required for MPhil-PhD/PhD)"
                        value={formData.proposed_research_title || ""}
                        onChange={handleInputChange}
                        rows={3}
                        className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            );
          })()}

          {step.type === "pg_referees" && (
            <div className="space-y-6">
              <p className="text-sm text-slate-500 font-medium">
                Please provide the names and addresses of three referees.
              </p>

              <div className="grid md:grid-cols-3 gap-6">
                <div className="bg-slate-50/50 rounded-xl p-6 border border-slate-100 space-y-4">
                  <h3 className="font-medium text-slate-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-500" />
                    Referee 1
                  </h3>
                  <div className="space-y-2">
                    <Label htmlFor="referee_name1">Name*</Label>
                    <Input
                      id="referee_name1"
                      name="referee_name1"
                      placeholder="Referee 1 Name"
                      value={formData.referee_name1 || ""}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="referee_address1">Address*</Label>
                    <textarea
                      id="referee_address1"
                      name="referee_address1"
                      placeholder="Referee 1 Address"
                      value={formData.referee_address1 || ""}
                      onChange={handleInputChange}
                      rows={3}
                      className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                  </div>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-6 border border-slate-100 space-y-4">
                  <h3 className="font-medium text-slate-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-500" />
                    Referee 2
                  </h3>
                  <div className="space-y-2">
                    <Label htmlFor="referee_name2">Name*</Label>
                    <Input
                      id="referee_name2"
                      name="referee_name2"
                      placeholder="Referee 2 Name"
                      value={formData.referee_name2 || ""}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="referee_address2">Address*</Label>
                    <textarea
                      id="referee_address2"
                      name="referee_address2"
                      placeholder="Referee 2 Address"
                      value={formData.referee_address2 || ""}
                      onChange={handleInputChange}
                      rows={3}
                      className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                  </div>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-6 border border-slate-100 space-y-4">
                  <h3 className="font-medium text-slate-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-500" />
                    Referee 3
                  </h3>
                  <div className="space-y-2">
                    <Label htmlFor="referee_name3">Name*</Label>
                    <Input
                      id="referee_name3"
                      name="referee_name3"
                      placeholder="Referee 3 Name"
                      value={formData.referee_name3 || ""}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="referee_address3">Address*</Label>
                    <textarea
                      id="referee_address3"
                      name="referee_address3"
                      placeholder="Referee 3 Address"
                      value={formData.referee_address3 || ""}
                      onChange={handleInputChange}
                      rows={3}
                      className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step.type === "olevel" && (
            <div className="space-y-8">
              {olevelExams.map((exam, examIdx) => (
                <OlevelExamBlock
                  key={examIdx}
                  exam={exam}
                  examIdx={examIdx}
                  subjectItems={subjectItems}
                  gradeItems={gradeItems}
                  setOlevelExams={setOlevelExams}
                  setIsDirty={setIsDirty}
                />
              ))}
              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  className="bg-[#6b21a8] hover:bg-purple-800 text-white"
                  onClick={() => {
                    if (olevelExams.length >= 3) {
                      alert(
                        "You can only add a maximum of 3 O'Level sittings.",
                      );
                      return;
                    }
                    setOlevelExams([
                      ...olevelExams,
                      {
                        name: "",
                        number: "",
                        period: "",
                        year: "",
                        subjects: Array.from({ length: 10 }, () => ({
                          subject_id: "",
                          grade_id: "",
                        })),
                      },
                    ]);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Exams
                </Button>
              </div>
            </div>
          )}

          {step.type === "course" && (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <Label>First Choice Course</Label>
                  <Select
                    value={formData.first_choice_program_id?.toString() || ""}
                    onValueChange={(val) => {
                      setFormData((prev) => ({
                        ...prev,
                        first_choice_program_id: val,
                      }));
                      setIsDirty(true);
                    }}
                  >
                    <SelectTrigger className="h-12 border-slate-200">
                      <SelectValue placeholder="--SELECT--" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="z-[9999]">
                      {availableCourses.map((p) => (
                        <SelectItem key={p.id} value={p.id.toString()}>
                          {p.course} {p.department ? `(${p.department})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Second Choice Course</Label>
                  <Select
                    value={formData.second_choice_program_id?.toString() || ""}
                    onValueChange={(val) => {
                      setFormData((prev) => ({
                        ...prev,
                        second_choice_program_id: val,
                      }));
                      setIsDirty(true);
                    }}
                  >
                    <SelectTrigger className="h-12 border-slate-200">
                      <SelectValue placeholder="--SELECT--" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="z-[9999]">
                      {availableCourses.map((p) => (
                        <SelectItem key={p.id} value={p.id.toString()}>
                          {p.course} {p.department ? `(${p.department})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {step.type === "documents" && (() => {
            const checklistDocs = step.documents || [];
            const checklistTypes = new Set(checklistDocs.map((d) => d.type));
            const additionalDocs = Object.values(uploadedDocuments).filter(
              (doc: any) => !checklistTypes.has(doc.document_type)
            );

            // Helper: upload a single file with a given type/name
            const doUpload = async (file: File, finalType: string, finalName: string) => {
              const resp = await ApiClient.uploadDocument(file, formId!, finalType, finalName);
              setUploadedDocuments((prev) => ({
                ...prev,
                [finalType]: {
                  document_id: resp.document_id,
                  document_type: finalType,
                  display_name: finalName,
                  original_filename: file.name,
                  original_size: resp.original_size,
                  compressed_size: resp.compressed_size,
                  is_compressed: resp.is_compressed,
                },
              }));
              return resp;
            };

            const doDelete = async (docId: string, docType: string) => {
              if (confirm("Are you sure you want to delete this document?")) {
                try {
                  setSaving(true);
                  await ApiClient.deleteDocument(parseInt(docId, 10));
                  setUploadedDocuments((prev) => {
                    const next = { ...prev };
                    delete next[docType];
                    return next;
                  });
                } catch (e) {
                  console.error("Delete failed", e);
                  alert("Failed to delete document. Please try again.");
                } finally {
                  setSaving(false);
                }
              }
            };

            const done = checklistDocs.filter(d => uploadedDocuments[d.type]).length;
            const total = checklistDocs.length;
            const allDone = done === total;

            return (
              <div className="space-y-6">
                {/* 1. Header */}
                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-bold text-slate-800 tracking-tight">
                    Required Documents Checklist
                  </h3>
                  <p className="text-sm text-slate-500">
                    Upload all documents required for your application.
                  </p>
                </div>

                {/* 2. Interactive Checklist Panel */}
                <div className="rounded-2xl border border-violet-100 bg-white shadow-sm overflow-hidden">
                  {/* Checklist Rows */}
                  {checklistDocs.length > 0 ? (
                    <ul className="divide-y divide-slate-100">
                      {checklistDocs.map((doc, i) => {
                        const uploadedDoc = uploadedDocuments[doc.type];
                        const uploaded = !!uploadedDoc;
                        const isUploading = uploadingDocType === doc.type;
                        
                        // Referee special note if PG
                        let noteText = "";
                        if (doc.type === 'referee_letter_1') {
                          noteText = "At least one must be from an academic";
                        }

                        return (
                          <li
                            key={doc.type}
                            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-4 transition-colors ${
                              uploaded ? "bg-emerald-50/30" : "hover:bg-slate-50/40"
                            }`}
                          >
                            {/* Left: Indicator & Info */}
                            <div className="flex items-start gap-4">
                              <span
                                className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-all ${
                                  uploaded
                                    ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200"
                                    : "bg-slate-100 border border-slate-200 text-slate-400"
                                }`}
                              >
                                {uploaded ? "✓" : i + 1}
                              </span>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className={`font-semibold ${
                                      uploaded
                                        ? "text-emerald-700 line-through decoration-emerald-300"
                                        : "text-slate-700"
                                    }`}
                                  >
                                    {doc.label}
                                  </span>
                                </div>
                                
                                {noteText && (
                                  <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    {noteText}
                                  </p>
                                )}

                                {uploaded && (
                                  <div className="flex items-center gap-2 text-xs text-slate-400">
                                    <span className="font-medium truncate max-w-[200px] sm:max-w-[300px]">
                                      {uploadedDoc.original_filename}
                                    </span>
                                    {uploadedDoc.compressed_size && (
                                      <span>
                                        ({(uploadedDoc.compressed_size / 1024).toFixed(1)} KB)
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Right: Action Buttons */}
                            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                              {uploaded ? (
                                <Button
                                  disabled={saving}
                                  variant="outline"
                                  className="h-9 px-4 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-bold text-xs"
                                  onClick={() => doDelete(uploadedDoc.document_id, doc.type)}
                                >
                                  Delete
                                </Button>
                              ) : (
                                <>
                                  {isUploading ? (
                                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 px-3 py-1.5 bg-slate-50 rounded-lg">
                                      <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-[#6b21a8] rounded-full animate-spin" />
                                      Uploading...
                                    </div>
                                  ) : (
                                    <>
                                      <Button
                                        disabled={saving}
                                        className="h-9 px-4 rounded-xl bg-[#6b21a8] hover:bg-purple-800 text-white font-bold text-xs transition-colors"
                                        onClick={() => {
                                          const inputEl = document.getElementById(`file-input-${doc.type}`);
                                          if (inputEl) inputEl.click();
                                        }}
                                      >
                                        Upload
                                      </Button>
                                      <input
                                        id={`file-input-${doc.type}`}
                                        type="file"
                                        className="hidden"
                                        accept="image/jpeg,image/jpg,image/png,application/pdf,.doc,.docx"
                                        onChange={async (e) => {
                                          const file = e.target.files?.[0];
                                          if (!file) return;
                                          if (!formId) {
                                            alert("Please save your form first.");
                                            return;
                                          }
                                          try {
                                            setUploadingDocType(doc.type);
                                            setSaving(true);
                                            await doUpload(file, doc.type, doc.label);
                                          } catch (err) {
                                            console.error("Upload failed", err);
                                          } finally {
                                            setUploadingDocType(null);
                                            setSaving(false);
                                            e.target.value = "";
                                          }
                                        }}
                                      />
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="p-8 text-center text-sm text-slate-400">
                      No documents specified for this program template.
                    </div>
                  )}

                  {/* Progress footer */}
                  {checklistDocs.length > 0 && (
                    <div className={`flex items-center gap-4 px-6 py-4 border-t border-slate-100 ${
                      allDone ? "bg-emerald-50/30" : "bg-slate-50/30"
                    }`}>
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            allDone ? "bg-emerald-500" : "bg-[#6b21a8]"
                          }`}
                          style={{ width: `${(done / total) * 100}%` }}
                        />
                      </div>
                      <span
                        className={`text-xs font-bold shrink-0 ${
                          allDone ? "text-emerald-700" : "text-[#6b21a8]"
                        }`}
                      >
                        {done}/{total} {allDone ? "— All documents uploaded! ✓" : "uploaded"}
                      </span>
                    </div>
                  )}
                </div>

                {/* 3. Additional Uploaded Documents (Legacy / custom uploads) */}
                {additionalDocs.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
                      Additional Uploaded Documents
                    </h4>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/30 divide-y divide-slate-100">
                      {additionalDocs.map((doc: any) => (
                        <div key={doc.document_id} className="flex items-center justify-between px-5 py-3 text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-700 truncate">
                              {doc.display_name || doc.document_type}
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {doc.original_filename}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              disabled={saving}
                              variant="outline"
                              className="h-8 px-3 rounded-lg border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-bold text-xs"
                              onClick={() => doDelete(doc.document_id, doc.document_type)}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}



        </CardContent>
      </Card>

      {/* Submit Section */}
      <div className="flex gap-4 justify-end border-t pt-6 pb-12">
        {currentStep > 0 && (
          <Button
            variant="outline"
            disabled={saving || submitting}
            onClick={handlePrevStep}
          >
            Previous
          </Button>
        )}

        {currentStep < steps.length - 1 ? (
          <Button
            onClick={handleNextStep}
            disabled={saving || submitting}
            className="bg-[#6b21a8] hover:bg-purple-800 text-white border-none"
          >
            {saving ? "Saving..." : "Save & Continue"}
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={saveForm}
              disabled={saving || submitting}
              className="gap-2 border-primary/20 text-primary hover:bg-primary/5"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Form"}
            </Button>
            <Button
              onClick={submitApplication}
              disabled={saving || submitting || !formId}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              <Send className="h-4 w-4" />
              {submitting ? "Submitting..." : "Submit Application"}
            </Button>
          </>
        )}
      </div>


    </div>
  );
}
