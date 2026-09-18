import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { AtSign, Award } from "lucide-react-native";
import type { Candidate } from "@/types/schema";
import { selectionHaptic } from "@/lib/haptics";

interface CandidateMentionPopoverProps {
  candidates: Candidate[];
  filterQuery: string;
  onSelectCandidate: (candidate: Candidate) => void;
  visible: boolean;
}

export const CandidateMentionPopover: React.FC<CandidateMentionPopoverProps> = ({
  candidates,
  filterQuery,
  onSelectCandidate,
  visible,
}) => {
  if (!visible || candidates.length === 0) {
    return null;
  }

  const query = filterQuery.toLowerCase().trim();
  const filtered = candidates.filter((c) => {
    if (!query) return true;
    return (
      c.name.toLowerCase().includes(query) ||
      (c.headline || "").toLowerCase().includes(query) ||
      (c.skills || []).some((s) => s.toLowerCase().includes(query))
    );
  });

  if (filtered.length === 0) {
    return null;
  }

  return (
    <View style={styles.container} className="bg-white border border-slate-200 rounded-2xl shadow-lg mx-3 mb-2 overflow-hidden">
      <View className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <AtSign size={12} color="#4338CA" />
          <Text className="font-sans-bold text-[10px] text-indigo-900 ml-1 uppercase tracking-wider">
            Mention Candidate Context
          </Text>
        </View>
        <Text className="font-sans text-[10px] text-slate-400">
          {filtered.length} found
        </Text>
      </View>

      <ScrollView
        style={{ maxHeight: 160 }}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        {filtered.map((candidate) => {
          const initials = candidate.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

          const score = candidate.match_score;

          return (
            <TouchableOpacity
              key={candidate.candidate_id}
              onPress={() => {
                selectionHaptic();
                onSelectCandidate(candidate);
              }}
              activeOpacity={0.7}
              className="px-3 py-2 border-b border-slate-100 flex-row items-center justify-between active:bg-indigo-50/50"
            >
              <View className="flex-row items-center flex-1 mr-2">
                <View className="w-6 h-6 rounded-full bg-indigo-100 items-center justify-center mr-2">
                  <Text className="font-sans-bold text-[10px] text-indigo-700">
                    {initials}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="font-sans-bold text-xs text-slate-900" numberOfLines={1}>
                    {candidate.name}
                  </Text>
                  {candidate.headline ? (
                    <Text className="font-sans text-[10px] text-slate-500" numberOfLines={1}>
                      {candidate.headline}
                    </Text>
                  ) : null}
                </View>
              </View>

              {score !== null && score !== undefined && (
                <View className="flex-row items-center bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                  <Award size={9} color="#059669" />
                  <Text className="font-sans-bold text-[9px] text-emerald-700 ml-0.5">
                    {score}%
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    elevation: 8,
  },
});
