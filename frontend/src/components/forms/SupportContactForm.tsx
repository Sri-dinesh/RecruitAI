'use client';

import { useState } from 'react';

const WEB3FORMS_ACCESS_KEY = process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY || '';
const CONTACT_EMAIL = 'santhisridinesh@gmail.com';

export default function SupportContactForm() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    // honeypot
    if ((formData.get('botcheck') as string)?.trim() !== '') return;

    if (!WEB3FORMS_ACCESS_KEY) {
      setStatus('error');
      setErrorMsg('Web3Forms access key not configured. Set NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY in your Vercel env (see https://web3forms.com) or email directly at ' + CONTACT_EMAIL + '.');
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    const payload = {
      access_key: WEB3FORMS_ACCESS_KEY,
      subject: `[RecruitAI Support] ${formData.get('topic') || 'General'} — ${formData.get('subject') || 'New message'}`,
      from_name: 'RecruitAI Support Form',
      name: formData.get('name'),
      email: formData.get('email'),
      topic: formData.get('topic'),
      orderId: formData.get('orderId'),
      message: formData.get('message'),
      page: typeof window !== 'undefined' ? window.location.href : '',
    };

    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setStatus('success');
        form.reset();
      } else {
        setStatus('error');
        setErrorMsg(data.message || 'Submission failed. Please email us directly.');
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err?.message || 'Network error. Please try email.');
    }
  }

  if (status === 'success') {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 md:p-8">
        <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center">✓</div>
        <h3 className="font-serif text-xl mt-3 text-emerald-900">Message sent — thank you.</h3>
        <p className="text-sm text-emerald-800 leading-relaxed mt-2">
          We’ve received your request and will reply within 2 business days at the email you provided. For urgent privacy deletions, we prioritize within 7 business days.
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
          Prefer a form over email? Send directly via Web3Forms — delivered to <span className="font-mono text-xs bg-white border border-border px-1.5 py-0.5 rounded">{CONTACT_EMAIL}</span>. We reply within 2 business days.
        </p>
        {!WEB3FORMS_ACCESS_KEY && (
          <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚙️ Setup: create a free key at <a href="https://web3forms.com" target="_blank" rel="noopener" className="underline">web3forms.com</a> (use {CONTACT_EMAIL} as recipient) → add <code className="bg-white border border-amber-200 px-1 py-0.5 rounded">NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY</code> in Vercel → redeploy.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="px-6 md:px-8 py-6 space-y-5">
        {/* honeypot */}
        <input type="checkbox" name="botcheck" className="hidden" tabIndex={-1} autoComplete="off" />

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="support-name" className="text-xs font-semibold tracking-widest uppercase text-muted">Your name</label>
            <input id="support-name" name="name" required placeholder="Alex Morgan" className="mt-1.5 w-full bg-[#F8F6F2] border border-border rounded-md px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
          </div>
          <div>
            <label htmlFor="support-email" className="text-xs font-semibold tracking-widest uppercase text-muted">Email (account email)</label>
            <input id="support-email" name="email" type="email" required placeholder="you@company.com" className="mt-1.5 w-full bg-[#F8F6F2] border border-border rounded-md px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="support-topic" className="text-xs font-semibold tracking-widest uppercase text-muted">Topic</label>
            <select id="support-topic" name="topic" defaultValue="General" className="mt-1.5 w-full bg-[#F8F6F2] border border-border rounded-md px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent">
              <option>General</option>
              <option>Technical issue</option>
              <option>Privacy / Data request</option>
              <option>Billing / Play Store</option>
              <option>Feature request</option>
              <option>Data deletion</option>
            </select>
          </div>
          <div>
            <label htmlFor="support-order" className="text-xs font-semibold tracking-widest uppercase text-muted">Order ID (Play Store, optional)</label>
            <input id="support-order" name="orderId" placeholder="GPA.XXXX-XXXX-XXXX-XXXXX" className="mt-1.5 w-full bg-[#F8F6F2] border border-border rounded-md px-3.5 py-2.5 text-sm font-mono text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
          </div>
        </div>

        <div>
          <label htmlFor="support-subject" className="text-xs font-semibold tracking-widest uppercase text-muted">Subject</label>
          <input id="support-subject" name="subject" required placeholder="Brief summary — e.g., Unable to delete campaign XYZ" className="mt-1.5 w-full bg-[#F8F6F2] border border-border rounded-md px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
        </div>

        <div>
          <label htmlFor="support-message" className="text-xs font-semibold tracking-widest uppercase text-muted">Message</label>
          <textarea id="support-message" name="message" required rows={5} placeholder="Include: account email, session/job ID, expected vs actual, steps to reproduce, device/OS, screenshots description..." className="mt-1.5 w-full bg-[#F8F6F2] border border-border rounded-md px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent resize-none" />
          <p className="text-xs text-muted mt-2">Please don’t paste candidate resumes or sensitive PII in this form — use the dashboard for candidate data.</p>
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
          By submitting you agree to our <a href="/privacy" className="underline">Privacy Policy</a> and <a href="/terms" className="underline">Terms</a>. We process your message to provide support and will not use it for marketing.
        </p>
      </form>
    </div>
  );
}
