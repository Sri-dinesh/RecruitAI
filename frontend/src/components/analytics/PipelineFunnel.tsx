'use client';
import { motion } from 'framer-motion';
import type { PipelineStage } from '@/lib/analyticsTypes';

const STAGE_COLORS: Record<string, string> = {
  'New':                  '#6366f1',
  'Shortlisted':          '#8b5cf6',
  'Interview Scheduled':  '#06b6d4',
  'Interviewed':          '#0ea5e9',
  'Offered':              '#10b981',
  'Rejected':             '#f43f5e',
};

interface PipelineFunnelProps {
  data: PipelineStage[];
}

export default function PipelineFunnel({ data }: PipelineFunnelProps) {
  const max = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="flex flex-col gap-2.5">
      {data.map((stage, i) => {
        const color = STAGE_COLORS[stage.stage] ?? '#6366f1';
        const widthPct = (stage.count / max) * 100;

        return (
          <motion.div
            key={stage.stage}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: i * 0.06 }}
            className="flex items-center gap-3"
          >
            {/* Label */}
            <div className="w-36 shrink-0 text-right">
              <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>
                {stage.stage}
              </span>
            </div>

            {/* Bar */}
            <div className="flex-1 h-7 rounded-md overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${widthPct}%` }}
                transition={{ duration: 0.8, delay: i * 0.06 + 0.2, ease: 'easeOut' }}
                className="h-full rounded-md flex items-center px-3"
                style={{ background: `${color}33`, borderRight: `2px solid ${color}` }}
              />
              <span
                className="absolute inset-0 flex items-center px-3 text-xs font-semibold"
                style={{ color }}
              >
                {stage.count}
              </span>
            </div>

            {/* Percentage */}
            <div className="w-14 shrink-0 text-right">
              <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {stage.percentage}%
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
