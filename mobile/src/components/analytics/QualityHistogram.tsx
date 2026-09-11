import React from "react";
import { View, Text, Dimensions } from "react-native";
import { BarChart } from "react-native-gifted-charts";
import { BarChart3 } from "lucide-react-native";
import { COLORS } from "@/constants/theme";
import type { MatchBucket } from "@/types/analytics";

interface QualityHistogramProps {
  distribution: MatchBucket[];
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CHART_WIDTH = SCREEN_WIDTH - 80;

export const QualityHistogram: React.FC<QualityHistogramProps> = ({
  distribution,
}) => {
  const bucketColors: Record<string, string> = {
    "90-100%": "#059669",
    "75-89%": "#2563EB",
    "60-74%": "#475569",
    "40-59%": "#D97706",
    "<40%": "#E11D48",
  };

  const defaultBuckets = [
    { bucket: "90-100%", count: 0, min_score: 90, max_score: 100 },
    { bucket: "75-89%", count: 0, min_score: 75, max_score: 89 },
    { bucket: "60-74%", count: 0, min_score: 60, max_score: 74 },
    { bucket: "40-59%", count: 0, min_score: 40, max_score: 59 },
    { bucket: "<40%", count: 0, min_score: 0, max_score: 39 },
  ];

  const buckets = distribution && distribution.length > 0 ? distribution : defaultBuckets;

  const barData = buckets.map((b) => ({
    value: b.count,
    label: b.bucket,
    frontColor: bucketColors[b.bucket] || "#1B2A4A",
    topLabelComponent: () => (
      <Text style={{ fontSize: 9, color: "#64748B", marginBottom: 2 }}>
        {b.count}
      </Text>
    ),
  }));

  return (
    <View className="bg-white border border-border rounded-[6px] p-4 mx-4 mb-4 shadow-xs">
      <View className="flex-row items-center justify-between mb-3 pb-2 border-b border-slate-100">
        <View className="flex-row items-center">
          <BarChart3 size={15} color={COLORS.brandPrimary} />
          <Text className="font-serif-bold text-sm text-foreground ml-2">
            Match Score Distribution
          </Text>
        </View>
        <Text className="font-sans text-[11px] text-muted">Quality Tiers</Text>
      </View>

      <View className="pt-2 items-center">
        <BarChart
          data={barData}
          barWidth={26}
          spacing={22}
          roundedTop
          noOfSections={4}
          yAxisColor="#E2E8F0"
          xAxisColor="#E2E8F0"
          rulesColor="#F1F5F9"
          yAxisTextStyle={{ fontSize: 9, color: "#94A3B8" }}
          xAxisLabelTextStyle={{ fontSize: 8, color: "#64748B" }}
          height={140}
          width={CHART_WIDTH}
        />
      </View>
    </View>
  );
};

export default QualityHistogram;
