'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  Send, User, Bot, Briefcase, Users, Database, 
  Cpu, Activity, Clock, Terminal
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

  const chatEndRef = useRef<HTMLDivElement>(null);

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

    </main>
  );
}
