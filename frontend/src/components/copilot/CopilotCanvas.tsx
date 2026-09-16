import React from 'react';
import { 
  Bot, 
  RefreshCw, 
  ArrowRight, 
  ArrowDown 
} from 'lucide-react';
import { ChatMessage } from '@/types/chat';
import { HERO_ACTION_CARDS } from '@/config/copilotPresets';
import { ChatMessageBubble } from './ChatMessageBubble';

interface CopilotCanvasProps {
  messages: ChatMessage[];
  isLoading: boolean;
  currentStep: string | null;
  copiedIdx: number | null;
  expandedSteps: Record<number, boolean>;
  showScrollBottom: boolean;
  roleName: string;
  candidateCount: number;
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
  chatBottomRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  onScrollToBottom: () => void;
  onCopy: (text: string, idx: number) => void;
  onToggleSteps: (idx: number) => void;
  onSelectPrompt: (prompt: string) => void;
}

export const CopilotCanvas: React.FC<CopilotCanvasProps> = ({
  messages,
  isLoading,
  currentStep,
  copiedIdx,
  expandedSteps,
  showScrollBottom,
  roleName,
  candidateCount,
  chatContainerRef,
  chatBottomRef,
  onScroll,
  onScrollToBottom,
  onCopy,
  onToggleSteps,
  onSelectPrompt
}) => {
  return (
    <div 
      ref={chatContainerRef}
      onScroll={onScroll}
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

            {/* 4 Large High-Affordance Action Cards Dynamically Derived from Configuration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
              {HERO_ACTION_CARDS.map(({ category, primaryPrompt }) => {
                const Icon = category.icon;
                return (
                  <button
                    key={category.id}
                    onClick={() => onSelectPrompt(primaryPrompt.prompt)}
                    disabled={isLoading}
                    className="p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-indigo-300 hover:shadow-md transition-all text-left group cursor-pointer flex flex-col justify-between space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className={`p-2.5 rounded-xl border ${category.badgeColor} group-hover:scale-105 transition`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md border ${category.badgeColor}`}>
                        {category.label}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-700 transition flex items-center gap-1.5">
                        {primaryPrompt.title}
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition" />
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        {primaryPrompt.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Conversation History Stream */}
        {messages.map((m, idx) => (
          <ChatMessageBubble
            key={idx}
            message={m}
            index={idx}
            copiedIdx={copiedIdx}
            expandedSteps={expandedSteps}
            isLoading={isLoading}
            onCopy={onCopy}
            onToggleSteps={onToggleSteps}
            onSelectPrompt={onSelectPrompt}
          />
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

      {/* Floating "Scroll to Latest ↓" Button */}
      {showScrollBottom && (
        <button
          onClick={onScrollToBottom}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1.5 bg-slate-900/90 hover:bg-slate-900 text-white text-xs font-bold rounded-full shadow-lg backdrop-blur-md flex items-center gap-1.5 transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-2"
        >
          <ArrowDown className="w-3.5 h-3.5 animate-bounce" />
          <span>Scroll to latest message</span>
        </button>
      )}
    </div>
  );
};
