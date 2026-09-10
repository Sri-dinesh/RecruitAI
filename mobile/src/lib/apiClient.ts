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

/**
 * Mobile fetchWithAuth:
 * Automatically retrieves and attaches the user's Supabase JWT Bearer token.
 * Correctly preserves multipart/form-data boundary headers for file and image uploads.
 */
export async function fetchWithAuth(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers || {});

  // Do NOT override Content-Type if uploading FormData (let fetch set boundary)
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
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

  return fetch(url, {
    ...options,
    headers,
  });
}
