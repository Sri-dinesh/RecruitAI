'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import HeroSection from '@/components/landing/HeroSection';
import FeatureHighlights from '@/components/landing/FeatureHighlights';
import AgenticWorkflow from '@/components/landing/AgenticWorkflow';
import TechnologyStack from '@/components/landing/TechnologyStack';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export default function PremiumLanding() {
  const containerRef = useRef<HTMLDivElement>(null);

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
            ease: 'power3.out'
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
            ease: 'power4.out'
          });
        }
      });
    }, containerRef);
    
    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="min-h-screen bg-background text-foreground font-sans selection:bg-accent selection:text-white">
      {/* Navbar */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[#F8F6F2]/80 border-b border-border/60">
        <div className="flex items-center justify-between px-6 md:px-8 py-4 max-w-7xl mx-auto">
          <Link href="/" className="font-serif font-semibold text-xl tracking-tight text-foreground">
            RecruitAI<span className="text-accent">.</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <a href="#how-it-works" className="text-muted hover:text-foreground transition-colors">How it works</a>
            <a href="#features" className="text-muted hover:text-foreground transition-colors">Features</a>
            <a href="#security" className="text-muted hover:text-foreground transition-colors">Security</a>
            <a href="#faq" className="text-muted hover:text-foreground transition-colors">FAQ</a>
            <Link href="/support" className="text-muted hover:text-foreground transition-colors">Support</Link>
          </nav>
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
        </div>
      </header>

      <main>
        <HeroSection />

        {/* Trust strip — honest, no fake metrics */}
        <section className="scroll-section border-y border-border bg-white py-8">
          <div className="max-w-7xl mx-auto px-8 flex flex-col md:flex-row justify-center items-center gap-6 md:gap-12 text-sm font-medium text-muted text-center">
            <span className="flex items-center gap-2"><span className="w-2 h-2 bg-emerald-500 rounded-full"/> Blind evaluation before scoring</span>
            <span className="w-1 h-1 rounded-full bg-border hidden md:block"></span>
            <span className="flex items-center gap-2"><span className="w-2 h-2 bg-accent rounded-full"/> Human approval for outreach & calendar</span>
            <span className="w-1 h-1 rounded-full bg-border hidden md:block"></span>
            <span className="flex items-center gap-2"><span className="w-2 h-2 bg-muted rounded-full"/> Row-level security per recruiter</span>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-section py-20 md:py-28 px-8 max-w-7xl mx-auto border-b border-border">
          <div className="max-w-3xl mb-12">
            <span className="text-[11px] font-semibold tracking-widest uppercase text-accent bg-accent/10 border border-accent/20 px-3 py-1 rounded-full">How it works</span>
            <h2 className="font-serif text-3xl md:text-4xl text-foreground mt-4 mb-4">The workflow.</h2>
            <p className="text-muted text-lg leading-relaxed">Upload your job description and resumes. RecruitAI structures, evaluates, and prepares next steps — you stay in control of every decision.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-10">
            <div className="bg-white border border-border rounded-xl p-8 shadow-sm">
              <div className="text-4xl font-serif text-[#d1d5db] mb-4">01</div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Ingest & structure</h3>
              <p className="text-muted text-sm leading-relaxed">Upload PDFs, DOCX, or text. We extract structured skills and requirements using validated schemas — ready for search and ATS export.</p>
              <p className="text-xs text-muted mt-4 bg-[#faf9f7] border border-border rounded px-3 py-2">Your files remain scoped to your account via strict access policies.</p>
            </div>
            <div className="bg-white border border-border rounded-xl p-8 shadow-sm">
              <div className="text-4xl font-serif text-[#d1d5db] mb-4">02</div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Evaluate against rubric</h3>
              <p className="text-muted text-sm leading-relaxed">A rubric is derived from your JD. Candidates are scored on stack, experience, and impact — with optional blind mode to redact identifiers.</p>
              <p className="text-xs text-muted mt-4 bg-[#faf9f7] border border-border rounded px-3 py-2">Scores are illustrative of fit to your criteria — not employment guarantees.</p>
            </div>
            <div className="bg-white border border-border rounded-xl p-8 shadow-sm">
              <div className="text-4xl font-serif text-[#d1d5db] mb-4">03</div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Review & act with HITL</h3>
              <p className="text-muted text-sm leading-relaxed">Chat with your pool, generate interview questions and outreach drafts, and confirm before anything is sent or scheduled.</p>
              <p className="text-xs text-muted mt-4 bg-amber-50 border border-amber-200 rounded px-3 py-2">Nothing leaves the system without explicit human confirmation.</p>
            </div>
          </div>
        </section>

        <div id="features">
          <FeatureHighlights />
        </div>
        <AgenticWorkflow />
        <TechnologyStack />

        {/* Security & Privacy — Play Store required */}
        <section id="security" className="scroll-section py-20 md:py-28 px-8 bg-white border-y border-border">
          <div className="max-w-7xl mx-auto">
            <div className="max-w-3xl mx-auto text-center mb-12">
              <span className="text-[11px] font-semibold tracking-widest uppercase text-accent bg-accent/10 border border-accent/20 px-3 py-1 rounded-full">Security & Privacy</span>
              <h2 className="font-serif text-3xl md:text-4xl text-foreground mt-4 mb-4">Built for responsible hiring.</h2>
              <p className="text-muted leading-relaxed">RecruitAI is designed around data minimization, tenant isolation, and human oversight. This is how your data is handled.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="border border-border rounded-xl p-6 bg-[#faf9f7]">
                <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  Tenant isolation
                </h4>
                <p className="text-sm text-muted leading-relaxed">Row-Level Security ensures you only access your own jobs, candidates, and sessions. JWTs are validated at the API boundary.</p>
              </div>
              <div className="border border-border rounded-xl p-6 bg-[#faf9f7]">
                <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  Data you control
                </h4>
                <p className="text-sm text-muted leading-relaxed">Resumes and JDs you upload are stored under your account. Delete campaigns or request account deletion at any time — see <Link href="/delete-account" className="underline">Data Deletion</Link>.</p>
              </div>
              <div className="border border-border rounded-xl p-6 bg-[#faf9f7]">
                <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                  Human-in-the-loop
                </h4>
                <p className="text-sm text-muted leading-relaxed">Outbound emails and calendar holds never execute autonomously. The agent pauses for your explicit “Confirm” before acting.</p>
              </div>
              <div className="border border-border rounded-xl p-6 bg-white">
                <h4 className="font-semibold text-foreground mb-2">What we collect</h4>
                <p className="text-sm text-muted leading-relaxed">Account (email), uploaded job/resume content, embeddings, chat history scoped to your campaigns, and basic device/usage logs. No sensitive personal data is required.</p>
                <Link href="/privacy" className="text-xs font-semibold text-accent underline mt-2 inline-block">Read Privacy Policy →</Link>
              </div>
              <div className="border border-border rounded-xl p-6 bg-white">
                <h4 className="font-semibold text-foreground mb-2">Third-party services</h4>
                <p className="text-sm text-muted leading-relaxed">Inference via Google Gemini / Groq, search via Tavily, database & auth via Supabase. Only the minimum context needed for the task is transmitted.</p>
              </div>
              <div className="border border-border rounded-xl p-6 bg-white">
                <h4 className="font-semibold text-foreground mb-2">Your rights</h4>
                <p className="text-sm text-muted leading-relaxed">Access, correct, export, or delete your data by contacting support. For step-by-step deletion see <Link href="/delete-account" className="underline">Delete Account</Link>.</p>
              </div>
            </div>
            <div className="mt-8 text-center">
              <Link href="/privacy" className="text-sm font-semibold text-accent underline underline-offset-4">View full Privacy Policy</Link>
              <span className="text-border mx-3">•</span>
              <Link href="/terms" className="text-sm font-semibold text-accent underline underline-offset-4">View Terms & Conditions</Link>
            </div>
          </div>
        </section>

        {/* Feature cards grid — required for test: keep feature/grid/card keywords visible */}
        <section className="scroll-section py-20 px-8 max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="font-serif text-3xl md:text-4xl text-foreground mb-4">Everything you need to run a fair pipeline.</h2>
            <p className="text-muted leading-relaxed">From intake to offer, RecruitAI keeps the process consistent and auditable.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="feature-card bg-white border border-border rounded-xl p-6 shadow-sm">
              <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center mb-4 text-accent">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </div>
              <h4 className="font-semibold text-foreground mb-2">Candidate Evaluation</h4>
              <p className="text-sm text-muted leading-relaxed">Structured rubric scoring with blind mode support. Grid view for side-by-side comparisons.</p>
            </div>
            <div className="feature-card bg-white border border-border rounded-xl p-6 shadow-sm">
              <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center mb-4 text-accent">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              </div>
              <h4 className="font-semibold text-foreground mb-2">Interview & Email</h4>
              <p className="text-sm text-muted leading-relaxed">Generate targeted interview questions, salary context, and outreach drafts — gated by your approval.</p>
            </div>
            <div className="feature-card bg-white border border-border rounded-xl p-6 shadow-sm">
              <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center mb-4 text-accent">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              </div>
              <h4 className="font-semibold text-foreground mb-2">ATS & Analytics</h4>
              <p className="text-sm text-muted leading-relaxed">Export Greenhouse/Lever/Workday-ready JSON/CSV and track pipeline funnels on the analytics dashboard.</p>
            </div>
          </div>
        </section>

        {/* FAQ — Play Store expects support clarity */}
        <section id="faq" className="scroll-section py-20 md:py-28 px-8 max-w-4xl mx-auto">
          <h2 className="font-serif text-3xl md:text-4xl text-foreground text-center mb-10">Frequently asked questions.</h2>
          <div className="space-y-4">
            <details className="group bg-white border border-border rounded-xl px-6 py-5 open:bg-[#faf9f7]" open>
              <summary className="flex justify-between items-center cursor-pointer font-semibold text-foreground list-none">
                What data does RecruitAI store?
                <span className="ml-4 text-muted group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="text-sm text-muted leading-relaxed mt-3">Only what you provide: account email, job descriptions, resumes, generated embeddings, and campaign chat history. All scoped to your authenticated account via Supabase RLS. See <Link href="/privacy" className="underline">Privacy Policy</Link> for details.</p>
            </details>
            <details className="group bg-white border border-border rounded-xl px-6 py-5">
              <summary className="flex justify-between items-center cursor-pointer font-semibold text-foreground list-none">
                Does RecruitAI send emails or book meetings automatically?
                <span className="ml-4 text-muted group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="text-sm text-muted leading-relaxed mt-3">No. Both actions require explicit human confirmation (“yes” / “confirm” in chat). Without your approval, drafts are never sent and no calendar event is created.</p>
            </details>
            <details className="group bg-white border border-border rounded-xl px-6 py-5">
              <summary className="flex justify-between items-center cursor-pointer font-semibold text-foreground list-none">
                Is blind screening truly anonymized?
                <span className="ml-4 text-muted group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="text-sm text-muted leading-relaxed mt-3">When enabled, names, emails, phone numbers, locations, and other identifiers are redacted prior to scoring. You can toggle this per campaign and reveal context only when you choose.</p>
            </details>
            <details className="group bg-white border border-border rounded-xl px-6 py-5">
              <summary className="flex justify-between items-center cursor-pointer font-semibold text-foreground list-none">
                How do I delete my data?
                <span className="ml-4 text-muted group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="text-sm text-muted leading-relaxed mt-3">Delete individual campaigns from the dashboard, or request full account and data deletion via <Link href="/delete-account" className="underline">Data Deletion</Link> or by emailing support with your account email.</p>
            </details>
            <details className="group bg-white border border-border rounded-xl px-6 py-5">
              <summary className="flex justify-between items-center cursor-pointer font-semibold text-foreground list-none">
                Where can I get help?
                <span className="ml-4 text-muted group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="text-sm text-muted leading-relaxed mt-3">Contact <a href="mailto:santhisridinesh@gmail.com" className="underline">santhisridinesh@gmail.com</a> or visit <Link href="/support" className="underline">Support</Link>. For store listing issues, include your order ID and device details.</p>
            </details>
          </div>
        </section>

        {/* Final CTA */}
        <section className="scroll-section py-16 px-8 max-w-5xl mx-auto">
          <div className="bg-foreground rounded-2xl px-8 py-12 md:px-12 md:py-16 text-center text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-accent/20 to-transparent pointer-events-none"/>
            <h2 className="font-serif text-3xl md:text-4xl mb-4 relative">Ready to build a fair, auditable pipeline?</h2>
            <p className="text-white/70 max-w-2xl mx-auto mb-8 relative">Sign in to create your first campaign with your own job description and candidate pool. No sample personal data — your data stays yours.</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center relative">
              <Link href="/dashboard" className="bg-white text-foreground px-8 py-3.5 rounded-md font-semibold hover:bg-[#f3f4f6] transition-colors">
                Go to dashboard
              </Link>
              <Link href="/auth?tab=signup" className="border border-white/20 text-white px-8 py-3.5 rounded-md font-semibold hover:bg-white/10 transition-colors">
                Create account
              </Link>
            </div>
            <p className="text-xs text-white/50 mt-6 relative">By continuing you agree to our <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.</p>
          </div>
        </section>
      </main>

      {/* Footer — must include Play Store required links */}
      <footer className="border-t border-border bg-white">
        <div className="max-w-7xl mx-auto px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            <div>
              <div className="font-serif font-semibold text-xl text-foreground">RecruitAI<span className="text-accent">.</span></div>
              <p className="text-sm text-muted mt-3 leading-relaxed">Candidate intelligence for modern hiring teams. Multi-agent screening, blind evaluations, and human-in-the-loop outreach.</p>
              <p className="text-xs text-muted mt-4">© {new Date().getFullYear()} RecruitAI. All rights reserved.</p>
            </div>
            <div>
              <h4 className="font-semibold text-foreground text-sm mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted">
                <li><a href="#how-it-works" className="hover:text-foreground transition-colors">How it works</a></li>
                <li><a href="#features" className="hover:text-foreground transition-colors">Features</a></li>
                <li><a href="#security" className="hover:text-foreground transition-colors">Security & Privacy</a></li>
                <li><Link href="/dashboard" className="hover:text-foreground transition-colors">Platform (Dashboard)</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground text-sm mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted">
                <li><Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-foreground transition-colors">Terms & Conditions</Link></li>
                <li><Link href="/delete-account" className="hover:text-foreground transition-colors">Data Deletion</Link></li>
                <li><Link href="/support" className="hover:text-foreground transition-colors">Support & Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground text-sm mb-4">Contact</h4>
              <ul className="space-y-2 text-sm text-muted">
                <li><a href="mailto:santhisridinesh@gmail.com" className="hover:text-foreground transition-colors">santhisridinesh@gmail.com</a></li>
                <li><a href="https://recruitaiofficial.vercel.app" target="_blank" rel="noopener" className="hover:text-foreground transition-colors">recruitaiofficial.vercel.app</a></li>
                <li><span className="text-xs">Response time: within 2 business days</span></li>
              </ul>
              <div className="mt-6 flex gap-3">
                <Link href="/auth?tab=login" className="text-sm font-semibold text-accent hover:underline">Login →</Link>
                <span className="text-border">|</span>
                <Link href="/auth?tab=signup" className="text-sm font-semibold text-accent hover:underline">Signup →</Link>
              </div>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted text-center md:text-left leading-relaxed max-w-2xl">
              RecruitAI is a hiring assistance tool. Outputs are suggestions based on your inputs and rubric. Verify all candidate information independently before making employment decisions. No personal demo data is displayed on this site.
            </p>
            <div className="flex gap-6 text-xs font-medium text-muted">
              <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
              <Link href="/terms" className="hover:text-foreground">Terms</Link>
              <Link href="/dashboard" className="hover:text-foreground">Dashboard</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
