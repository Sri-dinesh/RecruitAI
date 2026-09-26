'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchWithAuth, downloadPdfReport } from '@/lib/apiClient';
import {
  getActiveSessionId,
  setActiveSessionId,
  getStoredCandidateStatuses,
  setStoredCandidateStatuses,
  getStoredEvalNotes,
  setStoredEvalNotes,
  getStoredBlindMode,
  setStoredBlindMode,
  clearAllRecruitAIStorage,
  getOfflineMutationsQueue,
  clearOfflineMutationsQueue,
  enqueueOfflineMutation,
} from '@/lib/sessionStorage';

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
  consent_at?: string | null;
  consent_version?: string | null;
  source?: string | null;
  status?: CandidateStatus | 'new';
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

import { Message, ChatMessage } from '@/types/chat';
export type { Message, ChatMessage };

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
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  apiConnected: boolean;
  loading: boolean;
  evalNotes: Record<string, { tech: number; comm: number; notes: string }>;
  inspectedCandidate: Candidate | null;
  setInspectedCandidate: (cand: Candidate | null) => void;
  setActiveSessionId: (id: string) => Promise<void>;
  createSession: () => Promise<string | null>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (sessionId: string, newTitle: string) => Promise<void>;
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
  exportPdfReport: () => Promise<string>;
}

const RecruitmentContext = createContext<RecruitmentContextType | undefined>(undefined);

export function RecruitmentProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isBlindHiring, setIsBlindHiringState] = useState<boolean>(() => {
    const saved = getStoredBlindMode();
    if (saved !== null) {
      return saved;
    }
    return false; // Standard Mode is strictly default (blind mode OFF, all candidate names visible)
  });
  const [isMutating, setIsMutating] = useState(false);
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, CandidateStatus>>({});
  const [evalNotes, setEvalNotes] = useState<Record<string, { tech: number; comm: number; notes: string }>>({});
  const [inspectedCandidate, setInspectedCandidate] = useState<Candidate | null>(null);

  // Recruiter manual toggle for Blind / Standard Mode
  // Standard Mode (false) is default. Setting is persisted to localStorage & synced to backend.
  // The option will NOT change unless the user manually changes it.
  const setIsBlindHiring = useCallback((val: boolean) => {
    setIsBlindHiringState(val);
    setStoredBlindMode(val);

    fetchWithAuth('/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify({
        preferences: {
          blind_mode_default: val,
        },
      }),
    }).catch((err) => {
      console.warn('[RecruitmentContext] Failed to sync blind mode preference to backend:', err);
    });
  }, []);

  // Sync initial blind hiring from recruiter profile ONLY if user has not already chosen a setting locally
  useEffect(() => {
    const localChoice = getStoredBlindMode();
    if (localChoice !== null) {
      // User's manual selection in local storage is authoritative; do not overwrite!
      return;
    }
    if (profile?.preferences?.blind_mode_default !== undefined) {
      const serverPref = profile.preferences.blind_mode_default === true;
      setIsBlindHiringState(serverPref);
      setStoredBlindMode(serverPref);
    }
  }, [profile?.preferences?.blind_mode_default]);

  // Load eval notes from typed sessionStorage (ARCH-7)
  useEffect(() => {
    const saved = getStoredEvalNotes();
    if (Object.keys(saved).length > 0) {
      setEvalNotes(saved);
    }
  }, []);

  const saveEvalNotes = useCallback((candidateId: string, notes: { tech: number; comm: number; notes: string }) => {
    setEvalNotes((prev) => {
      const updated = { ...prev, [candidateId]: notes };
      setStoredEvalNotes(updated);
      return updated;
    });
  }, []);

  // 1. Health check query with TanStack Query (UI-1)
  const healthQuery = useQuery<boolean>({
    queryKey: ['health'],
    queryFn: async () => {
      try {
        const res = await fetchWithAuth('/api/health');
        return res.ok;
      } catch {
        return false;
      }
    },
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const apiConnected = healthQuery.data ?? false;

  // 2. Sessions list query with TanStack Query (UI-1) - polls every 8s for new sessions from mobile
  const sessionsQuery = useQuery<Session[]>({
    queryKey: ['sessions'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/sessions');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return Array.isArray(data) ? data : (data.sessions || []);
    },
    staleTime: 4_000,
    refetchInterval: 8_000,
    retry: 2,
    refetchOnWindowFocus: true,
  });

  const sessions = useMemo(() => sessionsQuery.data || [], [sessionsQuery.data]);

  // 3. Active Session detail query with TanStack Query (UI-1) - polls every 4s for cross-device real-time sync
  const sessionDetailQuery = useQuery<Session>({
    queryKey: ['session', activeSessionId],
    queryFn: async () => {
      if (!activeSessionId) throw new Error('No active session ID');
      const res = await fetchWithAuth(`/api/sessions/${activeSessionId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    },
    enabled: !!activeSessionId,
    staleTime: 2_000,
    refetchInterval: 4_000,
    retry: 2,
    refetchOnWindowFocus: true,
  });

  const activeSessionData = sessionDetailQuery.data || null;

  // Real-time synchronization: sync conversation history from active session into shared messages state
  useEffect(() => {
    if (activeSessionData?.conversation_history && activeSessionData.conversation_history.length > 0) {
      const serverHistory = activeSessionData.conversation_history as ChatMessage[];
      setMessages((prev) => {
        if (serverHistory.length !== prev.length) {
          return serverHistory;
        }
        if (prev.length > 0 && serverHistory.length > 0) {
          const lastPrev = prev[prev.length - 1];
          const lastServer = serverHistory[serverHistory.length - 1];
          if (lastPrev.content !== lastServer.content || lastPrev.role !== lastServer.role) {
            return serverHistory;
          }
        }
        return prev.length === 0 ? serverHistory : prev;
      });
    }
  }, [activeSessionData?.id, activeSessionData?.conversation_history]);

  // Derived state from active session query
  const jd: JobDescription | null = activeSessionData?.jd_structured || null;
  const candidates: Candidate[] = useMemo(() => {
    return activeSessionData?.resumes && Array.isArray(activeSessionData.resumes)
      ? activeSessionData.resumes
      : [];
  }, [activeSessionData?.resumes]);

  const scheduledInterviews: ScheduledInterview[] = useMemo(() => {
    return activeSessionData?.scheduled_interviews && Array.isArray(activeSessionData.scheduled_interviews)
      ? activeSessionData.scheduled_interviews
      : [];
  }, [activeSessionData?.scheduled_interviews]);

  // Merge backend statuses, sessionStorage cached statuses, and optimistic UI mutations
  const candidateStatuses: Record<string, CandidateStatus> = useMemo(() => {
    const backendStatuses: Record<string, CandidateStatus> = {};
    if (activeSessionData?.resumes && Array.isArray(activeSessionData.resumes)) {
      activeSessionData.resumes.forEach((c: any) => {
        if (c.status && c.status !== 'new' && c.candidate_id) {
          backendStatuses[c.candidate_id] = c.status as CandidateStatus;
        }
      });
    }

    const cachedStatuses = activeSessionId ? getStoredCandidateStatuses(activeSessionId) : {};
    return { ...cachedStatuses, ...backendStatuses, ...optimisticStatuses };
  }, [activeSessionData?.resumes, activeSessionId, optimisticStatuses]);

  // Select or switch active session ID
  const selectActiveSession = useCallback(async (sessionId: string) => {
    setActiveSessionId(sessionId);
    setActiveSessionIdState(sessionId);
    setOptimisticStatuses({});

    const cached = queryClient.getQueryData<Session>(['session', sessionId]);
    if (cached?.conversation_history && cached.conversation_history.length > 0) {
      setMessages(cached.conversation_history as ChatMessage[]);
    }

    await queryClient.prefetchQuery({
      queryKey: ['session', sessionId],
      queryFn: async () => {
        const res = await fetchWithAuth(`/api/sessions/${sessionId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.conversation_history && data.conversation_history.length > 0) {
          setMessages(data.conversation_history as ChatMessage[]);
        }
        return data;
      },
      staleTime: 2_000,
    });
  }, [queryClient]);

  // Create new session mutation
  const createSession = useCallback(async (): Promise<string | null> => {
    setIsMutating(true);
    try {
      const res = await fetchWithAuth('/api/sessions', { method: 'POST' });
      if (res.ok) {
        const newSession = await res.json();
        queryClient.setQueryData<Session[]>(['sessions'], (old = []) => [newSession, ...old]);
        await selectActiveSession(newSession.id);
        await queryClient.invalidateQueries({ queryKey: ['sessions'] });
        return newSession.id;
      }
    } catch (err) {
      console.warn('[RecruitmentContext] Error creating session:', err);
    } finally {
      setIsMutating(false);
    }
    return null;
  }, [queryClient, selectActiveSession]);

  // Automatic session resolution on initial sessions query completion
  useEffect(() => {
    if (sessionsQuery.isLoading) return;

    if (activeSessionId) {
      // If current active session is not in sessions list, fall back
      if (sessions.length > 0 && !sessions.some((s) => s.id === activeSessionId)) {
        selectActiveSession(sessions[0].id);
      }
      return;
    }

    const storedId = getActiveSessionId();
    if (storedId && sessions.some((s) => s.id === storedId)) {
      selectActiveSession(storedId);
    } else if (sessions.length > 0) {
      selectActiveSession(sessions[0].id);
    } else if (!isMutating) {
      // Auto-create initial default session if workspace has none
      createSession();
    }
  }, [sessionsQuery.isLoading, sessions, activeSessionId, isMutating, selectActiveSession, createSession]);

  // Delete session
  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      const res = await fetchWithAuth(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (res.ok) {
        queryClient.setQueryData<Session[]>(['sessions'], (old = []) =>
          old.filter((s) => s.id !== sessionId)
        );
        await queryClient.invalidateQueries({ queryKey: ['sessions'] });
        if (activeSessionId === sessionId) {
          const remaining = sessions.filter((s) => s.id !== sessionId);
          if (remaining.length > 0) {
            await selectActiveSession(remaining[0].id);
          } else {
            await createSession();
          }
        }
      }
    } catch (err) {
      console.warn('[RecruitmentContext] Error deleting session:', err);
    }
  }, [activeSessionId, sessions, selectActiveSession, createSession, queryClient]);

  // Rename session (parity with mobile)
  const renameSession = useCallback(async (sessionId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    try {
      const res = await fetchWithAuth(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (res.ok) {
        queryClient.setQueryData<Session[]>(['sessions'], (old = []) =>
          (old || []).map((s) => (s.id === sessionId ? { ...s, title: newTitle.trim() } : s))
        );
      }
    } catch (err) {
      console.warn('[RecruitmentContext] Error renaming session:', err);
    }
  }, [queryClient]);

  // Refresh active campaign data and sessions via TanStack Query invalidation
  const refreshData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['sessions'] }),
      activeSessionId
        ? queryClient.invalidateQueries({ queryKey: ['session', activeSessionId] })
        : Promise.resolve(),
    ]);
  }, [queryClient, activeSessionId]);

  // Reset all recruitment workspace data for a 100% fresh start
  const resetAllData = useCallback(async () => {
    setIsMutating(true);
    try {
      const res = await fetchWithAuth('/api/sessions/reset-all', { method: 'POST' });
      if (res.ok) {
        clearAllRecruitAIStorage();
        queryClient.removeQueries();
        setOptimisticStatuses({});
        setEvalNotes({});
        setActiveSessionIdState(null);
        await createSession();
        return { success: true };
      }
      const err = await res.json().catch(() => ({ detail: 'Reset failed' }));
      return { success: false, error: err.detail || 'Reset failed' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error resetting workspace data' };
    } finally {
      setIsMutating(false);
    }
  }, [createSession, queryClient]);

  // Upload JD (file or text)
  const uploadJd = useCallback(async (file?: File, text?: string) => {
    if (!activeSessionId) return { success: false, error: 'No active campaign' };
    setIsMutating(true);
    try {
      const formData = new FormData();
      formData.append('session_id', activeSessionId);

      if (file) {
        formData.append('file', file);
      } else if (text) {
        const textFile = new File([new Blob([text], { type: 'text/plain' })], 'job_description.txt');
        formData.append('file', textFile);
      } else {
        setIsMutating(false);
        return { success: false, error: 'No JD provided' };
      }

      const res = await fetchWithAuth(`/api/ingest/upload-jd?session_id=${activeSessionId}`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const parsedJd = data.jd_structured || data.job || data;
        await refreshData();
        return { success: true, jd: parsedJd };
      } else {
        const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
        return { success: false, error: err.detail || 'Upload failed' };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error uploading JD' };
    } finally {
      setIsMutating(false);
    }
  }, [activeSessionId, refreshData]);

  // Upload Resumes
  const uploadResumes = useCallback(async (files: File[]) => {
    if (!activeSessionId) return { success: false, error: 'No active campaign' };
    setIsMutating(true);
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
      setIsMutating(false);
    }
  }, [activeSessionId, refreshData]);

  // Set candidate status with optimistic UI update, rollback on failure, and backend API persistence (BUG-6)
  const handleSetStatus = useCallback(async (
    candidateId: string,
    statusOrName: CandidateStatus | string,
    maybeStatus?: CandidateStatus
  ) => {
    const status: CandidateStatus = (maybeStatus ?? statusOrName) as CandidateStatus;
    const previousStatus = candidateStatuses[candidateId];
    const nextStatus = previousStatus === status ? undefined : status;

    // 1. Optimistic UI update
    setOptimisticStatuses((prev) => {
      const updated = { ...prev };
      if (nextStatus) {
        updated[candidateId] = nextStatus;
      } else {
        delete updated[candidateId];
      }
      return updated;
    });

    // 2. Cache in typed sessionStorage with timestamp for TTL expiration (ARCH-7)
    if (activeSessionId) {
      const currentMap = { ...candidateStatuses };
      if (nextStatus) {
        currentMap[candidateId] = nextStatus;
      } else {
        delete currentMap[candidateId];
      }
      setStoredCandidateStatuses(activeSessionId, currentMap);
    }

    // 3. Persist to backend PostgreSQL API with rollback on failure — unified on /candidates/evaluate for parity with mobile
    try {
      const tech_score = nextStatus === 'offered' ? 5 : nextStatus === 'shortlisted' ? 4 : nextStatus === 'rejected' ? 1 : 1;
      const comm_score = nextStatus === 'offered' ? 5 : nextStatus === 'shortlisted' ? 3 : nextStatus === 'rejected' ? 1 : 1;
      const payload = {
        candidate_id: candidateId,
        session_id: activeSessionId || undefined,
        // job_id derived server-side from session if not provided; keep undefined for now (backend fallback handles it)
        status: nextStatus || 'new',
        tech_score,
        comm_score,
        notes: `Recruiter marked candidate as ${nextStatus || 'new'} via web dashboard.`,
      };
      const res = await fetchWithAuth(`/api/candidates/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      // Invalidate active session query in background
      if (activeSessionId) {
        queryClient.invalidateQueries({ queryKey: ['session', activeSessionId] });
      }
    } catch (err) {
      console.error('[RecruitmentContext] Failed to persist candidate status, enqueuing offline mutation:', err);
      // Keep optimistic UI + enqueue for offline replay (parity with mobile)
      enqueueOfflineMutation({
        candidateId,
        sessionId: activeSessionId || undefined,
        status: nextStatus,
        tech_score: nextStatus === 'offered' ? 5 : nextStatus === 'shortlisted' ? 4 : 1,
        comm_score: nextStatus === 'offered' ? 5 : nextStatus === 'shortlisted' ? 3 : 1,
        notes: `Replayed offline status mutation via web (${new Date().toISOString()})`,
        timestamp: new Date().toISOString(),
      });
      // Do not rollback optimistic state — flush will replay when back online
    }
  }, [candidateStatuses, activeSessionId, queryClient]);

  // Replay offline status mutations when back online (parity with mobile)
  const flushOfflineMutations = useCallback(async () => {
    try {
      const queue = getOfflineMutationsQueue();
      if (!queue || queue.length === 0) return;
      for (const item of queue) {
        try {
          const res = await fetchWithAuth('/api/candidates/evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              candidate_id: item.candidateId,
              session_id: item.sessionId,
              status: item.status || 'new',
              tech_score: item.tech_score ?? (item.status === 'offered' ? 5 : item.status === 'shortlisted' ? 4 : 1),
              comm_score: item.comm_score ?? (item.status === 'offered' ? 5 : item.status === 'shortlisted' ? 3 : 1),
              notes: item.notes || `Replayed offline mutation (${item.timestamp})`,
            }),
          });
          if (!res.ok) return; // still failing, retry later
        } catch {
          return;
        }
      }
      clearOfflineMutationsQueue();
    } catch {}
  }, []);

  useEffect(() => {
    if (apiConnected) {
      flushOfflineMutations();
    }
  }, [apiConnected, flushOfflineMutations]);

  useEffect(() => {
    const onFocus = () => {
      if (apiConnected) flushOfflineMutations();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [apiConnected, flushOfflineMutations]);

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

  const exportPdfReport = useCallback(async (): Promise<string> => {
    if (activeSessionId) {
      return await downloadPdfReport(activeSessionId);
    }
    return await downloadPdfReport(undefined, {
      jd: jd || undefined,
      candidates: candidates,
      shortlist: candidates.filter(c => candidateStatuses[c.candidate_id] === 'shortlisted'),
      evaluations: evalNotes,
      scheduled_interviews: scheduledInterviews,
      is_blind_mode: isBlindHiring,
      session_title: jd?.role ? `Hiring: ${jd.role}` : 'Executive Recruitment Assessment',
    });
  }, [activeSessionId, jd, candidates, candidateStatuses, evalNotes, scheduledInterviews, isBlindHiring]);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || activeSessionData;
  const loading = sessionsQuery.isLoading || (!!activeSessionId && sessionDetailQuery.isLoading) || isMutating;

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
        messages,
        setMessages,
        apiConnected,
        loading,
        evalNotes,
        inspectedCandidate,
        setInspectedCandidate,
        setActiveSessionId: selectActiveSession,
        createSession,
        deleteSession,
        renameSession,
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
        exportPdfReport,
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
