import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Bot, TrendingUp, Users, ArrowRight, ShieldCheck } from "lucide-react-native";
import { COLORS } from "@/constants/theme";
import { selectionHaptic } from "@/lib/haptics";

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand Header */}
        <View className="items-center mt-4 mb-6">
          <Text className="font-serif-bold text-3xl text-foreground tracking-tight">
            RecruitAI<Text className="text-brand-emerald">.</Text>
          </Text>
          <View className="flex-row items-center bg-white border border-border px-3 py-1 rounded-full mt-2 shadow-xs">
            <Bot size={13} color={COLORS.brandPrimary} />
            <Text className="font-sans-medium text-xs text-foreground ml-1.5">
              Agentic Recruitment Engine
            </Text>
          </View>
        </View>

        {/* Hero Title & Pitch */}
        <View className="my-2">
          <Text className="font-serif text-3xl text-foreground leading-tight tracking-tight">
            Hire 10x faster with{"\n"}
            <Text className="font-serif-bold text-brand-primary">precision AI</Text> intelligence.
          </Text>
          <Text className="font-sans text-sm text-muted mt-2.5 leading-relaxed">
            Automate candidate screening, execute rubric evaluations, and orchestrate interview workflows with multi-agent intelligence.
          </Text>
        </View>

        {/* Floating Live AI Screening Card Preview */}
        <View className="bg-white border border-border rounded-[6px] p-5 my-6 shadow-sm">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-full bg-slate-100 items-center justify-center border border-border">
                <Users size={18} color={COLORS.brandPrimary} />
              </View>
              <View className="ml-3">
                <Text className="font-sans-bold text-sm text-foreground">
                  Alex Chen
                </Text>
                <Text className="font-sans text-xs text-muted">
                  Staff Infrastructure Engineer
                </Text>
              </View>
            </View>
            <View className="flex-row items-center bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              <TrendingUp size={12} color={COLORS.statusShortlist} />
              <Text className="font-mono text-xs font-bold text-emerald-700 ml-1">
                94% Match
              </Text>
            </View>
          </View>

          {/* Skill Tag Pills */}
          <View className="flex-row flex-wrap gap-1.5 my-2">
            {["✓ LangGraph", "✓ FastAPI", "✓ pgvector RAG", "✓ Python 3.14"].map((skill) => (
              <View
                key={skill}
                className="bg-slate-100 border border-border px-2 py-0.5 rounded-full"
              >
                <Text className="font-sans-medium text-[11px] text-foreground">
                  {skill}
                </Text>
              </View>
            ))}
          </View>

          {/* Candidate Evaluation Summary */}
          <View className="mt-3 pt-3 border-t border-slate-100">
            <Text className="font-sans text-xs text-muted leading-relaxed">
              "Strong distributed systems track record with production LangGraph orchestration experience."
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View className="space-y-3 mt-2">
          <TouchableOpacity
            onPress={() => {
              selectionHaptic();
              router.push("/(auth)/signup");
            }}
            activeOpacity={0.85}
            className="w-full bg-accent rounded-[6px] py-3.5 px-4 flex-row items-center justify-center shadow-sm"
          >
            <Text className="font-sans-bold text-sm text-white mr-2">
              Create Account
            </Text>
            <ArrowRight size={16} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              selectionHaptic();
              router.push("/(auth)/login");
            }}
            activeOpacity={0.7}
            className="w-full bg-white border border-border rounded-[6px] py-3.5 px-4 items-center justify-center mt-3"
          >
            <Text className="font-sans-medium text-sm text-foreground">
              Sign In to Existing Account
            </Text>
          </TouchableOpacity>
        </View>

        {/* Security Trust Footnote */}
        <View className="flex-row items-center justify-center mt-8 pt-4 border-t border-slate-200">
          <ShieldCheck size={14} color={COLORS.statusShortlist} />
          <Text className="font-sans text-xs text-muted ml-1.5">
            Protected by Supabase Auth PKCE Cryptography
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
