import type React from "react";

export default function PgAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="admission-officer-official">{children}</div>;
}
