import { useState, useRef, useCallback } from "react";
import * as DocumentPicker from "expo-document-picker";
import { useRecruit } from "@/context/RecruitContext";
import { fetchWithAuth, uploadFileWithAuth } from "@/lib/apiClient";
import { showAppModal } from "@/context/ModalContext";
import { successHaptic, warningHaptic, impactHaptic } from "@/lib/haptics";
import type { ChatMessage, ChatApiResponse, Candidate, JobDescription } from "@/types/schema";

export function useRecruitChat() {
  const {
    activeSessionId,
    messages,
    setMessages,
    jd,
    setJd,
    candidates,
    setCandidates,
    lastShortlist,
    scheduledInterviews,
    refreshActiveSession,
  } = useRecruit();

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Send message to /api/chat
  const sendMessage = useCallback(
    async (overrideText?: string) => {
      const textToSend = (overrideText || input).trim();
      if (!textToSend || isLoading) return;

      setInput("");
      setIsLoading(true);

      const userMessage: ChatMessage = {
        role: "user",
        content: textToSend,
        created_at: new Date().toISOString(),
      };

      // Optimistic update
      const updatedHistory = [...messages, userMessage];
      setMessages(updatedHistory);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const payload = {
          message: textToSend,
          conversation_history: updatedHistory.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          jd_structured: jd,
          resumes: candidates,
          last_shortlist: lastShortlist,
          scheduled_interviews: scheduledInterviews,
          session_id: activeSessionId,
        };

        const res = await fetchWithAuth("/api/chat", {
          method: "POST",
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `Server error ${res.status}`);
        }

        const data: ChatApiResponse = await res.json();

        // Append assistant response
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: data.response,
          created_at: new Date().toISOString(),
        };
        setMessages([...updatedHistory, assistantMessage]);

        // Sync received state changes
        if (data.jd_structured) {
          setJd(data.jd_structured);
        }
        if (data.resumes && data.resumes.length > 0) {
          setCandidates(data.resumes);
        }

        successHaptic();
      } catch (err: any) {
        if (err.name === "AbortError" || controller.signal.aborted) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "_Request cancelled by user._",
              created_at: new Date().toISOString(),
            },
          ]);
        } else {
          console.error("[useRecruitChat] Chat API error:", err);
          warningHaptic();
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `⚠️ **Unable to complete request**: ${
                err.message || "Failed to reach backend."
              }`,
              created_at: new Date().toISOString(),
            },
          ]);
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [
      input,
      isLoading,
      messages,
      setMessages,
      jd,
      setJd,
      candidates,
      setCandidates,
      lastShortlist,
      scheduledInterviews,
      activeSessionId,
    ]
  );

  // Cancel ongoing request
  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      impactHaptic();
    }
  }, []);

  // Upload Candidate Resumes via DocumentPicker
  const uploadResumes = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "text/plain",
        ],
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      setIsUploading(true);

      const uploaded: Candidate[] = [];
      const failedNames: string[] = [];

      for (const asset of result.assets) {
        try {
          const res = await uploadFileWithAuth<Candidate[] | Candidate>("/api/ingest/upload", asset.uri, {
            fieldName: "files",
            fileName: asset.name,
            mimeType: asset.mimeType || "application/pdf",
          });
          if (Array.isArray(res)) {
            uploaded.push(...res);
          } else if (res && typeof res === "object" && "candidate_id" in res) {
            uploaded.push(res as Candidate);
          }
        } catch (err: any) {
          console.error("[useRecruitChat] Single file upload error:", asset.name, err);
          failedNames.push(asset.name || "Resume");
        }
      }

      if (uploaded.length > 0) {
        // Merge into local candidates state immediately
        setCandidates((prev) => {
          const existingIds = new Set(prev.map((c) => c.candidate_id));
          const added = uploaded.filter((c) => !existingIds.has(c.candidate_id));
          return [...prev, ...added];
        });

        await refreshActiveSession();
        successHaptic();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `✅ Successfully ingested **${uploaded.length}** candidate resume${
              uploaded.length === 1 ? "" : "s"
            }.${
              failedNames.length > 0
                ? ` (Note: ${failedNames.length} file could not be parsed: ${failedNames.join(", ")})`
                : ""
            } You can now ask me to screen and rank candidates or view them in the Candidates tab.`,
            created_at: new Date().toISOString(),
          },
        ]);

        if (failedNames.length > 0) {
          showAppModal({
            title: "Partial Ingestion",
            message: `Ingested ${uploaded.length} candidate(s), but ${failedNames.length} file(s) (${failedNames.join(", ")}) failed to parse.`,
            type: "warning",
          });
        }
      } else if (failedNames.length > 0) {
        showAppModal({
          title: "Upload Failed",
          message: "Unable to parse the selected resumes. Please verify they are valid PDF or Word documents and try again.",
          type: "error",
        });
      }
    } catch (err: any) {
      console.error("[useRecruitChat] Upload error:", err);
      showAppModal({
        title: "Upload Error",
        message: err.message || "Failed to upload candidate resumes.",
        type: "error",
      });
    } finally {
      setIsUploading(false);
    }
  }, [refreshActiveSession, setMessages, setCandidates]);

  // Upload Job Description via DocumentPicker
  const uploadJd = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "text/plain",
        ],
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      setIsUploading(true);
      const asset = result.assets[0];

      const jdData = await uploadFileWithAuth<JobDescription>(
        "/api/ingest/upload-jd",
        asset.uri,
        {
          fieldName: "file",
          fileName: asset.name,
          mimeType: asset.mimeType || "application/pdf",
        }
      );

      setJd(jdData);
      await refreshActiveSession();
      successHaptic();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `📄 Loaded Job Description for **${jdData.role || "Target Role"}** (${
            jdData.experience_years || 0
          }+ years experience). Required skills: ${
            jdData.required_skills?.slice(0, 6).join(", ") || "extracted"
          }.`,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err: any) {
      console.error("[useRecruitChat] JD Upload error:", err);
      showAppModal({
        title: "JD Upload Error",
        message: err.message || "Failed to upload Job Description.",
        type: "error",
      });
    } finally {
      setIsUploading(false);
    }
  }, [refreshActiveSession, setJd, setMessages]);

  return {
    input,
    setInput,
    isLoading,
    isUploading,
    sendMessage,
    cancelRequest,
    uploadResumes,
    uploadJd,
  };
}
