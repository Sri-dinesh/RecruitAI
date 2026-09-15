'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { 
  Menu, 
  Settings, 
  ShieldCheck, 
  Sparkles, 
  Eye, 
  EyeOff, 
  FileText,
  Activity
} from 'lucide-react';
import { useRecruitment } from '@/context/RecruitmentContext';
import { useAuth } from '@/context/AuthContext';

interface AppHeaderProps {
  onOpenMobileMenu: () => void;
  onOpenSettings: () => void;
}

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': { title: 'Mission Control', subtitle: 'Overview of active campaigns, pipeline velocity, and candidate intelligence' },
  '/dashboard/candidates': { title: 'Talent Pool & Pipeline', subtitle: 'Demographically redacted candidate screening, rubric scoring, and shortlist decisions' },
  '/dashboard/jobs': { title: 'Positions & Rubrics', subtitle: 'Job requisition specifications, required competencies, and 5-pillar scoring rubrics' },
  '/dashboard/copilot': { title: 'AI Copilot Workspace', subtitle: 'Conversational multi-agent recruiting copilot with LangGraph supervisor' },
  '/dashboard/compare': { title: 'Candidate Comparison Matrix', subtitle: 'Side-by-side comparative rubric evaluation against active role requirements' },
  '/dashboard/interviews': { title: 'Interview Pipeline & Schedule', subtitle: 'Candidate interview slots, video meeting coordinates, and interviewer feedback' },
  '/dashboard/outreach': { title: 'Outreach & Dispatcher', subtitle: 'Context-aware candidate email drafting and human-gated outreach dispatch' },
};

export default function AppHeader({ onOpenMobileMenu, onOpenSettings }: AppHeaderProps) {
  const pathname = usePathname() || '/dashboard';
  const { isBlindHiring, setIsBlindHiring, apiConnected, jd } = useRecruitment();
  const { profile } = useAuth();

  const currentMeta = PAGE_TITLES[pathname] || {
    title: 'Workspace',
    subtitle: jd?.role ? `Active Position: ${jd.role}` : 'Recruitment intelligence dashboard'
  };

  return (
    <header className="h-16 px-4 md:px-6 bg-white/90 backdrop-blur-md border-b border-slate-200/80 flex items-center justify-between sticky top-0 z-20 select-none">
      {/* Left: Mobile hamburger & Page Title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="md:hidden p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          aria-label="Open mobile navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex flex-col truncate">
          <div className="flex items-center gap-2 truncate">
            <h1 className="text-sm md:text-base font-bold text-slate-900 tracking-tight truncate">
              {currentMeta.title}
            </h1>
            {jd?.role && (
              <span className="hidden lg:inline-flex text-[10px] bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-md border border-slate-200 truncate">
                Role: {jd.role}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 truncate hidden sm:block">
            {currentMeta.subtitle}
          </p>
        </div>
      </div>

      {/* Right: Actions, Blind Mode, Health Badge, Settings */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Blind Hiring Mode Toggle */}
        <button
          type="button"
          onClick={() => setIsBlindHiring(!isBlindHiring)}
          className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
            isBlindHiring
              ? 'bg-amber-50 text-amber-900 border-amber-300 shadow-2xs'
              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
          }`}
          title="Toggle Blind Hiring (Redacts candidate demographic PII before scoring)"
        >
          {isBlindHiring ? <EyeOff className="w-3.5 h-3.5 text-amber-700" /> : <Eye className="w-3.5 h-3.5 text-slate-400" />}
          <span className="hidden xs:inline">{isBlindHiring ? 'Blind Mode: ON' : 'Blind Mode: OFF'}</span>
          <span className="xs:hidden">{isBlindHiring ? 'Blind' : 'Standard'}</span>
        </button>

        {/* API Status Badge */}
        <div className="hidden md:flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200 text-[10px]">
          <span className={`w-1.5 h-1.5 rounded-full ${apiConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          <span className="text-slate-500 font-mono font-bold">
            {apiConnected ? 'API: ONLINE' : 'API: OFFLINE'}
          </span>
        </div>

        {/* Settings button */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="p-2 text-slate-500 hover:text-brand-primary hover:bg-indigo-50 border border-slate-200 rounded-xl transition-all cursor-pointer"
          title="Account & Profile Settings"
          aria-label="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
