import React from 'react';
import Link from 'next/link';
import { 
  SlidersHorizontal, 
  X, 
  Sparkles, 
  ArrowRight, 
  Users, 
  Search, 
  Briefcase, 
  ExternalLink 
} from 'lucide-react';
import { Candidate } from '@/context/RecruitmentContext';
import { PRESET_CATEGORIES } from '@/config/copilotPresets';

interface PresetsDeckDrawerProps {
  show: boolean;
  onClose: () => void;
  activeCategory: string;
  setActiveCategory: (catId: string) => void;
  isLoading: boolean;
  totalPresetsCount: number;
  candidates: Candidate[];
  candidateFilter: string;
  setCandidateFilter: (val: string) => void;
  filteredCandidates: Candidate[];
  roleName: string;
  onSelectPrompt: (prompt: string) => void;
  onInjectCandidateQuery: (candidate: Candidate, action: 'dive' | 'gaps' | 'invite') => void;
}

export const PresetsDeckDrawer: React.FC<PresetsDeckDrawerProps> = ({
  show,
  onClose,
  activeCategory,
  setActiveCategory,
  isLoading,
  totalPresetsCount,
  candidates,
  candidateFilter,
  setCandidateFilter,
  filteredCandidates,
  roleName,
  onSelectPrompt,
  onInjectCandidateQuery
}) => {
  if (!show) return null;

  const currentCategoryData = PRESET_CATEGORIES.find(c => c.id === activeCategory) || PRESET_CATEGORIES[0];

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
      
      {/* Semi-transparent Backdrop */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/20 backdrop-blur-xs transition-opacity" 
      />

      {/* Slide-out Drawer Panel */}
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl border-l border-slate-200/90 flex flex-col z-10 animate-in slide-in-from-right duration-250">
        
        {/* Drawer Header with Dynamic Presets Counter */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">Recruiter Command Deck</h3>
              <p className="text-[11px] text-slate-500">
                {totalPresetsCount} one-click workflow presets
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            title="Close Drawer (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workflow Category Tabs */}
        <div className="p-3 border-b border-slate-100 flex gap-1.5 overflow-x-auto no-scrollbar bg-white">
          {PRESET_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Presets List Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          
          <div className="text-xs text-slate-500 pb-1 font-medium">
            {currentCategoryData.description}
          </div>

          <div className="space-y-2">
            {currentCategoryData.prompts.map((item, pIdx) => (
              <button
                key={pIdx}
                onClick={() => {
                  onClose();
                  onSelectPrompt(item.prompt);
                }}
                disabled={isLoading}
                className="w-full text-left p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-indigo-50/40 hover:border-indigo-300 hover:shadow-xs transition group disabled:opacity-50 cursor-pointer"
              >
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-indigo-500 opacity-0 group-hover:opacity-100 transition" />
                    {item.title}
                  </h4>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition group-hover:translate-x-0.5" />
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  {item.description}
                </p>
              </button>
            ))}
          </div>

          {/* Quick Candidate Mentions Section */}
          <div className="pt-4 border-t border-slate-200/70 mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-600" /> Candidate Quick-Actions
              </span>
              <span className="text-[10px] text-slate-400 font-semibold">
                {candidates.length} pool
              </span>
            </div>

            {/* Candidate Search Box */}
            {candidates.length > 4 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search candidate name or skill..."
                  value={candidateFilter}
                  onChange={(e) => setCandidateFilter(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white"
                />
              </div>
            )}

            {/* Candidate List with 1-Click Action Buttons */}
            <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
              {filteredCandidates.length > 0 ? (
                filteredCandidates.slice(0, 10).map((cand) => {
                  const score = Math.round(cand.match_score || 0);
                  const scoreColor = score >= 85 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : score >= 70 ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-700 border-slate-200';
                  return (
                    <div
                      key={cand.candidate_id}
                      className="p-3 rounded-2xl border border-slate-200 bg-white hover:border-indigo-200 transition space-y-2"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {cand.name}
                        </span>
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md border shrink-0 ${scoreColor}`}>
                          {score > 0 ? `${score}% Match` : 'New'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <button
                          onClick={() => onInjectCandidateQuery(cand, 'dive')}
                          disabled={isLoading}
                          className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 transition cursor-pointer"
                          title="Deep-dive profile analysis"
                        >
                          Deep-Dive
                        </button>
                        <button
                          onClick={() => onInjectCandidateQuery(cand, 'gaps')}
                          disabled={isLoading}
                          className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 transition cursor-pointer"
                          title="Inspect competency gaps"
                        >
                          Test Gaps
                        </button>
                        <button
                          onClick={() => onInjectCandidateQuery(cand, 'invite')}
                          disabled={isLoading}
                          className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-600 text-slate-600 transition cursor-pointer"
                          title="Draft personalized interview invitation"
                        >
                          Invite
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-6 text-xs text-slate-400">
                  No candidates match your search.
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Command Deck Footer */}
        <div className="p-3.5 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5 text-slate-400" />
            <span className="truncate max-w-[190px] font-medium">{roleName}</span>
          </span>
          <Link
            href="/dashboard/jobs"
            className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline flex items-center gap-1"
          >
            <span>Edit Specs</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>

      </div>
    </div>
  );
};
