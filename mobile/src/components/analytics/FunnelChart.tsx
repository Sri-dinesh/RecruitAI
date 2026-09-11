import React from "react";
import { View, Text } from "react-native";
import { Filter, ChevronRight } from "lucide-react-native";
import { COLORS } from "@/constants/theme";
import type { PipelineStage } from "@/types/analytics";

interface FunnelChartProps {
  pipeline: PipelineStage[];
}

export const FunnelChart: React.FC<FunnelChartProps> = ({ pipeline }) => {
  const defaultStages: PipelineStage[] = [
    { stage: "Applications", count: 0, percentage: 100 },
    { stage: "Shortlisted", count: 0, percentage: 0 },
    { stage: "Interview", count: 0, percentage: 0 },
    { stage: "Offered", count: 0, percentage: 0 },
  ];

  const stages = pipeline && pipeline.length > 0 ? pipeline : defaultStages;
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  const colors = ["#1B2A4A", "#059669", "#D97706", "#2563EB", "#7C3AED"];

  return (
    <View className="bg-white border border-border rounded-[6px] p-4 mx-4 mb-4 shadow-xs">
      <View className="flex-row items-center justify-between mb-3 pb-2 border-b border-slate-100">
        <View className="flex-row items-center">
          <Filter size={15} color={COLORS.brandPrimary} />
          <Text className="font-serif-bold text-sm text-foreground ml-2">
            Pipeline Conversion Funnel
          </Text>
        </View>
        <Text className="font-sans text-[11px] text-muted">End-to-End</Text>
      </View>

      <View className="gap-3">
        {stages.map((st, idx) => {
          const barPercent = Math.max((st.count / maxCount) * 100, st.count > 0 ? 8 : 4);
          const barColor = colors[idx % colors.length];

          return (
            <View key={idx}>
              <View className="flex-row items-center justify-between mb-1">
                <Text className="font-sans-medium text-xs text-foreground">
                  {st.stage}
                </Text>
                <View className="flex-row items-center">
                  <Text className="font-sans-bold text-xs text-foreground mr-1.5">
                    {st.count}
                  </Text>
                  <Text className="font-sans text-[10px] text-muted">
                    ({Math.round(st.percentage)}%)
                  </Text>
                </View>
              </View>

              {/* Progress Track */}
              <View className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <View
                  style={{
                    width: `${barPercent}%`,
                    backgroundColor: barColor,
                  }}
                  className="h-full rounded-full"
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

export default FunnelChart;
