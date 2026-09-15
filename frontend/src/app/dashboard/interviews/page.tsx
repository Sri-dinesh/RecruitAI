'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Calendar, 
  Clock, 
  Video, 
  Plus, 
  Users, 
  ExternalLink, 
  CheckCircle2, 
  X, 
  Sparkles,
  MapPin,
  ChevronRight,
  MessageSquare,
  FileText
} from 'lucide-react';
import { useRecruitment, ScheduledInterview } from '@/context/RecruitmentContext';

export default function InterviewsPage() {
  const {
    candidates,
    scheduledInterviews,
    maskName,
    setInspectedCandidate,
    activeSessionId,
    refreshData,
    jd
  } = useRecruitment();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewTime, setInterviewTime] = useState('14:00');
  const [interviewMode, setInterviewMode] = useState('Technical Architecture Round (Video)');
  const [meetingUrl, setMeetingUrl] = useState('https://meet.google.com/rec-ruit-ai');
  const [prepNotes, setPrepNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleOpenScheduleModal = (candidateId?: string) => {
    if (candidateId) {
      setSelectedCandidateId(candidateId);
    } else if (candidates.length > 0) {
      setSelectedCandidateId(candidates[0].candidate_id);
    }
    // Default date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setInterviewDate(tomorrow.toISOString().split('T')[0]);
    setIsModalOpen(true);
  };

  const handleCreateInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidateId || !interviewDate || !interviewTime) return;

    const cand = candidates.find(c => c.candidate_id === selectedCandidateId);
    if (!cand) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const slotString = `${interviewDate} at ${interviewTime} UTC`;
      const newInterview: ScheduledInterview = {
        candidate_name: cand.name,
        slot: slotString,
        mode: interviewMode,
        meeting_link: meetingUrl || 'https://meet.google.com/rec-ruit-ai',
        feedback: prepNotes,
        booked_at: new Date().toISOString()
      };

      // Update local storage / context state or call session patch
      const existing = scheduledInterviews || [];
      const updated = [...existing, newInterview];
      
      // Save locally to localStorage fallback for immediate responsiveness
      try {
        localStorage.setItem(`recruitai_interviews_${activeSessionId || 'default'}`, JSON.stringify(updated));
      } catch {}

      setFeedback(`Successfully scheduled interview with ${maskName(cand.name, cand.candidate_id)}!`);
      setIsModalOpen(false);
      refreshData();
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      alert(`Error scheduling: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">Interview Coordination & Pipeline</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
              {scheduledInterviews.length} Scheduled
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {jd?.role ? `Target position: ${jd.role}` : 'Manage technical screens, calendar slots, and interviewer feedback'}
          </p>
        </div>

        <button
          onClick={() => handleOpenScheduleModal()}
          disabled={candidates.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Schedule New Round</span>
        </button>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between animate-in fade-in">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="font-bold underline text-xs">Dismiss</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Booked Rounds</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{scheduledInterviews.length}</span>
            <span className="text-xs text-slate-500">interviews</span>
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Eligible Candidates</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-indigo-600">{candidates.length}</span>
            <span className="text-xs text-slate-500">in current pool</span>
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Video Platform</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-base font-extrabold text-slate-800">Google Meet / Zoom</span>
          </div>
        </div>
      </div>

      {/* Scheduled Interviews List */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" /> Confirmed Interview Slots
          </h2>
          <span className="text-xs text-slate-400">All times in UTC</span>
        </div>

        {scheduledInterviews.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-800">No interviews scheduled yet</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Book a screening or technical round with one of your shortlisted candidates.
            </p>
            {candidates.length > 0 && (
              <button
                onClick={() => handleOpenScheduleModal()}
                className="mt-2 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition"
              >
                Schedule First Candidate
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {scheduledInterviews.map((item, idx) => {
              const matchedCandidate = candidates.find(c => c.name === item.candidate_name);
              const displayName = matchedCandidate ? maskName(matchedCandidate.name, matchedCandidate.candidate_id) : item.candidate_name;

              return (
                <div key={idx} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 transition">
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 font-black text-sm flex items-center justify-center shrink-0">
                      {displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-extrabold text-sm text-slate-900">{displayName}</h3>
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {item.mode || 'Technical Screen'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                        <span className="flex items-center gap-1 font-semibold text-slate-700">
                          <Clock className="w-3.5 h-3.5 text-slate-400" /> {item.slot}
                        </span>
                      </div>
                      {item.feedback && (
                        <p className="text-xs text-slate-500 italic mt-2 bg-slate-50 p-2 rounded-xl border border-slate-100 max-w-lg">
                          Interviewer prep: &quot;{item.feedback}&quot;
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {matchedCandidate && (
                      <button
                        onClick={() => setInspectedCandidate(matchedCandidate)}
                        className="px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition"
                      >
                        Rubric
                      </button>
                    )}
                    <a
                      href={item.meeting_link || 'https://meet.google.com/rec-ruit-ai'}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                    >
                      <Video className="w-3.5 h-3.5" /> Join Meeting <ExternalLink className="w-3 h-3 ml-0.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Schedule Interview Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 select-text animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-lg shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">Schedule Interview Round</h3>
                  <p className="text-xs text-slate-400">Coordinate technical evaluation slot</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInterview} className="space-y-4 text-xs">
              {/* Select Candidate */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Select Candidate:</label>
                <select
                  value={selectedCandidateId}
                  onChange={(e) => setSelectedCandidateId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                >
                  {candidates.map((cand) => (
                    <option key={cand.candidate_id} value={cand.candidate_id}>
                      {maskName(cand.name, cand.candidate_id)} ({Math.round(cand.match_score || 0)}% Match)
                    </option>
                  ))}
                </select>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Date:</label>
                  <input
                    type="date"
                    value={interviewDate}
                    onChange={(e) => setInterviewDate(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Time (UTC):</label>
                  <input
                    type="time"
                    value={interviewTime}
                    onChange={(e) => setInterviewTime(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Round Type */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Evaluation Format / Mode:</label>
                <select
                  value={interviewMode}
                  onChange={(e) => setInterviewMode(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                >
                  <option value="Initial Screening Call (30 min)">Initial Screening Call (30 min)</option>
                  <option value="Technical Architecture Round (Video)">Technical Architecture Round (Video)</option>
                  <option value="System Design & Coding (60 min)">System Design & Coding (60 min)</option>
                  <option value="Leadership & Cultural Fit (45 min)">Leadership & Cultural Fit (45 min)</option>
                </select>
              </div>

              {/* Video Meeting URL */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Video Meeting URL:</label>
                <input
                  type="url"
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  placeholder="https://meet.google.com/..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Prep Notes */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Interviewer Prep Notes (Optional):</label>
                <textarea
                  rows={2}
                  value={prepNotes}
                  onChange={(e) => setPrepNotes(e.target.value)}
                  placeholder="E.g. Focus on distributed caching and recent microservices experience..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition shadow-sm"
                >
                  {isSubmitting ? 'Booking...' : 'Confirm Slot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
