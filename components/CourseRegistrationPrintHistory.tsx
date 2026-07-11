"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { ApiClient } from "@/lib/api";
import {
  getSessionImageUrl,
  setSessionImageUrl,
} from "@/lib/sessionImageCache";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Printer } from "lucide-react";

type RegistrationHistoryCourse = {
  id: number;
  course_code: string;
  course_title: string;
  credit_units: number;
  category?: string | null;
};

type RegistrationHistoryItem = {
  id: number;
  session: string;
  semester: string;
  status: string;
  total_credits: number;
  submitted_at?: string | null;
  courses: RegistrationHistoryCourse[];
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function CourseRegistrationPrintHistory() {
  const { user, student, isAuthenticated, isLoading } = useAuth();
  const [registrationHistory, setRegistrationHistory] = useState<
    RegistrationHistoryItem[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [passportUrl, setPassportUrl] = useState<string | null>(null);
  const studentName = user?.name || "N/A";
  const matricNumber = student?.matric_number || "N/A";
  const schoolName = student?.is_pg_student
    ? "The Postgraduate School"
    : "Part-Time Studies";

  useEffect(() => {
    let isMounted = true;

    const loadRegistrationHistory = async () => {
      try {
        const data = await ApiClient.getStudentRegistrationHistory();
        if (isMounted) {
          setRegistrationHistory(data.history ?? []);
        }
      } catch (err) {
        console.error("Failed to load registration history:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadRegistrationHistory();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const fetchPassport = async () => {
      if (!isAuthenticated || isLoading || !student) return;

      try {
        const profile = await ApiClient.getStudentProfile();
        const passportDoc = (profile?.documents || []).find(
          (document: any) =>
            document.document_type?.toLowerCase().includes("passport") ||
            document.display_name?.toLowerCase().includes("passport") ||
            document.original_filename?.toLowerCase().includes("passport"),
        );
        const documentId = passportDoc?.document_id || passportDoc?.id;

        if (!documentId) {
          if (active) setPassportUrl(null);
          return;
        }

        const cacheKey = `course-slip-passport:${user?.id ?? "current"}:${documentId}`;
        const cachedUrl = getSessionImageUrl(cacheKey);
        if (cachedUrl) {
          if (active) setPassportUrl(cachedUrl);
          return;
        }

        const token = localStorage.getItem("auth_token") || "";
        const response = await fetch(
          `${ApiClient.getBaseUrl()}/applicant/download-document/${documentId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (response.ok && active) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setSessionImageUrl(cacheKey, url);
          setPassportUrl(url);
        }
      } catch (err) {
        console.error("Failed to load course slip passport:", err);
      }
    };

    fetchPassport();

    return () => {
      active = false;
    };
  }, [isAuthenticated, isLoading, student, user?.id]);

  const printRegistrationSlip = (item: RegistrationHistoryItem) => {
    const totalUnits =
      item.total_credits ||
      item.courses.reduce(
        (sum, course) => sum + Number(course.credit_units || 0),
        0,
      );
    const rows = item.courses
      .map(
        (course, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(course.course_code)}</td>
            <td>${escapeHtml(course.course_title)}</td>
            <td>${escapeHtml(course.category || "")}</td>
            <td class="units">${escapeHtml(course.credit_units)}</td>
          </tr>
        `,
      )
      .join("");

    const printWindow = window.open("", "_blank", "width=900,height=1100");
    if (!printWindow) return;

    const passportMarkup = passportUrl
      ? `<img class="passport" src="${passportUrl}" alt="Passport Photograph" />`
      : `<div class="passport placeholder">Passport<br />Photograph</div>`;

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title></title>
          <style>
            @page { size: A4; margin: 0; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              color: #000;
              font-family: "Times New Roman", Times, serif;
              background: #fff;
            }
            .sheet {
              width: 210mm;
              min-height: 297mm;
              padding: 18mm;
              margin: 0 auto;
              background: #fff;
            }
            .header {
              display: grid;
              grid-template-columns: 130px 1fr 130px;
              align-items: center;
              gap: 18px;
            }
            .logo {
              width: 92px;
              height: 92px;
              object-fit: contain;
              justify-self: center;
            }
            .title {
              text-align: center;
              line-height: 1.15;
              font-weight: 700;
            }
            .title .uni {
              font-size: 30px;
              letter-spacing: .5px;
              text-transform: uppercase;
            }
            .title .place {
              font-size: 22px;
              text-transform: uppercase;
            }
            .title .school {
              margin-top: 14px;
              font-size: 24px;
            }
            .passport {
              width: 32mm;
              height: 38mm;
              border: 1.5px solid #000;
              object-fit: cover;
              justify-self: center;
              align-self: start;
              background: #fff;
            }
            .passport.placeholder {
              display: flex;
              align-items: center;
              justify-content: center;
              text-align: center;
              font-size: 10px;
              line-height: 1.2;
              color: #555;
            }
            .rule {
              border: 0;
              border-top: 3px solid #000;
              margin: 34px 0 22px;
            }
            .doc-title {
              text-align: center;
              font-size: 20px;
              font-weight: 700;
              text-transform: uppercase;
              text-decoration: underline;
              margin-bottom: 24px;
            }
            .details {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 10px 28px;
              margin-bottom: 22px;
              font-size: 15px;
            }
            .detail {
              display: grid;
              grid-template-columns: 120px 1fr;
              gap: 8px;
            }
            .label { font-weight: 700; }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 14px;
            }
            th, td {
              border: 1px solid #000;
              padding: 8px 9px;
              vertical-align: top;
            }
            th {
              text-align: left;
              font-weight: 700;
              text-transform: uppercase;
            }
            td:first-child, th:first-child {
              width: 42px;
              text-align: center;
            }
            .units {
              width: 70px;
              text-align: center;
              font-weight: 700;
            }
            .total {
              margin-top: 12px;
              text-align: right;
              font-weight: 700;
              font-size: 15px;
            }
            .signatures {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 80px;
              margin-top: 78px;
              font-size: 15px;
            }
            .line {
              border-top: 1.5px solid #000;
              padding-top: 8px;
              text-align: center;
              font-weight: 700;
            }
            .date-line {
              display: none;
            }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .sheet { margin: 0; }
            }
          </style>
        </head>
        <body>
          <main class="sheet">
            <section class="header">
              <img class="logo" src="/e-portal/images/logo new.png" alt="PCU Logo" />
              <div class="title">
                <div class="uni">Precious Cornerstone<br />University,</div>
                <div class="place">Ibadan, Oyo State.</div>
                <div class="school">${escapeHtml(schoolName)}</div>
              </div>
              ${passportMarkup}
            </section>
            <hr class="rule" />

            <div class="doc-title">Course Registration Slip</div>

            <section class="details">
              <div class="detail">
                <span class="label">Full Name:</span>
                <span>${escapeHtml(studentName)}</span>
              </div>
              <div class="detail">
                <span class="label">Matric No.:</span>
                <span>${escapeHtml(matricNumber)}</span>
              </div>
              <div class="detail">
                <span class="label">Session:</span>
                <span>${escapeHtml(item.session)}</span>
              </div>
              <div class="detail">
                <span class="label">Semester:</span>
                <span>${escapeHtml(item.semester)}</span>
              </div>
            </section>

            <table>
              <thead>
                <tr>
                  <th>S/N</th>
                  <th>Code</th>
                  <th>Course Title</th>
                  <th>Category</th>
                  <th>Units</th>
                </tr>
              </thead>
              <tbody>
                ${
                  rows ||
                  `<tr><td colspan="5" style="text-align:center;">No courses registered.</td></tr>`
                }
              </tbody>
            </table>

            <div class="total">Total Units: ${escapeHtml(totalUnits)}</div>

            <section class="signatures">
              <div class="line">Course Adviser Signature</div>
              <div class="line">Student Signature &amp; Date</div>
            </section>
          </main>
          <script>
            window.onload = () => {
              window.focus();
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="px-6 py-5">
        <CardTitle className="text-base font-black uppercase tracking-tight text-foreground">
          Print Course Form
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 px-6 pb-6 pt-0">
        {loading ? (
          <p className="text-xs font-medium text-muted-foreground">
            Loading registered course forms...
          </p>
        ) : registrationHistory.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">
            No submitted course registration found.
          </p>
        ) : (
          registrationHistory.map((item) => {
            const totalUnits =
              item.total_credits ||
              item.courses.reduce(
                (sum, course) => sum + Number(course.credit_units || 0),
                0,
              );

            return (
              <div
                key={item.id}
                className="overflow-hidden rounded-xl border border-border/70 bg-white shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-5 py-3">
                  <div>
                    <p className="text-sm font-black uppercase tracking-tight text-foreground">
                      {item.session} / {item.semester}
                    </p>
                    <p className="text-[11px] font-bold uppercase text-muted-foreground">
                      {item.status}
                      {item.submitted_at
                        ? ` - ${new Date(item.submitted_at).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-bold">
                      {totalUnits} Units
                    </Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 gap-2 px-3 text-xs font-bold"
                      onClick={() => printRegistrationSlip(item)}
                    >
                      <Printer className="h-4 w-4" />
                      Print
                    </Button>
                  </div>
                </div>

                <div className="mx-auto max-w-4xl bg-white px-6 py-7 text-black">
                  <div className="grid grid-cols-[96px_1fr_96px] items-start gap-4">
                    <img
                      src="/e-portal/images/logo new.png"
                      alt="PCU Logo"
                      className="mx-auto h-20 w-20 object-contain"
                    />
                    <div className="text-center font-serif font-bold leading-tight">
                      <div className="text-2xl uppercase">
                        Precious Cornerstone
                        <br />
                        University,
                      </div>
                      <div className="text-lg uppercase">Ibadan, Oyo State.</div>
                      <div className="mt-3 text-lg">{schoolName}</div>
                    </div>
                    {passportUrl ? (
                      <img
                        src={passportUrl}
                        alt="Passport Photograph"
                        className="h-28 w-24 border border-black object-cover"
                      />
                    ) : (
                      <div className="flex h-28 w-24 items-center justify-center border border-black text-center text-[10px] leading-tight text-muted-foreground">
                        Passport
                        <br />
                        Photograph
                      </div>
                    )}
                  </div>

                  <div className="my-5 border-t-2 border-black" />
                  <h3 className="text-center font-serif text-lg font-bold uppercase underline">
                    Course Registration Slip
                  </h3>

                  <div className="mt-5 grid gap-x-8 gap-y-2 text-sm md:grid-cols-2">
                    <div className="grid grid-cols-[96px_1fr] gap-3">
                      <span className="font-bold">Full Name:</span>
                      <span>{studentName}</span>
                    </div>
                    <div className="grid grid-cols-[96px_1fr] gap-3">
                      <span className="font-bold">Matric No.:</span>
                      <span>{matricNumber}</span>
                    </div>
                    <div className="grid grid-cols-[96px_1fr] gap-3">
                      <span className="font-bold">Session:</span>
                      <span>{item.session}</span>
                    </div>
                    <div className="grid grid-cols-[96px_1fr] gap-3">
                      <span className="font-bold">Semester:</span>
                      <span>{item.semester}</span>
                    </div>
                  </div>

                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full border-collapse font-serif text-sm">
                      <thead>
                        <tr>
                          <th className="border border-black px-2 py-2 text-center">
                            S/N
                          </th>
                          <th className="border border-black px-2 py-2 text-left">
                            Code
                          </th>
                          <th className="border border-black px-2 py-2 text-left">
                            Course Title
                          </th>
                          <th className="border border-black px-2 py-2 text-left">
                            Category
                          </th>
                          <th className="border border-black px-2 py-2 text-center">
                            Units
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.courses.length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="border border-black px-2 py-3 text-center"
                            >
                              No courses registered.
                            </td>
                          </tr>
                        ) : (
                          item.courses.map((course, index) => (
                            <tr key={`${item.id}-${course.id}`}>
                              <td className="border border-black px-2 py-2 text-center">
                                {index + 1}
                              </td>
                              <td className="border border-black px-2 py-2 font-bold">
                                {course.course_code}
                              </td>
                              <td className="border border-black px-2 py-2">
                                {course.course_title}
                              </td>
                              <td className="border border-black px-2 py-2">
                                {course.category || ""}
                              </td>
                              <td className="border border-black px-2 py-2 text-center font-bold">
                                {course.credit_units}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 text-right font-serif text-sm font-bold">
                    Total Units: {totalUnits}
                  </div>

                  <div className="mt-16 grid gap-12 font-serif text-sm font-bold md:grid-cols-2">
                    <div className="border-t border-black pt-2 text-center">
                      Course Adviser Signature
                    </div>
                    <div className="border-t border-black pt-2 text-center">
                      Student Signature &amp; Date
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
