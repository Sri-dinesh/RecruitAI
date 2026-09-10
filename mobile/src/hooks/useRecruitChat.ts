import { useState, useRef, useCallback } from "react";
import { Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useRecruit } from "@/context/RecruitContext";
import { fetchWithAuth } from "@/lib/apiClient";
import { successHaptic, warningHaptic, impactHaptic } from "@/lib/haptics";
import type { ChatMessage, ChatApiResponse } from "@/types/schema";

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
      const formData = new FormData();

      for (const asset of result.assets) {
        formData.append("files", {
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || "application/pdf",
        } as any);
      }

      const res = await fetchWithAuth("/api/ingest/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const uploaded = await res.json();
        await refreshActiveSession();
        successHaptic();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `✅ Successfully ingested **${uploaded.length}** candidate resume${
              uploaded.length === 1 ? "" : "s"
            }. You can now ask me to screen and rank candidates or view them in the Candidates tab.`,
            created_at: new Date().toISOString(),
          },
        ]);
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to parse resumes");
      }
    } catch (err: any) {
      console.error("[useRecruitChat] Upload error:", err);
      warningHaptic();
      Alert.alert("Upload Error", err.message || "Failed to upload candidate resumes.");
    } finally {
      setIsUploading(false);
    }
  }, [refreshActiveSession, setMessages]);

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
      const formData = new FormData();

      formData.append("file", {
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType || "application/pdf",
      } as any);

      const res = await fetchWithAuth("/api/ingest/upload-jd", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const jdData = await res.json();
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
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to parse Job Description");
      }
    } catch (err: any) {
      console.error("[useRecruitChat] JD Upload error:", err);
      warningHaptic();
      Alert.alert("JD Upload Error", err.message || "Failed to upload Job Description.");
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
