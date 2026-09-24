// ATS export helpers — parity with mobile/src/lib/fileExport.ts
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
    if (val === null || val === undefined) return `""`;
    const str = String(val).replace(/"/g, `""`);
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

export function downloadAtsFile(data: ATSExportData, format: "json" | "csv") {
  const content = format === "json" ? JSON.stringify(data, null, 2) : convertAtsToCsv(data);
  const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ats_export_${new Date().toISOString().slice(0, 10)}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
