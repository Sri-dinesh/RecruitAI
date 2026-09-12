import type { Metadata } from 'next';
import Link from 'next/link';
import Logo from '@/components/brand/Logo';
import DeleteAccountForm from '@/components/forms/DeleteAccountForm';

export const metadata: Metadata = {
  title: 'Delete Account & Data',
  description: 'How to delete your RecruitAI account and data — self-service and verified compliance deletion. Contact santhisridinesh@gmail.com',
  alternates: {
    canonical: 'https://recruitaiofficial.vercel.app/data-deletion',
  },
  openGraph: {
    title: 'Delete Account & Data | RecruitAI',
    description: 'How to delete your RecruitAI account and data — self-service and verified deletion request.',
    url: 'https://recruitaiofficial.vercel.app/data-deletion',
  },
};

const contactEmail = 'santhisridinesh@gmail.com';
const siteUrl = 'https://recruitaiofficial.vercel.app';

export default function DeleteAccountPage() {
  return (
    <div className="min-h-screen bg-[#F8F6F2] text-foreground selection:bg-accent selection:text-white">
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[#F8F6F2]/80 border-b border-border/60">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-4 flex items-center justify-between">
          <Logo href="/" size="md" priority />
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <Link href="/" className="text-muted hover:text-foreground transition-colors">Home</Link>
            <Link href="/privacy" className="text-muted hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/support" className="text-muted hover:text-foreground transition-colors">Support</Link>
          </nav>
          <a href={`mailto:${contactEmail}`} className="hidden md:inline-flex text-sm font-semibold bg-accent text-white px-4 py-2 rounded-md hover:bg-[#263a66] transition-colors">Request Deletion</a>
        </div>
      </header>

      <div className="relative overflow-hidden border-b border-border bg-white">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -right-32 w-[420px] h-[420px] bg-accent/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-[520px] h-[520px] bg-rose-500/5 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-6 md:px-8 py-12 md:py-16">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-[11px] font-semibold tracking-widest uppercase text-rose-700">Data Control • Deletion</span>
          <h1 className="font-serif text-4xl md:text-5xl tracking-tight leading-[0.95] mt-4">Delete your account<br />and data.</h1>
          <p className="text-muted text-lg leading-relaxed mt-4 max-w-2xl">Play Store compliant, self-serve and email-verified deletion. Choose the option that fits — in-app is instant, email is for lost access.</p>

          <div className="mt-8 grid md:grid-cols-3 gap-4 max-w-4xl">
            <div className="bg-[#F8F6F2] border border-border rounded-xl px-4 py-4">
              <div className="text-[11px] font-semibold tracking-widest uppercase text-muted">Primary Deletion</div>
              <div className="text-sm font-semibold text-foreground mt-1">Immediate</div>
              <div className="text-xs text-muted mt-1">Rows removed + Auth user deleted</div>
            </div>
            <div className="bg-[#F8F6F2] border border-border rounded-xl px-4 py-4">
              <div className="text-[11px] font-semibold tracking-widest uppercase text-muted">Backups</div>
              <div className="text-sm font-semibold text-foreground mt-1">Expire in 30 days</div>
              <div className="text-xs text-muted mt-1">Not recoverable after window</div>
            </div>
            <div className="bg-foreground text-white rounded-xl px-4 py-4">
              <div className="text-[11px] font-semibold tracking-widest uppercase text-white/60">Email SLA</div>
              <div className="text-sm font-semibold mt-1">7 business days</div>
              <a href={`mailto:${contactEmail}`} className="text-xs underline decoration-white/30 hover:decoration-white mt-1 inline-block">{contactEmail}</a>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-2 bg-white border border-border rounded-full px-3 py-1.5 font-mono text-muted"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> {siteUrl}/data-deletion</span>
            <span className="text-muted">Play Console Data Deletion URL — no login required</span>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 md:px-8 py-10 md:py-12">
        <div className="grid lg:grid-cols-[1.4fr_0.8fr] gap-8 items-start">
          <div className="space-y-6">
            {/* Option A */}
            <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 md:px-8 py-6 border-b border-border bg-[#faf9f7] flex items-start justify-between gap-4">
                <div>
                  <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-bold tracking-widest uppercase text-emerald-700">Recommended</span>
                  <h2 className="font-serif text-xl md:text-2xl mt-2">Option A — In-app (self-serve)</h2>
                  <p className="text-sm text-muted mt-1">Fastest — works on web dashboard and Android app.</p>
                </div>
                <span className="hidden md:inline-flex w-10 h-10 rounded-xl bg-accent text-white items-center justify-center font-bold">A</span>
              </div>
              <div className="px-6 md:px-8 py-6">
                <ol className="space-y-4">
                  {[
                    { t: 'Sign in', d: 'Open Dashboard or mobile app with your account email.', href: '/dashboard', label: 'Go to Dashboard →' },
                    { t: 'Delete a campaign', d: 'Open the session → Delete session — cascade deletes resumes, chunks, messages for that campaign.' },
                    { t: 'Delete full account', d: 'Account settings (web) or Profile → Delete Account (mobile) → Confirm. This deletes jobs, candidates, embeddings, sessions, messages linked to your user_id.' },
                    { t: 'Confirmation', d: 'You’ll see on-screen confirmation. If anything fails, use Option B (email).' },
                  ].map((s, i) => (
                    <li key={s.t} className="flex gap-4">
                      <span className="shrink-0 w-7 h-7 rounded-full bg-foreground text-white flex items-center justify-center text-xs font-bold mt-0.5">{i + 1}</span>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-foreground">{s.t}</div>
                        <div className="text-sm text-muted leading-relaxed">{s.d} {s.href && <Link href={s.href} className="text-accent underline font-medium ml-1">{s.label}</Link>}</div>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3">
                  <span className="shrink-0 w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center">✓</span>
                  <div>
                    <div className="text-sm font-semibold text-emerald-900">What gets deleted</div>
                    <div className="text-sm text-emerald-800 leading-relaxed mt-1">All primary rows in <code className="bg-white border border-emerald-200 px-1 py-0.5 rounded text-xs">jobs, candidates, resume_chunks, applications, interviews, chat_sessions, chat_messages</code> scoped to your user ID, plus Supabase Auth user. Backups expire within 30 days.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Option B */}
            <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 md:px-8 py-6 border-b border-border bg-white flex items-start justify-between gap-4">
                <div>
                  <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-bold tracking-widest uppercase text-amber-700">For lost access</span>
                  <h2 className="font-serif text-xl md:text-2xl mt-2">Option B — Email request (verified)</h2>
                  <p className="text-sm text-muted mt-1">If you can’t access the app, email from your account address.</p>
                </div>
                <span className="hidden md:inline-flex w-10 h-10 rounded-xl bg-[#F8F6F2] border border-border items-center justify-center font-bold text-muted">B</span>
              </div>
              <div className="px-6 md:px-8 py-6">
                <div className="bg-[#F8F6F2] border border-border rounded-xl p-5 space-y-3">
                  <div className="flex flex-wrap gap-2 text-sm">
                    <span className="text-muted">To:</span>
                    <a href={`mailto:${contactEmail}`} className="font-mono font-medium text-accent underline">{contactEmail}</a>
                  </div>
                  <div className="text-sm"><span className="text-muted">Subject:</span> <span className="font-mono font-medium text-foreground">Delete my RecruitAI account — [your email]</span></div>
                  <div className="bg-white border border-border rounded-lg p-4 text-sm text-muted leading-relaxed">
                    “Please delete my account and all associated data for <span className="font-semibold text-foreground">[your account email]</span>. I understand this is irreversible and I will lose all campaigns and history.”
                  </div>
                </div>
                <ul className="mt-5 list-disc pl-5 text-sm text-muted space-y-2 leading-relaxed">
                  <li>We verify ownership by replying to your account email — you must confirm.</li>
                  <li>Deletion completed within <span className="font-semibold text-foreground">7 business days</span> with email confirmation.</li>
                  <li>For subscriptions, also manage via <a href="https://play.google.com/store/account/subscriptions" target="_blank" rel="noopener" className="underline">Google Play Subscriptions</a>.</li>
                </ul>
                <div className="mt-6 flex flex-wrap gap-3">
                  <a href={`mailto:${contactEmail}?subject=Delete%20my%20RecruitAI%20account&body=Please%20delete%20my%20account%20and%20all%20associated%20data%20for%20[your%20email].%20I%20understand%20this%20is%20irreversible.`} className="inline-flex items-center justify-center bg-accent text-white text-sm font-semibold px-6 py-3 rounded-md hover:bg-[#263a66] transition-colors">Compose Email</a>
                  <Link href="/support" className="inline-flex items-center justify-center bg-white border border-border text-sm font-semibold px-6 py-3 rounded-md hover:bg-[#F8F6F2]">Contact Support</Link>
                </div>
              </div>
            </div>

            <DeleteAccountForm />
          </div>

          {/* Right rail */}
          <div className="space-y-6">
            <div className="bg-white border border-border rounded-2xl shadow-sm p-6">
              <h3 className="font-semibold text-foreground">Retention after deletion</h3>
              <div className="mt-4 space-y-3">
                {[
                  { k: 'Primary rows', v: 'Deleted immediately', d: 'Not recoverable after 30-day backup window' },
                  { k: 'Security logs', v: '90 days', d: 'Then anonymized unless law requires longer' },
                  { k: 'Embeddings & resumes', v: 'Not retained', d: 'Removed with account' },
                ].map((r) => (
                  <div key={r.k} className="bg-[#F8F6F2] border border-border rounded-xl px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">{r.k}</span>
                      <span className="text-xs font-semibold bg-white border border-border rounded-full px-2.5 py-1 text-muted">{r.v}</span>
                    </div>
                    <div className="text-xs text-muted mt-1 leading-relaxed">{r.d}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-border rounded-2xl p-6">
              <h3 className="font-semibold text-foreground">Need selective deletion?</h3>
              <p className="text-sm text-muted leading-relaxed mt-2">Request deletion of a single campaign or candidate pool by specifying session ID / job title and confirming ownership via email.</p>
              <a href={`mailto:${contactEmail}?subject=Selective%20deletion%20request`} className="mt-4 inline-flex w-full justify-center bg-white border border-border text-sm font-semibold px-4 py-2.5 rounded-md hover:bg-[#F8F6F2]">Request Selective Deletion</a>
            </div>

            <div className="bg-foreground text-white rounded-2xl p-6">
              <div className="text-sm font-semibold">Contact</div>
              <a href={`mailto:${contactEmail}`} className="mt-1 inline-block font-mono text-sm underline decoration-white/30 hover:decoration-white">{contactEmail}</a>
              <div className="text-xs text-white/50 mt-1">{siteUrl}</div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Link href="/privacy" className="bg-white/10 hover:bg-white/15 rounded-lg px-2 py-2 text-xs font-medium transition-colors">Privacy</Link>
                <Link href="/terms" className="bg-white/10 hover:bg-white/15 rounded-lg px-2 py-2 text-xs font-medium transition-colors">Terms</Link>
                <Link href="/support" className="bg-white text-foreground rounded-lg px-2 py-2 text-xs font-semibold hover:bg-[#f3f4f6]">Support</Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-border bg-white mt-6">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm text-muted">© {new Date().getFullYear()} RecruitAI • <a href={siteUrl} target="_blank" rel="noopener" className="underline">{siteUrl.replace('https://','')}</a> • <a href={`mailto:${contactEmail}`} className="underline">{contactEmail}</a></div>
          <div className="flex flex-wrap gap-6 text-sm font-medium">
            <Link href="/privacy" className="text-muted hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="text-muted hover:text-foreground">Terms</Link>
            <Link href="/data-deletion" className="text-foreground font-semibold">Data Deletion</Link>
            <Link href="/support" className="text-muted hover:text-foreground">Support</Link>
            <Link href="/" className="text-muted hover:text-foreground">Home</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
