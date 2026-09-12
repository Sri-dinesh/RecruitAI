import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";

export const CLOUD_BACKEND_URL = "https://recruitai-vpbe.onrender.com";

/**
 * Strict Environment URL Separation:
 * 1. In Local Development (__DEV__):
 *    Use the LOCAL backend URL only.
 *    Priority:
 *    - EXPO_PUBLIC_DEV_LAN_URL (e.g. http://192.168.x.x:8000 for physical phone testing on same WiFi)
 *    - Android Emulator (http://10.0.2.2:8000)
 *    - iOS Simulator / Web (http://localhost:8000)
 *    Strictly prevents using or switching to production in local dev.
 *
 * 2. In Production (!__DEV__):
 *    Use the PRODUCTION Cloud backend URL only (https://recruitai-vpbe.onrender.com).
 *    Strictly prevents using or switching to localhost / LAN in production.
 */
export const getBackendUrl = (): string => {
  if (!__DEV__) {
    // Production builds strictly use the cloud backend URL
    if (process.env.EXPO_PUBLIC_BACKEND_URL && process.env.EXPO_PUBLIC_BACKEND_URL.trim()) {
      return process.env.EXPO_PUBLIC_BACKEND_URL.trim().replace(/\/$/, "");
    }
    return CLOUD_BACKEND_URL;
  }

  // Local development mode (__DEV__) strictly uses local URLs
  if (process.env.EXPO_PUBLIC_DEV_LAN_URL && process.env.EXPO_PUBLIC_DEV_LAN_URL.trim()) {
    return process.env.EXPO_PUBLIC_DEV_LAN_URL.trim().replace(/\/$/, "");
  }
  if (Platform.OS === "android") {
    return "http://10.0.2.2:8000";
  }
  return "http://localhost:8000";
};

export const BACKEND_URL = getBackendUrl();

export interface FetchWithAuthOptions extends RequestInit {
  retries?: number;
  retryDelayMs?: number;
}

/**
 * Mobile fetchWithAuth:
 * Automatically retrieves and attaches the user's Supabase JWT Bearer token.
 * Correctly preserves multipart/form-data boundary headers for file and image uploads.
 * Implements exponential backoff retries for resilient mobile networking.
 */
export async function fetchWithAuth(
  path: string,
  options: FetchWithAuthOptions = {}
): Promise<Response> {
  const { retries = 2, retryDelayMs = 400, ...fetchOptions } = options;
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
    try {
      const res = await fetch(url, {
        ...fetchOptions,
        headers,
      });

      // Retry on server temporary unavailable / gateway errors (502, 503, 504)
      if (res.status >= 502 && res.status <= 504 && attempt < retries) {
        const delay = retryDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      return res;
    } catch (err: any) {
      lastError = err;
      // If client aborted manually, do not retry
      if (fetchOptions.signal?.aborted) {
        throw err;
      }
      if (attempt < retries) {
        const delay = retryDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error(`Network request failed for ${path} at ${baseUrl}`);
}

export interface UploadFileOptions {
  fieldName?: string;
  fileName?: string;
  mimeType?: string;
  headers?: Record<string, string>;
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
  const { fieldName = "file", fileName: customFileName, mimeType, headers = {} } = options;
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
