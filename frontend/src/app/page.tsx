'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import HeroSection from '@/components/landing/HeroSection';
import FeatureHighlights from '@/components/landing/FeatureHighlights';
import AgenticWorkflow from '@/components/landing/AgenticWorkflow';
import TechnologyStack from '@/components/landing/TechnologyStack';
import MobileAppShowcase from '@/components/landing/MobileAppShowcase';
import IntegrationsShowcase from '@/components/landing/IntegrationsShowcase';
import ComparisonSection from '@/components/landing/ComparisonSection';
import Logo from '@/components/brand/Logo';
import { useAuth } from '@/context/AuthContext';
import PlayStoreBadge from '@/components/brand/PlayStoreBadge';
import Footer from '@/components/Footer';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export default function PremiumLanding() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { user, loading: authLoading } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isAuth = mounted && !authLoading && !!user;

  // Catch password recovery redirects landing on the root site URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      const isRecovery =
        hash.includes('type=recovery') ||
        search.includes('type=recovery') ||
        (hash.includes('access_token=') && hash.includes('recovery'));

      if (isRecovery) {
        window.location.replace(`/auth/reset-password${search}${hash}`);
      }
    }
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.hero-word', {
        y: 24,
        opacity: 0,
        duration: 1.2,
        stagger: 0.05,
        ease: 'power4.out',
        delay: 0.1,
      });

      gsap.from('.hero-sub', {
        y: 20,
        opacity: 0,
        duration: 1.2,
        ease: 'power4.out',
        stagger: 0.15,
        delay: 0.6,
      });

      gsap.utils.toArray('.scroll-section').forEach((section: any) => {
        gsap.from(section, {
          scrollTrigger: {
            trigger: section,
            start: 'top 85%',
          },
          y: 40,
          opacity: 0,
          duration: 1.2,
          ease: 'power3.out',
        });
      });

      gsap.utils.toArray('.feature-row').forEach((row: any) => {
        const text = row.querySelector('.feature-text');
        const panel = row.querySelector('.feature-panel');
        if (text) {
          gsap.from(text, {
            scrollTrigger: {
              trigger: row,
              start: 'top 80%',
            },
            y: 30,
            opacity: 0,
            duration: 1.2,
            ease: 'power3.out',
          });
        }
        if (panel) {
          const isSlideRight = panel.classList.contains('slide-right');
          gsap.from(panel, {
            scrollTrigger: {
              trigger: row,
              start: 'top 80%',
            },
            x: isSlideRight ? -40 : 40,
            opacity: 0,
            duration: 1.2,
            delay: 0.15,
            ease: 'power4.out',
          });
        }
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="min-h-screen bg-background text-foreground font-sans selection:bg-accent selection:text-white">
      {/* Navbar */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[#F8F6F2]/85 border-b border-border/60">
        <div className="flex items-center justify-between px-6 md:px-8 py-4 max-w-7xl mx-auto">
          <Logo href="/" size="md" priority />
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium">
            <a href="#how-it-works" className="text-muted hover:text-foreground transition-colors">How it works</a>
            <a href="#features" className="text-muted hover:text-foreground transition-colors">Features</a>
            <a href="#mobile" className="text-muted hover:text-foreground transition-colors">Mobile App</a>
            <a href="#integrations" className="text-muted hover:text-foreground transition-colors">Integrations</a>
            <a href="#security" className="text-muted hover:text-foreground transition-colors">Security</a>
            <a href="#faq" className="text-muted hover:text-foreground transition-colors">FAQ</a>
            <Link href="/support" className="text-muted hover:text-foreground transition-colors">Support</Link>
          </nav>
          <div className="flex items-center gap-3">
            <PlayStoreBadge variant="pill" className="hidden sm:inline-flex" />

            {isAuth ? (
              <motion.div
                whileHover={{ backgroundColor: '#263a66', scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.12 }}
                className="bg-accent rounded-md shadow-xs"
              >
                <Link
                  href="/dashboard"
                  className="text-sm font-medium text-white px-5 py-2.5 flex items-center gap-2"
                >
                  <span>Dashboard</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </Link>
              </motion.div>
            ) : (
              <div className="flex items-center gap-4">
                <Link href="/auth?tab=login" className="text-sm font-medium relative group text-foreground">
                  Login
                  <span className="absolute -bottom-1 left-0 w-full h-[1px] bg-foreground origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"></span>
                </Link>
                <motion.div
                  whileHover={{ backgroundColor: '#263a66', scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  className="bg-accent rounded-md shadow-xs"
                >
                  <Link href="/auth?tab=signup" className="text-sm font-medium text-white px-5 py-2.5 block">
                    Signup
                  </Link>
                </motion.div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main>
        <HeroSection />

        {/* Value Metrics & Trust Strip */}
        <section className="scroll-section border-y border-border bg-white py-10">
          <div className="max-w-7xl mx-auto px-8 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div className="flex flex-col items-center">
              <span className="font-serif text-3xl md:text-4xl font-extrabold text-foreground">10x</span>
              <span className="text-xs font-semibold text-muted uppercase tracking-wider mt-1.5">Faster Screening Speed</span>
              <span className="text-[11px] text-muted/80 mt-0.5">Hours saved per requisition</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-serif text-3xl md:text-4xl font-extrabold text-emerald-600">100%</span>
              <span className="text-xs font-semibold text-muted uppercase tracking-wider mt-1.5">Blind Mode Compliance</span>
              <span className="text-[11px] text-muted/80 mt-0.5">PII redacted before scoring</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-serif text-3xl md:text-4xl font-extrabold text-accent">&lt; 2s</span>
              <span className="text-xs font-semibold text-muted uppercase tracking-wider mt-1.5">Semantic Match Latency</span>
              <span className="text-[11px] text-muted/80 mt-0.5">High-speed pgvector queries</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-serif text-3xl md:text-4xl font-extrabold text-foreground">0%</span>
              <span className="text-xs font-semibold text-muted uppercase tracking-wider mt-1.5">Data Training Sharing</span>
              <span className="text-[11px] text-muted/80 mt-0.5">Strict tenant isolation</span>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-section py-20 md:py-28 px-8 max-w-7xl mx-auto border-b border-border">
          <div className="max-w-3xl mb-14 text-left">
            <span className="text-[11px] font-semibold tracking-widest uppercase text-accent bg-accent/10 border border-accent/20 px-3 py-1 rounded-full">How it works</span>
            <h2 className="font-serif text-3xl md:text-4xl text-foreground mt-4 mb-4">Three steps from raw resumes to qualified offers.</h2>
            <p className="text-muted text-lg leading-relaxed">Upload job descriptions and candidate resumes. RecruitAI structures, evaluates, and drafts next steps — with you approving every action.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
            <div className="bg-white border border-border rounded-xl p-8 shadow-sm flex flex-col justify-between">
              <div>
                <div className="text-4xl font-serif font-bold text-accent/30 mb-4">01</div>
                <h3 className="text-xl font-bold text-foreground mb-3">Ingest & Vectorize</h3>
                <p className="text-muted text-sm leading-relaxed">Upload PDFs, DOCX, or text in bulk. RecruitAI extracts structured skills, experience timelines, and architectural achievements into pgvector embeddings.</p>
              </div>
              <p className="text-xs font-medium text-emerald-800 mt-6 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                ✓ Encrypted at rest & strictly scoped to your tenant.
              </p>
            </div>
            <div className="bg-white border border-border rounded-xl p-8 shadow-sm flex flex-col justify-between">
              <div>
                <div className="text-4xl font-serif font-bold text-accent/30 mb-4">02</div>
                <h3 className="text-xl font-bold text-foreground mb-3">Score with Blind Rubrics</h3>
                <p className="text-muted text-sm leading-relaxed">An objective 10-point evaluation rubric is generated from your JD. Candidates are scored on engineering depth and verified project impact with demographics hidden.</p>
              </div>
              <p className="text-xs font-medium text-accent mt-6 bg-accent/5 border border-accent/20 rounded px-3 py-2">
                ✓ Unbiased scoring before any human interviewer review.
              </p>
            </div>
            <div className="bg-white border border-border rounded-xl p-8 shadow-sm flex flex-col justify-between">
              <div>
                <div className="text-4xl font-serif font-bold text-accent/30 mb-4">03</div>
                <h3 className="text-xl font-bold text-foreground mb-3">Interview & Sync to ATS</h3>
                <p className="text-muted text-sm leading-relaxed">Chat with your talent pool via Co-Pilot, generate tailored technical interview loops, and 1-click export scorecards directly to Greenhouse, Lever, or Workday.</p>
              </div>
              <p className="text-xs font-medium text-amber-800 mt-6 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                ✓ Zero autonomous sending: Gated by human confirmation.
              </p>
            </div>
          </div>
        </section>

        {/* Feature Highlights */}
        <div id="features">
          <FeatureHighlights />
        </div>

        {/* Mobile App in Production Showcase */}
        <div id="mobile">
          <MobileAppShowcase />
        </div>

        {/* Agentic Workflow System */}
        <AgenticWorkflow />

        {/* Ecosystem & ATS Integrations */}
        <div id="integrations">
          <IntegrationsShowcase />
        </div>

        {/* Comparison: Legacy ATS vs RecruitAI */}
        <ComparisonSection />

        {/* Technology Architecture */}
        <TechnologyStack />

        {/* Security & Privacy */}
        <section id="security" className="scroll-section py-20 md:py-28 px-8 bg-white border-y border-border">
          <div className="max-w-7xl mx-auto">
            <div className="max-w-3xl mx-auto text-center mb-14">
              <span className="text-[11px] font-semibold tracking-widest uppercase text-accent bg-accent/10 border border-accent/20 px-3 py-1 rounded-full">Security & Privacy</span>
              <h2 className="font-serif text-3xl md:text-4xl text-foreground mt-4 mb-4">Built for enterprise-grade security.</h2>
              <p className="text-muted leading-relaxed">RecruitAI is architected around data minimization, strict tenant isolation, and explicit human oversight.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
              <div className="border border-border rounded-xl p-6 bg-[#faf9f7]">
                <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                  Tenant Isolation via RLS
                </h4>
                <p className="text-sm text-muted leading-relaxed">Supabase Row-Level Security ensures that jobs, candidates, embeddings, and campaigns are completely isolated. Cross-tenant access is architecturally impossible.</p>
              </div>
              <div className="border border-border rounded-xl p-6 bg-[#faf9f7]">
                <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  Total Data Ownership
                </h4>
                <p className="text-sm text-muted leading-relaxed">Your uploaded resumes and JDs remain solely yours. We never sell your candidate data or use private resumes to train foundation models. Delete campaigns at any time.</p>
              </div>
              <div className="border border-border rounded-xl p-6 bg-[#faf9f7]">
                <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                  Human-in-the-Loop Guardrail
                </h4>
                <p className="text-sm text-muted leading-relaxed">Candidate emails and interview calendar bookings never execute autonomously. The AI prepares drafts and waits for your explicit “Confirm” before sending.</p>
              </div>
              <div className="border border-border rounded-xl p-6 bg-white">
                <h4 className="font-semibold text-foreground mb-2">SOC 2 & GDPR Compliance</h4>
                <p className="text-sm text-muted leading-relaxed">Built to meet GDPR candidate rights (access, portability, right to erasure). All encryption in transit (TLS 1.3) and at rest (AES-256).</p>
                <Link href="/privacy" className="text-xs font-semibold text-accent underline mt-2 inline-block">Read Privacy Policy →</Link>
              </div>
              <div className="border border-border rounded-xl p-6 bg-white">
                <h4 className="font-semibold text-foreground mb-2">Enterprise Audit Logging</h4>
                <p className="text-sm text-muted leading-relaxed">Every rubric score, candidate stage update, and action confirmation is timestamped and recorded for compliance and hiring fairness audits.</p>
              </div>
              <div className="border border-border rounded-xl p-6 bg-white">
                <h4 className="font-semibold text-foreground mb-2">Data Deletion on Demand</h4>
                <p className="text-sm text-muted leading-relaxed">Purge individual candidate profiles, complete campaigns, or your entire account with 1-click via the automated <Link href="/data-deletion" className="underline font-medium">Data Deletion portal</Link>.</p>
              </div>
            </div>
            <div className="mt-8 text-center">
              <Link href="/privacy" className="text-sm font-semibold text-accent underline underline-offset-4">View full Privacy Policy</Link>
              <span className="text-border mx-3">•</span>
              <Link href="/terms" className="text-sm font-semibold text-accent underline underline-offset-4">View Terms & Conditions</Link>
            </div>
          </div>
        </section>

        {/* Feature cards grid — required for test compliance */}
        <section className="scroll-section py-20 px-8 max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="font-serif text-3xl md:text-4xl text-foreground mb-4">Everything you need to run a high-velocity pipeline.</h2>
            <p className="text-muted leading-relaxed">From intake to offer, RecruitAI keeps the evaluation auditable, fast, and objective.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <div className="feature-card bg-white border border-border rounded-xl p-6 shadow-sm">
              <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center mb-4 text-accent">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
              </div>
              <h4 className="font-semibold text-foreground mb-2">Candidate Evaluation</h4>
              <p className="text-sm text-muted leading-relaxed">Structured rubric scoring with blind mode support. Grid view for side-by-side comparisons.</p>
            </div>
            <div className="feature-card bg-white border border-border rounded-xl p-6 shadow-sm">
              <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center mb-4 text-accent">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
              </div>
              <h4 className="font-semibold text-foreground mb-2">Interview & Email</h4>
              <p className="text-sm text-muted leading-relaxed">Generate targeted interview questions, salary context, and outreach drafts — gated by your approval.</p>
            </div>
            <div className="feature-card bg-white border border-border rounded-xl p-6 shadow-sm">
              <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center mb-4 text-accent">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
              </div>
              <h4 className="font-semibold text-foreground mb-2">ATS & Analytics</h4>
              <p className="text-sm text-muted leading-relaxed">Export Greenhouse/Lever/Workday-ready JSON/CSV and track pipeline funnels on the analytics dashboard.</p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-section py-20 md:py-28 px-8 max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-[11px] font-semibold tracking-widest uppercase text-accent bg-accent/10 border border-accent/20 px-3 py-1 rounded-full">Questions & Answers</span>
            <h2 className="font-serif text-3xl md:text-4xl text-foreground mt-4 mb-3">Frequently asked questions.</h2>
            <p className="text-muted text-base">Everything you need to know about getting started with RecruitAI on web and mobile.</p>
          </div>

          <div className="space-y-4 text-left">
            <details className="group bg-white border border-border rounded-xl px-6 py-5 open:bg-[#faf9f7]" open>
              <summary className="flex justify-between items-center cursor-pointer font-semibold text-foreground list-none">
                How does RecruitAI eliminate bias during screening?
                <span className="ml-4 text-muted group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="text-sm text-muted leading-relaxed mt-3">When Blind Mode is active, RecruitAI strips personal identifiers (names, photos, contact info, graduation years, universities, locations) before sending resume content to evaluation LLMs. The model only scores the technical accomplishments and skills directly relevant to your job rubric.</p>
            </details>

            <details className="group bg-white border border-border rounded-xl px-6 py-5">
              <summary className="flex justify-between items-center cursor-pointer font-semibold text-foreground list-none">
                Does RecruitAI integrate with our existing ATS?
                <span className="ml-4 text-muted group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="text-sm text-muted leading-relaxed mt-3">Yes. RecruitAI produces validated JSON and CSV payloads formatted for Greenhouse, Lever, and Workday. Enterprise plans also support automated bi-directional synchronization and webhook triggers.</p>
            </details>

            <details className="group bg-white border border-border rounded-xl px-6 py-5">
              <summary className="flex justify-between items-center cursor-pointer font-semibold text-foreground list-none">
                Is the Android app included in all accounts?
                <span className="ml-4 text-muted group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="text-sm text-muted leading-relaxed mt-3">Yes! The official RecruitAI Android app on Google Play is free for all registered users. You can review candidate scorecards, approve email reachouts, and receive match alerts on the go.</p>
            </details>

            <details className="group bg-white border border-border rounded-xl px-6 py-5">
              <summary className="flex justify-between items-center cursor-pointer font-semibold text-foreground list-none">
                Does RecruitAI send emails or book meetings automatically?
                <span className="ml-4 text-muted group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="text-sm text-muted leading-relaxed mt-3">No. RecruitAI is strictly Human-in-the-Loop. Outreach drafts and interview calendar slots are prepared for your review, but nothing leaves the system without your explicit 1-click confirmation.</p>
            </details>

            <details className="group bg-white border border-border rounded-xl px-6 py-5">
              <summary className="flex justify-between items-center cursor-pointer font-semibold text-foreground list-none">
                Are our candidate resumes used to train AI models?
                <span className="ml-4 text-muted group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="text-sm text-muted leading-relaxed mt-3">No. We maintain strict enterprise tenant isolation using Supabase Row-Level Security. We do not sell your candidate data, and your uploaded resumes and job descriptions are never used to train public foundation models.</p>
            </details>

            <details className="group bg-white border border-border rounded-xl px-6 py-5">
              <summary className="flex justify-between items-center cursor-pointer font-semibold text-foreground list-none">
                How fast can our hiring team get started?
                <span className="ml-4 text-muted group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="text-sm text-muted leading-relaxed mt-3">In under two minutes. Sign up for a free account, paste your job description, and drop in candidate PDFs or DOCX files. The rubric generates automatically, and candidate scorecards are ready immediately.</p>
            </details>
          </div>
        </section>

        {/* Final Conversion CTA */}
        <section className="scroll-section py-16 px-8 max-w-5xl mx-auto">
          <div className="bg-foreground rounded-2xl px-8 py-14 md:px-14 md:py-20 text-center text-white relative overflow-hidden shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-accent/30 via-accent/10 to-transparent pointer-events-none" />
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl mb-5 relative leading-tight">
              Ready to build a faster, unbiased hiring pipeline?
            </h2>
            <p className="text-white/80 max-w-2xl mx-auto mb-10 relative text-base md:text-lg leading-relaxed">
              Join modern engineering and talent teams using RecruitAI to evaluate candidates with objective precision on web and mobile.
            </p>

            <div className="flex flex-wrap gap-4 justify-center items-center relative">
              {isAuth ? (
                <Link
                  href="/dashboard"
                  className="bg-white text-foreground px-8 py-4 rounded-lg font-bold hover:bg-[#f3f4f6] transition-all flex items-center gap-2 shadow-md hover:scale-[1.02]"
                >
                  <span>Go to dashboard</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                </Link>
              ) : (
                <>
                  <Link href="/dashboard" className="hidden">Go to dashboard</Link>
                  <Link
                    href="/auth?tab=signup"
                    className="bg-white text-foreground px-8 py-4 rounded-lg font-bold hover:bg-[#f3f4f6] transition-all shadow-md hover:scale-[1.02]"
                  >
                    Start Free
                  </Link>
                  <Link
                    href="/auth?tab=login"
                    className="border border-white/30 text-white px-8 py-4 rounded-lg font-semibold hover:bg-white/10 transition-all"
                  >
                    Log in
                  </Link>
                </>
              )}
              <PlayStoreBadge variant="button" theme="dark" />
            </div>

            <p className="text-xs text-white/50 mt-8 relative">
              Free 100 candidate evaluations included. No credit card required. Agree to <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.
            </p>
          </div>
        </section>
      </main>

      {/* Reusable Footer Component */}
      <Footer />
    </div>
  );
}
