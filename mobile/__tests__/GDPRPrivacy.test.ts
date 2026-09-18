import { fetchWithAuth } from "../src/lib/apiClient";
import {
  enqueueOfflineMutation,
  getOfflineMutationsQueue,
  clearOfflineMutationsQueue,
} from "../src/lib/offlineStorage";
import type { Candidate } from "../src/types/schema";

// Mock SecureStore for offlineStorage tests
jest.mock("expo-secure-store", () => {
  let store: Record<string, string> = {};
  return {
    getItemAsync: jest.fn(async (key: string) => store[key] || null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      delete store[key];
    }),
    __resetStore: () => {
      store = {};
    },
  };
});

describe("GDPR & Privacy Compliance (Art. 17 & Art. 22)", () => {
  let originalFetch: any;

  beforeEach(() => {
    originalFetch = (globalThis as any).fetch;
    jest.clearAllMocks();
    const SecureStore = require("expo-secure-store");
    if (SecureStore.__resetStore) {
      SecureStore.__resetStore();
    }
  });

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
  });

  describe("GDPR Art. 17 Right-to-Erasure Candidate Deletion", () => {
    test("dispatches DELETE request to dedicated privacy endpoint", async () => {
      let requestedUrl = "";
      let requestedMethod = "";

      (globalThis as any).fetch = jest.fn().mockImplementation(async (url: string, opts: any) => {
        requestedUrl = url;
        requestedMethod = opts.method;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            success: true,
            deleted_candidate_id: "cand-erase-001",
            message: "Candidate and associated data permanently purged under GDPR Art. 17.",
          }),
        };
      });

      const res = await fetchWithAuth("/api/privacy/candidates/cand-erase-001", {
        method: "DELETE",
      });

      expect(res.ok).toBe(true);
      expect(requestedUrl).toContain("/api/privacy/candidates/cand-erase-001");
      expect(requestedMethod).toBe("DELETE");
    });
  });

  describe("Candidate Consent Metadata & Display Verification", () => {
    test("validates candidate consent fields", () => {
      const candidateWithConsent: Candidate = {
        candidate_id: "cand-consent-1",
        name: "Amara Singh",
        email: "amara@example.com",
        consent_at: "2026-09-18T10:00:00Z",
        consent_version: "v2.1",
        source: "Career Portal Application Form",
      };

      expect(candidateWithConsent.consent_at).toBeDefined();
      expect(candidateWithConsent.consent_version).toBe("v2.1");
      expect(candidateWithConsent.source).toContain("Career Portal");
    });
  });

  describe("Offline Mutation Queue Resiliency", () => {
    test("enqueues and deduplicates offline candidate status mutations", async () => {
      await clearOfflineMutationsQueue();

      await enqueueOfflineMutation({
        candidateId: "cand-101",
        status: "shortlisted",
        sessionId: "sess-1",
        timestamp: "2026-09-18T12:00:00Z",
      });

      let queue = await getOfflineMutationsQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].status).toBe("shortlisted");

      // Enqueue updated status for same candidate - should replace previous mutation
      await enqueueOfflineMutation({
        candidateId: "cand-101",
        status: "offered",
        sessionId: "sess-1",
        timestamp: "2026-09-18T12:05:00Z",
      });

      queue = await getOfflineMutationsQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].status).toBe("offered");

      // Add mutation for different candidate
      await enqueueOfflineMutation({
        candidateId: "cand-202",
        status: "rejected",
        sessionId: "sess-1",
        timestamp: "2026-09-18T12:10:00Z",
      });

      queue = await getOfflineMutationsQueue();
      expect(queue).toHaveLength(2);

      // Clear queue
      await clearOfflineMutationsQueue();
      queue = await getOfflineMutationsQueue();
      expect(queue).toHaveLength(0);
    });
  });
});
