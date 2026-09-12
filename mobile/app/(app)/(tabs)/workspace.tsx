import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Sliders,
  Calendar,
  Mail,
  FileDown,
  FileText,
  Share2,
} from "lucide-react-native";
import { CompareMatrix } from "@/components/workspace/CompareMatrix";
import { SlotScheduler } from "@/components/workspace/SlotScheduler";
import { EmailDrafter } from "@/components/workspace/EmailDrafter";
import { COLORS } from "@/constants/theme";
import { selectionHaptic } from "@/lib/haptics";

type WorkspaceTool = "compare" | "schedule" | "email";

export default function WorkspaceTab() {
  const router = useRouter();
  const [activeTool, setActiveTool] = useState<WorkspaceTool>("compare");

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

        {/* 3-Segment Tool Switcher Pills */}
        <View className="flex-row gap-2">
          {[
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
          ].map((tool) => {
            const isActive = activeTool === tool.key;
            const Icon = tool.icon;
            return (
              <TouchableOpacity
                key={tool.key}
                onPress={() => handleSelectTool(tool.key)}
                activeOpacity={0.7}
                className={`flex-1 flex-row items-center justify-center py-2 rounded-[6px] border ${
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
        </View>
      </View>

      {/* Main Tool Content */}
      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      >
        {activeTool === "compare" && <CompareMatrix />}
        {activeTool === "schedule" && <SlotScheduler />}
        {activeTool === "email" && <EmailDrafter />}
      </ScrollView>
    </View>
  );
}
