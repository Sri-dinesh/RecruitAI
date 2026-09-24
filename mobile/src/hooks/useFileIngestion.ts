import { useState, useCallback } from "react";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { uploadFileWithAuth, fetchWithAuth } from "@/lib/apiClient";
import { useRecruit } from "@/context/RecruitContext";
import { showAppModal } from "@/context/ModalContext";
import { successHaptic, warningHaptic } from "@/lib/haptics";
import type { Candidate, JobDescription } from "@/types/schema";
import type { IngestionFileReport } from "@/components/modals/IngestionProgressModal";

export function useFileIngestion() {
  const { setCandidates, setJd, activeSessionId, refreshActiveSession } = useRecruit();
  const [isUploadingResumes, setIsUploadingResumes] = useState(false);
  const [isUploadingJd, setIsUploadingJd] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [ingestionReports, setIngestionReports] = useState<IngestionFileReport[]>([]);
  const [isReportModalVisible, setIsReportModalVisible] = useState(false);

  const closeReportModal = useCallback(() => {
    setIsReportModalVisible(false);
  }, []);

  const ingestResumes = useCallback(async (): Promise<Candidate[] | null> => {
    setUploadError(null);
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
        return null;
      }

      setIsUploadingResumes(true);

      const uploaded: Candidate[] = [];
      const reports: IngestionFileReport[] = [];

      for (const asset of result.assets) {
        try {
          const res = await uploadFileWithAuth<any>("/api/ingest/upload", asset.uri, {
            fieldName: "files",
            fileName: asset.name,
            mimeType: asset.mimeType || "application/pdf",
            extraFields: activeSessionId ? { session_id: activeSessionId } : {},
          });

          if (Array.isArray(res)) {
            res.forEach((item: any) => {
              if (item.status === "duplicate") {
                reports.push({
                  filename: item.filename || asset.name,
                  status: "duplicate",
                });
              } else if (item.status === "failed" || item.error) {
                reports.push({
                  filename: item.filename || asset.name,
                  status: "error",
                  error: item.error || "Extraction failed",
                });
              } else if (item.candidate_id) {
                uploaded.push(item as Candidate);
                reports.push({
                  filename: item.filename || asset.name,
                  status: "success",
                  candidateName: item.name,
                });
              }
            });
          } else if (res && typeof res === "object" && res.candidate_id) {
            uploaded.push(res as Candidate);
            reports.push({
              filename: asset.name,
              status: "success",
              candidateName: res.name,
            });
          } else {
            reports.push({
              filename: asset.name,
              status: "error",
              error: "Unexpected response format",
            });
          }
        } catch (err: any) {
          console.error("[useFileIngestion] Single file upload error:", asset.name, err);
          reports.push({
            filename: asset.name || "Resume",
            status: "error",
            error: err.message || "Network/upload failure",
          });
        }
      }

      setIngestionReports(reports);

      if (uploaded.length > 0) {
        // Merge newly ingested candidates avoiding duplicate IDs
        setCandidates((prev) => {
          const existingIds = new Set(prev.map((c) => c.candidate_id));
          const added = uploaded.filter((c) => !existingIds.has(c.candidate_id));
          return [...prev, ...added];
        });

        await refreshActiveSession();

        const hasFailures = reports.some((r) => r.status !== "success");
        if (!hasFailures) {
          successHaptic();
          showAppModal({
            title: "Upload Complete",
            message: `Successfully parsed and ingested ${uploaded.length} candidate resume${
              uploaded.length === 1 ? "" : "s"
            }.`,
            type: "success",
          });
        } else {
          warningHaptic();
          setIsReportModalVisible(true);
        }
        return uploaded;
      } else {
        const errorMsg = "Unable to parse the selected resumes. Please verify they are valid PDF or Word documents.";
        setUploadError(errorMsg);
        setIsReportModalVisible(true);
        return null;
      }
    } catch (err: any) {
      console.error("[useFileIngestion] Error uploading resumes:", err);
      const message = err.message || "An unexpected error occurred during upload.";
      setUploadError(message);
      showAppModal({
        title: "Upload Failed",
        message,
        type: "error",
      });
      return null;
    } finally {
      setIsUploadingResumes(false);
    }
  }, [setCandidates, activeSessionId, refreshActiveSession]);

  const ingestJobDescription = useCallback(async (): Promise<JobDescription | null> => {
    setUploadError(null);
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
        return null;
      }

      setIsUploadingJd(true);
      const asset = result.assets[0];

      const parsedJd = await uploadFileWithAuth<JobDescription>(
        "/api/ingest/upload-jd",
        asset.uri,
        {
          fieldName: "file",
          fileName: asset.name,
          mimeType: asset.mimeType || "application/pdf",
          extraFields: activeSessionId ? { session_id: activeSessionId } : {},
        }
      );

      setJd(parsedJd);
      await refreshActiveSession();
      successHaptic();
      showAppModal({
        title: "JD Loaded",
        message: `Loaded Job Description for "${parsedJd.role || "Role"}".`,
        type: "success",
      });

      return parsedJd;
    } catch (err: any) {
      console.error("[useFileIngestion] Error uploading JD:", err);
      const message = err.message || "An unexpected error occurred during JD upload.";
      setUploadError(message);
      showAppModal({
        title: "JD Upload Failed",
        message,
        type: "error",
      });
      return null;
    } finally {
      setIsUploadingJd(false);
    }
  }, [setJd, activeSessionId, refreshActiveSession]);

  // Text paste parity with web — direct /api/ingest/upload-jd via temp file (no LangGraph chat)
  const ingestJobDescriptionFromText = useCallback(
    async (text: string): Promise<JobDescription | null> => {
      if (!text.trim()) return null;
      if (!activeSessionId) {
        showAppModal({ title: "No Active Campaign", message: "Please select a campaign session first.", type: "warning" });
        return null;
      }
      setIsUploadingJd(true);
      setUploadError(null);
      try {
        const cacheDir = FileSystem.cacheDirectory || "";
        const tmpUri = `${cacheDir}jd_paste_${Date.now()}.txt`;
        await FileSystem.writeAsStringAsync(tmpUri, text.trim(), { encoding: FileSystem.EncodingType.UTF8 });

        const parsedJd = await uploadFileWithAuth<JobDescription>("/api/ingest/upload-jd", tmpUri, {
          fieldName: "file",
          fileName: "job_description.txt",
          mimeType: "text/plain",
          extraFields: activeSessionId ? { session_id: activeSessionId } : {},
        });

        // Cleanup temp file (best-effort)
        FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {});

        setJd(parsedJd);
        await refreshActiveSession();
        successHaptic();
        showAppModal({
          title: "Job Description Ingested",
          message: `Parsed role "${parsedJd.role || "Role"}" and ${parsedJd.required_skills?.length || 0} required skills.`,
          type: "success",
        });
        return parsedJd;
      } catch (err: any) {
        console.error("[useFileIngestion] Error ingesting JD text:", err);
        const message = err.message || "Failed to parse job description text.";
        setUploadError(message);
        showAppModal({ title: "JD Parse Failed", message, type: "error" });
        return null;
      } finally {
        setIsUploadingJd(false);
      }
    },
    [activeSessionId, refreshActiveSession, setJd]
  );

  return {
    isUploadingResumes,
    isUploadingJd,
    uploadError,
    ingestionReports,
    isReportModalVisible,
    closeReportModal,
    ingestResumes,
    ingestJobDescription,
    ingestJobDescriptionFromText,
  };
}

export default useFileIngestion;
