import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Markdown from "react-native-markdown-display";
import { Bot, User } from "lucide-react-native";
import { COLORS } from "@/constants/theme";
import type { ChatMessage } from "@/types/schema";

interface MessageBubbleProps {
  message: ChatMessage;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isAssistant = message.role === "assistant";

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
          backgroundColor: "#1E1E2E",
          borderRadius: 6,
          padding: 8,
          marginVertical: 6,
        },
        fence: {
          backgroundColor: "#1E1E2E",
          borderRadius: 6,
          padding: 8,
          marginVertical: 6,
          color: "#F8F8F2",
          fontSize: 12,
          fontFamily: "System",
        },
        link: {
          color: "#1B2A4A",
          textDecorationLine: "underline",
        },
        blockquote: {
          backgroundColor: "#F8F6F2",
          borderLeftColor: "#1B2A4A",
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
        className={`max-w-[88%] rounded-[8px] p-3.5 ${
          isAssistant
            ? "bg-white border border-border shadow-xs"
            : "bg-accent text-white"
        }`}
      >
        {isAssistant ? (
          <Markdown style={markdownStyles}>{message.content}</Markdown>
        ) : (
          <Text className="font-sans text-xs text-white leading-relaxed">
            {message.content}
          </Text>
        )}
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
