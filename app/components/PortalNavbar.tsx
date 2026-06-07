"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const directPortalLinks = [
  { label: "Admissions Portal", href: "/auth/login" },
  { label: "Staff Portal", href: "/staff/login" },
];

const studentPortalLinks = [
  { label: "Undergraduate", href: "/student/login" },
  { label: "Postgraduate", href: "/pgstudents/login" },
  { label: "Part-Time", href: "/ptstudents/login" },
];

export function PortalNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [studentsOpen, setStudentsOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between px-6 py-3 lg:px-10">
          <Link href="/" className="shrink-0">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border-2 border-gray-200 bg-white">
              <Image
                src="/e-portal/images/logo new.png"
                alt="University Logo"
                width={64}
                height={64}
                className="h-14 w-14 object-contain"
              />
            </div>
          </Link>

          <nav className="hidden items-center gap-2 lg:flex">
            {directPortalLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="whitespace-nowrap px-2 py-1 text-sm font-medium text-gray-600 transition-colors hover:text-red-600"
              >
                {link.label}
              </Link>
            ))}
            <div className="relative">
              <button
                type="button"
                onClick={() => setStudentsOpen((open) => !open)}
                className="flex items-center gap-1 whitespace-nowrap px-2 py-1 text-sm font-medium text-gray-600 transition-colors hover:text-red-600"
              >
                Students Portal
                <svg
                  className={`h-3 w-3 transition-transform ${
                    studentsOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {studentsOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-sm border border-gray-100 bg-white py-1 shadow-xl">
                  {studentPortalLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setStudentsOpen(false)}
                      className="block px-4 py-2.5 text-sm text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>

          <Link
            href="/auth/signup"
            className="hidden whitespace-nowrap rounded bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 lg:inline-block"
          >
            Apply Now
          </Link>

          <button
            type="button"
            className="rounded p-2 text-gray-700 transition-colors hover:bg-gray-100 lg:hidden"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label="Toggle portal menu"
          >
            {mobileOpen ? (
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 lg:hidden ${
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMobileOpen(false)}
      />

      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-72 flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between bg-red-600 px-5 py-4">
          <span className="text-base font-bold tracking-wide text-white">
            Menu
          </span>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="text-white transition-colors hover:text-red-200"
            aria-label="Close portal menu"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-gray-100 px-5 py-4">
            <Link
              href="/auth/signup"
              onClick={() => setMobileOpen(false)}
              className="block w-full rounded bg-red-600 py-2.5 text-center text-sm font-bold text-white transition-colors hover:bg-red-700"
            >
              Apply Now
            </Link>
          </div>

          <nav className="px-5 py-2">
            <p className="mb-2 mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
              Portals
            </p>
            {directPortalLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="block border-b border-gray-50 py-2.5 text-sm font-medium text-gray-700 transition-colors last:border-0 hover:text-red-600"
              >
                {link.label}
              </Link>
            ))}
            <div className="border-b border-gray-50 py-2.5">
              <p className="mb-2 text-sm font-medium text-gray-700">
                Students Portal
              </p>
              <div className="pl-3">
                {studentPortalLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="block py-1.5 text-sm text-gray-500 transition-colors hover:text-red-600"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </nav>
        </div>
      </div>
    </>
  );
}
