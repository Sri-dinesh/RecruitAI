'use client';

import { useState, useEffect, useId, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { createSupabaseClient } from '@/lib/supabaseClient';
import Logo from '@/components/brand/Logo';
import { 
  Lock, 
  Eye, 
  EyeOff, 
  KeyRound, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  ShieldCheck, 
  ArrowLeft,
  Sparkles
} from 'lucide-react';

function ResetPasswordContent() {
  const router = useRouter();
  const { updatePassword, user, loading: authLoading } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [hasValidSession, setHasValidSession] = useState<boolean | null>(null);

  const passwordId = useId();
  const confirmPasswordId = useId();

  // Check if recovery session or user session is active
  useEffect(() => {
    const supabase = createSupabaseClient();

    const initAuth = async () => {
      // 1. Check for PKCE authorization code in query parameters
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        if (code) {
          try {
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);
            if (!error && data.session) {
              setHasValidSession(true);
              return;
            }
          } catch (e) {
            console.warn('[ResetPassword] Code exchange error:', e);
          }
        }

        // 2. Check for access_token in hash fragment
        const hash = window.location.hash || '';
        if (hash.includes('access_token=')) {
          try {
            const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');
            if (accessToken && refreshToken) {
              const { data, error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              if (!error && data.session) {
                setHasValidSession(true);
                return;
              }
            }
          } catch (e) {
            console.warn('[ResetPassword] Hash token session error:', e);
          }
        }
      }

      // 3. Check existing session
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setHasValidSession(true);
      } else {
        // Wait briefly in case background token refresh or event listener catches it
        setTimeout(async () => {
          const { data: { session: retrySession } } = await supabase.auth.getSession();
          setHasValidSession(!!retrySession);
        }, 1200);
      }
    };

    initAuth();

    // Also listen for PASSWORD_RECOVERY auth event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setHasValidSession(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Automatic redirect countdown upon success
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (success && countdown > 0) {
      timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000);
    } else if (success && countdown === 0) {
      router.replace('/dashboard');
    }
    return () => clearTimeout(timer);
  }, [success, countdown, router]);

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: '', color: 'bg-border' };
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-rose-500' };
    if (score === 2) return { score: 2, label: 'Fair', color: 'bg-amber-500' };
    if (score === 3) return { score: 3, label: 'Good', color: 'bg-blue-500' };
    return { score: 4, label: 'Strong', color: 'bg-emerald-500' };
  };

  const passStrength = getPasswordStrength(password);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please ensure both fields are identical.');
      return;
    }

    setLoading(true);

    try {
      const supabase = createSupabaseClient();
      const res = await supabase.auth.updateUser({ password });
      let updateError: { message: string } | null = res.error;
      if (updateError) {
        const fallbackRes = await updatePassword(password);
        updateError = fallbackRes.error;
      }
      if (updateError) {
        setError(updateError.message);
      } else {
        setSuccess(true);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update password. Please request a new reset link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F6F2] flex flex-col justify-between relative overflow-hidden">
      {/* Ambient background glow orbs */}
      <motion.div 
        animate={{ 
          scale: [1, 1.15, 1],
          opacity: [0.35, 0.5, 0.35],
          x: [0, 20, 0],
          y: [0, -20, 0]
        }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -top-40 -left-40 w-96 h-96 bg-accent/10 rounded-full blur-3xl pointer-events-none" 
      />
      <motion.div 
        animate={{ 
          scale: [1, 1.2, 1],
          opacity: [0.25, 0.45, 0.25],
          x: [0, -30, 0],
          y: [0, 30, 0]
        }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        className="absolute -bottom-40 -right-40 w-[30rem] h-[30rem] bg-[#059669]/10 rounded-full blur-3xl pointer-events-none" 
      />

      {/* Header */}
      <header className="px-6 md:px-12 py-6 max-w-7xl w-full mx-auto flex items-center justify-between z-10">
        <Link 
          href="/auth?tab=login" 
          className="inline-flex items-center gap-2 text-xs md:text-sm font-semibold text-muted hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 text-muted group-hover:text-foreground transition-colors" />
          <span>Back to Sign In</span>
        </Link>

        <Logo href="/" size="md" priority />
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 max-w-md w-full mx-auto z-10">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', damping: 28, stiffness: 350 }}
          className="w-full bg-white/95 backdrop-blur-xl border border-border/80 rounded-2xl shadow-2xl p-8 relative overflow-hidden"
        >
          {/* Ambient inner glow */}
          <div className="absolute -top-24 -right-24 w-56 h-56 bg-accent/5 rounded-full blur-3xl pointer-events-none" />

          {/* Success Screen */}
          {success ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="text-center py-6 space-y-4"
            >
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-200/80 shadow-xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="font-serif text-2xl md:text-3xl text-foreground">Password Reset Complete</h2>
              <p className="text-muted text-xs md:text-sm leading-relaxed">
                Your password has been successfully updated with 256-bit encryption. Redirecting you to your dashboard in <strong className="text-foreground">{countdown}s</strong>…
              </p>
              <div className="pt-4">
                <Link
                  href="/dashboard"
                  className="w-full inline-flex items-center justify-center gap-2 bg-accent text-white rounded-xl py-3 px-4 text-xs md:text-sm font-semibold shadow-md hover:bg-[#263a66] transition-colors"
                >
                  <span>Go to Dashboard Now</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </motion.div>
          ) : hasValidSession === false ? (
            /* Expired / Invalid Token Screen */
            <div className="text-center py-4 space-y-4">
              <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto border border-rose-200/80">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h2 className="font-serif text-2xl text-foreground">Link Expired or Invalid</h2>
              <p className="text-muted text-xs md:text-sm leading-relaxed">
                This password reset link has expired or has already been used. Please request a fresh reset link to continue.
              </p>
              <div className="pt-2">
                <Link
                  href="/auth?tab=forgot"
                  className="w-full inline-flex items-center justify-center gap-2 bg-accent text-white rounded-xl py-3 px-4 text-xs md:text-sm font-semibold shadow-md hover:bg-[#263a66] transition-colors"
                >
                  <span>Request New Reset Link</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ) : (
            /* Standard Password Reset Form */
            <>
              <div className="mb-6 text-center">
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/5 border border-accent/10 text-accent text-xs font-semibold tracking-wide uppercase mb-3"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Secure Password Reset</span>
                </motion.div>
                
                <h2 className="font-serif text-2xl md:text-3xl text-foreground tracking-tight">
                  Set new password
                </h2>
                <p className="text-muted text-xs md:text-sm mt-1.5">
                  Please choose a strong password with at least 8 characters.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* New Password */}
                <div>
                  <label htmlFor={passwordId} className="block text-xs font-semibold text-foreground mb-1.5">
                    New Password
                  </label>
                  <div 
                    className={`relative flex items-center rounded-xl border transition-all ${
                      focusedInput === 'password' 
                        ? 'border-accent ring-2 ring-accent/15 bg-white shadow-xs' 
                        : 'border-border bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="pl-3.5 text-muted">
                      <Lock className={`w-4 h-4 transition-colors ${focusedInput === 'password' ? 'text-accent' : ''}`} />
                    </div>
                    <input
                      id={passwordId}
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setFocusedInput('password')}
                      onBlur={() => setFocusedInput(null)}
                      placeholder="Minimum 8 characters"
                      minLength={8}
                      className="w-full px-3 py-2.5 text-sm text-foreground bg-transparent placeholder:text-muted/70 focus:outline-none pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 text-muted hover:text-foreground transition-colors p-1 cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Password Strength Meter */}
                  <AnimatePresence>
                    {password.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="mt-2"
                      >
                        <div className="flex items-center justify-between text-[11px] text-muted mb-1">
                          <span>Password strength:</span>
                          <span className="font-semibold text-foreground">{passStrength.label}</span>
                        </div>
                        <div className="flex gap-1.5 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          {[1, 2, 3, 4].map((step) => (
                            <motion.div
                              key={step}
                              className={`flex-1 rounded-full transition-colors duration-300 ${
                                passStrength.score >= step ? passStrength.color : 'bg-transparent'
                              }`}
                            />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Confirm Password */}
                <div>
                  <label htmlFor={confirmPasswordId} className="block text-xs font-semibold text-foreground mb-1.5">
                    Confirm New Password
                  </label>
                  <div 
                    className={`relative flex items-center rounded-xl border transition-all ${
                      focusedInput === 'confirmPassword' 
                        ? 'border-accent ring-2 ring-accent/15 bg-white shadow-xs' 
                        : passwordsMismatch 
                          ? 'border-rose-400 bg-rose-50/20' 
                          : passwordsMatch 
                            ? 'border-emerald-400 bg-emerald-50/20'
                            : 'border-border bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="pl-3.5 text-muted">
                      <Lock className={`w-4 h-4 transition-colors ${focusedInput === 'confirmPassword' ? 'text-accent' : ''}`} />
                    </div>
                    <input
                      id={confirmPasswordId}
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onFocus={() => setFocusedInput('confirmPassword')}
                      onBlur={() => setFocusedInput(null)}
                      placeholder="Re-enter your new password"
                      minLength={8}
                      className="w-full px-3 py-2.5 text-sm text-foreground bg-transparent placeholder:text-muted/70 focus:outline-none pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 text-muted hover:text-foreground transition-colors p-1 cursor-pointer"
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Match Indicator */}
                  {passwordsMatch && (
                    <p className="text-[11px] text-emerald-600 flex items-center gap-1 mt-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Passwords match</span>
                    </p>
                  )}
                  {passwordsMismatch && (
                    <p className="text-[11px] text-rose-600 flex items-center gap-1 mt-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Passwords do not match yet</span>
                    </p>
                  )}
                </div>

                {/* Error Alert with Spring Shake Physics */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      key="error-alert"
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ 
                        opacity: 1, 
                        y: 0, 
                        scale: 1,
                        x: [0, -8, 8, -4, 4, -2, 2, 0] 
                      }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.4 }}
                      className="flex items-start gap-2.5 text-xs text-rose-700 bg-rose-50/90 border border-rose-200/80 rounded-xl px-3.5 py-2.5 shadow-xs"
                    >
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div className="flex-1 leading-relaxed">{error}</div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit Action Button with Shimmer */}
                <motion.button
                  type="submit"
                  disabled={loading || password.length < 8 || passwordsMismatch}
                  whileHover={{ scale: 1.01, backgroundColor: '#263a66' }}
                  whileTap={{ scale: 0.98 }}
                  className="relative w-full bg-accent text-white rounded-xl py-3 px-4 text-xs md:text-sm font-semibold shadow-md hover:shadow-lg disabled:opacity-60 transition-all overflow-hidden mt-2 cursor-pointer"
                >
                  <motion.div
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut', repeatDelay: 1 }}
                    className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/15 to-transparent skew-x-12 pointer-events-none"
                  />

                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {loading ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                          className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                        />
                        <span>Updating Password...</span>
                      </>
                    ) : (
                      <>
                        <span>Update Password & Sign In</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </span>
                </motion.button>
              </form>

              {/* Security Badge */}
              <div className="mt-6 pt-5 border-t border-border/80 flex items-center justify-center gap-2 text-[11px] text-muted">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Protected by Supabase Auth PKCE Cryptography</span>
              </div>
            </>
          )}
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="px-6 md:px-12 py-5 max-w-7xl w-full mx-auto flex items-center justify-center text-xs text-muted border-t border-border/60 z-10">
        <div>© {new Date().getFullYear()} RecruitAI Platform. All rights reserved.</div>
      </footer>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F8F6F2] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
