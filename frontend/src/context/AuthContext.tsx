'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createSupabaseClient } from '@/lib/supabaseClient';
import type { User, Session } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signupWithEmail: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createSupabaseClient();

  useEffect(() => {
    // Hydrate existing session on mount
    const initAuth = async () => {
      const { data: { session: existing } } = await supabase.auth.getSession();
      setSession(existing);
      setUser(existing?.user ?? null);
      setLoading(false);
    };
    initAuth();

    // Subscribe to auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auth Actions ─────────────────────────────────────────────────────────

  const loginWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signupWithEmail = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    return { error: error as Error | null };
  };

  const loginWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`,
      },
    });
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, loginWithEmail, signupWithEmail, loginWithGoogle, logout }}
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
