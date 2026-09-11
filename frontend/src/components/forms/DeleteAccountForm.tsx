'use client';

import { useState } from 'react';
import Link from 'next/link';

const WEB3FORMS_ACCESS_KEY = process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY || '';
const CONTACT_EMAIL = 'santhisridinesh@gmail.com';
const SITE_URL = 'https://recruitaiofficial.vercel.app';

export default function DeleteAccountForm() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if ((fd.get('botcheck') as string)?.trim() !== '') return;

    if (!WEB3FORMS_ACCESS_KEY) {
      setStatus('error');
      setErrorMsg('Web3Forms not configured. Set NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY in Vercel (web3forms.com) or email ' + CONTACT_EMAIL + ' directly.');
      return;
    }

    const accountEmail = (fd.get('accountEmail') as string)?.trim();
    const confirm = fd.get('confirm');
    if (!confirm) {
      setStatus('error');
      setErrorMsg('Please confirm you understand deletion is irreversible.');
      return;
    }
    if (!accountEmail) {
      setStatus('error');
      setErrorMsg('Account email is required.');
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    const payload = {
      access_key: WEB3FORMS_ACCESS_KEY,
      subject: `[RecruitAI Deletion Request] ${fd.get('requestType')} — ${accountEmail}`,
      from_name: 'RecruitAI Deletion Form',
      name: fd.get('name'),
      email: accountEmail,
      accountEmail,
      requestType: fd.get('requestType'),
      identifier: fd.get('identifier'),
      message: `Request Type: ${fd.get('requestType')}\nAccount Email: ${accountEmail}\nName: ${fd.get('name')}\nIdentifier (session/job): ${fd.get('identifier') || '—'}\nDetails: ${fd.get('message')}\nPage: ${typeof window !== 'undefined' ? window.location.href : ''}`,
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
        setErrorMsg(data.message || 'Submission failed. Please email directly.');
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err?.message || 'Network error.');
    }
  }

  if (status === 'success') {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 md:p-8">
        <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center">✓</div>
        <h3 className="font-serif text-xl mt-3 text-emerald-900">Deletion request received.</h3>
        <p className="text-sm text-emerald-800 leading-relaxed mt-2">
          We’ll verify ownership by replying to your account email. Once you confirm, we complete deletion within <span className="font-semibold">7 business days</span> and confirm by email. Primary rows are removed immediately; backups expire in 30 days.
        </p>
        <p className="text-xs text-emerald-700 mt-3">Questions? Email <a href={`mailto:${CONTACT_EMAIL}`} className="underline">{CONTACT_EMAIL}</a> • <Link href="/privacy" className="underline">Privacy Policy</Link></p>
        <button onClick={() => setStatus('idle')} className="mt-5 text-sm font-semibold text-emerald-800 underline underline-offset-4">Submit another request →</button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 md:px-8 py-6 border-b border-border bg-[#faf9f7]">
        <h3 className="font-serif text-xl">Request deletion via form</h3>
        <p className="text-sm text-muted mt-1 leading-relaxed">
          Web3Forms delivery to <span className="font-mono text-xs bg-white border border-border px-1.5 py-0.5 rounded">{CONTACT_EMAIL}</span> • Verified via reply to your account email • Public URL for Play Console: <span className="font-mono text-xs bg-white border border-border px-1.5 py-0.5 rounded">{SITE_URL}/delete-account</span>
        </p>
        {!WEB3FORMS_ACCESS_KEY && (
          <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚙️ Not yet configured: add <code className="bg-white border border-amber-200 px-1 py-0.5 rounded">NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY</code> in Vercel env (get free key at <a href="https://web3forms.com" target="_blank" rel="noopener" className="underline">web3forms.com</a> using {CONTACT_EMAIL}) then redeploy.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="px-6 md:px-8 py-6 space-y-5">
        <input type="checkbox" name="botcheck" className="hidden" tabIndex={-1} autoComplete="off" />

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="del-name" className="text-xs font-semibold tracking-widest uppercase text-muted">Your name</label>
            <input id="del-name" name="name" required placeholder="Alex Morgan" className="mt-1.5 w-full bg-[#F8F6F2] border border-border rounded-md px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
          </div>
          <div>
            <label htmlFor="del-email" className="text-xs font-semibold tracking-widest uppercase text-muted">Account email *</label>
            <input id="del-email" name="accountEmail" type="email" required placeholder="you@company.com" className="mt-1.5 w-full bg-[#F8F6F2] border border-border rounded-md px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="del-type" className="text-xs font-semibold tracking-widest uppercase text-muted">Request type</label>
            <select id="del-type" name="requestType" defaultValue="Full account & all data" className="mt-1.5 w-full bg-[#F8F6F2] border border-border rounded-md px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent">
              <option>Full account & all data</option>
              <option>Single campaign / session</option>
              <option>Candidate pool for a job</option>
              <option>Other / selective</option>
            </select>
          </div>
          <div>
            <label htmlFor="del-identifier" className="text-xs font-semibold tracking-widest uppercase text-muted">Session / Job identifier (optional)</label>
            <input id="del-identifier" name="identifier" placeholder="Session ID, job title, or leave blank for full account" className="mt-1.5 w-full bg-[#F8F6F2] border border-border rounded-md px-3.5 py-2.5 text-sm font-mono text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
          </div>
        </div>

        <div>
          <label htmlFor="del-message" className="text-xs font-semibold tracking-widest uppercase text-muted">Details / reason (optional)</label>
          <textarea id="del-message" name="message" rows={4} placeholder="e.g., Please delete all data for my account. I understand this is irreversible..." className="mt-1.5 w-full bg-[#F8F6F2] border border-border rounded-md px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent resize-none" />
        </div>

        <label className="flex gap-3 bg-rose-50/60 border border-rose-200 rounded-xl p-4 cursor-pointer">
          <input type="checkbox" name="confirm" required className="mt-0.5 w-4 h-4 accent-accent" />
          <span className="text-sm text-rose-900 leading-relaxed">I understand this is <span className="font-semibold">irreversible</span> — all campaigns, jobs, resumes, embeddings and chats linked to my account will be permanently deleted. Backups expire in 30 days.</span>
        </label>

        {status === 'error' && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-3 text-sm leading-relaxed">{errorMsg}</div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <button type="submit" disabled={status === 'loading'} className="inline-flex items-center justify-center bg-accent text-white text-sm font-semibold px-7 py-3 rounded-md hover:bg-[#263a66] transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
            {status === 'loading' ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin mr-2" /> Sending…</> : 'Submit deletion request'}
          </button>
          <a href={`mailto:${CONTACT_EMAIL}?subject=Delete%20my%20RecruitAI%20account`} className="inline-flex items-center justify-center bg-white border border-border text-sm font-semibold px-7 py-3 rounded-md hover:bg-[#F8F6F2]">Or email directly</a>
        </div>

        <p className="text-xs text-muted leading-relaxed border-t border-border pt-4">
          We verify ownership via your account email before deleting. See <Link href="/privacy" className="underline">Privacy Policy</Link> for retention. For subscriptions, also cancel in <a href="https://play.google.com/store/account/subscriptions" target="_blank" rel="noopener" className="underline">Google Play Subscriptions</a>.
        </p>
      </form>
    </div>
  );
}
