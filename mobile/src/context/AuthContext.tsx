import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { User, Session, AuthError } from "@supabase/supabase-js";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import { supabase } from "@/lib/supabase";
import { fetchWithAuth } from "@/lib/apiClient";
import { RECOVERY_REDIRECT_URL } from "@/constants/links";

WebBrowser.maybeCompleteAuthSession();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserPreferences {
  email_alerts?: boolean;
  theme?: "system" | "light" | "dark" | string;
  blind_mode_default?: boolean;
  auto_rubric?: boolean;
  match_threshold?: number;
  default_export_format?: "pdf" | "csv" | "json" | string;
  digest_frequency?: "instant" | "daily" | "weekly" | "off" | string;
  sound_effects?: boolean;
  [key: string]: any;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  company_name?: string | null;
  company_website?: string | null;
  role: string;
  preferences: UserPreferences;
  created_at?: string;
  updated_at?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<{ error: AuthError | Error | null }>;
  signupWithEmail: (email: string, password: string, fullName: string) => Promise<{ error: AuthError | Error | null }>;
  loginWithGoogle: () => Promise<{ error: Error | null }>;
  resetPasswordForEmail: (email: string) => Promise<{ error: AuthError | Error | null }>;
  updatePassword: (password: string) => Promise<{ error: AuthError | Error | null }>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error: Error | null; data?: UserProfile }>;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId?: string) => {
    try {
      // 1. Try local SecureStore cache for instant offline responsiveness
      const cached = await SecureStore.getItemAsync("recruitai_cached_user_profile");
      if (cached) {
        try {
          setProfile(JSON.parse(cached));
        } catch {}
      }

      // 2. Fetch fresh profile from API
      const res = await fetchWithAuth("/api/users/me");
      if (res.ok) {
        const data: UserProfile = await res.json();
        setProfile(data);
        await SecureStore.setItemAsync("recruitai_cached_user_profile", JSON.stringify(data));
      } else if (userId) {
        const { data, error } = await supabase
          .from("users")
          .select("*")
          .eq("id", userId)
          .maybeSingle();
        if (!error && data) {
          setProfile(data as UserProfile);
        }
      }
    } catch (err) {
      console.warn("[AuthContext] Profile fetch error:", err);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    await fetchProfile(user?.id);
  }, [fetchProfile, user?.id]);

  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>): Promise<{ error: Error | null; data?: UserProfile }> => {
      try {
        const res = await fetchWithAuth("/api/users/me", {
          method: "PATCH",
          body: JSON.stringify(updates),
        });
        if (res.ok) {
          const updated: UserProfile = await res.json();
          setProfile(updated);
          await SecureStore.setItemAsync("recruitai_cached_user_profile", JSON.stringify(updated));
          return { error: null, data: updated };
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Failed to update profile on server");
        }
      } catch (err: any) {
        setProfile((prev) => {
          if (!prev) return null;
          const merged = { ...prev, ...updates };
          SecureStore.setItemAsync("recruitai_cached_user_profile", JSON.stringify(merged)).catch(() => {});
          return merged;
        });
        return { error: err };
      }
    },
    []
  );

  useEffect(() => {
    // 1. Initial Session Retrieval
    const fetchSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user ?? null);
      } catch (err) {
        console.warn("[AuthContext] Session fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSession();

    // 2. Real-time Auth State Change Listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loginWithEmail = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      return { error };
    } catch (err: any) {
      return { error: err };
    }
  };

  const signupWithEmail = async (email: string, password: string, fullName: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      });
      return { error };
    } catch (err: any) {
      return { error: err };
    }
  };

  const loginWithGoogle = async () => {
    try {
      const redirectUrl = AuthSession.makeRedirectUri({
        scheme: "recruitai",
        path: "auth/callback",
      });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) return { error };

      if (data?.url) {
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        if (res.type === "success" && res.url) {
          // Parse tokens if passed in redirect hash
          const urlParams = new URL(res.url);
          const params = new URLSearchParams(urlParams.hash.replace(/^#/, ""));
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");
          if (accessToken && refreshToken) {
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
          }
        }
      }
      return { error: null };
    } catch (err: any) {
      console.warn("[AuthContext] Google OAuth error:", err);
      return { error: err };
    }
  };

  const resetPasswordForEmail = async (email: string) => {
    try {
      // Use environment-configured redirect URL so email links work universally
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: RECOVERY_REDIRECT_URL,
      });
      return { error };
    } catch (err: any) {
      return { error: err };
    }
  };

  const updatePassword = async (password: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password });
      return { error };
    } catch (err: any) {
      return { error: err };
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchProfile(user.id);
    } else {
      setProfile(null);
    }
  }, [user?.id, fetchProfile]);

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      setProfile(null);
      await SecureStore.deleteItemAsync("recruitai_cached_user_profile");
    } catch (err) {
      console.warn("[AuthContext] Logout error:", err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        loginWithEmail,
        signupWithEmail,
        loginWithGoogle,
        resetPasswordForEmail,
        updatePassword,
        updateProfile,
        refreshProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside an <AuthProvider>.");
  }
  return ctx;
};
