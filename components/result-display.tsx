"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, RotateCcw, Save } from "lucide-react";
import { generatePDF } from "@/lib/pdf-generator";
import { saveResult } from "@/lib/storage";
import { useState } from "react";

interface Course {
  id: string;
  code: string;
  unit: number;
  score: number;
  gradePoint: number;
}

interface StudentInfo {
  name: string;
  matricNumber: string;
  level: string;
  faculty: string;
  department: string;
  academicSession: string;
  semester: string;
}

interface ResultDisplayProps {
  studentInfo: StudentInfo;
  courses: Course[];
  totalUnits: number;
  totalUnitsPassed: number;
  totalWGP: number;
  cgpa: string;
  onReset: () => void;
  hideActions?: boolean;
}

export function ResultDisplay({
  studentInfo,
  courses,
  totalUnits,
  totalUnitsPassed,
  totalWGP,
  cgpa,
  onReset,
  hideActions = false,
}: ResultDisplayProps) {
  const [isSaved, setIsSaved] = useState(false);

  const handleDownloadPDF = async () => {
    await generatePDF({
      studentInfo,
      courses,
      totalUnits,
      totalUnitsPassed,
      totalWGP,
      cgpa,
    });
  };

  const handleSaveResult = () => {
    saveResult({
      studentInfo,
      courses,
      calculations: {
        totalUnits,
        totalUnitsPassed,
        totalWGP,
        cgpa,
      },
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      {!hideActions && (
        <div className="flex justify-end gap-4">
          <Button
            variant="outline"
            onClick={onReset}
            className="border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 bg-transparent"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            New Calculation
          </Button>
          <Button
            onClick={handleSaveResult}
            className={
              isSaved
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-blue-600 hover:bg-blue-700"
            }
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaved ? "Saved!" : "Save Result"}
          </Button>
          <Button
            onClick={handleDownloadPDF}
            className="bg-green-600 hover:bg-green-700"
          >
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>
      )}

      {/* Result Card */}
      <Card className="border-blue-200 dark:border-blue-800 shadow-xl overflow-hidden bg-white dark:bg-slate-950">
        <CardHeader className="bg-gradient-to-r from-blue-700 dark:from-blue-900 to-indigo-800 dark:to-indigo-950 text-white text-center py-10 relative">
          <div className="absolute inset-0 bg-white dark:bg-slate-950/5 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px] opacity-20"></div>
          <div className="flex flex-col items-center space-y-4 relative z-10">
            {/* LOGO */}
            <img
              src="/e-portal/images/logo new.png"
              alt="Precious Cornerstone University Logo"
              className="h-20 w-20 object-contain"
            />

            {/* SCHOOL NAME */}
            <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight">
              Precious Cornerstone University
            </h1>

            <p className="text-blue-100 text-lg lg:text-xl font-medium tracking-wide opacity-90">Student Result Sheet</p>
          </div>
        </CardHeader>

        <CardContent className="p-8 lg:p-10 space-y-10">
          <div className="bg-slate-50 dark:bg-slate-900/50/80 dark:bg-slate-900/80 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm backdrop-blur-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none">
              <svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4 relative z-10">
              <div className="col-span-2 md:col-span-1">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">Candidate Name</h2>
                <p className="text-xl font-bold text-slate-900 dark:text-slate-100 truncate">
                  {studentInfo.name}
                </p>
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">Matric Number</h2>
                <p className="text-lg font-semibold text-blue-700 dark:text-blue-300">
                  {studentInfo.matricNumber}
                </p>
              </div>
              <div className="col-span-2 md:col-span-1">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">Faculty</h2>
                <p className="text-lg font-medium text-slate-800 dark:text-slate-200">
                  {studentInfo.faculty}
                </p>
              </div>
              <div className="col-span-2 md:col-span-1">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">Department</h2>
                <p className="text-lg font-medium text-slate-800 dark:text-slate-200">
                  {studentInfo.department}
                </p>
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">Level</h2>
                <p className="text-lg font-medium text-slate-800 dark:text-slate-200">
                  {studentInfo.level}
                </p>
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">
                  Academic Session
                </h2>
                <p className="text-lg font-medium text-slate-800 dark:text-slate-200">
                  {studentInfo.academicSession}
                </p>
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">Semester</h2>
                <p className="text-lg font-medium text-slate-800 dark:text-slate-200">
                  {studentInfo.semester}
                </p>
              </div>
            </div>
          </div>

          {/* Courses Table */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 border-b pb-2">
              Course Details
            </h3>
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden bg-white dark:bg-slate-950">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-5 py-4 text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      Course Code
                    </th>
                    <th className="px-5 py-4 text-center text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      Unit
                    </th>
                    <th className="px-5 py-4 text-center text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      Score
                    </th>
                    <th className="px-5 py-4 text-center text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      Grade Point
                    </th>
                    <th className="px-5 py-4 text-center text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      WGP
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {courses.map((course, index) => (
                    <tr
                      key={course.id}
                      className="group hover:bg-slate-50 dark:bg-slate-900/50/80 dark:bg-slate-900/80 dark:hover:bg-slate-800/80 transition-colors"
                    >
                      <td className="px-5 py-3.5 text-sm font-bold text-indigo-900 dark:text-indigo-200">
                        {course.code}
                      </td>
                      <td className="px-5 py-3.5 text-sm font-medium text-center text-slate-700 dark:text-slate-300">
                        {course.unit}
                      </td>
                      <td className="px-5 py-3.5 text-sm font-medium text-center text-slate-700 dark:text-slate-300">
                        {course.score}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-center font-bold text-blue-600 dark:text-blue-400">
                        {course.gradePoint}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-center font-bold text-emerald-700 dark:text-emerald-300">
                        {course.unit * course.gradePoint}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-blue-700 dark:text-blue-300">
                    Total Units Registered
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-blue-900 dark:text-blue-200">
                    {totalUnits}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-purple-700 dark:text-purple-300">
                    Total Units Passed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-purple-900 dark:text-purple-200">
                    {totalUnitsPassed}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-green-200 dark:border-emerald-800 bg-green-50 dark:bg-emerald-900/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-green-700 dark:text-emerald-300">
                    Total Weighted Grade Points
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-green-900 dark:text-emerald-200">
                    {totalWGP}
                  </p>
                </CardContent>
              </Card>
            </div>

              <Card className="border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 dark:from-emerald-950/40 to-emerald-100 dark:to-emerald-900/40 shadow-md relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform">
                  <svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </div>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    Cumulative Grade Point Average (CGPA)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-5xl font-extrabold text-emerald-900 dark:text-emerald-100 drop-shadow-sm">{cgpa}</p>
                </CardContent>
              </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
