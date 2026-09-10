import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import {
  Users,
  Check,
  Star,
  X,
  AlertTriangle,
  Award,
  Clock,
  Sparkles,
  EyeOff,
  CheckCircle2,
} from "lucide-react-native";
import { useRecruit } from "@/context/RecruitContext";
import { COLORS } from "@/constants/theme";
import { selectionHaptic, impactHaptic } from "@/lib/haptics";
import type { Candidate, CandidateStatus } from "@/types/schema";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = Math.min(SCREEN_WIDTH * 0.82, 320);

export const CompareMatrix: React.FC = () => {
  const {
    candidates,
    candidateStatuses,
    toggleCandidateStatus,
    isBlindHiring,
    statusSaving,
  } = useRecruit();

  // Selected candidate IDs for comparison (defaults to top 3 by match score)
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    return candidates
      .slice()
      .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0))
      .slice(0, 3)
      .map((c) => c.candidate_id);
  });

  const getInitials = (name?: string) => {
    if (!name) return "";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase() + ".";
    return parts.map((p) => p.charAt(0).toUpperCase() + ".").join("");
  };

  const toggleSelectCandidate = (id: string) => {
    selectionHaptic();
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        // Keep at least 1 candidate selected if available
        if (prev.length <= 1) return prev;
        return prev.filter((i) => i !== id);
      } else {
        if (prev.length >= 4) {
          // Limit to max 4 for mobile readability
          return [...prev.slice(1), id];
        }
        return [...prev, id];
      }
    });
  };

  const selectTopThree = () => {
    selectionHaptic();
    const top = candidates
      .slice()
      .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0))
      .slice(0, 3)
      .map((c) => c.candidate_id);
    setSelectedIds(top);
  };

  const comparedCandidates = useMemo(() => {
    return candidates.filter((c) => selectedIds.includes(c.candidate_id));
  }, [candidates, selectedIds]);

  if (candidates.length === 0) {
    return (
      <View className="bg-white border border-border rounded-[6px] p-8 items-center justify-center my-4 mx-4">
        <Users size={36} color={COLORS.muted} />
        <Text className="font-serif-bold text-base text-foreground mt-3 text-center">
          No Candidates Available
        </Text>
        <Text className="font-sans text-xs text-muted text-center mt-1 px-4 leading-relaxed">
          Upload resumes or ask the Co-Pilot to screen applicants to compare candidates side-by-side.
        </Text>
      </View>
    );
  }

  return (
    <View className="py-2">
      {/* Candidate Selection Header */}
      <View className="px-4 mb-3">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="font-sans-bold text-xs text-foreground uppercase tracking-wider">
            Select Candidates ({comparedCandidates.length}/4)
          </Text>
          {candidates.length > 3 && (
            <TouchableOpacity onPress={selectTopThree} activeOpacity={0.7}>
              <Text className="font-sans-bold text-[11px] text-accent">
                Select Top 3
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Horizontal Candidate Selection Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
        >
          {candidates.map((cand, idx) => {
            const isSelected = selectedIds.includes(cand.candidate_id);
            const name = isBlindHiring
              ? `Cand #${idx + 1}`
              : cand.name.split(" ")[0];

            return (
              <TouchableOpacity
                key={cand.candidate_id || idx}
                onPress={() => toggleSelectCandidate(cand.candidate_id)}
                activeOpacity={0.7}
                className={`flex-row items-center px-3 py-1.5 rounded-[6px] border ${
                  isSelected
                    ? "bg-accent border-accent"
                    : "bg-white border-border"
                }`}
              >
                <View
                  className={`w-3.5 h-3.5 rounded-[3px] border items-center justify-center mr-1.5 ${
                    isSelected
                      ? "bg-white border-white"
                      : "bg-transparent border-slate-300"
                  }`}
                >
                  {isSelected && <Check size={10} color={COLORS.accent} />}
                </View>
                <Text
                  className={`font-sans-bold text-xs ${
                    isSelected ? "text-white" : "text-foreground"
                  }`}
                >
                  {name}
                </Text>
                {cand.match_score !== null && cand.match_score !== undefined && (
                  <Text
                    className={`font-sans text-[10px] ml-1.5 ${
                      isSelected ? "text-slate-200" : "text-muted"
                    }`}
                  >
                    {cand.match_score}%
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Horizontally Paging Comparison Cards Deck */}
      <ScrollView
        horizontal
        pagingEnabled={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          gap: 12,
          paddingBottom: 8,
        }}
      >
        {comparedCandidates.map((c, idx) => {
          const status = candidateStatuses[c.candidate_id];
          const isSaving = statusSaving === c.candidate_id;
          const displayName = isBlindHiring
            ? `Candidate #${idx + 1} (${getInitials(c.name)})`
            : c.name;

          const score = c.match_score ?? 0;
          const scoreColor =
            score >= 80
              ? "text-emerald-700 bg-emerald-50 border-emerald-200"
              : score >= 50
              ? "text-amber-700 bg-amber-50 border-amber-200"
              : "text-rose-700 bg-rose-50 border-rose-200";

          return (
            <View
              key={c.candidate_id || idx}
              style={{ width: CARD_WIDTH }}
              className="bg-white border border-border rounded-[6px] p-4 shadow-sm"
            >
              {/* Card Header */}
              <View className="flex-row items-start justify-between mb-3 pb-3 border-b border-slate-100">
                <View className="flex-1 mr-2">
                  <View className="flex-row items-center flex-wrap gap-1">
                    <Text
                      className="font-serif-bold text-sm text-foreground"
                      numberOfLines={1}
                    >
                      {displayName}
                    </Text>
                    {isBlindHiring && (
                      <View className="flex-row items-center bg-amber-50 border border-amber-200 px-1 py-0.5 rounded">
                        <EyeOff size={8} color={COLORS.statusOffer} />
                      </View>
                    )}
                  </View>
                  <Text
                    className="font-sans text-[11px] text-muted mt-0.5"
                    numberOfLines={1}
                  >
                    {c.headline || `${c.experience_years ?? 0} yrs experience`}
                  </Text>
                </View>

                {/* Match Score Badge */}
                <View className={`border px-2 py-0.5 rounded-full ${scoreColor}`}>
                  <Text className="font-sans-bold text-xs">{score}% Match</Text>
                </View>
              </View>

              {/* Key Metrics Row */}
              <View className="flex-row items-center justify-between bg-[#F8F6F2] p-2 rounded-[4px] mb-3">
                <View className="items-center flex-1 border-r border-slate-200">
                  <Text className="font-sans text-[10px] text-muted">Experience</Text>
                  <Text className="font-sans-bold text-xs text-foreground mt-0.5">
                    {c.experience_years ?? 0} Yrs
                  </Text>
                </View>
                <View className="items-center flex-1">
                  <Text className="font-sans text-[10px] text-muted">Status</Text>
                  <Text className="font-sans-bold text-xs text-foreground uppercase mt-0.5">
                    {status || "New"}
                  </Text>
                </View>
              </View>

              {/* Matched Competencies */}
              <View className="mb-3">
                <Text className="font-sans-bold text-[11px] text-emerald-800 mb-1.5">
                  Matched Skills ({c.matched_skills?.length || c.skills?.length || 0})
                </Text>
                <View className="flex-row flex-wrap gap-1">
                  {(c.matched_skills && c.matched_skills.length > 0
                    ? c.matched_skills
                    : c.skills?.slice(0, 4) || []
                  ).map((s, si) => (
                    <View
                      key={si}
                      className="bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-[4px]"
                    >
                      <Text className="font-sans text-[10px] text-emerald-800">
                        ✓ {s}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Skill Gaps */}
              {c.gaps && c.gaps.length > 0 && (
                <View className="mb-3">
                  <Text className="font-sans-bold text-[11px] text-rose-700 mb-1.5">
                    Missing Gaps ({c.gaps.length})
                  </Text>
                  <View className="flex-row flex-wrap gap-1">
                    {c.gaps.map((g, gi) => (
                      <View
                        key={gi}
                        className="bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-[4px]"
                      >
                        <Text className="font-sans text-[10px] text-rose-700">
                          ✕ {g}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Red Flags Alert */}
              {c.red_flags && c.red_flags.length > 0 && (
                <View className="mb-3 bg-rose-50 border border-rose-200 p-2 rounded-[4px]">
                  <View className="flex-row items-center mb-0.5">
                    <AlertTriangle size={11} color={COLORS.statusReject} />
                    <Text className="font-sans-bold text-[10px] text-rose-800 ml-1">
                      Flag:
                    </Text>
                  </View>
                  <Text className="font-sans text-[10px] text-rose-700 leading-3">
                    {c.red_flags[0]}
                  </Text>
                </View>
              )}

              {/* Decision Action Buttons */}
              <View className="flex-row items-center gap-1.5 mt-auto pt-2 border-t border-slate-100">
                <TouchableOpacity
                  onPress={() => {
                    impactHaptic();
                    toggleCandidateStatus(
                      c.candidate_id,
                      c.name,
                      "shortlisted"
                    );
                  }}
                  disabled={isSaving}
                  className={`flex-1 flex-row items-center justify-center py-1.5 rounded-[4px] border ${
                    status === "shortlisted"
                      ? "bg-emerald-600 border-emerald-600"
                      : "bg-white border-border"
                  }`}
                >
                  <Check
                    size={11}
                    color={status === "shortlisted" ? "#FFFFFF" : COLORS.statusShortlist}
                  />
                  <Text
                    className={`font-sans-bold text-[10px] ml-1 ${
                      status === "shortlisted" ? "text-white" : "text-emerald-800"
                    }`}
                  >
                    Shortlist
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    impactHaptic();
                    toggleCandidateStatus(c.candidate_id, c.name, "offered");
                  }}
                  disabled={isSaving}
                  className={`flex-1 flex-row items-center justify-center py-1.5 rounded-[4px] border ${
                    status === "offered"
                      ? "bg-amber-600 border-amber-600"
                      : "bg-white border-border"
                  }`}
                >
                  <Star
                    size={11}
                    color={status === "offered" ? "#FFFFFF" : COLORS.statusOffer}
                  />
                  <Text
                    className={`font-sans-bold text-[10px] ml-1 ${
                      status === "offered" ? "text-white" : "text-amber-800"
                    }`}
                  >
                    Offer
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    impactHaptic();
                    toggleCandidateStatus(c.candidate_id, c.name, "rejected");
                  }}
                  disabled={isSaving}
                  className={`flex-1 flex-row items-center justify-center py-1.5 rounded-[4px] border ${
                    status === "rejected"
                      ? "bg-rose-600 border-rose-600"
                      : "bg-white border-border"
                  }`}
                >
                  <X
                    size={11}
                    color={status === "rejected" ? "#FFFFFF" : COLORS.statusReject}
                  />
                  <Text
                    className={`font-sans-bold text-[10px] ml-1 ${
                      status === "rejected" ? "text-white" : "text-rose-800"
                    }`}
                  >
                    Reject
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

export default CompareMatrix;
