import React, { useEffect } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { COLORS } from "@/constants/theme";

export default function IndexScreen() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

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
      <Text
        style={{
          fontFamily: "Fraunces_700Bold",
          fontSize: 32,
          color: COLORS.foreground,
          letterSpacing: -0.5,
          marginBottom: 12,
        }}
      >
        RecruitAI<Text style={{ color: COLORS.brandEmerald }}>.</Text>
      </Text>
      <ActivityIndicator size="large" color={COLORS.brandPrimary} />
    </View>
  );
}
