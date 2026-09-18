import React from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
} from "react-native";
import {
  Paperclip,
  Square,
  ArrowUp,
  Users,
  FileText,
  Sparkles,
} from "lucide-react-native";
import { useAppModal } from "@/context/ModalContext";
import { COLORS } from "@/constants/theme";
import { selectionHaptic, impactHaptic } from "@/lib/haptics";

interface ChatInputProps {
  input: string;
  setInput: (val: string) => void;
  onSend: () => void;
  onCancel: () => void;
  isLoading: boolean;
  onAttachResume: () => void;
  onAttachJd: () => void;
  onOpenPresets?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  onSend,
  onCancel,
  isLoading,
  onAttachResume,
  onAttachJd,
  onOpenPresets,
}) => {
  const { showModal } = useAppModal();

  const handleAttachmentPress = () => {
    selectionHaptic();
    showModal({
      title: "Upload Document",
      message: "Choose document type to ingest into this campaign session:",
      type: "actions",
      actions: [
        {
          label: "Candidate Resumes (.pdf, .docx)",
          icon: Users,
          variant: "primary",
          onPress: onAttachResume,
        },
        {
          label: "Job Description (.pdf, .txt)",
          icon: FileText,
          variant: "secondary",
          onPress: onAttachJd,
        },
        {
          label: "Cancel",
          variant: "cancel",
        },
      ],
    });
  };

  const handleActionPress = () => {
    if (isLoading) {
      impactHaptic();
      onCancel();
    } else if (input.trim()) {
      impactHaptic();
      onSend();
    }
  };

  return (
    <View className="bg-white border-t border-slate-200 px-3 py-2.5">
      <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-2xl px-3 py-1">
        {/* Presets Deck Button */}
        {onOpenPresets && (
          <TouchableOpacity
            onPress={() => {
              selectionHaptic();
              onOpenPresets();
            }}
            activeOpacity={0.7}
            disabled={isLoading}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className={`p-1.5 mr-0.5 rounded-full ${
              isLoading ? "opacity-40" : "active:bg-indigo-50"
            }`}
            accessibilityLabel="Workflow Presets"
          >
            <Sparkles size={17} color="#4338CA" />
          </TouchableOpacity>
        )}

        {/* Paperclip Document Picker Button */}
        <TouchableOpacity
          onPress={handleAttachmentPress}
          activeOpacity={0.7}
          disabled={isLoading}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className={`p-1.5 mr-1 ${isLoading ? "opacity-40" : ""}`}
          accessibilityLabel="Attach Document"
        >
          <Paperclip size={17} color="#64748B" />
        </TouchableOpacity>

        {/* Auto-expanding Multiline TextInput */}
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={
            isLoading
              ? "RecruitAI is analyzing..."
              : "Ask RecruitAI, type @ to mention candidate..."
          }
          placeholderTextColor="#94A3B8"
          multiline
          maxLength={2000}
          style={{ maxHeight: 110 }}
          textAlignVertical="center"
          className="flex-1 font-sans text-xs text-slate-900 py-2 leading-relaxed"
          editable={!isLoading}
          returnKeyType="default"
        />

        {/* Send / Stop Toggle Button */}
        <TouchableOpacity
          onPress={handleActionPress}
          activeOpacity={0.8}
          disabled={!isLoading && !input.trim()}
          className={`w-8 h-8 rounded-full items-center justify-center ml-1.5 ${
            isLoading
              ? "bg-rose-600"
              : input.trim()
              ? "bg-indigo-600"
              : "bg-slate-200"
          }`}
        >
          {isLoading ? (
            <Square size={12} color="#FFFFFF" fill="#FFFFFF" />
          ) : (
            <ArrowUp
              size={15}
              color={input.trim() ? "#FFFFFF" : "#94A3B8"}
              strokeWidth={2.5}
            />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default ChatInput;
