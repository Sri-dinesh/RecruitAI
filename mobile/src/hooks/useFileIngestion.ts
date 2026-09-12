import { useState, useCallback } from "react";
import * as DocumentPicker from "expo-document-picker";
import { fetchWithAuth, uploadFileWithAuth } from "@/lib/apiClient";
import { useRecruit } from "@/context/RecruitContext";
import { showAppModal } from "@/context/ModalContext";
import { successHaptic, warningHaptic } from "@/lib/haptics";
import type { Candidate, JobDescription } from "@/types/schema";

export function useFileIngestion() {
  const { setCandidates, setJd } = useRecruit();
  const [isUploadingResumes, setIsUploadingResumes] = useState(false);
  const [isUploadingJd, setIsUploadingJd] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
          console.error("[useFileIngestion] Single file upload error:", asset.name, err);
          failedNames.push(asset.name || "Resume");
        }
      }

      if (uploaded.length > 0) {
        // Merge newly ingested candidates avoiding duplicate IDs
        setCandidates((prev) => {
          const existingIds = new Set(prev.map((c) => c.candidate_id));
          const added = uploaded.filter((c) => !existingIds.has(c.candidate_id));
          return [...prev, ...added];
        });

        if (failedNames.length === 0) {
          showAppModal({
            title: "Upload Complete",
            message: `Successfully parsed and ingested ${uploaded.length} candidate resume${
              uploaded.length === 1 ? "" : "s"
            }.`,
            type: "success",
          });
        } else {
          showAppModal({
            title: "Partial Ingestion",
            message: `Ingested ${uploaded.length} candidate(s), but ${failedNames.length} file(s) (${failedNames.join(", ")}) failed to parse.`,
            type: "warning",
          });
        }
        return uploaded;
      } else {
        const errorMsg = "Unable to parse the selected resumes. Please verify they are valid PDF or Word documents.";
        setUploadError(errorMsg);
        showAppModal({
          title: "Upload Failed",
          message: errorMsg,
          type: "error",
        });
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
  }, [setCandidates]);

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
        }
      );

      setJd(parsedJd);
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
  }, [setJd]);

  return {
    isUploadingResumes,
    isUploadingJd,
    uploadError,
    ingestResumes,
    ingestJobDescription,
  };
}

export default useFileIngestion;
