'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Users, Briefcase, CalendarCheck, TrendingUp, Target,
  BarChart3, MessageSquare, ArrowUpRight, RefreshCw,
  Download, ChevronLeft, LogOut, Star, Zap, Clock,
  Trophy, Bot, Activity, ArrowUp, ArrowDown, ArrowUpDown
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { useAuth } from '@/context/AuthContext';
import AuthModal from '@/components/AuthModal';
import { fetchWithAuth } from '@/lib/apiClient';
import Logo from '@/components/brand/Logo';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionSummary {
  id: string;
  title: string;
  created_at?: string;
  job_id?: string;
}

interface SessionDetail {
  id: string;
  title: string;
  created_at?: string;
  jd_structured?: {
    role: string;
    required_skills: string[];
    experience_years: number;
    status?: string;
  } | null;
  resumes?: Candidate[];
  last_shortlist?: Candidate[] | null;
  scheduled_interviews?: Interview[] | null;
}

interface Candidate {
  candidate_id: string;
  name: string;
  match_score?: number;
  matched_skills?: string[];
  gaps?: string[];
  experience_years?: number;
}

interface Interview {
  candidate_name: string;
  slot: string;
}

// Aggregated analytics state
interface Analytics {
  totalCandidates: number;
  totalJobs: number;
  totalShortlisted: number;
  totalInterviews: number;
  avgMatchScore: number | null;
  screeningRate: number | null;
  interviewRate: number | null;
  totalSessions: number;
  skillDemand: { skill: string; count: number }[];
  pipeline: { stage: string; count: number }[];
  sessionActivity: { name: string; candidates: number; shortlisted: number }[];
  recentCandidates: { name: string; score: number | undefined; session: string }[];
  upcomingInterviews: { candidate: string; slot: string; session: string }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 1000) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    let start = 0;
    const step = Math.ceil(target / (duration / 16));
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(start);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label, value, suffix = '', icon: Icon, color, description, delay = 0, decimals = 0
}: {
  label: string; value: number | null; suffix?: string;
  icon: React.ElementType; color: string; description?: string;
  delay?: number; decimals?: number;
}) {
  const animated = useCountUp(value ?? 0);
  const display = value === null ? '—' : `${decimals > 0 ? (value).toFixed(decimals) : animated}${suffix}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
        <div className={`flex items-center justify-center w-8 h-8 rounded-xl`} style={{ background: `${color}15` }}>
          <Icon size={15} style={{ color }} />
        </div>
      </div>
      <div className="text-3xl font-extrabold text-slate-900 tracking-tight">{display}</div>
      {description && (
        <div className="text-xs text-slate-400">{description}</div>
      )}
    </motion.div>
  );
}

function SectionCard({
  title, children, className = '', action
}: {
  title: string; children: React.ReactNode; className?: string; action?: React.ReactNode;
}) {
  return (
    <div className={`bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-slate-100 rounded-xl animate-pulse ${className}`} />;
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center py-10 text-xs text-slate-400 italic text-center">{msg}</div>
  );
}

// ─── Pipeline funnel ──────────────────────────────────────────────────────────
const STAGE_COLORS: Record<string, string> = {
  'Ingested': '#6366f1',
  'Shortlisted': '#8b5cf6',
  'Interviewed': '#06b6d4',
  'Rejected': '#f43f5e',
};

function PipelineFunnel({ data }: { data: { stage: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex flex-col gap-2.5">
      {data.map((item, i) => {
        const color = STAGE_COLORS[item.stage] ?? '#1B2A4A';
        const pct = Math.round((item.count / max) * 100);
        return (
          <motion.div
            key={item.stage}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: i * 0.07 }}
            className="flex items-center gap-3"
          >
            <span className="w-24 text-right text-xs font-medium text-slate-500 shrink-0">{item.stage}</span>
            <div className="flex-1 h-6 rounded-lg overflow-hidden bg-slate-100 relative">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.7, delay: i * 0.07 + 0.2, ease: 'easeOut' }}
                className="h-full rounded-lg"
                style={{ background: `${color}25`, borderRight: `2px solid ${color}` }}
              />
              <span className="absolute inset-0 flex items-center px-2.5 text-xs font-bold" style={{ color }}>
                {item.count}
              </span>
            </div>
            <span className="w-10 text-right text-[10px] font-mono text-slate-400 shrink-0">
              {max > 0 ? Math.round((item.count / data[0]?.count || 1) * 100) : 0}%
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Recharts custom tooltip ──────────────────────────────────────────────────
const LightTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-slate-700">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

// ─── Jobs sortable table ──────────────────────────────────────────────────────
function SessionsTable({ sessions }: { sessions: { name: string; candidates: number; shortlisted: number }[] }) {
  const [sort, setSort] = useState<'name' | 'candidates' | 'shortlisted'>('candidates');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const toggle = (col: typeof sort) => {
    if (col === sort) setDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSort(col); setDir('desc'); }
  };

  const sorted = [...sessions].sort((a, b) => {
    const av = a[sort]; const bv = b[sort];
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  const SortIco = ({ col }: { col: typeof sort }) =>
    sort !== col ? <ArrowUpDown size={10} className="text-slate-300" /> :
    dir === 'asc' ? <ArrowUp size={10} className="text-brand-primary" /> : <ArrowDown size={10} className="text-brand-primary" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-slate-100">
            {[
              { key: 'name', label: 'Campaign' },
              { key: 'candidates', label: 'Candidates' },
              { key: 'shortlisted', label: 'Shortlisted' },
            ].map(col => (
              <th
                key={col.key}
                onClick={() => toggle(col.key as typeof sort)}
                className="px-3 py-2.5 text-left font-bold uppercase tracking-wide text-slate-400 cursor-pointer hover:text-slate-600 transition-colors"
              >
                <span className="flex items-center gap-1.5">{col.label} <SortIco col={col.key as typeof sort} /></span>
              </th>
            ))}
            <th className="px-3 py-2.5 text-left font-bold uppercase tracking-wide text-slate-400">Shortlist Rate</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400 italic">No campaigns found.</td></tr>
          )}
          {sorted.map((row, i) => {
            const rate = row.candidates > 0 ? Math.round((row.shortlisted / row.candidates) * 100) : 0;
            return (
              <motion.tr
                key={row.name + i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.04 }}
                className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
              >
                <td className="px-3 py-3 font-semibold text-slate-800 max-w-[180px] truncate">{row.name}</td>
                <td className="px-3 py-3 font-mono text-slate-600">{row.candidates}</td>
                <td className="px-3 py-3 font-mono text-indigo-600 font-semibold">{row.shortlisted}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${rate}%`,
                          background: rate >= 50 ? '#10b981' : rate >= 25 ? '#f59e0b' : '#f43f5e'
                        }}
                      />
                    </div>
                    <span className="font-mono text-slate-500">{rate}%</span>
                  </div>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const buildAnalytics = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // 1. Fetch all sessions list
      const sessRes = await fetchWithAuth('/api/sessions');
      if (!sessRes.ok) throw new Error('Failed to fetch sessions');
      const sessions: SessionSummary[] = await sessRes.json();

      // 2. Fetch detail for each session in parallel (cap at 20 most recent)
      const recentSessions = sessions.slice(0, 20);
      const details: SessionDetail[] = await Promise.all(
        recentSessions.map(async (s) => {
          try {
            const r = await fetchWithAuth(`/api/sessions/${s.id}`);
            if (!r.ok) return { id: s.id, title: s.title };
            return await r.json();
          } catch { return { id: s.id, title: s.title }; }
        })
      );

      // 3. Aggregate across all sessions
      const allCandidates: (Candidate & { sessionTitle: string })[] = [];
      const allShortlisted: (Candidate & { sessionTitle: string })[] = [];
      const allInterviews: (Interview & { sessionTitle: string })[] = [];
      const skillMap: Record<string, number> = {};
      const sessionActivity: Analytics['sessionActivity'] = [];

      for (const detail of details) {
        const cands = detail.resumes ?? [];
        const shorts = detail.last_shortlist ?? [];
        const ivs = detail.scheduled_interviews ?? [];
        const title = detail.title || 'Campaign';

        cands.forEach(c => allCandidates.push({ ...c, sessionTitle: title }));
        shorts.forEach(c => allShortlisted.push({ ...c, sessionTitle: title }));
        ivs.forEach(iv => allInterviews.push({ ...iv, sessionTitle: title }));

        // Skills from JD
        if (detail.jd_structured?.required_skills) {
          for (const sk of detail.jd_structured.required_skills) {
            skillMap[sk] = (skillMap[sk] ?? 0) + 1;
          }
        }

        if (cands.length > 0 || shorts.length > 0) {
          sessionActivity.push({ name: title, candidates: cands.length, shortlisted: shorts.length });
        }
      }

      // 4. Compute KPIs
      const totalCandidates = allCandidates.length;
      const totalShortlisted = allShortlisted.length;
      const totalInterviews = allInterviews.length;

      const scoredCandidates = allShortlisted.filter(c => c.match_score != null && c.match_score > 0);
      const avgMatchScore = scoredCandidates.length > 0
        ? Math.round(scoredCandidates.reduce((sum, c) => sum + (c.match_score ?? 0), 0) / scoredCandidates.length * 10) / 10
        : null;

      const screeningRate = totalCandidates > 0
        ? Math.round((totalShortlisted / totalCandidates) * 1000) / 10
        : null;

      const interviewRate = totalShortlisted > 0
        ? Math.round((totalInterviews / totalShortlisted) * 1000) / 10
        : null;

      // 5. Skills
      const skillDemand = Object.entries(skillMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 12)
        .map(([skill, count]) => ({ skill, count }));

      // 6. Pipeline
      const pipeline = [
        { stage: 'Ingested', count: totalCandidates },
        { stage: 'Shortlisted', count: totalShortlisted },
        { stage: 'Interviewed', count: totalInterviews },
        { stage: 'Rejected', count: Math.max(0, totalCandidates - totalShortlisted) },
      ];

      // 7. Recent candidates (top 8 by score)
      const recentCandidates = allShortlisted
        .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0))
        .slice(0, 8)
        .map(c => ({ name: c.name, score: c.match_score, session: c.sessionTitle }));

      // 8. Upcoming interviews
      const upcomingInterviews = allInterviews
        .sort((a, b) => new Date(a.slot).getTime() - new Date(b.slot).getTime())
        .slice(0, 6)
        .map(iv => ({ candidate: iv.candidate_name, slot: iv.slot, session: iv.sessionTitle }));

      setAnalytics({
        totalCandidates,
        totalJobs: details.filter(d => d.jd_structured?.role).length,
        totalShortlisted,
        totalInterviews,
        avgMatchScore,
        screeningRate,
        interviewRate,
        totalSessions: sessions.length,
        skillDemand,
        pipeline,
        sessionActivity,
        recentCandidates,
        upcomingInterviews,
      });
      setLastUpdated(new Date());
    } catch (err) {
      console.error('[analytics]', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user) buildAnalytics();
  }, [user, buildAnalytics]);

  // ─── Auth gate ──────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-brand-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!user) return <AuthModal isGate />;

  const exportCSV = () => {
    if (!analytics) return;
    const rows = [
      ['Metric', 'Value'],
      ['Total Candidates', analytics.totalCandidates],
      ['Active Jobs', analytics.totalJobs],
      ['Shortlisted', analytics.totalShortlisted],
      ['Interviews', analytics.totalInterviews],
      ['Avg Match Score', analytics.avgMatchScore ?? '—'],
      ['Screening Rate (%)', analytics.screeningRate ?? '—'],
      ['Interview Rate (%)', analytics.interviewRate ?? '—'],
      ['Total Sessions', analytics.totalSessions],
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recruitai_analytics_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const kpiCards = analytics ? [
    { label: 'Total Resumes',     value: analytics.totalCandidates,  icon: Users,         color: '#6366f1', desc: 'candidates ingested' },
    { label: 'Active Positions',  value: analytics.totalJobs,         icon: Briefcase,     color: '#1B2A4A', desc: 'job descriptions loaded' },
    { label: 'Shortlisted',       value: analytics.totalShortlisted,  icon: Star,          color: '#8b5cf6', desc: 'candidates shortlisted' },
    { label: 'Interviews',        value: analytics.totalInterviews,   icon: CalendarCheck, color: '#10b981', desc: 'interviews scheduled' },
    { label: 'Avg Match Score',   value: analytics.avgMatchScore,     icon: Target,        color: '#f59e0b', desc: 'across shortlisted', suffix: '', decimals: 1 },
    { label: 'Screening Rate',    value: analytics.screeningRate,     icon: TrendingUp,    color: '#06b6d4', suffix: '%', decimals: 1, desc: 'shortlisted of applied' },
    { label: 'Interview Rate',    value: analytics.interviewRate,     icon: ArrowUpRight,  color: '#ec4899', suffix: '%', decimals: 1, desc: 'of shortlisted' },
    { label: 'AI Campaigns',      value: analytics.totalSessions,     icon: MessageSquare, color: '#14b8a6', desc: 'hiring sessions' },
  ] : [];

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      {/* ── Top Nav (matches dashboard style) ── */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Logo href="/" size="sm" />
          <span className="text-slate-200">|</span>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-brand-primary transition-colors"
          >
            <ChevronLeft size={13} />
            Dashboard
          </Link>
          <span className="text-slate-200">|</span>
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-brand-primary" />
            <span className="text-sm font-extrabold text-slate-800">Analytics</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh */}
          <button
            onClick={buildAnalytics}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 border border-slate-200 hover:border-brand-primary hover:text-brand-primary transition-all disabled:opacity-40"
          >
            <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Refresh'}
          </button>

          {/* Export */}
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black text-white bg-brand-primary hover:bg-indigo-700 transition-all shadow-sm"
          >
            <Download size={12} />
            Export CSV
          </button>

          {/* User */}
          <div className="flex items-center gap-2 ml-2 pl-3 border-l border-slate-200">
            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-brand-primary font-bold text-xs">
              {user?.user_metadata?.full_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <span className="text-xs text-slate-500 hidden sm:block">{user?.email}</span>
            <button
              onClick={logout}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Page body ── */}
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
        {/* Page title */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="flex items-center gap-2 mb-1">
            <Activity size={18} className="text-brand-primary" />
            <h1 className="text-xl font-extrabold text-slate-900">Recruitment Intelligence</h1>
          </div>
          <p className="text-sm text-slate-400">
            Live pipeline metrics aggregated from your {analytics?.totalSessions ?? '—'} hiring campaign{(analytics?.totalSessions ?? 0) !== 1 ? 's' : ''}.
            {lastUpdated && <span className="ml-2 text-[11px]">Last updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          </p>
        </motion.div>

        {/* ── KPI Cards ── */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {kpiCards.map((card, i) => (
              <KpiCard
                key={card.label}
                label={card.label}
                value={card.value as number | null}
                icon={card.icon}
                color={card.color}
                suffix={card.suffix}
                decimals={card.decimals}
                description={card.desc}
                delay={i * 0.05}
              />
            ))}
          </div>
        )}

        {/* ── Pipeline Funnel (full width) ── */}
        <SectionCard title="Recruitment Pipeline">
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>
          ) : (analytics?.pipeline && analytics.pipeline[0]?.count > 0) ? (
            <PipelineFunnel data={analytics.pipeline} />
          ) : (
            <EmptyState msg="No pipeline data yet. Upload resumes and run a screening via the AI Co-Pilot to see your funnel." />
          )}
        </SectionCard>

        {/* ── Two-column: Session Activity Chart + Top Skills ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard title="Candidates Per Campaign">
            {loading ? <Skeleton className="h-52" /> :
            (analytics?.sessionActivity ?? []).length === 0 ? (
              <EmptyState msg="Run at least one hiring campaign to see this chart." />
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={analytics!.sessionActivity.slice(0, 8)} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#94a3b8', fontSize: 9 }}
                    axisLine={false} tickLine={false}
                    tickFormatter={v => v.length > 12 ? v.slice(0, 12) + '…' : v}
                  />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<LightTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="candidates" name="Candidates" fill="#e0e7ff" radius={[4, 4, 0, 0]}>
                    {analytics!.sessionActivity.slice(0, 8).map((_, i) => (
                      <Cell key={i} fill={i % 2 === 0 ? '#c7d2fe' : '#a5b4fc'} />
                    ))}
                  </Bar>
                  <Bar dataKey="shortlisted" name="Shortlisted" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <SectionCard title="Top Demanded Skills">
            {loading ? <Skeleton className="h-52" /> :
            (analytics?.skillDemand ?? []).length === 0 ? (
              <EmptyState msg="Load job descriptions in the AI Co-Pilot to see skill demand." />
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <BarChart
                  layout="vertical"
                  data={analytics!.skillDemand.slice(0, 8)}
                  margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="skill" width={80} tick={{ fill: '#475569', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<LightTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="count" name="Job Postings" radius={[0, 4, 4, 0]}>
                    {analytics!.skillDemand.slice(0, 8).map((_, i) => {
                      const intensity = 0.35 + (0.65 * (1 - i / 8));
                      return <Cell key={i} fill={`rgba(99,102,241,${intensity})`} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>

        {/* ── Hiring Velocity ── */}
        <SectionCard title="Hiring Velocity">
          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: Zap,    label: 'Screening Rate',   value: analytics?.screeningRate  != null ? `${analytics.screeningRate}%`  : '—', color: '#6366f1', sub: 'shortlisted of ingested' },
              { icon: Clock,  label: 'Interview Rate',   value: analytics?.interviewRate  != null ? `${analytics.interviewRate}%`  : '—', color: '#06b6d4', sub: 'interviews of shortlisted' },
              { icon: Trophy, label: 'Avg Match Score',  value: analytics?.avgMatchScore  != null ? `${analytics.avgMatchScore}`   : '—', color: '#10b981', sub: 'across shortlisted' },
            ].map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: i * 0.1 }}
                className="flex flex-col items-center gap-2 py-5 rounded-2xl border border-slate-200 bg-slate-50"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-full" style={{ background: `${item.color}15` }}>
                  <item.icon size={18} style={{ color: item.color }} />
                </div>
                <div className="text-2xl font-extrabold text-slate-900">{item.value}</div>
                <div className="text-xs font-semibold text-slate-700">{item.label}</div>
                <div className="text-[10px] text-slate-400 text-center">{item.sub}</div>
              </motion.div>
            ))}
          </div>
        </SectionCard>

        {/* ── Sessions table ── */}
        <SectionCard
          title="Campaign Summary"
          action={
            <span className="text-[10px] font-mono text-slate-400">
              {analytics?.sessionActivity.length ?? 0} campaigns
            </span>
          }
        >
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <SessionsTable sessions={analytics?.sessionActivity ?? []} />
          )}
        </SectionCard>

        {/* ── Two-column: Top Candidates + Upcoming Interviews ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard title="Top Shortlisted Candidates">
            {loading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div> :
            (analytics?.recentCandidates ?? []).length === 0 ? (
              <EmptyState msg="Shortlist candidates via the AI Co-Pilot to see them here." />
            ) : (
              <div className="flex flex-col divide-y divide-slate-50">
                {analytics!.recentCandidates.map((c, i) => {
                  const score = c.score ?? 0;
                  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#94a3b8';
                  return (
                    <motion.div
                      key={c.name + i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-3 py-2.5"
                    >
                      <div className="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center text-brand-primary font-bold text-xs shrink-0">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{c.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{c.session}</p>
                      </div>
                      {c.score != null && c.score > 0 && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${c.score}%`, background: color }} />
                          </div>
                          <span className="text-xs font-bold font-mono" style={{ color }}>{c.score}</span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Upcoming Interviews">
            {loading ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div> :
            (analytics?.upcomingInterviews ?? []).length === 0 ? (
              <EmptyState msg="No interviews scheduled. Approve a scheduling action in the AI Co-Pilot." />
            ) : (
              <div className="flex flex-col divide-y divide-slate-50">
                {analytics!.upcomingInterviews.map((iv, i) => (
                  <motion.div
                    key={iv.candidate + i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 py-2.5"
                  >
                    <div className="w-7 h-7 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                      <CalendarCheck size={13} className="text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{iv.candidate}</p>
                      <p className="text-[10px] text-slate-400 truncate">{iv.session}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-100">
                        {new Date(iv.slot).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── Bottom CTA ── */}
        <div className="flex items-center justify-center pb-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-black text-white bg-brand-primary hover:bg-indigo-700 shadow-sm transition-all hover:-translate-y-[1px] active:translate-y-0"
          >
            <Bot size={15} />
            Back to AI Co-Pilot
          </Link>
        </div>
      </div>
    </main>
  );
}
