'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { JobSummaryRow } from '@/lib/analyticsTypes';

type SortKey = keyof JobSummaryRow;

interface JobsTableProps {
  data: JobSummaryRow[];
}

const STATUS_STYLES: Record<string, string> = {
  active:   'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  draft:    'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  closed:   'bg-slate-500/10 text-slate-400 border-slate-500/20',
  archived: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>;
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 75 ? '#10b981' : pct >= 55 ? '#f59e0b' : '#f43f5e';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-mono" style={{ color }}>{score}</span>
    </div>
  );
}

export default function JobsTable({ data }: JobsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey]; const bv = b[sortKey];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown size={11} className="opacity-30" />;
    return sortDir === 'asc' ? <ArrowUp size={11} className="text-indigo-400" /> : <ArrowDown size={11} className="text-indigo-400" />;
  };

  const cols: { key: SortKey; label: string; sortable?: boolean }[] = [
    { key: 'title', label: 'Job Title', sortable: true },
    { key: 'status', label: 'Status' },
    { key: 'total_applied', label: 'Applied', sortable: true },
    { key: 'total_shortlisted', label: 'Shortlisted', sortable: true },
    { key: 'total_interviewed', label: 'Interviewed', sortable: true },
    { key: 'total_offered', label: 'Offered', sortable: true },
    { key: 'avg_match_score', label: 'Avg Score', sortable: true },
    { key: 'created_at', label: 'Created', sortable: true },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            {cols.map(col => (
              <th
                key={col.key}
                className={`px-4 py-3 text-left text-xs font-medium tracking-wide ${col.sortable ? 'cursor-pointer hover:opacity-80' : ''}`}
                style={{ color: 'rgba(255,255,255,0.4)' }}
                onClick={() => col.sortable && handleSort(col.key)}
              >
                <span className="flex items-center gap-1.5">
                  {col.label}
                  {col.sortable && <SortIcon col={col.key} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr><td colSpan={8} className="px-4 py-8 text-center text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>No jobs found. Create a hiring campaign to get started.</td></tr>
          )}
          {sorted.map((row, i) => (
            <motion.tr
              key={row.job_id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.04 }}
              className="group"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
            >
              <td className="px-4 py-3 font-medium" style={{ color: '#e2e8f0' }}>{row.title}</td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${STATUS_STYLES[row.status] ?? STATUS_STYLES.draft}`}>
                  {row.status}
                </span>
              </td>
              <td className="px-4 py-3 text-xs font-mono" style={{ color: 'rgba(255,255,255,0.6)' }}>{row.total_applied}</td>
              <td className="px-4 py-3 text-xs font-mono" style={{ color: '#818cf8' }}>{row.total_shortlisted}</td>
              <td className="px-4 py-3 text-xs font-mono" style={{ color: '#22d3ee' }}>{row.total_interviewed}</td>
              <td className="px-4 py-3 text-xs font-mono" style={{ color: '#34d399' }}>{row.total_offered}</td>
              <td className="px-4 py-3"><ScoreBar score={row.avg_match_score} /></td>
              <td className="px-4 py-3 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
