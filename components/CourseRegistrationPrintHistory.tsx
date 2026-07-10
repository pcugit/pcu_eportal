"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { ApiClient } from "@/lib/api";
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
  const { user, student } = useAuth();
  const [registrationHistory, setRegistrationHistory] = useState<
    RegistrationHistoryItem[]
  >([]);
  const [loading, setLoading] = useState(true);

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

  const printRegistrationSlip = (item: RegistrationHistoryItem) => {
    const studentName = user?.name || "N/A";
    const matricNumber = student?.matric_number || "N/A";
    const schoolName = student?.is_pg_student
      ? "The Postgraduate School"
      : "Part-Time Studies";
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

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Course Registration Slip</title>
          <style>
            @page { size: A4; margin: 18mm; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              color: #000;
              font-family: "Times New Roman", Times, serif;
              background: #fff;
            }
            .sheet { width: 100%; }
            .header {
              display: grid;
              grid-template-columns: 130px 1fr 130px;
              align-items: center;
              gap: 18px;
              padding-top: 18px;
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
              margin-top: 48px;
              width: 260px;
            }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
              <div></div>
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
              <div class="line">Student Signature</div>
            </section>
            <div class="line date-line">Date</div>
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
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-sm font-black uppercase tracking-tight text-foreground">
          Print Course Form
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 pt-0">
        {loading ? (
          <p className="text-xs font-medium text-muted-foreground">
            Loading registered course forms...
          </p>
        ) : registrationHistory.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">
            No submitted course registration found.
          </p>
        ) : (
          registrationHistory.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-border/70 bg-background p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-tight text-foreground">
                    {item.session} / {item.semester}
                  </p>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">
                    {item.status}
                    {item.submitted_at
                      ? ` - ${new Date(item.submitted_at).toLocaleDateString()}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] font-bold">
                    {item.total_credits} Units
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 px-2 text-[10px] font-bold"
                    onClick={() => printRegistrationSlip(item)}
                  >
                    <Printer className="h-3 w-3" />
                    Print
                  </Button>
                </div>
              </div>

              {item.courses.length === 0 ? (
                <p className="pt-2 text-xs italic text-muted-foreground">
                  No courses recorded.
                </p>
              ) : (
                <div className="grid gap-x-6 pt-2 md:grid-cols-2">
                  {item.courses.map((course) => (
                    <div
                      key={`${item.id}-${course.id}`}
                      className="flex items-center gap-2 py-1 text-xs"
                    >
                      <span className="w-16 shrink-0 truncate font-black text-primary">
                        {course.course_code}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {course.course_title}
                      </span>
                      <span className="shrink-0 font-bold text-muted-foreground">
                        {course.credit_units}u
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
