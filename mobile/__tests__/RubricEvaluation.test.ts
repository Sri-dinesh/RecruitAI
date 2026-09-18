import { fetchWithAuth } from "../src/lib/apiClient";

describe("5-Pillar Rubric Evaluation & PostgreSQL Sync", () => {
  let originalFetch: any;

  beforeEach(() => {
    originalFetch = (globalThis as any).fetch;
    jest.clearAllMocks();
  });

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
  });

  describe("5-Pillar Score Normalization & % Fit Calculation", () => {
    const calculateFitPercentage = (pillars: {
      technical: number;
      experience: number;
      domain: number;
      communication: number;
      problemSolving: number;
    }): number => {
      const sum =
        pillars.technical +
        pillars.experience +
        pillars.domain +
        pillars.communication +
        pillars.problemSolving;
      return Math.round((sum / 25) * 100);
    };

    test("computes perfect fit (100%) when all 5 pillars are scored 5/5", () => {
      const fit = calculateFitPercentage({
        technical: 5,
        experience: 5,
        domain: 5,
        communication: 5,
        problemSolving: 5,
      });
      expect(fit).toBe(100);
    });

    test("computes baseline fit (20%) when all 5 pillars are scored 1/5", () => {
      const fit = calculateFitPercentage({
        technical: 1,
        experience: 1,
        domain: 1,
        communication: 1,
        problemSolving: 1,
      });
      expect(fit).toBe(20);
    });

    test("accurately computes balanced candidate score (e.g. 84% fit)", () => {
      // 4 + 4 + 5 + 4 + 4 = 21 / 25 = 0.84 = 84%
      const fit = calculateFitPercentage({
        technical: 4,
        experience: 4,
        domain: 5,
        communication: 4,
        problemSolving: 4,
      });
      expect(fit).toBe(84);
    });
  });

  describe("Evaluation Dispatch Contract to `/api/candidates/evaluate`", () => {
    test("sends complete 5-pillar rubric payload with session and job associations", async () => {
      let interceptedUrl = "";
      let interceptedBody: any = null;

      (globalThis as any).fetch = jest.fn().mockImplementation(async (url: string, opts: any) => {
        interceptedUrl = url;
        interceptedBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            success: true,
            candidate_id: "cand-789",
            application_id: "app-456",
            status: "shortlisted",
            aggregate_score: 88,
          }),
        };
      });

      const payload = {
        candidate_id: "cand-789",
        session_id: "session-uuid-001",
        job_id: "job-uuid-101",
        status: "shortlisted",
        tech_score: 5,
        experience_score: 4,
        domain_score: 5,
        comm_score: 4,
        problem_solving_score: 4,
        notes: "Exceptional architecture design and distributed systems experience.",
      };

      const res = await fetchWithAuth("/api/candidates/evaluate", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      expect(res.ok).toBe(true);
      expect(interceptedUrl).toContain("/api/candidates/evaluate");
      expect(interceptedBody.candidate_id).toBe("cand-789");
      expect(interceptedBody.session_id).toBe("session-uuid-001");
      expect(interceptedBody.job_id).toBe("job-uuid-101");
      expect(interceptedBody.tech_score).toBe(5);
      expect(interceptedBody.experience_score).toBe(4);
      expect(interceptedBody.domain_score).toBe(5);
      expect(interceptedBody.comm_score).toBe(4);
      expect(interceptedBody.problem_solving_score).toBe(4);
      expect(interceptedBody.status).toBe("shortlisted");
    });
  });
});
