"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

// ── Search keyword index ──────────────────────────────────────────────────────
// Each entry has a label (what the user sees) and an href (where it links).
const SEARCH_KEYWORDS: { label: string; href: string; category: string }[] = [
  // E-Portal
  { label: "Student Portal", href: "/student/login", category: "E-Portal" },
  { label: "Staff Portal", href: "#", category: "E-Portal" },
  { label: "Result Checker", href: "#", category: "E-Portal" },
  // Programs
  { label: "Postgraduate", href: "/Postgraduate", category: "Programs" },
  { label: "Undergraduate", href: "/Undergraduate", category: "Programs" },
  { label: "Part Time", href: "/PartTime", category: "Programs" },
  // News & Events
  { label: "News", href: "#", category: "News & Events" },
  { label: "Events", href: "#", category: "News & Events" },
  { label: "Gallery", href: "#", category: "News & Events" },
  // About Us
  { label: "Our History", href: "/AboutUs/OurHistory", category: "About Us" },
  { label: "Vision & Mission", href: "/AboutUs/VisionMission", category: "About Us" },
  { label: "Spirituality in PCU", href: "/AboutUs/Spirituality", category: "About Us" },
  { label: "Leadership and Organization", href: "/AboutUs/Leadership", category: "About Us" },
  { label: "PCU at a Glance", href: "/AboutUs/AtAGlance", category: "About Us" },
  // Academics
  { label: "Faculties & Departments", href: "/Academics/Faculties", category: "Academics" },
  { label: "List of Staff", href: "#", category: "Academics" },
  { label: "Academic Calendar", href: "#", category: "Academics" },
  // Admissions
  { label: "2025/2026 Admissions", href: "/Admissions", category: "Admissions" },
  { label: "Undergraduate Admissions", href: "/Undergraduate", category: "Admissions" },
  { label: "Postgraduate Admissions", href: "/Postgraduate#accredited-courses", category: "Admissions" },
  { label: "Part Time Admissions", href: "/PartTime#accredited-courses", category: "Admissions" },
  { label: "JUPEB", href: "#", category: "Admissions" },
  // Research
  { label: "Research Centers", href: "#", category: "Research" },
  { label: "Publications", href: "#", category: "Research" },
  { label: "Library Collections", href: "#", category: "Research" },
  // Library
  { label: "E-Library", href: "#", category: "Library" },
  { label: "Catalogue", href: "#", category: "Library" },
  { label: "Resources", href: "#", category: "Library" },
  // Contact
  { label: "Contact", href: "#", category: "General" },
  { label: "Apply Now", href: "#", category: "General" },
];

function getMatches(query: string) {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  return SEARCH_KEYWORDS.filter((k) =>
    k.label.toLowerCase().includes(q) || k.category.toLowerCase().includes(q)
  ).slice(0, 7); // cap at 7 suggestions
}

// ── Search Box (shared between desktop + mobile) ──────────────────────────────
function SearchBox({ onClose }: { onClose?: () => void }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(-1);

  const suggestions = getMatches(query);
  const showDropdown = focused && suggestions.length > 0;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      window.location.href = suggestions[activeIdx].href;
      setQuery("");
      setFocused(false);
      onClose?.();
    } else if (e.key === "Escape") {
      setFocused(false);
    }
  };

  const handleSelect = (href: string) => {
    setQuery("");
    setFocused(false);
    onClose?.();
    window.location.href = href;
  };

  // Highlight matched portion of label
  const highlight = (label: string) => {
    if (!query.trim()) return label;
    const idx = label.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return label;
    return (
      <>
        {label.slice(0, idx)}
        <mark className="bg-red-100 text-red-700 rounded-sm px-0.5 font-semibold not-italic">
          {label.slice(idx, idx + query.length)}
        </mark>
        {label.slice(idx + query.length)}
      </>
    );
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className={`flex items-center border rounded px-3 py-2 bg-white transition-all duration-200 ${
          focused ? "border-red-400 shadow-sm ring-1 ring-red-200" : "border-gray-300"
        }`}
      >
        <svg
          className="w-4 h-4 text-gray-400 mr-2 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <circle cx="11" cy="11" r="8" />
          <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Search..."
          className="text-sm text-gray-600 outline-none w-full bg-transparent placeholder-gray-400"
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIdx(-1);
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            className="ml-1 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
            aria-label="Clear search"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Suggestions dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 shadow-xl rounded-sm z-[60] overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(s.href); }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${
                activeIdx === i ? "bg-red-50" : "hover:bg-gray-50"
              }`}
            >
              <span className="text-sm text-gray-700">{highlight(s.label)}</span>
              <span className="text-[10px] text-gray-400 ml-3 shrink-0 bg-gray-100 px-1.5 py-0.5 rounded">
                {s.category}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Nav data ──────────────────────────────────────────────────────────────────
const topNavLinks = [
  {
    label: "E-Portal",
    hasDropdown: true,
    children: ["Student Portal", "Staff Portal", "Result Checker"],
  },
  { label: "Postgraduate", hasDropdown: false, href: "/Postgraduate" },
  { label: "Undergraduate", hasDropdown: false, href: "/Undergraduate" },
  { label: "Part Time", hasDropdown: false, href: "/PartTime" },
  {
    label: "News & Event",
    hasDropdown: true,
    children: ["News", "Events", "Gallery"],
  },
];

const bottomNavLinks = [
  {
    label: "About Us",
    hasDropdown: true,
    children: [
      { label: "Our History", href: "/AboutUs/OurHistory" },
      { label: "Vision & Mission", href: "/AboutUs/VisionMission" },
      { label: "Spirituality in PCU", href: "/AboutUs/Spirituality" },
      { label: "Leadership and Organization", href: "/AboutUs/Leadership" },
      { label: "PCU at a Glance", href: "/AboutUs/AtAGlance" },
    ],
  },
  {
    label: "Academics",
    hasDropdown: true,
    children: [
      { label: "Faculties & Departments", href: "/Academics/Faculties" },
      { label: "List of Staff", href: "#" },
      { label: "Academic Calendar", href: "#" },
    ],
  },
  {
    label: "Admissions",
    hasDropdown: true,
    children: [
      { label: "2025/2026 Admissions", href: "/Admissions" },
      { label: "Undergraduate", href: "/Undergraduate" },
      { label: "Postgraduate", href: "/Postgraduate#accredited-courses" },
      { label: "Part Time", href: "/PartTime#accredited-courses" },
      { label: "JUPEB", href: "#" },
    ],
  },
  {
    label: "Research and Collections",
    hasDropdown: true,
    children: ["Research Centers", "Publications", "Library Collections"],
  },
  {
    label: "Library",
    hasDropdown: true,
    children: ["E-Library", "Catalogue", "Resources"],
  },
  { label: "Contact", hasDropdown: false },
];

// ── ChevronIcon ───────────────────────────────────────────────────────────────
function ChevronIcon({ className = "" }) {
  return (
    <svg
      className={`w-3 h-3 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// ── DropdownItem ──────────────────────────────────────────────────────────────
function DropdownItem({ link }: { link: any }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const content = (
    <>
      {link.label}
      {link.hasDropdown && (
        <ChevronIcon className={`transition-transform ${open ? "rotate-180" : ""}`} />
      )}
    </>
  );

  if (link.hasDropdown) {
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-600 font-medium whitespace-nowrap transition-colors py-1 px-2"
        >
          {content}
        </button>
        {open && link.children && (
          <div className="absolute top-full left-0 mt-1 w-52 bg-white border border-gray-100 shadow-xl z-50 rounded-sm py-1">
            {link.children.map((child: any, i: number) => {
              const label = typeof child === "string" ? child : child.label;
              const href = typeof child === "string" ? "#" : child.href;
              return (
                <Link
                  key={i}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2.5 text-sm text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  {label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  } else if (link.href) {
    return (
      <Link
        href={link.href}
        className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-600 font-medium whitespace-nowrap transition-colors py-1 px-2"
      >
        {link.label}
      </Link>
    );
  } else {
    return (
      <button className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-600 font-medium whitespace-nowrap transition-colors py-1 px-2">
        {link.label}
      </button>
    );
  }
}

// ── Navbar ────────────────────────────────────────────────────────────────────
export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [expandedBottom, setExpandedBottom] = useState<string | null>(null);

  const toggleSection = (key: string) =>
    setExpandedSection((prev) => (prev === key ? null : key));
  const toggleBottom = (key: string) =>
    setExpandedBottom((prev) => (prev === key ? null : key));

  return (
    <>
      {/* ── TOP ROW (Sticky) ── */}
      <div className="w-full bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center justify-between px-6 lg:px-10 py-3">
          {/* Logo */}
          <a href="/" className="shrink-0">
            <div className="w-16 h-16 border-2 border-gray-200 rounded-lg overflow-hidden flex items-center justify-center bg-white">
              <img
                src="/e-portal/images/logo new.png"
                alt="University Logo"
                sizes="(max-width: 500px) 100vw, 500px"
                className="aspect-[auto_500_/_500] box-border caret-transparent inline-block max-w-full break-words text-center w-20 md:text-left md:w-4/5"
              />
            </div>
          </a>

          {/* Search — desktop only */}
          <div className="hidden lg:block w-56">
            <SearchBox />
          </div>

          {/* Top nav links — desktop only */}
          <div className="hidden lg:flex items-center gap-1">
            {topNavLinks.map((link, i) => (
              <DropdownItem key={i} link={link} />
            ))}
          </div>

          {/* Apply Now — desktop only */}
          <a
            href="/e-portal/auth/signup"
            className="hidden lg:inline-block bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-5 py-2.5 rounded transition-colors whitespace-nowrap"
          >
            Apply Now
          </a>

          {/* Hamburger — mobile only */}
          <button
            className="lg:hidden p-2 rounded text-gray-700 hover:bg-gray-100 transition-colors"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── BOTTOM ROW (Desktop only) ── */}
      <nav className="hidden lg:flex items-center justify-center gap-2 px-6 py-2.5 border border-gray-200 mx-6 my-2 rounded-sm bg-white shadow-sm">
        {bottomNavLinks.map((link, i) => (
          <DropdownItem key={i} link={link} />
        ))}
      </nav>

      {/* ── MOBILE DRAWER ── */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-300 lg:hidden ${
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setMobileOpen(false)}
      />

      <div
        className={`fixed top-0 right-0 h-full w-72 bg-white z-50 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 bg-red-600 shrink-0">
          <span className="text-white font-bold text-base tracking-wide">Menu</span>
          <button onClick={() => setMobileOpen(false)} className="text-white hover:text-red-200 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Apply Now */}
          <div className="px-5 py-4 border-b border-gray-100">
            <a
              href="/e-portal/auth/signup"
              className="block w-full text-center bg-red-600 hover:bg-red-700 text-white text-sm font-bold py-2.5 rounded transition-colors"
            >
              Apply Now
            </a>
          </div>

          {/* Search — mobile */}
          <div className="px-5 py-3 border-b border-gray-100">
            <SearchBox onClose={() => setMobileOpen(false)} />
          </div>

          {/* Top nav links */}
          <div className="px-5 py-2 border-b border-gray-100">
            <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2 mt-1">
              Quick Links
            </p>
            {topNavLinks.map((link, i) => (
              <div key={i} className="border-b border-gray-50 last:border-0">
                {link.hasDropdown ? (
                  <button
                    className="flex items-center justify-between w-full py-2.5 text-sm text-gray-700 hover:text-red-600 font-medium transition-colors"
                    onClick={() => toggleSection(`top-${i}`)}
                  >
                    {link.label}
                    <ChevronIcon
                      className={`transition-transform duration-200 ${
                        expandedSection === `top-${i}` ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                ) : link.href ? (
                  <Link
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-between w-full py-2.5 text-sm text-gray-700 hover:text-red-600 font-medium transition-colors"
                  >
                    {link.label}
                  </Link>
                ) : (
                  <span className="flex items-center justify-between w-full py-2.5 text-sm text-gray-700 font-medium">
                    {link.label}
                  </span>
                )}
                {link.hasDropdown && expandedSection === `top-${i}` && link.children && (
                  <div className="pb-2 pl-3">
                    {link.children.map((child: any, j: number) => {
                      const label = typeof child === "string" ? child : child.label;
                      const href = typeof child === "string" ? "#" : child.href;
                      return (
                        <Link
                          key={j}
                          href={href}
                          onClick={() => setMobileOpen(false)}
                          className="block py-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
                        >
                          {label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Bottom nav links */}
          <div className="px-5 py-2">
            <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2 mt-1">
              Navigation
            </p>
            {bottomNavLinks.map((link, i) => (
              <div key={i} className="border-b border-gray-50 last:border-0">
                <button
                  className="flex items-center justify-between w-full py-2.5 text-sm text-gray-700 hover:text-red-600 font-medium transition-colors"
                  onClick={() => link.hasDropdown && toggleBottom(`bot-${i}`)}
                >
                  {link.label}
                  {link.hasDropdown && (
                    <ChevronIcon
                      className={`transition-transform duration-200 ${
                        expandedBottom === `bot-${i}` ? "rotate-180" : ""
                      }`}
                    />
                  )}
                </button>
                {link.hasDropdown && expandedBottom === `bot-${i}` && link.children && (
                  <div className="pb-2 pl-3">
                    {link.children.map((child: any, j: number) => {
                      const label = typeof child === "string" ? child : child.label;
                      const href = typeof child === "string" ? "#" : child.href;
                      return (
                        <Link
                          key={j}
                          href={href}
                          onClick={() => setMobileOpen(false)}
                          className="block py-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
                        >
                          {label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
