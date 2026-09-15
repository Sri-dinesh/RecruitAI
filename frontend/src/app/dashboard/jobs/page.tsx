'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Briefcase, 
  Sparkles, 
  UploadCloud, 
  CheckCircle2, 
  Plus, 
  Sliders, 
  Layers, 
  FileText, 
  ArrowRight,
  ShieldCheck,
  Building,
  MapPin,
  Clock,
  DollarSign,
  GraduationCap,
  Award,
  AlertCircle
} from 'lucide-react';
import { useRecruitment } from '@/context/RecruitmentContext';

export default function JobsPage() {
  const { jd, uploadJd, createSession, sessions, activeSessionId, setActiveSessionId } = useRecruitment();

  const [inputMode, setInputMode] = useState<'upload' | 'text'>('text');
  const [jdText, setJdText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleUploadFile = async (file: File) => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await uploadJd(file, undefined);
      if (res.success) {
        setFeedback({ type: 'success', message: 'Job Description parsed and rubrics generated successfully!' });
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to parse Job Description file' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUploadText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jdText.trim()) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await uploadJd(undefined, jdText.trim());
      if (res.success) {
        setFeedback({ type: 'success', message: 'Job requisition successfully structured!' });
        setJdText('');
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to process Job Description text' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewPosition = async () => {
    const newId = await createSession();
    if (newId) {
      setFeedback({ type: 'success', message: 'Created new campaign workspace. Ready for JD configuration.' });
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">Positions & Evaluation Rubrics</h1>
            {jd?.role && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                Active: {jd.role}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Define target role specifications, required skills, and the autonomous 5-pillar candidate scoring rubric
          </p>
        </div>

        <button
          onClick={handleNewPosition}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>New Requisition Campaign</span>
        </button>
      </div>

      {feedback && (
        <div className={`p-4 rounded-2xl border text-xs font-medium flex items-center justify-between ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="font-bold underline text-xs">Dismiss</button>
        </div>
      )}

      {/* Main Grid: Active Spec + 5-Pillar Rubric + Ingestion Box */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column (7 cols): Active Position Spec & 5-Pillar Rubrics */}
        <div className="lg:col-span-7 space-y-6">
          {jd ? (
            <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm space-y-6">
              {/* Role Title & Metadata */}
              <div className="space-y-3 border-b border-slate-100 pb-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">Job Specification</span>
                    <h2 className="text-xl font-black text-slate-900 mt-0.5">{jd.role}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {jd.department || 'Engineering'} • {jd.company_name || 'RecruitAI Workspace'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-slate-500 block">Experience</span>
                    <span className="text-lg font-black text-indigo-600">{jd.experience_years} Years Min</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Type</span>
                    <span className="text-xs font-bold text-slate-700">{jd.employment_type || 'Full-time'}</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Location</span>
                    <span className="text-xs font-bold text-slate-700">{jd.location || 'Remote / Hybrid'}</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Tone</span>
                    <span className="text-xs font-bold text-slate-700">{jd.tone || 'Professional'}</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Industry</span>
                    <span className="text-xs font-bold text-slate-700">{jd.industry || 'Technology'}</span>
                  </div>
                </div>
              </div>

              {/* Required & Preferred Competencies */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Required Core Competencies ({jd.required_skills?.length || 0})
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {jd.required_skills?.map((skill, idx) => (
                      <span key={idx} className="bg-indigo-50 text-indigo-700 text-xs px-3 py-1 rounded-xl border border-indigo-200 font-semibold">
                        ★ {skill}
                      </span>
                    ))}
                  </div>
                </div>

                {jd.preferred_skills && jd.preferred_skills.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Preferred / Bonus Skills
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {jd.preferred_skills.map((skill, idx) => (
                        <span key={idx} className="bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded-xl border border-slate-200 font-medium">
                          + {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 5-Pillar Candidate Scoring Rubric Framework */}
              <div className="p-5 rounded-2xl bg-indigo-50/40 border border-indigo-100 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-xs uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    Autonomous 5-Pillar Scoring Rubric
                  </h3>
                  <span className="text-[10px] font-bold text-indigo-600 bg-white px-2 py-0.5 rounded-full border border-indigo-200">
                    Active Algorithm
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Every ingested candidate resume is automatically parsed, cross-referenced with vector embeddings, and scored against these 5 weighted dimensions:
                </p>

                <div className="space-y-2.5 pt-1">
                  {[
                    { title: 'Technical Stack Proficiency', weight: '35%', desc: 'Match percentage across required frameworks, languages, and technical dependencies.' },
                    { title: 'Experience & Seniority Alignment', weight: '25%', desc: `Target threshold: ${jd.experience_years}+ years relevant domain history.` },
                    { title: 'System Architecture & Problem Solving', weight: '15%', desc: 'Demonstrated capacity for scalable design, complexity, and tooling.' },
                    { title: 'Communication & Leadership Signals', weight: '15%', desc: 'Cross-functional collaboration, mentorship, and articulate documentation.' },
                    { title: 'Domain Credentials & Education', weight: '10%', desc: 'Degrees, professional certifications, and industry standards compliance.' },
                  ].map((pillar, idx) => (
                    <div key={idx} className="p-3 bg-white rounded-xl border border-indigo-100/80 flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{pillar.title}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">{pillar.desc}</p>
                      </div>
                      <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg shrink-0">
                        {pillar.weight}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center shadow-sm space-y-4">
              <Briefcase className="w-12 h-12 text-slate-300 mx-auto" />
              <h2 className="text-base font-bold text-slate-800">No Job Requisition Configured</h2>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                Provide a Job Description using the form on the right to extract structured skills, seniority criteria, and initiate candidate rubric scoring.
              </p>
            </div>
          )}
        </div>

        {/* Right Column (5 cols): Job Description Ingestion Form */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm space-y-5">
            <div>
              <h3 className="text-sm font-black text-slate-900">
                {jd ? 'Update / Replace Position' : 'Set Up New Position'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Paste raw JD text or upload a document to structure with AI
              </p>
            </div>

            {/* Ingestion Mode Switcher */}
            <div className="flex p-1 bg-slate-100 rounded-2xl">
              <button
                type="button"
                onClick={() => setInputMode('text')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  inputMode === 'text' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText className="w-3.5 h-3.5" /> Paste JD Text
              </button>
              <button
                type="button"
                onClick={() => setInputMode('upload')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  inputMode === 'upload' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5" /> Upload File
              </button>
            </div>

            {inputMode === 'text' ? (
              <form onSubmit={handleUploadText} className="space-y-4">
                <textarea
                  rows={10}
                  placeholder="Paste complete Job Description here... E.g., Senior Fullstack Engineer. Required skills: Next.js, FastAPI, PostgreSQL, AWS. Minimum 5 years experience..."
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition leading-relaxed custom-scrollbar"
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !jdText.trim()}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-2xl transition flex items-center justify-center gap-2 shadow-sm"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isSubmitting ? 'Analyzing & Structuring...' : 'Extract Rubrics & Save Spec'}</span>
                </button>
              </form>
            ) : (
              <div className="p-8 border-2 border-dashed border-slate-200 hover:border-indigo-300 rounded-2xl text-center space-y-3 transition">
                <UploadCloud className="w-10 h-10 text-indigo-500 mx-auto" />
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Select Job Description Document</h4>
                  <p className="text-[11px] text-slate-400 mt-1">Supports PDF, DOCX, or TXT</p>
                </div>
                <label className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold hover:bg-indigo-100 transition cursor-pointer">
                  <Plus className="w-3.5 h-3.5" /> Choose File
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    className="hidden"
                    disabled={isSubmitting}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleUploadFile(e.target.files[0]);
                      }
                    }}
                  />
                </label>
                {isSubmitting && (
                  <p className="text-xs text-indigo-600 font-medium">Processing document...</p>
                )}
              </div>
            )}
          </div>

          {/* Quick link to Candidate Pipeline */}
          {jd && (
            <div className="p-5 bg-gradient-to-br from-indigo-50 to-white rounded-3xl border border-indigo-100 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-indigo-950">Next: Screen Ingested Talent</h4>
                <p className="text-[11px] text-indigo-600/80">View candidate fit rankings against this spec</p>
              </div>
              <Link
                href="/dashboard/candidates"
                className="px-3.5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition flex items-center gap-1.5 shadow-sm"
              >
                Pipeline <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
