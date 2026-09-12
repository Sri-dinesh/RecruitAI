import React from "react";
import { View, Text, TouchableOpacity, Image, Alert, Platform } from "react-native";
import { getBackendUrl, setCustomBackendUrl, resetBackendUrl, CLOUD_BACKEND_URL } from "@/lib/apiClient";
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
    checkApiHealth,
  } = useRecruit();

  const handleOfflineBannerPress = () => {
    const currentUrl = getBackendUrl();
    Alert.alert(
      "Backend Server Connection",
      `Target URL: ${currentUrl}\n\nStatus: Offline / Unreachable\n\nEnsure your FastAPI server is running on port 8000 and reachable from this network.`,
      [
        {
          text: "Retry Now",
          onPress: async () => {
            const ok = await checkApiHealth();
            if (ok) {
              Alert.alert("Connected!", "Backend API is online and healthy.");
            } else {
              Alert.alert(
                "Connection Failed",
                `Unable to reach ${currentUrl}/api/health.\n\nTip: If you are testing over Expo tunnel or cellular, ensure you are connected to the Cloud / Render backend.`
              );
            }
          },
        },
        {
          text: "Switch Server Target",
          onPress: () => {
            Alert.alert(
              "Select Server Target",
              `Current: ${currentUrl}`,
              [
                {
                  text: "Cloud / Render (Live)",
                  onPress: async () => {
                    await setCustomBackendUrl(CLOUD_BACKEND_URL);
                    await checkApiHealth();
                  },
                },
                ...(process.env.EXPO_PUBLIC_DEV_LAN_URL
                  ? [
                      {
                        text: `Custom LAN (${process.env.EXPO_PUBLIC_DEV_LAN_URL})`,
                        onPress: async () => {
                          await setCustomBackendUrl(process.env.EXPO_PUBLIC_DEV_LAN_URL!);
                          await checkApiHealth();
                        },
                      },
                    ]
                  : []),
                {
                  text: "Android Emulator (10.0.2.2:8000)",
                  onPress: async () => {
                    await setCustomBackendUrl("http://10.0.2.2:8000");
                    await checkApiHealth();
                  },
                },
                {
                  text: "Localhost (127.0.0.1:8000)",
                  onPress: async () => {
                    await setCustomBackendUrl("http://127.0.0.1:8000");
                    await checkApiHealth();
                  },
                },
                {
                  text: "Reset to Default",
                  onPress: async () => {
                    await resetBackendUrl();
                    await checkApiHealth();
                  },
                },
                { text: "Cancel", style: "cancel" },
              ]
            );
          },
        },
        { text: "Close", style: "cancel" },
      ]
    );
  };

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
          <Image
            source={require("@/../assets/logo-mark.png")}
            style={{ width: 22, height: 22, resizeMode: "contain", marginRight: 6 }}
          />
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
        <TouchableOpacity
          onPress={handleOfflineBannerPress}
          activeOpacity={0.8}
          className="bg-amber-500/10 border-t border-amber-500/20 -mx-4 -mb-2.5 mt-2 py-1.5 px-4 flex-row items-center justify-between"
        >
          <View className="flex-row items-center flex-1 mr-2">
            <WifiOff size={11} color="#D97706" />
            <Text className="font-sans-medium text-[10px] text-amber-800 ml-1.5" numberOfLines={1}>
              Offline Mode — Tap to test or configure server
            </Text>
          </View>
          <Text className="font-sans-bold text-[10px] text-brand-primary underline">Settings</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default Header;
