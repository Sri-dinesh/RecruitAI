import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { supabase } from "./supabase";

/**
 * Resolves the default backend URL based on execution platform
 * - Android Emulator uses 10.0.2.2 to reach host machine
 * - iOS Simulator and Web use localhost
 */
const getDefaultBackendUrl = () => {
  if (Platform.OS === "android") {
    return "http://10.0.2.2:8000";
  }
  return "http://localhost:8000";
};

let activeBackendUrl: string =
  process.env.EXPO_PUBLIC_BACKEND_URL || getDefaultBackendUrl();

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
  activeBackendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || getDefaultBackendUrl();
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

/**
 * Diagnostic helper to test backend connectivity with candidate URL fallbacks.
 */
export async function testBackendConnection(): Promise<{
  ok: boolean;
  url: string;
  status?: number;
  message?: string;
  error?: string;
}> {
  const currentBase = getBackendUrl();
  const testUrls = [
    currentBase,
    ...(Platform.OS === "android" && !currentBase.includes("10.0.2.2")
      ? ["http://10.0.2.2:8000"]
      : []),
    ...(Platform.OS === "android" && !currentBase.includes("192.168.0.6")
      ? ["http://192.168.0.6:8000"]
      : []),
  ];

  let lastErr = "";
  for (const base of testUrls) {
    const fullUrl = `${base}/api/health`;
    try {
      console.log("[apiClient] Testing backend health at:", fullUrl);
      const res = await fetch(fullUrl, { method: "GET" });
      if (res.ok) {
        if (base !== currentBase) {
          await setCustomBackendUrl(base);
          console.log("[apiClient] Switched active backend URL to:", base);
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
