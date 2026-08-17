'use client';

import { useState, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { 
  Lock, 
  Mail, 
  User, 
  Eye, 
  EyeOff, 
  Sparkles, 
  ShieldCheck, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle,
  X
} from 'lucide-react';

export type AuthTab = 'login' | 'signup';

export interface AuthModalProps {
  /** If true, renders as a full-screen gate (no close button). */
  isGate?: boolean;
  /** Initial tab to show */
  initialTab?: AuthTab;
  /** Callback on modal close */
  onClose?: () => void;
  /** If true, renders without container wrappers for embedding in pages */
  embedded?: boolean;
}

export default function AuthModal({ 
  isGate = false, 
  initialTab = 'login', 
  onClose,
  embedded = false
}: AuthModalProps) {
  const { loginWithEmail, signupWithEmail, loginWithGoogle } = useAuth();

  const [tab, setTab] = useState<AuthTab>(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  const emailId = useId();
  const passwordId = useId();
  const nameId = useId();

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (tab === 'login') {
        const { error } = await loginWithEmail(email, password);
        if (error) {
          setError(error.message);
        } else {
          setSuccess('Signed in successfully!');
          if (onClose) setTimeout(onClose, 600);
        }
      } else {
        if (!fullName.trim()) {
          setError('Please provide your full name.');
          setLoading(false);
          return;
        }
        if (password.length < 8) {
          setError('Password must be at least 8 characters long.');
          setLoading(false);
          return;
        }
        const { error } = await signupWithEmail(email, password, fullName);
        if (error) {
          setError(error.message);
        } else {
          setSuccess('Account created successfully! You are now logged in.');
          if (onClose) setTimeout(onClose, 800);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    try {
      setError('');
      setGoogleLoading(true);
      await loginWithGoogle();
    } catch (err: any) {
      setError(err?.message || 'Google authentication failed.');
      setGoogleLoading(false);
    }
  };

  const content = (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.96 }}
      transition={{ type: 'spring', damping: 28, stiffness: 350 }}
      className={`w-full max-w-md bg-white/95 backdrop-blur-xl border border-border/80 rounded-2xl shadow-2xl p-8 relative overflow-hidden transition-all ${
        embedded ? 'mx-auto' : ''
      }`}
    >
      {/* Ambient background glow orb */}
      <div className="absolute -top-24 -right-24 w-56 h-56 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-56 h-56 bg-[#059669]/5 rounded-full blur-3xl pointer-events-none" />

      {/* Close button (non-gate mode) */}
      {!isGate && !embedded && onClose && (
        <motion.button
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-5 right-5 text-muted hover:text-foreground transition-colors p-1.5 rounded-full hover:bg-black/5"
        >
          <X className="w-4 h-4" />
        </motion.button>
      )}

      {/* Header & Logo */}
      <div className="mb-6 text-center">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/5 border border-accent/10 text-accent text-xs font-semibold tracking-wide uppercase mb-3"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>RecruitAI Platform</span>
        </motion.div>
        
        <h2 className="font-serif text-2xl md:text-3xl text-foreground tracking-tight">
          {tab === 'login' ? 'Welcome back' : 'Create an account'}
        </h2>
        <p className="text-muted text-xs md:text-sm mt-1.5">
          {tab === 'login' 
            ? 'Sign in to access your recruitment campaigns & AI screening' 
            : 'Get started with automated candidate intelligence'}
        </p>
      </div>

      {/* Smooth Spring Tab Switcher */}
      <div className="flex bg-[#f3f4f6] rounded-xl p-1 mb-6 relative">
        {(['login', 'signup'] as AuthTab[]).map((t) => {
          const isActive = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setError('');
                setSuccess('');
              }}
              className={`flex-1 relative py-2.5 text-xs md:text-sm font-semibold rounded-lg transition-colors z-10 ${
                isActive ? 'text-foreground' : 'text-muted hover:text-foreground'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeAuthTabPill"
                  transition={{ type: 'spring', damping: 30, stiffness: 450 }}
                  className="absolute inset-0 bg-white rounded-lg shadow-sm border border-black/5"
                />
              )}
              <span className="relative z-10 flex items-center justify-center gap-1.5">
                {t === 'login' ? 'Sign In' : 'Create Account'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Google OAuth Button */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.01, backgroundColor: '#f9fafb', borderColor: '#cbd5e1' }}
        whileTap={{ scale: 0.98 }}
        onClick={handleGoogleAuth}
        disabled={googleLoading || loading}
        className="w-full border border-border/90 rounded-xl py-3 px-4 flex items-center justify-center gap-3 text-xs md:text-sm font-semibold text-foreground mb-5 bg-white shadow-xs transition-all disabled:opacity-60 cursor-pointer"
      >
        {googleLoading ? (
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full"
          />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
        )}
        <span>{tab === 'login' ? 'Continue with Google' : 'Sign up with Google'}</span>
      </motion.button>

      {/* Styled Divider */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-px bg-border/80" />
        <span className="text-[11px] font-medium text-muted uppercase tracking-wider">or with email</span>
        <div className="flex-1 h-px bg-border/80" />
      </div>

      {/* Main Email/Password Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <AnimatePresence mode="popLayout">
          {tab === 'signup' && (
            <motion.div
              key="fullname-input"
              initial={{ opacity: 0, height: 0, y: -10 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -10 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
            >
              <label htmlFor={nameId} className="block text-xs font-semibold text-foreground mb-1.5">
                Full Name
              </label>
              <div 
                className={`relative flex items-center rounded-xl border transition-all ${
                  focusedInput === 'name' 
                    ? 'border-accent ring-2 ring-accent/15 bg-white shadow-xs' 
                    : 'border-border bg-white hover:border-slate-300'
                }`}
              >
                <div className="pl-3.5 text-muted">
                  <User className={`w-4 h-4 transition-colors ${focusedInput === 'name' ? 'text-accent' : ''}`} />
                </div>
                <input
                  id={nameId}
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onFocus={() => setFocusedInput('name')}
                  onBlur={() => setFocusedInput(null)}
                  placeholder="Jane Doe"
                  className="w-full px-3 py-2.5 text-sm text-foreground bg-transparent placeholder:text-muted/70 focus:outline-none"
                  required={tab === 'signup'}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Email Address */}
        <div>
          <label htmlFor={emailId} className="block text-xs font-semibold text-foreground mb-1.5">
            Email Address
          </label>
          <div 
            className={`relative flex items-center rounded-xl border transition-all ${
              focusedInput === 'email' 
                ? 'border-accent ring-2 ring-accent/15 bg-white shadow-xs' 
                : 'border-border bg-white hover:border-slate-300'
            }`}
          >
            <div className="pl-3.5 text-muted">
              <Mail className={`w-4 h-4 transition-colors ${focusedInput === 'email' ? 'text-accent' : ''}`} />
            </div>
            <input
              id={emailId}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocusedInput('email')}
              onBlur={() => setFocusedInput(null)}
              placeholder="you@company.com"
              className="w-full px-3 py-2.5 text-sm text-foreground bg-transparent placeholder:text-muted/70 focus:outline-none"
              required
            />
          </div>
        </div>

        {/* Password with Show/Hide toggle */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor={passwordId} className="block text-xs font-semibold text-foreground">
              Password
            </label>
            {tab === 'login' && (
              <span className="text-[11px] text-muted hover:text-accent cursor-pointer transition-colors">
                Forgot password?
              </span>
            )}
          </div>
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
              placeholder={tab === 'signup' ? 'Min 8 characters' : 'Enter your password'}
              minLength={8}
              className="w-full px-3 py-2.5 text-sm text-foreground bg-transparent placeholder:text-muted/70 focus:outline-none pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 text-muted hover:text-foreground transition-colors p-1"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Animated Password Strength Bar for Signup */}
          <AnimatePresence>
            {tab === 'signup' && password.length > 0 && (
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

        {/* Dynamic Alerts with Spring Shake Physics */}
        <AnimatePresence mode="wait">
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
          {success && (
            <motion.div
              key="success-alert"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
              className="flex items-start gap-2.5 text-xs text-emerald-800 bg-emerald-50/90 border border-emerald-200/80 rounded-xl px-3.5 py-2.5 shadow-xs"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{success}</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit Action Button with Shimmer Effect */}
        <motion.button
          type="submit"
          disabled={loading || googleLoading}
          whileHover={{ scale: 1.01, backgroundColor: '#263a66' }}
          whileTap={{ scale: 0.98 }}
          className="relative w-full bg-accent text-white rounded-xl py-3 px-4 text-xs md:text-sm font-semibold shadow-md hover:shadow-lg disabled:opacity-60 transition-all overflow-hidden mt-3 cursor-pointer"
        >
          {/* Subtle Shimmer Ray */}
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
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span>{tab === 'login' ? 'Sign In to Dashboard' : 'Create Free Account'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </span>
        </motion.button>
      </form>

      {/* Security & Multi-Tenant Badge */}
      <div className="mt-6 pt-5 border-t border-border/80 flex items-center justify-center gap-2 text-[11px] text-muted">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
        <span>Enterprise Row-Level Security & pgvector isolation</span>
      </div>
    </motion.div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className={isGate ? 'fixed inset-0 z-50 flex items-center justify-center bg-[#f8f6f2]/90 backdrop-blur-md p-4' : 'relative'}>
      {content}
    </div>
  );
}
