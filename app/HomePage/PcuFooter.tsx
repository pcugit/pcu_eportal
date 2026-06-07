"use client";
import { useState } from "react";

const quickLinks = [
  { label: "Contact Us", href: "#" },
  { label: "Privacy Policy", href: "#" },
  { label: "Financial Aid", href: "#" },
  { label: "E-learning", href: "#" },
];

const academicLinks = [
  { label: "Admissions", href: "#" },
  { label: "Research", href: "#" },
  { label: "News", href: "#" },
];

const resourceLinks = [
  { label: "Portals", href: "#" },
  { label: "Directories", href: "#" },
  { label: "Donate", href: "#" },
];

const socialIcons = {
  facebook: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
    </svg>
  ),
  twitter: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
      <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/>
    </svg>
  ),
  instagram: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
    </svg>
  ),
};

export default function PcuFooter() {
  const [email, setEmail] = useState("");

  return (
    <footer className="bg-[#1a1a1a] text-white font-sans">
      {/* Main footer content */}
      <div className="max-w-7xl mx-auto px-6 py-14 grid grid-cols-1 lg:grid-cols-3 gap-12">

        {/* Left: Quick Links in 3 columns */}
        <div className="lg:col-span-2">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-8">
            Quick Links
          </h3>
          <div className="grid grid-cols-3 gap-x-8 gap-y-5">
            {/* Column 1 */}
            <ul className="space-y-5">
              {quickLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-gray-300 hover:text-white transition-colors duration-200 text-[15px]"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            {/* Column 2 */}
            <ul className="space-y-5">
              {academicLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-gray-300 hover:text-white transition-colors duration-200 text-[15px]"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            {/* Column 3 */}
            <ul className="space-y-5">
              {resourceLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-gray-300 hover:text-white transition-colors duration-200 text-[15px]"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Newsletter */}
          <div className="mt-12">
            <h3 className="text-base font-semibold text-white mb-1">Newsletter</h3>
            <p className="text-sm text-gray-400 mb-4">
              Get the latest news from PCU delivered to your inbox.
            </p>
            <div className="flex items-stretch max-w-sm">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your Email"
                className="flex-1 bg-transparent border border-gray-500 text-gray-200 placeholder-gray-500 px-4 py-2.5 text-sm focus:outline-none focus:border-gray-300 transition-colors"
              />
              <button
                onClick={() => setEmail("")}
                className="bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-bold tracking-widest uppercase px-5 py-2.5 transition-colors duration-200 whitespace-nowrap"
              >
                Subscribe
              </button>
            </div>
          </div>
        </div>

        {/* Right: Instagram image block */}
        <div className="relative rounded overflow-hidden h-64 lg:h-auto min-h-[260px]">
          <img
            src="/e-portal/images/school1.png"
            alt="PCU Campus"
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.currentTarget as HTMLImageElement;
              target.style.display = "none";
              if (target.parentElement) {
                target.parentElement.classList.add("bg-gray-700");
              }
            }}
          />
          {/* Instagram overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
            </svg>
            <span className="text-white text-sm font-semibold tracking-wider uppercase">
              PCU on Instagram
            </span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-700 mx-6" />

      {/* Bottom bar */}
      <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-gray-400 text-sm text-center sm:text-left">
          Copyright © 2025–2026 Precious Cornerstone University | All Rights Reserved
        </p>
        <div className="flex items-center gap-4">
          {Object.entries(socialIcons).map(([name, icon]) => (
            <a
              key={name}
              href="#"
              aria-label={name}
              className="text-gray-400 hover:text-white transition-colors duration-200"
            >
              {icon}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
