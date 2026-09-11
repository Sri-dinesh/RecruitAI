import { Platform } from "react-native";
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

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || getDefaultBackendUrl();

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

  const url = path.startsWith("http") ? path : `${BACKEND_URL}${path}`;

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

  throw lastError || new Error(`Network request failed for ${path}`);
}
