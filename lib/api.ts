const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/e-portal/api";

export interface ApiResponse<T> {
  data?: T;
  message?: string;
  error?: string;
  [key: string]: any;
}

export interface ApplicantStatus {
  id: number;
  program_id: number;
  program_type_id: number;
  program_name: string;
  degree_code?: string | null;
  approved_course?: string | null;
  finalised_course?: string | null;
  applicant_recommended_course?: string | null;
  form_no: string | null;
  matric_no: string | null;
  application_status: string;
  admission_status: string;
  has_paid_application_fee: boolean;
  /** True when the stored reference has tran_status IN ('pending','requery_error').
   *  Distinguishes "payment still processing" from "payment failed/not started". */
  has_pending_application_payment: boolean;
  has_paid_acceptance_fee: boolean;
  has_paid_tuition: boolean;
  admission_letter_sent: boolean;
  submitted_at: string | null;
  created_at: string;
  user_name: string;
  program_session: string;
  recommended_course_response?: string | null;
  accepted_recommended_program_id?: number | null;
}

export interface StudentData {
  id: number;
  matric_number: string;
  program_id: number;
  program_name?: string;
  current_level: string;
  session: string;
  is_first_login: boolean;
}

export interface CourseData {
  id: number;
  course_code: string;
  course_title: string;
  credit_units: number;
  category: string;
  remark: string | null;
  lecturer: string | null;
  semester?: string | null;
}

export interface CourseRegistrationResponse {
  courses: CourseData[];
  registration_status: string | null;
  registered_course_ids: number[];
  student: StudentData;
  registration_deadline: string | null;
  is_global_locked?: boolean;
}

// ===== Letter Management Types =====

export interface FacultyDepartmentsResponse {
  faculties: {
    [faculty: string]: Array<{
      name: string;
      pending_count: number;
    }>;
  };
}

export interface DepartmentApplicant {
  id: number;
  name: string;
  email: string;
  program_name: string;
}

export interface DepartmentApplicantsResponse {
  applicants: DepartmentApplicant[];
}

export interface LetterStatus {
  applicant_id: number;
  name: string;
  email: string;
  program: string;
  status: "pending" | "sent" | "failed";
  sent_at: string | null;
  error_message: string | null;
  retry_count: number;
  form_no?: string | null;
  course?: string | null;
}

export interface LetterStatusSummaryResponse {
  sent: LetterStatus[];
  failed: LetterStatus[];
}

export interface SendDepartmentLettersResponse {
  sent: number;
  failed: number;
}
export interface Application {
  id: number;
  name: string;
  email: string;
  program_name: string;
  application_status: string;
}

export interface LetterTemplate {
  id: string;
  name: string;
  description?: string;
  mode?: string | null;
}

export interface SendResult {
  total_requested: number;
  letters_created: number;
  errors: number;
  created: Array<{ applicant_id: number; letter_id: number }>;
  failed: Array<{ applicant_id: number; error: string }>;
}

export interface AdmissionLetterData {
  candidateName: string;
  programme: string;
  level: string;
  department: string;
  faculty: string;
  session: string;
  mode: string;
  date: string;
  resumptionDate: string;
  acceptanceFee: string;
  tuition: string;
  otherFees: string;
  reference: string;
}

export interface PaymentTransaction {
  transaction_id: string;
  payment_type: string;
  amount: number;
  is_successful: boolean;
  reference_no: string;
  receipt_no: string;
  created_at: string | null;
  client_name?: string;
  tran_status?: string;
  installment_plan_id?: number | null;
}

export interface Recommendation {
  review_id: number;
  program_id: number;
  program_name: string;
  review_notes: string;
  reviewed_by: string;
  reviewed_at: string | null;
  response: string | null;
  is_accepted: boolean | null;
}

export interface RecommendationResponse {
  recommendations: Recommendation[];
  total_recommendations: number;
}

// ===== New Schema Interfaces =====

export interface Faculty {
  id: number;
  name: string;
  code: string;
}

export interface Department {
  id: number;
  name: string;
  code: string;
  faculty_id: number;
  faculty_name: string;
}

export interface ProgramType {
  id: number;
  name: string;
}

export interface InstallmentPlan {
  id: number;
  label: string;
  name: string;
  percentage: number;
}

export interface Program {
  id: number;
  name: string;
  description: string;
  level: string;
  session: string;
  department: string;
  faculty: string;
  mode: string;
  acceptance_fee?: number;
  tuition_fee?: number;
  other_fees?: number;
  registration_deadline?: string | null;
  is_locked?: boolean;
}

export interface StudentProfile {
  id: number;
  matric_number: string;
  current_level: string;
  session: string;
  is_first_login: boolean;
  name: string;
  email: string;
  phone_number: string;
  program_name: string;
  program_type: string;
  department: string;
  faculty: string;
}

export class ApiClient {
  static getBaseUrl() {
    return API_BASE_URL;
  }

  private static token: string | null = null;
  private static cache = new Map<string, { data: any; timestamp: number }>();
  private static inFlight = new Map<
    string,
    Promise<{ data: any; status: number }>
  >();
  private static CACHE_TTL = 10 * 60 * 1000; // 10 minutes — form data rarely changes mid-session

  static clearCache() {
    this.cache.clear();
  }

  static setToken(token: string | null) {
    this.token = token;
    if (typeof window !== "undefined") {
      if (token) {
        localStorage.setItem("auth_token", token);
      } else {
        localStorage.removeItem("auth_token");
      }
    }
  }

  static getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("auth_token");
    }
    return this.token;
  }

  public static async fetch<T = any>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<{ data: T; status: number }> {
    const isGet = !options.method || options.method === "GET";
    const cacheKey = `${isGet ? "GET" : options.method}:${endpoint}`;

    // Return cached data if available and not expired
    if (isGet && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < this.CACHE_TTL) {
        return { data: cached.data as T, status: 200 };
      }
      this.cache.delete(cacheKey); // Expired
    }

    // Return in-flight promise if the exact same GET request is already active
    if (isGet && this.inFlight.has(cacheKey)) {
      return this.inFlight.get(cacheKey) as Promise<{
        data: T;
        status: number;
      }>;
    }

    const promise = (async () => {
      const token = this.getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
      };

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();
      const status = response.status;

      // ── Global 401 interceptor ──────────────────────────────────────
      // If the JWT has expired or is invalid, clear all auth state and
      // redirect to login. Skip auth endpoints (they return 401 for
      // invalid credentials, not expired tokens).
      const isAuthEndpoint =
        endpoint.startsWith("/auth/login") ||
        endpoint.startsWith("/auth/signup");
      if (response.status === 401 && !isAuthEndpoint) {
        this.setToken(null);
        this.clearCache();
        if (typeof window !== "undefined") {
          localStorage.removeItem("auth_user");
          localStorage.removeItem("last_active");

          // Determine the correct login page based on current path
          const currentPath = window.location.pathname;
          let loginPath = "/auth/login";
          if (currentPath.includes("/student")) {
            loginPath = "/student/login";
          } else if (
            [
              "/admission_officer",
              "/dean",
              "/deo",
              "/hod",
              "/ict",
              "/lecturer",
              "/registrar",
              "/staff",
            ].some((p) => currentPath.includes(p))
          ) {
            loginPath = "/staff/login";
          }

          // Handle basePath
          if (currentPath.startsWith("/e-portal")) {
            loginPath = `/e-portal${loginPath}`;
          }

          window.location.href = loginPath;
        }
        const error: any = new Error("Session expired. Please log in again.");
        error.response = data;
        throw error;
      }

      // Clear cache on mutations to ensure fresh data, even if the request failed
      if (!isGet) {
        this.clearCache();
      }

      if (!response.ok) {
        const error: any = new Error(data.message || "API request failed");
        error.response = data;
        throw error;
      }

      // Cache successful GET results
      if (isGet) {
        this.cache.set(cacheKey, { data, timestamp: Date.now() });
      }

      return { data: data as T, status };
    })();

    if (isGet) {
      this.inFlight.set(cacheKey, promise);
      // Clean up from inFlight map once resolved or failed
      promise.then(
        () => {
          this.inFlight.delete(cacheKey);
        },
        () => {
          this.inFlight.delete(cacheKey);
        },
      );
    }

    return promise;
  }

  // Auth endpoints
  static async signup(
    first_name: string,
    last_name: string,
    email: string,
    password: string,
    phone_number: string,
  ) {
    const { data } = await this.fetch("/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        first_name,
        last_name,
        email,
        password,
        phone_number,
      }),
    });
    return data;
  }

  static async login(email: string, password: string, portal?: string) {
    const { data } = await this.fetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, portal }),
    });
    return data;
  }

  static async changePassword(current_password: string, new_password: string) {
    const { data } = await this.fetch("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    });
    return data;
  }

  static async verifyToken() {
    const { data } = await this.fetch("/auth/verify-token", {
      method: "GET",
    });
    return data;
  }

  static async logout() {
    const { data } = await this.fetch("/auth/logout", {
      method: "POST",
    });
    return data;
  }

  // Health endpoint for keeping Render server active
  static async healthCheck() {
    const { data } = await this.fetch("/health", {
      method: "GET",
    });
    return data;
  }

  // Applicant endpoints
  static async getProgramTypes(): Promise<{ program_types: ProgramType[] }> {
    const { data } = await this.fetch<{ program_types: ProgramType[] }>(
      "/applicant/program-types",
    );
    return data;
  }

  static async getOlevelData() {
    const { data } = await this.fetch<any>("/applicant/olevel-data");
    return data;
  }

  static async getPrograms(program_type_id?: number) {
    const qs = program_type_id ? `?program_type_id=${program_type_id}` : "";
    const { data } = await this.fetch(`/applicant/programs${qs}`);
    return data;
  }

  static async getFormTemplate(program_id: number) {
    const { data } = await this.fetch(`/applicant/form/${program_id}`);
    return data;
  }

  static async submitForm(formData: any) {
    // Backend expects standard form fields via request.form,
    // so we must send a FormData/multipart request (NOT JSON).
    const fd = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        fd.append(key, String(value));
      }
    });

    const token = this.getToken();
    const headers: HeadersInit = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/applicant/submit-form`, {
      method: "POST",
      headers,
      body: fd,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to save application form");
    }

    return data;
  }

  static async uploadDocument(
    file: File,
    form_id: number,
    document_type: string,
    display_name?: string,
  ) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("form_id", form_id.toString());
    formData.append("document_type", document_type);
    if (display_name) {
      formData.append("display_name", display_name);
    }

    const token = this.getToken();
    const headers: HeadersInit = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/applicant/upload-document`, {
      method: "POST",
      headers,
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Upload failed");
    }

    return data;
  }

  static async scanDocument(file: File): Promise<{
    quality_score: number;
    is_acceptable: boolean;
    issues: string[];
    sharpness: number;
    brightness: number;
    original_b64: string;
    preview_b64: string;
    skip_scan?: boolean;
    message?: string;
  }> {
    const formData = new FormData();
    formData.append("file", file);

    const token = this.getToken();
    const headers: HeadersInit = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}/applicant/scan-document`, {
      method: "POST",
      headers,
      body: formData,
    });

    const data = await response.json();
    if (!response.ok && !data.skip_scan) {
      throw new Error(data.message || "Scan failed");
    }
    return data;
  }

  static async deleteDocument(document_id: number) {
    const { data } = await this.fetch(
      `/applicant/delete-document/${document_id}`,
      {
        method: "DELETE",
      },
    );
    return data;
  }

  static async getForm(applicant_id: number) {
    const { data } = await this.fetch(`/applicant/get-form/${applicant_id}`);
    return data;
  }

  static async getAcceptanceFee(): Promise<{
    acceptance_fee: number;
    processing_fee: number;
    fee_name: string;
    found: boolean;
    message?: string;
  }> {
    const { data } = await this.fetch<{
      acceptance_fee: number;
      processing_fee: number;
      fee_name: string;
      found: boolean;
      message?: string;
    }>("/applicant/acceptance-fee");
    return data;
  }

  static async getTuitionBreakdown(): Promise<{
    components: { name: string; amount: number }[];
    total: number;
    processing_fee: number;
    found: boolean;
    message?: string;
  }> {
    const { data } = await this.fetch<{
      components: { name: string; amount: number }[];
      total: number;
      processing_fee: number;
      found: boolean;
      message?: string;
    }>("/applicant/tuition-fee-breakdown");
    return data;
  }

  static async getInstallmentPlans(): Promise<{
    installment_plans: InstallmentPlan[];
  }> {
    const { data } = await this.fetch<{ installment_plans: InstallmentPlan[] }>(
      "/applicant/installment-plans",
    );
    return data;
  }

  static async getProcessingFee(): Promise<{
    processing_fee: number;
  }> {
    const { data } = await this.fetch<{ processing_fee: number }>(
      "/applicant/processing-fee",
    );
    return data;
  }

  static async submitApplication(applicant_id: number) {
    const { data } = await this.fetch("/applicant/submit-application", {
      method: "POST",
      body: JSON.stringify({ applicant_id }),
    });
    return data;
  }

  static async previewAdmissionLetter(
    applicantId: number,
    admissionDate?: string,
    templateId?: string,
  ) {
    const token = this.getToken();
    const res = await fetch(
      `${API_BASE_URL}/admission_officer/preview-admission-letter`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          applicant_id: applicantId,
          admission_date: admissionDate,
          template_id: templateId,
        }),
      },
    );

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Preview request failed: ${res.status} ${txt}`);
    }

    const blob = await res.blob();
    return blob;
  }

  static async getApplicantStatus(): Promise<{
    applicant: ApplicantStatus;
    applicants: ApplicantStatus[];
  }> {
    const { data } = await this.fetch<{
      applicant: ApplicantStatus;
      applicants: ApplicantStatus[];
    }>("/applicant/get-applicant-status");
    return data;
  }

  static async getAdmissionLetter(): Promise<AdmissionLetterData> {
    const { data } = await this.fetch<AdmissionLetterData>(
      "/applicant/admission-letter",
    );
    return data;
  }

  static async printAdmissionLetterPDF(): Promise<Blob> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      ...(token && { Authorization: `Bearer ${token}` }),
    };

    const response = await fetch(
      `${API_BASE_URL}/applicant/print-admission-letter`,
      {
        method: "POST",
        headers,
      },
    );

    if (!response.ok) {
      throw new Error("Failed to generate PDF");
    }

    return await response.blob();
  }

  // Payment endpoints

  /**
   * Step 1 — Initiate an Interswitch redirect payment.
   * Returns the redirect URL that sends the user to Quickteller Webpay.
   * Server-side verification is always done via verifyPayment() after redirect.
   */
  static async initiatePayment(
    payment_type: "application_fee" | "acceptance_fee" | "tuition",
    program_type_id?: number,
    fee_component_id?: number,
    installment_plan_id?: number,
  ): Promise<{
    reference_no: string;
    amount: number;
    amount_kobo: number;
    processing_fee: number;
    pay_item_id: string;
    merchant_code: string;
    customer_name: string;
    customer_email: string;
    redirect_url: string;
  }> {
    const { data } = await this.fetch<{
      reference_no: string;
      amount: number;
      amount_kobo: number;
      processing_fee: number;
      pay_item_id: string;
      merchant_code: string;
      customer_name: string;
      customer_email: string;
      redirect_url: string;
    }>("/applicant/initiate-payment", {
      method: "POST",
      body: JSON.stringify({
        payment_type,
        program_type_id,
        fee_component_id,
        installment_plan_id,
      }),
    });
    return data;
  }

  /**
   * Step 2 — Verify payment after Interswitch redirects back.
   * Call this from the /applicant/payment/callback page.
   * payment_type is resolved server-side from the transaction record.
   */
  static async verifyPayment(reference_no: string): Promise<{
    tran_status: string;
    response_code: string;
    response_desc: string;
    is_successful: boolean;
    amount: number;
    reference_no: string;
    receipt_no: string;
    payment_type: string;
  }> {
    const { data } = await this.fetch<{
      tran_status: string;
      response_code: string;
      response_desc: string;
      is_successful: boolean;
      amount: number;
      reference_no: string;
      receipt_no: string;
      payment_type: string;
    }>("/applicant/verify-payment", {
      method: "POST",
      body: JSON.stringify({ reference_no }),
    });
    return data;
  }

  static async cancelPayment(reference_no: string): Promise<{
    message: string;
    tran_status: string;
  }> {
    const { data } = await this.fetch<{
      message: string;
      tran_status: string;
    }>("/applicant/cancel-payment", {
      method: "POST",
      body: JSON.stringify({ reference_no }),
    });
    return data;
  }

  static async getPaymentHistory(): Promise<{
    payment_history: PaymentTransaction[];
    total_payments: number;
  }> {
    const { data } = await this.fetch<{
      payment_history: PaymentTransaction[];
      total_payments: number;
    }>("/applicant/payment-history");
    return data;
  }

  static async downloadPaymentReceipt(receipt_no: string): Promise<Blob> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      ...(token && { Authorization: `Bearer ${token}` }),
    };

    const response = await fetch(
      `${API_BASE_URL}/applicant/payment-receipt/${receipt_no}`,
      {
        method: "GET",
        headers,
      },
    );

    if (!response.ok) {
      throw new Error("Failed to download payment receipt");
    }

    return await response.blob();
  }

  static async downloadMedicalForm(): Promise<Blob> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      ...(token && { Authorization: `Bearer ${token}` }),
    };

    const response = await fetch(`${API_BASE_URL}/applicant/medical-form`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error("Please complete all payments to download this form");
      }
      throw new Error("Failed to download medical form");
    }

    return await response.blob();
  }

  static async downloadAdmissionNotice(): Promise<Blob> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      ...(token && { Authorization: `Bearer ${token}` }),
    };

    const response = await fetch(`${API_BASE_URL}/applicant/admission-notice`, {
      method: "GET",
      headers,
    });

    if (!response.ok) throw new Error("Failed to download admission notice");

    return await response.blob();
  }

  static async downloadAffidavitForm(): Promise<Blob> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      ...(token && { Authorization: `Bearer ${token}` }),
    };

    const response = await fetch(`${API_BASE_URL}/applicant/affidavit-form`, {
      method: "GET",
      headers,
    });

    if (!response.ok) throw new Error("Failed to download affidavit form");

    return await response.blob();
  }

  // Admission Officer endpoints
  static async getApplications(
    status?: string,
    program_id?: number,
    page?: number,
    per_page?: number,
    search?: string,
  ): Promise<{
    applications: Application[];
    count: number;
    page: number;
    per_page: number;
    total_pages: number;
  }> {
    let endpoint = "/admission_officer/applications";
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (program_id) params.append("program_id", program_id.toString());
    if (page) params.append("page", page.toString());
    if (per_page) params.append("per_page", per_page.toString());
    if (search) params.append("search", search);
    if (params.toString()) endpoint += `?${params.toString()}`;

    const { data } = await this.fetch<{
      applications: Application[];
      count: number;
      page: number;
      per_page: number;
      total_pages: number;
    }>(endpoint);
    return data;
  }

  static async getApplicationDetails(applicant_id: string | number) {
    const { data } = await this.fetch(
      `/admission_officer/application/${applicant_id}`,
    );
    return data;
  }

  static async reviewApplication(
    applicant_id: string | number,
    decision: "accept" | "reject" | "recommend",
    approved_course?: string,
  ) {
    const { data } = await this.fetch("/admission_officer/review-application", {
      method: "POST",
      body: JSON.stringify({
        applicant_id,
        decision,
        approved_course,
      }),
    });
    return data;
  }

  static async sendAdmissionLetter(
    applicant_id: string | number,
    admission_date?: string,
    template_id?: string,
  ) {
    const { data } = await this.fetch(
      "/admission_officer/send-admission-letter",
      {
        method: "POST",
        body: JSON.stringify({ applicant_id, admission_date, template_id }),
      },
    );
    return data;
  }

  static async sendBatchLetters(
    applicant_ids: number[],
    admission_date?: string,
    template_id?: string,
  ): Promise<SendResult> {
    const { data } = await this.fetch<SendResult>(
      "/admission_officer/send-batch-letters",
      {
        method: "POST",
        body: JSON.stringify({ applicant_ids, admission_date, template_id }),
      },
    );
    return data;
  }

  static async revokeAdmission(applicant_id: number) {
    const { data } = await this.fetch("/admission_officer/revoke-admission", {
      method: "POST",
      body: JSON.stringify({ applicant_id }),
    });
    return data;
  }

  static async getDashboard(activityLimit = 10): Promise<{
    statistics: {
      total_applications: number;
      total_admitted: number;
      pending_submission: number;
      review_applications: number;
      under_review: number;
      by_status: Array<{ application_status: string; count: number }>;
      by_program: Array<{ name: string; count: number }>;
    };
    recent_activity: Array<{
      type: string;
      label: string;
      event_time: string | null;
    }>;
  }> {
    const { data } = await this.fetch<{
      statistics: {
        total_applications: number;
        total_admitted: number;
        pending_submission: number;
        review_applications: number;
        under_review: number;
        by_status: Array<{ application_status: string; count: number }>;
        by_program: Array<{ name: string; count: number }>;
      };
      recent_activity: Array<{
        type: string;
        label: string;
        event_time: string | null;
      }>;
    }>(`/admission_officer/dashboard?limit=${activityLimit}`);
    return data;
  }

  static async getStatistics() {
    const { data } = await this.fetch("/admission_officer/statistics");
    return data;
  }

  // =================== PG Admin Endpoints ===================

  static async getPgAdminDashboard(activityLimit = 10): Promise<{
    statistics: {
      total_applications: number;
      total_admitted: number;
      pending_submission: number;
      new_applications: number;
      under_review: number;
      total_rejected: number;
      by_status: Array<{ application_status: string; count: number }>;
      by_program: Array<{ name: string; count: number }>;
    };
    recent_activity: Array<{
      type: string;
      label: string;
      event_time: string | null;
    }>;
  }> {
    const { data } = await this.fetch<any>(
      `/pgadmin/dashboard?limit=${activityLimit}`,
    );
    return data;
  }

  // Compatibility alias
  static async getPgDeanDashboard(activityLimit = 10) {
    return this.getPgAdminDashboard(activityLimit);
  }

  static async getPgApplications(
    status?: string,
    page?: number,
    per_page?: number,
    search?: string,
  ): Promise<{
    applications: any[];
    count: number;
    page: number;
    per_page: number;
    total_pages: number;
  }> {
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (page) params.append("page", page.toString());
    if (per_page) params.append("per_page", per_page.toString());
    if (search) params.append("search", search);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const { data } = await this.fetch<any>(`/pgadmin/applications${qs}`);
    return data;
  }

  static async getPgApplicationDetails(
    applicationId: string | number,
  ): Promise<any> {
    const { data } = await this.fetch<any>(
      `/pgadmin/application/${applicationId}`,
    );
    return data;
  }

  static async getPgEvaluation(applicationId: string | number): Promise<any> {
    const { data } = await this.fetch<any>(
      `/pgadmin/evaluation/${applicationId}`,
    );
    return data;
  }

  static async savePgEvaluation(
    applicationId: string | number,
    evaluation: {
      transcript_received: string;
      transcript_comment?: string;
      ref_letters_count: number;
      recommendation?: string;
      supervisor_name?: string;
    },
  ): Promise<any> {
    const { data } = await this.fetch<any>(
      `/pgadmin/evaluate/${applicationId}`,
      {
        method: "POST",
        body: JSON.stringify(evaluation),
      },
    );
    return data;
  }

  static async pgReviewApplication(
    applicationId: string | number,
    decision: "accept" | "reject" | "recommend",
    approvedCourse?: string,
  ): Promise<any> {
    const { data } = await this.fetch<any>(`/pgadmin/review-application`, {
      method: "POST",
      body: JSON.stringify({
        applicant_id: applicationId,
        decision,
        approved_course: approvedCourse,
      }),
    });
    return data;
  }

  static async pgSendAdmissionLetter(
    applicationId: string | number,
    admissionDate?: string,
  ): Promise<any> {
    const { data } = await this.fetch<any>(`/pgadmin/send-admission-letter`, {
      method: "POST",
      body: JSON.stringify({
        applicant_id: applicationId,
        admission_date: admissionDate,
      }),
    });
    return data;
  }

  static getPgApplicationPrintUrl(applicationId: string | number): string {
    const token = this.getToken();
    return `${API_BASE_URL}/pgadmin/print-application/${applicationId}?token=${token || ""}`;
  }

  static async getPgPrograms(): Promise<any[]> {
    const { data } = await this.fetch<any>(`/pgadmin/programs`);
    return Array.isArray(data) ? data : data?.programs || [];
  }

  static async getRecentActivity(limit = 15): Promise<{
    activities: Array<{
      type: string;
      label: string;
      event_time: string | null;
    }>;
  }> {
    const { data } = await this.fetch<{
      activities: Array<{
        type: string;
        label: string;
        event_time: string | null;
      }>;
    }>(`/admission_officer/recent-activity?limit=${limit}`);
    return data;
  }

  static async getLetterTemplates(): Promise<{ templates: LetterTemplate[] }> {
    const { data } = await this.fetch<{ templates: LetterTemplate[] }>(
      "/admission_officer/letter-templates",
    );
    return data;
  }

  static async getLetterTemplate(template_id: number) {
    const { data } = await this.fetch(
      `/admission_officer/letter-template/${template_id}`,
    );
    return data;
  }

  // New letter management endpoints
  static async getFacultyDepartments(): Promise<FacultyDepartmentsResponse> {
    const { data } = await this.fetch<FacultyDepartmentsResponse>(
      "/admission_officer/faculty-departments",
    );
    return data;
  }

  static async getDepartmentApplicants(
    departmentName: string,
  ): Promise<DepartmentApplicantsResponse> {
    const { data } = await this.fetch<DepartmentApplicantsResponse>(
      `/admission_officer/department-applicants/${encodeURIComponent(departmentName)}`,
    );
    return data;
  }

  static async sendDepartmentLetters(
    departmentName: string,
    applicantIds: number[],
    admissionDate?: string,
  ): Promise<SendDepartmentLettersResponse> {
    const { data } = await this.fetch<SendDepartmentLettersResponse>(
      "/admission_officer/send-department-letters",
      {
        method: "POST",
        body: JSON.stringify({
          department_name: departmentName,
          applicant_ids: applicantIds,
          admission_date: admissionDate,
        }),
      },
    );
    return data;
  }

  static async getLetterStatusSummary(): Promise<LetterStatusSummaryResponse> {
    const { data } = await this.fetch<LetterStatusSummaryResponse>(
      "/admission_officer/letter-status-summary",
    );
    return data;
  }

  static async resendLetter(
    applicantId: number,
    admissionDate?: string,
  ): Promise<{ message: string }> {
    const { data } = await this.fetch<{ message: string }>(
      `/admission_officer/resend-letter/${applicantId}`,
      {
        method: "POST",
        body: JSON.stringify({ admission_date: admissionDate }),
      },
    );
    return data;
  }

  // Recommendation endpoints
  static async getRecommendations(): Promise<RecommendationResponse> {
    const { data } = await this.fetch<RecommendationResponse>(
      "/applicant/get-recommendations",
    );
    return data;
  }

  static async respondToRecommendation(
    review_id: number,
    response: "accepted" | "declined",
  ) {
    const { data } = await this.fetch("/applicant/respond-to-recommendation", {
      method: "POST",
      body: JSON.stringify({ review_id, response }),
    });
    return data;
  }

  // ================= Stage 2: Student Endpoints =================
  static async changeStudentPassword(
    new_password: string,
  ): Promise<{ message: string }> {
    const { data } = await this.fetch<{ message: string }>(
      "/student/change-password",
      {
        method: "POST",
        body: JSON.stringify({ new_password }),
      },
    );
    return data;
  }

  static async getStudentCourses(
    semester?: string,
  ): Promise<CourseRegistrationResponse> {
    const url = semester
      ? `/student/courses?semester=${semester}`
      : `/student/courses`;
    const { data } = await this.fetch<CourseRegistrationResponse>(url);
    return data;
  }

  static async registerCourses(
    course_ids: number[],
    semester: string,
    status: string = "submitted",
  ): Promise<{ message: string }> {
    const { data } = await this.fetch<{ message: string }>(
      "/student/register-courses",
      {
        method: "POST",
        body: JSON.stringify({ course_ids, semester, status }),
      },
    );
    return data;
  }

  static async searchCourses(
    query: string,
  ): Promise<{ courses: CourseData[] }> {
    const { data } = await this.fetch<{ courses: CourseData[] }>(
      `/student/courses/search?q=${encodeURIComponent(query)}`,
    );
    return data;
  }

  // ===== Admission Officer Management (Stage 2) =====
  static async getAdminPrograms(): Promise<{ programs: any[] }> {
    const { data } = await this.fetch<{ programs: any[] }>(
      "/admission_officer/programs",
    );
    return data;
  }

  static async updateProgram(
    programId: number,
    data: any,
  ): Promise<{ message: string }> {
    const { data: responseData } = await this.fetch<{ message: string }>(
      `/admission_officer/program/${programId}`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
    );
    return responseData;
  }

  static async getStudents(filters?: {
    program_id?: number;
    level?: string;
  }): Promise<{ students: any[] }> {
    let url = "/admission_officer/students";
    const params = new URLSearchParams();
    if (filters?.program_id)
      params.append("program_id", filters.program_id.toString());
    if (filters?.level) params.append("level", filters.level);
    if (params.toString()) url += `?${params.toString()}`;
    const { data } = await this.fetch<{ students: any[] }>(url);
    return data;
  }

  static async getStudentRegistration(
    studentId: number,
    semester: string = "First",
  ): Promise<{ registration: any; courses: any[] }> {
    const { data } = await this.fetch<{ registration: any; courses: any[] }>(
      `/admission_officer/student/${studentId}/registration?semester=${semester}`,
    );
    return data;
  }

  // ===== New Schema Endpoints =====

  static async getFaculties(): Promise<{ faculties: Faculty[] }> {
    const { data } = await this.fetch<{ faculties: Faculty[] }>(
      "/admission_officer/faculties",
    );
    return data;
  }

  static async getDepartments(
    facultyId?: number,
  ): Promise<{ departments: Department[] }> {
    const url = facultyId
      ? `/admission_officer/departments?faculty_id=${facultyId}`
      : "/admission_officer/departments";
    const { data } = await this.fetch<{ departments: Department[] }>(url);
    return data;
  }

  static async getStudentProfile(): Promise<{ profile: StudentProfile }> {
    const { data } = await this.fetch<{ profile: StudentProfile }>(
      "/student/profile",
    );
    return data;
  }

  // ===== RBAC: Staff / Scores / HOD / Dean / Registrar =====

  static async getStaffList(role?: string): Promise<{ staff: any[] }> {
    const url = role ? `/staff/list?role=${role}` : "/staff/list";
    const { data } = await this.fetch<{ staff: any[] }>(url);
    return data;
  }

  static async createStaff(payload: {
    name: string;
    email: string;
    password: string;
    role: string;
    phone_number?: string;
    staff_id?: string;
    title?: string;
    department_id?: number;
    faculty_id?: number;
  }): Promise<{ message: string; user_id: number }> {
    const { data } = await this.fetch<{ message: string; user_id: number }>(
      "/staff/create",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
    return data;
  }

  static async updateStaff(
    userId: number,
    updates: {
      role?: string;
      status?: string;
      department_id?: number;
      faculty_id?: number;
      title?: string;
      staff_id?: string;
    },
  ): Promise<{ message: string }> {
    const { data } = await this.fetch<{ message: string }>(`/staff/${userId}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
    return data;
  }

  static async assignCourse(payload: {
    staff_id: number;
    course_id: number;
    session: string;
    semester: string;
  }): Promise<{ message: string }> {
    const { data } = await this.fetch<{ message: string }>(
      "/staff/assign-course",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
    return data;
  }

  static async getAssignedCourses(
    session?: string,
    semester?: string,
  ): Promise<{ courses: any[] }> {
    const p = new URLSearchParams();
    if (session) p.append("session", session);
    if (semester) p.append("semester", semester);
    const { data } = await this.fetch<{ courses: any[] }>(
      `/staff/courses?${p.toString()}`,
    );
    return data;
  }

  static async getCourseStudents(
    courseId: number,
    session?: string,
    semester?: string,
  ): Promise<{ students: any[] }> {
    const p = new URLSearchParams();
    if (session) p.append("session", session);
    if (semester) p.append("semester", semester);
    const { data } = await this.fetch<{ students: any[] }>(
      `/staff/courses/${courseId}/students?${p.toString()}`,
    );
    return data;
  }

  static async enterScores(payload: {
    course_id: number;
    session: string;
    semester: string;
    scores: { student_id: number; ca_score: number; exam_score: number }[];
  }): Promise<{ message: string }> {
    const { data } = await this.fetch<{ message: string }>("/scores/enter", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return data;
  }

  static async submitScores(
    courseId: number,
    session: string,
    semester: string,
  ): Promise<{ message: string }> {
    const { data } = await this.fetch<{ message: string }>("/scores/submit", {
      method: "POST",
      body: JSON.stringify({ course_id: courseId, session, semester }),
    });
    return data;
  }

  static async getStudentScores(studentId: number): Promise<{ scores: any[] }> {
    const { data } = await this.fetch<{ scores: any[] }>(
      `/scores/student/${studentId}`,
    );
    return data;
  }

  static async getHodDashboard(): Promise<any> {
    const { data } = await this.fetch<any>("/hod/dashboard");
    return data;
  }

  static async getHodResults(filters?: {
    status?: string;
    semester?: string;
    level?: string;
  }): Promise<{ results: any[] }> {
    const p = new URLSearchParams(filters as any).toString();
    const { data } = await this.fetch<{ results: any[] }>(`/hod/results?${p}`);
    return data;
  }

  static async approveScore(scoreId: number): Promise<{ message: string }> {
    const { data } = await this.fetch<{ message: string }>(
      `/hod/scores/${scoreId}/approve`,
      { method: "POST" },
    );
    return data;
  }

  static async rejectScore(
    scoreId: number,
    reason?: string,
  ): Promise<{ message: string }> {
    const { data } = await this.fetch<{ message: string }>(
      `/hod/scores/${scoreId}/reject`,
      {
        method: "POST",
        body: JSON.stringify({ reason }),
      },
    );
    return data;
  }

  static async getDeanDashboard(): Promise<any> {
    const { data } = await this.fetch<any>("/dean/dashboard");
    return data;
  }

  static async getDeanResults(filters?: {
    status?: string;
    session?: string;
    semester?: string;
  }): Promise<{ results: any[] }> {
    const p = new URLSearchParams(filters as any).toString();
    const { data } = await this.fetch<{ results: any[] }>(`/dean/results?${p}`);
    return data;
  }

  static async getRegistrarDashboard(): Promise<any> {
    const { data } = await this.fetch<any>("/registrar/dashboard");
    return data;
  }

  static async getAllStudents(search?: string): Promise<{ students: any[] }> {
    const url = search
      ? `/registrar/students?search=${encodeURIComponent(search)}`
      : "/registrar/students";
    const { data } = await this.fetch<{ students: any[] }>(url);
    return data;
  }

  static async getTranscript(studentId: number): Promise<any> {
    const { data } = await this.fetch<any>(
      `/registrar/student/${studentId}/transcript`,
    );
    return data;
  }

  static async signTranscript(logId: number): Promise<{ message: string }> {
    const { data } = await this.fetch<{ message: string }>(
      `/registrar/transcripts/${logId}/sign`,
      { method: "POST" },
    );
    return data;
  }

  static async issueTranscript(logId: number): Promise<{ message: string }> {
    const { data } = await this.fetch<{ message: string }>(
      `/registrar/transcripts/${logId}/issue`,
      { method: "POST" },
    );
    return data;
  }

  static async getGlobalSettings(): Promise<any> {
    const { data } = await this.fetch<{
      settings: Array<{ key: string; value: string }>;
    }>("/settings/all");
    const settings = data?.settings || [];
    // Transform array of {key, value} into a key→value map for backward compatibility
    return settings.reduce((acc: Record<string, string>, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {});
  }

  static async updateGlobalSettings(
    settings: Record<string, string>,
  ): Promise<{ message: string }> {
    // Send each setting individually so the sync logic in settings.py fires
    // (e.g. current_academic_session syncs academic_sessions table,
    //  current_semester syncs semesters table)
    let lastResult: { message: string } = { message: "" };
    for (const [key, value] of Object.entries(settings)) {
      // Skip entries with no value (avoids 400 from backend)
      if (value === undefined || value === null || value === "") continue;
      const { data } = await this.fetch<{ message: string }>(
        "/settings/update",
        {
          method: "POST",
          body: JSON.stringify({ key, value }),
        },
      );
      lastResult = data;
    }
    return lastResult;
  }

  static async createLecturer(
    lecturerData: any,
  ): Promise<{ message: string; user_id: number }> {
    const { data } = await this.fetch<{ message: string; user_id: number }>(
      "/admission_officer/staff/lecturer",
      {
        method: "POST",
        body: JSON.stringify(lecturerData),
      },
    );
    return data;
  }

  // ─── PG Admin endpoints ────────────────────────────────────────────────────

  /** Download the printable PG application PDF.
   *  Works for both pgadmin, pgdean, and admissionofficer roles. */
  static async downloadPgApplicationPdf(applicationId: string): Promise<Blob> {
    const token = this.getToken();
    const res = await fetch(
      `${API_BASE_URL}/pgadmin/print-application/${applicationId}`,
      {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    );
    if (!res.ok) throw new Error("Failed to download PG application PDF");
    return res.blob();
  }
}
