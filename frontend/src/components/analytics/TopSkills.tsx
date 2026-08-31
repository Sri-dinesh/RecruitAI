'use client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import type { SkillDemand } from '@/lib/analyticsTypes';

interface TopSkillsProps {
  data: SkillDemand[];
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-xs shadow-xl"
      style={{ background: '#1e1e2e', border: '1px solid rgba(139,92,246,0.3)', color: '#e2e8f0' }}>
      <p className="font-semibold">{payload[0].payload.skill}</p>
      <p style={{ color: '#a78bfa' }}>{payload[0].value} job postings</p>
    </div>
  );
};

export default function TopSkills({ data }: TopSkillsProps) {
  const max = Math.max(...data.map(d => d.demand_count), 1);

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 32)}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="skill"
          width={90}
          tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Bar dataKey="demand_count" radius={[0, 4, 4, 0]} animationDuration={900}>
          {data.map((entry, i) => {
            const intensity = 0.4 + (0.6 * (entry.demand_count / max));
            return (
              <Cell
                key={entry.skill}
                fill={`rgba(139,92,246,${intensity})`}
              />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
