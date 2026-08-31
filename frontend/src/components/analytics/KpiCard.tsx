'use client';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: number | null;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  trend?: number | null;   // positive = up, negative = down
  trendLabel?: string;
  icon: LucideIcon;
  accentColor: string;     // e.g. '#6366f1'
  delay?: number;
  description?: string;
}

function useCountUp(target: number, duration: number = 1200, decimals: number = 0) {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // cubic ease-out
      setCount(parseFloat((eased * target).toFixed(decimals)));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, decimals]);

  return count;
}

export default function KpiCard({
  label, value, suffix = '', prefix = '', decimals = 0,
  trend, trendLabel, icon: Icon, accentColor, delay = 0, description,
}: KpiCardProps) {
  const animated = useCountUp(value ?? 0, 1200, decimals);
  const displayVal = value === null ? '—' : `${prefix}${animated}${suffix}`;
  const isPositive = trend !== null && trend !== undefined && trend >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="relative overflow-hidden rounded-xl p-5 flex flex-col gap-3 group cursor-default select-none"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Subtle accent glow in corner */}
      <div
        className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-10 group-hover:opacity-20 transition-opacity duration-500"
        style={{ background: accentColor, filter: 'blur(20px)' }}
      />

      {/* Icon + Label row */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {label}
        </span>
        <div
          className="flex items-center justify-center w-8 h-8 rounded-lg"
          style={{ background: `${accentColor}22`, border: `1px solid ${accentColor}44` }}
        >
          <Icon size={15} style={{ color: accentColor }} />
        </div>
      </div>

      {/* Value */}
      <div className="text-3xl font-bold tracking-tight" style={{ color: '#f1f5f9', fontFamily: 'var(--font-dm-sans)' }}>
        {displayVal}
      </div>

      {/* Trend + description row */}
      <div className="flex items-center gap-2">
        {trend !== undefined && trend !== null && (
          <span
            className="text-xs font-semibold px-1.5 py-0.5 rounded"
            style={{
              color: isPositive ? '#34d399' : '#f87171',
              background: isPositive ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
            }}
          >
            {isPositive ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
        {(trendLabel || description) && (
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {trendLabel || description}
          </span>
        )}
      </div>
    </motion.div>
  );
}
