'use client';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import type { TimeSeriesPoint } from '@/lib/analyticsTypes';

interface CandidatesOverTimeProps {
  data: TimeSeriesPoint[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-xs shadow-xl"
      style={{ background: '#1e1e2e', border: '1px solid rgba(99,102,241,0.3)', color: '#e2e8f0' }}>
      <p className="font-semibold">{label}</p>
      <p style={{ color: '#818cf8' }}>{payload[0].value} candidates</p>
    </div>
  );
};

export default function CandidatesOverTime({ data }: CandidatesOverTimeProps) {
  const formatted = data.map(d => ({
    ...d,
    day: new Date(d.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={formatted} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="candidateGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="day"
          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#6366f1"
          strokeWidth={2}
          fill="url(#candidateGradient)"
          animationDuration={1000}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
