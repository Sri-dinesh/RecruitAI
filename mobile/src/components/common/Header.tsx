import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Briefcase,
  ChevronDown,
  Eye,
  EyeOff,
  Sparkles,
  WifiOff,
} from "lucide-react-native";
import { useRecruit } from "@/context/RecruitContext";
import { useAuth } from "@/context/AuthContext";
import { COLORS } from "@/constants/theme";
import { selectionHaptic } from "@/lib/haptics";

interface HeaderProps {
  onOpenSessionPicker: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenSessionPicker }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    activeSession,
    isBlindHiring,
    toggleBlindHiring,
    apiConnected,
  } = useRecruit();

  const userInitial = (
    user?.user_metadata?.full_name?.[0] ||
    user?.email?.[0] ||
    "R"
  ).toUpperCase();

  return (
    <View
      style={{ paddingTop: Math.max(insets.top, 12) }}
      className="bg-white border-b border-border px-4 pb-2.5 shadow-xs"
    >
      <View className="flex-row items-center justify-between">
        {/* Left: Brand + Campaign Selector Pill */}
        <View className="flex-row items-center flex-1 mr-2">
          <Text className="font-serif-bold text-lg text-foreground tracking-tight">
            RecruitAI<Text className="text-brand-emerald">.</Text>
          </Text>

          <TouchableOpacity
            onPress={() => {
              selectionHaptic();
              onOpenSessionPicker();
            }}
            activeOpacity={0.7}
            className="flex-row items-center bg-[#F8F6F2] border border-border px-2.5 py-1.5 rounded-[6px] ml-2.5 max-w-[190px]"
          >
            <Briefcase size={12} color={COLORS.brandPrimary} />
            <Text
              className="font-sans-medium text-xs text-foreground ml-1.5 mr-1 flex-shrink"
              numberOfLines={1}
            >
              {activeSession?.title || "New Campaign"}
            </Text>
            <ChevronDown size={12} color={COLORS.muted} />
          </TouchableOpacity>
        </View>

        {/* Right: Blind Mode Toggle + Recruiter Avatar */}
        <View className="flex-row items-center">
          {/* Blind Hiring Mode Toggle */}
          <TouchableOpacity
            onPress={toggleBlindHiring}
            activeOpacity={0.7}
            className={`flex-row items-center px-2 py-1.5 rounded-[6px] border mr-2.5 ${
              isBlindHiring
                ? "bg-amber-50 border-amber-300"
                : "bg-slate-50 border-border"
            }`}
          >
            {isBlindHiring ? (
              <>
                <EyeOff size={13} color="#D97706" />
                <Text className="font-sans-bold text-[10px] text-amber-800 ml-1">
                  Blind
                </Text>
              </>
            ) : (
              <>
                <Eye size={13} color={COLORS.muted} />
                <Text className="font-sans-medium text-[10px] text-muted ml-1">
                  Public
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Recruiter Avatar with Connection Indicator */}
          <TouchableOpacity
            onPress={() => {
              selectionHaptic();
              onOpenSessionPicker();
            }}
            activeOpacity={0.8}
            className="relative"
          >
            <View className="w-8 h-8 rounded-full bg-[#1B2A4A] items-center justify-center border border-slate-700">
              <Text className="font-sans-bold text-xs text-white">
                {userInitial}
              </Text>
            </View>
            {/* Live API Health Dot */}
            <View
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                apiConnected ? "bg-emerald-500" : "bg-rose-500"
              }`}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Ambient Offline Banner */}
      {!apiConnected && (
        <View className="bg-amber-500/10 border-t border-amber-500/20 -mx-4 -mb-2.5 mt-2 py-1 px-4 flex-row items-center justify-center">
          <WifiOff size={11} color="#D97706" />
          <Text className="font-sans-medium text-[10px] text-amber-800 ml-1.5">
            Offline Mode — Changes will sync when reconnected
          </Text>
        </View>
      )}
    </View>
  );
};

export default Header;
