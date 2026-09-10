import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import {
  Sparkles,
  Search,
  Sliders,
  AlertTriangle,
  HelpCircle,
  Mail,
  RefreshCw,
  Globe,
  FileText,
} from "lucide-react-native";
import { COLORS } from "@/constants/theme";
import { selectionHaptic } from "@/lib/haptics";

export interface ActionChipItem {
  id: string;
  label: string;
  prompt: string;
  icon: string;
}

export const CO_PILOT_ACTION_CHIPS: ActionChipItem[] = [
  {
    id: "ingest-sample",
    label: "🚀 Ingest Sample Files",
    prompt: "Load sample Job Description and candidate resumes into this hiring session.",
    icon: "FileText",
  },
  {
    id: "screen-candidates",
    label: "🔍 Screen Candidates",
    prompt: "Screen and rank all uploaded candidates against the active job description with match scoring and gap analysis.",
    icon: "Search",
  },
  {
    id: "compare-matrix",
    label: "📊 Compare Side-by-Side",
    prompt: "Provide a side-by-side comparative rubric analysis of the top-ranked candidates.",
    icon: "Sliders",
  },
  {
    id: "red-flags",
    label: "⚠️ Red Flags Check",
    prompt: "Perform a detailed red flags and resume discrepancies analysis for all candidates.",
    icon: "AlertTriangle",
  },
  {
    id: "interview-prep",
    label: "📋 Prep Questions",
    prompt: "Generate customized technical and behavioral interview preparation questions for the top candidates.",
    icon: "HelpCircle",
  },
  {
    id: "outreach-draft",
    label: "✉️ Outreach Draft",
    prompt: "Draft a high-conversion personalized outreach email to the top-matched candidate.",
    icon: "Mail",
  },
  {
    id: "fetch-api",
    label: "🌐 Fetch Job via API",
    prompt: "Fetch and load active job requirements via recruitment API.",
    icon: "Globe",
  },
  {
    id: "reset-workspace",
    label: "🧹 Reset Workspace",
    prompt: "Reset the current recruitment workspace and clear temporary state.",
    icon: "RefreshCw",
  },
];

interface ActionChipsProps {
  onSelectChip: (prompt: string) => void;
  disabled?: boolean;
}

export const ActionChips: React.FC<ActionChipsProps> = ({
  onSelectChip,
  disabled = false,
}) => {
  return (
    <View className="my-2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
      >
        {CO_PILOT_ACTION_CHIPS.map((chip) => (
          <TouchableOpacity
            key={chip.id}
            onPress={() => {
              if (disabled) return;
              selectionHaptic();
              onSelectChip(chip.prompt);
            }}
            disabled={disabled}
            activeOpacity={0.7}
            className={`bg-white border border-border px-3 py-1.5 rounded-[6px] shadow-xs flex-row items-center ${
              disabled ? "opacity-50" : ""
            }`}
          >
            <Text className="font-sans-medium text-xs text-foreground">
              {chip.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

export default ActionChips;
