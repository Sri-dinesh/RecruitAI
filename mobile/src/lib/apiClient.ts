import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";

export const CLOUD_BACKEND_URL = "https://recruitai-vpbe.onrender.com";

/**
 * Resolves the default backend URL based on execution platform and environment.
 * Defaults to the live cloud backend on Render so that mobile devices connecting
 * over tunnel or cellular data connect immediately without firewall or LAN routing issues.
 */
const getDefaultBackendUrl = (): string => {
  if (process.env.EXPO_PUBLIC_BACKEND_URL && process.env.EXPO_PUBLIC_BACKEND_URL.trim()) {
    return process.env.EXPO_PUBLIC_BACKEND_URL.trim().replace(/\/$/, "");
  }
  return CLOUD_BACKEND_URL;
};

let activeBackendUrl: string = getDefaultBackendUrl();

// Hydrate saved custom backend URL from SecureStore if available
SecureStore.getItemAsync("recruitai_backend_url")
  .then((saved) => {
    if (saved && saved.trim()) {
      activeBackendUrl = saved.trim().replace(/\/$/, "");
      console.log("[apiClient] Loaded custom backend URL from storage:", activeBackendUrl);
    }
  })
  .catch(() => {});

export const getBackendUrl = (): string => activeBackendUrl;

export const setCustomBackendUrl = async (url: string): Promise<void> => {
  const clean = url.trim().replace(/\/$/, "");
  activeBackendUrl = clean;
  await SecureStore.setItemAsync("recruitai_backend_url", clean);
  console.log("[apiClient] Set custom backend URL:", clean);
};

export const resetBackendUrl = async (): Promise<void> => {
  activeBackendUrl = getDefaultBackendUrl();
  await SecureStore.deleteItemAsync("recruitai_backend_url");
  console.log("[apiClient] Reset backend URL to default:", activeBackendUrl);
};

export const BACKEND_URL = activeBackendUrl;

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

  const fileName = customFileName || fileUri.split("/").pop() || "document.pdf";

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
 * Diagnostic helper to test backend connectivity with candidate URL fallbacks.
 * Uses a 3.5s timeout per candidate to avoid hanging indefinitely on unreachable LAN IPs.
 * Automatically switches to the first responding healthy backend and persists the working target.
 */
export async function testBackendConnection(): Promise<{
  ok: boolean;
  url: string;
  status?: number;
  message?: string;
  error?: string;
}> {
  const currentBase = getBackendUrl();
  const candidateUrls = Array.from(
    new Set([
      currentBase,
      CLOUD_BACKEND_URL,
      ...(__DEV__ && process.env.EXPO_PUBLIC_DEV_LAN_URL ? [process.env.EXPO_PUBLIC_DEV_LAN_URL] : []),
      ...(__DEV__ && Platform.OS === "android" ? ["http://10.0.2.2:8000"] : []),
      ...(__DEV__ ? ["http://localhost:8000", "http://127.0.0.1:8000"] : []),
    ])
  ).filter(Boolean);

  let lastErr = "";
  for (const base of candidateUrls) {
    const fullUrl = `${base}/api/health`;
    try {
      console.log("[apiClient] Testing backend health at:", fullUrl);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(fullUrl, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        if (base !== currentBase) {
          await setCustomBackendUrl(base);
          console.log("[apiClient] Automatically switched active backend URL to:", base);
        }
        return {
          ok: true,
          url: base,
          status: res.status,
          message: "Connected successfully",
        };
      } else {
        lastErr = `HTTP ${res.status}`;
      }
    } catch (e: any) {
      lastErr = e?.message || "Network request failed";
    }
  }

  return { ok: false, url: currentBase, error: lastErr };
}
