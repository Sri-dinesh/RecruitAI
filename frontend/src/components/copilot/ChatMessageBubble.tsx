import React from 'react';
import { 
  Bot, 
  Sparkles, 
  User, 
  Copy, 
  Check, 
  Zap, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  Lightbulb, 
  ArrowRight 
} from 'lucide-react';
import MarkdownText from '@/components/MarkdownText';
import { ChatMessage } from '@/types/chat';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  index: number;
  copiedIdx: number | null;
  expandedSteps: Record<number, boolean>;
  isLoading: boolean;
  onCopy: (text: string, idx: number) => void;
  onToggleSteps: (idx: number) => void;
  onSelectPrompt: (prompt: string) => void;
}

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({
  message,
  index,
  copiedIdx,
  expandedSteps,
  isLoading,
  onCopy,
  onToggleSteps,
  onSelectPrompt
}) => {
  const isAssistant = message.role === 'assistant';

  if (!isAssistant) {
    return (
      <div className="flex gap-3.5 justify-end">
        <div className="flex items-start gap-2.5 max-w-2xl">
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-3xl rounded-tr-xs px-6 py-4 shadow-sm text-sm sm:text-base font-medium leading-relaxed">
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
          <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 shadow-2xs font-bold text-xs mt-1">
            <User className="w-4 h-4" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3.5 justify-start">
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
              onClick={() => onCopy(message.content, index)}
              className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
              title="Copy response markdown"
            >
              {copiedIdx === index ? (
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
          <MarkdownText content={message.content} />
        </div>

        {/* Multi-Agent Reasoning Trace (Collapsible Accordion) */}
        {message.agentSteps && message.agentSteps.length > 0 && (
          <div className="pt-2">
            <button
              onClick={() => onToggleSteps(index)}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-indigo-600 transition cursor-pointer px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-indigo-50/50 border border-slate-200/60"
            >
              <Zap className="w-3 h-3 text-amber-500" />
              <span>{message.agentSteps.length} Multi-Agent Steps Executed</span>
              {expandedSteps[index] ? (
                <ChevronUp className="w-3 h-3 text-slate-400" />
              ) : (
                <ChevronDown className="w-3 h-3 text-slate-400" />
              )}
            </button>

            {expandedSteps[index] && (
              <div className="mt-2 pl-3 border-l-2 border-indigo-200 space-y-1 animate-in fade-in duration-150">
                {message.agentSteps.map((step, sIdx) => (
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
        {message.suggestedFollowups && message.suggestedFollowups.length > 0 && (
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1">
              <Lightbulb className="w-3 h-3 text-amber-500" /> Suggested:
            </span>
            {message.suggestedFollowups.map((fPrompt, fIdx) => (
              <button
                key={fIdx}
                onClick={() => onSelectPrompt(fPrompt)}
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
    </div>
  );
};
