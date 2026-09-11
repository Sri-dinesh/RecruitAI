import React from "react";
import { View, Text, TouchableOpacity, Dimensions } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { TrendingUp } from "lucide-react-native";
import { COLORS } from "@/constants/theme";
import type { TimeSeriesPoint, LookbackDays } from "@/types/analytics";

interface IngestionChartProps {
  data: TimeSeriesPoint[];
  lookback: LookbackDays;
  onChangeLookback: (days: LookbackDays) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CHART_WIDTH = SCREEN_WIDTH - 80;

export const IngestionChart: React.FC<IngestionChartProps> = ({
  data,
  lookback,
  onChangeLookback,
}) => {
  // Format data points for gifted-charts LineChart
  const chartData = React.useMemo(() => {
    if (!data || data.length === 0) {
      return [
        { value: 0, label: "W1" },
        { value: 0, label: "W2" },
        { value: 0, label: "W3" },
        { value: 0, label: "W4" },
      ];
    }

    const step = Math.max(1, Math.floor(data.length / 6));

    return data.map((pt, idx) => {
      // Format day e.g. "2026-09-10" -> "Sep 10" or "09/10"
      let label = "";
      if (idx % step === 0 || idx === data.length - 1) {
        const parts = pt.day.split("-");
        if (parts.length === 3) {
          label = `${parts[1]}/${parts[2]}`;
        } else {
          label = pt.day.slice(-5);
        }
      }

      return {
        value: pt.count,
        label,
        dataPointText: pt.count > 0 ? String(pt.count) : undefined,
      };
    });
  }, [data]);

  const spacing = Math.max(16, Math.floor(CHART_WIDTH / Math.max(chartData.length, 1)));

  return (
    <View className="bg-white border border-border rounded-[6px] p-4 mx-4 mb-4 shadow-xs">
      {/* Chart Header with Lookback Pills */}
      <View className="flex-row items-center justify-between mb-3 pb-2 border-b border-slate-100">
        <View className="flex-row items-center">
          <TrendingUp size={15} color={COLORS.brandPrimary} />
          <Text className="font-serif-bold text-sm text-foreground ml-2">
            Ingestion Over Time
          </Text>
        </View>

        {/* Lookback Selector */}
        <View className="flex-row bg-[#F8F6F2] border border-border rounded-[6px] p-0.5">
          {([7, 30, 90] as LookbackDays[]).map((d) => {
            const isActive = lookback === d;
            return (
              <TouchableOpacity
                key={d}
                onPress={() => onChangeLookback(d)}
                activeOpacity={0.7}
                className={`px-2 py-0.5 rounded-[4px] ${
                  isActive ? "bg-accent" : "bg-transparent"
                }`}
              >
                <Text
                  className={`font-sans-bold text-[10px] ${
                    isActive ? "text-white" : "text-muted"
                  }`}
                >
                  {d}D
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Gifted-Charts Area LineChart */}
      <View className="pt-2 items-center">
        <LineChart
          data={chartData}
          areaChart
          curved
          color={COLORS.brandPrimary}
          thickness={2}
          startFillColor={COLORS.brandPrimary}
          endFillColor="#FFFFFF"
          startOpacity={0.25}
          endOpacity={0.02}
          initialSpacing={12}
          spacing={spacing}
          noOfSections={4}
          yAxisColor="#E2E8F0"
          xAxisColor="#E2E8F0"
          rulesColor="#F1F5F9"
          rulesType="solid"
          yAxisTextStyle={{ fontSize: 9, color: "#94A3B8" }}
          xAxisLabelTextStyle={{ fontSize: 9, color: "#94A3B8" }}
          dataPointsColor={COLORS.brandPrimary}
          dataPointsRadius={2.5}
          height={140}
          width={CHART_WIDTH}
        />
      </View>
    </View>
  );
};

export default IngestionChart;
