import React from "react";
import { View, Text, ScrollView } from "react-native";
import { Briefcase, CheckCircle2, Trophy, Users } from "lucide-react-native";
import { COLORS } from "@/constants/theme";
import type { JobSummaryRow } from "@/types/analytics";

interface JobsTableProps {
  jobs: JobSummaryRow[];
}

export const JobsTable: React.FC<JobsTableProps> = ({ jobs }) => {
  return (
    <View className="bg-white border border-border rounded-[6px] p-4 mx-4 mb-4 shadow-xs">
      <View className="flex-row items-center justify-between mb-3 pb-2 border-b border-slate-100">
        <View className="flex-row items-center">
          <Briefcase size={15} color={COLORS.brandPrimary} />
          <Text className="font-serif-bold text-sm text-foreground ml-2">
            Active Campaign Positions
          </Text>
        </View>
        <Text className="font-sans text-[11px] text-muted">
          {jobs.length} Positions
        </Text>
      </View>

      {jobs.length === 0 ? (
        <Text className="font-sans text-xs text-muted text-center py-4">
          No active positions created yet.
        </Text>
      ) : (
        <View className="gap-2.5">
          {jobs.map((j, idx) => (
            <View
              key={j.job_id || idx}
              className="bg-[#F8F6F2] border border-border rounded-[6px] p-3"
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text
                  className="font-serif-bold text-xs text-foreground flex-1 mr-2"
                  numberOfLines={1}
                >
                  {j.title}
                </Text>
                <View
                  className={`px-2 py-0.5 rounded border ${
                    j.status === "active"
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-slate-100 border-slate-200"
                  }`}
                >
                  <Text
                    className={`font-sans-bold text-[9px] uppercase ${
                      j.status === "active"
                        ? "text-emerald-800"
                        : "text-slate-600"
                    }`}
                  >
                    {j.status}
                  </Text>
                </View>
              </View>

              {/* Stats Bar */}
              <View className="flex-row items-center justify-between pt-1">
                <View className="flex-row items-center gap-3">
                  <Text className="font-sans text-[11px] text-muted">
                    Applied: <Text className="font-sans-bold text-foreground">{j.total_applied}</Text>
                  </Text>
                  <Text className="font-sans text-[11px] text-muted">
                    Shortlisted: <Text className="font-sans-bold text-emerald-700">{j.total_shortlisted}</Text>
                  </Text>
                  <Text className="font-sans text-[11px] text-muted">
                    Offered: <Text className="font-sans-bold text-amber-700">{j.total_offered}</Text>
                  </Text>
                </View>

                {j.avg_match_score !== null && j.avg_match_score !== undefined && (
                  <View className="bg-emerald-100/70 px-1.5 py-0.5 rounded">
                    <Text className="font-sans-bold text-[10px] text-emerald-800">
                      {Math.round(j.avg_match_score)}% avg
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

export default JobsTable;
