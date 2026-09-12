import { uploadFileWithAuth } from "../src/lib/apiClient";
import { supabase } from "../src/lib/supabase";

describe("Native File Ingestion (uploadFileWithAuth via XMLHttpRequest)", () => {
  let originalXHR: any;
  let mockXHRInstances: any[] = [];
  const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    jest.clearAllMocks();
    mockXHRInstances = [];
    originalXHR = (globalThis as any).XMLHttpRequest;

    // Mock XMLHttpRequest
    (globalThis as any).XMLHttpRequest = jest.fn().mockImplementation(() => {
      const instance: any = {
        open: jest.fn(),
        setRequestHeader: jest.fn(),
        send: jest.fn(),
        status: 200,
        responseText: "",
        onload: null,
        onerror: null,
        ontimeout: null,
        headers: {} as Record<string, string>,
      };
      instance.setRequestHeader.mockImplementation((k: string, v: string) => {
        instance.headers[k] = v;
      });
      mockXHRInstances.push(instance);
      return instance;
    });
  });

  afterEach(() => {
    (globalThis as any).XMLHttpRequest = originalXHR;
  });

  test("uploads file using native XMLHttpRequest and FormData without Content-Type override", async () => {
    const uploadPromise = uploadFileWithAuth(
      "/api/ingest/upload",
      "file:///data/cache/DocumentPicker/resume.pdf",
      {
        fieldName: "files",
        fileName: "Devon_Clark_Resume.pdf",
        mimeType: "application/pdf",
      }
    );

    await flushPromises();
    const xhr = mockXHRInstances[0];
    expect(xhr.open).toHaveBeenCalledWith("POST", expect.stringContaining("/api/ingest/upload"));

    // Simulate successful server response
    xhr.status = 200;
    xhr.responseText = JSON.stringify([
      {
        candidate_id: "cand-123",
        name: "Devon Clark",
        match_score: 92,
      },
    ]);
    xhr.onload();

    const result = await uploadPromise;

    expect(xhr.send).toHaveBeenCalledTimes(1);
    const sentFormData = xhr.send.mock.calls[0][0];
    expect(sentFormData).toBeInstanceOf(FormData);
    expect(result).toEqual([
      {
        candidate_id: "cand-123",
        name: "Devon Clark",
        match_score: 92,
      },
    ]);
  });

  test("attaches Supabase Bearer token in headers when session exists", async () => {
    jest.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
      data: {
        session: {
          access_token: "mock-jwt-token-123",
          refresh_token: "mock-refresh",
          expires_in: 3600,
          token_type: "bearer",
          user: { id: "user-123" } as any,
        },
      },
      error: null,
    });

    const uploadPromise = uploadFileWithAuth("/api/ingest/upload-jd", "file:///data/jd.txt", {
      fieldName: "file",
      fileName: "Software_Engineer_JD.txt",
      mimeType: "text/plain",
    });

    await flushPromises();
    const xhr = mockXHRInstances[0];
    xhr.status = 200;
    xhr.responseText = JSON.stringify({ role: "Lead Engineer", requirements: [] });
    xhr.onload();

    await uploadPromise;

    expect(xhr.headers["Authorization"]).toBe("Bearer mock-jwt-token-123");
  });

  test("throws detailed error when upload responds with HTTP 400 or 500 error", async () => {
    const uploadPromise = uploadFileWithAuth("/api/ingest/upload", "file:///bad-file.exe", {
      fieldName: "files",
      fileName: "bad-file.exe",
    });

    await flushPromises();
    const xhr = mockXHRInstances[0];
    xhr.status = 400;
    xhr.responseText = JSON.stringify({
      detail: "Unsupported file format '.exe'. Supported formats: PDF, DOCX, TXT.",
    });
    xhr.onload();

    await expect(uploadPromise).rejects.toThrow(
      "Unsupported file format '.exe'. Supported formats: PDF, DOCX, TXT."
    );
  });

  test("throws generic status error if body is non-JSON or missing detail", async () => {
    const uploadPromise = uploadFileWithAuth("/api/ingest/upload", "file:///resume.pdf");

    await flushPromises();
    const xhr = mockXHRInstances[0];
    xhr.status = 502;
    xhr.responseText = "Bad Gateway";
    xhr.onload();

    await expect(uploadPromise).rejects.toThrow("Bad Gateway");
  });
});
