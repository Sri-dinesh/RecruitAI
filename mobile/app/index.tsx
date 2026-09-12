import React, { useEffect } from "react";
import { View, Text, Image } from "react-native";
import { useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useAuth } from "@/context/AuthContext";
import { COLORS } from "@/constants/theme";

export default function IndexScreen() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    // Reveal destination screen smoothly once auth resolution completes
    SplashScreen.hideAsync().catch(() => {});

    if (user) {
      router.replace("/(app)/(tabs)");
    } else {
      router.replace("/(auth)/welcome");
    }
  }, [user, loading, router]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: COLORS.background,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Image
        source={require("@/../assets/logo-mark.png")}
        style={{ width: 84, height: 84, resizeMode: "contain", marginBottom: 16 }}
      />
      <Text
        style={{
          fontFamily: "Fraunces_700Bold",
          fontSize: 32,
          color: COLORS.foreground,
          letterSpacing: -0.5,
        }}
      >
        RecruitAI<Text style={{ color: COLORS.brandEmerald }}>.</Text>
      </Text>
      <Text
        style={{
          fontFamily: "DMSans_500Medium",
          fontSize: 13,
          color: COLORS.muted,
          marginTop: 6,
        }}
      >
        Agentic Recruitment Engine
      </Text>
    </View>
  );
}
