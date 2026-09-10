import { useState, useMemo } from "react";
import type { Candidate, CandidateStatus } from "@/types/schema";
import type { FilterType } from "@/components/candidates/StatusFilter";

export function useCandidateTriage(
  candidates: Candidate[],
  candidateStatuses: Record<string, CandidateStatus>
) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [sortBy, setSortBy] = useState<"match" | "name">("match");

  const counts = useMemo(() => {
    let shortlisted = 0;
    let offered = 0;
    let rejected = 0;

    candidates.forEach((c) => {
      const status = candidateStatuses[c.candidate_id];
      if (status === "shortlisted") shortlisted++;
      else if (status === "offered") offered++;
      else if (status === "rejected") rejected++;
    });

    return {
      all: candidates.length,
      shortlisted,
      offered,
      rejected,
    };
  }, [candidates, candidateStatuses]);

  const filteredCandidates = useMemo(() => {
    let result = candidates.filter((c) => {
      // Status filter
      if (filter !== "all") {
        if (candidateStatuses[c.candidate_id] !== filter) return false;
      }

      // Search filter
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesName = c.name?.toLowerCase().includes(query);
        const matchesHeadline = c.headline?.toLowerCase().includes(query);
        const matchesSkills = c.skills?.some((s) =>
          s.toLowerCase().includes(query)
        );
        const matchesMatchedSkills = c.matched_skills?.some((s) =>
          s.toLowerCase().includes(query)
        );
        const matchesEmail = c.email?.toLowerCase().includes(query);

        if (
          !matchesName &&
          !matchesHeadline &&
          !matchesSkills &&
          !matchesMatchedSkills &&
          !matchesEmail
        ) {
          return false;
        }
      }

      return true;
    });

    // Sorting
    return result.sort((a, b) => {
      if (sortBy === "match") {
        const scoreA = a.match_score ?? -1;
        const scoreB = b.match_score ?? -1;
        if (scoreB !== scoreA) return scoreB - scoreA;
      }
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [candidates, candidateStatuses, filter, search, sortBy]);

  return {
    search,
    setSearch,
    filter,
    setFilter,
    sortBy,
    setSortBy,
    counts,
    filteredCandidates,
  };
}

export default useCandidateTriage;
