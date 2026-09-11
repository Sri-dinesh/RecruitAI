import React from "react";
import { View, Text } from "react-native";
import { Sparkles, Code } from "lucide-react-native";
import { COLORS } from "@/constants/theme";
import type { SkillDemand } from "@/types/analytics";

interface TopSkillsBarProps {
  skills: SkillDemand[];
}

export const TopSkillsBar: React.FC<TopSkillsBarProps> = ({ skills }) => {
  const maxDemand = Math.max(...(skills.map((s) => s.demand_count) || [1]), 1);

  return (
    <View className="bg-white border border-border rounded-[6px] p-4 mx-4 mb-4 shadow-xs">
      <View className="flex-row items-center justify-between mb-3 pb-2 border-b border-slate-100">
        <View className="flex-row items-center">
          <Code size={15} color={COLORS.brandPrimary} />
          <Text className="font-serif-bold text-sm text-foreground ml-2">
            Top In-Demand Skills
          </Text>
        </View>
        <Text className="font-sans text-[11px] text-muted">JD Frequency</Text>
      </View>

      {skills.length === 0 ? (
        <Text className="font-sans text-xs text-muted text-center py-4">
          No skills demand data available yet.
        </Text>
      ) : (
        <View className="gap-2.5">
          {skills.slice(0, 8).map((sk, idx) => {
            const barWidth = Math.max((sk.demand_count / maxDemand) * 100, 6);
            return (
              <View key={idx}>
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="font-sans-medium text-xs text-foreground">
                    {sk.skill}
                  </Text>
                  <View className="bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                    <Text className="font-sans-bold text-[10px] text-indigo-700">
                      {sk.demand_count} jobs
                    </Text>
                  </View>
                </View>

                {/* Bar Track */}
                <View className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <View
                    style={{ width: `${barWidth}%` }}
                    className="h-full bg-indigo-600 rounded-full"
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

export default TopSkillsBar;
