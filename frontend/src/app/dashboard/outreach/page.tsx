'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Mail, 
  Send, 
  Sparkles, 
  Users, 
  CheckCircle2, 
  FileText, 
  AlertCircle, 
  Clock, 
  UserCheck, 
  ShieldCheck,
  RefreshCw,
  Copy,
  Check,
  Zap,
  ExternalLink,
  ChevronRight,
  Eye,
  X
} from 'lucide-react';
import { useRecruitment, Candidate } from '@/context/RecruitmentContext';
import { fetchWithAuth } from '@/lib/apiClient';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyGenerator: (cand: Candidate, role: string, company: string) => string;
}

interface OutreachLog {
  id: string;
  candidate_id?: string;
  recipient_email: string;
  subject: string;
  body: string;
  template_id?: string;
  status: 'sent' | 'simulated' | 'failed' | string;
  error_message?: string;
  created_at: string;
}

const TEMPLATES: EmailTemplate[] = [
  {
    id: 'interview',
    name: 'Technical Interview Invitation',
    subject: 'Interview Invitation: {{role}} at {{company}}',
    bodyGenerator: (cand, role, company) => 
`Hi ${cand.name},

Thank you for your interest in joining ${company}. Our engineering leadership reviewed your background and was very impressed by your experience, particularly your work with ${(cand.matched_skills || cand.skills || ['modern architecture']).slice(0, 3).join(', ')}.

We would love to invite you to a 45-minute technical architecture interview to learn more about your past projects and discuss the ${role} role.

Could you please let us know your availability over the next few days?

Looking forward to speaking with you!

Best regards,
The Recruitment Team at ${company}`
  },
  {
    id: 'offer',
    name: 'Formal Offer Notification',
    subject: 'Congratulations! Offer from {{company}} for {{role}}',
    bodyGenerator: (cand, role, company) => 
`Dear ${cand.name},

On behalf of everyone at ${company}, I am thrilled to extend an offer for the position of ${role}!

Throughout the evaluation process, your technical leadership, problem-solving skills, and alignment with our team stood out. We believe you will make a tremendous impact here.

Attached is the preliminary offer summary. We would love to walk through the details and answer any questions you may have.

Congratulations once again!

Warm regards,
Head of Talent, ${company}`
  },
  {
    id: 'rejection',
    name: 'Respectful Candidate Status Update',
    subject: 'Update regarding your application for {{role}} at {{company}}',
    bodyGenerator: (cand, role, company) => 
`Dear ${cand.name},

Thank you for taking the time to speak with our team regarding the ${role} position at ${company}.

While your background and skills are impressive, we have decided to move forward with candidates whose specific experience more closely aligns with our immediate technical requirements for this round.

We will keep your profile in our active talent pool and will gladly reach back out should an opportunity matching your strengths emerge.

We wish you every success in your search.

Sincerely,
Recruiting Team, ${company}`
  },
  {
    id: 'sourcing',
    name: 'Exploratory Sourcing Intro',
    subject: 'Exciting opportunity for {{role}} at {{company}}',
    bodyGenerator: (cand, role, company) => 
`Hi ${cand.name},

I came across your work in ${(cand.matched_skills || cand.skills || ['software development']).slice(0, 2).join(' and ')} and was really impressed by your profile.

We are actively scaling our team at ${company} and looking for exceptional talent for our ${role} position.

Given your background, I would love to connect for a casual 15-minute chat to share more about what we are building.

Let me know if you are open to a conversation this week!

Best,
Talent Acquisition, ${company}`
  }
];

export default function OutreachPage() {
  const {
    candidates,
    jd,
    maskName,
    maskEmail,
    handleSetStatus,
    activeSessionId
  } = useRecruitment();

  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('interview');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
  const [quotaExceededError, setQuotaExceededError] = useState<string | null>(null);

  // Outreach history & quota state
  const [history, setHistory] = useState<OutreachLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [previewItem, setPreviewItem] = useState<OutreachLog | null>(null);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetchWithAuth('/api/email/history?limit=20');
      if (res.ok) {
        const data = await res.json();
        setHistory(data.items || []);
      }
    } catch (err) {
      console.warn('[OutreachPage] Failed to fetch outreach history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchCredits = async () => {
    try {
      const res = await fetchWithAuth('/api/payments/transactions');
      if (res.ok) {
        const data = await res.json();
        setCreditsRemaining(data.credits_balance ?? null);
      }
    } catch {
      // Fallback silently if offline/unreachable
    }
  };

  useEffect(() => {
    fetchHistory();
    fetchCredits();
  }, []);

  // Initialize selected candidate
  useEffect(() => {
    if (!selectedCandidateId && candidates.length > 0) {
      setSelectedCandidateId(candidates[0].candidate_id);
    }
  }, [candidates, selectedCandidateId]);

  const activeCandidate = candidates.find(c => c.candidate_id === selectedCandidateId);
  const roleName = jd?.role || 'Senior Software Engineer';
  const companyName = jd?.company_name || 'RecruitAI';

  // Update draft whenever candidate or template changes
  useEffect(() => {
    if (activeCandidate) {
      const template = TEMPLATES.find(t => t.id === selectedTemplateId) || TEMPLATES[0];
      const parsedSubject = template.subject
        .replace('{{role}}', roleName)
        .replace('{{company}}', companyName);
      const parsedBody = template.bodyGenerator(activeCandidate, roleName, companyName);
      setSubject(parsedSubject);
      setBody(parsedBody);
    }
  }, [selectedCandidateId, selectedTemplateId, activeCandidate, roleName, companyName]);

  // Sync editable To field when switching candidates
  useEffect(() => {
    if (activeCandidate) {
      setRecipientEmail(activeCandidate.email || '');
    }
  }, [selectedCandidateId, activeCandidate]);

  const handleCopy = () => {
    navigator.clipboard.writeText(`${subject}\n\n${body}`);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handleDispatch = async () => {
    if (!activeCandidate) return;
    const trimmedEmail = recipientEmail.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setDispatchStatus('Dispatch error: enter a valid recipient email before sending.');
      setTimeout(() => setDispatchStatus(null), 5000);
      setShowConfirmModal(false);
      return;
    }
    setIsSending(true);
    setShowConfirmModal(false);
    setQuotaExceededError(null);

    try {
      const res = await fetchWithAuth('/api/email/send', {
        method: 'POST',
        body: JSON.stringify({
          recipient_email: trimmedEmail,
          subject,
          body,
          candidate_id: activeCandidate.candidate_id,
          template_id: selectedTemplateId,
        }),
      });

      if (res.status === 402) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData?.detail?.message || 'Candidate outreach quota exhausted. Please upgrade your subscription to continue.';
        setQuotaExceededError(msg);
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Email dispatch failed (${res.status})`);
      }

      // Keep chat-anchored history for audit parity with mobile (fire-and-forget)
      fetchWithAuth('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: `Candidate outreach dispatched to ${activeCandidate.name} for role ${roleName}. Subject: "${subject}". Recipient: ${trimmedEmail}`,
          session_id: activeSessionId || 'default',
        }),
      }).catch(() => {});

      // Update candidate status accordingly
      if (selectedTemplateId === 'offer') {
        await handleSetStatus(activeCandidate.candidate_id, activeCandidate.name, 'offered');
      } else if (selectedTemplateId === 'interview') {
        await handleSetStatus(activeCandidate.candidate_id, activeCandidate.name, 'shortlisted');
      } else if (selectedTemplateId === 'rejection') {
        await handleSetStatus(activeCandidate.candidate_id, activeCandidate.name, 'rejected');
      }

      const data = await res.json().catch(() => ({ status: 'sent' }));
      const serverMsg: string = data.status || 'Email dispatched';
      if (typeof data.credits_remaining === 'number') {
        setCreditsRemaining(data.credits_remaining);
      }
      setDispatchStatus(`${serverMsg} → ${activeCandidate.name} (${trimmedEmail})`);
      setTimeout(() => setDispatchStatus(null), 6000);

      // Refresh recent logs
      fetchHistory();
    } catch (err: any) {
      setDispatchStatus(`Dispatch error: ${err.message}`);
      setTimeout(() => setDispatchStatus(null), 6000);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">Outreach & Email Dispatcher</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
              Human-in-the-Loop Safe
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Compose, audit, and dispatch AI-personalized recruiter communications to candidates
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {creditsRemaining !== null && (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-indigo-50/80 border border-indigo-100 text-indigo-900 text-xs font-bold">
              <Zap className="w-3.5 h-3.5 text-indigo-600 fill-indigo-600" />
              <span>{creditsRemaining} Credits Remaining</span>
            </div>
          )}
          <Link
            href="/pricing"
            className="px-3.5 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <span>Top-up / Upgrade</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/dashboard/candidates"
            className="px-3.5 py-2 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition"
          >
            Pipeline
          </Link>
        </div>
      </div>

      {quotaExceededError && (
        <div className="p-4 rounded-3xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{quotaExceededError}</span>
          </div>
          <Link
            href="/pricing"
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition shrink-0"
          >
            View Plans
          </Link>
        </div>
      )}

      {dispatchStatus && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between animate-in fade-in">
          <span>{dispatchStatus}</span>
          <button onClick={() => setDispatchStatus(null)} className="font-bold underline text-xs cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* Main Grid: Candidate & Template selection on left, Editor on right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column (4 cols): Selectors */}
        <div className="lg:col-span-4 space-y-6">
          {/* Candidate Selector */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm space-y-3">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              1. Select Recipient
            </label>
            {candidates.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No candidates available</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
                {candidates.map((cand) => {
                  const isSelected = cand.candidate_id === selectedCandidateId;
                  const displayName = maskName(cand.name, cand.candidate_id);
                  const displayEmail = maskEmail(cand.email, cand.candidate_id);

                  return (
                    <button
                      key={cand.candidate_id}
                      onClick={() => setSelectedCandidateId(cand.candidate_id)}
                      className={`w-full p-2.5 rounded-2xl text-left transition flex items-center gap-3 border cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-950 shadow-sm'
                          : 'bg-white hover:bg-slate-50 border-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 font-black text-xs flex items-center justify-center shrink-0">
                        {displayName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-xs block truncate">{displayName}</span>
                        <span className="text-[10px] text-slate-400 block truncate">{displayEmail}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Template Selector */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm space-y-3">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              2. Select Communication Template
            </label>
            <div className="space-y-2">
              {TEMPLATES.map((tmpl) => {
                const isSelected = tmpl.id === selectedTemplateId;
                return (
                  <button
                    key={tmpl.id}
                    onClick={() => setSelectedTemplateId(tmpl.id)}
                    className={`w-full p-3 rounded-2xl text-left transition border cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <span className="font-bold text-xs block">{tmpl.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column (8 cols): Interactive Composer */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-extrabold text-base text-slate-900">Email Composer & Review</h3>
                <p className="text-xs text-slate-400">Personalized using candidate skills & active job spec</p>
              </div>

              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopied ? 'Copied!' : 'Copy Text'}</span>
              </button>
            </div>

            {/* Recipient & Subject Fields */}
            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <span className="font-bold text-slate-400 uppercase w-16 shrink-0">To:</span>
                {activeCandidate ? (
                  <span className="flex-1 flex items-center gap-2 min-w-0">
                    <span className="font-bold text-slate-800 truncate shrink-0 max-w-[40%]">{activeCandidate.name}</span>
                    <input
                      type="email"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      placeholder="candidate@example.com"
                      aria-label="Recipient email"
                      className="flex-1 min-w-0 bg-white border border-slate-200 rounded-xl px-3 py-1.5 font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                    />
                  </span>
                ) : (
                  <span className="font-bold text-slate-400">Select a candidate</span>
                )}
              </div>

              <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <span className="font-bold text-slate-400 uppercase w-16">Subject:</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="flex-1 bg-transparent font-bold text-slate-800 focus:outline-none"
                />
              </div>

              {/* Body Textarea */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Message Body:</label>
                <textarea
                  rows={14}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 leading-relaxed focus:outline-none focus:border-indigo-500 font-sans custom-scrollbar"
                />
              </div>
            </div>

            {/* Dispatch Footer */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-100">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Requires manual confirmation prior to delivery. Consumes 1 credit.</span>
              </div>

              <button
                type="button"
                disabled={!activeCandidate || !recipientEmail.trim() || isSending}
                onClick={() => setShowConfirmModal(true)}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black rounded-2xl transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>Review & Dispatch</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dispatched Outreach Audit Log Section */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-extrabold text-base text-slate-900">Dispatched Outreach Log & Audit Trail</h3>
            <p className="text-xs text-slate-400">Verifiable delivery records and communications history</p>
          </div>
          <button
            onClick={fetchHistory}
            disabled={loadingHistory}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-50 transition cursor-pointer"
            title="Refresh history"
          >
            <RefreshCw className={`w-4 h-4 ${loadingHistory ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {history.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            <Mail className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No outreach emails dispatched yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  <th className="pb-3 font-black">Date & Time</th>
                  <th className="pb-3 font-black">Recipient</th>
                  <th className="pb-3 font-black">Subject</th>
                  <th className="pb-3 font-black">Delivery Channel</th>
                  <th className="pb-3 font-black text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {history.map((item) => {
                  const dateStr = new Date(item.created_at).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition group">
                      <td className="py-3 font-medium text-slate-500 whitespace-nowrap">{dateStr}</td>
                      <td className="py-3 font-bold text-slate-800 whitespace-nowrap">{item.recipient_email}</td>
                      <td className="py-3 max-w-xs truncate text-slate-600">{item.subject}</td>
                      <td className="py-3 whitespace-nowrap">
                        {item.status === 'sent' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            SMTP Dispatched
                          </span>
                        ) : item.status === 'simulated' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <Clock className="w-3 h-3 text-indigo-600" />
                            Simulated Mode
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => setPreviewItem(item)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 hover:border-indigo-300 text-slate-600 hover:text-indigo-600 text-[11px] font-semibold transition cursor-pointer"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 select-text animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-md shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">Confirm Outreach Dispatch</h3>
                <p className="text-xs text-slate-400">Verify email recipient and content</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2">
              <div>
                <span className="text-slate-400 font-bold block text-[10px] uppercase">Recipient:</span>
                <span className="font-bold text-slate-800">{activeCandidate?.name} &lt;{recipientEmail.trim() || 'candidate@example.com'}&gt;</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold block text-[10px] uppercase">Subject:</span>
                <span className="font-semibold text-slate-700">{subject}</span>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              This will record the communication in your session history, deduct 1 credit from your quota balance, and update the candidate&apos;s status accordingly.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                Back to Edit
              </button>
              <button
                type="button"
                disabled={isSending}
                onClick={handleDispatch}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-sm cursor-pointer"
              >
                {isSending ? 'Dispatching...' : 'Confirm & Dispatch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message Body Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-lg shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-indigo-600" />
                <h3 className="font-extrabold text-sm text-slate-900">Outreach Message Record</h3>
              </div>
              <button
                onClick={() => setPreviewItem(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                <div><span className="font-bold text-slate-400">To:</span> <span className="font-medium text-slate-800">{previewItem.recipient_email}</span></div>
                <div><span className="font-bold text-slate-400">Subject:</span> <span className="font-bold text-slate-800">{previewItem.subject}</span></div>
                <div><span className="font-bold text-slate-400">Date:</span> <span className="text-slate-600">{new Date(previewItem.created_at).toLocaleString()}</span></div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl max-h-60 overflow-y-auto custom-scrollbar font-mono text-[11px] whitespace-pre-wrap text-slate-800">
                {previewItem.body}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setPreviewItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
