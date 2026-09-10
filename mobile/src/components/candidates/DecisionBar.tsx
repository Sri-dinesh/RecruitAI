import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import * as Haptics from "expo-haptics";
import { Check, Star, X } from "lucide-react-native";
import { COLORS } from "@/constants/theme";
import { impactHaptic } from "@/lib/haptics";
import type { CandidateStatus } from "@/types/schema";

interface DecisionBarProps {
  status?: CandidateStatus;
  onShortlist: () => void;
  onOffer: () => void;
  onReject: () => void;
  isSaving?: boolean;
}

export const DecisionBar: React.FC<DecisionBarProps> = ({
  status,
  onShortlist,
  onOffer,
  onReject,
  isSaving = false,
}) => {
  const handlePress = (callback: () => void) => {
    impactHaptic(Haptics.ImpactFeedbackStyle.Medium);
    callback();
  };

  return (
    <View className="border-t border-slate-100 mt-3 pt-2.5">
      {isSaving && (
        <View className="flex-row items-center justify-center mb-2">
          <ActivityIndicator
            size="small"
            color={COLORS.brandPrimary}
            style={{ transform: [{ scale: 0.7 }] }}
          />
          <Text className="font-sans text-[11px] text-muted ml-1.5">
            Syncing decision...
          </Text>
        </View>
      )}

      <View className="flex-row items-center gap-2">
        {/* Shortlist Button */}
        <TouchableOpacity
          onPress={() => handlePress(onShortlist)}
          disabled={isSaving}
          activeOpacity={0.7}
          className={`flex-1 flex-row items-center justify-center py-2 px-1 rounded-[6px] border ${
            status === "shortlisted"
              ? "bg-emerald-600 border-emerald-600"
              : "bg-white border-border"
          }`}
        >
          <Check
            size={13}
            color={status === "shortlisted" ? "#FFFFFF" : COLORS.statusShortlist}
          />
          <Text
            className={`font-sans-bold text-[11px] ml-1.5 ${
              status === "shortlisted" ? "text-white" : "text-emerald-800"
            }`}
            numberOfLines={1}
          >
            Shortlist
          </Text>
        </TouchableOpacity>

        {/* Offer Button */}
        <TouchableOpacity
          onPress={() => handlePress(onOffer)}
          disabled={isSaving}
          activeOpacity={0.7}
          className={`flex-1 flex-row items-center justify-center py-2 px-1 rounded-[6px] border ${
            status === "offered"
              ? "bg-amber-600 border-amber-600"
              : "bg-white border-border"
          }`}
        >
          <Star
            size={13}
            color={status === "offered" ? "#FFFFFF" : COLORS.statusOffer}
          />
          <Text
            className={`font-sans-bold text-[11px] ml-1.5 ${
              status === "offered" ? "text-white" : "text-amber-800"
            }`}
            numberOfLines={1}
          >
            Offer
          </Text>
        </TouchableOpacity>

        {/* Reject Button */}
        <TouchableOpacity
          onPress={() => handlePress(onReject)}
          disabled={isSaving}
          activeOpacity={0.7}
          className={`flex-1 flex-row items-center justify-center py-2 px-1 rounded-[6px] border ${
            status === "rejected"
              ? "bg-rose-600 border-rose-600"
              : "bg-white border-border"
          }`}
        >
          <X
            size={13}
            color={status === "rejected" ? "#FFFFFF" : COLORS.statusReject}
          />
          <Text
            className={`font-sans-bold text-[11px] ml-1.5 ${
              status === "rejected" ? "text-white" : "text-rose-800"
            }`}
            numberOfLines={1}
          >
            Reject
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default DecisionBar;
