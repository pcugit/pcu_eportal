"use client";

import React, { useState } from "react";
import { ApiClient } from "@/lib/api";
import { 
  Lock, 
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function ChangePasswordPage() {
  const [formData, setFormData] = useState({
    new_password: "",
    confirm_password: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (formData.new_password !== formData.confirm_password) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    setLoading(true);
    try {
      // Sending empty current_password since UI was removed per user request
      await ApiClient.changePassword("", formData.new_password);
      setMessage({ type: 'success', text: 'Password successfully updated' });
      setFormData({ new_password: "", confirm_password: "" });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Update failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white border-slate-100 shadow-2xl rounded-3xl overflow-hidden">
        <div className="bg-[#6b21a8] p-6 flex items-center gap-3 text-white">
          <Lock size={20} />
          <h2 className="font-bold">Reset Password</h2>
        </div>

        <form noValidate onSubmit={handleSubmit} className="p-8 space-y-5">
          {message && (
            <div className={cn(
              "p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2",
              message.type === 'success' ? "bg-green-50 text-green-700 border border-green-100" : "bg-red-50 text-red-700 border border-red-100"
            )}>
              {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <p className="text-sm font-bold">{message.text}</p>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">New Password</label>
              <Input 
                type="password"
                disabled={loading}
                required
                placeholder="••••••••"
                className="h-12 bg-slate-50 border-slate-100 focus:ring-[#6b21a8] rounded-xl font-medium"
                value={formData.new_password}
                onChange={(e) => setFormData({...formData, new_password: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Confirm Password</label>
              <Input 
                type="password"
                disabled={loading}
                required
                placeholder="••••••••"
                className="h-12 bg-slate-50 border-slate-100 focus:ring-[#6b21a8] rounded-xl font-medium"
                value={formData.confirm_password}
                onChange={(e) => setFormData({...formData, confirm_password: e.target.value})}
              />
            </div>
          </div>

          <Button 
            type="submit" 
            disabled={loading}
            className="w-full h-12 bg-slate-900 hover:bg-slate-800 transition-all rounded-xl text-white font-black uppercase tracking-widest mt-2"
          >
            {loading ? "Updating..." : "Update Password"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
