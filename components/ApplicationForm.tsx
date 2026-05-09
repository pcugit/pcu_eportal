'use client';

import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { ApiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, Save, Send, AlertCircle, CheckCircle2, Plus, X } from 'lucide-react';


// --- Memoized year options (static, never changes) ---
const YEAR_OPTIONS = Array.from({ length: 30 }, (_, i) => 2026 - i);
const yearItems = YEAR_OPTIONS.map(y => (
  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
));

// --- Memoized exam block: each sitting is isolated, only re-renders on its own data change ---
interface ExamBlockProps {
  exam: any;
  examIdx: number;
  subjectItems: React.ReactNode[];
  gradeItems: React.ReactNode[];
  setOlevelExams: React.Dispatch<React.SetStateAction<any[]>>;
  setIsDirty: (v: boolean) => void;
}

const OlevelExamBlock = memo(function OlevelExamBlock({
  exam, examIdx, subjectItems, gradeItems, setOlevelExams, setIsDirty
}: ExamBlockProps) {
  const sittingLabel = examIdx === 0 ? 'First Sitting' : examIdx === 1 ? 'Second Sitting' : 'Third Sitting';

  const handleFieldChange = useCallback((field: string, val: string) => {
    setOlevelExams(prev => {
      const next = [...prev];
      next[examIdx] = { ...next[examIdx], [field]: val };
      return next;
    });
    setIsDirty(true);
  }, [examIdx, setOlevelExams, setIsDirty]);

  const handleRemove = useCallback(() => {
    setOlevelExams(prev => prev.filter((_, i) => i !== examIdx));
    setIsDirty(true);
  }, [examIdx, setOlevelExams, setIsDirty]);

  const onSubjectChange = useCallback((idx: number, val: string) => {
    setOlevelExams(prev => {
      const next = [...prev];
      const subjects = [...next[examIdx].subjects];
      subjects[idx] = { ...subjects[idx], subject_id: val };
      next[examIdx] = { ...next[examIdx], subjects };
      return next;
    });
    setIsDirty(true);
  }, [examIdx, setOlevelExams, setIsDirty]);

  const onGradeChange = useCallback((idx: number, val: string) => {
    setOlevelExams(prev => {
      const next = [...prev];
      const subjects = [...next[examIdx].subjects];
      subjects[idx] = { ...subjects[idx], grade_id: val };
      next[examIdx] = { ...next[examIdx], subjects };
      return next;
    });
    setIsDirty(true);
  }, [examIdx, setOlevelExams, setIsDirty]);

  return (
    <div className="bg-slate-50/50 rounded-xl p-6 border border-slate-100 space-y-6 relative">
      {examIdx > 0 && (
        <button onClick={handleRemove} className="absolute top-4 right-4 p-1 text-slate-400 hover:text-red-500 transition-colors">
          <X className="w-5 h-5" />
        </button>
      )}
      <h3 className="font-medium text-slate-800 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-blue-500" />
        {sittingLabel}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="space-y-2">
          <Label>Name of Exam*</Label>
          <Select value={exam.name} onValueChange={(val) => handleFieldChange('name', val)}>
            <SelectTrigger><SelectValue placeholder="--select--" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="WAEC">WAEC</SelectItem>
              <SelectItem value="NECO">NECO</SelectItem>
              <SelectItem value="NABTEB">NABTEB</SelectItem>
              <SelectItem value="GCE">GCE</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Exam Number*</Label>
          <Input value={exam.number} onChange={(e) => handleFieldChange('number', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Exam Period (MAY/JUNE)*</Label>
          <Input value={exam.period} onChange={(e) => handleFieldChange('period', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Exam Year*</Label>
          <Select value={exam.year?.toString()} onValueChange={(val) => handleFieldChange('year', val)}>
            <SelectTrigger><SelectValue placeholder="--select--" /></SelectTrigger>
            <SelectContent>{yearItems}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <OlevelSubjectRow
            key={i}
            index={i}
            subject_id={exam.subjects[i]?.subject_id?.toString() || ''}
            grade_id={exam.subjects[i]?.grade_id?.toString() || ''}
            subjectItems={subjectItems}
            gradeItems={gradeItems}
            onSubjectChange={onSubjectChange}
            onGradeChange={onGradeChange}
          />
        ))}
      </div>
    </div>
  );
});

// --- Memoized subject row: only re-renders if its own values change ---
interface SubjectRowProps {
  index: number;
  subject_id: string;
  grade_id: string;
  subjectItems: React.ReactNode[];
  gradeItems: React.ReactNode[];
  onSubjectChange: (index: number, val: string) => void;
  onGradeChange: (index: number, val: string) => void;
}

const OlevelSubjectRow = memo(function OlevelSubjectRow({
  index, subject_id, grade_id, subjectItems, gradeItems, onSubjectChange, onGradeChange
}: SubjectRowProps) {
  return (
    <div className="flex gap-4">
      <div className="flex-1 space-y-2">
        <Label>Subject {index + 1}</Label>
        <Select
          value={subject_id}
          onValueChange={(val) => onSubjectChange(index, val)}
        >
          <SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger>
          <SelectContent>{subjectItems}</SelectContent>
        </Select>
      </div>
      <div className="w-32 space-y-2">
        <Label>Grade</Label>
        <Select
          value={grade_id}
          onValueChange={(val) => onGradeChange(index, val)}
        >
          <SelectTrigger><SelectValue placeholder="--" /></SelectTrigger>
          <SelectContent>{gradeItems}</SelectContent>
        </Select>
      </div>
    </div>
  );
});

// O'Level data will be fetched from API


interface FormField {
  name: string;
  type: string;
  label: string;
  required?: boolean;
  options?: string[];
  disabled?: boolean;
}

interface Document {
  type: string;
  label: string;
  required?: boolean;
}

interface FormStep {
  title: string;
  type?: 'fields' | 'olevel' | 'documents' | 'course';
  fields?: FormField[];
  documents?: Document[];
}

interface FormTemplate {
  program: string;
  fields?: FormField[];
  documents?: Document[];
  steps?: FormStep[];
}

// Helper: parse olevel_results into padded exam objects
function parseOlevelForState(raw: any) {
  const blank = [{ name: '', number: '', period: '', year: '', subjects: Array.from({ length: 10 }, () => ({ subject_id: '', grade_id: '' })) }];
  if (!raw) return blank;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((exam: any) => ({
        ...exam,
        subjects: [
          ...(exam.subjects || []),
          ...Array.from({ length: Math.max(0, 10 - (exam.subjects?.length || 0)) }, () => ({ subject_id: '', grade_id: '' }))
        ].slice(0, 10)
      }));
    }
  } catch {}
  return blank;
}

interface ApplicationFormProps {
  template: FormTemplate;
  applicantId?: number;
  programId: number;
  programTypeId?: number;
  user?: any;
  onSuccess?: () => void;
  initialFormData?: Record<string, any>;
  initialDocuments?: any[];
}

export default function ApplicationForm({
  template,
  applicantId,
  programId,
  programTypeId,
  user,
  onSuccess,
  initialFormData,
  initialDocuments,
}: ApplicationFormProps) {
  const [formData, setFormData] = useState<Record<string, any>>(initialFormData ?? {});
  const [documents, setDocuments] = useState<Record<string, File | null>>({});
  const [uploadedDocuments, setUploadedDocuments] = useState<Record<string, any>>(() => {
    if (!initialDocuments?.length) return {};
    const docs: Record<string, any> = {};
    initialDocuments.forEach((doc: any) => { docs[doc.document_type] = doc; });
    return docs;
  });
  const [formId, setFormId] = useState<number | null>(initialFormData?.id ?? null);
  const [availablePrograms, setAvailablePrograms] = useState<any[]>([]);
  const [availableCourses, setAvailableCourses] = useState<any[]>(initialFormData?.available_courses ?? []);
  const [olevelSubjects, setOlevelSubjects] = useState<any[]>([]);
  const [olevelGrades, setOlevelGrades] = useState<any[]>([]);

  // Memoize dropdown options — only re-created when source data changes
  const subjectItems = useMemo(() =>
    olevelSubjects.map(s => (
      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
    )), [olevelSubjects]);

  const gradeItems = useMemo(() =>
    olevelGrades.map(g => (
      <SelectItem key={g.id} value={g.grade}>{g.grade}</SelectItem>
    )), [olevelGrades]);

  
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [docType, setDocType] = useState("");
  const [docDisplayName, setDocDisplayName] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [maxStepReached, setMaxStepReached] = useState(0);
  
  const [currentStep, setCurrentStep] = useState(0);
  
  const [olevelExams, setOlevelExams] = useState<any[]>(
    () => parseOlevelForState(initialFormData?.olevel_results)
  );


  const hasSteps = !!template.steps && template.steps.length > 0;
  const steps: FormStep[] = [];
  
  if (hasSteps) {
    steps.push(...template.steps!);
  } else {
    steps.push({ title: 'Personal Information', type: 'fields', fields: template.fields });
    steps.push({ title: 'Documents', type: 'documents', documents: template.documents });
  }

  // Inject COURSE step after O'Level or Personal Info if not already present
  if (!steps.find(s => s.type === 'course')) {
      const olevelIdx = steps.findIndex(s => s.type === 'olevel');
      if (olevelIdx !== -1) {
          steps.splice(olevelIdx + 1, 0, { title: 'COURSE', type: 'course' });
      } else {
          const personalIdx = steps.findIndex(s => s.title === 'Personal Information');
          if (personalIdx !== -1) {
              steps.splice(personalIdx + 1, 0, { title: 'COURSE', type: 'course' });
          }
      }
  }
  
  const step = steps[currentStep];

  // Fetch programs for course selection + O'Level lookup data.
  // Results are cached in sessionStorage so re-opening the form is instant.
  useEffect(() => {
    const fetchData = async () => {
      try {
        const CACHE_KEY_PROGRAMS = 'cache_programs';
        const CACHE_KEY_OLEVEL   = 'cache_olevel';

        const readCache = (key: string) => {
          try {
            const raw = sessionStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
          } catch { return null; }
        };
        const writeCache = (key: string, data: any) => {
          try { sessionStorage.setItem(key, JSON.stringify(data)); } catch {}
        };

        let programs = readCache(CACHE_KEY_PROGRAMS);
        let olevel   = readCache(CACHE_KEY_OLEVEL);

        if (!programs || !olevel) {
          const fetches = await Promise.all([
            programs ? null : ApiClient.getPrograms(),
            olevel   ? null : ApiClient.getOlevelData(),
          ]);
          if (fetches[0]) { programs = fetches[0]; writeCache(CACHE_KEY_PROGRAMS, programs); }
          if (fetches[1]) { olevel   = fetches[1]; writeCache(CACHE_KEY_OLEVEL, olevel); }
        }

        setAvailablePrograms(programs?.programs || []);
        setOlevelSubjects(olevel?.subjects || []);
        setOlevelGrades(olevel?.grades || []);
      } catch (e) {
        console.error("Failed to fetch form lookup data", e);
      }
    };
    fetchData();
  }, []);

  // Load existing form data
  useEffect(() => {
    const loadExistingForm = async () => {
      // Always apply user-derived defaults (email, phone)
      const userDefaults: Record<string, string> = {};
      if (user) {
        userDefaults['email'] = user.email || '';
        userDefaults['phone_number'] = user.phone_number || '';
        if (user.name) {
          const parts = user.name.split(' ');
          userDefaults['first_name'] = parts[0] || '';
          userDefaults['last_name'] = parts.slice(1).join(' ') || '';
        }
      }
      // Merge user defaults without overwriting already-set form values
      setFormData(prev => ({ ...userDefaults, ...prev }));

      // If initialFormData was passed as a prop, state is already populated — skip fetch
      if (initialFormData) {
        setMaxStepReached(steps.length - 1);
        return;
      }

      if (!applicantId) return;
      if (!ApiClient.getToken()) return;

      try {
        const response: any = await ApiClient.getForm(applicantId);
        if (response.form) {
          setFormId(response.form.id);
          setFormData(prev => ({ ...prev, ...response.form }));
          if (response.form.available_courses) {
            setAvailableCourses(response.form.available_courses);
          }
          if (response.form.olevel_results) {
            const padded = parseOlevelForState(response.form.olevel_results);
            setOlevelExams(padded);
          }
        }
        if (response.documents && response.documents.length > 0) {
          const docs: Record<string, any> = {};
          response.documents.forEach((doc: any) => { docs[doc.document_type] = doc; });
          setUploadedDocuments(docs);
        }
        if (response.form) {
          setMaxStepReached(steps.length - 1);
        }
      } catch (err) {
        console.error('Error loading form:', err);
      }
    };
    loadExistingForm();
  }, [applicantId, user, steps.length]);

  // Auto-save on data change
  useEffect(() => {
    if (!formId && !formData.first_name) return; // Don't auto-save if empty
    
    const timer = setTimeout(() => {
      // Create a background save that doesn't show loading or block UI
      const autoSave = async () => {
        try {
          const payload = {
            applicant_id: applicantId,
            program_id: programId,
            ...formData,
            olevel_results: JSON.stringify(olevelExams)
          };
          const response = await ApiClient.submitForm(payload);
          if (!formId) setFormId(response.form_id);
        } catch (e) {
          console.error("Auto-save failed", e);
        }
      };
      autoSave();
    }, 5000); // 5 second debounce

    return () => clearTimeout(timer);
  }, [formData, olevelExams, applicantId, programId, formId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setIsDirty(true);
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setIsDirty(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, documentType: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      setError(`File size exceeds 15MB limit for ${documentType}`);
      return;
    }

    setDocuments((prev) => ({ ...prev, [documentType]: file }));
    setError(null);

    if (!formId) {
      setError("Please click 'Save Form' at the bottom to save your details before uploading documents.");
      return;
    }

    try {
      await uploadDocument(documentType, file, formId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const uploadDocument = async (documentType: string, file: File, currentFormId?: number) => {
    const effectiveFormId = currentFormId || formId;
    if (!effectiveFormId) {
      throw new Error('Form not saved. Please save form first.');
    }

    try {
      setUploadProgress((prev) => ({ ...prev, [documentType]: 0 }));
      const response = await ApiClient.uploadDocument(file, effectiveFormId, documentType);
      setUploadProgress((prev) => ({ ...prev, [documentType]: 100 }));
      setUploadedDocuments((prev) => ({
        ...prev,
        [documentType]: response,
      }));
      return response;
    } catch (err) {
      throw err;
    }
  };

  const saveForm = async () => {
    setSaving(true);
    setError(null);

    try {
      // Validate required fields for the current step
      if (step.type === 'fields' && step.fields) {
          const missingFields = step.fields
            .filter((field) => field.required && !formData[field.name])
            .map((field) => field.label);

          if (missingFields.length > 0) {
            setError(`Please fill in: ${missingFields.join(', ')}`);
            setSaving(false);
            return false;
          }
      }

      if (step.type === 'olevel') {
          for (let i = 0; i < olevelExams.length; i++) {
              const exam = olevelExams[i];
              const prefix = olevelExams.length > 1 ? `Sitting ${i+1}: ` : "";
              
              // Only validate if it's the first sitting OR if any field is filled in this sitting
              const isFirstSitting = i === 0;
              const hasAnyField = exam.name || exam.number || exam.period || exam.year || 
                                 exam.subjects.some((s: any) => s.subject_id || s.grade_id);

              if (isFirstSitting || hasAnyField) {
                  if (!exam.name || !exam.number || !exam.period || !exam.year) {
                      const missing = [];
                      if (!exam.name) missing.push("Name");
                      if (!exam.number) missing.push("Number");
                      if (!exam.period) missing.push("Period");
                      if (!exam.year) missing.push("Year");
                      
                      setError(`${prefix}Please fill in: ${missing.join(', ')}`);
                      setSaving(false);
                      return false;
                  }
              }


              
              const filledSubjects = exam.subjects.filter((s: any) => 
                  (s.subject_id || s.subject) && (s.grade_id || s.grade)
              );
              if (filledSubjects.length < 5) {
                  setError(`${prefix}Please provide at least 5 subjects and grades`);
                  setSaving(false);
                  return false;
              }

          }
      }
      
      const payload = {
        applicant_id: applicantId,
        program_id: programId,
        ...formData,
        olevel_results: JSON.stringify(olevelExams)
      };

      const response = await ApiClient.submitForm(payload);
      const actualFormId = response.form_id;
      setFormId(actualFormId);

      // Upload any new documents if we are on documents step
      if (step.type === 'documents') {
          const documentsToUpload = Object.entries(documents).filter(
            ([docType, file]) => file && !uploadedDocuments[docType]
          );

          for (const [docType, file] of documentsToUpload) {
            if (file) {
              await uploadDocument(docType, file, actualFormId);
            }
          }
          setDocuments({});
      }
      setIsDirty(false);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save form';
      setError(message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleNextStep = async () => {
      // Only save if there are changes
      if (isDirty) {
          const success = await saveForm();
          if (!success) return;
      }
      
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      if (nextStep > maxStepReached) setMaxStepReached(nextStep);
      window.scrollTo(0, 0);
  };
  
  const handlePrevStep = async () => {
      if (isDirty) {
          await saveForm();
      }
      setCurrentStep(c => Math.max(c - 1, 0));
      window.scrollTo(0, 0);
  };

  const submitApplication = async () => {
    setError(null);
    
    // Ensure everything is saved first
    const saved = await saveForm();
    if (!saved) return;

    if (!formId) {
      setError('Please save your form first');
      return;
    }
    
    /* 
    // Validate documents
    const docStep = steps.find(s => s.type === 'documents');
    if (docStep && docStep.documents) {
        const missingDocuments = docStep.documents
          .filter((doc) => doc.required && !uploadedDocuments[doc.type] && !uploadedDocuments[doc.label])
          .map((doc) => doc.label);

        if (missingDocuments.length > 0) {
          setError(`Please upload: ${missingDocuments.join(', ')}`);
          return;
        }
    }
    */


    setSubmitting(true);
    try {
      await ApiClient.submitApplication(applicantId || 0);
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit application';
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 flex gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Progress Indicator */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
         {steps.map((s, i) => {
             const isCompleted = i < currentStep || (formId && i <= maxStepReached);
             const isClickable = i <= maxStepReached || (formId && i < steps.length);
             
             return (
                 <div 
                    key={i} 
                    className={`px-4 py-2 text-sm font-bold whitespace-nowrap border-b-2 transition-all ${
                        i === currentStep 
                        ? 'border-primary text-primary' 
                        : isClickable 
                            ? 'border-primary/30 text-slate-500 cursor-pointer hover:border-primary/60' 
                            : 'border-transparent text-slate-300'
                    }`} 
                    onClick={async () => {
                        if (isClickable && i !== currentStep) {
                            if (isDirty) {
                                const success = await saveForm();
                                if (!success) return;
                            }
                            setCurrentStep(i);
                            window.scrollTo(0, 0);
                        }
                    }}
                 >
                     STEP {i + 1} - {s.title.toUpperCase()}
                 </div>
             );
         })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>STEP - {step.title}</CardTitle>
          <CardDescription>Fill out all required fields</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            {step.type === 'fields' && step.fields && (
              <div className="grid md:grid-cols-2 gap-4">
                {step.fields.map((field) => (
                  <div key={field.name} className="space-y-2">
                    <Label htmlFor={field.name}>
                      {field.label}
                      {field.required && <span className="text-destructive">*</span>}
                    </Label>
                    {field.type === 'text' || field.type === 'email' || field.type === 'number' ? (
                      <Input
                        id={field.name}
                        name={field.name}
                        type={field.type}
                        placeholder={field.label}
                        value={formData[field.name] || ''}
                        onChange={handleInputChange}
                        disabled={saving || submitting || field.disabled}
                      />
                    ) : field.type === 'date' ? (
                      <Input
                        id={field.name}
                        name={field.name}
                        type="date"
                        value={formData[field.name] || ''}
                        onChange={handleInputChange}
                        disabled={saving || submitting || field.disabled}
                      />
                    ) : field.type === 'select' ? (
                      <Select
                        value={formData[field.name] || ''}
                        onValueChange={(value) => handleSelectChange(field.name, value)}
                        disabled={saving || submitting || field.disabled}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={`--Select--`} />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options?.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : field.type === 'textarea' ? (
                      <textarea
                        id={field.name}
                        name={field.name}
                        placeholder={field.label}
                        value={formData[field.name] || ''}
                        onChange={handleInputChange}
                        disabled={saving || submitting || field.disabled}
                        rows={4}
                        className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            
            {step.type === 'olevel' && (

                <div className="space-y-8">
                    {olevelExams.map((exam, examIdx) => (
                        <OlevelExamBlock
                            key={examIdx}
                            exam={exam}
                            examIdx={examIdx}
                            subjectItems={subjectItems}
                            gradeItems={gradeItems}
                            setOlevelExams={setOlevelExams}
                            setIsDirty={setIsDirty}
                        />
                    ))}
                    <div className="flex justify-end">
                        <Button 
                            variant="secondary"
                            className="bg-[#4aa0f0] hover:bg-blue-500 text-white"
                            onClick={() => {
                                if (olevelExams.length >= 3) {
                                    alert("You can only add a maximum of 3 O'Level sittings.");
                                    return;
                                }
                                setOlevelExams([
                                    ...olevelExams, 
                                    { 
                                        name: '', 
                                        number: '', 
                                        period: '', 
                                        year: '', 
                                        subjects: Array.from({ length: 10 }, () => ({ subject_id: '', grade_id: '' }))
                                    }
                                ]);
                            }}
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Add Exams
                        </Button>
                    </div>
                </div>
            )}
            
{step.type === 'course' && (
    <div className="space-y-6">
        <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-2">
                <Label>First Choice Course*</Label>
                <Select
                    value={formData.first_choice_program_id?.toString() || ''}
                    onValueChange={(val) => {
                        setFormData(prev => ({ ...prev, first_choice_program_id: val }));
                        setIsDirty(true);
                    }}
                >
                    <SelectTrigger className="h-12 border-slate-200">
                        <SelectValue placeholder="--SELECT--" />
                    </SelectTrigger>
                    <SelectContent>
                        {availableCourses.map(p => (
                            <SelectItem key={p.id} value={p.id.toString()}>
                                {p.course} {p.department ? `(${p.department})` : ''}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label>Second Choice Course</Label>
                <Select
                    value={formData.second_choice_program_id?.toString() || ''}
                    onValueChange={(val) => {
                        setFormData(prev => ({ ...prev, second_choice_program_id: val }));
                        setIsDirty(true);
                    }}
                >
                    <SelectTrigger className="h-12 border-slate-200">
                        <SelectValue placeholder="--SELECT--" />
                    </SelectTrigger>
                    <SelectContent>
                        {availableCourses.map(p => (
                            <SelectItem key={p.id} value={p.id.toString()}>
                                {p.course} {p.department ? `(${p.department})` : ''}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    </div>
)}
            
            {step.type === 'documents' && (
              <div className="space-y-12">
                {/* 1. Header */}
                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-medium text-slate-700">Document Uploading</h3>
                </div>

                {/* 2. Uploaded Documents Table */}
                {Object.keys(uploadedDocuments).length > 0 && (
                  <div className="space-y-6">
                    <h4 className="text-xl font-medium text-slate-700 text-center">Uploaded Certificates</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="text-slate-500 text-sm font-semibold border-b">
                            <th className="p-4 w-12">#</th>
                            <th className="p-4">Name</th>
                            <th className="p-4">Document</th>
                            <th className="p-4">Level</th>
                            <th className="p-4 text-center">Delete</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.values(uploadedDocuments).map((doc: any, index) => (
                            <tr key={doc.document_id} className="border-b bg-slate-50/30 hover:bg-slate-50 transition-colors">
                              <td className="p-4 text-sm text-slate-600">{index + 1}</td>
                              <td className="p-4 text-sm text-slate-800 font-medium">{doc.display_name || doc.document_type}</td>
                              <td className="p-4 text-sm">
                                <a 
                                  href={`/api/applicant/download-document/${doc.document_id}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-[#6b357d] hover:underline font-medium"
                                >
                                  Download
                                </a>
                              </td>
                              <td className="p-4 text-sm text-slate-600">O'Level</td>
                              <td className="p-4 text-center">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="bg-[#6b357d] hover:bg-[#5a2d69] text-white font-medium h-9 px-6"
                                  onClick={async () => {
                                    if (confirm("Are you sure you want to delete this document?")) {
                                      try {
                                        await ApiClient.deleteDocument(doc.document_id);
                                        const newDocs = { ...uploadedDocuments };
                                        delete newDocs[doc.document_type];
                                        setUploadedDocuments(newDocs);
                                      } catch (e) {
                                        console.error("Delete failed", e);
                                      }
                                    }
                                  }}
                                >
                                  Delete
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 3. Upload Form */}
                <div className="space-y-6">
                  <h4 className="text-xl font-medium text-slate-700 text-center">Upload Certificates</h4>
                  <div className="flex flex-col md:flex-row gap-6 items-end">
                    <div className="flex-1 space-y-2 w-full">
                      <Label className="text-sm font-semibold text-slate-500 block text-center md:text-left">Document Type</Label>
                      {step.documents && step.documents.length > 0 ? (
                        <Select
                          value={docType}
                          onValueChange={(val) => {
                            setDocType(val);
                            if (val !== 'other') {
                               const docDef = step.documents?.find(d => d.type === val);
                               if (docDef) setDocDisplayName(docDef.label);
                            } else {
                               setDocDisplayName("");
                            }
                          }}
                        >
                          <SelectTrigger className="h-12 border-slate-200">
                            <SelectValue placeholder="--Select Document--" />
                          </SelectTrigger>
                          <SelectContent>
                            {step.documents.map((d) => (
                              <SelectItem key={d.type} value={d.type}>
                                {d.label} {d.required && '*'}
                              </SelectItem>
                            ))}
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input 
                          placeholder="e.g. WAEC" 
                          className="h-12 border-slate-200"
                          value={docDisplayName}
                          onChange={(e) => {
                              setDocDisplayName(e.target.value);
                              setDocType('other');
                          }}
                        />
                      )}
                      {docType === 'other' && (
                        <Input 
                          placeholder="Enter document name" 
                          className="h-12 border-slate-200 mt-2"
                          onChange={(e) => setDocDisplayName(e.target.value)}
                        />
                      )}
                    </div>
                    
                    <div className="flex-[2] space-y-2 w-full">
                      <Label className="text-sm font-semibold text-slate-500 block text-center md:text-left">
                        Upload a document (Allowed: gif, jpg, png, pdf, doc)
                      </Label>
                      <div className="relative">
                        <Input 
                          type="file" 
                          className="h-12 border-slate-200 pr-24 flex items-center pt-2.5"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setSelectedFiles(prev => ({ ...prev, 'general': file }));
                            }
                          }}
                        />
                      </div>
                    </div>

                    <Button
                      onClick={async () => {
                        const file = selectedFiles['general'];
                        if (!file) return alert("Please select a file");
                        if (!docType || (docType === 'other' && !docDisplayName)) return alert("Please enter or select a name for the document");
                        
                        const finalType = docType === 'other' ? docDisplayName : docType;
                        const finalName = docDisplayName || finalType;

                        try {
                          setSaving(true);
                          const resp = await ApiClient.uploadDocument(file, formId!, finalType, finalName);
                          setUploadedDocuments(prev => ({
                            ...prev,
                            [finalType]: {
                              document_id: resp.document_id,
                              document_type: finalType,
                              display_name: finalName,
                              original_filename: file.name,
                              original_size: resp.original_size,
                              compressed_size: resp.compressed_size,
                              is_compressed: resp.is_compressed
                            }
                          }));
                          setDocType("");
                          setDocDisplayName("");
                          setSelectedFiles(prev => ({ ...prev, 'general': null }));
                          // Reset file input
                          const fileInputs = document.querySelectorAll('input[type="file"]');
                          fileInputs.forEach((input: any) => input.value = "");
                        } catch (e) {
                          console.error("Upload failed", e);
                        } finally {
                          setSaving(false);
                        }
                      }}
                      disabled={saving || !selectedFiles['general'] || !docType}
                      className="bg-[#4aa0f0] hover:bg-blue-500 text-white font-bold h-12 px-10 shrink-0"
                    >
                      {saving ? 'Uploading...' : 'Upload'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
        </CardContent>
      </Card>

      {/* Submit Section */}
      <div className="flex gap-4 justify-end border-t pt-6 pb-12">
        {currentStep > 0 && (
            <Button
              variant="outline"
              disabled={saving || submitting}
              onClick={handlePrevStep}
            >
              Previous
            </Button>
        )}
        
        {currentStep < steps.length - 1 ? (
            <Button
              onClick={handleNextStep}
              disabled={saving || submitting}
              className="bg-[#4aa0f0] hover:bg-blue-500 text-white border-none"
            >
              {saving ? 'Saving...' : 'Save & Continue'}
            </Button>
        ) : (
            <>
                <Button
                  variant="outline"
                  onClick={saveForm}
                  disabled={saving || submitting}
                  className="gap-2 border-primary/20 text-primary hover:bg-primary/5"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving...' : 'Save Form'}
                </Button>
                <Button
                  onClick={submitApplication}
                  disabled={saving || submitting || !formId}
                  className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                >
                  <Send className="h-4 w-4" />
                  {submitting ? 'Submitting...' : 'Submit Application'}
                </Button>
            </>
        )}
      </div>
    </div>
  );
}
