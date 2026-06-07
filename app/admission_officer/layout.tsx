import type React from "react";

export default function AdmissionOfficerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="admission-officer-official">{children}</div>;
}
