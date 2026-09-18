import * as SecureStore from "expo-secure-store";
import type { ChatSession, CandidateStatus } from "@/types/schema";

export interface PendingStatusMutation {
  candidateId: string;
  sessionId?: string;
  jobId?: string;
  status: CandidateStatus;
  timestamp: string;
}

const CACHE_KEYS = {
  SESSIONS_LIST: "recruitai_cached_sessions_list",
  SESSION_PREFIX: "recruitai_cached_session_",
  STATUSES_PREFIX: "recruitai_statuses_",
  OFFLINE_MUTATIONS: "recruitai_pending_mutations",
  ACTIVE_SESSION: "recruitai_active_session_id",
};

/**
 * Cache complete session snapshot locally for offline hydration.
 */
export async function saveCachedSession(
  sessionId: string,
  sessionData: any
): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      `${CACHE_KEYS.SESSION_PREFIX}${sessionId}`,
      JSON.stringify(sessionData)
    );
  } catch (err) {
    console.warn("[offlineStorage] Error caching session:", err);
  }
}

export async function getCachedSession(sessionId: string): Promise<any | null> {
  try {
    const raw = await SecureStore.getItemAsync(
      `${CACHE_KEYS.SESSION_PREFIX}${sessionId}`
    );
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Cache list of all hiring sessions for quick offline access.
 */
export async function saveCachedSessionsList(
  sessions: ChatSession[]
): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      CACHE_KEYS.SESSIONS_LIST,
      JSON.stringify(sessions)
    );
  } catch (err) {
    console.warn("[offlineStorage] Error caching sessions list:", err);
  }
}

export async function getCachedSessionsList(): Promise<ChatSession[]> {
  try {
    const raw = await SecureStore.getItemAsync(CACHE_KEYS.SESSIONS_LIST);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Cache candidate statuses by campaign session.
 */
export async function saveCachedStatuses(
  sessionId: string,
  statuses: Record<string, CandidateStatus>
): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      `${CACHE_KEYS.STATUSES_PREFIX}${sessionId}`,
      JSON.stringify(statuses)
    );
  } catch (err) {
    console.warn("[offlineStorage] Error caching statuses:", err);
  }
}

export async function getCachedStatuses(
  sessionId: string
): Promise<Record<string, CandidateStatus>> {
  try {
    const raw = await SecureStore.getItemAsync(
      `${CACHE_KEYS.STATUSES_PREFIX}${sessionId}`
    );
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Offline Mutation Queue: Enqueue status changes made while offline to replay upon reconnect.
 */
export async function enqueueOfflineMutation(
  mutation: PendingStatusMutation
): Promise<void> {
  try {
    const queue = await getOfflineMutationsQueue();
    // Replace duplicate mutation for same candidate if pending
    const filtered = queue.filter((m) => m.candidateId !== mutation.candidateId);
    filtered.push(mutation);
    await SecureStore.setItemAsync(
      CACHE_KEYS.OFFLINE_MUTATIONS,
      JSON.stringify(filtered)
    );
  } catch (err) {
    console.warn("[offlineStorage] Error enqueuing mutation:", err);
  }
}

export async function getOfflineMutationsQueue(): Promise<PendingStatusMutation[]> {
  try {
    const raw = await SecureStore.getItemAsync(CACHE_KEYS.OFFLINE_MUTATIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearOfflineMutationsQueue(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CACHE_KEYS.OFFLINE_MUTATIONS);
  } catch (err) {
    console.warn("[offlineStorage] Error clearing mutation queue:", err);
  }
}
