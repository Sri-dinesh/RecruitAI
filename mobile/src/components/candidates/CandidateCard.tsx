import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import {
  Mail,
  Phone,
  AlertTriangle,
  ChevronRight,
  EyeOff,
  Briefcase,
} from "lucide-react-native";
import { COLORS } from "@/constants/theme";
import { DecisionBar } from "./DecisionBar";
import type { Candidate, CandidateStatus } from "@/types/schema";

interface CandidateCardProps {
  candidate: Candidate;
  index: number;
  status?: CandidateStatus;
  isBlindHiring?: boolean;
  isSaving?: boolean;
  onPress: () => void;
  onShortlist: () => void;
  onOffer: () => void;
  onReject: () => void;
}

export const CandidateCard: React.FC<CandidateCardProps> = ({
  candidate,
  index,
  status,
  isBlindHiring = false,
  isSaving = false,
  onPress,
  onShortlist,
  onOffer,
  onReject,
}) => {
  // Blind hiring masking
  const getInitials = (name?: string) => {
    if (!name) return "";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase() + ".";
    return parts.map((p) => p.charAt(0).toUpperCase() + ".").join("");
  };

  const displayName = isBlindHiring
    ? `Candidate #${index + 1} (${getInitials(candidate.name)})`
    : candidate.name || `Candidate #${index + 1}`;

  const displayEmail = isBlindHiring
    ? "••••••••@••••.com"
    : candidate.email;

  const displayPhone = isBlindHiring
    ? "•••• ••• ••••"
    : candidate.phone;

  // Match score badge color
  const score = candidate.match_score;
  const scoreBadge =
    score !== null && score !== undefined
      ? score >= 80
        ? {
            bg: "bg-emerald-50 border-emerald-200",
            text: "text-emerald-700",
            label: `${score}% Match`,
          }
        : score >= 50
        ? {
            bg: "bg-amber-50 border-amber-200",
            text: "text-amber-700",
            label: `${score}% Match`,
          }
        : {
            bg: "bg-rose-50 border-rose-200",
            text: "text-rose-700",
            label: `${score}% Match`,
          }
      : null;

  // Card container styling based on candidate status
  let containerStyle = "border-border bg-white";
  if (status === "shortlisted") {
    containerStyle = "border-emerald-400 bg-emerald-50/20";
  } else if (status === "offered") {
    containerStyle = "border-amber-400 bg-amber-50/20";
  } else if (status === "rejected") {
    containerStyle = "border-rose-300 bg-rose-50/20 opacity-70";
  }

  // Skills & Gaps
  const matchedSkills =
    candidate.matched_skills && candidate.matched_skills.length > 0
      ? candidate.matched_skills
      : candidate.skills?.slice(0, 4) || [];
  const gaps = candidate.gaps || [];
  const redFlags = candidate.red_flags || [];

  return (
    <View
      className={`border rounded-[6px] p-4 mb-3 mx-4 shadow-xs ${containerStyle}`}
    >
      {/* Tappable Body for Opening Inspector */}
      <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
        {/* Header Row */}
        <View className="flex-row items-start justify-between">
          <View className="flex-1 mr-2">
            <View className="flex-row items-center flex-wrap gap-1.5">
              <Text
                className="font-serif-bold text-sm text-foreground"
                numberOfLines={1}
              >
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

            <Text
              className="font-sans text-xs text-muted mt-0.5"
              numberOfLines={1}
            >
              {candidate.headline ||
                (candidate.experience_years !== null &&
                candidate.experience_years !== undefined
                  ? `${candidate.experience_years} Years Experience`
                  : "Candidate Profile")}
            </Text>
          </View>

          <View className="flex-row items-center gap-1.5">
            {scoreBadge && (
              <View
                className={`border px-2 py-0.5 rounded-full ${scoreBadge.bg}`}
              >
                <Text
                  className={`font-sans-bold text-[11px] ${scoreBadge.text}`}
                >
                  {scoreBadge.label}
                </Text>
              </View>
            )}
            <ChevronRight size={15} color={COLORS.muted} />
          </View>
        </View>

        {/* Contact Chips */}
        {(displayEmail || displayPhone) && (
          <View className="flex-row items-center flex-wrap gap-3 mt-2">
            {displayEmail && (
              <View className="flex-row items-center">
                <Mail size={11} color={COLORS.muted} />
                <Text
                  className="font-sans text-[11px] text-muted ml-1"
                  numberOfLines={1}
                >
                  {displayEmail}
                </Text>
              </View>
            )}
            {displayPhone && (
              <View className="flex-row items-center">
                <Phone size={11} color={COLORS.muted} />
                <Text className="font-sans text-[11px] text-muted ml-1">
                  {displayPhone}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Matched Skills Tags */}
        {matchedSkills.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5 mt-2.5">
            {matchedSkills.slice(0, 5).map((skill, idx) => (
              <View
                key={idx}
                className="bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-[4px]"
              >
                <Text className="font-sans text-[10px] text-indigo-700">
                  {skill}
                </Text>
              </View>
            ))}
            {matchedSkills.length > 5 && (
              <View className="bg-slate-100 px-1.5 py-0.5 rounded-[4px]">
                <Text className="font-sans text-[10px] text-muted">
                  +{matchedSkills.length - 5}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Missing Gaps Tags */}
        {gaps.length > 0 && (
          <View className="flex-row flex-wrap items-center gap-1.5 mt-2">
            <Text className="font-sans text-[10px] text-rose-600 mr-0.5">
              Gaps:
            </Text>
            {gaps.slice(0, 3).map((gap, idx) => (
              <View
                key={idx}
                className="bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-[4px]"
              >
                <Text className="font-sans text-[10px] text-rose-700">
                  {gap}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Red Flags Alert */}
        {redFlags.length > 0 && (
          <View className="flex-row items-center bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-[4px] mt-2.5">
            <AlertTriangle size={12} color={COLORS.statusReject} />
            <Text
              className="font-sans text-[10px] text-rose-800 ml-1.5 flex-1"
              numberOfLines={1}
            >
              Flag: {redFlags[0]}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Decision Action Bar */}
      <DecisionBar
        status={status}
        onShortlist={onShortlist}
        onOffer={onOffer}
        onReject={onReject}
        isSaving={isSaving}
      />
    </View>
  );
};

export default CandidateCard;
