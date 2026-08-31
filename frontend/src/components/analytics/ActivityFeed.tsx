'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, RefreshCw, Calendar, CheckCircle } from 'lucide-react';
import type { ActivityEvent } from '@/lib/analyticsTypes';

interface ActivityFeedProps {
  events: ActivityEvent[];
}

const EVENT_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  candidate_added:       { icon: UserPlus,      color: '#6366f1', label: 'New Resume'         },
  application_updated:   { icon: RefreshCw,     color: '#8b5cf6', label: 'Status Update'      },
  interview_scheduled:   { icon: Calendar,      color: '#06b6d4', label: 'Interview Scheduled' },
  offer_made:            { icon: CheckCircle,   color: '#10b981', label: 'Offer Extended'      },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ActivityFeed({ events }: ActivityFeedProps) {
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
        No activity yet. Start a hiring campaign to see events here.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 max-h-72 overflow-y-auto pr-1"
      style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
      <AnimatePresence>
        {events.map((event, i) => {
          const cfg = EVENT_CONFIG[event.event_type] ?? EVENT_CONFIG.candidate_added;
          const Icon = cfg.icon;
          return (
            <motion.div
              key={event.entity_id + i}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
              className="flex items-start gap-3 px-3 py-2.5 rounded-lg group hover:bg-white/5 transition-colors"
            >
              {/* Icon */}
              <div
                className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0 mt-0.5"
                style={{ background: `${cfg.color}22`, border: `1px solid ${cfg.color}33` }}
              >
                <Icon size={13} style={{ color: cfg.color }} />
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {event.description}
                </p>
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  {cfg.label} · {timeAgo(event.occurred_at)}
                </span>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
