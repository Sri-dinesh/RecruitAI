import Link from 'next/link';
import SupportContactForm from '@/components/forms/SupportContactForm';

export const metadata = {
  title: 'Support & Contact — RecruitAI',
  description: 'Support and contact for RecruitAI — web and Android help. Contact santhisridinesh@gmail.com',
};

const contactEmail = 'santhisridinesh@gmail.com';
const siteUrl = 'https://recruitaiofficial.vercel.app';

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-[#F8F6F2] text-foreground selection:bg-accent selection:text-white">
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[#F8F6F2]/80 border-b border-border/60">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="font-serif font-semibold text-xl tracking-tight">RecruitAI<span className="text-accent">.</span></Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <Link href="/" className="text-muted hover:text-foreground transition-colors">Home</Link>
            <Link href="/privacy" className="text-muted hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="text-muted hover:text-foreground transition-colors">Terms</Link>
            <Link href="/support" className="text-foreground">Support</Link>
          </nav>
          <a href={`mailto:${contactEmail}`} className="hidden md:inline-flex text-sm font-semibold bg-accent text-white px-4 py-2 rounded-md hover:bg-[#263a66] transition-colors">Email Support</a>
        </div>
      </header>

      <div className="relative overflow-hidden border-b border-border bg-white">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -right-32 w-[420px] h-[420px] bg-accent/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-[520px] h-[520px] bg-[#059669]/5 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-6 md:px-8 py-12 md:py-16">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">Support • Contact</span>
          <h1 className="font-serif text-4xl md:text-5xl tracking-tight leading-[0.95] mt-4">We’re here to help.</h1>
          <p className="text-muted text-lg leading-relaxed mt-4 max-w-2xl">Support for web and Android. We respond within <span className="font-semibold text-foreground">2 business days</span> — often faster. For Play Store orders, include your order ID (GPA.XXXX) and device details.</p>

          <div className="mt-8 grid md:grid-cols-3 gap-4 max-w-4xl">
            <a href={`mailto:${contactEmail}`} className="group bg-foreground text-white rounded-xl p-5 flex flex-col hover:bg-[#1a1f2e] transition-colors">
              <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              </div>
              <div className="text-sm font-semibold mt-3">Email Support</div>
              <div className="text-sm font-mono text-white/80 mt-1 break-all">{contactEmail}</div>
              <div className="text-xs text-white/50 mt-2 group-hover:text-white/70">General, technical & privacy requests</div>
            </a>
            <div className="bg-[#F8F6F2] border border-border rounded-xl p-5">
              <div className="w-10 h-10 rounded-lg bg-white border border-border flex items-center justify-center text-accent">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              </div>
              <div className="text-sm font-semibold text-foreground mt-3">Response Time</div>
              <div className="text-sm text-muted mt-1">Within 2 business days</div>
              <div className="text-xs text-muted mt-2">Privacy deletions within 7 business days</div>
            </div>
            <div className="bg-white border border-border rounded-xl p-5">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <div className="text-sm font-semibold text-foreground mt-3">Website</div>
              <a href={siteUrl} target="_blank" rel="noopener" className="text-sm text-accent underline mt-1 inline-block">{siteUrl.replace('https://','')}</a>
              <div className="text-xs text-muted mt-2">Public URLs — no login required</div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 md:px-8 py-10 md:py-12">
        <div className="grid lg:grid-cols-[1.35fr_0.85fr] gap-8 items-start">
          {/* Left */}
          <div className="space-y-6">
            <div className="bg-white border border-border rounded-2xl shadow-sm p-6 md:p-8">
              <h2 className="font-serif text-xl">Before you write — quick checks</h2>
              <p className="text-sm text-muted mt-1">Try these first — they resolve most issues instantly.</p>
              <div className="mt-6 grid sm:grid-cols-2 gap-4">
                {[
                  { title: 'Auth errors', desc: 'Sign out and sign in again — your JWT may have expired.' },
                  { title: 'Self-hosted setup', desc: 'Verify NEXT_PUBLIC_BACKEND_URL and Supabase keys in .env.' },
                  { title: 'Mobile — stale bundle', desc: 'Clear cache or reinstall. Ensure EXPO_PUBLIC_BACKEND_URL is reachable.' },
                  { title: 'Outreach not sending?', desc: 'Type “yes / confirm” in chat — HITL requires explicit approval.' },
                ].map((c) => (
                  <div key={c.title} className="border border-border rounded-xl p-4 bg-[#faf9f7]">
                    <div className="text-sm font-semibold text-foreground">{c.title}</div>
                    <div className="text-sm text-muted leading-relaxed mt-1">{c.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <SupportContactForm />

            <div className="bg-white border border-border rounded-2xl shadow-sm p-6 md:p-8">
              <h2 className="font-serif text-xl">Report an issue</h2>
              <p className="text-sm text-muted leading-relaxed mt-2">Email us from your account email with:</p>
              <ol className="mt-4 space-y-3">
                {[
                  'Account email & campaign/session ID (if relevant)',
                  'Expected vs actual behavior',
                  'Steps to reproduce + device/OS + screenshots',
                  'For Play Store: order ID (GPA.XXXX)',
                ].map((t, i) => (
                  <li key={t} className="flex gap-3 text-sm">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">{i + 1}</span>
                    <span className="text-muted leading-relaxed">{t}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-6 flex flex-wrap gap-3">
                <a href={`mailto:${contactEmail}?subject=RecruitAI%20Support%20Request`} className="inline-flex items-center justify-center bg-accent text-white text-sm font-semibold px-6 py-3 rounded-md hover:bg-[#263a66] transition-colors">Email Support</a>
                <a href="https://github.com/Sri-dinesh/RecruitAI/issues" target="_blank" rel="noopener" className="inline-flex items-center justify-center bg-white border border-border text-sm font-semibold px-6 py-3 rounded-md hover:bg-[#F8F6F2] transition-colors">GitHub Issues</a>
              </div>
              <p className="text-xs text-muted mt-3">Public tracker — omit personal candidate data.</p>
            </div>
          </div>

          {/* Right */}
          <div className="space-y-6">
            <div className="bg-white border border-border rounded-2xl shadow-sm p-6">
              <h3 className="font-semibold text-foreground">Contact at a glance</h3>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between bg-[#F8F6F2] border border-border rounded-lg px-4 py-3">
                  <span className="text-muted">Email</span>
                  <a href={`mailto:${contactEmail}`} className="font-mono font-medium text-foreground underline">{contactEmail}</a>
                </div>
                <div className="flex items-center justify-between bg-[#F8F6F2] border border-border rounded-lg px-4 py-3">
                  <span className="text-muted">Website</span>
                  <a href={siteUrl} target="_blank" rel="noopener" className="font-mono font-medium text-accent underline">{siteUrl.replace('https://','')}</a>
                </div>
                <div className="flex items-center justify-between bg-white border border-border rounded-lg px-4 py-3">
                  <span className="text-muted">Privacy requests</span>
                  <span className="text-foreground font-medium">30-day response</span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-border rounded-2xl shadow-sm p-6">
              <h3 className="font-semibold text-foreground">Play Store — required URLs</h3>
              <p className="text-sm text-muted mt-1 leading-relaxed">Use these exact public URLs in Play Console (no login required).</p>
              <div className="mt-4 space-y-2.5">
                {[
                  { label: 'Support', path: '/support' },
                  { label: 'Privacy', path: '/privacy' },
                  { label: 'Terms', path: '/terms' },
                  { label: 'Data Deletion', path: '/delete-account' },
                ].map((r) => (
                  <div key={r.path} className="flex items-center justify-between gap-3 bg-[#F8F6F2] border border-border rounded-lg px-3 py-2.5">
                    <span className="text-xs font-semibold text-foreground">{r.label}</span>
                    <a href={`${siteUrl}${r.path}`} target="_blank" rel="noopener" className="font-mono text-xs text-accent underline truncate">{siteUrl}{r.path}</a>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <Link href="/privacy" className="flex-1 text-center bg-white border border-border rounded-md px-3 py-2 text-sm font-medium hover:bg-[#F8F6F2]">Privacy</Link>
                <Link href="/terms" className="flex-1 text-center bg-white border border-border rounded-md px-3 py-2 text-sm font-medium hover:bg-[#F8F6F2]">Terms</Link>
                <Link href="/delete-account" className="flex-1 text-center bg-accent text-white rounded-md px-3 py-2 text-sm font-semibold hover:bg-[#263a66]">Deletion</Link>
              </div>
            </div>

            <div className="bg-[#faf9f7] border border-border rounded-2xl p-6">
              <div className="text-sm font-semibold text-foreground">Tip for Play reviewers</div>
              <p className="text-sm text-muted leading-relaxed mt-2">Ensure all four URLs above are publicly accessible and return 200. Link them from your app’s store listing “Privacy Policy” field and Data Safety declarations.</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-border bg-white mt-6">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm text-muted">© {new Date().getFullYear()} RecruitAI • <a href={siteUrl} target="_blank" rel="noopener" className="underline">{siteUrl.replace('https://','')}</a> • <a href={`mailto:${contactEmail}`} className="underline">{contactEmail}</a></div>
          <div className="flex gap-6 text-sm font-medium">
            <Link href="/privacy" className="text-muted hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="text-muted hover:text-foreground">Terms</Link>
            <Link href="/" className="text-muted hover:text-foreground">Home</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
