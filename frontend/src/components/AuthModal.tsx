'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';

type Tab = 'login' | 'signup';

interface AuthModalProps {
  /** If true, renders as a full-screen gate (no close button). */
  isGate?: boolean;
  onClose?: () => void;
}

export default function AuthModal({ isGate = false, onClose }: AuthModalProps) {
  const { loginWithEmail, signupWithEmail, loginWithGoogle } = useAuth();

  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (tab === 'login') {
        const { error } = await loginWithEmail(email, password);
        if (error) setError(error.message);
      } else {
        if (!fullName.trim()) {
          setError('Full name is required.');
          setLoading(false);
          return;
        }
        const { error } = await signupWithEmail(email, password, fullName);
        if (error) {
          setError(error.message);
        } else {
          setSuccess('Account created! Please check your email to confirm your account.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`${isGate ? 'fixed inset-0 z-50 flex items-center justify-center bg-[#f8f6f2]' : 'relative'}`}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-md bg-white border border-border rounded-xl shadow-2xl p-8 relative"
      >
        {/* Close button (non-gate mode) */}
        {!isGate && onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-muted hover:text-foreground transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        {/* Logo / Wordmark */}
        <div className="mb-8 text-center">
          <div className="font-serif text-2xl text-foreground tracking-tight">RecruitAI</div>
          <p className="text-muted text-sm mt-1">Precision candidate intelligence.</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-[#f3f4f6] rounded-lg p-1 mb-6">
          {(['login', 'signup'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); setSuccess(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                tab === t
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {t === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        {/* Google OAuth Button */}
        <motion.button
          whileHover={{ backgroundColor: '#f3f4f6' }}
          whileTap={{ scale: 0.98 }}
          onClick={loginWithGoogle}
          className="w-full border border-border rounded-lg py-3 flex items-center justify-center gap-3 text-sm font-medium text-foreground mb-5 transition-colors"
        >
          {/* Google SVG Icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </motion.button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-border"></div>
          <span className="text-xs text-muted">or</span>
          <div className="flex-1 h-px bg-border"></div>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <AnimatePresence mode="wait">
            {tab === 'signup' && (
              <motion.div
                key="fullname"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <label className="block text-xs font-medium text-foreground mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full border border-border rounded-lg px-4 py-3 text-sm text-foreground bg-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors"
                  required
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full border border-border rounded-lg px-4 py-3 text-sm text-foreground bg-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              minLength={8}
              className="w-full border border-border rounded-lg px-4 py-3 text-sm text-foreground bg-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors"
              required
            />
          </div>

          {/* Error / Success Messages */}
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
              >
                {error}
              </motion.p>
            )}
            {success && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2"
              >
                {success}
              </motion.p>
            )}
          </AnimatePresence>

          <motion.button
            type="submit"
            disabled={loading}
            whileHover={{ backgroundColor: '#263a66' }}
            whileTap={{ scale: 0.98 }}
            className="w-full bg-accent text-white rounded-lg py-3 text-sm font-semibold disabled:opacity-60 transition-colors mt-2"
          >
            {loading ? 'Please wait…' : tab === 'login' ? 'Sign In' : 'Create Account'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
