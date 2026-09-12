import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import {
  X,
  FileDown,
  Share2,
  FileText,
  Table,
  Check,
  Sparkles,
} from "lucide-react-native";
import { useRecruit } from "@/context/RecruitContext";
import { useAppModal } from "@/context/ModalContext";
import { fetchWithAuth } from "@/lib/apiClient";
import { shareAtsExport, convertAtsToCsv, type ATSExportData } from "@/lib/fileExport";
import { COLORS } from "@/constants/theme";
import { selectionHaptic, successHaptic, warningHaptic } from "@/lib/haptics";

export default function AtsExportModal() {
  const router = useRouter();
  const { showModal } = useAppModal();
  const { activeSessionId } = useRecruit();

  const [format, setFormat] = useState<"json" | "csv">("json");
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [atsData, setAtsData] = useState<ATSExportData | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadAtsData() {
      setLoading(true);
      try {
        const res = await fetchWithAuth("/api/export/ats", {
          method: "POST",
          body: JSON.stringify({
            format,
            session_id: activeSessionId || undefined,
          }),
        });
        if (res.ok && isMounted) {
          const data: ATSExportData = await res.json();
          setAtsData(data);
        }
      } catch (err) {
        // Silently caught in background fetch
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadAtsData();
    return () => {
      isMounted = false;
    };
  }, [format, activeSessionId]);

  const handleShare = async () => {
    if (!atsData) return;
    setSharing(true);
    try {
      await shareAtsExport(atsData, format);
      successHaptic();
    } catch (err: any) {
      warningHaptic();
      showModal({
        type: "error",
        title: "Export Error",
        message: err.message || "Failed to share ATS file.",
      });
    } finally {
      setSharing(false);
    }
  };

  const previewContent = atsData
    ? format === "json"
      ? JSON.stringify(atsData, null, 2)
      : convertAtsToCsv(atsData)
    : "";

  return (
    <View className="flex-1 bg-background">
      {/* Modal Header */}
      <View className="bg-white border-b border-border px-4 py-3.5 flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 mr-2">
          <FileDown size={18} color={COLORS.brandPrimary} />
          <Text
            className="font-serif-bold text-base text-foreground ml-2"
            numberOfLines={1}
          >
            ATS Data Export
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
        {/* Format Selector Pills */}
        <View className="bg-white border border-border rounded-[6px] p-4 mb-4 shadow-xs">
          <Text className="font-sans-bold text-xs text-foreground uppercase tracking-wider mb-2.5">
            Export Format
          </Text>
          <View className="flex-row gap-2.5">
            <TouchableOpacity
              onPress={() => {
                selectionHaptic();
                setFormat("json");
              }}
              activeOpacity={0.7}
              className={`flex-1 flex-row items-center justify-center py-2.5 rounded-[6px] border ${
                format === "json"
                  ? "bg-accent border-accent"
                  : "bg-white border-border"
              }`}
            >
              <FileText
                size={14}
                color={format === "json" ? "#FFFFFF" : COLORS.brandPrimary}
              />
              <Text
                className={`font-sans-bold text-xs ml-1.5 ${
                  format === "json" ? "text-white" : "text-foreground"
                }`}
              >
                JSON (Greenhouse/Lever)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                selectionHaptic();
                setFormat("csv");
              }}
              activeOpacity={0.7}
              className={`flex-1 flex-row items-center justify-center py-2.5 rounded-[6px] border ${
                format === "csv"
                  ? "bg-accent border-accent"
                  : "bg-white border-border"
              }`}
            >
              <Table
                size={14}
                color={format === "csv" ? "#FFFFFF" : COLORS.brandPrimary}
              />
              <Text
                className={`font-sans-bold text-xs ml-1.5 ${
                  format === "csv" ? "text-white" : "text-foreground"
                }`}
              >
                CSV (Spreadsheet)
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Data Stats Banner */}
        <View className="bg-white border border-border rounded-[6px] p-3.5 mb-4 flex-row items-center justify-between shadow-xs">
          <View>
            <Text className="font-sans text-[11px] text-muted">Evaluations Count</Text>
            <Text className="font-serif-bold text-base text-foreground mt-0.5">
              {atsData?.evaluations_count ?? 0} Candidates
            </Text>
          </View>
          <View className="items-end">
            <Text className="font-sans text-[11px] text-muted">Format Standard</Text>
            <Text className="font-sans-bold text-xs text-brand-emerald mt-0.5 uppercase">
              {format === "json" ? "Enterprise ATS REST" : "RFC 4180 CSV"}
            </Text>
          </View>
        </View>

        {/* Live Payload Preview Box */}
        <View className="bg-white border border-border rounded-[6px] p-4 mb-4 shadow-xs">
          <View className="flex-row items-center justify-between mb-2 pb-2 border-b border-slate-100">
            <Text className="font-sans-bold text-xs text-foreground uppercase tracking-wider">
              Live Payload Preview
            </Text>
            {loading && <ActivityIndicator size="small" color={COLORS.brandPrimary} />}
          </View>

          <View className="bg-[#1B2A4A] p-3 rounded-[6px] max-h-72">
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
              <Text className="font-mono text-[10px] text-slate-100 leading-4">
                {previewContent || "// Loading ATS payload..."}
              </Text>
            </ScrollView>
          </View>
        </View>

        {/* Export & Share CTA */}
        <TouchableOpacity
          onPress={handleShare}
          disabled={sharing || loading || !atsData}
          activeOpacity={0.8}
          className="flex-row items-center justify-center bg-brand-primary py-3 rounded-[6px] shadow-sm"
        >
          {sharing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Share2 size={16} color="#FFFFFF" />
              <Text className="font-sans-bold text-sm text-white ml-2">
                Export & Share {format.toUpperCase()}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
