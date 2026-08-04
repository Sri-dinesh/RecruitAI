'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

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
  return (
    <section className="pt-20 pb-24 md:pt-32 md:pb-32 px-8 max-w-7xl mx-auto flex flex-col items-center text-center">
      <h1 className="font-serif text-[64px] md:text-[96px] leading-[1.05] tracking-tight text-foreground max-w-4xl mx-auto mb-8">
        {wrapWords("Precision candidate intelligence.")}
      </h1>
      <p className="hero-sub text-lg md:text-xl text-muted max-w-2xl mx-auto mb-12 font-medium leading-relaxed">
        RecruitAI automates technical evaluations, seamlessly parses resumes, and enforces blind screening with uncompromising accuracy.
      </p>
      <motion.div
        className="hero-sub bg-accent rounded-md inline-block shadow-sm mb-24"
        whileHover={{ backgroundColor: '#263a66' }}
        transition={{ duration: 0.12 }}
      >
        <Link href="/dashboard" className="text-white font-medium text-base px-8 py-4 block">
          Start screening candidates
        </Link>
      </motion.div>

      {/* Detailed Interactive Dashboard Mockup */}
      <motion.div 
        className="hero-sub w-full max-w-5xl mx-auto border border-border bg-white rounded-xl shadow-2xl overflow-hidden transform perspective-1000"
        whileHover={{ y: -5, transition: { duration: 0.3 } }}
      >
        {/* Window Chrome */}
        <div className="bg-[#fcfcfc] border-b border-border px-4 py-3 flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e]"></div>
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]"></div>
          <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]"></div>
        </div>
        
        <div className="flex h-[450px] text-left text-sm">
          {/* Sidebar */}
          <div className="hidden md:flex w-64 border-r border-border bg-[#faf9f7] p-4 flex-col gap-4">
            <div className="font-serif font-semibold text-foreground text-base mb-2">Campaigns</div>
            <motion.button 
              whileHover={{ scale: 1.02, backgroundColor: '#10192e' }}
              whileTap={{ scale: 0.98 }}
              className="w-full bg-accent text-white py-2.5 rounded-md font-medium text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              New Campaign
            </motion.button>
            <div className="space-y-2 mt-2">
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8 }} className="bg-white border border-border p-2.5 rounded-md shadow-sm border-l-2 border-l-accent cursor-pointer">
                <div className="font-medium text-foreground truncate">Staff Engineer (React)</div>
                <div className="text-xs text-muted mt-1">32 Candidates</div>
              </motion.div>
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.9 }} className="p-2.5 rounded-md text-muted hover:bg-black/5 cursor-pointer transition-colors">
                <div className="font-medium truncate">Product Designer</div>
                <div className="text-xs mt-1">12 Candidates</div>
              </motion.div>
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.0 }} className="p-2.5 rounded-md text-muted hover:bg-black/5 cursor-pointer transition-colors">
                <div className="font-medium truncate">Backend Developer</div>
                <div className="text-xs mt-1">45 Candidates</div>
              </motion.div>
            </div>
          </div>

          {/* Main Chat Area */}
          <div className="flex-1 bg-white flex flex-col relative">
            <div className="border-b border-border p-4 flex justify-between items-center bg-white/50 backdrop-blur-sm z-10">
              <div className="font-medium text-foreground">Staff Engineer (React) - Screening</div>
              <div className="text-[10px] font-mono bg-accent/10 text-accent px-2 py-1 rounded uppercase tracking-wider">Model: Groq/Llama3</div>
            </div>
            
            <div className="flex-1 p-6 overflow-hidden flex flex-col gap-6 relative">
              <motion.div 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ delay: 1.2 }}
                className="flex gap-4 items-start flex-row-reverse"
              >
                <div className="w-8 h-8 rounded-full bg-foreground shrink-0 flex items-center justify-center text-white text-xs">You</div>
                <div className="bg-foreground text-white px-4 py-3 rounded-2xl rounded-tr-sm max-w-[85%] leading-relaxed shadow-sm">
                  Who is our top candidate for the Staff Engineer role? Can you show me their core strengths?
                </div>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ delay: 1.8 }}
                className="flex gap-4 items-start"
              >
                <div className="w-8 h-8 rounded-full bg-accent shrink-0 flex items-center justify-center text-white text-xs">AI</div>
                <div className="bg-[#f8f6f2] border border-border px-4 py-3 rounded-2xl rounded-tl-sm max-w-[85%] leading-relaxed text-foreground shadow-sm">
                  <p className="mb-3">Based on the JD and our semantic evaluation, <strong className="font-semibold">Candidate C (Alex Chen)</strong> is the strongest match with a <strong className="font-semibold text-accent">94% alignment score</strong>.</p>
                  <div className="bg-white border border-border rounded p-3 text-xs font-mono">
                    <div className="text-muted mb-2 uppercase tracking-wider text-[10px]">Key Strengths</div>
                    <ul className="list-disc pl-4 space-y-1.5 text-foreground/80">
                      <li>Led large-scale React migration (matches req #2)</li>
                      <li>8 years experience (exceeds 5yr minimum)</li>
                      <li>Perfect score on system design rubric</li>
                    </ul>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white border-t border-border mt-auto">
              <div className="border border-border rounded-lg flex items-center px-4 py-3 bg-[#faf9f7] shadow-sm">
                <span className="text-muted flex-1 text-sm font-medium">
                  <Typewriter strings={[
                    "Ask about top candidates...",
                    "Schedule an interview with Alex...",
                    "Generate a technical rubric...",
                    "Draft a rejection email..."
                  ]} />
                </span>
                <motion.div 
                  whileHover={{ scale: 1.1 }}
                  className="w-7 h-7 bg-accent rounded flex items-center justify-center cursor-pointer shadow-sm ml-auto"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
