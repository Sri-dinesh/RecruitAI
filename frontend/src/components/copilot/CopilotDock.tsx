import React from 'react';
import { 
  Zap, 
  SlidersHorizontal, 
  Send, 
  X 
} from 'lucide-react';
import { QUICK_ACTION_CHIPS } from '@/config/copilotPresets';

interface CopilotDockProps {
  input: string;
  setInput: (val: string) => void;
  isLoading: boolean;
  totalPresetsCount: number;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onSubmit: (e?: React.FormEvent) => void;
  onSelectPrompt: (prompt: string) => void;
  onOpenDeck: () => void;
}

export const CopilotDock: React.FC<CopilotDockProps> = ({
  input,
  setInput,
  isLoading,
  totalPresetsCount,
  inputRef,
  onSubmit,
  onSelectPrompt,
  onOpenDeck
}) => {
  return (
    <div className="bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-4 sm:px-6 py-2 shrink-0 z-10">
      <div className="max-w-5xl mx-auto w-full space-y-1.5">
        
        {/* Quick-Actions Pill Bar (1-Click Prompts - Compact, Dynamically Derived) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1 mr-0.5">
            <Zap className="w-3 h-3 text-indigo-600" /> Quick:
          </span>
          
          {QUICK_ACTION_CHIPS.map((chip, idx) => {
            const Icon = chip.icon;
            return (
              <button
                key={idx}
                onClick={() => onSelectPrompt(chip.prompt)}
                disabled={isLoading}
                className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 font-medium transition shrink-0 cursor-pointer flex items-center gap-1 border border-slate-200/60"
              >
                <Icon className="w-3 h-3 text-indigo-600" />
                <span>{chip.label}</span>
              </button>
            );
          })}

          <button
            onClick={onOpenDeck}
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
            onSubmit();
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
                onSubmit();
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
  );
};
