import Image from "next/image";
import Link from "next/link";
import { Lock, UserRound } from "lucide-react";

export default function PgStudentsLoginPage() {
  return (
    <div className="min-h-screen bg-[#eef3f7] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-2xl border border-slate-200">
        <div className="bg-[#202833] px-8 py-7 text-white">
          <div className="flex items-center gap-4">
            <Image
              src="/e-portal/images/logo new.png"
              alt="PCU Logo"
              width={58}
              height={58}
              className="rounded bg-white p-1"
            />
            <div>
              <h1 className="text-lg font-semibold leading-tight">
                Postgraduate Student Portal
              </h1>
              <p className="mt-1 text-xs italic text-white/80">
                Precious Cornerstone University
              </p>
            </div>
          </div>
        </div>

        <div className="px-8 py-7">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-900">Login</h2>
            <p className="mt-1 text-sm text-slate-500">
              Enter your postgraduate student credentials to continue.
            </p>
          </div>

          <form className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                Matric Number
              </label>
              <div className="relative">
                <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Enter matric or application number"
                  className="h-11 w-full rounded border border-slate-300 pl-10 pr-3 text-sm outline-none focus:border-[#1f5f91] focus:ring-2 focus:ring-[#1f5f91]/15"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  placeholder="Enter password"
                  className="h-11 w-full rounded border border-slate-300 pl-10 pr-3 text-sm outline-none focus:border-[#1f5f91] focus:ring-2 focus:ring-[#1f5f91]/15"
                />
              </div>
            </div>

            <Link
              href="/pgstudents/dashboard"
              className="flex h-11 w-full items-center justify-center rounded bg-[#1f5f91] text-sm font-semibold text-white shadow hover:bg-[#174a72]"
            >
              Login
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}
