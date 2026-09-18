import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { ChevronDown, ChevronUp, Cpu, CheckCircle2 } from "lucide-react-native";
import { selectionHaptic } from "@/lib/haptics";

interface AgentStepsAccordionProps {
  steps?: string[];
  isLoading?: boolean;
}

export const AgentStepsAccordion: React.FC<AgentStepsAccordionProps> = ({
  steps = [],
  isLoading = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(isLoading);

  if (!steps || steps.length === 0) {
    return null;
  }

  const toggleAccordion = () => {
    selectionHaptic();
    setIsExpanded((prev) => !prev);
  };

  return (
    <View className="mb-2 bg-slate-50/80 border border-slate-200/80 rounded-xl overflow-hidden">
      <TouchableOpacity
        onPress={toggleAccordion}
        activeOpacity={0.7}
        className="flex-row items-center justify-between px-3 py-2 bg-slate-100/60"
      >
        <View className="flex-row items-center flex-1 mr-2">
          <Cpu size={13} color="#4338CA" />
          <Text className="font-sans-bold text-[11px] text-indigo-900 ml-1.5">
            {steps.length} Agent Reasoning Step{steps.length === 1 ? "" : "s"}
          </Text>
        </View>

        <View className="flex-row items-center">
          {isLoading ? (
            <View className="w-2 h-2 rounded-full bg-indigo-500 mr-2 animate-pulse" />
          ) : (
            <CheckCircle2 size={12} color="#059669" className="mr-1.5" />
          )}
          {isExpanded ? (
            <ChevronUp size={14} color="#64748B" />
          ) : (
            <ChevronDown size={14} color="#64748B" />
          )}
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View className="p-2.5 pt-2 border-t border-slate-200/60 space-y-1.5">
          {steps.map((step, idx) => (
            <View key={idx} className="flex-row items-start py-0.5">
              <View className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 mr-2" />
              <Text className="font-sans text-[11px] text-slate-700 flex-1 leading-4">
                {step}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};
