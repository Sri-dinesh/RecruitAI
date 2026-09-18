import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Markdown from "react-native-markdown-display";
import { Bot, User, Copy, Check } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { COLORS } from "@/constants/theme";
import type { ChatMessage } from "@/types/schema";
import { AgentStepsAccordion } from "./AgentStepsAccordion";
import { FollowupChips } from "./FollowupChips";
import { selectionHaptic } from "@/lib/haptics";

interface MessageBubbleProps {
  message: ChatMessage;
  onSelectFollowup?: (prompt: string) => void;
  isLoading?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  onSelectFollowup,
  isLoading = false,
}) => {
  const isAssistant = message.role === "assistant";
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      selectionHaptic();
      await Clipboard.setStringAsync(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn("[MessageBubble] Copy to clipboard failed:", err);
    }
  };

  const formattedTime = useMemo(() => {
    if (!message.created_at) return null;
    try {
      const d = new Date(message.created_at);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return null;
    }
  }, [message.created_at]);

  const markdownStyles = useMemo(
    () =>
      StyleSheet.create({
        body: {
          fontFamily: "DMSans_400Regular",
          fontSize: 13,
          color: "#111111",
          lineHeight: 20,
        },
        heading1: {
          fontFamily: "Fraunces_700Bold",
          fontSize: 17,
          color: "#111111",
          marginTop: 8,
          marginBottom: 4,
        },
        heading2: {
          fontFamily: "Fraunces_600SemiBold",
          fontSize: 15,
          color: "#1B2A4A",
          marginTop: 6,
          marginBottom: 3,
        },
        heading3: {
          fontFamily: "DMSans_700Bold",
          fontSize: 13,
          color: "#1B2A4A",
          marginTop: 4,
          marginBottom: 2,
        },
        strong: {
          fontFamily: "DMSans_700Bold",
          color: "#111111",
        },
        bullet_list: {
          marginVertical: 4,
        },
        bullet_list_icon: {
          color: "#1B2A4A",
          fontSize: 14,
        },
        code_inline: {
          fontFamily: "System",
          fontSize: 12,
          backgroundColor: "#F1F5F9",
          color: "#1B2A4A",
          borderRadius: 4,
          paddingHorizontal: 4,
          paddingVertical: 1,
        },
        code_block: {
          backgroundColor: "#0F172A",
          borderRadius: 8,
          padding: 10,
          marginVertical: 6,
        },
        fence: {
          backgroundColor: "#0F172A",
          borderRadius: 8,
          padding: 10,
          marginVertical: 6,
          color: "#F8FAFC",
          fontSize: 12,
          fontFamily: "System",
        },
        link: {
          color: "#4338CA",
          textDecorationLine: "underline",
        },
        blockquote: {
          backgroundColor: "#F8FAFC",
          borderLeftColor: "#4338CA",
          borderLeftWidth: 3,
          paddingHorizontal: 8,
          paddingVertical: 4,
          marginVertical: 4,
        },
      }),
    []
  );

  return (
    <View
      className={`mb-3.5 flex-row ${
        isAssistant ? "justify-start" : "justify-end"
      }`}
    >
      {isAssistant && (
        <View className="w-7 h-7 rounded-full bg-[#1B2A4A] items-center justify-center mr-2 mt-0.5 shadow-xs">
          <Bot size={14} color="#FFFFFF" />
        </View>
      )}

      <View
        className={`max-w-[88%] rounded-2xl p-3.5 ${
          isAssistant
            ? "bg-white border border-slate-200/80 shadow-xs"
            : "bg-indigo-600 shadow-xs"
        }`}
      >
        {/* Agent Reasoning Steps Accordion */}
        {isAssistant && message.agent_steps && message.agent_steps.length > 0 && (
          <AgentStepsAccordion steps={message.agent_steps} isLoading={isLoading} />
        )}

        {/* Message Body */}
        {isAssistant ? (
          <Markdown style={markdownStyles}>{message.content}</Markdown>
        ) : (
          <Text className="font-sans text-xs text-white leading-relaxed">
            {message.content}
          </Text>
        )}

        {/* Suggested Followups */}
        {isAssistant &&
          message.suggested_followups &&
          message.suggested_followups.length > 0 &&
          onSelectFollowup && (
            <FollowupChips
              followups={message.suggested_followups}
              onSelectFollowup={onSelectFollowup}
            />
          )}

        {/* Footer with Timestamp and Copy Action */}
        <View className="flex-row items-center justify-between mt-2 pt-1 border-t border-slate-100/60">
          {formattedTime ? (
            <Text
              className={`font-sans text-[10px] ${
                isAssistant ? "text-slate-400" : "text-indigo-200"
              }`}
            >
              {formattedTime}
            </Text>
          ) : (
            <View />
          )}

          {isAssistant && (
            <TouchableOpacity
              onPress={handleCopy}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              className="flex-row items-center ml-2 py-0.5 px-1.5 rounded active:bg-slate-100"
            >
              {copied ? (
                <>
                  <Check size={11} color="#059669" />
                  <Text className="font-sans text-[10px] text-emerald-700 ml-1">
                    Copied
                  </Text>
                </>
              ) : (
                <>
                  <Copy size={11} color="#94A3B8" />
                  <Text className="font-sans text-[10px] text-slate-400 ml-1">
                    Copy
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {!isAssistant && (
        <View className="w-7 h-7 rounded-full bg-slate-200 border border-slate-300 items-center justify-center ml-2 mt-0.5">
          <User size={14} color={COLORS.brandPrimary} />
        </View>
      )}
    </View>
  );
};

export default MessageBubble;
