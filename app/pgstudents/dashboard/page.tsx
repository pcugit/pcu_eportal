import Image from "next/image";
import Link from "next/link";
import {
  Calendar,
  ChevronDown,
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  History,
  Lock,
  Mail,
  NotebookPen,
  Phone,
  Printer,
  ReceiptText,
  Settings,
  UserRound,
  WalletCards,
} from "lucide-react";

const menuGroups = [
  {
    title: "Academics",
    items: [
      { label: "Course Registration", icon: NotebookPen, color: "bg-[#2aadb9]" },
      { label: "Print Course Form", icon: Printer, color: "bg-[#2aadb9]" },
    
    ],
  },
  {
    title: "Payments",
    items: [
      { label: "Pay School Fees", icon: CreditCard, color: "bg-[#35ad39]" },
      { label: "Download Receipt", icon: ReceiptText, color: "bg-[#35ad39]" },
    
    
    ],
  },
  {
    title: "Documents",
    items: [
      { label: "Admission Letter", icon: FileText, color: "bg-[#93008c]" },
      { label: "Medical Examination Form", icon: FileText, color: "bg-[#93008c]" },
      { label: "Notice & Affidavit", icon: Settings, color: "bg-[#93008c]" },
    ],
  },
  {
    title: "Profile",
    items: [
      { label: "Profile Information", icon: UserRound, color: "bg-[#8a5309]" },
      { label: "Change Password", icon: Lock, color: "bg-[#8a5309]" },
    ],
  },
  {
    title: "Wallet",
    items: [
      { label: "Deposit", icon: WalletCards, color: "bg-[#93008c]" },
      { label: "Make Payment", icon: WalletCards, color: "bg-[#93008c]" },
      { label: "History", icon: History, color: "bg-[#93008c]" }
    ]
  },
];

const availableReceipts = [
  "Tuition",
  "Acceptance Fee",
  "Application Fee",
  "Departmental Fee",
];

const profileDetails = [
  { label: "Matric No", value: "PG/2026/000128" },
  { label: "Course of Study", value: "M.Sc. Computer Science" },
  { label: "Session", value: "2026/2027" },
  { label: "Email", value: "pgstudent@pcu.edu.ng" },
];

export default function PgStudentsDashboardPage() {
  return (
    <div className="min-h-screen bg-[#102943] text-white">
      <header className="bg-[#202833]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:gap-6 md:px-6 md:py-5">
          <div className="flex items-center gap-3 md:gap-6">
            <Image
              src="/e-portal/images/logo new.png"
              alt="PCU Logo"
              width={86}
              height={86}
              className="h-14 w-14 shrink-0 rounded bg-white p-1 md:h-[86px] md:w-[86px]"
            />
            <div className="min-w-0">
              <h1 className="text-sm font-semibold leading-snug tracking-wide md:text-base md:leading-relaxed">
                The Postgraduate College
                <br />
                Precious Cornerstone University
              </h1>
              <p className="mt-1 text-xs italic leading-snug text-white/80 md:text-sm">
                ...raising excellent postgraduate scholars
              </p>
            </div>
          </div>

          <div className="grid gap-1 border-t border-white/10 pt-3 text-xs font-semibold text-white/90 md:border-t-0 md:pt-0 md:text-sm">
            <p className="flex min-w-0 items-center gap-2">
              <Mail className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" />
              <span className="min-w-0 truncate">pgschool@pcu.edu.ng</span>
            </p>
            <p className="flex min-w-0 items-center gap-2">
              <Phone className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" />
              <span className="min-w-0 truncate">09090561432 (9am - 4pm)</span>
            </p>
          </div>
        </div>
      </header>

      <div className="bg-white text-slate-900">
        <div className="mx-auto flex max-w-6xl flex-col gap-1.5 px-4 py-3 text-xs md:flex-row md:items-center md:justify-between md:px-6 md:text-sm">
          <p className="italic text-slate-700">Welcome Postgraduate Student</p>
          <div className="font-semibold uppercase tracking-wide md:tracking-wider">
            <p className="text-red-500">2026/2027 Academic Session</p>
            <Link href="/pgstudents/login" className="text-slate-950">
              Logout
            </Link>
          </div>
        </div>
      </div>

      <main className="bg-gradient-to-b from-[#0b2942] via-[#205b8c] to-[#2f93df]">
        <div className="mx-auto grid min-h-[640px] max-w-6xl grid-cols-1 gap-x-24 gap-y-20 px-6 py-16 md:grid-cols-2 lg:grid-cols-3">
          {menuGroups.map((group) => (
            <section key={group.title}>
              <h2 className="mb-2 text-xl font-medium">{group.title}</h2>
              <div className="space-y-3">
                {group.items.map((item) => {
                  const Icon = item.icon;

                  if (item.label === "Download Receipt") {
                    return (
                      <details key={item.label} className="group/receipt">
                        <summary
                          className={`flex h-[50px] w-full cursor-pointer list-none items-center gap-4 px-3 text-left text-sm font-semibold text-white shadow-[7px_7px_6px_rgba(0,0,0,0.25)] transition-transform hover:-translate-y-0.5 ${item.color}`}
                        >
                          <Icon className="h-7 w-7 shrink-0 text-white/90" />
                          <span className="min-w-0 flex-1">
                            {item.label}
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open/receipt:rotate-180" />
                        </summary>
                        <div className="mt-2 space-y-2 rounded-sm bg-white/10 p-2 shadow-inner">
                          {availableReceipts.map((receipt) => (
                            <button
                              key={receipt}
                              type="button"
                              className="grid h-10 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded bg-white px-3 text-left text-xs font-bold text-slate-900 transition-colors hover:bg-slate-100"
                            >
                              <span className="min-w-0 truncate">
                                {receipt}
                              </span>
                              <span className="flex items-center gap-1 text-[#6b21a8]">
                                <Download className="h-4 w-4" />
                                PDF
                              </span>
                            </button>
                          ))}
                        </div>
                      </details>
                    );
                  }

                  if (item.label === "Profile Information") {
                    return (
                      <details key={item.label} className="group/profile">
                        <summary
                          className={`flex h-[50px] w-full cursor-pointer list-none items-center gap-4 px-3 text-left text-sm font-semibold text-white shadow-[7px_7px_6px_rgba(0,0,0,0.25)] transition-transform hover:-translate-y-0.5 ${item.color}`}
                        >
                          <Icon className="h-7 w-7 shrink-0 text-white/90" />
                          <span className="min-w-0 flex-1">
                            {item.label}
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open/profile:rotate-180" />
                        </summary>
                        <div className="mt-2 space-y-2 rounded-sm bg-white/10 p-2 shadow-inner">
                          {profileDetails.map((detail) => (
                            <div
                              key={detail.label}
                              className="rounded bg-white px-3 py-2 text-xs text-slate-900"
                            >
                              <p className="font-semibold text-slate-500">
                                {detail.label}
                              </p>
                              <p className="mt-0.5 break-words font-bold">
                                {detail.value}
                              </p>
                            </div>
                          ))}
                        </div>
                      </details>
                    );
                  }

                  return (
                    <button
                      key={item.label}
                      type="button"
                      className={`flex h-[50px] w-full items-center gap-4 px-3 text-left text-sm font-semibold text-white shadow-[7px_7px_6px_rgba(0,0,0,0.25)] transition-transform hover:-translate-y-0.5 ${item.color}`}
                    >
                      <Icon className="h-7 w-7 shrink-0 text-white/90" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </main>

      <footer className="bg-[#202833]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4 text-sm md:flex-row md:items-center md:justify-between">
          <p>
            Â© 2026 The Postgraduate College, Precious Cornerstone University.
            All Rights Reserved
          </p>
          <p className="font-semibold">Follow us on: f Â· x Â· G+ Â· in</p>
        </div>
      </footer>
    </div>
  );
}
