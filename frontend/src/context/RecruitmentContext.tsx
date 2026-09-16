'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fetchWithAuth } from '@/lib/apiClient';

export type CandidateStatus = 'shortlisted' | 'rejected' | 'offered';

export interface Candidate {
  candidate_id: string;
  name: string;
  raw_text?: string;
  match_score?: number;
  matched_skills?: string[];
  gaps?: string[];
  experience_years?: number;
  red_flags?: string[];
  email?: string;
  phone?: string;
  location?: string;
  headline?: string;
  summary?: string;
  skills?: string[];
  work_experience?: string[];
  education?: string[];
  certifications?: string[];
  links?: string[];
  languages?: string[];
}

export interface JobDescription {
  role: string;
  required_skills: string[];
  experience_years: number;
  tone: string;
  raw_text?: string;
  company_name?: string;
  department?: string;
  location?: string;
  employment_type?: string;
  salary_range?: string;
  education_requirements?: string;
  preferred_skills?: string[];
  responsibilities?: string[];
  qualifications?: string[];
  benefits?: string[];
  industry?: string;
  summary?: string;
}

export interface ScheduledInterview {
  candidate_name: string;
  slot: string;
  booked_at?: string;
  mode?: string;
  meeting_link?: string;
  feedback?: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface Session {
  id: string;
  title: string;
  created_at?: string;
  jd_structured?: JobDescription | null;
  resumes?: Candidate[];
  last_shortlist?: Candidate[] | null;
  pending_confirmation?: any;
  last_intent?: string | null;
  scheduled_interviews?: ScheduledInterview[] | null;
  conversation_history?: Message[] | null;
}

interface RecruitmentContextType {
  sessions: Session[];
  activeSessionId: string | null;
  activeSession: Session | null;
  jd: JobDescription | null;
  candidates: Candidate[];
  candidateStatuses: Record<string, CandidateStatus>;
  scheduledInterviews: ScheduledInterview[];
  isBlindHiring: boolean;
  apiConnected: boolean;
  loading: boolean;
  evalNotes: Record<string, { tech: number; comm: number; notes: string }>;
  inspectedCandidate: Candidate | null;
  setInspectedCandidate: (cand: Candidate | null) => void;
  setActiveSessionId: (id: string) => Promise<void>;
  createSession: () => Promise<string | null>;
  deleteSession: (id: string) => Promise<void>;
  uploadJd: (file?: File, text?: string) => Promise<{ success: boolean; jd?: JobDescription; error?: string }>;
  uploadResumes: (files: File[]) => Promise<{ success: boolean; count?: number; error?: string }>;
  handleSetStatus: (candidateId: string, statusOrName: CandidateStatus | string, maybeStatus?: CandidateStatus) => Promise<void>;
  setIsBlindHiring: (val: boolean) => void;
  saveEvalNotes: (candidateId: string, notes: { tech: number; comm: number; notes: string }) => void;
  refreshData: () => Promise<void>;
  resetAllData: () => Promise<{ success: boolean; error?: string }>;
  maskName: (name: string, candidateId?: string) => string;
  maskEmail: (email?: string, candidateId?: string) => string;
  maskPhone: (phone?: string) => string;
}

const RecruitmentContext = createContext<RecruitmentContextType | undefined>(undefined);

export function RecruitmentProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null);
  const [jd, setJd] = useState<JobDescription | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateStatuses, setCandidateStatuses] = useState<Record<string, CandidateStatus>>({});
  const [scheduledInterviews, setScheduledInterviews] = useState<ScheduledInterview[]>([]);
  const [isBlindHiring, setIsBlindHiring] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [evalNotes, setEvalNotes] = useState<Record<string, { tech: number; comm: number; notes: string }>>({});
  const [inspectedCandidate, setInspectedCandidate] = useState<Candidate | null>(null);

  // Sync initial blind hiring from recruiter profile
  useEffect(() => {
    if (profile?.preferences?.blind_mode_default !== undefined) {
      setIsBlindHiring(profile.preferences.blind_mode_default);
    }
  }, [profile?.preferences?.blind_mode_default]);

  // Load eval notes from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('recruitai_eval_notes');
      if (saved) setEvalNotes(JSON.parse(saved));
    } catch {
      // Ignore storage errors
    }
  }, []);

  const saveEvalNotes = useCallback((candidateId: string, notes: { tech: number; comm: number; notes: string }) => {
    setEvalNotes((prev) => {
      const updated = { ...prev, [candidateId]: notes };
      try {
        localStorage.setItem('recruitai_eval_notes', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  // Check health and ping API
  const checkHealth = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/health');
      setApiConnected(res.ok);
    } catch {
      setApiConnected(false);
    }
  }, []);

  // Fetch all sessions
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.sessions || []);
        setSessions(list);
        return list;
      }
    } catch (err) {
      console.warn('[RecruitmentContext] Error fetching sessions:', err);
    }
    return [];
  }, []);

  // Load specific session with strict data isolation
  const loadSession = useCallback(async (sessionId: string) => {
    setLoading(true);
    // Clear state immediately so previous campaign data does not bleed
    setCandidates([]);
    setJd(null);
    setScheduledInterviews([]);
    setCandidateStatuses({});

    try {
      const res = await fetchWithAuth(`/api/sessions/${sessionId}`);
      if (res.ok) {
        const data: Session = await res.json();
        setActiveSessionIdState(sessionId);
        localStorage.setItem('recruitai_active_session', sessionId);

        if (data.jd_structured) {
          setJd(data.jd_structured);
        } else {
          setJd(null);
        }

        if (data.resumes && Array.isArray(data.resumes)) {
          setCandidates(data.resumes);
        } else {
          setCandidates([]);
        }

        if (data.scheduled_interviews && Array.isArray(data.scheduled_interviews)) {
          setScheduledInterviews(data.scheduled_interviews);
        } else {
          setScheduledInterviews([]);
        }

        // Restore candidate statuses from backend candidate objects first
        const backendStatuses: Record<string, CandidateStatus> = {};
        if (data.resumes && Array.isArray(data.resumes)) {
          data.resumes.forEach((c: any) => {
            if (c.status && c.status !== 'new' && c.candidate_id) {
              backendStatuses[c.candidate_id] = c.status as CandidateStatus;
            }
          });
        }

        // Merge with non-stale localStorage cache (24h TTL)
        try {
          const saved = localStorage.getItem(`recruitai_cand_statuses_${sessionId}`);
          if (saved) {
            const parsed = JSON.parse(saved);
            const cachedStatuses = parsed.statuses || parsed;
            const cachedAt = parsed.cachedAt || 0;
            const isStale = cachedAt > 0 && Date.now() - cachedAt > 24 * 60 * 60 * 1000;
            if (!isStale) {
              setCandidateStatuses({ ...cachedStatuses, ...backendStatuses });
            } else {
              localStorage.removeItem(`recruitai_cand_statuses_${sessionId}`);
              setCandidateStatuses(backendStatuses);
            }
          } else {
            setCandidateStatuses(backendStatuses);
          }
        } catch {
          setCandidateStatuses(backendStatuses);
        }
      }
    } catch (err) {
      console.warn('[RecruitmentContext] Error loading session:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Create new session
  const createSession = useCallback(async (): Promise<string | null> => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/sessions', { method: 'POST' });
      if (res.ok) {
        const newSession = await res.json();
        setSessions((prev) => [newSession, ...prev]);
        await loadSession(newSession.id);
        return newSession.id;
      }
    } catch (err) {
      console.warn('[RecruitmentContext] Error creating session:', err);
    } finally {
      setLoading(false);
    }
    return null;
  }, [loadSession]);

  // Reset all recruitment workspace data for a 100% fresh start
  const resetAllData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/sessions/reset-all', { method: 'POST' });
      if (res.ok) {
        try {
          Object.keys(localStorage).forEach((key) => {
            if (key.startsWith('recruitai_')) {
              localStorage.removeItem(key);
            }
          });
        } catch {}
        setCandidates([]);
        setJd(null);
        setScheduledInterviews([]);
        setCandidateStatuses({});
        setEvalNotes({});
        setSessions([]);
        await createSession();
        return { success: true };
      }
      const err = await res.json().catch(() => ({ detail: 'Reset failed' }));
      return { success: false, error: err.detail || 'Reset failed' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error resetting workspace data' };
    } finally {
      setLoading(false);
    }
  }, [createSession]);

  // Delete session
  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      const res = await fetchWithAuth(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (activeSessionId === sessionId) {
          const remaining = sessions.filter((s) => s.id !== sessionId);
          if (remaining.length > 0) {
            await loadSession(remaining[0].id);
          } else {
            await createSession();
          }
        }
      }
    } catch (err) {
      console.warn('[RecruitmentContext] Error deleting session:', err);
    }
  }, [activeSessionId, sessions, loadSession, createSession]);

  // Initial load
  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      await checkHealth();
      const sessList = await fetchSessions();
      if (!isMounted) return;

      const storedId = localStorage.getItem('recruitai_active_session');
      if (storedId && sessList.some((s: Session) => s.id === storedId)) {
        await loadSession(storedId);
      } else if (sessList.length > 0) {
        await loadSession(sessList[0].id);
      } else {
        await createSession();
      }
    };
    init();
    return () => {
      isMounted = false;
    };
  }, [checkHealth, fetchSessions, loadSession, createSession]);

  // Refresh active campaign data
  const refreshData = useCallback(async () => {
    if (activeSessionId) {
      await loadSession(activeSessionId);
    }
    await fetchSessions();
  }, [activeSessionId, loadSession, fetchSessions]);

  // Upload JD (file or text)
  const uploadJd = useCallback(async (file?: File, text?: string) => {
    if (!activeSessionId) return { success: false, error: 'No active campaign' };
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('session_id', activeSessionId);

      if (file) {
        formData.append('file', file);
      } else if (text) {
        const textFile = new File([new Blob([text], { type: 'text/plain' })], 'job_description.txt');
        formData.append('file', textFile);
      } else {
        setLoading(false);
        return { success: false, error: 'No JD provided' };
      }

      const res = await fetchWithAuth(`/api/ingest/upload-jd?session_id=${activeSessionId}`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const parsedJd = data.jd_structured || data.job || data;
        if (parsedJd) setJd(parsedJd);
        await refreshData();
        return { success: true, jd: parsedJd };
      } else {
        const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
        return { success: false, error: err.detail || 'Upload failed' };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error uploading JD' };
    } finally {
      setLoading(false);
    }
  }, [activeSessionId, refreshData]);

  // Upload Resumes
  const uploadResumes = useCallback(async (files: File[]) => {
    if (!activeSessionId) return { success: false, error: 'No active campaign' };
    setLoading(true);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));
      formData.append('session_id', activeSessionId);
      const res = await fetchWithAuth(`/api/ingest/upload?session_id=${activeSessionId}`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        await refreshData();
        return { success: true, count: data.count || files.length };
      } else {
        const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
        return { success: false, error: err.detail || 'Upload failed' };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error uploading resumes' };
    } finally {
      setLoading(false);
    }
  }, [activeSessionId, refreshData]);

  // Set candidate status with optimistic UI update, rollback on failure, and backend API persistence (BUG-6)
  const handleSetStatus = useCallback(async (
    candidateId: string,
    statusOrName: CandidateStatus | string,
    maybeStatus?: CandidateStatus
  ) => {
    // Normalizes whether called as (id, status) or legacy (id, name, status)
    const status: CandidateStatus = (maybeStatus ?? statusOrName) as CandidateStatus;
    const previousStatus = candidateStatuses[candidateId];
    const nextStatus = previousStatus === status ? undefined : status;

    // 1. Optimistic UI update
    const updated = { ...candidateStatuses };
    if (nextStatus) {
      updated[candidateId] = nextStatus;
    } else {
      delete updated[candidateId];
    }
    setCandidateStatuses(updated);

    // 2. Cache in localStorage with timestamp for TTL expiration
    if (activeSessionId) {
      try {
        localStorage.setItem(
          `recruitai_cand_statuses_${activeSessionId}`,
          JSON.stringify({ statuses: updated, cachedAt: Date.now() })
        );
      } catch {}
    }

    // 3. Persist to backend PostgreSQL API with rollback on failure
    try {
      const payload = {
        status: nextStatus || 'new',
        session_id: activeSessionId || undefined,
      };
      const res = await fetchWithAuth(`/api/candidates/${candidateId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }
    } catch (err) {
      console.error('[RecruitmentContext] Failed to persist candidate status, rolling back:', err);
      // Rollback optimistic state
      const rollback = { ...candidateStatuses };
      if (previousStatus) {
        rollback[candidateId] = previousStatus;
      } else {
        delete rollback[candidateId];
      }
      setCandidateStatuses(rollback);
    }
  }, [candidateStatuses, activeSessionId, fetchWithAuth]);

  // Masking helpers for Blind Mode
  const maskName = useCallback((name: string, candidateId?: string) => {
    if (!isBlindHiring) return name;
    if (candidateId) return `Candidate #${candidateId.slice(0, 4).toUpperCase()}`;
    return 'Candidate (Anonymous)';
  }, [isBlindHiring]);

  const maskEmail = useCallback((email?: string, candidateId?: string) => {
    if (!email) return 'No email provided';
    if (!isBlindHiring) return email;
    const cid = candidateId ? candidateId.slice(0, 4).toLowerCase() : 'cand';
    return `masked.${cid}@anonymous-candidate.org`;
  }, [isBlindHiring]);

  const maskPhone = useCallback((phone?: string) => {
    if (!phone) return 'No phone';
    if (!isBlindHiring) return phone;
    return '+1 (***) ***-****';
  }, [isBlindHiring]);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

  return (
    <RecruitmentContext.Provider
      value={{
        sessions,
        activeSessionId,
        activeSession,
        jd,
        candidates,
        candidateStatuses,
        scheduledInterviews,
        isBlindHiring,
        apiConnected,
        loading,
        evalNotes,
        inspectedCandidate,
        setInspectedCandidate,
        setActiveSessionId: loadSession,
        createSession,
        deleteSession,
        uploadJd,
        uploadResumes,
        handleSetStatus,
        setIsBlindHiring,
        saveEvalNotes,
        refreshData,
        resetAllData,
        maskName,
        maskEmail,
        maskPhone,
      }}
    >
      {children}
    </RecruitmentContext.Provider>
  );
}

export function useRecruitment() {
  const context = useContext(RecruitmentContext);
  if (!context) {
    throw new Error('useRecruitment must be used within a RecruitmentProvider');
  }
  return context;
}
