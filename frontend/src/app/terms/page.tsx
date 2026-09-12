import Link from 'next/link';
import Logo from '@/components/brand/Logo';

export const metadata = {
  title: 'Terms & Conditions — RecruitAI',
  description: 'Terms & Conditions for RecruitAI — hosted at https://recruitaiofficial.vercel.app/terms',
};

const lastUpdated = 'September 11, 2026';
const contactEmail = 'santhisridinesh@gmail.com';
const siteUrl = 'https://recruitaiofficial.vercel.app';

const toc = [
  { id: 'eligibility', label: '1. Eligibility & Accounts' },
  { id: 'description', label: '2. Description of Service' },
  { id: 'acceptable', label: '3. Acceptable Use' },
  { id: 'candidate', label: '4. Candidate Data' },
  { id: 'hitl', label: '5. Human-in-the-Loop' },
  { id: 'ip', label: '6. Intellectual Property' },
  { id: 'thirdparty', label: '7. Third-Party Services' },
  { id: 'fees', label: '8. Fees & Taxes' },
  { id: 'privacy', label: '9. Data Protection' },
  { id: 'disclaimers', label: '10. Disclaimers' },
  { id: 'liability', label: '11. Limitation of Liability' },
  { id: 'indemnity', label: '12. Indemnification' },
  { id: 'termination', label: '13. Termination' },
  { id: 'changes', label: '14. Changes' },
  { id: 'law', label: '15. Governing Law' },
  { id: 'contact', label: '16. Contact' },
  { id: 'play', label: '17. Google Play' },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#F8F6F2] text-foreground selection:bg-accent selection:text-white">
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[#F8F6F2]/80 border-b border-border/60">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-4 flex items-center justify-between">
          <Logo href="/" size="md" priority />
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <Link href="/" className="text-muted hover:text-foreground transition-colors">Home</Link>
            <Link href="/privacy" className="text-muted hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="text-foreground">Terms</Link>
            <Link href="/support" className="text-muted hover:text-foreground transition-colors">Support</Link>
          </nav>
          <Link href="/support" className="hidden md:inline-flex text-sm font-semibold bg-accent text-white px-4 py-2 rounded-md hover:bg-[#263a66] transition-colors">Contact Support</Link>
        </div>
      </header>

      <div className="relative overflow-hidden border-b border-border bg-white">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -right-32 w-[420px] h-[420px] bg-accent/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-[520px] h-[520px] bg-[#059669]/5 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-6 md:px-8 py-12 md:py-16">
          <div className="flex items-center gap-2 text-xs font-medium text-muted mb-4">
            <Link href="/" className="hover:text-foreground inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-muted" /> Home</Link>
            <span className="opacity-40">/</span>
            <span className="text-foreground">Terms & Conditions</span>
          </div>
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">Legal • Terms & Conditions</span>
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight leading-[0.95] mt-4">Terms & Conditions</h1>
            <p className="text-muted text-lg leading-relaxed mt-4">The rules for using RecruitAI on web and Android. By creating an account you agree to these Terms and our Privacy Policy.</p>
          </div>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl">
            <div className="bg-[#F8F6F2] border border-border rounded-xl px-4 py-4">
              <div className="text-[11px] font-semibold tracking-widest uppercase text-muted">Last Updated</div>
              <div className="text-sm font-semibold text-foreground mt-1">{lastUpdated}</div>
            </div>
            <div className="bg-[#F8F6F2] border border-border rounded-xl px-4 py-4">
              <div className="text-[11px] font-semibold tracking-widest uppercase text-muted">Effective</div>
              <div className="text-sm font-semibold text-foreground mt-1">{lastUpdated}</div>
            </div>
            <div className="bg-foreground text-white rounded-xl px-4 py-4">
              <div className="text-[11px] font-semibold tracking-widest uppercase text-white/60">Questions?</div>
              <a href={`mailto:${contactEmail}`} className="text-sm font-medium underline decoration-white/30 hover:decoration-white mt-1 inline-block">{contactEmail}</a>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-2 bg-white border border-border rounded-full px-3 py-1.5 font-mono text-muted"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> {siteUrl}/terms</span>
            <span className="text-muted">Public URL for Play Console</span>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 md:px-8 py-10 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-10 items-start">
          <aside className="hidden lg:block sticky top-24 self-start">
            <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
              <div className="text-[11px] font-semibold tracking-widest uppercase text-muted mb-3">Contents</div>
              <nav className="space-y-1">
                {toc.map((i) => (
                  <a key={i.id} href={`#${i.id}`} className="block text-sm text-muted hover:text-foreground hover:bg-[#F8F6F2] rounded-md px-2.5 py-1.5 transition-colors">{i.label}</a>
                ))}
              </nav>
            </div>
            <div className="mt-4 bg-white border border-border rounded-xl p-5">
              <div className="text-xs font-semibold text-foreground">Related</div>
              <div className="mt-3 flex flex-col gap-2 text-sm">
                <Link href="/privacy" className="text-muted hover:text-foreground">→ Privacy Policy</Link>
                <Link href="/data-deletion" className="text-muted hover:text-foreground">→ Data Deletion</Link>
                <Link href="/support" className="text-muted hover:text-foreground">→ Support</Link>
              </div>
            </div>
            <div className="mt-4 bg-accent text-white rounded-xl p-5">
              <div className="text-sm font-semibold">Need legal help?</div>
              <p className="text-sm text-white/70 mt-1 leading-relaxed">We reply within 2 business days.</p>
              <a href={`mailto:${contactEmail}`} className="mt-3 inline-flex w-full justify-center bg-white text-foreground text-sm font-semibold px-4 py-2.5 rounded-md hover:bg-[#f3f4f6]">Email Legal</a>
            </div>
          </aside>

          <article className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 md:px-10 py-8 md:py-10">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex gap-3">
                <span className="shrink-0 w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm">!</span>
                <div>
                  <div className="text-sm font-semibold text-amber-900">Please read carefully</div>
                  <p className="text-sm text-amber-800 leading-relaxed mt-1">AI outputs are suggestions based on your inputs and rubric. Verify qualifications, conduct lawful interviews, and comply with employment law before decisions. RecruitAI does not guarantee outcomes.</p>
                </div>
              </div>

              <div className="mt-10 space-y-12">
                <section id="eligibility" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3"><span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">1</span><h2 className="font-serif text-xl md:text-2xl">Eligibility & Accounts</h2></div>
                  <div className="h-px bg-border mb-4" />
                  <ul className="list-disc pl-5 text-sm text-muted space-y-2 leading-relaxed">
                    <li>You must be 18+ and capable of forming a binding contract.</li>
                    <li>You are responsible for credentials and all activity under your account. Report unauthorized use to <a href={`mailto:${contactEmail}`} className="text-accent underline">{contactEmail}</a>.</li>
                    <li>One account per person/seat — sharing credentials is prohibited.</li>
                  </ul>
                </section>

                <section id="description" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3"><span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">2</span><h2 className="font-serif text-xl md:text-2xl">Description of Service</h2></div>
                  <div className="h-px bg-border mb-4" />
                  <p className="text-sm text-muted leading-relaxed">RecruitAI provides multi-agent assistance: parsing resumes/JDs, semantic retrieval, rubric-based evaluation with optional blind redaction, interview generation, outreach drafting, scheduling suggestions, and ATS-compatible exports. It is an assistive tool — not a decision-maker. See <Link href="/privacy" className="underline">Privacy Policy</Link> for data handling.</p>
                </section>

                <section id="acceptable" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3"><span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">3</span><h2 className="font-serif text-xl md:text-2xl">Acceptable Use</h2></div>
                  <div className="h-px bg-border mb-4" />
                  <p className="text-sm text-muted">You agree not to:</p>
                  <ul className="mt-2 list-disc pl-5 text-sm text-muted space-y-2 leading-relaxed">
                    <li>Upload unlawful, infringing, or sensitive data you lack permission to process.</li>
                    <li>Bypass RLS, rate limits, or authentication, or access another tenant’s data.</li>
                    <li>Discriminate unlawfully or make solely automated decisions with legal effect where prohibited.</li>
                    <li>Reverse engineer, scrape at scale, or inject adversarial prompts to exfiltrate data.</li>
                    <li>Misrepresent AI content as verified human fact without review.</li>
                  </ul>
                </section>

                <section id="candidate" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3"><span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">4</span><h2 className="font-serif text-xl md:text-2xl">Candidate Data & Your Responsibilities</h2></div>
                  <div className="h-px bg-border mb-4" />
                  <ul className="list-disc pl-5 text-sm text-muted space-y-2 leading-relaxed">
                    <li>You warrant lawful basis to upload/process candidate info and contact them.</li>
                    <li>You remain responsible for privacy and employment law compliance (GDPR, EEOC, local labor law) and non-discriminatory evaluation.</li>
                    <li>Blind Mode redacts common identifiers before scoring, but apply your own fairness review.</li>
                  </ul>
                </section>

                <section id="hitl" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3"><span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">5</span><h2 className="font-serif text-xl md:text-2xl">Human-in-the-Loop</h2></div>
                  <div className="h-px bg-border mb-4" />
                  <div className="bg-[#F8F6F2] border border-border rounded-xl p-5">
                    <p className="text-sm text-muted leading-relaxed">Emails and calendar holds execute only after explicit confirmation (“yes” / “confirm” in chat). Without confirmation, drafts remain unsent and slots unbooked. You are solely responsible for communications you approve.</p>
                  </div>
                </section>

                <section id="ip" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3"><span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">6</span><h2 className="font-serif text-xl md:text-2xl">Intellectual Property</h2></div>
                  <div className="h-px bg-border mb-4" />
                  <ul className="list-disc pl-5 text-sm text-muted space-y-2 leading-relaxed">
                    <li>We retain all rights in the Service (models, prompts, workflows, UI). You receive a non-exclusive, non-transferable license for internal recruitment.</li>
                    <li>You retain rights in uploads; you grant us a license to process them to provide the Service (embeddings, reports). We don’t claim ownership of candidate data.</li>
                    <li>Voluntary feedback may be used to improve the Service.</li>
                  </ul>
                </section>

                <section id="thirdparty" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3"><span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">7</span><h2 className="font-serif text-xl md:text-2xl">Third-Party Services</h2></div>
                  <div className="h-px bg-border mb-4" />
                  <p className="text-sm text-muted leading-relaxed">We integrate Google Gemini, Groq, Tavily, and Supabase per our <Link href="/privacy" className="underline">Privacy Policy</Link>. Availability outside our control; we apply failover routing but don’t guarantee uninterrupted operation.</p>
                </section>

                <section id="fees" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3"><span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">8</span><h2 className="font-serif text-xl md:text-2xl">Subscriptions, Fees & Taxes</h2></div>
                  <div className="h-px bg-border mb-4" />
                  <ul className="list-disc pl-5 text-sm text-muted space-y-2 leading-relaxed">
                    <li>Pricing as shown at checkout or Play listing; taxes excluded unless stated.</li>
                    <li>Subscriptions renew per term until canceled via account or Play Subscriptions manager. No refunds except where law or Google Play policy requires.</li>
                    <li>Price changes prospectively with 30 days’ notice.</li>
                  </ul>
                </section>

                <section id="privacy" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3"><span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">9</span><h2 className="font-serif text-xl md:text-2xl">Data Protection</h2></div>
                  <div className="h-px bg-border mb-4" />
                  <p className="text-sm text-muted leading-relaxed">Handling described in <Link href="/privacy" className="underline">Privacy Policy</Link>. For deletion steps see <Link href="/data-deletion" className="underline">Data Deletion</Link>.</p>
                </section>

                <section id="disclaimers" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3"><span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">10</span><h2 className="font-serif text-xl md:text-2xl">Disclaimers</h2></div>
                  <div className="h-px bg-border mb-4" />
                  <p className="text-[11px] font-semibold tracking-widest uppercase text-muted">Please read carefully</p>
                  <p className="text-sm text-muted leading-relaxed mt-2">Service provided “as is” and “as available” without warranties of accuracy, non-infringement, or fitness. We don’t warrant scores are error-free, unbiased in all contexts, or compliant in every jurisdiction. Verify independently.</p>
                </section>

                <section id="liability" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3"><span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">11</span><h2 className="font-serif text-xl md:text-2xl">Limitation of Liability</h2></div>
                  <div className="h-px bg-border mb-4" />
                  <p className="text-sm text-muted leading-relaxed">To max extent permitted: (a) we exclude indirect/incidental/special/consequential/punitive damages; (b) aggregate liability limited to amount paid in 12 months prior to claim (or $100 if free tier). Some jurisdictions disallow limits — they apply only as permitted.</p>
                </section>

                <section id="indemnity" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3"><span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">12</span><h2 className="font-serif text-xl md:text-2xl">Indemnification</h2></div>
                  <div className="h-px bg-border mb-4" />
                  <p className="text-sm text-muted leading-relaxed">You indemnify RecruitAI and personnel from claims, damages, expenses arising from your content, use, or violation of Terms or law.</p>
                </section>

                <section id="termination" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3"><span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">13</span><h2 className="font-serif text-xl md:text-2xl">Termination</h2></div>
                  <div className="h-px bg-border mb-4" />
                  <ul className="list-disc pl-5 text-sm text-muted space-y-2 leading-relaxed">
                    <li>You may terminate by deleting account or discontinuing use — see <Link href="/data-deletion" className="underline">Delete Account</Link>.</li>
                    <li>We may suspend/terminate for breach, misuse, or legal requirement. On termination, rights cease; data deleted/anonymized per retention unless law requires longer.</li>
                  </ul>
                </section>

                <section id="changes" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3"><span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">14</span><h2 className="font-serif text-xl md:text-2xl">Changes to Terms</h2></div>
                  <div className="h-px bg-border mb-4" />
                  <p className="text-sm text-muted leading-relaxed">We may update Terms; material changes notified via app or email with new effective date. Continued use after effective date is acceptance. Discontinue and delete account if you disagree.</p>
                </section>

                <section id="law" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3"><span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">15</span><h2 className="font-serif text-xl md:text-2xl">Governing Law & Disputes</h2></div>
                  <div className="h-px bg-border mb-4" />
                  <p className="text-sm text-muted leading-relaxed">Governed by law in your residence, without conflict-of-laws. Where permitted, courts of that jurisdiction apply. For Play purchases, Google Play distribution terms also apply.</p>
                </section>

                <section id="contact" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3"><span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">16</span><h2 className="font-serif text-xl md:text-2xl">Contact & Grievances</h2></div>
                  <div className="h-px bg-border mb-4" />
                  <div className="bg-foreground text-white rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold">Questions or legal notices?</div>
                      <div className="text-sm text-white/70 mt-1">Response within 2 business days; grievances within 30 days.</div>
                      <a href={`mailto:${contactEmail}`} className="inline-flex mt-2 text-sm font-mono underline decoration-white/30 hover:decoration-white">{contactEmail}</a>
                      <div className="text-xs text-white/50 mt-1">{siteUrl}</div>
                    </div>
                    <a href={`mailto:${contactEmail}?subject=Legal%20inquiry`} className="shrink-0 inline-flex items-center justify-center bg-white text-foreground text-sm font-semibold px-6 py-3 rounded-md hover:bg-[#f3f4f6]">Email Legal</a>
                  </div>
                </section>

                <section id="play" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3"><span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">17</span><h2 className="font-serif text-xl md:text-2xl">Google Play Acknowledgement</h2></div>
                  <div className="h-px bg-border mb-4" />
                  <p className="text-sm text-muted leading-relaxed">Android users via Google Play also agree to Play Terms and acknowledge Google may enforce policies on content, subscriptions, and refunds. Our Data Safety disclosures reflect the Privacy Policy.</p>
                </section>

                <p className="text-xs text-muted border-t border-border pt-6">This template does not constitute legal advice. Have counsel review for your jurisdiction. Contact: <a href={`mailto:${contactEmail}`} className="underline">{contactEmail}</a> • <a href={siteUrl} target="_blank" rel="noopener" className="underline">{siteUrl}</a></p>
              </div>
            </div>
          </article>
        </div>
      </main>

      <footer className="border-t border-border bg-white mt-10">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm text-muted">© {new Date().getFullYear()} RecruitAI • <a href={siteUrl} target="_blank" rel="noopener" className="underline">{siteUrl.replace('https://','')}</a> • <a href={`mailto:${contactEmail}`} className="underline">{contactEmail}</a></div>
          <div className="flex flex-wrap gap-6 text-sm font-medium">
            <Link href="/privacy" className="text-muted hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="text-foreground font-semibold">Terms</Link>
            <Link href="/data-deletion" className="text-muted hover:text-foreground">Data Deletion</Link>
            <Link href="/support" className="text-muted hover:text-foreground">Support</Link>
            <Link href="/" className="text-muted hover:text-foreground">Home</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
