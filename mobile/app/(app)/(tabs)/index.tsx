import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import {
  Send,
  Sparkles,
  Bot,
  User,
  Paperclip,
  Briefcase,
  Users,
  CheckCircle,
  EyeOff,
} from "lucide-react-native";
import { useRecruit } from "@/context/RecruitContext";
import { useAuth } from "@/context/AuthContext";
import { ACTION_CHIPS } from "@/constants/prompts";
import { COLORS } from "@/constants/theme";
import { selectionHaptic, impactHaptic } from "@/lib/haptics";

export default function CopilotTab() {
  const { user } = useAuth();
  const {
    activeSession,
    jd,
    candidates,
    messages,
    isBlindHiring,
    loadingSession,
  } = useRecruit();

  const [input, setInput] = useState("");

  const handleChipPress = (chipText: string) => {
    selectionHaptic();
    setInput(chipText);
  };

  const handleSend = () => {
    if (!input.trim()) return;
    impactHaptic();
    // Prompt dispatch integration placeholder for Phase 5 Co-Pilot Engine
    setInput("");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
    >
      {/* Campaign Context Strip */}
      <View className="bg-white border-b border-border px-4 py-2.5 flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 mr-2">
          <View className="w-7 h-7 rounded-[6px] bg-slate-100 border border-border items-center justify-center mr-2">
            <Briefcase size={14} color={COLORS.brandPrimary} />
          </View>
          <View className="flex-1">
            <Text
              className="font-sans-bold text-xs text-foreground"
              numberOfLines={1}
            >
              {jd?.role || activeSession?.title || "New Hiring Campaign"}
            </Text>
            <View className="flex-row items-center mt-0.5">
              <Text className="font-sans text-[11px] text-muted">
                {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
              </Text>
              {isBlindHiring && (
                <View className="flex-row items-center ml-2 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                  <EyeOff size={10} color="#D97706" />
                  <Text className="font-sans-bold text-[9px] text-amber-800 ml-1">
                    Blind Active
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {loadingSession && (
          <ActivityIndicator size="small" color={COLORS.brandPrimary} />
        )}
      </View>

      {/* Messages Scroll Area */}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        className="flex-1"
        showsVerticalScrollIndicator={false}
      >
        {messages.map((msg, idx) => {
          const isAssistant = msg.role === "assistant";
          return (
            <View
              key={idx}
              className={`mb-4 flex-row ${
                isAssistant ? "justify-start" : "justify-end"
              }`}
            >
              {isAssistant && (
                <View className="w-7 h-7 rounded-full bg-slate-900 border border-slate-700 items-center justify-center mr-2 mt-0.5 shadow-xs">
                  <Bot size={14} color="#FFFFFF" />
                </View>
              )}

              <View
                className={`max-w-[85%] rounded-[8px] p-3.5 ${
                  isAssistant
                    ? "bg-white border border-border shadow-xs"
                    : "bg-accent text-white"
                }`}
              >
                <Text
                  className={`font-sans text-xs leading-relaxed ${
                    isAssistant ? "text-foreground" : "text-white"
                  }`}
                >
                  {msg.content}
                </Text>
              </View>

              {!isAssistant && (
                <View className="w-7 h-7 rounded-full bg-slate-200 border border-slate-300 items-center justify-center ml-2 mt-0.5">
                  <User size={14} color={COLORS.brandPrimary} />
                </View>
              )}
            </View>
          );
        })}

        {/* Action Prompt Chips */}
        <View className="mt-2 mb-4">
          <Text className="font-sans-bold text-[11px] text-muted uppercase tracking-wider mb-2">
            Suggested Actions
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {ACTION_CHIPS.map((chip, i) => (
              <TouchableOpacity
                key={chip.id || i}
                onPress={() => handleChipPress(chip.prompt)}
                activeOpacity={0.7}
                className="bg-white border border-border px-3 py-1.5 rounded-[6px] shadow-xs flex-row items-center"
              >
                <Sparkles size={11} color={COLORS.brandPrimary} />
                <Text className="font-sans-medium text-xs text-foreground ml-1.5">
                  {chip.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </ScrollView>

      {/* Input Bar */}
      <View className="bg-white border-t border-border p-3">
        <View className="flex-row items-center bg-[#F8F6F2] border border-border rounded-[8px] px-3 py-1.5">
          <TouchableOpacity
            onPress={() => selectionHaptic()}
            activeOpacity={0.7}
            className="p-1 mr-1.5"
          >
            <Paperclip size={18} color={COLORS.muted} />
          </TouchableOpacity>

          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask RecruitAI, upload resumes, or screen..."
            placeholderTextColor="#94A3B8"
            className="flex-1 font-sans text-xs text-foreground py-1"
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />

          <TouchableOpacity
            onPress={handleSend}
            disabled={!input.trim()}
            activeOpacity={0.8}
            className={`w-8 h-8 rounded-[6px] items-center justify-center ${
              input.trim() ? "bg-accent" : "bg-slate-200"
            }`}
          >
            <Send
              size={14}
              color={input.trim() ? "#FFFFFF" : COLORS.muted}
            />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
