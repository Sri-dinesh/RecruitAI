import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Search,
  X,
  Upload,
  Users,
  SlidersHorizontal,
  Sparkles,
  ArrowUpDown,
} from "lucide-react-native";
import { useRecruit } from "@/context/RecruitContext";
import { useFileIngestion } from "@/hooks/useFileIngestion";
import { useCandidateTriage } from "@/hooks/useCandidateTriage";
import { ActiveJdCard } from "@/components/candidates/ActiveJdCard";
import { CandidateCard } from "@/components/candidates/CandidateCard";
import { StatusFilter } from "@/components/candidates/StatusFilter";
import { IngestionProgressModal } from "@/components/modals/IngestionProgressModal";
import { useAppModal } from "@/context/ModalContext";
import { COLORS } from "@/constants/theme";
import { selectionHaptic, impactHaptic, warningHaptic } from "@/lib/haptics";
import type { Candidate, CandidateStatus } from "@/types/schema";

export default function CandidatesTab() {
  const router = useRouter();
  const {
    candidates,
    candidateStatuses,
    toggleCandidateStatus,
    isBlindHiring,
    jd,
    loadingSession,
    statusSaving,
    refreshActiveSession,
    activeSessionId,
  } = useRecruit();

  const {
    isUploadingResumes,
    isUploadingJd,
    ingestionReports,
    isReportModalVisible,
    closeReportModal,
    ingestResumes,
    ingestJobDescription,
  } = useFileIngestion();

  const { showModal } = useAppModal();

  const {
    search,
    setSearch,
    filter,
    setFilter,
    sortBy,
    setSortBy,
    minScore,
    setMinScore,
    counts,
    filteredCandidates,
  } = useCandidateTriage(candidates, candidateStatuses);

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshActiveSession();
    } finally {
      setRefreshing(false);
    }
  }, [refreshActiveSession]);

  const handleOpenInspector = useCallback(
    (candidate: Candidate) => {
      selectionHaptic();
      router.push({
        pathname: "/(app)/modals/candidate-inspector",
        params: { candidateId: candidate.candidate_id },
      });
    },
    [router]
  );

  const toggleSort = useCallback(() => {
    selectionHaptic();
    setSortBy(sortBy === "match" ? "name" : "match");
  }, [sortBy, setSortBy]);

  const renderCandidateItem = useCallback(
    ({ item, index }: { item: Candidate; index: number }) => {
      const status = candidateStatuses[item.candidate_id];
      const isSaving = statusSaving === item.candidate_id;

      return (
        <CandidateCard
          candidate={item}
          index={index}
          status={status}
          isBlindHiring={isBlindHiring}
          isSaving={isSaving}
          onPress={() => handleOpenInspector(item)}
          onShortlist={() =>
            toggleCandidateStatus(item.candidate_id, item.name, "shortlisted")
          }
          onOffer={() =>
            toggleCandidateStatus(item.candidate_id, item.name, "offered")
          }
          onReject={() => {
            impactHaptic();
            // GDPR Art. 22 human confirmation
            showModal({
              title: "Confirm Rejection (GDPR Art. 22)",
              message: `In compliance with hiring regulations and human-in-the-loop review, please confirm you wish to reject "${item.name}".`,
              type: "confirm",
              actions: [
                {
                  label: "Confirm Rejection",
                  variant: "destructive",
                  onPress: () =>
                    toggleCandidateStatus(item.candidate_id, item.name, "rejected"),
                },
                {
                  label: "Cancel",
                  variant: "cancel",
                },
              ],
            });
          }}
        />
      );
    },
    [
      candidateStatuses,
      statusSaving,
      isBlindHiring,
      handleOpenInspector,
      toggleCandidateStatus,
      showModal,
    ]
  );

  const renderHeader = useCallback(() => {
    return (
      <View>
        {/* Active JD Card */}
        <ActiveJdCard
          jd={jd}
          onUploadJd={ingestJobDescription}
          isUploading={isUploadingJd}
        />

        {/* Search Bar */}
        <View className="px-4 mt-3">
          <View className="flex-row items-center bg-white border border-border rounded-xl px-3 py-2 shadow-xs">
            <Search size={15} color={COLORS.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name, skill, title, or email..."
              placeholderTextColor="#94A3B8"
              className="flex-1 font-sans text-xs text-foreground ml-2 py-0.5"
            />
            {search.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearch("")}
                className="p-1"
              >
                <X size={14} color={COLORS.muted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Status Filter Horizontal Pills */}
        <StatusFilter
          activeFilter={filter}
          counts={counts}
          onSelectFilter={setFilter}
        />

        {/* Score Threshold Quick Filters */}
        <View className="flex-row items-center px-4 py-1.5 gap-1.5">
          <Text className="font-sans-bold text-[10px] text-slate-500 uppercase mr-1">
            Min Fit:
          </Text>
          {[
            { label: "All", value: 0 },
            { label: "≥50% Fit", value: 50 },
            { label: "≥80% High Fit", value: 80 },
          ].map((thresh) => {
            const isSelected = minScore === thresh.value;
            return (
              <TouchableOpacity
                key={thresh.value}
                onPress={() => {
                  selectionHaptic();
                  setMinScore(thresh.value);
                }}
                className={`px-2.5 py-1 rounded-full border ${
                  isSelected
                    ? "bg-indigo-600 border-indigo-600"
                    : "bg-white border-slate-200"
                }`}
              >
                <Text
                  className={`font-sans-bold text-[10px] ${
                    isSelected ? "text-white" : "text-slate-700"
                  }`}
                >
                  {thresh.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Results Metadata & Sort Controls */}
        <View className="flex-row items-center justify-between px-4 pb-2 pt-1">
          <Text className="font-sans text-xs text-muted">
            Showing {filteredCandidates.length} of {candidates.length} Candidate
            {candidates.length === 1 ? "" : "s"}
          </Text>

          <TouchableOpacity
            onPress={toggleSort}
            activeOpacity={0.7}
            className="flex-row items-center bg-white border border-slate-200 px-2.5 py-1 rounded-lg"
          >
            <ArrowUpDown size={11} color={COLORS.muted} />
            <Text className="font-sans-bold text-[10px] text-muted ml-1">
              Sort: {sortBy === "match" ? "Match Score" : "Name"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [
    jd,
    ingestJobDescription,
    isUploadingJd,
    search,
    setSearch,
    filter,
    counts,
    setFilter,
    minScore,
    setMinScore,
    filteredCandidates.length,
    candidates.length,
    toggleSort,
    sortBy,
  ]);

  const renderEmptyComponent = useCallback(() => {
    if (loadingSession) {
      return (
        <View className="py-20 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.brandPrimary} />
          <Text className="font-sans text-xs text-muted mt-3">
            Loading campaign talent pool...
          </Text>
        </View>
      );
    }

    return (
      <View className="py-16 items-center justify-center px-6">
        <View className="w-14 h-14 rounded-full bg-slate-100 items-center justify-center mb-3">
          <Users size={28} color={COLORS.muted} />
        </View>
        <Text className="font-serif-bold text-base text-foreground text-center">
          {candidates.length === 0
            ? "No Candidates Ingested Yet"
            : "No Candidates Match Filters"}
        </Text>
        <Text className="font-sans text-xs text-muted text-center mt-1 mb-5 px-4 leading-4">
          {candidates.length === 0
            ? "Upload PDF or DOCX candidate resumes to parse skills, compute match scores, and start triaging."
            : "Try adjusting your search keywords or switching filter tabs."}
        </Text>

        {candidates.length === 0 && (
          <TouchableOpacity
            onPress={ingestResumes}
            disabled={isUploadingResumes}
            activeOpacity={0.8}
            className="flex-row items-center bg-brand-primary px-4 py-2.5 rounded-[6px]"
          >
            {isUploadingResumes ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Upload size={14} color="#FFFFFF" />
                <Text className="font-sans-bold text-xs text-white ml-2">
                  Upload Resumes
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  }, [loadingSession, candidates.length, ingestResumes, isUploadingResumes]);

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={filteredCandidates}
        keyExtractor={(item, index) => item.candidate_id || `cand-${index}`}
        renderItem={renderCandidateItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmptyComponent}
        contentContainerStyle={{ paddingBottom: 88 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.brandPrimary}
            colors={[COLORS.brandPrimary]}
          />
        }
      />

      {/* Floating Action Button (FAB): Upload Resumes */}
      <View className="absolute bottom-4 right-4">
        <TouchableOpacity
          onPress={ingestResumes}
          disabled={isUploadingResumes}
          activeOpacity={0.85}
          className="flex-row items-center bg-accent border border-[#142038] px-4 py-3 rounded-full shadow-lg"
          style={{ elevation: 5 }}
        >
          {isUploadingResumes ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Upload size={16} color="#FFFFFF" />
              <Text className="font-sans-bold text-xs text-white ml-2">
                Upload Resumes
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <IngestionProgressModal
        visible={isReportModalVisible}
        onClose={closeReportModal}
        reports={ingestionReports}
      />
    </View>
  );
}
