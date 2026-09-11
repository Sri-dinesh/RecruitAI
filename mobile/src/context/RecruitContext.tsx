import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import * as SecureStore from "expo-secure-store";
import { fetchWithAuth } from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import { selectionHaptic, successHaptic, warningHaptic } from "@/lib/haptics";
import type {
  Candidate,
  JobDescription,
  ChatMessage,
  ScheduledInterview,
  ChatSession,
  CandidateStatus,
  RecruitContextType,
} from "@/types/schema";

const DEFAULT_GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hello! I am **RecruitAI**, your AI recruiting assistant. Start by loading a job description and candidate resumes, or select one of the quick start options below.",
};

const RecruitContext = createContext<RecruitContextType | undefined>(undefined);

export function RecruitProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [jd, setJd] = useState<JobDescription | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateStatuses, setCandidateStatuses] = useState<
    Record<string, CandidateStatus>
  >({});
  const [lastShortlist, setLastShortlist] = useState<Candidate[] | null>(null);
  const [scheduledInterviews, setScheduledInterviews] = useState<
    ScheduledInterview[]
  >([]);
  const [messages, setMessages] = useState<ChatMessage[]>([DEFAULT_GREETING]);
  const [isBlindHiring, setIsBlindHiring] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [statusSaving, setStatusSaving] = useState<string | null>(null);

  // Active session object
  const activeSession = useMemo(() => {
    if (!activeSessionId) return null;
    return sessions.find((s) => s.id === activeSessionId) || null;
  }, [sessions, activeSessionId]);

  // Check API Health
  const checkApiHealth = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetchWithAuth("/api/health");
      const isOk = res.ok;
      setApiConnected(isOk);
      return isOk;
    } catch {
      setApiConnected(false);
      return false;
    }
  }, []);

  // Select a campaign session by ID
  const selectSession = useCallback(
    async (sessionId: string) => {
      if (!sessionId) return;
      setActiveSessionId(sessionId);
      setLoadingSession(true);

      try {
        await SecureStore.setItemAsync("recruitai_active_session_id", sessionId);
      } catch (err) {
        console.warn("[RecruitContext] Failed to persist active session ID", err);
      }

      try {
        const res = await fetchWithAuth(`/api/sessions/${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          setJd(data.jd_structured || null);
          setCandidates(data.resumes || []);
          setLastShortlist(data.last_shortlist || null);
          setScheduledInterviews(data.scheduled_interviews || []);

          if (data.conversation_history && data.conversation_history.length > 0) {
            setMessages(data.conversation_history);
          } else {
            setMessages([DEFAULT_GREETING]);
          }

          // Persist cached session state for offline operation
          try {
            await SecureStore.setItemAsync(
              `recruitai_cached_session_${sessionId}`,
              JSON.stringify(data)
            );
          } catch {}

          // Hydrate candidate statuses from server resumes and local storage
          const serverStatuses: Record<string, CandidateStatus> = {};
          (data.resumes || []).forEach((c: Candidate) => {
            if (c.status && c.status !== "new") {
              serverStatuses[c.candidate_id] = c.status as CandidateStatus;
            }
          });

          try {
            const rawStatuses = await SecureStore.getItemAsync(
              `recruitai_statuses_${sessionId}`
            );
            const localStatuses = rawStatuses ? JSON.parse(rawStatuses) : {};
            setCandidateStatuses({ ...serverStatuses, ...localStatuses });
          } catch {
            setCandidateStatuses(serverStatuses);
          }
        }
      } catch (err) {
        console.warn("[RecruitContext] Error loading session details, hydrating from cache:", err);
        // Offline Fallback Hydration
        try {
          const cached = await SecureStore.getItemAsync(
            `recruitai_cached_session_${sessionId}`
          );
          if (cached) {
            const data = JSON.parse(cached);
            setJd(data.jd_structured || null);
            setCandidates(data.resumes || []);
            setLastShortlist(data.last_shortlist || null);
            setScheduledInterviews(data.scheduled_interviews || []);
            if (data.conversation_history && data.conversation_history.length > 0) {
              setMessages(data.conversation_history);
            }
          }
          const rawStatuses = await SecureStore.getItemAsync(
            `recruitai_statuses_${sessionId}`
          );
          setCandidateStatuses(rawStatuses ? JSON.parse(rawStatuses) : {});
        } catch {}
      } finally {
        setLoadingSession(false);
      }
    },
    []
  );

  // Load all sessions for current user
  const loadSessions = useCallback(async (): Promise<ChatSession[]> => {
    try {
      const res = await fetchWithAuth("/api/sessions");
      if (res.ok) {
        const list: ChatSession[] = await res.json();
        setSessions(list);

        // Cache sessions list for offline use
        try {
          await SecureStore.setItemAsync(
            "recruitai_cached_sessions_list",
            JSON.stringify(list)
          );
        } catch {}

        if (list.length > 0) {
          // Check if previously selected session is still in list
          let targetSessionId = list[0].id;
          try {
            const savedSessionId = await SecureStore.getItemAsync(
              "recruitai_active_session_id"
            );
            if (savedSessionId && list.some((s) => s.id === savedSessionId)) {
              targetSessionId = savedSessionId;
            }
          } catch {
            // fallback to first session
          }
          await selectSession(targetSessionId);
        } else {
          // No sessions exist yet, create one
          await createSession();
        }
        return list;
      }
    } catch (err) {
      console.warn("[RecruitContext] Error fetching sessions, trying offline cache:", err);
      try {
        const cached = await SecureStore.getItemAsync("recruitai_cached_sessions_list");
        if (cached) {
          const list: ChatSession[] = JSON.parse(cached);
          setSessions(list);
          if (list.length > 0) {
            await selectSession(list[0].id);
          }
          return list;
        }
      } catch {}
    }
    return [];
  }, [selectSession]);

  // Create a new campaign session
  const createSession = useCallback(
    async (title?: string): Promise<ChatSession | null> => {
      try {
        const res = await fetchWithAuth("/api/sessions", {
          method: "POST",
          body: JSON.stringify({ title: title || "New Hiring Campaign" }),
        });
        if (res.ok) {
          const newSession: ChatSession = await res.json();
          setSessions((prev) => [newSession, ...prev]);
          await selectSession(newSession.id);
          successHaptic();
          return newSession;
        }
      } catch (err) {
        console.error("[RecruitContext] Error creating session:", err);
      }
      return null;
    },
    [selectSession]
  );

  // Delete an existing campaign session
  const deleteSession = useCallback(
    async (sessionId: string): Promise<boolean> => {
      try {
        const res = await fetchWithAuth(`/api/sessions/${sessionId}`, {
          method: "DELETE",
        });
        if (res.ok) {
          const updated = sessions.filter((s) => s.id !== sessionId);
          setSessions(updated);

          if (activeSessionId === sessionId) {
            if (updated.length > 0) {
              await selectSession(updated[0].id);
            } else {
              await createSession();
            }
          }
          warningHaptic();
          return true;
        }
      } catch (err) {
        console.error("[RecruitContext] Error deleting session:", err);
      }
      return false;
    },
    [sessions, activeSessionId, selectSession, createSession]
  );

  // Rename an existing session
  const renameSession = useCallback(
    async (sessionId: string, newTitle: string): Promise<void> => {
      if (!newTitle.trim()) return;
      try {
        const res = await fetchWithAuth(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          body: JSON.stringify({ title: newTitle.trim() }),
        });
        if (res.ok) {
          setSessions((prev) =>
            prev.map((s) => (s.id === sessionId ? { ...s, title: newTitle } : s))
          );
        }
      } catch (err) {
        console.error("[RecruitContext] Error renaming session:", err);
      }
    },
    []
  );

  // Toggle candidate status (shortlisted, offered, rejected)
  const toggleCandidateStatus = useCallback(
    async (
      candidateId: string,
      candidateName: string,
      status: CandidateStatus
    ): Promise<void> => {
      const nextStatus =
        candidateStatuses[candidateId] === status ? undefined : status;
      const updated = { ...candidateStatuses };

      if (nextStatus) {
        updated[candidateId] = nextStatus;
      } else {
        delete updated[candidateId];
      }

      setCandidateStatuses(updated);
      selectionHaptic();

      // Persist locally
      if (activeSessionId) {
        try {
          await SecureStore.setItemAsync(
            `recruitai_statuses_${activeSessionId}`,
            JSON.stringify(updated)
          );
        } catch (err) {
          console.warn("[RecruitContext] Failed to persist candidate status", err);
        }
      }

      // Sync to backend candidate evaluation endpoint (fire-and-forget non-blocking)
      if (nextStatus) {
        setStatusSaving(candidateId);
        try {
          await fetchWithAuth("/api/candidates/evaluate", {
            method: "POST",
            body: JSON.stringify({
              candidate_id: candidateId,
              status: nextStatus || "new",
              tech_score:
                nextStatus === "offered" ? 5 : nextStatus === "shortlisted" ? 4 : 1,
              comm_score:
                nextStatus === "offered" ? 5 : nextStatus === "shortlisted" ? 3 : 1,
              notes: `Recruiter marked candidate as ${nextStatus || "new"} via mobile app.`,
            }),
          });
        } catch (err) {
          console.warn("[RecruitContext] Non-blocking evaluate persist failed:", err);
        } finally {
          setStatusSaving(null);
        }
      }
    },
    [candidateStatuses, activeSessionId]
  );

  // Toggle Blind Hiring Mode
  const toggleBlindHiring = useCallback(() => {
    selectionHaptic();
    setIsBlindHiring((prev) => !prev);
  }, []);

  // Book an interview slot
  const bookInterview = useCallback(
    async (candidateName: string, slot: string) => {
      const newBooking: ScheduledInterview = {
        candidate_name: candidateName,
        slot,
        booked_at: new Date().toISOString(),
      };
      setScheduledInterviews((prev) => [...prev, newBooking]);
      successHaptic();

      // Fire non-blocking chat sync so backend agent knows interview is booked
      if (activeSessionId) {
        try {
          await fetchWithAuth("/api/chat", {
            method: "POST",
            body: JSON.stringify({
              message: `Confirm booking interview with ${candidateName} for ${slot}`,
              session_id: activeSessionId,
              scheduled_interviews: [...scheduledInterviews, newBooking],
            }),
          });
        } catch (err) {
          console.warn("[RecruitContext] Non-blocking interview book sync failed:", err);
        }
      }
    },
    [activeSessionId, scheduledInterviews]
  );

  // Refresh current active session
  const refreshActiveSession = useCallback(async () => {
    if (activeSessionId) {
      await selectSession(activeSessionId);
    }
  }, [activeSessionId, selectSession]);

  // Initial load when authenticated
  useEffect(() => {
    if (user) {
      loadSessions();
      checkApiHealth();
    }
  }, [user, loadSessions, checkApiHealth]);

  // Health poll check every 15s
  useEffect(() => {
    const timer = setInterval(() => {
      checkApiHealth();
    }, 15000);
    return () => clearInterval(timer);
  }, [checkApiHealth]);

  const value = useMemo(
    () => ({
      sessions,
      activeSessionId,
      activeSession,
      jd,
      candidates,
      candidateStatuses,
      lastShortlist,
      scheduledInterviews,
      messages,
      isBlindHiring,
      apiConnected,
      loadingSession,
      statusSaving,
      loadSessions,
      selectSession,
      createSession,
      deleteSession,
      renameSession,
      toggleCandidateStatus,
      toggleBlindHiring,
      setMessages,
      setCandidates,
      setJd,
      setScheduledInterviews,
      bookInterview,
      refreshActiveSession,
      checkApiHealth,
    }),
    [
      sessions,
      activeSessionId,
      activeSession,
      jd,
      candidates,
      candidateStatuses,
      lastShortlist,
      scheduledInterviews,
      messages,
      isBlindHiring,
      apiConnected,
      loadingSession,
      statusSaving,
      loadSessions,
      selectSession,
      createSession,
      deleteSession,
      renameSession,
      toggleCandidateStatus,
      toggleBlindHiring,
      bookInterview,
      refreshActiveSession,
      checkApiHealth,
    ]
  );

  return (
    <RecruitContext.Provider value={value}>{children}</RecruitContext.Provider>
  );
}

export function useRecruit() {
  const context = useContext(RecruitContext);
  if (!context) {
    throw new Error("useRecruit must be used within a RecruitProvider");
  }
  return context;
}
