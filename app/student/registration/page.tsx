"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient, CourseData } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  ArrowLeft, 
  CheckCircle2, 
  BookOpen, 
  Search, 
  AlertCircle,
  Plus,
  ShieldCheck,
  Save
} from "lucide-react";


export default function CourseRegistration() {
  const router = useRouter();
  const { user, student, isAuthenticated, logout, isLoading: authLoading } = useAuth();
  
  const [firstCourses, setFirstCourses] = useState<CourseData[]>([]);
  const [secondCourses, setSecondCourses] = useState<CourseData[]>([]);
  
  const [firstSelectedIds, setFirstSelectedIds] = useState<number[]>([]);
  const [secondSelectedIds, setSecondSelectedIds] = useState<number[]>([]);
  
  const [firstStatus, setFirstStatus] = useState<string | null>(null);
  const [secondStatus, setSecondStatus] = useState<string | null>(null);
  
  const [deadline, setDeadline] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [globalSearchRes, setGlobalSearchRes] = useState<CourseData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isGlobalLocked, setIsGlobalLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);



  const loadCourses = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [firstData, secondData] = await Promise.all([
        ApiClient.getStudentCourses("First"),
        ApiClient.getStudentCourses("Second")
      ]);
      
      setIsGlobalLocked(!!firstData.is_global_locked);
      
      setFirstCourses(firstData.courses);
      setFirstStatus(firstData.registration_status);
      setDeadline(firstData.registration_deadline || secondData.registration_deadline);
      
      const firstInitialSelected = firstData.registration_status === 'submitted'
        ? firstData.registered_course_ids
        : Array.from(new Set([
            ...firstData.registered_course_ids,
            ...firstData.courses
              .filter(c => (c.category || "").toLowerCase() === 'compulsory' || (c.category || "").toLowerCase() === 'core')
              .map(c => c.id)
          ]));
      setFirstSelectedIds(firstInitialSelected);

      setSecondCourses(secondData.courses);
      setSecondStatus(secondData.registration_status);
      
      const secondInitialSelected = secondData.registration_status === 'submitted'
        ? secondData.registered_course_ids
        : Array.from(new Set([
            ...secondData.registered_course_ids,
            ...secondData.courses
              .filter(c => (c.category || "").toLowerCase() === 'compulsory' || (c.category || "").toLowerCase() === 'core')
              .map(c => c.id)
          ]));
      setSecondSelectedIds(secondInitialSelected);
      
    } catch (err) {
      console.error("Error loading courses:", err);
      setError(err instanceof Error ? err.message : "Failed to load courses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadCourses();
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        setIsSearching(true);
        try {
          const res = await ApiClient.searchCourses(searchQuery);
          // filter out courses currently already active in the user's first/second SELECTED boards
          const existingIds = new Set([
            ...firstSelectedIds, 
            ...secondSelectedIds
          ]);
          setGlobalSearchRes(res.courses.filter(c => !existingIds.has(c.id)));
        } catch (err) {
          console.error("Search error", err);
        } finally {
          setIsSearching(false);
        }
      } else {
        setGlobalSearchRes([]);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery, firstSelectedIds, secondSelectedIds]);

  const isDeadlinePassed = deadline ? new Date(deadline) < new Date() : false;
  const isFirstLocked = isGlobalLocked || isDeadlinePassed;
  const isSecondLocked = isGlobalLocked || isDeadlinePassed;

  const toggleFirstCourse = (courseId: number, isCompulsory: boolean) => {
    if (isFirstLocked) return;
    setFirstSelectedIds(prev => 
      prev.includes(courseId) 
        ? prev.filter(id => id !== courseId) 
        : [...prev, courseId]
    );
  };

  const toggleSecondCourse = (courseId: number, isCompulsory: boolean) => {
    if (isSecondLocked) return;
    setSecondSelectedIds(prev => 
      prev.includes(courseId) 
        ? prev.filter(id => id !== courseId) 
        : [...prev, courseId]
    );
  };

  const addFromSearch = (course: CourseData, targetSemester: "First" | "Second") => {
    if (targetSemester === "First") {
       setFirstCourses(prev => [...prev.filter(c => c.id !== course.id), course]); // prevent duplicate array objects
       if (!firstSelectedIds.includes(course.id)) {
           setFirstSelectedIds(prev => [...prev, course.id]); // auto select
       }
    } else {
       setSecondCourses(prev => [...prev.filter(c => c.id !== course.id), course]); // prevent duplicate array objects
       if (!secondSelectedIds.includes(course.id)) {
           setSecondSelectedIds(prev => [...prev, course.id]); // auto select
       }
    }
    setSearchQuery(""); // clear search to close the box
  };

  const calculateFirstCredits = () => {
    return firstCourses.filter(c => firstSelectedIds.includes(c.id)).reduce((sum, c) => sum + (c.credit_units || 0), 0);
  };

  const calculateSecondCredits = () => {
    return secondCourses.filter(c => secondSelectedIds.includes(c.id)).reduce((sum, c) => sum + (c.credit_units || 0), 0);
  };

  const calculateTotalCredits = () => calculateFirstCredits() + calculateSecondCredits();

  const handleRegister = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (!isFirstLocked && firstSelectedIds.length > 0) {
         await ApiClient.registerCourses(firstSelectedIds, "First");
      }
      if (!isSecondLocked && secondSelectedIds.length > 0) {
         await ApiClient.registerCourses(secondSelectedIds, "Second");
      }
      await loadCourses();
      alert("Course registration submitted successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit registration");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || (loading && !firstCourses.length && !secondCourses.length)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
      </div>
    );
  }

  const CourseCard = ({ course, isSelected, toggleCourse, isLocked }: { course: CourseData, isSelected: boolean, toggleCourse: any, isLocked: boolean }) => {
    const isCompulsory = course.category.toLowerCase() === 'compulsory' || course.category.toLowerCase() === 'core';
    return (
      <div 
        onClick={() => toggleCourse(course.id, isCompulsory)}
        className={`group relative overflow-hidden transition-all duration-300 p-4 rounded-xl border-2 cursor-pointer flex items-center justify-between
          ${isSelected ? 'bg-primary/5 border-primary/40' : 'bg-white border-slate-100 hover:border-primary/20'}
          ${isLocked ? 'opacity-90 cursor-not-allowed' : ''}
        `}
      >
        <div className="flex items-center gap-4">
          <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors shrink-0
             ${isSelected ? 'bg-primary border-primary' : 'bg-white border-slate-300'}
             ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}
          `}>
            {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
          </div>

          <div>
             <div className="flex items-center gap-2">
                <span className="text-xs font-black text-primary bg-primary/10 px-2 py-0.5 rounded-full">{course.course_code}</span>
                <h4 className="font-semibold text-slate-800 text-sm">{course.course_title}</h4>
             </div>
             <div className="flex items-center gap-2 pt-1">
                <span className="text-xs font-bold text-slate-500">{course.credit_units} UNITS</span>
                <span className="w-1 h-1 rounded-full bg-slate-200" />
                <Badge variant="secondary" className={`text-[9px] font-black uppercase ${isCompulsory ? 'bg-primary/10 text-primary border-transparent' : 'bg-slate-100 text-slate-600'}`}>
                  {course.category}
                </Badge>
             </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Top Info Bar */}
          <div className="flex flex-col gap-6">
            <Card className="shadow-md bg-white border-none flex items-center p-6 gap-4">
                <div className="bg-primary/10 p-3 rounded-xl h-fit">
                  <BookOpen className="text-primary h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Total Credit Load</p>
                  <div className="flex items-end gap-2">
                    <p className="text-3xl font-black text-primary">{calculateTotalCredits()}</p>
                    <p className="text-sm text-muted-foreground mb-1">Units Selected</p>
                  </div>
                </div>
            </Card>

            {/* Notification Banner */}
            {isGlobalLocked && (
              <div className="bg-red-50 text-red-800 p-4 rounded-xl border border-red-200 flex items-center gap-3">
                <AlertCircle className="w-6 h-6 shrink-0" />
                <div>
                  <h4 className="font-bold">Course Registration is Closed</h4>
                  <p className="text-sm opacity-90">The institutional registration window is currently locked. You may view and print your active courses, but modifications are not allowed.</p>
                </div>
              </div>
            )}
          </div>

        {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-4 rounded-xl border border-destructive/20 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 fill-destructive/10 shrink-0" />
              <div className="flex-1 font-medium">{error}</div>
              <Button size="sm" variant="ghost" onClick={() => setError(null)}>Dismiss</Button>
            </div>
        )}

        {isDeadlinePassed && (!isFirstLocked || !isSecondLocked) && (
          <div className="bg-destructive/10 text-destructive p-4 rounded-xl border border-destructive/20 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 fill-destructive/10 shrink-0" />
            <p className="font-medium uppercase tracking-tight text-xs">The registration deadline ({deadline ? new Date(deadline).toLocaleDateString() : 'passed'}) has expired. You can no longer modify your courses.</p>
          </div>
        )}

        {/* Search Bar */}
        <div className="relative z-20">
          <div className="relative border border-slate-200 rounded-2xl shadow-sm bg-white hover:border-primary/50 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input 
              type="text"
              placeholder="Search database for additional courses... (e.g. GST111)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-14 bg-transparent border-none text-base w-full focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none rounded-2xl"
              disabled={isGlobalLocked}
            />
            {isSearching && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
              </div>
            )}
          </div>
          
          {/* Search Dropdown Popover */}
          {!isGlobalLocked && searchQuery.length >= 2 && !isSearching && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border p-4 max-h-[400px] overflow-y-auto">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4 border-b pb-2">Database Search Results</h3>
              {globalSearchRes.length === 0 ? (
                 <p className="text-center text-sm text-slate-500 py-4">No new courses found matching "{searchQuery}"</p>
              ) : (
                <div className="grid gap-3">
                  {globalSearchRes.map(course => (
                     <div key={course.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border-2 border-slate-100 hover:border-primary/20 transition-colors gap-4">
                        <div>
                           <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-primary bg-primary/10 px-2 py-0.5 rounded-full">{course.course_code}</span>
                              <h4 className="font-semibold text-slate-800 text-sm">{course.course_title}</h4>
                           </div>
                           <div className="flex items-center gap-2 pt-1">
                              <span className="text-xs font-bold text-slate-500">{course.credit_units} UNITS</span>
                              <span className="w-1 h-1 rounded-full bg-slate-200" />
                              <Badge variant="secondary" className="text-[9px] font-black uppercase bg-slate-100 text-slate-600">
                                {course.category || "Elective"}
                              </Badge>
                           </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                           <Button size="sm" variant="outline" className="text-xs h-8 gap-1 border-primary/20 hover:bg-primary/5 hover:text-primary" onClick={() => addFromSearch(course, "First")} disabled={isFirstLocked}>
                             <Plus className="h-3 w-3" /> 1st Sem
                           </Button>
                           <Button size="sm" variant="outline" className="text-xs h-8 gap-1 border-primary/20 hover:bg-primary/5 hover:text-primary" onClick={() => addFromSearch(course, "Second")} disabled={isSecondLocked}>
                             <Plus className="h-3 w-3" /> 2nd Sem
                           </Button>
                        </div>
                     </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-8 items-start relative z-10">
           
            {/* Left Column: First Semester Selected */}
           <div className="md:col-span-1 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b">
                 <h2 className="text-lg font-black text-slate-800 tracking-tight">1st Sem (Selected)</h2>
                 <Badge variant="outline" className="font-bold">{calculateFirstCredits()} Units</Badge>
              </div>

              {firstStatus === 'submitted' && (
                <div className="bg-green-100 text-green-800 p-3 rounded text-xs flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-green-600" /> Submitted
                </div>
              )}

              {firstCourses.filter(c => firstSelectedIds.includes(c.id)).length === 0 ? (
                 <p className="text-sm text-muted-foreground italic p-4 bg-white rounded-xl text-center border">No courses selected.</p>
              ) : (
                <div className="grid gap-2">
                  {firstCourses
                    .filter(c => firstSelectedIds.includes(c.id))
                    .map(course => (
                    <CourseCard 
                      key={course.id} 
                      course={course} 
                      isSelected={true} 
                      toggleCourse={toggleFirstCourse} 
                      isLocked={isFirstLocked} 
                    />
                  ))}
                </div>
              )}
           </div>

           {/* Middle Column: Second Semester Selected */}
           <div className="md:col-span-1 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b">
                 <h2 className="text-lg font-black text-slate-800 tracking-tight">2nd Sem (Selected)</h2>
                 <Badge variant="outline" className="font-bold">{calculateSecondCredits()} Units</Badge>
              </div>

              {secondStatus === 'submitted' && (
                <div className="bg-green-100 text-green-800 p-3 rounded text-xs flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-green-600" /> Submitted
                </div>
              )}

              {secondCourses.filter(c => secondSelectedIds.includes(c.id)).length === 0 ? (
                 <p className="text-sm text-muted-foreground italic p-4 bg-white rounded-xl text-center border">No courses selected.</p>
              ) : (
                <div className="grid gap-2">
                  {secondCourses
                    .filter(c => secondSelectedIds.includes(c.id))
                    .map(course => (
                    <CourseCard 
                      key={course.id} 
                      course={course} 
                      isSelected={true} 
                      toggleCourse={toggleSecondCourse} 
                      isLocked={isSecondLocked} 
                    />
                  ))}
                </div>
              )}
           </div>

           {/* Right Column: Summary & Submit */}
           <div className="md:col-span-1 space-y-6">
              <Card className="shadow-2xl border-none overflow-hidden sticky top-24">
                 <div className="h-2 bg-primary" />
                 <CardHeader className="bg-slate-50 px-6 py-4">
                    <CardTitle className="text-base font-black uppercase text-slate-800 tracking-wider">Registration Summary</CardTitle>
                 </CardHeader>
                 <CardContent className="p-6 space-y-4">
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm items-center pb-2 border-b">
                        <span className="font-medium text-slate-500">First Semester Units</span>
                        <span className="font-black text-slate-800">{calculateFirstCredits()}</span>
                      </div>
                      <div className="flex justify-between text-sm items-center pb-2 border-b">
                        <span className="font-medium text-slate-500">Second Semester Units</span>
                        <span className="font-black text-slate-800">{calculateSecondCredits()}</span>
                      </div>
                      <div className="flex justify-between text-base items-center pt-2">
                        <span className="font-bold text-slate-800">Total Valid Credits</span>
                        <span className="font-black text-primary text-xl">
                          {calculateTotalCredits()} <span className="text-xs text-slate-400 font-bold">UNITS</span>
                        </span>
                      </div>
                    </div>

                    <div className="pt-6">
                       <Button 
                         onClick={handleRegister} 
                         disabled={submitting || isGlobalLocked || (firstSelectedIds.length === 0 && secondSelectedIds.length === 0)}
                         className="w-full font-black py-6 text-base rounded-xl shadow-xl shadow-primary/20 hover:scale-[1.02] transition-transform"
                       >
                         {submitting ? (
                            <span className="animate-spin relative flex h-4 w-4">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-4 w-4 bg-white"></span>
                            </span>
                          ) : (
                            <>
                              <Save className="h-4 w-4" /> Save Selection
                            </>
                          )}
                       </Button>
                       <p className="text-[10px] text-center text-muted-foreground font-bold mt-4 px-2 uppercase tracking-tight leading-tight">
                         You can freely edit and resubmit your choices until the registration deadline passes.
                       </p>
                    </div>
                 </CardContent>
              </Card>
           </div>
        </div>

        {!isGlobalLocked && (
          <div className="mt-8">
            <Card className="shadow-lg border-none overflow-hidden bg-white pt-2">
              <CardHeader className="pb-4">
                  <CardTitle className="text-xl font-black text-slate-800 flex items-center gap-2">
                    <BookOpen className="text-primary w-5 h-5" /> Available Unselected Courses
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Select courses below to add them to your registration board.</p>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-8 border-t pt-6">
                   {/* 1st Sem Available */}
                   <div className="space-y-4">
                     <h3 className="font-bold text-slate-600 border-b pb-2">First Semester</h3>
                     {firstCourses.filter(c => !firstSelectedIds.includes(c.id)).length === 0 ? (
                        <p className="text-sm text-muted-foreground italic px-2">No remaining available courses.</p>
                     ) : (
                        <div className="grid gap-2">
                          {firstCourses.filter(c => !firstSelectedIds.includes(c.id)).map(course => (
                            <CourseCard 
                              key={course.id} 
                              course={course} 
                              isSelected={false} 
                              toggleCourse={toggleFirstCourse} 
                              isLocked={isFirstLocked} 
                            />
                          ))}
                        </div>
                     )}
                   </div>

                   {/* 2nd Sem Available */}
                   <div className="space-y-4">
                     <h3 className="font-bold text-slate-600 border-b pb-2">Second Semester</h3>
                     {secondCourses.filter(c => !secondSelectedIds.includes(c.id)).length === 0 ? (
                        <p className="text-sm text-muted-foreground italic px-2">No remaining available courses.</p>
                     ) : (
                        <div className="grid gap-2">
                          {secondCourses.filter(c => !secondSelectedIds.includes(c.id)).map(course => (
                            <CourseCard 
                              key={course.id} 
                              course={course} 
                              isSelected={false} 
                              toggleCourse={toggleSecondCourse} 
                              isLocked={isSecondLocked} 
                            />
                          ))}
                        </div>
                     )}
                   </div>
                </div>
             </CardContent>
           </Card>
          </div>
        )}
      </div>
    </div>
  );
}
