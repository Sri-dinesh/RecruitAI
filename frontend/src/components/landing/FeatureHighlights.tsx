'use client';

import { motion } from 'framer-motion';

export default function FeatureHighlights() {
  return (
    <section className="py-20 md:py-32 px-8 max-w-7xl mx-auto space-y-24 md:space-y-40 overflow-hidden">
      {/* Feature 1 — Blind mode: rigorous objective evaluation */}
      <div className="feature-row flex flex-col md:flex-row items-center gap-16 md:gap-24">
        <div className="feature-text flex-1">
          <span className="inline-block text-[11px] font-semibold tracking-widest uppercase text-accent bg-accent/10 border border-accent/20 px-3 py-1 rounded-full mb-4">
            Unbiased Intelligence
          </span>
          <h3 className="font-serif text-3xl md:text-4xl text-foreground mb-6">
            Objective, blind screening by design.
          </h3>
          <p className="text-muted text-lg leading-relaxed">
            Eliminate subconscious bias from top-of-funnel hiring. RecruitAI automatically redacts names, contact details, graduation years, photos, and institutional prestige markers before scoring — evaluating candidates solely on verified competence.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-foreground/80">
            <li className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">✓</span>
              <span>Demographic redaction executes automatically before LLM reasoning</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">✓</span>
              <span>Scoring calibrated to role-specific technical depth, stack mastery, and impact</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">✓</span>
              <span>Toggle blind mode per requisition and reveal identity only when ready</span>
            </li>
          </ul>
        </div>
        <div className="feature-panel slide-right flex-1 w-full bg-[#fcfcfc] border border-border rounded-xl shadow-lg overflow-hidden group">
          <div className="bg-[#f3f4f6] px-4 py-3 border-b border-border flex justify-between items-center">
            <div className="flex gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#d1d5db]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#d1d5db]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#d1d5db]" />
            </div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-700 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Blind Evaluation Active
            </div>
          </div>
          <div className="p-8 space-y-6 bg-white relative overflow-hidden">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-slate-100 border border-border flex items-center justify-center text-muted">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center px-2.5 py-1 rounded bg-slate-100 border border-border text-xs font-mono text-foreground/80 font-semibold">[Candidate ID #8420]</span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded bg-emerald-50 border border-emerald-200 text-xs font-mono text-emerald-700 font-semibold">[Demographics Redacted]</span>
                </div>
                <div className="mt-2 text-xs text-muted">8+ Years Experience • Distributed Systems • Senior/Staff Level Track Record</div>
              </div>
            </div>
            <div className="space-y-4 font-mono text-sm pt-4 border-t border-border">
              <div className="flex justify-between items-center"><span className="text-muted">Evaluation Criterion</span><span className="text-foreground font-semibold">High-Concurrency Architecture</span></div>
              <div className="flex justify-between items-center"><span className="text-muted">Rubric Depth Score</span><span className="text-emerald-700 font-bold">96/100 (Exceptional Fit)</span></div>
              <div className="flex justify-between items-center"><span className="text-muted">Human Verification Gate</span><span className="inline-flex items-center gap-1.5 text-accent font-semibold"><span className="w-2 h-2 bg-accent rounded-full"/> Required before Outreach</span></div>
            </div>
            <div className="bg-[#faf9f7] border border-border rounded-lg p-3 text-xs text-muted flex items-center gap-2">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>Full audit log recorded with Supabase Row-Level Security tenant isolation.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Feature 2 — Deterministic JSON & ATS Output */}
      <div className="feature-row flex flex-col md:flex-row-reverse items-center gap-16 md:gap-24">
        <div className="feature-text flex-1">
          <span className="inline-block text-[11px] font-semibold tracking-widest uppercase text-accent bg-accent/10 border border-accent/20 px-3 py-1 rounded-full mb-4">
            Structured ATS Output
          </span>
          <h3 className="font-serif text-3xl md:text-4xl text-foreground mb-6">
            Deterministic, schema-validated candidate data.
          </h3>
          <p className="text-muted text-lg leading-relaxed">
            Eliminate fuzzy, unpredictable AI hallucinations. RecruitAI validates every agent output with strict Pydantic schemas so your exports plug seamlessly into Greenhouse, Lever, and Workday without custom glue code.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-foreground/80">
            <li className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">✓</span>
              <span>1-click JSON, CSV, and scorecard export formats</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">✓</span>
              <span>Exact technical proficiency matches with verified source snippets</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">✓</span>
              <span>Confidence scoring and identified experience gaps highlighted</span>
            </li>
          </ul>
        </div>
        <div className="feature-panel slide-left flex-1 w-full bg-[#111111] border border-border rounded-xl shadow-2xl overflow-hidden group">
          <div className="bg-[#1a1a1a] px-4 py-3 border-b border-[#333] flex justify-between items-center">
            <div className="flex gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#333]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#333]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#333]" />
            </div>
            <div className="text-[10px] font-mono text-[#888]">ats_candidate_export.json</div>
          </div>
          <div className="p-8 text-[#f8f8f2] font-mono text-sm leading-relaxed overflow-hidden relative">
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12"
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 4, ease: "easeInOut" }}
            />
            <pre className="relative z-10 text-xs sm:text-sm">
{`{
  "candidate_ref": "CAN-8420-DISTRIB",
  "role_title": "Staff Backend Engineer",
  "alignment_score": 0.96,
  "blind_screening": true,
  "skills_verified": [
    "Rust / Tokio async runtime",
    "Distributed Consensus (Raft)",
    "High-throughput Kafka / ClickHouse",
    "Kubernetes Operator development"
  ],
  "rubric_assessment": {
    "architecture_impact": 5.0,
    "concurrency_depth": 4.9,
    "system_resilience": 4.8
  },
  "status": "Shortlisted — Ready for Human Confirm"
}`}
            </pre>
            <div className="mt-4 pt-3 border-t border-[#2a2a2a] text-[11px] font-sans text-emerald-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Validated against Greenhouse & Lever API schemas</span>
            </div>
          </div>
        </div>
      </div>

      {/* Feature 3: Evaluation Matrix */}
      <div className="feature-row flex flex-col md:flex-row items-center gap-16 md:gap-24">
        <div className="feature-text flex-1">
          <span className="inline-block text-[11px] font-semibold tracking-widest uppercase text-accent bg-accent/10 border border-accent/20 px-3 py-1 rounded-full mb-4">
            Comparative Intelligence
          </span>
          <h3 className="font-serif text-3xl md:text-4xl text-foreground mb-6">
            Side-by-side rubric matrix.
          </h3>
          <p className="text-muted text-lg leading-relaxed">
            Stop comparing resumes with gut feelings. RecruitAI maps every candidate against your calibrated rubric so hiring managers and interviewers see exact strengths, depth scores, and technical gaps in one glance.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-foreground/80">
            <li className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">✓</span>
              <span>Direct comparative scoring across up to 10 criteria dimensions</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">✓</span>
              <span>Instant gap identification to guide focused interview loops</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">✓</span>
              <span>Exportable matrix for collaborative hiring committee review</span>
            </li>
          </ul>
        </div>
        <div className="feature-panel slide-right flex-1 w-full bg-white border border-border rounded-xl shadow-lg p-8 md:p-10 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent to-emerald-500" />
          <div className="space-y-6 text-left">
            <div className="flex justify-between items-end pb-4 border-b border-border">
              <span className="text-lg font-serif font-bold text-foreground">Candidate Alignment Matrix</span>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">
                Live Funnel
              </span>
            </div>
            <div className="space-y-4 text-sm">
              <div className="flex justify-between items-center text-xs text-muted mb-1">
                <span className="w-2/5 font-semibold">Rubric Dimension</span>
                <span className="w-1/4 text-center font-mono font-bold text-accent">Profile A (#8420)</span>
                <span className="w-1/4 text-center font-mono font-bold text-muted">Profile B (#3911)</span>
              </div>

              <div className="flex justify-between items-center p-2 rounded hover:bg-[#f3f4f6] transition-colors">
                <span className="text-foreground font-medium w-2/5">Distributed Systems</span>
                <div className="w-1/4 flex justify-center">
                  <div className="w-16 h-2 bg-border rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} whileInView={{ width: '96%' }} viewport={{ once: true }} transition={{ duration: 1, ease: 'easeOut' }} className="h-full bg-accent" />
                  </div>
                </div>
                <div className="w-1/4 flex justify-center">
                  <div className="w-16 h-2 bg-border rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} whileInView={{ width: '78%' }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.1, ease: 'easeOut' }} className="h-full bg-muted" />
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center p-2 rounded hover:bg-[#f3f4f6] transition-colors">
                <span className="text-foreground font-medium w-2/5">Rust / Concurrency</span>
                <div className="w-1/4 flex justify-center">
                  <div className="w-16 h-2 bg-border rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} whileInView={{ width: '94%' }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.15, ease: 'easeOut' }} className="h-full bg-accent" />
                  </div>
                </div>
                <div className="w-1/4 flex justify-center">
                  <div className="w-16 h-2 bg-border rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} whileInView={{ width: '84%' }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.2, ease: 'easeOut' }} className="h-full bg-muted" />
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center p-2 rounded hover:bg-[#f3f4f6] transition-colors">
                <span className="text-foreground font-medium w-2/5">Cloud Native (K8s/Docker)</span>
                <div className="w-1/4 flex justify-center">
                  <div className="w-16 h-2 bg-border rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} whileInView={{ width: '90%' }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.25, ease: 'easeOut' }} className="h-full bg-accent" />
                  </div>
                </div>
                <div className="w-1/4 flex justify-center">
                  <div className="w-16 h-2 bg-border rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} whileInView={{ width: '88%' }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }} className="h-full bg-muted" />
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center p-2 rounded hover:bg-[#f3f4f6] transition-colors">
                <span className="text-foreground font-medium w-2/5">Architecture Leadership</span>
                <div className="w-1/4 flex justify-center">
                  <div className="w-16 h-2 bg-border rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} whileInView={{ width: '92%' }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.35, ease: 'easeOut' }} className="h-full bg-accent" />
                  </div>
                </div>
                <div className="w-1/4 flex justify-center">
                  <div className="w-16 h-2 bg-border rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} whileInView={{ width: '70%' }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.4, ease: 'easeOut' }} className="h-full bg-muted" />
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-border bg-[#faf9f7] p-3 rounded-lg">
                <span className="text-foreground font-semibold w-2/5">Overall Fit Recommendation</span>
                <span className="text-emerald-700 font-bold w-1/4 text-center text-sm">Strong Yes (96%)</span>
                <span className="text-muted font-medium w-1/4 text-center text-sm">Review (80%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature 4: Outreach & Scheduling with HITL */}
      <div className="feature-row flex flex-col md:flex-row-reverse items-center gap-16 md:gap-24">
        <div className="feature-text flex-1">
          <span className="inline-block text-[11px] font-semibold tracking-widest uppercase text-accent bg-accent/10 border border-accent/20 px-3 py-1 rounded-full mb-4">
            Human-in-the-Loop Safeguards
          </span>
          <h3 className="font-serif text-3xl md:text-4xl text-foreground mb-6">
            Autonomous drafting. Recruiter confirmed.
          </h3>
          <p className="text-muted text-lg leading-relaxed">
            AI should accelerate recruiters, never replace them. RecruitAI synthesizes candidate achievements into targeted interview loops and personalized email reachouts — but never sends an email or reserves a calendar slot without your explicit confirmation.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-foreground/80">
            <li className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">✓</span>
              <span>Contextual emails citing exact candidate projects and company priorities</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">✓</span>
              <span>Role-specific technical screening questions tailored to candidate gaps</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">✓</span>
              <span>100% human-approved: Zero autonomous outbound messaging</span>
            </li>
          </ul>
        </div>
        <div className="feature-panel slide-left flex-1 w-full bg-white border border-border rounded-xl shadow-lg p-1 overflow-hidden group">
          <div className="bg-[#fcfcfc] border-b border-border px-4 py-3 flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-accent/10 text-accent flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </div>
            <div className="text-xs font-semibold text-foreground">Outreach Co-Pilot • Draft Review</div>
            <div className="ml-auto bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Confirmation Required
            </div>
          </div>
          <div className="p-6 text-left">
            <div className="flex gap-4 items-center border-b border-border pb-3 mb-4 text-sm">
              <span className="text-muted w-8 font-medium">To:</span>
              <span className="bg-slate-100 px-2 py-0.5 rounded text-foreground font-semibold text-xs">[Candidate #8420 — Ready to Dispatch]</span>
            </div>
            <div className="flex gap-4 items-center border-b border-border pb-3 mb-4 text-sm">
              <span className="text-muted w-8 font-medium">Sub:</span>
              <span className="text-foreground font-semibold text-sm">Staff Backend Role — Impressed by your distributed systems work</span>
            </div>
            <div className="space-y-4 text-sm text-foreground leading-relaxed">
              <p>Hello,</p>
              <p>I reviewed your background leading high-concurrency Rust and distributed consensus architectures. Given what our team is building around zero-downtime event streaming, your depth of experience stood out immediately in our evaluation rubric.</p>
              <div className="border border-border rounded-lg p-4 bg-[#faf9f7] my-4 shadow-2xs">
                <div className="font-semibold mb-2 flex items-center gap-2 text-xs text-foreground">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  Proposed Interview Slots (Calendar-Verified):
                </div>
                <div className="flex gap-2">
                  <div className="bg-white border border-accent/40 text-accent font-semibold px-3 py-1.5 rounded text-xs">Thursday, 2:00 PM EST</div>
                  <div className="bg-white border border-border text-foreground px-3 py-1.5 rounded text-xs hover:border-accent transition-colors">Friday, 11:00 AM EST</div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted">Ready for 1-click send</span>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 border border-border rounded text-xs font-semibold text-foreground hover:bg-slate-50">Edit</button>
                  <button className="px-4 py-1.5 bg-accent text-white rounded text-xs font-semibold hover:bg-accent/90 shadow-2xs">Confirm & Send →</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
