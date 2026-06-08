"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogOut, Users, Lock, Unlock, Settings, ShieldCheck, UserCog, FileSpreadsheet } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function ICTDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, logout, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || (user?.role !== "admin" && user?.role !== "ict_director")) {
      router.replace("/staff/login");
      return;
    }

    loadSettings();
    loadPendingCount();
  }, [isAuthenticated, user, router]);

  const loadPendingCount = async () => {
    try {
      const { data } = await ApiClient.fetch<any[]>("/results/pending?status=pending");
      setPendingCount(data.length);
    } catch {}
  };

  const loadSettings = async () => {
    try {
       const res = await ApiClient.fetch<any>("/settings/system-status");
       setSystemStatus(res.data); // Set only the data part
    } catch (err) {
       console.error("Failed to fetch system status:", err);
    } finally {
      setLoading(false);
    }
  };


  const handleLogout = async () => {
    await logout();
    router.replace("/staff/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading ICT Portal...</p>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-slate-50">

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {pendingCount > 0 && (
          <div className="mb-8 p-4 bg-orange-50 border border-orange-200 rounded-xl flex items-center justify-between animate-pulse">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg text-orange-600">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold text-orange-900">Pending Results Submissions</p>
                <p className="text-orange-700 text-sm">There are {pendingCount} bulk result files from lecturers awaiting processing.</p>
              </div>
            </div>
            <Link href="/ict/result-processor">
              <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white">Review Submissions →</Button>
            </Link>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Quick Actions */}
          <div className="lg:col-span-2 space-y-8">
            <div className="grid md:grid-cols-2 gap-4">
              <Link href="/ict/staff">
                <Card className="hover:shadow-md transition-all cursor-pointer h-full border-l-4 border-l-blue-500 group">
                  <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2 group-hover:text-blue-600 transition-colors">
                      <Users className="h-6 w-6" />
                      Staff Management
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      Create staff accounts, assign roles (Lecturer, Admissions Officer, etc.), and manage status.
                    </p>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      Primary Control
                    </Badge>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/ict/students">
                <Card className="hover:shadow-md transition-all cursor-pointer h-full border-l-4 border-l-purple-500 group">
                  <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2 group-hover:text-purple-600 transition-colors">
                      <UserCog className="h-6 w-6" />
                      Student Management
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      Direct access to student profiles, matric numbers, and academic record management.
                    </p>
                    <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                      Portal Admin
                    </Badge>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/ict/result-processor">
                <Card className="hover:shadow-md transition-all cursor-pointer h-full border-l-4 border-l-emerald-500 group">
                  <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2 group-hover:text-emerald-600 transition-colors">
                      <FileSpreadsheet className="h-6 w-6" />
                      Result Processor
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      Process CSV results, normalise data, and calculate student grades across departments.
                    </p>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                      Utility
                    </Badge>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/ict/settings">
                <Card className="hover:shadow-md transition-all cursor-pointer h-full border-l-4 border-l-orange-500 group">
                  <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2 group-hover:text-orange-600 transition-colors">
                      <Settings className="h-6 w-6" />
                      Control Center
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      Manage portal locks, toggle admissions, and control result upload permissions globally.
                    </p>
                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                      System Admin
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            </div>

            {/* Academic Session Management */}
            <AcademicSessionManager />
          </div>

          {/* System Info Sidebar */}
          <div className="space-y-6">
            <Card className="bg-slate-900 text-white border-0 overflow-hidden relative">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Settings className="h-24 w-24 rotate-12" />
              </div>
              <CardHeader>
                <CardTitle className="text-white">System Status</CardTitle>
                <CardDescription className="text-slate-400">Environment: Production</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">Database:</span>
                  <span className={`${systemStatus?.db_status === "Connected" ? "text-green-400" : "text-red-400"} font-medium`}>{systemStatus?.db_status || "Checking..."}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">API Gateway:</span>
                  <span className="text-green-400 font-medium">{systemStatus?.api_status || "Checking..."}</span>
                </div>
                <div className="flex justify-between items-center text-sm border-t border-slate-800 pt-3">
                  <span className="text-slate-400">Internal 500 Errors:</span>
                  <span className={`${(systemStatus?.counts?.errors_500 || 0) > 0 ? "text-red-400 font-bold" : "text-green-400"} font-medium`}>
                    {systemStatus?.counts?.errors_500 || 0} recent
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">404 Errors:</span>
                  <span className={`${(systemStatus?.counts?.errors_404 || 0) > 0 ? "text-yellow-400" : "text-green-400"} font-medium`}>
                    {systemStatus?.counts?.errors_404 || 0} recent
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm border-t border-slate-800 pt-3">
                  <span className="text-slate-400">Locked Programs:</span>
                  <span className="text-orange-400 font-medium">{systemStatus?.locks?.programs_locked || 0} program(s)</span>
                </div>
                {(systemStatus?.locks?.admission || systemStatus?.locks?.course || systemStatus?.locks?.result || systemStatus?.locks?.undergraduate || systemStatus?.locks?.postgraduate || systemStatus?.locks?.part_time || systemStatus?.locks?.jupeb) && (
                   <div className="pt-2">
                     {systemStatus?.locks?.admission && <Badge className="bg-red-500/20 text-red-300 border-red-500/30 w-full justify-center mb-2 animate-pulse font-bold">Admissions Locked</Badge>}
                     {systemStatus?.locks?.course && <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30 w-full justify-center mb-2 animate-pulse font-bold">Course Registration Locked</Badge>}
                     {systemStatus?.locks?.result && <Badge className="bg-red-500/20 text-red-100 border-red-500/50 w-full justify-center mb-2 animate-pulse font-bold uppercase py-1.5"><Lock className="h-3 w-3 mr-2" /> Result Upload Locked</Badge>}
                     {systemStatus?.locks?.undergraduate && <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 w-full justify-center mb-2 font-bold">Undergraduate Locked</Badge>}
                     {systemStatus?.locks?.postgraduate && <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 w-full justify-center mb-2 font-bold">Postgraduate Locked</Badge>}
                     {systemStatus?.locks?.part_time && <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 w-full justify-center mb-2 font-bold">Part Time Locked</Badge>}
                     {systemStatus?.locks?.jupeb && <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 w-full justify-center mb-2 font-bold">JUPEB Locked</Badge>}
                   </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Role Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                 <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Admissions Officers:</span>
                      <span className="font-bold">2</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Lecturers:</span>
                      <span className="font-bold">48</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Deans / HODs:</span>
                      <span className="font-bold">12</span>
                    </div>
                 </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
function AcademicSessionManager() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await ApiClient.getGlobalSettings();
      // Ensure current_semester has a default so the form always submits a value
      if (!data.current_semester) {
        data.current_semester = "First Semester";
      }
      setSettings(data);
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await ApiClient.updateGlobalSettings({
        current_academic_session: settings.current_academic_session,
        current_semester: settings.current_semester
      });
      alert("Academic settings updated successfully!");
    } catch (err) {
      console.error("Update failed:", err);
      alert("Failed to update settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          Academic Session Manager
        </CardTitle>
        <CardDescription>
          Set the global active session and semester for all portal activities.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleUpdate} className="grid md:grid-cols-3 gap-6 items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium">Active Academic Session</label>
            <input 
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={settings.current_academic_session || ""}
              onChange={e => setSettings({...settings, current_academic_session: e.target.value})}
              placeholder="e.g. 2025/2026"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Active Semester</label>
            <select 
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={settings.current_semester || "First Semester"}
              onChange={e => setSettings({...settings, current_semester: e.target.value})}
            >
              <option value="First Semester">First Semester</option>
              <option value="Second Semester">Second Semester</option>
            </select>
          </div>
          <Button type="submit" disabled={saving} className="w-full md:w-auto">
            {saving ? "Updating..." : "Activate Now"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
