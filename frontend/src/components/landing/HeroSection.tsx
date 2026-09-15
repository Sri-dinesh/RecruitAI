'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import PlayStoreBadge from '@/components/brand/PlayStoreBadge';

// Continuous Typing Effect Component
const Typewriter = ({ strings }: { strings: string[] }) => {
  const [text, setText] = useState('');
  const [stringIndex, setStringIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentString = strings[stringIndex];
    const typeSpeed = isDeleting ? 25 : 50;

    const timeout = setTimeout(() => {
      if (!isDeleting && text === currentString) {
        setTimeout(() => setIsDeleting(true), 2000);
      } else if (isDeleting && text === '') {
        setIsDeleting(false);
        setStringIndex((prev) => (prev + 1) % strings.length);
      } else {
        setText(currentString.slice(0, text.length + (isDeleting ? -1 : 1)));
      }
    }, typeSpeed);

    return () => clearTimeout(timeout);
  }, [text, isDeleting, stringIndex, strings]);

  return (
    <span>
      {text}
      <span className="animate-pulse font-normal ml-0.5 inline-block -translate-y-0.5 opacity-60">|</span>
    </span>
  );
};

// Helper to wrap words for GSAP animation
const wrapWords = (text: string) => {
  return text.split(' ').map((word, index) => (
    <span key={index} className="inline-block overflow-hidden pb-1">
      <span className="hero-word inline-block">{word}</span>
      <span className="inline-block">&nbsp;</span>
    </span>
  ));
};

export default function HeroSection() {
  const { user, loading: authLoading } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isAuth = mounted && !authLoading && !!user;

  return (
    <section className="pt-16 pb-20 md:pt-28 md:pb-28 px-8 max-w-7xl mx-auto flex flex-col items-center text-center">
      {/* Top Status Pill */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-border shadow-xs mb-6"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          AI Candidate Screening • Web & Android
        </span>
      </motion.div>

      {/* Main Headline */}
      <h1 className="font-serif text-[42px] sm:text-[60px] md:text-[80px] leading-[1.08] tracking-tight text-foreground max-w-4xl mx-auto mb-6">
        {wrapWords("Screen resumes in seconds. Hire the right talent.")}
      </h1>

      {/* Straightforward Subheadline */}
      <p className="hero-sub text-lg md:text-xl text-muted max-w-2xl mx-auto mb-10 font-normal leading-relaxed">
        Upload your job description and resumes. RecruitAI instantly scores candidates against your role criteria, highlights skill gaps, and redacts personal info to eliminate bias — with you in full control.
      </p>

      {/* Action Buttons */}
      <div className="hero-sub flex flex-col sm:flex-row items-center justify-center gap-3.5 mb-5">
        {isAuth ? (
          <>
            <motion.div
              className="bg-accent rounded-lg shadow-sm"
              whileHover={{ backgroundColor: '#263a66', scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.12 }}
            >
              <Link
                href="/dashboard"
                className="text-white font-semibold text-base px-8 py-3.5 flex items-center gap-2"
              >
                <span>Go to Dashboard</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
            </motion.div>
            <Link
              href="#how-it-works"
              className="text-base font-medium text-foreground border border-border bg-white px-8 py-3.5 rounded-lg hover:bg-[#faf9f7] hover:border-foreground/30 transition-all shadow-2xs"
            >
              How it works
            </Link>
          </>
        ) : (
          <>
            <motion.div
              className="bg-accent rounded-lg shadow-sm"
              whileHover={{ backgroundColor: '#263a66', scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.12 }}
            >
              <Link
                href="/auth?tab=signup"
                className="text-white font-semibold text-base px-8 py-3.5 flex items-center gap-2"
              >
                <span>Start Screening Free</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
            </motion.div>
            <Link
              href="/auth?tab=login"
              className="text-base font-semibold text-foreground border border-border bg-white px-8 py-3.5 rounded-lg hover:bg-[#faf9f7] hover:border-foreground/30 transition-all shadow-2xs"
            >
              Log In
            </Link>
          </>
        )}
      </div>

      {/* Play Store App Download Pill */}
      <div className="hero-sub mb-12 flex items-center justify-center">
        <PlayStoreBadge variant="banner" theme="light" />
      </div>

      {/* Live Workspace Preview */}
      <motion.div
        className="hero-sub w-full max-w-5xl mx-auto border border-border bg-white rounded-xl shadow-2xl overflow-hidden text-left"
        whileHover={{ y: -3, transition: { duration: 0.25 } }}
      >
        {/* Window Chrome Header */}
        <div className="bg-[#fcfcfc] border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]" />
          </div>
          <span className="text-[11px] font-mono tracking-wider uppercase text-muted">
            RecruitAI Workspace — Senior Full-Stack Engineer
          </span>
          <span className="hidden sm:inline text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-semibold">
            Active Campaign
          </span>
        </div>

        <div className="flex h-[460px] text-sm">
          {/* Sidebar */}
          <div className="hidden md:flex w-64 border-r border-border bg-[#faf9f7] p-4 flex-col gap-4">
            <div className="font-serif font-semibold text-foreground text-base mb-1">Your Requisitions</div>
            <div className="w-full bg-accent text-white py-2.5 rounded-md font-medium text-xs flex items-center justify-center gap-2 shadow-xs">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Upload Resumes
            </div>
            <div className="space-y-2 mt-2">
              <div className="bg-white border border-border p-3 rounded-md shadow-xs border-l-2 border-l-accent">
                <div className="font-semibold text-foreground text-xs">Senior Full-Stack Engineer</div>
                <div className="text-[11px] text-muted mt-1">28 Resumes Scored</div>
                <span className="inline-block mt-2 text-[10px] uppercase font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded">
                  Blind Mode Active
                </span>
              </div>
              <div className="p-3 rounded-md text-muted bg-white border border-border">
                <div className="font-medium text-xs text-foreground">Scoring Criteria</div>
                <div className="text-[11px] text-muted mt-1">React, Node.js, PostgreSQL</div>
              </div>
              <div className="p-3 rounded-md text-muted bg-white border border-border">
                <div className="font-medium text-xs text-foreground">Interview Questions</div>
                <div className="text-[11px] text-muted mt-1">Auto-generated for gaps</div>
              </div>
            </div>
            <p className="text-[11px] text-muted leading-relaxed mt-auto pt-3 border-t border-border">
              Scored automatically against role criteria. Export anytime to Greenhouse or Lever.
            </p>
          </div>

          {/* Main Co-Pilot Interaction */}
          <div className="flex-1 bg-white flex flex-col relative">
            <div className="border-b border-border p-4 flex justify-between items-center bg-white/90 backdrop-blur-xs z-10">
              <div className="font-semibold text-foreground text-sm flex items-center gap-2">
                <span>AI Hiring Assistant</span>
                <span className="text-xs text-muted font-normal">• Ask anything about candidates</span>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono bg-slate-100 text-muted px-2.5 py-1 rounded-full uppercase border border-border">
                Human Confirmation Required
              </div>
            </div>

            <div className="flex-1 p-6 overflow-hidden flex flex-col gap-5 relative">
              {/* User message */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex gap-3 items-start flex-row-reverse"
              >
                <div className="w-8 h-8 rounded-full bg-foreground shrink-0 flex items-center justify-center text-white text-xs font-semibold">You</div>
                <div className="bg-foreground text-white px-4 py-3 rounded-2xl rounded-tr-sm max-w-[85%] leading-relaxed shadow-xs text-sm">
                  Who are the top candidates with verified PostgreSQL optimization and high-scale API experience?
                </div>
              </motion.div>

              {/* AI message */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="flex gap-3 items-start"
              >
                <div className="w-8 h-8 rounded-full bg-accent shrink-0 flex items-center justify-center text-white text-xs font-semibold">AI</div>
                <div className="bg-[#f8f6f2] border border-border px-4 py-3.5 rounded-2xl rounded-tl-sm max-w-[88%] leading-relaxed text-foreground shadow-xs text-sm">
                  <p className="mb-2.5">
                    Found 3 strong matches. The top candidate is <span className="font-bold text-accent">Candidate #4102</span> with an overall <span className="font-bold text-emerald-700 font-mono">94% Rubric Match</span>:
                  </p>
                  <div className="bg-white border border-border rounded-lg p-3 text-xs space-y-1.5 font-sans">
                    <div className="flex items-center gap-2 text-foreground font-medium">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span><strong>PostgreSQL:</strong> 6+ years experience, query optimization & index tuning</span>
                    </div>
                    <div className="flex items-center gap-2 text-foreground font-medium">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span><strong>High-Scale APIs:</strong> Scaled Node.js microservices to 150k daily active users</span>
                    </div>
                    <div className="flex items-center gap-2 text-amber-700">
                      <span className="font-bold">△</span>
                      <span><strong>Minor Gap:</strong> Limited GraphQL experience (easy to ramp up)</span>
                    </div>
                  </div>
                  <p className="mt-2.5 text-xs text-muted">
                    Blind mode is ON. Candidate identity is hidden until you choose to reveal it.
                  </p>
                </div>
              </motion.div>
            </div>

            {/* Input Bar */}
            <div className="p-4 bg-white border-t border-border mt-auto">
              <div className="border border-border rounded-lg flex items-center px-4 py-3 bg-[#faf9f7] shadow-2xs">
                <span className="text-muted flex-1 text-sm">
                  <Typewriter strings={[
                    "Show candidates with 5+ years of React experience...",
                    "Draft an interview invite email for Candidate #4102...",
                    "What questions should we ask about distributed caching?",
                    "Export top 5 shortlisted profiles to Greenhouse...",
                  ]} />
                </span>
                <div className="w-7 h-7 bg-accent rounded flex items-center justify-center shadow-xs ml-auto shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </div>
              </div>
              <p className="text-[11px] text-muted mt-2 text-center">
                Drafts and recommendations always require your confirmation before sending.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
