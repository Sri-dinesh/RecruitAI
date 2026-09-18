import { fetchWithAuth } from "../src/lib/apiClient";

describe("Tavily Live Web Search & Market Intelligence", () => {
  let originalFetch: any;

  beforeEach(() => {
    originalFetch = (globalThis as any).fetch;
    jest.clearAllMocks();
  });

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
  });

  test("dispatches salary benchmark intelligence prompt to copilot endpoint", async () => {
    let requestPayload: any = null;

    (globalThis as any).fetch = jest.fn().mockImplementation(async (_url: string, opts: any) => {
      requestPayload = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          reply:
            "Market salary benchmarks for Senior Distributed Systems Engineer indicate base compensation of $175,000 - $220,000 with 0.15% equity.",
          agent_steps: [
            "Initiated Tavily web search",
            "Retrieved 2026 tech compensation datasets",
            "Synthesized percentiles and regional variances",
          ],
          suggested_followups: [
            "Compare against current budget",
            "Draft competitive offer package",
          ],
        }),
      };
    });

    const res = await fetchWithAuth("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        message:
          "Search the web using Tavily for current market salary benchmarks for Senior Distributed Systems Engineer.",
        session_id: "session-bench-1",
      }),
    });

    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(requestPayload.message).toContain("Tavily");
    expect(requestPayload.message).toContain("salary benchmarks");
    expect(data.reply).toContain("$175,000");
    expect(data.agent_steps).toHaveLength(3);
    expect(data.suggested_followups).toContain("Compare against current budget");
  });

  test("handles live requisition competitive analysis query", async () => {
    let requestPayload: any = null;

    (globalThis as any).fetch = jest.fn().mockImplementation(async (_url: string, opts: any) => {
      requestPayload = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          reply:
            "Peer requisitions currently require Kubernetes, Rust, and event-driven architecture with Kafka.",
          agent_steps: [
            "Queried live job boards via Tavily",
            "Extracted skill requirements from competitor listings",
          ],
        }),
      };
    });

    const res = await fetchWithAuth("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        message:
          "Search live web job postings for peer tech requisitions. What skills are peers prioritizing?",
        session_id: "session-bench-1",
      }),
    });

    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.agent_steps[0]).toContain("Tavily");
    expect(data.reply).toContain("Kubernetes");
  });
});
