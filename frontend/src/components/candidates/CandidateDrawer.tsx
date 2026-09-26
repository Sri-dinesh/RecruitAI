'use client';

import React, { useRef } from 'react';
import { 
  X, Sparkles, Star, Briefcase, GraduationCap, MapPin, 
  Mail, Phone, ExternalLink, Award, CheckCircle2, XCircle, 
  Send, Calendar, AlertTriangle, FileText
} from 'lucide-react';
import { useRecruitment, Candidate, CandidateStatus } from '@/context/RecruitmentContext';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import Link from 'next/link';

interface CandidateDrawerProps {
  candidate?: Candidate | null;
  onClose?: () => void;
}

export default function CandidateDrawer({ candidate: propCandidate, onClose: propOnClose }: CandidateDrawerProps) {
  const { 
    inspectedCandidate, 
    setInspectedCandidate, 
    evalNotes, 
    saveEvalNotes, 
    candidateStatuses, 
    handleSetStatus,
    maskName, 
    maskEmail, 
    maskPhone,
    isBlindHiring 
  } = useRecruitment();

  const activeCandidate = propCandidate !== undefined ? propCandidate : inspectedCandidate;
  const handleClose = propOnClose || (() => setInspectedCandidate(null));
  const drawerRef = useRef<HTMLDivElement>(null);

  useFocusTrap(drawerRef, {
    isActive: !!activeCandidate,
    onEscape: handleClose,
    autoFocus: true,
  });

  if (!activeCandidate) return null;

  const candidateId = activeCandidate.candidate_id;
  const displayName = maskName(activeCandidate.name, candidateId);
  const displayEmail = maskEmail(activeCandidate.email, candidateId);
  const displayPhone = maskPhone(activeCandidate.phone);
  const currentStatus = candidateStatuses[candidateId];
  const notesData = evalNotes[candidateId] || { tech: 0, comm: 0, notes: '' };

  const handleRatingChange = (field: 'tech' | 'comm', rating: number) => {
    saveEvalNotes(candidateId, {
      ...notesData,
      [field]: rating
    });
  };

  const handleNotesChange = (text: string) => {
    saveEvalNotes(candidateId, {
      ...notesData,
      notes: text
    });
  };

  return (
    <div 
      className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="candidate-drawer-title"
      aria-describedby="candidate-drawer-headline"
      onClick={handleClose}
    >
      <div 
        ref={drawerRef}
        tabIndex={-1}
        className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-black text-base flex items-center justify-center shadow-sm shrink-0">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 id="candidate-drawer-title" className="font-extrabold text-lg text-slate-900 truncate">{displayName}</h3>
                {currentStatus && (
                  <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-full border ${
                    currentStatus === 'shortlisted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    currentStatus === 'offered' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                    'bg-rose-50 text-rose-700 border-rose-200'
                  }`}>
                    {currentStatus}
                  </span>
                )}
              </div>
              <p id="candidate-drawer-headline" className="text-xs text-slate-500 font-medium truncate">
                {activeCandidate.headline || 'Candidate Profile Evaluation'}
              </p>
            </div>
          </div>
          <button 
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition shrink-0 cursor-pointer"
            aria-label="Close candidate drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-700 custom-scrollbar">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-center">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Fit Score</span>
              <span className="text-lg font-black text-indigo-600">
                {(activeCandidate.match_score || 0).toFixed(0)}%
              </span>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Experience</span>
              <span className="text-lg font-black text-slate-800">
                {activeCandidate.experience_years ? `${activeCandidate.experience_years.toFixed(1)} yrs` : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Location</span>
              <span className="text-xs font-bold text-slate-800 flex items-center justify-center gap-1 mt-1 truncate">
                <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                {activeCandidate.location || 'Remote / Unspecified'}
              </span>
            </div>
          </div>

          {/* Contact Details (With PII Masking) */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Candidate Contact Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <Mail className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="truncate">{displayEmail}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <Phone className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="truncate">{displayPhone}</span>
              </div>
            </div>
            {isBlindHiring && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2 font-medium flex items-center gap-1.5 mt-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                Blind Hiring is active: Personally identifiable information (PII) is securely masked.
              </p>
            )}
          </div>

          {/* Recruiter Evaluation Rubric & Feedback */}
          <div className="p-4 bg-indigo-50/40 border border-indigo-100 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold text-xs uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-600" /> Recruiter Evaluation Rubric & Rating
              </h4>
              <span className="text-[10px] text-indigo-500 font-medium">Auto-saved</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Technical Architecture Fit */}
              <div className="bg-white p-3 rounded-xl border border-indigo-100 space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Technical Architecture Fit (1-5 ⭐):
                </label>
                <div className="flex gap-1" role="group" aria-label="Technical Architecture Fit rating">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => handleRatingChange('tech', star)}
                      className={`text-xl p-0.5 transition hover:scale-110 cursor-pointer ${
                        star <= (notesData.tech || 0) ? 'text-amber-400' : 'text-slate-200 hover:text-amber-200'
                      }`}
                      aria-label={`Rate technical architecture fit ${star} of 5 stars`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              {/* Communication & Cultural Fit */}
              <div className="bg-white p-3 rounded-xl border border-indigo-100 space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Communication & Team Fit (1-5 ⭐):
                </label>
                <div className="flex gap-1" role="group" aria-label="Communication and team fit rating">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => handleRatingChange('comm', star)}
                      className={`text-xl p-0.5 transition hover:scale-110 cursor-pointer ${
                        star <= (notesData.comm || 0) ? 'text-amber-400' : 'text-slate-200 hover:text-amber-200'
                      }`}
                      aria-label={`Rate communication fit ${star} of 5 stars`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Recruiter Evaluation Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Interview Feedback & Evaluation Notes:
              </label>
              <textarea
                rows={3}
                placeholder="Log technical interview impressions, salary requirements, leadership signals, or next steps..."
                value={notesData.notes || ''}
                onChange={(e) => handleNotesChange(e.target.value)}
                className="w-full bg-white border border-indigo-200 rounded-xl p-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
              />
            </div>
          </div>

          {/* Competencies vs Identified Gaps */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Matched Skills */}
            <div className="p-4 border border-slate-200 rounded-2xl bg-white space-y-2.5">
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                Matched Competencies
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(activeCandidate.matched_skills || activeCandidate.skills || []).length > 0 ? (
                  (activeCandidate.matched_skills || activeCandidate.skills || []).map((skill, idx) => (
                    <span 
                      key={idx} 
                      className="bg-emerald-50 text-emerald-700 text-xs px-2.5 py-1 rounded-lg border border-emerald-200 font-medium"
                    >
                      ✓ {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400 italic">No direct competency matches parsed</span>
                )}
              </div>
            </div>

            {/* Skill Gaps */}
            <div className="p-4 border border-slate-200 rounded-2xl bg-white space-y-2.5">
              <span className="text-xs font-bold text-rose-600 uppercase tracking-wider flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                Identified Skill Gaps
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(activeCandidate.gaps && activeCandidate.gaps.length > 0) ? (
                  activeCandidate.gaps.map((gap, idx) => (
                    <span 
                      key={idx} 
                      className="bg-rose-50 text-rose-700 text-xs px-2.5 py-1 rounded-lg border border-rose-200 font-medium"
                    >
                      ⚠ {gap}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-emerald-600 italic">✓ No identified competency gaps</span>
                )}
              </div>
            </div>
          </div>

          {/* Red Flags + Consent — parity with mobile */}
          <div className="grid grid-cols-1 gap-3">
            {activeCandidate.red_flags && activeCandidate.red_flags.length > 0 ? (
              <div className="p-4 border border-rose-200 rounded-2xl bg-rose-50/60 space-y-2">
                <span className="text-xs font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  Red Flags & Risk Signals
                </span>
                {activeCandidate.red_flags.map((flag, idx) => (
                  <div key={idx} className="flex items-start gap-2 bg-white border border-rose-200 px-3 py-2 rounded-xl">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                    <span className="text-xs text-rose-800 font-medium leading-relaxed">{flag}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-2.5 border border-emerald-200 rounded-xl bg-emerald-50/60 text-xs text-emerald-700 font-medium">
                ✓ No red flags detected
              </div>
            )}
            {(activeCandidate as any).consent_version && (
              <div className="flex items-center gap-2 px-4 py-2.5 border border-blue-200 rounded-xl bg-blue-50/60 text-xs text-blue-700 font-bold">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                Consent Verified — v{(activeCandidate as any).consent_version}
              </div>
            )}
          </div>

          {/* Work Experience / Resume Snippet */}
          {activeCandidate.raw_text && (
            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/70 space-y-2">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-slate-500" />
                Extracted Resume Transcript
              </span>
              <p className="text-xs text-slate-700 font-mono leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto bg-white p-3 rounded-xl border border-slate-200 custom-scrollbar select-text">
                {activeCandidate.raw_text}
              </p>
            </div>
          )}
        </div>

        {/* Drawer Action Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/90 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSetStatus(candidateId, displayName, 'shortlisted')}
              className={`text-xs px-3 py-2 rounded-xl font-bold transition flex items-center gap-1.5 ${
                currentStatus === 'shortlisted'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Shortlist
            </button>
            <button
              onClick={() => handleSetStatus(candidateId, displayName, 'offered')}
              className={`text-xs px-3 py-2 rounded-xl font-bold transition flex items-center gap-1.5 ${
                currentStatus === 'offered'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-50'
              }`}
            >
              <Award className="w-3.5 h-3.5" /> Offer
            </button>
            <button
              onClick={() => handleSetStatus(candidateId, displayName, 'rejected')}
              className={`text-xs px-3 py-2 rounded-xl font-bold transition flex items-center gap-1.5 ${
                currentStatus === 'rejected'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-white border border-rose-300 text-rose-700 hover:bg-rose-50'
              }`}
            >
              <XCircle className="w-3.5 h-3.5" /> Reject
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/interviews"
              onClick={handleClose}
              className="text-xs px-3 py-2 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition flex items-center gap-1.5"
            >
              <Calendar className="w-3.5 h-3.5 text-indigo-600" /> Schedule
            </Link>
            <Link
              href="/dashboard/outreach"
              onClick={handleClose}
              className="text-xs px-3 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition flex items-center gap-1.5 shadow-sm"
            >
              <Send className="w-3.5 h-3.5" /> Reach Out
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
