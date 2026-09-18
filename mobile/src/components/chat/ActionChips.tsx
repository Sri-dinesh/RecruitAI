import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { Sparkles } from "lucide-react-native";
import { QUICK_ACTION_CHIPS } from "@/constants/copilotPresets";
import { selectionHaptic } from "@/lib/haptics";

interface ActionChipsProps {
  onSelectChip: (prompt: string) => void;
  onOpenPresets?: () => void;
  disabled?: boolean;
}

export const ActionChips: React.FC<ActionChipsProps> = ({
  onSelectChip,
  onOpenPresets,
  disabled = false,
}) => {
  return (
    <View className="my-1.5">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
      >
        {onOpenPresets && (
          <TouchableOpacity
            onPress={() => {
              if (disabled) return;
              selectionHaptic();
              onOpenPresets();
            }}
            disabled={disabled}
            activeOpacity={0.7}
            className={`bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-full shadow-xs flex-row items-center ${
              disabled ? "opacity-50" : "active:bg-indigo-100"
            }`}
          >
            <Sparkles size={12} color="#4338CA" />
            <Text className="font-sans-bold text-xs text-indigo-900 ml-1.5">
              Presets Deck
            </Text>
          </TouchableOpacity>
        )}

        {QUICK_ACTION_CHIPS.map((chip) => {
          const Icon = chip.icon;
          return (
            <TouchableOpacity
              key={chip.id}
              onPress={() => {
                if (disabled) return;
                selectionHaptic();
                onSelectChip(chip.prompt);
              }}
              disabled={disabled}
              activeOpacity={0.7}
              className={`bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-xs flex-row items-center ${
                disabled ? "opacity-50" : "active:bg-slate-50 active:border-indigo-300"
              }`}
            >
              <Icon size={12} color="#4338CA" />
              <Text className="font-sans-medium text-xs text-slate-800 ml-1.5">
                {chip.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

export default ActionChips;
