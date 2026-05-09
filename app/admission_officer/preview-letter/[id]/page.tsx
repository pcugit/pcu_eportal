"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient } from "@/lib/api";

export default function PreviewAdmissionLetterPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { user, isAuthenticated } = useAuth();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "admissionofficer") {
      router.replace("/auth/login");
      return;
    }
    const fetchAndPreviewLetter = async () => {
      try {
        setLoading(true);
        const admissionDate =
          searchParams.get("admission_date") ||
          new Date().toISOString().split("T")[0];

        const pdfBlob = await ApiClient.previewAdmissionLetter(
          parseInt(params.id),
          admissionDate
        );
        const url = URL.createObjectURL(pdfBlob);
        setPdfUrl(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    if (params.id) {
      fetchAndPreviewLetter();
    }

    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [params.id, searchParams]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">
            Generating admission letter preview...
          </p>
        </div>
      </div>
    );
  }

  if (error || !pdfUrl) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="bg-white p-8 rounded shadow-md text-center max-w-md">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
          <p className="text-gray-600 mb-4">
            {error || "Failed to load admission letter preview"}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">
          Admission Letter Preview
        </h1>

        <div className="flex gap-4 mb-6">
          <a
            href={pdfUrl}
            download={`admission_letter_${params.id}.pdf`}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded shadow-lg transition-colors"
          >
            Download PDF
          </a>
          <button
            onClick={() => window.print()}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded shadow-lg transition-colors"
          >
            Print
          </button>
          <button
            onClick={() => window.history.back()}
            className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded shadow-lg transition-colors"
          >
            Back
          </button>
        </div>

        {/* PDF Viewer */}
        <div className="bg-white rounded shadow-lg overflow-hidden">
          <iframe
            src={pdfUrl}
            className="w-full"
            style={{ height: "calc(100vh - 250px)", minHeight: "600px" }}
            title="Admission Letter PDF Preview"
          />
        </div>
      </div>
    </div>
  );
}