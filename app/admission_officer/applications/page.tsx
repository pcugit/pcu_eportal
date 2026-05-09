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
import { LogOut, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Application {
  id: number;
  user_id: number;
  name: string;
  email: string;
  phone_number: string;
  program_id: number;
  program_name: string;
  application_status: string;
  admission_status: string;
  submitted_at: string;
  form_no?: string;
  session?: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  submitted: "bg-blue-100 text-blue-800",
  screening: "bg-purple-100 text-purple-800",
  admitted: "bg-green-100 text-green-800",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
};

export default function ApplicationsPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("submitted");

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "admissionofficer") {
      router.replace("/staff/login");
      return;
    }

    loadApplications();
  }, [isAuthenticated, user, router, status]);

  const loadApplications = async () => {
    setLoading(true);
    try {
      const response = await ApiClient.getApplications(status);
      setApplications((response.applications as any as Application[]) || []);
    } catch (err) {
      console.error("Error loading applications:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/staff/login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Link
              href="/admission_officer/dashboard"
              className="text-primary hover:underline text-sm mb-2 block"
            >
              ← Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Applications
            </h1>
            <p className="text-muted-foreground">
              Review and manage applicant submissions
            </p>
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="screening">Under Review</SelectItem>
              <SelectItem value="admitted">Admitted</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Applications List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading applications...</p>
          </div>
        ) : applications.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No applications found for this status
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {applications.map((app) => (
              <Link key={app.id} href={`/admission_officer/application/${app.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{app.name}</h3>
                          <Badge
                            className={statusColors[app.application_status] || 'bg-slate-100 text-slate-700'}
                          >
                            {app.application_status === 'accepted' ? 'Admitted' : app.application_status.replace('_', ' ')}
                          </Badge>
                          {/* Fee status pill — only shown on admitted tab */}
                          {status === 'admitted' && (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              app.application_status === 'accepted'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}>
                              {app.application_status === 'accepted' ? '✓ Fee Paid' : '⏳ Awaiting Fee'}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                          <div>
                            <p className="text-xs uppercase tracking-wide">
                              Form No
                            </p>
                            <p className="font-medium text-foreground">
                              {app.form_no || "N/A"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide">
                              Applicant Name
                            </p>
                            <p className="font-medium text-foreground">
                              {app.name}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide">
                              Program Type
                            </p>
                            <p className="font-medium text-foreground">
                              {app.program_name}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide">
                              Session
                            </p>
                            <p className="font-medium text-foreground">
                              {app.session || "N/A"}
                            </p>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground ml-4" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
