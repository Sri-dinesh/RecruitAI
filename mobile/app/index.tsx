import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Sparkles, Users, CheckCircle, ShieldCheck, ArrowRight } from "lucide-react-native";
import { COLORS } from "@/constants/theme";
import { ACTION_CHIPS } from "@/constants/prompts";
import { selectionHaptic } from "@/lib/haptics";

export default function HomeScreen() {
  const [selectedChip, setSelectedChip] = useState<string | null>(null);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Branding */}
        <View className="pt-6 pb-4">
          <View className="flex-row items-center justify-between">
            <Text className="font-serif-bold text-3xl text-foreground tracking-tight">
              RecruitAI<Text className="text-brand-emerald">.</Text>
            </Text>
            <View className="flex-row items-center bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              <ShieldCheck size={14} color={COLORS.statusShortlist} />
              <Text className="font-sans-medium text-xs text-emerald-800 ml-1">
                Phase 2 Core Ready
              </Text>
            </View>
          </View>
          <Text className="font-sans text-sm text-muted mt-1">
            Precision Candidate Intelligence & Multi-Agent Copilot
          </Text>
        </View>

        {/* Live Candidate Preview Card */}
        <View className="bg-white border border-border rounded-[6px] p-5 my-4 shadow-sm">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center space-x-2">
              <View className="w-10 h-10 rounded-full bg-slate-100 items-center justify-center border border-border">
                <Users size={18} color={COLORS.brandPrimary} />
              </View>
              <View className="ml-3">
                <Text className="font-sans-bold text-base text-foreground">
                  Alex Chen
                </Text>
                <Text className="font-sans text-xs text-muted">
                  Staff Infrastructure Engineer
                </Text>
              </View>
            </View>
            <View className="bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              <Text className="font-mono text-xs font-bold text-emerald-700">
                94% Match
              </Text>
            </View>
          </View>

          {/* Skill Badges */}
          <View className="flex-row flex-wrap gap-1.5 my-2">
            {["Kubernetes", "Go", "Distributed Systems", "FastAPI"].map((skill) => (
              <View
                key={skill}
                className="bg-slate-100 border border-border px-2 py-0.5 rounded-full"
              >
                <Text className="font-sans-medium text-[11px] text-muted">
                  {skill}
                </Text>
              </View>
            ))}
          </View>

          {/* Decision Status Matrix Preview */}
          <View className="flex-row items-center justify-between pt-3 mt-2 border-t border-border">
            <View className="flex-row items-center">
              <CheckCircle size={14} color={COLORS.statusShortlist} />
              <Text className="font-sans-medium text-xs text-muted ml-1.5">
                Evaluated: 5/5 Tech · 4/5 Comm
              </Text>
            </View>
            <Text className="font-sans-black text-[10px] text-emerald-700 uppercase tracking-widest">
              Shortlisted
            </Text>
          </View>
        </View>

        {/* Action Prompt Chips */}
        <View className="my-3">
          <View className="flex-row items-center mb-2.5">
            <Sparkles size={16} color={COLORS.brandPrimary} />
            <Text className="font-sans-bold text-sm text-foreground ml-1.5">
              Quick Intelligence Prompts
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {ACTION_CHIPS.slice(0, 5).map((chip) => {
              const isSelected = selectedChip === chip.id;
              return (
                <TouchableOpacity
                  key={chip.id}
                  onPress={() => {
                    selectionHaptic();
                    setSelectedChip(chip.id);
                  }}
                  activeOpacity={0.7}
                  className={`px-3.5 py-2 rounded-full border ${
                    isSelected
                      ? "bg-accent border-accent"
                      : "bg-white border-border"
                  }`}
                >
                  <Text
                    className={`font-sans-medium text-xs ${
                      isSelected ? "text-white" : "text-foreground"
                    }`}
                  >
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Selected Prompt Display */}
        {selectedChip && (
          <View className="bg-slate-50 border border-border rounded-[6px] p-4 mt-2 mb-4">
            <Text className="font-sans-bold text-xs text-brand-dark mb-1">
              Active Template:
            </Text>
            <Text className="font-sans text-xs text-muted leading-relaxed">
              {ACTION_CHIPS.find((c) => c.id === selectedChip)?.prompt}
            </Text>
          </View>
        )}

        {/* Design System Verification Box */}
        <View className="bg-white border border-border rounded-[6px] p-5 mt-4">
          <Text className="font-serif text-base text-foreground mb-3">
            Design Tokens Verified
          </Text>
          
          <View className="space-y-2">
            <View className="flex-row items-center justify-between py-1 border-b border-slate-100">
              <Text className="font-sans text-xs text-muted">Canvas Ivory</Text>
              <View className="flex-row items-center">
                <View className="w-3.5 h-3.5 rounded-full bg-[#F8F6F2] border border-border mr-1.5" />
                <Text className="font-mono text-xs text-foreground">#F8F6F2</Text>
              </View>
            </View>

            <View className="flex-row items-center justify-between py-1 border-b border-slate-100">
              <Text className="font-sans text-xs text-muted">Executive Navy</Text>
              <View className="flex-row items-center">
                <View className="w-3.5 h-3.5 rounded-full bg-[#1B2A4A] mr-1.5" />
                <Text className="font-mono text-xs text-foreground">#1B2A4A</Text>
              </View>
            </View>

            <View className="flex-row items-center justify-between py-1 border-b border-slate-100">
              <Text className="font-sans text-xs text-muted">Typography</Text>
              <Text className="font-sans-bold text-xs text-foreground">Fraunces & DM Sans</Text>
            </View>

            <View className="flex-row items-center justify-between py-1">
              <Text className="font-sans text-xs text-muted">Uniform Radius</Text>
              <Text className="font-sans-medium text-xs text-foreground">6px (rounded-[6px])</Text>
            </View>
          </View>
        </View>

        {/* Footer info */}
        <View className="mt-8 items-center">
          <Text className="font-sans text-xs text-muted">
            Phase 2: Expo 57 · NativeWind v4 · Supabase Core
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
