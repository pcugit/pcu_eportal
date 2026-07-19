"use client";

import type React from "react";
import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Upload, 
  FileText, 
  Calculator, 
  Layers, 
  Eye, 
  ChevronRight, 
  Download, 
  CheckCircle2,
  AlertCircle,
  Loader2,
  Database,
  Search,
  Users,
  FileSpreadsheet,
  Sparkles,
  ArrowRightLeft,
  Clock,
  History,
  ArrowLeft
} from "lucide-react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { saveAs } from "file-saver";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Toaster, toast } from "sonner";

import { ResultDisplay } from "@/components/result-display";
import { SavedResultsView } from "@/components/saved-results-view";
import { generatePDF } from "@/lib/pdf-generator";
import { ModeToggle } from "@/components/mode-toggle";
import { ApiClient } from "@/lib/api";
import { MasterListDownload } from "@/components/master-list-download";

// --- Types & Interfaces ---
interface Course {
  id: string;
  code: string;
  title?: string;
  unit: number;
  score: number;
  gradePoint: number;
  remark?: string;
}

interface StudentInfo {
  name: string;
  matricNumber: string;
  level: string;
  faculty: string;
  department: string;
  academicSession: string;
  semester: string;
}

interface ExcelStudent {
  sn: number;
  matricNumber: string;
  name: string;
  courses: { code: string; score: number; unit: number }[];
}

interface ExcelData {
  metadata: Partial<StudentInfo>;
  students: ExcelStudent[];
}

interface CalculatedResult {
  studentInfo: StudentInfo;
  courses: Course[];
  totalUnits: number;
  totalUnitsPassed: number;
  totalWGP: number;
  cgpa: string;
}

// --- Utils ---
function getGradePoint(score: number): number {
  if (score >= 70) return 5;
  if (score >= 60) return 4;
  if (score >= 50) return 3;
  if (score >= 45) return 2;
  if (score >= 40) return 1;
  return 0;
}

function cleanBracketNumber(value: string): string {
  return value?.replace(/\s*\(\d+\)\s*$/, "").trim() || "";
}

const FACULTY_MAP: Record<string, string> = {
  "INTERNATIONAL RELATIONS": "FACULTY OF SOCIAL AND MANAGEMENT SCIENCES",
  "BUSINESS ADMINISTRATION": "FACULTY OF SOCIAL AND MANAGEMENT SCIENCES",
  "ACCOUNTING": "FACULTY OF SOCIAL AND MANAGEMENT SCIENCES",
  "MASS COMMUNICATION": "FACULTY OF SOCIAL AND MANAGEMENT SCIENCES",
  "COMPUTER SCIENCE": "FACULTY OF PURE AND APPLIED SCIENCE",
  "CYBER SECURITY": "FACULTY OF PURE AND APPLIED SCIENCE",
};

const getFacultyFromDept = (dept: string): string => {
  return FACULTY_MAP[dept.toUpperCase().trim()] || "FACULTY OF SOCIAL AND MANAGEMENT SCIENCES";
};

const normalizeDeptName = (raw: string): string => {
  let d = raw.toUpperCase().trim();
  d = d.replace(/^DEPARTMENT OF\s*/, "").trim();

  if (d.match(/COMPUTER.+CYBER|CYBER.+COMPUTER/)) {
    return "COMPUTER SCIENCE/CYBERSECURITY";
  }
  if (d.includes("BUSINESS ADMINISTRATION") && d.includes("ACCOUNTING")) {
    return "BUSINESS ADMINISTRATION/ACCOUNTING";
  }

  if (d.includes("BUSINESS ADMINISTRATION")) return "BUSINESS ADMINISTRATION";
  if (d.includes("INTERNATIONAL RELATIONS")) return "INTERNATIONAL RELATIONS";
  if (d.includes("MASS COMMUNICATION")) return "MASS COMMUNICATION";
  if (d.includes("COMPUTER SCIENCE")) return "COMPUTER SCIENCE";
  if (d.includes("CYBER SECURITY") || d.includes("CYBERSECURITY")) return "CYBER SECURITY";
  if (d.includes("ACCOUNTING")) return "ACCOUNTING";
  return d;
};

const isCombinedDept = (dept: string): boolean => dept.includes("/");

const splitCombinedDept = (dept: string): string[] => {
  if (dept === "BUSINESS ADMINISTRATION/ACCOUNTING") {
    return ["BUSINESS ADMINISTRATION", "ACCOUNTING"];
  }
  if (dept === "COMPUTER SCIENCE/CYBERSECURITY") {
    return ["COMPUTER SCIENCE", "CYBER SECURITY"];
  }
  return dept.split("/").map(p => normalizeDeptName(p.trim()));
};

const scoreToGradeLetter = (score: any): string => {
  try {
    const s = parseFloat(String(score));
    if (isNaN(s)) return "F";
    if (s >= 70) return "A";
    if (s >= 60) return "B";
    if (s >= 50) return "C";
    if (s >= 45) return "D";
    if (s >= 40) return "E";
    return "F";
  } catch {
    return "F";
  }
};

const formatScoreWithGrade = (score: any): string => {
  if (score === null || score === undefined || score === "" || score === "-") return "-";
  try {
    const s = Math.round(parseFloat(String(score)));
    if (isNaN(s)) return String(score);
    return `${s}(${scoreToGradeLetter(s)})`;
  } catch {
    return String(score);
  }
};

// --- API Helpers ---
async function enrichCoursesBatch(courseCodes: string[], department: string, courseEndpoint = "/results/courses"): Promise<Map<string, { title: string; units: number; remark: string }>> {
  const uniqueCodes = [...new Set(courseCodes)];
  const result = new Map<string, { title: string; units: number; remark: string }>();
  
  // Fetch course details in parallel for the whole sheet
  await Promise.all(
    uniqueCodes.map(async (code) => {
      try {
        const { data } = await ApiClient.fetch(`${courseEndpoint}?code=${encodeURIComponent(code)}&department=${encodeURIComponent(department)}`);
        result.set(code, {
          title: data.course_title,
          units: data.units,
          remark: data.remark ?? "",
        });
      } catch {}
    })
  );
  return result;
}

// --- Parser ---
function parseExcelSheet(sheet: XLSX.WorkSheet, currentSettings?: any): ExcelData {
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
  const result: ExcelData = { 
    metadata: {
      academicSession: currentSettings?.current_academic_session || "2024/2025",
      semester: currentSettings?.current_semester || "First Semester"
    }, 
    students: [] 
  };

  // Heuristic metadata extraction
  for (let i = 0; i < Math.min(15, data.length); i++) {
    const rowText = (data[i] || []).join(" ").toUpperCase();
    if (rowText.includes("LEVEL")) {
      const match = rowText.match(/LEVEL\s*:\s*(\d+)/i);
      if (match) result.metadata.level = match[1];
    }
    if (rowText.includes("FACULTY OF")) {
      const match = rowText.match(/FACULTY\s+OF\s+(.+?)(?:\s{2,}|$)/i);
      if (match) result.metadata.faculty = match[1].trim();
    }
    if (rowText.includes("DEPARTMENT OF")) {
      const match = rowText.match(/DEPARTMENT\s+OF\s+(.+)/i);
      if (match) result.metadata.department = cleanBracketNumber(match[1]);
    }
    if (rowText.includes("ACADEMIC SESSION")) {
      const match = rowText.match(/ACADEMIC\s+SESSION\s*:\s*(\d{4}\/\d{4})/i);
      if (match) result.metadata.academicSession = match[1];
    }
    if (rowText.includes("SEMESTER")) {
      const match = rowText.match(/(FIRST|SECOND|THIRD)\s+SEMESTER/i);
      if (match) result.metadata.semester = match[1];
    }
  }

  // Find header row for student data
  let headerRowIndex = -1;
  let snCol = -1, matricCol = -1, nameCol = -1, courseStartCol = -1;
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] || "").toLowerCase().trim();
      if (cell === "s/n" || cell === "sn" || cell === "s.n") { snCol = j; headerRowIndex = i; }
      else if ((cell.includes("matric") || cell.includes("mat.")) && headerRowIndex === i) { matricCol = j; }
      else if (cell === "name" && headerRowIndex === i) { nameCol = j; courseStartCol = j + 1; }
    }
    if (headerRowIndex !== -1 && snCol !== -1 && matricCol !== -1 && nameCol !== -1) break;
  }

  if (headerRowIndex === -1) return result;

  // Extract course codes
  const courseCodes: string[] = [];
  const courseUnits: number[] = [];
  const headerRow = data[headerRowIndex];
  for (let j = courseStartCol; j < headerRow.length; j++) {
    const code = String(headerRow[j] || "").trim().toUpperCase();
    if (code && code !== "TOTAL" && code !== "GRADE") {
      let cleanCode = code;
      let unit = 0;
      const unitMatch = code.match(/\((\d+)\)/);
      if (unitMatch) {
        unit = Number.parseInt(unitMatch[1], 10);
        cleanCode = code.replace(/\s*\(\d+\)/, "").trim();
      }
      courseCodes.push(cleanCode);
      courseUnits.push(unit);
    } else if (code === "TOTAL" || code === "GRADE") break;
  }

  // Parse student rows
  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    const sn = String(row[snCol] || "").trim();
    if (!sn || isNaN(Number(sn))) continue;

    const student: ExcelStudent = {
      sn: Number(sn),
      matricNumber: String(row[matricCol] || "-").trim(),
      name: String(row[nameCol] || "-").trim(),
      courses: [],
    };

    for (let j = 0; j < courseCodes.length; j++) {
      const scoreCol = courseStartCol + j;
      const rawVal = String(row[scoreCol] || "").trim();
      
      // Skip courses the candidate didn't offer ("-" or empty)
      if (rawVal === "-" || rawVal === "") continue;

      // Extract numeric score from strings like "45 (D)" or "45 D"
      let val = rawVal.replace(/\s*\([A-Za-z]+\)/g, "").replace(/\s+[A-Za-z]+$/g, "");
      const numericMatch = val.match(/\d+\.?\d*/);
      
      if (numericMatch) {
         student.courses.push({ 
           code: courseCodes[j], 
           unit: courseUnits[j], 
           score: Number(numericMatch[0]) 
         });
      }
    }
    result.students.push(student);
  }

  return result;
}

// --- Main Component ---
type ProcessorView = "upload" | "processing" | "results" | "saved" | "master-list" | "converter" | "pending";

export default function ModernResultSystem() {
  const pathname = usePathname();
  const isPgProcessor = pathname?.startsWith("/pgadmin") ?? false;
  const processorLandingView: ProcessorView = isPgProcessor
    ? pathname?.endsWith("/master-list")
      ? "master-list"
      : pathname?.endsWith("/records")
        ? "saved"
        : "pending"
    : "upload";
  const [view, setView] = useState<ProcessorView>(processorLandingView);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [sysSettings, setSysSettings] = useState<any>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await ApiClient.getGlobalSettings();
        setSysSettings(data);
      } catch {}
    }
    loadSettings();
  }, []);
  const [zipProgress, setZipProgress] = useState(0);
  const [isZipping, setIsZipping] = useState(false);
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const resultApiBase = isPgProcessor ? "/pg-results" : "/results";
  const processorHome = isPgProcessor ? "/pgadmin/dashboard" : "/ict/dashboard";
  const processorOwner = isPgProcessor ? "PG Admin" : "ICT";
  const pgPageTitle = view === "master-list"
    ? "PG Master List"
    : view === "saved"
      ? "PG Result Records"
      : "Result Submission";

  useEffect(() => {
    if (isPgProcessor) setView(processorLandingView);
  }, [isPgProcessor, pathname, processorLandingView]);

  useEffect(() => {
    if (authLoading) return;
    const allowed = isPgProcessor
      ? (user?.role === "pgadmin" || user?.role === "pgdean")
      : (user?.role === "admin" || user?.role === "ictdirector");
    if (!isAuthenticated || !allowed) {
      router.replace("/staff/login");
      return;
    }
  }, [isAuthenticated, user, authLoading, router, isPgProcessor]);

  const [pendingSubmissions, setPendingSubmissions] = useState<any[]>([]);
  const [processedSubmissions, setProcessedSubmissions] = useState<any[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [currentPendingId, setCurrentPendingId] = useState<number | null>(null);
  const [previewSubmission, setPreviewSubmission] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [submissionTab, setSubmissionTab] = useState<"pending" | "processed" | "amendments">("pending");
  const [selectedSubmissionDepartment, setSelectedSubmissionDepartment] = useState<string | null>(null);
  const [processingBatch, setProcessingBatch] = useState<string | null>(null);
  const [amendmentRequests, setAmendmentRequests] = useState<any[]>([]);
  const [loadingAmendments, setLoadingAmendments] = useState(false);
  const [reviewingAmendment, setReviewingAmendment] = useState<number | null>(null);
  const [amendmentReview, setAmendmentReview] = useState<{ amendment: any; decision: "approved" | "rejected" } | null>(null);
  const [amendmentReviewNote, setAmendmentReviewNote] = useState("");
  const [amendmentReviewError, setAmendmentReviewError] = useState("");
  const [auditTarget, setAuditTarget] = useState<any | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const fetchAmendmentRequests = useCallback(async () => {
    setLoadingAmendments(true);
    try {
      const { data } = await ApiClient.fetch<any>("/scores/amendments");
      setAmendmentRequests(data?.amendments || []);
    } catch (error: any) {
      toast.error(error.message || "Failed to load correction requests");
    } finally {
      setLoadingAmendments(false);
    }
  }, []);

  const openAmendmentReview = (amendment: any, decision: "approved" | "rejected") => {
    setAmendmentReview({ amendment, decision });
    setAmendmentReviewNote("");
    setAmendmentReviewError("");
  };

  const reviewAmendment = async () => {
    if (!amendmentReview) return;
    const { amendment, decision } = amendmentReview;
    if (decision === "rejected" && amendmentReviewNote.trim().length < 3) {
      setAmendmentReviewError("Enter a rejection reason of at least 3 characters.");
      return;
    }
    setAmendmentReviewError("");
    setReviewingAmendment(amendment.id);
    try {
      const { data } = await ApiClient.fetch(`/scores/amendments/${amendment.id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision, review_note: amendmentReviewNote.trim() }),
      });
      toast.success(data?.message || `Correction request ${decision}`);
      setAmendmentReview(null);
      await fetchAmendmentRequests();
    } catch (error: any) {
      setAmendmentReviewError(error.message || "Failed to review correction request");
    } finally {
      setReviewingAmendment(null);
    }
  };

  const viewScoreAudit = async (amendment: any) => {
    setAuditTarget(amendment);
    setAuditLogs([]);
    setLoadingAudit(true);
    try {
      const { data } = await ApiClient.fetch<any>(
        `/scores/audit/${amendment.score_id}?course_source=${amendment.course_source}`
      );
      setAuditLogs(data?.audit_log || []);
    } catch (error: any) {
      toast.error(error.message || "Failed to load score audit trail");
      setAuditTarget(null);
    } finally {
      setLoadingAudit(false);
    }
  };

  const previewRows = useMemo(() => {
    if (!previewSubmission) return [];
    try {
      const payload = typeof previewSubmission.payload === "string"
        ? JSON.parse(previewSubmission.payload)
        : previewSubmission.payload;
      if (!Array.isArray(payload)) return [];
      return payload.flatMap((item: any) => {
        const info = item.studentInfo || {};
        return (item.courses || []).map((course: any) => ({
          name: info.name || "Unknown student",
          matricNumber: info.matricNumber || "-",
          level: info.level || "-",
          courseCode: course.code || "-",
          ca: course.ca,
          exam: course.exam,
          total: course.score ?? course.total,
        }));
      });
    } catch {
      return [];
    }
  }, [previewSubmission]);

  const pendingDepartmentGroups = useMemo(
    () => submissionDepartmentGroups(pendingSubmissions),
    [pendingSubmissions]
  );
  const processedDepartmentGroups = useMemo(
    () => submissionDepartmentGroups(processedSubmissions),
    [processedSubmissions]
  );
  const visiblePendingSubmissions = useMemo(
    () => selectedSubmissionDepartment
      ? pendingSubmissions.filter((submission) => submissionBelongsToDepartment(submission, selectedSubmissionDepartment))
      : pendingSubmissions,
    [pendingSubmissions, selectedSubmissionDepartment]
  );
  const visibleProcessedSubmissions = useMemo(
    () => selectedSubmissionDepartment
      ? processedSubmissions.filter((submission) => submissionBelongsToDepartment(submission, selectedSubmissionDepartment))
      : processedSubmissions,
    [processedSubmissions, selectedSubmissionDepartment]
  );

  const processSubmissionBatch = async (submissions: any[], label: string) => {
    if (!submissions.length || !confirm(`Process all pending submissions for ${label}?`)) return;
    setProcessingBatch(label);
    let processed = 0;
    const failures: string[] = [];
    try {
      const ordered = [...submissions].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      for (const submission of ordered) {
        const results = submissionPayload(submission);
        if (!results.length) {
          failures.push(submission.file_name || `Submission ${submission.id}`);
          continue;
        }
        try {
          await ApiClient.fetch(resultApiBase, {
            method: "POST",
            body: JSON.stringify({ pendingId: submission.id, results }),
          });
          processed += 1;
        } catch {
          failures.push(submission.file_name || `Submission ${submission.id}`);
        }
      }
      ApiClient.clearCache();
      await fetchPendingSubmissions();
      if (processed) toast.success(`${processed} submission${processed === 1 ? "" : "s"} processed successfully.`);
      if (failures.length) toast.error(`${failures.length} submission${failures.length === 1 ? "" : "s"} could not be processed.`);
    } finally {
      setProcessingBatch(null);
    }
  };

  const fetchPendingSubmissions = useCallback(async () => {
    setLoadingPending(true);
    try {
      const [{ data: pending }, { data: processed }] = await Promise.all([
        ApiClient.fetch(`${resultApiBase}/pending?status=pending`),
        ApiClient.fetch(`${resultApiBase}/pending?status=processed`)
      ]);
      setPendingSubmissions(pending);
      setProcessedSubmissions(processed);
    } catch (err) {
      toast.error("Failed to load submissions");
    } finally {
      setLoadingPending(false);
    }
  }, [resultApiBase]);

  useEffect(() => {
    if (isPgProcessor) {
      void fetchPendingSubmissions();
    }
  }, [fetchPendingSubmissions, isPgProcessor]);

  useEffect(() => {
    if (view === "pending") void fetchAmendmentRequests();
  }, [view, fetchAmendmentRequests]);

  const importPending = async (submission: any) => {
    if (submission.file_content) {
      setIsProcessing(true);
      setView("processing");
      setProgress(0);
      toast.info("Normalizing raw sheet from submission...");
      
      try {
        const base64Data = submission.file_content.split(',')[1];
        const binaryString = window.atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        const wb = XLSX.read(bytes.buffer, { type: "array" });
        
        // Detection: Should we normalize?
        // Raw files have blocks starting with "DEPARTMENT OF" as the ONLY content in a row
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
        const isRaw = rows.some(r => {
          const nonNull = r.filter(c => c !== null && String(c).trim() !== "");
          return nonNull.length === 1 && String(nonNull[0]).toUpperCase().includes("DEPARTMENT OF");
        });

        let finalWb = wb;
        if (isRaw) {
          toast.info("Raw collation detected. Normalizing...");
          finalWb = normalizeRawWorkbook(wb, convSession, convSemester);
        } else {
          toast.info("Standard sheet detected. Processing directly.");
        }
        
        setWorkbook(finalWb);
        setSheets(finalWb.SheetNames);
        
        setCurrentPendingId(submission.id);
        await runCalculation(true, finalWb);
        toast.success("Results processed successfully!");
      } catch (err: any) {
        toast.error("Failed to normalize/process: " + err.message);
        setIsProcessing(false);
        setView(processorLandingView);
      }
      return;
    }

    // Fallback to pre-parsed payload if no file_content
    const payload = typeof submission.payload === 'string' ? JSON.parse(submission.payload) : submission.payload;
    setCurrentPendingId(submission.id);
    
    const results: CalculatedResult[] = payload.map((item: any) => {
      const enriched = item.courses.map((c: any) => ({
        ...c,
        id: Math.random().toString(36).substr(2, 9),
        gradePoint: getGradePoint(c.score)
      }));
      
      const totalUnits = enriched.reduce((s: number, c: any) => s + (c.unit || 3), 0);
      const totalUnitsPassed = enriched.reduce((s: number, c: any) => (c.gradePoint === 0 ? s : s + (c.unit || 3)), 0);
      const totalWGP = enriched.reduce((s: number, c: any) => s + (c.unit || 3) * c.gradePoint, 0);
      const cgpa = totalUnits ? (totalWGP / totalUnits).toFixed(2) : "0.00";

      return {
        studentInfo: item.studentInfo,
        courses: enriched,
        totalUnits,
        totalUnitsPassed,
        totalWGP,
        cgpa
      };
    });

    const deptName = submission.sheet_name || payload[0]?.studentInfo.department || "Imported";
    setResultsByDept({ [deptName]: results });
    setActiveDeptTab(deptName);
    setView("results");
    toast.success("Imported results into processor!");
  };

  const closeDeleteConfirmation = () => {
    if (isDeleting) return;
    setDeleteTarget(null);
    setDeletePassword("");
    setDeleteError("");
  };

  const deletePending = async () => {
    if (!deleteTarget || !deletePassword) {
      setDeleteError("Enter your password to confirm deletion.");
      return;
    }

    setIsDeleting(true);
    setDeleteError("");
    try {
      await ApiClient.fetch(`${resultApiBase}/pending?id=${deleteTarget.id}`, {
        method: "DELETE",
        body: JSON.stringify({ password: deletePassword }),
      });
      toast.success("Deleted submission");
      setDeleteTarget(null);
      setDeletePassword("");
      fetchPendingSubmissions();
    } catch (err: any) {
      const message = err.message || "Failed to delete submission";
      setDeleteError(message);
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  const downloadOriginal = (sub: any) => {
    if (!sub.file_content) {
      toast.error("No file data found for this submission.");
      return;
    }
    try {
      const link = document.createElement("a");
      link.href = sub.file_content;
      link.download = sub.file_name || "original_result.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Downloading original file...");
    } catch (err) {
      toast.error("Failed to download file.");
    }
  };
  const [resultsByDept, setResultsByDept] = useState<Record<string, CalculatedResult[]>>({});
  const [activeDeptTab, setActiveDeptTab] = useState<string>("");
  const [selectedResult, setSelectedResult] = useState<CalculatedResult | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const converterInputRef = useRef<HTMLInputElement>(null);
  const [convSession, setConvSession] = useState("2023/2024");
  const [convSemester, setConvSemester] = useState("FIRST");

  const normalizeRawWorkbook = (wb: XLSX.WorkBook, session: string, semester: string) => {
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];

    // --- 1. Parsing Pass ---
    interface Block {
      blockDept: string;
      level: string;
      courseCode: string;
      students: { matric: string; name: string; total: number | string | null }[];
    }

    const blocks: Block[] = [];
    let i = 0;
    while (i < rows.length) {
      const row = rows[i];
      const nonNull = row.filter(c => c !== null && String(c).trim() !== "");
      if (nonNull.length === 1 && String(nonNull[0]).toUpperCase().includes("DEPARTMENT OF")) {
        const blockDept = normalizeDeptName(String(nonNull[0]));
        let levelStr = "";
        let courseCode = "";
        i++;

        while (i < rows.length) {
          const r = rows[i].filter(c => c !== null && String(c).trim() !== "");
          if (r.length > 0) {
            const m = String(r[0]).match(/(\d+)/);
            levelStr = m ? m[1] : "";
            i++;
            break;
          }
          i++;
        }
        while (i < rows.length) {
          const r = rows[i].filter(c => c !== null && String(c).trim() !== "");
          if (r.length > 0) {
            courseCode = String(r[0]).replace(/COURSE CODE:/i, "").trim();
            i++;
            break;
          }
          i++;
        }
        while (i < rows.length) {
          if (rows[i].some(c => c !== null && String(c).trim() !== "")) { i++; break; }
          i++;
        }
        while (i < rows.length) {
          if (rows[i].some(c => c !== null && String(c).trim() !== "")) { i++; break; }
          i++;
        }

        const students: Block["students"] = [];
        while (i < rows.length) {
          const r = rows[i];
          const nonNullR = r.filter(c => c !== null && String(c).trim() !== "");
          if (nonNullR.length === 0) { i++; break; }
          if (nonNullR.length === 1 && String(nonNullR[0]).toUpperCase().includes("DEPARTMENT OF")) break;

          let matric = "";
          for (const cell of r) {
            // Updated regex: Matches common PCU patterns: 2024/0001, 2024/CSC/001, 2024/PTE/001
            if (cell && String(cell).match(/\d{4}\/[A-Z0-9\/]+\/\d+/i)) {
              matric = String(cell).trim();
              break;
            }
          }

          if (matric) {
            const name = nonNullR.length >= 2 ? String(nonNullR[1]).trim() : "";
            let total: number | string | null = null;
            for (let j = r.length - 1; j >= 0; j--) {
              const cellVal = String(r[j]).trim();
              if (cellVal === "-") {
                total = "-";
                break;
              }
              const val = parseFloat(cellVal);
              if (!isNaN(val) && r[j] !== null && cellVal !== "" && val !== parseFloat(String(nonNullR[0]))) {
                total = val;
                break;
              }
            }
            students.push({ matric, name, total });
          }
          i++;
        }

        if (courseCode && students.length > 0) {
          blocks.push({ blockDept, level: levelStr, courseCode, students });
        }
      } else {
        i++;
      }
    }

    // --- 2. Resolution Pass ---
    interface AppearanceInfo {
      name: string;
      clear: Set<string>;
      combined: Set<string>;
      levelMap: Record<string, string>;
    }
    const appearances: Record<string, AppearanceInfo> = {};

    blocks.forEach(b => {
      b.students.forEach(s => {
        if (!appearances[s.matric]) {
          appearances[s.matric] = { name: s.name, clear: new Set(), combined: new Set(), levelMap: {} };
        }
        const info = appearances[s.matric];
        if (!info.name && s.name) info.name = s.name;
        if (isCombinedDept(b.blockDept)) {
          info.combined.add(b.blockDept);
          splitCombinedDept(b.blockDept).forEach(p => {
            if (!info.levelMap[p]) info.levelMap[p] = b.level;
          });
        } else {
          info.clear.add(b.blockDept);
          info.levelMap[b.blockDept] = b.level;
        }
      });
    });

    const resolution: Record<string, { dept: string; level: string }> = {};
    Object.entries(appearances).forEach(([matric, info]) => {
      let resolvedDept = "";
      let resolvedLevel = "";
      if (info.clear.size === 1) {
        resolvedDept = Array.from(info.clear)[0];
        resolvedLevel = info.levelMap[resolvedDept] || "";
      } else if (info.clear.size > 1) {
        resolvedDept = Array.from(info.clear)[0];
        resolvedLevel = info.levelMap[resolvedDept] || "";
      } else {
        const candidates: string[] = [];
        info.combined.forEach(combo => {
          splitCombinedDept(combo).forEach(p => {
            if (!candidates.includes(p)) candidates.push(p);
          });
        });
        resolvedDept = candidates[0] || "GENERAL";
        resolvedLevel = info.levelMap[resolvedDept] || "";
      }
      resolution[matric] = { dept: resolvedDept, level: resolvedLevel };
    });

    // --- 3. Grouping Pass ---
    const groups: Record<string, {
      dept: string;
      level: string;
      courses: string[];
      students: Record<string, string>;
      scores: Record<string, Record<string, number | string | null>>;
    }> = {};

    blocks.forEach(block => {
      block.students.forEach(s => {
        const res = resolution[s.matric];
        const key = `${res.dept}_${res.level}`;
        if (!groups[key]) {
          groups[key] = {
            dept: res.dept,
            level: res.level,
            courses: [],
            students: {},
            scores: {}
          };
        }
        const g = groups[key];
        if (!g.courses.includes(block.courseCode)) g.courses.push(block.courseCode);
        if (!g.students[s.matric]) g.students[s.matric] = s.name;
        if (!g.scores[s.matric]) g.scores[s.matric] = {};
        g.scores[s.matric][block.courseCode] = s.total;
      });
    });

    // --- 4. Export Pass ---
    const newWb = XLSX.utils.book_new();
    const groupEntries = Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
    
    groupEntries.forEach(([key, data]) => {
      const faculty = getFacultyFromDept(data.dept);
      const totalCols = 3 + data.courses.length;
      const aoa: any[][] = [
        [],
        ["", "PRECIOUS CORNERSTONE UNIVERSITY"],
        ["", faculty],
        ["", `DEPARTMENT OF ${data.dept}`],
        ["", `${data.dept} RESULT SUMMARY`],
        ["", `ACADEMIC SESSION: ${session}   SEMESTER: ${semester} SEMESTER   LEVEL: ${data.level}`],
        [],
        ["", "S/N", "Matric No", "NAME", ...data.courses]
      ];

      Object.entries(data.students).forEach(([matric, name], idx) => {
        const row = ["", idx + 1, matric, name];
        data.courses.forEach(code => {
          row.push(formatScoreWithGrade(data.scores[matric][code]));
        });
        aoa.push(row);
      });

      const sheet = XLSX.utils.aoa_to_sheet(aoa);
      sheet["!cols"] = [
        { wch: 3 }, { wch: 5 }, { wch: 18 }, { wch: 35 },
        ...data.courses.map(() => ({ wch: 14 }))
      ];
      sheet["!merges"] = [1, 2, 3, 4, 5].map(r => ({
        s: { r, c: 1 }, e: { r, c: totalCols }
      }));
      XLSX.utils.book_append_sheet(newWb, sheet, `${data.dept} (${data.level})`.replace(/\//g, "-").substring(0, 31));
    });

    return newWb;
  };

  const handleNormalization = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsNormalizing(true);
    setProgress(0);
    toast.info("Analyzing and collating data...");

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const normalizedWb = normalizeRawWorkbook(wb, convSession, convSemester);
      
      XLSX.writeFile(normalizedWb, `NORMALIZED_RESULTS_${convSession.replace("/", "_")}.xlsx`);
      toast.success("Normalization complete! File downloaded.");
    } catch (err: any) {
      console.error(err);
      toast.error("Process failed: " + err.message);
    } finally {
      setIsNormalizing(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array", cellStyles: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const parsed = parseExcelSheet(sheet, sysSettings);
      setWorkbook(wb);
      setSheets(wb.SheetNames);
      if (wb.SheetNames.length > 0) setSelectedSheet(wb.SheetNames[0]);
      toast.success("File uploaded successfully!");
    };
    reader.readAsArrayBuffer(file);
  };

  const calculateSheet = async (wb: XLSX.WorkBook, sheetName: string) => {
    const sheet = wb.Sheets[sheetName];
    const data = parseExcelSheet(sheet);
    const department = cleanBracketNumber(sheetName) || "-";
    const results: CalculatedResult[] = [];

    // 1. Collect all unique course codes in this sheet
    const allCodes = new Set<string>();
    data.students.forEach(s => s.courses.forEach(c => allCodes.add(c.code)));

    // 2. Fetch metadata for all courses in one batch (optimized)
    const courseMetaMap = await enrichCoursesBatch(Array.from(allCodes), department, `${resultApiBase}/courses`);

    // 3. Process students
    for (let i = 0; i < data.students.length; i++) {
      const student = data.students[i];
      
      const enriched: Course[] = student.courses.map((c, idx) => {
        const meta = courseMetaMap.get(c.code);
        return {
          id: `${student.matricNumber}-${idx}`,
          code: c.code,
          unit: meta?.units ?? c.unit ?? 3,
          score: c.score,
          gradePoint: getGradePoint(c.score),
          title: meta?.title ?? c.code,
          remark: meta?.remark ?? ""
        };
      });

      const totalUnits = enriched.reduce((s, c) => s + (c.unit || 3), 0);
      const totalUnitsPassed = enriched.reduce((s, c) => (c.gradePoint === 0 ? s : s + (c.unit || 3)), 0);
      const totalWGP = enriched.reduce((s, c) => s + (c.unit || 3) * c.gradePoint, 0);
      const cgpa = totalUnits ? (totalWGP / totalUnits).toFixed(2) : "0.00";

      results.push({
        studentInfo: {
          name: student.name,
          matricNumber: student.matricNumber,
          level: data.metadata.level || "-",
          faculty: data.metadata.faculty || "-",
          department,
          academicSession: data.metadata.academicSession || "-",
          semester: data.metadata.semester || "-",
        },
        courses: enriched,
        totalUnits,
        totalUnitsPassed,
        totalWGP,
        cgpa,
      });
    }
    return results;
  };

  const runCalculation = async (all = false, customWb?: XLSX.WorkBook) => {
    const wbToUse = customWb || workbook;
    if (!wbToUse) return;
    setIsProcessing(true);
    setView("processing");
    setProgress(0);

    const sheetNames = all ? wbToUse.SheetNames : [selectedSheet];
    const finalResults: Record<string, CalculatedResult[]> = {};

    for (let i = 0; i < sheetNames.length; i++) {
      const sName = sheetNames[i];
      const res = await calculateSheet(wbToUse, sName);
      finalResults[sName] = res;
      setProgress(Math.round(((i + 1) / sheetNames.length) * 100));
    }

    setResultsByDept(finalResults);
    setActiveDeptTab(sheetNames[0]);
    setIsProcessing(false);
    setView("results");
    toast.success("Calculations completed!");
  };

  const downloadZip = async (deptName: string, results: CalculatedResult[]) => {
    setIsZipping(true);
    setZipProgress(0);
    const zip = new JSZip();

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      const blob = await generatePDF(res, { returnBlob: true }) as Blob;
      const safeName = `${res.studentInfo.name}_${res.studentInfo.matricNumber}`.replace(/[^a-zA-Z0-9]/g, "_");
      zip.file(`${safeName}.pdf`, blob);
      setZipProgress(Math.round(((i + 1) / results.length) * 100));
    }

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${deptName.replace(/\s+/g, "_")}_Results.zip`);
    setIsZipping(false);
    toast.success("ZIP downloaded!");
  };

  const saveDeptToDB = async (deptName: string, results: CalculatedResult[]) => {
    if (results.length === 0) return;
    const savePromise = ApiClient.fetch(resultApiBase, {
      method: "POST",
      body: JSON.stringify({
        pendingId: currentPendingId,
        results: results.map((r) => ({
          studentInfo: r.studentInfo,
          courses: r.courses.map((c) => ({
            code: c.code,
            title: c.title,
            unit: c.unit,
            ca: (c as any).ca,
            exam: (c as any).exam,
            score: c.score,
            grade: getGradePoint(c.score).toString(),
            gpa: c.gradePoint,
          })),
        }))
      }),
    });

    toast.promise(savePromise, {
      loading: `Saving ${deptName} results to database...`,
      success: () => {
        setCurrentPendingId(null);
        fetchPendingSubmissions(); // Refresh lists
        return `Successfully saved ${results.length} results for ${deptName}`;
      },
      error: (err) => err.message || "Error committing to database",
    });
  };

  const filteredStudents = useMemo(() => {
    const list = resultsByDept[activeDeptTab] || [];
    if (!searchTerm) return list;
    return list.filter(s => 
      s.studentInfo.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      s.studentInfo.matricNumber.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [resultsByDept, activeDeptTab, searchTerm]);

  const renderDepartmentSelector = (groups: ReturnType<typeof submissionDepartmentGroups>) => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((group) => (
        <Card key={group.name} className="h-full border-slate-200 transition-colors hover:border-blue-400 dark:border-slate-700 dark:hover:border-blue-600">
          <CardContent className="flex items-center gap-3 p-5">
            <button type="button" onClick={() => setSelectedSubmissionDepartment(group.name)} className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left">
              <div className="min-w-0">
                <h3 className="truncate font-bold text-slate-900 dark:text-slate-100">{group.name}</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {group.courseCount} course{group.courseCount !== 1 ? "s" : ""} uploaded
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="secondary">{group.submissionCount}</Badge>
                <ChevronRight className="h-5 w-5 text-slate-400" />
              </div>
            </button>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const renderSubmissionCards = (submissions: any[], processed = false) => (
    <div className="grid grid-cols-1 gap-4">
      {submissions.map((sub) => {
        const details = submissionDetails(sub);
        return (
          <Card key={sub.id} className={`overflow-hidden border-slate-100 transition-shadow hover:shadow-md ${processed ? "opacity-80" : ""}`}>
            <div className="flex flex-col items-start justify-between gap-4 p-5 md:flex-row md:items-center">
              <div className="flex min-w-0 items-center gap-4">
                <div className={`shrink-0 rounded-xl p-3 ${processed ? "bg-emerald-100 text-emerald-600" : "bg-orange-100 text-orange-600"}`}>
                  {processed ? <CheckCircle2 className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">
                    {details.courseLabel} - {details.sessionLabel} - {details.semesterLabel}
                  </h4>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {sub.staff_name || "Lecturer"}</span>
                    <span aria-hidden="true">&bull;</span>
                    <span>{new Date(sub.created_at).toLocaleDateString()}</span>
                    <span aria-hidden="true">&bull;</span>
                    <Badge variant="outline" className="py-0 text-[10px]">{details.uploadType}</Badge>
                    {processed && <Badge className="border-none bg-emerald-50 py-0 text-[10px] text-emerald-700 hover:bg-emerald-100">Processed</Badge>}
                  </div>
                </div>
              </div>
              <div className="flex w-full gap-2 md:w-auto">
                {!processed && <Button variant="ghost" onClick={() => setDeleteTarget(sub)} className="text-xs font-bold text-red-500 hover:bg-red-100 hover:text-red-600">Delete</Button>}
                {isPgProcessor ? (
                  <Button variant="outline" onClick={() => setPreviewSubmission(sub)} className="rounded-lg border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
                    <Eye className="mr-1 h-3 w-3" /> View
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => downloadOriginal(sub)} className="rounded-lg border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
                    <Download className="mr-1 h-3 w-3" /> {processed ? "Archived Original" : "Download"}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-x-clip font-sans">
      <Toaster position="top-right" richColors />

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && closeDeleteConfirmation()}>
        <DialogContent className="max-w-md">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void deletePending();
            }}
            className="space-y-5"
          >
            <DialogHeader>
              <DialogTitle>Confirm Result Deletion</DialogTitle>
              <DialogDescription>
                This permanently deletes the lecturer&apos;s uploaded result. Enter your password to continue.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="delete-result-password">Password</Label>
              <Input
                id="delete-result-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={deletePassword}
                onChange={(event) => {
                  setDeletePassword(event.target.value);
                  if (deleteError) setDeleteError("");
                }}
                aria-invalid={Boolean(deleteError)}
                aria-describedby={deleteError ? "delete-result-error" : undefined}
                disabled={isDeleting}
                className={deleteError ? "border-red-500 focus-visible:ring-red-500" : ""}
              />
              {deleteError && (
                <p id="delete-result-error" role="alert" className="text-sm font-medium text-red-600">
                  {deleteError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDeleteConfirmation} disabled={isDeleting}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={isDeleting || !deletePassword}>
                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete Result
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewSubmission)} onOpenChange={(open) => !open && setPreviewSubmission(null)}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden p-0">
          <DialogHeader className="border-b border-slate-200 dark:border-slate-800 px-6 py-5 pr-12">
            <DialogTitle className="text-xl">PG Result Submission</DialogTitle>
            <DialogDescription>
              {previewSubmission?.file_name || "Submitted results"}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto px-6 pb-6">
            {previewRows.length > 0 ? (
              <table className="w-full min-w-[700px] text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500">
                    <th className="px-3 py-3 font-semibold">Student</th>
                    <th className="px-3 py-3 font-semibold">Matric No.</th>
                    <th className="px-3 py-3 font-semibold">Level</th>
                    <th className="px-3 py-3 font-semibold">Course</th>
                    <th className="px-3 py-3 text-right font-semibold">CA</th>
                    <th className="px-3 py-3 text-right font-semibold">Exam</th>
                    <th className="px-3 py-3 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row: any, index: number) => (
                    <tr key={`${row.matricNumber}-${row.courseCode}-${index}`} className="border-b border-slate-100 dark:border-slate-800/70">
                      <td className="px-3 py-3 font-medium text-slate-900 dark:text-slate-100">{row.name}</td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{row.matricNumber}</td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{row.level}</td>
                      <td className="px-3 py-3 font-medium text-blue-700 dark:text-blue-300">{row.courseCode}</td>
                      <td className="px-3 py-3 text-right">{row.ca ?? "-"}</td>
                      <td className="px-3 py-3 text-right">{row.exam ?? "-"}</td>
                      <td className="px-3 py-3 text-right font-bold">{row.total ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-12 text-center text-sm text-slate-500">
                No result rows were found in this submission.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(amendmentReview)}
        onOpenChange={(open) => {
          if (!open && reviewingAmendment === null) setAmendmentReview(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{amendmentReview?.decision === "approved" ? "Approve Score Correction" : "Reject Score Correction"}</DialogTitle>
            <DialogDescription>
              Review the proposed values and record the decision. Approved changes update the official result records and audit trail.
            </DialogDescription>
          </DialogHeader>
          {amendmentReview && (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
                <p className="font-bold text-slate-900 dark:text-slate-100">
                  {amendmentReview.amendment.course_code} - {amendmentReview.amendment.matric_number}
                </p>
                <div className="mt-2 flex gap-6 text-slate-600 dark:text-slate-300">
                  <span>CA: {amendmentReview.amendment.old_ca_score} → {amendmentReview.amendment.proposed_ca_score}</span>
                  <span>Exam: {amendmentReview.amendment.old_exam_score} → {amendmentReview.amendment.proposed_exam_score}</span>
                </div>
                <p className="mt-2 text-slate-500">Reason: {amendmentReview.amendment.reason}</p>
              </div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {amendmentReview.decision === "rejected" ? "Rejection reason" : "Approval note (optional)"}
                <textarea
                  rows={3}
                  value={amendmentReviewNote}
                  onChange={event => setAmendmentReviewNote(event.target.value)}
                  className="mt-2 w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
              {amendmentReviewError && <p className="text-sm font-medium text-red-600">{amendmentReviewError}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={reviewingAmendment !== null} onClick={() => setAmendmentReview(null)}>Cancel</Button>
                <Button
                  disabled={reviewingAmendment !== null}
                  onClick={reviewAmendment}
                  className={amendmentReview.decision === "approved" ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-red-600 text-white hover:bg-red-700"}
                >
                  {reviewingAmendment !== null && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {amendmentReview.decision === "approved" ? "Approve Correction" : "Reject Correction"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(auditTarget)} onOpenChange={(open) => !open && setAuditTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Score Audit Trail</DialogTitle>
            <DialogDescription>
              {auditTarget ? `${auditTarget.course_code} - ${auditTarget.matric_number}` : "Recorded score events"}
            </DialogDescription>
          </DialogHeader>
          {loadingAudit ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
          ) : (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {auditLogs.map(log => (
                <div key={log.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="capitalize text-slate-900 dark:text-slate-100">{String(log.change_type).replaceAll("_", " ")}</strong>
                    <span className="text-xs text-slate-400">{new Date(log.changed_at).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    By {log.changed_by_name || "System"}{log.changed_by_role ? ` (${log.changed_by_role})` : ""}
                  </p>
                  {(log.old_ca_score != null || log.new_ca_score != null) && (
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                      CA: {log.old_ca_score ?? "-"} → {log.new_ca_score ?? "-"} · Exam: {log.old_exam_score ?? "-"} → {log.new_exam_score ?? "-"}
                    </p>
                  )}
                  {log.reason && <p className="mt-2 text-sm text-slate-500">Reason: {log.reason}</p>}
                  {log.review_note && <p className="mt-1 text-sm text-slate-500">Review note: {log.review_note}</p>}
                </div>
              ))}
              {!auditLogs.length && <p className="py-10 text-center text-sm text-slate-400">No audit events found.</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Background patterns */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-blue-100 dark:bg-blue-900/40 rounded-full blur-[100px] opacity-40"></div>
        <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-emerald-50 dark:bg-emerald-900/20 rounded-full blur-[100px] opacity-40"></div>
      </div>

      {isPgProcessor && (
        <header className="sticky top-16 z-40 border-b border-[#e8dfd2] bg-[#f8f3ea]/95 backdrop-blur lg:top-0">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-2.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-4">
            <div className="flex min-w-0 items-center gap-3">
              {view !== "pending" && (
                <button
                  type="button"
                  onClick={() => {
                    setView("pending");
                    router.push("/pgadmin/result-processor");
                    void fetchPendingSubmissions();
                  }}
                  aria-label="Back to result submissions"
                  title="Back to result submissions"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[#d8c29a] bg-white text-slate-700 transition-colors hover:bg-[#ead6aa]"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              <h1 className="truncate text-base font-semibold uppercase text-slate-900 sm:text-lg">
                {pgPageTitle}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={view === "master-list" ? "default" : "outline"}
                onClick={() => router.push("/pgadmin/result-processor/master-list")}
                className={view === "master-list" ? "bg-slate-900 text-white hover:bg-black" : "border-slate-300 bg-white text-slate-700"}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Master List
              </Button>
              <Button
                variant={view === "saved" ? "default" : "outline"}
                onClick={() => router.push("/pgadmin/result-processor/records")}
                className={view === "saved" ? "bg-slate-900 text-white hover:bg-black" : "border-slate-300 bg-white text-slate-700"}
              >
                <Database className="mr-2 h-4 w-4" />
                Result Records
              </Button>
              <Button
                onClick={() => processSubmissionBatch(pendingSubmissions, "all PG departments")}
                disabled={processingBatch !== null || pendingSubmissions.length === 0}
                className="bg-slate-900 text-white hover:bg-black"
              >
                {processingBatch === "all PG departments"
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Process All Results
              </Button>
            </div>
          </div>
        </header>
      )}

      <div className="relative z-10 container mx-auto px-4 py-8 max-w-6xl">
        {!isPgProcessor && <header className="flex flex-col md:flex-row justify-between items-center mb-16 space-y-4 md:space-y-0">
          <motion.div 
            initial={{ opacity:0, x:-20 }} animate={{ opacity:1, x:0 }}
            className="flex items-center gap-4"
          >
            <div className="bg-white dark:bg-slate-950 p-2.5 rounded-2xl shadow-indigo-100 dark:shadow-indigo-900/20 shadow-xl border border-slate-100 dark:border-slate-800">
              <img src="/e-portal/images/logo new.png" alt="PCU Logo" className="h-12 w-12" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-900">
                Precious Cornerstone University
              </h1>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-widest">Academic Excellence</p>
            </div>
          </motion.div>

          <motion.div initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} className="flex gap-4">
            <Button 
              variant="outline" 
              onClick={() => router.push(processorHome)}
              className="rounded-xl border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/70 hover:border-slate-300 dark:border-slate-600 dark:hover:border-slate-600 transition-all px-6 hidden md:flex"
            >
              Back to Dashboard
            </Button>
            {!isPgProcessor && (
              <Button
                variant="outline"
                onClick={() => setView("converter")}
                className="rounded-xl border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 hover:border-emerald-200 dark:border-emerald-700 dark:hover:border-emerald-700 hover:text-emerald-700 dark:text-emerald-300 transition-all px-6 hidden md:flex"
              >
                <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Sheet Converter
              </Button>
            )}
            <Button 
              variant="outline" 
              onClick={() => setView("saved")}
              className="rounded-xl border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/70 hover:border-slate-300 dark:border-slate-600 dark:hover:border-slate-600 transition-all px-6"
            >
              <Database className="mr-2 h-4 w-4 text-blue-600 dark:text-blue-400" />
              Result Records
            </Button>
            <Button 
              variant="outline" 
              onClick={() => { setView("pending"); fetchPendingSubmissions(); }}
              className={`rounded-xl border-slate-200 dark:border-slate-700 hover:bg-orange-50 dark:bg-orange-900/20 dark:hover:bg-orange-900/40 hover:border-orange-200 dark:border-orange-700 dark:hover:border-orange-700 hover:text-orange-700 dark:text-orange-300 transition-all px-6 ${isPgProcessor ? "flex" : "hidden md:flex"}`}
            >
              <Clock className="mr-2 h-4 w-4 text-orange-600 dark:text-orange-400" />
              Pending
            </Button>
            <ModeToggle />
          </motion.div>
        </header>}

        <AnimatePresence mode="wait">
          {!isPgProcessor && view === "upload" && (
            <motion.div 
              key="upload"
              initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-20 }}
              className="space-y-12"
            >
              <div className="text-center space-y-4 max-w-2xl mx-auto">
                <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
                  {isPgProcessor ? "PG Result Management System" : "Result Management System"}
                </Badge>
                <h2 className="text-5xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                  Calculate student grades with <span className="text-blue-600 dark:text-blue-400">precision.</span>
                </h2>
              </div>

              <div className="max-w-xl mx-auto">
                <Card className="border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] bg-white  backdrop-blur-xl rounded-3xl overflow-hidden">
                  <CardContent className="p-8">
                    {!workbook ? (
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="group relative cursor-pointer border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:bg-blue-900/20/50 dark:hover:bg-blue-900/40 rounded-2xl p-12 transition-all duration-300 flex flex-col items-center text-center space-y-4"
                      >
                        <div className="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 p-4 rounded-full group-hover:scale-110 transition-transform duration-300">
                          <Upload className="h-8 w-8" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xl font-bold text-slate-800 dark:text-slate-200">Drop your Excel file here</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 font-medium">Support .xlsx, .xls format</p>
                        </div>
                        <Input 
                          ref={fileInputRef} type="file" className="hidden" 
                          accept=".xlsx,.xls" onChange={handleFileUpload} 
                        />
                      </div>
                    ) : (
                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
                          <div className="bg-blue-600 p-2 rounded-lg text-white dark:text-slate-900">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate text-slate-800 dark:text-slate-200">File Selected</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 truncate font-medium">Found {sheets.length} department sheets</p>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => { setWorkbook(null); setSheets([]); }} className="text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400">
                            Clear
                          </Button>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label className="text-slate-700 dark:text-slate-300 font-bold flex items-center gap-2">
                              <Layers className="h-4 w-4 text-blue-500" />
                              Select Department
                            </Label>
                            <select 
                              className="w-full bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                              value={selectedSheet}
                              onChange={(e) => setSelectedSheet(e.target.value)}
                            >
                              {sheets.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                            <Button 
                              onClick={() => runCalculation(false)}
                              className="bg-slate-900 dark:bg-slate-100 hover:bg-black text-white dark:text-slate-900 rounded-xl h-12 shadow-xl shadow-slate-200 transition-all font-bold"
                            >
                              <Calculator className="mr-2 h-4 w-4" />
                              Calculate Selected
                            </Button>
                            <Button 
                              onClick={() => runCalculation(true)}
                              className="bg-blue-600 hover:bg-blue-700 text-white dark:text-slate-900 rounded-xl h-12 shadow-xl shadow-blue-200 transition-all font-bold"
                            >
                              <Layers className="mr-2 h-4 w-4" />
                              Calculate All
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}

          {view === "processing" && (
            <motion.div 
               key="processing"
               initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:0.95 }}
               className="max-w-xl mx-auto py-20"
            >
               <Card className="border-none shadow-2xl bg-white  backdrop-blur-xl rounded-3xl p-10 text-center space-y-8">
                  <div className="relative w-32 h-32 mx-auto">
                    <div className="absolute inset-0 bg-blue-100 dark:bg-blue-900/40 rounded-full animate-ping opacity-25"></div>
                    <div className="relative bg-blue-600 text-white dark:text-slate-900 p-8 rounded-full shadow-2xl shadow-blue-200">
                       <Loader2 className="h-12 w-12 animate-spin" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200 tracking-tight">Processing Academic Data</h3>
                    <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500 font-medium italic">Enriching courses with database records...</p>
                  </div>
                  <div className="space-y-4">
                    <Progress value={progress} className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full" />
                    <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{progress}% Completed</p>
                  </div>
               </Card>
            </motion.div>
          )}

          {view === "results" && (
            <motion.div 
              key="results"
              initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-8"
            >
              <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                 <div className="space-y-1">
                    <Button variant="ghost" onClick={() => setView(processorLandingView)} className="p-0 h-auto hover:bg-transparent text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:text-slate-200 mb-2">
                       &larr; Back to {isPgProcessor ? "Pending Results" : "Upload"}
                    </Button>
                    <h2 className="text-4xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">Calculation Results</h2>
                    <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500 font-medium">Ready for review and export</p>
                 </div>
                 
                 <div className="flex gap-3">
                    <Button 
                      variant="outline" 
                      onClick={() => downloadZip(activeDeptTab, resultsByDept[activeDeptTab])}
                      disabled={isZipping}
                      className="rounded-xl border-slate-200 dark:border-slate-700 h-11 px-5 shadow-sm font-bold bg-white dark:bg-slate-950"
                    >
                      {isZipping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                      {isZipping ? `Archiving (${zipProgress}%)` : `Export ${activeDeptTab}`}
                    </Button>
                    <Button 
                      onClick={() => saveDeptToDB(activeDeptTab, resultsByDept[activeDeptTab])}
                      className="rounded-xl h-11 px-5 bg-blue-600 hover:bg-blue-700 text-white dark:text-slate-900 shadow-blue-100 shadow-xl font-bold"
                    >
                       <Database className="mr-2 h-4 w-4" />
                       Save Dept
                    </Button>
                    <Button 
                      onClick={async () => {
                        const allResults = Object.values(resultsByDept).flat();
                        await saveDeptToDB("All Departments", allResults);
                      }}
                      className="rounded-xl h-11 px-5 bg-indigo-600 hover:bg-indigo-700 text-white dark:text-slate-900 shadow-indigo-100 dark:shadow-indigo-900/20 shadow-xl font-bold"
                    >
                       <Database className="mr-2 h-4 w-4" />
                       Max Save All
                    </Button>
                 </div>
              </div>

              <Tabs value={activeDeptTab} onValueChange={setActiveDeptTab} className="w-full">
                <ScrollArea className="w-full max-w-full whitespace-nowrap pb-4">
                  <TabsList className="bg-slate-100 dark:bg-slate-800/50 p-1.5 rounded-2xl border border-slate-100 dark:border-slate-800 h-auto inline-flex">
                    {Object.keys(resultsByDept).map(dept => (
                      <TabsTrigger 
                        key={dept} value={dept} 
                        className="rounded-xl px-6 py-2.5 data-[state=active]:bg-white dark:bg-slate-950 data-[state=active]:text-blue-700 dark:text-blue-300 data-[state=active]:shadow-md font-bold text-slate-600 dark:text-slate-400"
                      >
                        {dept}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>

                {Object.keys(resultsByDept).map(dept => (
                  <TabsContent key={dept} value={dept} className="mt-0">
                    <div className="grid lg:grid-cols-12 gap-8 items-start">
                      <Card className="lg:col-span-4 border-none shadow-xl bg-white  backdrop-blur-xl rounded-3xl overflow-hidden h-[600px] flex flex-col">
                        <CardHeader className="p-6 border-b border-slate-100 dark:border-slate-800">
                           <div className="relative">
                             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                             <Input 
                               placeholder="Search candidate..." 
                               className="pl-10 h-10 bg-slate-50 dark:bg-slate-900 border-none rounded-xl text-sm"
                               value={searchTerm}
                               onChange={(e) => setSearchTerm(e.target.value)}
                             />
                           </div>
                           <div className="flex items-center gap-2 pt-4">
                              <Users className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                {filteredStudents.length} Students found
                              </span>
                           </div>
                        </CardHeader>
                        <CardContent className="p-0 overflow-y-auto flex-1">
                          <div className="divide-y divide-slate-100">
                             {filteredStudents.map((res, idx) => (
                               <div 
                                 key={res.studentInfo.matricNumber}
                                 onClick={() => setSelectedResult(res)}
                                 className={`p-5 cursor-pointer transition-all flex items-center justify-between group ${
                                   selectedResult?.studentInfo.matricNumber === res.studentInfo.matricNumber 
                                   ? "bg-blue-50 dark:bg-blue-900/20/80 border-l-4 border-blue-600" 
                                   : "hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/70 border-l-4 border-transparent"
                                 }`}
                               >
                                 <div className="space-y-1">
                                   <p className="font-bold text-slate-800 dark:text-slate-200 text-sm group-hover:text-blue-700 dark:text-blue-300 transition-colors uppercase">
                                     {res.studentInfo.name}
                                   </p>
                                   <p className="text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 tracking-tight">
                                     {res.studentInfo.matricNumber}
                                   </p>
                                 </div>
                                 <div className="text-right">
                                    <Badge className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-none font-bold text-[10px]">
                                      GPA {res.cgpa}
                                    </Badge>
                                 </div>
                               </div>
                             ))}
                             {filteredStudents.length === 0 && (
                               <div className="py-20 text-center space-y-4">
                                  <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-full w-fit mx-auto">
                                    <Search className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                                  </div>
                                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">No candidates match search</p>
                               </div>
                             )}
                          </div>
                        </CardContent>
                      </Card>

                      <div className="lg:col-span-8">
                         {selectedResult ? (
                            <motion.div 
                              key={selectedResult.studentInfo.matricNumber}
                              initial={{ opacity:0, scale:0.98 }} animate={{ opacity:1, scale:1 }}
                              className="animate-in fade-in duration-500"
                            >
                               <ResultDisplay 
                                 {...selectedResult} 
                                 onReset={() => setSelectedResult(null)} 
                                 hideActions={false}
                               />
                            </motion.div>
                         ) : (
                           <div className="h-[600px] bg-slate-100  border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl flex flex-col items-center justify-center text-center p-12 space-y-4">
                              <div className="bg-white dark:bg-slate-950 p-5 rounded-2xl shadow-sm text-blue-500">
                                <Eye className="h-8 w-8" />
                              </div>
                              <div className="space-y-2">
                                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 uppercase tracking-tight">Preview Canvas</h3>
                                <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500 max-w-xs mx-auto">Select a candidate from the left list to view their detailed result sheet and generate PDF.</p>
                              </div>
                           </div>
                         )}
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </motion.div>
          )}

          {view === "master-list" && (
            <motion.div 
              key="master-list"
              initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-20 }}
              className="space-y-8"
            >
              <MasterListDownload
                sources={[{
                  label: isPgProcessor ? "Postgraduate" : "Undergraduate",
                  programme: isPgProcessor ? "PG" : "UG",
                  apiBase: isPgProcessor ? "/pg-results" : "/results",
                }]}
                title={isPgProcessor ? "All PG Students Master List" : "Overall Master List"}
                description={isPgProcessor
                  ? "Download one Excel workbook containing every PG department for the selected academic session and semester. Departments and levels are organised into separate worksheets."
                  : "Download the complete undergraduate master list for a selected academic session and semester."}
                downloadLabel={isPgProcessor ? "Download" : "Download List"}
                compactHeader={isPgProcessor}
              />
            </motion.div>
          )}

          {view === "saved" && (
            <motion.div
              key="saved"
              initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-20 }}
              className="space-y-8"
            >
              {!isPgProcessor && (
                <MasterListDownload
                  sources={[{
                    label: "Undergraduate",
                    programme: "UG",
                    apiBase: "/results",
                  }]}
                  title="Overall Master List"
                  description="Download the complete undergraduate master list for a selected academic session and semester."
                  downloadLabel="Download Master List"
                />
              )}
              <SavedResultsView
                onBack={() => setView(processorLandingView)}
                resultApiBase={isPgProcessor ? resultApiBase : undefined}
                readOnly={isPgProcessor}
                title={isPgProcessor ? "PG Result Records" : "Academic Records"}
                compactHeader={isPgProcessor}
              />
            </motion.div>
          )}

          {!isPgProcessor && view === "converter" && (
            <motion.div 
              key="converter"
              initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-20 }}
              className="space-y-12"
            >
              <div className="text-center space-y-4 max-w-2xl mx-auto">
                <Badge variant="secondary" className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-800 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
                  Utility Tool
                </Badge>
                <h2 className="text-5xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                  <span className="text-emerald-600 dark:text-emerald-400">Excel Sheet Normalizer</span>
                </h2>
              </div>

              <div className="max-w-2xl mx-auto">
                <Card className="border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] bg-white  backdrop-blur-xl rounded-3xl overflow-hidden">
                  <CardHeader className="p-8 pb-0 text-center">
                    <CardDescription  className="text-slate-500 dark:text-slate-400 dark:text-slate-500 font-medium pt-2">
                       This tool scans excel sheets, merge duplicate student entries, and collates individual scores into columns.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-8 space-y-8">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className="text-slate-700 dark:text-slate-300 font-bold flex items-center gap-2">
                            <Database className="h-4 w-4 text-blue-500" />
                            Academic Session
                          </Label>
                          <select 
                            className="w-full bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                            value={convSession}
                            onChange={(e) => setConvSession(e.target.value)}
                          >
                            <option value="2022/2023">2022/2023</option>
                            <option value="2023/2024">2023/2024</option>
                            <option value="2024/2025">2024/2025</option>
                            <option value="2025/2026">2025/2026</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-slate-700 dark:text-slate-300 font-bold flex items-center gap-2">
                            <Layers className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                            Semester
                          </Label>
                          <select 
                            className="w-full bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                            value={convSemester}
                            onChange={(e) => setConvSemester(e.target.value)}
                          >
                            <option value="FIRST">FIRST SEMESTER</option>
                            <option value="SECOND">SECOND SEMESTER</option>
                            <option value="THIRD">THIRD SEMESTER</option>
                          </select>
                        </div>
                      </div>

                      <div 
                        onClick={() => converterInputRef.current?.click()}
                        className="group cursor-pointer border-2 border-dashed border-emerald-100 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20/20 hover:border-emerald-400 dark:border-emerald-500 dark:hover:border-emerald-500 hover:bg-emerald-50 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40/50 rounded-2xl p-16 transition-all duration-300 flex flex-col items-center text-center space-y-4"
                      >
                        <div className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 p-4 rounded-full group-hover:rotate-12 transition-transform duration-300">
                          <Sparkles className="h-8 w-8" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xl font-bold text-slate-800 dark:text-slate-200">Select Raw Sheet</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 font-medium">Automatic detection of Names & Matric numbers</p>
                        </div>
                        <input 
                          ref={converterInputRef} type="file" className="hidden" 
                          accept=".xlsx,.xls" onChange={handleNormalization} 
                        />
                      </div>

                      {isNormalizing && (
                         <div className="space-y-4 py-4 animate-in fade-in duration-500">
                            <div className="flex justify-between text-sm font-bold text-slate-700 dark:text-slate-300">
                               <span className="flex items-center gap-2">
                                  <Loader2 className="h-4 w-4 animate-spin text-emerald-600 dark:text-emerald-400" />
                                  Pivoting data...
                               </span>
                               <span>{progress}%</span>
                            </div>
                            <Progress value={progress} className="h-3 bg-emerald-100 dark:bg-emerald-900/40 rounded-full" />
                         </div>
                      )}

                      <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                         <div className="flex gap-2">
                            <div className="h-2 w-2 rounded-full bg-emerald-50 dark:bg-emerald-900/200 animate-pulse"></div>
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Ready for conversion</span>
                         </div>
                         <Button variant="ghost" onClick={() => setView("upload")} className="text-slate-500 dark:text-slate-400 dark:text-slate-500 font-bold hover:text-slate-900 dark:text-slate-100 transition-colors">
                            Return Home
                         </Button>
                      </div>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}
          {view === "pending" && (
            <motion.div 
              key="pending"
              initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-20 }}
              className="space-y-8"
            >
              {!isPgProcessor && (
                <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
                  <div className="space-y-1">
                    <h2 className="text-3xl font-bold uppercase tracking-tight text-slate-900 dark:text-slate-100">
                      Staff Submissions
                    </h2>
                    <p className="font-medium text-slate-500 dark:text-slate-400">
                      Verify and process results submitted by lecturers and HODs for {processorOwner}.
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => setView("upload")} className="rounded-xl border-slate-200">
                    <Upload className="mr-2 h-4 w-4" /> Back to Upload
                  </Button>
                </div>
              )}

              <Tabs
                value={submissionTab}
                onValueChange={(value) => {
                  setSubmissionTab(value as "pending" | "processed" | "amendments");
                  setSelectedSubmissionDepartment(null);
                  if (value === "amendments") void fetchAmendmentRequests();
                }}
                className="w-full"
              >
                <div className="mb-6">
                  <TabsList className="bg-slate-100 p-1 dark:bg-slate-900">
                    <TabsTrigger value="pending" className="rounded-xl px-8 data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800">
                      Pending ({pendingSubmissions.length})
                    </TabsTrigger>
                    <TabsTrigger value="processed" className="rounded-xl px-8 data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800">
                      Processed ({processedSubmissions.length})
                    </TabsTrigger>
                    <TabsTrigger value="amendments" className="rounded-xl px-8 data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800">
                      Corrections ({amendmentRequests.filter(item => item.status === "pending").length})
                    </TabsTrigger>
                  </TabsList>
                </div>
                
                <TabsContent value="pending" className="mt-0">
                  {loadingPending ? (
                    <div className="py-20 flex flex-col items-center gap-4 text-slate-400">
                      <Loader2 className="h-10 w-10 animate-spin" />
                      <p className="font-medium">Fetching Submissions...</p>
                    </div>
                  ) : pendingSubmissions.length > 0 ? (
                    isPgProcessor ? (
                      !selectedSubmissionDepartment ? renderDepartmentSelector(pendingDepartmentGroups) : (
                        <div className="space-y-4">
                          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                            <div className="flex items-center gap-3">
                              <Button variant="ghost" onClick={() => setSelectedSubmissionDepartment(null)} className="px-2">
                                <ArrowLeft className="mr-2 h-4 w-4" /> All Departments
                              </Button>
                              <h3 className="font-bold text-slate-900 dark:text-slate-100">{selectedSubmissionDepartment}</h3>
                            </div>
                            <Button
                              onClick={() => processSubmissionBatch(visiblePendingSubmissions, selectedSubmissionDepartment)}
                              disabled={processingBatch !== null}
                              className="bg-slate-900 text-white hover:bg-black"
                            >
                              {processingBatch === selectedSubmissionDepartment && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Process All
                            </Button>
                          </div>
                          {renderSubmissionCards(visiblePendingSubmissions)}
                        </div>
                      )
                    ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {pendingSubmissions.map((sub) => (
                        <Card key={sub.id} className="overflow-hidden border-slate-100 hover:shadow-md transition-shadow">
                          <div className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div className="flex items-center gap-4">
                              <div className="bg-orange-100 p-3 rounded-xl text-orange-600">
                                <FileText className="h-6 w-6" />
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase">{sub.file_name}</h4>
                                <div className="flex items-center gap-3 text-xs text-slate-500 font-medium mt-1">
                                  <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {sub.staff_name || "Lecturer"}</span>
                                  <span>&bull;</span>
                                  <span>{new Date(sub.created_at).toLocaleDateString()}</span>
                                  <span>&bull;</span>
                                  <Badge variant="outline" className="text-[10px] py-0">{sub.course_code || "Multiple"}</Badge>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2 w-full md:w-auto">
                              <Button 
                                variant="ghost" 
                                onClick={() => setDeleteTarget(sub)}
                                className="text-red-500 hover:text-red-600 hover:bg-red-100 text-xs font-bold"
                              >
                                Delete
                              </Button>
                              {isPgProcessor ? (
                                <Button
                                  variant="outline"
                                  onClick={() => setPreviewSubmission(sub)}
                                  className="border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-bold px-3"
                                >
                                  <Eye className="h-3 w-3 mr-1" />
                                  View
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  onClick={() => downloadOriginal(sub)}
                                  className="border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-bold px-3"
                                >
                                  <Download className="h-3 w-3 mr-1" />
                                  Download
                                </Button>
                              )}
                              <Button
                                onClick={() => importPending(sub)}
                                className="bg-slate-900 text-white hover:bg-black rounded-lg text-xs font-bold px-4"
                              >
                                Process Now &rarr;
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                    )
                  ) : (
                    <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-100 dark:border-slate-800">
                      <Clock className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                      <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">No pending submissions</h3>
                      <p className="text-slate-500 text-sm max-w-xs mx-auto mt-2">Check back later for new uploaded result sheets.</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="processed" className="mt-0">
                  {processedSubmissions.length > 0 ? (
                    isPgProcessor ? (
                      !selectedSubmissionDepartment ? renderDepartmentSelector(processedDepartmentGroups) : (
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <Button variant="ghost" onClick={() => setSelectedSubmissionDepartment(null)} className="px-2">
                              <ArrowLeft className="mr-2 h-4 w-4" /> All Departments
                            </Button>
                            <h3 className="font-bold text-slate-900 dark:text-slate-100">{selectedSubmissionDepartment}</h3>
                          </div>
                          {renderSubmissionCards(visibleProcessedSubmissions, true)}
                        </div>
                      )
                    ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {processedSubmissions.map((sub) => (
                        <Card key={sub.id} className="overflow-hidden border-slate-100 opacity-80">
                          <div className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div className="flex items-center gap-4">
                              <div className="bg-emerald-100 p-3 rounded-xl text-emerald-600">
                                <CheckCircle2 className="h-6 w-6" />
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase">{sub.file_name}</h4>
                                <div className="flex items-center gap-3 text-xs text-slate-500 font-medium mt-1">
                                  <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {sub.staff_name || "Lecturer"}</span>
                                  <span>&bull;</span>
                                  <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-none text-[10px]">PROCESSED</Badge>
                                </div>
                              </div>
                            </div>
                            {isPgProcessor ? (
                              <Button
                                variant="outline"
                                onClick={() => setPreviewSubmission(sub)}
                                className="border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-bold px-3"
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                View
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                onClick={() => downloadOriginal(sub)}
                                className="border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-bold px-3"
                              >
                                <Download className="h-3 w-3 mr-1" />
                                Archived Original
                              </Button>
                            )}
                          </div>
                        </Card>
                      ))}
                    </div>
                    )
                  ) : (
                    <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-100 dark:border-slate-800">
                      <CheckCircle2 className="h-12 w-12 text-slate-200 mx-auto mb-4" />
                      <p className="text-slate-500 text-sm">No processed submissions found.</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="amendments" className="mt-0">
                  {loadingAmendments ? (
                    <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
                      <Loader2 className="h-9 w-9 animate-spin" />
                      <p className="font-medium">Loading correction requests...</p>
                    </div>
                  ) : amendmentRequests.length ? (
                    <div className="grid grid-cols-1 gap-4">
                      {amendmentRequests.map(amendment => (
                        <Card key={amendment.id} className="border-slate-200 dark:border-slate-800">
                          <CardContent className="p-5">
                            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
                              <div className="min-w-0 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="font-bold text-slate-900 dark:text-slate-100">
                                    {amendment.course_code} - {amendment.matric_number}
                                  </h4>
                                  <Badge
                                    variant="outline"
                                    className={amendment.status === "approved"
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      : amendment.status === "rejected"
                                        ? "border-red-200 bg-red-50 text-red-700"
                                        : "border-amber-200 bg-amber-50 text-amber-700"}
                                  >{amendment.status === "pending" ? "Pending correction" : amendment.status}</Badge>
                                </div>
                                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                                  {amendment.student_name} · {amendment.session} · {amendment.semester}
                                </p>
                                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
                                  <span>CA: <strong>{amendment.old_ca_score}</strong> → <strong className="text-blue-600">{amendment.proposed_ca_score}</strong></span>
                                  <span>Exam: <strong>{amendment.old_exam_score}</strong> → <strong className="text-blue-600">{amendment.proposed_exam_score}</strong></span>
                                </div>
                                <p className="text-sm text-slate-500"><strong>Reason:</strong> {amendment.reason}</p>
                                <p className="text-xs text-slate-400">
                                  Requested by {amendment.requested_by_name || "Lecturer"} on {new Date(amendment.requested_at).toLocaleString()}
                                </p>
                                {amendment.reviewed_at && (
                                  <p className="text-xs text-slate-400">
                                    Reviewed by {amendment.reviewed_by_name || processorOwner} on {new Date(amendment.reviewed_at).toLocaleString()}
                                    {amendment.review_note ? ` · ${amendment.review_note}` : ""}
                                  </p>
                                )}
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-2">
                                <Button variant="outline" onClick={() => viewScoreAudit(amendment)}>
                                  <History className="mr-2 h-4 w-4" /> Audit Trail
                                </Button>
                              {amendment.status === "pending" && <>
                                <Button
                                  variant="outline"
                                  disabled={reviewingAmendment === amendment.id}
                                  onClick={() => openAmendmentReview(amendment, "rejected")}
                                  className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                                >
                                  Reject
                                </Button>
                                <Button
                                  disabled={reviewingAmendment === amendment.id}
                                  onClick={() => openAmendmentReview(amendment, "approved")}
                                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                                >
                                  {reviewingAmendment === amendment.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                  Approve Correction
                                </Button>
                              </>}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-3xl border-2 border-dashed border-slate-100 bg-white py-20 text-center dark:border-slate-800 dark:bg-slate-900">
                      <History className="mx-auto mb-4 h-12 w-12 text-slate-300" />
                      <h3 className="font-bold text-slate-700 dark:text-slate-300">No correction requests</h3>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}

function submissionPayload(submission: any): any[] {
  try {
    const payload = typeof submission?.payload === "string"
      ? JSON.parse(submission.payload)
      : submission?.payload;
    return Array.isArray(payload) ? payload : [];
  } catch {
    return [];
  }
}

function submissionDetails(submission: any) {
  const payload = submissionPayload(submission);
  const departments = [...new Set(payload
    .map((item: any) => String(item?.studentInfo?.department || "").trim())
    .filter(Boolean))];
  const sessions = [...new Set(payload
    .map((item: any) => String(item?.studentInfo?.academicSession || "").trim())
    .filter(Boolean))];
  const semesters = [...new Set(payload
    .map((item: any) => String(item?.studentInfo?.semester || "").trim().toUpperCase())
    .filter(Boolean))];
  const payloadCourses = payload.flatMap((item: any) => item?.courses || [])
    .map((course: any) => String(course?.code || "").trim())
    .filter(Boolean);
  const storedCourses = String(submission?.course_code || "")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
  const courseCodes = [...new Set([...payloadCourses, ...storedCourses])];

  return {
    departments: departments.length ? departments : ["Unclassified"],
    courseCodes,
    courseLabel: courseCodes.join(", ") || "Course",
    sessionLabel: sessions.join(", ") || "Session not specified",
    semesterLabel: semesters.join(", ") || "Semester not specified",
    uploadType: submission?.file_content ? "Bulk Upload" : "Manual Upload",
  };
}

function submissionDepartmentGroups(submissions: any[]) {
  const groups = new Map<string, { name: string; submissions: Set<number>; courses: Set<string> }>();
  submissions.forEach((submission) => {
    const details = submissionDetails(submission);
    details.departments.forEach((department) => {
      const key = normalizeDepartmentKey(department);
      const group = groups.get(key) || {
        name: formatDepartmentName(department),
        submissions: new Set<number>(),
        courses: new Set<string>(),
      };
      group.submissions.add(submission.id);
      details.courseCodes.forEach((code) => group.courses.add(code));
      groups.set(key, group);
    });
  });
  return [...groups.values()]
    .map((group) => ({
      name: group.name,
      submissionCount: group.submissions.size,
      courseCount: group.courses.size,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeDepartmentKey(department: string) {
  return department.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function formatDepartmentName(department: string) {
  return department.trim().replace(/\s+/g, " ").toLocaleLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function submissionBelongsToDepartment(submission: any, department: string) {
  const selectedKey = normalizeDepartmentKey(department);
  return submissionDetails(submission).departments.some(
    (item) => normalizeDepartmentKey(item) === selectedKey
  );
}
