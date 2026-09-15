'use client';

import { motion } from 'framer-motion';

const comparisonPoints = [
  {
    category: 'Candidate Evaluation',
    legacy: 'Naive keyword matching (candidates who keyword-stuff win; qualified engineers with alternative phrasing are rejected).',
    recruitAI: 'Multi-dimensional rubric scoring derived from your actual JD with semantic understanding of tech stacks and real impact.',
    highlight: true,
  },
  {
    category: 'Bias & Blind Screening',
    legacy: 'Unconscious demographic bias influenced by candidate names, graduation years, photos, and university prestige.',
    recruitAI: 'Strict Blind Mode: PII and demographic markers automatically redacted before LLM evaluation and scoring.',
    highlight: false,
  },
  {
    category: 'Pipeline Velocity',
    legacy: '15–20 hours spent per role manually skimming resumes, creating spreadsheets, and debating vague impressions.',
    recruitAI: 'Sub-second parsing and objective scorecards for 500+ resumes simultaneously with clear rank order.',
    highlight: false,
  },
  {
    category: 'Candidate Outreach',
    legacy: 'Generic mass-blast email templates resulting in single-digit reply rates and negative candidate experience.',
    recruitAI: 'Personalized, context-aware interview questions and outreach drafts — always requiring 1-click human approval.',
    highlight: false,
  },
  {
    category: 'Platform Accessibility',
    legacy: 'Rigid, desktop-only enterprise software requiring tedious logins and non-responsive legacy interfaces.',
    recruitAI: 'Cross-platform productivity: Premium web command center + official Android app live on Google Play.',
    highlight: true,
  },
];

export default function ComparisonSection() {
  return (
    <section className="scroll-section py-20 md:py-32 px-8 max-w-7xl mx-auto border-b border-border">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <span className="text-[11px] font-semibold tracking-widest uppercase text-accent bg-accent/10 border border-accent/20 px-3 py-1 rounded-full">
          Why RecruitAI
        </span>
        <h2 className="font-serif text-3xl md:text-4xl text-foreground mt-4 mb-4">
          The difference between keyword filtering and true candidate intelligence.
        </h2>
        <p className="text-muted text-lg leading-relaxed">
          Traditional ATS filters reject great talent based on arbitrary formatting. RecruitAI evaluates engineering substance with objective criteria.
        </p>
      </div>

      {/* Comparison Table */}
      <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden text-left">
        <div className="grid grid-cols-1 md:grid-cols-12 border-b border-border bg-[#faf9f7] font-serif text-sm md:text-base font-semibold text-foreground">
          <div className="p-4 md:p-6 md:col-span-3 border-b md:border-b-0 md:border-r border-border">Capability</div>
          <div className="p-4 md:p-6 md:col-span-4 border-b md:border-b-0 md:border-r border-border text-muted">Legacy Keyword ATS</div>
          <div className="p-4 md:p-6 md:col-span-5 text-accent flex items-center gap-2">
            <span>RecruitAI Agentic Platform</span>
            <span className="text-[10px] uppercase font-sans font-bold bg-accent text-white px-2 py-0.5 rounded">Modern Standard</span>
          </div>
        </div>

        <div className="divide-y divide-border">
          {comparisonPoints.map((row, idx) => (
            <motion.div
              key={row.category}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
              className={`grid grid-cols-1 md:grid-cols-12 text-sm ${row.highlight ? 'bg-accent/[0.02]' : ''}`}
            >
              <div className="p-4 md:p-6 md:col-span-3 font-semibold text-foreground border-b md:border-b-0 md:border-r border-border/80 flex items-center">
                {row.category}
              </div>
              <div className="p-4 md:p-6 md:col-span-4 text-muted border-b md:border-b-0 md:border-r border-border/80 flex items-center leading-relaxed">
                <div className="flex items-start gap-2.5">
                  <span className="text-rose-500 font-bold shrink-0">✕</span>
                  <span>{row.legacy}</span>
                </div>
              </div>
              <div className="p-4 md:p-6 md:col-span-5 text-foreground flex items-center leading-relaxed bg-accent/[0.03]">
                <div className="flex items-start gap-2.5">
                  <span className="text-emerald-600 font-bold shrink-0">✓</span>
                  <span className="font-medium">{row.recruitAI}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
