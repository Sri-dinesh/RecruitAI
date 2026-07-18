'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  Send, User, Bot, Briefcase, Users, Database, 
  Cpu, Activity, Clock, Terminal, FileText, Paperclip,
  Calendar, Mail, AlertTriangle, CheckCircle,
  Trash2, ArrowRight, Check, X,
  Sliders, Search, Sparkles
} from 'lucide-react';
import MarkdownText from '../components/MarkdownText';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Candidate {
  candidate_id: string;
  name: string;
  match_score?: number;
  matched_skills?: string[];
  gaps?: string[];
  experience_years?: number;
  red_flags?: string[];
}

interface JobDescription {
  role: string;
  required_skills: string[];
  experience_years: number;
  tone: string;
  raw_text?: string;
}

interface RouterLog {
  turn: number;
  node: string;
  intent: string;
  confidence: number;
  provider: string;
  latency_ms: number;
}

interface PendingConfirmation {
  action: string;
  candidate_name?: string;
  role?: string;
  slots?: { slot_number: number; label: string }[];
  payload?: unknown;
}

interface ScheduledInterview {
  candidate_name: string;
  slot: string;
  booked_at?: string;
}

interface Session {
  id: string;
  title: string;
  created_at?: string;
  jd_structured?: JobDescription | null;
  resumes?: Candidate[];
  last_shortlist?: Candidate[] | null;
  pending_confirmation?: PendingConfirmation | null;
  last_intent?: string | null;
  scheduled_interviews?: ScheduledInterview[] | null;
  conversation_history?: Message[] | null;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hello! I am **RecruitAI**, your AI recruiting assistant. Start by loading a job description and candidate resumes, or select one of the quick start options below."
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  const [candidateFilter, setCandidateFilter] = useState('');

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Mobile responsive layout states
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  
  // Recruitment states synchronized from backend
  const [jd, setJd] = useState<JobDescription | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [lastShortlist, setLastShortlist] = useState<Candidate[] | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [lastIntent, setLastIntent] = useState<string | null>(null);
  const [routerLogs, setRouterLogs] = useState<RouterLog[]>([]);
  const [scheduledInterviews, setScheduledInterviews] = useState<ScheduledInterview[]>([]);

  const handleLoadSessionsList = async () => {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const list = await res.json();
        setSessions(list);
        return list;
      }
    } catch (err) {
      console.error(err);
    }
    return [];
  };

  const handleSelectSession = async (sessionId: string) => {
    setActiveSessionId(sessionId);
    localStorage.setItem('recruitai_session_id', sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (!res.ok) return;
      const data = await res.json();
      
      setJd(data.jd_structured);
      setCandidates(data.resumes || []);
      setLastShortlist(data.last_shortlist);
      setPendingConfirmation(data.pending_confirmation);
      setLastIntent(data.last_intent);
      setScheduledInterviews(data.scheduled_interviews || []);
      
      setRouterLogs([]);
      setSelectedCandidates(new Set());
      setEmailStatus(null);
      setDraftBody("");
      setDraftSubject("");
      setDraftRecipient("");

      if (data.conversation_history && data.conversation_history.length > 0) {
        setMessages(data.conversation_history);
      } else {
        setMessages([
          {
            role: 'assistant',
            content: "Hello! I am **RecruitAI**, your AI recruiting assistant. Start by loading a job description and candidate resumes, or select one of the quick start options below."
          }
        ]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateSession = async () => {
    try {
      const res = await fetch('/api/sessions', { method: 'POST' });
      if (res.ok) {
        const newSession = await res.json();
        setSessions(prev => [newSession, ...prev]);
        handleSelectSession(newSession.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (res.ok) {
        const list = sessions.filter(s => s.id !== sessionId);
        setSessions(list);
        if (activeSessionId === sessionId) {
          if (list.length > 0) {
            handleSelectSession(list[0].id);
          } else {
            const newRes = await fetch('/api/sessions', { method: 'POST' });
            if (newRes.ok) {
              const newS = await newRes.json();
              setSessions([newS]);
              handleSelectSession(newS.id);
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Right Workspace Navigation & Selections
  const [activeTab, setActiveTab] = useState<'diagnostics' | 'comparison' | 'scheduler' | 'email'>('diagnostics');
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());

  // Email draft states
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftRecipient, setDraftRecipient] = useState("");
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  
  // PDF & In-App Report States
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportQs, setReportQs] = useState("");
  const [reportSalary, setReportSalary] = useState("");

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Test backend connection and load sessions on mount
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) setApiConnected(true);
      } catch {
        setApiConnected(false);
      }
    };
    checkConnection();
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const initSessions = async () => {
      try {
        const res = await fetch('/api/sessions');
        if (!res.ok) return;
        const list = await res.json();
        setSessions(list);

        const storedId = localStorage.getItem('recruitai_session_id');
        if (storedId && list.some((s: Session) => s.id === storedId)) {
          handleSelectSession(storedId);
        } else if (list.length > 0) {
          handleSelectSession(list[0].id);
        } else {
          // Create default first session
          const newSessionRes = await fetch('/api/sessions', { method: 'POST' });
          if (newSessionRes.ok) {
            const newSession = await newSessionRes.json();
            setSessions([newSession]);
            handleSelectSession(newSession.id);
          }
        }
      } catch (err) {
        console.error("Failed to initialize sessions:", err);
      }
    };
    initSessions();
  }, []);

  // Intercept messages to dynamically switch tabs and prepopulate widgets
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'assistant') return;

    const timer = setTimeout(() => {
      // 1. Detect Email draft
      if (lastMsg.content.includes('✉️ Email Draft:')) {
        const codeBlockMatch = lastMsg.content.match(/```([\s\S]*?)```/);
        if (codeBlockMatch) {
          const draftText = codeBlockMatch[1].trim();
          const subjectMatch = draftText.match(/^Subject:\s*(.*)$/m);
          const subject = subjectMatch ? subjectMatch[1] : "Interview Invitation";
          const body = draftText.replace(/^Subject:\s*.*$/m, '').trim();
          
          setDraftSubject(subject);
          setDraftBody(body);
          
          // Extract recipient email
          const nameMatch = lastMsg.content.match(/\*\*([A-Za-z\s]+)\*\*/);
          const name = nameMatch ? nameMatch[1] : "Candidate";
          setDraftRecipient(name.toLowerCase().replace(/\s+/g, '_') + "@example.com");
          setEmailStatus(null);
          setActiveTab('email');
        }
      }

      // 2. Detect Schedule slots
      if (lastMsg.content.includes('📅 Interview Slots') || lastMsg.content.includes('Interview Slots for')) {
        setActiveTab('scheduler');
      }

      // 3. Detect Comparison Table
      if (lastMsg.content.includes('📊 Candidate Comparison Table') || lastMsg.content.includes('Candidate Comparison Table')) {
        setActiveTab('comparison');
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [messages]);

  // File upload state & handlers
  const handleJdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setLoading(true);
    
    const formData = new FormData();
    formData.append('file', files[0]);
    
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `⏳ **Ingesting Job Description...** parsing raw file and structuring schema fields.`
    }]);
    
    try {
      const res = await fetch('/api/ingest/upload-jd', {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Job Description upload ingestion failed');
      }
      
      const structuredJd = await res.json();
      setJd(structuredJd);
      
      const successMsg = {
        role: 'assistant' as const,
        content: `✅ **JD Ingestion Success**: Loaded Job Description for **${structuredJd.role}** (${structuredJd.experience_years}+ years experience, skills: ${structuredJd.required_skills.join(', ')}).`
      };
      
      setMessages(prev => [...prev.slice(0, -1), successMsg]);
      
      // Persist JD to session
      const storedId = localStorage.getItem('recruitai_session_id');
      if (storedId) {
        await fetch(`/api/sessions/${storedId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jd_structured: structuredJd,
            title: `Hiring: ${structuredJd.role}`,
            conversation_history: [...messages, successMsg]
          })
        });
        handleLoadSessionsList();
      }
    } catch (err) {
      console.error(err);
      const error = err as Error;
      setMessages(prev => [
        ...prev.slice(0, -1),
        {
          role: 'assistant',
          content: `❌ **JD Ingestion Failed**: ${error.message || 'An error occurred during JD upload.'}`
        }
      ]);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setLoading(true);
    
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `⏳ **Ingesting Resumes...** uploading ${files.length} resume(s) for live parsing and vector database storage.`
    }]);
    
    try {
      const res = await fetch('/api/ingest/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Resume upload ingestion failed');
      }
      
      const newCandidates = await res.json();
      
      let updatedCandidates: Candidate[] = [];
      setCandidates(prev => {
        const existingIds = new Set(prev.map(c => c.candidate_id));
        const filteredNew = newCandidates.filter((c: Candidate) => !existingIds.has(c.candidate_id));
        updatedCandidates = [...prev, ...filteredNew];
        return updatedCandidates;
      });
      
      const names = newCandidates.map((c: Candidate) => c.name).join(', ');
      const successMsg = {
        role: 'assistant' as const,
        content: `✅ **Ingestion Success**: Successfully parsed and embedded ${newCandidates.length} candidate(s): **${names}**.`
      };
      
      setMessages(prev => [...prev.slice(0, -1), successMsg]);
      
      const storedId = localStorage.getItem('recruitai_session_id');
      if (storedId) {
        await fetch(`/api/sessions/${storedId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resumes: updatedCandidates,
            conversation_history: [...messages, successMsg]
          })
        });
      }
    } catch (err) {
      console.error(err);
      const error = err as Error;
      setMessages(prev => [
        ...prev.slice(0, -1),
        {
          role: 'assistant',
          content: `❌ **Ingestion Failed**: ${error.message || 'An error occurred during file upload.'}`
        }
      ]);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setLoading(true);
    
    const firstFileName = files[0].name.toLowerCase();
    const isJdUpload = files.length === 1 && (
      firstFileName.includes('jd') || 
      firstFileName.includes('job') || 
      firstFileName.includes('description')
    );
    
    if (isJdUpload) {
      const formData = new FormData();
      formData.append('file', files[0]);
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⏳ **Ingesting Job Description...** parsing raw file and structuring schema fields.`
      }]);
      
      try {
        const res = await fetch('/api/ingest/upload-jd', {
          method: 'POST',
          body: formData
        });
        
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || 'Job Description upload ingestion failed');
        }
        
        const structuredJd = await res.json();
        setJd(structuredJd);
        
        const successMsg = {
          role: 'assistant' as const,
          content: `✅ **JD Ingestion Success**: Loaded Job Description for **${structuredJd.role}** (${structuredJd.experience_years}+ years experience, skills: ${structuredJd.required_skills.join(', ')}).`
        };
        
        setMessages(prev => [...prev.slice(0, -1), successMsg]);
        
        // Persist JD to session
        const storedId = localStorage.getItem('recruitai_session_id');
        if (storedId) {
          await fetch(`/api/sessions/${storedId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jd_structured: structuredJd,
              title: `Hiring: ${structuredJd.role}`,
              conversation_history: [...messages, successMsg]
            })
          });
          handleLoadSessionsList();
        }
      } catch (err) {
        console.error(err);
        const error = err as Error;
        setMessages(prev => [
          ...prev.slice(0, -1),
          {
            role: 'assistant',
            content: `❌ **JD Ingestion Failed**: ${error.message || 'An error occurred during JD upload.'}`
          }
        ]);
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } else {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⏳ **Ingesting Resumes...** uploading ${files.length} resume(s) for live parsing and pgvector vector storage.`
      }]);
      
      try {
        const res = await fetch('/api/ingest/upload', {
          method: 'POST',
          body: formData
        });
        
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || 'Resume upload ingestion failed');
        }
        
        const newCandidates = await res.json();
        
        let updatedCandidates: Candidate[] = [];
        setCandidates(prev => {
          const existingIds = new Set(prev.map(c => c.candidate_id));
          const filteredNew = newCandidates.filter((c: Candidate) => !existingIds.has(c.candidate_id));
          updatedCandidates = [...prev, ...filteredNew];
          return updatedCandidates;
        });
        
        const names = newCandidates.map((c: Candidate) => c.name).join(', ');
        const successMsg = {
          role: 'assistant' as const,
          content: `✅ **Ingestion Success**: Successfully parsed and embedded ${newCandidates.length} candidate(s): **${names}**.`
        };
        
        setMessages(prev => [...prev.slice(0, -1), successMsg]);
        
        // Persist updated candidate list and conversation history to session
        const storedId = localStorage.getItem('recruitai_session_id');
        if (storedId) {
          await fetch(`/api/sessions/${storedId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              resumes: updatedCandidates,
              conversation_history: [...messages, successMsg]
            })
          });
        }
      } catch (err) {
        console.error(err);
        const error = err as Error;
        setMessages(prev => [
          ...prev.slice(0, -1),
          {
            role: 'assistant',
            content: `❌ **Ingestion Failed**: ${error.message || 'An error occurred during file upload.'}`
          }
        ]);
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

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
      
      const res = await fetch('/api/reports/generate', {
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
      alert("Failed to download PDF report.");
    } finally {
      setLoading(false);
    }
  };

  // Send message to FastAPI agent
  const handleSend = async (text: string) => {
    if (!text.trim() || loading) return;

    setLoading(true);
    setInput('');
    
    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversation_history: messages,
          jd_structured: jd,
          resumes: candidates,
          last_shortlist: lastShortlist,
          pending_confirmation: pendingConfirmation,
          last_intent: lastIntent,
          scheduled_interviews: scheduledInterviews,
          session_id: activeSessionId
        }),
        signal: controller.signal
      });

      if (!res.ok) throw new Error('API server returned an error');

      const data = await res.json();
      
      setJd(data.jd_structured);
      setCandidates(data.resumes || []);
      setLastShortlist(data.last_shortlist);
      setPendingConfirmation(data.pending_confirmation);
      setLastIntent(data.last_intent);
      setRouterLogs(data.router_logs || []);
      setScheduledInterviews(data.scheduled_interviews || []);

      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      handleLoadSessionsList();
    } catch (err) {
      const error = err as Error;
      if (error.name === 'AbortError') {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: "🛑 **Task Cancelled**: The user stopped the current query execution." 
        }]);
      } else {
        console.error(err);
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: "⚠️ **System Connection Error**: I was unable to connect to the backend agent server. Please make sure the backend agent server is running." 
        }]);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleSuggestion = (prompt: string) => {
    handleSend(prompt);
  };

  const toggleCandidateSelect = (cid: string) => {
    const next = new Set(selectedCandidates);
    if (next.has(cid)) {
      next.delete(cid);
    } else {
      next.add(cid);
    }
    setSelectedCandidates(next);
  };

  const handleSendEmailSimulation = async () => {
    if (!draftRecipient || !draftBody) return;
    setLoading(true);
    setEmailStatus(null);
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_draft: `Subject: ${draftSubject}\n\n${draftBody}`,
          recipient_email: draftRecipient
        })
      });

      if (!res.ok) throw new Error('Failed to send email outreach');

      const data = await res.json();
      setEmailStatus(data.status);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `✉️ **Email Outreach Dispatch Output**:\n\n${data.status}`
      }]);
    } catch (err) {
      console.error(err);
      const error = err as Error;
      setEmailStatus("Failed to send email draft.");
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ **Failed to send email outreach**: ${error.message || 'Server error'}`
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSlot = (slotNo: number) => {
    handleSend(`slot ${slotNo}`);
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
    setScheduledInterviews([]);
    setSelectedCandidates(new Set());
  setEmailStatus(null);
  };

  const filteredCandidates = candidates.filter(c => 
    c.name.toLowerCase().includes(candidateFilter.toLowerCase()) ||
    (c.matched_skills && c.matched_skills.some(s => s.toLowerCase().includes(candidateFilter.toLowerCase())))
  );

  return (
    <main className="flex h-screen w-screen bg-transparent text-foreground overflow-hidden font-sans select-none relative">
      
      {/* SESSIONS SIDEBAR (FAR LEFT) */}
      {isSidebarOpen && (
        <>
          {/* Backdrop on mobile/tablet */}
          <div 
            className="fixed inset-0 bg-black/60 z-40 lg:hidden animate-in fade-in"
            onClick={() => setIsSidebarOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-[230px] border-r border-slate-200 bg-white  flex flex-col shrink-0 lg:relative lg:translate-x-0">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <span className="font-extrabold text-[10px] uppercase tracking-wider text-slate-500">Conversations</span>
              <button 
                onClick={() => setIsSidebarOpen(false)}
                className="text-slate-500 hover:text-slate-400 transition p-1 hover:bg-slate-50 rounded-lg animate-in fade-in"
                title="Close sidebar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            
            <div className="p-3">
              <button
                onClick={handleCreateSession}
                className="w-full bg-brand-primary hover:bg-indigo-700 text-white py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-sm hover:shadow-sm hover:-translate-y-[1px] active:translate-y-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-white" />
                <span>New Campaign</span>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-4 space-y-1">
              {sessions.map(s => {
                const isActive = s.id === activeSessionId;
                return (
                  <div 
                    key={s.id}
                    onClick={() => {
                      handleSelectSession(s.id);
                      if (window.innerWidth < 1024) setIsSidebarOpen(false);
                    }}
                    className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all text-xs border ${
                      isActive 
                        ? 'bg-indigo-50 border-indigo-200 text-brand-primary font-semibold shadow-sm' 
                        : 'border-transparent text-slate-500 hover:bg-white hover:text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      <Bot className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-brand-primary' : 'text-slate-500'}`} />
                      <span className="truncate">{s.title || 'New Chat'}</span>
                    </div>
                    <button
                      onClick={(e) => handleDeleteSession(s.id, e)}
                      className="text-slate-600 hover:text-brand-rose transition p-1 opacity-0 group-hover:opacity-100 shrink-0 hover:bg-slate-50 rounded"
                      title="Delete Campaign"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </aside>
        </>
      )}

      {/* Sidebar toggle button when closed */}
      {!isSidebarOpen && (
        <div className="absolute left-3 top-3.5 z-40">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2.5 bg-white border border-slate-200 hover:border-slate-200 text-slate-700 rounded-xl shadow-lg transition-all"
            title="Open Conversations"
          >
            <Bot className="w-4 h-4 text-brand-primary" />
          </button>
        </div>
      )}
      
      {/* 1. LEFT WORKSPACE PANEL */}
      {isLeftPanelOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden animate-in fade-in"
          onClick={() => setIsLeftPanelOpen(false)}
        />
      )}
      <section className={`fixed inset-y-0 left-0 z-45 w-80 p-4 flex flex-col gap-4 overflow-y-auto shrink-0 select-text bg-white border border-slate-200 shadow-sm transition-all duration-200 transition-transform duration-300 lg:relative lg:translate-x-0 lg:z-auto lg:border-y-0 lg:border-l-0 lg:border-r lg:border-brand-primary/10 ${
        isLeftPanelOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Database className="w-4.5 h-4.5 text-brand-primary" />
            <h2 className="font-black text-xs uppercase tracking-wider text-slate-700">Workspace Data</h2>
          </div>
          <button 
            onClick={() => setIsLeftPanelOpen(false)}
            className="lg:hidden text-slate-500 hover:text-brand-primary p-1 hover:bg-slate-50 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ACTIVE JOB DESCRIPTION */}
        <div className="bg-white border border-slate-200 shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md rounded-2xl p-4 shadow-lg flex flex-col gap-3">
          <div className="flex items-center justify-between text-brand-primary font-bold text-xs uppercase tracking-wider">
            <div className="flex items-center gap-2">
              <Briefcase className="w-3.5 h-3.5 text-brand-primary" />
              <span>Active Position</span>
            </div>
          </div>
          {jd ? (
            <div className="flex flex-col gap-1.5">
              <h3 className="font-bold text-slate-900 text-sm tracking-tight">{jd.role}</h3>
              <div className="flex justify-between text-xs text-slate-500 pt-0.5">
                <span>Experience target:</span>
                <span className="text-slate-800 font-semibold">{jd.experience_years}+ years</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>Format / Tone:</span>
                <span className="text-slate-800 font-semibold capitalize">{jd.tone}</span>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {jd.required_skills && jd.required_skills.map((skill, idx) => (
                  <span key={idx} className="bg-brand-primary text-white text-[10px] px-2 py-0.5 rounded-lg border border-indigo-200 font-medium">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic py-2">
              No Job Description loaded. Let&apos;s try:
              <button 
                onClick={() => handleSuggestion("load JD backend/data/jds/senior_fullstack_engineer.txt")} 
                className="mt-2 text-brand-primary font-semibold flex items-center gap-1 hover:underline text-left text-[11px]"
              >
                📂 Load Sample JD file
              </button>
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 mt-1 flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Upload Custom JD</span>
            <div className="relative border border-dashed border-slate-200 hover:border-brand-primary rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer transition-all bg-white group">
              <input 
                type="file" 
                accept=".txt,.pdf,.doc,.docx"
                onChange={handleJdUpload} 
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" 
              />
              <Paperclip className="w-4 h-4 text-slate-550 group-hover:text-brand-primary mb-1 transition-colors" />
              <span className="text-[10px] text-slate-500 group-hover:text-slate-800 transition-colors">Choose JD file</span>
            </div>
          </div>
        </div>

        {/* SCREENED CANDIDATES */}
        <div className="flex-1 bg-white border border-slate-200 shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md rounded-2xl p-4 shadow-lg flex flex-col gap-3 min-h-[250px] overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-brand-primary font-bold text-xs uppercase tracking-wider">
              <Users className="w-3.5 h-3.5" />
              <span>Candidates ({filteredCandidates.length})</span>
            </div>
            {candidates.length > 1 && (
              <button
                onClick={() => {
                  if (selectedCandidates.size === candidates.length) {
                    setSelectedCandidates(new Set());
                  } else {
                    setSelectedCandidates(new Set(candidates.map(c => c.candidate_id)));
                  }
                }}
                className="text-[10px] text-slate-500 hover:text-brand-primary font-semibold transition-colors"
              >
                {selectedCandidates.size === candidates.length ? 'Clear Select' : 'Select All'}
              </button>
            )}
          </div>

          {candidates.length > 0 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-550 absolute left-2.5 top-2.5" />
              <input 
                type="text"
                placeholder="Search candidates/skills..."
                value={candidateFilter}
                onChange={e => setCandidateFilter(e.target.value)}
                className="w-full bg-white border border-slate-300 shadow-sm focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all rounded-xl py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-500"
              />
            </div>
          )}

          {filteredCandidates.length > 0 ? (
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {filteredCandidates.map((c) => {
                const isSelected = selectedCandidates.has(c.candidate_id);
                const score = c.match_score || 0;
                const scoreColor = score >= 80 ? 'text-brand-emerald border-brand-emerald/30 bg-brand-emerald/10' : 
                                   score >= 50 ? 'bg-brand-primary text-white border-indigo-200' : 
                                   score > 0 ? 'text-brand-rose border-brand-rose/30 bg-brand-rose/10' :
                                   'text-slate-500 border-slate-200 bg-white';
                
                return (
                  <div 
                    key={c.candidate_id} 
                    className={`p-3 border rounded-xl flex flex-col gap-2.5 transition-all duration-200 hover:scale-[1.01] ${
                      isSelected 
                        ? 'bg-brand-primary text-white border-indigo-200 shadow-sm shadow-sm' 
                        : 'bg-white border-slate-200 hover:border-slate-200 hover:bg-white shadow-md'
                    } ${
                      score >= 80 ? 'border-l-3 border-l-brand-emerald' :
                      score >= 50 ? 'border-l-3 border-l-brand-primary' :
                      score > 0 ? 'border-l-3 border-l-brand-rose' :
                      'border-l-3 border-l-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex items-center gap-2 max-w-[70%]">
                        <input 
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCandidateSelect(c.candidate_id)}
                          className="w-3.5 h-3.5 rounded border-slate-200 accent-brand-primary cursor-pointer shrink-0"
                        />
                        <span className="font-bold text-slate-900 text-xs truncate cursor-pointer hover:text-brand-primary transition-colors" onClick={() => toggleCandidateSelect(c.candidate_id)}>
                          {c.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {c.red_flags && c.red_flags.length > 0 && (
                          <span 
                            title={`${c.red_flags.length} Red flag(s) detected!`}
                            className="text-brand-rose animate-pulse cursor-help shrink-0"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </span>
                        )}
                        {score > 0 && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-lg border font-mono font-bold shrink-0 ${scoreColor}`}>
                            {score.toFixed(0)}% Match
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expandable red flags */}
                    {c.red_flags && c.red_flags.length > 0 && (
                      <div className="bg-brand-rose/5 border border-brand-rose/20 rounded-xl p-2 text-[9px] text-brand-rose leading-tight space-y-1 animate-in slide-in-from-top-1">
                        <span className="font-bold uppercase tracking-wider text-[8px] text-brand-rose/90 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Flag Details:
                        </span>
                        {c.red_flags.map((flag, idx) => (
                          <div key={idx} className="flex gap-1 pl-1">
                            <span>•</span>
                            <span>{flag}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="text-[10px] text-slate-500 space-y-1">
                      {c.experience_years != null && (
                        <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                          <span>Experience:</span>
                          <strong className="text-slate-800">{c.experience_years.toFixed(1)} years</strong>
                        </div>
                      )}
                      {c.matched_skills && c.matched_skills.length > 0 && (
                        <div className="pt-0.5">
                          <span className="text-[9px] text-slate-500 block mb-1">Matched Skills:</span>
                          <div className="flex flex-wrap gap-1">
                            {c.matched_skills.slice(0, 4).map((skill, sIdx) => (
                              <span key={sIdx} className="bg-brand-primary text-white text-[8px] px-1.5 py-0.5 rounded border border-indigo-200 font-mono">
                                {skill}
                              </span>
                            ))}
                            {c.matched_skills.length > 4 && (
                              <span className="text-[8px] text-slate-500 font-semibold pl-0.5 self-center">
                                +{c.matched_skills.length - 4} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Candidate actions */}
                    <div className="flex gap-1.5 border-t border-slate-200 pt-2 mt-1 justify-end">
                      <button
                        onClick={() => {
                          handleSend(`draft email for ${c.name}`);
                          setIsLeftPanelOpen(false);
                        }}
                        className="text-[9px] px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 hover:border-slate-200 text-slate-400 hover:text-brand-primary font-semibold transition-all hover:-translate-y-[1px] active:translate-y-0"
                      >
                        ✉️ Email
                      </button>
                      <button
                        onClick={() => {
                          handleSend(`schedule an interview with ${c.name}`);
                          setIsLeftPanelOpen(false);
                        }}
                        className="text-[9px] px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-slate-800 hover:text-brand-primary hover:bg-indigo-50 font-semibold transition-all hover:-translate-y-[1px] active:translate-y-0 shadow-sm shadow-sm"
                      >
                        📅 Schedule
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-6 text-center">No resumes matched. Upload resumes or run context load.</p>
          )}

          {/* Resume Upload Option */}
          <div className="pt-3 border-t border-slate-200 mt-2 flex flex-col gap-1.5 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Upload Candidate Resumes</span>
            <div className="relative border border-dashed border-slate-200 hover:border-brand-primary rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer transition-all bg-white group">
              <input 
                type="file" 
                multiple
                accept=".txt,.pdf,.doc,.docx"
                onChange={handleResumeUpload} 
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" 
              />
              <Paperclip className="w-4 h-4 text-slate-400 group-hover:text-brand-primary mb-1 transition-colors" />
              <span className="text-[10px] text-slate-500 group-hover:text-slate-800 transition-colors">Choose resume files</span>
            </div>
          </div>
        </div>

        {/* BOOKED INTERVIEWS */}
        <div className="bg-white border border-slate-200 shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md rounded-2xl p-4 shadow-lg flex flex-col gap-2.5">
          <div className="flex items-center gap-2 text-brand-primary font-bold text-xs uppercase tracking-wider">
            <Calendar className="w-3.5 h-3.5" />
            <span>Scheduled Interviews ({scheduledInterviews.length})</span>
          </div>
          {scheduledInterviews.length > 0 ? (
            <div className="flex flex-col gap-2 overflow-y-auto max-h-[160px] custom-scrollbar pr-1">
              {scheduledInterviews.map((item, idx) => (
                <div key={idx} className="p-2.5 border border-slate-200 bg-white rounded-xl flex flex-col gap-0.5">
                  <div className="font-bold text-slate-800 text-xs truncate">{item.candidate_name}</div>
                  <div className="text-[10px] text-brand-primary font-mono font-bold">{item.slot}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-1 text-center">No interviews booked yet.</p>
          )}
        </div>
      </section>

      {/* 2. CHAT PANEL (CENTER) */}
      <section className="flex-1 flex flex-col bg-transparent relative select-text">
        <header className={`h-16 border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between bg-white  sticky top-0 z-10 ${!isSidebarOpen ? 'pl-16' : ''}`}>
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-brand-primary text-white rounded-xl border border-indigo-200 hidden xs:block">
              <Cpu className="w-5 h-5 text-brand-primary animate-pulse" />
            </div>
            <div>
              <h1 className="font-black text-xs sm:text-sm tracking-tight uppercase flex items-center gap-1.5">
                <span className="text-brand-primary font-bold">RecruitAI</span>
                <span className="text-[9px] bg-brand-primary text-white px-2 py-0.5 rounded-full font-bold font-mono shadow-sm">v2.0</span>
              </h1>
              <p className="text-[9px] sm:text-[10px] text-slate-500">Agent Supervisor</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Mobile Toggles for Panels */}
            <button
              onClick={() => {
                setIsLeftPanelOpen(true);
                setIsRightPanelOpen(false);
              }}
              className="lg:hidden p-2 bg-slate-50 border border-slate-200 hover:border-slate-200 text-slate-400 hover:text-brand-primary rounded-xl transition"
              title="Workspace Data"
            >
              <Database className="w-4 h-4 text-brand-primary" />
            </button>
            <button
              onClick={() => {
                setIsRightPanelOpen(true);
                setIsLeftPanelOpen(false);
              }}
              className="lg:hidden p-2 bg-slate-50 border border-slate-200 hover:border-slate-200 text-slate-400 hover:text-brand-primary rounded-xl transition"
              title="Widgets & Reports"
            >
              <Sliders className="w-4 h-4 text-brand-primary" />
            </button>

            <div className="hidden md:flex items-center gap-1.5 bg-white px-3 py-1 rounded-full border border-slate-200 text-[10px]">
              <span className={`w-1.5 h-1.5 rounded-full ${apiConnected ? 'bg-brand-emerald animate-pulse' : 'bg-brand-rose'}`} />
              <span className="text-slate-305 font-bold font-mono">{apiConnected ? 'API: ONLINE' : 'API: OFFLINE'}</span>
            </div>
            
            <button 
              onClick={openReportPreview}
              className="text-[10px] bg-slate-50 border border-indigo-200 hover:border-indigo-300 text-slate-800 px-2.5 py-1.5 rounded-xl transition-all font-bold shadow-sm hover:shadow-sm"
            >
              📄 <span className="hidden sm:inline">Report Preview</span><span className="sm:hidden">Report</span>
            </button>
            <button 
              onClick={clearChat}
              className="text-[10px] border border-slate-200 hover:border-brand-rose/25 bg-slate-50 text-slate-405 hover:text-brand-rose px-2.5 py-1.5 rounded-xl transition-all hidden xs:block"
            >
              Reset
            </button>
          </div>
        </header>

        {/* CHAT MESSAGES WINDOW */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-4xl mx-auto w-full custom-scrollbar">
          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            return (
              <div 
                key={idx} 
                className={`flex gap-3 max-w-[85%] animate-in fade-in slide-in-from-bottom-2 duration-205 ${isUser ? 'ml-auto flex-row-reverse' : ''}`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                  isUser ? 'bg-slate-50 border border-indigo-200 text-brand-primary' : 'bg-slate-50 border border-slate-200 text-slate-450'
                }`}>
                  {isUser ? <User className="w-4 h-4 text-brand-primary" /> : <Bot className="w-4 h-4 text-slate-500" />}
                </div>

                <div className={`p-4 rounded-2xl border text-sm leading-relaxed ${
                  isUser 
                    ? 'bg-white border-indigo-200 text-slate-900 rounded-tr-none shadow-sm' 
                    : 'bg-white border-slate-200 text-slate-800 rounded-tl-none shadow-lg '
                }`}>
                  <MarkdownText text={msg.content} />
                </div>
              </div>
            );
          })}
          
          {loading && (
            <div className="flex gap-3 max-w-[85%]">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-slate-50 border border-slate-200 text-slate-500">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-4 rounded-2xl border border-slate-200 bg-white flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          
          <div ref={chatEndRef} />
        </div>

        <div className="border-t border-slate-200 bg-white  p-4 max-w-4xl mx-auto w-full flex flex-col gap-3">
          {/* Action Chips */}
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => handleSuggestion("load JD backend/data/jds/senior_fullstack_engineer.txt and resumes from backend/data/resumes")}
              className="text-xs bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200 text-indigo-700 px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 font-bold hover:-translate-y-[1px] active:translate-y-0 cursor-pointer shadow-sm"
            >
              🚀 Ingest Sample Files
            </button>
            <button 
              onClick={() => handleSuggestion("fetch JD for Frontend Developer via API")}
              className="text-xs bg-sky-50 hover:bg-sky-100/80 border border-sky-200 text-sky-700 px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 font-bold hover:-translate-y-[1px] active:translate-y-0 cursor-pointer shadow-sm"
            >
              🌐 Fetch Job via API
            </button>
            <button 
              onClick={() => handleSuggestion("Screen candidates matching the job description")}
              className="text-xs bg-violet-50 hover:bg-violet-100/80 border border-violet-200 text-violet-700 px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 font-bold hover:-translate-y-[1px] active:translate-y-0 cursor-pointer shadow-sm"
            >
              🔍 Screen Candidates
            </button>
            <button 
              onClick={() => handleSuggestion("compare top candidates")}
              className="text-xs bg-blue-50 hover:bg-blue-100/80 border border-blue-200 text-blue-700 px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 font-bold hover:-translate-y-[1px] active:translate-y-0 cursor-pointer shadow-sm"
            >
              📊 Compare Side-by-Side
            </button>
            <button 
              onClick={() => handleSuggestion("check resumes for red flags")}
              className="text-xs bg-rose-50 hover:bg-rose-100/80 border border-rose-200 text-rose-700 px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 font-bold hover:-translate-y-[1px] active:translate-y-0 cursor-pointer shadow-sm"
            >
              ⚠️ Red Flags Check
            </button>
            <button 
              onClick={() => handleSuggestion("generate interview prep questions for the job description")}
              className="text-xs bg-amber-50 hover:bg-amber-100/80 border border-amber-200 text-amber-700 px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 font-bold hover:-translate-y-[1px] active:translate-y-0 cursor-pointer shadow-sm"
            >
              📋 Prep Questions
            </button>
            <button 
              onClick={() => handleSuggestion("draft outreach email templates for top candidates")}
              className="text-xs bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 text-emerald-700 px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 font-bold hover:-translate-y-[1px] active:translate-y-0 cursor-pointer shadow-sm"
            >
              ✉️ Outreach Draft
            </button>
            <button 
              onClick={() => handleSuggestion("clear recruitment workspace context")}
              className="text-xs bg-slate-50 hover:bg-slate-100/80 border border-slate-200 text-slate-700 px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 font-bold hover:-translate-y-[1px] active:translate-y-0 cursor-pointer shadow-sm"
            >
              🧹 Reset Workspace
            </button>
          </div>

          {/* Form */}
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
            className="flex gap-2 bg-white border border-slate-200 focus-within:border-indigo-300 rounded-2xl p-2 transition-all shadow-sm focus-within:shadow-sm"
          >
            <input 
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              accept=".pdf,.docx,.txt"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="text-slate-500 hover:text-brand-primary disabled:opacity-50 p-3 transition hover:bg-slate-50 rounded-xl shrink-0"
              title="Attach PDF/DOCX Resumes"
            >
              <Paperclip className="w-4.5 h-4.5" />
            </button>
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type command or query for the Agent..."
              className="flex-1 bg-transparent px-4 py-2 text-sm border-none outline-none focus:ring-0 text-slate-205 placeholder-slate-600"
              disabled={loading}
            />
            {loading ? (
              <button 
                type="button"
                onClick={handleStop}
                className="bg-brand-rose hover:bg-brand-rose/90 text-white rounded-xl px-5 py-2.5 transition shrink-0 shadow-sm hover:shadow-sm flex items-center justify-center font-bold gap-1 text-xs hover:-translate-y-[1px] active:translate-y-0"
                title="Stop execution"
              >
                <X className="w-4 h-4" />
                <span>Stop</span>
              </button>
            ) : (
              <button 
                type="submit"
                disabled={!input.trim()}
                className="bg-brand-primary hover:bg-indigo-700 disabled:bg-slate-50 disabled:text-slate-400 disabled:shadow-none text-white rounded-xl px-5 py-2.5 transition shrink-0 shadow-sm hover:shadow-sm flex items-center justify-center font-black hover:-translate-y-[1px] active:translate-y-0 cursor-pointer"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            )}
          </form>
        </div>
      </section>

      {/* 3. RIGHT WORKSPACE PANEL (VISUAL WIDGETS) */}
      {isRightPanelOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden animate-in fade-in"
          onClick={() => setIsRightPanelOpen(false)}
        />
      )}
      <section className={`fixed inset-y-0 right-0 z-45 w-full max-w-[380px] flex flex-col overflow-hidden shrink-0 bg-white border border-slate-200 shadow-sm transition-all duration-200 transition-transform duration-300 lg:relative lg:translate-x-0 lg:z-auto lg:border-y-0 lg:border-r-0 lg:border-l lg:border-brand-primary/10 ${
        isRightPanelOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
      }`}>
        
        {/* Workspace Nav Header */}
        <div className="flex border-b border-slate-200 bg-white p-2 gap-1 shrink-0 items-center">
          <button 
            onClick={() => setIsRightPanelOpen(false)}
            className="lg:hidden text-slate-500 hover:text-brand-primary p-2 hover:bg-slate-50 rounded-xl shrink-0 mr-1 transition"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-all border ${
              activeTab === 'diagnostics' 
                ? 'bg-brand-primary text-white border-indigo-200 font-bold shadow-sm' 
                : 'border-transparent text-slate-500 hover:text-slate-205 hover:bg-slate-50/40'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span className="text-[9px] font-bold uppercase tracking-wider">Trace</span>
          </button>
          
          <button
            onClick={() => setActiveTab('comparison')}
            className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-all border ${
              activeTab === 'comparison' 
                ? 'bg-brand-primary text-white border-indigo-200 font-bold shadow-sm' 
                : 'border-transparent text-slate-500 hover:text-slate-205 hover:bg-slate-50/40'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span className="text-[9px] font-bold uppercase tracking-wider">Compare</span>
          </button>

          <button
            onClick={() => setActiveTab('scheduler')}
            className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-all border ${
              activeTab === 'scheduler' 
                ? 'bg-brand-primary text-white border-indigo-200 font-bold shadow-sm' 
                : 'border-transparent text-slate-500 hover:text-slate-205 hover:bg-slate-50/40'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span className="text-[9px] font-bold uppercase tracking-wider">Calendar</span>
          </button>

          <button
            onClick={() => setActiveTab('email')}
            className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-all border ${
              activeTab === 'email' 
                ? 'bg-brand-primary text-white border-indigo-200 font-bold shadow-sm' 
                : 'border-transparent text-slate-500 hover:text-slate-205 hover:bg-slate-50/40'
            }`}
          >
            <Mail className="w-4 h-4" />
            <span className="text-[9px] font-bold uppercase tracking-wider">Email</span>
          </button>
        </div>

        {/* TAB WORKSPACE CONTENT */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 select-text custom-scrollbar bg-white">
          
          {/* TAB 1: DIAGNOSTIC TRACE */}
          {activeTab === 'diagnostics' && (
            <div className="flex flex-col gap-4 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 text-xs font-black uppercase text-slate-400 tracking-wider">
                <Terminal className="w-4 h-4 text-brand-primary" />
                <span>Real-Time Route Diagnostics</span>
              </div>
              
              {routerLogs.length > 0 ? (
                <div className="space-y-3.5">
                  {routerLogs.map((log, idx) => {
                    const isGoogle = log.provider?.toLowerCase().includes('gemini');
                    const isGroq = log.provider?.toLowerCase().includes('groq');
                    const providerLogo = isGoogle ? 'GEMINI' : isGroq ? 'GROQ' : 'RULES';
                    const providerColor = isGoogle ? 'bg-brand-primary text-white border-indigo-200' : 
                                            isGroq ? 'bg-brand-secondary/10 text-brand-secondary border-brand-secondary/25' : 
                                            'bg-slate-50 text-slate-500 border-slate-200';

                    return (
                      <div 
                        key={idx} 
                        className="bg-white border border-slate-200 shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md rounded-2xl p-4 shadow-lg flex flex-col gap-2.5"
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <span className="text-xs font-black text-brand-primary uppercase font-mono">Turn {log.turn}</span>
                          <span className="text-[10px] text-slate-500 font-semibold font-mono bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200">{log.node}</span>
                        </div>
                        
                        {/* Router Metrics */}
                        <div className="grid grid-cols-2 gap-y-1.5 gap-x-2 text-[11px] text-slate-500">
                          <div>Intent Routed:</div>
                          <div className="text-slate-900 font-bold text-right capitalize">{log.intent}</div>
                          
                          <div>Confidence Score:</div>
                          <div className="font-mono text-brand-primary font-bold text-right">{(log.confidence * 100).toFixed(0)}%</div>
                          
                          <div>Model Provider:</div>
                          <div className="text-right">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono font-black ${providerColor}`}>
                              {providerLogo}
                            </span>
                          </div>

                          <div className="col-span-2 border-t border-slate-200 pt-2.5 mt-1 flex justify-between items-center">
                            <span className="flex items-center gap-1 text-[10px] text-slate-500">
                              <Clock className="w-3.5 h-3.5" />
                              Execution Time
                            </span>
                            <span className="font-mono text-brand-emerald font-bold text-xs">{log.latency_ms} ms</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-200 rounded-2xl bg-white min-h-[300px]">
                  <Cpu className="w-10 h-10 text-slate-700 animate-pulse mb-3" />
                  <p className="text-xs text-slate-550 italic max-w-[200px]">Perform an interaction in the chat box to log supervisor trace logs here.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CANDIDATE COMPARISON MATRIX */}
          {activeTab === 'comparison' && (
            <div className="flex flex-col gap-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-black uppercase text-slate-400 tracking-wider">
                  <Sliders className="w-4 h-4 text-brand-primary" />
                  <span>Comparison Matrix</span>
                </div>
                <button
                  onClick={() => handleSuggestion("compare selected candidates")}
                  className="text-[9px] bg-indigo-50 text-slate-800 border border-indigo-200 hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg transition-all"
                >
                  Generate Markdown
                </button>
              </div>

              {candidates.length > 0 ? (
                <div className="space-y-4">
                  {candidates.map((c) => {
                    const isChecked = selectedCandidates.has(c.candidate_id);
                    return (
                      <div 
                        key={c.candidate_id}
                        className={`p-4 border rounded-2xl flex flex-col gap-3 transition-all duration-200 ${
                          isChecked 
                            ? 'bg-brand-primary text-white border-brand-primary/35 shadow-sm' 
                            : 'bg-white border-slate-200 hover:border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <div className="flex items-center gap-2">
                            <input 
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleCandidateSelect(c.candidate_id)}
                              className="w-3.5 h-3.5 rounded border-slate-200 accent-brand-primary cursor-pointer"
                            />
                            <span className="font-bold text-sm text-slate-900">{c.name}</span>
                          </div>
                          <span className="text-[10px] bg-slate-50 border border-slate-200 text-brand-primary px-2 py-0.5 rounded-lg font-mono font-bold">
                            Score: {c.match_score ? c.match_score.toFixed(0) : 'N/A'}
                          </span>
                        </div>

                        <div className="text-xs space-y-1.5 text-slate-400">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Exp:</span>
                            <span className="font-medium text-slate-800">{c.experience_years ? `${c.experience_years.toFixed(1)} years` : 'N/A'}</span>
                          </div>
                          
                          <div>
                            <span className="text-slate-500 block mb-1">Matched Skills:</span>
                            <div className="flex flex-wrap gap-1">
                              {c.matched_skills && c.matched_skills.length > 0 ? (
                                c.matched_skills.map((s, idx) => (
                                  <span key={idx} className="bg-brand-primary text-white border border-indigo-200 text-[9px] px-2 py-0.5 rounded-lg font-medium">
                                    {s}
                                  </span>
                                ))
                              ) : (
                                <span className="text-slate-500 italic text-[10px]">None</span>
                              )}
                            </div>
                          </div>

                          <div>
                            <span className="text-slate-500 block mb-1">Skill Gaps:</span>
                            <div className="flex flex-wrap gap-1">
                              {c.gaps && c.gaps.length > 0 ? (
                                c.gaps.map((g, idx) => (
                                  <span key={idx} className="bg-brand-rose/10 text-brand-rose border border-brand-rose/20 text-[9px] px-2 py-0.5 rounded-lg font-medium">
                                    {g}
                                  </span>
                                ))
                              ) : (
                                <span className="text-slate-500 italic text-[10px]">None</span>
                              )}
                            </div>
                          </div>

                          {c.red_flags && c.red_flags.length > 0 && (
                            <div className="pt-1">
                              <span className="text-brand-rose font-bold block mb-1 text-[10px] uppercase">⚠️ Red Flags:</span>
                              <ul className="list-disc list-inside text-[10px] text-slate-305 space-y-0.5 leading-tight">
                                {c.red_flags.map((flag, idx) => (
                                  <li key={idx}>{flag}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {selectedCandidates.size > 0 && (
                    <p className="text-[10px] text-slate-500 italic text-center">Comparing {selectedCandidates.size} checked candidates.</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic text-center py-10">No candidates to compare yet.</p>
              )}
            </div>
          )}

          {/* TAB 3: VISUAL SCHEDULER */}
          {activeTab === 'scheduler' && (
            <div className="flex flex-col gap-4 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 text-xs font-black uppercase text-slate-400 tracking-wider">
                <Calendar className="w-4 h-4 text-brand-primary" />
                <span>Interview Slot Scheduler</span>
              </div>

              {pendingConfirmation && pendingConfirmation.action === 'schedule_interview' ? (
                <div className="bg-white border border-slate-200 shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md rounded-2xl p-4 flex flex-col gap-3.5 shadow-lg">
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm">Schedule Candidate Interview</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Position: <strong className="text-slate-800">{pendingConfirmation.role}</strong></p>
                    <p className="text-xs text-slate-500">Candidate: <strong className="text-brand-primary">{pendingConfirmation.candidate_name}</strong></p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Available time slots:</span>
                    {pendingConfirmation.slots?.map((slot: { slot_number: number; label: string }) => (
                      <button
                        key={slot.slot_number}
                        onClick={() => handleSelectSlot(slot.slot_number)}
                        className="w-full bg-slate-50 border border-slate-200 hover:border-brand-primary/50 text-left p-3 rounded-xl flex items-center justify-between group transition-all"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="bg-slate-50 text-slate-500 font-mono text-[10px] w-6.5 h-6.5 rounded-xl flex items-center justify-center group-hover:bg-indigo-50 group-hover:text-brand-primary transition-colors border border-slate-200 group-hover:border-indigo-200">
                            {slot.slot_number}
                          </span>
                          <span className="text-xs text-slate-800 group-hover:text-brand-primary transition-colors">{slot.label}</span>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-brand-primary group-hover:translate-x-0.5 transition-all" />
                      </button>
                    ))}
                  </div>

                  <div className="text-[10px] text-slate-500 italic text-center mt-1 border-t border-slate-200 pt-2.5">
                    Click a slot or reply to booking prompt with slot number (1-5).
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="p-4 border border-slate-200 bg-white rounded-2xl flex flex-col gap-2 items-center justify-center text-center py-10">
                    <Calendar className="w-10 h-10 text-slate-700 mb-2 animate-pulse" />
                    <h4 className="text-xs font-bold text-slate-700">No Booking Active</h4>
                    <p className="text-[11px] text-slate-505 max-w-[200px] mt-0.5">Select &quot;Schedule&quot; action on a candidate card to trigger the booking flow.</p>
                  </div>
                  
                  {scheduledInterviews.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Booked slots list:</span>
                      {scheduledInterviews.map((item, idx) => (
                        <div key={idx} className="bg-brand-emerald/10 border border-brand-emerald/25 p-2.5 rounded-xl flex items-center justify-between">
                          <div className="text-xs">
                            <span className="font-bold text-slate-800 block">{item.candidate_name}</span>
                            <span className="text-slate-500 text-[10px] font-mono">{item.slot}</span>
                          </div>
                          <CheckCircle className="w-4 h-4 text-brand-emerald shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: RECRUITER EMAIL DRAUGHT DRAWER */}
          {activeTab === 'email' && (
            <div className="flex flex-col gap-4 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 text-xs font-black uppercase text-slate-400 tracking-wider">
                <Mail className="w-4 h-4 text-brand-primary" />
                <span>Outreach Email Drawer</span>
              </div>

              {draftBody ? (
                <div className="bg-white border border-slate-200 shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md rounded-2xl p-4 flex flex-col gap-3.5 shadow-lg">
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block mb-1">Recipient:</label>
                      <input 
                        type="text"
                        value={draftRecipient}
                        onChange={e => setDraftRecipient(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3 text-xs text-slate-800 focus:outline-none focus:border-brand-primary/50 transition-colors"
                      />
                    </div>
                    
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block mb-1">Subject Line:</label>
                      <input 
                        type="text"
                        value={draftSubject}
                        onChange={e => setDraftSubject(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3 text-xs text-slate-800 focus:outline-none focus:border-brand-primary/50 font-medium transition-colors"
                      />
                    </div>

                    <div>
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block mb-1">Email Body:</label>
                      <textarea
                        rows={8}
                        value={draftBody}
                        onChange={e => setDraftBody(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 focus:outline-none focus:border-brand-primary/50 font-mono leading-relaxed transition-colors"
                      />
                    </div>
                  </div>

                  {emailStatus && (
                    <div className="p-2.5 bg-brand-emerald/10 border border-brand-emerald/20 rounded-xl text-xs text-brand-emerald flex items-center gap-1.5 font-medium">
                      <Check className="w-4 h-4" />
                      {emailStatus}
                    </div>
                  )}

                  <div className="flex gap-2 justify-end mt-1 pt-3 border-t border-slate-200">
                    <button
                      onClick={() => {
                        setDraftBody("");
                        setDraftSubject("");
                        setDraftRecipient("");
                        setEmailStatus(null);
                      }}
                      className="text-xs border border-slate-200 hover:border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-800 px-3.5 py-1.5 rounded-xl transition"
                    >
                      Clear Draft
                    </button>
                    <button
                      onClick={handleSendEmailSimulation}
                      className="text-xs bg-brand-primary hover:bg-brand-primary/95 text-white font-bold px-4 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow hover:-translate-y-[1px] active:translate-y-0"
                    >
                      <Send className="w-3 h-3 rotate-90" />
                      Send Outreach
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 border border-slate-200 bg-white rounded-2xl flex flex-col gap-2 items-center justify-center text-center py-10">
                  <Mail className="w-10 h-10 text-slate-700 mb-2 animate-pulse" />
                  <h4 className="text-xs font-bold text-slate-700">No Draft Active</h4>
                  <p className="text-[11px] text-slate-500 max-w-[200px] mt-0.5">Ask the chatbot to draft an email (rejection, invite, offer) for a candidate to review it here.</p>
                </div>
              )}
            </div>
          )}

        </div>
      </section>

      {/* 4. PDF REPORT PREVIEW MODAL */}
      {showReportModal && (
        <div className="fixed inset-0 bg-white  z-50 flex items-center justify-center p-6 select-text animate-in fade-in duration-200">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand-primary" />
                <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-900">Recruitment Summary Report</h3>
              </div>
              <button 
                onClick={() => setShowReportModal(false)}
                className="text-slate-500 hover:text-brand-primary transition text-xs font-semibold px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl"
              >
                Close Preview
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-700 custom-scrollbar">
              
              {/* Position Info */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2.5 text-brand-primary">1. Position target requirements</h4>
                {jd ? (
                  <div className="grid grid-cols-2 gap-2 text-sm text-slate-700">
                    <div><span className="text-slate-500">Target Role:</span> <strong className="text-slate-900">{jd.role}</strong></div>
                    <div><span className="text-slate-500">Experience Required:</span> <strong className="text-slate-900">{jd.experience_years}+ years</strong></div>
                    <div><span className="text-slate-500">JD Tone & Culture:</span> <strong className="text-slate-900 capitalize">{jd.tone}</strong></div>
                    <div><span className="text-slate-500">Core Skills:</span> <strong className="text-slate-900">{jd.required_skills?.join(', ') || 'None'}</strong></div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-550 italic">No Position target loaded.</p>
                )}
              </div>

              {/* Candidates Table */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2.5 text-brand-primary">2. Shortlist Assessment</h4>
                {(lastShortlist || candidates).length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 bg-white">
                          <th className="py-2.5 px-3 font-semibold">Candidate Name</th>
                          <th className="py-2.5 px-3 font-semibold">Match Score</th>
                          <th className="py-2.5 px-3 font-semibold">Matched Skills</th>
                          <th className="py-2.5 px-3 font-semibold">Gaps Identified</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(lastShortlist || candidates).map((c, idx) => {
                          const score = c.match_score || 0;
                          const scoreColor = score >= 80 ? 'text-brand-emerald font-bold' : 
                                             score >= 50 ? 'text-brand-primary font-bold' : 
                                             'text-brand-rose font-bold';
                          return (
                            <tr key={idx} className="border-b border-slate-200 hover:bg-white">
                              <td className="py-2.5 px-3 text-slate-800">{c.name}</td>
                              <td className={`py-2.5 px-3 ${scoreColor}`}>{score.toFixed(0)}/100</td>
                              <td className="py-2.5 px-3 text-slate-500">{c.matched_skills?.join(', ') || 'None'}</td>
                              <td className="py-2.5 px-3 text-slate-500">{c.gaps?.join(', ') || 'None'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-550 italic">No candidates screened or shortlisted yet.</p>
                )}
              </div>

              {/* Salary Data */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2.5 text-brand-primary">3. Market Salary expectations</h4>
                <MarkdownText text={reportSalary} />
              </div>

              {/* Interview prep questions */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2.5 text-brand-primary">4. Interview prep questions</h4>
                <MarkdownText text={reportQs} />
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 bg-white">
              <button 
                onClick={() => setShowReportModal(false)}
                className="text-xs border border-slate-200 hover:border-slate-200 bg-slate-50 text-slate-500 hover:text-brand-primary px-4 py-2 rounded-xl transition"
              >
                Cancel
              </button>
              <button 
                onClick={downloadPdfReport}
                className="text-xs bg-brand-primary hover:bg-indigo-700 text-white font-black px-5 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-sm hover:shadow-sm"
              >
                <Send className="w-3.5 h-3.5 rotate-90 text-white" />
                Download PDF Report
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
