'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, 
  Users, 
  Briefcase, 
  Bot, 
  GitCompare, 
  Calendar, 
  Mail, 
  BarChart3, 
  Settings, 
  LogOut, 
  ChevronDown, 
  Plus, 
  Trash2, 
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import Logo from '@/components/brand/Logo';
import { useAuth } from '@/context/AuthContext';
import { useRecruitment } from '@/context/RecruitmentContext';

interface AppSidebarProps {
  onOpenSettings: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/candidates', label: 'Candidates', icon: Users, badgeKey: 'candidates' },
  { href: '/dashboard/jobs', label: 'Positions', icon: Briefcase },
  { href: '/dashboard/copilot', label: 'AI Copilot', icon: Bot, isAgentic: true },
  { href: '/dashboard/compare', label: 'Compare', icon: GitCompare },
  { href: '/dashboard/interviews', label: 'Interviews', icon: Calendar, badgeKey: 'interviews' },
  { href: '/dashboard/outreach', label: 'Outreach', icon: Mail },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
];

export default function AppSidebar({ onOpenSettings, isOpenMobile, onCloseMobile }: AppSidebarProps) {
  const pathname = usePathname();
  const { user, profile, logout } = useAuth();
  const { 
    sessions, 
    activeSessionId, 
    setActiveSessionId, 
    createSession, 
    deleteSession,
    resetAllData,
    candidates,
    scheduledInterviews
  } = useRecruitment();

  const [campaignsOpen, setCampaignsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const getBadge = (key?: string) => {
    if (key === 'candidates' && candidates.length > 0) return candidates.length;
    if (key === 'interviews' && scheduledInterviews.length > 0) return scheduledInterviews.length;
    return null;
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const content = (
    <div className={`h-full flex flex-col justify-between bg-white border-r border-slate-200 shadow-xs transition-all duration-300 select-none ${
      isCollapsed ? 'w-20' : 'w-64'
    }`}>
      {/* 1. Header & Brand */}
      <div>
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            {!isCollapsed ? (
              <Logo href="/dashboard" size="sm" priority />
            ) : (
              <Logo variant="mark" size="sm" priority />
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden md:flex p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* 2. Active Campaign Switcher Card */}
        <div className="p-3 border-b border-slate-100 bg-slate-50/50">
          <div className="relative">
            <button
              type="button"
              onClick={() => setCampaignsOpen(!campaignsOpen)}
              className="w-full text-left p-2 rounded-xl bg-white border border-slate-200/80 hover:border-slate-300 shadow-2xs transition-all flex items-center justify-between gap-2 cursor-pointer group"
            >
              <div className="flex items-center gap-2 overflow-hidden min-w-0">
                <div className="w-6 h-6 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-brand-primary shrink-0">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                {!isCollapsed && (
                  <div className="flex flex-col truncate min-w-0">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Campaign</span>
                    <span className="text-xs font-semibold text-slate-800 truncate group-hover:text-brand-primary transition-colors">
                      {activeSession?.title || 'Active Campaign'}
                    </span>
                  </div>
                )}
              </div>
              {!isCollapsed && (
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${campaignsOpen ? 'rotate-180' : ''}`} />
              )}
            </button>

            {/* Dropdown for campaign sessions */}
            <AnimatePresence>
              {campaignsOpen && !isCollapsed && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-1.5 max-h-56 overflow-y-auto custom-scrollbar"
                >
                  <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Campaigns</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await createSession();
                        setCampaignsOpen(false);
                      }}
                      className="text-[11px] text-brand-primary font-semibold hover:underline flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> New
                    </button>
                  </div>
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      className={`flex items-center justify-between p-2 rounded-lg text-xs transition-colors cursor-pointer group ${
                        s.id === activeSessionId ? 'bg-indigo-50/70 text-brand-primary font-semibold' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span
                        onClick={() => {
                          setActiveSessionId(s.id);
                          setCampaignsOpen(false);
                        }}
                        className="truncate flex-1"
                      >
                        {s.title || 'Untitled Campaign'}
                      </span>
                      {sessions.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(s.id);
                          }}
                          className="text-slate-300 hover:text-rose-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity rounded cursor-pointer"
                          title="Delete campaign"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="pt-2 mt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={async () => {
                        if (window.confirm('Are you sure you want to completely reset all campaigns, candidates, and workspace data for a clean fresh start?')) {
                          await resetAllData();
                          setCampaignsOpen(false);
                        }
                      }}
                      className="w-full text-left text-[11px] text-rose-600 hover:text-rose-700 hover:bg-rose-50 p-2 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3 text-rose-500" /> Reset Workspace (Fresh Start)
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* 3. Navigation Links */}
        <nav className="p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
            const badge = getBadge(item.badgeKey);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onCloseMobile}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group cursor-pointer ${
                  isActive
                    ? 'text-brand-primary bg-indigo-50/60 font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
                title={isCollapsed ? item.label : undefined}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeNavIndicator"
                    className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-brand-primary rounded-r-full"
                    transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                  />
                )}
                <Icon className={`w-4 h-4 shrink-0 transition-colors ${
                  isActive ? 'text-brand-primary' : 'text-slate-400 group-hover:text-slate-700'
                }`} />

                {!isCollapsed && (
                  <div className="flex-1 flex items-center justify-between overflow-hidden">
                    <span className="truncate">{item.label}</span>
                    {item.isAgentic && (
                      <span className="text-[9px] bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.5 rounded-md border border-emerald-200">
                        AI
                      </span>
                    )}
                    {badge !== null && (
                      <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded-full">
                        {badge}
                      </span>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* 4. User Profile Footer */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/70">
        <div className="flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-2 overflow-hidden text-left flex-1 hover:bg-slate-200/50 p-1.5 -ml-1 rounded-xl transition-all cursor-pointer group"
            title="Edit Profile & Settings"
          >
            <div className="w-7 h-7 rounded-full overflow-hidden bg-indigo-100 flex items-center justify-center text-brand-primary font-bold text-xs shrink-0 border border-indigo-200/60">
              {profile?.avatar_url || user?.user_metadata?.avatar_url ? (
                <img 
                  src={profile?.avatar_url || user?.user_metadata?.avatar_url} 
                  alt="" 
                  className="w-full h-full object-cover" 
                />
              ) : (
                <span>
                  {(profile?.full_name || user?.user_metadata?.full_name || user?.email || 'U').charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            {!isCollapsed && (
              <div className="flex flex-col truncate">
                <span className="text-xs font-semibold text-slate-800 truncate group-hover:text-brand-primary transition-colors">
                  {profile?.full_name || user?.user_metadata?.full_name || 'Recruiter'}
                </span>
                <span className="text-[10px] text-slate-400 truncate">
                  {user?.email}
                </span>
              </div>
            )}
          </button>

          {!isCollapsed && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={onOpenSettings}
                className="p-1.5 text-slate-400 hover:text-brand-primary hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                title="Profile & Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={logout}
                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0 cursor-pointer"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:block shrink-0 h-screen sticky top-0 z-30">
        {content}
      </aside>

      {/* Mobile Slide-Over Drawer */}
      <AnimatePresence>
        {isOpenMobile && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMobile}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 md:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed inset-y-0 left-0 w-72 z-50 md:hidden"
            >
              {content}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
