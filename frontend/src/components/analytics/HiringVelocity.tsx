'use client';
import { motion } from 'framer-motion';
import { Clock, Zap, Trophy } from 'lucide-react';
import type { HiringVelocity } from '@/lib/analyticsTypes';

interface HiringVelocityProps {
  data: HiringVelocity;
}

interface VelocityMetricProps {
  icon: React.ElementType;
  label: string;
  value: number | null;
  color: string;
  delay: number;
}

function VelocityMetric({ icon: Icon, label, value, color, delay }: VelocityMetricProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay }}
      className="flex flex-col items-center gap-2 flex-1 py-4 rounded-xl"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div
        className="flex items-center justify-center w-10 h-10 rounded-full"
        style={{ background: `${color}22`, border: `1px solid ${color}44` }}
      >
        <Icon size={18} style={{ color }} />
      </div>
      <div className="text-2xl font-bold" style={{ color: '#f1f5f9' }}>
        {value !== null ? `${value}d` : '—'}
      </div>
      <div className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>
        {label}
      </div>
    </motion.div>
  );
}

export default function HiringVelocityPanel({ data }: HiringVelocityProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <VelocityMetric
          icon={Zap}
          label="Avg Days to Shortlist"
          value={data.avg_days_to_shortlist}
          color="#6366f1"
          delay={0}
        />
        <VelocityMetric
          icon={Clock}
          label="Avg Days to Interview"
          value={data.avg_days_to_interview}
          color="#06b6d4"
          delay={0.1}
        />
        <VelocityMetric
          icon={Trophy}
          label="Avg Days to Offer"
          value={data.avg_days_to_offer}
          color="#10b981"
          delay={0.2}
        />
      </div>
      {data.total_time_tracked > 0 && (
        <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
          Based on {data.total_time_tracked} tracked candidate{data.total_time_tracked !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
