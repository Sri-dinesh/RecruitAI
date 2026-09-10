import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { selectionHaptic } from "@/lib/haptics";
import type { CandidateStatus } from "@/types/schema";

export type FilterType = CandidateStatus | "all";

interface StatusFilterProps {
  activeFilter: FilterType;
  counts: {
    all: number;
    shortlisted: number;
    offered: number;
    rejected: number;
  };
  onSelectFilter: (filter: FilterType) => void;
}

export const StatusFilter: React.FC<StatusFilterProps> = ({
  activeFilter,
  counts,
  onSelectFilter,
}) => {
  const handleSelect = (filter: FilterType) => {
    selectionHaptic();
    onSelectFilter(filter);
  };

  const tabs: { key: FilterType; label: string; count: number; activeBg: string; activeText: string; inactiveText: string; countBadgeActive: string; countBadgeInactive: string }[] = [
    {
      key: "all",
      label: "All",
      count: counts.all,
      activeBg: "bg-accent border-accent",
      activeText: "text-white",
      inactiveText: "text-foreground",
      countBadgeActive: "bg-white/20 text-white",
      countBadgeInactive: "bg-slate-100 text-muted",
    },
    {
      key: "shortlisted",
      label: "Shortlisted",
      count: counts.shortlisted,
      activeBg: "bg-emerald-700 border-emerald-700",
      activeText: "text-white",
      inactiveText: "text-emerald-800",
      countBadgeActive: "bg-white/20 text-white",
      countBadgeInactive: "bg-emerald-50 text-emerald-700",
    },
    {
      key: "offered",
      label: "Offered",
      count: counts.offered,
      activeBg: "bg-amber-600 border-amber-600",
      activeText: "text-white",
      inactiveText: "text-amber-800",
      countBadgeActive: "bg-white/20 text-white",
      countBadgeInactive: "bg-amber-50 text-amber-700",
    },
    {
      key: "rejected",
      label: "Rejected",
      count: counts.rejected,
      activeBg: "bg-rose-700 border-rose-700",
      activeText: "text-white",
      inactiveText: "text-rose-800",
      countBadgeActive: "bg-white/20 text-white",
      countBadgeInactive: "bg-rose-50 text-rose-700",
    },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}
    >
      {tabs.map((tab) => {
        const isActive = activeFilter === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => handleSelect(tab.key)}
            activeOpacity={0.7}
            className={`flex-row items-center px-3 py-1.5 rounded-[6px] border ${
              isActive ? tab.activeBg : "bg-white border-border"
            }`}
          >
            <Text
              className={`font-sans-bold text-xs ${
                isActive ? tab.activeText : tab.inactiveText
              }`}
            >
              {tab.label}
            </Text>
            <View
              className={`ml-2 px-1.5 py-0.5 rounded-[4px] ${
                isActive ? tab.countBadgeActive : tab.countBadgeInactive
              }`}
            >
              <Text
                className={`font-sans-bold text-[10px] ${
                  isActive ? "text-white" : "text-muted"
                }`}
              >
                {tab.count}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

export default StatusFilter;
