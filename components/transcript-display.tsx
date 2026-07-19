"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Pencil, Check, X } from "lucide-react";
import { generateTranscriptPDF } from "@/lib/transcript-pdf-generator";
import { StudentSessionTranscript } from "@/lib/storage";
import { useState, useRef, useCallback } from "react";


interface TranscriptDisplayProps {
  transcript: StudentSessionTranscript;
  onReset: () => void;
  hideActions?: boolean;
}

export function TranscriptDisplay({
  transcript,
  onReset,
  hideActions = false,
}: TranscriptDisplayProps) {
  // Map of courseId → custom title (overrides DB title)
  const [titleOverrides, setTitleOverrides] = useState<Record<string, string>>({});
  // Which course is currently being edited
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  // Scratch value while editing
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback((courseId: string, currentTitle: string) => {
    setEditingCourseId(courseId);
    setEditValue(currentTitle);
    // Focus is handled by autoFocus on the input
  }, []);

  const commitEdit = useCallback((courseId: string) => {
    const trimmed = editValue.trim();
    if (trimmed) {
      setTitleOverrides((prev) => ({ ...prev, [courseId]: trimmed }));
    }
    setEditingCourseId(null);
  }, [editValue]);

  const cancelEdit = useCallback(() => {
    setEditingCourseId(null);
  }, []);

  const handleDownloadPDF = async () => {
    await generateTranscriptPDF(transcript, { titleOverrides });
  };

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      {!hideActions && (
        <div className="flex justify-end gap-4">
          <Button
            onClick={handleDownloadPDF}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Download className="h-4 w-4 mr-2" />
            Download Transcript PDF
          </Button>
        </div>
      )}

      {/* Transcript Card */}
      <Card className="border-indigo-200 shadow-xl overflow-hidden bg-white">
        <CardHeader className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white text-center py-10 relative">
          <div className="absolute inset-0 bg-white/5 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px] opacity-20"></div>
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

            <p className="text-blue-100 text-lg lg:text-xl font-medium tracking-wide opacity-90 uppercase tracking-widest">
              Student's Official Academic Transcript
            </p>
          </div>
        </CardHeader>

        <CardContent className="p-8 lg:p-10 space-y-10">
          <div className="bg-slate-50/80 p-6 rounded-xl border border-slate-200 shadow-sm backdrop-blur-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none">
              <svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4 relative z-10">
              <div className="col-span-2 md:col-span-1">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Candidate Name</h2>
                <p className="text-xl font-bold text-slate-900 truncate">
                  {transcript.studentInfo.name}
                </p>
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Matric Number</h2>
                <p className="text-lg font-semibold text-blue-700">
                  {transcript.studentInfo.matricNumber}
                </p>
              </div>
              <div className="col-span-2 md:col-span-1">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Faculty</h2>
                <p className="text-lg font-medium text-slate-800">
                  {transcript.studentInfo.faculty}
                </p>
              </div>
              <div className="col-span-2 md:col-span-1">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Department</h2>
                <p className="text-lg font-medium text-slate-800">
                  {transcript.studentInfo.department}
                </p>
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Level</h2>
                <p className="text-lg font-medium text-slate-800">
                  {transcript.studentInfo.level}
                </p>
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Academic Session
                </h2>
                <p className="text-lg font-medium text-slate-800">
                  {transcript.studentInfo.academicSession}
                </p>
              </div>
              <div className="col-span-2 md:col-span-1">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Degree Programme</h2>
                <p className="text-lg font-medium text-slate-800">
                  B.Sc (Honours)
                </p>
              </div>
            </div>
          </div>

          {/* Semesters Data */}
          <div className="space-y-8">
            {transcript.semesters.map((semester) => (
              <div key={semester.name} className="space-y-3">
                <div className="bg-slate-800 text-white px-5 py-3 rounded-t-lg font-semibold uppercase tracking-wider text-sm flex justify-between items-center shadow-sm">
                  <span>{semester.name}</span>
                </div>
                
                <div className="border-x border-b border-slate-200 rounded-b-lg shadow-sm overflow-hidden bg-white">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-5 py-3 text-xs font-bold text-slate-700 uppercase tracking-wider">Code</th>
                        <th className="px-5 py-3 text-xs font-bold text-slate-700 uppercase tracking-wider w-1/3">
                          Course Title
                          <span className="ml-2 text-indigo-400 font-normal normal-case tracking-normal text-[10px]">
                            (click to edit)
                          </span>
                        </th>
                        <th className="px-5 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">Units</th>
                        <th className="px-5 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">Score</th>
                        <th className="px-5 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">Grade</th>
                        <th className="px-5 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">GP</th>
                        <th className="px-5 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">WGP</th>
                        <th className="px-5 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">Remark</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {semester.courses.map((course) => {
                        const grade = course.score >= 70 ? 'A' : course.score >= 60 ? 'B' : course.score >= 50 ? 'C' : course.score >= 45 ? 'D' : course.score >= 40 ? 'E' : 'F';
                        const displayTitle = titleOverrides[course.id] ?? course.title ?? course.code;
                        const isEditing = editingCourseId === course.id;

                        return (
                          <tr key={course.id} className="group hover:bg-slate-50/80 transition-colors">
                            <td className="px-5 py-2.5 text-sm font-bold text-indigo-900">{course.code}</td>
                            <td className="px-5 py-2.5 text-sm font-medium text-slate-800">
                              {isEditing ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    ref={inputRef}
                                    autoFocus
                                    type="text"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") commitEdit(course.id);
                                      if (e.key === "Escape") cancelEdit();
                                    }}
                                    onBlur={() => commitEdit(course.id)}
                                    className="flex-1 min-w-0 border border-indigo-400 rounded px-2 py-0.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent shadow-sm"
                                  />
                                  <button
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); commitEdit(course.id); }}
                                    className="p-1 rounded text-emerald-600 hover:bg-emerald-50 transition-colors flex-shrink-0"
                                    title="Confirm"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); cancelEdit(); }}
                                    className="p-1 rounded text-rose-500 hover:bg-rose-50 transition-colors flex-shrink-0"
                                    title="Cancel"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startEdit(course.id, displayTitle)}
                                  className="flex items-center gap-1.5 w-full text-left group/title rounded px-1 -mx-1 hover:bg-indigo-50 transition-colors"
                                  title="Click to edit course title"
                                >
                                  <span className={titleOverrides[course.id] ? "text-indigo-700 font-semibold" : ""}>
                                    {displayTitle}
                                  </span>
                                  <Pencil className="h-3 w-3 text-slate-300 group-hover/title:text-indigo-400 transition-colors flex-shrink-0 opacity-0 group-hover/title:opacity-100" />
                                </button>
                              )}
                            </td>
                            <td className="px-5 py-2.5 text-sm font-medium text-center text-slate-700">{course.unit}</td>
                            <td className="px-5 py-2.5 text-sm font-medium text-center text-slate-700">{course.score}</td>
                            <td className="px-5 py-2.5 text-sm text-center font-bold text-indigo-600">{grade}</td>
                            <td className="px-5 py-2.5 text-sm text-center font-semibold text-slate-700">{course.gradePoint.toFixed(1)}</td>
                            <td className="px-5 py-2.5 text-sm text-center font-bold text-emerald-700">{(course.unit * course.gradePoint).toFixed(1)}</td>
                            <td className="px-5 py-2.5 text-xs text-center font-bold tracking-wide">
                              {course.remark ? (
                                <span className={`px-2 py-0.5 rounded-full ${
                                  course.remark.toUpperCase().includes('FAIL')
                                    ? 'text-rose-700 bg-rose-50'
                                    : 'text-emerald-700 bg-emerald-50'
                                }`}>
                                  {course.remark.toUpperCase()}
                                </span>
                              ) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  
                  {/* Semester Summary */}
                  <div className="bg-slate-50 border-t border-slate-200 p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div><span className="text-slate-500 font-medium">Units Offered:</span> <span className="font-semibold text-slate-900">{semester.totalUnits}</span></div>
                    <div><span className="text-slate-500 font-medium">Units Passed:</span> <span className="font-semibold text-slate-900">{semester.totalUnitsPassed}</span></div>
                    <div><span className="text-slate-500 font-medium">Total WGP:</span> <span className="font-semibold text-slate-900">{semester.totalWGP.toFixed(1)}</span></div>
                    <div><span className="text-slate-500 font-medium">Semester GPA:</span> <span className="font-bold text-indigo-700">{semester.semesterGPA}</span></div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Session Overview */}
          <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 shadow-md relative overflow-hidden group mt-10">
            <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform">
              <svg width="150" height="150" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </div>
            <CardHeader className="pb-4 border-b border-indigo-100/50 bg-white/40 backdrop-blur-sm">
              <CardTitle className="text-lg font-bold uppercase tracking-wider text-indigo-900">
                Session Summary &bull; {transcript.studentInfo.academicSession}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
               <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-indigo-600/70 mb-1">Total Units Offered</p>
                  <p className="text-2xl font-bold text-slate-800">{transcript.sessionTotalUnits}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-indigo-600/70 mb-1">Total Units Passed</p>
                  <p className="text-2xl font-bold text-slate-800">{transcript.sessionTotalUnitsPassed}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-indigo-600/70 mb-1">Total WGP</p>
                  <p className="text-2xl font-bold text-slate-800">{transcript.sessionTotalWGP.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-indigo-600/70 mb-1">Session GPA</p>
                  <p className="text-2xl font-bold text-indigo-900">{transcript.sessionGPA}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-emerald-600/70 mb-1">Overall CGPA</p>
                  <p className="text-3xl font-extrabold text-emerald-700">{transcript.overallCGPA}</p>
                </div>

               </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}
