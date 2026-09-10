import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Sparkles,
  Users,
  CheckCircle,
  ShieldCheck,
  ArrowRight,
  LogIn,
  LogOut,
  UserCheck,
  KeyRound,
  UserPlus,
} from "lucide-react-native";
import { useAuth } from "@/context/AuthContext";
import { COLORS } from "@/constants/theme";
import { ACTION_CHIPS } from "@/constants/prompts";
import { selectionHaptic } from "@/lib/haptics";

export default function HomeScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
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
                Phase 4 App Shell Ready
              </Text>
            </View>
          </View>
          <Text className="font-sans text-sm text-muted mt-1">
            Precision Candidate Intelligence & Multi-Agent Copilot
          </Text>
        </View>

        {/* User Session Banner */}
        <View className="bg-white border border-border rounded-[6px] p-4 my-2 shadow-xs">
          {user ? (
            <View>
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center flex-1 mr-2">
                  <View className="w-8 h-8 rounded-full bg-emerald-100 items-center justify-center border border-emerald-200">
                    <UserCheck size={16} color={COLORS.statusShortlist} />
                  </View>
                  <View className="ml-2.5 flex-1">
                    <Text className="font-sans-bold text-xs text-foreground" numberOfLines={1}>
                      {user.user_metadata?.full_name || "Recruiter"}
                    </Text>
                    <Text className="font-sans text-[11px] text-muted" numberOfLines={1}>
                      {user.email}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={async () => {
                    selectionHaptic();
                    await logout();
                  }}
                  className="bg-slate-100 border border-border px-3 py-1.5 rounded-[6px] flex-row items-center"
                >
                  <LogOut size={13} color={COLORS.muted} />
                  <Text className="font-sans-medium text-xs text-muted ml-1">Sign Out</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={() => {
                  selectionHaptic();
                  router.push("/(app)/(tabs)");
                }}
                activeOpacity={0.8}
                className="bg-accent py-2.5 px-4 rounded-[6px] flex-row items-center justify-center shadow-xs"
              >
                <Sparkles size={14} color="#FFFFFF" />
                <Text className="font-sans-bold text-xs text-white ml-2">
                  Open Recruitment Workspace (4 Tabs)
                </Text>
                <ArrowRight size={14} color="#FFFFFF" className="ml-1.5" />
              </TouchableOpacity>
            </View>
          ) : (
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-3">
                <Text className="font-sans-bold text-xs text-foreground">
                  Recruiter Authentication
                </Text>
                <Text className="font-sans text-[11px] text-muted mt-0.5">
                  Sign in or create account with Supabase PKCE Auth.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  selectionHaptic();
                  router.push("/(auth)/welcome");
                }}
                className="bg-accent px-3 py-2 rounded-[6px] flex-row items-center"
              >
                <LogIn size={13} color="#FFFFFF" />
                <Text className="font-sans-bold text-xs text-white ml-1.5">Sign In</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Phase 3 & 4 Navigation Controls */}
        <View className="my-3">
          <Text className="font-sans-bold text-xs text-muted uppercase tracking-wider mb-2">
            Navigation Controls
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <TouchableOpacity
              onPress={() => {
                selectionHaptic();
                router.push("/(app)/(tabs)");
              }}
              className="bg-accent/10 border border-accent/30 px-3 py-2 rounded-[6px] flex-row items-center shadow-xs"
            >
              <Sparkles size={13} color={COLORS.brandPrimary} />
              <Text className="font-sans-bold text-xs text-accent ml-1.5">App Shell (Tabs)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(auth)/welcome")}
              className="bg-white border border-border px-3 py-2 rounded-[6px] flex-row items-center shadow-xs"
            >
              <Users size={13} color={COLORS.brandPrimary} />
              <Text className="font-sans-medium text-xs text-foreground ml-1.5">Welcome Portal</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/(auth)/login")}
              className="bg-white border border-border px-3 py-2 rounded-[6px] flex-row items-center shadow-xs"
            >
              <LogIn size={13} color={COLORS.brandPrimary} />
              <Text className="font-sans-medium text-xs text-foreground ml-1.5">Sign In</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/(auth)/signup")}
              className="bg-white border border-border px-3 py-2 rounded-[6px] flex-row items-center shadow-xs"
            >
              <UserPlus size={13} color={COLORS.brandPrimary} />
              <Text className="font-sans-medium text-xs text-foreground ml-1.5">Create Account</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/(auth)/forgot-password")}
              className="bg-white border border-border px-3 py-2 rounded-[6px] flex-row items-center shadow-xs"
            >
              <KeyRound size={13} color={COLORS.brandPrimary} />
              <Text className="font-sans-medium text-xs text-foreground ml-1.5">Forgot Password</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/(auth)/reset-password")}
              className="bg-white border border-border px-3 py-2 rounded-[6px] flex-row items-center shadow-xs"
            >
              <ShieldCheck size={13} color={COLORS.brandPrimary} />
              <Text className="font-sans-medium text-xs text-foreground ml-1.5">Reset Password</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Live Candidate Preview Card */}
        <View className="bg-white border border-border rounded-[6px] p-5 my-3 shadow-sm">
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

        {/* Footer info */}
        <View className="mt-8 items-center">
          <Text className="font-sans text-xs text-muted">
            Phase 4: 4-Tab Bottom Nav · Campaign Session Switcher · RecruitContext
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
