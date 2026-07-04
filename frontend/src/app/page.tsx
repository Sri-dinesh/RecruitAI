'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  Send, User, Bot, Briefcase, Users, Database, 
  Cpu, Activity, Clock, Terminal, FileText
} from 'lucide-react';
import MarkdownText from '../components/MarkdownText';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Candidate {
  candidate_id: string;
  name: string;
  match_score: number;
  matched_skills: string[];
  gaps: string[];
}

interface JobDescription {
  role: string;
  required_skills: string[];
  experience_years: number;
  tone: string;
}

interface RouterLog {
  turn: number;
  node: string;
  intent: string;
  confidence: number;
  provider: string;
  latency_ms: number;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hello! I am **RecruitAI**, your AI recruiting assistant. Start by loading a job description and candidate resumes."
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  
  // Recruitment states synchronized from backend
  const [jd, setJd] = useState<JobDescription | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [lastShortlist, setLastShortlist] = useState<Candidate[] | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<any>(null);
  const [lastIntent, setLastIntent] = useState<string | null>(null);
  const [routerLogs, setRouterLogs] = useState<RouterLog[]>([]);
  
  // PDF & In-App Report States
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportQs, setReportQs] = useState("");
  const [reportSalary, setReportSalary] = useState("");

  const chatEndRef = useRef<HTMLDivElement>(null);

  const openReportPreview = () => {
    let interviewQs = "";
    let salaryInfo = "";
    
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant') {
        if (!interviewQs && (msg.content.includes("Interview Prep Questions") || msg.content.includes("interview_questions") || msg.content.includes("Interview questions") || msg.content.includes("Interview prep questions"))) {
          interviewQs = msg.content;
        }
        if (!salaryInfo && (msg.content.includes("Salary Benchmark") || msg.content.includes("salary range") || msg.content.includes("Salary expectations") || msg.content.includes("salary benchmark"))) {
          salaryInfo = msg.content;
        }
      }
    }
    setReportQs(interviewQs || "No interview questions generated yet. Ask: 'Generate prep questions for the top candidate'.");
    setReportSalary(salaryInfo || "No salary benchmark queries performed. Ask: 'What is the average salary range for this role?'.");
    setShowReportModal(true);
  };

  const downloadPdfReport = async () => {
    try {
      setLoading(true);
      let interviewQs = "";
      let salaryInfo = "";
      
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === 'assistant') {
          if (!interviewQs && (msg.content.includes("Interview Prep Questions") || msg.content.includes("interview_questions") || msg.content.includes("Interview questions") || msg.content.includes("Interview prep questions"))) {
            interviewQs = msg.content;
          }
          if (!salaryInfo && (msg.content.includes("Salary Benchmark") || msg.content.includes("salary range") || msg.content.includes("Salary expectations") || msg.content.includes("salary benchmark"))) {
            salaryInfo = msg.content;
          }
        }
      }
      
      const res = await fetch('http://127.0.0.1:8000/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jd: jd,
          shortlist: lastShortlist || candidates,
          interview_questions: interviewQs || "No questions generated.",
          salary_data: salaryInfo || "No salary data benchmarks available."
        })
      });

      if (!res.ok) throw new Error("Report generation failed");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Recruitment_Report_${jd?.role || 'Position'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Failed to download PDF report. Make sure the backend server is running.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Test backend connection on mount
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const res = await fetch('http://127.0.0.1:8000/');
        if (res.ok) setApiConnected(true);
      } catch (err) {
        setApiConnected(false);
      }
    };
    checkConnection();
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, []);

  // Send message to FastAPI agent
  const handleSend = async (text: string) => {
    if (!text.trim() || loading) return;

    setLoading(true);
    setInput('');
    
    // Optimistic user update
    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);

    try {
      const res = await fetch('http://127.0.0.1:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversation_history: messages,
          jd_structured: jd,
          resumes: candidates,
          last_shortlist: lastShortlist,
          pending_confirmation: pendingConfirmation,
          last_intent: lastIntent
        })
      });

      if (!res.ok) {
        throw new Error('API server returned an error');
      }

      const data = await res.json();
      
      // Update app states from backend response
      setJd(data.jd_structured);
      setCandidates(data.resumes || []);
      setLastShortlist(data.last_shortlist);
      setPendingConfirmation(data.pending_confirmation);
      setLastIntent(data.last_intent);
      setRouterLogs(data.router_logs || []);

      // Append assistant message
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "⚠️ **System Connection Error**: I was unable to connect to the backend agent server. Please make sure the FastAPI server is running on `http://127.0.0.1:8000`." 
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestion = (prompt: string) => {
    handleSend(prompt);
  };

  const clearChat = () => {
    setMessages([
      {
        role: 'assistant',
        content: "Chat history cleared. Let me know what you want to do next!"
      }
    ]);
    setJd(null);
    setCandidates([]);
    setLastShortlist(null);
    setPendingConfirmation(null);
    setLastIntent(null);
    setRouterLogs([]);
  };

  return (
    <main className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
      {/* 1. LEFT PANEL: Workspace Context (JD & Candidates) */}
      <section className="w-80 border-r border-slate-800 bg-slate-900/50 p-4 flex flex-col gap-4 overflow-y-auto">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Database className="w-5 h-5 text-emerald-500" />
          <h2 className="font-bold text-sm uppercase tracking-wider text-slate-300">Workspace Data</h2>
        </div>

        {/* ACTIVE JOB DESCRIPTION */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-md flex flex-col gap-2.5">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs uppercase tracking-wider">
            <Briefcase className="w-3.5 h-3.5" />
            <span>Active Job Details</span>
          </div>
          {jd ? (
            <div className="flex flex-col gap-1.5">
              <h3 className="font-bold text-slate-100 text-sm">{jd.role}</h3>
              <p className="text-xs text-slate-400">Experience: <span className="text-slate-200 font-medium">{jd.experience_years}+ years</span></p>
              <p className="text-xs text-slate-400">Tone: <span className="text-slate-200 font-medium capitalize">{jd.tone}</span></p>
              <div className="flex flex-wrap gap-1 mt-1">
                {jd.required_skills && jd.required_skills.map((skill, idx) => (
                  <span key={idx} className="bg-emerald-950/80 text-emerald-300 text-[10px] px-1.5 py-0.5 rounded border border-emerald-800/40">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-2">No Job Description loaded yet. Run "load job description senior_fullstack_engineer.txt..."</p>
          )}
        </div>

        {/* CANDIDATES SCREENED */}
        <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-md flex flex-col gap-2.5 min-h-[250px]">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs uppercase tracking-wider">
            <Users className="w-3.5 h-3.5" />
            <span>Resumes Screened ({candidates.length})</span>
          </div>
          {candidates.length > 0 ? (
            <div className="flex flex-col gap-2 overflow-y-auto max-h-[400px] pr-1">
              {candidates.map((c, idx) => {
                const scoreColor = c.match_score >= 80 ? 'text-emerald-400 border-emerald-900 bg-emerald-950/20' : 
                                   c.match_score >= 50 ? 'text-amber-400 border-amber-900 bg-amber-950/20' : 
                                   'text-rose-400 border-rose-900 bg-rose-950/20';
                return (
                  <div key={idx} className="p-2 border border-slate-800 bg-slate-950 rounded-lg flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200 text-xs truncate max-w-[130px]">{c.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${scoreColor}`}>
                        {c.match_score}/100
                      </span>
                    </div>
                    {c.matched_skills && c.matched_skills.length > 0 && (
                      <p className="text-[10px] text-slate-400 truncate">
                        Matches: <span className="text-emerald-400">{c.matched_skills.join(', ')}</span>
                      </p>
                    )}
                    {c.gaps && c.gaps.length > 0 && (
                      <p className="text-[10px] text-slate-400 truncate">
                        Gaps: <span className="text-rose-400">{c.gaps.join(', ')}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-6 text-center">No candidates screened yet.</p>
          )}
        </div>
      </section>

      {/* 2. CENTER PANEL: Chat Interface */}
      <section className="flex-1 flex flex-col bg-slate-950 relative">
        {/* Chat Header */}
        <header className="h-16 border-b border-slate-800 px-6 flex items-center justify-between bg-slate-900/20 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Cpu className="w-6 h-6 text-emerald-500 animate-pulse" />
            <div>
              <h1 className="font-black text-sm tracking-tight text-white uppercase">RecruitAI Recruitment Co-Pilot</h1>
              <p className="text-[10px] text-slate-400">Multi-Agent LangGraph System</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded-full border border-slate-800 text-[10px]">
              <span className={`w-2 h-2 rounded-full ${apiConnected ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`} />
              <span className="text-slate-300 font-medium">{apiConnected ? 'API Connected' : 'API Offline'}</span>
            </div>
            <button 
              onClick={openReportPreview}
              className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded-lg transition"
            >
              Report Preview
            </button>
            <button 
              onClick={clearChat}
              className="text-[10px] border border-slate-800 hover:border-slate-700 bg-slate-950 text-slate-400 hover:text-white px-3 py-1 rounded-lg transition"
            >
              Clear Session
            </button>
          </div>
        </header>

        {/* Message Window */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-4xl mx-auto w-full">
          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            return (
              <div 
                key={idx} 
                className={`flex gap-3.5 max-w-[85%] ${isUser ? 'ml-auto flex-row-reverse' : ''}`}
              >
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${
                  isUser ? 'bg-emerald-950 border-emerald-800 text-emerald-400' : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}>
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                {/* Bubble Container */}
                <div className={`p-4 rounded-2xl border shadow-sm ${
                  isUser 
                    ? 'bg-emerald-950/20 border-emerald-900/60 text-emerald-100 rounded-tr-none' 
                    : 'bg-slate-900/40 border-slate-800/80 text-slate-200 rounded-tl-none'
                }`}>
                  <MarkdownText text={msg.content} />
                </div>
              </div>
            );
          })}
          
          {loading && (
            <div className="flex gap-3.5 max-w-[85%]">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-slate-900 border border-slate-800 text-slate-400">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-4 rounded-2xl border border-slate-800/80 bg-slate-900/40 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          
          <div ref={chatEndRef} />
        </div>

        {/* Input Bar & Suggestions */}
        <div className="border-t border-slate-800 bg-slate-900/20 backdrop-blur-md p-4 max-w-4xl mx-auto w-full flex flex-col gap-3">
          {/* Suggestion Chips */}
          <div className="flex flex-wrap gap-1.5">
            <button 
              onClick={() => handleSuggestion("Load job description backend/data/jds/senior_fullstack_engineer.txt and resumes from backend/data/resumes")}
              className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-2 py-1 rounded-full transition"
            >
              🚀 Ingest JD & Resumes
            </button>
            <button 
              onClick={() => handleSuggestion("Screen candidates matching the job description")}
              className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-2 py-1 rounded-full transition"
            >
              🔍 Screen Candidates
            </button>
            <button 
              onClick={() => handleSuggestion("Generate prep questions for the top candidate")}
              className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-2 py-1 rounded-full transition"
            >
              ❓ Interview Prep Questions
            </button>
            <button 
              onClick={() => handleSuggestion("What is the average salary range for this role in India?")}
              className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-2 py-1 rounded-full transition"
            >
              💰 Salary Expectations
            </button>
            <button 
              onClick={() => handleSuggestion("Finalize the shortlist")}
              className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-2 py-1 rounded-full transition"
            >
              🔒 Finalize Shortlist
            </button>
          </div>

          {/* Form */}
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
            className="flex gap-2 relative bg-slate-950 border border-slate-800 focus-within:border-emerald-500/50 rounded-xl p-1.5 transition shadow-inner"
          >
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask RecruitAI to screen candidates, rewrite JDs, generate questions..."
              className="flex-1 bg-transparent px-3 py-2 text-sm border-none outline-none focus:ring-0 text-slate-200 placeholder-slate-500"
              disabled={loading}
            />
            <button 
              type="submit"
              disabled={!input.trim() || loading}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white rounded-lg p-2.5 transition shrink-0 shadow-md"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </section>

      {/* 3. RIGHT PANEL: Decision Trace Logs */}
      <section className="w-80 border-l border-slate-800 bg-slate-900/50 p-4 flex flex-col gap-4 overflow-y-auto">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Terminal className="w-5 h-5 text-emerald-500" />
          <h2 className="font-bold text-sm uppercase tracking-wider text-slate-300">Router Trace Logs</h2>
        </div>

        {/* DECISION TIMELINE */}
        {routerLogs.length > 0 ? (
          <div className="flex flex-col gap-3">
            {routerLogs.map((log, idx) => (
              <div 
                key={idx} 
                className="bg-slate-900 border border-slate-800/80 rounded-xl p-3 shadow-md hover:border-slate-700 transition flex flex-col gap-2"
              >
                {/* Timeline Header */}
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 uppercase">
                    <Activity className="w-3.5 h-3.5" />
                    <span>Turn {log.turn}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium font-mono">{log.node}</span>
                </div>
                
                {/* Trace Metrics */}
                <div className="flex flex-col gap-1 text-[11px] text-slate-400">
                  <div className="flex justify-between">
                    <span>Intent Classified:</span>
                    <span className="font-bold text-slate-200 capitalize">{log.intent}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Confidence:</span>
                    <span className="font-mono font-semibold text-amber-400">{(log.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>LLM Provider:</span>
                    <span className="font-medium text-slate-200 capitalize">{log.provider || 'Rule Engine'}</span>
                  </div>
                  <div className="flex justify-between items-center mt-0.5 pt-1 border-t border-slate-800/40">
                    <span className="flex items-center gap-1 text-[10px] text-slate-500">
                      <Clock className="w-3 h-3" />
                      Latency
                    </span>
                    <span className="font-mono text-emerald-500 font-semibold">{log.latency_ms} ms</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 p-6 border border-dashed border-slate-800 rounded-xl bg-slate-900/10">
            <Cpu className="w-8 h-8 text-slate-700" />
            <p className="text-xs text-slate-500 italic">No traces recorded. Interactions will log turn decisions here.</p>
          </div>
        )}
      </section>

      {/* 4. IN-APP REPORT PREVIEW MODAL */}
      {showReportModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-500" />
                <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-100">Recruitment Summary Report</h3>
              </div>
              <button 
                onClick={() => setShowReportModal(false)}
                className="text-slate-400 hover:text-white transition text-xs font-semibold px-2 py-1 bg-slate-800/60 rounded"
              >
                Close Preview
              </button>
            </div>
            
            {/* Modal Content (In-App Preview) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-300">
              {/* Position Info */}
              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4">
                <h4 className="font-bold text-slate-200 text-xs uppercase tracking-wider mb-2 text-emerald-400">1. Position target requirements</h4>
                {jd ? (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-slate-500">Target Role:</span> <strong className="text-slate-100">{jd.role}</strong></div>
                    <div><span className="text-slate-500">Experience Required:</span> <strong className="text-slate-100">{jd.experience_years}+ years</strong></div>
                    <div><span className="text-slate-500">JD Tone & Culture:</span> <strong className="text-slate-100 capitalize">{jd.tone}</strong></div>
                    <div><span className="text-slate-500">Core Skills:</span> <strong className="text-slate-100">{jd.required_skills?.join(', ') || 'None'}</strong></div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No Position target loaded.</p>
                )}
              </div>

              {/* Candidates Table */}
              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4">
                <h4 className="font-bold text-slate-200 text-xs uppercase tracking-wider mb-2 text-emerald-400">2. Shortlist Assessment</h4>
                {(lastShortlist || candidates).length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/30">
                          <th className="py-2 px-3 font-semibold">Candidate Name</th>
                          <th className="py-2 px-3 font-semibold">Match Score</th>
                          <th className="py-2 px-3 font-semibold">Matched Skills</th>
                          <th className="py-2 px-3 font-semibold">Gaps Identified</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(lastShortlist || candidates).map((c, idx) => {
                          const scoreColor = c.match_score >= 80 ? 'text-emerald-400 font-bold' : 
                                             c.match_score >= 50 ? 'text-amber-400 font-bold' : 
                                             'text-rose-400 font-bold';
                          return (
                            <tr key={idx} className="border-b border-slate-900/60 hover:bg-slate-900/20">
                              <td className="py-2.5 px-3 text-slate-200">{c.name}</td>
                              <td className={`py-2.5 px-3 ${scoreColor}`}>{c.match_score}/100</td>
                              <td className="py-2.5 px-3 text-slate-400">{c.matched_skills?.join(', ') || 'None'}</td>
                              <td className="py-2.5 px-3 text-slate-400">{c.gaps?.join(', ') || 'None'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No candidates screened or shortlisted yet.</p>
                )}
              </div>

              {/* Salary Data */}
              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4">
                <h4 className="font-bold text-slate-200 text-xs uppercase tracking-wider mb-2 text-emerald-400">3. Market Salary expectations</h4>
                <MarkdownText text={reportSalary} />
              </div>

              {/* Interview prep questions */}
              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4">
                <h4 className="font-bold text-slate-200 text-xs uppercase tracking-wider mb-2 text-emerald-400">4. Interview prep questions</h4>
                <MarkdownText text={reportQs} />
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-3 bg-slate-950/50">
              <button 
                onClick={() => setShowReportModal(false)}
                className="text-xs border border-slate-800 hover:border-slate-700 bg-slate-950 text-slate-400 hover:text-white px-4 py-2 rounded-lg transition"
              >
                Cancel
              </button>
              <button 
                onClick={downloadPdfReport}
                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-lg transition flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5 rotate-90" />
                Download PDF Report
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
