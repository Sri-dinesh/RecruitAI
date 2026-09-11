import React from "react";
import { View, Text } from "react-native";
import {
  Users,
  Briefcase,
  Target,
  CalendarCheck,
  Trophy,
  TrendingUp,
  Zap,
  Bot,
} from "lucide-react-native";
import { COLORS } from "@/constants/theme";
import type { AnalyticsSummary } from "@/types/analytics";

interface KpiCardProps {
  summary: AnalyticsSummary | null;
}

export const KpiCardsGrid: React.FC<KpiCardProps> = ({ summary }) => {
  const kpis = [
    {
      label: "Total Resumes",
      value: summary?.total_candidates ?? 0,
      suffix: "",
      icon: Users,
      color: COLORS.brandPrimary,
      bg: "bg-slate-50",
      border: "border-slate-200",
    },
    {
      label: "Active Positions",
      value: summary?.active_jobs ?? 0,
      suffix: "",
      icon: Briefcase,
      color: "#2563EB",
      bg: "bg-blue-50/60",
      border: "border-blue-200",
    },
    {
      label: "Shortlisted",
      value: summary?.total_shortlisted ?? 0,
      suffix: "",
      icon: Target,
      color: COLORS.statusShortlist,
      bg: "bg-emerald-50/60",
      border: "border-emerald-200",
    },
    {
      label: "Interviews Booked",
      value: summary?.total_interviews ?? 0,
      suffix: "",
      icon: CalendarCheck,
      color: COLORS.statusOffer,
      bg: "bg-amber-50/60",
      border: "border-amber-200",
    },
    {
      label: "Avg Match Score",
      value: summary?.avg_match_score !== null && summary?.avg_match_score !== undefined
        ? Math.round(summary.avg_match_score)
        : 0,
      suffix: "%",
      icon: Trophy,
      color: COLORS.brandEmerald,
      bg: "bg-emerald-50/60",
      border: "border-emerald-200",
    },
    {
      label: "Screening Rate",
      value: summary?.screening_rate !== null && summary?.screening_rate !== undefined
        ? Math.round(summary.screening_rate)
        : 0,
      suffix: "%",
      icon: TrendingUp,
      color: "#4F46E5",
      bg: "bg-indigo-50/60",
      border: "border-indigo-200",
    },
    {
      label: "Interview Rate",
      value: summary?.interview_rate !== null && summary?.interview_rate !== undefined
        ? Math.round(summary.interview_rate)
        : 0,
      suffix: "%",
      icon: Zap,
      color: "#D97706",
      bg: "bg-amber-50/60",
      border: "border-amber-200",
    },
    {
      label: "Campaign Sessions",
      value: summary?.total_chat_sessions ?? 0,
      suffix: "",
      icon: Bot,
      color: "#64748B",
      bg: "bg-slate-50",
      border: "border-slate-200",
    },
  ];

  return (
    <View className="px-4 mb-4">
      <Text className="font-serif-bold text-sm text-foreground mb-2.5">
        Executive KPI Summary
      </Text>
      <View className="flex-row flex-wrap justify-between gap-y-2.5">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <View
              key={idx}
              className={`w-[48.5%] bg-white border ${kpi.border} rounded-[6px] p-3 shadow-xs justify-between`}
            >
              <View className="flex-row items-center justify-between mb-1.5">
                <Text
                  className="font-sans text-[11px] text-muted flex-1 mr-1"
                  numberOfLines={1}
                >
                  {kpi.label}
                </Text>
                <View className={`w-6 h-6 rounded-full ${kpi.bg} items-center justify-center`}>
                  <Icon size={12} color={kpi.color} />
                </View>
              </View>

              <Text className="font-serif-bold text-lg text-foreground">
                {kpi.value}
                <Text className="font-sans text-xs text-muted">{kpi.suffix}</Text>
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

export default KpiCardsGrid;
