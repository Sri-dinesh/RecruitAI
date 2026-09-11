'use client';

import { motion } from 'framer-motion';

export default function FeatureHighlights() {
  return (
    <section className="py-20 md:py-32 px-8 max-w-7xl mx-auto space-y-24 md:space-y-40 overflow-hidden">
      {/* Feature 1 — Blind mode: illustrate redaction without real personal data */}
      <div className="feature-row flex flex-col md:flex-row items-center gap-16 md:gap-24">
        <div className="feature-text flex-1">
          <span className="inline-block text-[11px] font-semibold tracking-widest uppercase text-accent bg-accent/10 border border-accent/20 px-3 py-1 rounded-full mb-4">Unbiased Screening</span>
          <h3 className="font-serif text-3xl md:text-4xl text-foreground mb-6">Unbiased screening by default.</h3>
          <p className="text-muted text-lg leading-relaxed">
            Activate Blind Mode to automatically redact names, contact details, and demographic markers before evaluation. Every assessment is grounded in your role-specific rubric — not personal identifiers.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-muted">
            <li className="flex gap-2"><span className="text-emerald-600">✓</span> Redaction happens before LLM scoring</li>
            <li className="flex gap-2"><span className="text-emerald-600">✓</span> Rubric covers experience, stack proficiency, and impact</li>
            <li className="flex gap-2"><span className="text-emerald-600">✓</span> You control when to reveal identifying context</li>
          </ul>
        </div>
        <div className="feature-panel slide-right flex-1 w-full bg-[#fcfcfc] border border-border rounded-xl shadow-lg overflow-hidden group">
          <div className="bg-[#f3f4f6] px-4 py-3 border-b border-border flex justify-between items-center">
            <div className="flex gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#d1d5db]"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-[#d1d5db]"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-[#d1d5db]"></div>
            </div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-700 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Blind Mode — Illustrative
            </div>
          </div>
          <div className="p-8 space-y-6 bg-white relative overflow-hidden">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-slate-100 border border-border flex items-center justify-center text-muted">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center px-2.5 py-1 rounded bg-slate-100 border border-border text-xs font-mono text-muted">[REDACTED — Name]</span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded bg-slate-100 border border-border text-xs font-mono text-muted">[REDACTED — Contact]</span>
                </div>
                <div className="mt-2 text-xs text-muted">Personal identifiers are withheld during scoring. Replace this placeholder with your own candidate data after upload.</div>
              </div>
            </div>
            <div className="space-y-4 font-mono text-sm pt-4 border-t border-border">
              <div className="flex justify-between items-center"><span className="text-muted">Evaluation input</span><span className="text-foreground font-medium">Redacted resume chunk</span></div>
              <div className="flex justify-between items-center"><span className="text-muted">Rubric dimension</span><span className="text-foreground font-medium">Stack proficiency</span></div>
              <div className="flex justify-between items-center"><span className="text-muted">Human gate</span><span className="inline-flex items-center gap-1 text-emerald-700 font-medium"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"/> Approval required</span></div>
            </div>
            <p className="text-[11px] text-muted leading-relaxed bg-[#faf9f7] border border-border rounded-lg p-3">Example only. No real person represented. Upload resumes to generate actual evaluations scoped to your account.</p>
          </div>
        </div>
      </div>

      {/* Feature 2 — Deterministic JSON: generic, no personal id */}
      <div className="feature-row flex flex-col md:flex-row-reverse items-center gap-16 md:gap-24">
        <div className="feature-text flex-1">
          <span className="inline-block text-[11px] font-semibold tracking-widest uppercase text-accent bg-accent/10 border border-accent/20 px-3 py-1 rounded-full mb-4">ATS-Ready Outputs</span>
          <h3 className="font-serif text-3xl md:text-4xl text-foreground mb-6">Deterministic, structured outputs.</h3>
          <p className="text-muted text-lg leading-relaxed">
            Agent outputs are validated with strict schemas so exports are predictable. Generate Greenhouse, Lever, and Workday-compatible payloads without manual reformatting.
          </p>
          <p className="text-sm text-muted mt-4">Illustrative JSON shown — your exports will contain your actual job and application IDs.</p>
        </div>
        <div className="feature-panel slide-left flex-1 w-full bg-[#111111] border border-border rounded-xl shadow-2xl overflow-hidden group">
          <div className="bg-[#1a1a1a] px-4 py-3 border-b border-[#333] flex justify-between items-center">
            <div className="flex gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#333]"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-[#333]"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-[#333]"></div>
            </div>
            <div className="text-[10px] font-mono text-[#888]">ats_export.json — example</div>
          </div>
          <div className="p-8 text-[#f8f8f2] font-mono text-sm leading-relaxed overflow-hidden relative">
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12"
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 4, ease: "easeInOut" }}
            />
            <pre className="relative z-10">
{`{
  "job_id": "your-job-id",
  "application": {
    "candidate_ref": "anonymized-ref",
    "alignment_score": 0.94,
    "skills_matched": [
      "TypeScript",
      "React",
      "Next.js"
    ],
    "recommendation": "Strong Fit — rubric-based",
    "blind_mode": true
  }
}`}
            </pre>
            <p className="mt-4 text-[11px] font-sans text-[#888]">Schema-validated. No demonstrative personal data included.</p>
          </div>
        </div>
      </div>

      {/* Feature 3: Evaluation Matrix — anonymized profiles */}
      <div className="feature-row flex flex-col md:flex-row items-center gap-16 md:gap-24">
        <div className="feature-text flex-1">
          <span className="inline-block text-[11px] font-semibold tracking-widest uppercase text-accent bg-accent/10 border border-accent/20 px-3 py-1 rounded-full mb-4">Graded Rubric</span>
          <h3 className="font-serif text-3xl md:text-4xl text-foreground mb-6">Side-by-side evaluation matrix.</h3>
          <p className="text-muted text-lg leading-relaxed">
            RecruitAI builds a grading rubric from your job description and scores each resume chunk point-by-point. Compare anonymized profiles to make consistent, auditable decisions.
          </p>
          <p className="text-sm text-muted mt-4">Profiles are labeled generically (Profile A, B) when blind mode is active — no names or contacts are shown in this illustration.</p>
        </div>
        <div className="feature-panel slide-right flex-1 w-full bg-white border border-border rounded-xl shadow-lg p-8 md:p-10 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent to-accent/50"></div>
          <div className="space-y-6">
            <div className="flex justify-between items-end pb-4 border-b border-border">
              <span className="text-lg font-serif text-foreground">Scorecard Matrix — Example</span>
              <span className="text-xs text-muted font-medium bg-[#f3f4f6] px-2 py-1 rounded">2 anonymized profiles</span>
            </div>
            <div className="space-y-6 text-sm">
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs text-muted mb-1">
                  <span className="w-1/3">Rubric criterion</span>
                  <span className="w-1/3 text-center font-mono">Profile A</span>
                  <span className="w-1/3 text-center font-mono">Profile B</span>
                </div>

                <div className="flex justify-between items-center p-2 rounded hover:bg-[#f3f4f6] transition-colors">
                  <span className="text-foreground font-medium w-1/3">Architecture</span>
                  <div className="w-1/3 flex justify-center">
                    <div className="w-12 h-1.5 bg-border rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} whileInView={{ width: '100%' }} viewport={{ once: false }} transition={{ duration: 1, ease: 'easeOut' }} className="h-full bg-accent"></motion.div>
                    </div>
                  </div>
                  <div className="w-1/3 flex justify-center">
                    <div className="w-12 h-1.5 bg-border rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} whileInView={{ width: '80%' }} viewport={{ once: false }} transition={{ duration: 1, delay: 0.1, ease: 'easeOut' }} className="h-full bg-muted"></motion.div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center p-2 rounded hover:bg-[#f3f4f6] transition-colors">
                  <span className="text-foreground font-medium w-1/3">React / Frontend</span>
                  <div className="w-1/3 flex justify-center">
                    <div className="w-12 h-1.5 bg-border rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} whileInView={{ width: '100%' }} viewport={{ once: false }} transition={{ duration: 1, delay: 0.2, ease: 'easeOut' }} className="h-full bg-accent"></motion.div>
                    </div>
                  </div>
                  <div className="w-1/3 flex justify-center">
                    <div className="w-12 h-1.5 bg-border rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} whileInView={{ width: '90%' }} viewport={{ once: false }} transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }} className="h-full bg-muted"></motion.div>
                    </div>
                  </div>
                </div>

              </div>
              <div className="flex justify-between items-center pt-4 border-t border-border border-dashed bg-[#faf9f7] p-3 rounded">
                <span className="text-foreground font-semibold w-1/3">Alignment (illustrative)</span>
                <span className="text-accent font-bold w-1/3 text-center text-lg">High</span>
                <span className="text-foreground font-semibold w-1/3 text-center text-lg">Strong</span>
              </div>
              <p className="text-[11px] text-muted text-center">Replace with your actual pipeline — this view contains no real candidate identities.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Feature 4: Outreach & Scheduling — generic recipient */}
      <div className="feature-row flex flex-col md:flex-row-reverse items-center gap-16 md:gap-24">
        <div className="feature-text flex-1">
          <span className="inline-block text-[11px] font-semibold tracking-widest uppercase text-accent bg-accent/10 border border-accent/20 px-3 py-1 rounded-full mb-4">Human-in-the-loop</span>
          <h3 className="font-serif text-3xl md:text-4xl text-foreground mb-6">Outreach gated by human approval.</h3>
          <p className="text-muted text-lg leading-relaxed">
            Generate tailored outreach that references the candidate’s relevant experience and your JD highlights. Emails and calendar holds execute only after you explicitly confirm.
          </p>
          <p className="text-sm text-muted mt-4">Tone options (Professional, Casual, Direct) and time-slot recommendations are suggestions — you decide what gets sent.</p>
        </div>
        <div className="feature-panel slide-left flex-1 w-full bg-white border border-border rounded-xl shadow-lg p-1 overflow-hidden group">
          <div className="bg-[#fcfcfc] border-b border-border px-4 py-3 flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-[#f3f4f6] flex items-center justify-center text-muted">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
            </div>
            <div className="text-xs font-medium text-muted">Draft — requires approval</div>
            <div className="ml-auto bg-white border border-border text-muted px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5">
              Awaiting confirm
            </div>
          </div>
          <div className="p-6">
            <div className="flex gap-4 items-center border-b border-border pb-3 mb-4 text-sm">
              <span className="text-muted w-8">To:</span>
              <span className="bg-[#f3f4f6] px-2 py-0.5 rounded text-foreground font-medium font-mono text-xs">[Candidate — anonymized]</span>
            </div>
            <div className="flex gap-4 items-center border-b border-border pb-3 mb-4 text-sm">
              <span className="text-muted w-8">Sub:</span>
              <span className="text-foreground font-medium text-sm">Interview invitation — your active role title</span>
            </div>
            <div className="space-y-4 text-sm text-foreground leading-relaxed">
              <p>Hi there,</p>
              <p>Your experience with <span className="bg-accent/10 text-accent px-1 rounded font-semibold">the stack listed in the JD</span> aligns closely with what our team is building. We’d like to invite you to the next stage.</p>
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                viewport={{ once: false }}
                className="border border-border rounded-lg p-4 bg-[#faf9f7] my-4 shadow-sm"
              >
                <div className="font-semibold mb-2 flex items-center gap-2 text-sm">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                  Suggested time slots — illustrative
                </div>
                <div className="flex gap-2">
                  <div className="bg-white border border-border px-3 py-2 rounded text-xs font-medium hover:border-accent hover:text-accent cursor-pointer transition-colors">Option A</div>
                  <div className="bg-white border border-border px-3 py-2 rounded text-xs font-medium hover:border-accent hover:text-accent cursor-pointer transition-colors">Option B</div>
                </div>
                <p className="text-[11px] text-muted mt-2">Slots are suggestions pending your confirmation and actual calendar availability.</p>
              </motion.div>
              <p className="text-xs text-muted bg-amber-50 border border-amber-200 rounded px-3 py-2">⚠ Draft only — no email is sent until you click Confirm. Review before sending.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
