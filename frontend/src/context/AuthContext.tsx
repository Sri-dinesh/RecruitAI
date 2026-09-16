'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { createSupabaseClient } from '@/lib/supabaseClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserPreferences {
  email_alerts?: boolean;
  theme?: 'system' | 'light' | 'dark' | string;
  blind_mode_default?: boolean;
  auto_rubric?: boolean;
  match_threshold?: number;
  default_export_format?: 'pdf' | 'csv' | 'json' | string;
  digest_frequency?: 'instant' | 'daily' | 'weekly' | 'off' | string;
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
  loginWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signupWithEmail: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  loginWithGoogle: () => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (password: string) => Promise<{ error: Error | null }>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createSupabaseClient();

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!error && data) {
        setProfile(data as UserProfile);
      }
    } catch (err) {
      console.warn('[AuthContext] Error fetching profile:', err);
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  }, [user?.id, fetchProfile]);

  useEffect(() => {
    // 1. Initial session load
    const fetchSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user?.id) {
          await fetchProfile(session.user.id);
        }
      } catch (err) {
        console.warn('[AuthContext] Initial session fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSession();

    // 2. Real-time auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user?.id) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const loginWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return { error };
  };

  const signupWithEmail = async (email: string, password: string, fullName: string) => {
    const cleanName = fullName.trim();
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: cleanName,
          name: cleanName,
        },
      },
    });
    return { error };
  };

  const loginWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  const resetPasswordForEmail = async (email: string) => {
    // Direct routing to /auth/reset-password eliminates intermediate redirect hops
    // and prevents PKCE single-use code double-exchange race conditions.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    return { error };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error };
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) {
      return { error: new Error('User not logged in.') };
    }
    try {
      // 1. Update public.users in Supabase
      const { error: dbError } = await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id);

      if (dbError) {
        console.error('[AuthContext] Database error updating profile:', dbError);
        return { error: dbError };
      }

      // 2. Synchronize Supabase Auth user_metadata if full_name or avatar_url changed
      if (updates.full_name !== undefined || updates.avatar_url !== undefined) {
        const metaUpdates: Record<string, any> = {};
        if (updates.full_name !== undefined) {
          metaUpdates.full_name = updates.full_name;
          metaUpdates.name = updates.full_name;
        }
        if (updates.avatar_url !== undefined) {
          metaUpdates.avatar_url = updates.avatar_url;
        }
        try {
          await supabase.auth.updateUser({ data: metaUpdates });
        } catch (metaErr) {
          console.warn('[AuthContext] Error updating auth metadata:', metaErr);
        }
      }

      // 3. Keep backend local fallback / API cache in sync
      try {
        const { fetchWithAuth } = await import('@/lib/apiClient');
        const apiRes = await fetchWithAuth('/api/users/me', {
          method: 'PATCH',
          body: JSON.stringify(updates),
        });
        if (!apiRes.ok && apiRes.status !== 404) {
          console.warn(`[AuthContext] Backend sync returned HTTP ${apiRes.status}`);
        }
      } catch (apiErr) {
        console.warn('[AuthContext] Backend sync error:', apiErr);
      }

      setProfile((prev) => (prev ? { ...prev, ...updates } : (updates as UserProfile)));
      return { error: null };
    } catch (err: any) {
      console.error('[AuthContext] Unexpected error updating profile:', err);
      return { error: err };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an <AuthProvider>.');
  }
  return ctx;
};
