'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ApiClient, StudentData } from '@/lib/api';

type StaffRole = 'lecturer' | 'deo' | 'hod' | 'dean' | 'registrar' | 'admissions_officer' | 'ict_director';

interface User {
  id: number;
  name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  phone_number?: string;
  username?: string;
  role: 'applicant' | 'admin' | 'student' | StaffRole;
}

export const STAFF_ROLES: string[] = ['lecturer', 'deo', 'hod', 'dean', 'registrar', 'admissions_officer'];

export interface ApplicantData {
  id: number;
  program_id: number;
  application_status: string;
  admission_status: string;
}

export interface ApiResponse {
  user: User;
  token: string;
  applicant?: ApplicantData;
  student?: StudentData;
}

interface PortalStatus {
  locked: boolean;
  programsLocked: number;
}

interface AuthContextType {
  user: User | null;
  applicant: ApplicantData | null;
  student: StudentData | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signup: (first_name: string, last_name: string, email: string, password: string, phone_number: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  error: string | null;
  portalStatus: PortalStatus | null;
  isPortalLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize from localStorage for instant UI responsiveness
  const getStoredUser = () => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem('auth_user');
    try { return stored ? JSON.parse(stored) : null; } catch { return null; }
  };

  const storedUser = getStoredUser();
  const [user, setUser] = useState<User | null>(storedUser);
  const [applicant, setApplicant] = useState<ApplicantData | null>(null);
  const [student, setStudent] = useState<StudentData | null>(null);
  
  // Initialize as loading to ensure verifyToken completes before auto-redirects
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [portalStatus, setPortalStatus] = useState<PortalStatus | null>(null);
  const [isPortalLoading, setIsPortalLoading] = useState(true);

  const saveUserAndRole = (u: User | null) => {
    setUser(u);
    if (u) {
      localStorage.setItem('auth_user', JSON.stringify(u));
    } else {
      localStorage.removeItem('auth_user');
    }
  };

  useEffect(() => {
    const token = ApiClient.getToken();
    if (token) {
      verifyToken();
    } else {
      setIsLoading(false);
      localStorage.removeItem('auth_user');
    }
    fetchPortalStatus();
  }, []);

  const fetchPortalStatus = async () => {
    try {
      const { data } = await ApiClient.fetch<any>("/applicant/programs");
      const programsLocked = data.programs?.filter((p: any) => p.is_locked)?.length || 0;
      setPortalStatus({
        locked: data.global_admission_locked,
        programsLocked: programsLocked
      });
    } catch (err) {
      console.error('Failed to fetch portal status:', err);
    } finally {
      setIsPortalLoading(false);
    }
  };

  const verifyToken = useCallback(async () => {
    try {
      const response = await ApiClient.verifyToken() as { token?: string; user: User; student?: StudentData; applicant?: ApplicantData };
      // Save fresh token if backend returned one (role may have changed e.g. freshapplicant→applicant)
      if (response.token) {
        ApiClient.setToken(response.token);
      }
      saveUserAndRole(response.user);
      
      if (response.applicant) {
        setApplicant(response.applicant);
        setStudent(null);
      } else if (response.student) {
        setStudent(response.student);
        setApplicant(null);
      } else {
        setApplicant(null);
        setStudent(null);
      }
    } catch (err) {
      ApiClient.setToken(null);
      saveUserAndRole(null);
      setApplicant(null);
      setStudent(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signup = useCallback(
    async (first_name: string, last_name: string, email: string, password: string, phone_number: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await ApiClient.signup(first_name, last_name, email, password, phone_number) as ApiResponse;
        ApiClient.setToken(response.token);
        saveUserAndRole(response.user);
        if (response.applicant) {
          setApplicant(response.applicant);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Signup failed';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await ApiClient.login(email, password) as ApiResponse;
      ApiClient.setToken(response.token);
      saveUserAndRole(response.user);
      if (response.applicant) {
        setApplicant(response.applicant);
      }
      if (response.student) {
        setStudent(response.student);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await ApiClient.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      ApiClient.setToken(null);
      saveUserAndRole(null);
      setApplicant(null);
      setStudent(null);
      setError(null);
      setIsLoading(false);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      if (user?.role === 'applicant') {
        const status = await ApiClient.getApplicantStatus();
        setApplicant(status.applicant);
      } else if (user?.role === 'student') {
        const response = await ApiClient.verifyToken() as { user: User; student?: StudentData };
        if (response.student) setStudent(response.student);
      }
    } catch (err) {
      console.error('Error refreshing status:', err);
    }
  }, [user]);

  const value: AuthContextType = {
    user,
    applicant,
    student,
    isLoading,
    isAuthenticated: !!user,
    signup,
    login,
    logout,
    refreshStatus,
    error,
    portalStatus,
    isPortalLoading
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
