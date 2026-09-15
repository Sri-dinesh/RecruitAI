'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  Bot, 
  Send, 
  Sparkles, 
  User, 
  RefreshCw, 
  Briefcase, 
  Users, 
  CheckCircle2, 
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Layers,
  Zap,
  Terminal,
  Clock,
  ArrowRight,
  Copy,
  Check,
  Search,
  FileText,
  Mail,
  ShieldAlert,
  Scale,
  MessageSquare,
  HelpCircle,
  Award,
  ListFilter,
  SlidersHorizontal,
  Download,
  Trash2,
  X,
  ArrowDown,
  AtSign,
  Lightbulb,
  CheckCheck
} from 'lucide-react';
import MarkdownText from '@/components/MarkdownText';
import { useRecruitment, Candidate } from '@/context/RecruitmentContext';
import { fetchWithAuth } from '@/lib/apiClient';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  agentSteps?: string[];
  suggestedFollowups?: string[];
}

interface PresetCategory {
  id: string;
  label: string;
  icon: React.ElementType;
  badgeColor: string;
  description: string;
  prompts: {
    title: string;
    description: string;
    prompt: string;
  }[];
}

const PRESET_CATEGORIES: PresetCategory[] = [
  {
    id: 'screening',
    label: 'Screen & Rank',
    icon: Award,
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    description: 'Instant candidate stack ranking, fit breakdown, and talent filtering.',
    prompts: [
      {
        title: 'Rank Candidate Pool',
        description: 'Stack-rank all candidates against the calibrated rubric.',
        prompt: 'Rank all candidates in our pool by match score. Detail the top 3 with their key technical competencies and why they stand out.'
      },
      {
        title: 'High-Fit Filter (>80%)',
        description: 'Isolate strong matches that exceed role criteria.',
        prompt: 'Which candidates score above 80%? Summarize their primary differentiators and readiness for immediate interview loops.'
      },
      {
        title: 'Seniority Check (5+ Years)',
        description: 'Verify leadership and years of production experience.',
        prompt: 'Filter candidates with 5 or more years of experience. List their primary architecture experience and past technical roles.'
      },
      {
        title: 'Zero Skill Gaps',
        description: 'Find candidates with 100% core stack overlap.',
        prompt: 'Identify any candidates in our talent pool who have zero critical competency gaps for this requisition.'
      }
    ]
  },
  {
    id: 'comparison',
    label: 'Compare & Tradeoffs',
    icon: Scale,
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    description: 'Head-to-head candidate analysis, architecture tradeoffs, and fit arbitration.',
    prompts: [
      {
        title: 'Top 2 Head-to-Head',
        description: 'Side-by-side comparison across 5 scoring pillars.',
        prompt: 'Compare our top 2 ranked candidates side-by-side. Highlight their technical fit, architecture depth, experience, and leadership tradeoffs.'
      },
      {
        title: 'Architecture Tradeoff',
        description: 'Evaluate system design and scalability prowess.',
        prompt: 'Who among our candidates has stronger hands-on system architecture, microservices, and cloud infrastructure experience?'
      },
      {
        title: 'Seniority vs. Tooling Fit',
        description: 'Analyze potential over/under-indexing on tools.',
        prompt: 'Evaluate the tradeoff between our most experienced candidate and our most technically aligned stack specialist.'
      }
    ]
  },
  {
    id: 'interviews',
    label: 'Interview Questions',
    icon: HelpCircle,
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
    description: 'Role-calibrated technical screening loops, system design, and behavioral rubrics.',
    prompts: [
      {
        title: 'Technical Screening Loop',
        description: '5 role-tailored questions with benchmark answers.',
        prompt: 'Generate a 5-question technical screening loop tailored to this exact job specification. Include the expected benchmark answers and what signals to look for.'
      },
      {
        title: 'Targeted Gap Testing',
        description: 'Questions targeting identified candidate weaknesses.',
        prompt: 'Review the identified skill gaps across our top candidates and generate 3 targeted probing questions to test their capability to adapt.'
      },
      {
        title: 'Behavioral & Culture Rubric',
        description: 'Assess team velocity, ownership, and communication.',
        prompt: 'Generate 3 behavioral interview questions evaluating cross-functional collaboration, conflict resolution, and engineering ownership.'
      },
      {
        title: 'System Design Challenge',
        description: 'Senior architectural design prompt for this stack.',
        prompt: 'Formulate a 45-minute system design interview problem that tests candidate proficiency in scalable distributed systems and databases relevant to this position.'
      }
    ]
  },
  {
    id: 'outreach',
    label: 'Outreach & Messaging',
    icon: Mail,
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    description: 'Personalized invitations, status updates, and candidate nurture templates.',
    prompts: [
      {
        title: 'Invite Top Candidate',
        description: 'Personalized email referencing verified background.',
        prompt: 'Draft a warm, high-converting interview invitation email for our highest-scoring candidate. Mention their specific matched technical skills and explain why our team is excited to speak.'
      },
      {
        title: 'Warm Nurture Update',
        description: 'Gentle status update keeping runner-ups engaged.',
        prompt: 'Draft a polite status update email for runner-up candidates keeping them engaged for future team openings while highlighting their strong qualifications.'
      },
      {
        title: 'Interview Confirmation',
        description: 'Structured email with loop details and video link.',
        prompt: 'Draft an interview confirmation email with agenda details, interviewer expectations, and a placeholder for video meeting link.'
      }
    ]
  },
  {
    id: 'risks',
    label: 'Gaps & Hiring Risks',
    icon: ShieldAlert,
    badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
    description: 'Stack omissions, ramp-up time analysis, and criteria mismatch detection.',
    prompts: [
      {
        title: 'Pool Skill Gap Analysis',
        description: 'Identify the most common missing technical competencies.',
        prompt: 'Analyze the biggest recurring skill gaps across our entire candidate pool for this position. What critical skills are candidates missing most often?'
      },
      {
        title: 'Ramp-up & Onboarding Time',
        description: 'Estimate candidate time to full engineering productivity.',
        prompt: 'Which candidate has the lowest technical gap and will require the shortest ramp-up time to become fully productive in our tech stack?'
      },
      {
        title: 'Candidate Red Flags',
        description: 'Highlight seniority deficits and mismatch concerns.',
        prompt: 'Scan our candidate records and highlight any notable red flags, severe experience deficits, or criteria mismatches for this requisition.'
      }
    ]
  }
];

export default function CopilotPage() {
  const { jd, candidates, activeSessionId, refreshData, activeSession } = useRecruitment();

  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Hello! I'm your **RecruitAI Copilot**, powered by a multi-agent recruitment supervisor graph.
      
I currently have active context on:
- **Campaign Position**: **${jd?.role || 'General Software Engineering'}** (${jd?.experience_years || 2}+ yrs required)
- **Candidate Pool**: **${candidates.length}** evaluated profiles
- **Scoring Framework**: 5-Pillar Calibration Matrix (Tech Stack, Seniority, Architecture, Leadership, Credentials)

Click any starter prompt below, use the **Presets Deck**, or type your own question to screen talent, arbitrate tradeoffs, or generate interview rubrics.`,
      agentSteps: ['Supervisor: Initialized recruitment memory', 'Ingestion: Loaded vector chunks', 'Rubric: Synced 5-pillar scoring framework'],
      suggestedFollowups: [
        'Rank all candidates by match score',
        'Which candidates have production Docker & Kubernetes experience?',
        'Generate a 5-question technical screening loop'
      ]
    }
  ]);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('screening');
  const [candidateFilter, setCandidateFilter] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [showDeck, setShowDeck] = useState(false);
  const [showCandidateMenu, setShowCandidateMenu] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Total prompts across all categories
  const totalPresetsCount = useMemo(() => {
    return PRESET_CATEGORIES.reduce((acc, cat) => acc + cat.prompts.length, 0);
  }, []);

  // Sync conversation history from active session if present
  useEffect(() => {
    if (activeSession?.conversation_history && activeSession.conversation_history.length > 0) {
      setMessages(activeSession.conversation_history as Message[]);
    }
  }, [activeSession?.id]);

  // Scroll to bottom when new messages arrive or loading changes
  useEffect(() => {
    if (!showScrollBottom) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, showScrollBottom]);

  // Detect scrolling to show/hide "Scroll to Latest" button
  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 180;
    setShowScrollBottom(!isNearBottom);
  };

  const scrollToBottom = () => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBottom(false);
  };

  // Close drawer on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDeck(false);
        setShowCandidateMenu(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filtered candidate list for quick mentions
  const filteredCandidates = useMemo(() => {
    if (!candidateFilter.trim()) return candidates;
    const q = candidateFilter.toLowerCase();
    return candidates.filter(c => 
      c.name.toLowerCase().includes(q) || 
      (c.headline && c.headline.toLowerCase().includes(q)) ||
      (c.skills && c.skills.some(s => s.toLowerCase().includes(q)))
    );
  }, [candidates, candidateFilter]);

  const handleSend = async (userPrompt?: string) => {
    const textToSend = (userPrompt || input).trim();
    if (!textToSend || isLoading) return;

    setInput('');
    setShowCandidateMenu(false);
    const newMessages: Message[] = [...messages, { role: 'user', content: textToSend }];
    setMessages(newMessages);
    setIsLoading(true);
    setCurrentStep('Supervisor Agent: Analyzing recruiter query...');

    // Auto-scroll immediately on user submit
    setTimeout(() => {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);

    try {
      setTimeout(() => {
        setCurrentStep('Rubric Matching Agent: Evaluating candidate pool...');
      }, 600);

      const payload: any = {
        message: textToSend,
        conversation_history: newMessages.slice(-8).map(m => ({ role: m.role, content: m.content })),
        session_id: activeSessionId || 'default'
      };

      if (jd) {
        payload.jd_structured = jd;
      }

      const res = await fetchWithAuth('/api/chat', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Chat API responded with status ${res.status}`);
      }

      const data = await res.json();
      const responseContent = data.response || data.message || 'I have completed the analysis for you.';

      // Contextual follow-up suggestions based on response content
      const followups: string[] = [];
      const lowerResp = responseContent.toLowerCase();
      if (lowerResp.includes('rank') || lowerResp.includes('score')) {
        followups.push('Compare our top 2 candidates side-by-side');
        followups.push('Draft an interview invitation email for the top candidate');
      } else if (lowerResp.includes('interview') || lowerResp.includes('question')) {
        followups.push('Generate a 1-5 scoring rubric for these questions');
        followups.push('Draft interview invitation email');
      } else if (lowerResp.includes('email') || lowerResp.includes('subject:')) {
        followups.push('Rewrite in a more conversational tone');
        followups.push('Generate follow-up reminder email');
      } else {
        followups.push('Analyze biggest skill gaps in our candidate pool');
        followups.push('Who has the lowest onboarding ramp-up time?');
      }

      const simulatedSteps = [
        'Supervisor: Query categorized & routed to domain agents',
        'Candidate Intelligence: Scanned candidate vector store',
        'Rubric Analyzer: Applied 5-pillar weights',
        'Synthesizer: Formatted recruiter report'
      ];

      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: responseContent,
          agentSteps: simulatedSteps,
          suggestedFollowups: followups.slice(0, 3)
        }
      ]);

      if (data.session_id) {
        refreshData();
      }
    } catch (err: any) {
      console.error('Copilot error:', err);
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: `⚠️ **Error communicating with AI Copilot**: ${err.message || 'Network error'}. Please verify backend connectivity.`
        }
      ]);
    } finally {
      setIsLoading(false);
      setCurrentStep(null);
    }
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleClearHistory = () => {
    if (messages.length > 1 && !confirm('Reset conversation history for this session?')) {
      return;
    }
    setMessages([
      {
        role: 'assistant',
        content: 'Session history reset. Ready for new recruitment queries.',
        agentSteps: ['Supervisor: Reset memory cache']
      }
    ]);
  };

  const handleExportChat = () => {
    const text = messages.map(m => `### ${m.role === 'user' ? 'Recruiter' : 'RecruitAI Copilot'}\n\n${m.content}\n\n---\n`).join('\n');
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recruitai-copilot-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleInjectCandidateQuery = (candidate: Candidate, action: 'dive' | 'gaps' | 'invite') => {
    let query = '';
    if (action === 'dive') {
      query = `Deep-dive into ${candidate.name}'s resume. Break down their verified skills, years of experience, and architectural depth for our ${jd?.role || 'open'} position.`;
    } else if (action === 'gaps') {
      query = `Analyze ${candidate.name}'s skill gaps against our ${jd?.role || 'open'} requirements and suggest 3 technical questions to test these areas.`;
    } else if (action === 'invite') {
      query = `Draft a personalized interview invitation email for ${candidate.name} highlighting their background in ${(candidate.matched_skills || candidate.skills || ['software development']).slice(0, 3).join(', ')}.`;
    }
    setShowDeck(false);
    setShowCandidateMenu(false);
    handleSend(query);
  };

  const toggleSteps = (idx: number) => {
    setExpandedSteps(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const currentCategoryData = PRESET_CATEGORIES.find(c => c.id === activeCategory) || PRESET_CATEGORIES[0];

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-slate-50/60 relative">
      
      {/* Top Slim Control Toolbar (Integrated, Zero Wasted Space) */}
      <div className="h-12 px-4 sm:px-6 bg-white border-b border-slate-200/80 flex items-center justify-between gap-3 shrink-0 z-20">
        
        {/* Left: Active Context Indicator */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
            <Bot className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-2 truncate">
            <span className="text-xs font-bold text-slate-900 tracking-tight">AI Recruiter Copilot</span>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
              <Zap className="w-3 h-3 text-indigo-600 fill-indigo-600" /> Multi-Agent Graph
            </span>
            <span className="text-slate-300 hidden md:inline">•</span>
            <span className="text-xs text-slate-500 truncate hidden md:inline">
              Role: <strong className="text-slate-700 font-semibold">{jd?.role || 'General Software Engineering'}</strong>
            </span>
            <span className="text-slate-300 hidden lg:inline">•</span>
            <span className="text-xs text-slate-500 shrink-0 hidden lg:inline">
              <strong className="text-slate-700 font-semibold">{candidates.length}</strong> candidates
            </span>
          </div>
        </div>

        {/* Right: Quick Action Buttons & Presets Deck Trigger */}
        <div className="flex items-center gap-2 shrink-0">
          
          {/* Quick Candidate Mentions Popover Trigger */}
          <div className="relative">
            <button
              onClick={() => setShowCandidateMenu(!showCandidateMenu)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition flex items-center gap-1.5 cursor-pointer"
              title="Select candidate for quick query"
            >
              <Users className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">Candidates</span>
              <span className="text-[10px] bg-slate-100 px-1.5 py-0.2 rounded-full font-bold text-slate-600">{candidates.length}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {/* Candidate Quick Selector Dropdown */}
            {showCandidateMenu && (
              <div className="absolute right-0 top-10 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 p-3 z-50 animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-800">Quick Candidate Actions</span>
                  <button 
                    onClick={() => setShowCandidateMenu(false)}
                    className="text-slate-400 hover:text-slate-600 p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                  {candidates.length > 0 ? (
                    candidates.map(cand => (
                      <div key={cand.candidate_id} className="p-2 rounded-xl bg-slate-50 hover:bg-indigo-50/50 border border-slate-200/60 transition">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-1">
                          <span className="truncate">{cand.name}</span>
                          <span className="text-[10px] text-indigo-600 font-extrabold">{Math.round(cand.match_score || 0)}%</span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleInjectCandidateQuery(cand, 'dive')}
                            className="text-[10px] font-semibold px-2 py-0.5 bg-white border border-slate-200 rounded-md hover:bg-indigo-600 hover:text-white transition"
                          >
                            Deep Dive
                          </button>
                          <button
                            onClick={() => handleInjectCandidateQuery(cand, 'gaps')}
                            className="text-[10px] font-semibold px-2 py-0.5 bg-white border border-slate-200 rounded-md hover:bg-rose-600 hover:text-white transition"
                          >
                            Test Gaps
                          </button>
                          <button
                            onClick={() => handleInjectCandidateQuery(cand, 'invite')}
                            className="text-[10px] font-semibold px-2 py-0.5 bg-white border border-slate-200 rounded-md hover:bg-emerald-600 hover:text-white transition"
                          >
                            Invite
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-xs text-slate-400">No candidates available</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Toggle Slide-Over Presets Deck */}
          <button
            onClick={() => setShowDeck(!showDeck)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              showDeck 
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' 
                : 'bg-white border-slate-200 text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700'
            }`}
            title="Open categorized recruitment workflows & presets"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Presets Deck</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${showDeck ? 'bg-indigo-700 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
              {totalPresetsCount}
            </span>
          </button>

          {/* Export Markdown */}
          <button
            onClick={handleExportChat}
            disabled={messages.length <= 1}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
            title="Export conversation as Markdown"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>

          {/* Clear Session */}
          <button
            onClick={handleClearHistory}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-rose-600 hover:bg-rose-50 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
            title="Reset conversation view"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>

        </div>
      </div>

      {/* Main Spacious Chat Scroll Canvas */}
      <div 
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-12 py-6 custom-scrollbar relative"
      >
        <div className="max-w-5xl mx-auto w-full space-y-6">

          {/* Hero Welcome Cards (Rendered when starting new conversation) */}
          {messages.length <= 1 && (
            <div className="pt-2 pb-6 space-y-6 animate-in fade-in duration-300">
              
              <div className="text-center max-w-2xl mx-auto space-y-2">
                <div className="inline-flex p-3 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-purple-700 text-white shadow-md shadow-indigo-100 mb-1">
                  <Bot className="w-8 h-8" />
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  RecruitAI Copilot Command Center
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                  Autonomous recruiting intelligence powered by a multi-agent supervisor graph.
                  Execute end-to-end talent screening, head-to-head comparisons, and tailored interview loops in seconds.
                </p>
              </div>

              {/* 4 Large High-Affordance Action Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
                
                <button
                  onClick={() => handleSend('Rank all candidates in our pool by match score. Detail the top 3 with their key technical competencies and why they stand out.')}
                  disabled={isLoading}
                  className="p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-emerald-300 hover:shadow-md transition-all text-left group cursor-pointer flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 group-hover:scale-105 transition">
                      <Award className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Screen & Rank
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition flex items-center gap-1.5">
                      Stack-Rank Candidate Pool
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition" />
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Rank all candidates against the calibrated rubric with top differentiators and key competencies.
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => handleSend('Compare our top 2 ranked candidates side-by-side. Highlight their technical fit, architecture depth, experience, and leadership tradeoffs.')}
                  disabled={isLoading}
                  className="p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-indigo-300 hover:shadow-md transition-all text-left group cursor-pointer flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 group-hover:scale-105 transition">
                      <Scale className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                      Comparison
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-700 transition flex items-center gap-1.5">
                      Top 2 Head-to-Head Matrix
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition" />
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Side-by-side comparative analysis across technical depth, system architecture, and seniority tradeoffs.
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => handleSend('Generate a 5-question technical screening loop tailored to this exact job specification. Include the expected benchmark answers and what signals to look for.')}
                  disabled={isLoading}
                  className="p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-purple-300 hover:shadow-md transition-all text-left group cursor-pointer flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="p-2.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 group-hover:scale-105 transition">
                      <HelpCircle className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                      Interviews
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-purple-700 transition flex items-center gap-1.5">
                      5-Question Technical Loop
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-purple-600 group-hover:translate-x-1 transition" />
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Calibrated technical screening questions with expected benchmark answers and scoring rubrics.
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => handleSend('Draft a warm, high-converting interview invitation email for our highest-scoring candidate. Mention their specific matched technical skills and explain why our team is excited to speak.')}
                  disabled={isLoading}
                  className="p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-blue-300 hover:shadow-md transition-all text-left group cursor-pointer flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 group-hover:scale-105 transition">
                      <Mail className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                      Outreach
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition flex items-center gap-1.5">
                      Draft Personalized Invitations
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition" />
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      High-conversion interview email templates personalized with verified candidate skills and achievements.
                    </p>
                  </div>
                </button>

              </div>
            </div>
          )}

          {/* Conversation History Stream */}
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex gap-3.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {/* Assistant Message Block */}
              {m.role === 'assistant' ? (
                <div className="w-full bg-white rounded-3xl border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all p-6 sm:p-7 space-y-4">
                  
                  {/* Card Header: Identity + Quick Action Tools */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-2xs">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900 tracking-tight">RecruitAI Intelligence</span>
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/60 hidden sm:inline-flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5 text-indigo-600" /> Supervisor Agent
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleCopy(m.content, idx)}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                        title="Copy response markdown"
                      >
                        {copiedIdx === idx ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-600 font-bold text-[11px]">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span className="text-[11px]">Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Markdown Body: High Readability & Clean Typography */}
                  <div className="text-slate-800 leading-relaxed text-sm sm:text-base selection:bg-indigo-100">
                    <MarkdownText content={m.content} />
                  </div>

                  {/* Multi-Agent Reasoning Trace (Collapsible Accordion for Cleanliness) */}
                  {m.agentSteps && m.agentSteps.length > 0 && (
                    <div className="pt-2">
                      <button
                        onClick={() => toggleSteps(idx)}
                        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-indigo-600 transition cursor-pointer px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-indigo-50/50 border border-slate-200/60"
                      >
                        <Zap className="w-3 h-3 text-amber-500" />
                        <span>{m.agentSteps.length} Multi-Agent Steps Executed</span>
                        {expandedSteps[idx] ? (
                          <ChevronUp className="w-3 h-3 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-3 h-3 text-slate-400" />
                        )}
                      </button>

                      {expandedSteps[idx] && (
                        <div className="mt-2 pl-3 border-l-2 border-indigo-200 space-y-1 animate-in fade-in duration-150">
                          {m.agentSteps.map((step, sIdx) => (
                            <div key={sIdx} className="text-[11px] font-mono text-slate-600 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                              <span>{step}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Contextual Follow-up Suggestion Chips */}
                  {m.suggestedFollowups && m.suggestedFollowups.length > 0 && (
                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1">
                        <Lightbulb className="w-3 h-3 text-amber-500" /> Suggested:
                      </span>
                      {m.suggestedFollowups.map((fPrompt, fIdx) => (
                        <button
                          key={fIdx}
                          onClick={() => handleSend(fPrompt)}
                          disabled={isLoading}
                          className="text-xs px-3 py-1.5 rounded-xl bg-indigo-50/80 border border-indigo-200/70 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 font-semibold transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-2xs"
                        >
                          <span>{fPrompt}</span>
                          <ArrowRight className="w-3 h-3 text-indigo-500" />
                        </button>
                      ))}
                    </div>
                  )}

                </div>
              ) : (
                /* User Message Bubble */
                <div className="flex items-start gap-2.5 max-w-2xl">
                  <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-3xl rounded-tr-xs px-6 py-4 shadow-sm text-sm sm:text-base font-medium leading-relaxed">
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 shadow-2xs font-bold text-xs mt-1">
                    <User className="w-4 h-4" />
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Live Agent Reasoning Progress */}
          {isLoading && (
            <div className="flex gap-3.5 items-start animate-in fade-in">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs animate-pulse mt-1">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-white border border-indigo-100 rounded-3xl p-5 space-y-2.5 max-w-lg shadow-sm">
                <div className="flex items-center gap-2 text-indigo-600 text-xs font-bold">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{currentStep || 'Multi-Agent Supervisor reasoning...'}</span>
                </div>
                <div className="w-64 h-1.5 bg-indigo-50 rounded-full overflow-hidden">
                  <div className="w-2/3 h-full bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full animate-pulse" />
                </div>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>
      </div>

      {/* Floating "Scroll to Latest ↓" Button */}
      {showScrollBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-18 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1.5 bg-slate-900/90 hover:bg-slate-900 text-white text-xs font-bold rounded-full shadow-lg backdrop-blur-md flex items-center gap-1.5 transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-2"
        >
          <ArrowDown className="w-3.5 h-3.5 animate-bounce" />
          <span>Scroll to latest message</span>
        </button>
      )}

      {/* Bottom Floating Input Dock (Concise, Sleek & Ergonomic) */}
      <div className="bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-4 sm:px-6 py-2 shrink-0 z-10">
        <div className="max-w-5xl mx-auto w-full space-y-1.5">
          
          {/* Quick-Actions Pill Bar (1-Click Prompts - Compact) */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1 mr-0.5">
              <Zap className="w-3 h-3 text-indigo-600" /> Quick:
            </span>
            
            <button
              onClick={() => handleSend('Rank all candidates in our pool by match score. Detail the top 3 with their key technical competencies and why they stand out.')}
              disabled={isLoading}
              className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 font-medium transition shrink-0 cursor-pointer flex items-center gap-1 border border-slate-200/60"
            >
              <Award className="w-3 h-3 text-emerald-600" />
              <span>Rank Pool</span>
            </button>

            <button
              onClick={() => handleSend('Compare our top 2 ranked candidates side-by-side. Highlight their technical fit, architecture depth, experience, and leadership tradeoffs.')}
              disabled={isLoading}
              className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 font-medium transition shrink-0 cursor-pointer flex items-center gap-1 border border-slate-200/60"
            >
              <Scale className="w-3 h-3 text-indigo-600" />
              <span>Compare Top 2</span>
            </button>

            <button
              onClick={() => handleSend('Generate a 5-question technical screening loop tailored to this exact job specification. Include the expected benchmark answers and what signals to look for.')}
              disabled={isLoading}
              className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 font-medium transition shrink-0 cursor-pointer flex items-center gap-1 border border-slate-200/60"
            >
              <HelpCircle className="w-3 h-3 text-purple-600" />
              <span>Interview Loop</span>
            </button>

            <button
              onClick={() => handleSend('Draft a warm, high-converting interview invitation email for our highest-scoring candidate. Mention their specific matched technical skills and explain why our team is excited to speak.')}
              disabled={isLoading}
              className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 font-medium transition shrink-0 cursor-pointer flex items-center gap-1 border border-slate-200/60"
            >
              <Mail className="w-3 h-3 text-blue-600" />
              <span>Outreach</span>
            </button>

            <button
              onClick={() => handleSend('Analyze the biggest recurring skill gaps across our entire candidate pool for this position. What critical skills are candidates missing most often?')}
              disabled={isLoading}
              className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 font-medium transition shrink-0 cursor-pointer flex items-center gap-1 border border-slate-200/60"
            >
              <ShieldAlert className="w-3 h-3 text-rose-600" />
              <span>Gaps</span>
            </button>

            <button
              onClick={() => setShowDeck(true)}
              className="text-[11px] px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold transition shrink-0 cursor-pointer flex items-center gap-1 border border-indigo-200/70 ml-auto"
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>Presets ({totalPresetsCount}) →</span>
            </button>
          </div>

          {/* Compact Integrated Input Capsule */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center bg-slate-50 border border-slate-300/80 rounded-2xl px-3 py-1.5 focus-within:bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all shadow-xs gap-2"
          >
            <textarea
              ref={inputRef}
              rows={1}
              placeholder="Ask RecruitAI to rank candidates, screen resumes, or evaluate tradeoffs... (Enter ↵ to send, Shift+Enter for newline)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={isLoading}
              className="flex-1 bg-transparent border-0 resize-none text-sm text-slate-900 placeholder-slate-400 focus:outline-none custom-scrollbar py-0.5 leading-normal max-h-24"
            />

            {input.trim() && (
              <button
                type="button"
                onClick={() => setInput('')}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                title="Clear input"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="h-8 w-8 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 text-white rounded-xl transition-all flex items-center justify-center shrink-0 cursor-pointer shadow-xs"
              title="Send message (Enter)"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>

        </div>
      </div>

      {/* Slide-Over Command Presets & Candidate Drawer */}
      {showDeck && (
        <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
          
          {/* Semi-transparent Backdrop */}
          <div 
            onClick={() => setShowDeck(false)}
            className="absolute inset-0 bg-slate-900/20 backdrop-blur-xs transition-opacity" 
          />

          {/* Slide-out Drawer Panel */}
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl border-l border-slate-200/90 flex flex-col z-10 animate-in slide-in-from-right duration-250">
            
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Recruiter Command Deck</h3>
                  <p className="text-[11px] text-slate-500">17 one-click workflow presets</p>
                </div>
              </div>
              <button
                onClick={() => setShowDeck(false)}
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
                      setShowDeck(false);
                      handleSend(item.prompt);
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
                              onClick={() => handleInjectCandidateQuery(cand, 'dive')}
                              disabled={isLoading}
                              className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 transition cursor-pointer"
                              title="Deep-dive profile analysis"
                            >
                              Deep-Dive
                            </button>
                            <button
                              onClick={() => handleInjectCandidateQuery(cand, 'gaps')}
                              disabled={isLoading}
                              className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 transition cursor-pointer"
                              title="Inspect competency gaps"
                            >
                              Test Gaps
                            </button>
                            <button
                              onClick={() => handleInjectCandidateQuery(cand, 'invite')}
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
                <span className="truncate max-w-[190px] font-medium">{jd?.role || 'General Software Engineering'}</span>
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
      )}

    </div>
  );
}
