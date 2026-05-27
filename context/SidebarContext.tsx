"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

type SidebarContextType = {
  isOpen: boolean;
  toggle: () => void;
};

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = () => setIsOpen((prev) => !prev);

  // Initialize state based on screen size in client side
  useEffect(() => {
    if (typeof window !== "undefined") {
      const isDesktop = window.innerWidth >= 1024;
      setIsOpen(isDesktop);
    }
  }, []);

  // Apply CSS variables and classes for layout spacing
  useEffect(() => {
    if (isOpen) {
      document.documentElement.classList.add("sidebar-open");
    } else {
      document.documentElement.classList.remove("sidebar-open");
    }
  }, [isOpen]);

  return (
    <SidebarContext.Provider value={{ isOpen, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
