import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  RefreshControl,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  Briefcase,
  Sliders,
  Calendar,
  Mail,
  FileDown,
  FileText,
  Share2,
  Globe,
} from "lucide-react-native";
import { RequisitionSpec } from "@/components/workspace/RequisitionSpec";
import { CompareMatrix } from "@/components/workspace/CompareMatrix";
import { SlotScheduler } from "@/components/workspace/SlotScheduler";
import { EmailDrafter } from "@/components/workspace/EmailDrafter";
import { LiveIntelligenceCard } from "@/components/workspace/LiveIntelligenceCard";
import { useRecruit } from "@/context/RecruitContext";
import { COLORS } from "@/constants/theme";
import { selectionHaptic, impactHaptic } from "@/lib/haptics";

type WorkspaceTool = "job" | "compare" | "schedule" | "email" | "intel";

const TOOL_KEYS: WorkspaceTool[] = ["job", "compare", "schedule", "email", "intel"];

export default function WorkspaceTab() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tool?: string; candidateId?: string }>();
  const { refreshActiveSession } = useRecruit();
  const [activeTool, setActiveTool] = useState<WorkspaceTool>("compare");
  const [refreshing, setRefreshing] = useState(false);

  // Deep link support: e.g. router.push({ pathname: "/(app)/(tabs)/workspace",
  // params: { tool: "email", candidateId } }) opens the Email Drafter preselected.
  useEffect(() => {
    if (params.tool && (TOOL_KEYS as string[]).includes(params.tool)) {
      setActiveTool(params.tool as WorkspaceTool);
    }
  }, [params.tool, params.candidateId]);

  const handleRefresh = useCallback(async () => {
    impactHaptic();
    setRefreshing(true);
    try {
      await refreshActiveSession();
    } finally {
      setRefreshing(false);
    }
  }, [refreshActiveSession]);

  const handleSelectTool = (tool: WorkspaceTool) => {
    selectionHaptic();
    setActiveTool(tool);
  };

  const handleOpenAtsExport = () => {
    selectionHaptic();
    router.push("/(app)/modals/ats-export");
  };

  const handleOpenPdfReport = () => {
    selectionHaptic();
    router.push("/(app)/modals/report-preview");
  };

  return (
    <View className="flex-1 bg-background">
      {/* Top Controls & Tool Switcher */}
      <View className="bg-white border-b border-border px-4 pt-3 pb-2.5 shadow-xs">
        {/* Quick Action Export Buttons */}
        <View className="flex-row items-center justify-between mb-2.5">
          <Text className="font-serif-bold text-sm text-foreground">
            Hiring Workspace
          </Text>

          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              onPress={handleOpenAtsExport}
              activeOpacity={0.7}
              className="flex-row items-center bg-slate-50 border border-border px-2.5 py-1 rounded-[6px]"
            >
              <FileDown size={12} color={COLORS.brandPrimary} />
              <Text className="font-sans-bold text-[11px] text-foreground ml-1">
                ATS Export
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleOpenPdfReport}
              activeOpacity={0.7}
              className="flex-row items-center bg-accent px-2.5 py-1 rounded-[6px]"
            >
              <FileText size={12} color="#FFFFFF" />
              <Text className="font-sans-bold text-[11px] text-white ml-1">
                PDF Dossier
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 4-Segment Tool Switcher Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: "row", gap: 8 }}
        >
          {[
            {
              key: "job" as WorkspaceTool,
              label: "Requisition & Rubric",
              icon: Briefcase,
            },
            {
              key: "compare" as WorkspaceTool,
              label: "Compare Matrix",
              icon: Sliders,
            },
            {
              key: "schedule" as WorkspaceTool,
              label: "Scheduler",
              icon: Calendar,
            },
            {
              key: "email" as WorkspaceTool,
              label: "Email Drafter",
              icon: Mail,
            },
            {
              key: "intel" as WorkspaceTool,
              label: "Live Intel",
              icon: Globe,
            },
          ].map((tool) => {
            const isActive = activeTool === tool.key;
            const Icon = tool.icon;
            return (
              <TouchableOpacity
                key={tool.key}
                onPress={() => handleSelectTool(tool.key)}
                activeOpacity={0.7}
                className={`px-3 py-2 rounded-[6px] flex-row items-center border ${
                  isActive
                    ? "bg-brand-primary border-brand-primary"
                    : "bg-white border-border"
                }`}
              >
                <Icon
                  size={13}
                  color={isActive ? "#FFFFFF" : COLORS.muted}
                />
                <Text
                  className={`font-sans-bold text-xs ml-1.5 ${
                    isActive ? "text-white" : "text-foreground"
                  }`}
                  numberOfLines={1}
                >
                  {tool.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Tool Content */}
      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.brandPrimary}
            colors={[COLORS.brandPrimary]}
          />
        }
      >
        {activeTool === "job" && <RequisitionSpec />}
        {activeTool === "compare" && <CompareMatrix />}
        {activeTool === "schedule" && <SlotScheduler />}
        {activeTool === "email" && (
          <EmailDrafter
            key={params.candidateId || "default"}
            initialCandidateId={params.candidateId}
          />
        )}
        {activeTool === "intel" && (
          <View className="p-4">
            <LiveIntelligenceCard />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
