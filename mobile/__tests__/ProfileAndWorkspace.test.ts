import { fetchWithAuth } from "../src/lib/apiClient";
import type { UserProfile, UserPreferences } from "../src/context/AuthContext";
import type { ScheduledInterview } from "../src/types/schema";

describe("Mobile Profile Settings & Workspace Feature Parity", () => {
  let originalFetch: any;

  beforeEach(() => {
    originalFetch = (globalThis as any).fetch;
    jest.clearAllMocks();
  });

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
  });

  describe("Recruiter Profile & Preferences API Sync", () => {
    test("syncs updated recruiter profile via PATCH /api/users/me", async () => {
      let requestedUrl = "";
      let requestedMethod = "";
      let parsedBody: any = null;

      (globalThis as any).fetch = jest.fn().mockImplementation(async (url: string, opts: any) => {
        requestedUrl = url;
        requestedMethod = opts.method;
        parsedBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          headers: {
            get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null),
          },
          json: async () => ({
            id: "user-test-uuid",
            full_name: parsedBody.full_name,
            company_name: parsedBody.company_name,
            department: parsedBody.department,
            preferences: parsedBody.preferences,
          }),
        };
      });

      const preferences: UserPreferences = {
        blind_mode_default: true,
        theme: "light",
        email_alerts: true,
      };

      const updatedPayload: Partial<UserProfile> = {
        full_name: "Elena Rostova",
        company_name: "Apex AI Labs",
        department: "Talent Acquisition",
        preferences,
      };

      const res = await fetchWithAuth("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify(updatedPayload),
      });

      expect(res.ok).toBe(true);
      expect(requestedUrl).toContain("/api/users/me");
      expect(requestedMethod).toBe("PATCH");
      expect(parsedBody.full_name).toBe("Elena Rostova");
      expect(parsedBody.preferences.blind_mode_default).toBe(true);
    });

    test("handles user data export via GET /api/privacy/user/export", async () => {
      let requestedUrl = "";

      (globalThis as any).fetch = jest.fn().mockImplementation(async (url: string) => {
        requestedUrl = url;
        return {
          ok: true,
          status: 200,
          headers: {
            get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null),
          },
          json: async () => ({
            export_timestamp: "2026-09-19T12:00:00Z",
            gdpr_article: "Article 15 & Article 20",
            user: { id: "user-export-01", email: "recruiter@apex.ai" },
            sessions: [{ id: "sess-1", title: "Core Staff Engineer" }],
            candidates: [{ id: "cand-1", full_name: "Alex Vance" }],
            interviews: [{ candidate_id: "cand-1", slot: "Fri, Sep 20" }],
          }),
        };
      });

      const res = await fetchWithAuth("/api/privacy/user/export");
      expect(res.ok).toBe(true);
      expect(requestedUrl).toContain("/api/privacy/user/export");
      const data = await res.json();
      expect(data.gdpr_article).toContain("Article 15");
      expect(data.sessions).toHaveLength(1);
    });

    test("handles account purge via DELETE /api/privacy/user/account", async () => {
      let requestedMethod = "";

      (globalThis as any).fetch = jest.fn().mockImplementation(async (url: string, opts: any) => {
        requestedMethod = opts?.method || "GET";
        return {
          ok: true,
          status: 200,
          headers: {
            get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null),
          },
          json: async () => ({
            success: true,
            user_id: "user-purge-01",
            message: "User account and all associated recruitment assets permanently purged.",
          }),
        };
      });

      const res = await fetchWithAuth("/api/privacy/user/account", {
        method: "DELETE",
      });

      expect(res.ok).toBe(true);
      expect(requestedMethod).toBe("DELETE");
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe("Requisition & Rubric Calibration Logic", () => {
    test("calculates rubric pillar weights and validates 100% total", () => {
      const pillars = [
        { key: "core", name: "Core Technical Skills", weight: 35 },
        { key: "system", name: "System Architecture", weight: 25 },
        { key: "problem", name: "Problem Solving", weight: 15 },
        { key: "comm", name: "Communication & Leadership", weight: 15 },
        { key: "culture", name: "Velocity & Execution", weight: 10 },
      ];

      const sum = pillars.reduce((acc, p) => acc + p.weight, 0);
      expect(sum).toBe(100);

      // Adjusting one pillar without balancing should trigger invalid sum
      const modified = pillars.map((p) => (p.key === "core" ? { ...p, weight: 40 } : p));
      const invalidSum = modified.reduce((acc, p) => acc + p.weight, 0);
      expect(invalidSum).toBe(105);
      expect(invalidSum === 100).toBe(false);
    });
  });

  describe("Enhanced Interview Coordination Logic", () => {
    test("constructs valid scheduled interview entity with mode and room link", () => {
      const interview: ScheduledInterview = {
        candidate_id: "cand-999",
        candidate_name: "Sarah Connor",
        slot: "Mon, Sep 22 • 10:00 AM",
        mode: "Technical Architecture",
        meeting_link: "https://meet.recruitai.internal/sarah-connor",
        booked_at: new Date().toISOString(),
      };

      expect(interview.candidate_name).toBe("Sarah Connor");
      expect(interview.mode).toBe("Technical Architecture");
      expect(interview.meeting_link).toContain("https://meet.recruitai.internal/");
      expect(interview.booked_at).toBeDefined();
    });
  });
});
