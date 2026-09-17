'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  Users, 
  Briefcase, 
  Calendar, 
  Sparkles, 
  ArrowUpRight, 
  Send, 
  Bot, 
  CheckCircle2, 
  XCircle, 
  Award, 
  UploadCloud, 
  Plus, 
  Search, 
  ExternalLink,
  ChevronRight,
  TrendingUp,
  FileText,
  AlertCircle
} from 'lucide-react';
import MarkdownText from '@/components/MarkdownText';
import { useRecruitment, Candidate, CandidateStatus } from '@/context/RecruitmentContext';
import { useCopilotChat } from '@/hooks/useCopilotChat';
import { ChatMessage } from '@/types/chat';

export default function DashboardOverviewPage() {
  const {
    jd,
    candidates,
    candidateStatuses,
    scheduledInterviews,
    handleSetStatus,
    setInspectedCandidate,
    maskName,
    activeSessionId,
    uploadJd,
    uploadResumes,
    refreshData
  } = useRecruitment();

  const initialWelcome = useMemo<ChatMessage[]>(() => [
    {
      role: 'assistant',
      content: 'Welcome to **RecruitAI Mission Control**. Ask me anything about your current candidate pool, request candidate ranking summaries, or jump into dedicated workspaces.'
    }
  ], []);

  // Unified Copilot Chat hook targeting /api/chat endpoint via useCopilotChat (ARCH-5)
  const {
    messages,
    input,
    setInput,
    isLoading: isChatLoading,
    handleSend
  } = useCopilotChat({
    activeSessionId,
    jd,
    initialMessages: initialWelcome,
    onSessionUpdated: refreshData
  });

  const chatBottomRef = useRef<HTMLDivElement>(null);

  // File upload drag & drop state
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  // Scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    handleSend();
  };

  // Quick file drop handler for quick ingestion
  const handleQuickIngestFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadStatus('Ingesting documents via /api/ingest...');
    try {
      const fileArray = Array.from(files);
      const res = await uploadResumes(fileArray);
      if (res.success) {
        setUploadStatus(`Successfully ingested ${res.count || fileArray.length} candidate resume(s).`);
        setTimeout(() => setUploadStatus(null), 4000);
      } else {
        setUploadStatus(`Upload failed: ${res.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setUploadStatus(`Error: ${err.message}`);
    }
  };

  // Ingestion and session state managed via useRecruitment (/api/ingest, /api/sessions)
  // Metrics computation
  const totalCandidates = candidates.length;
  const highMatchCount = candidates.filter(c => (c.match_score || 0) >= 85).length;
  const shortlistedCount = Object.values(candidateStatuses).filter(s => s === 'shortlisted').length;
  const interviewsCount = scheduledInterviews.length;

  // Sorted candidates for leaderboard
  const topCandidates = [...candidates]
    .sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
    .slice(0, 5);

  return (
    <div className="space-y-8 pb-12">
      {/* Top Banner & Quick Shortcuts */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 p-6 sm:p-8 text-white shadow-xl">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold text-indigo-200 border border-white/10">
              <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
              <span>RecruitAI Intelligent Talent Engine</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              {jd?.role ? `Target Requisition: ${jd.role}` : 'Welcome to Mission Control'}
            </h1>
            <p className="text-sm text-indigo-100/80 leading-relaxed">
              {jd ? (
                <>Experience requirement: <span className="font-bold text-white">{jd.experience_years} years</span> • Required skills: <span className="font-bold text-white">{jd.required_skills?.slice(0, 4).join(', ') || 'N/A'}</span></>
              ) : (
                'No active position configured. Upload a Job Description to initiate autonomous candidate parsing, 5-pillar rubric matching, and AI copilot evaluation.'
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link
              href="/dashboard/jobs"
              className="px-4 py-2.5 rounded-xl bg-white text-indigo-900 text-xs font-black hover:bg-indigo-50 transition shadow-sm flex items-center gap-2"
            >
              <Briefcase className="w-4 h-4 text-indigo-600" />
              {jd ? 'Manage Position' : 'Set Up Position'}
            </Link>
            <Link
              href="/dashboard/candidates"
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition border border-white/20 backdrop-blur-sm flex items-center gap-2"
            >
              <Users className="w-4 h-4 text-indigo-300" />
              Candidate Pipeline
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Metric 1: Ingested Candidates */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:border-indigo-300 transition group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Candidate Pool</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">{totalCandidates}</span>
            <span className="text-xs text-slate-500 font-medium">resumes parsed</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Shortlisted: <strong className="text-emerald-600 font-bold">{shortlistedCount}</strong></span>
            <Link href="/dashboard/candidates" className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-0.5">
              View <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Metric 2: High Match Fit */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:border-emerald-300 transition group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Top Match (≥85%)</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-600">{highMatchCount}</span>
            <span className="text-xs text-slate-500 font-medium">candidates</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>High precision rubric fit</span>
            <Link href="/dashboard/compare" className="text-emerald-600 hover:text-emerald-800 font-semibold flex items-center gap-0.5">
              Compare <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Metric 3: Target Role Spec */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:border-indigo-300 transition group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Position</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-base font-extrabold text-slate-900 truncate block">
              {jd?.role || 'No Job Configured'}
            </span>
            <span className="text-xs text-slate-500 font-medium">
              {jd ? `${jd.required_skills?.length || 0} required skills` : 'Configure in Positions'}
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Tone: {jd?.tone || 'Professional'}</span>
            <Link href="/dashboard/jobs" className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-0.5">
              Details <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Metric 4: Scheduled Interviews */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:border-indigo-300 transition group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Scheduled Interviews</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-indigo-600">{interviewsCount}</span>
            <span className="text-xs text-slate-500 font-medium">booked rounds</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Calendar coordination</span>
            <Link href="/dashboard/interviews" className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-0.5">
              Schedule <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Main Dual Grid: Top Candidates Leaderboard & AI Quick Assistant */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column (7 cols): Top Candidates Leaderboard & Ingest Dropzone */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Award className="w-4 h-4 text-indigo-600" />
                  Top Candidate Leaderboard
                </h2>
                <p className="text-xs text-slate-500">
                  Highest ranked matches scored against active position rubrics
                </p>
              </div>
              <Link
                href="/dashboard/candidates"
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                Full Pipeline ({totalCandidates}) <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {topCandidates.length === 0 ? (
              <div className="py-12 px-4 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-700">No candidates analyzed yet</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Upload resumes below or navigate to the Candidates workspace to start screening.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {topCandidates.map((cand) => {
                  const displayName = maskName(cand.name, cand.candidate_id);
                  const status = candidateStatuses[cand.candidate_id];
                  const score = Math.round(cand.match_score || 0);

                  return (
                    <div 
                      key={cand.candidate_id}
                      className="py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/80 p-2 rounded-xl transition"
                    >
                      <div 
                        onClick={() => setInspectedCandidate(cand)}
                        className="flex items-center gap-3 min-w-0 cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 font-black text-xs flex items-center justify-center shrink-0">
                          {displayName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900 truncate hover:text-indigo-600 transition">
                              {displayName}
                            </span>
                            {status && (
                              <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-md ${
                                status === 'shortlisted' ? 'bg-emerald-50 text-emerald-700' :
                                status === 'offered' ? 'bg-indigo-50 text-indigo-700' :
                                'bg-rose-50 text-rose-700'
                              }`}>
                                {status}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 truncate">
                            {cand.headline || (cand.matched_skills?.slice(0, 3).join(', ') || 'Candidate Profile')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className={`text-sm font-black ${
                            score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-slate-600'
                          }`}>
                            {score}%
                          </span>
                          <span className="text-[10px] text-slate-400 block">rubric fit</span>
                        </div>

                        {/* Quick status actions */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleSetStatus(cand.candidate_id, displayName, 'shortlisted')}
                            className={`p-1.5 rounded-lg border transition ${
                              status === 'shortlisted'
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-200'
                            }`}
                            title="Shortlist Candidate"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleSetStatus(cand.candidate_id, displayName, 'rejected')}
                            className={`p-1.5 rounded-lg border transition ${
                              status === 'rejected'
                                ? 'bg-rose-600 text-white border-rose-600'
                                : 'bg-white border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200'
                            }`}
                            title="Reject Candidate"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Resume Upload Dropzone */}
          <div 
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleQuickIngestFiles(e.dataTransfer.files);
            }}
            className={`p-6 rounded-3xl border-2 border-dashed transition text-center bg-white shadow-sm ${
              isDragging ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200/90 hover:border-indigo-300'
            }`}
          >
            <UploadCloud className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-800">Quick Resume Ingestion</h3>
            <p className="text-xs text-slate-500 mt-1">
              Drag & drop candidate PDF/DOCX resumes here or click to browse
            </p>
            <label className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold cursor-pointer hover:bg-indigo-100 transition">
              <Plus className="w-3.5 h-3.5" /> Select Files
              <input 
                type="file" 
                multiple 
                accept=".pdf,.docx,.txt"
                className="hidden" 
                onChange={(e) => handleQuickIngestFiles(e.target.files)}
              />
            </label>
            {uploadStatus && (
              <p className="text-xs font-medium text-indigo-600 mt-3 animate-in fade-in">
                {uploadStatus}
              </p>
            )}
          </div>
        </div>

        {/* Right Column (5 cols): AI Quick Assistant & Copilot Gateway */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm flex flex-col h-[600px] overflow-hidden">
            {/* Assistant Header */}
            <div className="px-5 py-4 border-b border-slate-200/80 bg-slate-50/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white flex items-center justify-center shadow-sm">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-extrabold text-slate-900">AI Recruiter Assistant</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Quick candidate intelligence queries</p>
                </div>
              </div>
              <Link
                href="/dashboard/copilot"
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                title="Launch full AI Copilot workspace"
              >
                Expand <ExternalLink className="w-3 h-3" />
              </Link>
            </div>

            {/* Assistant Chat Stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar text-xs">
              {messages.map((m, idx) => (
                <div 
                  key={idx}
                  className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {m.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">
                      AI
                    </div>
                  )}
                  <div 
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-800 border border-slate-200/60'
                    }`}
                  >
                    {m.role === 'assistant' ? (
                      <MarkdownText content={m.content} />
                    ) : (
                      <span>{m.content}</span>
                    )}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex items-center gap-2 text-slate-400 text-xs italic py-2">
                  <Bot className="w-4 h-4 animate-spin text-indigo-500" />
                  <span>Analyzing talent pool...</span>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Quick Prompt Suggestions */}
            <div className="px-4 py-2 bg-slate-50/60 border-t border-slate-100 flex gap-1.5 overflow-x-auto no-scrollbar shrink-0">
              <button
                type="button"
                onClick={() => {
                  setInput('Who are the top 3 candidates for this position?');
                }}
                className="text-[11px] whitespace-nowrap px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition"
              >
                Top 3 candidates?
              </button>
              <button
                type="button"
                onClick={() => {
                  setInput('Which candidates have experience with Docker and Kubernetes?');
                }}
                className="text-[11px] whitespace-nowrap px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition"
              >
                Docker/K8s skills?
              </button>
            </div>

            {/* Chat Input Bar */}
            <form 
              onSubmit={handleSendMessage}
              className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
            >
              <input
                type="text"
                placeholder="Ask about candidates, skills, or summaries..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isChatLoading}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
              <button
                type="submit"
                disabled={isChatLoading || !input.trim()}
                className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl transition shrink-0"
                title="Send query"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
}
