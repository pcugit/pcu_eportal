"use client";

import React, { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiClient } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Lock, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STAFF_DASHBOARD_PATHS: Record<string, string> = {
  admissionofficer: "/admission_officer/dashboard",
  registrar: "/registrar/dashboard",
  lecturer: "/lecturer/dashboard",
  ictdirector: "/ict/dashboard",
  deo: "/deo/dashboard",
  hod: "/hod/dashboard",
  dean: "/dean/dashboard",
};

export default function StaffChangePasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth() ?? { user: null };
  const [formData, setFormData] = useState({
    new_password: "",
    confirm_password: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fallbackDashboard = useMemo(() => {
    return user?.role ? (STAFF_DASHBOARD_PATHS[user.role] ?? "/") : "/";
  }, [user?.role]);

  const returnTo = useMemo(() => {
    const param = searchParams.get("returnTo");
    if (typeof param === "string" && param.startsWith("/")) {
      return param;
    }
    return fallbackDashboard;
  }, [fallbackDashboard, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (formData.new_password !== formData.confirm_password) {
      setMessage({ type: "error", text: "Passwords do not match" });
      return;
    }

    setLoading(true);
    try {
      await ApiClient.changePassword("", formData.new_password);
      setMessage({ type: "success", text: "Password successfully updated" });
      setFormData({ new_password: "", confirm_password: "" });
      router.push(returnTo);
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Update failed" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-2xl rounded-3xl overflow-hidden">
        <div className="bg-purple-700 dark:bg-purple-800 p-6 flex items-center gap-3 text-white">
          <Lock size={20} />
          <div>
            <h2 className="font-bold text-lg">Staff Password Reset</h2>
            <p className="text-sm text-purple-100/80">
              Update your password and return to your dashboard cleanly.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {message && (
            <div
              className={cn(
                "p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2",
                message.type === "success"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
                  : "bg-rose-50 text-rose-700 border border-rose-100 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
              )}
            >
              {message.type === "success" ? (
                <CheckCircle2 size={18} />
              ) : (
                <AlertCircle size={18} />
              )}
              <p className="text-sm font-bold">{message.text}</p>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1 dark:text-slate-300">
                New Password
              </label>
              <Input
                type="password"
                disabled={loading}
                required
                placeholder="••••••••"
                className="h-12 bg-slate-50 border-slate-100 focus:ring-purple-600 rounded-xl font-medium dark:bg-slate-950 dark:border-slate-800 dark:focus:ring-purple-500"
                value={formData.new_password}
                onChange={(e) =>
                  setFormData({ ...formData, new_password: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1 dark:text-slate-300">
                Confirm Password
              </label>
              <Input
                type="password"
                disabled={loading}
                required
                placeholder="••••••••"
                className="h-12 bg-slate-50 border-slate-100 focus:ring-purple-600 rounded-xl font-medium dark:bg-slate-950 dark:border-slate-800 dark:focus:ring-purple-500"
                value={formData.confirm_password}
                onChange={(e) =>
                  setFormData({ ...formData, confirm_password: e.target.value })
                }
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-slate-900 hover:bg-slate-800 transition-all rounded-xl text-white font-black uppercase tracking-widest"
            >
              {loading ? "Updating..." : "Update Password"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push(returnTo)}
              className="w-full h-12 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-xl font-semibold"
            >
              <span className="inline-flex items-center gap-2">
                <ArrowLeft size={16} />
                Back to dashboard
              </span>
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
