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
  Check
} from 'lucide-react';
import { useRecruitment, Candidate } from '@/context/RecruitmentContext';
import { fetchWithAuth } from '@/lib/apiClient';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyGenerator: (cand: Candidate, role: string, company: string) => string;
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
  const [isCopied, setIsCopied] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);

  // Initialize selected candidate
  useEffect(() => {
    if (!selectedCandidateId && candidates.length > 0) {
      setSelectedCandidateId(candidates[0].candidate_id);
    }
  }, [candidates]);

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

  const handleCopy = () => {
    navigator.clipboard.writeText(`${subject}\n\n${body}`);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handleDispatch = async () => {
    if (!activeCandidate) return;
    if (!activeCandidate.email) {
      setDispatchStatus('Dispatch error: candidate has no email on file — add contact before sending.');
      setTimeout(() => setDispatchStatus(null), 5000);
      setShowConfirmModal(false);
      return;
    }
    setIsSending(true);
    setShowConfirmModal(false);

    try {
      const email_draft = `Subject: ${subject}\n\n${body}`;
      const res = await fetchWithAuth('/api/email/send', {
        method: 'POST',
        body: JSON.stringify({
          recipient_email: activeCandidate.email,
          email_draft,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Email dispatch failed (${res.status})`);
      }

      // Keep chat-anchored history for audit parity with mobile (fire-and-forget)
      fetchWithAuth('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: `Candidate outreach dispatched to ${activeCandidate.name} for role ${roleName}. Subject: "${subject}". Recipient: ${activeCandidate.email}`,
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
      // Surface SMTP vs simulation transparently
      setDispatchStatus(`${serverMsg} → ${activeCandidate.name} (${activeCandidate.email})`);
      setTimeout(() => setDispatchStatus(null), 6000);
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
            Compose and review AI-personalized communications before transmission to candidates
          </p>
        </div>

        <Link
          href="/dashboard/candidates"
          className="px-4 py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition"
        >
          Candidate Pipeline
        </Link>
      </div>

      {dispatchStatus && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between animate-in fade-in">
          <span>{dispatchStatus}</span>
          <button onClick={() => setDispatchStatus(null)} className="font-bold underline text-xs">Dismiss</button>
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
                      className={`w-full p-2.5 rounded-2xl text-left transition flex items-center gap-3 border ${
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
                    className={`w-full p-3 rounded-2xl text-left transition border ${
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
                <p className="text-xs text-slate-400">Personalized using parsed candidate skills & active job spec</p>
              </div>

              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 text-xs font-bold transition flex items-center gap-1.5"
              >
                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopied ? 'Copied!' : 'Copy Text'}</span>
              </button>
            </div>

            {/* Recipient & Subject Fields */}
            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <span className="font-bold text-slate-400 uppercase w-16">To:</span>
                <span className="font-bold text-slate-800 truncate">
                  {activeCandidate ? `${activeCandidate.name} <${activeCandidate.email || 'candidate@example.com'}>` : 'Select a candidate'}
                </span>
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
                <span>Requires manual confirmation prior to delivery.</span>
              </div>

              <button
                type="button"
                disabled={!activeCandidate || isSending}
                onClick={() => setShowConfirmModal(true)}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black rounded-2xl transition flex items-center justify-center gap-2 shadow-sm"
              >
                <Send className="w-4 h-4" />
                <span>Review & Dispatch</span>
              </button>
            </div>
          </div>
        </div>

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
                <span className="font-bold text-slate-800">{activeCandidate?.name} &lt;{activeCandidate?.email || 'candidate@example.com'}&gt;</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold block text-[10px] uppercase">Subject:</span>
                <span className="font-semibold text-slate-700">{subject}</span>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              This will record the outreach communication in your session history and update the candidate&apos;s status accordingly.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
              >
                Back to Edit
              </button>
              <button
                type="button"
                disabled={isSending}
                onClick={handleDispatch}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-sm"
              >
                {isSending ? 'Dispatching...' : 'Confirm & Dispatch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
