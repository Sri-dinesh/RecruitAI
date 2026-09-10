import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import {
  X,
  FileText,
  Share2,
  Download,
  CheckCircle2,
  Award,
  Sparkles,
  ShieldCheck,
  Printer,
} from "lucide-react-native";
import { useRecruit } from "@/context/RecruitContext";
import { downloadAndSharePdfReport } from "@/lib/fileExport";
import { COLORS } from "@/constants/theme";
import { successHaptic, warningHaptic, selectionHaptic } from "@/lib/haptics";

export default function ReportPreviewModal() {
  const router = useRouter();
  const { activeSessionId, activeSession, jd, candidates, lastShortlist } = useRecruit();

  const [downloading, setDownloading] = useState(false);
  const [downloadedUri, setDownloadedUri] = useState<string | null>(null);

  const handleDownloadAndShare = async () => {
    if (!activeSessionId) {
      Alert.alert("Session Missing", "No active campaign session found to generate report.");
      return;
    }

    selectionHaptic();
    setDownloading(true);
    try {
      const uri = await downloadAndSharePdfReport(activeSessionId);
      setDownloadedUri(uri);
      successHaptic();
    } catch (err: any) {
      console.error("[ReportPreview] Error:", err);
      warningHaptic();
      Alert.alert("Report Error", err.message || "Failed to download and share report.");
    } finally {
      setDownloading(false);
    }
  };

  const shortlistCount = lastShortlist?.length || candidates.filter((c) => c.status === "shortlisted").length;

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="bg-white border-b border-border px-4 py-3.5 flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 mr-2">
          <FileText size={18} color={COLORS.brandPrimary} />
          <Text
            className="font-serif-bold text-base text-foreground ml-2"
            numberOfLines={1}
          >
            Executive Recruitment Dossier
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center"
          activeOpacity={0.7}
        >
          <X size={16} color={COLORS.foreground} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Dossier Overview Card */}
        <View className="bg-white border border-border rounded-[6px] p-5 mb-4 shadow-xs">
          <View className="flex-row items-center justify-between pb-3 mb-3 border-b border-slate-100">
            <View className="flex-1 mr-2">
              <Text className="font-serif-bold text-base text-foreground">
                {activeSession?.title || "Hiring Campaign Summary"}
              </Text>
              <Text className="font-sans text-xs text-muted mt-0.5">
                Target: {jd?.role || "General Position"}
              </Text>
            </View>
            <View className="bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex-row items-center">
              <ShieldCheck size={12} color={COLORS.statusShortlist} />
              <Text className="font-sans-bold text-[10px] text-emerald-800 ml-1">
                Corporate PDF
              </Text>
            </View>
          </View>

          {/* Metrics Grid */}
          <View className="flex-row items-center justify-between bg-[#F8F6F2] p-3 rounded-[6px] mb-4">
            <View className="items-center flex-1 border-r border-slate-200">
              <Text className="font-sans text-[10px] text-muted">Talent Pool</Text>
              <Text className="font-serif-bold text-base text-foreground mt-0.5">
                {candidates.length}
              </Text>
            </View>
            <View className="items-center flex-1 border-r border-slate-200">
              <Text className="font-sans text-[10px] text-muted">Shortlisted</Text>
              <Text className="font-serif-bold text-base text-emerald-700 mt-0.5">
                {shortlistCount}
              </Text>
            </View>
            <View className="items-center flex-1">
              <Text className="font-sans text-[10px] text-muted">Experience</Text>
              <Text className="font-serif-bold text-base text-foreground mt-0.5">
                {jd?.experience_years ? `${jd.experience_years}+ Yrs` : "N/A"}
              </Text>
            </View>
          </View>

          <Text className="font-sans-bold text-xs text-foreground uppercase tracking-wider mb-2">
            Report Sections Included
          </Text>

          <View className="gap-2 mb-2">
            {[
              "Executive Executive Summary & Role Specification",
              "Candidate Match Score Ranking & Scorecard Matrix",
              "Recruiter Rubric Fit Ratings (Tech & Communication)",
              "Competency Breakdown, Gap Analysis & Red Flag Flags",
              "Target Compensation Benchmarks & Salary Data",
              "Structured AI Interview Questions & Prep Guide",
            ].map((section, idx) => (
              <View key={idx} className="flex-row items-start">
                <CheckCircle2
                  size={13}
                  color={COLORS.statusShortlist}
                  style={{ marginTop: 2, marginRight: 6 }}
                />
                <Text className="font-sans text-xs text-muted flex-1 leading-4">
                  {section}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Action Button */}
        <TouchableOpacity
          onPress={handleDownloadAndShare}
          disabled={downloading}
          activeOpacity={0.8}
          className="flex-row items-center justify-center bg-brand-primary py-3.5 rounded-[6px] shadow-sm mb-3"
        >
          {downloading ? (
            <View className="flex-row items-center">
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text className="font-sans-bold text-sm text-white ml-2">
                Compiling & Downloading PDF...
              </Text>
            </View>
          ) : (
            <>
              <Share2 size={16} color="#FFFFFF" />
              <Text className="font-sans-bold text-sm text-white ml-2">
                Download & Share PDF Dossier
              </Text>
            </>
          )}
        </TouchableOpacity>

        {downloadedUri && (
          <View className="bg-emerald-50 border border-emerald-200 p-3 rounded-[6px] flex-row items-center">
            <CheckCircle2 size={15} color={COLORS.statusShortlist} />
            <Text className="font-sans text-xs text-emerald-800 ml-2 flex-1">
              Report ready in device cache. Tap above to reopen native share options.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
