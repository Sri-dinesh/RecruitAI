/**
 * Typed Local & Session Storage Utility for RecruitAI (ARCH-7).
 * Consolidates scattered storage keys, enforces 24h TTL expiration,
 * and handles private browsing / SSR storage errors gracefully.
 */

import { CandidateStatus } from '@/context/RecruitmentContext';

const ACTIVE_SESSION_KEY = 'recruitai_active_session';
const EVAL_NOTES_KEY = 'recruitai_eval_notes';
const CAND_STATUSES_PREFIX = 'recruitai_cand_statuses_';
const BLIND_MODE_KEY = 'recruitai_blind_mode';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function safeGetItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function safeRemoveItem(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {}
}

/**
 * Active Session Management
 */
export function getActiveSessionId(): string | null {
  return safeGetItem(ACTIVE_SESSION_KEY);
}

export function setActiveSessionId(sessionId: string): void {
  safeSetItem(ACTIVE_SESSION_KEY, sessionId);
}

export function clearActiveSessionId(): void {
  safeRemoveItem(ACTIVE_SESSION_KEY);
}

/**
 * Candidate Statuses with 24-Hour TTL Expiration
 */
export function getStoredCandidateStatuses(sessionId: string): Record<string, CandidateStatus> {
  const raw = safeGetItem(`${CAND_STATUSES_PREFIX}${sessionId}`);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    // Support both wrapped TTL format and raw record
    if (parsed && typeof parsed === 'object' && 'cachedAt' in parsed && 'statuses' in parsed) {
      const isStale = Date.now() - parsed.cachedAt > DEFAULT_TTL_MS;
      if (isStale) {
        clearStoredCandidateStatuses(sessionId);
        return {};
      }
      return parsed.statuses || {};
    }
    return parsed || {};
  } catch {
    return {};
  }
}

export function setStoredCandidateStatuses(
  sessionId: string, 
  statuses: Record<string, CandidateStatus>
): void {
  const payload = {
    statuses,
    cachedAt: Date.now()
  };
  safeSetItem(`${CAND_STATUSES_PREFIX}${sessionId}`, JSON.stringify(payload));
}

export function clearStoredCandidateStatuses(sessionId: string): void {
  safeRemoveItem(`${CAND_STATUSES_PREFIX}${sessionId}`);
}

/**
 * Recruiter Evaluation Notes
 */
export function getStoredEvalNotes(): Record<string, { tech: number; comm: number; notes: string }> {
  const raw = safeGetItem(EVAL_NOTES_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function setStoredEvalNotes(
  notes: Record<string, { tech: number; comm: number; notes: string }>
): void {
  safeSetItem(EVAL_NOTES_KEY, JSON.stringify(notes));
}

/**
 * Blind Hiring Mode Preference (ARCH-7)
 * Standard Mode (false) is default. Persists recruiter's manual selection.
 */
export function getStoredBlindMode(): boolean | null {
  const raw = safeGetItem(BLIND_MODE_KEY);
  if (raw === null) return null;
  return raw === 'true';
}

export function setStoredBlindMode(enabled: boolean): void {
  safeSetItem(BLIND_MODE_KEY, String(enabled));
}

/**
 * Offline Mutation Queue — parity with mobile/secureStore (ARCH offline)
 * Stores status toggles made while offline and replays on reconnect.
 */
const OFFLINE_MUTATIONS_KEY = 'recruitai_pending_mutations';

export interface OfflineMutation {
  candidateId: string;
  sessionId?: string;
  jobId?: string;
  status?: CandidateStatus;
  tech_score?: number;
  comm_score?: number;
  notes?: string;
  timestamp: string;
}

export function getOfflineMutationsQueue(): OfflineMutation[] {
  const raw = safeGetItem(OFFLINE_MUTATIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearOfflineMutationsQueue(): void {
  safeRemoveItem(OFFLINE_MUTATIONS_KEY);
}

export function enqueueOfflineMutation(m: OfflineMutation): void {
  try {
    const queue = getOfflineMutationsQueue();
    // Dedup by candidateId — keep latest
    const filtered = queue.filter((x) => x.candidateId !== m.candidateId);
    filtered.push(m);
    safeSetItem(OFFLINE_MUTATIONS_KEY, JSON.stringify(filtered));
  } catch {}
}

/**
 * Clear all RecruitAI related storage keys
 */
export function clearAllRecruitAIStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('recruitai_')) {
        localStorage.removeItem(key);
      }
    });
  } catch {}
}
