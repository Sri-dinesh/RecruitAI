import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import {
  RotateCcw,
  FileDown,
  BarChart3,
  TrendingUp,
} from "lucide-react-native";
import { useAnalytics } from "@/hooks/useAnalytics";
import { KpiCardsGrid } from "@/components/analytics/KpiCard";
import { FunnelChart } from "@/components/analytics/FunnelChart";
import { IngestionChart } from "@/components/analytics/IngestionChart";
import { QualityHistogram } from "@/components/analytics/QualityHistogram";
import { TopSkillsBar } from "@/components/analytics/TopSkillsBar";
import { VelocityCards } from "@/components/analytics/VelocityCards";
import { JobsTable } from "@/components/analytics/JobsTable";
import { ActivityFeed } from "@/components/analytics/ActivityFeed";
import { COLORS } from "@/constants/theme";

export default function AnalyticsTab() {
  const {
    summary,
    pipeline,
    timeSeries,
    matchDistribution,
    topSkills,
    velocity,
    jobs,
    activity,
    lookbackDays,
    loading,
    refreshing,
    refresh,
    changeLookback,
    exportCsv,
  } = useAnalytics();

  return (
    <View className="flex-1 bg-background">
      {/* Top Header & Control Bar */}
      <View className="bg-white border-b border-border px-4 pt-3 pb-2.5 shadow-xs">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <BarChart3 size={18} color={COLORS.brandPrimary} />
            <Text className="font-serif-bold text-sm text-foreground ml-2">
              Recruitment Intelligence
            </Text>
          </View>

          {/* Action Buttons: Refresh & CSV Export */}
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              onPress={refresh}
              disabled={refreshing}
              activeOpacity={0.7}
              className="p-1.5 rounded-[6px] bg-[#F8F6F2] border border-border"
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={COLORS.brandPrimary} />
              ) : (
                <RotateCcw size={14} color={COLORS.brandPrimary} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={exportCsv}
              activeOpacity={0.7}
              className="flex-row items-center bg-accent px-2.5 py-1 rounded-[6px]"
            >
              <FileDown size={13} color="#FFFFFF" />
              <Text className="font-sans-bold text-[11px] text-white ml-1.5">
                Export CSV
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Main Dashboard Scrollable View */}
      {loading && !refreshing ? (
        <View className="flex-1 items-center justify-center p-6">
          <ActivityIndicator size="large" color={COLORS.brandPrimary} />
          <Text className="font-sans text-xs text-muted mt-3">
            Loading recruitment intelligence metrics...
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingVertical: 12, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={COLORS.brandPrimary}
              colors={[COLORS.brandPrimary]}
            />
          }
        >
          {/* 1. 8 KPI Summary Cards */}
          <KpiCardsGrid summary={summary} />

          {/* 2. Hiring Velocity Milestone Cards */}
          <VelocityCards velocity={velocity} />

          {/* 3. Pipeline Funnel Conversion */}
          <FunnelChart pipeline={pipeline} />

          {/* 4. Ingestion Over Time Chart */}
          <IngestionChart
            data={timeSeries}
            lookback={lookbackDays}
            onChangeLookback={changeLookback}
          />

          {/* 5. Match Score Distribution Histogram */}
          <QualityHistogram distribution={matchDistribution} />

          {/* 6. Top Demanded Skills Ranking */}
          <TopSkillsBar skills={topSkills} />

          {/* 7. Active Campaign Positions Table */}
          <JobsTable jobs={jobs} />

          {/* 8. Live Activity Feed */}
          <ActivityFeed activity={activity} />
        </ScrollView>
      )}
    </View>
  );
}
