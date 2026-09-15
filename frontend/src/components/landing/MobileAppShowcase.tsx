'use client';

import { motion } from 'framer-motion';
import PlayStoreBadge, { PLAY_STORE_URL } from '@/components/brand/PlayStoreBadge';

export default function MobileAppShowcase() {
  return (
    <section className="scroll-section py-20 md:py-32 px-8 bg-[#111827] text-white relative overflow-hidden border-y border-neutral-800">
      {/* Background atmospheric glow */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-10 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          
          {/* Left Column: Value Prop & Features */}
          <div className="lg:col-span-7 space-y-8 text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold tracking-wider uppercase">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live on Google Play Store
            </div>

            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl text-white leading-tight">
              Recruit on the go. <br />
              <span className="text-white/80">Candidate intelligence in your pocket.</span>
            </h2>

            <p className="text-neutral-300 text-lg leading-relaxed max-w-xl">
              Never let top technical talent slip through the cracks. The official RecruitAI Android app puts multi-agent screening, blind candidate scorecards, and human-in-the-loop approvals right at your fingertips.
            </p>

            {/* Feature Points */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center shrink-0 text-emerald-400">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                </div>
                <div>
                  <h4 className="font-semibold text-white text-sm">Instant Match Alerts</h4>
                  <p className="text-xs text-neutral-400 mt-1 leading-relaxed">Get notified the moment a 90%+ rubric match enters your campaign funnel.</p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center shrink-0 text-blue-400">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </div>
                <div>
                  <h4 className="font-semibold text-white text-sm">Mobile Blind Screening</h4>
                  <p className="text-xs text-neutral-400 mt-1 leading-relaxed">Review demographically redacted profiles anywhere without unconscious bias.</p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center shrink-0 text-amber-400">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                </div>
                <div>
                  <h4 className="font-semibold text-white text-sm">1-Tap Outreach Approval</h4>
                  <p className="text-xs text-neutral-400 mt-1 leading-relaxed">Confirm AI-drafted candidate emails and interview invites with a single tap.</p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center shrink-0 text-purple-400">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
                </div>
                <div>
                  <h4 className="font-semibold text-white text-sm">Real-Time Cloud Sync</h4>
                  <p className="text-xs text-neutral-400 mt-1 leading-relaxed">Every action on Android syncs seamlessly with your desktop workspace.</p>
                </div>
              </div>
            </div>

            {/* Play Store CTA */}
            <div className="pt-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <PlayStoreBadge variant="badge" theme="dark" className="border-neutral-700 hover:border-neutral-500" />
              <div className="text-xs text-neutral-400">
                <span>Free download for all active RecruitAI users.</span>
                <div className="text-neutral-500 mt-0.5">Tested & validated on Android 12 through Android 15.</div>
              </div>
            </div>
          </div>

          {/* Right Column: Phone Mockup */}
          <div className="lg:col-span-5 flex justify-center">
            <motion.div
              whileHover={{ y: -6, transition: { duration: 0.3 } }}
              className="relative w-[300px] sm:w-[320px] bg-black rounded-[42px] p-3.5 shadow-2xl border-[4px] border-neutral-700/80"
            >
              {/* Phone Camera Notch */}
              <div className="absolute top-6 left-1/2 -translate-x-1/2 w-24 h-4 bg-black rounded-full z-20 flex items-center justify-center">
                <div className="w-2.5 h-2.5 rounded-full bg-neutral-900 border border-neutral-800" />
              </div>

              {/* Screen Content */}
              <div className="bg-[#F8F6F2] rounded-[32px] overflow-hidden text-foreground text-left p-5 pt-8 space-y-4">
                {/* Mobile App Header */}
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-accent text-white flex items-center justify-center font-serif text-xs font-bold">R</div>
                    <span className="font-serif font-bold text-sm text-foreground">RecruitAI</span>
                  </div>
                  <span className="text-[10px] font-semibold uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">Live App</span>
                </div>

                {/* Active Campaign Card */}
                <div className="bg-white border border-border rounded-xl p-3.5 shadow-xs">
                  <div className="text-[10px] uppercase font-bold text-muted tracking-wider">Active Pipeline</div>
                  <div className="font-semibold text-xs text-foreground mt-0.5">Staff Distributed Systems Engineer</div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] bg-accent/10 text-accent font-semibold px-2 py-0.5 rounded">Blind Mode ON</span>
                    <span className="text-[10px] text-muted">14 Profiles Scored</span>
                  </div>
                </div>

                {/* Candidate Scorecard Preview */}
                <div className="bg-white border-2 border-accent/30 rounded-xl p-3.5 shadow-sm space-y-2.5">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-[10px] font-mono text-muted uppercase">Candidate #0482</div>
                      <div className="font-bold text-xs text-foreground mt-0.5">[Redacted — Blind Mode]</div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-bold text-emerald-600 font-mono">94%</div>
                      <div className="text-[9px] text-muted uppercase">Rubric Fit</div>
                    </div>
                  </div>

                  {/* Criteria breakdown */}
                  <div className="space-y-1.5 text-[10px] pt-1 border-t border-border">
                    <div className="flex justify-between">
                      <span className="text-muted">Distributed Systems:</span>
                      <span className="font-semibold text-foreground">5/5 (High Concurrency)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Rust / Go Proficiency:</span>
                      <span className="font-semibold text-foreground">5/5 (Production scale)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Architecture Impact:</span>
                      <span className="font-semibold text-foreground">4.8/5 (Lead experience)</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-2 flex gap-2">
                    <button className="flex-1 bg-accent text-white text-[11px] font-semibold py-1.5 rounded-md hover:bg-accent/90 transition-colors">
                      Draft Outreach
                    </button>
                    <button className="px-3 bg-neutral-100 text-neutral-700 text-[11px] font-medium rounded-md hover:bg-neutral-200 transition-colors">
                      Scorecard
                    </button>
                  </div>
                </div>

                {/* Mobile Status Bar */}
                <div className="text-center pt-1">
                  <span className="text-[10px] text-muted font-medium">Synced with Supabase Cloud • Real-time</span>
                </div>
              </div>
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
}
