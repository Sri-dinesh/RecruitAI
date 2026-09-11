import React from "react";
import { View, Text } from "react-native";
import { Clock, Zap, Target, Award } from "lucide-react-native";
import { COLORS } from "@/constants/theme";
import type { HiringVelocity } from "@/types/analytics";

interface VelocityCardsProps {
  velocity: HiringVelocity | null;
}

export const VelocityCards: React.FC<VelocityCardsProps> = ({ velocity }) => {
  const cards = [
    {
      label: "Days to Shortlist",
      days: velocity?.avg_days_to_shortlist !== null && velocity?.avg_days_to_shortlist !== undefined
        ? velocity.avg_days_to_shortlist.toFixed(1)
        : "—",
      icon: Target,
      color: COLORS.statusShortlist,
      bg: "bg-emerald-50",
      border: "border-emerald-200",
    },
    {
      label: "Days to Interview",
      days: velocity?.avg_days_to_interview !== null && velocity?.avg_days_to_interview !== undefined
        ? velocity.avg_days_to_interview.toFixed(1)
        : "—",
      icon: Clock,
      color: COLORS.statusOffer,
      bg: "bg-amber-50",
      border: "border-amber-200",
    },
    {
      label: "Days to Offer",
      days: velocity?.avg_days_to_offer !== null && velocity?.avg_days_to_offer !== undefined
        ? velocity.avg_days_to_offer.toFixed(1)
        : "—",
      icon: Award,
      color: "#2563EB",
      bg: "bg-blue-50",
      border: "border-blue-200",
    },
  ];

  return (
    <View className="px-4 mb-4">
      <View className="flex-row items-center justify-between mb-2.5">
        <View className="flex-row items-center">
          <Zap size={15} color={COLORS.brandPrimary} />
          <Text className="font-serif-bold text-sm text-foreground ml-2">
            Hiring Velocity Benchmarks
          </Text>
        </View>
        <Text className="font-sans text-[11px] text-muted">Pipeline Speed</Text>
      </View>

      <View className="flex-row gap-2">
        {cards.map((c, idx) => {
          const Icon = c.icon;
          return (
            <View
              key={idx}
              className={`flex-1 bg-white border ${c.border} rounded-[6px] p-3 shadow-xs items-center justify-between`}
            >
              <View className={`w-7 h-7 rounded-full ${c.bg} items-center justify-center mb-1.5`}>
                <Icon size={14} color={c.color} />
              </View>
              <Text className="font-serif-bold text-base text-foreground">
                {c.days}
                <Text className="font-sans text-[10px] text-muted font-normal"> d</Text>
              </Text>
              <Text
                className="font-sans text-[10px] text-muted text-center mt-0.5"
                numberOfLines={1}
              >
                {c.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

export default VelocityCards;
