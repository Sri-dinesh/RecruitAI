import React from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Paperclip, Send, Square, ArrowUp, Users, FileText } from "lucide-react-native";
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
}

export const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  onSend,
  onCancel,
  isLoading,
  onAttachResume,
  onAttachJd,
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
    <View className="bg-white border-t border-border px-3 py-2.5">
      <View className="flex-row items-center bg-[#F8F6F2] border border-border rounded-[8px] px-3 py-1">
        {/* Paperclip Document Picker Button */}
        <TouchableOpacity
          onPress={handleAttachmentPress}
          activeOpacity={0.7}
          disabled={isLoading}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className={`p-1.5 mr-1 ${isLoading ? "opacity-40" : ""}`}
        >
          <Paperclip size={18} color={COLORS.muted} />
        </TouchableOpacity>

        {/* Auto-expanding Multiline TextInput */}
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={
            isLoading
              ? "RecruitAI is responding..."
              : "Ask RecruitAI, screen talent, or draft offer..."
          }
          placeholderTextColor="#94A3B8"
          multiline
          maxLength={2000}
          style={{ maxHeight: 110 }}
          textAlignVertical="center"
          className="flex-1 font-sans text-xs text-foreground py-2 leading-relaxed"
          editable={!isLoading}
          returnKeyType="default"
        />

        {/* Send / Stop Toggle Button */}
        <TouchableOpacity
          onPress={handleActionPress}
          activeOpacity={0.8}
          disabled={!isLoading && !input.trim()}
          className={`w-8 h-8 rounded-[6px] items-center justify-center ml-1.5 ${
            isLoading
              ? "bg-rose-600"
              : input.trim()
              ? "bg-accent"
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
