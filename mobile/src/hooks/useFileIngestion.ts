import { useState, useCallback } from "react";
import { Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { fetchWithAuth } from "@/lib/apiClient";
import { useRecruit } from "@/context/RecruitContext";
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

      const formData = new FormData();
      result.assets.forEach((asset) => {
        formData.append("files", {
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || "application/pdf",
        } as any);
      });

      const res = await fetchWithAuth("/api/ingest/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const msg = errorData.detail || "Failed to parse and upload resumes.";
        throw new Error(msg);
      }

      const newCandidates: Candidate[] = await res.json();

      // Merge newly ingested candidates avoiding duplicate IDs
      setCandidates((prev) => {
        const existingIds = new Set(prev.map((c) => c.candidate_id));
        const added = newCandidates.filter((c) => !existingIds.has(c.candidate_id));
        return [...prev, ...added];
      });

      successHaptic();
      Alert.alert(
        "Upload Complete",
        `Successfully parsed and ingested ${newCandidates.length} candidate resume${
          newCandidates.length === 1 ? "" : "s"
        }.`
      );

      return newCandidates;
    } catch (err: any) {
      console.error("[useFileIngestion] Error uploading resumes:", err);
      const message = err.message || "An unexpected error occurred during upload.";
      setUploadError(message);
      warningHaptic();
      Alert.alert("Upload Failed", message);
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

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const msg = errorData.detail || "Failed to parse and upload Job Description.";
        throw new Error(msg);
      }

      const parsedJd: JobDescription = await res.json();
      setJd(parsedJd);
      successHaptic();
      Alert.alert("JD Loaded", `Loaded Job Description for "${parsedJd.role || "Role"}".`);

      return parsedJd;
    } catch (err: any) {
      console.error("[useFileIngestion] Error uploading JD:", err);
      const message = err.message || "An unexpected error occurred during JD upload.";
      setUploadError(message);
      warningHaptic();
      Alert.alert("JD Upload Failed", message);
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
