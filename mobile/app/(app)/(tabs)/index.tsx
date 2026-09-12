import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { Briefcase, EyeOff, FileUp, Sparkles, Trash2 } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRecruit } from "@/context/RecruitContext";
import { useAppModal } from "@/context/ModalContext";
import { useRecruitChat } from "@/hooks/useRecruitChat";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { ActionChips } from "@/components/chat/ActionChips";
import { ChatInput } from "@/components/chat/ChatInput";
import { TypingDots } from "@/components/chat/TypingDots";
import { COLORS } from "@/constants/theme";
import { impactHaptic } from "@/lib/haptics";

export default function CopilotTab() {
  const insets = useSafeAreaInsets();
  const { showModal } = useAppModal();
  const scrollViewRef = useRef<ScrollView>(null);
  const {
    activeSessionId,
    activeSession,
    jd,
    candidates,
    messages,
    isBlindHiring,
    apiConnected,
    loadingSession,
    deleteSession,
  } = useRecruit();

  const {
    input,
    setInput,
    isLoading,
    isUploading,
    sendMessage,
    cancelRequest,
    uploadResumes,
    uploadJd,
  } = useRecruitChat();

  const handleDeleteActiveCampaign = () => {
    if (!activeSessionId) return;
    impactHaptic();
    showModal({
      title: "Delete Campaign",
      message: `Are you sure you want to permanently delete "${activeSession?.title || "this campaign"}" and all its candidates? This cannot be undone.`,
      type: "confirm",
      actions: [
        {
          label: "Delete Campaign",
          variant: "destructive",
          onPress: async () => {
            await deleteSession(activeSessionId);
          },
        },
        {
          label: "Cancel",
          variant: "cancel",
        },
      ],
    });
  };

  // Auto-scroll to bottom when new messages arrive or when typing
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages, isLoading]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 56 : 0}
      className="flex-1 bg-background"
    >
      {/* Campaign Context Strip with Live API Dot */}
      <View className="bg-white border-b border-border px-4 py-2.5 flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 mr-2">
          {/* Status Indicator Dot */}
          <View
            className={`w-2 h-2 rounded-full mr-2.5 ${
              apiConnected ? "bg-emerald-500" : "bg-rose-500"
            }`}
          />

          <View className="flex-1">
            <View className="flex-row items-center">
              <Text
                className="font-sans-bold text-xs text-foreground"
                numberOfLines={1}
              >
                {jd?.role || activeSession?.title || "New Hiring Campaign"}
              </Text>
            </View>

            <View className="flex-row items-center mt-0.5 space-x-2">
              <Text className="font-sans text-[11px] text-muted">
                {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
              </Text>
              {isBlindHiring && (
                <View className="flex-row items-center ml-2 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                  <EyeOff size={10} color="#D97706" />
                  <Text className="font-sans-bold text-[9px] text-amber-800 ml-1">
                    Blind Mode
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View className="flex-row items-center">
          {loadingSession && (
            <ActivityIndicator size="small" color={COLORS.brandPrimary} className="mr-2" />
          )}
          {activeSessionId && (
            <TouchableOpacity
              onPress={handleDeleteActiveCampaign}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="p-1.5 rounded-full active:bg-rose-50"
              accessibilityLabel="Delete Campaign"
            >
              <Trash2 size={15} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Uploading In-Progress Notification Banner */}
      {isUploading && (
        <View className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <ActivityIndicator size="small" color={COLORS.brandPrimary} />
            <Text className="font-sans-medium text-xs text-blue-900 ml-2">
              Extracting & indexing document text...
            </Text>
          </View>
          <FileUp size={14} color={COLORS.brandPrimary} />
        </View>
      )}

      {/* Messages Scroll Area */}
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={{ padding: 16, paddingBottom: 16 }}
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        onContentSizeChange={() =>
          scrollViewRef.current?.scrollToEnd({ animated: true })
        }
      >
        {messages.map((msg, idx) => (
          <MessageBubble key={idx} message={msg} />
        ))}

        {isLoading && <TypingDots />}
      </ScrollView>

      {/* 8 Web Action Chips Carousel */}
      <ActionChips
        onSelectChip={(promptText) => sendMessage(promptText)}
        disabled={isLoading || isUploading}
      />

      {/* Sticky Chat Input Bar */}
      <ChatInput
        input={input}
        setInput={setInput}
        onSend={() => sendMessage()}
        onCancel={cancelRequest}
        isLoading={isLoading}
        onAttachResume={uploadResumes}
        onAttachJd={uploadJd}
      />
    </KeyboardAvoidingView>
  );
}
