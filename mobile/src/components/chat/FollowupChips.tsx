import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Sparkles, ArrowRight } from "lucide-react-native";
import { selectionHaptic } from "@/lib/haptics";

interface FollowupChipsProps {
  followups?: string[];
  onSelectFollowup: (prompt: string) => void;
  disabled?: boolean;
}

export const FollowupChips: React.FC<FollowupChipsProps> = ({
  followups = [],
  onSelectFollowup,
  disabled = false,
}) => {
  if (!followups || followups.length === 0) {
    return null;
  }

  const handlePress = (prompt: string) => {
    if (disabled) return;
    selectionHaptic();
    onSelectFollowup(prompt);
  };

  return (
    <View className="mt-2.5 pt-2 border-t border-slate-200/50">
      <View className="flex-row items-center mb-1.5 px-0.5">
        <Sparkles size={11} color="#6366F1" />
        <Text className="font-sans-bold text-[10px] text-slate-500 ml-1 uppercase tracking-wider">
          Suggested Next Steps
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: 8 }}
        className="flex-row"
      >
        {followups.map((item, idx) => (
          <TouchableOpacity
            key={idx}
            onPress={() => handlePress(item)}
            activeOpacity={0.7}
            disabled={disabled}
            className="flex-row items-center bg-indigo-50/70 active:bg-indigo-100 border border-indigo-200/80 rounded-full px-2.5 py-1 mr-1.5"
          >
            <Text className="font-sans-medium text-[11px] text-indigo-900 mr-1">
              {item}
            </Text>
            <ArrowRight size={10} color="#4338CA" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};
