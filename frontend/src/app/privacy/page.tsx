import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — RecruitAI',
  description: 'Privacy Policy for RecruitAI — how we collect, use, and protect your data. Hosted at https://recruitaiofficial.vercel.app/privacy',
};

const lastUpdated = 'September 11, 2026';
const effectiveDate = 'September 11, 2026';
const contactEmail = 'santhisridinesh@gmail.com';
const siteUrl = 'https://recruitaiofficial.vercel.app';

const toc = [
  { id: 'controller', label: '1. Data Controller' },
  { id: 'collect', label: '2. Data We Collect' },
  { id: 'use', label: '3. How We Use Data' },
  { id: 'ai', label: '4. AI & Third Parties' },
  { id: 'sharing', label: '5. Sharing' },
  { id: 'retention', label: '6. Retention' },
  { id: 'security', label: '7. Security' },
  { id: 'rights', label: '8. Your Rights' },
  { id: 'transfers', label: '9. International Transfers' },
  { id: 'children', label: '10. Children' },
  { id: 'permissions', label: '11. Android Permissions' },
  { id: 'datasafety', label: '12. Data Safety Summary' },
  { id: 'changes', label: '13. Changes' },
  { id: 'contact', label: '14. Contact' },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#F8F6F2] text-foreground selection:bg-accent selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[#F8F6F2]/80 border-b border-border/60">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="font-serif font-semibold text-xl tracking-tight">RecruitAI<span className="text-accent">.</span></Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <Link href="/" className="text-muted hover:text-foreground transition-colors">Home</Link>
            <Link href="/privacy" className="text-foreground">Privacy</Link>
            <Link href="/terms" className="text-muted hover:text-foreground transition-colors">Terms</Link>
            <Link href="/support" className="text-muted hover:text-foreground transition-colors">Support</Link>
          </nav>
          <Link href="/support" className="hidden md:inline-flex text-sm font-semibold bg-accent text-white px-4 py-2 rounded-md hover:bg-[#263a66] transition-colors">Contact Support</Link>
        </div>
      </header>

      {/* Hero */}
      <div className="relative overflow-hidden border-b border-border bg-white">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -right-32 w-[420px] h-[420px] bg-accent/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-[520px] h-[520px] bg-[#059669]/5 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-6 md:px-8 py-12 md:py-16">
          <div className="flex items-center gap-2 text-xs font-medium text-muted mb-4">
            <Link href="/" className="hover:text-foreground transition-colors inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-muted" /> Home</Link>
            <span className="opacity-40">/</span>
            <span className="text-foreground">Privacy Policy</span>
          </div>

          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">Legal • Privacy Policy</span>
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight leading-[0.95] mt-4">Privacy Policy</h1>
            <p className="text-muted text-lg leading-relaxed mt-4">
              How RecruitAI collects, uses, and protects your data across web and Android — transparent by design, built for Play Store compliance.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl">
            <div className="bg-[#F8F6F2] border border-border rounded-xl px-4 py-4">
              <div className="text-[11px] font-semibold tracking-widest uppercase text-muted">Last Updated</div>
              <div className="text-sm font-semibold text-foreground mt-1">{lastUpdated}</div>
            </div>
            <div className="bg-[#F8F6F2] border border-border rounded-xl px-4 py-4">
              <div className="text-[11px] font-semibold tracking-widest uppercase text-muted">Effective Date</div>
              <div className="text-sm font-semibold text-foreground mt-1">{effectiveDate}</div>
            </div>
            <div className="bg-foreground text-white rounded-xl px-4 py-4">
              <div className="text-[11px] font-semibold tracking-widest uppercase text-white/60">Contact</div>
              <a href={`mailto:${contactEmail}`} className="text-sm font-medium underline underline-offset-4 decoration-white/30 hover:decoration-white mt-1 inline-block">{contactEmail}</a>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-2 bg-white border border-border rounded-full px-3 py-1.5 font-mono text-muted"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> {siteUrl}/privacy</span>
            <span className="text-muted">Public URL for Play Console • No login required</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <main className="max-w-7xl mx-auto px-6 md:px-8 py-10 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-10 items-start">
          {/* TOC */}
          <aside className="hidden lg:block sticky top-24 self-start">
            <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
              <div className="text-[11px] font-semibold tracking-widest uppercase text-muted mb-3">On this page</div>
              <nav className="space-y-1">
                {toc.map((item) => (
                  <a key={item.id} href={`#${item.id}`} className="block text-sm text-muted hover:text-foreground hover:bg-[#F8F6F2] rounded-md px-2.5 py-1.5 transition-colors">
                    {item.label}
                  </a>
                ))}
              </nav>
            </div>

            <div className="mt-4 bg-accent text-white rounded-xl p-5">
              <div className="text-sm font-semibold">Need help with data?</div>
              <p className="text-sm text-white/70 leading-relaxed mt-2">Access, export or delete your data — we respond within 30 days.</p>
              <a href={`mailto:${contactEmail}?subject=Privacy%20request%20—%20RecruitAI`} className="mt-4 inline-flex items-center justify-center w-full bg-white text-foreground text-sm font-semibold px-4 py-2.5 rounded-md hover:bg-[#f3f4f6] transition-colors">Email Privacy Support</a>
              <Link href="/delete-account" className="mt-2 inline-flex justify-center w-full text-sm font-medium text-white/80 hover:text-white underline underline-offset-4">View deletion steps →</Link>
            </div>

            <div className="mt-4 bg-white border border-border rounded-xl p-5">
              <div className="text-xs font-semibold text-foreground">Quick links</div>
              <div className="mt-3 flex flex-col gap-2 text-sm">
                <Link href="/terms" className="text-muted hover:text-foreground transition-colors">→ Terms & Conditions</Link>
                <Link href="/support" className="text-muted hover:text-foreground transition-colors">→ Support & Contact</Link>
                <Link href="/delete-account" className="text-muted hover:text-foreground transition-colors">→ Data Deletion</Link>
                <a href={siteUrl} target="_blank" rel="noopener" className="text-muted hover:text-foreground transition-colors">→ {siteUrl.replace('https://','')}</a>
              </div>
            </div>
          </aside>

          {/* Article */}
          <article className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 md:px-10 py-8 md:py-10">
              <p className="text-[13px] leading-relaxed text-muted bg-[#F8F6F2] border border-border rounded-xl px-4 py-3">
                RecruitAI (“we,” “us,” “our”) operates a multi-agent recruitment intelligence platform on web and Android (Expo / React Native). By using RecruitAI you agree to this policy. Contact: <a href={`mailto:${contactEmail}`} className="text-accent underline underline-offset-4">{contactEmail}</a> • Site: <a href={siteUrl} target="_blank" rel="noopener" className="text-accent underline">{siteUrl}</a>.
              </p>

              <div className="mt-10 space-y-12">
                {/* 1 */}
                <section id="controller" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">1</span>
                    <h2 className="font-serif text-xl md:text-2xl text-foreground">Who we are — Data Controller</h2>
                  </div>
                  <div className="h-px bg-border mb-4" />
                  <p className="text-sm leading-relaxed text-muted">
                    RecruitAI is operated by the RecruitAI team. For privacy inquiries contact <a href={`mailto:${contactEmail}`} className="text-accent underline">{contactEmail}</a>. We are the controller for account and usage data; for candidate resumes you upload, you are the controller and we act as processor on your behalf. We handle requests within 30 days.
                  </p>
                </section>

                {/* 2 */}
                <section id="collect" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">2</span>
                    <h2 className="font-serif text-xl md:text-2xl text-foreground">Data we collect</h2>
                  </div>
                  <div className="h-px bg-border mb-4" />
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="border border-border rounded-xl p-5 bg-[#faf9f7]">
                      <h3 className="text-sm font-semibold text-foreground">2.1 Account & authentication</h3>
                      <ul className="mt-2 list-disc pl-5 text-sm text-muted space-y-1.5 leading-relaxed">
                        <li>Email address, password hash (or Google OAuth identifier) and Supabase user ID.</li>
                        <li>JWT validated server-side — we never store raw passwords.</li>
                      </ul>
                    </div>
                    <div className="border border-border rounded-xl p-5 bg-[#faf9f7]">
                      <h3 className="text-sm font-semibold text-foreground">2.2 Content you provide</h3>
                      <ul className="mt-2 list-disc pl-5 text-sm text-muted space-y-1.5 leading-relaxed">
                        <li>Job descriptions, resumes/CVs, rubric notes, chat messages, campaign sessions.</li>
                        <li>PDF/DOCX/TXT parsed to text and scoped to your account.</li>
                      </ul>
                    </div>
                    <div className="border border-border rounded-xl p-5 bg-white">
                      <h3 className="text-sm font-semibold text-foreground">2.3 Automatically collected</h3>
                      <ul className="mt-2 list-disc pl-5 text-sm text-muted space-y-1.5 leading-relaxed">
                        <li>Device info (OS, model), app version, crash logs, performance diagnostics.</li>
                        <li>Usage analytics (screens, campaigns, ingestion) — aggregated, no personal IDs.</li>
                        <li>IP address for rate limiting & security, retained briefly.</li>
                      </ul>
                    </div>
                    <div className="border border-emerald-200 bg-emerald-50/60 rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-emerald-900">2.4 We do not collect</h3>
                      <ul className="mt-2 list-disc pl-5 text-sm text-emerald-800 space-y-1.5 leading-relaxed">
                        <li>Background location, contacts, SMS, call logs, biometrics, advertising IDs.</li>
                        <li>We never sell data or use it for advertising.</li>
                      </ul>
                    </div>
                  </div>
                </section>

                {/* 3 */}
                <section id="use" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">3</span>
                    <h2 className="font-serif text-xl md:text-2xl text-foreground">How we use your data</h2>
                  </div>
                  <div className="h-px bg-border mb-4" />
                  <ul className="list-disc pl-5 text-sm text-muted space-y-2 leading-relaxed">
                    <li>Provide core features: parsing, pgvector search, rubric scoring, blind redaction, interview/outreach drafting, analytics, ATS export.</li>
                    <li>Authenticate you, enforce Row-Level Security so you only access your own data.</li>
                    <li>Improve reliability — error diagnostics, LLM failover (Gemini ↔ Groq), support.</li>
                    <li>Comply with law and enforce Terms.</li>
                  </ul>
                  <p className="mt-3 text-xs text-muted bg-[#F8F6F2] border border-border rounded-lg px-3 py-2">Legal bases (EEA/UK): contract, legitimate interests (security, improvement), consent for optional content, and legal compliance.</p>
                </section>

                {/* 4 */}
                <section id="ai" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">4</span>
                    <h2 className="font-serif text-xl md:text-2xl text-foreground">AI processing & third-party services</h2>
                  </div>
                  <div className="h-px bg-border mb-4" />
                  <p className="text-sm text-muted leading-relaxed">We transmit only the minimum context for the task to:</p>
                  <div className="mt-4 grid md:grid-cols-3 gap-4">
                    <div className="border border-border rounded-xl p-5">
                      <div className="text-sm font-semibold text-foreground">Google Gemini & Groq</div>
                      <p className="text-xs text-muted leading-relaxed mt-2">LLM inference for routing, scoring, questions, outreach. Only redacted/task text is sent — never passwords or device data.</p>
                    </div>
                    <div className="border border-border rounded-xl p-5">
                      <div className="text-sm font-semibold text-foreground">Tavily Search</div>
                      <p className="text-xs text-muted leading-relaxed mt-2">Generic salary/skill lookups (role/skills) — no personal identifiers.</p>
                    </div>
                    <div className="border border-border rounded-xl p-5">
                      <div className="text-sm font-semibold text-foreground">Supabase</div>
                      <p className="text-xs text-muted leading-relaxed mt-2">Postgres + pgvector + Auth. Data encrypted in transit (TLS) and at rest per provider.</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted mt-3">Processors act only on our instructions and may not use your content to train other customers’ models.</p>
                </section>

                {/* 5 */}
                <section id="sharing" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">5</span>
                    <h2 className="font-serif text-xl md:text-2xl text-foreground">Sharing</h2>
                  </div>
                  <div className="h-px bg-border mb-4" />
                  <ul className="list-disc pl-5 text-sm text-muted space-y-1.5 leading-relaxed">
                    <li>With processors above, only as needed.</li>
                    <li>When you explicitly export/share (ATS JSON/CSV, PDFs, confirmed emails).</li>
                    <li>If required by law, to protect rights/safety, or in a corporate transaction (with notice).</li>
                  </ul>
                  <p className="text-sm text-foreground font-medium mt-3">We do not share personal data with advertisers or data brokers.</p>
                </section>

                {/* 6 */}
                <section id="retention" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">6</span>
                    <h2 className="font-serif text-xl md:text-2xl text-foreground">Data retention</h2>
                  </div>
                  <div className="h-px bg-border mb-4" />
                  <div className="border border-border rounded-xl overflow-hidden">
                    <div className="grid grid-cols-3 bg-[#F8F6F2] text-[11px] font-semibold tracking-widest uppercase text-muted px-4 py-3">
                      <span>Category</span><span>Retention</span><span>Notes</span>
                    </div>
                    <div className="divide-y divide-border text-sm">
                      <div className="grid grid-cols-3 px-4 py-3"><span className="text-foreground font-medium">Campaign content</span><span className="text-muted">Until you delete</span><span className="text-muted">Jobs, resumes, embeddings, chats</span></div>
                      <div className="grid grid-cols-3 px-4 py-3"><span className="text-foreground font-medium">Backups</span><span className="text-muted">Up to 30 days</span><span className="text-muted">Disaster recovery</span></div>
                      <div className="grid grid-cols-3 px-4 py-3"><span className="text-foreground font-medium">Logs</span><span className="text-muted">Up to 90 days</span><span className="text-muted">Then anonymized</span></div>
                    </div>
                  </div>
                  <p className="text-xs text-muted mt-3">After account deletion, primary data removed within 30 days; backups expire as above.</p>
                </section>

                {/* 7 */}
                <section id="security" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">7</span>
                    <h2 className="font-serif text-xl md:text-2xl text-foreground">Security</h2>
                  </div>
                  <div className="h-px bg-border mb-4" />
                  <p className="text-sm text-muted leading-relaxed">TLS for all transport, JWT via Supabase Auth, RLS per table (<code className="bg-slate-100 border border-border px-1.5 py-0.5 rounded text-xs">auth.uid() = user_id</code>), least-privilege service-role. Blind Mode redacts PII before LLM scoring. No system is 100% secure — we monitor logs and patch promptly.</p>
                </section>

                {/* 8 */}
                <section id="rights" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">8</span>
                    <h2 className="font-serif text-xl md:text-2xl text-foreground">Your rights & choices</h2>
                  </div>
                  <div className="h-px bg-border mb-4" />
                  <div className="grid md:grid-cols-2 gap-4">
                    {[
                      { t: 'Access / export', d: `Request a copy via ${contactEmail} or in-app export.` },
                      { t: 'Correction', d: 'Edit jobs/candidates in dashboard or contact support.' },
                      { t: 'Deletion', d: 'Delete sessions or full account — see Data Deletion page.' },
                      { t: 'Objection / Restriction', d: 'Contact us to restrict processing where law allows.' },
                      { t: 'Withdraw consent', d: 'Withdraw at any time without affecting prior processing.' },
                      { t: 'Complaints', d: 'EEA/UK may lodge with authority; contact us first.' },
                    ].map((c) => (
                      <div key={c.t} className="border border-border rounded-xl p-4 bg-[#faf9f7]">
                        <div className="text-sm font-semibold text-foreground">{c.t}</div>
                        <div className="text-sm text-muted mt-1 leading-relaxed">{c.d}</div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 9-11 short */}
                <section id="transfers" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">9</span>
                    <h2 className="font-serif text-xl md:text-2xl text-foreground">International transfers</h2>
                  </div>
                  <div className="h-px bg-border mb-4" />
                  <p className="text-sm text-muted leading-relaxed">Data is processed where Supabase and LLM providers host services, potentially outside your country. Where required we use Standard Contractual Clauses or equivalent.</p>
                </section>

                <section id="children" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">10</span>
                    <h2 className="font-serif text-xl md:text-2xl text-foreground">Children’s privacy</h2>
                  </div>
                  <div className="h-px bg-border mb-4" />
                  <p className="text-sm text-muted leading-relaxed">For recruiters 18+. We do not knowingly collect data from children under 13 (or under 16 where applicable). Contact us for deletion if you believe a child provided data.</p>
                </section>

                <section id="permissions" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">11</span>
                    <h2 className="font-serif text-xl md:text-2xl text-foreground">Permissions (Android)</h2>
                  </div>
                  <div className="h-px bg-border mb-4" />
                  <p className="text-sm text-muted leading-relaxed">Internet for API calls, optional file picker for resume/JD upload, optional notifications if enabled. No background location, contacts, or SMS. Added permissions will be disclosed here and in Play Console Data Safety.</p>
                </section>

                {/* 12 Data Safety */}
                <section id="datasafety" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">12</span>
                    <h2 className="font-serif text-xl md:text-2xl text-foreground">Data Safety — Google Play summary</h2>
                  </div>
                  <div className="h-px bg-border mb-4" />
                  <div className="bg-[#F8F6F2] border border-border rounded-xl p-5">
                    <div className="grid md:grid-cols-2 gap-4 text-sm">
                      <div><span className="font-semibold text-foreground">Collected:</span><span className="text-muted"> Email, resumes/JDs, app activity, crash logs</span></div>
                      <div><span className="font-semibold text-foreground">Purposes:</span><span className="text-muted"> Functionality, security, analytics</span></div>
                      <div><span className="font-semibold text-foreground">Shared with:</span><span className="text-muted"> Gemini/Groq, Tavily, Supabase (as needed)</span></div>
                      <div><span className="font-semibold text-foreground">Encryption:</span><span className="text-muted"> In transit yes • At rest via providers</span></div>
                      <div className="md:col-span-2"><span className="font-semibold text-foreground">Deletion:</span><span className="text-muted"> Self-serve & via support — see Delete Account</span></div>
                    </div>
                  </div>
                </section>

                <section id="changes" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">13</span>
                    <h2 className="font-serif text-xl md:text-2xl text-foreground">Changes to this policy</h2>
                  </div>
                  <div className="h-px bg-border mb-4" />
                  <p className="text-sm text-muted leading-relaxed">We post updates here and revise the date. Material changes notified via in-app notice or email. Continued use after effective date is acceptance.</p>
                </section>

                <section id="contact" className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">14</span>
                    <h2 className="font-serif text-xl md:text-2xl text-foreground">Contact</h2>
                  </div>
                  <div className="h-px bg-border mb-4" />
                  <div className="bg-foreground text-white rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold">Questions or requests?</div>
                      <div className="text-sm text-white/70 mt-1">We respond within 30 days (often 2 business days).</div>
                      <a href={`mailto:${contactEmail}`} className="inline-flex mt-2 text-sm font-mono underline decoration-white/30 hover:decoration-white">{contactEmail}</a>
                      <div className="text-xs text-white/50 mt-1">{siteUrl}</div>
                    </div>
                    <a href={`mailto:${contactEmail}?subject=Privacy%20request`} className="shrink-0 inline-flex items-center justify-center bg-white text-foreground text-sm font-semibold px-6 py-3 rounded-md hover:bg-[#f3f4f6] transition-colors">Email Us</a>
                  </div>
                  <p className="text-xs text-muted mt-4">Include your account email and the right you wish to exercise. This policy does not constitute legal advice — have counsel review before final submission.</p>
                </section>
              </div>
            </div>
          </article>
        </div>
      </main>

      <footer className="border-t border-border bg-white mt-10">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm text-muted">© {new Date().getFullYear()} RecruitAI • <a href={siteUrl} target="_blank" rel="noopener" className="underline">{siteUrl.replace('https://','')}</a> • <a href={`mailto:${contactEmail}`} className="underline">{contactEmail}</a></div>
          <div className="flex gap-6 text-sm font-medium">
            <Link href="/terms" className="text-muted hover:text-foreground">Terms</Link>
            <Link href="/support" className="text-muted hover:text-foreground">Support</Link>
            <Link href="/" className="text-muted hover:text-foreground">Home</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
