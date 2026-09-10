import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import {
  Users,
  Search,
  Check,
  Star,
  X,
  Briefcase,
  Sparkles,
  EyeOff,
  SlidersHorizontal,
} from "lucide-react-native";
import { useRecruit } from "@/context/RecruitContext";
import { COLORS } from "@/constants/theme";
import { selectionHaptic } from "@/lib/haptics";
import type { Candidate, CandidateStatus } from "@/types/schema";

export default function CandidatesTab() {
  const {
    candidates,
    candidateStatuses,
    toggleCandidateStatus,
    isBlindHiring,
    loadingSession,
    statusSaving,
  } = useRecruit();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CandidateStatus | "all">("all");

  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      // Status filter
      if (filter !== "all") {
        if (candidateStatuses[c.candidate_id] !== filter) return false;
      }
      // Search filter
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesName = c.name?.toLowerCase().includes(query);
        const matchesSkills = c.skills?.some((s) =>
          s.toLowerCase().includes(query)
        );
        const matchesHeadline = c.headline?.toLowerCase().includes(query);
        if (!matchesName && !matchesSkills && !matchesHeadline) return false;
      }
      return true;
    });
  }, [candidates, candidateStatuses, filter, search]);

  const shortlistedCount = useMemo(
    () =>
      candidates.filter((c) => candidateStatuses[c.candidate_id] === "shortlisted")
        .length,
    [candidates, candidateStatuses]
  );
  const offeredCount = useMemo(
    () =>
      candidates.filter((c) => candidateStatuses[c.candidate_id] === "offered")
        .length,
    [candidates, candidateStatuses]
  );
  const rejectedCount = useMemo(
    () =>
      candidates.filter((c) => candidateStatuses[c.candidate_id] === "rejected")
        .length,
    [candidates, candidateStatuses]
  );

  return (
    <View className="flex-1 bg-background">
      {/* Search & Filter Header */}
      <View className="bg-white border-b border-border px-4 pt-3 pb-2.5">
        <View className="flex-row items-center bg-[#F8F6F2] border border-border rounded-[6px] px-3 py-1.5">
          <Search size={15} color={COLORS.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name, skill, or title..."
            placeholderTextColor="#94A3B8"
            className="flex-1 font-sans text-xs text-foreground ml-2 py-0.5"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <X size={14} color={COLORS.muted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingTop: 10 }}
        >
          <TouchableOpacity
            onPress={() => {
              selectionHaptic();
              setFilter("all");
            }}
            className={`px-3 py-1 rounded-[6px] border ${
              filter === "all"
                ? "bg-accent border-accent"
                : "bg-white border-border"
            }`}
          >
            <Text
              className={`font-sans-bold text-[11px] ${
                filter === "all" ? "text-white" : "text-foreground"
              }`}
            >
              All ({candidates.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              selectionHaptic();
              setFilter("shortlisted");
            }}
            className={`px-3 py-1 rounded-[6px] border ${
              filter === "shortlisted"
                ? "bg-emerald-700 border-emerald-700"
                : "bg-white border-border"
            }`}
          >
            <Text
              className={`font-sans-bold text-[11px] ${
                filter === "shortlisted" ? "text-white" : "text-emerald-800"
              }`}
            >
              Shortlisted ({shortlistedCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              selectionHaptic();
              setFilter("offered");
            }}
            className={`px-3 py-1 rounded-[6px] border ${
              filter === "offered"
                ? "bg-amber-600 border-amber-600"
                : "bg-white border-border"
            }`}
          >
            <Text
              className={`font-sans-bold text-[11px] ${
                filter === "offered" ? "text-white" : "text-amber-800"
              }`}
            >
              Offered ({offeredCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              selectionHaptic();
              setFilter("rejected");
            }}
            className={`px-3 py-1 rounded-[6px] border ${
              filter === "rejected"
                ? "bg-rose-700 border-rose-700"
                : "bg-white border-border"
            }`}
          >
            <Text
              className={`font-sans-bold text-[11px] ${
                filter === "rejected" ? "text-white" : "text-rose-800"
              }`}
            >
              Rejected ({rejectedCount})
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Candidates List */}
      {loadingSession ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.brandPrimary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {filteredCandidates.length === 0 ? (
            <View className="py-16 items-center justify-center">
              <Users size={36} color={COLORS.muted} />
              <Text className="font-serif text-base text-foreground mt-3">
                No candidates found
              </Text>
              <Text className="font-sans text-xs text-muted text-center mt-1 px-8">
                {candidates.length === 0
                  ? "Upload candidate resumes or ask the Co-Pilot to screen candidates for this campaign."
                  : "No candidates match the selected filters."}
              </Text>
            </View>
          ) : (
            filteredCandidates.map((c, idx) => {
              const currentStatus = candidateStatuses[c.candidate_id];
              const isSaving = statusSaving === c.candidate_id;
              const displayName = isBlindHiring
                ? `Candidate #${idx + 1}`
                : c.name || `Candidate #${idx + 1}`;

              return (
                <View
                  key={c.candidate_id || idx}
                  className="bg-white border border-border rounded-[6px] p-4 mb-3 shadow-xs"
                >
                  {/* Card Header */}
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 mr-2">
                      <View className="flex-row items-center">
                        <Text
                          className="font-serif-bold text-sm text-foreground"
                          numberOfLines={1}
                        >
                          {displayName}
                        </Text>
                        {isBlindHiring && (
                          <View className="ml-2 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            <Text className="font-sans-bold text-[9px] text-amber-800">
                              Blind Mode
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        className="font-sans text-xs text-muted mt-0.5"
                        numberOfLines={1}
                      >
                        {c.headline ||
                          (c.experience_years
                            ? `${c.experience_years} Years Experience`
                            : "Candidate Profile")}
                      </Text>
                    </View>

                    {/* Match Score Badge */}
                    {c.match_score !== undefined && c.match_score !== null && (
                      <View className="bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                        <Text className="font-sans-bold text-xs text-emerald-800">
                          {c.match_score}% Match
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Skills Pills */}
                  {c.skills && c.skills.length > 0 && (
                    <View className="flex-row flex-wrap gap-1.5 mt-3">
                      {c.skills.slice(0, 5).map((skill, si) => (
                        <View
                          key={si}
                          className="bg-[#F8F6F2] border border-border px-2 py-0.5 rounded-[4px]"
                        >
                          <Text className="font-sans text-[11px] text-foreground">
                            {skill}
                          </Text>
                        </View>
                      ))}
                      {c.skills.length > 5 && (
                        <View className="bg-slate-100 px-1.5 py-0.5 rounded-[4px]">
                          <Text className="font-sans text-[10px] text-muted">
                            +{c.skills.length - 5}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Decision Action Buttons */}
                  <View className="flex-row items-center justify-between border-t border-slate-100 mt-3 pt-3">
                    <Text className="font-sans text-[11px] text-muted">
                      {isSaving ? "Saving status..." : "Decision:"}
                    </Text>

                    <View className="flex-row items-center gap-1.5">
                      {/* Shortlist Button */}
                      <TouchableOpacity
                        onPress={() =>
                          toggleCandidateStatus(
                            c.candidate_id,
                            c.name,
                            "shortlisted"
                          )
                        }
                        activeOpacity={0.7}
                        className={`flex-row items-center px-2.5 py-1 rounded-[6px] border ${
                          currentStatus === "shortlisted"
                            ? "bg-emerald-600 border-emerald-600"
                            : "bg-white border-border"
                        }`}
                      >
                        <Check
                          size={12}
                          color={
                            currentStatus === "shortlisted"
                              ? "#FFFFFF"
                              : COLORS.statusShortlist
                          }
                        />
                        <Text
                          className={`font-sans-bold text-[11px] ml-1 ${
                            currentStatus === "shortlisted"
                              ? "text-white"
                              : "text-emerald-800"
                          }`}
                        >
                          Shortlist
                        </Text>
                      </TouchableOpacity>

                      {/* Offer Button */}
                      <TouchableOpacity
                        onPress={() =>
                          toggleCandidateStatus(c.candidate_id, c.name, "offered")
                        }
                        activeOpacity={0.7}
                        className={`flex-row items-center px-2.5 py-1 rounded-[6px] border ${
                          currentStatus === "offered"
                            ? "bg-amber-600 border-amber-600"
                            : "bg-white border-border"
                        }`}
                      >
                        <Star
                          size={12}
                          color={
                            currentStatus === "offered"
                              ? "#FFFFFF"
                              : COLORS.statusOffer
                          }
                        />
                        <Text
                          className={`font-sans-bold text-[11px] ml-1 ${
                            currentStatus === "offered"
                              ? "text-white"
                              : "text-amber-800"
                          }`}
                        >
                          Offer
                        </Text>
                      </TouchableOpacity>

                      {/* Reject Button */}
                      <TouchableOpacity
                        onPress={() =>
                          toggleCandidateStatus(c.candidate_id, c.name, "rejected")
                        }
                        activeOpacity={0.7}
                        className={`flex-row items-center px-2 py-1 rounded-[6px] border ${
                          currentStatus === "rejected"
                            ? "bg-rose-600 border-rose-600"
                            : "bg-white border-border"
                        }`}
                      >
                        <X
                          size={12}
                          color={
                            currentStatus === "rejected"
                              ? "#FFFFFF"
                              : COLORS.statusReject
                          }
                        />
                        <Text
                          className={`font-sans-bold text-[11px] ml-1 ${
                            currentStatus === "rejected"
                              ? "text-white"
                              : "text-rose-800"
                          }`}
                        >
                          Reject
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}
