import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  Briefcase,
  UploadCloud,
  FileText,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Clock,
  MapPin,
  DollarSign,
  ChevronRight,
  Plus,
  Minus,
  Sparkles,
  Copy,
  Check,
  X,
  FileCheck,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { useRecruit } from "@/context/RecruitContext";
import { useFileIngestion } from "@/hooks/useFileIngestion";
import { showAppModal } from "@/context/ModalContext";
import { fetchWithAuth } from "@/lib/apiClient";
import { COLORS } from "@/constants/theme";
import { selectionHaptic, successHaptic, warningHaptic, impactHaptic } from "@/lib/haptics";

interface RubricPillar {
  key: string;
  name: string;
  weight: number;
  description: string;
  color: string;
}

export const RequisitionSpec: React.FC = () => {
  const { jd, activeSessionId, refreshActiveSession, setJd } = useRecruit();
  const { ingestJobDescription, isUploadingJd } = useFileIngestion();

  // Rubric weights state (default 5 pillars sum to 100%)
  const [rubric, setRubric] = useState<RubricPillar[]>([
    {
      key: "core",
      name: "Core Technical Skills",
      weight: 35,
      description: "Hands-on coding, frameworks, data stores, production mastery",
      color: "text-brand-primary",
    },
    {
      key: "system",
      name: "System Architecture",
      weight: 25,
      description: "Scalability, microservices, reliability, fault tolerance",
      color: "text-purple-700",
    },
    {
      key: "problem",
      name: "Problem Solving",
      weight: 15,
      description: "Algorithmic thinking, trade-off analysis, root-cause debugging",
      color: "text-cyan-800",
    },
    {
      key: "comm",
      name: "Communication & Leadership",
      weight: 15,
      description: "Clarity of thought, cross-functional collaboration, mentoring",
      color: "text-emerald-800",
    },
    {
      key: "culture",
      name: "Velocity & Execution",
      weight: 10,
      description: "Ownership mindset, bias for action, delivery cadence",
      color: "text-amber-800",
    },
  ]);

  const [isCalibrating, setIsCalibrating] = useState(false);
  const [pasteModalVisible, setPasteModalVisible] = useState(false);
  const [pastedJdText, setPastedJdText] = useState("");
  const [isSubmittingTextJd, setIsSubmittingTextJd] = useState(false);
  const [copiedRawJd, setCopiedRawJd] = useState(false);

  const totalWeight = rubric.reduce((acc, p) => acc + p.weight, 0);

  const handleAdjustWeight = (key: string, delta: number) => {
    selectionHaptic();
    setRubric((prev) =>
      prev.map((p) => {
        if (p.key === key) {
          const newWeight = Math.max(5, Math.min(60, p.weight + delta));
          return { ...p, weight: newWeight };
        }
        return p;
      })
    );
  };

  const handleApplyRubric = async () => {
    if (totalWeight !== 100) {
      warningHaptic();
      Alert.alert(
        "Weight Mismatch",
        `Total rubric weight must equal 100% (currently ${totalWeight}%). Please adjust pillars.`
      );
      return;
    }

    if (!activeSessionId) {
      Alert.alert("No Active Campaign", "Please select a campaign session first.");
      return;
    }

    impactHaptic();
    setIsCalibrating(true);

    try {
      const summary = rubric.map((r) => `${r.name}: ${r.weight}%`).join(", ");
      const res = await fetchWithAuth("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: `Calibrate evaluation rubric with the following calibrated pillar weights: ${summary}. Re-score all candidates against this calibrated rubric.`,
          session_id: activeSessionId,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to calibrate rubric on server.");
      }

      await refreshActiveSession();
      successHaptic();
      showAppModal({
        title: "Rubric Calibrated",
        message: `Candidates are now being evaluated against the updated ${totalWeight}% rubric profile.`,
        type: "success",
      });
    } catch (err: any) {
      Alert.alert("Calibration Error", err.message || "Could not apply rubric.");
    } finally {
      setIsCalibrating(false);
    }
  };

  const handleSavePastedJd = async () => {
    if (!pastedJdText.trim()) {
      Alert.alert("Empty Job Description", "Please paste job description text.");
      return;
    }

    if (!activeSessionId) {
      Alert.alert("No Active Campaign", "Please select a campaign session first.");
      return;
    }

    impactHaptic();
    setIsSubmittingTextJd(true);

    try {
      const res = await fetchWithAuth("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: `Parse and ingest this Job Description for this campaign:\n\n${pastedJdText.trim()}`,
          session_id: activeSessionId,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to parse and store job description.");
      }

      const data = await res.json();
      if (data.jd_structured) {
        setJd(data.jd_structured);
      }

      await refreshActiveSession();
      setPasteModalVisible(false);
      setPastedJdText("");
      successHaptic();
      showAppModal({
        title: "Job Description Ingested",
        message: "Successfully parsed role requirements, required skills, and responsibilities.",
        type: "success",
      });
    } catch (err: any) {
      Alert.alert("Ingestion Error", err.message || "Failed to parse job description.");
    } finally {
      setIsSubmittingTextJd(false);
    }
  };

  const handleCopyRawJd = async () => {
    if (!jd?.raw_text) return;
    selectionHaptic();
    await Clipboard.setStringAsync(jd.raw_text);
    setCopiedRawJd(true);
    setTimeout(() => setCopiedRawJd(false), 2000);
  };

  return (
    <View className="py-2 px-4">
      {/* Target Role & Requisition Overview */}
      <View className="bg-white border border-border rounded-[6px] p-4 mb-4 shadow-xs">
        <View className="flex-row items-start justify-between pb-3 mb-3 border-b border-slate-100">
          <View className="flex-1 mr-3">
            <View className="flex-row items-center gap-1.5 mb-1">
              <View className="bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                <Text className="font-sans-bold text-[10px] text-emerald-800 uppercase tracking-wider">
                  Active Requisition
                </Text>
              </View>
              {jd?.experience_years ? (
                <View className="bg-slate-100 px-2 py-0.5 rounded">
                  <Text className="font-sans-medium text-[10px] text-muted">
                    {jd.experience_years}+ Yrs Exp
                  </Text>
                </View>
              ) : null}
            </View>

            <Text className="font-serif-bold text-lg text-foreground">
              {jd?.role || "Untitled Role Requisition"}
            </Text>

            {jd?.company_name || jd?.department ? (
              <Text className="font-sans text-xs text-muted mt-0.5">
                {jd.company_name || "Internal"} • {jd.department || "Engineering"}
              </Text>
            ) : null}
          </View>

          <View className="w-10 h-10 rounded-[6px] bg-slate-100 items-center justify-center">
            <Briefcase size={20} color={COLORS.brandPrimary} />
          </View>
        </View>

        {/* Metadata Badges */}
        <View className="flex-row flex-wrap gap-2 mb-3">
          {jd?.location && (
            <View className="flex-row items-center bg-slate-50 border border-border px-2 py-1 rounded">
              <MapPin size={11} color={COLORS.muted} />
              <Text className="font-sans text-[11px] text-foreground ml-1">
                {jd.location}
              </Text>
            </View>
          )}

          {jd?.salary_range && (
            <View className="flex-row items-center bg-slate-50 border border-border px-2 py-1 rounded">
              <DollarSign size={11} color={COLORS.muted} />
              <Text className="font-sans text-[11px] text-foreground ml-1">
                {jd.salary_range}
              </Text>
            </View>
          )}

          <View className="flex-row items-center bg-slate-50 border border-border px-2 py-1 rounded">
            <Clock size={11} color={COLORS.muted} />
            <Text className="font-sans text-[11px] text-foreground ml-1">
              Full-time Position
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View className="flex-row items-center gap-2 pt-1 border-t border-slate-100">
          <TouchableOpacity
            onPress={() => ingestJobDescription()}
            disabled={isUploadingJd}
            activeOpacity={0.7}
            className="flex-1 bg-brand-primary py-2 px-3 rounded-[6px] flex-row items-center justify-center"
          >
            {isUploadingJd ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <UploadCloud size={13} color="#FFFFFF" />
                <Text className="font-sans-bold text-xs text-white ml-1.5">
                  Upload JD File
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              selectionHaptic();
              setPasteModalVisible(true);
            }}
            activeOpacity={0.7}
            className="flex-1 bg-slate-50 border border-border py-2 px-3 rounded-[6px] flex-row items-center justify-center"
          >
            <FileText size={13} color={COLORS.brandPrimary} />
            <Text className="font-sans-bold text-xs text-foreground ml-1.5">
              Paste Text JD
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Required Skills & Competencies */}
      <View className="bg-white border border-border rounded-[6px] p-4 mb-4 shadow-xs">
        <View className="flex-row items-center justify-between mb-2.5">
          <Text className="font-sans-bold text-xs text-foreground uppercase tracking-wider">
            Required Technical Skills ({jd?.required_skills?.length || 0})
          </Text>
          <Sparkles size={13} color={COLORS.brandPrimary} />
        </View>

        {jd?.required_skills && jd.required_skills.length > 0 ? (
          <View className="flex-row flex-wrap gap-1.5">
            {jd.required_skills.map((skill, idx) => (
              <View
                key={idx}
                className="bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-[4px]"
              >
                <Text className="font-sans-medium text-xs text-brand-primary">
                  {skill}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className="font-sans text-xs text-muted">
            No mandatory skills parsed yet. Upload or paste a Job Description to populate.
          </Text>
        )}

        {/* Nice to Haves */}
        {jd?.nice_to_have && jd.nice_to_have.length > 0 && (
          <View className="mt-3 pt-3 border-t border-slate-100">
            <Text className="font-sans-bold text-[11px] text-muted uppercase tracking-wider mb-2">
              Preferred & Nice-to-Have Skills
            </Text>
            <View className="flex-row flex-wrap gap-1.5">
              {jd.nice_to_have.map((skill, idx) => (
                <View
                  key={idx}
                  className="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-[4px]"
                >
                  <Text className="font-sans text-xs text-slate-700">
                    {skill}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Core Responsibilities */}
      {jd?.responsibilities && jd.responsibilities.length > 0 && (
        <View className="bg-white border border-border rounded-[6px] p-4 mb-4 shadow-xs">
          <Text className="font-sans-bold text-xs text-foreground uppercase tracking-wider mb-2">
            Key Responsibilities
          </Text>
          <View className="gap-2">
            {jd.responsibilities.map((resp, idx) => (
              <View key={idx} className="flex-row items-start">
                <View className="w-1.5 h-1.5 rounded-full bg-brand-primary mt-1.5 mr-2" />
                <Text className="font-sans text-xs text-foreground flex-1 leading-relaxed">
                  {resp}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 5-Pillar Rubric Calibration Engine */}
      <View className="bg-white border border-border rounded-[6px] p-4 mb-4 shadow-xs">
        <View className="flex-row items-center justify-between pb-3 mb-3 border-b border-slate-100">
          <View className="flex-1 mr-2">
            <View className="flex-row items-center">
              <Sliders size={15} color={COLORS.brandPrimary} />
              <Text className="font-serif-bold text-sm text-foreground ml-1.5">
                AI Evaluation Rubric Calibration
              </Text>
            </View>
            <Text className="font-sans text-[11px] text-muted mt-0.5">
              Configure candidate ranking weights across 5 evaluation pillars
            </Text>
          </View>

          <View
            className={`px-2 py-0.5 rounded border ${
              totalWeight === 100
                ? "bg-emerald-50 border-emerald-200"
                : "bg-rose-50 border-rose-200"
            }`}
          >
            <Text
              className={`font-sans-bold text-xs ${
                totalWeight === 100 ? "text-emerald-800" : "text-rose-700"
              }`}
            >
              Total: {totalWeight}%
            </Text>
          </View>
        </View>

        {/* Pillars Steppers */}
        <View className="gap-3 mb-4">
          {rubric.map((pillar) => (
            <View
              key={pillar.key}
              className="bg-[#F8F6F2] border border-border rounded-[6px] p-3"
            >
              <View className="flex-row items-center justify-between mb-1">
                <Text className="font-sans-bold text-xs text-foreground">
                  {pillar.name}
                </Text>

                <View className="flex-row items-center gap-2">
                  <TouchableOpacity
                    onPress={() => handleAdjustWeight(pillar.key, -5)}
                    activeOpacity={0.7}
                    className="w-6 h-6 rounded bg-white border border-border items-center justify-center"
                  >
                    <Minus size={12} color={COLORS.brandPrimary} />
                  </TouchableOpacity>

                  <Text className={`font-sans-bold text-xs w-8 text-center ${pillar.color}`}>
                    {pillar.weight}%
                  </Text>

                  <TouchableOpacity
                    onPress={() => handleAdjustWeight(pillar.key, +5)}
                    activeOpacity={0.7}
                    className="w-6 h-6 rounded bg-white border border-border items-center justify-center"
                  >
                    <Plus size={12} color={COLORS.brandPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              <Text className="font-sans text-[10px] text-muted leading-relaxed">
                {pillar.description}
              </Text>

              {/* Progress bar visual */}
              <View className="h-1 bg-slate-200 rounded-full mt-2 overflow-hidden">
                <View
                  style={{ width: `${pillar.weight * 1.5}%` }}
                  className="h-full bg-brand-primary rounded-full"
                />
              </View>
            </View>
          ))}
        </View>

        {/* Apply Button */}
        <TouchableOpacity
          onPress={handleApplyRubric}
          disabled={isCalibrating || totalWeight !== 100}
          activeOpacity={0.8}
          className={`py-2.5 px-4 rounded-[6px] flex-row items-center justify-center ${
            totalWeight === 100 ? "bg-accent" : "bg-slate-300"
          }`}
        >
          {isCalibrating ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <CheckCircle2 size={14} color="#FFFFFF" />
              <Text className="font-sans-bold text-xs text-white ml-2">
                Apply & Re-Score Candidates
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Raw JD Text (if available) */}
      {jd?.raw_text && (
        <View className="bg-white border border-border rounded-[6px] p-4 mb-4 shadow-xs">
          <View className="flex-row items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <Text className="font-sans-bold text-xs text-foreground uppercase tracking-wider">
              Original Job Spec Text
            </Text>
            <TouchableOpacity
              onPress={handleCopyRawJd}
              activeOpacity={0.7}
              className="flex-row items-center bg-slate-50 border border-border px-2 py-1 rounded"
            >
              {copiedRawJd ? (
                <>
                  <Check size={11} color={COLORS.statusShortlist} />
                  <Text className="font-sans-bold text-[10px] text-emerald-800 ml-1">
                    Copied
                  </Text>
                </>
              ) : (
                <>
                  <Copy size={11} color={COLORS.muted} />
                  <Text className="font-sans text-[10px] text-muted ml-1">
                    Copy Text
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <Text
            className="font-sans text-[11px] text-muted leading-relaxed"
            numberOfLines={6}
          >
            {jd.raw_text}
          </Text>
        </View>
      )}

      {/* Paste JD Modal */}
      <Modal
        visible={pasteModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPasteModalVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-2xl p-5 border-t border-border max-h-[85%]">
            <View className="flex-row items-center justify-between pb-3 mb-3 border-b border-border">
              <View className="flex-row items-center">
                <FileText size={18} color={COLORS.brandPrimary} />
                <Text className="font-serif-bold text-base text-foreground ml-2">
                  Paste Job Description
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setPasteModalVisible(false)}
                activeOpacity={0.7}
                className="p-1"
              >
                <X size={20} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            <Text className="font-sans text-xs text-muted mb-3 leading-relaxed">
              Paste your raw job description or hiring specification below. Our AI agent will extract the target role, experience requirements, mandatory skills, and responsibilities.
            </Text>

            <TextInput
              value={pastedJdText}
              onChangeText={setPastedJdText}
              placeholder="Paste job description text here (e.g. 'Senior Staff Platform Engineer. 6+ years with Kubernetes, Go, distributed consensus...')"
              placeholderTextColor={COLORS.muted}
              multiline
              numberOfLines={10}
              textAlignVertical="top"
              className="bg-[#F8F6F2] border border-border rounded-[6px] p-3 font-sans text-xs text-foreground min-h-[160px] mb-4"
            />

            <View className="flex-row items-center gap-3">
              <TouchableOpacity
                onPress={() => setPasteModalVisible(false)}
                className="flex-1 bg-slate-100 py-3 rounded-[6px] items-center"
              >
                <Text className="font-sans-bold text-xs text-foreground">
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSavePastedJd}
                disabled={isSubmittingTextJd}
                className="flex-1 bg-brand-primary py-3 rounded-[6px] items-center flex-row justify-center"
              >
                {isSubmittingTextJd ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Sparkles size={14} color="#FFFFFF" />
                    <Text className="font-sans-bold text-xs text-white ml-1.5">
                      Ingest & Calibrate
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default RequisitionSpec;
