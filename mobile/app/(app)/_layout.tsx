import React from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack, Redirect } from "expo-router";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useAuth } from "@/context/AuthContext";
import { RecruitProvider } from "@/context/RecruitContext";
import { COLORS } from "@/constants/theme";

export default function AppLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.background,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color={COLORS.brandPrimary} />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/welcome" />;
  }

  return (
    <RecruitProvider>
      <BottomSheetModalProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: COLORS.background },
            animation: "slide_from_right",
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="modals/candidate-inspector"
            options={{
              presentation: "modal",
              headerShown: false,
              animation: "slide_from_bottom",
            }}
          />
          <Stack.Screen
            name="modals/ats-export"
            options={{
              presentation: "modal",
              headerShown: false,
              animation: "slide_from_bottom",
            }}
          />
          <Stack.Screen
            name="modals/report-preview"
            options={{
              presentation: "modal",
              headerShown: false,
              animation: "slide_from_bottom",
            }}
          />
        </Stack>
      </BottomSheetModalProvider>
    </RecruitProvider>
  );
}
