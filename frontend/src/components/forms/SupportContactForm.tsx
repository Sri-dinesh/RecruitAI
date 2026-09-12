'use client';

import { useState } from 'react';

const CONTACT_EMAIL = 'santhisridinesh@gmail.com';

// Set in Vercel: NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY (from https://web3forms.com, recipient = CONTACT_EMAIL)
// If unset, form falls back to opening the user's mail client — still production-ready.
const WEB3FORMS_ACCESS_KEY = process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY || '';

export default function SupportContactForm() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);

    // honeypot
    if ((fd.get('botcheck') as string)?.trim() !== '') return;

    const name = (fd.get('name') as string)?.trim();
    const email = (fd.get('email') as string)?.trim();
    const subject = (fd.get('subject') as string)?.trim();
    const message = (fd.get('message') as string)?.trim();
    const topic = (fd.get('topic') as string) || 'General';

    if (!name || !email || !subject || !message) {
      setStatus('error');
      setErrorMsg('Please fill in all required fields.');
      return;
    }

    // If no Web3Forms key configured, fallback to mailto — still lets user contact you
    if (!WEB3FORMS_ACCESS_KEY) {
      const mailtoBody = `Topic: ${topic}\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\n\nMessage:\n${message}\n\n—\nSent from ${typeof window !== 'undefined' ? window.location.href : ''}`;
      const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`[RecruitAI Support] ${topic} — ${subject}`)}&body=${encodeURIComponent(mailtoBody)}`;
      window.location.href = mailto;
      setStatus('success');
      form.reset();
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    // Use FormData (recommended by Web3Forms) — more reliable than JSON across browsers
    const payload = new FormData();
    payload.append('access_key', WEB3FORMS_ACCESS_KEY);
    payload.append('subject', `[RecruitAI Support] ${topic} — ${subject}`);
    payload.append('from_name', 'RecruitAI Support Form');
    payload.append('name', name);
    payload.append('email', email);
    payload.append('topic', topic);
    payload.append('message', message);
    payload.append('page', typeof window !== 'undefined' ? window.location.href : '');

    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        body: payload,
      });
      const data = await res.json();
      if (data.success) {
        setStatus('success');
        form.reset();
      } else {
        // Fallback to mailto on API error so user is never stuck
        setStatus('error');
        setErrorMsg(data.message || 'Submission failed. Your mail client will open as fallback — please send via email.');
        const mailtoBody = `Topic: ${topic}\nName: ${name}\nEmail: ${email}\n\n${message}`;
        window.open(`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`[RecruitAI Support] ${topic} — ${subject}`)}&body=${encodeURIComponent(mailtoBody)}`, '_blank');
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err?.message || 'Network error. Opening your mail client as fallback.');
      const mailtoBody = `Topic: ${topic}\nName: ${name}\nEmail: ${email}\n\n${message}`;
      window.open(`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`[RecruitAI Support] ${topic} — ${subject}`)}&body=${encodeURIComponent(mailtoBody)}`, '_blank');
    }
  }

  if (status === 'success') {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 md:p-8">
        <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center">✓</div>
        <h3 className="font-serif text-xl mt-3 text-emerald-900">Message sent — thank you.</h3>
        <p className="text-sm text-emerald-800 leading-relaxed mt-2">
          {WEB3FORMS_ACCESS_KEY
            ? 'We’ve received your request via secure form and will reply within 2 business days at the email you provided.'
            : 'Your mail client has been opened with your message pre-filled. Please hit Send in your email app — we’ll reply within 2 business days.'}
        </p>
        <p className="text-xs text-emerald-700 mt-3">You can also reach us anytime at <a href={`mailto:${CONTACT_EMAIL}`} className="underline">{CONTACT_EMAIL}</a>.</p>
        <button onClick={() => setStatus('idle')} className="mt-5 text-sm font-semibold text-emerald-800 underline underline-offset-4">
          Send another message →
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 md:px-8 py-6 border-b border-border bg-[#faf9f7]">
        <h3 className="font-serif text-xl">Contact support</h3>
        <p className="text-sm text-muted mt-1 leading-relaxed">
          Send a message — delivered to <span className="font-mono text-xs bg-white border border-border px-1.5 py-0.5 rounded">{CONTACT_EMAIL}</span>. We reply within 2 business days.
        </p>
        {!WEB3FORMS_ACCESS_KEY && (
          <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Form will open your email app directly. To enable direct in-form delivery, create a free key at <a href="https://web3forms.com" target="_blank" rel="noopener" className="underline">web3forms.com</a> (recipient: {CONTACT_EMAIL}) → add <code className="bg-white border border-amber-200 px-1 py-0.5 rounded">NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY</code> in Vercel → redeploy.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="px-6 md:px-8 py-6 space-y-5">
        {/* honeypot — hidden text field */}
        <input type="text" name="botcheck" className="hidden" tabIndex={-1} autoComplete="off" />

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="support-name" className="text-xs font-semibold tracking-widest uppercase text-muted">Your name *</label>
            <input id="support-name" name="name" required placeholder="Alex Morgan" autoComplete="name" className="mt-1.5 w-full bg-[#F8F6F2] border border-border rounded-md px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
          </div>
          <div>
            <label htmlFor="support-email" className="text-xs font-semibold tracking-widest uppercase text-muted">Email (account email) *</label>
            <input id="support-email" name="email" type="email" required placeholder="you@company.com" autoComplete="email" className="mt-1.5 w-full bg-[#F8F6F2] border border-border rounded-md px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
          </div>
        </div>

        <div>
          <label htmlFor="support-topic" className="text-xs font-semibold tracking-widest uppercase text-muted">Topic</label>
          <select id="support-topic" name="topic" defaultValue="General" className="mt-1.5 w-full bg-[#F8F6F2] border border-border rounded-md px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent">
            <option>General</option>
            <option>Technical issue</option>
            <option>Privacy / Data request</option>
            <option>Billing</option>
            <option>Feature request</option>
            <option>Data deletion</option>
          </select>
        </div>

        <div>
          <label htmlFor="support-subject" className="text-xs font-semibold tracking-widest uppercase text-muted">Subject *</label>
          <input id="support-subject" name="subject" required placeholder="Brief summary — e.g., Unable to delete campaign" className="mt-1.5 w-full bg-[#F8F6F2] border border-border rounded-md px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
        </div>

        <div>
          <label htmlFor="support-message" className="text-xs font-semibold tracking-widest uppercase text-muted">Message *</label>
          <textarea id="support-message" name="message" required rows={5} placeholder="Describe your issue: account email, session/job ID, expected vs actual, steps to reproduce, device/OS..." className="mt-1.5 w-full bg-[#F8F6F2] border border-border rounded-md px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent resize-none" />
          <p className="text-xs text-muted mt-2">Please don’t paste candidate resumes or sensitive PII — use the dashboard for candidate data.</p>
        </div>

        {status === 'error' && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-3 text-sm leading-relaxed">
            {errorMsg}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <button type="submit" disabled={status === 'loading'} className="inline-flex items-center justify-center bg-accent text-white text-sm font-semibold px-7 py-3 rounded-md hover:bg-[#263a66] transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
            {status === 'loading' ? (
              <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin mr-2" /> Sending…</>
            ) : 'Send message'}
          </button>
          <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex items-center justify-center bg-white border border-border text-sm font-semibold px-7 py-3 rounded-md hover:bg-[#F8F6F2] transition-colors">
            Or email directly
          </a>
          <span className="text-xs text-muted self-center">Avg. reply 2 business days</span>
        </div>

        <p className="text-xs text-muted leading-relaxed border-t border-border pt-4">
          By submitting you agree to our <a href="/privacy" className="underline">Privacy Policy</a> and <a href="/terms" className="underline">Terms</a>. We process your message only to provide support.
        </p>
      </form>
    </div>
  );
}
