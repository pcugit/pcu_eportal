"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Upload, Phone, Mail, MapPin, User, ShieldCheck, Calendar, Briefcase, Heart, Fingerprint, Globe, Map } from "lucide-react";

interface ApplicantProfileProps {
  applicant: any;
  form: any;
  documents: any[];
  acceptanceFeeData?: { amount: number; feeName: string; paid: boolean } | null;
}

export default function ApplicantProfile({ applicant, form, documents, acceptanceFeeData }: ApplicantProfileProps) {
  const router = useRouter();
  const [passportUrl, setPassportUrl] = React.useState<string | null>(null);

  // Find passport document
  const passportDoc = documents.find(d => 
    d.document_type?.toLowerCase().includes('passport') || 
    d.display_name?.toLowerCase().includes('passport')
  );

  // Fetch passport image with auth
  React.useEffect(() => {
    if (passportDoc?.document_id) {
      const fetchPassport = async () => {
        try {
          const token = localStorage.getItem('auth_token');
          const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
          const response = await fetch(`${baseUrl}/applicant/download-document/${passportDoc.document_id}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            setPassportUrl(url);
          }
        } catch (e) {
          console.error("Failed to fetch passport", e);
        }
      };
      fetchPassport();
    }
    
    return () => {
      if (passportUrl) URL.revokeObjectURL(passportUrl);
    };
  }, [passportDoc?.document_id]);

  // Build formatted name: SURNAME, FIRSTNAME MIDDLENAME
  const formatName = () => {
    const surname = form?.surname || form?.last_name;
    const firstName = form?.first_name;
    const middleName = form?.middle_name;
    if (surname && firstName) {
      const rest = [firstName, middleName].filter(Boolean).join(' ');
      return `${surname}, ${rest}`;
    }
    // fallback: use full_name or applicant user_name
    return form?.full_name || applicant?.user_name || '';
  };
  const displayName = formatName().toUpperCase();
  const detailTextClass = "min-w-0 break-words [overflow-wrap:anywhere] text-sm leading-relaxed text-slate-600";
  const detailGridClass = "grid grid-cols-1 gap-x-8 gap-y-4 border-b border-slate-100 pb-5 md:grid-cols-2 xl:grid-cols-3";
  const sectionGridClass = "grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3";

  // Parse O'Level if it's a string
  let olevelResults = [];
  if (form?.olevel_results) {
    try {
      olevelResults = typeof form.olevel_results === 'string' 
        ? JSON.parse(form.olevel_results) 
        : form.olevel_results;
    } catch (e) {
      console.error("Failed to parse O'Level results", e);
    }
  }

  const renderOlevelCard = (exam: any, index: number) => (
    <div key={index} className="bg-white border border-slate-200 p-4 sm:p-5 space-y-4 shadow-sm">
      <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-2">
        <h4 className="font-bold text-[#6b357d]">Sitting {index + 1}</h4>
        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold uppercase tracking-widest">{exam.name || 'WAEC'}</span>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-600 break-words [overflow-wrap:anywhere]">Name: {exam.name || 'WAEC'}</p>
        <p className="text-sm font-medium text-slate-600 break-words [overflow-wrap:anywhere]">Number: {exam.number}</p>
        <p className="text-sm font-medium text-slate-600 break-words [overflow-wrap:anywhere]">Period: {exam.period}</p>
        <p className="text-sm font-medium text-slate-600 break-words [overflow-wrap:anywhere]">Year: {exam.year}</p>
      </div>

      <table className="w-full table-fixed text-left border-collapse border border-slate-200">
        <tbody>
          {exam.subjects?.filter((s: any) => s.subject).map((s: any, idx: number) => (
            <tr key={idx} className="border-t border-slate-200">
              <td className="py-3 px-3 sm:px-4 text-sm text-slate-600 uppercase font-medium break-words [overflow-wrap:anywhere]">{s.subject}</td>
              <td className="py-3 px-4 text-sm font-bold text-slate-700 w-20 text-center border-l border-slate-200">{s.grade || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="w-full space-y-5 bg-slate-50/50 p-3 sm:p-4 md:p-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Application Form</h1>
      </div>

      <div className="grid grid-cols-1 gap-5 items-start lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
        {/* Left Column: Actions Sidebar */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-slate-700 px-1">Actions</h2>
          
          <div className="bg-white border border-slate-200 overflow-hidden">
            {/* Header with Mountain/Banner */}
            <div className="h-32 w-full relative">
               <img 
                 src="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=800" 
                 alt="Background" 
                 className="w-full h-full object-cover grayscale opacity-60"
               />
               <div className="absolute inset-0 bg-slate-800/20"></div>
            </div>

            <div className="px-4 sm:px-5 pb-6 flex flex-col items-center">
              {/* Profile Image */}
              <div className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-sm -mt-14 z-10 bg-slate-200">
                {passportUrl ? (
                  <img src={passportUrl} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User className="h-14 w-14 text-slate-400" />
                  </div>
                )}
              </div>

              {/* Name and ID */}
              <div className="mt-4 min-w-0 text-center space-y-1">
                <h3 className="text-lg font-semibold leading-snug text-slate-800 uppercase break-words [overflow-wrap:anywhere]">{displayName}</h3>
                <p className="text-slate-500 text-xs tracking-wide font-mono font-medium break-words [overflow-wrap:anywhere]">{applicant?.form_no || 'N/A'}</p>
                <div className="pt-2">
                  <Badge className="max-w-full whitespace-normal bg-orange-400 hover:bg-orange-500 text-white border-0 px-3 py-1 rounded-full text-[10px] font-bold uppercase break-words [overflow-wrap:anywhere]">
                    {applicant?.program_name}
                  </Badge>
                </div>
              </div>

              {/* Contact Info */}
              <div className="mt-5 w-full min-w-0 space-y-2 text-center text-slate-600">
                <p className="text-sm font-medium break-words [overflow-wrap:anywhere]">{applicant?.email || form?.email}</p>
                <p className="text-sm font-medium break-words [overflow-wrap:anywhere]">{form?.phone_number || applicant?.phone_number}</p>
                <p className="text-sm font-medium break-words [overflow-wrap:anywhere]">{form?.secondary_phone_number || 'N/A'}</p>
              </div>

              {/* Admission Status */}
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-center">
                <span className="text-sm text-slate-500 font-medium">Admission Status:</span>
                <Badge className="bg-[#6b357d] hover:bg-[#5a2d69] text-white border-0 px-3 py-1 rounded text-xs font-bold capitalize">
                  {applicant?.admission_status?.replace('_', ' ') || 'Pending'}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Main Form Data */}
        <div className="min-w-0 space-y-5">
          <div className="bg-white border border-slate-100 p-4 sm:p-5 lg:p-6 shadow-sm">
            {/* Registration Date Header */}
            <div className="mb-6">
              <p className="text-slate-600 text-base sm:text-lg break-words [overflow-wrap:anywhere]">
                Registration Date {new Date(applicant?.created_at || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')} {new Date(applicant?.created_at || Date.now()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
            </div>

            {/* Personal Info Grid */}
            <div className="space-y-5">
               <div className={detailGridClass}>
                  <p className={detailTextClass}><span className="text-slate-500">Gender:</span> {form?.gender}</p>
                  <p className={detailTextClass}><span className="text-slate-500">Date of Birth:</span> {form?.date_of_birth}</p>
                  <p className={detailTextClass}><span className="text-slate-500">Place of Birth:</span> {form?.place_of_birth}</p>
               </div>

               <div className={detailGridClass}>
                  <p className={detailTextClass}><span className="text-slate-500">Marital:</span> {form?.marital_status}</p>
                  <p className={detailTextClass}><span className="text-slate-500">Religion:</span> {form?.religion}</p>
                  <p className={detailTextClass}><span className="text-slate-500">Address:</span> {form?.address || form?.contact_address || 'N/A'}</p>
               </div>

               <div className={detailGridClass}>
                  <p className={detailTextClass}><span className="text-slate-500">LGA:</span> {form?.lga}</p>
                  <p className={detailTextClass}><span className="text-slate-500">State:</span> {form?.state}</p>
                  <p className={detailTextClass}><span className="text-slate-500">Nationality:</span> {form?.nationality || 'Nigeria'}</p>
               </div>

               <div className="grid grid-cols-1 gap-x-8 gap-y-4 pb-4 md:grid-cols-2 xl:grid-cols-3">
                  <p className={detailTextClass}><span className="text-slate-500">Blood Group:</span> {form?.blood_group}</p>
                  <p className={detailTextClass}><span className="text-slate-500">Genotype:</span> {form?.genotype}</p>
               </div>

               {/* Sponsor's Section */}
               <div className="pt-2">
                  <h3 className="text-lg font-medium text-slate-700 border-b border-slate-100 pb-3 mb-5">Sponsor's Information</h3>
                  <div className={sectionGridClass}>
                     <p className={detailTextClass}><span className="text-slate-500">Name:</span> {form?.sponsor_name}</p>
                     <p className={detailTextClass}><span className="text-slate-500">Phone Number:</span> {form?.sponsor_phone_number}</p>
                     <p className={detailTextClass}><span className="text-slate-500">Email:</span> {form?.sponsor_email || 'N/A'}</p>
                     
                     <p className={detailTextClass}><span className="text-slate-500">Relationship:</span> {form?.sponsor_relationship}</p>
                     <p className={`${detailTextClass} md:col-span-2`}><span className="text-slate-500">Address:</span> {form?.sponsor_address}</p>
                  </div>
               </div>

               {/* Next of Kin Section */}
               <div className="pt-6">
                  <h3 className="text-lg font-medium text-slate-700 border-b border-slate-100 pb-3 mb-5">Next of Kin's Information</h3>
                  <div className={sectionGridClass}>
                     <p className={detailTextClass}><span className="text-slate-500">Name:</span> {form?.next_of_kin_name}</p>
                     <p className={detailTextClass}><span className="text-slate-500">Phone Number:</span> {form?.next_of_kin_phone_number}</p>
                     <p className={detailTextClass}><span className="text-slate-500">Address:</span> {form?.next_of_kin_address}</p>
                  </div>
               </div>

               {/* Programme Choice Section */}
               <div className="pt-6">
                  <h3 className="text-lg font-medium text-slate-700 border-b border-slate-100 pb-3 mb-5">Choice Information</h3>
                  <div className={sectionGridClass}>
                     <p className={detailTextClass}><span className="text-slate-500">First Choice Program:</span> {form?.first_choice_program_name || 'N/A'}</p>
                     <p className={detailTextClass}><span className="text-slate-500">Second Choice Program:</span> {form?.second_choice_program_name || 'N/A'}</p>
                  </div>
               </div>


            </div>
          </div>

          {/* Bottom Grid: O'Level and Documents */}
          <div className="grid grid-cols-1 gap-5 items-start xl:grid-cols-[minmax(260px,0.9fr)_minmax(320px,1fr)]">
            {/* O'Level Column */}
            <div className="min-w-0 space-y-4">
              {olevelResults.length > 0 ? (
                olevelResults.map((exam: any, idx: number) => renderOlevelCard(exam, idx))
              ) : (
                <div className="bg-white border border-slate-100 p-8 text-center text-slate-400 font-medium italic">No O'Level results found</div>
              )}
            </div>

            {/* Documents Column */}
            <div className="min-w-0 bg-white border border-slate-100 p-4 sm:p-5 lg:p-6 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 pb-4 gap-3">
                <span className="text-slate-600 font-medium">Documents</span>
                <Button className="w-full sm:w-auto bg-[#6b357d] hover:bg-[#5a2d69] text-white rounded px-4 min-h-10 h-auto text-sm font-medium whitespace-normal text-center leading-snug">
                  Upload Additional Documents
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[280px] table-fixed text-left">
                  <thead>
                    <tr className="text-slate-500 font-medium text-sm">
                       <th className="pb-4 pr-4">Name</th>
                       <th className="w-24 pb-4 text-center">Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.length > 0 ? documents.map((doc, idx) => (
                      <tr key={idx} className="border-t border-slate-50">
                        <td className="py-4 pr-4 text-sm text-slate-600 font-medium capitalize break-words [overflow-wrap:anywhere]">{doc.display_name || doc.document_type?.replace('_', ' ')}</td>
                        <td className="py-4 text-center">
                           <Button 
                             size="icon" 
                             className="bg-[#6b357d] hover:bg-[#5a2d69] rounded h-9 w-9"
                             onClick={async () => {
                                try {
                                  const token = localStorage.getItem('auth_token');
                                  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
                                  const response = await fetch(`${baseUrl}/applicant/download-document/${doc.document_id}`, {
                                    headers: {
                                      'Authorization': `Bearer ${token}`
                                    }
                                  });
                                  
                                  if (response.ok) {
                                    const blob = await response.blob();
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = doc.original_filename || 'document';
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    URL.revokeObjectURL(url);
                                  }
                                } catch (e) {
                                  console.error("Download failed", e);
                                }
                             }}
                           >
                              <Download className="h-4 w-4" />
                           </Button>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={2} className="py-8 text-center text-slate-400 font-medium italic">No documents uploaded</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
