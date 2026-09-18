import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TouchableWithoutFeedback,
} from "react-native";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  X,
} from "lucide-react-native";
import { COLORS } from "@/constants/theme";
import { selectionHaptic } from "@/lib/haptics";

export interface IngestionFileReport {
  filename: string;
  status: "success" | "duplicate" | "error";
  candidateName?: string;
  error?: string;
}

interface IngestionProgressModalProps {
  visible: boolean;
  onClose: () => void;
  reports: IngestionFileReport[];
}

export const IngestionProgressModal: React.FC<IngestionProgressModalProps> = ({
  visible,
  onClose,
  reports,
}) => {
  const successCount = reports.filter((r) => r.status === "success").length;
  const duplicateCount = reports.filter((r) => r.status === "duplicate").length;
  const errorCount = reports.filter((r) => r.status === "error").length;

  const handleClose = () => {
    selectionHaptic();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View className="flex-1 bg-black/60 justify-center items-center p-4">
          <TouchableWithoutFeedback>
            <View className="w-full max-w-md bg-white rounded-2xl p-5 shadow-2xl border border-slate-200 max-h-[85%]">
              {/* Header */}
              <View className="flex-row items-center justify-between pb-3 border-b border-slate-100">
                <View className="flex-row items-center">
                  <View className="w-8 h-8 rounded-lg bg-indigo-50 items-center justify-center mr-2.5">
                    <FileText size={18} color={COLORS.brandPrimary} />
                  </View>
                  <View>
                    <Text className="font-serif-bold text-base text-slate-900">
                      Batch Ingestion Report
                    </Text>
                    <Text className="font-sans text-xs text-slate-500">
                      HTTP 207 Multi-Status Results
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleClose}
                  className="w-7 h-7 rounded-full bg-slate-100 items-center justify-center"
                >
                  <X size={15} color={COLORS.muted} />
                </TouchableOpacity>
              </View>

              {/* Summary Badges */}
              <View className="flex-row gap-2 my-3">
                <View className="flex-1 bg-emerald-50 border border-emerald-200 rounded-lg p-2 items-center">
                  <Text className="font-sans-bold text-sm text-emerald-800">
                    {successCount}
                  </Text>
                  <Text className="font-sans text-[10px] text-emerald-600">
                    Ingested
                  </Text>
                </View>

                {duplicateCount > 0 && (
                  <View className="flex-1 bg-amber-50 border border-amber-200 rounded-lg p-2 items-center">
                    <Text className="font-sans-bold text-sm text-amber-800">
                      {duplicateCount}
                    </Text>
                    <Text className="font-sans text-[10px] text-amber-600">
                      Duplicate
                    </Text>
                  </View>
                )}

                {errorCount > 0 && (
                  <View className="flex-1 bg-rose-50 border border-rose-200 rounded-lg p-2 items-center">
                    <Text className="font-sans-bold text-sm text-rose-800">
                      {errorCount}
                    </Text>
                    <Text className="font-sans text-[10px] text-rose-600">
                      Failed
                    </Text>
                  </View>
                )}
              </View>

              {/* Items List */}
              <ScrollView
                className="my-1 max-h-[300px]"
                showsVerticalScrollIndicator={false}
              >
                {reports.map((item, idx) => (
                  <View
                    key={`${item.filename}-${idx}`}
                    className="flex-row items-center justify-between py-2.5 px-3 mb-2 rounded-xl bg-slate-50 border border-slate-200"
                  >
                    <View className="flex-row items-center flex-1 mr-2">
                      {item.status === "success" && (
                        <CheckCircle2 size={16} color="#059669" />
                      )}
                      {item.status === "duplicate" && (
                        <AlertTriangle size={16} color="#D97706" />
                      )}
                      {item.status === "error" && (
                        <XCircle size={16} color="#E11D48" />
                      )}

                      <View className="ml-2.5 flex-1">
                        <Text
                          className="font-sans-bold text-xs text-slate-800"
                          numberOfLines={1}
                        >
                          {item.filename}
                        </Text>
                        <Text
                          className="font-sans text-[10px] text-slate-500"
                          numberOfLines={1}
                        >
                          {item.status === "success"
                            ? item.candidateName || "Extracted & Scored"
                            : item.status === "duplicate"
                            ? "SHA-256 matched existing candidate"
                            : item.error || "Failed to parse document"}
                        </Text>
                      </View>
                    </View>

                    <View
                      className={`px-2 py-0.5 rounded-full border ${
                        item.status === "success"
                          ? "bg-emerald-50 border-emerald-200"
                          : item.status === "duplicate"
                          ? "bg-amber-50 border-amber-200"
                          : "bg-rose-50 border-rose-200"
                      }`}
                    >
                      <Text
                        className={`font-sans-bold text-[9px] uppercase tracking-wider ${
                          item.status === "success"
                            ? "text-emerald-700"
                            : item.status === "duplicate"
                            ? "text-amber-700"
                            : "text-rose-700"
                        }`}
                      >
                        {item.status}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>

              {/* Close Action */}
              <TouchableOpacity
                onPress={handleClose}
                activeOpacity={0.8}
                className="mt-3 bg-brand-primary py-2.5 rounded-xl items-center"
              >
                <Text className="font-sans-bold text-xs text-white">
                  Done
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};
