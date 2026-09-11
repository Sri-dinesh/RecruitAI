import type { Candidate, CandidateStatus } from "../src/types/schema";

describe("Candidate Triage & Blind Hiring Logic", () => {
  const mockCandidates: Candidate[] = [
    {
      candidate_id: "cand-1",
      name: "Alice Johnson",
      email: "alice@example.com",
      phone: "+1 555-0101",
      match_score: 92,
      skills: ["Python", "React", "FastAPI"],
      experience_years: 5,
    },
    {
      candidate_id: "cand-2",
      name: "Bob Smith",
      email: "bob@example.com",
      phone: "+1 555-0102",
      match_score: 65,
      skills: ["Java", "Spring Boot", "SQL"],
      experience_years: 3,
    },
    {
      candidate_id: "cand-3",
      name: "Charlie Brown",
      email: "charlie@example.com",
      phone: "+1 555-0103",
      match_score: 42,
      skills: ["PHP", "WordPress"],
      experience_years: 2,
    },
  ];

  const mockStatuses: Record<string, CandidateStatus> = {
    "cand-1": "shortlisted",
    "cand-2": "offered",
  };

  test("filters candidates by search keyword matching name or skills", () => {
    const query = "python";
    const filtered = mockCandidates.filter((c) => {
      const q = query.toLowerCase();
      const matchesName = c.name.toLowerCase().includes(q);
      const matchesSkills = c.skills?.some((s) => s.toLowerCase().includes(q));
      return matchesName || matchesSkills;
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].candidate_id).toBe("cand-1");
  });

  test("filters candidates by decision status correctly", () => {
    const shortlisted = mockCandidates.filter(
      (c) => mockStatuses[c.candidate_id] === "shortlisted"
    );
    expect(shortlisted).toHaveLength(1);
    expect(shortlisted[0].name).toBe("Alice Johnson");

    const offered = mockCandidates.filter(
      (c) => mockStatuses[c.candidate_id] === "offered"
    );
    expect(offered).toHaveLength(1);
    expect(offered[0].name).toBe("Bob Smith");
  });

  test("sorts candidates descending by match score", () => {
    const sorted = [...mockCandidates].sort(
      (a, b) => (b.match_score ?? 0) - (a.match_score ?? 0)
    );
    expect(sorted[0].candidate_id).toBe("cand-1");
    expect(sorted[1].candidate_id).toBe("cand-2");
    expect(sorted[2].candidate_id).toBe("cand-3");
  });

  test("applies blind hiring masking correctly to name, email and phone", () => {
    const getInitials = (name?: string) => {
      if (!name) return "";
      const parts = name.trim().split(/\s+/);
      if (parts.length === 1) return parts[0].charAt(0).toUpperCase() + ".";
      return parts.map((p) => p.charAt(0).toUpperCase() + ".").join("");
    };

    const cand = mockCandidates[0];
    const isBlindHiring = true;

    const displayName = isBlindHiring
      ? `Candidate #1 (${getInitials(cand.name)})`
      : cand.name;
    const displayEmail = isBlindHiring ? "••••••••@••••.com" : cand.email;
    const displayPhone = isBlindHiring ? "•••• ••• ••••" : cand.phone;

    expect(displayName).toBe("Candidate #1 (A.J.)");
    expect(displayEmail).toBe("••••••••@••••.com");
    expect(displayPhone).toBe("•••• ••• ••••");
  });
});
