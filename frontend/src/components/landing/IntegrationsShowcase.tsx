'use client';

import { motion } from 'framer-motion';

const integrations = [
  {
    name: 'Greenhouse',
    category: 'ATS & Recruiting',
    description: '1-click candidate exports with multi-dimensional rubric scores and blind assessment summaries.',
    badge: 'Native Export',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
        <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    name: 'Lever',
    category: 'ATS & CRM',
    description: 'Sync structured feedback and skills alignment directly into candidate profiles with zero manual copying.',
    badge: 'Direct Sync',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
        <circle cx="12" cy="12" r="10" /><path d="m10 15 5-3-5-3v6z" />
      </svg>
    ),
  },
  {
    name: 'Workday',
    category: 'Enterprise HRIS',
    description: 'Enterprise-grade JSON payloads formatted for Workday Recruiting ingestion and compliance audit trails.',
    badge: 'Enterprise',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
        <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    name: 'Ashby',
    category: 'Modern Talent Suite',
    description: 'Seamlessly pass evaluated candidate tags, interview question sets, and confidence scores into Ashby.',
    badge: 'Fast Setup',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  {
    name: 'Slack',
    category: 'Team Notifications',
    description: 'Real-time channel notifications the instant candidates finish AI evaluation and rubric scoring.',
    badge: 'Instant Alerts',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-600">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
  },
  {
    name: 'Google & Outlook',
    category: 'Calendar & Email',
    description: 'Human-confirmed email outreach drafts and calendar interview slots generated with zero calendar conflicts.',
    badge: 'HITL Gated',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-teal-600">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
];

export default function IntegrationsShowcase() {
  return (
    <section className="scroll-section py-20 md:py-32 px-8 max-w-7xl mx-auto border-b border-border">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <span className="text-[11px] font-semibold tracking-widest uppercase text-accent bg-accent/10 border border-accent/20 px-3 py-1 rounded-full">
          Ecosystem & Connectivity
        </span>
        <h2 className="font-serif text-3xl md:text-4xl text-foreground mt-4 mb-4">
          Fits seamlessly into your hiring stack.
        </h2>
        <p className="text-muted text-lg leading-relaxed">
          RecruitAI integrates effortlessly into your existing ATS workflow, calendar tools, and team chat. No rip-and-replace required.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {integrations.map((item, idx) => (
          <motion.div
            key={item.name}
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: idx * 0.08 }}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            className="bg-white border border-border rounded-xl p-6 shadow-xs hover:shadow-md transition-all text-left flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-slate-50 border border-border/80 flex items-center justify-center shadow-2xs">
                  {item.icon}
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-md">
                  {item.badge}
                </span>
              </div>
              <div className="text-xs text-muted font-medium">{item.category}</div>
              <h3 className="text-lg font-bold text-foreground mt-0.5 mb-2">{item.name}</h3>
              <p className="text-sm text-muted leading-relaxed">{item.description}</p>
            </div>

            <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-between text-xs font-semibold text-accent">
              <span>Deterministic API Export</span>
              <span>→</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Integration highlight banner */}
      <div className="mt-12 bg-white border border-border rounded-xl p-6 md:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xs">
        <div className="flex items-center gap-4 text-left">
          <div className="w-12 h-12 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          </div>
          <div>
            <h4 className="font-semibold text-foreground text-sm md:text-base">Custom Webhooks & REST API</h4>
            <p className="text-xs text-muted mt-1">Need a custom integration? Connect RecruitAI to internal recruitment tooling with authenticated webhook endpoints.</p>
          </div>
        </div>
        <div className="text-xs font-mono bg-slate-100 text-slate-700 border border-border px-3 py-2 rounded-md whitespace-nowrap">
          POST /api/v1/export
        </div>
      </div>
    </section>
  );
}
