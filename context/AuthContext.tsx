"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { ApiClient, StudentData } from "@/lib/api";

type StaffRole =
  | "lecturer"
  | "deo"
  | "hod"
  | "dean"
  | "pgdean"
  | "registrar"
  | "admissionofficer"
  | "ictdirector"
  | "ict_director"
  | "admin"
  | "freshapplicant";

interface User {
  id: number;
  name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  phone_number?: string;
  username?: string;
  role: "applicant" | "admitted" | "admin" | "student" | StaffRole;
}

export const STAFF_ROLES: string[] = [
  "lecturer",
  "deo",
  "hod",
  "dean",
  "pgdean",
  "registrar",
  "freshapplicant",
  "admissionofficer",
  "ictdirector",
  "ict_director",
  "admin",
];

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
  signup: (
    first_name: string,
    last_name: string,
    email: string,
    password: string,
    phone_number: string,
  ) => Promise<void>;
  login: (email: string, password: string, portal?: "applicant" | "student") => Promise<void>;
  logout: (redirectUrl?: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
  error: string | null;
  portalStatus: PortalStatus | null;
  isPortalLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // IMPORTANT: Do NOT hydrate `user` from localStorage.
  // That old pattern made `isAuthenticated` true before verifyToken completed,
  // causing dashboard pages to render their shell for expired sessions.
  // The cached user is only used to decide whether to call verifyToken.
  const [user, setUser] = useState<User | null>(null);
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
      localStorage.setItem("auth_user", JSON.stringify(u));
    } else {
      localStorage.removeItem("auth_user");
      localStorage.removeItem("last_active");
    }
  };

  // ─── Inactivity timeout (15 minutes) ───────────────────────────────────────
  const INACTIVITY_LIMIT = 15 * 60 * 1000; // 15 minutes in ms
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    localStorage.setItem("last_active", Date.now().toString());
    inactivityTimer.current = setTimeout(() => {
      window.alert(
        "Your session has expired due to 15 minutes of inactivity. Please sign in again.",
      );

      // Auto-logout on inactivity
      ApiClient.setToken(null);
      localStorage.removeItem("auth_user");
      localStorage.removeItem("last_active");

      let finalUrl = "/";
      if (user?.role === "student") {
        finalUrl = "/student/login";
      } else if (
        user?.role === "applicant" ||
        user?.role === "freshapplicant" ||
        user?.role === "admitted"
      ) {
        finalUrl = "/auth/login";
      }

      let redirectPath = finalUrl;
      // Handle Next.js basePath configuration for hard reloads
      if (window.location.pathname.startsWith("/e-portal")) {
        redirectPath = `/e-portal${finalUrl === "/" ? "" : finalUrl}`;
      }

      window.location.href = redirectPath || "/";
    }, INACTIVITY_LIMIT);
  }, [user?.role]);

  // Attach activity listeners when user is authenticated
  useEffect(() => {
    const activityEvents = [
      "mousemove",
      "keydown",
      "click",
      "touchstart",
      "scroll",
    ];
    const handler = () => resetInactivityTimer();

    if (user) {
      activityEvents.forEach((e) =>
        window.addEventListener(e, handler, { passive: true }),
      );
      resetInactivityTimer(); // start the timer immediately on login / page load
    } else {
      // Clear timer when not authenticated
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    }

    return () => {
      activityEvents.forEach((e) => window.removeEventListener(e, handler));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [user, resetInactivityTimer]);

  useEffect(() => {
    const token = ApiClient.getToken();
    if (token) {
      // Check if the session was already stale before loading the page
      const lastActive = localStorage.getItem("last_active");
      if (
        lastActive &&
        Date.now() - parseInt(lastActive, 10) > INACTIVITY_LIMIT
      ) {
        // Session expired while browser was closed — clear everything and don't verify
        ApiClient.setToken(null);
        saveUserAndRole(null);
        setApplicant(null);
        setStudent(null);
        setIsLoading(false);
      } else {
        verifyToken();
      }
    } else {
      // No token at all — ensure stale cached user is also cleared
      saveUserAndRole(null);
      setIsLoading(false);
    }
    fetchPortalStatus();
  }, []);

  const fetchPortalStatus = async () => {
    try {
      const { data } = await ApiClient.fetch<any>("/applicant/programs");
      const programsLocked =
        data.programs?.filter((p: any) => p.is_locked)?.length || 0;
      setPortalStatus({
        locked: data.global_admission_locked,
        programsLocked: programsLocked,
      });
    } catch (err) {
      console.error("Failed to fetch portal status:", err);
    } finally {
      setIsPortalLoading(false);
    }
  };

  const verifyToken = useCallback(async () => {
    try {
      const response = (await ApiClient.verifyToken()) as {
        token?: string;
        user: User;
        student?: StudentData;
        applicant?: ApplicantData;
      };
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
    async (
      first_name: string,
      last_name: string,
      email: string,
      password: string,
      phone_number: string,
    ) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = (await ApiClient.signup(
          first_name,
          last_name,
          email,
          password,
          phone_number,
        )) as ApiResponse;
        ApiClient.setToken(response.token);
        saveUserAndRole(response.user);
        if (response.applicant) {
          setApplicant(response.applicant);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Signup failed";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const login = useCallback(async (email: string, password: string, portal?: 'applicant' | 'student') => {
    setIsLoading(true);
    setError(null);
    try {
      const response = (await ApiClient.login(email, password, portal)) as ApiResponse;
      ApiClient.setToken(response.token);
      saveUserAndRole(response.user);
      if (response.applicant) {
        setApplicant(response.applicant);
      }
      if (response.student) {
        setStudent(response.student);
      }

      // ── Background warm-up: pre-fetch all applicant form data immediately
      // after login so the ApiClient cache is hot before the dashboard mounts.
      // Only runs for applicants who have paid — freshapplicants have no forms.
      const role = response.user?.role;
      if (role === "applicant") {
        Promise.resolve().then(async () => {
          try {
            // 1. Get the list of applications (also warms the status cache)
            const statusRes = await ApiClient.getApplicantStatus();
            const apps = statusRes?.applicants || [];

            // 2. Warm form data + template for every application in parallel
            if (apps.length > 0) {
              await Promise.all(
                apps.map((app: any) =>
                  Promise.all([
                    ApiClient.getForm(app.id).catch(() => null),
                    ApiClient.getFormTemplate(app.program_type_id).catch(
                      () => null,
                    ),
                  ]),
                ),
              );
            }
          } catch {
            // Silently ignore — the dashboard will fall back to its own fetch
          }
        });
      }
    } catch (err: any) {
      let message = "Login failed";
      if (err instanceof Error) {
        message = err.message;
      }
      // Check for locked_until in the error response data
      const responseData = err?.response;
      if (responseData?.locked_until) {
        const unlockTime = new Date(responseData.locked_until).toLocaleString();
        message = `Account temporarily locked due to too many failed login attempts. Try again after ${unlockTime}.`;
      }
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(
    async (redirectUrl?: string) => {
      let finalUrl = redirectUrl;
      if (!finalUrl) {
        const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
        const isStudentPath = currentPath.includes("/student");
        const isApplicantPath = currentPath.includes("/applicant") || currentPath.includes("/auth");
        const isStaffPath = [
          "/admission_officer",
          "/dean",
          "/pgdean",
          "/deo",
          "/hod",
          "/ict",
          "/lecturer",
          "/registrar",
          "/staff"
        ].some(p => currentPath.includes(p));

        if (isStudentPath) {
          finalUrl = "/student/login";
        } else if (isApplicantPath) {
          finalUrl = "/auth/login";
        } else if (isStaffPath) {
          finalUrl = "/staff/login";
        } else {
          finalUrl = "/";
        }
      }

      try {
        await ApiClient.logout();
      } catch (err) {
        console.error("Logout error:", err);
      } finally {
        ApiClient.setToken(null);
        localStorage.removeItem("auth_user");
        localStorage.removeItem("last_active");

        let redirectPath = finalUrl;
        // Handle Next.js basePath configuration for hard reloads
        if (window.location.pathname.startsWith("/e-portal")) {
          redirectPath = `/e-portal${finalUrl === "/" ? "" : finalUrl}`;
        }

        window.location.href = redirectPath || "/";
      }
    },
    [user?.role],
  );

  const refreshStatus = useCallback(async () => {
    try {
      if (user?.role === "freshapplicant" || user?.role === "applicant" || user?.role === "admitted") {
        const response = (await ApiClient.verifyToken()) as {
          token?: string;
          user: User;
          student?: StudentData;
          applicant?: ApplicantData;
        };
        if (response.token) {
          ApiClient.setToken(response.token);
        }
        saveUserAndRole(response.user);
        if (response.student) {
          setStudent(response.student);
          setApplicant(null);
        } else {
          const status = await ApiClient.getApplicantStatus();
          setApplicant(status.applicant);
        }
      } else if (user?.role === "student") {
        const response = (await ApiClient.verifyToken()) as {
          user: User;
          student?: StudentData;
        };
        if (response.student) setStudent(response.student);
      }
    } catch (err) {
      console.error("Error refreshing status:", err);
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
    isPortalLoading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
