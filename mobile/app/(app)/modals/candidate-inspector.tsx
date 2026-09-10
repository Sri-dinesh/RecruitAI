import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  X,
  Star,
  Check,
  AlertTriangle,
  FileText,
  Mail,
  Phone,
  Briefcase,
  GraduationCap,
  Save,
  EyeOff,
  Clock,
  Sparkles,
} from "lucide-react-native";
import { useRecruit } from "@/context/RecruitContext";
import { fetchWithAuth } from "@/lib/apiClient";
import { COLORS } from "@/constants/theme";
import { successHaptic, selectionHaptic, warningHaptic } from "@/lib/haptics";

export default function CandidateInspectorModal() {
  const router = useRouter();
  const { candidateId } = useLocalSearchParams<{ candidateId: string }>();
  const { candidates, isBlindHiring, candidateStatuses, toggleCandidateStatus } = useRecruit();

  const candidate = candidates.find((c) => c.candidate_id === candidateId);

  const [techScore, setTechScore] = useState<number>(0);
  const [commScore, setCommScore] = useState<number>(0);
  const [notes, setNotes] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingEval, setIsLoadingEval] = useState(false);
  const [showResumeText, setShowResumeText] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load existing evaluation if present
  useEffect(() => {
    if (!candidateId) return;

    let isMounted = true;
    async function loadEvaluation() {
      setIsLoadingEval(true);
      try {
        const res = await fetchWithAuth(`/api/candidates/${candidateId}/evaluation`);
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data.tech_score) setTechScore(data.tech_score);
          if (data.comm_score) setCommScore(data.comm_score);
          if (data.notes) setNotes(data.notes);
        }
      } catch (err) {
        console.warn("[CandidateInspector] Error loading evaluation:", err);
      } finally {
        if (isMounted) setIsLoadingEval(false);
      }
    }

    loadEvaluation();
    return () => {
      isMounted = false;
    };
  }, [candidateId]);

  const handleSaveEvaluation = async () => {
    if (!candidateId) return;
    if (techScore < 1 && commScore < 1 && !notes.trim()) {
      Alert.alert(
        "Rubric Incomplete",
        "Please select a Technical or Communication rating, or enter notes before saving."
      );
      return;
    }

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetchWithAuth("/api/candidates/evaluate", {
        method: "POST",
        body: JSON.stringify({
          candidate_id: candidateId,
          tech_score: techScore || 1,
          comm_score: commScore || 1,
          notes: notes.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to save evaluation.");
      }

      successHaptic();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error("[CandidateInspector] Save error:", err);
      warningHaptic();
      Alert.alert("Save Failed", err.message || "Failed to persist evaluation.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!candidate) {
    return (
      <View className="flex-1 bg-background items-center justify-center p-6">
        <Text className="font-serif-bold text-base text-foreground">
          Candidate Not Found
        </Text>
        <Text className="font-sans text-xs text-muted text-center mt-1 mb-4">
          The requested candidate record could not be located in this campaign session.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="bg-brand-primary px-4 py-2 rounded-[6px]"
        >
          <Text className="font-sans-bold text-xs text-white">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getInitials = (name?: string) => {
    if (!name) return "";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase() + ".";
    return parts.map((p) => p.charAt(0).toUpperCase() + ".").join("");
  };

  const displayName = isBlindHiring
    ? `Candidate (${getInitials(candidate.name)})`
    : candidate.name || "Candidate Profile";

  const displayEmail = isBlindHiring ? "••••••••@••••.com" : candidate.email;
  const displayPhone = isBlindHiring ? "•••• ••• ••••" : candidate.phone;
  const status = candidateStatuses[candidate.candidate_id];

  const renderStarRating = (
    value: number,
    onChange: (val: number) => void,
    label: string
  ) => {
    return (
      <View className="mb-4">
        <View className="flex-row items-center justify-between mb-1.5">
          <Text className="font-sans-bold text-xs text-foreground">{label}</Text>
          <Text className="font-sans text-xs text-muted">
            {value > 0 ? `${value} of 5 Stars` : "Not rated"}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          {[1, 2, 3, 4, 5].map((starVal) => {
            const isFilled = starVal <= value;
            return (
              <TouchableOpacity
                key={starVal}
                onPress={() => {
                  selectionHaptic();
                  onChange(starVal === value ? 0 : starVal);
                }}
                activeOpacity={0.7}
                className={`w-10 h-10 rounded-[6px] items-center justify-center border ${
                  isFilled
                    ? "bg-amber-50 border-amber-300"
                    : "bg-slate-50 border-slate-200"
                }`}
              >
                <Star
                  size={20}
                  color={isFilled ? "#D97706" : "#94A3B8"}
                  fill={isFilled ? "#D97706" : "transparent"}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      {/* Modal Navigation Header */}
      <View className="bg-white border-b border-border px-4 py-3.5 flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 mr-2">
          <FileText size={18} color={COLORS.brandPrimary} />
          <Text
            className="font-serif-bold text-base text-foreground ml-2"
            numberOfLines={1}
          >
            Candidate Inspector
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center"
          activeOpacity={0.7}
        >
          <X size={16} color={COLORS.foreground} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Candidate Profile Summary Header */}
        <View className="bg-white border border-border rounded-[6px] p-4 mb-4 shadow-xs">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 mr-2">
              <View className="flex-row items-center flex-wrap gap-1.5">
                <Text className="font-serif-bold text-lg text-foreground">
                  {displayName}
                </Text>
                {isBlindHiring && (
                  <View className="flex-row items-center bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                    <EyeOff size={10} color={COLORS.statusOffer} />
                    <Text className="font-sans-bold text-[9px] text-amber-800 ml-1">
                      Blind Mode
                    </Text>
                  </View>
                )}
              </View>

              <Text className="font-sans text-xs text-muted mt-1">
                {candidate.headline ||
                  (candidate.experience_years
                    ? `${candidate.experience_years} Years Experience`
                    : "Candidate Profile")}
              </Text>
            </View>

            {candidate.match_score !== null && candidate.match_score !== undefined && (
              <View className="bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                <Text className="font-sans-bold text-xs text-emerald-800">
                  {candidate.match_score}% Match
                </Text>
              </View>
            )}
          </View>

          {/* Contact Details */}
          {(displayEmail || displayPhone || candidate.location) && (
            <View className="mt-3 pt-3 border-t border-slate-100 gap-1.5">
              {displayEmail && (
                <View className="flex-row items-center">
                  <Mail size={12} color={COLORS.muted} />
                  <Text className="font-sans text-xs text-muted ml-2">
                    {displayEmail}
                  </Text>
                </View>
              )}
              {displayPhone && (
                <View className="flex-row items-center">
                  <Phone size={12} color={COLORS.muted} />
                  <Text className="font-sans text-xs text-muted ml-2">
                    {displayPhone}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Quick Decision Actions in Inspector */}
          <View className="flex-row items-center gap-2 mt-3 pt-3 border-t border-slate-100">
            <TouchableOpacity
              onPress={() =>
                toggleCandidateStatus(
                  candidate.candidate_id,
                  candidate.name,
                  "shortlisted"
                )
              }
              className={`flex-1 flex-row items-center justify-center py-2 rounded-[6px] border ${
                status === "shortlisted"
                  ? "bg-emerald-600 border-emerald-600"
                  : "bg-slate-50 border-border"
              }`}
            >
              <Check
                size={13}
                color={status === "shortlisted" ? "#FFFFFF" : COLORS.statusShortlist}
              />
              <Text
                className={`font-sans-bold text-xs ml-1.5 ${
                  status === "shortlisted" ? "text-white" : "text-emerald-800"
                }`}
              >
                Shortlist
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                toggleCandidateStatus(
                  candidate.candidate_id,
                  candidate.name,
                  "offered"
                )
              }
              className={`flex-1 flex-row items-center justify-center py-2 rounded-[6px] border ${
                status === "offered"
                  ? "bg-amber-600 border-amber-600"
                  : "bg-slate-50 border-border"
              }`}
            >
              <Star
                size={13}
                color={status === "offered" ? "#FFFFFF" : COLORS.statusOffer}
              />
              <Text
                className={`font-sans-bold text-xs ml-1.5 ${
                  status === "offered" ? "text-white" : "text-amber-800"
                }`}
              >
                Offer
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                toggleCandidateStatus(
                  candidate.candidate_id,
                  candidate.name,
                  "rejected"
                )
              }
              className={`flex-1 flex-row items-center justify-center py-2 rounded-[6px] border ${
                status === "rejected"
                  ? "bg-rose-600 border-rose-600"
                  : "bg-slate-50 border-border"
              }`}
            >
              <X
                size={13}
                color={status === "rejected" ? "#FFFFFF" : COLORS.statusReject}
              />
              <Text
                className={`font-sans-bold text-xs ml-1.5 ${
                  status === "rejected" ? "text-white" : "text-rose-800"
                }`}
              >
                Reject
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recruiter Rubric Scoring Section */}
        <View className="bg-white border border-border rounded-[6px] p-4 mb-4 shadow-xs">
          <View className="flex-row items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
            <View className="flex-row items-center">
              <Star size={16} color="#D97706" fill="#D97706" />
              <Text className="font-serif-bold text-sm text-foreground ml-2">
                Recruiter Rubric Assessment
              </Text>
            </View>
            {isLoadingEval && (
              <ActivityIndicator size="small" color={COLORS.brandPrimary} />
            )}
          </View>

          {renderStarRating(
            techScore,
            setTechScore,
            "Technical Fit & Competency"
          )}

          {renderStarRating(
            commScore,
            setCommScore,
            "Communication & Culture Alignment"
          )}

          {/* Notes Textarea */}
          <View className="mt-1">
            <Text className="font-sans-bold text-xs text-foreground mb-1.5">
              Interviewer Notes & Observations
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Enter specific interview impressions, strengths, domain expertise, or concerns..."
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              className="font-sans text-xs text-foreground bg-[#F8F6F2] border border-border rounded-[6px] p-3 min-h-[96px]"
            />
          </View>

          {/* Save Button */}
          <TouchableOpacity
            onPress={handleSaveEvaluation}
            disabled={isSaving}
            activeOpacity={0.8}
            className={`flex-row items-center justify-center py-2.5 rounded-[6px] mt-4 ${
              saveSuccess ? "bg-emerald-600" : "bg-brand-primary"
            }`}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : saveSuccess ? (
              <>
                <Check size={16} color="#FFFFFF" />
                <Text className="font-sans-bold text-xs text-white ml-1.5">
                  Evaluation Saved!
                </Text>
              </>
            ) : (
              <>
                <Save size={15} color="#FFFFFF" />
                <Text className="font-sans-bold text-xs text-white ml-1.5">
                  Save Evaluation
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Skills & Gaps Breakdown */}
        <View className="bg-white border border-border rounded-[6px] p-4 mb-4 shadow-xs">
          <Text className="font-serif-bold text-sm text-foreground mb-3">
            Competencies & Skill Gaps
          </Text>

          {/* Matched Skills */}
          {candidate.matched_skills && candidate.matched_skills.length > 0 && (
            <View className="mb-3">
              <Text className="font-sans-bold text-[11px] text-emerald-800 mb-1.5">
                Matched Skills ({candidate.matched_skills.length})
              </Text>
              <View className="flex-row flex-wrap gap-1.5">
                {candidate.matched_skills.map((skill, idx) => (
                  <View
                    key={idx}
                    className="bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-[4px]"
                  >
                    <Text className="font-sans text-xs text-emerald-800">
                      ✓ {skill}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Missing Gaps */}
          {candidate.gaps && candidate.gaps.length > 0 && (
            <View className="mb-3">
              <Text className="font-sans-bold text-[11px] text-rose-700 mb-1.5">
                Skill Gaps ({candidate.gaps.length})
              </Text>
              <View className="flex-row flex-wrap gap-1.5">
                {candidate.gaps.map((gap, idx) => (
                  <View
                    key={idx}
                    className="bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-[4px]"
                  >
                    <Text className="font-sans text-xs text-rose-700">
                      ✕ {gap}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Red Flags */}
          {candidate.red_flags && candidate.red_flags.length > 0 && (
            <View className="mt-1 bg-rose-50 border border-rose-200 rounded-[6px] p-3">
              <View className="flex-row items-center mb-1">
                <AlertTriangle size={14} color={COLORS.statusReject} />
                <Text className="font-sans-bold text-xs text-rose-800 ml-1.5">
                  Red Flags Detected ({candidate.red_flags.length})
                </Text>
              </View>
              {candidate.red_flags.map((flag, idx) => (
                <Text
                  key={idx}
                  className="font-sans text-xs text-rose-700 mt-1 leading-4"
                >
                  • {flag}
                </Text>
              ))}
            </View>
          )}
        </View>

        {/* Raw Parsed Resume Text Viewer */}
        {candidate.raw_text && (
          <View className="bg-white border border-border rounded-[6px] p-4 mb-4 shadow-xs">
            <TouchableOpacity
              onPress={() => setShowResumeText((prev) => !prev)}
              activeOpacity={0.7}
              className="flex-row items-center justify-between"
            >
              <View className="flex-row items-center">
                <FileText size={15} color={COLORS.brandPrimary} />
                <Text className="font-serif-bold text-sm text-foreground ml-2">
                  Raw Parsed Resume Text
                </Text>
              </View>
              <Text className="font-sans-bold text-xs text-accent">
                {showResumeText ? "Hide Text" : "Show Full Text"}
              </Text>
            </TouchableOpacity>

            {showResumeText && (
              <View className="mt-3 pt-3 border-t border-slate-100 bg-[#F8F6F2] p-3 rounded-[6px] border border-border">
                <Text className="font-mono text-[11px] text-slate-700 leading-4">
                  {candidate.raw_text}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
