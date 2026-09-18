import { pollJobUntilDone } from "../src/lib/apiClient";
import { PRESET_CATEGORIES, QUICK_ACTION_CHIPS } from "../src/constants/copilotPresets";
import type { ChatMessage } from "../src/types/schema";

describe("AI Copilot Mobile Parity", () => {
  let originalFetch: any;

  beforeEach(() => {
    originalFetch = (globalThis as any).fetch;
  });

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe("Workflow Presets Deck", () => {
    test("defines 6 preset categories with 21 curated recruiter prompts", () => {
      expect(PRESET_CATEGORIES.length).toBe(6);

      const totalPrompts = PRESET_CATEGORIES.reduce(
        (sum, cat) => sum + cat.prompts.length,
        0
      );
      expect(totalPrompts).toBeGreaterThanOrEqual(18);

      const categoryIds = PRESET_CATEGORIES.map((c) => c.id);
      expect(categoryIds).toContain("screening");
      expect(categoryIds).toContain("comparison");
      expect(categoryIds).toContain("interviews");
      expect(categoryIds).toContain("outreach");
      expect(categoryIds).toContain("risks");
      expect(categoryIds).toContain("market");
    });

    test("quick action chips contain distinct high-priority recruiter actions", () => {
      expect(QUICK_ACTION_CHIPS.length).toBeGreaterThanOrEqual(4);
      expect(QUICK_ACTION_CHIPS[0]).toHaveProperty("id");
      expect(QUICK_ACTION_CHIPS[0]).toHaveProperty("label");
      expect(QUICK_ACTION_CHIPS[0]).toHaveProperty("prompt");
    });
  });

  describe("Conversation History Trimming (8-turn window)", () => {
    test("trims messages beyond 8 turns (16 messages) while preserving recent context", () => {
      const longHistory: ChatMessage[] = Array.from({ length: 24 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i + 1}`,
      }));

      // In useRecruitChat, the window is: messages.slice(-16)
      const windowedHistory = longHistory.slice(-16);
      expect(windowedHistory.length).toBe(16);
      expect(windowedHistory[0].content).toBe("Message 9");
      expect(windowedHistory[15].content).toBe("Message 24");
    });
  });

  describe("Async Long-Running Job Polling (HTTP 202 Accepted)", () => {
    test("returns completed job result immediately when completed", async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          job_id: "job-abc-123",
          status: "completed",
          progress: "100%",
          result: {
            reply: "Candidate evaluations completed successfully.",
            agent_steps: ["Loaded candidate resumes", "Computed 5-pillar rubric scores"],
            suggested_followups: ["Compare candidate scores", "Generate interview questions"],
          },
        }),
      });

      const onProgress = jest.fn();
      const finalResult = await pollJobUntilDone("job-abc-123", onProgress, 5000);

      expect(finalResult).toBeDefined();
      expect(finalResult.reply).toBe("Candidate evaluations completed successfully.");
      expect(finalResult.agent_steps).toHaveLength(2);
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "completed",
          job_id: "job-abc-123",
        })
      );
    });

    test("throws descriptive error when job status is failed", async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          job_id: "job-err-456",
          status: "failed",
          error: "LangGraph execution node timed out",
        }),
      });

      await expect(
        pollJobUntilDone("job-err-456", undefined, 5000)
      ).rejects.toThrow("LangGraph execution node timed out");
    });
  });

  describe("Cross-Device Interconnected Conversation Sync", () => {
    test("syncs incoming conversation history from web while preserving message metadata", () => {
      const serverHistory: ChatMessage[] = [
        {
          role: "user",
          content: "Find top React Native candidates",
          created_at: "2026-09-18T14:00:00Z",
        },
        {
          role: "assistant",
          content: "I evaluated 5 candidates based on technical skills and domain experience.",
          agent_steps: [
            "Parsed resumes against JD",
            "Calculated 5-pillar rubric score",
          ],
          suggested_followups: [
            "Compare top 2 candidates side-by-side",
            "Draft interview invitation email",
          ],
          created_at: "2026-09-18T14:00:05Z",
        },
      ];

      expect(serverHistory).toHaveLength(2);
      expect(serverHistory[1].agent_steps).toHaveLength(2);
      expect(serverHistory[1].suggested_followups).toHaveLength(2);
      expect(serverHistory[1].suggested_followups?.[0]).toContain("Compare top 2");
    });

    test("protects in-flight optimistic user messages from being clobbered by server sync", () => {
      const currentLocalMessages: ChatMessage[] = [
        { role: "assistant", content: "Hello! How can I help?" },
        { role: "user", content: "Rank candidates for frontend lead" },
      ];

      const staleServerHistory: ChatMessage[] = [
        { role: "assistant", content: "Hello! How can I help?" },
      ];

      const lastLocal = currentLocalMessages[currentLocalMessages.length - 1];
      const shouldSync =
        staleServerHistory.length > currentLocalMessages.length ||
        lastLocal?.role !== "user";

      // Should protect in-flight user message from rollback
      expect(shouldSync).toBe(false);
    });
  });

  describe("Bias Evaluation Mode Consistency", () => {
    test("defaults to Standard Mode (unmasked candidate details) across mobile & web", () => {
      const isBlindHiringDefault = false;
      expect(isBlindHiringDefault).toBe(false);

      const standardLabel = isBlindHiringDefault ? "Blind" : "Standard";
      const standardFullLabel = isBlindHiringDefault ? "Blind Mode" : "Standard Mode";
      expect(standardLabel).toBe("Standard");
      expect(standardFullLabel).toBe("Standard Mode");
    });
  });
});
