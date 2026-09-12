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

      const uploadPromises = result.assets.map((asset) =>
        uploadFileWithAuth<Candidate[]>("/api/ingest/upload", asset.uri, {
          fieldName: "files",
          fileName: asset.name,
          mimeType: asset.mimeType || "application/pdf",
        })
      );

      const candidateArrays = await Promise.all(uploadPromises);
      const newCandidates = candidateArrays.flat();

      // Merge newly ingested candidates avoiding duplicate IDs
      setCandidates((prev) => {
        const existingIds = new Set(prev.map((c) => c.candidate_id));
        const added = newCandidates.filter((c) => !existingIds.has(c.candidate_id));
        return [...prev, ...added];
      });

      showAppModal({
        title: "Upload Complete",
        message: `Successfully parsed and ingested ${newCandidates.length} candidate resume${
          newCandidates.length === 1 ? "" : "s"
        }.`,
        type: "success",
      });

      return newCandidates;
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
