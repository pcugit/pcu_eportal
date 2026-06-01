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
import { LogOut, Lock, Unlock, ShieldCheck, ArrowLeft, Settings } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const SETTING_LABELS: Record<string, string> = {
  admission_registration_locked: "Global Admissions Lock",
  undergraduate_admission_locked: "Undergraduate Admission",
  postgraduate_admission_locked: "Postgraduate Admission",
  part_time_admission_locked: "Part Time Admission",
  jupeb_admission_locked: "JUPEB Admission",
  course_registration_locked: "Course Registration Lock",
  result_upload_locked: "Result Upload Lock",
};

// Keys to exclude from the general switch list (because they are handled by specialized managers)
const EXCLUDED_SETTING_KEYS = ["current_academic_session", "current_semester"];

export default function ICTSettings() {
  const router = useRouter();
  const { user, isAuthenticated, logout, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<any[]>([]);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || (user?.role !== "admin" && user?.role !== "ict_director")) {
      router.replace("/staff/login");
      return;
    }

    loadSettings();
  }, [isAuthenticated, user, router]);

  const loadSettings = async () => {
    try {
      const response = await ApiClient.fetch<any>("/settings/all");
      const allFetched = response.data?.settings || [];
      
      // Filter out excluded keys first
      const fetched = allFetched.filter((s: any) => !EXCLUDED_SETTING_KEYS.includes(s.key));

      if (fetched.length > 0) {
        // Try to order by SETTING_LABELS
        const ordered = Object.keys(SETTING_LABELS)
          .map(key => fetched.find((s: any) => s.key === key))
          .filter(Boolean);
        
        // Combine ordered with any other settings found in DB but not in our label map
        const others = fetched.filter((s: any) => !Object.keys(SETTING_LABELS).includes(s.key));
        
        setSettings([...ordered, ...others]);
      } else {
        setSettings([]);
      }
    } catch (err) {
      console.error("Error loading settings:", err);
      setSettings([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSetting = async (key: string, currentValue: string) => {
    setUpdating(true);
    const newValue = currentValue === "true" ? "false" : "true";
    try {
      await ApiClient.fetch<any>("/settings/update", {
        method: "POST",
        body: JSON.stringify({ key, value: newValue }),
      });
      setSettings(prev => prev.map(s => s.key === key ? { ...s, value: newValue } : s));
    } catch (err) {
      console.error("Error updating setting:", err);
    } finally {
      setUpdating(false);
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
          <p className="text-muted-foreground">Loading Settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2 flex items-center gap-3">
             <Settings className="h-8 w-8 text-slate-700" />
             System Settings & Portal Controls
          </h1>
          <p className="text-slate-500">
            Globally manage academic sessions and toggle portal functionalities.
          </p>
        </div>

        {/* Dynamic Academic Session Manager */}
        <div className="mb-8">
            <AcademicSessionManager onSuccess={loadSettings} />
        </div>

        <Card className="border-l-4 border-l-orange-500 shadow-sm overflow-hidden">
          <CardHeader className="bg-white border-b border-slate-50">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-orange-600" />
              <CardTitle className="text-xl">Global Portal Controls</CardTitle>
            </div>
            <CardDescription>
              Major system switches for admissions, registration, and result uploads.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 bg-white">
            <div className="divide-y divide-slate-100">
              {settings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No settings found in system.</p>
              ) : (
                settings.map((setting) => (
                  <div key={setting.key} className="flex items-center justify-between p-6 hover:bg-slate-50/50 transition-colors">
                    <div className="space-y-1 pr-8">
                      <Label className="text-base font-bold text-slate-900 block">
                        {SETTING_LABELS[setting.key] || setting.key.replace(/_/g, " ")}
                      </Label>
                      <p className="text-sm text-slate-500 leading-relaxed max-w-xl">
                        {setting.description || "No description provided for this system setting."}
                      </p>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <Badge className={`${setting.value === "true" ? "bg-red-100 text-red-700 border-red-200" : "bg-green-100 text-green-700 border-green-200"} px-3 py-1`}>
                           {setting.value === "true" ? <Lock className="h-3.5 w-3.5 mr-1.5" /> : <Unlock className="h-3.5 w-3.5 mr-1.5" />}
                           {setting.value === "true" ? "LOCKED" : "ACTIVE"}
                        </Badge>
                      </div>
                      <Switch
                        checked={setting.value === "true"}
                        onCheckedChange={() => handleToggleSetting(setting.key, setting.value)}
                        disabled={updating}
                        className="data-[state=checked]:bg-red-500"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 p-6 bg-blue-50 border border-blue-100 rounded-xl flex gap-4">
           <div className="text-blue-600">
             <ShieldCheck className="h-6 w-6" />
           </div>
           <div>
             <p className="text-sm text-blue-700 leading-relaxed">
               All changes made here are logged with your administrative ID. Toggling these settings affects all users across their respective portals.
             </p>
           </div>
        </div>
      </div>
    </div>
  );
}
function AcademicSessionManager({ onSuccess }: { onSuccess?: () => void }) {
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
      if (onSuccess) onSuccess();
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
          <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90">
            {saving ? "Updating..." : "Activate Now"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
