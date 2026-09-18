import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Globe, DollarSign, Briefcase, ArrowRight, Sparkles } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useRecruit } from "@/context/RecruitContext";
import { selectionHaptic, impactHaptic } from "@/lib/haptics";

interface LiveIntelligenceCardProps {
  onTriggerAction?: (prompt: string) => void;
}

export const LiveIntelligenceCard: React.FC<LiveIntelligenceCardProps> = ({
  onTriggerAction,
}) => {
  const router = useRouter();
  const { jd } = useRecruit();
  const roleName = jd?.role || "Software Engineer";

  const handleAction = (promptText: string) => {
    impactHaptic();
    if (onTriggerAction) {
      onTriggerAction(promptText);
    } else {
      // Switch to Copilot tab with prepopulated query
      router.push({
        pathname: "/(app)/(tabs)",
        params: { initialPrompt: promptText },
      } as any);
    }
  };

  const actions = [
    {
      id: "salary",
      title: "Market Salary Benchmark",
      description: `Fetch real-time compensation percentiles and equity norms for "${roleName}".`,
      icon: DollarSign,
      prompt: `Search the web using Tavily for current market salary benchmarks for "${roleName}". Detail base pay percentiles, bonuses, and equity standards.`,
      badge: "Tavily Live",
      badgeColor: "bg-emerald-50 text-emerald-800 border-emerald-200",
    },
    {
      id: "requisitions",
      title: "Live Requisition Discovery",
      description: `Search active competitor job postings to benchmark competitive role specifications.`,
      icon: Briefcase,
      prompt: `Search live web job postings for "${roleName}" roles at top tech companies. What emerging skills and stack requirements are peers prioritizing right now?`,
      badge: "Real-Time Web",
      badgeColor: "bg-indigo-50 text-indigo-800 border-indigo-200",
    },
    {
      id: "competitors",
      title: "Competitor Hiring Intel",
      description: `Analyze company hiring profiles and stack requirements in our industry sector.`,
      icon: Globe,
      prompt: `Analyze current competitor hiring strategies for "${roleName}". Benchmark our technical requirements against current industry standards.`,
      badge: "Market Intel",
      badgeColor: "bg-purple-50 text-purple-800 border-purple-200",
    },
  ];

  return (
    <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-4 shadow-xs">
      <View className="flex-row items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
        <View className="flex-row items-center">
          <View className="w-7 h-7 rounded-lg bg-indigo-50 items-center justify-center mr-2">
            <Globe size={15} color="#4338CA" />
          </View>
          <View>
            <Text className="font-serif-bold text-sm text-slate-900">
              Live Web Intelligence (Tavily)
            </Text>
            <Text className="font-sans text-[10px] text-slate-500">
              Real-time compensation & industry benchmarks
            </Text>
          </View>
        </View>

        <View className="flex-row items-center bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
          <Sparkles size={10} color="#059669" />
          <Text className="font-sans-bold text-[9px] text-emerald-700 ml-1">
            Live Connected
          </Text>
        </View>
      </View>

      <View className="space-y-2.5">
        {actions.map((act) => {
          const Icon = act.icon;
          return (
            <TouchableOpacity
              key={act.id}
              onPress={() => handleAction(act.prompt)}
              activeOpacity={0.7}
              className="bg-slate-50/70 active:bg-indigo-50/40 border border-slate-200 rounded-xl p-3"
            >
              <View className="flex-row items-center justify-between mb-1">
                <View className="flex-row items-center flex-1 mr-2">
                  <Icon size={14} color="#4338CA" />
                  <Text className="font-sans-bold text-xs text-slate-900 ml-1.5" numberOfLines={1}>
                    {act.title}
                  </Text>
                </View>
                <View className={`px-1.5 py-0.5 rounded border ${act.badgeColor}`}>
                  <Text className="font-sans-bold text-[8px]">
                    {act.badge}
                  </Text>
                </View>
              </View>

              <Text className="font-sans text-[11px] text-slate-600 leading-4">
                {act.description}
              </Text>

              <View className="flex-row items-center justify-end mt-2">
                <Text className="font-sans-bold text-[10px] text-indigo-700 mr-1">
                  Run Search
                </Text>
                <ArrowRight size={11} color="#4338CA" />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

export default LiveIntelligenceCard;
