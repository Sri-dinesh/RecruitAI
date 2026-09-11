import { convertAtsToCsv, type ATSExportData } from "../src/lib/fileExport";

describe("ATS Export & CSV Serialization", () => {
  const mockAtsData: ATSExportData = {
    format: "csv",
    evaluations_count: 2,
    export_timestamp: "2026-09-10T12:00:00Z",
    evaluations: {
      "cand-1": {
        candidate_id: "cand-1",
        candidate_name: "Elena Rostova",
        candidate_email: "elena@example.com",
        tech_score: 5,
        comm_score: 4,
        notes: "Strong system design capabilities",
        status: "shortlisted",
        match_score: 95,
      },
      "cand-2": {
        candidate_id: "cand-2",
        candidate_name: "Marcus Vance",
        candidate_email: "marcus@example.com",
        tech_score: 4,
        comm_score: 5,
        notes: "Excellent communicator with leadership skills",
        status: "offered",
        match_score: 88,
      },
    },
  };

  test("generates RFC 4180 compliant CSV header and data rows", () => {
    const csv = convertAtsToCsv(mockAtsData);
    const lines = csv.split("\n");

    // Check Header Row
    expect(lines[0]).toBe(
      '"Candidate ID","Candidate Name","Candidate Email","Status","Match Score (%)","Technical Score (1-5)","Communication Score (1-5)","Recruiter Notes"'
    );

    // Check 2 data rows
    expect(lines.length).toBe(3);
    expect(lines[1]).toContain('"cand-1"');
    expect(lines[1]).toContain('"Elena Rostova"');
    expect(lines[1]).toContain('"95"');
    expect(lines[2]).toContain('"cand-2"');
    expect(lines[2]).toContain('"Marcus Vance"');
    expect(lines[2]).toContain('"offered"');
  });

  test("escapes double quotes within notes field properly", () => {
    const dataWithQuotes: ATSExportData = {
      format: "csv",
      evaluations_count: 1,
      export_timestamp: "2026-09-10T12:00:00Z",
      evaluations: {
        "cand-q": {
          candidate_id: "cand-q",
          candidate_name: 'John "Jack" Doe',
          candidate_email: "john@example.com",
          tech_score: 3,
          comm_score: 4,
          notes: 'He said "Ready to start immediately"',
          status: "new",
          match_score: 72,
        },
      },
    };

    const csv = convertAtsToCsv(dataWithQuotes);
    expect(csv).toContain('"John ""Jack"" Doe"');
    expect(csv).toContain('"He said ""Ready to start immediately"""');
  });
});
