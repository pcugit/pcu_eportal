import PgAdmissionLetter from "@/components/PgAdmissionLetter";

export default function PgAdmissionLetterPreviewPage() {
  return (
    <main className="min-h-screen overflow-x-auto bg-neutral-200 px-4 py-6 print:bg-white print:p-0">
      <div className="mx-auto w-fit shadow-xl print:shadow-none">
        <PgAdmissionLetter
          candidateName="Ori, Oluwatobiloba Oladimeji"
          candidateAddress="24 Adebyi Street, Yaba Lagos."
          programme="Business Administration"
          department="Business Administration"
          faculty="Faculty of Social and Management Sciences"
          session="2025/2026"
          degree="MBA"
          mode="Full Time"
          supervisor="Dr. G.M. Solayide"
          date="3rd December, 2025"
          reference="2025/26 Admission"
          logoSrc="/e-portal/images/logo%20new.png"
        />
      </div>
    </main>
  );
}
