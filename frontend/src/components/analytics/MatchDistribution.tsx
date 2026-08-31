'use client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer
} from 'recharts';
import type { MatchBucket } from '@/lib/analyticsTypes';

const BUCKET_COLORS: Record<string, string> = {
  'Excellent (90-100)': '#10b981',
  'Strong (75-89)':     '#34d399',
  'Good (60-74)':       '#f59e0b',
  'Fair (40-59)':       '#f97316',
  'Poor (0-39)':        '#f43f5e',
};

interface MatchDistributionProps {
  data: MatchBucket[];
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg px-3 py-2 text-xs shadow-xl"
      style={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }}>
      <p className="font-semibold">{d.payload.bucket}</p>
      <p style={{ color: BUCKET_COLORS[d.payload.bucket] ?? '#fff' }}>{d.value} candidates</p>
    </div>
  );
};

export default function MatchDistribution({ data }: MatchDistributionProps) {
  // Sort best-to-worst for display
  const sorted = [...data].sort((a, b) => b.min_score - a.min_score);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={sorted} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="bucket"
          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => v.split(' ')[0]}
        />
        <YAxis
          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} animationDuration={900}>
          {sorted.map((entry) => (
            <Cell key={entry.bucket} fill={BUCKET_COLORS[entry.bucket] ?? '#6366f1'} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
