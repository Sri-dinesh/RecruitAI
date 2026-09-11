'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

// Continuous Typing Effect Component — generic prompts, no personal data
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
  return (
    <section className="pt-20 pb-24 md:pt-32 md:pb-32 px-8 max-w-7xl mx-auto flex flex-col items-center text-center">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-border shadow-sm mb-6"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs font-semibold tracking-widest uppercase text-muted">Multi-Agent Hiring Intelligence</span>
      </motion.div>

      <h1 className="font-serif text-[48px] md:text-[84px] leading-[1.05] tracking-tight text-foreground max-w-4xl mx-auto mb-8">
        {wrapWords("Precision candidate intelligence.")}
      </h1>
      <p className="hero-sub text-lg md:text-xl text-muted max-w-2xl mx-auto mb-10 font-medium leading-relaxed">
        RecruitAI helps hiring teams automate resume screening, run blind unbiased evaluations, and orchestrate interviews — with human approval at every critical step.
      </p>

      <div className="hero-sub flex flex-col sm:flex-row items-center gap-4 mb-12">
        <motion.div
          className="bg-accent rounded-md inline-block shadow-sm"
          whileHover={{ backgroundColor: '#263a66' }}
          transition={{ duration: 0.12 }}
        >
          <Link href="/dashboard" className="text-white font-medium text-base px-8 py-4 block">
            Start screening candidates
          </Link>
        </motion.div>
        <Link
          href="#how-it-works"
          className="text-sm font-semibold text-foreground border border-border bg-white px-8 py-4 rounded-md hover:bg-[#faf9f7] transition-colors"
        >
          See how it works
        </Link>
      </div>

      <p className="hero-sub text-xs text-muted max-w-xl mx-auto mb-16 leading-relaxed">
        Built for recruiters and hiring managers. No personal demo profiles shown — screening previews below use anonymized, illustrative placeholders.
      </p>

      {/* Legit product preview — no personal names, emails or candidate counts */}
      <motion.div
        className="hero-sub w-full max-w-5xl mx-auto border border-border bg-white rounded-xl shadow-2xl overflow-hidden"
        whileHover={{ y: -4, transition: { duration: 0.3 } }}
      >
        {/* Window Chrome */}
        <div className="bg-[#fcfcfc] border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e]"></div>
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]"></div>
            <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]"></div>
          </div>
          <span className="text-[11px] font-mono tracking-widest uppercase text-muted">RecruitAI Workspace — Preview</span>
          <span className="hidden sm:inline text-[10px] font-mono bg-accent/10 text-accent px-2 py-1 rounded uppercase tracking-wider">Illustrative preview</span>
        </div>

        <div className="flex h-[460px] text-left text-sm">
          {/* Sidebar — abstract, no personal counts tied to fake people */}
          <div className="hidden md:flex w-64 border-r border-border bg-[#faf9f7] p-4 flex-col gap-4">
            <div className="font-serif font-semibold text-foreground text-base mb-1">Campaigns</div>
            <div className="w-full bg-accent text-white py-2.5 rounded-md font-medium text-xs flex items-center justify-center gap-2 shadow-sm">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              New Campaign
            </div>
            <div className="space-y-2 mt-2">
              <div className="bg-white border border-border p-3 rounded-md shadow-sm border-l-2 border-l-accent">
                <div className="font-medium text-foreground text-sm">Active Hiring Campaign</div>
                <div className="text-xs text-muted mt-1">Job description loaded</div>
                <span className="inline-block mt-2 text-[10px] tracking-widest uppercase font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded">Blind mode on</span>
              </div>
              <div className="p-3 rounded-md text-muted bg-white border border-border">
                <div className="font-medium text-sm text-foreground">Evaluation Rubric</div>
                <div className="text-xs mt-1">Role-specific grading criteria</div>
              </div>
              <div className="p-3 rounded-md text-muted bg-white border border-border">
                <div className="font-medium text-sm text-foreground">Outreach Templates</div>
                <div className="text-xs mt-1">Human-approved sending</div>
              </div>
            </div>
            <p className="text-[11px] text-muted leading-relaxed mt-auto pt-3 border-t border-border">No real candidate data shown. Replace with your own jobs and resumes after sign-in.</p>
          </div>

          {/* Main Chat Area — anonymized interaction */}
          <div className="flex-1 bg-white flex flex-col relative">
            <div className="border-b border-border p-4 flex justify-between items-center bg-white/80 backdrop-blur-sm z-10">
              <div className="font-medium text-foreground text-sm">Co-Pilot — Ask about your pipeline</div>
              <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono bg-slate-100 text-muted px-2 py-1 rounded uppercase tracking-wider border border-border">Human-in-the-loop</div>
            </div>

            <div className="flex-1 p-6 overflow-hidden flex flex-col gap-6 relative">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="flex gap-4 items-start flex-row-reverse"
              >
                <div className="w-8 h-8 rounded-full bg-foreground shrink-0 flex items-center justify-center text-white text-xs">You</div>
                <div className="bg-foreground text-white px-4 py-3 rounded-2xl rounded-tr-sm max-w-[85%] leading-relaxed shadow-sm text-sm">
                  Summarize how the top-ranked profile aligns with the job requirements.
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1 }}
                className="flex gap-4 items-start"
              >
                <div className="w-8 h-8 rounded-full bg-accent shrink-0 flex items-center justify-center text-white text-xs">AI</div>
                <div className="bg-[#f8f6f2] border border-border px-4 py-3 rounded-2xl rounded-tl-sm max-w-[85%] leading-relaxed text-foreground shadow-sm text-sm">
                  <p className="mb-3">
                    Top-ranked <span className="font-semibold">anonymized profile (Profile A)</span> shows strong alignment with the structured role criteria.
                  </p>
                  <div className="bg-white border border-border rounded-lg p-3 text-xs font-mono">
                    <div className="text-muted mb-2 uppercase tracking-widest text-[10px] font-semibold">Alignment summary — illustrative</div>
                    <ul className="list-disc pl-4 space-y-1.5 text-foreground/80 font-sans text-xs">
                      <li>Matches required stack from structured JD (e.g., React, TypeScript)</li>
                      <li>Meets experience threshold defined in rubric</li>
                      <li>Evaluation performed with personal identifiers redacted</li>
                    </ul>
                  </div>
                  <p className="mt-3 text-xs text-muted">Scores are computed against your rubric. No personal identifiers are used in blind evaluations.</p>
                </div>
              </motion.div>
            </div>

            {/* Input Area — generic prompts */}
            <div className="p-4 bg-white border-t border-border mt-auto">
              <div className="border border-border rounded-lg flex items-center px-4 py-3 bg-[#faf9f7] shadow-sm">
                <span className="text-muted flex-1 text-sm font-medium">
                  <Typewriter strings={[
                    "Summarize alignment for top profile...",
                    "Show me rubric scores for this role...",
                    "Generate interview questions for gaps...",
                    "Draft outreach — professional tone...",
                  ]} />
                </span>
                <div className="w-7 h-7 bg-accent rounded flex items-center justify-center shadow-sm ml-auto shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </div>
              </div>
              <p className="text-[11px] text-muted mt-2 text-center">AI assistance gated by human approval for emails and calendar actions.</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Compliance note for Play Store — must be visible on landing */}
      <div className="hero-sub mt-8 flex flex-wrap justify-center gap-4 text-xs">
        <Link href="/privacy" className="underline decoration-border underline-offset-4 hover:text-foreground text-muted">Privacy Policy</Link>
        <span className="text-border">•</span>
        <Link href="/terms" className="underline decoration-border underline-offset-4 hover:text-foreground text-muted">Terms & Conditions</Link>
        <span className="text-border">•</span>
        <Link href="/support" className="underline decoration-border underline-offset-4 hover:text-foreground text-muted">Support</Link>
        <span className="text-border">•</span>
        <Link href="/delete-account" className="underline decoration-border underline-offset-4 hover:text-foreground text-muted">Data Deletion</Link>
      </div>
    </section>
  );
}
