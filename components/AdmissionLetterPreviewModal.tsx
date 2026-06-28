"use client";

import React, { useState, useEffect, useRef } from "react";
import { ApiClient } from "@/lib/api";
import { X, Download, Printer, Loader2, AlertCircle } from "lucide-react";
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

        const date =
          admissionDate || new Date().toISOString().split("T")[0];

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

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Modal panel */}
      <div className="relative flex flex-col w-full max-w-5xl bg-background rounded-xl shadow-2xl overflow-hidden"
        style={{ height: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold text-foreground">
            Admission Letter Preview
          </h2>

          <div className="flex items-center gap-2">
            {pdfUrl && (
              <>
                <a
                  href={pdfUrl}
                  download={`admission_letter_${applicantId}.pdf`}
                  className="inline-flex"
                >
                  <Button size="sm" variant="outline" className="gap-2">
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                </a>

                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    // Open in a hidden iframe and print
                    const iframe = document.createElement("iframe");
                    iframe.style.display = "none";
                    iframe.src = pdfUrl;
                    document.body.appendChild(iframe);
                    iframe.onload = () => {
                      iframe.contentWindow?.print();
                      // Clean up after print dialog closes
                      setTimeout(() => document.body.removeChild(iframe), 1000);
                    };
                  }}
                >
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
              </>
            )}

            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              Close
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden bg-muted/30">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm">Generating admission letter preview…</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="text-sm text-destructive max-w-sm text-center">{error}</p>
              <Button
                variant="outline"
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  // Re-trigger by remounting — parent can also handle this
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
              className="w-full h-full border-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}
