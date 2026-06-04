"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { ApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export default function FirstLoginPasswordChange({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { refreshStatus } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await ApiClient.changePassword("", newPassword);
      setSuccess(true);
      setTimeout(async () => {
        try {
          await refreshStatus();
        } catch (refreshErr) {
          console.error("Failed to refresh status after password change:", refreshErr);
        }
        onComplete();
      }, 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to change password",
      );
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto border-primary/20 shadow-xl">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">
          Change your password
        </CardTitle>
      </CardHeader>
      <form noValidate onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-100 text-green-800 text-sm p-3 rounded-lg flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Password changed successfully! Redirecting...
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              disabled={loading || success}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading || success}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            className="w-full"
            disabled={loading || success}
          >
            {loading ? "Updating..." : "Update Password & Continue"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
