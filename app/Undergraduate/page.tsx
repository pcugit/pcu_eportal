"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { undergraduateCourses } from "./undergraduateData";

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, inView };
}

function CourseCard({
  course,
  index,
}: {
  course: (typeof undergraduateCourses)[0];
  index: number;
}) {
  const { ref, inView } = useInView();
  const isEven = index % 2 === 0;

  return (
    <div
      ref={ref}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView
          ? "translateX(0)"
          : `translateX(${isEven ? "-60px" : "60px"})`,
        transition: `opacity 0.55s ease ${index * 0.08}s, transform 0.55s ease ${index * 0.08}s`,
      }}
      className="relative bg-card border border-[#54255f]/10 shadow-sm mx-2 mb-6 overflow-hidden rounded-r-lg border-l-4"
    >
      {/* Brand Color Left Border */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#b91c1c] to-[#54255f]" />

      {/* Subtle dot-grid background accent */}
      <div
        className="absolute right-0 top-0 bottom-0 w-48 opacity-[0.15] pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle, #54255f 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      />

      <div className="relative flex flex-col md:flex-row items-start md:items-center gap-6 px-8 py-8 pl-10">
        {/* Left: text */}
        <div className="flex-1 min-w-0">
          <h2 className="text-[22px] font-semibold mb-3 text-[#54255f]">
            {course.degree}
          </h2>
          <p className="text-[15px] leading-relaxed line-clamp-4 text-muted-foreground">
            {course.shortDescription}
          </p>
        </div>

        {/* Right: Learn More */}
        <div className="shrink-0 mt-4 md:mt-0">
          <Link
            href={`/Undergraduate/${course.slug}`}
            className="inline-flex items-center gap-2 text-[13px] font-bold border border-[#b91c1c] text-[#b91c1c] px-6 py-3 transition-all duration-300 hover:bg-[#b91c1c] hover:text-white tracking-wide uppercase"
          >
            LEARN MORE
            <span className="text-lg leading-none transition-transform duration-300">
              →
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function UndergraduatePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("All");

  const categories = [
    "All",
    "Pure and Applied Sciences",
    "Management & Social Sciences",
  ];

  const getCategory = (degree: string) => {
    const lower = degree.toLowerCase();
    if (
      lower.includes("science") ||
      lower.includes("biochem") ||
      lower.includes("computer")
    )
      return "Pure and Applied Sciences";
    return "Management & Social Sciences";
  };

  const filteredAndSortedCourses = undergraduateCourses.filter((course) => {
    const matchesSearch =
      course.degree.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.shortDescription.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      filterCategory === "All" || getCategory(course.degree) === filterCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="w-full min-h-screen font-sans text-foreground bg-background">
      {/* ── HERO BANNER ── */}
      <div className="relative w-full h-64 md:h-80 overflow-hidden">
        <img
          src="/e-portal/images/students.jpg"
          alt="Undergraduate Programs"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, rgba(185,28,28,0.85) 0%, rgba(84,37,95,0.8) 100%)",
          }}
        />
        <div className="relative z-10 flex flex-col justify-end h-full px-6 md:px-10 pb-10 max-w-5xl mx-auto">
          <span className="text-xs uppercase tracking-[0.4em] text-white/80 mb-3">
            Academics
          </span>
          <h1 className="text-4xl md:text-5xl font-bold text-white drop-shadow-xl">
            Undergraduate Programs
          </h1>
        </div>
      </div>

      {/* ── BODY: Sidebar (left) + Content (right) ── */}
      <div className="flex justify-center bg-background">
        <div className="flex flex-col md:flex-row w-full max-w-6xl py-16 px-6 gap-12 items-stretch">
          {/* Right: Intro + Course list */}
          <div className="flex-1 min-w-0 w-full">
            {/* Intro */}
            <div className="mb-10">
              <h2 className="text-3xl font-bold mb-4 text-[#54255f]">
                Explore Our Programs
              </h2>
              <p className="text-[15px] leading-relaxed text-muted-foreground">
                The University currently has two faculties with 6 departments,
                offering various courses cut across different specialisations.
                Use the tools below to find the perfect course for your career
                path.
              </p>
            </div>

            {/* Controls: Search, Filter, Sort */}
            <div className="flex flex-col md:flex-row gap-4 mb-10 bg-[#54255f]/[0.02] p-5 rounded-lg border border-[#54255f]/10 shadow-sm">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Search programs by name or keyword..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-4 pr-10 py-3 border border-border rounded-md focus:outline-none focus:border-[#54255f] focus:ring-1 focus:ring-[#54255f] transition-colors text-[14px] text-foreground bg-input"
                />
                <div className="absolute right-3 top-3 text-muted-foreground">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-5 h-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                    />
                  </svg>
                </div>
              </div>
              <div className="flex gap-4 md:w-auto w-full">
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="flex-1 md:w-48 px-4 py-3 border border-border rounded-md focus:outline-none focus:border-[#54255f] focus:ring-1 focus:ring-[#54255f] transition-colors text-[14px] bg-input text-foreground cursor-pointer"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Course cards */}
            <div className="space-y-4">
              {filteredAndSortedCourses.length > 0 ? (
                filteredAndSortedCourses.map((course, i) => (
                  <CourseCard key={course.slug} course={course} index={i} />
                ))
              ) : (
                <div className="text-center py-12 bg-muted rounded-lg border border-border">
                  <p className="text-[#54255f] font-medium text-lg">
                    No programs found matching your search.
                  </p>
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setFilterCategory("All");
                    }}
                    className="mt-4 text-[#b91c1c] hover:underline font-medium"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
