"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient, CourseData } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  CheckCircle2,
  BookOpen,
  Search,
  AlertCircle,
  Plus,
  ShieldCheck,
  Save,
} from "lucide-react";

export default function CourseRegistration() {
  const router = useRouter();
  const {
    user,
    student,
    isAuthenticated,
    logout,
    isLoading: authLoading,
  } = useAuth();

  const [firstCourses, setFirstCourses] = useState<CourseData[]>([]);
  const [secondCourses, setSecondCourses] = useState<CourseData[]>([]);
  const [ptCourses, setPtCourses] = useState<CourseData[]>([]);
  const [availableCourses, setAvailableCourses] = useState<CourseData[]>([]); // electives + required

  const [firstSelectedIds, setFirstSelectedIds] = useState<number[]>([]);
  const [secondSelectedIds, setSecondSelectedIds] = useState<number[]>([]);
  const [ptSelectedIds, setPtSelectedIds] = useState<number[]>([]);
  const [initialRegisteredIds, setInitialRegisteredIds] = useState<number[]>([]);

  const [firstStatus, setFirstStatus] = useState<string | null>(null);
  const [secondStatus, setSecondStatus] = useState<string | null>(null);
  const [ptStatus, setPtStatus] = useState<string | null>(null);
  const [isPtRegistration, setIsPtRegistration] = useState(false);
  const [canSubmitRegistration, setCanSubmitRegistration] = useState(true);
  const [activeSemesterName, setActiveSemesterName] = useState<string | null>(
    null,
  );

  const [deadline, setDeadline] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [globalSearchRes, setGlobalSearchRes] = useState<CourseData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isGlobalLocked, setIsGlobalLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentRequired, setPaymentRequired] = useState(false);

  const [firstAvailablePage, setFirstAvailablePage] = useState(1);
  const [secondAvailablePage, setSecondAvailablePage] = useState(1);
  const [ptCoursesPage, setPtCoursesPage] = useState(1);

  const loadCourses = async () => {
    try {
      setLoading(true);
      setError(null);
      setPaymentRequired(false);

      // Single call — backend returns all semesters + available courses at once
      const data = await ApiClient.getStudentCourses();

      setIsGlobalLocked(!!data.is_global_locked);
      setCanSubmitRegistration(data.can_submit_registration !== false);

      // Helper: normalise a course object so category field is always present
      const norm = (c: any): CourseData => ({
        ...c,
        category: c.category ?? c.remark ?? "elective",
      });

      // Build first/second semester course lists from structured response
      const sems: Record<string, { compulsory: any[]; core: any[] }> =
        (data as any).semesters ?? {};
      const registeredIds: number[] = (data as any).registered_course_ids ?? [];
      const regStatusBySem: Record<string, string> =
        (data as any).reg_status_by_semester ?? {};
      const activeName = (data as any).active_semester?.name ?? null;
      const isPtMode =
        Boolean((data as any).is_pt_registration) ||
        Boolean((data as any).student?.is_pt_student) ||
        Boolean(student?.is_pt_student);
      setIsPtRegistration(isPtMode);
      setActiveSemesterName(activeName);
      setInitialRegisteredIds(registeredIds);

      const firstSem = sems["First semester"] ?? { compulsory: [], core: [] };
      const secondSem = sems["Second semester"] ?? { compulsory: [], core: [] };

      const newFirstCourses = [...firstSem.compulsory, ...firstSem.core].map(
        norm,
      );
      const newSecondCourses = [...secondSem.compulsory, ...secondSem.core].map(
        norm,
      );

      const MANDATORY = new Set(["compulsory", "compulsary", "core"]);
      if (isPtMode) {
        const sourceCourses: CourseData[] = ((data as any).all_courses ?? [
          ...newFirstCourses,
          ...newSecondCourses,
          ...((data as any).available_courses ?? []),
        ]).map(norm);
        const allPtCourses: CourseData[] = Array.from(
          new Map(sourceCourses.map((c: CourseData) => [c.id, c])).values(),
        );
        const semesterStatus = activeName ? regStatusBySem[activeName] : null;

        setPtCourses(allPtCourses);
        setPtStatus(semesterStatus);
        setFirstCourses([]);
        setSecondCourses([]);
        setAvailableCourses([]);
        setFirstSelectedIds([]);
        setSecondSelectedIds([]);
        const registeredPtIds = registeredIds.filter((id) =>
          allPtCourses.some((c) => c.id === id),
        );
        const firstFiveMandatoryIds = allPtCourses
          .filter((c) => MANDATORY.has((c.category || "").toLowerCase()))
          .slice(0, 5)
          .map((c) => c.id);

        setPtSelectedIds(
          registeredPtIds.length > 0
            ? registeredPtIds
            : firstFiveMandatoryIds,
        );
        return;
      }

      setFirstCourses(newFirstCourses);
      setSecondCourses(newSecondCourses);
      setAvailableCourses(((data as any).available_courses ?? []).map(norm));

      setFirstStatus(regStatusBySem["First"] ?? null);
      setSecondStatus(regStatusBySem["Second"] ?? null);

      // Auto-select compulsory/core if not already submitted;
      // otherwise restore the previously registered selection
      const parsedAvailable = ((data as any).available_courses ?? []).map(norm);
      const allFirstPossible = [
        ...newFirstCourses,
        ...parsedAvailable.filter((c: any) =>
          (c.semester ?? "").toLowerCase().startsWith("first")
        )
      ];
      const allSecondPossible = [
        ...newSecondCourses,
        ...parsedAvailable.filter((c: any) =>
          (c.semester ?? "").toLowerCase().startsWith("second")
        )
      ];

      const firstInitialSelected =
        regStatusBySem["First"] === "submitted"
          ? registeredIds.filter((id) =>
              allFirstPossible.some((c) => c.id === id),
            )
          : Array.from(
              new Set([
                ...registeredIds.filter((id) =>
                  allFirstPossible.some((c) => c.id === id),
                ),
                ...newFirstCourses
                  .filter((c) =>
                    MANDATORY.has((c.category || "").toLowerCase()),
                  )
                  .map((c) => c.id),
              ]),
            );
      setFirstSelectedIds(firstInitialSelected);

      const secondInitialSelected =
        regStatusBySem["Second"] === "submitted"
          ? registeredIds.filter((id) =>
              allSecondPossible.some((c) => c.id === id),
            )
          : Array.from(
              new Set([
                ...registeredIds.filter((id) =>
                  allSecondPossible.some((c) => c.id === id),
                ),
                ...newSecondCourses
                  .filter((c) =>
                    MANDATORY.has((c.category || "").toLowerCase()),
                  )
                  .map((c) => c.id),
              ]),
            );
      setSecondSelectedIds(secondInitialSelected);
    } catch (err: any) {
      console.error("Error loading courses:", err);
      // Handle 402 payment required
      if (err?.status === 402 || err?.message?.includes("payment")) {
        setPaymentRequired(true);
        setError(
          err?.data?.message ??
            "Tuition payment is required before you can register courses.",
        );
      } else {
        setError(err instanceof Error ? err.message : "Failed to load courses");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      // Admitted users (paid acceptance fee, not yet school fees) cannot register courses
      if (isAuthenticated && user?.role === "admitted") {
        router.replace("/student/transactions");
        return;
      }
      if (isAuthenticated) {
        loadCourses();
      }
    }
  }, [authLoading, isAuthenticated, user?.role]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        setIsSearching(true);
        try {
          const res = await ApiClient.searchCourses(searchQuery);
          // filter out courses currently already active in the user's first/second SELECTED boards
          const existingIds = new Set([
            ...firstSelectedIds,
            ...secondSelectedIds,
            ...ptSelectedIds,
          ]);
          setGlobalSearchRes(res.courses.filter((c) => !existingIds.has(c.id)));
        } catch (err) {
          console.error("Search error", err);
        } finally {
          setIsSearching(false);
        }
      } else {
        setGlobalSearchRes([]);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery, firstSelectedIds, secondSelectedIds, ptSelectedIds]);

  const isDeadlinePassed = deadline ? new Date(deadline) < new Date() : false;
  const isFirstLocked = isGlobalLocked || isDeadlinePassed;
  const isSecondLocked = isGlobalLocked || isDeadlinePassed;

  const toggleFirstCourse = (courseId: number, isCompulsory: boolean) => {
    if (isFirstLocked) return;
    setFirstSelectedIds((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId],
    );
  };

  const toggleSecondCourse = (courseId: number, isCompulsory: boolean) => {
    if (isSecondLocked) return;
    setSecondSelectedIds((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId],
    );
  };

  const togglePtCourse = (courseId: number, isCompulsory: boolean) => {
    if (isGlobalLocked || isDeadlinePassed) return;
    setPtSelectedIds((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId],
    );
  };

  const addFromSearch = (
    course: CourseData,
    targetSemester?: "First" | "Second",
  ) => {
    if (isPtRegistration) {
      setPtCourses((prev) => [
        ...prev.filter((c) => c.id !== course.id),
        course,
      ]);
      if (!ptSelectedIds.includes(course.id)) {
        setPtSelectedIds((prev) => [...prev, course.id]);
      }
      setSearchQuery("");
      return;
    }

    if (targetSemester === "First") {
      setFirstCourses((prev) => [
        ...prev.filter((c) => c.id !== course.id),
        course,
      ]); // prevent duplicate array objects
      if (!firstSelectedIds.includes(course.id)) {
        setFirstSelectedIds((prev) => [...prev, course.id]); // auto select
      }
    } else {
      setSecondCourses((prev) => [
        ...prev.filter((c) => c.id !== course.id),
        course,
      ]); // prevent duplicate array objects
      if (!secondSelectedIds.includes(course.id)) {
        setSecondSelectedIds((prev) => [...prev, course.id]); // auto select
      }
    }
    setSearchQuery(""); // clear search to close the box
  };

  const calculateFirstCredits = () => {
    const allFirst = [
      ...firstCourses,
      ...availableCourses.filter((c) => (c.semester ?? "").toLowerCase().startsWith("first"))
    ];
    const uniqueFirst = Array.from(new Map(allFirst.map((c) => [c.id, c])).values());
    return uniqueFirst
      .filter((c) => firstSelectedIds.includes(c.id))
      .reduce((sum, c) => sum + Number(c.credit_units || 0), 0);
  };

  const calculateSecondCredits = () => {
    const allSecond = [
      ...secondCourses,
      ...availableCourses.filter((c) => (c.semester ?? "").toLowerCase().startsWith("second"))
    ];
    const uniqueSecond = Array.from(new Map(allSecond.map((c) => [c.id, c])).values());
    return uniqueSecond
      .filter((c) => secondSelectedIds.includes(c.id))
      .reduce((sum, c) => sum + Number(c.credit_units || 0), 0);
  };

  const calculateTotalCredits = () =>
    calculateFirstCredits() + calculateSecondCredits();

  const calculatePtCredits = () =>
    ptCourses
      .filter((c) => ptSelectedIds.includes(c.id))
      .reduce((sum, c) => sum + Number(c.credit_units || 0), 0);

  const selectedIds = isPtRegistration
    ? ptSelectedIds
    : [...firstSelectedIds, ...secondSelectedIds];

  const hasChanges =
    initialRegisteredIds.length !== selectedIds.length ||
    !initialRegisteredIds.every((id) => selectedIds.includes(id));

  const isDraft = isPtRegistration
    ? ptStatus === "draft"
    : firstStatus === "draft" || secondStatus === "draft";

  const isSaveDisabled =
    submitting ||
    isGlobalLocked ||
    selectedIds.length === 0 ||
    !hasChanges;

  const isSubmitDisabled =
    submitting ||
    isGlobalLocked ||
    selectedIds.length === 0 ||
    (isPtRegistration && calculatePtCredits() < 15) ||
    (isPtRegistration && !canSubmitRegistration) ||
    (!hasChanges && !isDraft);

  const handleRegister = async (status: "draft" | "submitted" = "submitted") => {
    const confirmed = window.confirm(
      status === "draft"
        ? "Are you sure you want to save this course registration as a draft?"
        : "Are you sure you want to submit this course registration?",
    );

    if (!confirmed) return;

    setSubmitting(true);
    setError(null);
    try {
      if (isPtRegistration) {
        if (status === "submitted" && !canSubmitRegistration) {
          setError("Pay the installment for the active semester before submitting registration.");
          return;
        }
        if (status === "submitted" && calculatePtCredits() < 15) {
          setError("Part-time students must register a minimum of 15 units per semester.");
          return;
        }
        await ApiClient.registerCourses(
          ptSelectedIds,
          activeSemesterName ?? "Current",
          status,
        );
        await loadCourses();
        alert(
          status === "draft"
            ? "Course registration draft saved successfully!"
            : "Course registration submitted successfully!"
        );
        return;
      }

      if (!isFirstLocked && firstSelectedIds.length > 0) {
        await ApiClient.registerCourses(firstSelectedIds, "First", status);
      }
      if (!isSecondLocked && secondSelectedIds.length > 0) {
        await ApiClient.registerCourses(secondSelectedIds, "Second", status);
      }
      await loadCourses();
      alert(
        status === "draft"
          ? "Course registration draft saved successfully!"
          : "Course registration submitted successfully!"
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `Failed to save registration as ${status}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (
    authLoading ||
    (loading && !firstCourses.length && !secondCourses.length && !ptCourses.length)
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
      </div>
    );
  }

  const CourseRow = ({
    course,
    isSelected,
    toggleCourse,
    isLocked,
  }: {
    course: CourseData;
    isSelected: boolean;
    toggleCourse: (id: number, isMandatory: boolean) => void;
    isLocked: boolean;
  }) => {
    const cat = (course.category || "").toLowerCase();
    const isMandatory =
      cat === "compulsory" || cat === "compulsary" || cat === "core";
    return (
      <div
        onClick={() => !isLocked && toggleCourse(course.id, isMandatory)}
        className={`flex items-center gap-2 py-1 px-1 rounded group ${
          isLocked
            ? "opacity-60 cursor-not-allowed"
            : "cursor-pointer hover:bg-muted"
        }`}
      >
        {/* Checkbox */}
        <div
          className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center transition-colors ${
            isSelected ? "bg-primary border-primary" : "border-border"
          }`}
        >
          {isSelected && (
            <svg
              className="w-2 h-2 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </div>
        {/* Code */}
        <span className="text-[10px] font-black text-primary shrink-0 w-20 truncate">
          {course.course_code}
        </span>
        {/* Title */}
        <span className="text-xs text-foreground flex-1 truncate leading-tight">
          {course.course_title}
        </span>
        {/* Units */}
        <span className="text-[10px] font-bold text-muted-foreground shrink-0">
          {course.credit_units}u
        </span>
      </div>
    );
  };

  // Pagination Calculations
  const ITEMS_PER_PAGE = 10;

  // First semester available courses (unselected)
  const firstAvailableList = Array.from(
    new Map(
      [
        ...firstCourses.filter((c) => !firstSelectedIds.includes(c.id)),
        ...availableCourses.filter(
          (c) =>
            (c.semester ?? "").toLowerCase().startsWith("first") &&
            !firstSelectedIds.includes(c.id)
        ),
      ].map((c) => [c.id, c])
    ).values()
  );

  // Second semester available courses (unselected)
  const secondAvailableList = Array.from(
    new Map(
      [
        ...secondCourses.filter((c) => !secondSelectedIds.includes(c.id)),
        ...availableCourses.filter(
          (c) =>
            (c.semester ?? "").toLowerCase().startsWith("second") &&
            !secondSelectedIds.includes(c.id)
        ),
      ].map((c) => [c.id, c])
    ).values()
  );

  const firstAvailableTotalPages = Math.max(1, Math.ceil(firstAvailableList.length / ITEMS_PER_PAGE));
  const secondAvailableTotalPages = Math.max(1, Math.ceil(secondAvailableList.length / ITEMS_PER_PAGE));

  const activeFirstAvailablePage = firstAvailablePage > firstAvailableTotalPages ? 1 : firstAvailablePage;
  const activeSecondAvailablePage = secondAvailablePage > secondAvailableTotalPages ? 1 : secondAvailablePage;

  const paginatedFirstAvailable = firstAvailableList.slice(
    (activeFirstAvailablePage - 1) * ITEMS_PER_PAGE,
    activeFirstAvailablePage * ITEMS_PER_PAGE
  );
  const paginatedSecondAvailable = secondAvailableList.slice(
    (activeSecondAvailablePage - 1) * ITEMS_PER_PAGE,
    activeSecondAvailablePage * ITEMS_PER_PAGE
  );

  const PT_ITEMS_PER_PAGE = 20;
  const selectedPtCourses = ptCourses.filter((course) =>
    ptSelectedIds.includes(course.id),
  );
  const availablePtCourses = ptCourses.filter(
    (course) => !ptSelectedIds.includes(course.id),
  );
  const ptTotalPages = Math.max(1, Math.ceil(availablePtCourses.length / PT_ITEMS_PER_PAGE));
  const activePtPage = ptCoursesPage > ptTotalPages ? 1 : ptCoursesPage;
  const paginatedPtCourses = availablePtCourses.slice(
    (activePtPage - 1) * PT_ITEMS_PER_PAGE,
    activePtPage * PT_ITEMS_PER_PAGE,
  );
  const ptLeftColumn = paginatedPtCourses.slice(0, 10);
  const ptRightColumn = paginatedPtCourses.slice(10, 20);

  const PaginationControls = ({
    currentPage,
    totalPages,
    onPageChange,
  }: {
    currentPage: number;
    totalPages: number;
    onPageChange: (p: number) => void;
  }) => {
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40 text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
        <span>Page {currentPage} of {totalPages}</span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px] font-bold rounded-lg border-primary/10 hover:bg-primary/5"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            Prev
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px] font-bold rounded-lg border-primary/10 hover:bg-primary/5"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-4 rounded-xl border border-destructive/20 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 fill-destructive/10 shrink-0" />
            <div className="flex-1 font-medium">{error}</div>
            <Button size="sm" variant="ghost" onClick={() => setError(null)}>
              Dismiss
            </Button>
          </div>
        )}

        {isDeadlinePassed && (!isFirstLocked || !isSecondLocked) && (
          <div className="bg-destructive/10 text-destructive p-4 rounded-xl border border-destructive/20 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 fill-destructive/10 shrink-0" />
            <p className="font-medium uppercase tracking-tight text-xs">
              The registration deadline (
              {deadline ? new Date(deadline).toLocaleDateString() : "passed"})
              has expired. You can no longer modify your courses.
            </p>
          </div>
        )}

        {/* Search Bar */}
        <div className="relative z-20">
          <div className="relative border border-border rounded-2xl shadow-sm bg-card hover:border-primary/50 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search for additional courses (e.g. GST111)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-14 bg-transparent border-none text-base w-full focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none rounded-2xl"
              disabled={isGlobalLocked}
            />
            {isSearching && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
              </div>
            )}
          </div>

          {/* Search Dropdown Popover */}
          {!isGlobalLocked && searchQuery.length >= 2 && !isSearching && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-card rounded-2xl shadow-xl border border-border p-4 max-h-[400px] overflow-y-auto">
              <h3 className="text-sm font-black text-muted-foreground uppercase tracking-wider mb-4 border-b pb-2">
                Database Search Results
              </h3>
              {globalSearchRes.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-4">
                  No new courses found matching "{searchQuery}"
                </p>
              ) : (
                <div className="grid gap-3">
                  {globalSearchRes.map((course) => (
                    <div
                      key={course.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border-2 border-border hover:border-primary/20 transition-colors gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            {course.course_code}
                          </span>
                          <h4 className="font-semibold text-foreground text-sm">
                            {course.course_title}
                          </h4>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-xs font-bold text-muted-foreground">
                            {course.credit_units} UNITS
                          </span>
                          <span className="w-1 h-1 rounded-full bg-border" />
                          <Badge
                            variant="secondary"
                            className="text-[9px] font-black uppercase bg-muted text-muted-foreground"
                          >
                            {course.category || "Elective"}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isPtRegistration ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-8 gap-1 border-primary/20 hover:bg-primary/5 hover:text-primary"
                            onClick={() => addFromSearch(course)}
                            disabled={isGlobalLocked || isDeadlinePassed}
                          >
                            <Plus className="h-3 w-3" /> Add
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-8 gap-1 border-primary/20 hover:bg-primary/5 hover:text-primary"
                              onClick={() => addFromSearch(course, "First")}
                              disabled={isFirstLocked}
                            >
                              <Plus className="h-3 w-3" /> 1st Sem
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-8 gap-1 border-primary/20 hover:bg-primary/5 hover:text-primary"
                              onClick={() => addFromSearch(course, "Second")}
                              disabled={isSecondLocked}
                            >
                              <Plus className="h-3 w-3" /> 2nd Sem
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {isPtRegistration ? (
          <div className="flex flex-col md:flex-row gap-6 relative z-10">
            <div className="flex-1 min-w-0">
              <div className="bg-card rounded-xl border border-border p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <BookOpen className="text-primary w-4 h-4" />
                    <h3 className="text-sm font-black text-foreground uppercase tracking-tight">
                      Courses
                    </h3>
                  </div>
                  <Badge variant="outline" className="font-bold text-xs w-fit">
                    {calculatePtCredits()} Units
                  </Badge>
                </div>

                {ptStatus === "submitted" && (
                  <div className="bg-green-100 text-green-800 px-2 py-1 rounded text-[10px] flex items-center gap-1.5 font-medium mb-3 w-fit">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    Submitted
                  </div>
                )}

                {ptCourses.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic border-t pt-3">
                    No courses found for your programme.
                  </p>
                ) : (
                  <div className="space-y-5 border-t pt-3">
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase tracking-tight text-foreground">
                          Selected Courses
                        </h4>
                        <Badge variant="secondary" className="text-[10px] font-bold">
                          {selectedPtCourses.length}
                        </Badge>
                      </div>
                      {selectedPtCourses.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          No courses selected.
                        </p>
                      ) : (
                        <div className="grid md:grid-cols-2 gap-x-6">
                          {selectedPtCourses.map((course) => (
                            <CourseRow
                              key={course.id}
                              course={course}
                              isSelected={true}
                              toggleCourse={togglePtCourse}
                              isLocked={isGlobalLocked || isDeadlinePassed}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between border-t pt-4">
                        <h4 className="text-xs font-black uppercase tracking-tight text-foreground">
                          Available Courses
                        </h4>
                        <Badge variant="secondary" className="text-[10px] font-bold">
                          {availablePtCourses.length}
                        </Badge>
                      </div>

                      {availablePtCourses.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          No available courses.
                        </p>
                      ) : (
                        <div className="grid md:grid-cols-2 gap-6">
                          <div>
                            {ptLeftColumn.map((course) => (
                              <CourseRow
                                key={course.id}
                                course={course}
                                isSelected={false}
                                toggleCourse={togglePtCourse}
                                isLocked={isGlobalLocked || isDeadlinePassed}
                              />
                            ))}
                          </div>
                          <div>
                            {ptRightColumn.map((course) => (
                              <CourseRow
                                key={course.id}
                                course={course}
                                isSelected={false}
                                toggleCourse={togglePtCourse}
                                isLocked={isGlobalLocked || isDeadlinePassed}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <PaginationControls
                  currentPage={activePtPage}
                  totalPages={ptTotalPages}
                  onPageChange={setPtCoursesPage}
                />
              </div>
            </div>

            <div className="md:w-72 shrink-0">
              <div className="sticky top-24">
                <Card className="shadow-2xl border-none overflow-hidden">
                  <div className="h-2 bg-primary" />
                  <CardHeader className="bg-muted px-6 py-4">
                    <CardTitle className="text-base font-black uppercase text-foreground tracking-wider">
                      Registration Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm items-center pb-2 border-b">
                        <span className="font-medium text-muted-foreground">
                          Semester
                        </span>
                        <span className="font-black text-foreground">
                          {activeSemesterName ?? "Current"}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm items-center pb-2 border-b">
                        <span className="font-medium text-muted-foreground">
                          Selected Courses
                        </span>
                        <span className="font-black text-foreground">
                          {ptSelectedIds.length}
                        </span>
                      </div>
                      <div className="flex justify-between text-base items-center pt-2">
                        <span className="font-bold text-foreground">
                          Valid Credits
                        </span>
                        <span className="font-black text-primary text-xl">
                          {calculatePtCredits()}{" "}
                          <span className="text-xs text-muted-foreground font-bold">
                            UNITS
                          </span>
                        </span>
                      </div>
                    </div>

                    {calculatePtCredits() < 15 && (
                      <p className="text-[11px] text-destructive font-bold leading-tight">
                        Minimum of 15 units is required before submission.
                      </p>
                    )}

                    {!canSubmitRegistration && (
                      <p className="text-[11px] text-amber-700 font-bold leading-tight">
                        Pay the active semester installment before submitting.
                        You can still save your selection as a draft.
                      </p>
                    )}

                    <div className="pt-6 space-y-3">
                      <Button
                        onClick={() => handleRegister("draft")}
                        disabled={isSaveDisabled}
                        variant="outline"
                        className="w-full font-black py-6 text-base rounded-xl shadow-sm hover:scale-[1.02] transition-transform border-primary/20 hover:bg-primary/5 hover:text-primary"
                      >
                        {submitting ? (
                          <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                        ) : (
                          <>Save Draft</>
                        )}
                      </Button>

                      <Button
                        onClick={() => handleRegister("submitted")}
                        disabled={isSubmitDisabled}
                        className="w-full font-black py-6 text-base rounded-xl shadow-xl hover:scale-[1.02] transition-transform text-white"
                        style={{
                          background:
                            "linear-gradient(90deg, #3d2b3d 0%, #5a3f5a 100%)",
                        }}
                      >
                        {submitting ? (
                          <span className="animate-spin relative flex h-4 w-4">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-foreground/20 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-4 w-4 bg-foreground"></span>
                          </span>
                        ) : (
                          <>Submit Registration</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        ) : (
          <>
        {/* Main content: courses left, summary right (sticky) */}
        <div className="flex flex-col md:flex-row gap-6 relative z-10">
          {/* Left: course lists (scrollable) */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Selected courses — 2 columns */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* First Semester Selected */}
              <div>
                <div className="flex items-center justify-between pb-1.5 border-b mb-2">
                  <h2 className="text-sm font-black text-foreground uppercase tracking-tight">
                    1st Sem — Selected
                  </h2>
                  <Badge variant="outline" className="font-bold text-xs">
                    {calculateFirstCredits()} Units
                  </Badge>
                </div>

                {firstStatus === "submitted" && (
                  <div className="bg-green-100 text-green-800 px-2 py-1 rounded text-[10px] flex items-center gap-1.5 font-medium mb-2">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />{" "}
                    Submitted
                  </div>
                )}

                {[
                  ...firstCourses,
                  ...availableCourses.filter((c) =>
                    (c.semester ?? "").toLowerCase().startsWith("first"),
                  ),
                ].filter((c) => firstSelectedIds.includes(c.id)).length ===
                0 ? (
                  <p className="text-xs text-muted-foreground italic px-1">
                    No courses selected.
                  </p>
                ) : (
                  <div>
                    {[
                      ...firstCourses,
                      ...availableCourses.filter((c) =>
                        (c.semester ?? "").toLowerCase().startsWith("first"),
                      ),
                    ]
                      .filter((c) => firstSelectedIds.includes(c.id))
                      .map((course) => (
                        <CourseRow
                          key={course.id}
                          course={course}
                          isSelected={true}
                          toggleCourse={toggleFirstCourse}
                          isLocked={isFirstLocked}
                        />
                      ))}
                  </div>
                )}
              </div>

              {/* Second Semester Selected */}
              <div>
                <div className="flex items-center justify-between pb-1.5 border-b mb-2">
                  <h2 className="text-sm font-black text-foreground uppercase tracking-tight">
                    2nd Sem — Selected
                  </h2>
                  <Badge variant="outline" className="font-bold text-xs">
                    {calculateSecondCredits()} Units
                  </Badge>
                </div>

                {secondStatus === "submitted" && (
                  <div className="bg-green-100 text-green-800 px-2 py-1 rounded text-[10px] flex items-center gap-1.5 font-medium mb-2">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />{" "}
                    Submitted
                  </div>
                )}

                {[
                  ...secondCourses,
                  ...availableCourses.filter((c) =>
                    (c.semester ?? "").toLowerCase().startsWith("second"),
                  ),
                ].filter((c) => secondSelectedIds.includes(c.id)).length ===
                0 ? (
                  <p className="text-xs text-muted-foreground italic px-1">
                    No courses selected.
                  </p>
                ) : (
                  <div>
                    {[
                      ...secondCourses,
                      ...availableCourses.filter((c) =>
                        (c.semester ?? "").toLowerCase().startsWith("second"),
                      ),
                    ]
                      .filter((c) => secondSelectedIds.includes(c.id))
                      .map((course) => (
                        <CourseRow
                          key={course.id}
                          course={course}
                          isSelected={true}
                          toggleCourse={toggleSecondCourse}
                          isLocked={isSecondLocked}
                        />
                      ))}
                  </div>
                )}
              </div>
            </div>
            {/* end selected grid */}

            {/* Available Courses */}
            {!isGlobalLocked && (
              <div className="bg-card rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="text-primary w-4 h-4" />
                  <h3 className="text-sm font-black text-foreground uppercase tracking-tight">
                    Available Courses
                  </h3>
                </div>
                <div className="grid md:grid-cols-2 gap-6 border-t pt-3">
                  {/* 1st Sem Available */}
                  <div className="flex flex-col justify-between h-full">
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                        First Semester
                      </p>
                      {firstAvailableList.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          No available courses.
                        </p>
                      ) : (
                        <div>
                          {paginatedFirstAvailable.map((course) => (
                            <CourseRow
                              key={course.id}
                              course={course}
                              isSelected={false}
                              toggleCourse={toggleFirstCourse}
                              isLocked={isFirstLocked}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <PaginationControls
                      currentPage={activeFirstAvailablePage}
                      totalPages={firstAvailableTotalPages}
                      onPageChange={setFirstAvailablePage}
                    />
                  </div>

                  {/* 2nd Sem Available */}
                  <div className="flex flex-col justify-between h-full">
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                        Second Semester
                      </p>
                      {secondAvailableList.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          No available courses.
                        </p>
                      ) : (
                        <div>
                          {paginatedSecondAvailable.map((course) => (
                            <CourseRow
                              key={course.id}
                              course={course}
                              isSelected={false}
                              toggleCourse={toggleSecondCourse}
                              isLocked={isSecondLocked}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <PaginationControls
                      currentPage={activeSecondAvailablePage}
                      totalPages={secondAvailableTotalPages}
                      onPageChange={setSecondAvailablePage}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* end left side */}

          {/* Right: sticky summary */}
          <div className="md:w-72 shrink-0">
            <div className="sticky top-24">
              <Card className="shadow-2xl border-none overflow-hidden">
                <div className="h-2 bg-primary" />
                <CardHeader className="bg-muted px-6 py-4">
                  <CardTitle className="text-base font-black uppercase text-foreground tracking-wider">
                    Registration Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm items-center pb-2 border-b">
                      <span className="font-medium text-muted-foreground">
                        First Semester Units
                      </span>
                      <span className="font-black text-foreground">
                        {calculateFirstCredits()}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm items-center pb-2 border-b">
                      <span className="font-medium text-muted-foreground">
                        Second Semester Units
                      </span>
                      <span className="font-black text-foreground">
                        {calculateSecondCredits()}
                      </span>
                    </div>
                    <div className="flex justify-between text-base items-center pt-2">
                      <span className="font-bold text-foreground">
                        Total Valid Credits
                      </span>
                      <span className="font-black text-primary text-xl">
                        {calculateTotalCredits()}{" "}
                        <span className="text-xs text-muted-foreground font-bold">
                          UNITS
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="pt-6 space-y-3">
                    <Button
                      onClick={() => handleRegister("draft")}
                      disabled={isSaveDisabled}
                      variant="outline"
                      className="w-full font-black py-6 text-base rounded-xl shadow-sm hover:scale-[1.02] transition-transform border-primary/20 hover:bg-primary/5 hover:text-primary"
                    >
                      {submitting ? (
                        <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                      ) : (
                        <>Save Draft</>
                      )}
                    </Button>

                    <Button
                      onClick={() => handleRegister("submitted")}
                      disabled={isSubmitDisabled}
                      className="w-full font-black py-6 text-base rounded-xl shadow-xl hover:scale-[1.02] transition-transform text-white"
                      style={{
                        background:
                          "linear-gradient(90deg, #3d2b3d 0%, #5a3f5a 100%)",
                      }}
                    >
                      {submitting ? (
                        <span className="animate-spin relative flex h-4 w-4">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-foreground/20 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-4 w-4 bg-foreground"></span>
                        </span>
                      ) : (
                        <>Submit Registration</>
                      )}
                    </Button>
                    <p className="text-[10px] text-center text-muted-foreground font-bold mt-4 px-2 uppercase tracking-tight leading-tight">
                      You can freely edit and resubmit your choices until the
                      registration deadline passes.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
        {/* end flex row */}
          </>
        )}
      </div>
    </div>
  );
}
