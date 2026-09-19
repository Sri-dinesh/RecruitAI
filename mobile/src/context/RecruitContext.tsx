import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as SecureStore from "expo-secure-store";
import { fetchWithAuth, testBackendConnection, getBackendUrl } from "@/lib/apiClient";
import {
  enqueueOfflineMutation,
  getOfflineMutationsQueue,
  clearOfflineMutationsQueue,
} from "@/lib/offlineStorage";
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

const BLIND_HIRING_STORAGE_KEY = "recruitai_is_blind_hiring";

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
  // Default is strictly Standard Mode (false): candidate names visible
  const [isBlindHiring, setIsBlindHiring] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [statusSaving, setStatusSaving] = useState<string | null>(null);

  // Hydrate persisted blind hiring mode preference on startup
  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(BLIND_HIRING_STORAGE_KEY);
        if (saved !== null) {
          setIsBlindHiring(saved === "true");
        }
      } catch (err) {
        console.warn("[RecruitContext] Failed to load blind mode from SecureStore:", err);
      }
    })();
  }, []);

  // Replay offline status mutations once network connectivity is restored
  const flushOfflineMutations = useCallback(async () => {
    try {
      const queue = await getOfflineMutationsQueue();
      if (!queue || queue.length === 0) return;
      console.log(`[RecruitContext] Replaying ${queue.length} offline candidate mutations...`);
      for (const item of queue) {
        try {
          await fetchWithAuth("/api/candidates/evaluate", {
            method: "POST",
            body: JSON.stringify({
              candidate_id: item.candidateId,
              session_id: item.sessionId,
              job_id: item.jobId,
              status: item.status,
              tech_score: item.status === "offered" ? 5 : item.status === "shortlisted" ? 4 : 1,
              comm_score: item.status === "offered" ? 5 : item.status === "shortlisted" ? 3 : 1,
              notes: `Replayed offline status mutation (${item.timestamp})`,
            }),
          });
        } catch {
          return; // Server still unreachable, retry later
        }
      }
      await clearOfflineMutationsQueue();
    } catch (err) {
      console.warn("[RecruitContext] Error flushing offline mutations:", err);
    }
  }, []);

  // Active session object
  const activeSession = useMemo(() => {
    if (!activeSessionId) return null;
    return sessions.find((s) => s.id === activeSessionId) || null;
  }, [sessions, activeSessionId]);

  // Check API Health with diagnostic logging and candidate URL fallbacks
  const checkApiHealth = useCallback(async (): Promise<boolean> => {
    try {
      const result = await testBackendConnection();
      if (result.ok) {
        console.log(`[RecruitContext] Connected to backend at ${result.url}`);
        setApiConnected(true);
        flushOfflineMutations();
        return true;
      } else {
        console.warn(`[RecruitContext] Backend disconnected (${result.url}):`, result.error);
        setApiConnected(false);
        return false;
      }
    } catch (err: any) {
      console.warn(`[RecruitContext] Health check error:`, err?.message || err);
      setApiConnected(false);
      return false;
    }
  }, [flushOfflineMutations]);

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
              const saved = list.find((s) => s.id === savedSessionId);
              const mostRecent = list[0];
              const savedTime = saved?.updated_at ? new Date(saved.updated_at).getTime() : 0;
              const recentTime = mostRecent?.updated_at ? new Date(mostRecent.updated_at).getTime() : 0;
              // If user was active on another device (e.g. web) more recently, select the most recent session
              if (mostRecent && recentTime > savedTime && recentTime - savedTime > 5000) {
                targetSessionId = mostRecent.id;
              } else {
                targetSessionId = savedSessionId;
              }
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
  }, [selectSession, createSession]);

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

  // Delete candidate (GDPR Art. 17 right-to-erasure)
  const deleteCandidate = useCallback(
    async (candidateId: string): Promise<boolean> => {
      try {
        const res = await fetchWithAuth(`/api/privacy/candidates/${candidateId}`, {
          method: "DELETE",
        });
        if (res.ok) {
          setCandidates((prev) => prev.filter((c) => c.candidate_id !== candidateId));
          setCandidateStatuses((prev) => {
            const next = { ...prev };
            delete next[candidateId];
            return next;
          });
          setLastShortlist((prev) =>
            prev ? prev.filter((c) => c.candidate_id !== candidateId) : null
          );
          setScheduledInterviews((prev) =>
            prev.filter(
              (i) => i.candidate_id !== candidateId && i.candidate_name !== candidateId
            )
          );
          warningHaptic();
          return true;
        }
      } catch (err) {
        console.error("[RecruitContext] Error deleting candidate:", err);
      }
      return false;
    },
    []
  );

  // Toggle candidate status (shortlisted, offered, rejected) with optimistic rollback & session linking
  const toggleCandidateStatus = useCallback(
    async (
      candidateId: string,
      candidateName: string,
      status: CandidateStatus
    ): Promise<void> => {
      const prevStatuses = { ...candidateStatuses };
      const nextStatus =
        candidateStatuses[candidateId] === status ? undefined : status;
      const updated = { ...candidateStatuses };

      if (nextStatus) {
        updated[candidateId] = nextStatus;
      } else {
        delete updated[candidateId];
      }

      // Optimistic update
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

      // Sync to backend candidate evaluation endpoint
      if (nextStatus) {
        setStatusSaving(candidateId);
        try {
          const res = await fetchWithAuth("/api/candidates/evaluate", {
            method: "POST",
            body: JSON.stringify({
              candidate_id: candidateId,
              session_id: activeSessionId || undefined,
              job_id: jd?.id || undefined,
              status: nextStatus || "new",
              tech_score:
                nextStatus === "offered" ? 5 : nextStatus === "shortlisted" ? 4 : 1,
              comm_score:
                nextStatus === "offered" ? 5 : nextStatus === "shortlisted" ? 3 : 1,
              notes: `Recruiter marked candidate as ${nextStatus || "new"} via mobile app.`,
            }),
          });
          if (!res.ok) {
            throw new Error(`Server returned ${res.status}`);
          }
        } catch (err) {
          console.warn("[RecruitContext] Evaluate persist failed, enqueuing offline mutation:", err);
          await enqueueOfflineMutation({
            candidateId,
            sessionId: activeSessionId || undefined,
            jobId: jd?.id || undefined,
            status: nextStatus,
            timestamp: new Date().toISOString(),
          });
          warningHaptic();
        } finally {
          setStatusSaving(null);
        }
      }
    },
    [candidateStatuses, activeSessionId, jd]
  );

  // Explicit setter for Blind Hiring Mode
  const setBlindHiringExplicit = useCallback(async (val: boolean) => {
    setIsBlindHiring(val);
    try {
      await SecureStore.setItemAsync(BLIND_HIRING_STORAGE_KEY, String(val));
    } catch (err) {
      console.warn("[RecruitContext] Failed to persist blind mode to SecureStore:", err);
    }
    fetchWithAuth("/api/users/me", {
      method: "PATCH",
      body: JSON.stringify({
        preferences: {
          blind_mode_default: val,
        },
      }),
    }).catch(() => {});
  }, []);

  // Toggle Blind Hiring Mode (Standard Mode is default; option only changes when manually toggled)
  const toggleBlindHiring = useCallback(() => {
    selectionHaptic();
    setIsBlindHiring((prev) => {
      const next = !prev;
      SecureStore.setItemAsync(BLIND_HIRING_STORAGE_KEY, String(next)).catch((err) => {
        console.warn("[RecruitContext] Failed to persist blind mode to SecureStore:", err);
      });
      fetchWithAuth("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          preferences: {
            blind_mode_default: next,
          },
        }),
      }).catch((err) => {
        console.warn("[RecruitContext] Failed to sync blind mode preference to backend:", err);
      });
      return next;
    });
  }, []);

  // Book an interview slot
  const bookInterview = useCallback(
    async (
      candidateName: string,
      slot: string,
      candidateId?: string,
      mode?: string,
      meetingLink?: string
    ) => {
      const generatedMeetingLink =
        meetingLink ||
        `https://meet.recruitai.internal/${Math.random().toString(36).substring(2, 9)}`;
      const newBooking: ScheduledInterview = {
        candidate_id: candidateId,
        candidate_name: candidateName,
        slot,
        mode: mode || "Technical Round",
        meeting_link: generatedMeetingLink,
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
              message: `Confirm booking interview with ${candidateName} for ${slot} (${newBooking.mode}) - Link: ${newBooking.meeting_link}`,
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

  // Cancel an interview slot
  const cancelInterview = useCallback(
    async (candidateName: string, slot: string) => {
      setScheduledInterviews((prev) =>
        prev.filter((i) => !(i.candidate_name === candidateName && i.slot === slot))
      );
      warningHaptic();
      if (activeSessionId) {
        try {
          await fetchWithAuth("/api/chat", {
            method: "POST",
            body: JSON.stringify({
              message: `Cancelled scheduled interview with ${candidateName} for ${slot}`,
              session_id: activeSessionId,
            }),
          });
        } catch (err) {
          console.warn("[RecruitContext] Non-blocking cancel interview sync failed:", err);
        }
      }
    },
    [activeSessionId]
  );

  // Refresh current active session
  const refreshActiveSession = useCallback(async () => {
    if (activeSessionId) {
      await selectSession(activeSessionId);
    }
  }, [activeSessionId, selectSession]);

  // Quiet background sync for active session to keep conversation interconnected across devices
  const syncActiveSession = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      const res = await fetchWithAuth(`/api/sessions/${activeSessionId}`);
      if (!res.ok) return;
      const data = await res.json();

      if (data.conversation_history && Array.isArray(data.conversation_history)) {
        const serverHistory = data.conversation_history as ChatMessage[];
        setMessages((prev) => {
          if (serverHistory.length === 0) return prev;

          // If local is just default greeting and server has real messages, sync
          if (prev.length === 1 && prev[0].content === DEFAULT_GREETING.content) {
            return serverHistory;
          }

          const lastPrev = prev[prev.length - 1];
          const lastServer = serverHistory[serverHistory.length - 1];

          // If local has more messages than server and last message was sent by user,
          // user is awaiting an in-flight AI response. Do not overwrite.
          if (prev.length > serverHistory.length && lastPrev?.role === "user") {
            return prev;
          }

          // If message count differs or last message content/role differs, update
          if (
            serverHistory.length !== prev.length ||
            lastPrev?.content !== lastServer?.content ||
            lastPrev?.role !== lastServer?.role
          ) {
            return serverHistory;
          }

          return prev;
        });
      }

      // Quietly sync job description, candidates, and interviews if updated from another device
      if (data.jd_structured) {
        setJd((prev) =>
          JSON.stringify(prev) !== JSON.stringify(data.jd_structured)
            ? data.jd_structured
            : prev
        );
      }
      if (data.resumes && Array.isArray(data.resumes)) {
        setCandidates((prev) =>
          prev.length !== data.resumes.length ? data.resumes : prev
        );
      }
      if (data.last_shortlist) {
        setLastShortlist((prev) =>
          JSON.stringify(prev) !== JSON.stringify(data.last_shortlist)
            ? data.last_shortlist
            : prev
        );
      }
      if (data.scheduled_interviews) {
        setScheduledInterviews((prev) =>
          JSON.stringify(prev) !== JSON.stringify(data.scheduled_interviews)
            ? data.scheduled_interviews
            : prev
        );
      }
    } catch {
      // Quiet background failure
    }
  }, [activeSessionId]);

  // Quietly refresh sessions list in background so newly created campaigns from web appear
  const quietRefreshSessions = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/api/sessions");
      if (res.ok) {
        const list: ChatSession[] = await res.json();
        setSessions((prev) => {
          if (list.length !== prev.length || JSON.stringify(list) !== JSON.stringify(prev)) {
            return list;
          }
          return prev;
        });
      }
    } catch {}
  }, []);

  // Initial load when authenticated
  useEffect(() => {
    if (user) {
      loadSessions();
      checkApiHealth();

      // Fetch recruiter preferences ONLY if user has not already chosen a setting on this device
      (async () => {
        try {
          const localSaved = await SecureStore.getItemAsync(BLIND_HIRING_STORAGE_KEY);
          if (localSaved !== null) {
            // User's manual selection in SecureStore is authoritative; never overwrite it!
            setIsBlindHiring(localSaved === "true");
            return;
          }
          const res = await fetchWithAuth("/api/users/me");
          if (res.ok) {
            const data = await res.json();
            if (data?.preferences?.blind_mode_default !== undefined) {
              const serverPref = data.preferences.blind_mode_default === true;
              setIsBlindHiring(serverPref);
              await SecureStore.setItemAsync(BLIND_HIRING_STORAGE_KEY, String(serverPref));
            }
          }
        } catch {}
      })();
    }
  }, [user, loadSessions, checkApiHealth]);

  // AppState listener: immediately re-check connectivity, refresh sessions, and sync active session when app becomes active
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextAppState: AppStateStatus) => {
        if (nextAppState === "active") {
          checkApiHealth();
          quietRefreshSessions();
          syncActiveSession();
        }
      }
    );
    return () => {
      subscription.remove();
    };
  }, [checkApiHealth, quietRefreshSessions, syncActiveSession]);

  // Periodic real-time chat & session sync: polls every 4s while connected (matching web dashboard)
  useEffect(() => {
    if (!activeSessionId || !apiConnected) return;
    const interval = setInterval(() => {
      syncActiveSession();
    }, 4000);
    return () => clearInterval(interval);
  }, [activeSessionId, apiConnected, syncActiveSession]);

  // Periodic sessions list refresh: polls every 12s while connected
  useEffect(() => {
    if (!apiConnected) return;
    const interval = setInterval(() => {
      quietRefreshSessions();
    }, 12000);
    return () => clearInterval(interval);
  }, [apiConnected, quietRefreshSessions]);

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
      deleteCandidate,
      toggleCandidateStatus,
      toggleBlindHiring,
      setIsBlindHiring: setBlindHiringExplicit,
      setMessages,
      setCandidates,
      setJd,
      setScheduledInterviews,
      bookInterview,
      cancelInterview,
      refreshActiveSession,
      syncActiveSession,
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
      deleteCandidate,
      toggleCandidateStatus,
      toggleBlindHiring,
      setBlindHiringExplicit,
      bookInterview,
      cancelInterview,
      refreshActiveSession,
      syncActiveSession,
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
