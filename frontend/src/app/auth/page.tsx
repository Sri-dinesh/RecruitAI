'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import AuthModal, { AuthTab } from '@/components/AuthModal';
import { 
  ArrowLeft, 
  Bot, 
  Sparkles, 
  CheckCircle2, 
  TrendingUp, 
  Zap, 
  Users, 
  FileText
} from 'lucide-react';

function AuthContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  
  const tabParam = searchParams.get('tab') as AuthTab;
  const initialTab: AuthTab = tabParam === 'signup' ? 'signup' : tabParam === 'forgot' ? 'forgot' : 'login';

  // If already logged in, redirect to dashboard smoothly
  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-[#F8F6F2] flex flex-col justify-between relative overflow-hidden">
      {/* Dynamic Ambient Background Orbs */}
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

      {/* Top Navigation */}
      <header className="px-6 md:px-12 py-6 max-w-7xl w-full mx-auto flex items-center justify-between z-10">
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-xs md:text-sm font-semibold text-muted hover:text-foreground transition-colors group"
        >
          <motion.div
            whileHover={{ x: -3 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4 text-muted group-hover:text-foreground transition-colors" />
            <span>Back to Home</span>
          </motion.div>
        </Link>

        <Link href="/" className="font-serif font-semibold text-xl md:text-2xl tracking-tight text-foreground">
          RecruitAI<span className="text-accent">.</span>
        </Link>
      </header>

      {/* Main Split Grid */}
      <main className="flex-1 flex items-center justify-center px-4 md:px-12 py-8 max-w-7xl w-full mx-auto z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center w-full">
          
          {/* Left Hero & Feature Showcase (Visible on lg+) */}
          <div className="hidden lg:flex lg:col-span-6 flex-col justify-center space-y-8 pr-4">
            
            {/* Tagline Badge */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-border shadow-xs w-fit"
            >
              <Bot className="w-4 h-4 text-accent" />
              <span className="text-xs font-semibold text-foreground">Agentic Recruitment Engine</span>
            </motion.div>

            {/* Headline */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="space-y-3"
            >
              <h1 className="font-serif text-4xl xl:text-5xl text-foreground leading-[1.15] tracking-tight">
                Hire 10x faster with <span className="italic text-accent font-normal">precision AI</span> intelligence.
              </h1>
              <p className="text-muted text-base leading-relaxed max-w-lg">
                Automate resume screening, run blind unbiased skill evaluations, and orchestrate interview scheduling in seconds.
              </p>
            </motion.div>

            {/* Floating Live AI Screening Card Demo */}
            <motion.div
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.35 }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="bg-white/90 backdrop-blur-md border border-border rounded-2xl p-5 shadow-xl space-y-4 max-w-md relative overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent font-semibold text-sm">
                    AC
                  </div>
                  <div>
                    <div className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                      Alex Chen
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
                        94% Match
                      </span>
                    </div>
                    <div className="text-xs text-muted">Senior AI Engineer Candidate</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Top Pick</span>
                </div>
              </div>

              {/* Matched Skills Pills */}
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <span className="bg-slate-100 text-foreground px-2.5 py-1 rounded-md font-medium">✓ LangGraph</span>
                <span className="bg-slate-100 text-foreground px-2.5 py-1 rounded-md font-medium">✓ FastAPI</span>
                <span className="bg-slate-100 text-foreground px-2.5 py-1 rounded-md font-medium">✓ pgvector RAG</span>
                <span className="bg-slate-100 text-foreground px-2.5 py-1 rounded-md font-medium">✓ Python 3.14</span>
              </div>

              {/* Mini AI Summary */}
              <div className="text-xs text-muted/90 bg-[#F8F6F2] p-3 rounded-xl border border-border/80 leading-relaxed font-sans">
                &ldquo;Exceptional architectural depth with multi-agent orchestration. Exceeds experience criteria with verified production deployment history.&rdquo;
              </div>
            </motion.div>

            {/* Feature Bullets */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="grid grid-cols-2 gap-4 max-w-md pt-2"
            >
              <div className="flex items-center gap-2.5 text-xs text-foreground font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>pgvector RAG Search</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-foreground font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Blind Evaluation Guardrails</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-foreground font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Multi-Tenant Row Security</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-foreground font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>1-Click PDF Reports</span>
              </div>
            </motion.div>
          </div>

          {/* Right Column: Interactive Animated Auth Card */}
          <div className="col-span-1 lg:col-span-6 flex justify-center w-full">
            <AuthModal embedded={true} initialTab={initialTab} />
          </div>

        </div>
      </main>

      {/* Subtle Footer */}
      <footer className="px-6 md:px-12 py-5 max-w-7xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-muted border-t border-border/60 z-10">
        <div>© {new Date().getFullYear()} RecruitAI Platform. All rights reserved.</div>
        <div className="flex items-center gap-6 mt-2 sm:mt-0">
          <Link href="/" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <Link href="/" className="hover:text-foreground transition-colors">Terms of Service</Link>
          <Link href="/" className="hover:text-foreground transition-colors">Documentation</Link>
        </div>
      </footer>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F8F6F2] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AuthContent />
    </Suspense>
  );
}
