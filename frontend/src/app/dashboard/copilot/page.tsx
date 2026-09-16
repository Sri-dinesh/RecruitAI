'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Bot, 
  Users, 
  Zap, 
  SlidersHorizontal, 
  Download, 
  RefreshCw, 
  ChevronDown 
} from 'lucide-react';
import { useRecruitment, Candidate } from '@/context/RecruitmentContext';
import { useCopilotChat } from '@/hooks/useCopilotChat';
import { TOTAL_PRESETS_COUNT } from '@/config/copilotPresets';
import { CopilotCanvas } from '@/components/copilot/CopilotCanvas';
import { CopilotDock } from '@/components/copilot/CopilotDock';
import { PresetsDeckDrawer } from '@/components/copilot/PresetsDeckDrawer';
import { CandidateMentionPopover } from '@/components/copilot/CandidateMentionPopover';
import { ChatMessage } from '@/types/chat';

export default function CopilotPage() {
  const { jd, candidates, activeSessionId, refreshData, activeSession } = useRecruitment();

  // Initial welcome message configured with current position and candidate pool
  const initialWelcome = useMemo<ChatMessage[]>(() => [
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
  ], [jd?.role, jd?.experience_years, candidates.length]);

  // Headless chat orchestration hook (ARCH-1, ARCH-5)
  const {
    messages,
    setMessages,
    input,
    setInput,
    isLoading,
    currentStep,
    copiedIdx,
    expandedSteps,
    toggleSteps,
    handleSend,
    handleCopy,
    handleClearHistory,
    handleExportChat
  } = useCopilotChat({
    activeSessionId,
    jd,
    initialMessages: initialWelcome,
    onSessionUpdated: refreshData
  });

  // UI Drawer and Popover state
  const [showDeck, setShowDeck] = useState(false);
  const [showCandidateMenu, setShowCandidateMenu] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('screening');
  const [candidateFilter, setCandidateFilter] = useState('');
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Sync conversation history from active session if present
  useEffect(() => {
    if (activeSession?.conversation_history && activeSession.conversation_history.length > 0) {
      setMessages(activeSession.conversation_history as ChatMessage[]);
    }
  }, [activeSession?.id, activeSession?.conversation_history, setMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (!showScrollBottom) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, showScrollBottom]);

  // Detect scrolling to toggle "Scroll to Latest" button
  const handleScroll = useCallback(() => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 180;
    setShowScrollBottom(!isNearBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBottom(false);
  }, []);

  // Keyboard shortcut: close drawer on Escape
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

  // Filtered candidates for search
  const filteredCandidates = useMemo(() => {
    if (!candidateFilter.trim()) return candidates;
    const q = candidateFilter.toLowerCase();
    return candidates.filter(c => 
      c.name.toLowerCase().includes(q) || 
      (c.headline && c.headline.toLowerCase().includes(q)) ||
      (c.skills && c.skills.some(s => s.toLowerCase().includes(q)))
    );
  }, [candidates, candidateFilter]);

  // Quick candidate query injector
  const handleInjectCandidateQuery = useCallback((candidate: Candidate, action: 'dive' | 'gaps' | 'invite') => {
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
  }, [jd?.role, handleSend]);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-slate-50/60 relative">
      
      {/* Top Slim Control Toolbar */}
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

        {/* Right: Actions & Drawer Triggers */}
        <div className="flex items-center gap-2 shrink-0">
          
          {/* Candidates Popover Selector */}
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

            <CandidateMentionPopover
              show={showCandidateMenu}
              onClose={() => setShowCandidateMenu(false)}
              candidates={candidates}
              onInjectCandidateQuery={handleInjectCandidateQuery}
            />
          </div>

          {/* Presets Deck Button */}
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
              {TOTAL_PRESETS_COUNT}
            </span>
          </button>

          {/* Export Conversation */}
          <button
            onClick={handleExportChat}
            disabled={messages.length <= 1}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
            title="Export conversation as Markdown"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>

          {/* Clear Session View */}
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

      {/* Main Spacious Chat Canvas (Decomposed Subcomponent) */}
      <CopilotCanvas
        messages={messages}
        isLoading={isLoading}
        currentStep={currentStep}
        copiedIdx={copiedIdx}
        expandedSteps={expandedSteps}
        showScrollBottom={showScrollBottom}
        roleName={jd?.role || 'General Software Engineering'}
        candidateCount={candidates.length}
        chatContainerRef={chatContainerRef}
        chatBottomRef={chatBottomRef}
        onScroll={handleScroll}
        onScrollToBottom={scrollToBottom}
        onCopy={handleCopy}
        onToggleSteps={toggleSteps}
        onSelectPrompt={handleSend}
      />

      {/* Floating Bottom Input Dock (Decomposed Subcomponent) */}
      <CopilotDock
        input={input}
        setInput={setInput}
        isLoading={isLoading}
        totalPresetsCount={TOTAL_PRESETS_COUNT}
        inputRef={inputRef}
        onSubmit={() => handleSend()}
        onSelectPrompt={handleSend}
        onOpenDeck={() => setShowDeck(true)}
      />

      {/* Slide-Over Command Presets & Candidate Drawer (Decomposed Subcomponent) */}
      <PresetsDeckDrawer
        show={showDeck}
        onClose={() => setShowDeck(false)}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        isLoading={isLoading}
        totalPresetsCount={TOTAL_PRESETS_COUNT}
        candidates={candidates}
        candidateFilter={candidateFilter}
        setCandidateFilter={setCandidateFilter}
        filteredCandidates={filteredCandidates}
        roleName={jd?.role || 'General Software Engineering'}
        onSelectPrompt={handleSend}
        onInjectCandidateQuery={handleInjectCandidateQuery}
      />

    </div>
  );
}
