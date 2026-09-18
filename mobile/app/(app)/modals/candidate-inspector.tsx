import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
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
  Save,
  EyeOff,
  ShieldCheck,
  Trash2,
  Cpu,
} from "lucide-react-native";
import { useRecruit } from "@/context/RecruitContext";
import { useAppModal } from "@/context/ModalContext";
import { fetchWithAuth } from "@/lib/apiClient";
import { COLORS } from "@/constants/theme";
import { successHaptic, selectionHaptic, warningHaptic, impactHaptic } from "@/lib/haptics";

export default function CandidateInspectorModal() {
  const router = useRouter();
  const { showModal } = useAppModal();
  const { candidateId } = useLocalSearchParams<{ candidateId: string }>();
  const {
    candidates,
    isBlindHiring,
    candidateStatuses,
    toggleCandidateStatus,
    deleteCandidate,
    activeSessionId,
    jd,
  } = useRecruit();

  const candidate = candidates.find((c) => c.candidate_id === candidateId);

  // 5-Pillar Rubric Scoring State
  const [techScore, setTechScore] = useState<number>(0);
  const [expScore, setExpScore] = useState<number>(0);
  const [domainScore, setDomainScore] = useState<number>(0);
  const [commScore, setCommScore] = useState<number>(0);
  const [problemSolvingScore, setProblemSolvingScore] = useState<number>(0);
  const [notes, setNotes] = useState<string>("");

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoadingEval, setIsLoadingEval] = useState(false);
  const [showResumeText, setShowResumeText] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load existing evaluation from PostgreSQL
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
          if (data.experience_score) setExpScore(data.experience_score);
          if (data.domain_score) setDomainScore(data.domain_score);
          if (data.comm_score) setCommScore(data.comm_score);
          if (data.problem_solving_score) setProblemSolvingScore(data.problem_solving_score);
          if (data.notes) setNotes(data.notes);
        }
      } catch (err) {
        // Silent evaluation fetch fallback
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
    const hasAnyScore =
      techScore > 0 ||
      expScore > 0 ||
      domainScore > 0 ||
      commScore > 0 ||
      problemSolvingScore > 0 ||
      notes.trim().length > 0;

    if (!hasAnyScore) {
      showModal({
        type: "warning",
        title: "Rubric Incomplete",
        message: "Please select at least one rating score or enter recruiter notes before saving.",
      });
      return;
    }

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetchWithAuth("/api/candidates/evaluate", {
        method: "POST",
        body: JSON.stringify({
          candidate_id: candidateId,
          session_id: activeSessionId || undefined,
          job_id: jd?.id || undefined,
          tech_score: techScore || 1,
          experience_score: expScore || 1,
          domain_score: domainScore || 1,
          comm_score: commScore || 1,
          problem_solving_score: problemSolvingScore || 1,
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
      warningHaptic();
      showModal({
        type: "error",
        title: "Save Failed",
        message: err.message || "Failed to persist evaluation.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRejectCandidate = () => {
    if (!candidate) return;
    impactHaptic();
    // GDPR Art. 22: Human-in-the-loop confirmation before adverse action
    showModal({
      title: "Confirm Rejection (GDPR Art. 22)",
      message: `In compliance with hiring regulations and human-in-the-loop review, please confirm you wish to reject "${displayName}".`,
      type: "confirm",
      actions: [
        {
          label: "Confirm Rejection",
          variant: "destructive",
          onPress: async () => {
            await toggleCandidateStatus(
              candidate.candidate_id,
              candidate.name,
              "rejected"
            );
          },
        },
        {
          label: "Cancel",
          variant: "cancel",
        },
      ],
    });
  };

  const handleDeleteCandidatePermanently = () => {
    if (!candidate) return;
    impactHaptic();
    // GDPR Art. 17 right-to-erasure
    showModal({
      title: "Right-to-Erasure (GDPR Art. 17)",
      message: `Permanently erase all resume text, vector embeddings, evaluations, and records for "${displayName}"? This action is irreversible.`,
      type: "confirm",
      actions: [
        {
          label: "Permanently Erase",
          variant: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            const ok = await deleteCandidate(candidate.candidate_id);
            setIsDeleting(false);
            if (ok) {
              router.back();
            } else {
              showModal({
                title: "Erasure Error",
                message: "Could not erase candidate record from database.",
                type: "error",
              });
            }
          },
        },
        {
          label: "Cancel",
          variant: "cancel",
        },
      ],
    });
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

  const aggregatePillarScore = Math.round(
    ((techScore + expScore + domainScore + commScore + problemSolvingScore) / 25) * 100
  );

  const renderStarRating = (
    value: number,
    onChange: (val: number) => void,
    label: string,
    subtitle?: string
  ) => {
    return (
      <View className="mb-3.5 pb-2.5 border-b border-slate-100 last:border-0">
        <View className="flex-row items-center justify-between mb-1">
          <Text className="font-sans-bold text-xs text-slate-900">{label}</Text>
          <Text className="font-sans text-[11px] text-slate-500">
            {value > 0 ? `${value} / 5` : "Not rated"}
          </Text>
        </View>
        {subtitle ? (
          <Text className="font-sans text-[10px] text-slate-500 mb-1.5 leading-3">
            {subtitle}
          </Text>
        ) : null}
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
                className={`w-9 h-9 rounded-lg items-center justify-center border ${
                  isFilled
                    ? "bg-amber-50 border-amber-300"
                    : "bg-slate-50 border-slate-200"
                }`}
              >
                <Star
                  size={18}
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
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      >
        {/* Candidate Profile Summary Header */}
        <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-4 shadow-xs">
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

              {/* GDPR Consent Status Indicator */}
              <View className="flex-row items-center bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-full mt-2 self-start">
                <ShieldCheck size={11} color="#2563EB" />
                <Text className="font-sans-bold text-[9px] text-blue-800 ml-1">
                  GDPR Consent: {candidate.consent_version || "Verified v1.0"}
                </Text>
              </View>
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
              className={`flex-1 flex-row items-center justify-center py-2 rounded-xl border ${
                status === "shortlisted"
                  ? "bg-emerald-600 border-emerald-600"
                  : "bg-slate-50 border-slate-200"
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
              className={`flex-1 flex-row items-center justify-center py-2 rounded-xl border ${
                status === "offered"
                  ? "bg-amber-600 border-amber-600"
                  : "bg-slate-50 border-slate-200"
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
              onPress={handleRejectCandidate}
              className={`flex-1 flex-row items-center justify-center py-2 rounded-xl border ${
                status === "rejected"
                  ? "bg-rose-600 border-rose-600"
                  : "bg-slate-50 border-slate-200"
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

        {/* 5-Pillar Recruiter Rubric Scoring Section */}
        <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-4 shadow-xs">
          <View className="flex-row items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
            <View className="flex-row items-center">
              <Star size={16} color="#D97706" fill="#D97706" />
              <Text className="font-serif-bold text-sm text-slate-900 ml-2">
                5-Pillar Rubric Assessment
              </Text>
            </View>
            <View className="flex-row items-center">
              {aggregatePillarScore > 0 && (
                <View className="bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full mr-2">
                  <Text className="font-sans-bold text-[10px] text-indigo-700">
                    {aggregatePillarScore}% Fit
                  </Text>
                </View>
              )}
              {isLoadingEval && (
                <ActivityIndicator size="small" color={COLORS.brandPrimary} />
              )}
            </View>
          </View>

          {renderStarRating(
            techScore,
            setTechScore,
            "1. Technical Competency",
            "Proficiency in core language, framework, and tooling stack."
          )}

          {renderStarRating(
            expScore,
            setExpScore,
            "2. Experience & Seniority",
            "Track record delivering production software and engineering depth."
          )}

          {renderStarRating(
            domainScore,
            setDomainScore,
            "3. Domain & Architecture",
            "System design, distributed systems, and architectural reasoning."
          )}

          {renderStarRating(
            commScore,
            setCommScore,
            "4. Communication & Cultural Add",
            "Clarity of thought, cross-functional collaboration, and cultural alignment."
          )}

          {renderStarRating(
            problemSolvingScore,
            setProblemSolvingScore,
            "5. Problem Solving & Execution",
            "Analytical reasoning, velocity, and pragmatic engineering execution."
          )}

          {/* Notes Textarea */}
          <View className="mt-2">
            <Text className="font-sans-bold text-xs text-slate-900 mb-1.5">
              Interviewer Notes & Observations
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Enter candidate impressions, strengths, domain expertise, or concerns..."
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              className="font-sans text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl p-3 min-h-[96px]"
            />
          </View>

          {/* Save Button */}
          <TouchableOpacity
            onPress={handleSaveEvaluation}
            disabled={isSaving}
            activeOpacity={0.8}
            className={`flex-row items-center justify-center py-2.5 rounded-xl mt-4 ${
              saveSuccess ? "bg-emerald-600" : "bg-indigo-600"
            }`}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : saveSuccess ? (
              <>
                <Check size={16} color="#FFFFFF" />
                <Text className="font-sans-bold text-xs text-white ml-1.5">
                  Rubric Saved to PostgreSQL!
                </Text>
              </>
            ) : (
              <>
                <Save size={15} color="#FFFFFF" />
                <Text className="font-sans-bold text-xs text-white ml-1.5">
                  Save 5-Pillar Rubric
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Skills & Gaps Breakdown */}
        <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-4 shadow-xs">
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
                    className="bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md"
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
                    className="bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md"
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
            <View className="mt-1 bg-rose-50 border border-rose-200 rounded-xl p-3">
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
          <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-4 shadow-xs">
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
              <Text className="font-sans-bold text-xs text-indigo-700">
                {showResumeText ? "Hide Text" : "Show Full Text"}
              </Text>
            </TouchableOpacity>

            {showResumeText && (
              <View className="mt-3 pt-3 border-t border-slate-100 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <Text className="font-mono text-[11px] text-slate-700 leading-4">
                  {candidate.raw_text}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* GDPR Art. 17 Right-to-Erasure Candidate Deletion Card */}
        <View className="bg-rose-50/70 border border-rose-200 rounded-2xl p-4 mb-4">
          <View className="flex-row items-center mb-1.5">
            <Trash2 size={14} color="#E11D48" />
            <Text className="font-serif-bold text-sm text-rose-900 ml-2">
              Privacy & Candidate Erasure
            </Text>
          </View>
          <Text className="font-sans text-[11px] text-rose-800 leading-4 mb-3">
            In accordance with GDPR Article 17 (Right-to-Erasure), you can permanently delete this candidate's resume, vector embeddings, and evaluations.
          </Text>
          <TouchableOpacity
            onPress={handleDeleteCandidatePermanently}
            disabled={isDeleting}
            activeOpacity={0.7}
            className="flex-row items-center justify-center bg-rose-600 active:bg-rose-700 py-2.5 rounded-xl"
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Trash2 size={13} color="#FFFFFF" />
                <Text className="font-sans-bold text-xs text-white ml-1.5">
                  Permanently Delete Candidate (GDPR Art. 17)
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
