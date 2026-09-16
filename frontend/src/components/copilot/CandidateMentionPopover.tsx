import React from 'react';
import { X } from 'lucide-react';
import { Candidate } from '@/context/RecruitmentContext';

interface CandidateMentionPopoverProps {
  show: boolean;
  onClose: () => void;
  candidates: Candidate[];
  onInjectCandidateQuery: (candidate: Candidate, action: 'dive' | 'gaps' | 'invite') => void;
}

export const CandidateMentionPopover: React.FC<CandidateMentionPopoverProps> = ({
  show,
  onClose,
  candidates,
  onInjectCandidateQuery
}) => {
  if (!show) return null;

  return (
    <div className="absolute right-0 top-10 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 p-3 z-50 animate-in fade-in zoom-in-95">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
        <span className="text-xs font-bold text-slate-800">Quick Candidate Actions</span>
        <button 
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="max-h-60 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
        {candidates.length > 0 ? (
          candidates.map(cand => (
            <div 
              key={cand.candidate_id} 
              className="p-2 rounded-xl bg-slate-50 hover:bg-indigo-50/50 border border-slate-200/60 transition"
            >
              <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-1">
                <span className="truncate">{cand.name}</span>
                <span className="text-[10px] text-indigo-600 font-extrabold">
                  {Math.round(cand.match_score || 0)}%
                </span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => onInjectCandidateQuery(cand, 'dive')}
                  className="text-[10px] font-semibold px-2 py-0.5 bg-white border border-slate-200 rounded-md hover:bg-indigo-600 hover:text-white transition cursor-pointer"
                >
                  Deep Dive
                </button>
                <button
                  onClick={() => onInjectCandidateQuery(cand, 'gaps')}
                  className="text-[10px] font-semibold px-2 py-0.5 bg-white border border-slate-200 rounded-md hover:bg-rose-600 hover:text-white transition cursor-pointer"
                >
                  Test Gaps
                </button>
                <button
                  onClick={() => onInjectCandidateQuery(cand, 'invite')}
                  className="text-[10px] font-semibold px-2 py-0.5 bg-white border border-slate-200 rounded-md hover:bg-emerald-600 hover:text-white transition cursor-pointer"
                >
                  Invite
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-4 text-xs text-slate-400">
            No candidates available in active session
          </div>
        )}
      </div>
    </div>
  );
};
