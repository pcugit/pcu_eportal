"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Upload, Phone, Mail, MapPin, User, ShieldCheck, Calendar, Briefcase, Heart, Fingerprint, Globe, Map } from "lucide-react";

interface ApplicantProfileProps {
  applicant: any;
  form: any;
  documents: any[];
}

export default function ApplicantProfile({ applicant, form, documents }: ApplicantProfileProps) {
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
    <div key={index} className="bg-white border border-slate-200 p-6 space-y-4 shadow-sm mb-6">
      <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-2">
        <h4 className="font-bold text-[#6b357d]">Sitting {index + 1}</h4>
        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold uppercase tracking-widest">{exam.name || 'WAEC'}</span>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-600">Name: {exam.name || 'WAEC'}</p>
        <p className="text-sm font-medium text-slate-600">Number: {exam.number}</p>
        <p className="text-sm font-medium text-slate-600">Period: {exam.period}</p>
        <p className="text-sm font-medium text-slate-600">Year: {exam.year}</p>
      </div>

      <table className="w-full text-left border-collapse border border-slate-200">
        <tbody>
          {exam.subjects?.filter((s: any) => s.subject).map((s: any, idx: number) => (
            <tr key={idx} className="border-t border-slate-200">
              <td className="py-3 px-4 text-sm text-slate-600 uppercase font-medium">{s.subject}</td>
              <td className="py-3 px-4 text-sm font-bold text-slate-700 w-20 text-center border-l border-slate-200">{s.grade || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6 bg-slate-50/50 p-4 md:p-8 min-h-screen">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Application Form</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
        {/* Left Column: Actions Sidebar */}
        <div className="space-y-6">
          <h2 className="text-xl font-medium text-slate-700 px-1">Actions</h2>
          
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

            <div className="px-6 pb-8 flex flex-col items-center">
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
              <div className="mt-4 text-center space-y-1">
                <h3 className="text-xl font-medium text-slate-800 lowercase">{form?.full_name || applicant?.user_name}</h3>
                <p className="text-slate-500 text-sm tracking-wide">PT{new Date(applicant?.created_at || Date.now()).getFullYear()}{applicant?.id?.toString().padStart(4, '0')}</p>
                <div className="pt-2">
                  <Badge className="bg-orange-400 hover:bg-orange-500 text-white border-0 px-4 py-1 rounded-full text-[10px] font-bold uppercase">
                    {applicant?.program_name || 'PART TIME'}
                  </Badge>
                </div>
              </div>

              {/* Contact Info */}
              <div className="mt-6 w-full space-y-2 text-center text-slate-600">
                <p className="text-sm font-medium">{applicant?.email || form?.email}</p>
                <p className="text-sm font-medium">{form?.phone_number || applicant?.phone_number}</p>
                <p className="text-sm font-medium">{form?.secondary_phone_number || 'N/A'}</p>
              </div>

              {/* Admission Status */}
              <div className="mt-6 flex items-center gap-2">
                <span className="text-sm text-slate-500 font-medium">Admission Status:</span>
                <Badge className="bg-[#6b357d] hover:bg-[#5a2d69] text-white border-0 px-3 py-1 rounded text-xs font-bold capitalize">
                  {applicant?.admission_status?.replace('_', ' ') || 'Pending'}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Main Form Data */}
        <div className="lg:col-span-3 space-y-8">
          <div className="bg-white border border-slate-100 p-8 shadow-sm">
            {/* Registration Date Header */}
            <div className="mb-10">
              <p className="text-slate-600 text-lg">
                Registration Date {new Date(applicant?.created_at || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')} {new Date(applicant?.created_at || Date.now()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
            </div>

            {/* Personal Info Grid */}
            <div className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-y-6 border-b border-slate-50 pb-6">
                  <p className="text-sm text-slate-600"><span className="text-slate-500">Gender:</span> {form?.gender}</p>
                  <p className="text-sm text-slate-600"><span className="text-slate-500">Date of Birth:</span> {form?.date_of_birth}</p>
                  <p className="text-sm text-slate-600"><span className="text-slate-500">Place of Birth:</span> {form?.place_of_birth}</p>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-y-6 border-b border-slate-50 pb-6">
                  <p className="text-sm text-slate-600"><span className="text-slate-500">Marital:</span> {form?.marital_status}</p>
                  <p className="text-sm text-slate-600"><span className="text-slate-500">Religion:</span> {form?.religion}</p>
                  <p className="text-sm text-slate-600 md:col-span-1"><span className="text-slate-500">Address:</span> {form?.address || form?.contact_address || 'N/A'}</p>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-y-6 border-b border-slate-50 pb-6">
                  <p className="text-sm text-slate-600"><span className="text-slate-500">LGA:</span> {form?.lga}</p>
                  <p className="text-sm text-slate-600"><span className="text-slate-500">State:</span> {form?.state}</p>
                  <p className="text-sm text-slate-600"><span className="text-slate-500">Nationality:</span> {form?.nationality || 'Nigeria'}</p>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-y-6 pb-8">
                  <p className="text-sm text-slate-600"><span className="text-slate-500">Blood Group:</span> {form?.blood_group}</p>
                  <p className="text-sm text-slate-600"><span className="text-slate-500">Genotype:</span> {form?.genotype}</p>
               </div>

               {/* Sponsor's Section */}
               <div className="pt-4">
                  <h3 className="text-lg font-medium text-slate-700 border-b border-slate-100 pb-3 mb-6">Sponsor's Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-y-8">
                     <p className="text-sm text-slate-600"><span className="text-slate-500">Name:</span> {form?.sponsor_name}</p>
                     <p className="text-sm text-slate-600"><span className="text-slate-500">Phone Number :</span><br/>{form?.sponsor_phone_number}</p>
                     <p className="text-sm text-slate-600"><span className="text-slate-500">Email:</span> {form?.sponsor_email || 'N/A'}</p>
                     
                     <p className="text-sm text-slate-600"><span className="text-slate-500">Relationship:</span><br/>{form?.sponsor_relationship}</p>
                     <p className="text-sm text-slate-600 md:col-span-2"><span className="text-slate-500">Address:</span> {form?.sponsor_address}</p>
                  </div>
               </div>

               {/* Next of Kin Section */}
               <div className="pt-10">
                  <h3 className="text-lg font-medium text-slate-700 border-b border-slate-100 pb-3 mb-6">Next of Kin's Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-y-8">
                     <p className="text-sm text-slate-600"><span className="text-slate-500">Name:</span> {form?.next_of_kin_name}</p>
                     <p className="text-sm text-slate-600"><span className="text-slate-500">Phone Number :</span><br/>{form?.next_of_kin_phone_number}</p>
                     <p className="text-sm text-slate-600 md:col-span-1"><span className="text-slate-500">Address:</span> {form?.next_of_kin_address}</p>
                  </div>
               </div>

               {/* Programme Choice Section */}
               <div className="pt-10">
                  <h3 className="text-lg font-medium text-slate-700 border-b border-slate-100 pb-3 mb-6">Choice Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-y-8">
                     <p className="text-sm text-slate-600"><span className="text-slate-500">First Choice Program:</span><br/>{applicant?.program_name || form?.first_choice_program_name || 'N/A'}</p>
                     <p className="text-sm text-slate-600"><span className="text-slate-500">Second Choice Program:</span><br/>{form?.second_choice_program_name || 'N/A'}</p>
                  </div>
               </div>


            </div>
          </div>

          {/* Bottom Grid: O'Level and Documents */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* O'Level Column */}
            <div className="space-y-4">
              {olevelResults.length > 0 ? (
                olevelResults.map((exam: any, idx: number) => renderOlevelCard(exam, idx))
              ) : (
                <div className="bg-white border border-slate-100 p-8 text-center text-slate-400 font-medium italic">No O'Level results found</div>
              )}
            </div>

            {/* Documents Column */}
            <div className="bg-white border border-slate-100 p-8 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                <span className="text-slate-600 font-medium">Documents</span>
                <Button className="bg-[#6b357d] hover:bg-[#5a2d69] text-white rounded px-4 h-10 text-sm font-medium">
                  Upload Additional Documents
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-slate-500 font-medium text-sm">
                       <th className="pb-4">Name</th>
                       <th className="pb-4 text-center">Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.length > 0 ? documents.map((doc, idx) => (
                      <tr key={idx} className="border-t border-slate-50">
                        <td className="py-4 text-sm text-slate-600 font-medium capitalize">{doc.display_name || doc.document_type?.replace('_', ' ')}</td>
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
