import React, { useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import {
  BarChart3,
  Users,
  CheckCircle,
  Star,
  Clock,
  Briefcase,
  TrendingUp,
  Award,
} from "lucide-react-native";
import { useRecruit } from "@/context/RecruitContext";
import { COLORS } from "@/constants/theme";
import { selectionHaptic } from "@/lib/haptics";

export default function AnalyticsTab() {
  const { candidates, candidateStatuses, scheduledInterviews, jd } = useRecruit();

  const totalCandidates = candidates.length;
  const shortlisted = useMemo(
    () =>
      candidates.filter((c) => candidateStatuses[c.candidate_id] === "shortlisted")
        .length,
    [candidates, candidateStatuses]
  );
  const offered = useMemo(
    () =>
      candidates.filter((c) => candidateStatuses[c.candidate_id] === "offered")
        .length,
    [candidates, candidateStatuses]
  );
  const avgMatchScore = useMemo(() => {
    if (candidates.length === 0) return 0;
    const total = candidates.reduce((acc, c) => acc + (c.match_score || 0), 0);
    return Math.round(total / candidates.length);
  }, [candidates]);

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 36 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="mb-4">
          <Text className="font-serif-bold text-lg text-foreground">
            Recruitment Intelligence
          </Text>
          <Text className="font-sans text-xs text-muted mt-0.5">
            Real-time pipeline metrics and funnel diagnostics.
          </Text>
        </View>

        {/* Top KPI Cards Grid */}
        <View className="flex-row flex-wrap gap-2.5 mb-4">
          <View className="flex-1 min-w-[45%] bg-white border border-border rounded-[6px] p-3.5 shadow-xs">
            <View className="flex-row items-center justify-between mb-1.5">
              <Text className="font-sans text-xs text-muted">Total Pool</Text>
              <Users size={14} color={COLORS.brandPrimary} />
            </View>
            <Text className="font-serif-bold text-2xl text-foreground">
              {totalCandidates}
            </Text>
            <Text className="font-sans text-[10px] text-muted mt-1">
              Active candidates
            </Text>
          </View>

          <View className="flex-1 min-w-[45%] bg-white border border-border rounded-[6px] p-3.5 shadow-xs">
            <View className="flex-row items-center justify-between mb-1.5">
              <Text className="font-sans text-xs text-muted">Avg Match</Text>
              <Award size={14} color={COLORS.brandPrimary} />
            </View>
            <Text className="font-serif-bold text-2xl text-foreground">
              {avgMatchScore}%
            </Text>
            <Text className="font-sans text-[10px] text-emerald-800 mt-1">
              Across rubric criteria
            </Text>
          </View>

          <View className="flex-1 min-w-[45%] bg-white border border-border rounded-[6px] p-3.5 shadow-xs">
            <View className="flex-row items-center justify-between mb-1.5">
              <Text className="font-sans text-xs text-muted">Shortlisted</Text>
              <CheckCircle size={14} color={COLORS.statusShortlist} />
            </View>
            <Text className="font-serif-bold text-2xl text-foreground">
              {shortlisted}
            </Text>
            <Text className="font-sans text-[10px] text-muted mt-1">
              {totalCandidates > 0
                ? `${Math.round((shortlisted / totalCandidates) * 100)}% conversion`
                : "0% conversion"}
            </Text>
          </View>

          <View className="flex-1 min-w-[45%] bg-white border border-border rounded-[6px] p-3.5 shadow-xs">
            <View className="flex-row items-center justify-between mb-1.5">
              <Text className="font-sans text-xs text-muted">Offers Extended</Text>
              <Star size={14} color={COLORS.statusOffer} />
            </View>
            <Text className="font-serif-bold text-2xl text-foreground">
              {offered}
            </Text>
            <Text className="font-sans text-[10px] text-amber-800 mt-1">
              Final stage
            </Text>
          </View>
        </View>

        {/* Pipeline Funnel Section */}
        <View className="bg-white border border-border rounded-[6px] p-4 mb-4 shadow-xs">
          <Text className="font-sans-bold text-xs text-foreground uppercase tracking-wider mb-3">
            Hiring Funnel
          </Text>

          <View className="space-y-3">
            {/* Stage 1: Ingested */}
            <View>
              <View className="flex-row justify-between mb-1">
                <Text className="font-sans text-xs text-foreground">
                  Ingested Resumes
                </Text>
                <Text className="font-sans-bold text-xs text-foreground">
                  {totalCandidates}
                </Text>
              </View>
              <View className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <View className="h-full bg-accent w-full" />
              </View>
            </View>

            {/* Stage 2: Shortlisted */}
            <View>
              <View className="flex-row justify-between mb-1">
                <Text className="font-sans text-xs text-foreground">
                  Shortlisted for Review
                </Text>
                <Text className="font-sans-bold text-xs text-foreground">
                  {shortlisted}
                </Text>
              </View>
              <View className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <View
                  className="h-full bg-emerald-600"
                  style={{
                    width: `${
                      totalCandidates > 0 ? (shortlisted / totalCandidates) * 100 : 0
                    }%`,
                  }}
                />
              </View>
            </View>

            {/* Stage 3: Interviews */}
            <View>
              <View className="flex-row justify-between mb-1">
                <Text className="font-sans text-xs text-foreground">
                  Interviews Booked
                </Text>
                <Text className="font-sans-bold text-xs text-foreground">
                  {scheduledInterviews.length}
                </Text>
              </View>
              <View className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <View
                  className="h-full bg-blue-600"
                  style={{
                    width: `${
                      totalCandidates > 0
                        ? (scheduledInterviews.length / totalCandidates) * 100
                        : 0
                    }%`,
                  }}
                />
              </View>
            </View>

            {/* Stage 4: Offers */}
            <View>
              <View className="flex-row justify-between mb-1">
                <Text className="font-sans text-xs text-foreground">
                  Offers Extended
                </Text>
                <Text className="font-sans-bold text-xs text-foreground">
                  {offered}
                </Text>
              </View>
              <View className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <View
                  className="h-full bg-amber-500"
                  style={{
                    width: `${
                      totalCandidates > 0 ? (offered / totalCandidates) * 100 : 0
                    }%`,
                  }}
                />
              </View>
            </View>
          </View>
        </View>

        {/* Campaign Info Card */}
        <View className="bg-white border border-border rounded-[6px] p-4 shadow-xs">
          <Text className="font-sans-bold text-xs text-foreground uppercase tracking-wider mb-2">
            Target Role Specification
          </Text>
          <Text className="font-serif-bold text-sm text-foreground">
            {jd?.role || "Staff Infrastructure Engineer"}
          </Text>
          <Text className="font-sans text-xs text-muted mt-1">
            Required Experience: {jd?.experience_years || 5}+ Years
          </Text>
          {jd?.required_skills && jd.required_skills.length > 0 && (
            <View className="flex-row flex-wrap gap-1.5 mt-2.5">
              {jd.required_skills.map((s, idx) => (
                <View
                  key={idx}
                  className="bg-[#F8F6F2] border border-border px-2 py-0.5 rounded-[4px]"
                >
                  <Text className="font-sans text-[11px] text-foreground">
                    {s}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
