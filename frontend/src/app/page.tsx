'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
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
      // Hero headline fade-up
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

      // Section entrances
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

      // Feature split layouts
      gsap.utils.toArray('.feature-row').forEach((row: any) => {
        const text = row.querySelector('.feature-text');
        const panel = row.querySelector('.feature-panel');
        
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
      });

      // Terminal demo
      const lines = gsap.utils.toArray('.terminal-line');
      if (lines.length > 0) {
        gsap.set(lines, { opacity: 0, x: -10 });
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: '.terminal-block',
            start: 'top 75%',
          }
        });
        lines.forEach((line: any) => {
          tl.to(line, { opacity: 1, x: 0, duration: 0.2, ease: 'power2.out' })
            .to({}, { duration: 0.6 }); // Pause between lines
        });
      }
    }, containerRef);
    
    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="min-h-screen bg-background text-foreground font-sans selection:bg-accent selection:text-white">
      {/* Navbar */}
      <header className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <Link href="/" className="font-serif font-semibold text-xl tracking-tight text-foreground">
          RecruitAI.
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-sm font-medium relative group text-foreground">
            Login
            <span className="absolute -bottom-1 left-0 w-full h-[1px] bg-foreground origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"></span>
          </Link>
          <motion.div
            whileHover={{ backgroundColor: '#263a66' }}
            transition={{ duration: 0.12 }}
            className="bg-accent rounded-md"
          >
            <Link href="/dashboard" className="text-sm font-medium text-white px-5 py-2.5 block transition-colors">
              Signup
            </Link>
          </motion.div>
        </div>
      </header>

      <main>
        <HeroSection />

        {/* Social Proof Bar */}
        <section className="scroll-section border-y border-border bg-white py-8">
          <div className="max-w-7xl mx-auto px-8 flex justify-center items-center gap-12 text-sm font-medium text-muted flex-wrap">
            <span>15 resumes screened in 4 seconds</span>
            <span className="w-1 h-1 rounded-full bg-border hidden md:block"></span>
            <span>7 hiring intents, zero wasted LLM calls</span>
            <span className="w-1 h-1 rounded-full bg-border hidden md:block"></span>
            <span>100% Blind Evaluation compliance</span>
          </div>
        </section>

        {/* How it works */}
        <section className="scroll-section py-20 md:py-32 px-8 max-w-7xl mx-auto border-b border-border">
          <h2 className="font-serif text-3xl md:text-4xl text-foreground mb-16">The workflow.</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
            <div>
              <div className="text-4xl font-serif text-[#d1d5db] mb-6">01</div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Ingest</h3>
              <p className="text-muted text-base leading-relaxed">Upload resumes and job descriptions. The system extracts structured skills with perfect recall.</p>
            </div>
            <div>
              <div className="text-4xl font-serif text-[#d1d5db] mb-6">02</div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Evaluate</h3>
              <p className="text-muted text-base leading-relaxed">Candidates are scored against a dynamic, role-specific rubric, eliminating bias and noise.</p>
            </div>
            <div>
              <div className="text-4xl font-serif text-[#d1d5db] mb-6">03</div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Act</h3>
              <p className="text-muted text-base leading-relaxed">Generate highly-tailored outreach and secure interview slots with zero friction.</p>
            </div>
          </div>
        </section>

        <FeatureHighlights />
        <AgenticWorkflow />
        <TechnologyStack />
      </main>

      {/* Footer */}
      <footer className="py-12 px-8 max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between border-t border-border">
        <div className="font-serif font-semibold text-xl text-foreground mb-6 md:mb-0">RecruitAI.</div>
        <div className="flex gap-8 text-sm font-medium text-muted mb-6 md:mb-0">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">Platform</Link>
          <Link href="/dashboard" className="hover:text-foreground transition-colors">Privacy</Link>
          <Link href="/dashboard" className="hover:text-foreground transition-colors">Terms</Link>
        </div>
        <Link href="/dashboard" className="text-sm font-semibold text-accent relative group">
          Log in to platform
          <span className="absolute -bottom-1 left-0 w-full h-[1px] bg-accent origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"></span>
        </Link>
      </footer>
    </div>
  );
}
