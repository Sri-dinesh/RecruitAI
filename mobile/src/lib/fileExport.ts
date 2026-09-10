import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { BACKEND_URL } from "./apiClient";
import { supabase } from "./supabase";

export interface ATSExportData {
  format: string;
  evaluations_count: number;
  export_timestamp: string;
  evaluations: Record<
    string,
    {
      candidate_id: string;
      candidate_name?: string;
      candidate_email?: string;
      tech_score?: number;
      comm_score?: number;
      notes?: string;
      status?: string;
      match_score?: number;
    }
  >;
}

/**
 * Converts ATS evaluations map into standard CSV string
 */
export function convertAtsToCsv(data: ATSExportData): string {
  const headers = [
    "Candidate ID",
    "Candidate Name",
    "Candidate Email",
    "Status",
    "Match Score (%)",
    "Technical Score (1-5)",
    "Communication Score (1-5)",
    "Recruiter Notes",
  ];

  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return "\"\"";
    const str = String(val).replace(/"/g, "\"\"");
    return `"${str}"`;
  };

  const rows: string[] = [headers.map(escapeCsv).join(",")];

  const evaluations = data.evaluations || {};
  Object.values(evaluations).forEach((ev) => {
    const row = [
      escapeCsv(ev.candidate_id),
      escapeCsv(ev.candidate_name || "Candidate"),
      escapeCsv(ev.candidate_email || ""),
      escapeCsv(ev.status || "new"),
      escapeCsv(ev.match_score ?? 0),
      escapeCsv(ev.tech_score ?? 0),
      escapeCsv(ev.comm_score ?? 0),
      escapeCsv(ev.notes || ""),
    ];
    rows.push(row.join(","));
  });

  return rows.join("\n");
}

/**
 * Saves ATS data to local device cache and triggers native sharing sheet
 */
export async function shareAtsExport(
  data: ATSExportData,
  format: "json" | "csv"
): Promise<string> {
  const isSharingAvailable = await Sharing.isAvailableAsync();
  if (!isSharingAvailable) {
    throw new Error("Native file sharing is not supported on this platform.");
  }

  const baseDir = FileSystem.cacheDirectory || "";
  const timestamp = Date.now();
  const filename = `ats_export_${timestamp}.${format}`;
  const fileUri = `${baseDir}${filename}`;

  let content = "";
  if (format === "json") {
    content = JSON.stringify(data, null, 2);
  } else {
    content = convertAtsToCsv(data);
  }

  await FileSystem.writeAsStringAsync(fileUri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  await Sharing.shareAsync(fileUri, {
    mimeType: format === "json" ? "application/json" : "text/csv",
    dialogTitle: `Share ATS Export (${format.toUpperCase()})`,
    UTI: format === "json" ? "public.json" : "public.comma-separated-values-text",
  });

  return fileUri;
}

/**
 * Downloads session PDF report from backend and opens native sharing sheet
 */
export async function downloadAndSharePdfReport(
  sessionId: string
): Promise<string> {
  const isSharingAvailable = await Sharing.isAvailableAsync();
  if (!isSharingAvailable) {
    throw new Error("Native file sharing is not supported on this platform.");
  }

  if (!sessionId) {
    throw new Error("Session ID is required to generate the recruitment report.");
  }

  // Get Supabase auth token
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const baseDir = FileSystem.cacheDirectory || "";
  const filename = `recruitment_report_${sessionId.slice(0, 8)}_${Date.now()}.pdf`;
  const targetUri = `${baseDir}${filename}`;

  const downloadUrl = `${BACKEND_URL}/api/reports/session/${sessionId}`;

  const downloadResult = await FileSystem.downloadAsync(downloadUrl, targetUri, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (downloadResult.status !== 200) {
    throw new Error(
      `Failed to download PDF report from server (HTTP ${downloadResult.status}).`
    );
  }

  await Sharing.shareAsync(downloadResult.uri, {
    mimeType: "application/pdf",
    dialogTitle: "RecruitAI Executive Recruitment Dossier",
    UTI: "com.adobe.pdf",
  });

  return downloadResult.uri;
}
