'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  GitCompare, 
  Users, 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  Award, 
  Calendar, 
  Mail, 
  Plus, 
  X, 
  MapPin, 
  Briefcase, 
  ChevronRight,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { useRecruitment, Candidate, CandidateStatus } from '@/context/RecruitmentContext';

export default function ComparePage() {
  const {
    candidates,
    candidateStatuses,
    handleSetStatus,
    setInspectedCandidate,
    maskName,
    evalNotes,
    jd
  } = useRecruitment();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Automatically select top 2 candidates by default if available
  useEffect(() => {
    if (selectedIds.length === 0 && candidates.length >= 2) {
      const top2 = [...candidates]
        .sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
        .slice(0, 2)
        .map(c => c.candidate_id);
      setSelectedIds(top2);
    }
  }, [candidates]);

  const selectedCandidates = candidates.filter(c => selectedIds.includes(c.candidate_id));
  const unselectedCandidates = candidates.filter(c => !selectedIds.includes(c.candidate_id));

  const handleToggleCandidate = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      if (selectedIds.length >= 4) {
        alert('You can compare up to 4 candidates simultaneously.');
        return;
      }
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleSelectTop2 = () => {
    const top2 = [...candidates]
      .sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
      .slice(0, 2)
      .map(c => c.candidate_id);
    setSelectedIds(top2);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">Candidate Comparison Matrix</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
              {selectedCandidates.length} Selected
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {jd?.role ? `Side-by-side rubric evaluation for: ${jd.role}` : 'Compare candidates across skills, experience, and recruiter rubrics'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {candidates.length >= 2 && (
            <button
              onClick={handleSelectTop2}
              className="px-3.5 py-2 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" /> Compare Top 2
            </button>
          )}
          <Link
            href="/dashboard/candidates"
            className="px-3.5 py-2 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition"
          >
            All Candidates
          </Link>
        </div>
      </div>

      {/* Candidate Selection Pill Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-indigo-600" /> Select Candidates to Compare (Max 4):
          </span>
          <span className="text-[11px] text-slate-400">
            Click to add or remove candidates
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {candidates.map((cand) => {
            const isSelected = selectedIds.includes(cand.candidate_id);
            const displayName = maskName(cand.name, cand.candidate_id);
            const score = Math.round(cand.match_score || 0);

            return (
              <button
                key={cand.candidate_id}
                onClick={() => handleToggleCandidate(cand.candidate_id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 border ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <span>{displayName}</span>
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {score}%
                </span>
                {isSelected ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3 text-slate-400" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Comparison Grid View */}
      {selectedCandidates.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center shadow-sm space-y-3">
          <GitCompare className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">No Candidates Selected</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Select 2 to 4 candidates from the selector above to generate an instant side-by-side comparative rubric matrix.
          </p>
          {candidates.length >= 2 && (
            <button
              onClick={handleSelectTop2}
              className="mt-2 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition"
            >
              Compare Top 2 Candidates
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-x-auto">
          <div className="min-w-[750px]">
            {/* Matrix Header Row */}
            <div className={`grid grid-cols-${selectedCandidates.length} divide-x divide-slate-100 border-b border-slate-200 bg-slate-50/60`}>
              {selectedCandidates.map((cand) => {
                const displayName = maskName(cand.name, cand.candidate_id);
                const status = candidateStatuses[cand.candidate_id];
                const score = Math.round(cand.match_score || 0);

                return (
                  <div key={cand.candidate_id} className="p-6 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white font-black text-sm flex items-center justify-center shadow-sm shrink-0">
                          {displayName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-extrabold text-base text-slate-900">{displayName}</h3>
                          <p className="text-xs text-slate-400 truncate max-w-[180px]">
                            {cand.headline || 'Candidate Profile'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleToggleCandidate(cand.candidate_id)}
                        className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/60 transition"
                        title="Remove from comparison"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-2xl font-black ${
                          score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-slate-600'
                        }`}>
                          {score}%
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium">overall fit</span>
                      </div>

                      {status ? (
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                          status === 'shortlisted' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          status === 'offered' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                          'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {status}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Under Review</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Matrix Section: Experience & Location */}
            <div className="p-4 bg-slate-100/50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
              Experience & Domain Seniority
            </div>
            <div className={`grid grid-cols-${selectedCandidates.length} divide-x divide-slate-100 border-b border-slate-200`}>
              {selectedCandidates.map((cand) => (
                <div key={cand.candidate_id} className="p-6 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Total Experience:</span>
                    <span className="font-extrabold text-slate-800">
                      {cand.experience_years ? `${cand.experience_years.toFixed(1)} Years` : 'Not specified'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Location:</span>
                    <span className="font-bold text-slate-700">{cand.location || 'Remote'}</span>
                  </div>
                  {jd?.experience_years && (
                    <div className="pt-2 border-t border-slate-100">
                      <span className="text-[11px] text-slate-500">
                        Target role min: {jd.experience_years} yrs •{' '}
                        {(cand.experience_years || 0) >= jd.experience_years ? (
                          <strong className="text-emerald-600">Meets requirement</strong>
                        ) : (
                          <strong className="text-amber-600">Below requirement</strong>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Matrix Section: Matched Competencies */}
            <div className="p-4 bg-slate-100/50 border-b border-slate-200 text-xs font-bold text-emerald-700 uppercase tracking-wider">
              Matched Competencies
            </div>
            <div className={`grid grid-cols-${selectedCandidates.length} divide-x divide-slate-100 border-b border-slate-200`}>
              {selectedCandidates.map((cand) => (
                <div key={cand.candidate_id} className="p-6 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(cand.matched_skills || cand.skills || []).length > 0 ? (
                      (cand.matched_skills || cand.skills || []).map((skill, idx) => (
                        <span key={idx} className="bg-emerald-50 text-emerald-700 text-xs px-2.5 py-1 rounded-lg border border-emerald-100 font-medium">
                          ✓ {skill}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400 italic">No skills matched directly</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Matrix Section: Identified Skill Gaps */}
            <div className="p-4 bg-slate-100/50 border-b border-slate-200 text-xs font-bold text-rose-600 uppercase tracking-wider">
              Identified Skill Gaps
            </div>
            <div className={`grid grid-cols-${selectedCandidates.length} divide-x divide-slate-100 border-b border-slate-200`}>
              {selectedCandidates.map((cand) => (
                <div key={cand.candidate_id} className="p-6 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(cand.gaps && cand.gaps.length > 0) ? (
                      cand.gaps.map((gap, idx) => (
                        <span key={idx} className="bg-rose-50 text-rose-700 text-xs px-2.5 py-1 rounded-lg border border-rose-100 font-medium">
                          ⚠ {gap}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-emerald-600 font-medium">✓ No identified skill gaps</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Matrix Section: Recruiter Rubric Evaluations */}
            <div className="p-4 bg-indigo-50/60 border-b border-indigo-100 text-xs font-bold text-indigo-900 uppercase tracking-wider">
              Recruiter Evaluation Ratings & Feedback
            </div>
            <div className={`grid grid-cols-${selectedCandidates.length} divide-x divide-slate-100 border-b border-slate-200`}>
              {selectedCandidates.map((cand) => {
                const notes = evalNotes[cand.candidate_id];
                return (
                  <div key={cand.candidate_id} className="p-6 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Technical Architecture:</span>
                      <span className="font-black text-amber-500 text-sm">
                        {'★'.repeat(notes?.tech || 0)}{'☆'.repeat(5 - (notes?.tech || 0))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Communication / Team:</span>
                      <span className="font-black text-amber-500 text-sm">
                        {'★'.repeat(notes?.comm || 0)}{'☆'.repeat(5 - (notes?.comm || 0))}
                      </span>
                    </div>
                    <div className="pt-2 border-t border-slate-100">
                      <span className="text-slate-400 block mb-1">Interviewer Notes:</span>
                      <p className="text-slate-700 italic bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-[11px] leading-relaxed">
                        {notes?.notes ? `"${notes.notes}"` : 'No custom feedback logged yet'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Matrix Action Buttons Row */}
            <div className={`grid grid-cols-${selectedCandidates.length} divide-x divide-slate-100 bg-slate-50/80 p-4`}>
              {selectedCandidates.map((cand) => {
                const displayName = maskName(cand.name, cand.candidate_id);
                const status = candidateStatuses[cand.candidate_id];

                return (
                  <div key={cand.candidate_id} className="p-3 flex flex-col gap-2">
                    <button
                      onClick={() => setInspectedCandidate(cand)}
                      className="w-full py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition"
                    >
                      Inspect Full Profile
                    </button>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleSetStatus(cand.candidate_id, displayName, 'shortlisted')}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition ${
                          status === 'shortlisted' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}
                      >
                        Shortlist
                      </button>
                      <button
                        onClick={() => handleSetStatus(cand.candidate_id, displayName, 'offered')}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition ${
                          status === 'offered' ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                        }`}
                      >
                        Offer
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
