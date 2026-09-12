import React, { useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Bot, TrendingUp, Users, ArrowRight, ShieldCheck } from "lucide-react-native";
import { useAuth } from "@/context/AuthContext";
import { COLORS } from "@/constants/theme";
import { selectionHaptic } from "@/lib/haptics";

export default function WelcomeScreen() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/(app)/(tabs)");
    }
  }, [user, loading, router]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand Header */}
        <View className="items-center mt-4 mb-6">
          <Image
            source={require("@/../assets/logo-mark.png")}
            style={{ width: 56, height: 56, resizeMode: "contain", marginBottom: 12 }}
          />
          <Text className="font-serif-bold text-3xl text-foreground tracking-tight">
            RecruitAI<Text className="text-brand-emerald">.</Text>
          </Text>
          <View className="flex-row items-center bg-white border border-border px-3 py-1 rounded-full mt-2">
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

        {/* Value Proposition Highlights Card */}
        <View className="bg-white border border-border rounded-[6px] p-5 my-6">
          <View className="flex-row items-center mb-4">
            <View className="w-9 h-9 rounded-full bg-slate-100 items-center justify-center border border-border mr-3">
              <Bot size={18} color={COLORS.brandPrimary} />
            </View>
            <View className="flex-1">
              <Text className="font-serif-bold text-sm text-foreground">
                Autonomous Talent Intelligence
              </Text>
              <Text className="font-sans text-xs text-muted">
                Enterprise-grade recruitment workflows
              </Text>
            </View>
          </View>

          <View className="space-y-3">
            <View className="flex-row items-start">
              <View className="w-5 h-5 rounded-full bg-emerald-50 items-center justify-center mt-0.5 mr-2.5">
                <TrendingUp size={11} color={COLORS.statusShortlist} />
              </View>
              <View className="flex-1">
                <Text className="font-sans-bold text-xs text-foreground">
                  Multi-Agent LangGraph Screening
                </Text>
                <Text className="font-sans text-[11px] text-muted leading-relaxed">
                  Dense semantic retrieval and rubric scoring against your active job descriptions.
                </Text>
              </View>
            </View>

            <View className="flex-row items-start mt-2.5">
              <View className="w-5 h-5 rounded-full bg-amber-50 items-center justify-center mt-0.5 mr-2.5">
                <ShieldCheck size={11} color={COLORS.statusOffer} />
              </View>
              <View className="flex-1">
                <Text className="font-sans-bold text-xs text-foreground">
                  Blind Hiring & PII Redaction
                </Text>
                <Text className="font-sans text-[11px] text-muted leading-relaxed">
                  Eliminates unconscious bias by masking contact info and demographics before grading.
                </Text>
              </View>
            </View>
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
            className="w-full bg-accent rounded-[6px] py-3.5 px-4 flex-row items-center justify-center"
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
