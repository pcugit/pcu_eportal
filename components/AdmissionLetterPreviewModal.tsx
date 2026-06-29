"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Printer, X } from "lucide-react";
import { ApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface AdmissionLetterPreviewModalProps {
  applicantId: number | string;
  admissionDate?: string;
  portal?: "admission_officer" | "pgadmin" | "ptadmin";
  onClose: () => void;
}

export default function AdmissionLetterPreviewModal({
  applicantId,
  admissionDate,
  portal = "admission_officer",
  onClose,
}: AdmissionLetterPreviewModalProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchLetter = async () => {
      try {
        setLoading(true);
        setError(null);

        const date = admissionDate || new Date().toISOString().split("T")[0];
        const blob = await ApiClient.previewAdmissionLetter(
          applicantId,
          date,
          undefined,
          portal,
        );

        if (cancelled) return;

        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setPdfUrl(url);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load preview");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchLetter();

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [applicantId, admissionDate, portal]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handlePrint = () => {
    if (!pdfUrl) return;

    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = pdfUrl;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    };
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-md animate-in fade-in duration-300"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative my-8 flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="mb-4 flex shrink-0 flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Admission Letter Preview
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            {pdfUrl && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2 rounded-full border-slate-200 px-4 font-semibold text-slate-700 hover:bg-slate-50"
                onClick={handlePrint}
              >
                <Printer className="h-4 w-4" />
                Print
              </Button>
            )}

            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="gap-2 rounded-full px-4 font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <X className="h-4 w-4" />
              Close
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
          {loading && (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-slate-500">
              <Loader2 className="h-10 w-10 animate-spin text-[#9a6614]" />
              <p className="text-sm">Generating admission letter preview...</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <AlertCircle className="h-10 w-10 text-red-600" />
              <p className="max-w-sm text-center text-sm text-red-600">
                {error}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  window.location.reload();
                }}
              >
                Try Again
              </Button>
            </div>
          )}

          {!loading && !error && pdfUrl && (
            <iframe
              src={pdfUrl}
              title="Admission Letter PDF Preview"
              className="h-full w-full border-0 bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
}
