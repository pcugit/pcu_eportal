/**
 * PG Applicant Course Recommendation Section
 * Displays recommendation status and action buttons
 */

"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface CourseRecommendationProps {
  applicantId: string;
  applicationStatus: string;
  approvedCourse?: string;
  applicantRecommendedCourse?: string;
  availableCourses?: Array<{
    id: number;
    name: string;
    course: string;
    department: string;
    degree_name?: string;
    degree_code?: string;
  }>;
  onAcceptRecommendation?: () => void;
  onRejectRecommendation?: () => void;
  onRecommendAlternative?: (courseId: number, courseName: string) => void;
  isLoading?: boolean;
}

export default function CourseRecommendation({
  applicantId,
  applicationStatus,
  approvedCourse,
  applicantRecommendedCourse,
  availableCourses = [],
  onAcceptRecommendation,
  onRejectRecommendation,
  onRecommendAlternative,
  isLoading = false,
}: CourseRecommendationProps) {
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null);
  const [selectedCourseName, setSelectedCourseName] = useState("");
  const normalizedStatus =
    applicationStatus === "recommend" ? "recommended" : applicationStatus;

  // Only show for PG-specific statuses
  if (
    ![
      "recommended",
      "accepted_recommendation",
      "applicant_recommended",
    ].includes(normalizedStatus)
  ) {
    return null;
  }

  const handleSelectAlternativeCourse = (
    courseId: number,
    courseName: string,
  ) => {
    setSelectedCourse(courseId);
    setSelectedCourseName(courseName);
  };

  return (
    <div
      id="course-recommendation-decision"
      className="scroll-mt-24 space-y-4 pt-6"
    >
      {/* Recommended Status */}
      {normalizedStatus === "recommended" && (
        <div className="space-y-4 rounded-lg border-2 border-amber-200 bg-amber-50 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <h3 className="mb-1 text-base font-semibold text-amber-900">
                Course Recommendation
              </h3>
              <p className="text-sm text-amber-800">
                The admission office has recommended a course for you. You can
                accept this recommendation or suggest an alternative course.
              </p>
            </div>
          </div>

          {approvedCourse && (
            <div className="bg-white rounded p-3 border border-amber-100">
              <p className="text-xs text-amber-600 font-medium mb-1">
                RECOMMENDED COURSE
              </p>
              <p className="break-words text-sm font-medium leading-snug text-slate-900">
                {approvedCourse}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 pt-2 xl:grid-cols-3">
            <Button
              onClick={onAcceptRecommendation}
              disabled={isLoading}
              className="h-auto min-h-10 w-full whitespace-normal bg-emerald-600 px-3 py-2 text-white hover:bg-emerald-700"
            >
              {isLoading ? "Processing..." : "Accept Recommended Course"}
            </Button>
            <Button
              onClick={() => setShowCourseModal(true)}
              disabled={isLoading}
              variant="outline"
              className="h-auto min-h-10 w-full whitespace-normal px-3 py-2"
            >
              Recommend Alternative
            </Button>
            <Button
              onClick={onRejectRecommendation}
              disabled={isLoading}
              variant="outline"
              className="h-auto min-h-10 w-full whitespace-normal border-red-200 px-3 py-2 text-red-700 hover:bg-red-50"
            >
              Reject
            </Button>
          </div>
        </div>
      )}

      {/* Accepted Recommendation Status */}
      {normalizedStatus === "accepted_recommendation" && (
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-emerald-900 mb-1">
                Recommendation Accepted
              </h3>
              <p className="text-sm text-emerald-800 mb-3">
                You have accepted the recommended course. The admission office
                will review and finalize your enrollment.
              </p>
              {approvedCourse && (
                <div className="bg-white rounded p-3 border border-emerald-100">
                  <p className="text-xs text-emerald-600 font-medium mb-1">
                    YOUR COURSE
                  </p>
                  <p className="text-sm font-medium text-slate-900">
                    {approvedCourse}
                  </p>
                </div>
              )}
              <p className="text-xs text-emerald-700 mt-3">
                Status: Awaiting admin finalization
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Applicant Recommended Alternative Status */}
      {normalizedStatus === "applicant_recommended" && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-5 space-y-4">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 mb-1">
                Alternative Course Recommended
              </h3>
              <p className="text-sm text-blue-800">
                You have recommended an alternative course. The admission office
                is reviewing your request.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {approvedCourse && (
              <div className="bg-white rounded p-3 border border-amber-100">
                <p className="text-xs text-amber-600 font-medium mb-1">
                  ADMIN RECOMMENDATION
                </p>
                <p className="text-sm font-medium text-slate-900">
                  {approvedCourse}
                </p>
              </div>
            )}
            {applicantRecommendedCourse && (
              <div className="bg-white rounded p-3 border border-blue-100">
                <p className="text-xs text-blue-600 font-medium mb-1">
                  YOUR RECOMMENDATION
                </p>
                <p className="text-sm font-medium text-slate-900">
                  {applicantRecommendedCourse}
                </p>
              </div>
            )}
          </div>

          <p className="text-xs text-blue-700">Status: Awaiting admin review</p>
        </div>
      )}

      {/* Course Selection Modal */}
      {showCourseModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Select Alternative Course
              </h2>
              <button
                onClick={() => setShowCourseModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-2">
              {availableCourses.length === 0 ? (
                <p className="text-center text-slate-500 py-8">
                  No courses available
                </p>
              ) : (
                availableCourses.map((course) => (
                  <button
                    key={course.id}
                    onClick={() =>
                      handleSelectAlternativeCourse(
                        course.id,
                        course.course || course.name,
                      )
                    }
                    className={cn(
                      "w-full text-left p-4 border rounded-lg transition-all",
                      "hover:border-blue-500 hover:bg-blue-50",
                      selectedCourse === course.id &&
                        "border-blue-500 bg-blue-50",
                    )}
                  >
                    <p className="font-medium text-slate-900">
                      {course.course || course.name}
                    </p>
                    <p className="text-sm text-slate-600">
                      {course.department}
                      {course.degree_code && ` • ${course.degree_code}`}
                    </p>
                  </button>
                ))
              )}
            </div>

            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 p-4 flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowCourseModal(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!selectedCourse || !selectedCourseName) return;
                  setShowCourseModal(false);
                  onRecommendAlternative?.(selectedCourse, selectedCourseName);
                }}
                disabled={!selectedCourse || isLoading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isLoading ? "Submitting..." : "Confirm Course"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
