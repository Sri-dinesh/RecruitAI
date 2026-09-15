'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  Users, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  Award, 
  Calendar, 
  Mail, 
  UploadCloud, 
  Plus, 
  ExternalLink,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Eye,
  Briefcase,
  MapPin,
  ChevronRight,
  Check,
  AlertCircle
} from 'lucide-react';
import { useRecruitment, Candidate, CandidateStatus } from '@/context/RecruitmentContext';

export default function CandidatesPage() {
  const {
    candidates,
    candidateStatuses,
    handleSetStatus,
    setInspectedCandidate,
    maskName,
    maskEmail,
    uploadResumes,
    isBlindHiring,
    jd
  } = useRecruitment();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatusTab, setSelectedStatusTab] = useState<'all' | 'shortlisted' | 'offered' | 'rejected'>('all');
  const [minScore, setMinScore] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);

  // Filter candidates
  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      // Score filter
      const score = c.match_score || 0;
      if (score < minScore) return false;

      // Status tab filter
      const status = candidateStatuses[c.candidate_id];
      if (selectedStatusTab !== 'all') {
        if (status !== selectedStatusTab) return false;
      }

      // Search query filter (name, skills, headline)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = (c.name || '').toLowerCase().includes(q);
        const headlineMatch = (c.headline || '').toLowerCase().includes(q);
        const skillsMatch = (c.matched_skills || c.skills || []).some(s => s.toLowerCase().includes(q));
        if (!nameMatch && !headlineMatch && !skillsMatch) return false;
      }

      return true;
    });
  }, [candidates, candidateStatuses, selectedStatusTab, minScore, searchQuery]);

  // Tab counts
  const counts = useMemo(() => {
    let shortlisted = 0;
    let offered = 0;
    let rejected = 0;
    Object.values(candidateStatuses).forEach((status) => {
      if (status === 'shortlisted') shortlisted++;
      if (status === 'offered') offered++;
      if (status === 'rejected') rejected++;
    });
    return {
      all: candidates.length,
      shortlisted,
      offered,
      rejected
    };
  }, [candidates, candidateStatuses]);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadFeedback('Parsing and scoring candidate resumes...');
    try {
      const fileArray = Array.from(files);
      const res = await uploadResumes(fileArray);
      if (res.success) {
        setUploadFeedback(`Successfully added and scored ${res.count || fileArray.length} candidate(s).`);
        setTimeout(() => setUploadFeedback(null), 4000);
      } else {
        setUploadFeedback(`Upload error: ${res.error || 'Failed to ingest resumes'}`);
      }
    } catch (err: any) {
      setUploadFeedback(`Upload error: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Upload Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">Candidate Pipeline</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
              {filteredCandidates.length} of {candidates.length}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {jd?.role ? `Screening talent pool for: ${jd.role}` : 'Screen, rank, and advance candidates against position rubrics'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50">
            <UploadCloud className="w-4 h-4" />
            <span>{isUploading ? 'Uploading...' : 'Ingest Resumes'}</span>
            <input 
              type="file" 
              multiple 
              accept=".pdf,.docx,.txt"
              className="hidden" 
              disabled={isUploading}
              onChange={(e) => handleFileUpload(e.target.files)}
            />
          </label>
        </div>
      </div>

      {uploadFeedback && (
        <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-medium flex items-center justify-between animate-in fade-in">
          <span>{uploadFeedback}</span>
          <button onClick={() => setUploadFeedback(null)} className="text-indigo-500 hover:text-indigo-800 text-xs font-bold">Dismiss</button>
        </div>
      )}

      {/* Filter and Search Toolbar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-2xl overflow-x-auto no-scrollbar shrink-0">
            {[
              { id: 'all', label: 'All Candidates', count: counts.all },
              { id: 'shortlisted', label: 'Shortlisted', count: counts.shortlisted, color: 'text-emerald-700' },
              { id: 'offered', label: 'Offered', count: counts.offered, color: 'text-indigo-700' },
              { id: 'rejected', label: 'Rejected', count: counts.rejected, color: 'text-rose-700' },
            ].map((tab) => {
              const active = selectedStatusTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedStatusTab(tab.id as any)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                    active 
                      ? 'bg-white text-slate-900 shadow-sm' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${active ? 'bg-slate-100 font-extrabold' : 'text-slate-400'}`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Bar & View Mode Toggle */}
          <div className="flex items-center gap-3 flex-1 lg:max-w-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search candidates by name, skill, or title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl shrink-0">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition ${viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                title="Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition ${viewMode === 'table' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                title="Table View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Score Threshold Filter Bar */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" /> Minimum Fit Score:
            </span>
            <div className="flex items-center gap-1.5">
              {[0, 60, 75, 85].map((thresh) => (
                <button
                  key={thresh}
                  onClick={() => setMinScore(thresh)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                    minScore === thresh 
                      ? 'bg-indigo-600 text-white shadow-sm' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {thresh === 0 ? 'All Scores' : `≥ ${thresh}%`}
                </button>
              ))}
            </div>
          </div>

          {isBlindHiring && (
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
              <Eye className="w-3.5 h-3.5 text-amber-600" /> Blind Hiring Mode Active (Names & Contact Masked)
            </div>
          )}
        </div>
      </div>

      {/* Candidate List / Grid Display */}
      {filteredCandidates.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-slate-200/80 shadow-sm space-y-3">
          <Users className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">No candidates match your filters</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Try adjusting your search query, status tab, or minimum fit score threshold.
          </p>
          {(searchQuery || minScore > 0 || selectedStatusTab !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setMinScore(0);
                setSelectedStatusTab('all');
              }}
              className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid Cards View */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredCandidates.map((cand) => {
            const displayName = maskName(cand.name, cand.candidate_id);
            const status = candidateStatuses[cand.candidate_id];
            const score = Math.round(cand.match_score || 0);

            return (
              <div
                key={cand.candidate_id}
                className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-sm hover:border-indigo-300 hover:shadow-md transition flex flex-col justify-between group"
              >
                <div>
                  {/* Top Card Bar */}
                  <div className="flex items-start justify-between gap-3">
                    <div 
                      onClick={() => setInspectedCandidate(cand)}
                      className="flex items-center gap-3 cursor-pointer min-w-0"
                    >
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white font-black text-sm flex items-center justify-center shadow-sm shrink-0">
                        {displayName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-extrabold text-sm text-slate-900 truncate group-hover:text-indigo-600 transition">
                          {displayName}
                        </h3>
                        <p className="text-xs text-slate-400 truncate">
                          {cand.headline || 'Candidate Profile'}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className={`text-base font-black ${
                        score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-slate-600'
                      }`}>
                        {score}%
                      </span>
                      <span className="text-[10px] text-slate-400 block font-medium">match</span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  {status && (
                    <div className="mt-3">
                      <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-full border ${
                        status === 'shortlisted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        status === 'offered' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                        'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {status}
                      </span>
                    </div>
                  )}

                  {/* Quick Meta */}
                  <div className="mt-3.5 grid grid-cols-2 gap-2 text-xs text-slate-500 border-t border-b border-slate-100 py-2.5">
                    <div className="flex items-center gap-1.5 truncate">
                      <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{cand.experience_years ? `${cand.experience_years.toFixed(1)} yrs exp` : 'Exp: N/A'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{cand.location || 'Remote'}</span>
                    </div>
                  </div>

                  {/* Matched Competencies */}
                  <div className="mt-3.5 space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Competencies</span>
                    <div className="flex flex-wrap gap-1">
                      {(cand.matched_skills || cand.skills || []).slice(0, 4).map((s, idx) => (
                        <span key={idx} className="bg-emerald-50 text-emerald-700 text-[11px] px-2 py-0.5 rounded-md border border-emerald-100 font-medium">
                          ✓ {s}
                        </span>
                      ))}
                      {(cand.matched_skills || cand.skills || []).length > 4 && (
                        <span className="text-[10px] text-slate-400 self-center">
                          +{ (cand.matched_skills || cand.skills || []).length - 4 } more
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setInspectedCandidate(cand)}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                  >
                    Rubric & Notes <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleSetStatus(cand.candidate_id, displayName, 'shortlisted')}
                      className={`p-1.5 rounded-lg border transition ${
                        status === 'shortlisted' 
                          ? 'bg-emerald-600 text-white border-emerald-600' 
                          : 'bg-white border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-200'
                      }`}
                      title="Shortlist"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleSetStatus(cand.candidate_id, displayName, 'offered')}
                      className={`p-1.5 rounded-lg border transition ${
                        status === 'offered' 
                          ? 'bg-indigo-600 text-white border-indigo-600' 
                          : 'bg-white border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200'
                      }`}
                      title="Offer"
                    >
                      <Award className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleSetStatus(cand.candidate_id, displayName, 'rejected')}
                      className={`p-1.5 rounded-lg border transition ${
                        status === 'rejected' 
                          ? 'bg-rose-600 text-white border-rose-600' 
                          : 'bg-white border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200'
                      }`}
                      title="Reject"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Candidate</th>
                  <th className="px-4 py-4">Fit Score</th>
                  <th className="px-4 py-4">Experience</th>
                  <th className="px-4 py-4">Top Skills</th>
                  <th className="px-4 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCandidates.map((cand) => {
                  const displayName = maskName(cand.name, cand.candidate_id);
                  const status = candidateStatuses[cand.candidate_id];
                  const score = Math.round(cand.match_score || 0);

                  return (
                    <tr key={cand.candidate_id} className="hover:bg-slate-50/70 transition">
                      <td className="px-6 py-4">
                        <div 
                          onClick={() => setInspectedCandidate(cand)}
                          className="flex items-center gap-3 cursor-pointer"
                        >
                          <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold flex items-center justify-center shrink-0">
                            {displayName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block hover:text-indigo-600 transition">
                              {displayName}
                            </span>
                            <span className="text-[11px] text-slate-400 block truncate max-w-xs">
                              {cand.headline || cand.location || 'Profile'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4 font-black">
                        <span className={`${score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-slate-600'}`}>
                          {score}%
                        </span>
                      </td>

                      <td className="px-4 py-4 text-slate-700 font-medium">
                        {cand.experience_years ? `${cand.experience_years.toFixed(1)} yrs` : 'N/A'}
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {(cand.matched_skills || cand.skills || []).slice(0, 3).map((s, idx) => (
                            <span key={idx} className="bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5 rounded-md font-medium">
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        {status ? (
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                            status === 'shortlisted' ? 'bg-emerald-50 text-emerald-700' :
                            status === 'offered' ? 'bg-indigo-50 text-indigo-700' :
                            'bg-rose-50 text-rose-700'
                          }`}>
                            {status}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Under Review</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setInspectedCandidate(cand)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                          >
                            Inspect
                          </button>
                          <button
                            onClick={() => handleSetStatus(cand.candidate_id, displayName, 'shortlisted')}
                            className={`p-1 rounded-lg transition ${status === 'shortlisted' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-emerald-600'}`}
                            title="Shortlist"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleSetStatus(cand.candidate_id, displayName, 'rejected')}
                            className={`p-1 rounded-lg transition ${status === 'rejected' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-rose-600'}`}
                            title="Reject"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
