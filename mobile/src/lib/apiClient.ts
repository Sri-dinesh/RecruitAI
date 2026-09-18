import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";

/**
 * Resolves the Backend API URL strictly from environment variables:
 * - Production: EXPO_PUBLIC_BACKEND_URL (configured in .env.production / EAS build secrets)
 * - Development: EXPO_PUBLIC_DEV_LAN_URL, EXPO_PUBLIC_BACKEND_URL, or local emulator fallback
 */
export const getBackendUrl = (): string => {
  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();
  const lanUrl = process.env.EXPO_PUBLIC_DEV_LAN_URL?.trim();
  const localUrl = process.env.EXPO_PUBLIC_LOCAL_URL?.trim();

  // In production builds (!__DEV__), strictly require and use the environment backend URL
  if (!__DEV__) {
    if (backendUrl) {
      return backendUrl.replace(/\/$/, "");
    }
    console.warn(
      "[apiClient] EXPO_PUBLIC_BACKEND_URL is not set in production. Please configure it in your environment."
    );
    return "";
  }

  // In development mode (__DEV__), allow LAN overrides for physical device testing
  if (lanUrl) {
    return lanUrl.replace(/\/$/, "");
  }
  if (backendUrl) {
    return backendUrl.replace(/\/$/, "");
  }
  if (localUrl) {
    return localUrl.replace(/\/$/, "");
  }

  // Development emulator / simulator fallback
  if (Platform.OS === "android") {
    return "http://10.0.2.2:8000";
  }
  return "http://localhost:8000";
};

export const BACKEND_URL = getBackendUrl();

export interface FetchWithAuthOptions extends RequestInit {
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  _isRetryAfterRefresh?: boolean;
}

export interface JobStatusResponse {
  job_id: string;
  session_id?: string;
  status: "queued" | "running" | "completed" | "failed";
  progress?: string;
  steps?: string[];
  result?: any;
  error?: string;
}

/**
 * Mobile fetchWithAuth:
 * Automatically retrieves and attaches the user's Supabase JWT Bearer token.
 * Correctly preserves multipart/form-data boundary headers for file and image uploads.
 * Implements exponential backoff retries for resilient mobile networking.
 * Handles client-side request timeouts and automatic token refresh on 401.
 */
export async function fetchWithAuth(
  path: string,
  options: FetchWithAuthOptions = {}
): Promise<Response> {
  const {
    retries = 2,
    retryDelayMs = 400,
    timeoutMs = 45000,
    _isRetryAfterRefresh = false,
    ...fetchOptions
  } = options;
  const headers = new Headers(fetchOptions.headers || {});

  // Do NOT override Content-Type if uploading FormData (let fetch set boundary)
  if (!(fetchOptions.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Inject Supabase access token if session is present
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
    }
  } catch (err) {
    console.warn("[apiClient] Unable to retrieve auth session token:", err);
  }

  const baseUrl = getBackendUrl();
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;

  let lastError: any = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Timeout controller linked with any caller-provided signal
    const timeoutController = new AbortController();
    let timeoutTriggered = false;
    const timer = setTimeout(() => {
      timeoutTriggered = true;
      timeoutController.abort();
    }, timeoutMs);

    const callerSignal = fetchOptions.signal;
    const abortHandler = () => timeoutController.abort();
    if (callerSignal) {
      callerSignal.addEventListener("abort", abortHandler);
    }

    try {
      const res = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: timeoutController.signal,
      });

      // Handle 401 Unauthorized by refreshing token and retrying once
      if (res.status === 401 && !_isRetryAfterRefresh) {
        clearTimeout(timer);
        if (callerSignal) {
          callerSignal.removeEventListener("abort", abortHandler);
        }
        try {
          const { data: refreshData, error: refreshError } =
            await supabase.auth.refreshSession();
          if (!refreshError && refreshData.session?.access_token) {
            return await fetchWithAuth(path, {
              ...options,
              _isRetryAfterRefresh: true,
            });
          }
        } catch (refreshErr) {
          console.warn("[apiClient] Token refresh failed:", refreshErr);
        }
      }

      // Retry on server temporary unavailable / gateway errors (502, 503, 504)
      if (res.status >= 502 && res.status <= 504 && attempt < retries) {
        clearTimeout(timer);
        if (callerSignal) {
          callerSignal.removeEventListener("abort", abortHandler);
        }
        const delay = retryDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      clearTimeout(timer);
      if (callerSignal) {
        callerSignal.removeEventListener("abort", abortHandler);
      }
      return res;
    } catch (err: any) {
      clearTimeout(timer);
      if (callerSignal) {
        callerSignal.removeEventListener("abort", abortHandler);
      }

      if (timeoutTriggered) {
        lastError = new Error(`Request timed out after ${timeoutMs / 1000}s for ${path}`);
      } else {
        lastError = err;
      }

      // If client aborted manually, do not retry
      if (callerSignal?.aborted) {
        throw err;
      }

      if (attempt < retries && !timeoutTriggered) {
        const delay = retryDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error(`Network request failed for ${path} at ${baseUrl}`);
}

/**
 * Polls status of an asynchronous agent job until completion or timeout.
 */
export async function fetchJobStatus(jobId: string): Promise<JobStatusResponse> {
  const res = await fetchWithAuth(`/api/chat/jobs/${jobId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch job status: HTTP ${res.status}`);
  }
  return await res.json();
}

/**
 * High-level polling engine for async jobs.
 */
export async function pollJobUntilDone(
  jobId: string,
  onProgress?: (status: JobStatusResponse) => void,
  maxWaitMs = 90000
): Promise<any> {
  const startTime = Date.now();
  const pollIntervalMs = 1200;

  while (Date.now() - startTime < maxWaitMs) {
    const job = await fetchJobStatus(jobId);
    if (onProgress) {
      onProgress(job);
    }

    if (job.status === "completed") {
      return job.result;
    }
    if (job.status === "failed") {
      throw new Error(job.error || "Async agent job failed.");
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Job execution timed out after ${maxWaitMs / 1000}s`);
}

export interface UploadFileOptions {
  fieldName?: string;
  fileName?: string;
  mimeType?: string;
  headers?: Record<string, string>;
  extraFields?: Record<string, string>;
}

/**
 * Native multipart file upload with auth session token.
 * Uses native XMLHttpRequest with React Native FormData.
 * This directly invokes React Native's native RCTNetworking layer (OkHttp on Android, NSURLSession on iOS).
 * It completely avoids:
 * 1. Expo WinterCG fetch polyfill ("Unsupported FormDataPart implementation")
 * 2. ExponentFileSystem scoped storage permission blocks ("Location '...' isn't readable")
 */
export async function uploadFileWithAuth<T = any>(
  path: string,
  fileUri: string,
  options: UploadFileOptions = {}
): Promise<T> {
  const {
    fieldName = "file",
    fileName: customFileName,
    mimeType,
    headers = {},
    extraFields = {},
  } = options;
  const baseUrl = getBackendUrl();
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;

  const authHeaders: Record<string, string> = { ...headers };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      authHeaders["Authorization"] = `Bearer ${session.access_token}`;
    }
  } catch (err) {
    console.warn("[apiClient] Unable to retrieve auth token for upload:", err);
  }

  let fileName = customFileName || fileUri.split("/").pop() || "document.pdf";
  if (!fileName.includes(".")) {
    if (mimeType?.includes("pdf")) {
      fileName = `${fileName}.pdf`;
    } else if (mimeType?.includes("word") || mimeType?.includes("officedocument") || mimeType?.includes("docx")) {
      fileName = `${fileName}.docx`;
    } else if (mimeType?.includes("text") || mimeType?.includes("plain")) {
      fileName = `${fileName}.txt`;
    } else {
      fileName = `${fileName}.pdf`;
    }
  }

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = 60000; // 60s timeout for document ingestion

    // Apply headers - NEVER set Content-Type so native RCTNetworking adds the multipart boundary
    for (const [key, value] of Object.entries(authHeaders)) {
      if (key.toLowerCase() !== "content-type") {
        xhr.setRequestHeader(key, value);
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          resolve(xhr.responseText as unknown as T);
        }
      } else {
        let msg = `Upload failed with HTTP status ${xhr.status}`;
        try {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed.detail) {
            msg = typeof parsed.detail === "string" ? parsed.detail : JSON.stringify(parsed.detail);
          }
        } catch {
          if (xhr.responseText) msg = xhr.responseText;
        }
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => {
      reject(new Error(`Network error occurred while uploading "${fileName}" to server.`));
    };

    xhr.ontimeout = () => {
      reject(new Error(`Upload timed out for "${fileName}". The server took longer than 60s to process.`));
    };

    const formData = new FormData();
    if (extraFields) {
      for (const [k, v] of Object.entries(extraFields)) {
        if (v !== undefined && v !== null) {
          formData.append(k, v);
        }
      }
    }
    formData.append(fieldName, {
      uri: fileUri,
      name: fileName,
      type: mimeType || "application/octet-stream",
    } as any);

    xhr.send(formData);
  });
}

/**
 * Diagnostic helper to test backend connectivity.
 * Tests ONLY the designated backend URL for the active environment (local or production).
 * Strictly avoids cross-switching or mutating target URLs.
 */
export async function testBackendConnection(): Promise<{
  ok: boolean;
  url: string;
  status?: number;
  message?: string;
  error?: string;
}> {
  const targetUrl = getBackendUrl();
  const fullUrl = `${targetUrl}/api/health`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(fullUrl, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      return {
        ok: true,
        url: targetUrl,
        status: res.status,
        message: "Connected successfully",
      };
    } else {
      return {
        ok: false,
        url: targetUrl,
        status: res.status,
        error: `HTTP ${res.status}`,
      };
    }
  } catch (e: any) {
    return {
      ok: false,
      url: targetUrl,
      error: e?.message || "Network request failed",
    };
  }
}
