'use client';

import React from 'react';
import { motion } from 'framer-motion';

export const PLAY_STORE_URL =
  'https://play.google.com/apps/test/RQdaMVqUvGo/ahAO29uNQNV937LLxSItEhM9Mg2hXBl6tvuqb_ZLv6IvTd9zlC3rCnFqVaK9J8ZeWGHHPs2hsCp1U9_YsJUwUXXzEc';

export function GooglePlayIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={`${className} shrink-0`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.609 1.814L13.792 12 3.61 22.186A2.223 2.223 0 0 1 3 20.627V3.373c0-.6.223-1.16.609-1.559z"
        fill="#00C3FF"
      />
      <path
        d="M17.476 8.318l3.418 1.954c1.195.683 1.195 1.796 0 2.479l-3.418 1.954-2.613-2.613 2.613-2.774z"
        fill="#FFD400"
      />
      <path
        d="M3.61 22.186l10.182-10.186 3.684 3.684-12.182 6.961c-.605.346-1.196.184-1.684-.459z"
        fill="#FF334B"
      />
      <path
        d="M5.294 1.341l12.182 6.961-3.684 3.684L3.61 1.8A2.32 2.32 0 0 1 5.294 1.341z"
        fill="#00E676"
      />
    </svg>
  );
}

export interface PlayStoreBadgeProps {
  variant?: 'badge' | 'pill' | 'button' | 'banner';
  theme?: 'light' | 'dark';
  className?: string;
}

export default function PlayStoreBadge({
  variant = 'badge',
  theme = 'light',
  className = '',
}: PlayStoreBadgeProps) {
  if (variant === 'banner') {
    return (
      <motion.a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={`group inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-border bg-white hover:bg-[#faf9f7] hover:border-accent/40 shadow-2xs hover:shadow-xs transition-all text-xs font-medium text-muted ${className}`}
        aria-label="RecruitAI on Google Play Store"
      >
        <GooglePlayIcon className="w-4 h-4" />
        <span className="text-[#333333]">
          Also on Android:{' '}
          <strong className="text-foreground group-hover:text-accent font-semibold transition-colors">
            Get on Google Play
          </strong>
        </span>
        <span className="text-accent group-hover:translate-x-0.5 transition-transform">→</span>
      </motion.a>
    );
  }

  if (variant === 'pill') {
    return (
      <motion.a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all border shadow-2xs ${
          theme === 'dark'
            ? 'bg-neutral-900 hover:bg-neutral-800 text-white border-neutral-700'
            : 'bg-white hover:bg-[#faf9f7] text-[#111111] border-border hover:border-accent/40'
        } ${className}`}
        aria-label="Download RecruitAI on Google Play"
      >
        <GooglePlayIcon className="w-4 h-4" />
        <span className={theme === 'dark' ? 'text-white' : 'text-[#111111]'}>Android App</span>
      </motion.a>
    );
  }

  if (variant === 'button') {
    return (
      <motion.a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={`inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-md text-sm font-semibold transition-all border shadow-xs ${
          theme === 'dark'
            ? 'bg-white/10 hover:bg-white/20 text-white border-white/20'
            : 'bg-white hover:bg-[#faf9f7] text-foreground border-border hover:border-accent/40'
        } ${className}`}
        aria-label="Download RecruitAI on Google Play"
      >
        <GooglePlayIcon className="w-4 h-4" />
        <span>Get Android App</span>
      </motion.a>
    );
  }

  // Official Google Play Store badge styling
  const isDark = theme === 'dark';
  return (
    <motion.a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.98 }}
      className={`inline-flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition-all border shadow-xs group ${
        isDark
          ? 'bg-[#0f172a] hover:bg-[#1e293b] border-slate-800 text-white'
          : 'bg-white hover:bg-[#faf9f7] border-border hover:border-accent/40 text-foreground'
      } ${className}`}
      aria-label="Get RecruitAI on Google Play"
    >
      <GooglePlayIcon className="w-6 h-6 shrink-0" />
      <div className="flex flex-col justify-center">
        <span
          className={`text-[9px] uppercase font-semibold tracking-widest leading-none ${
            isDark ? 'text-slate-400' : 'text-muted'
          }`}
        >
          GET IT ON
        </span>
        <span
          className={`text-[13px] font-bold tracking-tight leading-tight mt-0.5 group-hover:text-accent transition-colors ${
            isDark ? 'text-white' : 'text-foreground'
          }`}
        >
          Google Play
        </span>
      </div>
    </motion.a>
  );
}
