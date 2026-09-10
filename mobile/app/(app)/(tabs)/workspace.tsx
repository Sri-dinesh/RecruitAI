import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import {
  Sliders,
  Calendar,
  Mail,
  FileDown,
  Briefcase,
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react-native";
import { useRecruit } from "@/context/RecruitContext";
import { COLORS } from "@/constants/theme";
import { selectionHaptic } from "@/lib/haptics";

type WorkspaceSubTab = "comparison" | "scheduler" | "email" | "export";

export default function WorkspaceTab() {
  const { jd, candidates, scheduledInterviews, activeSession } = useRecruit();
  const [subTab, setSubTab] = useState<WorkspaceSubTab>("comparison");

  return (
    <View className="flex-1 bg-background">
      {/* Sub-Tab Navigation Bar */}
      <View className="bg-white border-b border-border px-4 py-2">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          <TouchableOpacity
            onPress={() => {
              selectionHaptic();
              setSubTab("comparison");
            }}
            className={`flex-row items-center px-3 py-1.5 rounded-[6px] border ${
              subTab === "comparison"
                ? "bg-accent border-accent"
                : "bg-white border-border"
            }`}
          >
            <Sliders
              size={13}
              color={subTab === "comparison" ? "#FFFFFF" : COLORS.brandPrimary}
            />
            <Text
              className={`font-sans-bold text-xs ml-1.5 ${
                subTab === "comparison" ? "text-white" : "text-foreground"
              }`}
            >
              Comparison
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              selectionHaptic();
              setSubTab("scheduler");
            }}
            className={`flex-row items-center px-3 py-1.5 rounded-[6px] border ${
              subTab === "scheduler"
                ? "bg-accent border-accent"
                : "bg-white border-border"
            }`}
          >
            <Calendar
              size={13}
              color={subTab === "scheduler" ? "#FFFFFF" : COLORS.brandPrimary}
            />
            <Text
              className={`font-sans-bold text-xs ml-1.5 ${
                subTab === "scheduler" ? "text-white" : "text-foreground"
              }`}
            >
              Scheduler
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              selectionHaptic();
              setSubTab("email");
            }}
            className={`flex-row items-center px-3 py-1.5 rounded-[6px] border ${
              subTab === "email"
                ? "bg-accent border-accent"
                : "bg-white border-border"
            }`}
          >
            <Mail
              size={13}
              color={subTab === "email" ? "#FFFFFF" : COLORS.brandPrimary}
            />
            <Text
              className={`font-sans-bold text-xs ml-1.5 ${
                subTab === "email" ? "text-white" : "text-foreground"
              }`}
            >
              Email Drafter
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              selectionHaptic();
              setSubTab("export");
            }}
            className={`flex-row items-center px-3 py-1.5 rounded-[6px] border ${
              subTab === "export"
                ? "bg-accent border-accent"
                : "bg-white border-border"
            }`}
          >
            <FileDown
              size={13}
              color={subTab === "export" ? "#FFFFFF" : COLORS.brandPrimary}
            />
            <Text
              className={`font-sans-bold text-xs ml-1.5 ${
                subTab === "export" ? "text-white" : "text-foreground"
              }`}
            >
              Export
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Sub-Tab Content Views */}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {subTab === "comparison" && (
          <View>
            <Text className="font-serif-bold text-base text-foreground mb-1">
              Candidate Comparison Matrix
            </Text>
            <Text className="font-sans text-xs text-muted mb-4">
              Side-by-side rubric evaluation against JD requirements.
            </Text>

            {candidates.length === 0 ? (
              <View className="bg-white border border-border rounded-[6px] p-6 items-center">
                <Users size={32} color={COLORS.muted} />
                <Text className="font-sans text-xs text-muted mt-2 text-center">
                  Load candidate resumes to compare side-by-side.
                </Text>
              </View>
            ) : (
              candidates.slice(0, 4).map((c, i) => (
                <View
                  key={c.candidate_id || i}
                  className="bg-white border border-border rounded-[6px] p-4 mb-3 shadow-xs"
                >
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="font-sans-bold text-sm text-foreground">
                      {c.name}
                    </Text>
                    <View className="bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      <Text className="font-sans-bold text-xs text-emerald-800">
                        {c.match_score || 0}%
                      </Text>
                    </View>
                  </View>
                  <Text className="font-sans text-xs text-muted mb-2">
                    {c.headline || `${c.experience_years || 0} years experience`}
                  </Text>
                  <View className="flex-row flex-wrap gap-1">
                    {c.skills?.slice(0, 4).map((s, si) => (
                      <View
                        key={si}
                        className="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded"
                      >
                        <Text className="font-sans text-[10px] text-foreground">
                          {s}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {subTab === "scheduler" && (
          <View>
            <Text className="font-serif-bold text-base text-foreground mb-1">
              Interview Scheduler
            </Text>
            <Text className="font-sans text-xs text-muted mb-4">
              Synchronized recruitment calendar and slots.
            </Text>

            {scheduledInterviews.length === 0 ? (
              <View className="bg-white border border-border rounded-[6px] p-6 items-center">
                <Calendar size={32} color={COLORS.muted} />
                <Text className="font-sans text-xs text-muted mt-2 text-center">
                  No interviews scheduled yet. Prompt the Co-Pilot to schedule candidate interview slots.
                </Text>
              </View>
            ) : (
              scheduledInterviews.map((item, idx) => (
                <View
                  key={idx}
                  className="bg-white border border-border rounded-[6px] p-4 mb-2.5 flex-row items-center justify-between"
                >
                  <View className="flex-1 mr-2">
                    <Text className="font-sans-bold text-sm text-foreground">
                      {item.candidate_name}
                    </Text>
                    <View className="flex-row items-center mt-1">
                      <Clock size={11} color={COLORS.muted} />
                      <Text className="font-sans text-xs text-muted ml-1">
                        {item.slot}
                      </Text>
                    </View>
                  </View>
                  <View className="bg-emerald-50 px-2 py-1 rounded border border-emerald-200 flex-row items-center">
                    <CheckCircle2 size={12} color={COLORS.statusShortlist} />
                    <Text className="font-sans-bold text-[10px] text-emerald-800 ml-1">
                      Booked
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {subTab === "email" && (
          <View>
            <Text className="font-serif-bold text-base text-foreground mb-1">
              Email & Outreach Drafter
            </Text>
            <Text className="font-sans text-xs text-muted mb-4">
              AI-composed personalized candidate correspondence.
            </Text>

            <View className="bg-white border border-border rounded-[6px] p-5 shadow-xs">
              <View className="flex-row items-center justify-between mb-3 pb-2 border-b border-slate-100">
                <Text className="font-sans-bold text-xs text-foreground">
                  Draft Offer / Outreach
                </Text>
                <Sparkles size={14} color={COLORS.brandPrimary} />
              </View>
              <Text className="font-sans text-xs text-muted leading-relaxed mb-4">
                Select a candidate or prompt the Co-Pilot to compose a customized offer, interview invitation, or rejection notification.
              </Text>
              <TouchableOpacity
                onPress={() => selectionHaptic()}
                activeOpacity={0.8}
                className="bg-accent px-4 py-2 rounded-[6px] items-center"
              >
                <Text className="font-sans-bold text-xs text-white">
                  Compose In Co-Pilot
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {subTab === "export" && (
          <View>
            <Text className="font-serif-bold text-base text-foreground mb-1">
              Export & Intelligence Reports
            </Text>
            <Text className="font-sans text-xs text-muted mb-4">
              ATS CSV/JSON data and executive PDF summary.
            </Text>

            <View className="space-y-3">
              <View className="bg-white border border-border rounded-[6px] p-4 flex-row items-center justify-between shadow-xs">
                <View className="flex-1 mr-2">
                  <Text className="font-sans-bold text-xs text-foreground">
                    ATS Data Export
                  </Text>
                  <Text className="font-sans text-[11px] text-muted mt-0.5">
                    Structured CSV & JSON for Workday, Greenhouse & Lever.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => selectionHaptic()}
                  className="bg-slate-100 border border-border px-3 py-1.5 rounded-[6px]"
                >
                  <Text className="font-sans-medium text-xs text-foreground">
                    Export
                  </Text>
                </TouchableOpacity>
              </View>

              <View className="bg-white border border-border rounded-[6px] p-4 flex-row items-center justify-between shadow-xs">
                <View className="flex-1 mr-2">
                  <Text className="font-sans-bold text-xs text-foreground">
                    Executive PDF Report
                  </Text>
                  <Text className="font-sans text-[11px] text-muted mt-0.5">
                    Hiring dossier with candidate rubrics and pipeline analytics.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => selectionHaptic()}
                  className="bg-accent px-3 py-1.5 rounded-[6px]"
                >
                  <Text className="font-sans-bold text-xs text-white">
                    Download PDF
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
